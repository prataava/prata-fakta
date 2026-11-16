// Retrieval Ask the World (Area 5) — dipindah dari
// src/app/api/tanya/route.ts (follow-up 5/6, F10): fungsi
// pencarian kandidat + klasifikasi pertanyaan hidup di lib
// agar dipakai ulang route /api/tanya, job draf
// (/api/tanya/draf), dan baterai — tanpa duplikasi.
// Perilaku IDENTIK dengan versi route.ts, kecuali kandidat
// negara kini menautkan /negara/[kode] (halaman itu sudah
// ada; komentar usang yang mengklaim sebaliknya dihapus).
import type { createClient } from "@/lib/supabase/server";

const STOPWORDS = new Set([
  "yang", "dan", "atau", "dengan", "untuk", "dari", "adalah", "ini", "itu",
  "pada", "sebagai", "juga", "dalam", "akan", "bisa", "tidak", "ada",
  "oleh", "karena", "saat", "ketika", "agar", "jika", "kalau", "apa",
  "bagaimana", "siapa", "dimana", "kapan", "berapa", "mengapa", "apakah",
  "saya", "kami", "kita", "mereka", "beliau", "tersebut", "sudah", "telah",
  "sedang", "masih", "hanya", "saja", "lebih", "paling", "sangat", "bukan",
  "bila", "supaya", "serta", "antara", "tentang", "seperti", "ialah",
  "merupakan", "yakni", "yaitu", "hal", "cara", "arti", "maksud", "tolong",
  "mohon", "kenapa", "kegunaan", "manfaat",
]);

/** Kata kunci dari pertanyaan: token huruf ≥4, tanpa stopwords. */
export function kataKunci(pertanyaan: string): string[] {
  const token = pertanyaan
    .toLowerCase()
    .split(/[^a-z\u00c0-\u024f]+/u)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  return [...new Set(token)].slice(0, 6);
}

// Klasifikasi kategori pertanyaan dari kata kunci (murni,
// deterministik — diekspos untuk uji). Urutan penting: ekonomi
// dulu (kata data paling spesifik), lalu teknologi, sains, dunia,
// indonesia; selebihnya 'umum'.
const KATA_KATEGORI: { kategori: string; kata: string[] }[] = [
  {
    kategori: "ekonomi",
    kata: ["penduduk", "inflasi", "ekonomi", "harga", "upah", "gaji", "kemiskinan", "pengangguran", "ekspor", "impor", "utang", "apbn", "pajak", "investasi", "pertumbuhan"],
  },
  {
    kategori: "teknologi",
    kata: ["teknologi", "internet", "kecerdasan", "komputer", "digital", "robot", "satelit"],
  },
  {
    kategori: "sains",
    kata: ["sains", "ilmiah", "penelitian", "hewan", "tumbuhan", "bumi", "iklim", "angkasa", "fosil", "evolusi"],
  },
  {
    kategori: "dunia",
    kata: ["negara", "dunia", "presiden", "perang", "asean", "amerika", "tiongkok", "eropa", "afrik", "perdamaian"],
  },
  {
    kategori: "indonesia",
    kata: ["indonesia", "jakarta", "pemerintah", "pemilu", "nusantara", "jawa", "sumatera", "kalimantan", "sulawesi", "papua"],
  },
];

export function kategoriPertanyaan(pertanyaan: string): string {
  const rendah = pertanyaan.toLowerCase();
  for (const { kategori, kata } of KATA_KATEGORI) {
    if (kata.some((k) => rendah.includes(k))) return kategori;
  }
  return "umum";
}

export type ReferensiJawaban = {
  judul: string;
  /** Tautan halaman referensi; null hanya bila korpusnya belum
   *  punya halaman khusus (saat ini semua kandidat punya url). */
  url: string | null;
};

export type Kandidat = {
  judul: string;
  ringkasan: string | null;
  url: string | null;
  skor: number;
};

function bersihkanPola(s: string): string {
  return s.replace(/[%_]/g, "");
}

function formatAngka(n: number): string {
  return n.toLocaleString("id-ID");
}

// Diekspor untuk job draf (POST /api/tanya/draf, B2-E F1) —
// retrieval yang sama dipakai ulang, bukan diduplikasi.
export async function cariKandidat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kata: string[],
): Promise<Kandidat[]> {
  const peta = new Map<string, Kandidat>();
  const pola = (k: string) => `%${bersihkanPola(k)}%`;
  const catat = (kunciMap: string, judul: string, ringkasan: string | null, url: string | null, skor: number) => {
    const lama = peta.get(kunciMap);
    if (lama) lama.skor += skor;
    else peta.set(kunciMap, { judul, ringkasan, url, skor });
  };
  // P2-11 (B-S3): indikator dikumpulkan dulu TANPA nilai —
  // nilai terakhir SEMUA indikator diambil dalam SATU query
  // sesudah loop kata kunci (bukan satu query per indikator
  // per kata kunci).
  const indikatorDitemukan = new Map<
    string,
    { nama: string; slug: string; satuan: string | null; sumber_nama: string; skor: number }
  >();

  for (const k of kata) {
    const [art, png, ind, evt, neg] = await Promise.all([
      supabase
        .from("pf_articles")
        .select("slug, judul, ringkasan")
        .eq("status", "terbit")
        .or(`judul.ilike.${pola(k)},ringkasan.ilike.${pola(k)},isi.ilike.${pola(k)}`)
        .limit(10),
      supabase
        .from("pf_knowledge_articles")
        .select("slug, judul, ringkasan")
        .eq("status", "terbit")
        .or(`judul.ilike.${pola(k)},ringkasan.ilike.${pola(k)},isi.ilike.${pola(k)}`)
        .limit(10),
      supabase
        .from("pf_data_indicators")
        .select("id, nama, slug, satuan, sumber_nama")
        .or(`nama.ilike.${pola(k)},slug.ilike.${pola(k)}`)
        .limit(5),
      supabase
        .from("pf_events")
        .select("id, judul, ringkasan")
        .or(`judul.ilike.${pola(k)},ringkasan.ilike.${pola(k)}`)
        .limit(5),
      supabase
        .from("pf_countries")
        .select("kode, nama, ibu_kota, populasi, pdb, sistem_pemerintahan, sumber, periode_referensi")
        .or(`nama.ilike.${pola(k)},kode.ilike.${pola(k)}`)
        .limit(5),
    ]);
    if (!art.error && art.data) {
      for (const r of art.data as { slug: string; judul: string; ringkasan: string | null }[]) {
        const rendah = `${r.judul} ${r.ringkasan ?? ""}`.toLowerCase();
        catat(`artikel:${r.slug}`, r.judul, r.ringkasan, `/artikel/${r.slug}`, rendah.includes(k) ? 3 : 1);
      }
    }
    if (!png.error && png.data) {
      for (const r of png.data as { slug: string; judul: string; ringkasan: string | null }[]) {
        const rendah = `${r.judul} ${r.ringkasan ?? ""}`.toLowerCase();
        catat(`pengetahuan:${r.slug}`, r.judul, r.ringkasan, `/pengetahuan/${r.slug}`, rendah.includes(k) ? 3 : 1);
      }
    }
    if (!ind.error && ind.data) {
      for (const r of ind.data as { id: string; nama: string; slug: string; satuan: string | null; sumber_nama: string }[]) {
        // Nilai terakhir diambil SESUDAH loop (satu query
        // in("indikator_id", ids) untuk semua indikator).
        const skor = r.nama.toLowerCase().includes(k) ? 3 : 1;
        const lama = indikatorDitemukan.get(r.id);
        if (lama) {
          lama.skor += skor;
        } else {
          indikatorDitemukan.set(r.id, {
            nama: r.nama,
            slug: r.slug,
            satuan: r.satuan,
            sumber_nama: r.sumber_nama,
            skor,
          });
        }
      }
    }
    if (!evt.error && evt.data) {
      for (const r of evt.data as { id: string; judul: string; ringkasan: string | null }[]) {
        const rendah = `${r.judul} ${r.ringkasan ?? ""}`.toLowerCase();
        catat(`event:${r.id}`, r.judul, r.ringkasan, "/timeline", rendah.includes(k) ? 3 : 1);
      }
    }
    if (!neg.error && neg.data) {
      for (const r of neg.data as {
        kode: string; nama: string; ibu_kota: string | null; populasi: number | null;
        pdb: number | null; sistem_pemerintahan: string | null;
        sumber: string | null; periode_referensi: string | null;
      }[]) {
        const fakta: string[] = [];
        if (r.ibu_kota) fakta.push(`Ibu kota: ${r.ibu_kota}`);
        if (r.populasi !== null) fakta.push(`Populasi: ${formatAngka(r.populasi)}`);
        if (r.pdb !== null) fakta.push(`PDB: ${formatAngka(r.pdb)}`);
        if (r.sistem_pemerintahan) fakta.push(`Sistem pemerintahan: ${r.sistem_pemerintahan}`);
        if (r.sumber) fakta.push(`Sumber: ${r.sumber}${r.periode_referensi ? ` (${r.periode_referensi})` : ""}`);
        catat(
          `negara:${r.kode}`,
          `${r.nama} — profil negara`,
          fakta.length > 0 ? fakta.join(". ") + "." : null,
          `/negara/${r.kode}`,
          r.nama.toLowerCase().includes(k) ? 3 : 1,
        );
      }
    }
  }

  // P2-11 (B-S3): SATU query titik data untuk semua indikator
  // yang ditemukan, terbaru per indikator dipilih di memori
  // (baris terurut tanggal menurun — kemunculan pertama per
  // indikator adalah yang terbaru). Batas 500 baris: deret
  // harian satu indikator jarang melebihi itu dalam konteks
  // retrieval; bila terlampaui, indikator tetap jadi kandidat
  // tanpa nilai (bukan galat).
  if (indikatorDitemukan.size > 0) {
    const ids = [...indikatorDitemukan.keys()];
    const terbaru = new Map<string, { tanggal: string; nilai: number | string }>();
    try {
      const { data: poin, error: errPoin } = await supabase
        .from("pf_data_points")
        .select("indikator_id, tanggal, nilai")
        .in("indikator_id", ids)
        .order("tanggal", { ascending: false })
        .limit(500);
      if (!errPoin && poin) {
        for (const p of poin as { indikator_id: string; tanggal: string; nilai: number | string }[]) {
          if (!terbaru.has(p.indikator_id)) {
            terbaru.set(p.indikator_id, { tanggal: p.tanggal, nilai: p.nilai });
          }
        }
      }
    } catch (err) {
      // Poin gagal dibaca: kandidat tetap tampil tanpa nilai.
      console.error("[baca] cariKandidat: gagal membaca pf_data_points.", err);
    }
    for (const [id, r] of indikatorDitemukan) {
      const poin = terbaru.get(id);
      const nilaiTeks = poin
        ? `Nilai terakhir: ${formatAngka(Number(poin.nilai))}${r.satuan ? ` ${r.satuan}` : ""} (per ${poin.tanggal}). `
        : "";
      catat(
        `indikator:${r.slug}`,
        r.nama,
        `${nilaiTeks}Sumber: ${r.sumber_nama}.`,
        "/data",
        r.skor,
      );
    }
  }
  return [...peta.values()]
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 3);
}
