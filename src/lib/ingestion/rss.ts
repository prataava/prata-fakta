// Pengambil + parser feed RSS/Atom untuk PRATA FAKTA.
// Hanya memakai Node built-in (fetch global) — tanpa library XML.
// Hak cipta: yang disimpan hanya metadata + ringkasan sumber + URL;
// JANGAN pernah menyalin isi penuh artikel media lain ke database.
import { fetchAman, tolakHostPrivat } from "./ssrf.ts";
import { tolakHostFeed, tolakHostFeedAman } from "./feed-allowlist.ts";
import {
  buatGalatHttp,
  GalatSementara,
} from "./retry.ts";

export interface ItemMentah {
  url: string;
  judul: string;
  ringkasan: string;
  isiRingkas: string;
  penulis: string | null;
  waktuTerbit: Date | null;
  guid: string | null;
  gambarUrl: string | null;
  kategoriFeed: string[];
  // Metadata tambahan dari sumber (mis. GDELT: domain, bahasa, negara).
  metadata?: Record<string, unknown>;
}

export interface OpsiFetchRss {
  timeoutMs?: number;
  // fetch pengganti (untuk pengujian / fallback curl di dry-run).
  fetchFn?: typeof fetch;
  // Lewati allowlist host feed — HANYA untuk uji dengan fetch mock
  // (sumber sintetis contoh.test di scripts/uji-ingestion.mjs).
  // JANGAN PERNAH diisi di jalur produksi: allowlist adalah
  // pertahanan lapis-2 SSRF untuk ingestion (Tahap 13B).
  lewatiAllowlist?: boolean;
}

export interface HasilFetchRss {
  items: ItemMentah[];
  httpStatus: number;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0";

const BATAS_RINGKASAN = 1000;
const BATAS_ISI_RINGKAS = 3000;

// Batas ukuran body feed (P3-1 / N-R2): feed 5 MB sudah jauh di atas
// ukuran wajar (feed berita umumnya < 1 MB). Body lebih besar ditolak
// sebelum diparse agar satu feed raksasa tidak menghabiskan memori.
export const BATAS_BODY_RSS_BYTE = 5 * 1024 * 1024;

/**
 * Baca body respons dengan batas ukuran. Content-Length di atas batas
 * ditolak tanpa membaca body; stream dibaca bertahap dan dibatalkan
 * begitu batas terlampaui. Respons mock tanpa body stream (hanya
 * text()) tetap diperiksa panjangnya sesudah dibaca.
 */
export async function bacaTeksTerbatas(
  respons: Response,
  batasByte: number = BATAS_BODY_RSS_BYTE,
): Promise<string> {
  const panjangHeader = respons.headers?.get("content-length");
  if (panjangHeader !== null && panjangHeader !== undefined) {
    const panjang = Number(panjangHeader);
    if (Number.isFinite(panjang) && panjang > batasByte) {
      throw new Error(
        `Body respons ${panjang} byte melebihi batas ${batasByte} byte`,
      );
    }
  }
  const stream = (respons as Response & { body?: ReadableStream<Uint8Array> | null }).body;
  if (stream && typeof stream.getReader === "function") {
    const pembaca = stream.getReader();
    const potongan: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await pembaca.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > batasByte) {
          try {
            await pembaca.cancel();
          } catch {
            // Abaikan: pembatalan stream best-effort.
          }
          throw new Error(
            `Body respons melebihi batas ${batasByte} byte`,
          );
        }
        potongan.push(value);
      }
    }
    const gabung = new Uint8Array(total);
    let geser = 0;
    for (const p of potongan) {
      gabung.set(p, geser);
      geser += p.byteLength;
    }
    return new TextDecoder("utf-8").decode(gabung);
  }
  const teks = await respons.text();
  if (new TextEncoder().encode(teks).byteLength > batasByte) {
    throw new Error(`Body respons melebihi batas ${batasByte} byte`);
  }
  return teks;
}

// ---------- Pembersih teks ----------

// Decode entitas HTML yang umum + entitas numerik (desimal & heksadesimal).
export function decodeEntitas(teks: string): string {
  return teks
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const kode = parseInt(hex, 16);
      return Number.isNaN(kode) ? _m : String.fromCodePoint(kode);
    })
    .replace(/&#(\d+);/g, (_m, des: string) => {
      const kode = parseInt(des, 10);
      return Number.isNaN(kode) ? _m : String.fromCodePoint(kode);
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Buang semua tag HTML, lalu rapikan spasi.
export function bersihkanHtml(teks: string): string {
  const tanpaTag = decodeEntitas(teks).replace(/<[^>]*>/g, " ");
  return tanpaTag.replace(/\s+/g, " ").trim();
}

function potong(teks: string, batas: number): string {
  return teks.length > batas ? teks.slice(0, batas) : teks;
}

// ---------- Parser XML toleran (tanpa library) ----------

// Ambil isi tag <nama>...</nama> (dengan CDATA bila ada) dari sebuah blok.
function ambilTag(blok: string, namaTag: string): string | null {
  const lolos = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolos}(?:\\s[^>]*)?>([\\s\\S]*?)</${lolos}>`,
    "i",
  );
  const cocok = blok.match(pola);
  if (!cocok) return null;
  let isi = cocok[1].trim();
  const cdata = isi.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) isi = cdata[1];
  return isi.trim();
}

// Ambil semua isi tag <nama>...</nama>.
function ambilSemuaTag(blok: string, namaTag: string): string[] {
  const lolos = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolos}(?:\\s[^>]*)?>([\\s\\S]*?)</${lolos}>`,
    "gi",
  );
  const hasil: string[] = [];
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(blok)) !== null) {
    let isi = cocok[1].trim();
    const cdata = isi.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
    if (cdata) isi = cdata[1];
    const bersih = decodeEntitas(isi).trim();
    if (bersih) hasil.push(bersih);
  }
  return hasil;
}

// Ambil nilai atribut dari sebuah tag pembuka, mis. <link href="..."/> atau
// <media:thumbnail url="..."/>.
function ambilAtribut(blok: string, namaTag: string, atribut: string): string | null {
  const lolosTag = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lolosAt = atribut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolosTag}(?:\\s[^>]*?)?\\s${lolosAt}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const cocok = blok.match(pola);
  if (!cocok) return null;
  return decodeEntitas((cocok[1] ?? cocok[2] ?? "").trim()) || null;
}

function parseTanggal(teks: string | null): Date | null {
  if (!teks) return null;
  const tanggal = new Date(teks.trim());
  return Number.isNaN(tanggal.getTime()) ? null : tanggal;
}

// Parse satu blok <item> RSS 2.0 atau <entry> Atom menjadi ItemMentah.
// Mengembalikan null bila blok tidak punya url maupun judul yang berguna.
function parseSatuItem(blok: string): ItemMentah | null {
  // Tautan: RSS memakai teks <link>; Atom memakai atribut href.
  let url = ambilAtribut(blok, "link", "href");
  if (!url) {
    const teksLink = ambilTag(blok, "link");
    if (teksLink) url = decodeEntitas(teksLink).trim();
  }
  // Atom kadang menaruh tautan alternatif di <link rel="alternate" href>.
  if (!url) {
    const semuaLink = blok.match(/<link[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi);
    if (semuaLink) {
      for (const tag of semuaLink) {
        const href = tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        if (href && (href[1] || href[2])) {
          url = decodeEntitas(href[1] || href[2] || "").trim();
          break;
        }
      }
    }
  }

  const judulMentah = ambilTag(blok, "title");
  const judul = judulMentah ? bersihkanHtml(judulMentah) : "";

  if (!url && !judul) return null;

  const deskripsiMentah =
    ambilTag(blok, "description") ?? ambilTag(blok, "summary") ?? "";
  const kontenMentah =
    ambilTag(blok, "content:encoded") ?? ambilTag(blok, "content") ?? "";
  const ringkasan = potong(bersihkanHtml(deskripsiMentah), BATAS_RINGKASAN);
  const isiRingkas = potong(bersihkanHtml(kontenMentah), BATAS_ISI_RINGKAS);

  // Tanggal terbit HANYA dari pubDate / published / dc:date (P2-6 / N-S10).
  // <updated> Atom adalah tanggal REVISI terakhir — bisa berhari-hari
  // sesudah terbit — jadi TIDAK BOLEH dipakai sebagai tanggal terbit.
  // Revisi disimpan terpisah di metadata.waktu_revisi.
  const tanggalMentah =
    ambilTag(blok, "pubDate") ??
    ambilTag(blok, "published") ??
    ambilTag(blok, "dc:date") ??
    null;
  const waktuTerbit = parseTanggal(tanggalMentah);
  const waktuRevisi = parseTanggal(ambilTag(blok, "updated"));

  const penulisMentah =
    ambilTag(blok, "dc:creator") ?? ambilTag(blok, "author") ?? null;
  // <author><name>...</name></author> pada Atom.
  let penulis: string | null = null;
  if (penulisMentah) {
    const namaDalam = ambilTag(penulisMentah, "name");
    penulis = bersihkanHtml(namaDalam ?? penulisMentah) || null;
  }

  const guid =
    ambilTag(blok, "guid") ?? ambilTag(blok, "id") ?? null;
  const guidBersih = guid ? decodeEntitas(guid).trim() || null : null;

  const gambarUrl =
    ambilAtribut(blok, "media:thumbnail", "url") ??
    ambilAtribut(blok, "media:content", "url") ??
    ambilAtribut(blok, "enclosure", "url") ??
    null;

  const kategoriFeed = ambilSemuaTag(blok, "category");

  return {
    url: url ?? "",
    judul,
    ringkasan,
    isiRingkas,
    penulis,
    waktuTerbit,
    guid: guidBersih,
    gambarUrl,
    kategoriFeed,
    ...(waktuRevisi
      ? { metadata: { waktu_revisi: waktuRevisi.toISOString() } }
      : {}),
  };
}

// Parse XML feed (RSS 2.0 <item> atau Atom <entry>) menjadi daftar item.
// Satu item rusak tidak boleh menggagalkan seluruh feed.
export function parseRss(xml: string): ItemMentah[] {
  const hasil: ItemMentah[] = [];
  const polaItem = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
  let cocok: RegExpExecArray | null;
  while ((cocok = polaItem.exec(xml)) !== null) {
    const blok = cocok[2];
    try {
      const item = parseSatuItem(blok);
      if (item) hasil.push(item);
    } catch {
      // Satu item rusak dilewati; feed tetap diproses.
      continue;
    }
  }
  return hasil;
}

// Ambil satu feed RSS/Atom lewat HTTP dan parse isinya.
export async function fetchRss(
  url: string,
  opsi: OpsiFetchRss = {},
): Promise<HasilFetchRss> {
  const timeoutMs = opsi.timeoutMs ?? 10000;
  // Pelindung SSRF (Fase 7): tolak host privat sebelum fetch.
  // fetchFn kustom (dipakai uji) tetap melewati pemeriksaan ini —
  // URL yang sama akan ditolak baik di produksi maupun di uji.
  const ditolak = await tolakHostPrivat(url);
  if (ditolak) throw new Error(`Feed ditolak: ${ditolak}`);
  // Tahap 13B (T6, lapis 2): feed ingestion HANYA dari host di
  // allowlist (feed-allowlist.ts) — berlaku juga untuk target
  // redirect (periksaHost diteruskan ke fetchAman untuk semua hop).
  // lewatiAllowlist HANYA untuk uji mock; produksi selalu memeriksa.
  if (!opsi.lewatiAllowlist) {
    const ditolakAllowlist = tolakHostFeed(url);
    if (ditolakAllowlist) throw new Error(`Feed ditolak: ${ditolakAllowlist}`);
  }
  const ambil = opsi.fetchFn ?? fetch;
  let respons: Response;
  try {
    // Gate Fase 8 (T6): fetchAman, bukan fetch mentah — redirect ke
    // host privat ditolak di tiap hop, bukan hanya URL awal.
    respons = await fetchAman(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
      ambil,
      opsi.lewatiAllowlist
        ? {}
        : {
            periksaHost: tolakHostFeedAman,
            periksaHopLanjutan: tolakHostFeedAman,
          },
    );
  } catch (err) {
    // GalatSementara (429/5xx/jaringan) diteruskan apa adanya agar
    // retry per-sumber (engine) bisa membaca status + Retry-After.
    // Penolakan keamanan (allowlist/SSRF) TIDAK boleh dicoba ulang.
    if (err instanceof GalatSementara) throw err;
    const pesan = err instanceof Error ? err.message : String(err);
    if (
      pesan.startsWith("Feed ditolak:") ||
      pesan.startsWith("URL ditolak:")
    ) {
      throw err instanceof Error ? err : new Error(pesan);
    }
    throw new GalatSementara(`Gagal mengambil feed ${url}: ${pesan}`);
  }
  if (!respons.ok) {
    throw buatGalatHttp(
      respons.status,
      respons,
      `Gagal mengambil feed ${url}: HTTP ${respons.status}`,
    );
  }
  const xml = await bacaTeksTerbatas(respons);
  const items = parseRss(xml);
  return { items, httpStatus: respons.status };
}
