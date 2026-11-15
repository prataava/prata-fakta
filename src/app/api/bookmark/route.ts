import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/bookmark?artikel_id=… → { bookmarked }
// POST /api/bookmark { artikel_id } → toggle insert/delete → { bookmarked }
// Wajib login (401 bila tidak). Validasi UUID. Bila tabel pf_bookmarks
// belum ada, kembalikan 503 jujur (bukan pura-pura sukses).
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

async function penggunaMasuk() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

function respon503() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan bookmark belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
    },
    { status: 503 },
  );
}

export async function GET(req: Request) {
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk memakai bookmark." },
      { status: 401 },
    );
  }
  const artikelId = new URL(req.url).searchParams.get("artikel_id") ?? "";
  if (!POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_bookmarks")
    .select("artikel_id")
    .eq("user_id", pengguna.id)
    .eq("artikel_id", artikelId)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa bookmark. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, bookmarked: Boolean(data) });
}

export async function POST(req: Request) {
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk memakai bookmark." },
      { status: 401 },
    );
  }

  let artikelId = "";
  try {
    const body = (await req.json()) as { artikel_id?: unknown };
    artikelId = typeof body.artikel_id === "string" ? body.artikel_id : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  if (!POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: ada, error: errCek } = await supabase
    .from("pf_bookmarks")
    .select("artikel_id")
    .eq("user_id", pengguna.id)
    .eq("artikel_id", artikelId)
    .maybeSingle();
  if (errCek) {
    if (tabelBelumAda(errCek)) return respon503();
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa bookmark. Coba lagi." },
      { status: 500 },
    );
  }

  if (ada) {
    const { error } = await supabase
      .from("pf_bookmarks")
      .delete()
      .eq("user_id", pengguna.id)
      .eq("artikel_id", artikelId);
    if (error) {
      if (tabelBelumAda(error)) return respon503();
      return NextResponse.json(
        { ok: false, error: "Gagal menghapus bookmark. Coba lagi." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, bookmarked: false });
  }

  const { error } = await supabase
    .from("pf_bookmarks")
    .insert({ user_id: pengguna.id, artikel_id: artikelId });
  if (error) {
    // 23505 = unique violation → sudah ter-bookmark (balapan request).
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, bookmarked: true });
    }
    if (tabelBelumAda(error)) return respon503();
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan bookmark. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, bookmarked: true });
}
