// Glosarium — bagian MURNI (aman diimpor komponen klien).
// TIDAK BOLEH mengimpor apa pun dari lib/ yang menyentuh server
// (supabase/server, lanjutan, explainer): impor server di sini
// membuat next build gagal ("next/headers hanya di Server
// Components") lewat rantai GlosariumInteraktif → glosarium.
// Semua yang butuh DB tinggal di src/lib/glosarium.ts.
export type KategoriGlosarium =
  | "Hukum & Pemerintahan"
  | "Ekonomi"
  | "Sosial & Budaya"
  | "Pengetahuan";

export type SumberGlosarium = "v82" | "pengetahuan";

export type EntriGlosarium = {
  istilah: string;
  /** Arti v82 bila ada; definisi artikel pengetahuan bila hanya di
   *  sana; null bila artikel sumber tidak menulis definisi. */
  arti: string | null;
  konteks: string | null;
  kategori: KategoriGlosarium;
  sumber: SumberGlosarium[];
  /** Slug artikel pengetahuan asal (bisa lebih dari satu). */
  tautanPengetahuan: string[];
};

export type IstilahPengetahuan = {
  istilah: string;
  definisi: string | null;
  slug: string;
  judulArtikel: string;
};

/** Normalisasi kunci dedup: huruf kecil, spasi berlebih dibuang. */
export function normalisasiIstilah(istilah: string): string {
  return istilah.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Deep link ke entri resmi KBBI saja — isi KBBI tidak pernah
 *  disalin atau di-fetch. Kata di-lowercase sesuai pola URL entri. */
export function tautanKbbi(istilah: string): string {
  return `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(
    normalisasiIstilah(istilah),
  )}`;
}

/**
 * Gabung v82 + istilah pengetahuan (fungsi murni, bisa diuji tanpa
 * database). Urutan hasil: alfabetis (id-ID). Bila istilah sama di
 * dua sumber: satu entri, sumber ["v82", "pengetahuan"], arti +
 * konteks + kategori dari v82, tautan artikel tetap dicatat.
 * Bila istilah sama di beberapa artikel: semua slug dicatat.
 */
export function gabungGlosarium(
  v82: { istilah: string; arti: string; konteks: string; kategori: string }[],
  pengetahuan: IstilahPengetahuan[],
): EntriGlosarium[] {
  const peta = new Map<string, EntriGlosarium>();
  for (const e of v82) {
    const kunci = normalisasiIstilah(e.istilah);
    if (!kunci || peta.has(kunci)) continue;
    peta.set(kunci, {
      istilah: e.istilah.trim(),
      arti: e.arti,
      konteks: e.konteks,
      kategori: e.kategori as KategoriGlosarium,
      sumber: ["v82"],
      tautanPengetahuan: [],
    });
  }
  for (const t of pengetahuan) {
    const kunci = normalisasiIstilah(t.istilah);
    if (!kunci) continue;
    const lama = peta.get(kunci);
    if (lama) {
      if (!lama.sumber.includes("pengetahuan")) {
        lama.sumber.push("pengetahuan");
      }
      if (!lama.tautanPengetahuan.includes(t.slug)) {
        lama.tautanPengetahuan.push(t.slug);
      }
      continue;
    }
    peta.set(kunci, {
      istilah: t.istilah.trim(),
      arti: t.definisi,
      konteks: `Dari artikel pengetahuan "${t.judulArtikel}".`,
      kategori: "Pengetahuan",
      sumber: ["pengetahuan"],
      tautanPengetahuan: [t.slug],
    });
  }
  return [...peta.values()].sort((a, b) =>
    a.istilah.localeCompare(b.istilah, "id-ID"),
  );
}
