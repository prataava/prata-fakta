import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";
import {
  catatAuditWajib,
  responGalatAudit,
} from "@/lib/admin/audit";

// PATCH /api/sumber/[id] — ubah sumber, HANYA super_admin/editor.
// DELETE /api/sumber/[id] — hapus sumber, HANYA super_admin.
// Menghapus sumber TIDAK menghapus raw item (FK set null).
// Rate limiting: 10 req/menit (limiter database lintas instance,
// Tahap 13A, T3). Audit fail-closed (Tahap 13A, T10): PATCH/DELETE
// menulis audit dengan admin + waktu; gagal audit → operasi ditolak.
const batasi = buatRateLimiter(10);

const KOLOM_SUMBER =
  "id,nama,jenis,url,aktif,prioritas,terakhir_cek,status_terakhir,terakhir_diambil,jumlah_item";

/** Guard sesi + peran. Mengembalikan id + email user bila lolos, atau respons error. */
async function guard(
  butuhSuperAdmin: boolean,
): Promise<{ userId: string; email: string | null } | NextResponse> {
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
  // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh mengelola
  // sumber — guard ini dipakai PATCH (editor) dan DELETE (super_admin).
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
  const lolos = butuhSuperAdmin
    ? roles.includes(ROLES.SUPER_ADMIN)
    : punyaRole(roles, ROLES.EDITOR);
  if (!lolos) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses untuk mengelola sumber." },
      { status: 403 },
    );
  }
  return { userId: user.id, email: user.email ?? null };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await batasi(req))) return responRateLimit();

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

  // 404 bila id tidak ada (cek dulu) — sekalian ambil keadaan lama
  // untuk kolom `sebelum` audit (Tahap 13A, T10).
  const { data: ada, error: errCek } = await supabase
    .from("pf_sources")
    .select("id,nama,jenis,url,aktif,prioritas")
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

  // Audit fail-closed (Tahap 13A, T10): ubah konfigurasi →
  // "sumber.ubah"; bila SATU-SATUNYA yang berubah adalah status
  // aktif/nonaktif → "sumber.aktif" (mudah dilacak di /admin/audit).
  // Gagal audit → operasi ditolak (bukan 200 diam-diam).
  const lama = ada as {
    nama: string;
    jenis: string;
    url: string;
    aktif: boolean;
    prioritas: number;
  };
  const hanyaAktif = Object.keys(patch).length === 1 && "aktif" in patch;
  try {
    await catatAuditWajib({
      aktor_id: hasilGuard.userId,
      aktor_email: hasilGuard.email,
      aksi: hanyaAktif ? "sumber.aktif" : "sumber.ubah",
      entitas: "pf_sources",
      entitas_id: id,
      sebelum: {
        nama: lama.nama,
        jenis: lama.jenis,
        url: lama.url,
        aktif: lama.aktif,
        prioritas: lama.prioritas,
      },
      sesudah: {
        nama: (data as { nama: string }).nama,
        jenis: (data as { jenis: string }).jenis,
        url: (data as { url: string }).url,
        aktif: (data as { aktif: boolean }).aktif,
        prioritas: (data as { prioritas: number }).prioritas,
      },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    return responGalatAudit(err);
  }

  return NextResponse.json({ ok: true, sumber: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await batasi(req))) return responRateLimit();

  const { id } = await params;
  const hasilGuard = await guard(true);
  if (hasilGuard instanceof NextResponse) return hasilGuard;

  const supabase = await createClient();

  // 404 bila id tidak ada (cek dulu) — sekalian ambil keadaan lama
  // untuk kolom `sebelum` audit (Tahap 13A, T10).
  const { data: ada, error: errCek } = await supabase
    .from("pf_sources")
    .select("id,nama,jenis,url,aktif,prioritas")
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

  // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
  // ditolak (bukan 200 diam-diam).
  const lama = ada as {
    nama: string;
    jenis: string;
    url: string;
    aktif: boolean;
    prioritas: number;
  };
  try {
    await catatAuditWajib({
      aktor_id: hasilGuard.userId,
      aktor_email: hasilGuard.email,
      aksi: "sumber.hapus",
      entitas: "pf_sources",
      entitas_id: id,
      sebelum: {
        nama: lama.nama,
        jenis: lama.jenis,
        url: lama.url,
        aktif: lama.aktif,
        prioritas: lama.prioritas,
      },
      sesudah: null,
      ip: ipDariRequest(req),
    });
  } catch (err) {
    return responGalatAudit(err);
  }

  return NextResponse.json({ ok: true });
}
