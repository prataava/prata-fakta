// Audience Intelligence (v29) — agregasi baca HANYA-BACA untuk
// /admin/audiens. Semua fungsi di sini MURNI (tanpa I/O) agar
// bisa diuji baterai tanpa database produksi.
//   - TIDAK ADA data per-pengguna: halaman audiens TIDAK PERNAH
//     memilih kolom user_id (bahkan untuk "pembaca unik" — angka
//     itu sudah ada di /admin/kinerja). Setiap baris
//     pf_user_preferences adalah satu pengguna, jadi menghitung
//     baris yang menyimpan suatu istilah = menghitung pengguna
//     yang menyimpan istilah itu, tanpa membaca pengenal siapa
//     pun.
//   - Kolom `selesai` pf_reading_history ditampilkan APA ADANYA
//     (hitungan selesai / total) dengan catatan jujur bahwa arti
//     persisnya masih keputusan terbuka (KEPUTUSAN-TERBUKA-V27
//     §7) — TIDAK ditafsirkan ulang di sini.
//   - Jendela 30 hari dihitung dari dibaca_pada (WIB); baris
//     tanpa dibaca_pada tidak masuk agregat berjendela.
export interface BarisBacaAudiens {
  artikel_id: string;
  dibaca_pada: string | null;
  durasi_detik: number | null;
  selesai: boolean;
}

export interface AgregatKategori {
  kategori: string;
  dibaca: number;
}

export interface AgregatHarian {
  tanggal: string;
  dibaca: number;
}

export interface AgregatDurasiArtikel {
  artikel_id: string;
  rata_rata_detik: number;
  dibaca: number;
}

export interface AgregatDurasi {
  /** Rata-rata durasi (detik) dari semua pembacaan yang punya
   *  durasi_detik; null bila tidak ada satu pun. */
  rata_rata_detik: number | null;
  /** Jumlah pembacaan yang punya durasi_detik. */
  dengan_durasi: number;
  /** Artikel teratas menurut rata-rata durasi (min. 3
   *  pembacaan berdurasi, agar 1 pembacaan panjang tidak
   *  mendominasi). */
  per_artikel: AgregatDurasiArtikel[];
}

export interface AgregatPencarian {
  istilah: string;
  /** Jumlah pengguna (baris preferensi) yang menyimpan istilah. */
  pengguna: number;
}

/** Tanggal WIB (YYYY-MM-DD) dari sebuah timestamptz. */
export function tanggalWib(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Baris-baris yang dibaca_pada-nya berada dalam jendela
 *  `hari` terakhir (relatif terhadap `sekarang`, bawaan saat
 *  ini). Baris tanpa dibaca_pada dikeluarkan. */
export function saringJendela(
  baris: BarisBacaAudiens[],
  hari: number,
  sekarang: number = Date.now(),
): BarisBacaAudiens[] {
  const batas = sekarang - hari * 24 * 60 * 60 * 1000;
  return baris.filter((b) => {
    if (!b.dibaca_pada) return false;
    const t = Date.parse(b.dibaca_pada);
    return Number.isFinite(t) && t >= batas && t <= sekarang;
  });
}

/** Kategori paling dibaca (dari peta artikel_id -> kategori_slug;
 * artikel tanpa kategori dikelompokkan "(tanpa kategori)").
 * Diurutkan terbanyak dulu, maks `limit` (bawaan 10). */
export function agregatKategori(
  baris: BarisBacaAudiens[],
  kategoriPerArtikel: Map<string, string | null>,
  limit: number = 10,
): AgregatKategori[] {
  const hitung = new Map<string, number>();
  for (const b of baris) {
    const k = kategoriPerArtikel.get(b.artikel_id) ?? "(tanpa kategori)";
    hitung.set(k, (hitung.get(k) ?? 0) + 1);
  }
  return [...hitung.entries()]
    .map(([kategori, dibaca]) => ({ kategori, dibaca }))
    .sort((a, b) => b.dibaca - a.dibaca)
    .slice(0, limit);
}

/** Tren baca harian (jumlah pembacaan per tanggal WIB) dalam
 *  jendela `hari` terakhir — termasuk tanggal tanpa pembacaan
 *  (0), diurutkan tanggal naik. */
export function agregatHarian(
  baris: BarisBacaAudiens[],
  hari: number = 30,
  sekarang: number = Date.now(),
): AgregatHarian[] {
  const peta = new Map<string, number>();
  for (let i = hari - 1; i >= 0; i--) {
    const t = tanggalWib(
      new Date(sekarang - i * 24 * 60 * 60 * 1000).toISOString(),
    );
    peta.set(t, 0);
  }
  for (const b of baris) {
    if (!b.dibaca_pada) continue;
    const t = tanggalWib(b.dibaca_pada);
    if (peta.has(t)) peta.set(t, (peta.get(t) ?? 0) + 1);
  }
  return [...peta.entries()].map(([tanggal, dibaca]) => ({
    tanggal,
    dibaca,
  }));
}

/** Durasi baca: rata-rata keseluruhan + per artikel (min.
 *  `minBaca` pembacaan berdurasi per artikel, bawaan 3).
 *  durasi_detik null/negatif diabaikan. */
export function agregatDurasi(
  baris: BarisBacaAudiens[],
  minBaca: number = 3,
  limit: number = 10,
): AgregatDurasi {
  let jumlah = 0;
  let total = 0;
  const perArtikel = new Map<
    string,
    { jumlah: number; total: number }
  >();
  for (const b of baris) {
    if (typeof b.durasi_detik !== "number" || b.durasi_detik < 0) {
      continue;
    }
    jumlah += 1;
    total += b.durasi_detik;
    const d = perArtikel.get(b.artikel_id) ?? { jumlah: 0, total: 0 };
    d.jumlah += 1;
    d.total += b.durasi_detik;
    perArtikel.set(b.artikel_id, d);
  }
  const per_artikel = [...perArtikel.entries()]
    .filter(([, d]) => d.jumlah >= minBaca)
    .map(([artikel_id, d]) => ({
      artikel_id,
      rata_rata_detik: Math.round(d.total / d.jumlah),
      dibaca: d.jumlah,
    }))
    .sort((a, b) => b.rata_rata_detik - a.rata_rata_detik)
    .slice(0, limit);
  return {
    rata_rata_detik: jumlah > 0 ? Math.round(total / jumlah) : null,
    dengan_durasi: jumlah,
    per_artikel,
  };
}

/** Istilah pencarian teratas dari kolom pencarian_tersimpan
 *  (jsonb) pf_user_preferences — satu baris = satu pengguna.
 *  Entri valid: {q: string tak-kosong} (bentuk yang ditulis
 *  route /api/saya/pencarian-tersimpan + perpustakaan.ts).
 *  Istilah dinormalisasi (trim + huruf kecil); dihitung SEKALI
 *  per pengguna bila pengguna menyimpan istilah yang sama
 *  berkali-kali. Diurutkan terbanyak dulu, maks `limit`. */
export function agregatPencarian(
  preferensi: unknown[],
  limit: number = 20,
): AgregatPencarian[] {
  const hitung = new Map<string, number>();
  for (const row of preferensi) {
    const daftar = (row as { pencarian_tersimpan?: unknown })
      ?.pencarian_tersimpan;
    if (!Array.isArray(daftar)) continue;
    const istilahPengguna = new Set<string>();
    for (const e of daftar) {
      const q = (e as { q?: unknown })?.q;
      if (typeof q !== "string") continue;
      const istilah = q.trim().toLowerCase();
      if (istilah) istilahPengguna.add(istilah);
    }
    for (const istilah of istilahPengguna) {
      hitung.set(istilah, (hitung.get(istilah) ?? 0) + 1);
    }
  }
  return [...hitung.entries()]
    .map(([istilah, pengguna]) => ({ istilah, pengguna }))
    .sort((a, b) => b.pengguna - a.pengguna)
    .slice(0, limit);
}
