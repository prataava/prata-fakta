import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Rate limit 30/menit (pola /api/bookmark, /api/topik).
const batasi = buatRateLimiter(30);

// GET /api/catatan → daftar catatan milik pengguna
//   (?artikel_id=… / ?pengetahuan_id=… untuk satu target).
// POST /api/catatan { artikel_id | pengetahuan_id, isi } → buat.
// PATCH /api/catatan { id, isi } → ubah isi milik sendiri.
// DELETE /api/catatan { id } → hapus milik sendiri.
// Catatan menunjuk TEPAT SATU target (CHECK pf_notes v19).
// Wajib login (401 bila tidak). Validasi UUID + isi 1–2000.
// PATCH/DELETE menolak catatan orang lain (403) dan catatan yang
// tidak ada (404). Tulis menolak permintaan lintas situs
// (cekOrigin, P0-8). Bila tabel pf_notes belum ada, kembalikan
// 503 jujur (bukan pura-pura sukses).
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAKS_ISI = 2000;

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
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

function respon503() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan catatan belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v19 dijalankan.",
    },
    { status: 503 },
  );
}

/** 401 bila belum login, 403 bila akun nonaktif — atau null bila lolos. */
async function autentikasi(): Promise<
  { pengguna: { id: string } } | { respon: NextResponse }
> {
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return {
      respon: NextResponse.json(
        { ok: false, error: "Masuk terlebih dahulu untuk memakai catatan." },
        { status: 401 },
      ),
    };
  }
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return { respon: ditolak };
  return { pengguna };
}

/**
 * Milik siapa catatan ini? Dipakai PATCH/DELETE untuk membedakan
 * 403 (ada tapi bukan milik) dari 404 (tidak ada sama sekali).
 * Klien pengguna tidak bisa melihat baris orang lain (RLS), jadi
 * keberadaan dicek lewat service client bila tersedia; bila
 * service client tidak tersedia (mis. kunci belum dipasang),
 * jawab 404 — jangan pernah membocorkan isi catatan orang lain.
 */
async function pemilikCatatan(
  id: string,
): Promise<{ ada: boolean; milik: string | null }> {
  const service = cobaServiceClient();
  if (!service) return { ada: false, milik: null };
  const { data, error } = await service
    .from("pf_notes")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { ada: false, milik: null };
  return { ada: true, milik: (data as { user_id: string }).user_id };
}

function validasiIsi(isi: unknown): { galat: string } | { nilai: string } {
  if (typeof isi !== "string") return { galat: "Isi catatan wajib diisi." };
  const nilai = isi.trim();
  if (nilai.length < 1) return { galat: "Isi catatan tidak boleh kosong." };
  if (nilai.length > MAKS_ISI) {
    return {
      galat: `Isi catatan terlalu panjang (maksimal ${MAKS_ISI} karakter).`,
    };
  }
  return { nilai };
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const auth = await autentikasi();
  if ("respon" in auth) return auth.respon;
  const param = new URL(req.url).searchParams;
  const artikelId = param.get("artikel_id") ?? "";
  const pengetahuanId = param.get("pengetahuan_id") ?? "";
  if (artikelId && pengetahuanId) {
    return NextResponse.json(
      { ok: false, error: "Isi salah satu: artikel_id atau pengetahuan_id." },
      { status: 400 },
    );
  }
  if (artikelId && !POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }
  if (pengetahuanId && !POLA_UUID.test(pengetahuanId)) {
    return NextResponse.json(
      { ok: false, error: "pengetahuan_id tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("pf_notes")
    .select(
      `id, user_id, artikel_id, pengetahuan_id, isi, dibuat_pada, diubah_pada,
       pf_articles!left(slug, judul),
       pf_knowledge_articles!left(slug, judul)`,
    )
    .eq("user_id", auth.pengguna.id)
    .order("dibuat_pada", { ascending: false })
    .limit(50);
  if (artikelId) query = query.eq("artikel_id", artikelId);
  if (pengetahuanId) query = query.eq("pengetahuan_id", pengetahuanId);
  const { data, error } = await query;
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("GET /api/catatan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat catatan. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, catatan: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasi();
  if ("respon" in auth) return auth.respon;

  let body: {
    artikel_id?: unknown;
    pengetahuan_id?: unknown;
    isi?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const artikelId =
    typeof body.artikel_id === "string" ? body.artikel_id : "";
  const pengetahuanId =
    typeof body.pengetahuan_id === "string" ? body.pengetahuan_id : "";
  if (artikelId && pengetahuanId) {
    return NextResponse.json(
      { ok: false, error: "Isi salah satu: artikel_id atau pengetahuan_id." },
      { status: 400 },
    );
  }
  const target = pengetahuanId
    ? { kolom: "pengetahuan_id", nilai: pengetahuanId }
    : { kolom: "artikel_id", nilai: artikelId };
  if (!POLA_UUID.test(target.nilai)) {
    return NextResponse.json(
      { ok: false, error: `${target.kolom} tidak valid.` },
      { status: 400 },
    );
  }
  const cekIsi = validasiIsi(body.isi);
  if ("galat" in cekIsi) {
    return NextResponse.json(
      { ok: false, error: cekIsi.galat },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  // Target harus ada dan terlihat pengguna (artikel terbit) —
  // bila tidak, FK menolak insert dengan 500; kembalikan 404
  // yang jujur. RLS artikel hanya menampilkan yang terbit, jadi
  // draf otomatis tidak bisa dicatat.
  const tabelTarget =
    target.kolom === "pengetahuan_id"
      ? "pf_knowledge_articles"
      : "pf_articles";
  const { data: adaTarget, error: errTarget } = await supabase
    .from(tabelTarget)
    .select("id")
    .eq("id", target.nilai)
    .maybeSingle();
  if (errTarget) {
    if (tabelBelumAda(errTarget)) return respon503();
    void catatGalatRoute("POST /api/catatan", errTarget);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa artikel. Coba lagi." },
      { status: 500 },
    );
  }
  if (!adaTarget) {
    return NextResponse.json(
      { ok: false, error: "Artikel tidak ditemukan." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("pf_notes")
    .insert({
      user_id: auth.pengguna.id,
      [target.kolom]: target.nilai,
      isi: cekIsi.nilai,
    })
    .select(
      "id, user_id, artikel_id, pengetahuan_id, isi, dibuat_pada, diubah_pada",
    )
    .single();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("POST /api/catatan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan catatan. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, catatan: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasi();
  if ("respon" in auth) return auth.respon;

  let body: { id?: unknown; isi?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id catatan tidak valid." },
      { status: 400 },
    );
  }
  const cekIsi = validasiIsi(body.isi);
  if ("galat" in cekIsi) {
    return NextResponse.json(
      { ok: false, error: cekIsi.galat },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_notes")
    .update({ isi: cekIsi.nilai, diubah_pada: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.pengguna.id)
    .select(
      "id, user_id, artikel_id, pengetahuan_id, isi, dibuat_pada, diubah_pada",
    )
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("PATCH /api/catatan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal mengubah catatan. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    const pemilik = await pemilikCatatan(id);
    if (pemilik.ada && pemilik.milik !== auth.pengguna.id) {
      return NextResponse.json(
        { ok: false, error: "Catatan ini bukan milik Anda." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Catatan tidak ditemukan." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, catatan: data });
}

export async function DELETE(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasi();
  if ("respon" in auth) return auth.respon;

  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id catatan tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.pengguna.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    void catatGalatRoute("DELETE /api/catatan", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus catatan. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    const pemilik = await pemilikCatatan(id);
    if (pemilik.ada && pemilik.milik !== auth.pengguna.id) {
      return NextResponse.json(
        { ok: false, error: "Catatan ini bukan milik Anda." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Catatan tidak ditemukan." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, dihapus: true });
}
