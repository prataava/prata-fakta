// GET /api/admin/cerita — daftar cerita (semua status, staf)
// beserta tautan event/artikel per cerita + daftar artikel terbit
// (pilihan untuk menautkan). POST /api/admin/cerita — buat cerita
// baru (editor/writer/super_admin, status awal 'draft').
// Tulis via service role (tidak ada policy tulis pengguna untuk
// pf_stories). Rate limit 30/menit/IP.
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
import { slugCeritaValid } from "@/lib/cerita";
import { buatSlug } from "@/lib/ai/slug";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_CERITA =
  "id, slug, judul, ringkasan, status, status_perkembangan, dibuat_pada, diperbarui_pada";

const STATUS_VALID = ["draft", "terbit"] as const;
const PERKEMBANGAN_VALID = ["berkembang", "selesai"] as const;

/** Validasi kolom cerita (dipakai POST + PATCH). */
export function validasiCeritaInput(
  body: Record<string, unknown>,
): { galat: string | null; patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  if (body.judul !== undefined) {
    const judul =
      typeof body.judul === "string" ? body.judul.trim() : "";
    if (!judul || judul.length > 200) {
      return { galat: "Judul cerita wajib diisi (maksimal 200 karakter).", patch: {} };
    }
    patch.judul = judul;
  }
  if (body.slug !== undefined) {
    const slug =
      typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (slug && !slugCeritaValid(slug)) {
      return {
        galat: "Slug hanya boleh huruf kecil, angka, dan tanda hubung.",
        patch: {},
      };
    }
    if (slug) patch.slug = slug;
  }
  if (body.ringkasan !== undefined) {
    const ringkasan =
      typeof body.ringkasan === "string" ? body.ringkasan.trim() : "";
    patch.ringkasan = ringkasan === "" ? null : ringkasan.slice(0, 2000);
  }
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !(STATUS_VALID as readonly string[]).includes(body.status)
    ) {
      return { galat: "Status cerita tidak valid (draft atau terbit).", patch: {} };
    }
    patch.status = body.status;
  }
  if (body.status_perkembangan !== undefined) {
    if (
      typeof body.status_perkembangan !== "string" ||
      !(PERKEMBANGAN_VALID as readonly string[]).includes(
        body.status_perkembangan,
      )
    ) {
      return {
        galat: "Status perkembangan tidak valid (berkembang atau selesai).",
        patch: {},
      };
    }
    patch.status_perkembangan = body.status_perkembangan;
  }
  return { galat: null, patch };
}

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createServiceClient();
    const [ceritaRes, tautanEventRes, tautanArtikelRes, artikelRes] =
      await Promise.all([
        supabase
          .from("pf_stories")
          .select(KOLOM_CERITA)
          .order("dibuat_pada", { ascending: false })
          .limit(100),
        supabase
          .from("pf_story_events")
          .select("id, story_id, event_id, urutan, catatan, pf_events(judul, dimulai_pada)")
          .order("urutan", { ascending: true })
          .limit(1000),
        supabase
          .from("pf_story_articles")
          .select("id, story_id, artikel_id, peran, pf_articles(judul, slug)")
          .limit(1000),
        supabase
          .from("pf_articles")
          .select("id, slug, judul")
          .eq("status", "terbit")
          .order("diterbitkan_pada", { ascending: false })
          .limit(100),
      ]);
    if (ceritaRes.error) throw ceritaRes.error;
    if (tautanEventRes.error) throw tautanEventRes.error;
    if (tautanArtikelRes.error) throw tautanArtikelRes.error;
    if (artikelRes.error) throw artikelRes.error;

    const cerita = (ceritaRes.data ?? []).map((c) => {
      const id = (c as { id: string }).id;
      const tautanEvent = ((tautanEventRes.data ?? []) as unknown as Record<
        string,
        unknown
      >[]).filter((t) => t.story_id === id);
      const tautanArtikel = ((tautanArtikelRes.data ?? []) as unknown as Record<
        string,
        unknown
      >[]).filter((t) => t.story_id === id);
      return {
        ...(c as Record<string, unknown>),
        jumlah_event: tautanEvent.length,
        jumlah_artikel: tautanArtikel.length,
        tautan_event: tautanEvent.map((t) => ({
          id: t.id,
          event_id: t.event_id,
          urutan: t.urutan,
          catatan: t.catatan,
          judul:
            (t.pf_events as { judul?: string } | null)?.judul ?? null,
          dimulai_pada:
            (t.pf_events as { dimulai_pada?: string } | null)
              ?.dimulai_pada ?? null,
        })),
        tautan_artikel: tautanArtikel.map((t) => ({
          id: t.id,
          artikel_id: t.artikel_id,
          peran: t.peran,
          judul:
            (t.pf_articles as { judul?: string } | null)?.judul ?? null,
          slug:
            (t.pf_articles as { slug?: string } | null)?.slug ?? null,
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      cerita,
      artikel_terbit: artikelRes.data ?? [],
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  if (typeof body.judul !== "string" || body.judul.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Judul cerita wajib diisi." },
      { status: 400 },
    );
  }
  const { galat, patch } = validasiCeritaInput(body);
  if (galat) {
    return NextResponse.json({ ok: false, error: galat }, { status: 400 });
  }
  const judul = (patch.judul as string) ?? body.judul.trim();
  const slug =
    typeof patch.slug === "string" && patch.slug
      ? (patch.slug as string)
      : buatSlug(judul);

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pf_stories")
      .insert({
        slug,
        judul,
        ringkasan: (patch.ringkasan as string | null) ?? null,
        status: (patch.status as string) ?? "draft",
        status_perkembangan:
          (patch.status_perkembangan as string) ?? "berkembang",
      })
      .select(KOLOM_CERITA)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Slug cerita sudah dipakai." },
          { status: 409 },
        );
      }
      throw error;
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "cerita.buat",
      entitas: "pf_stories",
      entitas_id: (data as { id: string } | null)?.id ?? null,
      sebelum: null,
      sesudah: {
        slug: (data as { slug: string }).slug,
        judul: (data as { judul: string }).judul,
        status: (data as { status: string }).status,
      },
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, cerita: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
