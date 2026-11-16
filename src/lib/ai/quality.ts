// Agen Editorial Quality PRATA FAKTA — cek DETERMINISTIK atas draf
// artikel (bukan penilaian gaya oleh LLM). Draf yang gagal tetap
// disimpan, tetapi TIDAK ditandai siap-review — editor manusia yang
// memutuskan.
import { KATEGORI_UTAMA } from "./types.ts";

export interface MasukanKualitas {
  judul: string;
  ringkasan: string;
  isi: string;
  kategori_slug: string;
  sumber_url: string;
  jumlahKlaimTerverifikasi: number;
  jumlahEvidence: number;
  // P2-2 (N-S2): evidence dari sumber INDEPENDEN (bukan sumber
  // item sendiri). Bila diisi dan keputusan VERIFIED/CROSS-CHECKED,
  // wajib >= 1 — self-evidence saja tidak cukup.
  jumlahEvidenceIndependen?: number;
  keputusan?: "VERIFIED" | "CROSS-CHECKED" | "DEVELOPING" | "UNCONFIRMED";
}

export interface HasilKualitas {
  lolos: boolean;
  kegagalan: string[];
  // P2-2: sama dengan `lolos` — disimpan pipeline ke pf_ai_runs
  // (detail run editorial_quality) dan ke bukti verification
  // record artikel, agar penjadwalan bisa menegakkannya.
  // (Kolom siap_review di pf_articles adalah follow-up migrasi v13.)
  siap_review: boolean;
}

// Penanda draf belum selesai / placeholder — tidak boleh ada di isi.
const POLA_PLACEHOLDER = /todo|lorem|placeholder|\[isi|\[tulis|xxx/i;

function urlValid(url: string): boolean {
  try {
    const terurai = new URL(url);
    return terurai.protocol === "http:" || terurai.protocol === "https:";
  } catch {
    return false;
  }
}

export function periksaKualitasDraf(d: MasukanKualitas): HasilKualitas {
  const kegagalan: string[] = [];

  if (!d.judul || d.judul.trim().length < 10) {
    kegagalan.push("Judul kurang dari 10 karakter.");
  }
  if (!d.ringkasan || !d.ringkasan.trim()) {
    kegagalan.push("Ringkasan kosong.");
  }
  if (d.jumlahKlaimTerverifikasi < 1) {
    kegagalan.push("Tidak ada klaim terverifikasi yang mendasari draf.");
  }
  if (d.jumlahEvidence < 1) {
    kegagalan.push("Tidak ada evidence (bukti sumber) yang tercatat.");
  }
  // P2-2 (N-S2): self-evidence tidak dihitung — VERIFIED /
  // CROSS-CHECKED butuh minimal 1 evidence dari sumber independen.
  if (
    (d.keputusan === "VERIFIED" || d.keputusan === "CROSS-CHECKED") &&
    typeof d.jumlahEvidenceIndependen === "number" &&
    d.jumlahEvidenceIndependen < 1
  ) {
    kegagalan.push(
      "Tidak ada evidence dari sumber independen (butuh >= 1 untuk VERIFIED/CROSS-CHECKED; evidence dari sumber item sendiri tidak dihitung).",
    );
  }
  if (!urlValid(d.sumber_url)) {
    kegagalan.push("sumber_url bukan URL http(s) yang valid.");
  }
  if (!KATEGORI_UTAMA.includes(d.kategori_slug as (typeof KATEGORI_UTAMA)[number])) {
    kegagalan.push(`kategori_slug tidak valid: ${d.kategori_slug}.`);
  }
  if (POLA_PLACEHOLDER.test(d.isi)) {
    kegagalan.push("Isi mengandung penanda placeholder (TODO/lorem/dll).");
  }
  if (!d.isi || d.isi.length < 300) {
    kegagalan.push(`Isi kurang dari 300 karakter (saat ini ${d.isi ? d.isi.length : 0}).`);
  }

  return {
    lolos: kegagalan.length === 0,
    kegagalan,
    siap_review: kegagalan.length === 0,
  };
}
