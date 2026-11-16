import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";

// GET /api/saya/ekspor → ekspor data pengguna yang login sebagai
// JSON. HANYA data milik sendiri (semua query difilter
// user_id = id pengguna; RLS menegakkan hal yang sama).
// Isi: profil akun, preferensi, bookmark, riwayat baca, skor kuis,
// topik diikuti, notifikasi, pertanyaan. Batas 1000 baris per
// tabel (riwayat/bookmark yang lebih tua tidak ikut — batas ini
// dinyatakan di respons, bukan disembunyikan).
// Wajib login (401 bila tidak). Rate limit 30/menit/IP.
// 503 jujur bila tabel inti belum ada.
const batasi = buatRateLimiter(30);
const BATAS_BARIS = 1000;

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
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
  const [preferensi, bookmark, riwayat, skor, topik, notif, tanya] =
    await Promise.all([
      supabase
        .from("pf_user_preferences")
        .select(
          "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik, dibuat_pada, diperbarui_pada",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("pf_bookmarks")
        .select("artikel_id, dibuat_pada, pf_articles(slug, judul)")
        .eq("user_id", userId)
        .order("dibuat_pada", { ascending: false })
        .limit(BATAS_BARIS),
      supabase
        .from("pf_reading_history")
        .select("artikel_id, dibaca_pada, durasi_detik, selesai, pf_articles(slug, judul)")
        .eq("user_id", userId)
        .order("dibaca_pada", { ascending: false })
        .limit(BATAS_BARIS),
      supabase
        .from("pf_quiz_scores")
        .select("tanggal, benar, total, dibuat_pada")
        .eq("user_id", userId)
        .order("tanggal", { ascending: false })
        .limit(BATAS_BARIS),
      supabase
        .from("pf_followed_topics")
        .select("tipe, target, dibuat_pada")
        .eq("user_id", userId)
        .order("dibuat_pada", { ascending: false })
        .limit(BATAS_BARIS),
      supabase
        .from("pf_notifications")
        .select("jenis, judul, isi, tautan, dibaca, dibuat_pada")
        .eq("user_id", userId)
        .order("dibuat_pada", { ascending: false })
        .limit(BATAS_BARIS),
      supabase
        .from("pf_questions")
        .select("pertanyaan, jawaban, status, dibuat_pada, dijawab_pada")
        .eq("user_id", userId)
        .order("dibuat_pada", { ascending: false })
        .limit(BATAS_BARIS),
    ]);

  // Tabel inti (v2/v6/v7) belum ada → 503 jujur. Preferensi (v8)
  // yang belum ada hanya membuat bagiannya null, bukan gagal total.
  for (const res of [bookmark, riwayat, skor, topik, notif, tanya]) {
    if (res.error && tabelBelumAda(res.error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan ekspor belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi dijalankan.",
        },
        { status: 503 },
      );
    }
  }

  const data = {
    diekspor_pada: new Date().toISOString(),
    pengguna: { id: userId, email: pengguna.email ?? null },
    preferensi: preferensi.error ? null : (preferensi.data ?? null),
    bookmark: bookmark.data ?? [],
    riwayat_baca: riwayat.data ?? [],
    skor_kuis: skor.data ?? [],
    topik_diikuti: topik.data ?? [],
    notifikasi: notif.data ?? [],
    pertanyaan: tanya.data ?? [],
    catatan: `Maksimal ${BATAS_BARIS} baris per bagian. Data ini hanya milik akun Anda.`,
  };
  return NextResponse.json({ ok: true, data });
}
