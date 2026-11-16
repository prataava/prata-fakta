// GET /api/admin/podcast — daftar semua episode (staf, termasuk
// draf). POST — buat episode baru (staf editor/writer).
// Episode dibuat dari Daily Brief / artikel sendiri: pilih
// brief_tanggal dan/atau artikel_id di formulir admin. audio_url
// OPSIONAL — bila kosong, episode tetap jalan via TTS browser
// (label jujur "Audio TTS browser"). Pembuatan file audio server
// = BELUM BISA (tanpa layanan TTS server gratis); jangan klaim
// bisa. Tulis via service role. Rate limit 30/menit/IP.
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
import { buatSlug } from "@/lib/ai/slug";
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

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
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
      .select(KOLOM)
      .order("tanggal", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ ok: true, episode: data ?? [] });
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

  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  const teksNaskah =
    typeof body.teks_naskah === "string" ? body.teks_naskah.trim() : "";
  const deskripsi =
    typeof body.deskripsi === "string" ? body.deskripsi.trim() : "";
  const jenis = typeof body.jenis === "string" ? body.jenis : "artikel";
  const status = typeof body.status === "string" ? body.status : "draft";
  const audioUrl =
    typeof body.audio_url === "string" ? body.audio_url.trim() : "";
  const tanggal =
    typeof body.tanggal === "string" ? body.tanggal.trim() : "";
  const artikelId =
    typeof body.artikel_id === "string" ? body.artikel_id.trim() : "";
  const briefTanggal =
    typeof body.brief_tanggal === "string" ? body.brief_tanggal.trim() : "";
  const durasi =
    typeof body.durasi_detik === "number" ? Math.floor(body.durasi_detik) : null;

  if (!judul || judul.length > 300) {
    return NextResponse.json(
      { ok: false, error: "Judul wajib diisi (maksimal 300 karakter)." },
      { status: 400 },
    );
  }
  if (!teksNaskah || teksNaskah.length > 50000) {
    return NextResponse.json(
      { ok: false, error: "Teks naskah wajib diisi (maksimal 50.000 karakter)." },
      { status: 400 },
    );
  }
  if (!(JENIS_VALID as readonly string[]).includes(jenis)) {
    return NextResponse.json(
      { ok: false, error: "Jenis episode tidak valid." },
      { status: 400 },
    );
  }
  if (!(STATUS_VALID as readonly string[]).includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status episode tidak valid." },
      { status: 400 },
    );
  }
  if (tanggal && !tanggalValid(tanggal)) {
    return NextResponse.json(
      { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  if (audioUrl && !/^https?:\/\/.+/.test(audioUrl)) {
    return NextResponse.json(
      { ok: false, error: "audio_url harus berupa URL http(s)." },
      { status: 400 },
    );
  }
  if (artikelId && !uuidValid(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id harus berupa UUID artikel." },
      { status: 400 },
    );
  }
  if (briefTanggal && !tanggalValid(briefTanggal)) {
    return NextResponse.json(
      { ok: false, error: "brief_tanggal tidak valid (format YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  if (durasi !== null && (durasi < 0 || durasi > 24 * 3600)) {
    return NextResponse.json(
      { ok: false, error: "durasi_detik tidak valid." },
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
    // Bila artikel_id diisi, pastikan artikelnya ada (dan bila
    // brief_tanggal diisi, pastikan brief-nya ada) — episode hanya
    // dari konten sendiri.
    if (artikelId) {
      const { data } = await service
        .from("pf_articles")
        .select("id")
        .eq("id", artikelId)
        .maybeSingle();
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "artikel_id tidak ditemukan." },
          { status: 400 },
        );
      }
    }
    if (briefTanggal) {
      const { data } = await service
        .from("pf_daily_briefs")
        .select("tanggal")
        .eq("tanggal", briefTanggal)
        .maybeSingle();
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "Tidak ada Daily Brief pada tanggal itu." },
          { status: 400 },
        );
      }
    }
    const { data, error } = await service
      .from("pf_podcast_episodes")
      .insert({
        slug: buatSlug(judul),
        judul,
        deskripsi: deskripsi || null,
        jenis,
        teks_naskah: teksNaskah,
        audio_url: audioUrl || null,
        durasi_detik: durasi,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        status,
        artikel_id: artikelId || null,
        brief_tanggal: briefTanggal || null,
      })
      .select(KOLOM)
      .maybeSingle();
    if (error) throw error;
    // Audit fail-closed (Tahap 13A, T10): episode dibuat langsung
    // terbit → podcast.terbit, bila tidak → podcast.episode.
    // Gagal audit → operasi ditolak (galat naik ke responGalatAdmin).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: status === "terbit" ? "podcast.terbit" : "podcast.episode",
      entitas: "pf_podcast_episodes",
      entitas_id: (data as { id: string } | null)?.id ?? null,
      sebelum: null,
      sesudah: {
        judul: (data as { judul: string }).judul,
        jenis: (data as { jenis: string }).jenis,
        status: (data as { status: string }).status,
      },
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, episode: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
