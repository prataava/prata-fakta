// Langganan push VAPID untuk TAMU (Tugas 1, v26) — pelengkap
// /api/push/langganan yang HANYA untuk pengguna masuk.
//   POST   { endpoint, keys: { p256dh, auth } } (atau dibungkus
//          { subscription: {...} } seperti langganan lama)
//          → upsert langganan (satu endpoint = satu baris)
//   DELETE { endpoint } → hapus langganan sendiri
// Tamu BOLEH subscribe (user_id NULL, migrasi v26) agar broadcast
// admin sampai ke semua perangkat; pengguna masuk yang memanggil
// route ini TETAP terikat ke akunnya (user_id dari SESI — id
// pengguna dari klien TIDAK PERNAH dipercaya: siapa pun bisa
// menempel ke id orang lain dan menerima notifikasinya).
// Tulis lewat service client (tamu tidak punya sesi/RLS) —
// dilindungi rate limit KERAS 30/menit (fail-closed, langganan
// termasuk endpoint berisiko tinggi) + cek Origin + validasi
// ketat. 503 jujur bila service key / tabel belum siap.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  cekOrigin,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

const batasiKeras = buatRateLimiterKeras(30);

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

function respon503Tabel() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan push belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v14/v26 dijalankan.",
    },
    { status: 503 },
  );
}

type LanggananMasuk = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

/**
 * Validasi murni (bentuk langganan push Web Push API).
 * Menerima bentuk datar {endpoint, keys} ATAU terbungkus
 * {subscription: {endpoint, keys}} (kompatibel klien lama).
 * Batas sama seperti /api/push/langganan: endpoint https ≤2000,
 * p256dh/auth tak kosong ≤300.
 */
function validasiLangganan(
  masuk: unknown,
): { endpoint: string; p256dh: string; auth: string } | null {
  if (!masuk || typeof masuk !== "object") return null;
  const m = masuk as LanggananMasuk & { subscription?: unknown };
  const inti =
    m.subscription && typeof m.subscription === "object"
      ? (m.subscription as LanggananMasuk)
      : m;
  const endpoint =
    typeof inti.endpoint === "string" ? inti.endpoint.trim() : "";
  const keys = inti.keys && typeof inti.keys === "object" ? inti.keys : null;
  const p256dh =
    keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!/^https:\/\/.+/.test(endpoint) || endpoint.length > 2000) return null;
  if (!p256dh || p256dh.length > 300) return null;
  if (!auth || auth.length > 300) return null;
  return { endpoint, p256dh, auth };
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

export async function POST(req: Request) {
  const hasil = await batasiKeras(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const langganan = validasiLangganan(body);
  if (!langganan) {
    return NextResponse.json(
      { ok: false, error: "Langganan push tidak valid." },
      { status: 400 },
    );
  }
  // user_id dari SESI (bila masuk) atau NULL (tamu). Field id
  // pengguna dari body SENGAJA tidak dibaca — lihat komentar di
  // atas berkas.
  const pengguna = await penggunaMasuk();
  if (pengguna) {
    const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
    if (ditolak) return ditolak;
  }
  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan push belum siap (kunci service belum diatur)." },
      { status: 503 },
    );
  }
  const { error } = await service.from("pf_push_subscriptions").upsert(
    {
      user_id: pengguna ? pengguna.id : null,
      endpoint: langganan.endpoint,
      p256dh: langganan.p256dh,
      auth: langganan.auth,
      diperbarui_pada: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    if (tabelBelumAda(error)) return respon503Tabel();
    void catatGalatRoute("POST /api/notifications/subscribe", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan langganan push." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    terdaftar: true,
    tamu: pengguna === null,
  });
}

export async function DELETE(req: Request) {
  const hasil = await batasiKeras(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
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
  // Hapus HANYA baris milik pemanggil: pengguna masuk menghapus
  // baris ber-user_id miliknya; tamu hanya boleh menghapus baris
  // tamu (user_id NULL) — tamu tidak boleh menghapus langganan
  // orang lain dengan menebak endpoint-nya.
  const pengguna = await penggunaMasuk();
  if (pengguna) {
    const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
    if (ditolak) return ditolak;
  }
  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan push belum siap (kunci service belum diatur)." },
      { status: 503 },
    );
  }
  const hapus = service
    .from("pf_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  const { error } = pengguna
    ? await hapus.eq("user_id", pengguna.id)
    : await hapus.is("user_id", null);
  if (error) {
    if (tabelBelumAda(error)) return respon503Tabel();
    void catatGalatRoute("DELETE /api/notifications/subscribe", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus langganan push." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, terdaftar: false });
}
