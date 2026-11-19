import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";
import {
  MAX_PENCARIAN_TERSIMPAN,
  type PencarianTersimpan,
} from "@/lib/perpustakaan";
import type { SupabaseClient } from "@supabase/supabase-js";

// GET /api/saya/pencarian-tersimpan → pencarian tersimpan milik sendiri.
// POST /api/saya/pencarian-tersimpan { q, dari?, sampai?, sumber?,
//   status? } → simpan pencarian (idempotent: kombinasi filter yang
//   sama tidak disimpan dua kali). Menerima JSON maupun form
//   (form dari halaman /cari dialihkan kembali ke /cari).
// DELETE /api/saya/pencarian-tersimpan { q, disimpan_pada } → hapus
// satu entri (identifikasi lewat q + disimpan_pada).
// Disimpan di kolom pf_user_preferences.pencarian_tersimpan (jsonb,
// migrasi v18; satu baris per pengguna, user_id unique). Wajib login
// (401 bila tidak). Rate limit 30/menit. 503 jujur bila tabel/kolom
// belum ada (migrasi v18 belum dijalankan).
const batasi = buatRateLimiter(30);

const STATUS_VALID = new Set([
  "VERIFIED",
  "CROSS-CHECKED",
  "DEVELOPING",
  "UNCONFIRMED",
  "DISPUTED",
  "CORRECTED",
]);

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tanggalValid(s: string): boolean {
  if (!POLA_TANGGAL.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

/** true bila kolom pencarian_tersimpan belum ada (migrasi v18 belum dijalankan). */
function kolomBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    (error.message ?? "").includes("Could not find the column")
  );
}

function respon503() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan pencarian tersimpan belum aktif (migrasi v18 belum dijalankan). Coba lagi nanti.",
    },
    { status: 503 },
  );
}

async function penggunaMasuk() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Entri tersimpan yang bentuknya sah (baris lama/rusak dilewati, bukan 500). */
function entriValid(e: unknown): e is PencarianTersimpan {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.q === "string" &&
    r.q.trim().length > 0 &&
    typeof r.disimpan_pada === "string" &&
    r.disimpan_pada.length > 0 &&
    (r.dari === null || typeof r.dari === "string") &&
    (r.sampai === null || typeof r.sampai === "string") &&
    (r.sumber === null || typeof r.sumber === "string") &&
    (r.status === null || typeof r.status === "string")
  );
}

/**
 * Baca daftar tersimpan milik pengguna. Mengembalikan null bila
 * tabel/kolom belum ada (pemanggil menjawab 503 jujur).
 */
async function bacaDaftar(
  supabase: SupabaseClient,
  userId: string,
): Promise<PencarianTersimpan[] | null> {
  const { data, error } = await supabase
    .from("pf_user_preferences")
    .select("pencarian_tersimpan")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error) || kolomBelumAda(error)) return null;
    throw error;
  }
  if (!data) return [];
  const mentah = (data as { pencarian_tersimpan?: unknown })
    .pencarian_tersimpan;
  if (!Array.isArray(mentah)) return [];
  return mentah.filter(entriValid);
}

async function simpanDaftar(
  supabase: SupabaseClient,
  userId: string,
  daftar: PencarianTersimpan[],
): Promise<{ ok: true } | { ok: false; belumSiap: boolean }> {
  const { error } = await supabase
    .from("pf_user_preferences")
    .upsert(
      { user_id: userId, pencarian_tersimpan: daftar },
      { onConflict: "user_id" },
    );
  if (error) {
    if (tabelBelumAda(error) || kolomBelumAda(error)) {
      return { ok: false, belumSiap: true };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * Validasi masukan simpan. Mengembalikan pesan galat atau null
 * bila sah; nilai dinormalisasi (string kosong → null).
 */
function validasiSimpan(masukan: Record<string, unknown>): { galat: string } | { nilai: Omit<PencarianTersimpan, "disimpan_pada"> } {
  const q = typeof masukan.q === "string" ? masukan.q.trim() : "";
  if (!q) return { galat: "Kata kunci pencarian (q) wajib diisi." };
  if (q.length > 200) {
    return { galat: "Kata kunci terlalu panjang (maksimal 200 karakter)." };
  }
  const dari =
    typeof masukan.dari === "string" && masukan.dari.trim() !== ""
      ? masukan.dari.trim()
      : null;
  const sampai =
    typeof masukan.sampai === "string" && masukan.sampai.trim() !== ""
      ? masukan.sampai.trim()
      : null;
  const sumber =
    typeof masukan.sumber === "string" && masukan.sumber.trim() !== ""
      ? masukan.sumber.trim()
      : null;
  const status =
    typeof masukan.status === "string" && masukan.status.trim() !== ""
      ? masukan.status.trim()
      : null;
  if (dari !== null && !tanggalValid(dari)) {
    return { galat: "Tanggal 'dari' tidak valid (format YYYY-MM-DD)." };
  }
  if (sampai !== null && !tanggalValid(sampai)) {
    return { galat: "Tanggal 'sampai' tidak valid (format YYYY-MM-DD)." };
  }
  if (sumber !== null && !POLA_UUID.test(sumber)) {
    return { galat: "ID sumber tidak valid." };
  }
  if (status !== null && !STATUS_VALID.has(status)) {
    return { galat: "Status verifikasi tidak valid." };
  }
  return { nilai: { q, dari, sampai, sumber, status } };
}

function samaFilter(
  a: PencarianTersimpan,
  b: Omit<PencarianTersimpan, "disimpan_pada">,
): boolean {
  return (
    a.q === b.q &&
    a.dari === b.dari &&
    a.sampai === b.sampai &&
    a.sumber === b.sumber &&
    a.status === b.status
  );
}

/** URL /cari untuk satu pencarian tersimpan (dipakai redirect form). */
function tautanCari(p: Omit<PencarianTersimpan, "disimpan_pada">): string {
  const params = new URLSearchParams();
  params.set("q", p.q);
  if (p.dari) params.set("dari", p.dari);
  if (p.sampai) params.set("sampai", p.sampai);
  if (p.sumber) params.set("sumber", p.sumber);
  if (p.status) params.set("status", p.status);
  return `/cari?${params.toString()}`;
}

async function autentikasi(
  req: Request,
): Promise<
  | { pengguna: { id: string } }
  | { respon: NextResponse }
> {
  if (!(await batasi(req))) return { respon: responRateLimit() };
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return {
      respon: NextResponse.json(
        { ok: false, error: "Masuk terlebih dahulu untuk memakai pencarian tersimpan." },
        { status: 401 },
      ),
    };
  }
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return { respon: ditolak };
  return { pengguna };
}

export async function GET(req: Request) {
  const auth = await autentikasi(req);
  if ("respon" in auth) return auth.respon;
  const supabase = await createClient();
  try {
    const daftar = await bacaDaftar(supabase, auth.pengguna.id);
    if (daftar === null) return respon503();
    return NextResponse.json({ ok: true, pencarian: daftar });
  } catch (err) {
    void catatGalatRoute("GET /api/saya/pencarian-tersimpan", err);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat pencarian tersimpan. Coba lagi." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await autentikasi(req);
  if ("respon" in auth) return auth.respon;
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

  // Dua bentuk masukan: JSON (fetch) atau form (form POST halaman
  // /cari, tanpa JavaScript — dialihkan kembali ke /cari).
  const tipe = req.headers.get("content-type") ?? "";
  const dariForm = /application\/x-www-form-urlencoded|multipart\/form-data/.test(
    tipe,
  );
  let masukan: Record<string, unknown>;
  try {
    if (dariForm) {
      const form = await req.formData();
      masukan = {
        q: form.get("q"),
        dari: form.get("dari"),
        sampai: form.get("sampai"),
        sumber: form.get("sumber"),
        status: form.get("status"),
      };
    } else {
      masukan = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const hasil = validasiSimpan(masukan);
  if ("galat" in hasil) {
    if (dariForm) {
      // Form: kembali ke /cari apa adanya (galat tercatat di log).
      console.error("[POST /api/saya/pencarian-tersimpan] form:", hasil.galat);
      return NextResponse.redirect(new URL("/cari", req.url), 303);
    }
    return NextResponse.json(
      { ok: false, error: hasil.galat },
      { status: 400 },
    );
  }
  const nilai = hasil.nilai;

  const supabase = await createClient();
  try {
    const daftar = await bacaDaftar(supabase, auth.pengguna.id);
    if (daftar === null) return respon503();
    if (daftar.some((d) => samaFilter(d, nilai))) {
      if (dariForm) {
        return NextResponse.redirect(
          new URL(`${tautanCari(nilai)}&tersimpan=1`, req.url),
          303,
        );
      }
      return NextResponse.json({
        ok: true,
        sudahDisimpan: true,
        pencarian: daftar,
      });
    }
    if (daftar.length >= MAX_PENCARIAN_TERSIMPAN) {
      if (dariForm) {
        return NextResponse.redirect(
          new URL(`${tautanCari(nilai)}&galat-simpan=penuh`, req.url),
          303,
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: `Maksimal ${MAX_PENCARIAN_TERSIMPAN} pencarian tersimpan. Hapus salah satu dulu sebelum menyimpan yang baru.`,
        },
        { status: 409 },
      );
    }
    const entri: PencarianTersimpan = {
      ...nilai,
      disimpan_pada: new Date().toISOString(),
    };
    const baru = [entri, ...daftar];
    const simpan = await simpanDaftar(supabase, auth.pengguna.id, baru);
    if (!simpan.ok) return respon503();
    if (dariForm) {
      return NextResponse.redirect(
        new URL(`${tautanCari(nilai)}&tersimpan=1`, req.url),
        303,
      );
    }
    return NextResponse.json({ ok: true, pencarian: baru });
  } catch (err) {
    void catatGalatRoute("POST /api/saya/pencarian-tersimpan", err);
    if (dariForm) {
      return NextResponse.redirect(new URL(tautanCari(nilai), req.url), 303);
    }
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan pencarian. Coba lagi." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await autentikasi(req);
  if ("respon" in auth) return auth.respon;
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

  let body: { q?: unknown; disimpan_pada?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const disimpanPada =
    typeof body.disimpan_pada === "string" ? body.disimpan_pada : "";
  if (!q || !disimpanPada) {
    return NextResponse.json(
      { ok: false, error: "q dan disimpan_pada wajib diisi." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  try {
    const daftar = await bacaDaftar(supabase, auth.pengguna.id);
    if (daftar === null) return respon503();
    const sisa = daftar.filter(
      (d) => !(d.q === q && d.disimpan_pada === disimpanPada),
    );
    const dihapus = sisa.length !== daftar.length;
    if (!dihapus) {
      return NextResponse.json({ ok: true, dihapus: false, pencarian: daftar });
    }
    const simpan = await simpanDaftar(supabase, auth.pengguna.id, sisa);
    if (!simpan.ok) return respon503();
    return NextResponse.json({ ok: true, dihapus: true, pencarian: sisa });
  } catch (err) {
    void catatGalatRoute("DELETE /api/saya/pencarian-tersimpan", err);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus pencarian tersimpan. Coba lagi." },
      { status: 500 },
    );
  }
}
