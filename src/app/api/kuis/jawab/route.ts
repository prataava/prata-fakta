import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// POST /api/kuis/jawab — periksa satu jawaban kuis di server.
// Body: { soal_id: UUID, jawaban: 0..4 }
// Jawaban: { ok, benar, kunci, penjelasan, sumber_url, sumber_nama }.
// Perbaikan T1 audit keamanan Fase 7: sebelumnya kunci jawaban
// kuis (pf_quiz_questions.kunci) ikut terkirim ke browser bersama
// soal — siapa pun bisa mengunduh semua kunci tanpa bermain.
// Sekarang kunci TIDAK PERNAH dikirim ke klien sebelum menjawab:
// klien hanya mengirim pilihan, server yang memeriksa dan
// mengembalikan kunci soal ITU SAJA sesudah dijawab (pengguna
// memang melihat kunci sesudah menjawab — itu perilaku kuis yang
// benar). Pengambilan massal kunci tanpa bermain menjadi tidak
// mungkin. Rate limit 20/menit (limiter database lintas instance,
// Tahap 13A, T3; 5 soal + main ulang).
// Boleh anonim (kuis bersifat publik). 503 jujur bila tabel belum
// ada; 404 bila soal tidak ada atau bukan kuis hari ini/kemarin.
// P0-4 (B-T3, v13): kunci PINDAH ke tabel pf_quiz_answers
// (tanpa policy SELECT; hanya service role) — kolom kunci di
// pf_quiz_questions SUDAH DIHAPUS. Route ini membaca soal TANPA
// kunci, lalu kunci dari pf_quiz_answers via service role.
// 503 jujur bila service key belum diatur.
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const batasi = buatRateLimiterKeras(20);

/** Validasi murni body permintaan (diekspos untuk uji). */
export function validasiJawabanKuis(
  body: unknown,
):
  | { ok: true; soalId: string; jawaban: number }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Isi permintaan tidak valid." };
  }
  const { soal_id, jawaban } = body as Record<string, unknown>;
  if (typeof soal_id !== "string" || !POLA_UUID.test(soal_id)) {
    return { ok: false, error: "soal_id tidak valid." };
  }
  if (
    typeof jawaban !== "number" ||
    !Number.isInteger(jawaban) ||
    jawaban < 0 ||
    jawaban > 4
  ) {
    return { ok: false, error: "Jawaban harus bilangan bulat 0 sampai 4." };
  }
  return { ok: true, soalId: soal_id, jawaban };
}

function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function kemarinWib(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const valid = validasiJawabanKuis(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan kuis belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { data, error } = await service
    .from("pf_quiz_questions")
    .select("id, tanggal, penjelasan, sumber_url, sumber_nama")
    .eq("id", valid.soalId)
    .maybeSingle();
  if (error) {
    const kode = (error as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan kuis belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/kuis/jawab", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa jawaban. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan." },
      { status: 404 },
    );
  }
  // Kunci dibaca dari pf_quiz_answers (v13, P0-4) — tabel tanpa
  // policy SELECT; hanya service role yang bisa membacanya.
  const { data: jawaban, error: errKunci } = await service
    .from("pf_quiz_answers")
    .select("kunci")
    .eq("soal_id", valid.soalId)
    .maybeSingle();
  if (errKunci) {
    const kode = (errKunci as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan kuis belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/kuis/jawab", errKunci);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa jawaban. Coba lagi." },
      { status: 500 },
    );
  }
  if (!jawaban) {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan." },
      { status: 404 },
    );
  }
  // Hanya soal kuis hari ini/kemarin yang boleh dijawab — mencegah
  // enumerasi kunci kuis lama satu per satu.
  const hariIni = tanggalWibHariIni();
  const tanggal = String(
    (data as { tanggal: unknown }).tanggal ?? "",
  );
  if (tanggal !== hariIni && tanggal !== kemarinWib(hariIni)) {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan atau sudah kedaluwarsa." },
      { status: 404 },
    );
  }

  const kunci = Number((jawaban as { kunci: unknown }).kunci);
  const benar = valid.jawaban === kunci;
  // Tahap C-3: simpan jawaban pengguna LOGIN ke
  // pf_quiz_daily_answers (service role, upsert per
  // pengguna+soal+tanggal) agar POST /api/kuis/skor bisa
  // menghitung skor server dari jawaban tersimpan, bukan dari
  // angka klien. Anonim tidak disimpan (keputusan Fase 7).
  // Best-effort: gagal simpan TIDAK menggagalkan jawaban ini
  // (pengguna tetap melihat benar/kunci) — skor nanti menjawab
  // 409 jujur bila jawaban tersimpan belum lengkap. Tabel v15
  // belum ada (PGRST205) = kondisi yang sama: kuis tetap jalan,
  // skor belum bisa disimpan.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error: errSimpan } = await service
        .from("pf_quiz_daily_answers")
        .upsert(
          {
            user_id: user.id,
            soal_id: valid.soalId,
            tanggal,
            jawaban: valid.jawaban,
            benar,
          },
          { onConflict: "user_id,soal_id,tanggal" },
        );
      if (errSimpan) {
        console.error(
          "[kuis/jawab] gagal menyimpan jawaban harian:",
          errSimpan,
        );
      }
    }
  } catch (err) {
    console.error("[kuis/jawab] gagal menyimpan jawaban harian:", err);
  }
  return NextResponse.json({
    ok: true,
    benar,
    kunci,
    penjelasan: (data as { penjelasan?: string | null }).penjelasan ?? null,
    sumber_url: (data as { sumber_url?: string | null }).sumber_url ?? null,
    sumber_nama:
      (data as { sumber_nama?: string | null }).sumber_nama ?? null,
  });
}
