// PATCH / DELETE /api/admin/negara/[id] (staf, service role).
// Satu [id] melayani dua jenis baris: bila id cocok dengan
// pf_country_facts, yang diubah/dihapus adalah fakta itu;
// bila cocok dengan pf_countries, yang diubah/dihapus adalah
// negara itu. 404 bila id tidak cocok dengan keduanya.
// PATCH negara MENOLAK perubahan kode (kode adalah target FK
// negara_kode di artikel/event/indikator). PATCH memvalidasi
// baris GABUNGAN (lama + patch) dengan aturan angka-bersumber
// yang sama seperti POST.
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
import { ROLES } from "@/lib/auth/roles";
import {
  normalisasiKode,
  validasiFaktaInput,
  validasiNegaraInput,
} from "@/lib/negara";
import type { SupabaseClient } from "@supabase/supabase-js";

const lolosRateLimit = buatRateLimiterAdmin();

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KOLOM_NEGARA =
  "id, kode, nama, ibu_kota, populasi, pdb, sistem_pemerintahan, luas_km2, bahasa, mata_uang, sumber, periode_referensi, dibuat_pada, diperbarui_pada";
const KOLOM_FAKTA = "id, country_id, kunci, nilai, satuan, sumber, periode";

function angkaAtauNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function teksAtauNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

type Ctx = { params: Promise<{ id: string }> };

async function ambilFakta(service: SupabaseClient, id: string) {
  const { data, error } = await service
    .from("pf_country_facts")
    .select(KOLOM_FAKTA)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

async function ambilNegara(service: SupabaseClient, id: string) {
  const { data, error } = await service
    .from("pf_countries")
    .select(KOLOM_NEGARA)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

function responIdTakValid() {
  return NextResponse.json(
    { ok: false, error: "id tidak valid." },
    { status: 400 },
  );
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  // P0-5 (B-T1): mutasi HANYA editor — lihat catatan di
  // ../route.ts POST (data referensi publik, bukan draf).
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) return responIdTakValid();
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  try {
    const service = createServiceClient();

    // ---- Fakta dulu: id cocok dengan pf_country_facts? ----
    const faktaLama = await ambilFakta(service, id);
    if (faktaLama) {
      const gabung = { ...faktaLama, ...body };
      const galat = validasiFaktaInput(gabung);
      if (galat) {
        return NextResponse.json({ ok: false, error: galat }, { status: 400 });
      }
      const patch: Record<string, unknown> = {};
      if (typeof body.kunci === "string") patch.kunci = body.kunci.trim();
      if (typeof body.nilai === "string") patch.nilai = body.nilai.trim();
      if ("satuan" in body) patch.satuan = teksAtauNull(body.satuan);
      if ("sumber" in body) patch.sumber = teksAtauNull(body.sumber);
      if ("periode" in body) patch.periode = teksAtauNull(body.periode);
      const { data, error } = await service
        .from("pf_country_facts")
        .update(patch)
        .eq("id", id)
        .select(KOLOM_FAKTA)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
      // ditolak (galat naik ke responGalatAdmin → 500/503).
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "negara.ubah",
        entitas: "pf_country_facts",
        entitas_id: id,
        sebelum: faktaLama,
        sesudah: data ?? null,
        ip: ipDariRequest(req),
      });
      return NextResponse.json({ ok: true, fakta: data });
    }

    // ---- Negara: id cocok dengan pf_countries? ----
    const negaraLama = await ambilNegara(service, id);
    if (!negaraLama) {
      return NextResponse.json(
        { ok: false, error: "Negara atau fakta tidak ditemukan." },
        { status: 404 },
      );
    }
    if (
      typeof body.kode === "string" &&
      normalisasiKode(body.kode) !== String(negaraLama.kode)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kode negara tidak bisa diubah (dipakai sebagai rujukan artikel, event, dan indikator). Hapus lalu buat ulang bila kode salah.",
        },
        { status: 400 },
      );
    }
    const gabung = { ...negaraLama, ...body };
    const galat = validasiNegaraInput(gabung);
    if (galat) {
      return NextResponse.json({ ok: false, error: galat }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (typeof body.nama === "string") patch.nama = body.nama.trim();
    if ("ibu_kota" in body) patch.ibu_kota = teksAtauNull(body.ibu_kota);
    if ("populasi" in body) patch.populasi = angkaAtauNull(body.populasi);
    if ("pdb" in body) patch.pdb = angkaAtauNull(body.pdb);
    if ("sistem_pemerintahan" in body)
      patch.sistem_pemerintahan = teksAtauNull(body.sistem_pemerintahan);
    if ("luas_km2" in body) patch.luas_km2 = angkaAtauNull(body.luas_km2);
    if ("bahasa" in body) patch.bahasa = teksAtauNull(body.bahasa);
    if ("mata_uang" in body) patch.mata_uang = teksAtauNull(body.mata_uang);
    if ("sumber" in body) patch.sumber = teksAtauNull(body.sumber);
    if ("periode_referensi" in body)
      patch.periode_referensi = teksAtauNull(body.periode_referensi);
    const { data, error } = await service
      .from("pf_countries")
      .update(patch)
      .eq("id", id)
      .select(KOLOM_NEGARA)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "negara.ubah",
      entitas: "pf_countries",
      entitas_id: id,
      sebelum: negaraLama,
      sesudah: data ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, negara: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  // P0-5 (B-T1): hapus HANYA editor — lihat catatan di
  // ../route.ts POST (data referensi publik, bukan draf).
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) return responIdTakValid();

  try {
    const service = createServiceClient();
    const { data: hapusFakta, error: errFakta } = await service
      .from("pf_country_facts")
      .delete()
      .eq("id", id)
      .select("id, country_id, kunci, nilai, satuan, sumber, periode");
    if (errFakta) throw new Error(errFakta.message);
    if (hapusFakta && hapusFakta.length > 0) {
      // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
      // ditolak (galat naik ke responGalatAdmin → 500/503).
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "negara.hapus",
        entitas: "pf_country_facts",
        entitas_id: id,
        sebelum: hapusFakta[0] ?? null,
        sesudah: null,
        ip: ipDariRequest(req),
      });
      return NextResponse.json({ ok: true, dihapus: "fakta" });
    }
    const { data: hapusNegara, error: errNegara } = await service
      .from("pf_countries")
      .delete()
      .eq("id", id)
      .select("id, kode, nama");
    if (errNegara) throw new Error(errNegara.message);
    if (hapusNegara && hapusNegara.length > 0) {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "negara.hapus",
        entitas: "pf_countries",
        entitas_id: id,
        sebelum: hapusNegara[0] ?? null,
        sesudah: null,
        ip: ipDariRequest(req),
      });
      return NextResponse.json({ ok: true, dihapus: "negara" });
    }
    return NextResponse.json(
      { ok: false, error: "Negara atau fakta tidak ditemukan." },
      { status: 404 },
    );
  } catch (err) {
    return responGalatAdmin(err);
  }
}
