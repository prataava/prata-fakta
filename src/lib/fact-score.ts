// FACT SCORE v1 — PRATA FAKTA (P0 Worker F).
// Rumus DISETUJUI pemilik 17 Nov 2026 ±07.04 WIB ("Setuju, pakai
// rumus ini"), sesuai RENCANA-EKSPANSI-P0.md §4.2–4.3. Fungsi murni
// deterministik: skor dihitung saat baca dari data kini (bukan
// disimpan di pf_articles), jadi bila bukti/koreksi berubah skor
// ikut berubah — tidak ada skor basi.
//
//   FACT SCORE = bulatkan(A + B + C + D)        skala 0–100
//   A (maks 40) — cakupan independen: n = jumlah akar sumber
//     independen BERBEDA yang mendukung >= 1 klaim (gabungan
//     akar semua klaim; satu akar dihitung sekali — satu berita
//     yang disalin 3 media = 1). A = min(n,3)/3 × 40.
//   B (maks 30) — kredibilitas: s = skor kredibilitas TERTINGGI
//     dari tier akar pendukung (tier 1 = 90, tier 2 = 75,
//     tier 3 = 60; lihat lib/ai/source-analysis.ts).
//     B = s/90 × 30. Tanpa pendukung -> 0.
//   C (maks 20) — konsistensi klaim: k = jumlah klaim; kd =
//     klaim dengan >= 1 bukti 'mendukung' DAN 0 bukti
//     'menentang'. C = (kd/k) × 20.
//   D (maks 10) — rekam koreksi: t = jumlah laporan koreksi
//     artikel ini yang masih terbuka (status baru/ditinjau).
//     D = maks(0, 10 − 5×t).
//
// Aturan tampil (§4.3): artikel TANPA klaim (k = 0) TIDAK
// DINILAI — tidak diberi angka sama sekali (bukan 0). FACT
// SCORE bukan status verifikasi dan bukan vonis benar/salah;
// keduanya tampil berdampingan, tidak saling menggantikan.

export type MasukanFactScore = {
  /** Jumlah akar sumber independen BERBEDA yang mendukung >= 1
   *  klaim (gabungan akar semua klaim, satu akar dihitung sekali). */
  jumlahAkarPendukung: number;
  /** Skor kredibilitas TERTINGGI dari tier akar pendukung
   *  (90/75/60); null bila tidak ada pendukung. */
  skorKredibilitasTertinggi: number | null;
  /** Jumlah klaim artikel (k). 0 -> artikel tidak dinilai. */
  jumlahKlaim: number;
  /** Klaim dengan >= 1 bukti 'mendukung' DAN 0 bukti
   *  'menentang' (kd). */
  jumlahKlaimDidukungTanpaMenentang: number;
  /** Laporan koreksi artikel ini yang masih terbuka
   *  (status baru/ditinjau) (t). */
  laporanKoreksiTerbuka: number;
};

export type KomponenFactScore = {
  /** A — cakupan independen (0–40). */
  independen: number;
  /** B — kredibilitas sumber (0–30). */
  kredibilitas: number;
  /** C — konsistensi klaim (0–20). */
  konsistensi: number;
  /** D — rekam koreksi (0–10). */
  koreksi: number;
};

export type HasilFactScore = {
  /** Skor bulat 0–100; null bila artikel tidak dinilai. */
  skor: number | null;
  /** Label §4.3; null bila artikel tidak dinilai. */
  label: string | null;
  /** Nilai tiap komponen (apa adanya, belum dibulatkan);
   *  semuanya 0 bila artikel tidak dinilai — JANGAN ditampilkan
   *  sebagai skor 0, tampilkan alasanTidakDinilai. */
  komponen: KomponenFactScore;
  /** false bila artikel tanpa klaim (k = 0). */
  dinilai: boolean;
  /** Terisi hanya bila dinilai = false. */
  alasanTidakDinilai?: string;
};

/** Label §4.3 dari skor bulat 0–100. */
export function labelFactScore(skor: number): string {
  if (skor >= 85) return "Sangat kuat";
  if (skor >= 70) return "Kuat";
  if (skor >= 50) return "Cukup";
  if (skor >= 25) return "Lemah";
  return "Sangat lemah";
}

export function hitungFactScore(masukan: MasukanFactScore): HasilFactScore {
  const jumlahKlaim = Math.max(0, Math.floor(masukan.jumlahKlaim));
  if (jumlahKlaim === 0) {
    return {
      skor: null,
      label: null,
      komponen: { independen: 0, kredibilitas: 0, konsistensi: 0, koreksi: 0 },
      dinilai: false,
      alasanTidakDinilai:
        "Belum dinilai — belum ada klaim terverifikasi yang bisa dinilai",
    };
  }

  const n = Math.max(0, Math.floor(masukan.jumlahAkarPendukung));
  const s =
    masukan.skorKredibilitasTertinggi === null
      ? 0
      : Math.max(0, masukan.skorKredibilitasTertinggi);
  const kd = Math.min(
    jumlahKlaim,
    Math.max(0, Math.floor(masukan.jumlahKlaimDidukungTanpaMenentang)),
  );
  const t = Math.max(0, Math.floor(masukan.laporanKoreksiTerbuka));

  const komponen: KomponenFactScore = {
    independen: (Math.min(n, 3) / 3) * 40,
    kredibilitas: s === 0 ? 0 : (s / 90) * 30,
    konsistensi: (kd / jumlahKlaim) * 20,
    koreksi: Math.max(0, 10 - 5 * t),
  };
  const skor = Math.round(
    komponen.independen +
      komponen.kredibilitas +
      komponen.konsistensi +
      komponen.koreksi,
  );
  return { skor, label: labelFactScore(skor), komponen, dinilai: true };
}
