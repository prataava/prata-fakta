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
}

export interface HasilKualitas {
  lolos: boolean;
  kegagalan: string[];
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

  return { lolos: kegagalan.length === 0, kegagalan };
}
