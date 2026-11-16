// Sertifikat Academy INTERNAL (B2) — server saja.
// Sertifikat HANYA diterbitkan bila kriteria kelulusan terpenuhi,
// dicek server dari data nyata (bukan klaim klien): lihat
// ambilDataKelulusan + cekKelulusan di lib/akademi/penilaian.ts.
// Sertifikat berlabel INTERNAL — BUKAN sertifikat resmi /
// terakreditasi — dan kalimat itu wajib tampil di halaman
// verifikasi maupun di dokumen sertifikat. Nomor verifikasi 12
// karakter unik; halaman publik /akademi/sertifikat/[kode] hanya
// membaca lewat verifikasiSertifikat (tanpa user_id / email).
// Penilaian esai manual TIDAK ada di berkas ini: jawaban esai
// disimpan di pf_quiz_user_answers (status 'menunggu_penilaian')
// dan dinilai staf lewat jalur admin (lihat PANDUAN-B2 di
// laporan Gelombang B2-B); fungsi tandaiEsaiDinilai di bawah
// adalah primitif service-role untuk jalur itu.
import { createServiceClient } from "@/lib/supabase/service";
import {
  cekKelulusan,
  hitungSkorKuis,
  buatKodeVerifikasi,
  type HasilKelulusan,
  type MasukanKelulusan,
} from "@/lib/akademi/penilaian";

export type PfSertifikat = {
  id: string;
  kode_verifikasi: string;
  nama_kursus: string;
  nama_peserta: string | null;
  kriteria: HasilKelulusan;
  diterbitkan_pada: string;
  dicabut: boolean;
  dicabut_pada: string | null;
  dicabut_alasan: string | null;
};

type BarisSertifikat = {
  id: string;
  kode_verifikasi: string;
  nama_kursus: string;
  nama_peserta: string | null;
  kriteria: unknown;
  diterbitkan_pada: string;
  dicabut: boolean;
  dicabut_pada: string | null;
  dicabut_alasan: string | null;
};

const KOLOM_SERTIFIKAT =
  "id, kode_verifikasi, nama_kursus, nama_peserta, kriteria, diterbitkan_pada, dicabut, dicabut_pada, dicabut_alasan";

function keSertifikat(r: BarisSertifikat): PfSertifikat {
  return {
    id: String(r.id),
    kode_verifikasi: String(r.kode_verifikasi),
    nama_kursus: String(r.nama_kursus ?? ""),
    nama_peserta: (r.nama_peserta as string | null) ?? null,
    kriteria: r.kriteria as HasilKelulusan,
    diterbitkan_pada: String(r.diterbitkan_pada ?? ""),
    dicabut: r.dicabut === true,
    dicabut_pada: (r.dicabut_pada as string | null) ?? null,
    dicabut_alasan: (r.dicabut_alasan as string | null) ?? null,
  };
}

function kodeTabelBelumAda(error: unknown): boolean {
  return (error as { code?: string }).code === "PGRST205";
}

export type HasilAmbilKelulusan =
  | {
      ok: true;
      kursus: { id: string; slug: string; judul: string };
      nama_peserta: string | null;
      kelulusan: HasilKelulusan;
    }
  | { ok: false; kode: "kursus_tidak_ditemukan" | "belum_tersedia" | "gagal" };

/**
 * Ambil data kelulusan pengguna untuk satu kursus dari database
 * (service client — dipakai route sertifikat; RLS dilewati tapi
 * semua baca difilter user_id yang diminta). Mengembalikan
 * masukan agregasi + hasil cekKelulusan.
 */
export async function ambilDataKelulusan(
  userId: string,
  courseId: string,
): Promise<HasilAmbilKelulusan> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return { ok: false, kode: "belum_tersedia" };
  }
  const { data: kursus, error: errKursus } = await service
    .from("pf_courses")
    .select("id, slug, judul, status")
    .eq("id", courseId)
    .maybeSingle();
  if (errKursus) {
    if (kodeTabelBelumAda(errKursus)) return { ok: false, kode: "belum_tersedia" };
    return { ok: false, kode: "gagal" };
  }
  if (!kursus || (kursus as { status?: string }).status !== "terbit") {
    return { ok: false, kode: "kursus_tidak_ditemukan" };
  }
  const barisKursus = kursus as unknown as Record<string, unknown>;

  const [modulRes, pelajaranRes, progresRes, jawabanRes, profilRes] =
    await Promise.all([
      service
        .from("pf_course_modules")
        .select("id, course_id, urutan")
        .eq("course_id", courseId),
      service.from("pf_course_lessons").select("id, module_id, jenis, urutan"),
      service
        .from("pf_course_progress")
        .select("lesson_id, selesai")
        .eq("user_id", userId),
      service
        .from("pf_quiz_user_answers")
        .select("lesson_id, benar")
        .eq("user_id", userId),
      service
        .from("pf_profiles")
        .select("nama_tampilan")
        .eq("id", userId)
        .maybeSingle(),
    ]);
  for (const r of [modulRes, pelajaranRes, progresRes, jawabanRes]) {
    if (r.error) {
      if (kodeTabelBelumAda(r.error)) return { ok: false, kode: "belum_tersedia" };
      return { ok: false, kode: "gagal" };
    }
  }
  const modulKeKursus = new Map<string, { urutan: number }>();
  for (const m of (modulRes.data ??
    []) as unknown as Record<string, unknown>[]) {
    modulKeKursus.set(String(m.id), {
      urutan: typeof m.urutan === "number" ? m.urutan : 0,
    });
  }
  const pelajaran = (pelajaranRes.data ??
    []) as unknown as Record<string, unknown>[];
  const pelajaranKursus = pelajaran.filter((p) =>
    modulKeKursus.has(String(p.module_id)),
  );
  const selesaiSet = new Set<string>();
  for (const r of (progresRes.data ??
    []) as unknown as Record<string, unknown>[]) {
    if (r.selesai === true) selesaiSet.add(String(r.lesson_id));
  }
  const jawabanPerPelajaran = new Map<string, { benar: boolean | null }[]>();
  for (const r of (jawabanRes.data ??
    []) as unknown as Record<string, unknown>[]) {
    const lid = String(r.lesson_id ?? "");
    if (!lid) continue;
    const daftar = jawabanPerPelajaran.get(lid) ?? [];
    daftar.push({
      benar: typeof r.benar === "boolean" ? r.benar : null,
    });
    jawabanPerPelajaran.set(lid, daftar);
  }
  const masukan: MasukanKelulusan = {
    total_pelajaran: pelajaranKursus.length,
    pelajaran_selesai: pelajaranKursus.filter((p) =>
      selesaiSet.has(String(p.id)),
    ).length,
    skor_kuis: pelajaranKursus
      .filter((p) => p.jenis === "kuis")
      .map((p) => {
        const modul = modulKeKursus.get(String(p.module_id));
        const skor = hitungSkorKuis(
          jawabanPerPelajaran.get(String(p.id)) ?? [],
        );
        return {
          lesson_id: String(p.id),
          urutan_modul: modul?.urutan ?? 0,
          urutan_pelajaran: typeof p.urutan === "number" ? p.urutan : 0,
          persen: skor.persen,
        };
      }),
  };
  const namaPeserta =
    (profilRes.data as { nama_tampilan?: string | null } | null)
      ?.nama_tampilan ?? null;
  return {
    ok: true,
    kursus: {
      id: String(barisKursus.id),
      slug: String(barisKursus.slug),
      judul: String(barisKursus.judul ?? ""),
    },
    nama_peserta: typeof namaPeserta === "string" ? namaPeserta : null,
    kelulusan: cekKelulusan(masukan),
  };
}

export type HasilTerbit =
  | { ok: true; sertifikat: PfSertifikat; baru: boolean }
  | {
      ok: false;
      kode: "kursus_tidak_ditemukan" | "belum_tersedia" | "gagal" | "belum_lulus";
      kelulusan?: HasilKelulusan;
    };

/**
 * Terbitkan sertifikat INTERNAL untuk pengguna+kursus. Idempotent:
 * bila sertifikat aktif sudah ada, kembalikan yang lama (baru =
 * false). Menolak bila kriteria kelulusan belum terpenuhi.
 */
export async function terbitkanSertifikat(
  userId: string,
  courseId: string,
): Promise<HasilTerbit> {
  const data = await ambilDataKelulusan(userId, courseId);
  if (!data.ok) return { ok: false, kode: data.kode };
  if (!data.kelulusan.lulus) {
    return { ok: false, kode: "belum_lulus", kelulusan: data.kelulusan };
  }
  let service;
  try {
    service = createServiceClient();
  } catch {
    return { ok: false, kode: "belum_tersedia" };
  }
  const { data: lama, error: errLama } = await service
    .from("pf_certificates")
    .select(KOLOM_SERTIFIKAT)
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("dicabut", false)
    .maybeSingle();
  if (errLama) {
    if (kodeTabelBelumAda(errLama)) return { ok: false, kode: "belum_tersedia" };
    return { ok: false, kode: "gagal" };
  }
  if (lama) {
    return {
      ok: true,
      sertifikat: keSertifikat(lama as unknown as BarisSertifikat),
      baru: false,
    };
  }
  // Kode unik: coba sampai 5 kali bila bentrok (unique constraint).
  for (let percobaan = 0; percobaan < 5; percobaan += 1) {
    const kode = buatKodeVerifikasi();
    const { data: baru, error } = await service
      .from("pf_certificates")
      .insert({
        user_id: userId,
        course_id: courseId,
        kode_verifikasi: kode,
        nama_kursus: data.kursus.judul,
        nama_peserta: data.nama_peserta,
        kriteria: data.kelulusan,
      })
      .select(KOLOM_SERTIFIKAT)
      .single();
    if (!error && baru) {
      return {
        ok: true,
        sertifikat: keSertifikat(baru as unknown as BarisSertifikat),
        baru: true,
      };
    }
    if (error) {
      if (kodeTabelBelumAda(error)) return { ok: false, kode: "belum_tersedia" };
      if ((error as { code?: string }).code === "23505") continue;
      return { ok: false, kode: "gagal" };
    }
  }
  return { ok: false, kode: "gagal" };
}

/** Sertifikat aktif milik pengguna untuk satu kursus (null bila belum ada). */
export async function getSertifikatPengguna(
  userId: string,
  courseId: string,
): Promise<PfSertifikat | null> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return null;
  }
  const { data, error } = await service
    .from("pf_certificates")
    .select(KOLOM_SERTIFIKAT)
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("dicabut", false)
    .maybeSingle();
  if (error || !data) return null;
  return keSertifikat(data as unknown as BarisSertifikat);
}

const POLA_KODE = /^[A-Z0-9]{12}$/;

/**
 * Verifikasi publik sertifikat dari kodenya (baca saja). Hanya
 * mengembalikan kolom publik: kode, nama kursus, nama peserta,
 * tanggal terbit, status dicabut, snapshot kriteria. TIDAK PERNAH
 * mengembalikan user_id / email / data akun lain.
 */
export async function verifikasiSertifikat(
  kodeMentah: string,
): Promise<PfSertifikat | null> {
  const kode = kodeMentah.trim().toUpperCase();
  if (!POLA_KODE.test(kode)) return null;
  let service;
  try {
    service = createServiceClient();
  } catch {
    return null;
  }
  const { data, error } = await service
    .from("pf_certificates")
    .select(KOLOM_SERTIFIKAT)
    .eq("kode_verifikasi", kode)
    .maybeSingle();
  if (error || !data) return null;
  return keSertifikat(data as unknown as BarisSertifikat);
}

/**
 * Primitif service-role untuk penilaian manual esai oleh staf:
 * tetapkan benar (true/false) pada satu jawaban esai yang masih
 * menunggu penilaian. BUKAN endpoint publik — pemanggil wajib
 * route admin (autentikasiStaf) yang memvalidasi penilai.
 * Mengembalikan false bila baris tidak ada / bukan esai yang
 * menunggu / tabel belum ada.
 */
export async function tandaiEsaiDinilai(
  userId: string,
  lessonId: string,
  soalId: string,
  benar: boolean,
  dinilaiOleh: string,
): Promise<boolean> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return false;
  }
  const { data, error } = await service
    .from("pf_quiz_user_answers")
    .update({
      benar,
      status_penilaian: "dinilai",
      dinilai_oleh: dinilaiOleh,
      dinilai_pada: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("soal_id", soalId)
    .eq("jenis", "esai")
    .eq("status_penilaian", "menunggu_penilaian")
    .select("id")
    .maybeSingle();
  if (error || !data) return false;
  return true;
}
