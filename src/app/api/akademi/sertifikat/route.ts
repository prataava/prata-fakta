// POST /api/akademi/sertifikat — terbitkan sertifikat Academy
// INTERNAL untuk pengguna login. Body: { course_id: UUID }.
// Sertifikat HANYA diterbitkan bila kriteria kelulusan terpenuhi,
// dicek server dari data nyata (pelajaran selesai + skor kuis
// server-side + ambang — lihat lib/akademi/penilaian.ts);
// klaim klien tidak pernah dipercaya. Idempotent: bila
// sertifikat aktif sudah ada, kembalikan yang lama. Rate limit
// 10/menit/IP. 403 + rincian kriteria bila belum lulus; 404 bila
// kursus tidak ada/draf; 503 bila tabel v14 belum ada.
//
// GET /api/akademi/sertifikat — daftar sertifikat terbaru
// (STAF saja; dipakai UI admin pencabutan).
// DELETE /api/akademi/sertifikat — cabut sertifikat (STAF saja).
// Body: { kode_verifikasi: "XXXXXXXXXXXX", alasan: "..." }.
// Pencabutan TIDAK menghapus baris: halaman verifikasi publik
// /akademi/sertifikat/[kode] tetap menampilkan sertifikat
// dengan status DICABUT + alasan. Audit fail-closed
// 'akademi.sertifikat.cabut': gagal audit → sertifikat
// dipulihkan (compensating restore) + operasi ditolak.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import {
  cabutSertifikat,
  daftarSertifikat,
  pulihkanSertifikat,
  terbitkanSertifikat,
} from "@/lib/akademi/sertifikat";
import {
  autentikasiAdmin,
  bacaBody,
  ipDariRequest,
} from "@/lib/admin/guard";
import {
  catatAuditWajib,
  responGalatAudit,
} from "@/lib/admin/audit";

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

export async function GET(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const hasil = await daftarSertifikat(50);
  if (!hasil.ok) {
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
      { ok: false, error: "Gagal memuat daftar sertifikat. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, sertifikat: hasil.sertifikat });
}

export async function DELETE(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const { kode_verifikasi, alasan } = body as Record<string, unknown>;
  if (
    typeof kode_verifikasi !== "string" ||
    typeof alasan !== "string"
  ) {
    return NextResponse.json(
      { ok: false, error: "kode_verifikasi dan alasan wajib diisi." },
      { status: 400 },
    );
  }
  const hasil = await cabutSertifikat(kode_verifikasi, alasan);
  if (!hasil.ok) {
    if (hasil.kode === "tidak_ditemukan") {
      return NextResponse.json(
        { ok: false, error: "Sertifikat tidak ditemukan." },
        { status: 404 },
      );
    }
    if (hasil.kode === "sudah_dicabut") {
      return NextResponse.json(
        { ok: false, error: "Sertifikat ini sudah dicabut sebelumnya." },
        { status: 409 },
      );
    }
    if (hasil.kode === "alasan_tidak_valid") {
      return NextResponse.json(
        {
          ok: false,
          error: "Alasan pencabutan wajib diisi (maksimal 500 karakter).",
        },
        { status: 400 },
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
      { ok: false, error: "Sertifikat gagal dicabut. Coba lagi." },
      { status: 500 },
    );
  }
  try {
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "akademi.sertifikat.cabut",
      entitas: "pf_certificates",
      entitas_id: hasil.sertifikat.id,
      sebelum: { dicabut: false },
      sesudah: {
        dicabut: true,
        kode_verifikasi: hasil.sertifikat.kode_verifikasi,
        alasan: alasan.trim().slice(0, 200),
      },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    // Audit fail-closed: pulihkan sertifikat (compensating
    // restore) lalu tolak operasi.
    const pulih = await pulihkanSertifikat(kode_verifikasi);
    if (!pulih) {
      console.error(
        "[akademi/sertifikat] SERTIFIKAT TETAP DICABUT TANPA AUDIT (pulihkan gagal):",
        hasil.sertifikat.kode_verifikasi,
      );
    }
    return responGalatAudit(err);
  }
  return NextResponse.json({
    ok: true,
    sertifikat: {
      kode_verifikasi: hasil.sertifikat.kode_verifikasi,
      nama_kursus: hasil.sertifikat.nama_kursus,
      dicabut: true,
      dicabut_pada: hasil.sertifikat.dicabut_pada,
      dicabut_alasan: hasil.sertifikat.dicabut_alasan,
    },
  });
}
