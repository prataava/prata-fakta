// Lapisan akses data Fase 6 PRATA FAKTA (server).
// Prinsip sama seperti src/lib/data.ts: gagal-aman (try/catch → [] /
// null), Bahasa Indonesia, tanpa data palsu. Bila tabel pf_* Fase 6
// belum dibuat (migrasi v6 masih menunggu dijalankan) atau query
// gagal, fungsi-fungsi ini mengembalikan array kosong / null dan
// pemanggil menampilkan empty state jujur — bukan angka, koordinat,
// atau artikel karangan.
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import { tanggalWibHariIni } from "@/lib/rutin";
import type { PfArtikelRingkas } from "@/lib/data";

/* ============================================================
   Tipe
   ============================================================ */

export type PfEvent = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  lintang: number | null;
  bujur: number | null;
  dimulai_pada: string | null;
  berakhir_pada: string | null;
  dampak: string | null;
  sumber_url: string | null;
  artikel_id: string | null;
};

export type PfArtikelBerkoordinat = PfArtikelRingkas & {
  lintang: number;
  bujur: number;
};

export type PfTimelineEvent = {
  id: string;
  event_id: string;
  waktu: string | null;
  peristiwa: string;
  sumber: string | null;
  perubahan: string | null;
};

export type PfIndikator = {
  id: string;
  nama: string;
  slug: string;
  kategori: string;
  satuan: string | null;
  sumber_nama: string | null;
  sumber_url: string | null;
  metodologi: string | null;
  tanggal_pembaruan: string | null;
  ringkasan_tren: string | null;
  /** Nilai terakhir dari pf_data_points; null bila belum ada poin. */
  nilai_terakhir: number | null;
  tanggal_nilai_terakhir: string | null;
};

export type PfPoinIndikator = {
  tanggal: string;
  nilai: number;
};

export type PfReferensi = {
  judul: string | null;
  url: string | null;
};

export type PfArtikelPengetahuan = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  isi: string | null;
  topik: string;
  referensi: PfReferensi[];
  status: string;
  harian_tanggal: string | null;
  penulis_nama: string | null;
};

export type PfKuisSoal = {
  id: string;
  tanggal: string;
  pertanyaan: string;
  opsi: string[];
  kunci: number;
  penjelasan: string | null;
  sumber_url: string | null;
  sumber_nama: string | null;
  artikel_id: string | null;
};

/**
 * Tipe soal kuis untuk klien — TANPA kunci jawaban (temuan T1 audit
 * keamanan Fase 7). Kunci hanya terungkap satu per satu lewat
 * POST /api/kuis/jawab sesudah pengguna menjawab.
 */
export type PfKuisSoalPublik = Omit<PfKuisSoal, "kunci">;

export type PfPertanyaan = {
  id: string;
  user_id: string | null;
  pertanyaan: string;
  jawaban: string | null;
  referensi: PfReferensi[];
  status: string;
  // Kolom v10 (Fase 8 Gelombang 2): kategori + publik + membantu.
  kategori: string | null;
  publik: boolean;
  membantu: number;
  dibuat_pada: string | null;
  dijawab_pada: string | null;
};

export type PfTopikDiikuti = {
  id: string;
  user_id: string;
  tipe: string;
  target: string;
  dibuat_pada: string | null;
};

export type PfNotifikasi = {
  id: string;
  user_id: string;
  jenis: string;
  judul: string;
  isi: string | null;
  tautan: string | null;
  dibaca: boolean;
  dibuat_pada: string | null;
};

export type PfRiwayatBaca = {
  id: string;
  artikel: PfArtikelRingkas;
  dibaca_pada: string | null;
  selesai: boolean;
};

/* ============================================================
   Util
   ============================================================ */

function keAngka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function keReferensi(v: unknown): PfReferensi[] {
  if (!Array.isArray(v)) return [];
  const hasil: PfReferensi[] = [];
  for (const r of v as unknown[]) {
    if (typeof r === "string") {
      hasil.push({ judul: r, url: null });
    } else if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const judul =
        typeof o.judul === "string"
          ? o.judul
          : typeof o.nama === "string"
            ? o.nama
            : null;
      const url = typeof o.url === "string" ? o.url : null;
      if (judul || url) hasil.push({ judul, url });
    }
  }
  return hasil;
}

function keOpsiKuis(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .map((o) => (typeof o === "string" ? o : String(o ?? "")))
    .slice(0, 5);
}

function barisEvent(r: Record<string, unknown>): PfEvent {
  return {
    id: String(r.id),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    lokasi_teks: (r.lokasi_teks as string | null) ?? null,
    lintang: keAngka(r.lintang),
    bujur: keAngka(r.bujur),
    dimulai_pada: (r.dimulai_pada as string | null) ?? null,
    berakhir_pada: (r.berakhir_pada as string | null) ?? null,
    dampak: (r.dampak as string | null) ?? null,
    sumber_url: (r.sumber_url as string | null) ?? null,
    artikel_id: (r.artikel_id as string | null) ?? null,
  };
}

const KOLOM_EVENT =
  "id, judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, berakhir_pada, dampak, sumber_url, artikel_id";

/* ============================================================
   Peta & peristiwa
   ============================================================ */

/** Event yang punya koordinat terverifikasi (lintang+bujur non-null),
 *  terbaru dulu. Hanya ini yang boleh jadi marker di /peta. */
export async function getEventDenganKoordinat(
  limit = 100,
): Promise<PfEvent[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select(KOLOM_EVENT)
      .not("lintang", "is", null)
      .not("bujur", "is", null)
      .order("dimulai_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(barisEvent);
  } catch {
    return [];
  }
}

/** Artikel terbit yang punya koordinat terverifikasi (lintang+bujur
 *  non-null, kolom Fase 6 di pf_articles). Marker peta juga. */
export async function getArtikelDenganKoordinat(
  limit = 100,
): Promise<PfArtikelBerkoordinat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(
        "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada, lintang, bujur",
      )
      .eq("status", "terbit")
      .not("lintang", "is", null)
      .not("bujur", "is", null)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const hasil: PfArtikelBerkoordinat[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      const lat = keAngka(r.lintang);
      const lng = keAngka(r.bujur);
      if (lat === null || lng === null) continue;
      hasil.push({
        id: String(r.id),
        slug: String(r.slug),
        judul: String(r.judul ?? ""),
        ringkasan: (r.ringkasan as string | null) ?? null,
        kategori_slug: (r.kategori_slug as string | null) ?? null,
        status_verifikasi: String(r.status_verifikasi ?? "UNCONFIRMED"),
        diterbitkan_pada: (r.diterbitkan_pada as string | null) ?? null,
        lintang: lat,
        bujur: lng,
      });
    }
    return hasil;
  } catch {
    return [];
  }
}

/* ============================================================
   Skor kuis (riwayat pengguna — Fase 7)
   ============================================================ */

export type PfSkorKuis = {
  tanggal: string;
  benar: number;
  total: number;
  dibuat_pada: string | null;
};

/** Riwayat skor kuis pengguna, terbaru dulu (maks `limit` baris). */
export async function getRiwayatSkor(
  userId: string,
  limit = 7,
): Promise<PfSkorKuis[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_quiz_scores")
      .select("tanggal, benar, total, dibuat_pada")
      .eq("user_id", userId)
      .order("tanggal", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[])
      .filter((r) => typeof r.tanggal === "string")
      .map((r) => ({
        tanggal: String(r.tanggal),
        benar: typeof r.benar === "number" ? r.benar : 0,
        total: typeof r.total === "number" ? r.total : 5,
        dibuat_pada:
          typeof r.dibuat_pada === "string" ? r.dibuat_pada : null,
      }));
  } catch {
    return [];
  }
}

/** Semua event + hitungan berapa yang punya koordinat. */export async function getSemuaEvent(
  limit = 100,
): Promise<{ events: PfEvent[]; adaKoordinat: number }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select(KOLOM_EVENT)
      .order("dimulai_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return { events: [], adaKoordinat: 0 };
    const events = (data as unknown as Record<string, unknown>[]).map(
      barisEvent,
    );
    return {
      events,
      adaKoordinat: events.filter(
        (e) => e.lintang !== null && e.bujur !== null,
      ).length,
    };
  } catch {
    return { events: [], adaKoordinat: 0 };
  }
}

/** Satu event berdasarkan id (untuk /timeline atau tautan peta). */
export async function getEvent(id: string): Promise<PfEvent | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select(KOLOM_EVENT)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return barisEvent(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Entri kronologi satu event, urut waktu menaik. */
export async function getTimelineEvent(
  eventId: string,
): Promise<PfTimelineEvent[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_event_timeline")
      .select("id, event_id, waktu, peristiwa, sumber, perubahan")
      .eq("event_id", eventId)
      .order("waktu", { ascending: true });
    if (error || !data) return [];
    return data as PfTimelineEvent[];
  } catch {
    return [];
  }
}

/** Semua entri kronologi, terbaru dulu (untuk /timeline). */
export async function getSemuaTimeline(
  limit = 50,
): Promise<PfTimelineEvent[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_event_timeline")
      .select("id, event_id, waktu, peristiwa, sumber, perubahan")
      .order("waktu", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfTimelineEvent[];
  } catch {
    return [];
  }
}

/* ============================================================
   Pusat data (indikator)
   ============================================================ */

/** Semua indikator + nilai terakhir masing-masing dari
 *  pf_data_points. [] bila tabel belum ada. */
export async function getIndikator(
  kategori?: string,
): Promise<PfIndikator[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_data_indicators")
      .select(
        "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan, ringkasan_tren",
      )
      .order("nama", { ascending: true });
    if (kategori) query = query.eq("kategori", kategori);
    const { data, error } = await query;
    if (error || !data) return [];

    const hasil: PfIndikator[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      let nilai_terakhir: number | null = null;
      let tanggal_nilai_terakhir: string | null = null;
      try {
        const { data: poin, error: errPoin } = await supabase
          .from("pf_data_points")
          .select("tanggal, nilai")
          .eq("indikator_id", String(r.id))
          .order("tanggal", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!errPoin && poin) {
          nilai_terakhir = keAngka(
            (poin as Record<string, unknown>).nilai,
          );
          tanggal_nilai_terakhir =
            ((poin as Record<string, unknown>).tanggal as string | null) ??
            null;
        }
      } catch {
        // Poin gagal dibaca: indikator tetap tampil tanpa nilai.
      }
      hasil.push({
        id: String(r.id),
        nama: String(r.nama ?? ""),
        slug: String(r.slug ?? ""),
        kategori: String(r.kategori ?? ""),
        satuan: (r.satuan as string | null) ?? null,
        sumber_nama: (r.sumber_nama as string | null) ?? null,
        sumber_url: (r.sumber_url as string | null) ?? null,
        metodologi: (r.metodologi as string | null) ?? null,
        tanggal_pembaruan: (r.tanggal_pembaruan as string | null) ?? null,
        ringkasan_tren: (r.ringkasan_tren as string | null) ?? null,
        nilai_terakhir,
        tanggal_nilai_terakhir,
      });
    }
    return hasil;
  } catch {
    return [];
  }
}

/** Poin deret waktu satu indikator (berdasarkan slug), tertua dulu
 *  agar grafik garis bisa digambar berurutan. */
export async function getPoinIndikator(
  slug: string,
  limit = 60,
): Promise<PfPoinIndikator[]> {
  try {
    const supabase = await createClient();
    const { data: ind, error: errInd } = await supabase
      .from("pf_data_indicators")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (errInd || !ind) return [];
    const { data, error } = await supabase
      .from("pf_data_points")
      .select("tanggal, nilai")
      .eq("indikator_id", (ind as { id: string }).id)
      .order("tanggal", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const poin: PfPoinIndikator[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      const nilai = keAngka(r.nilai);
      if (nilai === null || typeof r.tanggal !== "string") continue;
      poin.push({ tanggal: r.tanggal, nilai });
    }
    return poin.reverse();
  } catch {
    return [];
  }
}

/* ============================================================
   Pengetahuan
   ============================================================ */

export const TOPIK_PENGETAHUAN = [
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

export type TopikPengetahuan = (typeof TOPIK_PENGETAHUAN)[number];

const KOLOM_PENGETAHUAN =
  "id, slug, judul, ringkasan, isi, topik, referensi, status, harian_tanggal, penulis_nama";

function barisPengetahuan(r: Record<string, unknown>): PfArtikelPengetahuan {
  return {
    id: String(r.id),
    slug: String(r.slug),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    isi: (r.isi as string | null) ?? null,
    topik: String(r.topik ?? "umum"),
    referensi: keReferensi(r.referensi),
    status: String(r.status ?? ""),
    harian_tanggal: (r.harian_tanggal as string | null) ?? null,
    penulis_nama: (r.penulis_nama as string | null) ?? null,
  };
}

/** Artikel pengetahuan terbit; filter topik opsional. */
export async function getArtikelPengetahuan(
  topik?: string,
  limit = 24,
): Promise<PfArtikelPengetahuan[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_PENGETAHUAN)
      .eq("status", "terbit")
      .order("harian_tanggal", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (topik) query = query.eq("topik", topik);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(
      barisPengetahuan,
    );
  } catch {
    return [];
  }
}

/** Artikel pengetahuan lengkap berdasarkan slug (hanya terbit). */
export async function getPengetahuanLengkap(
  slug: string,
): Promise<PfArtikelPengetahuan | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_PENGETAHUAN)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (error || !data) return null;
    return barisPengetahuan(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** "Fakta Hari Ini": artikel terbit yang harian_tanggal-nya sama
 *  dengan tanggal YYYY-MM-DD yang diminta. null bila belum ada. */
export async function getPengetahuanHarian(
  tanggal: string,
): Promise<PfArtikelPengetahuan | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_PENGETAHUAN)
      .eq("status", "terbit")
      .eq("harian_tanggal", tanggal)
      .maybeSingle();
    if (error || !data) return null;
    return barisPengetahuan(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/* ============================================================
   Kuis harian
   ============================================================ */

/** 5 pertanyaan kuis untuk tanggal YYYY-MM-DD yang diminta.
 *  T1-sisa (Fase 8 Gelombang 1): kolom `kunci` dibaca via service
 *  role bila key tersedia — migrasi v8 me-REVOKE SELECT (kunci)
 *  dari anon/authenticated, jadi session client tidak bisa lagi
 *  membaca kolom itu. Bila key belum diatur (mis. dev sebelum
 *  v8), mundur ke session client seperti sebelumnya; kunci tetap
 *  TIDAK PERNAH diteruskan ke klien (halaman /kuis memetakan ke
 *  PfKuisSoalPublik). */
export async function getKuisHarian(tanggal: string): Promise<PfKuisSoal[]> {
  try {
    const supabase = cobaServiceClient() ?? (await createClient());
    const { data, error } = await supabase
      .from("pf_quiz_questions")
      .select(
        "id, tanggal, pertanyaan, opsi, kunci, penjelasan, sumber_url, sumber_nama, artikel_id",
      )
      .eq("tanggal", tanggal)
      .order("id", { ascending: true })
      .limit(5);
    if (error || !data) return [];
    const hasil: PfKuisSoal[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      const opsi = keOpsiKuis(r.opsi);
      if (opsi.length === 0) continue;
      const kunci = typeof r.kunci === "number" ? r.kunci : -1;
      if (kunci < 0 || kunci >= opsi.length) continue;
      hasil.push({
        id: String(r.id),
        tanggal: String(r.tanggal),
        pertanyaan: String(r.pertanyaan ?? ""),
        opsi,
        kunci,
        penjelasan: (r.penjelasan as string | null) ?? null,
        sumber_url: (r.sumber_url as string | null) ?? null,
        sumber_nama: (r.sumber_nama as string | null) ?? null,
        artikel_id: (r.artikel_id as string | null) ?? null,
      });
    }
    return hasil;
  } catch {
    return [];
  }
}

/* ============================================================
   Tanya (pertanyaan pengguna)
   ============================================================ */

/** Riwayat pertanyaan pengguna, terbaru dulu. */
export async function getPertanyaanSaya(
  userId: string,
  limit = 20,
): Promise<PfPertanyaan[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_questions")
      .select(
        "id, user_id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu, dibuat_pada, dijawab_pada",
      )
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      user_id: (r.user_id as string | null) ?? null,
      pertanyaan: String(r.pertanyaan ?? ""),
      jawaban: (r.jawaban as string | null) ?? null,
      referensi: keReferensi(r.referensi),
      status: String(r.status ?? ""),
      kategori: (r.kategori as string | null) ?? null,
      publik: r.publik === true,
      membantu: typeof r.membantu === "number" ? r.membantu : 0,
      dibuat_pada: (r.dibuat_pada as string | null) ?? null,
      dijawab_pada: (r.dijawab_pada as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Jumlah pertanyaan berstatus 'menunggu' ATAU 'tidak_ada_data'
 *  (hitungan nyata untuk tampilan antrean di /tanya). Sejak
 *  Gelombang 2, retrieval tanpa referensi menyimpan
 *  'tidak_ada_data' — keduanya sama-sama menunggu jawaban/
 *  keputusan editor. */
export async function getJumlahPertanyaanMenunggu(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("pf_questions")
      .select("id", { count: "exact", head: true })
      .in("status", ["menunggu", "tidak_ada_data"]);
    if (error || count === null) return 0;
    return count;
  } catch {
    return 0;
  }
}

/* ============================================================
   Feed personal
   ============================================================ */

/** Topik yang diikuti pengguna. */
export async function getTopikDiikuti(
  userId: string,
): Promise<PfTopikDiikuti[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_followed_topics")
      .select("id, user_id, tipe, target, dibuat_pada")
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false });
    if (error || !data) return [];
    return data as PfTopikDiikuti[];
  } catch {
    return [];
  }
}

/** Rekomendasi: artikel terbit terbaru dari kategori yang diikuti.
 *  Kosong bila tidak ada topik diikuti — pemanggil TIDAK boleh
 *  menggantinya dengan artikel acak. */
export async function getRekomendasiUntukTopik(
  targetKategori: string[],
  limit = 10,
): Promise<PfArtikelRingkas[]> {
  if (targetKategori.length === 0) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(
        "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada",
      )
      .eq("status", "terbit")
      .in("kategori_slug", targetKategori)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

/** Notifikasi pengguna, terbaru dulu; hanyaBelumDibaca membatasi
 *  ke yang belum dibaca. */
export async function getNotifikasi(
  userId: string,
  limit = 20,
  hanyaBelumDibaca = false,
): Promise<PfNotifikasi[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_notifications")
      .select("id, user_id, jenis, judul, isi, tautan, dibaca, dibuat_pada")
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false })
      .limit(limit);
    if (hanyaBelumDibaca) query = query.eq("dibaca", false);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as PfNotifikasi[];
  } catch {
    return [];
  }
}

/** Riwayat baca pengguna: baris pf_reading_history + join artikel
 *  yang sudah terbit, terbaru dulu. */
export async function getRiwayatBaca(
  userId: string,
  limit = 10,
): Promise<PfRiwayatBaca[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_reading_history")
      .select(
        `id, dibaca_pada, selesai, pf_articles!inner(id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada)`,
      )
      .eq("user_id", userId)
      .eq("pf_articles.status", "terbit")
      .order("dibaca_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const hasil: PfRiwayatBaca[] = [];
    for (const r of data as unknown as {
      id: string;
      dibaca_pada: string | null;
      selesai: boolean;
      pf_articles: PfArtikelRingkas | null;
    }[]) {
      if (!r.pf_articles) continue;
      hasil.push({
        id: String(r.id),
        artikel: r.pf_articles,
        dibaca_pada: r.dibaca_pada,
        selesai: Boolean(r.selesai),
      });
    }
    return hasil;
  } catch {
    return [];
  }
}

/* ============================================================
   My Prata — ringkasan dasbor personal (Fase 8 Gelombang 1)
   ============================================================ */

export type RingkasanSaya = {
  /** Jumlah baris pf_reading_history (artikel dibaca, nyata). */
  totalBaca: number;
  /** Di antaranya yang selesai dibaca. */
  selesaiBaca: number;
  /** Jumlah hari berbeda pengguna bermain kuis. */
  totalKuisHari: number;
  /** Streak hari beruntun bermain kuis (berakhir hari ini atau
   *  kemarin WIB; 0 bila belum pernah / sudah putus). */
  streakKuis: number;
  totalBenar: number;
  totalSoal: number;
  /** Akurasi kuis 0..1; null bila belum pernah bermain. */
  rataBenar: number | null;
  jumlahBookmark: number;
  jumlahTopik: number;
  notifikasiBelumDibaca: number;
  /** false = satu atau lebih tabel belum dapat dibaca (angka
   *  yang tampil tetap nyata dari tabel yang berhasil dibaca;
   *  pemanggil menampilkan catatan jujur). */
  tersedia: boolean;
};

/** Geser tanggal YYYY-MM-DD sebanyak `hari` hari (negatif = mundur). */
function geserTanggal(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/**
 * Streak kuis dari daftar tanggal YYYY-MM-DD (murni, diekspos
 * untuk uji): hitung hari beruntun mundur dari hari ini WIB;
 * bila hari ini belum bermain, mulai dari kemarin. 0 bila
 * tanggal terakhir lebih dari sehari yang lalu.
 */
export function hitungStreakKuis(
  tanggal: string[],
  hariIni: string,
): number {
  const himpunan = new Set(tanggal);
  let kursor = himpunan.has(hariIni) ? hariIni : geserTanggal(hariIni, -1);
  let streak = 0;
  while (himpunan.has(kursor)) {
    streak += 1;
    kursor = geserTanggal(kursor, -1);
  }
  return streak;
}

/**
 * Agregasi statistik personal NYATA dari tabel yang sudah ada —
 * tanpa angka palsu. Bila suatu tabel belum ada / gagal dibaca,
 * angkanya 0 dan `tersedia` false (halaman menampilkan catatan
 * jujur, bukan mengarang).
 */
export async function getRingkasanSaya(
  userId: string,
): Promise<RingkasanSaya> {
  const kosong: RingkasanSaya = {
    totalBaca: 0,
    selesaiBaca: 0,
    totalKuisHari: 0,
    streakKuis: 0,
    totalBenar: 0,
    totalSoal: 0,
    rataBenar: null,
    jumlahBookmark: 0,
    jumlahTopik: 0,
    notifikasiBelumDibaca: 0,
    tersedia: false,
  };
  try {
    const supabase = await createClient();
    const [baca, skor, bookmark, topik, notif] = await Promise.all([
      supabase
        .from("pf_reading_history")
        .select("id, selesai", { count: "exact" })
        .eq("user_id", userId)
        .limit(5000),
      supabase
        .from("pf_quiz_scores")
        .select("tanggal, benar, total")
        .eq("user_id", userId)
        .order("tanggal", { ascending: false })
        .limit(366),
      supabase
        .from("pf_bookmarks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("pf_followed_topics")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("pf_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("dibaca", false),
    ]);

    let tersedia = true;
    let totalBaca = 0;
    let selesaiBaca = 0;
    if (baca.error || !baca.data) {
      tersedia = false;
    } else {
      totalBaca = typeof baca.count === "number" ? baca.count : baca.data.length;
      selesaiBaca = (baca.data as { selesai?: boolean }[]).filter(
        (r) => r.selesai === true,
      ).length;
    }

    let totalKuisHari = 0;
    let streakKuis = 0;
    let totalBenar = 0;
    let totalSoal = 0;
    let rataBenar: number | null = null;
    if (skor.error || !skor.data) {
      tersedia = false;
    } else {
      const baris = skor.data as { tanggal: string; benar: number; total: number }[];
      totalKuisHari = baris.length;
      streakKuis = hitungStreakKuis(
        baris.map((b) => b.tanggal),
        tanggalWibHariIni(),
      );
      totalBenar = baris.reduce((a, b) => a + (b.benar || 0), 0);
      totalSoal = baris.reduce((a, b) => a + (b.total || 0), 0);
      rataBenar = totalSoal > 0 ? totalBenar / totalSoal : null;
    }

    const hitung = (
      res: { error: unknown; count: number | null },
    ): number | null => {
      if (res.error) return null;
      return typeof res.count === "number" ? res.count : 0;
    };
    const jumlahBookmark = hitung(bookmark);
    const jumlahTopik = hitung(topik);
    const notifikasiBelumDibaca = hitung(notif);
    if (
      jumlahBookmark === null ||
      jumlahTopik === null ||
      notifikasiBelumDibaca === null
    ) {
      tersedia = false;
    }

    return {
      totalBaca,
      selesaiBaca,
      totalKuisHari,
      streakKuis,
      totalBenar,
      totalSoal,
      rataBenar,
      jumlahBookmark: jumlahBookmark ?? 0,
      jumlahTopik: jumlahTopik ?? 0,
      notifikasiBelumDibaca: notifikasiBelumDibaca ?? 0,
      tersedia,
    };
  } catch {
    return kosong;
  }
}
