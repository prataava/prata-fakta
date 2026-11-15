// Pengambil GDELT DOC API (mode=artlist) untuk PRATA FAKTA.
// Dipakai sebagai cadangan bila feed RSS tidak mencakup suatu topik.
// Lambat (±20 detik), jadi JANGAN dipanggil per feed — satu topik per
// panggilan, dan hanya bila memang dibutuhkan.
// Hanya memakai fetch global — tanpa library tambahan.

import type { ItemMentah } from "./rss.ts";

export interface OpsiFetchGdelt {
  maxRecords?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface HasilFetchGdelt {
  items: ItemMentah[];
  httpStatus: number;
  durasiMs: number;
}

const URL_DASAR_GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";

// seendate GDELT berbentuk YYYYMMDDHHMMSS (UTC) -> Date.
export function parseSeendate(seendate: string): Date | null {
  const cocok = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(
    seendate.trim(),
  );
  if (!cocok) return null;
  const [, thn, bln, tgl, jam, mnt, dtk] = cocok;
  const tanggal = new Date(
    Date.UTC(
      Number(thn),
      Number(bln) - 1,
      Number(tgl),
      Number(jam),
      Number(mnt),
      Number(dtk),
    ),
  );
  return Number.isNaN(tanggal.getTime()) ? null : tanggal;
}

// Ambil artikel GDELT untuk satu topik. Mengembalikan ItemMentah agar
// bisa masuk ke jalur dedup + simpan yang sama dengan item RSS.
// Domain TIDAK dipakai sebagai penulis — disimpan ke metadata.
export async function fetchGdelt(
  topik: string,
  opsi: OpsiFetchGdelt = {},
): Promise<HasilFetchGdelt> {
  const maxRecords = opsi.maxRecords ?? 25;
  const timeoutMs = opsi.timeoutMs ?? 30000;
  const ambil = opsi.fetchFn ?? fetch;
  const mulai = Date.now();

  const params = new URLSearchParams({
    query: topik,
    mode: "artlist",
    maxrecords: String(maxRecords),
    format: "json",
    sort: "datedesc",
  });
  const url = `${URL_DASAR_GDELT}?${params.toString()}`;

  let respons: Response;
  try {
    respons = await ambil(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Gagal mengambil GDELT untuk topik "${topik}" (${Date.now() - mulai} ms): ${pesan}`,
    );
  }
  if (!respons.ok) {
    throw new Error(
      `GDELT menolak topik "${topik}": HTTP ${respons.status} (${Date.now() - mulai} ms)`,
    );
  }

  let data: unknown;
  try {
    data = await respons.json();
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Respons GDELT untuk topik "${topik}" bukan JSON valid: ${pesan}`,
    );
  }

  const articles = (data as { articles?: unknown })?.articles;
  if (!Array.isArray(articles)) {
    throw new Error(
      `Respons GDELT untuk topik "${topik}" tidak berisi articles[] (format tak dikenal)`,
    );
  }

  const items: ItemMentah[] = [];
  for (const mentah of articles) {
    try {
      const a = mentah as Record<string, unknown>;
      const urlArtikel = typeof a.url === "string" ? a.url.trim() : "";
      const judul = typeof a.title === "string" ? a.title.trim() : "";
      if (!urlArtikel && !judul) continue;
      const seendate =
        typeof a.seendate === "string" ? a.seendate : "";
      items.push({
        url: urlArtikel,
        judul,
        ringkasan: "",
        isiRingkas: "",
        penulis: null,
        waktuTerbit: seendate ? parseSeendate(seendate) : null,
        guid: null,
        gambarUrl:
          typeof a.socialimage === "string" && a.socialimage
            ? (a.socialimage as string)
            : null,
        kategoriFeed: [],
        metadata: {
          sumber: "gdelt",
          domain: typeof a.domain === "string" ? a.domain : null,
          bahasa: typeof a.language === "string" ? a.language : null,
          negara_sumber:
            typeof a.sourcecountry === "string" ? a.sourcecountry : null,
          seendate: seendate || null,
        },
      });
    } catch {
      // Satu artikel rusak dilewati; sisanya tetap diproses.
      continue;
    }
  }

  return { items, httpStatus: respons.status, durasiMs: Date.now() - mulai };
}
