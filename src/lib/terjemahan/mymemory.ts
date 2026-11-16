// Penerjemah Inggris → Indonesia via MyMemory (Gelombang B2-E, G2).
//
// MyMemory (api.mymemory.translated.net) — API REST GET gratis,
// tanpa kunci, menggabungkan memori terjemahan manusia + mesin
// (parameter mt=1, bawaan). Dokumentasi resmi (dibaca 16 Nov 2026):
//   - https://mymemory.translated.net/doc/spec.php
//   - https://mymemory.translated.net/doc/usagelimits.php
//   - GET /get?q=<teks>&langpair=en|id[&de=<email>][&mt=1]
//   - q MAKSIMAL 500 byte (UTF-8) per permintaan → teks dipecah
//     per segmen ≤450 byte (margin aman) lalu digabung.
//   - Batas gratis: 5.000 karakter/hari anonim (dihitung per IP
//     pemanggil); 50.000 karakter/hari bila menyertakan email
//     valid di parameter `de`; 150.000/hari hanya untuk pembuat
//     CAT tool yang di-whitelist (proyek pribadi tidak lolos).
//   - Respons: { responseData: { translatedText }, responseStatus:
//     200, matches: [...] }. responseStatus 429 = kuota habis.
//   - Tanpa registrasi/verifikasi untuk pemakaian anonim + `de`;
//     TIDAK ADA secret/kunci di repo — email (bila dipakai) hanya
//     dari env MYMEMORY_EMAIL dan tidak pernah dicetak di log.
//
// ATURAN PAKAI DI PRATA FAKTA:
// - HANYA untuk item Inggris NYATA di pipeline (langkah
//   translation; lihat src/lib/ai/translation.ts) — judul saja,
//   BUKAN ringkasan/isi penuh, agar kuota harian anonim tidak
//   habis dalam satu run (judul ~100 karakter × 10 item/run).
// - Terjemahan disimpan sebagai DRAF TERPISAH (metadata item:
//   metadata.terjemahan = { judul_id, sumber, atribusi, ... }),
//   TIDAK PERNAH menimpa teks asli.
// - Gagal (jaringan/timeout/kuota/respons tak valid) → item
//   tetap 'dilewati' dengan alasan jujur — BUKAN terjemahan
//   karangan. Fungsi ini TIDAK PERNAH melempar: semua kegagalan
//   dikembalikan sebagai { ok: false, alasan }.
// - Transport bawaan = fetchAman (SSRF-safe, lihat
//   src/lib/ingestion/ssrf.ts); pemanggil uji boleh menyuntik
//   fetch pengganti lewat opsi.fetchFn.

import { fetchAman } from "../ingestion/ssrf.ts";

export const MYMEMORY_BASIS_URL = "https://api.mymemory.translated.net/get";
export const ATRIBUSI_MYMEMORY =
  "Diterjemahkan otomatis via MyMemory (api.mymemory.translated.net)";
export const SUMBER_TERJEMAHAN = "MyMemory";

/** Batas resmi q per permintaan (500 byte) — dipakai 450 sebagai margin. */
export const MAKS_Q_BYTE = 450;
/** Batas gratis resmi: anonim 5.000 karakter/hari; dengan email 50.000/hari. */
export const BATAS_ANON_HARIAN_KARAKTER = 5000;
export const BATAS_EMAIL_HARIAN_KARAKTER = 50000;
/** Timeout satu permintaan MyMemory (ms). */
export const TIMEOUT_MYMEMORY_MS = 10000;
/** Percobaan per segmen (1 awal + 2 ulang) untuk galat jaringan/5xx. */
export const PERCOBAAN_MAKS = 3;

export type AlasanGagalTerjemahan =
  | "teks_kosong"
  | "terlalu_panjang"
  | "timeout"
  | "jaringan"
  | "kuota_habis"
  | "respons_tidak_valid"
  | "http_gagal";

export type HasilTerjemahanMyMemory =
  | {
      ok: true;
      terjemahan: string;
      sumber: typeof SUMBER_TERJEMAHAN;
      atribusi: string;
      segmen: number;
      karakter: number;
    }
  | { ok: false; alasan: AlasanGagalTerjemahan; detail: string };

export type OpsiTerjemahanMyMemory = {
  /** Email valid (env MYMEMORY_EMAIL) — menaikkan kuota ke 50.000/hari. */
  email?: string;
  /** Fetch pengganti — HANYA untuk uji (bawaan: fetchAman). */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Timeout per permintaan (ms) — bawaan TIMEOUT_MYMEMORY_MS. */
  timeoutMs?: number;
};

const encoder = new TextEncoder();

function panjangByte(teks: string): number {
  return encoder.encode(teks).length;
}

/**
 * Pecah teks menjadi segmen ≤ maksByte, dipecah di batas kalimat
 * dulu (". " / "! " / "? "), lalu di koma, lalu per kata — tidak
 * pernah memotong di tengah kata kecuali satu kata > maksByte.
 * Diekspos untuk uji.
 */
export function bagiSegmen(teks: string, maksByte = MAKS_Q_BYTE): string[] {
  const kalimat = teks.split(/(?<=[.!?])\s+/u).filter(Boolean);
  const segmen: string[] = [];
  for (const k of kalimat) {
    if (panjangByte(k) <= maksByte) {
      segmen.push(k);
      continue;
    }
    // Kalimat terlalu panjang: pecah di koma.
    const bagian = k.split(/(?<=,)\s+/u).filter(Boolean);
    let kini = "";
    const dorong = () => {
      if (kini) {
        segmen.push(kini);
        kini = "";
      }
    };
    for (const b of bagian) {
      if (panjangByte(b) > maksByte) {
        // Masih terlalu panjang: pecah per kata.
        dorong();
        let kataKini = "";
        for (const kata of b.split(/\s+/u).filter(Boolean)) {
          if (
            kataKini &&
            panjangByte(`${kataKini} ${kata}`) > maksByte
          ) {
            segmen.push(kataKini);
            kataKini = kata;
          } else {
            kataKini = kataKini ? `${kataKini} ${kata}` : kata;
          }
        }
        if (kataKini) segmen.push(kataKini);
        continue;
      }
      if (kini && panjangByte(`${kini} ${b}`) > maksByte) dorong();
      kini = kini ? `${kini} ${b}` : b;
    }
    dorong();
  }
  return segmen.filter((s) => s.trim().length > 0);
}

/** URL GET MyMemory untuk satu segmen (diekspos untuk uji). */
export function buatUrlMyMemory(segmen: string, email?: string): string {
  const param = new URLSearchParams({
    q: segmen,
    langpair: "en|id",
    mt: "1",
  });
  if (email && email.includes("@")) param.set("de", email);
  return `${MYMEMORY_BASIS_URL}?${param.toString()}`;
}

function tidur(ms: number): Promise<void> {
  return new Promise((selesai) => setTimeout(selesai, ms));
}

async function terjemahkanSegmen(
  segmen: string,
  opsi: OpsiTerjemahanMyMemory,
): Promise<HasilTerjemahanMyMemory> {
  const panggil =
    opsi.fetchFn ??
    ((url: string, init?: RequestInit) => fetchAman(url, init ?? {}));
  const timeoutMs = opsi.timeoutMs ?? TIMEOUT_MYMEMORY_MS;
  const url = buatUrlMyMemory(segmen, opsi.email);
  let galatTerakhir = "";
  for (let percobaan = 1; percobaan <= PERCOBAAN_MAKS; percobaan++) {
    let respons: Response;
    try {
      respons = await panggil(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      const nama =
        err instanceof Error ? err.name : String(err ?? "");
      if (nama === "TimeoutError" || nama === "AbortError") {
        return {
          ok: false,
          alasan: "timeout",
          detail: `MyMemory timeout sesudah ${timeoutMs} ms (segmen ${segmen.length} karakter).`,
        };
      }
      galatTerakhir = err instanceof Error ? err.message : String(err ?? "");
      if (percobaan < PERCOBAAN_MAKS) {
        await tidur(500 * percobaan);
        continue;
      }
      return {
        ok: false,
        alasan: "jaringan",
        detail: `MyMemory tidak terjangkau sesudah ${PERCOBAAN_MAKS} percobaan: ${galatTerakhir}`,
      };
    }
    if (respons.status === 429) {
      return {
        ok: false,
        alasan: "kuota_habis",
        detail:
          "MyMemory mengembalikan 429 — kuota harian gratis habis. Coba lagi besok atau isi MYMEMORY_EMAIL.",
      };
    }
    if (!respons.ok) {
      galatTerakhir = `HTTP ${respons.status}`;
      if (respons.status >= 500 && percobaan < PERCOBAAN_MAKS) {
        await tidur(500 * percobaan);
        continue;
      }
      return {
        ok: false,
        alasan: "http_gagal",
        detail: `MyMemory mengembalikan HTTP ${respons.status}.`,
      };
    }
    let badan: unknown;
    try {
      badan = await respons.json();
    } catch {
      return {
        ok: false,
        alasan: "respons_tidak_valid",
        detail: "Respons MyMemory bukan JSON.",
      };
    }
    const data = badan as {
      responseData?: { translatedText?: unknown };
      responseStatus?: unknown;
      responseDetails?: unknown;
    };
    if (data.responseStatus === 429) {
      return {
        ok: false,
        alasan: "kuota_habis",
        detail: `MyMemory menolak permintaan (kuota harian habis): ${String(data.responseDetails ?? "")}`,
      };
    }
    const teks = data.responseData?.translatedText;
    if (typeof teks !== "string" || !teks.trim()) {
      return {
        ok: false,
        alasan: "respons_tidak_valid",
        detail: "Respons MyMemory tidak memuat translatedText.",
      };
    }
    return {
      ok: true,
      terjemahan: teks.trim(),
      sumber: SUMBER_TERJEMAHAN,
      atribusi: ATRIBUSI_MYMEMORY,
      segmen: 1,
      karakter: segmen.length,
    };
  }
  return {
    ok: false,
    alasan: "jaringan",
    detail: galatTerakhir || "MyMemory tidak terjangkau.",
  };
}

/**
 * Terjemahkan teks Inggris → Indonesia via MyMemory.
 * TIDAK PERNAH melempar; gagal → { ok: false, alasan } supaya
 * pemanggil mencatat 'dilewati' dengan jujur. Teks kosong →
 * { ok: false, alasan: 'teks_kosong' } (bukan terjemahan kosong).
 */
export async function terjemahkanEnKeId(
  teks: string,
  opsi: OpsiTerjemahanMyMemory = {},
): Promise<HasilTerjemahanMyMemory> {
  const bersih = teks.replace(/\s+/g, " ").trim();
  if (!bersih) {
    return { ok: false, alasan: "teks_kosong", detail: "Teks kosong." };
  }
  const segmen = bagiSegmen(bersih);
  const hasil: string[] = [];
  let karakter = 0;
  for (const s of segmen) {
    const satu = await terjemahkanSegmen(s, opsi);
    if (!satu.ok) return satu;
    hasil.push(satu.terjemahan);
    karakter += satu.karakter;
  }
  return {
    ok: true,
    terjemahan: hasil.join(" "),
    sumber: SUMBER_TERJEMAHAN,
    atribusi: ATRIBUSI_MYMEMORY,
    segmen: segmen.length,
    karakter,
  };
}
