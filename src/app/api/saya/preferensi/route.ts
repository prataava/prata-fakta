import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

// GET /api/saya/preferensi → preferensi pengguna yang login
// (pf_user_preferences, migrasi v8). Bila belum ada baris,
// kembalikan nilai default + ada: false (bukan 404 — preferensi
// memang belum pernah disimpan).
// PATCH /api/saya/preferensi { digest_harian?, notifikasi_topik?,
// notifikasi_koreksi?, tampilkan_profil_publik? } → upsert baris
// milik sendiri (RLS menegakkan user_id = auth.uid()).
// Wajib login (401 bila tidak). Rate limit 30/menit/IP.
// 503 jujur bila tabel belum ada (migrasi v8 belum dijalankan).
const batasi = buatRateLimiter(30);

type Preferensi = {
  digest_harian: boolean;
  notifikasi_topik: boolean;
  notifikasi_koreksi: boolean;
  tampilkan_profil_publik: boolean;
};

const DEFAULT: Preferensi = {
  digest_harian: true,
  notifikasi_topik: true,
  notifikasi_koreksi: true,
  tampilkan_profil_publik: false,
};

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

function respon503() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan preferensi belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 8 dijalankan.",
    },
    { status: 503 },
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

export async function GET(req: Request) {
  if (!batasi(ipDariRequest(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat preferensi Anda." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_user_preferences")
    .select(
      "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik",
    )
    .eq("user_id", pengguna.id)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    return NextResponse.json(
      { ok: false, error: "Gagal memuat preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ ok: true, ada: false, preferensi: DEFAULT });
  }
  const preferensi: Preferensi = {
    digest_harian: Boolean((data as Preferensi).digest_harian),
    notifikasi_topik: Boolean((data as Preferensi).notifikasi_topik),
    notifikasi_koreksi: Boolean((data as Preferensi).notifikasi_koreksi),
    tampilkan_profil_publik: Boolean(
      (data as Preferensi).tampilkan_profil_publik,
    ),
  };
  return NextResponse.json({ ok: true, ada: true, preferensi });
}

export async function PATCH(req: Request) {
  if (!batasi(ipDariRequest(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengubah preferensi." },
      { status: 401 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const perubahan: Partial<Preferensi> = {};
  for (const kunci of Object.keys(DEFAULT) as (keyof Preferensi)[]) {
    if (kunci in body) {
      if (typeof body[kunci] !== "boolean") {
        return NextResponse.json(
          { ok: false, error: `Nilai ${kunci} harus boolean.` },
          { status: 400 },
        );
      }
      perubahan[kunci] = body[kunci] as boolean;
    }
  }
  if (Object.keys(perubahan).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada preferensi yang diubah." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_user_preferences")
    .upsert(
      { user_id: pengguna.id, ...perubahan },
      { onConflict: "user_id" },
    )
    .select(
      "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik",
    )
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  const preferensi: Preferensi = {
    digest_harian: Boolean((data as Preferensi).digest_harian),
    notifikasi_topik: Boolean((data as Preferensi).notifikasi_topik),
    notifikasi_koreksi: Boolean((data as Preferensi).notifikasi_koreksi),
    tampilkan_profil_publik: Boolean(
      (data as Preferensi).tampilkan_profil_publik,
    ),
  };
  return NextResponse.json({ ok: true, ada: true, preferensi });
}
