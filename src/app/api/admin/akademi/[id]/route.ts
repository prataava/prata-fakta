// GET / PATCH / DELETE /api/admin/akademi/[id] (staf).
// PATCH mengubah field kursus dan/atau struktur isi:
//   { ..., modul: [{id?, kunci?, judul, deskripsi?, urutan?, hapus?}],
//     pelajaran: [{id?, module_id?, modul_kunci?, judul, isi?, jenis?,
//       referensi?, artikel_id?, kuis_tanggal?, urutan?, hapus?}] }
// Entri tanpa id = tambah baru; dengan id = ubah; hapus:true =
// hapus. `kunci` (modul baru) + `modul_kunci` (pelajaran baru)
// memungkinkan modul baru + pelajarannya dikirim dalam SATU
// panggilan — RPC memetakan kunci sementara ke id baru.
// P1-4 (B-T4, v13): SELURUH struktur ditulis oleh SATU RPC
// pf_patch_kursus_atomik dalam satu transaksi (validasi penuh
// dulu, baru tulis) — bukan lagi loop per baris tanpa rollback.
// Semua id diverifikasi milik kursus ini DI DALAM RPC sebelum
// menulis. Aksi audit: 'akademi.kursus'
// (field kursus) dan 'akademi.modul' (struktur isi) — CHECK v11 §3.
// Audit FAIL-CLOSED (Tahap 13A, T10): gagal audit → operasi ditolak.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib } from "@/lib/admin/audit";
import { validasiStruktur } from "@/lib/admin/validasi";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KOLOM_KURSUS =
  "id, slug, judul, deskripsi, kategori, tingkat, status, urutan, dibuat_pada, diperbarui_pada";
const KOLOM_MODUL = "id, course_id, judul, deskripsi, urutan";
const KOLOM_PELAJARAN =
  "id, module_id, judul, isi, jenis, referensi, artikel_id, kuis_tanggal, urutan";

function stringAtauNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Validasi murni field kursus untuk PATCH (hanya dipakai di berkas
 *  ini — bukan ekspor; Next menolak ekspor non-handler route). */
function validasiPatchKursus(
  body: Record<string, unknown>,
):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !POLA_SLUG.test(body.slug)) {
      return {
        ok: false,
        error: "Slug tidak valid (huruf kecil, angka, dan tanda -).",
      };
    }
    data.slug = body.slug;
  }
  if (body.judul !== undefined) {
    if (typeof body.judul !== "string" || body.judul.trim() === "") {
      return { ok: false, error: "Judul wajib diisi." };
    }
    if (body.judul.trim().length > 200) {
      return { ok: false, error: "Judul maksimal 200 karakter." };
    }
    data.judul = body.judul.trim();
  }
  if (body.deskripsi !== undefined) data.deskripsi = stringAtauNull(body.deskripsi);
  if (body.kategori !== undefined) {
    if (
      typeof body.kategori !== "string" ||
      body.kategori.trim() === "" ||
      body.kategori.trim().length > 60
    ) {
      return { ok: false, error: "Kategori wajib diisi (maksimal 60 karakter)." };
    }
    data.kategori = body.kategori.trim();
  }
  if (body.tingkat !== undefined) {
    if (
      body.tingkat !== "pemula" &&
      body.tingkat !== "menengah" &&
      body.tingkat !== "mendalam"
    ) {
      return { ok: false, error: "Tingkat tidak valid." };
    }
    data.tingkat = body.tingkat;
  }
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "terbit") {
      return { ok: false, error: "Status harus draft atau terbit." };
    }
    data.status = body.status;
  }
  if (body.urutan !== undefined) {
    if (
      typeof body.urutan !== "number" ||
      !Number.isInteger(body.urutan) ||
      body.urutan < 0 ||
      body.urutan > 1000
    ) {
      return { ok: false, error: "Urutan harus bilangan bulat 0 sampai 1000." };
    }
    data.urutan = body.urutan;
  }
  return { ok: true, data };
}

async function muatDetail(
  service: ReturnType<typeof createServiceClient>,
  id: string,
) {
  const { data: kursus, error: errKursus } = await service
    .from("pf_courses")
    .select(KOLOM_KURSUS)
    .eq("id", id)
    .maybeSingle();
  if (errKursus) throw errKursus;
  if (!kursus) return null;
  const { data: modul, error: errModul } = await service
    .from("pf_course_modules")
    .select(KOLOM_MODUL)
    .eq("course_id", id)
    .order("urutan", { ascending: true });
  if (errModul) throw errModul;
  const modulId = ((modul ?? []) as { id: string }[]).map((m) => m.id);
  const { data: pelajaran, error: errPelajaran } =
    modulId.length > 0
      ? await service
          .from("pf_course_lessons")
          .select(KOLOM_PELAJARAN)
          .in("module_id", modulId)
          .order("urutan", { ascending: true })
      : { data: [], error: null };
  if (errPelajaran) throw errPelajaran;
  return { kursus, modul: modul ?? [], pelajaran: pelajaran ?? [] };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const detail = await muatDetail(service, id);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "Kursus tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const validKursus = validasiPatchKursus(body);
  if (!validKursus.ok) {
    return NextResponse.json(
      { ok: false, error: validKursus.error },
      { status: 400 },
    );
  }
  const validStruktur = validasiStruktur(body);
  if (!validStruktur.ok) {
    return NextResponse.json(
      { ok: false, error: validStruktur.error },
      { status: 400 },
    );
  }
  if (
    Object.keys(validKursus.data).length === 0 &&
    validStruktur.modul.length === 0 &&
    validStruktur.pelajaran.length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang dikirim." },
      { status: 400 },
    );
  }

  try {
    const service = createServiceClient();
    const detail = await muatDetail(service, id);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "Kursus tidak ditemukan." },
        { status: 404 },
      );
    }
    // P1-4 (B-T4, v13): SELURUH perubahan struktur + field kursus
    // ditulis SATU RPC pf_patch_kursus_atomik dalam satu
    // transaksi. Validasi kepemilikan + judul + slug dilakukan
    // di dalam RPC SEBELUM menulis; gagal di tengah = tidak ada
    // satu pun baris yang berubah.
    const { data: hasilRpc, error: errRpc } = await service.rpc(
      "pf_patch_kursus_atomik",
      {
        p_kursus_id: id,
        p_kursus: validKursus.data,
        p_modul: validStruktur.modul,
        p_pelajaran: validStruktur.pelajaran,
      },
    );
    if (errRpc) {
      // Bentrok slug saat race: RPC me-raise 'slug_bentrok'
      // dengan kode 23505 (seluruh transaksi batal) → 409.
      const pesan = (errRpc as { message?: string }).message ?? "";
      const kode = (errRpc as { code?: string }).code;
      if (kode === "23505" || pesan.includes("slug_bentrok")) {
        return NextResponse.json(
          { ok: false, error: "Slug kursus sudah dipakai." },
          { status: 409 },
        );
      }
      throw errRpc;
    }
    const hasil = (hasilRpc ?? {}) as { ok?: boolean; kode?: string; id?: string; kunci?: string };
    if (hasil.ok !== true) {
      const kode = hasil.kode ?? "tidak_diketahui";
      if (kode === "kursus_tidak_ditemukan") {
        return NextResponse.json(
          { ok: false, error: "Kursus tidak ditemukan." },
          { status: 404 },
        );
      }
      if (kode === "slug_bentrok") {
        return NextResponse.json(
          { ok: false, error: "Slug kursus sudah dipakai." },
          { status: 409 },
        );
      }
      const pesanKode: Record<string, string> = {
        modul_bukan_milik_kursus: `Modul ${hasil.id ?? ""} bukan milik kursus ini.`,
        pelajaran_bukan_milik_kursus: `Pelajaran ${hasil.id ?? ""} bukan milik kursus ini.`,
        module_id_bukan_milik_kursus: "module_id tujuan bukan milik kursus ini.",
        modul_kunci_tidak_ditemukan: `modul_kunci "${hasil.kunci ?? ""}" tidak merujuk modul baru di PATCH ini.`,
        pelajaran_tanpa_modul: "Pelajaran baru wajib punya module_id atau modul_kunci.",
        modul_tanpa_judul: "Judul modul wajib diisi.",
        pelajaran_tanpa_judul: "Judul pelajaran wajib diisi.",
        modul_tanpa_id: "Hapus modul butuh id.",
        pelajaran_tanpa_id: "Hapus pelajaran butuh id.",
      };
      return NextResponse.json(
        { ok: false, error: pesanKode[kode] ?? "Perubahan kursus tidak valid." },
        { status: 400 },
      );
    }
    // Audit FAIL-CLOSED (Tahap 13A, T10): helper lama best-effort
    // (gagal insert hanya console.error) DIGANTI catatAuditWajib —
    // gagal audit melempar dan route menjawab 500/503.
    // CATATAN: audit tetap di luar transaksi RPC (keterbatasan
    // yang sama seperti sebelumnya — lihat B-T2; bila audit
    // gagal sesudah RPC commit, route menjawab 500 dan perubahan
    // kursus TETAP tersimpan, tercatat di laporan Gelombang B1).
    if (Object.keys(validKursus.data).length > 0) {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "akademi.kursus",
        entitas: "pf_courses",
        entitas_id: id,
        sebelum: null,
        sesudah: validKursus.data,
        ip: ipDariRequest(req),
      });
    }
    if (
      validStruktur.modul.length > 0 ||
      validStruktur.pelajaran.length > 0
    ) {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "akademi.modul",
        entitas: "pf_course_modules",
        entitas_id: id,
        sebelum: null,
        sesudah: {
          modul: validStruktur.modul,
          pelajaran: validStruktur.pelajaran,
        },
        ip: ipDariRequest(req),
      });
    }

    const detailBaru = await muatDetail(service, id);
    return NextResponse.json({ ok: true, ...detailBaru });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_courses")
      .delete()
      .eq("id", id)
      .select("id, slug, judul")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Kursus tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit FAIL-CLOSED (Tahap 13A, T10): lihat catatan di PATCH.
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "akademi.kursus",
      entitas: "pf_courses",
      entitas_id: id,
      sebelum: data ?? null,
      sesudah: null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, kursus: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
