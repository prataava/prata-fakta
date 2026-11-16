import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  cekOrigin,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import {
  cariKandidat,
  kataKunci,
  kategoriPertanyaan,
  type ReferensiJawaban,
} from "@/lib/tanya/retrieval";

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
// Retrieval (kataKunci/kategoriPertanyaan/cariKandidat) tinggal
// di src/lib/tanya/retrieval.ts (follow-up 5/6) — dipakai ulang
// route ini dan job draf (/api/tanya/draf).
const batasi = buatRateLimiterKeras(5);

const JAWABAN_KOSONG =
  "Belum ada data di PRATA FAKTA yang bisa menjawab pertanyaan ini. " +
  "Pertanyaanmu masuk antrean untuk dijawab editor/Muse.";

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

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
