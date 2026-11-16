import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Rate limit 30/menit/IP (temuan T3 audit keamanan Fase 7).
const batasi = buatRateLimiter(30);

// GET /api/notifikasi → daftar notifikasi pengguna (terbaru dulu)
// PATCH /api/notifikasi { id } atau { semua: true } → tandai dibaca
// Wajib login (401 bila tidak). 503 jujur bila tabel
// pf_notifications belum ada (migrasi v6 belum dijalankan).
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
        "Layanan notifikasi belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 6 dijalankan.",
    },
    { status: 503 },
  );
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat notifikasi." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  const { data, error } = await supabase
    .from("pf_notifications")
    .select("id, user_id, jenis, judul, isi, tautan, dibaca, dibuat_pada")
    .eq("user_id", pengguna.id)
    .order("dibuat_pada", { ascending: false })
    .limit(20);
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("GET /api/notifikasi", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat notifikasi. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, notifikasi: data ?? [] });
}

export async function PATCH(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengubah notifikasi." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: { id?: unknown; semua?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const semua = body.semua === true;
  const id = typeof body.id === "string" ? body.id : "";
  if (!semua && !POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("pf_notifications")
    .update({ dibaca: true })
    .eq("user_id", pengguna.id);
  if (!semua) query = query.eq("id", id);
  const { error } = await query;
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("PATCH /api/notifikasi", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menandai notifikasi dibaca. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
