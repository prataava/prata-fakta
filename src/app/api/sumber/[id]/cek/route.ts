import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";

// POST /api/sumber/[id]/cek — periksa koneksi sumber, HANYA super_admin/editor.
// Mengambil URL sumber, mengukur waktu respons, dan menyimpan hasilnya ke
// terakhir_cek + status_terakhir. Kegagalan koneksi sumber adalah HASIL
// pemeriksaan (ok:false), bukan error server — tidak pernah 500 karenanya.
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const BATAS = 10;
const JENDELA_MS = 60_000;
const hitungan = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(ip: string): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= BATAS) return false;
  entri.n += 1;
  return true;
}

const TIMEOUT_MS = 10_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses untuk memeriksa sumber." },
      { status: 403 },
    );
  }

  const { data: sumber, error: errSumber } = await supabase
    .from("pf_sources")
    .select("id,nama,url")
    .eq("id", id)
    .maybeSingle();
  if (errSumber) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  if (!sumber) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan." },
      { status: 404 },
    );
  }

  const mulai = Date.now();
  let http: number | null = null;
  let ok = false;
  let statusTerakhir: string;
  try {
    const res = await fetch(sumber.url as string, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    http = res.status;
    ok = res.status >= 200 && res.status < 300;
    // Habiskan body agar koneksi tidak menggantung; abaikan isinya.
    await res.arrayBuffer().catch(() => undefined);
    const ms = Date.now() - mulai;
    statusTerakhir = ok
      ? `ok HTTP ${http}, ${ms} ms`
      : `gagal: HTTP ${http}, ${ms} ms`;
  } catch (err) {
    const ms = Date.now() - mulai;
    const pesan =
      err instanceof Error ? err.message : "tidak dapat terhubung";
    statusTerakhir = `gagal: ${pesan}, ${ms} ms`;
  }
  const ms = Date.now() - mulai;
  statusTerakhir = statusTerakhir.slice(0, 200);

  // Simpan hasil pemeriksaan via klien user (RLS menegakkan izin tulis).
  await supabase
    .from("pf_sources")
    .update({
      terakhir_cek: new Date().toISOString(),
      status_terakhir: statusTerakhir,
    })
    .eq("id", id);

  return NextResponse.json({
    ok,
    http,
    ms,
    status_terakhir: statusTerakhir,
  });
}
