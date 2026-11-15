// Agen Daily Brief PRATA FAKTA — susun isi Daily Brief dari entri
// artikel/draf + isu berkembang. Seksi: indonesia, dunia, ekonomi,
// teknologi, sains, isu_berkembang. Tiap entri membawa status
// verifikasinya APA ADANYA (entri UNCONFIRMED ditampilkan dengan
// status itu secara jujur, tidak pernah dinaikkan). Lokasi diisi dari
// metadata bila ada, else null — JANGAN tebak lokasi.
import type { TopikTren } from "./trends.ts";

export type SeksiBrief =
  | "indonesia"
  | "dunia"
  | "ekonomi"
  | "teknologi"
  | "sains";

export interface EntriBrief {
  judul: string;
  ringkasan: string;
  // ISO 8601 atau null bila waktu tidak diketahui.
  waktu: string | null;
  // Dari metadata bila ada; null bila tidak ada — jangan ditebak.
  lokasi: string | null;
  kategori: string;
  sumber: string;
  status_verifikasi: string;
  tautan: string;
}

export interface IsiBrief {
  tanggal: string;
  dibuat_oleh: string;
  seksi: Record<SeksiBrief, EntriBrief[]>;
  isu_berkembang: TopikTren[];
}

// Pemetaan kategori artikel -> seksi brief. Kategori tanpa seksi
// sendiri (pendidikan, lingkungan-energi) masuk 'indonesia' karena
// umumnya berita domestik; kategori tak dikenal juga masuk
// 'indonesia' sebagai fallback terdokumentasi.
export function seksiUntukKategori(kategori: string): SeksiBrief {
  switch (kategori) {
    case "dunia":
      return "dunia";
    case "ekonomi":
      return "ekonomi";
    case "teknologi":
      return "teknologi";
    case "sains":
      return "sains";
    case "indonesia":
    case "pendidikan":
    case "lingkungan-energi":
    default:
      return "indonesia";
  }
}

export function susunBrief(input: {
  tanggal: string;
  entri: EntriBrief[];
  isuBerkembang: TopikTren[];
}): IsiBrief {
  const seksi: Record<SeksiBrief, EntriBrief[]> = {
    indonesia: [],
    dunia: [],
    ekonomi: [],
    teknologi: [],
    sains: [],
  };
  for (const entri of input.entri) {
    seksi[seksiUntukKategori(entri.kategori)].push(entri);
  }
  return {
    tanggal: input.tanggal,
    dibuat_oleh: "pipeline editorial PRATA FAKTA (draf, menunggu editor)",
    seksi,
    isu_berkembang: input.isuBerkembang,
  };
}

// Ubah satu draf artikel menjadi entri brief. Sumber ditampilkan
// sebagai hostname URL sumber (atribusi); lokasi tetap null —
// jangan ditebak dari judul.
export function entriBriefDariDraf(d: {
  judul: string;
  ringkasan: string;
  kategori_slug: string;
  status_verifikasi: string;
  sumber_url: string;
  dibuat_pada: string;
}): EntriBrief {
  let sumber = "Redaksi PRATA FAKTA";
  try {
    sumber = new URL(d.sumber_url).hostname;
  } catch {
    // Pakai fallback di atas.
  }
  return {
    judul: d.judul,
    ringkasan: d.ringkasan,
    waktu: d.dibuat_pada,
    lokasi: null,
    kategori: d.kategori_slug,
    sumber,
    status_verifikasi: d.status_verifikasi,
    tautan: d.sumber_url,
  };
}
