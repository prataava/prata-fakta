import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// Rate limit 30/menit/IP (temuan T3 audit keamanan Fase 7 —
// sebelumnya route ini tanpa batas laju).
const batasi = buatRateLimiter(30);

// GET /api/bookmark?artikel_id=… → { bookmarked }
// GET /api/bookmark?pengetahuan_id=… → { bookmarked }
// GET /api/bookmark?folder=<nama> → { folder, bookmark: [...] }
//   (daftar bookmark dalam satu folder; folder kosong "" =
//   "Tanpa folder"; tanpa target dan tanpa folder → 400).
// POST /api/bookmark { artikel_id } → toggle insert/delete → { bookmarked }
// POST /api/bookmark { pengetahuan_id } → toggle insert/delete → { bookmarked }
// POST /api/bookmark { artikel_id, folder } → simpan ke folder:
//   bookmark sudah ada → pindah folder; belum ada → buat di
//   folder itu (bukan toggle — folder yang menentukan).
//   folder "" = keluarkan dari folder (jadi "Tanpa folder").
//   Nama folder teks bebas, maks 50 karakter (validasi di sini;
//   kolom folder = migrasi v19, NULL = Tanpa folder).
// Tepat SATU dari artikel_id / pengetahuan_id (keduanya
// sekaligus → 400). Pengetahuan memakai kolom
// pf_bookmarks.pengetahuan_id (migrasi v16) — bukan tabel baru.
// Wajib login (401 bila tidak). Validasi UUID. POST menolak
// permintaan lintas situs (cekOrigin, P0-8). Bila tabel
// pf_bookmarks belum ada, kembalikan 503 jujur (bukan
// pura-pura sukses).
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAKS_FOLDER = 50;

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

/** Kolom target belum ada (migrasi v16 belum dijalankan) —
 *  PostgREST mengembalikan PGRST204 untuk kolom tak dikenal. */
function kolomBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    (error.message ?? "").includes("Could not find the 'pengetahuan_id' column")
  );
}

/** Kolom folder belum ada (migrasi v19 belum dijalankan) —
 *  PostgREST mengembalikan PGRST204 untuk kolom tak dikenal. */
function kolomFolderBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    (error.message ?? "").includes("Could not find the 'folder' column")
  );
}

/** Validasi nama folder: string kosong → null (Tanpa folder). */
function validasiFolder(
  nilai: unknown,
): { galat: string } | { folder: string | null } {
  if (typeof nilai !== "string") return { galat: "Nama folder tidak valid." };
  const folder = nilai.trim();
  if (folder.length > MAKS_FOLDER) {
    return {
      galat: `Nama folder terlalu panjang (maksimal ${MAKS_FOLDER} karakter).`,
    };
  }
  return { folder: folder === "" ? null : folder };
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
        "Layanan bookmark belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
    },
    { status: 503 },
  );
}

function respon503Pengetahuan() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Bookmark pengetahuan belum aktif (migrasi v16 belum dijalankan). Coba lagi nanti.",
    },
    { status: 503 },
  );
}

function respon503Folder() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Folder bookmark belum aktif (migrasi v19 belum dijalankan). Coba lagi nanti.",
    },
    { status: 503 },
  );
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk memakai bookmark." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;
  const param = new URL(req.url).searchParams;
  const artikelId = param.get("artikel_id") ?? "";
  const pengetahuanId = param.get("pengetahuan_id") ?? "";
  if (artikelId && pengetahuanId) {
    return NextResponse.json(
      { ok: false, error: "Isi salah satu: artikel_id atau pengetahuan_id." },
      { status: 400 },
    );
  }
  // P1-1: daftar isi satu folder (?folder=… tanpa target).
  // Nilai "" = folder NULL ("Tanpa folder").
  if (!artikelId && !pengetahuanId && param.has("folder")) {
    const mentah = param.get("folder") ?? "";
    const cekFolder = validasiFolder(mentah);
    if ("galat" in cekFolder) {
      return NextResponse.json(
        { ok: false, error: cekFolder.galat },
        { status: 400 },
      );
    }
    const folder = cekFolder.folder;
    const supabaseFolder = await createClient();
    let queryFolder = supabaseFolder
      .from("pf_bookmarks")
      .select(
        `id, folder, artikel_id, pengetahuan_id, dibuat_pada,
         pf_articles!left(slug, judul, status),
         pf_knowledge_articles!left(slug, judul, status)`,
      )
      .eq("user_id", pengguna.id)
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (folder === null) queryFolder = queryFolder.is("folder", null);
    else queryFolder = queryFolder.eq("folder", folder);
    const { data: baris, error: errFolder } = await queryFolder;
    if (errFolder) {
      if (tabelBelumAda(errFolder)) return respon503();
      if (kolomFolderBelumAda(errFolder)) return respon503Folder();
      void catatGalatRoute("GET /api/bookmark?folder=", errFolder);
      return NextResponse.json(
        { ok: false, error: "Gagal memuat folder bookmark. Coba lagi." },
        { status: 500 },
      );
    }
    const bookmark = ((baris ?? []) as unknown as {
      id: string;
      folder: string | null;
      artikel_id: string | null;
      pengetahuan_id: string | null;
      pf_articles: { slug: string; judul: string; status: string } | null;
      pf_knowledge_articles: {
        slug: string;
        judul: string;
        status: string;
      } | null;
    }[])
      .map((r) => {
        const artikelTerbit =
          r.pf_articles && r.pf_articles.status === "terbit"
            ? r.pf_articles
            : null;
        const pengetahuanTerbit =
          r.pf_knowledge_articles &&
          r.pf_knowledge_articles.status === "terbit"
            ? r.pf_knowledge_articles
            : null;
        const target = artikelTerbit ?? pengetahuanTerbit;
        if (!target) return null;
        return {
          id: String(r.id),
          folder: r.folder,
          jenis: artikelTerbit ? "artikel" : "pengetahuan",
          artikel_id: r.artikel_id,
          pengetahuan_id: r.pengetahuan_id,
          judul: target.judul,
          slug: target.slug,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ ok: true, folder, bookmark });
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pf_bookmarks")
    .select(target.kolom)
    .eq("user_id", pengguna.id)
    .eq(target.kolom, target.nilai)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return respon503();
    if (target.kolom === "pengetahuan_id" && kolomBelumAda(error)) {
      return respon503Pengetahuan();
    }
    void catatGalatRoute("GET /api/bookmark", error);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa bookmark. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, bookmarked: Boolean(data) });
}

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk memakai bookmark." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(await createClient(), pengguna.id);
  if (ditolak) return ditolak;

  let artikelId = "";
  let pengetahuanId = "";
  let folderMentah: unknown;
  let adaFolder = false;
  try {
    const body = (await req.json()) as {
      artikel_id?: unknown;
      pengetahuan_id?: unknown;
      folder?: unknown;
    };
    artikelId = typeof body.artikel_id === "string" ? body.artikel_id : "";
    pengetahuanId =
      typeof body.pengetahuan_id === "string" ? body.pengetahuan_id : "";
    adaFolder = "folder" in body;
    folderMentah = body.folder;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
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

  const supabase = await createClient();
  // Pengetahuan: baris target harus ada (bila tidak, FK
  // menolak insert dengan 500 — kembalikan 404 yang jujur).
  if (target.kolom === "pengetahuan_id") {
    const { data: adaTarget, error: errTarget } = await supabase
      .from("pf_knowledge_articles")
      .select("id")
      .eq("id", target.nilai)
      .maybeSingle();
    if (errTarget) {
      if (tabelBelumAda(errTarget)) return respon503();
      void catatGalatRoute("POST /api/bookmark", errTarget);
      return NextResponse.json(
        { ok: false, error: "Gagal memeriksa bookmark. Coba lagi." },
        { status: 500 },
      );
    }
    if (!adaTarget) {
      return NextResponse.json(
        { ok: false, error: "Artikel pengetahuan tidak ditemukan." },
        { status: 404 },
      );
    }
  }

  const { data: ada, error: errCek } = await supabase
    .from("pf_bookmarks")
    .select(target.kolom)
    .eq("user_id", pengguna.id)
    .eq(target.kolom, target.nilai)
    .maybeSingle();
  if (errCek) {
    if (tabelBelumAda(errCek)) return respon503();
    if (target.kolom === "pengetahuan_id" && kolomBelumAda(errCek)) {
      return respon503Pengetahuan();
    }
    void catatGalatRoute("POST /api/bookmark", errCek);
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa bookmark. Coba lagi." },
      { status: 500 },
    );
  }

  if (ada) {
    // P1-1: folder dikirim → BUKAN toggle, melainkan pindah
    // bookmark yang sudah ada ke folder itu.
    if (adaFolder) {
      const cekFolder = validasiFolder(folderMentah);
      if ("galat" in cekFolder) {
        return NextResponse.json(
          { ok: false, error: cekFolder.galat },
          { status: 400 },
        );
      }
      const { error: errPindah } = await supabase
        .from("pf_bookmarks")
        .update({ folder: cekFolder.folder })
        .eq("user_id", pengguna.id)
        .eq(target.kolom, target.nilai);
      if (errPindah) {
        if (tabelBelumAda(errPindah)) return respon503();
        if (kolomFolderBelumAda(errPindah)) return respon503Folder();
        void catatGalatRoute("POST /api/bookmark (pindah folder)", errPindah);
        return NextResponse.json(
          { ok: false, error: "Gagal memindahkan bookmark. Coba lagi." },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        bookmarked: true,
        folder: cekFolder.folder,
      });
    }
    const { error } = await supabase
      .from("pf_bookmarks")
      .delete()
      .eq("user_id", pengguna.id)
      .eq(target.kolom, target.nilai);
    if (error) {
      if (tabelBelumAda(error)) return respon503();
      void catatGalatRoute("POST /api/bookmark", error);
      return NextResponse.json(
        { ok: false, error: "Gagal menghapus bookmark. Coba lagi." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, bookmarked: false });
  }

  // P1-1: folder dikirim dan bookmark belum ada → buat bookmark
  // langsung di folder itu (bukan toggle).
  if (adaFolder) {
    const cekFolder = validasiFolder(folderMentah);
    if ("galat" in cekFolder) {
      return NextResponse.json(
        { ok: false, error: cekFolder.galat },
        { status: 400 },
      );
    }
    const { error: errBuatFolder } = await supabase
      .from("pf_bookmarks")
      .insert({
        user_id: pengguna.id,
        [target.kolom]: target.nilai,
        folder: cekFolder.folder,
      });
    if (errBuatFolder) {
      if (errBuatFolder.code === "23505") {
        return NextResponse.json({
          ok: true,
          bookmarked: true,
          folder: cekFolder.folder,
        });
      }
      if (tabelBelumAda(errBuatFolder)) return respon503();
      if (kolomFolderBelumAda(errBuatFolder)) return respon503Folder();
      void catatGalatRoute("POST /api/bookmark (simpan ke folder)", errBuatFolder);
      return NextResponse.json(
        { ok: false, error: "Gagal menyimpan bookmark. Coba lagi." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      bookmarked: true,
      folder: cekFolder.folder,
    });
  }

  const { error } = await supabase
    .from("pf_bookmarks")
    .insert({ user_id: pengguna.id, [target.kolom]: target.nilai });
  if (error) {
    // 23505 = unique violation → sudah ter-bookmark (balapan request).
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, bookmarked: true });
    }
    if (tabelBelumAda(error)) return respon503();
    if (target.kolom === "pengetahuan_id" && kolomBelumAda(error)) {
      return respon503Pengetahuan();
    }
    void catatGalatRoute("POST /api/bookmark", error);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan bookmark. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, bookmarked: true });
}
