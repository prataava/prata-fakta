import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { ambilSemuaHalaman } from "@/lib/akun/paginasi";
import type { SupabaseClient } from "@supabase/supabase-js";

// GET /api/saya/ekspor → ekspor data pengguna yang login sebagai
// JSON. HANYA data milik sendiri (semua query difilter
// user_id = id pengguna; RLS menegakkan hal yang sama).
// Isi: profil akun, preferensi, bookmark, riwayat baca, skor kuis,
// topik diikuti, notifikasi, pertanyaan, progres kursus, riwayat
// podcast, daftar putar podcast, cerita diikuti.
//
// Gelombang B2-A (A2): TANPA BATAS 1000 baris/tabel — tiap tabel
// dibaca penuh lewat paginasi .range() (ambilSemuaHalaman).
// Respons menyatakan per bagian: jumlah + lengkap (true kecuali
// batas keselamatan 100.000 baris/tabel tercapai — praktis tidak
// terjangkau — yang ditandai terpotong). Ekspor pra-hapus ini
// yang dipakai halaman hapus akun sebelum penghapusan.
// Wajib login (401 bila tidak). Rate limit 30/menit/IP.
// 503 jujur bila tabel inti belum ada.
const batasi = buatRateLimiter(30);

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

type Bagian<T> = {
  baris: T[];
  jumlah: number;
  lengkap: boolean;
};

async function ambilBagian<T>(
  supabase: SupabaseClient,
  tabel: string,
  kolom: string,
  userId: string,
  urut: string,
): Promise<{ bagian: Bagian<T>; galatTabel: boolean }> {
  let galatTabel = false;
  const { baris, lengkap } = await ambilSemuaHalaman<T>(
    async (dari, sampai) => {
      const { data, error } = await supabase
        .from(tabel)
        .select(kolom)
        .eq("user_id", userId)
        .order(urut, { ascending: false })
        .range(dari, sampai);
      if (error) {
        if (tabelBelumAda(error)) {
          galatTabel = true;
          return [];
        }
        throw error;
      }
      return (data ?? []) as T[];
    },
  );
  return { bagian: { baris, jumlah: baris.length, lengkap }, galatTabel };
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  let pengguna: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    pengguna = data.user ?? null;
  } catch {
    pengguna = null;
  }
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengekspor data Anda." },
      { status: 401 },
    );
  }

  const supabase = await createClient();
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  const userId = pengguna.id;

  const { data: preferensi, error: errPreferensi } = await supabase
    .from("pf_user_preferences")
    .select(
      "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik, dibuat_pada, diperbarui_pada",
    )
    .eq("user_id", userId)
    .maybeSingle();

  let hasil: { bagian: Bagian<unknown>; galatTabel: boolean }[];
  try {
    hasil = await Promise.all([
      ambilBagian(
        supabase,
        "pf_bookmarks",
        "artikel_id, dibuat_pada, pf_articles(slug, judul)",
        userId,
        "dibuat_pada",
      ),
      ambilBagian(
        supabase,
        "pf_reading_history",
        "artikel_id, dibaca_pada, durasi_detik, selesai, pf_articles(slug, judul)",
        userId,
        "dibaca_pada",
      ),
      ambilBagian(
        supabase,
        "pf_quiz_scores",
        "tanggal, benar, total, dibuat_pada",
        userId,
        "tanggal",
      ),
      ambilBagian(
        supabase,
        "pf_followed_topics",
        "tipe, target, dibuat_pada",
        userId,
        "dibuat_pada",
      ),
      ambilBagian(
        supabase,
        "pf_notifications",
        "jenis, judul, isi, tautan, dibaca, dibuat_pada",
        userId,
        "dibuat_pada",
      ),
      ambilBagian(
        supabase,
        "pf_questions",
        "pertanyaan, jawaban, status, dibuat_pada, dijawab_pada",
        userId,
        "dibuat_pada",
      ),
      ambilBagian(
        supabase,
        "pf_course_progress",
        "lesson_id, selesai, skor, dibuat_pada, diperbarui_pada",
        userId,
        "diperbarui_pada",
      ),
      ambilBagian(
        supabase,
        "pf_podcast_history",
        "episode_id, posisi_detik, selesai, dibuat_pada, diperbarui_pada",
        userId,
        "diperbarui_pada",
      ),
      ambilBagian(
        supabase,
        "pf_podcast_playlist_items",
        "episode_id, urutan, dibuat_pada",
        userId,
        "dibuat_pada",
      ),
      ambilBagian(
        supabase,
        "pf_story_followers",
        "story_id, dibuat_pada, pf_stories(slug, judul)",
        userId,
        "dibuat_pada",
      ),
    ]);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Gagal membaca data Anda. Coba lagi." },
      { status: 500 },
    );
  }

  // Tabel inti (v2/v6/v7) belum ada → 503 jujur. Preferensi (v8)
  // yang belum ada hanya membuat bagiannya null, bukan gagal total.
  // Tabel tambahan (v10) yang belum ada: bagiannya kosong +
  // lengkap: false, bukan gagal total.
  const inti = hasil.slice(0, 6);
  if (inti.some((r) => r.galatTabel)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan ekspor belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi dijalankan.",
      },
      { status: 503 },
    );
  }
  const [
    bookmark,
    riwayat,
    skor,
    topik,
    notif,
    tanya,
    progresKursus,
    riwayatPodcast,
    daftarPodcast,
    pengikutCerita,
  ] = hasil;

  const jumlah: Record<string, number> = {
    bookmark: bookmark.bagian.jumlah,
    riwayat_baca: riwayat.bagian.jumlah,
    skor_kuis: skor.bagian.jumlah,
    topik_diikuti: topik.bagian.jumlah,
    notifikasi: notif.bagian.jumlah,
    pertanyaan: tanya.bagian.jumlah,
    progres_kursus: progresKursus.bagian.jumlah,
    riwayat_podcast: riwayatPodcast.bagian.jumlah,
    daftar_podcast: daftarPodcast.bagian.jumlah,
    pengikut_cerita: pengikutCerita.bagian.jumlah,
  };
  const lengkap: Record<string, boolean> = {
    bookmark: bookmark.bagian.lengkap,
    riwayat_baca: riwayat.bagian.lengkap,
    skor_kuis: skor.bagian.lengkap,
    topik_diikuti: topik.bagian.lengkap,
    notifikasi: notif.bagian.lengkap,
    pertanyaan: tanya.bagian.lengkap,
    progres_kursus: progresKursus.bagian.lengkap && !progresKursus.galatTabel,
    riwayat_podcast:
      riwayatPodcast.bagian.lengkap && !riwayatPodcast.galatTabel,
    daftar_podcast:
      daftarPodcast.bagian.lengkap && !daftarPodcast.galatTabel,
    pengikut_cerita:
      pengikutCerita.bagian.lengkap && !pengikutCerita.galatTabel,
  };
  const semuaLengkap = Object.values(lengkap).every(Boolean);

  const data = {
    diekspor_pada: new Date().toISOString(),
    pengguna: { id: userId, email: pengguna.email ?? null },
    preferensi: errPreferensi ? null : (preferensi ?? null),
    bookmark: bookmark.bagian.baris,
    riwayat_baca: riwayat.bagian.baris,
    skor_kuis: skor.bagian.baris,
    topik_diikuti: topik.bagian.baris,
    notifikasi: notif.bagian.baris,
    pertanyaan: tanya.bagian.baris,
    progres_kursus: progresKursus.bagian.baris,
    riwayat_podcast: riwayatPodcast.bagian.baris,
    daftar_podcast: daftarPodcast.bagian.baris,
    pengikut_cerita: pengikutCerita.bagian.baris,
    jumlah,
    lengkap,
    catatan: semuaLengkap
      ? "Ekspor lengkap tanpa batas baris. Data ini hanya milik akun Anda."
      : "Sebagian bagian tidak lengkap (tabel belum tersedia atau batas keselamatan tercapai) — lihat penanda lengkap per bagian.",
  };
  return NextResponse.json({ ok: true, data });
}
