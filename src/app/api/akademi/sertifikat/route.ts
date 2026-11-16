// POST /api/akademi/sertifikat — terbitkan sertifikat Academy
// INTERNAL untuk pengguna login. Body: { course_id: UUID }.
// Sertifikat HANYA diterbitkan bila kriteria kelulusan terpenuhi,
// dicek server dari data nyata (pelajaran selesai + skor kuis
// server-side + ambang — lihat lib/akademi/penilaian.ts);
// klaim klien tidak pernah dipercaya. Idempotent: bila
// sertifikat aktif sudah ada, kembalikan yang lama. Rate limit
// 10/menit/IP. 403 + rincian kriteria bila belum lulus; 404 bila
// kursus tidak ada/draf; 503 bila tabel v14 belum ada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { terbitkanSertifikat } from "@/lib/akademi/sertifikat";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lolosRateLimit = buatRateLimiterKeras(10);

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const { course_id } = body as Record<string, unknown>;
  if (typeof course_id !== "string" || !POLA_UUID.test(course_id)) {
    return NextResponse.json(
      { ok: false, error: "course_id tidak valid." },
      { status: 400 },
    );
  }

  const hasil = await terbitkanSertifikat(user.id, course_id);
  if (!hasil.ok) {
    if (hasil.kode === "belum_lulus") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kriteria kelulusan belum terpenuhi. Lihat rincian di bawah.",
          kelulusan: hasil.kelulusan,
          alasan: hasil.kelulusan?.alasan ?? [],
        },
        { status: 403 },
      );
    }
    if (hasil.kode === "kursus_tidak_ditemukan") {
      return NextResponse.json(
        { ok: false, error: "Kursus tidak ditemukan." },
        { status: 404 },
      );
    }
    if (hasil.kode === "belum_tersedia") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan sertifikat belum aktif (tabel database belum dibuat — jalankan migrasi v14).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Sertifikat gagal diterbitkan. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    baru: hasil.baru,
    sertifikat: {
      kode_verifikasi: hasil.sertifikat.kode_verifikasi,
      nama_kursus: hasil.sertifikat.nama_kursus,
      nama_peserta: hasil.sertifikat.nama_peserta,
      diterbitkan_pada: hasil.sertifikat.diterbitkan_pada,
      kriteria: hasil.sertifikat.kriteria,
    },
  });
}
