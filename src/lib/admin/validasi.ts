// Validator input murni untuk route /api/admin/* — PINDAHAN FU2
// (16 Nov 2026). Fungsi-fungsi ini SEMULA diekspor dari berkas
// route.ts (admin/event, admin/cerita, admin/pengetahuan,
// admin/akademi, admin/akademi/[id]) — Next.js (webpack)
// menolak ekspor non-handler dari route.ts (TS2344: ekspor harus
// GET/POST/dll), sehingga build --webpack gagal sementara
// Turbopack lolos. Perilaku dipindah MENTAH (tanpa refactor isi);
// pola bersama yang semula terduplikasi di tiap route (POLA_SLUG,
// POLA_TANGGAL, stringAtauNull) disatukan satu salinan di sini —
// ketiganya karakter-identik di semua berkas asal. Route + baterai
// mengimpor dari sini; route.ts tidak lagi mengekspor apa pun
// selain handler.
import { slugCeritaValid } from "@/lib/cerita";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_NEGARA = /^[A-Z]{2}$/;
const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function stringAtauNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function validasiReferensi(
  v: unknown,
):
  | { ok: true; data: { judul: string | null; url: string | null }[] }
  | { ok: false; error: string } {
  if (!Array.isArray(v) || v.length > 50) {
    return { ok: false, error: "Referensi harus array maksimal 50 entri." };
  }
  const hasil: { judul: string | null; url: string | null }[] = [];
  for (const r of v as unknown[]) {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      return { ok: false, error: "Entri referensi tidak valid." };
    }
    const o = r as Record<string, unknown>;
    const judul = stringAtauNull(o.judul);
    const url = stringAtauNull(o.url);
    if (url && !/^https?:\/\/.+/i.test(url)) {
      return { ok: false, error: "URL referensi harus diawali http(s)://." };
    }
    if (!judul && !url) continue;
    hasil.push({ judul, url });
  }
  return { ok: true, data: hasil };
}

/* ============================================================
   Event (semula src/app/api/admin/event/route.ts)
   ============================================================ */

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

/* ============================================================
   Cerita (semula src/app/api/admin/cerita/route.ts)
   ============================================================ */

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

/* ============================================================
   Pengetahuan (semula src/app/api/admin/pengetahuan/route.ts)
   ============================================================ */

export const TOPIK_VALID = [
  "sejarah",
  "geografi",
  "negara",
  "sains",
  "teknologi",
  "ekonomi",
  "alam",
  "tubuh",
  "umum",
] as const;

export type InputPengetahuan = {
  judul: string;
  slug: string;
  topik: string;
  ringkasan: string | null;
  isi: string | null;
  referensi: { judul: string | null; url: string | null }[];
  status: string;
  harian_tanggal: string | null;
  penulis_nama: string | null;
  jenis: string;
  tingkat: string;
  estimasi_baca_menit: number | null;
  seri_slug: string | null;
};

/** Validasi murni input pengetahuan (diekspos untuk uji).
 *  parsial=true untuk PATCH (hanya field yang dikirim divalidasi). */
export function validasiInputPengetahuan(
  body: Record<string, unknown>,
  parsial = false,
):
  | { ok: true; data: Partial<InputPengetahuan> }
  | { ok: false; error: string } {
  const data: Partial<InputPengetahuan> = {};
  if (!parsial || body.judul !== undefined) {
    if (typeof body.judul !== "string" || body.judul.trim() === "") {
      return { ok: false, error: "Judul wajib diisi." };
    }
    if (body.judul.trim().length > 200) {
      return { ok: false, error: "Judul maksimal 200 karakter." };
    }
    data.judul = body.judul.trim();
  }
  if (!parsial || body.slug !== undefined) {
    if (typeof body.slug !== "string" || !POLA_SLUG.test(body.slug)) {
      return {
        ok: false,
        error: "Slug tidak valid (huruf kecil, angka, dan tanda -).",
      };
    }
    data.slug = body.slug;
  }
  if (body.topik !== undefined) {
    if (
      typeof body.topik !== "string" ||
      !(TOPIK_VALID as readonly string[]).includes(body.topik)
    ) {
      return { ok: false, error: "Topik tidak valid." };
    }
    data.topik = body.topik;
  }
  if (body.ringkasan !== undefined) {
    data.ringkasan = stringAtauNull(body.ringkasan);
  }
  if (body.isi !== undefined) {
    data.isi = stringAtauNull(body.isi);
  }
  if (body.referensi !== undefined) {
    if (!Array.isArray(body.referensi) || body.referensi.length > 50) {
      return { ok: false, error: "Referensi harus array maksimal 50 entri." };
    }
    const referensi: { judul: string | null; url: string | null }[] = [];
    for (const r of body.referensi as unknown[]) {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        return { ok: false, error: "Entri referensi tidak valid." };
      }
      const o = r as Record<string, unknown>;
      const judul = stringAtauNull(o.judul);
      const url = stringAtauNull(o.url);
      if (url && !/^https?:\/\/.+/i.test(url)) {
        return { ok: false, error: "URL referensi harus diawali http(s)://." };
      }
      if (!judul && !url) continue;
      referensi.push({ judul, url });
    }
    data.referensi = referensi;
  }
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "terbit") {
      return { ok: false, error: "Status harus draft atau terbit." };
    }
    data.status = body.status;
  }
  if (body.harian_tanggal !== undefined) {
    if (body.harian_tanggal === null) {
      data.harian_tanggal = null;
    } else if (
      typeof body.harian_tanggal === "string" &&
      POLA_TANGGAL.test(body.harian_tanggal)
    ) {
      data.harian_tanggal = body.harian_tanggal;
    } else {
      return { ok: false, error: "harian_tanggal harus format YYYY-MM-DD." };
    }
  }
  if (body.penulis_nama !== undefined) {
    data.penulis_nama = stringAtauNull(body.penulis_nama);
  }
  if (body.jenis !== undefined) {
    if (body.jenis !== "artikel" && body.jenis !== "explainer") {
      return { ok: false, error: "Jenis harus artikel atau explainer." };
    }
    data.jenis = body.jenis;
  }
  if (body.tingkat !== undefined) {
    if (
      body.tingkat !== "pemula" &&
      body.tingkat !== "menengah" &&
      body.tingkat !== "mendalam"
    ) {
      return { ok: false, error: "Tingkat tidak valid." };
    }
    data.tingkat = body.tingkat;
  }
  if (body.estimasi_baca_menit !== undefined) {
    if (body.estimasi_baca_menit === null) {
      data.estimasi_baca_menit = null;
    } else if (
      typeof body.estimasi_baca_menit === "number" &&
      Number.isInteger(body.estimasi_baca_menit) &&
      body.estimasi_baca_menit >= 1 &&
      body.estimasi_baca_menit <= 120
    ) {
      data.estimasi_baca_menit = body.estimasi_baca_menit;
    } else {
      return {
        ok: false,
        error: "Estimasi baca harus bilangan bulat 1 sampai 120 menit.",
      };
    }
  }
  if (body.seri_slug !== undefined) {
    if (body.seri_slug === null) {
      data.seri_slug = null;
    } else if (
      typeof body.seri_slug === "string" &&
      POLA_SLUG.test(body.seri_slug)
    ) {
      data.seri_slug = body.seri_slug;
    } else {
      return { ok: false, error: "seri_slug tidak valid." };
    }
  }
  return { ok: true, data };
}

/* ============================================================
   Akademi — kursus (semula src/app/api/admin/akademi/route.ts)
   ============================================================ */

/** Validasi murni input kursus (diekspos untuk uji).
 *  parsial=true untuk PATCH (hanya field yang dikirim divalidasi). */
export function validasiInputKursus(
  body: Record<string, unknown>,
  parsial = false,
):
  | {
      ok: true;
      data: {
        slug?: string;
        judul?: string;
        deskripsi?: string | null;
        kategori?: string;
        tingkat?: string;
        status?: string;
        urutan?: number;
      };
    }
  | { ok: false; error: string } {
  const data: {
    slug?: string;
    judul?: string;
    deskripsi?: string | null;
    kategori?: string;
    tingkat?: string;
    status?: string;
    urutan?: number;
  } = {};
  if (!parsial || body.slug !== undefined) {
    if (typeof body.slug !== "string" || !POLA_SLUG.test(body.slug)) {
      return {
        ok: false,
        error: "Slug tidak valid (huruf kecil, angka, dan tanda -).",
      };
    }
    data.slug = body.slug;
  }
  if (!parsial || body.judul !== undefined) {
    if (typeof body.judul !== "string" || body.judul.trim() === "") {
      return { ok: false, error: "Judul wajib diisi." };
    }
    if (body.judul.trim().length > 200) {
      return { ok: false, error: "Judul maksimal 200 karakter." };
    }
    data.judul = body.judul.trim();
  }
  if (body.deskripsi !== undefined) {
    data.deskripsi = stringAtauNull(body.deskripsi);
  }
  if (body.kategori !== undefined) {
    if (
      typeof body.kategori !== "string" ||
      body.kategori.trim() === "" ||
      body.kategori.trim().length > 60
    ) {
      return { ok: false, error: "Kategori wajib diisi (maksimal 60 karakter)." };
    }
    data.kategori = body.kategori.trim();
  }
  if (body.tingkat !== undefined) {
    if (
      body.tingkat !== "pemula" &&
      body.tingkat !== "menengah" &&
      body.tingkat !== "mendalam"
    ) {
      return { ok: false, error: "Tingkat tidak valid." };
    }
    data.tingkat = body.tingkat;
  }
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "terbit") {
      return { ok: false, error: "Status harus draft atau terbit." };
    }
    data.status = body.status;
  }
  if (body.urutan !== undefined) {
    if (
      typeof body.urutan !== "number" ||
      !Number.isInteger(body.urutan) ||
      body.urutan < 0 ||
      body.urutan > 1000
    ) {
      return { ok: false, error: "Urutan harus bilangan bulat 0 sampai 1000." };
    }
    data.urutan = body.urutan;
  }
  return { ok: true, data };
}

/* ============================================================
   Akademi — struktur kursus
   (semula src/app/api/admin/akademi/[id]/route.ts)
   ============================================================ */

export type EntriModul = {
  id?: string;
  /** Kunci sementara pilihan klien (modul BARU saja) — dirujuk
   *  pelajaran baru lewat `modul_kunci` dalam PATCH yang sama. */
  kunci?: string;
  judul?: string;
  deskripsi?: string | null;
  urutan?: number;
  hapus?: boolean;
};

export type EntriPelajaran = {
  id?: string;
  module_id?: string;
  /** Rujuk modul BARU di PATCH yang sama via kunci sementaranya
   *  (alternatif module_id; salah satu wajib untuk pelajaran baru). */
  modul_kunci?: string;
  judul?: string;
  isi?: string | null;
  jenis?: string;
  referensi?: { judul: string | null; url: string | null }[];
  artikel_id?: string | null;
  kuis_tanggal?: string | null;
  urutan?: number;
  hapus?: boolean;
};

/** Validasi murni array modul/pelajaran untuk PATCH (diekspos
 *  untuk uji). Mengembalikan entri ternormalisasi. */
export function validasiStruktur(
  body: Record<string, unknown>,
):
  | { ok: true; modul: EntriModul[]; pelajaran: EntriPelajaran[] }
  | { ok: false; error: string } {
  const modul: EntriModul[] = [];
  const pelajaran: EntriPelajaran[] = [];
  if (body.modul !== undefined) {
    if (!Array.isArray(body.modul) || body.modul.length > 50) {
      return { ok: false, error: "modul harus array maksimal 50 entri." };
    }
    for (const m of body.modul as unknown[]) {
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        return { ok: false, error: "Entri modul tidak valid." };
      }
      const o = m as Record<string, unknown>;
      const entri: EntriModul = {};
      if (o.id !== undefined) {
        if (typeof o.id !== "string" || !POLA_UUID.test(o.id)) {
          return { ok: false, error: "ID modul tidak valid." };
        }
        entri.id = o.id;
      }
      if (o.hapus === true) {
        if (!entri.id) {
          return { ok: false, error: "Hapus modul butuh id." };
        }
        entri.hapus = true;
        modul.push(entri);
        continue;
      }
      // Kunci sementara (modul baru): dirujuk pelajaran baru
      // lewat modul_kunci. Hanya huruf/angka/-/_ , maks 40.
      if (o.kunci !== undefined) {
        if (
          typeof o.kunci !== "string" ||
          !/^[A-Za-z0-9_-]{1,40}$/.test(o.kunci)
        ) {
          return { ok: false, error: "Kunci modul tidak valid." };
        }
        entri.kunci = o.kunci;
      }
      if (entri.id === undefined) {
        if (typeof o.judul !== "string" || o.judul.trim() === "") {
          return { ok: false, error: "Judul modul wajib diisi." };
        }
      } else if (
        o.judul !== undefined &&
        (typeof o.judul !== "string" || o.judul.trim() === "")
      ) {
        return { ok: false, error: "Judul modul wajib diisi." };
      }
      if (o.judul !== undefined) entri.judul = (o.judul as string).trim();
      if (o.deskripsi !== undefined) entri.deskripsi = stringAtauNull(o.deskripsi);
      if (o.urutan !== undefined) {
        if (
          typeof o.urutan !== "number" ||
          !Number.isInteger(o.urutan) ||
          o.urutan < 0 ||
          o.urutan > 1000
        ) {
          return { ok: false, error: "Urutan modul harus bilangan bulat 0 sampai 1000." };
        }
        entri.urutan = o.urutan;
      }
      modul.push(entri);
    }
  }
  if (body.pelajaran !== undefined) {
    if (!Array.isArray(body.pelajaran) || body.pelajaran.length > 200) {
      return { ok: false, error: "pelajaran harus array maksimal 200 entri." };
    }
    for (const p of body.pelajaran as unknown[]) {
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return { ok: false, error: "Entri pelajaran tidak valid." };
      }
      const o = p as Record<string, unknown>;
      const entri: EntriPelajaran = {};
      if (o.id !== undefined) {
        if (typeof o.id !== "string" || !POLA_UUID.test(o.id)) {
          return { ok: false, error: "ID pelajaran tidak valid." };
        }
        entri.id = o.id;
      }
      if (o.hapus === true) {
        if (!entri.id) {
          return { ok: false, error: "Hapus pelajaran butuh id." };
        }
        entri.hapus = true;
        pelajaran.push(entri);
        continue;
      }
      if (o.module_id !== undefined) {
        if (typeof o.module_id !== "string" || !POLA_UUID.test(o.module_id)) {
          return { ok: false, error: "module_id pelajaran tidak valid." };
        }
        entri.module_id = o.module_id;
      }
      // Modul_kunci: rujuk modul BARU di PATCH yang sama.
      if (o.modul_kunci !== undefined) {
        if (
          typeof o.modul_kunci !== "string" ||
          !/^[A-Za-z0-9_-]{1,40}$/.test(o.modul_kunci)
        ) {
          return { ok: false, error: "modul_kunci pelajaran tidak valid." };
        }
        entri.modul_kunci = o.modul_kunci;
      }
      if (entri.id === undefined) {
        if (!entri.module_id && !entri.modul_kunci) {
          return { ok: false, error: "Pelajaran baru wajib punya module_id atau modul_kunci." };
        }
        if (typeof o.judul !== "string" || o.judul.trim() === "") {
          return { ok: false, error: "Judul pelajaran wajib diisi." };
        }
      } else if (
        o.judul !== undefined &&
        (typeof o.judul !== "string" || o.judul.trim() === "")
      ) {
        return { ok: false, error: "Judul pelajaran wajib diisi." };
      }
      if (o.judul !== undefined) entri.judul = (o.judul as string).trim();
      if (o.isi !== undefined) entri.isi = stringAtauNull(o.isi);
      if (o.jenis !== undefined) {
        if (o.jenis !== "materi" && o.jenis !== "artikel" && o.jenis !== "kuis") {
          return { ok: false, error: "Jenis pelajaran tidak valid." };
        }
        entri.jenis = o.jenis;
      }
      if (o.referensi !== undefined) {
        const ref = validasiReferensi(o.referensi);
        if (!ref.ok) return ref;
        entri.referensi = ref.data;
      }
      if (o.artikel_id !== undefined) {
        if (o.artikel_id === null) {
          entri.artikel_id = null;
        } else if (
          typeof o.artikel_id === "string" &&
          POLA_UUID.test(o.artikel_id)
        ) {
          entri.artikel_id = o.artikel_id;
        } else {
          return { ok: false, error: "artikel_id pelajaran tidak valid." };
        }
      }
      if (o.kuis_tanggal !== undefined) {
        if (o.kuis_tanggal === null) {
          entri.kuis_tanggal = null;
        } else if (
          typeof o.kuis_tanggal === "string" &&
          POLA_TANGGAL.test(o.kuis_tanggal)
        ) {
          entri.kuis_tanggal = o.kuis_tanggal;
        } else {
          return { ok: false, error: "kuis_tanggal harus format YYYY-MM-DD." };
        }
      }
      if (o.urutan !== undefined) {
        if (
          typeof o.urutan !== "number" ||
          !Number.isInteger(o.urutan) ||
          o.urutan < 0 ||
          o.urutan > 1000
        ) {
          return { ok: false, error: "Urutan pelajaran harus bilangan bulat 0 sampai 1000." };
        }
        entri.urutan = o.urutan;
      }
      pelajaran.push(entri);
    }
  }
  return { ok: true, modul, pelajaran };
}
