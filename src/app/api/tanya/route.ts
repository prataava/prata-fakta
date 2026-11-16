import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";

// POST /api/tanya — tanya jawab berbasis data yang sudah ada.
// Body: { pertanyaan }
// Jawaban EKSTRAKTIF saja: kata kunci pertanyaan dicari di korpus
// PRATA FAKTA — artikel terbit (pf_articles), artikel pengetahuan
// terbit (pf_knowledge_articles), indikator data
// (pf_data_indicators + nilai terakhir pf_data_points), peristiwa
// (pf_events), dan profil negara (pf_countries, nama + fakta
// kunci). Setiap klaim jawaban WAJIB menunjuk referensinya; bila
// tidak ada referensi yang cocok, pertanyaan disimpan berstatus
// 'tidak_ada_data' dan dijawab jujur bahwa belum ada data yang
// bisa menjawab — TIDAK PERNAH mengarang. Antrean editor
// (/admin/tanya) mencakup 'menunggu' DAN 'tidak_ada_data'.
// Pertanyaan disimpan dengan kategori (klasifikasi kata kunci)
// + publik=false (default; staf yang menandai publik).
// Boleh anonim; bila login, pertanyaan tercatat di akun pengguna.
// Rate limit 5 request/menit (limiter database lintas instance,
// Tahap 13A, T3 — menggantikan Map in-memory per instance).
// GET /api/tanya → daftar pertanyaan saya (wajib login, 401 bila tidak).
// 503 jujur bila tabel pf_questions belum ada (migrasi v6 belum dijalankan).
// T5 (Fase 8 Gelombang 1): INSERT pertanyaan via service role —
// policy INSERT anonim "pf_questions tambah publik" DICABUT di
// migrasi v8. Pencarian kandidat + identitas pengguna tetap via
// session client. 503 jujur bila service key belum diatur.
const batasi = buatRateLimiterKeras(5);

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

const JAWABAN_KOSONG =
  "Belum ada data di PRATA FAKTA yang bisa menjawab pertanyaan ini. " +
  "Pertanyaanmu masuk antrean untuk dijawab editor/Muse.";

export type ReferensiJawaban = {
  judul: string;
  /** null bila korpusnya belum punya halaman khusus (mis. profil
   *  negara — halaman /negara belum dibangun area lain). */
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
          // Belum ada halaman /negara (area 11, gelombang lain):
          // referensi menunjuk nama negaranya tanpa tautan.
          null,
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

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  let body: { pertanyaan?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const pertanyaan =
    typeof body.pertanyaan === "string" ? body.pertanyaan.trim() : "";
  if (!pertanyaan || pertanyaan.length > 500) {
    return NextResponse.json(
      { ok: false, error: "Pertanyaan wajib diisi (maksimal 500 karakter)." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  let penggunaId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }

  const kata = kataKunci(pertanyaan);
  const kandidat = kata.length > 0 ? await cariKandidat(supabase, kata) : [];
  const kategori = kategoriPertanyaan(pertanyaan);

  let jawaban: string;
  let referensi: ReferensiJawaban[];
  let status: "terjawab" | "tidak_ada_data";
  if (kandidat.length > 0) {
    const terbaik = kandidat[0];
    jawaban =
      terbaik.ringkasan && terbaik.ringkasan.trim()
        ? terbaik.ringkasan
        : terbaik.judul;
    referensi = kandidat.map((k) => ({
      judul: k.judul,
      url: k.url,
    }));
    status = "terjawab";
  } else {
    jawaban = JAWABAN_KOSONG;
    referensi = [];
    status = "tidak_ada_data";
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan tanya belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { data: tersimpan, error } = await service
    .from("pf_questions")
    .insert({
      user_id: penggunaId,
      pertanyaan,
      jawaban,
      referensi,
      status,
      kategori,
      publik: false,
      dijawab_pada: status === "terjawab" ? new Date().toISOString() : null,
    })
    .select("id, status, dibuat_pada")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan tanya belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 6 dijalankan.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: (tersimpan as { id: string } | null)?.id ?? null,
    status,
    jawaban,
    referensi,
  });
}

export async function GET() {
  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat riwayat pertanyaan Anda." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, penggunaId);
  if (ditolak) return ditolak;
  const { data, error } = await supabase
    .from("pf_questions")
    .select(
      "id, user_id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu, dibuat_pada, dijawab_pada",
    )
    .eq("user_id", penggunaId)
    .order("dibuat_pada", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan tanya belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 6 dijalankan.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, pertanyaan: data ?? [] });
}
