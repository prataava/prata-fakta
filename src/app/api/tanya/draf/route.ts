// POST /api/tanya/draf — job penjawab DRAF Ask the World (B2-E, F1).
// Dipicu workflow .github/workflows/tanya-jawab-draf.yml (jadwal +
// dispatch manual) atau sesi login super_admin/editor.
//
// Untuk tiap pertanyaan berstatus 'menunggu' (tanpa draf sebelumnya):
// retrieval yang sama dengan POST /api/tanya (cariKandidat) dicari
// di basis pengetahuan; bila ada referensi yang cukup, DRAF jawaban
// ekstraktif disimpan di kolom jawaban_draf / referensi_draf /
// draf_dibuat_pada — TERPISAH dari jawaban resmi. Bila tidak ada
// referensi yang cukup, draf TIDAK dibuat (dihitung tidak_ada_data,
// pertanyaan dibiarkan 'menunggu' untuk editor).
//
// LARANGAN KERAS — dilarang keras auto-publish:
// - Route ini TIDAK PERNAH menulis kolom jawaban / referensi,
//   TIDAK PERNAH mengubah status, TIDAK PERNAH mengubah publik.
//   Status tetap 'menunggu', publik tetap false. Draf hanya menjadi
//   jawaban resmi bila editor menyetujui lewat
//   PATCH /api/admin/tanya/[id] { aksi_draf: "setujui" }.
// - Batas pertanyaan per pengguna + moderasi tetap berlaku: job
//   ini hanya memproses antrean 'menunggu' yang sudah lolos rate
//   limit + moderasi saat pertanyaan dibuat (POST /api/tanya).
// - Tanpa LLM eksternal; draf deterministik dari referensi yang ada.
// Autentikasi dua jalur (sama seperti /api/ai/jalankan):
//   (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//   (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { limit? } — dibatasi 1..20 (bawaan 10).
// 503 jujur bila service key belum diatur / tabel v6+v14 belum ada.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  autentikasiPemicuAi,
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { cariKandidat, kataKunci } from "@/app/api/tanya/route";
import {
  BATAS_DRAF_PER_RUN,
  BATAS_DRAF_PER_RUN_MAKS,
  susunDrafJawaban,
} from "@/lib/ai/tanya-draf";

const lolosRateLimit = buatRateLimiterKeras(10);

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  const auth = await autentikasiPemicuAi(req);
  if (!auth.ok) return auth.respon;

  let body: { limit?: unknown } = {};
  try {
    const teks = await req.text();
    if (teks.trim()) body = JSON.parse(teks) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const limitMentah =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.floor(body.limit)
      : BATAS_DRAF_PER_RUN;
  const limit = Math.min(
    BATAS_DRAF_PER_RUN_MAKS,
    Math.max(1, limitMentah),
  );

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

  const { data: antrean, error: errAntrean } = await service
    .from("pf_questions")
    .select("id, pertanyaan")
    .eq("status", "menunggu")
    .is("jawaban_draf", null)
    .order("dibuat_pada", { ascending: true })
    .limit(limit);
  if (errAntrean) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan tanya belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v6 + v14 dijalankan.",
      },
      { status: 503 },
    );
  }

  let drafDibuat = 0;
  let tidakAdaData = 0;
  let gagal = 0;
  for (const q of (antrean ?? []) as {
    id: string;
    pertanyaan: string;
  }[]) {
    try {
      const kata = kataKunci(q.pertanyaan);
      const kandidat =
        kata.length > 0 ? await cariKandidat(service, kata) : [];
      const hasil = susunDrafJawaban(kandidat);
      if (!hasil.dibuat) {
        tidakAdaData += 1;
        continue;
      }
      // HANYA kolom draf yang ditulis — jawaban/status/publik
      // TIDAK PERNAH disentuh di sini (anti auto-publish).
      const { error: errSimpan } = await service
        .from("pf_questions")
        .update({
          jawaban_draf: hasil.draf,
          referensi_draf: hasil.referensi,
          draf_dibuat_pada: new Date().toISOString(),
        })
        .eq("id", q.id)
        .eq("status", "menunggu");
      if (errSimpan) throw errSimpan;
      drafDibuat += 1;
    } catch (err) {
      console.error(
        "[tanya/draf] gagal membuat draf.",
        { pertanyaan_id: q.id },
        err,
      );
      gagal += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    diproses: (antrean ?? []).length,
    draf_dibuat: drafDibuat,
    tidak_ada_data: tidakAdaData,
    gagal,
  });
}
