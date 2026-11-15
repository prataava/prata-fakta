// Normalisasi + hash untuk deduplikasi ingestion PRATA FAKTA.
// Fungsi murni (tanpa I/O) agar mudah diuji dan dipakai ulang.
// Hanya memakai Node built-in (node:crypto).

import { createHash } from "node:crypto";

// Parameter query pelacak yang tidak mengubah isi halaman — dibuang agar
// URL yang sama dari kanal berbeda tetap dikenali sebagai satu URL.
const PARAMETER_PELACAK = /^(utm_[a-z]+|fbclid|gclid|gclsrc|mc_cid|mc_eid|igshid|vero_id|_ga|_gl)$/i;

// Normalisasi URL: lowercase host+path, buang query pelacak, buang
// fragment, buang trailing slash (kecuali root).
export function normalisasiUrl(url: string): string {
  let terurai: URL;
  try {
    terurai = new URL(url.trim());
  } catch {
    // URL tidak valid: kembalikan apa adanya (trim + lowercase) agar
    // hash tetap deterministik; validasi http(s) dilakukan di engine.
    return url.trim().toLowerCase();
  }
  terurai.protocol = terurai.protocol.toLowerCase();
  terurai.hostname = terurai.hostname.toLowerCase();
  terurai.hash = "";
  // Buang parameter pelacak, pertahankan parameter lain apa adanya.
  const params = new URLSearchParams(terurai.search);
  const simpan: Array<[string, string]> = [];
  for (const [kunci, nilai] of params.entries()) {
    if (!PARAMETER_PELACAK.test(kunci)) simpan.push([kunci, nilai]);
  }
  const queryBaru = new URLSearchParams(simpan);
  const queryString = queryBaru.toString();
  terurai.search = queryString ? `?${queryString}` : "";
  // Trailing slash: buang kecuali path adalah root ("/").
  if (terurai.pathname.length > 1 && terurai.pathname.endsWith("/")) {
    terurai.pathname = terurai.pathname.replace(/\/+$/, "");
  }
  return terurai.toString();
}

// sha256 hex dari URL ternormalisasi.
export function hashUrl(url: string): string {
  return createHash("sha256").update(normalisasiUrl(url), "utf8").digest("hex");
}

// Normalisasi judul: lowercase, buang tanda baca, gabung spasi ganda.
export function normalisasiJudul(judul: string): string {
  return judul
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// sha256 hex dari judul ternormalisasi.
export function hashJudul(judul: string): string {
  return createHash("sha256")
    .update(normalisasiJudul(judul), "utf8")
    .digest("hex");
}

export interface KandidatJudulCocok {
  id: string;
  sumber_id: string | null;
  waktu_terbit_asli: string | null;
  waktu_diambil: string;
}

export type KeputusanDuplikat =
  | { status: "baru"; disalinDariId: null; diterbitkanUlang: false; alasan: null }
  | {
      status: "disalin_dari";
      disalinDariId: string;
      diterbitkanUlang: false;
      alasan: string;
    }
  | {
      status: "duplikat";
      disalinDariId: null;
      diterbitkanUlang: boolean;
      alasan: string;
    };

const BATAS_TERBIT_ULANG_MS = 48 * 60 * 60 * 1000; // 48 jam
const BATAS_DIAMBIL_ULANG_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// Tentukan status satu item berdasarkan daftar item yang hash_judul-nya
// sudah cocok di database. Fungsi murni — dipakai engine sebelum insert.
// - Cocok dari sumber BERBEDA -> 'disalin_dari' (bukan sumber independen).
// - Cocok dari sumber SAMA dan tanggal terbit berselisih > 48 jam
//   (atau tanggal tak tersedia dan waktu_diambil berselisih > 7 hari)
//   -> 'duplikat' + diterbitkan_ulang.
// - Cocok dari sumber SAMA dan tanggal dekat -> 'duplikat' biasa.
// - Tidak ada yang cocok -> 'baru'.
export function tentukanStatusDuplikat(input: {
  sumberId: string;
  cocok: KandidatJudulCocok[];
  waktuTerbit: Date | null;
  waktuDiambil: Date;
}): KeputusanDuplikat {
  const { sumberId, cocok, waktuTerbit, waktuDiambil } = input;
  if (cocok.length === 0) {
    return { status: "baru", disalinDariId: null, diterbitkanUlang: false, alasan: null };
  }

  // Item tertua yang cocok = yang pertama kali diambil (acuan disalin_dari).
  const terurut = [...cocok].sort(
    (a, b) =>
      new Date(a.waktu_diambil).getTime() - new Date(b.waktu_diambil).getTime(),
  );
  const tertua = terurut[0];

  // Aturan 1: ada yang cocok dari sumber berbeda -> disalin dari penerbit lain.
  const dariLain = terurut.find((k) => k.sumber_id !== sumberId);
  if (dariLain) {
    // disalin_dari_id menunjuk item tertua yang cocok secara keseluruhan.
    return {
      status: "disalin_dari",
      disalinDariId: tertua.id,
      diterbitkanUlang: false,
      alasan:
        "Judul identik dengan item dari penerbit lain — kemungkinan disalin, bukan sumber independen",
    };
  }

  // Sisa kandidat semuanya dari sumber yang sama.
  const sama = terurut.filter((k) => k.sumber_id === sumberId);
  // Aturan 2: tanggal terbit berselisih jauh -> kemungkinan diterbitkan ulang.
  const diterbitkanUlang = sama.some((k) => {
    const terbitLama = k.waktu_terbit_asli ? new Date(k.waktu_terbit_asli) : null;
    if (waktuTerbit && terbitLama && !Number.isNaN(terbitLama.getTime())) {
      return Math.abs(waktuTerbit.getTime() - terbitLama.getTime()) > BATAS_TERBIT_ULANG_MS;
    }
    // Tanggal terbit tak tersedia di salah satu sisi: pakai waktu_diambil.
    const diambilLama = new Date(k.waktu_diambil);
    return (
      Math.abs(waktuDiambil.getTime() - diambilLama.getTime()) >
      BATAS_DIAMBIL_ULANG_MS
    );
  });
  if (diterbitkanUlang) {
    return {
      status: "duplikat",
      disalinDariId: null,
      diterbitkanUlang: true,
      alasan: "Judul sama, tanggal terbit berbeda — kemungkinan diterbitkan ulang",
    };
  }

  // Aturan 3: judul sama, sumber sama, tanggal dekat -> duplikat biasa.
  return {
    status: "duplikat",
    disalinDariId: null,
    diterbitkanUlang: false,
    alasan: "Judul sama dari sumber yang sama dalam rentang waktu dekat",
  };
}
