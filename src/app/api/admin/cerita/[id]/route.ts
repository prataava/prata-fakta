// PATCH /api/admin/cerita/[id] — ubah kolom cerita (editor/writer/
// super_admin) ATAU atur tautan (aksi: tambah_event, hapus_event,
// tambah_artikel, hapus_artikel). DELETE /api/admin/cerita/[id] —
// hapus cerita (tautan + pengikut ikut terhapus via FK cascade).
// Tulis via service role. Rate limit 30/menit/IP.
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
import { isUuid, validasiCeritaInput } from "@/lib/admin/validasi";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_CERITA =
  "id, slug, judul, ringkasan, status, status_perkembangan, dibuat_pada, diperbarui_pada";

const PERAN_VALID = ["terkait", "pembaruan", "latar"] as const;

const AKSI_TAUTAN = [
  "tambah_event",
  "hapus_event",
  "tambah_artikel",
  "hapus_artikel",
] as const;

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
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "id cerita tidak valid." },
      { status: 400 },
    );
  }
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  try {
    const supabase = createServiceClient();

    // ---- Aksi tautan (diutamakan bila field aksi terisi) ----
    if (typeof body.aksi === "string") {
      const aksi = body.aksi as string;
      if (!(AKSI_TAUTAN as readonly string[]).includes(aksi)) {
        return NextResponse.json(
          { ok: false, error: "Aksi tautan tidak valid." },
          { status: 400 },
        );
      }
      if (aksi === "tambah_event" || aksi === "hapus_event") {
        const eventId =
          typeof body.event_id === "string" ? body.event_id : "";
        if (!isUuid(eventId)) {
          return NextResponse.json(
            { ok: false, error: "event_id tidak valid." },
            { status: 400 },
          );
        }
        if (aksi === "tambah_event") {
          const urutanRaw = body.urutan;
          const urutan =
            typeof urutanRaw === "number" && Number.isInteger(urutanRaw)
              ? urutanRaw
              : 0;
          const catatan =
            typeof body.catatan === "string" && body.catatan.trim() !== ""
              ? body.catatan.trim().slice(0, 500)
              : null;
          const { data, error } = await supabase
            .from("pf_story_events")
            .insert({
              story_id: id,
              event_id: eventId,
              urutan,
              catatan,
            })
            .select("id, story_id, event_id, urutan, catatan")
            .maybeSingle();
          if (error) {
            if (error.code === "23505") {
              return NextResponse.json(
                { ok: false, error: "Event sudah ditautkan ke cerita ini." },
                { status: 409 },
              );
            }
            if (error.code === "23503") {
              return NextResponse.json(
                { ok: false, error: "Cerita atau event tidak ditemukan." },
                { status: 400 },
              );
            }
            throw error;
          }
          // Audit fail-closed (Tahap 13A, T10): tautan event ke
          // cerita dicatat sebagai cerita.ubah (entitas cerita).
          await catatAuditWajib({
            aktor_id: auth.user.id,
            aktor_email: auth.user.email ?? null,
            aksi: "cerita.ubah",
            entitas: "pf_stories",
            entitas_id: id,
            sebelum: null,
            sesudah: {
              tautan: "tambah_event",
              event_id: eventId,
              urutan,
              catatan,
            },
            ip: ipDariRequest(req),
          });
          return NextResponse.json({ ok: true, tautan: data }, { status: 201 });
        }
        const { error } = await supabase
          .from("pf_story_events")
          .delete()
          .eq("story_id", id)
          .eq("event_id", eventId);
        if (error) throw error;
        await catatAuditWajib({
          aktor_id: auth.user.id,
          aktor_email: auth.user.email ?? null,
          aksi: "cerita.ubah",
          entitas: "pf_stories",
          entitas_id: id,
          sebelum: null,
          sesudah: { tautan: "hapus_event", event_id: eventId },
          ip: ipDariRequest(req),
        });
        return NextResponse.json({ ok: true });
      }
      // tambah_artikel / hapus_artikel
      const artikelId =
        typeof body.artikel_id === "string" ? body.artikel_id : "";
      if (!isUuid(artikelId)) {
        return NextResponse.json(
          { ok: false, error: "artikel_id tidak valid." },
          { status: 400 },
        );
      }
      if (aksi === "tambah_artikel") {
        const peran =
          typeof body.peran === "string" &&
          (PERAN_VALID as readonly string[]).includes(body.peran)
            ? body.peran
            : "terkait";
        const { data, error } = await supabase
          .from("pf_story_articles")
          .insert({ story_id: id, artikel_id: artikelId, peran })
          .select("id, story_id, artikel_id, peran")
          .maybeSingle();
        if (error) {
          if (error.code === "23505") {
            return NextResponse.json(
              { ok: false, error: "Artikel sudah ditautkan ke cerita ini." },
              { status: 409 },
            );
          }
          if (error.code === "23503") {
            return NextResponse.json(
              { ok: false, error: "Cerita atau artikel tidak ditemukan." },
              { status: 400 },
            );
          }
          throw error;
        }
        // Audit fail-closed (Tahap 13A, T10): tautan artikel ke
        // cerita dicatat sebagai cerita.ubah (entitas cerita).
        await catatAuditWajib({
          aktor_id: auth.user.id,
          aktor_email: auth.user.email ?? null,
          aksi: "cerita.ubah",
          entitas: "pf_stories",
          entitas_id: id,
          sebelum: null,
          sesudah: {
            tautan: "tambah_artikel",
            artikel_id: artikelId,
            peran,
          },
          ip: ipDariRequest(req),
        });
        return NextResponse.json({ ok: true, tautan: data }, { status: 201 });
      }
      const { error } = await supabase
        .from("pf_story_articles")
        .delete()
        .eq("story_id", id)
        .eq("artikel_id", artikelId);
      if (error) throw error;
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "cerita.ubah",
        entitas: "pf_stories",
        entitas_id: id,
        sebelum: null,
        sesudah: { tautan: "hapus_artikel", artikel_id: artikelId },
        ip: ipDariRequest(req),
      });
      return NextResponse.json({ ok: true });
    }

    // ---- Ubah kolom cerita ----
    const { galat, patch } = validasiCeritaInput(body);
    if (galat) {
      return NextResponse.json({ ok: false, error: galat }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Tidak ada perubahan yang dikirim." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("pf_stories")
      .update(patch)
      .eq("id", id)
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
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Cerita tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "cerita.ubah",
      entitas: "pf_stories",
      entitas_id: id,
      sebelum: null,
      sesudah: patch,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, cerita: data });
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
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "id cerita tidak valid." },
      { status: 400 },
    );
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pf_stories")
      .delete()
      .eq("id", id)
      .select(KOLOM_CERITA)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Cerita tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "cerita.hapus",
      entitas: "pf_stories",
      entitas_id: id,
      sebelum: {
        slug: (data as { slug: string }).slug,
        judul: (data as { judul: string }).judul,
        status: (data as { status: string }).status,
      },
      sesudah: null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
