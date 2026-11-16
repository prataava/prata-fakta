// POST /api/podcast/riwayat — simpan posisi dengar pengguna.
// Auth wajib (401 bila tidak login). Body: { episode_id,
// posisi_detik, selesai? }. Upsert per (user_id, episode_id).
// Episode harus terbit (draf tidak bisa didengar publik).
// Posisi TTS browser hanya disimpan saat selesai (lihat
// PemutarPodcast); posisi detik presisi hanya untuk <audio>.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menyimpan riwayat dengar." },
      { status: 401 },
    );
  }
  let body: { episode_id?: unknown; posisi_detik?: unknown; selesai?: unknown };
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
  const posisi =
    typeof body.posisi_detik === "number" &&
    Number.isFinite(body.posisi_detik) &&
    body.posisi_detik >= 0
      ? Math.floor(body.posisi_detik)
      : null;
  if (!episodeId || posisi === null) {
    return NextResponse.json(
      { ok: false, error: "episode_id dan posisi_detik (≥ 0) wajib diisi." },
      { status: 400 },
    );
  }
  const selesai = body.selesai === true;

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
          "Riwayat belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
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
  const { error } = await supabase.from("pf_podcast_history").upsert(
    {
      user_id: user.id,
      episode_id: episodeId,
      posisi_detik: posisi,
      selesai,
    },
    { onConflict: "user_id,episode_id" },
  );
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan riwayat. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
