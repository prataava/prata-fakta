// /api/podcast/playlist — playlist pengguna (auth wajib).
// GET: daftar playlist (episode terbit saja).
// POST: tambah episode ke playlist { episode_id }.
// DELETE: hapus episode dari playlist (?episode_id=...).
// Tulis via session client — RLS hanya mengizinkan pemilik
// (auth.uid() = user_id). Episode harus terbit.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlaylist } from "@/lib/podcast";

async function penggunaAtau401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

export async function GET() {
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat playlist." },
      { status: 401 },
    );
  }
  const playlist = await getPlaylist(sesi.user.id);
  return NextResponse.json({ ok: true, playlist });
}

export async function POST(req: Request) {
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menyimpan playlist." },
      { status: 401 },
    );
  }
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
    return NextResponse.json(
      { ok: false, error: "Gagal menambah playlist. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, sudahAda: false });
}

export async function DELETE(req: Request) {
  const sesi = await penggunaAtau401();
  if (!sesi) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengubah playlist." },
      { status: 401 },
    );
  }
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
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus dari playlist. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
