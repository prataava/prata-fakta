// /api/podcast/playlist — playlist pengguna (auth wajib).
// GET: daftar playlist (episode terbit saja).
// POST: tambah episode ke playlist { episode_id }.
// DELETE: hapus episode dari playlist (?episode_id=...).
// Tulis via session client — RLS hanya mengizinkan pemilik
// (auth.uid() = user_id). Episode harus terbit.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { getPlaylist } from "@/lib/podcast";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Gelombang B1 (P1-5/B-S1): playlist dibatasi 30/menit
// (sebelumnya tanpa limiter sama sekali).
const lolosRateLimit = buatRateLimiter(30);

async function penggunaAtau401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat playlist." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(sesi.supabase, sesi.user.id);
  if (ditolak) return ditolak;
  const playlist = await getPlaylist(sesi.user.id);
  return NextResponse.json({ ok: true, playlist });
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menyimpan playlist." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(sesi.supabase, sesi.user.id);
  if (ditolak) return ditolak;
  let body: { episode_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const episodeId =
    typeof body.episode_id === "string" ? body.episode_id : "";
  if (!episodeId) {
    return NextResponse.json(
      { ok: false, error: "episode_id wajib diisi." },
      { status: 400 },
    );
  }
  const { supabase, user } = sesi;
  const { data: episode, error: errEpisode } = await supabase
    .from("pf_podcast_episodes")
    .select("id")
    .eq("id", episodeId)
    .eq("status", "terbit")
    .maybeSingle();
  if (errEpisode) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Playlist belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
      },
      { status: 503 },
    );
  }
  if (!episode) {
    return NextResponse.json(
      { ok: false, error: "Episode tidak ditemukan." },
      { status: 404 },
    );
  }
  const { data: sudah, error: errSudah } = await supabase
    .from("pf_podcast_playlist_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("episode_id", episodeId)
    .maybeSingle();
  if (errSudah) {
    void catatGalatRoute("POST /api/podcast/playlist", errSudah);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa playlist. Coba lagi." },
      { status: 500 },
    );
  }
  if (sudah) {
    return NextResponse.json({
      ok: true,
      sudahAda: true,
      pesan: "Episode sudah ada di playlist Anda.",
    });
  }
  const { data: maks } = await supabase
    .from("pf_podcast_playlist_items")
    .select("urutan")
    .eq("user_id", user.id)
    .order("urutan", { ascending: false })
    .limit(1)
    .maybeSingle();
  const urutan =
    maks && typeof (maks as { urutan: unknown }).urutan === "number"
      ? (maks as { urutan: number }).urutan + 1
      : 0;
  const { error } = await supabase
    .from("pf_podcast_playlist_items")
    .insert({ user_id: user.id, episode_id: episodeId, urutan });
  if (error) {
    void catatGalatRoute("POST /api/podcast/playlist", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menambah playlist. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, sudahAda: false });
}

export async function DELETE(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengubah playlist." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(sesi.supabase, sesi.user.id);
  if (ditolak) return ditolak;
  const url = new URL(req.url);
  const episodeId = url.searchParams.get("episode_id") ?? "";
  if (!episodeId) {
    return NextResponse.json(
      { ok: false, error: "episode_id wajib diisi." },
      { status: 400 },
    );
  }
  const { error } = await sesi.supabase
    .from("pf_podcast_playlist_items")
    .delete()
    .eq("user_id", sesi.user.id)
    .eq("episode_id", episodeId);
  if (error) {
    void catatGalatRoute("DELETE /api/podcast/playlist", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus dari playlist. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
