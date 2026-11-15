import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";

// GET /api/sumber — daftar semua sumber (publik, untuk halaman manajemen).
// POST /api/sumber — tambah sumber, HANYA super_admin/editor.
// Rate limiting: 30 req/menit/IP untuk GET, 10 req/menit/IP untuk POST
// (pola yang sama dengan /api/langganan).
// 503 jujur bila tabel pf_sources belum ada (migrasi belum dijalankan).
const BATAS_GET = 30;
const BATAS_POST = 10;
const JENDELA_MS = 60_000;
const hitunganGet = new Map<string, { n: number; mulai: number }>();
const hitunganPost = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(
  ip: string,
  hitungan: Map<string, { n: number; mulai: number }>,
  batas: number,
): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= batas) return false;
  entri.n += 1;
  return true;
}

function ipDari(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal"
  );
}

const JENIS_VALID = ["rss", "api", "resmi", "manual"] as const;

const KOLOM_SUMBER =
  "id,nama,jenis,url,aktif,prioritas,terakhir_cek,status_terakhir,terakhir_diambil,jumlah_item";

export async function GET(req: Request) {
  const ip = ipDari(req);
  if (!lolosRateLimit(ip, hitunganGet, BATAS_GET)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_sources")
    .select(KOLOM_SUMBER)
    .order("prioritas", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, sumber: data ?? [] });
}

export async function POST(req: Request) {
  const ip = ipDari(req);
  if (!lolosRateLimit(ip, hitunganPost, BATAS_POST)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  // Hanya super_admin/editor.
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
      { ok: false, error: "Anda tidak punya akses untuk menambah sumber." },
      { status: 403 },
    );
  }

  let body: { nama?: unknown; jenis?: unknown; url?: unknown; prioritas?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  const jenis = typeof body.jenis === "string" ? body.jenis.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const prioritas =
    body.prioritas === undefined ? 50 : body.prioritas;

  if (!nama || nama.length > 120) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nama sumber wajib diisi (maksimal 120 karakter).",
      },
      { status: 400 },
    );
  }
  if (!JENIS_VALID.includes(jenis as (typeof JENIS_VALID)[number])) {
    return NextResponse.json(
      {
        ok: false,
        error: "Jenis sumber tidak valid (rss, api, resmi, atau manual).",
      },
      { status: 400 },
    );
  }
  let urlValid = false;
  try {
    const parsed = new URL(url);
    urlValid =
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      url.length <= 500;
  } catch {
    urlValid = false;
  }
  if (!urlValid) {
    return NextResponse.json(
      {
        ok: false,
        error: "URL sumber tidak valid (harus http(s), maksimal 500 karakter).",
      },
      { status: 400 },
    );
  }
  if (
    typeof prioritas !== "number" ||
    !Number.isInteger(prioritas) ||
    prioritas < 0 ||
    prioritas > 100
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Prioritas harus bilangan bulat 0–100.",
      },
      { status: 400 },
    );
  }

  // Insert via klien user — RLS menegakkan izin tulis.
  const { data, error } = await supabase
    .from("pf_sources")
    .insert({ nama, jenis, url, prioritas, aktif: true })
    .select(KOLOM_SUMBER)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "URL sumber ini sudah terdaftar." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, sumber: data }, { status: 201 });
}
