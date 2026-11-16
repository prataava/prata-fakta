// Pembuatan soal kuis bertipe baru (Tahap C-1, admin Academy).
// Soal disimpan di pf_quiz_questions (tanpa kunci) + kunci
// jawaban di pf_quiz_answers (HANYA service role — pola v13
// P0-4). Soal ESAI sengaja TANPA baris kunci (tidak ada yang
// dinilai otomatis — pola B2-B): route jawab Akademi
// mengizinkan esai tanpa baris kunci, dan menolak soal
// non-esai tanpa baris kunci (404).
//
// JENIS + KUNCI (lihat lib/akademi/penilaian.ts):
// - pilihan_ganda: opsi 2..10, kunci angka 0..len-1.
// - pilihan_ganda_kompleks: opsi 2..10, kunci_jamaks ≥2 pilihan
//   unik 0..len-1 (jawaban harus sama PERSIS — tanpa kredit
//   parsial).
// - isian_singkat: tanpa opsi (disimpan []), kunci_teks 1..500.
// - benar_salah: opsi ["Benar", "Salah"] (diisi otomatis bila
//   kosong), kunci 0 (Salah) / 1 (Benar).
// - esai: tanpa opsi, tanpa kunci apa pun.
//
// TUJUAN SOAL — tepat satu dari:
// - lesson_id: pelajaran kuis Academy (jenis 'kuis' +
//   kuis_tanggal wajib ada); tanggal soal = kuis_tanggal
//   pelajaran itu (dibaca server, bukan klaim klien).
// - tanggal: kuis harian (YYYY-MM-DD) — soal pilihan_ganda
//   untuk /kuis; jenis lain untuk tanggal harian DITOLAK
//   (halaman /kuis hanya memainkan pilihan_ganda).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  jenisSoalKuisDari,
  type JenisSoalKuis,
} from "@/lib/akademi/penilaian";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Masukan soal baru sesudah validasi (siap tulis). */
export type SoalBaruTervalidasi = {
  lessonId: string | null;
  tanggal: string | null;
  pertanyaan: string;
  jenis: JenisSoalKuis;
  opsi: string[];
  kunci: number | null;
  kunci_teks: string | null;
  kunci_jamaks: number[] | null;
  penjelasan: string | null;
  sumber_url: string | null;
  sumber_nama: string | null;
  artikel_id: string | null;
};

function teksAtauNull(v: unknown, maks: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return null;
  if (t.length > maks) return undefined;
  return t;
}

/**
 * Validasi murni body pembuatan soal (diekspos untuk uji).
 * TIDAK menyentuh database — tanggal pelajaran (lesson_id)
 * diselesaikan server di buatSoalKuis.
 */
export function validasiSoalBaru(
  body: unknown,
):
  | { ok: true; data: SoalBaruTervalidasi }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Isi permintaan tidak valid." };
  }
  const b = body as Record<string, unknown>;

  const lessonId =
    typeof b.lesson_id === "string" && b.lesson_id.trim() !== ""
      ? b.lesson_id.trim()
      : null;
  const tanggal =
    typeof b.tanggal === "string" && b.tanggal.trim() !== ""
      ? b.tanggal.trim()
      : null;
  if (lessonId && tanggal) {
    return {
      ok: false,
      error: "Isi salah satu saja: lesson_id (soal Akademi) atau tanggal (soal kuis harian).",
    };
  }
  if (!lessonId && !tanggal) {
    return {
      ok: false,
      error: "Tujuan soal wajib diisi: lesson_id atau tanggal.",
    };
  }
  if (lessonId && !POLA_UUID.test(lessonId)) {
    return { ok: false, error: "lesson_id tidak valid." };
  }
  if (tanggal && !POLA_TANGGAL.test(tanggal)) {
    return { ok: false, error: "Tanggal harus format YYYY-MM-DD." };
  }
  if (typeof b.pertanyaan !== "string" || b.pertanyaan.trim() === "") {
    return { ok: false, error: "Pertanyaan wajib diisi." };
  }
  if (b.pertanyaan.trim().length > 2000) {
    return { ok: false, error: "Pertanyaan maksimal 2000 karakter." };
  }
  const jenis = jenisSoalKuisDari(b.jenis);
  // Kuis harian hanya memainkan pilihan_ganda (halaman /kuis
  // memfilter jenis itu) — jenis lain untuk tanggal harian
  // akan menjadi soal mati yang tidak pernah tampil.
  if (tanggal && jenis !== "pilihan_ganda") {
    return {
      ok: false,
      error: "Soal kuis harian harus pilihan_ganda (jenis lain hanya untuk pelajaran Akademi).",
    };
  }

  // Opsi: array string tak-kosong (maks 10).
  let opsi: string[] = [];
  if (b.opsi !== undefined && b.opsi !== null) {
    if (!Array.isArray(b.opsi)) {
      return { ok: false, error: "Opsi harus berupa daftar teks." };
    }
    for (const o of b.opsi as unknown[]) {
      if (typeof o !== "string" || o.trim() === "") {
        return { ok: false, error: "Setiap opsi wajib teks yang tidak kosong." };
      }
      if (o.trim().length > 500) {
        return { ok: false, error: "Setiap opsi maksimal 500 karakter." };
      }
      opsi.push(o.trim());
    }
  }
  if (
    (jenis === "pilihan_ganda" || jenis === "pilihan_ganda_kompleks") &&
    (opsi.length < 2 || opsi.length > 10)
  ) {
    return {
      ok: false,
      error: "Soal pilihan ganda wajib memiliki 2 sampai 10 opsi.",
    };
  }
  if (jenis === "benar_salah") {
    if (opsi.length === 0) {
      opsi = ["Benar", "Salah"];
    } else if (
      opsi.length !== 2 ||
      opsi[0].toLowerCase() !== "benar" ||
      opsi[1].toLowerCase() !== "salah"
    ) {
      return {
        ok: false,
        error: "Opsi benar/salah harus [\"Benar\", \"Salah\"] (atau dikosongkan).",
      };
    }
  }
  if ((jenis === "isian_singkat" || jenis === "esai") && opsi.length > 0) {
    return {
      ok: false,
      error: "Soal isian/esai tidak memakai opsi.",
    };
  }

  // Kunci per jenis — TIDAK PERNAH disimpan ke kolom publik.
  let kunci: number | null = null;
  let kunci_teks: string | null = null;
  let kunci_jamaks: number[] | null = null;
  if (jenis === "pilihan_ganda" || jenis === "benar_salah") {
    if (
      typeof b.kunci !== "number" ||
      !Number.isInteger(b.kunci) ||
      b.kunci < 0 ||
      b.kunci > opsi.length - 1
    ) {
      return {
        ok: false,
        error: `Kunci jawaban harus bilangan bulat 0 sampai ${opsi.length - 1}.`,
      };
    }
    if (jenis === "benar_salah" && b.kunci > 1) {
      return {
        ok: false,
        error: "Kunci benar/salah harus 0 (Salah) atau 1 (Benar).",
      };
    }
    kunci = b.kunci;
  } else if (jenis === "pilihan_ganda_kompleks") {
    if (!Array.isArray(b.kunci_jamaks) || b.kunci_jamaks.length < 2) {
      return {
        ok: false,
        error: "Kunci pilihan ganda kompleks wajib daftar minimal 2 pilihan.",
      };
    }
    const unik = [...new Set(b.kunci_jamaks as unknown[])];
    for (const k of unik) {
      if (
        typeof k !== "number" ||
        !Number.isInteger(k) ||
        k < 0 ||
        k > opsi.length - 1
      ) {
        return {
          ok: false,
          error: `Setiap kunci harus bilangan bulat 0 sampai ${opsi.length - 1}.`,
        };
      }
    }
    if (unik.length !== (b.kunci_jamaks as unknown[]).length) {
      return { ok: false, error: "Kunci tidak boleh berisi pilihan yang sama dua kali." };
    }
    kunci_jamaks = (unik as number[]).sort((a, c) => a - c);
  } else if (jenis === "isian_singkat") {
    if (
      typeof b.kunci_teks !== "string" ||
      b.kunci_teks.trim() === "" ||
      b.kunci_teks.trim().length > 500
    ) {
      return {
        ok: false,
        error: "Kunci isian singkat wajib teks 1 sampai 500 karakter.",
      };
    }
    kunci_teks = b.kunci_teks.trim();
  } else {
    // esai: kunci apa pun yang dikirim ditolak — esai tidak
    // punya kunci (menolak lebih jujur daripada diam-diam
    // membuang; staf harus tahu kuncinya tidak tersimpan).
    if (
      b.kunci !== undefined ||
      b.kunci_teks !== undefined ||
      b.kunci_jamaks !== undefined
    ) {
      return {
        ok: false,
        error: "Soal esai tidak punya kunci jawaban (dinilai manual oleh staf).",
      };
    }
  }

  const penjelasan = teksAtauNull(b.penjelasan, 2000);
  if (penjelasan === undefined) {
    return { ok: false, error: "Penjelasan maksimal 2000 karakter." };
  }
  const sumberNama = teksAtauNull(b.sumber_nama, 200);
  if (sumberNama === undefined) {
    return { ok: false, error: "Nama sumber maksimal 200 karakter." };
  }
  let sumberUrl: string | null = null;
  if (b.sumber_url !== undefined && b.sumber_url !== null) {
    if (
      typeof b.sumber_url !== "string" ||
      !/^https?:\/\/.+/i.test(b.sumber_url.trim()) ||
      b.sumber_url.trim().length > 1000
    ) {
      return {
        ok: false,
        error: "URL sumber harus diawali http(s):// (maksimal 1000 karakter).",
      };
    }
    sumberUrl = b.sumber_url.trim();
  }
  let artikelId: string | null = null;
  if (b.artikel_id !== undefined && b.artikel_id !== null) {
    if (typeof b.artikel_id !== "string" || !POLA_UUID.test(b.artikel_id)) {
      return { ok: false, error: "artikel_id tidak valid." };
    }
    artikelId = b.artikel_id;
  }

  return {
    ok: true,
    data: {
      lessonId,
      tanggal,
      pertanyaan: b.pertanyaan.trim(),
      jenis,
      opsi,
      kunci,
      kunci_teks,
      kunci_jamaks,
      penjelasan: penjelasan ?? null,
      sumber_url: sumberUrl,
      sumber_nama: sumberNama ?? null,
      artikel_id: artikelId,
    },
  };
}

export type HasilBuatSoal =
  | { ok: true; soal_id: string; tanggal: string }
  | {
      ok: false;
      kode:
        | "pelajaran_tidak_ditemukan"
        | "belum_tersedia"
        | "gagal";
    };

function kodeTabelBelumAda(error: unknown): boolean {
  return (error as { code?: string }).code === "PGRST205";
}

/**
 * Buat soal baru (server saja, service role). Tanggal soal
 * Akademi dibaca dari pelajaran (kuis_tanggal); soal harian
 * memakai tanggal yang divalidasi. Kunci ditulis ke
 * pf_quiz_answers — TIDAK PERNAH ke kolom publik. Bila tulis
 * kunci gagal, soal yang baru dibuat dihapus-balik
 * (compensating delete — BUKAN transaksi atomik; bila
 * delete-nya sendiri gagal, soal yatim tanpa kunci masih
 * mungkin dan akan tampil di log server).
 */
export async function buatSoalKuis(
  service: SupabaseClient,
  data: SoalBaruTervalidasi,
): Promise<HasilBuatSoal> {
  let tanggal = data.tanggal;
  if (data.lessonId) {
    const { data: pelajaran, error } = await service
      .from("pf_course_lessons")
      .select("id, jenis, kuis_tanggal")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (error) {
      if (kodeTabelBelumAda(error)) return { ok: false, kode: "belum_tersedia" };
      return { ok: false, kode: "gagal" };
    }
    const p = pelajaran as {
      jenis?: string;
      kuis_tanggal?: string | null;
    } | null;
    if (!p || p.jenis !== "kuis" || !p.kuis_tanggal) {
      return { ok: false, kode: "pelajaran_tidak_ditemukan" };
    }
    tanggal = p.kuis_tanggal;
  }
  if (!tanggal) return { ok: false, kode: "gagal" };

  const { data: soal, error: errSoal } = await service
    .from("pf_quiz_questions")
    .insert({
      tanggal,
      pertanyaan: data.pertanyaan,
      opsi: data.opsi,
      jenis: data.jenis,
      penjelasan: data.penjelasan,
      sumber_url: data.sumber_url,
      sumber_nama: data.sumber_nama,
      artikel_id: data.artikel_id,
    })
    .select("id")
    .single();
  if (errSoal || !soal) {
    if (errSoal && kodeTabelBelumAda(errSoal)) {
      return { ok: false, kode: "belum_tersedia" };
    }
    return { ok: false, kode: "gagal" };
  }
  const soalId = String((soal as { id: string }).id);

  // Esai: sengaja tanpa baris kunci.
  if (data.jenis === "esai") {
    return { ok: true, soal_id: soalId, tanggal };
  }
  const { error: errKunci } = await service
    .from("pf_quiz_answers")
    .insert({
      soal_id: soalId,
      kunci: data.kunci,
      kunci_teks: data.kunci_teks,
      kunci_jamaks: data.kunci_jamaks,
    });
  if (errKunci) {
    if (kodeTabelBelumAda(errKunci)) {
      // Tabel kunci belum ada: hapus-balik soal agar tidak ada
      // soal tanpa kunci yang bisa dijawab (jawab akan 404).
      await service.from("pf_quiz_questions").delete().eq("id", soalId);
      return { ok: false, kode: "belum_tersedia" };
    }
    console.error("[akademi/soal] gagal tulis kunci, hapus-balik soal:", errKunci);
    const { error: errHapus } = await service
      .from("pf_quiz_questions")
      .delete()
      .eq("id", soalId);
    if (errHapus) {
      console.error(
        "[akademi/soal] SOAL YATIM TANPA KUNCI (hapus-balik gagal):",
        soalId,
        errHapus,
      );
    }
    return { ok: false, kode: "gagal" };
  }
  return { ok: true, soal_id: soalId, tanggal };
}
