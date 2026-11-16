// GET /api/admin/event — daftar event (staf; filter q, era,
// penting, limit). POST /api/admin/event — buat event baru
// (editor/writer/super_admin). Tulis via service role (tidak ada
// policy tulis pengguna untuk pf_events). Rate limit 30/menit/IP.
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

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_NEGARA = /^[A-Z]{2}$/;

const KOLOM_EVENT =
  "id, judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, berakhir_pada, dampak, sumber_url, era, penting, negara_kode, dibuat_pada, diperbarui_pada";

export type EventInput = {
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  lintang: number | null;
  bujur: number | null;
  dimulai_pada: string;
  berakhir_pada: string | null;
  dampak: string | null;
  sumber_url: string | null;
  era: string | null;
  penting: boolean;
  negara_kode: string | null;
};

/** Validasi input event (dipakai POST + PATCH). null bila valid,
 *  pesan galat bila tidak. */
export function validasiEventInput(
  body: Record<string, unknown>,
  wajibJudul = true,
): { input: EventInput | null; galat: string | null } {
  const teks = (k: string, maks: number): string | null => {
    const v = body[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t === "") return null;
    return t.length > maks ? t.slice(0, maks) : t;
  };
  const angka = (k: string): number | null => {
    const v = body[k];
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const judul = teks("judul", 200);
  if (wajibJudul && !judul) {
    return { input: null, galat: "Judul event wajib diisi." };
  }
  if (!wajibJudul && body.judul !== undefined && !judul) {
    return { input: null, galat: "Judul event tidak boleh kosong." };
  }
  const dimulaiRaw =
    typeof body.dimulai_pada === "string" ? body.dimulai_pada.trim() : "";
  let dimulai_pada = "";
  if (dimulaiRaw) {
    const d = new Date(dimulaiRaw);
    if (Number.isNaN(d.getTime())) {
      return { input: null, galat: "Tanggal mulai tidak valid." };
    }
    dimulai_pada = d.toISOString();
  } else if (wajibJudul) {
    return { input: null, galat: "Tanggal mulai wajib diisi." };
  }
  const berakhirRaw =
    typeof body.berakhir_pada === "string"
      ? body.berakhir_pada.trim()
      : "";
  let berakhir_pada: string | null = null;
  if (berakhirRaw) {
    const d = new Date(berakhirRaw);
    if (Number.isNaN(d.getTime())) {
      return { input: null, galat: "Tanggal berakhir tidak valid." };
    }
    berakhir_pada = d.toISOString();
  }
  const lintang = angka("lintang");
  if (typeof lintang === "number" && Number.isNaN(lintang)) {
    return { input: null, galat: "Lintang harus berupa angka." };
  }
  if (lintang !== null && (lintang < -90 || lintang > 90)) {
    return { input: null, galat: "Lintang harus di antara -90 dan 90." };
  }
  const bujur = angka("bujur");
  if (typeof bujur === "number" && Number.isNaN(bujur)) {
    return { input: null, galat: "Bujur harus berupa angka." };
  }
  if (bujur !== null && (bujur < -180 || bujur > 180)) {
    return { input: null, galat: "Bujur harus di antara -180 dan 180." };
  }
  const era = teks("era", 60);
  const negaraRaw =
    typeof body.negara_kode === "string"
      ? body.negara_kode.trim().toUpperCase()
      : "";
  if (negaraRaw && !POLA_NEGARA.test(negaraRaw)) {
    return {
      input: null,
      galat: "Kode negara harus 2 huruf kapital (mis. ID).",
    };
  }
  const sumberUrl = teks("sumber_url", 500);
  if (sumberUrl && !/^https?:\/\//i.test(sumberUrl)) {
    return { input: null, galat: "URL sumber harus diawali http(s)://." };
  }
  return {
    input: {
      judul: judul ?? "",
      ringkasan: teks("ringkasan", 2000),
      lokasi_teks: teks("lokasi_teks", 200),
      lintang,
      bujur,
      dimulai_pada,
      berakhir_pada,
      dampak: teks("dampak", 2000),
      sumber_url: sumberUrl,
      era,
      penting: body.penting === true,
      negara_kode: negaraRaw || null,
    },
    galat: null,
  };
}

export function isUuid(s: string): boolean {
  return POLA_UUID.test(s);
}

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const era = url.searchParams.get("era") ?? undefined;
  const penting = url.searchParams.get("penting") === "1";
  const limitRaw = Number(url.searchParams.get("limit") ?? "100") || 100;
  const limit = Math.min(Math.max(limitRaw, 1), 200);

  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("pf_events")
      .select(KOLOM_EVENT)
      .order("dimulai_pada", { ascending: false })
      .limit(limit);
    if (q) {
      const pola = `%${q.replace(/[%_]/g, "")}%`;
      query = query.or(`judul.ilike.${pola},ringkasan.ilike.${pola}`);
    }
    if (era) query = query.eq("era", era);
    if (penting) query = query.eq("penting", true);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, events: data ?? [] });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const { input, galat } = validasiEventInput(body, true);
  if (galat || !input) {
    return NextResponse.json(
      { ok: false, error: galat ?? "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pf_events")
      .insert(input)
      .select(KOLOM_EVENT)
      .maybeSingle();
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          { ok: false, error: "Kode negara tidak dikenal." },
          { status: 400 },
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true, event: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
