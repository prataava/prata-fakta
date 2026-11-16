// GET / PATCH / DELETE /api/admin/akademi/[id] (staf).
// PATCH mengubah field kursus dan/atau struktur isi:
//   { ..., modul: [{id?, judul, deskripsi?, urutan?, hapus?}],
//     pelajaran: [{id?, module_id, judul, isi?, jenis?,
//       referensi?, artikel_id?, kuis_tanggal?, urutan?, hapus?}] }
// Entri tanpa id = tambah baru; dengan id = ubah; hapus:true =
// hapus. Pelajaran baru hanya bisa ditambahkan ke modul yang
// sudah ada (tambah modul dulu lewat PATCH yang sama, lalu
// pelajaran di panggilan berikutnya). Semua id diverifikasi
// milik kursus ini sebelum ditulis. Aksi audit: 'akademi.kursus'
// (field kursus) dan 'akademi.modul' (struktur isi) — CHECK v9 §6.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
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

function validasiReferensi(
  v: unknown,
):
  | { ok: true; data: { judul: string | null; url: string | null }[] }
  | { ok: false; error: string } {
  if (!Array.isArray(v) || v.length > 50) {
    return { ok: false, error: "Referensi harus array maksimal 50 entri." };
  }
  const hasil: { judul: string | null; url: string | null }[] = [];
  for (const r of v as unknown[]) {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      return { ok: false, error: "Entri referensi tidak valid." };
    }
    const o = r as Record<string, unknown>;
    const judul = stringAtauNull(o.judul);
    const url = stringAtauNull(o.url);
    if (url && !/^https?:\/\/.+/i.test(url)) {
      return { ok: false, error: "URL referensi harus diawali http(s)://." };
    }
    if (!judul && !url) continue;
    hasil.push({ judul, url });
  }
  return { ok: true, data: hasil };
}

/** Validasi murni field kursus untuk PATCH (diekspos untuk uji). */
export function validasiPatchKursus(
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

export type EntriModul = {
  id?: string;
  judul?: string;
  deskripsi?: string | null;
  urutan?: number;
  hapus?: boolean;
};

export type EntriPelajaran = {
  id?: string;
  module_id?: string;
  judul?: string;
  isi?: string | null;
  jenis?: string;
  referensi?: { judul: string | null; url: string | null }[];
  artikel_id?: string | null;
  kuis_tanggal?: string | null;
  urutan?: number;
  hapus?: boolean;
};

/** Validasi murni array modul/pelajaran untuk PATCH (diekspos
 *  untuk uji). Mengembalikan entri ternormalisasi. */
export function validasiStruktur(
  body: Record<string, unknown>,
):
  | { ok: true; modul: EntriModul[]; pelajaran: EntriPelajaran[] }
  | { ok: false; error: string } {
  const modul: EntriModul[] = [];
  const pelajaran: EntriPelajaran[] = [];
  if (body.modul !== undefined) {
    if (!Array.isArray(body.modul) || body.modul.length > 50) {
      return { ok: false, error: "modul harus array maksimal 50 entri." };
    }
    for (const m of body.modul as unknown[]) {
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        return { ok: false, error: "Entri modul tidak valid." };
      }
      const o = m as Record<string, unknown>;
      const entri: EntriModul = {};
      if (o.id !== undefined) {
        if (typeof o.id !== "string" || !POLA_UUID.test(o.id)) {
          return { ok: false, error: "ID modul tidak valid." };
        }
        entri.id = o.id;
      }
      if (o.hapus === true) {
        if (!entri.id) {
          return { ok: false, error: "Hapus modul butuh id." };
        }
        entri.hapus = true;
        modul.push(entri);
        continue;
      }
      if (entri.id === undefined) {
        if (typeof o.judul !== "string" || o.judul.trim() === "") {
          return { ok: false, error: "Judul modul wajib diisi." };
        }
      } else if (
        o.judul !== undefined &&
        (typeof o.judul !== "string" || o.judul.trim() === "")
      ) {
        return { ok: false, error: "Judul modul wajib diisi." };
      }
      if (o.judul !== undefined) entri.judul = (o.judul as string).trim();
      if (o.deskripsi !== undefined) entri.deskripsi = stringAtauNull(o.deskripsi);
      if (o.urutan !== undefined) {
        if (
          typeof o.urutan !== "number" ||
          !Number.isInteger(o.urutan) ||
          o.urutan < 0 ||
          o.urutan > 1000
        ) {
          return { ok: false, error: "Urutan modul harus bilangan bulat 0 sampai 1000." };
        }
        entri.urutan = o.urutan;
      }
      modul.push(entri);
    }
  }
  if (body.pelajaran !== undefined) {
    if (!Array.isArray(body.pelajaran) || body.pelajaran.length > 200) {
      return { ok: false, error: "pelajaran harus array maksimal 200 entri." };
    }
    for (const p of body.pelajaran as unknown[]) {
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return { ok: false, error: "Entri pelajaran tidak valid." };
      }
      const o = p as Record<string, unknown>;
      const entri: EntriPelajaran = {};
      if (o.id !== undefined) {
        if (typeof o.id !== "string" || !POLA_UUID.test(o.id)) {
          return { ok: false, error: "ID pelajaran tidak valid." };
        }
        entri.id = o.id;
      }
      if (o.hapus === true) {
        if (!entri.id) {
          return { ok: false, error: "Hapus pelajaran butuh id." };
        }
        entri.hapus = true;
        pelajaran.push(entri);
        continue;
      }
      if (o.module_id !== undefined) {
        if (typeof o.module_id !== "string" || !POLA_UUID.test(o.module_id)) {
          return { ok: false, error: "module_id pelajaran tidak valid." };
        }
        entri.module_id = o.module_id;
      }
      if (entri.id === undefined) {
        if (!entri.module_id) {
          return { ok: false, error: "Pelajaran baru wajib punya module_id." };
        }
        if (typeof o.judul !== "string" || o.judul.trim() === "") {
          return { ok: false, error: "Judul pelajaran wajib diisi." };
        }
      } else if (
        o.judul !== undefined &&
        (typeof o.judul !== "string" || o.judul.trim() === "")
      ) {
        return { ok: false, error: "Judul pelajaran wajib diisi." };
      }
      if (o.judul !== undefined) entri.judul = (o.judul as string).trim();
      if (o.isi !== undefined) entri.isi = stringAtauNull(o.isi);
      if (o.jenis !== undefined) {
        if (o.jenis !== "materi" && o.jenis !== "artikel" && o.jenis !== "kuis") {
          return { ok: false, error: "Jenis pelajaran tidak valid." };
        }
        entri.jenis = o.jenis;
      }
      if (o.referensi !== undefined) {
        const ref = validasiReferensi(o.referensi);
        if (!ref.ok) return ref;
        entri.referensi = ref.data;
      }
      if (o.artikel_id !== undefined) {
        if (o.artikel_id === null) {
          entri.artikel_id = null;
        } else if (
          typeof o.artikel_id === "string" &&
          POLA_UUID.test(o.artikel_id)
        ) {
          entri.artikel_id = o.artikel_id;
        } else {
          return { ok: false, error: "artikel_id pelajaran tidak valid." };
        }
      }
      if (o.kuis_tanggal !== undefined) {
        if (o.kuis_tanggal === null) {
          entri.kuis_tanggal = null;
        } else if (
          typeof o.kuis_tanggal === "string" &&
          POLA_TANGGAL.test(o.kuis_tanggal)
        ) {
          entri.kuis_tanggal = o.kuis_tanggal;
        } else {
          return { ok: false, error: "kuis_tanggal harus format YYYY-MM-DD." };
        }
      }
      if (o.urutan !== undefined) {
        if (
          typeof o.urutan !== "number" ||
          !Number.isInteger(o.urutan) ||
          o.urutan < 0 ||
          o.urutan > 1000
        ) {
          return { ok: false, error: "Urutan pelajaran harus bilangan bulat 0 sampai 1000." };
        }
        entri.urutan = o.urutan;
      }
      pelajaran.push(entri);
    }
  }
  return { ok: true, modul, pelajaran };
}

async function catatAuditAkademi(
  service: ReturnType<typeof createServiceClient>,
  aktor: { id: string; email?: string | null },
  aksi: "akademi.kursus" | "akademi.modul",
  entitasId: string | null,
  sesudah: unknown,
  ip: string | null,
): Promise<void> {
  try {
    await service.from("pf_audit_logs").insert({
      aktor_id: aktor.id,
      aktor_email: aktor.email ?? null,
      aksi,
      entitas: "akademi",
      entitas_id: entitasId,
      sebelum: {},
      sesudah: (sesudah ?? {}) as Record<string, unknown>,
      ip,
    });
  } catch (err) {
    console.error("Audit akademi gagal:", err);
  }
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
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
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
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
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
    const modulMilik = new Set(
      (detail.modul as { id: string }[]).map((m) => m.id),
    );
    const pelajaranKeModul = new Map<string, string>();
    for (const p of detail.pelajaran as {
      id: string;
      module_id: string;
    }[]) {
      pelajaranKeModul.set(p.id, p.module_id);
    }

    // Modul dulu (pelajaran baru butuh modul yang sudah ada).
    for (const m of validStruktur.modul) {
      if (m.hapus) {
        if (!modulMilik.has(m.id!)) {
          return NextResponse.json(
            { ok: false, error: `Modul ${m.id} bukan milik kursus ini.` },
            { status: 400 },
          );
        }
        const { error } = await service
          .from("pf_course_modules")
          .delete()
          .eq("id", m.id);
        if (error) throw error;
        continue;
      }
      if (m.id) {
        if (!modulMilik.has(m.id)) {
          return NextResponse.json(
            { ok: false, error: `Modul ${m.id} bukan milik kursus ini.` },
            { status: 400 },
          );
        }
        const perubahan: Record<string, unknown> = {};
        if (m.judul !== undefined) perubahan.judul = m.judul;
        if (m.deskripsi !== undefined) perubahan.deskripsi = m.deskripsi;
        if (m.urutan !== undefined) perubahan.urutan = m.urutan;
        if (Object.keys(perubahan).length > 0) {
          const { error } = await service
            .from("pf_course_modules")
            .update(perubahan)
            .eq("id", m.id);
          if (error) throw error;
        }
      } else {
        const { data, error } = await service
          .from("pf_course_modules")
          .insert({
            course_id: id,
            judul: m.judul,
            deskripsi: m.deskripsi ?? null,
            urutan: m.urutan ?? 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        modulMilik.add((data as { id: string }).id);
      }
    }

    for (const p of validStruktur.pelajaran) {
      if (p.hapus) {
        const modulLama = pelajaranKeModul.get(p.id!);
        if (!modulLama || !modulMilik.has(modulLama)) {
          return NextResponse.json(
            { ok: false, error: `Pelajaran ${p.id} bukan milik kursus ini.` },
            { status: 400 },
          );
        }
        const { error } = await service
          .from("pf_course_lessons")
          .delete()
          .eq("id", p.id);
        if (error) throw error;
        continue;
      }
      if (p.id) {
        const modulLama = pelajaranKeModul.get(p.id);
        if (!modulLama || !modulMilik.has(modulLama)) {
          return NextResponse.json(
            { ok: false, error: `Pelajaran ${p.id} bukan milik kursus ini.` },
            { status: 400 },
          );
        }
        if (p.module_id !== undefined && !modulMilik.has(p.module_id)) {
          return NextResponse.json(
            { ok: false, error: "module_id tujuan bukan milik kursus ini." },
            { status: 400 },
          );
        }
        const perubahan: Record<string, unknown> = {};
        if (p.module_id !== undefined) perubahan.module_id = p.module_id;
        if (p.judul !== undefined) perubahan.judul = p.judul;
        if (p.isi !== undefined) perubahan.isi = p.isi;
        if (p.jenis !== undefined) perubahan.jenis = p.jenis;
        if (p.referensi !== undefined) perubahan.referensi = p.referensi;
        if (p.artikel_id !== undefined) perubahan.artikel_id = p.artikel_id;
        if (p.kuis_tanggal !== undefined) perubahan.kuis_tanggal = p.kuis_tanggal;
        if (p.urutan !== undefined) perubahan.urutan = p.urutan;
        if (Object.keys(perubahan).length > 0) {
          const { error } = await service
            .from("pf_course_lessons")
            .update(perubahan)
            .eq("id", p.id);
          if (error) throw error;
        }
      } else {
        if (!modulMilik.has(p.module_id!)) {
          return NextResponse.json(
            { ok: false, error: "module_id bukan milik kursus ini." },
            { status: 400 },
          );
        }
        const { error } = await service.from("pf_course_lessons").insert({
          module_id: p.module_id,
          judul: p.judul,
          isi: p.isi ?? null,
          jenis: p.jenis ?? "materi",
          referensi: p.referensi ?? [],
          artikel_id: p.artikel_id ?? null,
          kuis_tanggal: p.kuis_tanggal ?? null,
          urutan: p.urutan ?? 0,
        });
        if (error) throw error;
      }
    }

    if (Object.keys(validKursus.data).length > 0) {
      const { error } = await service
        .from("pf_courses")
        .update(validKursus.data)
        .eq("id", id);
      if (error) {
        const kode = (error as { code?: string }).code;
        if (kode === "23505") {
          return NextResponse.json(
            { ok: false, error: "Slug kursus sudah dipakai." },
            { status: 409 },
          );
        }
        throw error;
      }
      await catatAuditAkademi(
        service,
        auth.user,
        "akademi.kursus",
        id,
        validKursus.data,
        ipDariRequest(req),
      );
    }
    if (
      validStruktur.modul.length > 0 ||
      validStruktur.pelajaran.length > 0
    ) {
      await catatAuditAkademi(
        service,
        auth.user,
        "akademi.modul",
        id,
        { modul: validStruktur.modul, pelajaran: validStruktur.pelajaran },
        ipDariRequest(req),
      );
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
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
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
    await catatAuditAkademi(
      service,
      auth.user,
      "akademi.kursus",
      id,
      data,
      ipDariRequest(req),
    );
    return NextResponse.json({ ok: true, kursus: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
