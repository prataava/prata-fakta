import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/tanya — tanya jawab berbasis data yang sudah ada.
// Body: { pertanyaan }
// Jawaban EKSTRAKTIF saja: kata kunci pertanyaan dicari di artikel
// terbit (pf_articles) dan artikel pengetahuan terbit
// (pf_knowledge_articles). Bila ada yang cocok, jawaban = ringkasan
// artikel terbaik + daftar referensi yang bisa dibuka. Bila tidak
// ada, pertanyaan disimpan berstatus 'menunggu' dan dijawab jujur
// bahwa belum ada data yang bisa menjawab — TIDAK PERNAH mengarang.
// Boleh anonim; bila login, pertanyaan tercatat di akun pengguna.
// Rate limit 5 request/menit/IP (pola /api/laporan).
// GET /api/tanya → daftar pertanyaan saya (wajib login, 401 bila tidak).
// 503 jujur bila tabel pf_questions belum ada (migrasi v6 belum dijalankan).
const BATAS = 5;
const JENDELA_MS = 60_000;
const hitungan = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(ip: string): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= BATAS) return false;
  entri.n += 1;
  return true;
}

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

const JAWABAN_KOSONG =
  "Belum ada data di PRATA FAKTA yang bisa menjawab pertanyaan ini. " +
  "Pertanyaanmu masuk antrean untuk dijawab editor/Muse.";

type Kandidat = {
  judul: string;
  ringkasan: string | null;
  slug: string;
  sumber: "artikel" | "pengetahuan";
  skor: number;
};

function bersihkanPola(s: string): string {
  return s.replace(/[%_]/g, "");
}

async function cariKandidat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kata: string[],
): Promise<Kandidat[]> {
  const peta = new Map<string, Kandidat>();
  const pola = (k: string) => `%${bersihkanPola(k)}%`;

  for (const k of kata) {
    const [art, png] = await Promise.all([
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
    ]);
    const catat = (
      baris: { slug: string; judul: string; ringkasan: string | null }[],
      sumber: "artikel" | "pengetahuan",
    ) => {
      for (const r of baris) {
        const kunciMap = `${sumber}:${r.slug}`;
        const rendah = `${r.judul} ${r.ringkasan ?? ""}`.toLowerCase();
        const skor = rendah.includes(k) ? 3 : 1;
        const lama = peta.get(kunciMap);
        if (lama) lama.skor += skor;
        else
          peta.set(kunciMap, {
            judul: r.judul,
            ringkasan: r.ringkasan,
            slug: r.slug,
            sumber,
            skor,
          });
      }
    };
    if (!art.error && art.data) {
      catat(
        art.data as { slug: string; judul: string; ringkasan: string | null }[],
        "artikel",
      );
    }
    if (!png.error && png.data) {
      catat(
        png.data as { slug: string; judul: string; ringkasan: string | null }[],
        "pengetahuan",
      );
    }
  }
  return [...peta.values()]
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 3);
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

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

  let jawaban: string;
  let referensi: { judul: string; url: string }[];
  let status: "terjawab" | "menunggu";
  if (kandidat.length > 0) {
    const terbaik = kandidat[0];
    jawaban =
      terbaik.ringkasan && terbaik.ringkasan.trim()
        ? terbaik.ringkasan
        : terbaik.judul;
    referensi = kandidat.map((k) => ({
      judul: k.judul,
      url:
        k.sumber === "artikel"
          ? `/artikel/${k.slug}`
          : `/pengetahuan/${k.slug}`,
    }));
    status = "terjawab";
  } else {
    jawaban = JAWABAN_KOSONG;
    referensi = [];
    status = "menunggu";
  }

  const { data: tersimpan, error } = await supabase
    .from("pf_questions")
    .insert({
      user_id: penggunaId,
      pertanyaan,
      jawaban,
      referensi,
      status,
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
  const { data, error } = await supabase
    .from("pf_questions")
    .select(
      "id, user_id, pertanyaan, jawaban, referensi, status, dibuat_pada, dijawab_pada",
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
