import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// GET /api/saya/preferensi → preferensi pengguna yang login
// (pf_user_preferences, migrasi v8). Bila belum ada baris,
// kembalikan nilai default + ada: false (bukan 404 — preferensi
// memang belum pernah disimpan).
// PATCH /api/saya/preferensi { digest_harian?, notifikasi_topik?,
// notifikasi_koreksi?, tampilkan_profil_publik?,
// notifikasi_jawaban?, notifikasi_podcast?, push_notifikasi? }
// → upsert baris milik sendiri (RLS menegakkan user_id =
// auth.uid()). Tiga kolom terakhir dari migrasi v14 (B2-D):
// bila kolom v14 belum ada, GET mundur ke 4 kolom lama +
// default baru, sedangkan PATCH menjawab 503 jujur.
// Wajib login (401 bila tidak). Rate limit 30/menit/IP.
// 503 jujur bila tabel belum ada (migrasi v8 belum dijalankan).
const batasi = buatRateLimiter(30);

type Preferensi = {
  digest_harian: boolean;
  notifikasi_topik: boolean;
  notifikasi_koreksi: boolean;
  tampilkan_profil_publik: boolean;
  notifikasi_jawaban: boolean;
  notifikasi_podcast: boolean;
  push_notifikasi: boolean;
};

const DEFAULT: Preferensi = {
  digest_harian: true,
  notifikasi_topik: true,
  notifikasi_koreksi: true,
  tampilkan_profil_publik: false,
  notifikasi_jawaban: true,
  notifikasi_podcast: true,
  push_notifikasi: false,
};

const KOLOM_SELECT =
  "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik, notifikasi_jawaban, notifikasi_podcast, push_notifikasi";

const KOLOM_LAMA_SELECT =
  "digest_harian, notifikasi_topik, notifikasi_koreksi, tampilkan_profil_publik";

function dariBaris(data: Record<string, unknown>): Preferensi {
  return {
    digest_harian: Boolean(data.digest_harian),
    notifikasi_topik: Boolean(data.notifikasi_topik),
    notifikasi_koreksi: Boolean(data.notifikasi_koreksi),
    tampilkan_profil_publik: Boolean(data.tampilkan_profil_publik),
    notifikasi_jawaban:
      typeof data.notifikasi_jawaban === "boolean"
        ? data.notifikasi_jawaban
        : DEFAULT.notifikasi_jawaban,
    notifikasi_podcast:
      typeof data.notifikasi_podcast === "boolean"
        ? data.notifikasi_podcast
        : DEFAULT.notifikasi_podcast,
    push_notifikasi:
      typeof data.push_notifikasi === "boolean"
        ? data.push_notifikasi
        : DEFAULT.push_notifikasi,
  };
}

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

/** true bila kolom v14 belum ada (migrasi v14 belum dijalankan). */
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
        "Layanan preferensi belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 8 dijalankan.",
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

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat preferensi Anda." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  let { data, error } = await supabase
    .from("pf_user_preferences")
    .select(KOLOM_SELECT)
    .eq("user_id", pengguna.id)
    .maybeSingle();
  if (error && kolomBelumAda(error)) {
    // Migrasi v14 belum dijalankan: mundur ke kolom lama.
    ({ data, error } = await supabase
      .from("pf_user_preferences")
      .select(KOLOM_LAMA_SELECT)
      .eq("user_id", pengguna.id)
      .maybeSingle());
  }
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("GET /api/saya/preferensi", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ ok: true, ada: false, preferensi: DEFAULT });
  }
  const preferensi = dariBaris(data as Record<string, unknown>);
  return NextResponse.json({ ok: true, ada: true, preferensi });
}

export async function PATCH(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengubah preferensi." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const perubahan: Partial<Preferensi> = {};
  for (const kunci of Object.keys(DEFAULT) as (keyof Preferensi)[]) {
    if (kunci in body) {
      if (typeof body[kunci] !== "boolean") {
        return NextResponse.json(
          { ok: false, error: `Nilai ${kunci} harus boolean.` },
          { status: 400 },
        );
      }
      perubahan[kunci] = body[kunci] as boolean;
    }
  }
  if (Object.keys(perubahan).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada preferensi yang diubah." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_user_preferences")
    .upsert(
      { user_id: pengguna.id, ...perubahan },
      { onConflict: "user_id" },
    )
    .select(KOLOM_SELECT)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    if (kolomBelumAda(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Preferensi notifikasi baru belum aktif (migrasi v14 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("PATCH /api/saya/preferensi", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    void catatGalatRoute("PATCH /api/saya/preferensi", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan preferensi. Coba lagi." },
      { status: 500 },
    );
  }
  const preferensi = dariBaris(data as Record<string, unknown>);
  return NextResponse.json({ ok: true, ada: true, preferensi });
}
