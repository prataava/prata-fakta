import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import {
  buatRateLimiter,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";
import {
  catatAuditWajib,
  responGalatAudit,
} from "@/lib/admin/audit";

// GET /api/sumber — daftar semua sumber (publik, untuk halaman manajemen).
// POST /api/sumber — tambah sumber, HANYA super_admin/editor.
// Rate limiting: 30 req/menit untuk GET, 10 req/menit untuk POST —
// limiter database lintas instance (Tahap 13A, T3), kunci per-akun
// bila login, per-IP bila anonim.
// 503 jujur bila tabel pf_sources belum ada (migrasi belum dijalankan).
// POST menulis audit fail-closed (Tahap 13A, T10): gagal audit →
// operasi ditolak (503/500), bukan 201 diam-diam.
const batasiGet = buatRateLimiter(30);
const batasiPost = buatRateLimiter(10);

const JENIS_VALID = ["rss", "api", "resmi", "manual"] as const;

const KOLOM_SUMBER =
  "id,nama,jenis,url,aktif,prioritas,terakhir_cek,status_terakhir,terakhir_diambil,jumlah_item";

export async function GET(req: Request) {
  if (!(await batasiGet(req))) return responRateLimit();

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
  if (!(await batasiPost(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

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
  // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh menambah
  // sumber — sebelumnya hanya peran yang diperiksa.
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", user.id)
      .maybeSingle();
    if (profil && (profil as { nonaktif: boolean }).nonaktif) {
      return NextResponse.json(
        { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
        { status: 403 },
      );
    }
  } catch {
    // Bila tabel profil belum ada, lanjut ke pemeriksaan role.
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

  // Audit fail-closed (Tahap 13A, T10): sumber baru WAJIB tercatat
  // dengan admin + waktu; gagal audit → operasi ditolak (bukan 201).
  // Catatan jujur pola Fase 7: baris sumber sudah tersisip sebelum
  // audit; bila audit gagal, respons tetap 500/503 (operasi
  // dilaporkan gagal) dan tidak ada 201 diam-diam tanpa jejak.
  try {
    await catatAuditWajib({
      aktor_id: user.id,
      aktor_email: user.email ?? null,
      aksi: "sumber.buat",
      entitas: "pf_sources",
      entitas_id: (data as { id: string }).id,
      sebelum: null,
      sesudah: { nama, jenis, url, prioritas, aktif: true },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    return responGalatAudit(err);
  }

  return NextResponse.json({ ok: true, sumber: data }, { status: 201 });
}
