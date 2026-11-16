import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { apakahPushTerkonfigurasi } from "@/lib/notifikasi/push";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Langganan push VAPID milik sendiri (Gelombang B2-D, E3).
//   GET    /api/push/langganan → { ok, terdaftar, terkonfigurasi }
//   POST   { subscription: { endpoint, keys: { p256dh, auth } } }
//          → upsert langganan (satu endpoint = satu baris)
//   DELETE { endpoint } → hapus langganan sendiri
// Wajib login (401). Rate limit 30/menit/IP. Tulis lewat session
// client — RLS pf_push_subscriptions hanya mengizinkan pemilik
// (v14). 503 jujur bila tabel v14 belum ada.
const batasi = buatRateLimiter(30);

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
        "Layanan push belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v14 dijalankan.",
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

type LanggananMasuk = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validasiLangganan(
  masuk: unknown,
): { endpoint: string; p256dh: string; auth: string } | null {
  if (!masuk || typeof masuk !== "object") return null;
  const m = masuk as LanggananMasuk;
  const endpoint = typeof m.endpoint === "string" ? m.endpoint.trim() : "";
  const keys = m.keys && typeof m.keys === "object" ? m.keys : null;
  const p256dh =
    keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!/^https:\/\/.+/.test(endpoint) || endpoint.length > 2000) return null;
  if (!p256dh || p256dh.length > 300) return null;
  if (!auth || auth.length > 300) return null;
  return { endpoint, p256dh, auth };
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  const { count, error } = await supabase
    .from("pf_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", pengguna.id);
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("GET /api/push/langganan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa langganan push." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    terdaftar: (count ?? 0) > 0,
    terkonfigurasi: apakahPushTerkonfigurasi(),
  });
}

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const langganan = validasiLangganan(
    (body as { subscription?: unknown } | null)?.subscription,
  );
  if (!langganan) {
    return NextResponse.json(
      { ok: false, error: "Langganan push tidak valid." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.from("pf_push_subscriptions").upsert(
    {
      user_id: pengguna.id,
      endpoint: langganan.endpoint,
      p256dh: langganan.p256dh,
      auth: langganan.auth,
      diperbarui_pada: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("POST /api/push/langganan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan langganan push." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, terdaftar: true });
}

export async function DELETE(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const endpoint =
    typeof (body as { endpoint?: unknown } | null)?.endpoint === "string"
      ? ((body as { endpoint: string }).endpoint ?? "").trim()
      : "";
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "endpoint wajib diisi." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("pf_push_subscriptions")
    .delete()
    .eq("user_id", pengguna.id)
    .eq("endpoint", endpoint);
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("DELETE /api/push/langganan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus langganan push." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, terdaftar: false });
}
