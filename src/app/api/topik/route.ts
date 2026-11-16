import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { KATEGORI_UTAMA } from "@/lib/categories";
import {
  buatRateLimiter,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Rate limit 30/menit/IP (temuan T3 audit keamanan Fase 7).
const batasi = buatRateLimiter(30);

// GET /api/topik → daftar topik yang diikuti pengguna
// POST /api/topik { tipe, target } → ikuti topik
// DELETE /api/topik { id } atau { tipe, target } → berhenti mengikuti
// Wajib login (401 bila tidak). 503 jujur bila tabel
// pf_followed_topics belum ada (migrasi v6 belum dijalankan).
const TIPE_VALID = ["kategori", "negara", "isu"] as const;

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
        "Layanan topik belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 6 dijalankan.",
    },
    { status: 503 },
  );
}

/** Validasi target topik (D3, Fase 8 Gelombang 1 — diekspos untuk uji).
 *  kategori wajib slug taksonomi yang dikenal; negara/isu wajib
 *  huruf, spasi, tanda hubung, dan apostrof saja (tanpa angka,
 *  URL, atau simbol — typo seperti "Ind0nesia" atau tautan
 *  tertolak di API). Validasi penuh negara terhadap tabel
 *  pf_countries ada di negaraAda() (Gelombang 2) dan dipakai
 *  POST — validasiTarget murni tetap seperti sebelumnya. */
export function validasiTarget(
  tipe: string,
  target: string,
): string | null {
  if (!TIPE_VALID.includes(tipe as (typeof TIPE_VALID)[number])) {
    return "Tipe topik tidak valid (kategori, negara, atau isu).";
  }
  if (!target || target.length > 120) {
    return "Target topik wajib diisi (maksimal 120 karakter).";
  }
  if (tipe === "kategori") {
    const dikenal = KATEGORI_UTAMA.some((k) => k.slug === target);
    if (!dikenal) return "Kategori tidak dikenal.";
  } else if (!/^[\p{L}\p{M}][\p{L}\p{M} '\-’]*$/u.test(target)) {
    return "Target topik hanya boleh berisi huruf, spasi, dan tanda hubung.";
  }
  return null;
}

/**
 * Apakah target negara ada di pf_countries (Gelombang 2, Area 11)?
 * Cocok dengan nama (case-insensitive) ATAU kode ISO-2
 * (case-insensitive). Fail-OPEN bila tabel belum ada / query
 * gagal (migrasi v10 belum dijalankan): alur follow lama tetap
 * jalan seperti sebelum Gelombang 2. Dipakai HANYA di POST
 * (mengikuti topik); DELETE tidak divalidasi agar berhenti
 * mengikuti negara yang profilnya dihapus tetap bisa.
 */
export async function negaraAda(target: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_countries")
      .select("id")
      .or(`nama.ilike.${target},kode.eq.${target.toUpperCase()}`)
      .limit(1);
    if (error) return true;
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat topik yang diikuti." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  const { data, error } = await supabase
    .from("pf_followed_topics")
    .select("id, user_id, tipe, target, dibuat_pada")
    .eq("user_id", pengguna.id)
    .order("dibuat_pada", { ascending: false });
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("GET /api/topik", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat topik yang diikuti. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, topik: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengikuti topik." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: { tipe?: unknown; target?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const tipe = typeof body.tipe === "string" ? body.tipe.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  const galat = validasiTarget(tipe, target);
  if (galat) {
    return NextResponse.json({ ok: false, error: galat }, { status: 400 });
  }
  // Gelombang 2 (Area 11): topik negara wajib merujuk profil
  // negara yang benar-benar ada di pf_countries.
  if (tipe === "negara" && !(await negaraAda(target))) {
    return NextResponse.json(
      {
        ok: false,
        error: `Negara "${target}" belum ada profilnya di PRATA FAKTA. Ikuti negara yang sudah punya profil di /negara.`,
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_followed_topics")
    .insert({ user_id: pengguna.id, tipe, target })
    .select("id, user_id, tipe, target, dibuat_pada")
    .maybeSingle();
  if (error) {
    // 23505 = unique violation → topik sudah diikuti.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, sudahDiikuti: true });
    }
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("POST /api/topik", error);
    return NextResponse.json(
      { ok: false, error: "Gagal mengikuti topik. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, topik: data ?? null });
}

export async function DELETE(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk berhenti mengikuti topik." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: { id?: unknown; tipe?: unknown; target?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const id = typeof body.id === "string" ? body.id : "";
  const tipe = typeof body.tipe === "string" ? body.tipe.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (id && !POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id tidak valid." },
      { status: 400 },
    );
  }
  if (!id) {
    const galat = validasiTarget(tipe, target);
    if (galat) {
      return NextResponse.json({ ok: false, error: galat }, { status: 400 });
    }
  }

  const supabase = await createClient();
  let query = supabase
    .from("pf_followed_topics")
    .delete()
    .eq("user_id", pengguna.id);
  if (id) query = query.eq("id", id);
  else query = query.eq("tipe", tipe).eq("target", target);
  const { error } = await query;
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("DELETE /api/topik", error);
    return NextResponse.json(
      { ok: false, error: "Gagal berhenti mengikuti topik. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
