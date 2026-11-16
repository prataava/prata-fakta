// PATCH / DELETE /api/admin/podcast/[id] (staf editor/writer).
// PATCH: ubah judul/deskripsi/jenis/teks_naskah/audio_url/
// durasi_detik/tanggal/status/artikel_id/brief_tanggal.
// DELETE: hapus episode (riwayat + playlist ikut terhapus via
// FK cascade). Tulis via service role. Rate limit 30/menit/IP.
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
import { kirimNotifikasiPodcast } from "@/lib/notifikasi/tulis";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const JENIS_VALID = ["brief", "artikel", "mingguan"] as const;
const STATUS_VALID = ["draft", "terbit"] as const;

const KOLOM =
  "id, slug, judul, deskripsi, jenis, teks_naskah, audio_url, durasi_detik, tanggal, status, artikel_id, brief_tanggal, dibuat_pada";

function tanggalValid(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

function uuidValid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  const patch: Record<string, unknown> = {};
  if (typeof body.judul === "string") {
    const v = body.judul.trim();
    if (!v || v.length > 300) {
      return NextResponse.json(
        { ok: false, error: "Judul wajib diisi (maksimal 300 karakter)." },
        { status: 400 },
      );
    }
    patch.judul = v;
  }
  if (typeof body.deskripsi === "string") patch.deskripsi = body.deskripsi.trim() || null;
  if (typeof body.teks_naskah === "string") {
    const v = body.teks_naskah.trim();
    if (!v || v.length > 50000) {
      return NextResponse.json(
        { ok: false, error: "Teks naskah wajib diisi (maksimal 50.000 karakter)." },
        { status: 400 },
      );
    }
    patch.teks_naskah = v;
  }
  if (typeof body.jenis === "string") {
    if (!(JENIS_VALID as readonly string[]).includes(body.jenis)) {
      return NextResponse.json(
        { ok: false, error: "Jenis episode tidak valid." },
        { status: 400 },
      );
    }
    patch.jenis = body.jenis;
  }
  if (typeof body.status === "string") {
    if (!(STATUS_VALID as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        { ok: false, error: "Status episode tidak valid." },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }
  if (typeof body.audio_url === "string") {
    const v = body.audio_url.trim();
    if (v && !/^https?:\/\/.+/.test(v)) {
      return NextResponse.json(
        { ok: false, error: "audio_url harus berupa URL http(s)." },
        { status: 400 },
      );
    }
    patch.audio_url = v || null;
  }
  if (typeof body.durasi_detik === "number") {
    const v = Math.floor(body.durasi_detik);
    if (v < 0 || v > 24 * 3600) {
      return NextResponse.json(
        { ok: false, error: "durasi_detik tidak valid." },
        { status: 400 },
      );
    }
    patch.durasi_detik = v;
  }
  if (typeof body.tanggal === "string") {
    const v = body.tanggal.trim();
    if (!tanggalValid(v)) {
      return NextResponse.json(
        { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    patch.tanggal = v;
  }
  if (typeof body.artikel_id === "string") {
    const v = body.artikel_id.trim();
    if (v && !uuidValid(v)) {
      return NextResponse.json(
        { ok: false, error: "artikel_id harus berupa UUID artikel." },
        { status: 400 },
      );
    }
    patch.artikel_id = v || null;
  }
  if (typeof body.brief_tanggal === "string") {
    const v = body.brief_tanggal.trim();
    if (v && !tanggalValid(v)) {
      return NextResponse.json(
        { ok: false, error: "brief_tanggal tidak valid (format YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    patch.brief_tanggal = v || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang diminta." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap (kunci service belum diatur)." },
      { status: 503 },
    );
  }
  try {
    const { data, error } = await service
      .from("pf_podcast_episodes")
      .update(patch)
      .eq("id", id)
      .select(KOLOM)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Episode tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit fail-closed (Tahap 13A, T10): perubahan status ke
    // terbit → podcast.terbit, perubahan lain → podcast.episode.
    // Gagal audit → operasi ditolak (galat naik ke responGalatAdmin).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi:
        patch.status === "terbit" ? "podcast.terbit" : "podcast.episode",
      entitas: "pf_podcast_episodes",
      entitas_id: id,
      sebelum: null,
      sesudah: patch,
      ip: ipDariRequest(req),
    });
    // B2-D (E1): status diubah ke terbit → beri tahu pengguna yang
    // mengaktifkan notifikasi podcast. Dedup kunci podcast:<id>
    // mencegah notifikasi ganda bila PATCH terbit diulang.
    // Best-effort — TIDAK PERNAH menggagalkan perubahan.
    if (patch.status === "terbit") {
      try {
        await kirimNotifikasiPodcast(null, id);
      } catch {
        // Diam-diam: episode sudah tersimpan.
      }
    }
    return NextResponse.json({ ok: true, episode: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap (kunci service belum diatur)." },
      { status: 503 },
    );
  }
  try {
    const { data, error } = await service
      .from("pf_podcast_episodes")
      .delete()
      .eq("id", id)
      .select("id, slug, judul, status");
    if (error) throw error;
    // Audit fail-closed (Tahap 13A, T10): hapus episode dicatat
    // sebagai podcast.episode (tidak ada aksi podcast.hapus —
    // konvensi Gelombang 2). Hanya bila ada baris yang terhapus.
    if (data && data.length > 0) {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "podcast.episode",
        entitas: "pf_podcast_episodes",
        entitas_id: id,
        sebelum: data[0] ?? null,
        sesudah: null,
        ip: ipDariRequest(req),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
