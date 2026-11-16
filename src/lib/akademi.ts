// Lapisan akses data PRATA Academy (Area 8, Fase 8 Gel. 2).
// Prinsip sama seperti src/lib/data.ts: gagal-aman (try/catch → []
// / null), Bahasa Indonesia, tanpa data palsu. Semua baca memakai
// session client sehingga RLS v10 berlaku: kursus draf (dan
// modul/pelajaran di dalamnya) TIDAK PERNAH terlihat publik;
// progres hanya milik pengguna itu sendiri. Bila tabel v10 belum
// ada, fungsi mengembalikan [] / null dan pemanggil menampilkan
// empty state jujur.
import { createClient } from "@/lib/supabase/server";
import type { PfReferensi } from "@/lib/lanjutan";
import {
  cekKelulusan,
  hitungSkorKuis,
  type HasilKelulusan,
} from "@/lib/akademi/penilaian";

export type TingkatKursus = "pemula" | "menengah" | "mendalam";
export type JenisPelajaran = "materi" | "artikel" | "kuis";

export type PfKursus = {
  id: string;
  slug: string;
  judul: string;
  deskripsi: string | null;
  kategori: string;
  tingkat: TingkatKursus;
  status: string;
  urutan: number;
  /** Jumlah modul kursus (nyata dari pf_course_modules). */
  jumlah_modul: number;
  /** Jumlah pelajaran kursus (nyata dari pf_course_lessons). */
  jumlah_pelajaran: number;
};

export type PfModul = {
  id: string;
  course_id: string;
  judul: string;
  deskripsi: string | null;
  urutan: number;
};

export type PfPelajaran = {
  id: string;
  module_id: string;
  judul: string;
  isi: string | null;
  jenis: JenisPelajaran;
  referensi: PfReferensi[];
  artikel_id: string | null;
  /** Slug artikel rujukan (pelajaran jenis 'artikel'); null bila
   *  artikel tidak ada / belum terbit. */
  artikel_slug: string | null;
  /** Judul artikel rujukan; null bila artikel tidak ada. */
  artikel_judul: string | null;
  kuis_tanggal: string | null;
  urutan: number;
};

export type PfModulDenganPelajaran = {
  modul: PfModul;
  pelajaran: PfPelajaran[];
};

export type PfKursusDetail = {
  kursus: PfKursus;
  modul: PfModulDenganPelajaran[];
  /** Jumlah pelajaran kursus (nyata). */
  total_pelajaran: number;
};

export type PfProgresPelajaran = {
  lesson_id: string;
  selesai: boolean;
  skor: number | null;
};

export type ProgresKursus = {
  selesai: number;
  total: number;
};

function keReferensi(v: unknown): PfReferensi[] {
  if (!Array.isArray(v)) return [];
  const hasil: PfReferensi[] = [];
  for (const r of v as unknown[]) {
    if (typeof r === "string") {
      hasil.push({ judul: r, url: null });
    } else if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const judul =
        typeof o.judul === "string"
          ? o.judul
          : typeof o.nama === "string"
            ? o.nama
            : null;
      const url = typeof o.url === "string" ? o.url : null;
      if (judul || url) hasil.push({ judul, url });
    }
  }
  return hasil;
}

function tingkatDari(v: unknown): TingkatKursus {
  if (v === "menengah" || v === "mendalam") return v;
  return "pemula";
}

function jenisDari(v: unknown): JenisPelajaran {
  if (v === "artikel" || v === "kuis") return v;
  return "materi";
}

const KOLOM_KURSUS =
  "id, slug, judul, deskripsi, kategori, tingkat, status, urutan";

/** Daftar kursus TERBIT + jumlah modul/pelajaran nyata. */
export async function getKursusTerbit(): Promise<PfKursus[]> {
  try {
    const supabase = await createClient();
    const [kursusRes, modulRes, pelajaranRes] = await Promise.all([
      supabase
        .from("pf_courses")
        .select(KOLOM_KURSUS)
        .eq("status", "terbit")
        .order("urutan", { ascending: true })
        .order("judul", { ascending: true }),
      supabase.from("pf_course_modules").select("id, course_id"),
      supabase
        .from("pf_course_lessons")
        .select("id, module_id"),
    ]);
    if (kursusRes.error || !kursusRes.data) return [];
    const modulPerKursus = new Map<string, number>();
    if (!modulRes.error && modulRes.data) {
      for (const m of modulRes.data as { id: string; course_id: string }[]) {
        modulPerKursus.set(
          m.course_id,
          (modulPerKursus.get(m.course_id) ?? 0) + 1,
        );
      }
    }
    // Pelajaran dihitung per kursus lewat modulnya.
    const modulKeKursus = new Map<string, string>();
    if (!modulRes.error && modulRes.data) {
      for (const m of modulRes.data as { id: string; course_id: string }[]) {
        modulKeKursus.set(m.id, m.course_id);
      }
    }
    const pelajaranPerKursus = new Map<string, number>();
    if (!pelajaranRes.error && pelajaranRes.data) {
      for (const p of pelajaranRes.data as {
        id: string;
        module_id: string;
      }[]) {
        const courseId = modulKeKursus.get(p.module_id);
        if (!courseId) continue;
        pelajaranPerKursus.set(
          courseId,
          (pelajaranPerKursus.get(courseId) ?? 0) + 1,
        );
      }
    }
    return (kursusRes.data as unknown as Record<string, unknown>[]).map(
      (r) => {
        const id = String(r.id);
        return {
          id,
          slug: String(r.slug),
          judul: String(r.judul ?? ""),
          deskripsi: (r.deskripsi as string | null) ?? null,
          kategori: String(r.kategori ?? "umum"),
          tingkat: tingkatDari(r.tingkat),
          status: String(r.status ?? ""),
          urutan: typeof r.urutan === "number" ? r.urutan : 0,
          jumlah_modul: modulPerKursus.get(id) ?? 0,
          jumlah_pelajaran: pelajaranPerKursus.get(id) ?? 0,
        };
      },
    );
  } catch {
    return [];
  }
}

/** Detail kursus TERBIT: modul → pelajaran (urut), lengkap dengan
 *  judul/slug artikel rujukan untuk pelajaran jenis 'artikel'.
 *  null bila slug tidak ada / draf / tabel belum ada. */
export async function getKursusDetail(
  slug: string,
): Promise<PfKursusDetail | null> {
  try {
    const supabase = await createClient();
    const { data: kursus, error: errKursus } = await supabase
      .from("pf_courses")
      .select(KOLOM_KURSUS)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (errKursus || !kursus) return null;
    const row = kursus as unknown as Record<string, unknown>;
    const courseId = String(row.id);

    const { data: modul, error: errModul } = await supabase
      .from("pf_course_modules")
      .select("id, course_id, judul, deskripsi, urutan")
      .eq("course_id", courseId)
      .order("urutan", { ascending: true })
      .order("judul", { ascending: true });
    if (errModul || !modul) return null;
    const daftarModul = (modul as unknown as Record<string, unknown>[]).map(
      (m) => ({
        id: String(m.id),
        course_id: String(m.course_id),
        judul: String(m.judul ?? ""),
        deskripsi: (m.deskripsi as string | null) ?? null,
        urutan: typeof m.urutan === "number" ? m.urutan : 0,
      }),
    );
    const modulId = daftarModul.map((m) => m.id);

    const { data: pelajaran, error: errPelajaran } =
      modulId.length > 0
        ? await supabase
            .from("pf_course_lessons")
            .select(
              "id, module_id, judul, isi, jenis, referensi, artikel_id, kuis_tanggal, urutan",
            )
            .in("module_id", modulId)
            .order("urutan", { ascending: true })
            .order("judul", { ascending: true })
        : { data: [], error: null };
    if (errPelajaran || !pelajaran) return null;

    // Artikel rujukan (hanya yang terbit) untuk pelajaran 'artikel'.
    const artikelId = [
      ...new Set(
        (pelajaran as unknown as Record<string, unknown>[])
          .map((p) => p.artikel_id)
          .filter((a): a is string => typeof a === "string" && Boolean(a)),
      ),
    ];
    const petaArtikel = new Map<
      string,
      { slug: string; judul: string }
    >();
    if (artikelId.length > 0) {
      const { data: artikel } = await supabase
        .from("pf_articles")
        .select("id, slug, judul")
        .eq("status", "terbit")
        .in("id", artikelId);
      for (const a of (artikel ??
        []) as unknown as Record<string, unknown>[]) {
        petaArtikel.set(String(a.id), {
          slug: String(a.slug),
          judul: String(a.judul ?? ""),
        });
      }
    }

    const pelajaranPerModul = new Map<string, PfPelajaran[]>();
    for (const p of pelajaran as unknown as Record<string, unknown>[]) {
      const art = typeof p.artikel_id === "string"
        ? petaArtikel.get(p.artikel_id)
        : undefined;
      const baris: PfPelajaran = {
        id: String(p.id),
        module_id: String(p.module_id),
        judul: String(p.judul ?? ""),
        isi: (p.isi as string | null) ?? null,
        jenis: jenisDari(p.jenis),
        referensi: keReferensi(p.referensi),
        artikel_id:
          typeof p.artikel_id === "string" ? p.artikel_id : null,
        artikel_slug: art ? art.slug : null,
        artikel_judul: art ? art.judul : null,
        kuis_tanggal:
          typeof p.kuis_tanggal === "string" ? p.kuis_tanggal : null,
        urutan: typeof p.urutan === "number" ? p.urutan : 0,
      };
      const daftar = pelajaranPerModul.get(baris.module_id) ?? [];
      daftar.push(baris);
      pelajaranPerModul.set(baris.module_id, daftar);
    }

    let total = 0;
    const modulDenganPelajaran: PfModulDenganPelajaran[] =
      daftarModul.map((m) => {
        const daftar = pelajaranPerModul.get(m.id) ?? [];
        total += daftar.length;
        return { modul: m, pelajaran: daftar };
      });

    return {
      kursus: {
        id: courseId,
        slug: String(row.slug),
        judul: String(row.judul ?? ""),
        deskripsi: (row.deskripsi as string | null) ?? null,
        kategori: String(row.kategori ?? "umum"),
        tingkat: tingkatDari(row.tingkat),
        status: String(row.status ?? ""),
        urutan: typeof row.urutan === "number" ? row.urutan : 0,
        jumlah_modul: daftarModul.length,
        jumlah_pelajaran: total,
      },
      modul: modulDenganPelajaran,
      total_pelajaran: total,
    };
  } catch {
    return null;
  }
}

/** Progres pengguna untuk daftar pelajaran (lesson_id → baris).
 *  Hanya baris milik pengguna itu sendiri (RLS). */
export async function getProgresPengguna(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, PfProgresPelajaran>> {
  const hasil = new Map<string, PfProgresPelajaran>();
  if (lessonIds.length === 0) return hasil;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_course_progress")
      .select("lesson_id, selesai, skor")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds);
    if (error || !data) return hasil;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const lessonId = String(r.lesson_id ?? "");
      if (!lessonId) continue;
      hasil.set(lessonId, {
        lesson_id: lessonId,
        selesai: r.selesai === true,
        skor: typeof r.skor === "number" ? r.skor : null,
      });
    }
    return hasil;
  } catch {
    return hasil;
  }
}

/** Progres pengguna per kursus (course_id → {selesai, total}).
 *  Total = jumlah pelajaran kursus terbit; selesai = jumlah
 *  pelajaran yang ditandai selesai oleh pengguna ini. Angka nyata
 *  dari pf_course_progress + struktur kursus. */
export async function getProgresPerKursus(
  userId: string,
): Promise<Map<string, ProgresKursus>> {
  const hasil = new Map<string, ProgresKursus>();
  try {
    const supabase = await createClient();
    const [kursus, modul, pelajaran, progres] = await Promise.all([
      supabase
        .from("pf_courses")
        .select("id")
        .eq("status", "terbit"),
      supabase.from("pf_course_modules").select("id, course_id"),
      supabase.from("pf_course_lessons").select("id, module_id"),
      supabase
        .from("pf_course_progress")
        .select("lesson_id, selesai")
        .eq("user_id", userId),
    ]);
    if (kursus.error || !kursus.data) return hasil;
    const modulKeKursus = new Map<string, string>();
    if (!modul.error && modul.data) {
      for (const m of modul.data as { id: string; course_id: string }[]) {
        modulKeKursus.set(m.id, m.course_id);
      }
    }
    const pelajaranKeKursus = new Map<string, string>();
    if (!pelajaran.error && pelajaran.data) {
      for (const p of pelajaran.data as {
        id: string;
        module_id: string;
      }[]) {
        const courseId = modulKeKursus.get(p.module_id);
        if (courseId) pelajaranKeKursus.set(p.id, courseId);
      }
    }
    for (const k of kursus.data as { id: string }[]) {
      hasil.set(String(k.id), { selesai: 0, total: 0 });
    }
    for (const courseId of pelajaranKeKursus.values()) {
      const entri = hasil.get(courseId);
      if (entri) entri.total += 1;
    }
    if (!progres.error && progres.data) {
      for (const r of progres.data as {
        lesson_id: string;
        selesai: boolean;
      }[]) {
        if (r.selesai !== true) continue;
        const courseId = pelajaranKeKursus.get(r.lesson_id);
        if (!courseId) continue;
        const entri = hasil.get(courseId);
        if (entri) entri.selesai += 1;
      }
    }
    return hasil;
  } catch {
    return hasil;
  }
}

/* ============================================================
   Gelombang B2-B: riwayat nilai per soal (H6) + status
   kelulusan (B1). Semua angka dari data nyata (pf_quiz_user_
   answers + pf_course_progress); skor TIDAK PERNAH dari klien.
   ============================================================ */

export type RiwayatNilaiSoal = {
  soal_id: string;
  /** true/false bila sudah dinilai; null bila esai menunggu. */
  benar: boolean | null;
  status_penilaian: "otomatis" | "menunggu_penilaian" | "dinilai";
  jenis: string;
};

/**
 * Riwayat nilai per soal untuk daftar pelajaran kuis (H6):
 * lesson_id → jawaban tersimpan per soal (terbaru per soal —
 * satu baris per (pengguna, pelajaran, soal)). Hanya milik
 * pengguna itu sendiri (RLS). Map kosong bila tabel v14 belum
 * ada / belum ada jawaban.
 */
export async function getRiwayatNilaiPerSoal(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, RiwayatNilaiSoal[]>> {
  const hasil = new Map<string, RiwayatNilaiSoal[]>();
  if (lessonIds.length === 0) return hasil;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_quiz_user_answers")
      .select("lesson_id, soal_id, benar, status_penilaian, jenis")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds);
    if (error || !data) return hasil;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const lessonId = String(r.lesson_id ?? "");
      if (!lessonId) continue;
      const status =
        r.status_penilaian === "menunggu_penilaian" ||
        r.status_penilaian === "dinilai"
          ? (r.status_penilaian as RiwayatNilaiSoal["status_penilaian"])
          : "otomatis";
      const daftar = hasil.get(lessonId) ?? [];
      daftar.push({
        soal_id: String(r.soal_id ?? ""),
        benar: typeof r.benar === "boolean" ? r.benar : null,
        status_penilaian: status,
        jenis: String(r.jenis ?? "pilihan_ganda"),
      });
      hasil.set(lessonId, daftar);
    }
    return hasil;
  } catch {
    return hasil;
  }
}

/**
 * Status kelulusan pengguna untuk satu kursus TERBIT (B1):
 * dihitung server dari struktur kursus + progres + jawaban
 * tersimpan. null bila kursus tidak ada / tabel belum ada.
 * Pemanggil (halaman kursus) memakai ini untuk menampilkan
 * tombol sertifikat hanya bila lulus.
 */
export async function getStatusKelulusan(
  userId: string,
  slug: string,
): Promise<{ course_id: string; kelulusan: HasilKelulusan } | null> {
  const detail = await getKursusDetail(slug);
  if (!detail) return null;
  const semuaPelajaran = detail.modul.flatMap((m) =>
    m.pelajaran.map((p) => ({
      ...p,
      urutan_modul: m.modul.urutan,
    })),
  );
  const lessonIds = semuaPelajaran.map((p) => p.id);
  const [progres, riwayat] = await Promise.all([
    getProgresPengguna(userId, lessonIds),
    getRiwayatNilaiPerSoal(
      userId,
      semuaPelajaran.filter((p) => p.jenis === "kuis").map((p) => p.id),
    ),
  ]);
  const kelulusan = cekKelulusan({
    total_pelajaran: semuaPelajaran.length,
    pelajaran_selesai: semuaPelajaran.filter(
      (p) => progres.get(p.id)?.selesai === true,
    ).length,
    skor_kuis: semuaPelajaran
      .filter((p) => p.jenis === "kuis")
      .map((p) => ({
        lesson_id: p.id,
        urutan_modul: p.urutan_modul,
        urutan_pelajaran: p.urutan,
        persen: hitungSkorKuis(riwayat.get(p.id) ?? []).persen,
      })),
  });
  return { course_id: detail.kursus.id, kelulusan };
}
