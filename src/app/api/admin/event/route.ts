// GET /api/admin/event — daftar event (staf; filter q, era,
// penting, limit). POST /api/admin/event — buat event baru
// (editor/writer/super_admin). Tulis via service role (tidak ada
// policy tulis pengguna untuk pf_events). Rate limit 30/menit/IP.
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
import { validasiEventInput } from "@/lib/admin/validasi";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_EVENT =
  "id, judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, berakhir_pada, dampak, sumber_url, era, penting, negara_kode, dibuat_pada, diperbarui_pada";

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
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
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
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
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "event.buat",
      entitas: "pf_events",
      entitas_id: (data as { id: string } | null)?.id ?? null,
      sebelum: null,
      sesudah: {
        judul: (data as { judul: string }).judul,
        dimulai_pada: (data as { dimulai_pada: string }).dimulai_pada,
        era: (data as { era: string | null }).era,
      },
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, event: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
