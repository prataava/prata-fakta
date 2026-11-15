import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";

// PATCH /api/sumber/[id] — ubah sumber, HANYA super_admin/editor.
// DELETE /api/sumber/[id] — hapus sumber, HANYA super_admin.
// Menghapus sumber TIDAK menghapus raw item (FK set null).
// Rate limiting: 10 req/menit/IP untuk PATCH/DELETE (pola /api/langganan).
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

function ipDari(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal"
  );
}

const KOLOM_SUMBER =
  "id,nama,jenis,url,aktif,prioritas,terakhir_cek,status_terakhir,terakhir_diambil,jumlah_item";

/** Guard sesi + peran. Mengembalikan user id bila lolos, atau respons error. */
async function guard(
  butuhSuperAdmin: boolean,
): Promise<{ userId: string } | NextResponse> {
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
  const lolos = butuhSuperAdmin
    ? roles.includes(ROLES.SUPER_ADMIN)
    : punyaRole(roles, ROLES.EDITOR);
  if (!lolos) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses untuk mengelola sumber." },
      { status: 403 },
    );
  }
  return { userId: user.id };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = ipDari(req);
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const hasilGuard = await guard(false);
  if (hasilGuard instanceof NextResponse) return hasilGuard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  // Hanya field yang diizinkan; field lain ditolak.
  const diizinkan = ["aktif", "prioritas", "nama"];
  const takDikenal = Object.keys(body).filter((k) => !diizinkan.includes(k));
  if (takDikenal.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Field tidak diizinkan: ${takDikenal.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const patch: { aktif?: boolean; prioritas?: number; nama?: string } = {};
  if ("aktif" in body) {
    if (typeof body.aktif !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "Field aktif harus boolean." },
        { status: 400 },
      );
    }
    patch.aktif = body.aktif;
  }
  if ("prioritas" in body) {
    if (
      typeof body.prioritas !== "number" ||
      !Number.isInteger(body.prioritas) ||
      body.prioritas < 0 ||
      body.prioritas > 100
    ) {
      return NextResponse.json(
        { ok: false, error: "Prioritas harus bilangan bulat 0–100." },
        { status: 400 },
      );
    }
    patch.prioritas = body.prioritas;
  }
  if ("nama" in body) {
    const nama = typeof body.nama === "string" ? body.nama.trim() : "";
    if (!nama || nama.length > 120) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nama sumber wajib diisi (maksimal 120 karakter).",
        },
        { status: 400 },
      );
    }
    patch.nama = nama;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tidak ada perubahan yang diberikan.",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // 404 bila id tidak ada (cek dulu).
  const { data: ada, error: errCek } = await supabase
    .from("pf_sources")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (errCek) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  if (!ada) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan." },
      { status: 404 },
    );
  }

  // Update via klien user — RLS menegakkan izin tulis.
  const { data, error } = await supabase
    .from("pf_sources")
    .update(patch)
    .eq("id", id)
    .select(KOLOM_SUMBER)
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Gagal mengubah sumber. Coba lagi.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sumber: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = ipDari(req);
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const hasilGuard = await guard(true);
  if (hasilGuard instanceof NextResponse) return hasilGuard;

  const supabase = await createClient();

  const { data: ada, error: errCek } = await supabase
    .from("pf_sources")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (errCek) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  if (!ada) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan." },
      { status: 404 },
    );
  }

  // Hapus via klien user — RLS menegakkan izin (hanya super_admin).
  // Raw item tidak ikut terhapus (FK set null).
  const { error } = await supabase.from("pf_sources").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Gagal menghapus sumber. Coba lagi.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
