// GET /api/admin/negara — daftar negara + fakta (staf).
// POST /api/admin/negara — tambah negara, atau tambah fakta bila
// body berisi `kunci` (fakta: { country_id, kunci, nilai,
// satuan?, sumber?, periode? }). Tulis via service role
// (bypass RLS) sesudah guard staf; 503 jujur bila service key
// belum diatur. Angka tanpa sumber DITOLAK 400 di pintu masuk
// (aturan angka-bersumber, lihat lib/negara.ts).
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
import { catatAuditWajib } from "@/lib/admin/audit";
import {
  normalisasiKode,
  validasiFaktaInput,
  validasiNegaraInput,
} from "@/lib/negara";

const lolosRateLimit = buatRateLimiterAdmin();

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

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const service = createServiceClient();
    const { data: negara, error: errNegara } = await service
      .from("pf_countries")
      .select(KOLOM_NEGARA)
      .order("nama", { ascending: true });
    if (errNegara) throw new Error(errNegara.message);
    const { data: fakta, error: errFakta } = await service
      .from("pf_country_facts")
      .select(KOLOM_FAKTA)
      .order("kunci", { ascending: true });
    if (errFakta) throw new Error(errFakta.message);
    return NextResponse.json({ ok: true, negara: negara ?? [], fakta: fakta ?? [] });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  // ---- Tambah fakta (body berisi kunci) ----
  if (typeof body.kunci === "string") {
    const galat = validasiFaktaInput(body);
    if (galat) {
      return NextResponse.json({ ok: false, error: galat }, { status: 400 });
    }
    try {
      const service = createServiceClient();
      const { data: negara, error: errNegara } = await service
        .from("pf_countries")
        .select("id")
        .eq("id", body.country_id as string)
        .maybeSingle();
      if (errNegara) throw new Error(errNegara.message);
      if (!negara) {
        return NextResponse.json(
          { ok: false, error: "Negara tidak ditemukan." },
          { status: 404 },
        );
      }
      // Fakta lama dicari dulu agar audit jujur: upsert atas fakta
      // yang sudah ada = negara.ubah (dengan `sebelum`), fakta baru
      // = negara.buat.
      const { data: faktaLama } = await service
        .from("pf_country_facts")
        .select(KOLOM_FAKTA)
        .eq("country_id", body.country_id as string)
        .eq("kunci", (body.kunci as string).trim())
        .maybeSingle();
      const { data, error } = await service
        .from("pf_country_facts")
        .upsert(
          {
            country_id: body.country_id as string,
            kunci: (body.kunci as string).trim(),
            nilai: (body.nilai as string).trim(),
            satuan: teksAtauNull(body.satuan),
            sumber: teksAtauNull(body.sumber),
            periode: teksAtauNull(body.periode),
          },
          { onConflict: "country_id,kunci" },
        )
        .select(KOLOM_FAKTA)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
      // ditolak (galat naik ke responGalatAdmin → 500/503).
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: faktaLama ? "negara.ubah" : "negara.buat",
        entitas: "pf_country_facts",
        entitas_id: (data as { id: string } | null)?.id ?? null,
        sebelum: faktaLama ?? null,
        sesudah: data ?? null,
        ip: ipDariRequest(req),
      });
      return NextResponse.json({ ok: true, fakta: data }, { status: 201 });
    } catch (err) {
      return responGalatAdmin(err);
    }
  }

  // ---- Tambah negara ----
  const galat = validasiNegaraInput(body);
  if (galat) {
    return NextResponse.json({ ok: false, error: galat }, { status: 400 });
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_countries")
      .insert({
        kode: normalisasiKode(body.kode as string),
        nama: (body.nama as string).trim(),
        ibu_kota: teksAtauNull(body.ibu_kota),
        populasi: angkaAtauNull(body.populasi),
        pdb: angkaAtauNull(body.pdb),
        sistem_pemerintahan: teksAtauNull(body.sistem_pemerintahan),
        luas_km2: angkaAtauNull(body.luas_km2),
        bahasa: teksAtauNull(body.bahasa),
        mata_uang: teksAtauNull(body.mata_uang),
        sumber: teksAtauNull(body.sumber),
        periode_referensi: teksAtauNull(body.periode_referensi),
      })
      .select(KOLOM_NEGARA)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            error: `Kode negara ${normalisasiKode(body.kode as string)} sudah terdaftar.`,
          },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "negara.buat",
      entitas: "pf_countries",
      entitas_id: (data as { id: string } | null)?.id ?? null,
      sebelum: null,
      sesudah: {
        kode: (data as { kode: string }).kode,
        nama: (data as { nama: string }).nama,
      },
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, negara: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
