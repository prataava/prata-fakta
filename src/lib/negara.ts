// Lapisan akses data Country Profile (Area 11, Fase 8 Gelombang 2).
// Prinsip: tidak ada angka karangan. SETIAP angka negara wajib
// bersumber + periode referensi:
//  - Angka profil (populasi, PDB, luas) HANYA tampil bila baris
//    pf_countries punya sumber (angkaTersedia=false bila tidak).
//  - Fakta numerik HANYA tampil sebagai angka bila punya sumber
//    (pisahkanFakta: tanpa sumber -> daftar terpisah, nilainya
//    TIDAK dirender sebagai angka).
// Semua fungsi gagal-aman: bila tabel pf_countries belum ada
// (migrasi v10 belum dijalankan) atau query gagal, kembalikan
// [] / null — pemanggil menampilkan empty state jujur.
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import type { PfArtikelRingkas } from "@/lib/data";

export type PfNegara = {
  id: string;
  kode: string;
  nama: string;
  ibu_kota: string | null;
  populasi: number | null;
  pdb: number | null;
  sistem_pemerintahan: string | null;
  luas_km2: number | null;
  bahasa: string | null;
  mata_uang: string | null;
  sumber: string | null;
  periode_referensi: string | null;
  dibuat_pada: string | null;
  diperbarui_pada: string | null;
};

export type PfFaktaNegara = {
  id: string;
  country_id: string;
  kunci: string;
  nilai: string;
  satuan: string | null;
  sumber: string | null;
  periode: string | null;
};

export type PfEventNegara = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  dimulai_pada: string | null;
  berakhir_pada: string | null;
  sumber_url: string | null;
  era: string | null;
  penting: boolean;
};

export type PfIndikatorNegara = {
  id: string;
  nama: string;
  slug: string;
  kategori: string;
  satuan: string | null;
  sumber_nama: string | null;
  sumber_url: string | null;
  tanggal_pembaruan: string | null;
  nilai_terakhir: number | null;
  tanggal_nilai_terakhir: string | null;
};

export type PfCeritaNegara = {
  slug: string;
  judul: string;
  status_perkembangan: string;
};

export type ProfilNegara = {
  negara: PfNegara;
  /** true bila baris negara punya sumber — baru bila ini true
   *  angka profil (populasi/PDB/luas) boleh ditampilkan. */
  angkaTersedia: boolean;
  /** Fakta numerik BERSUMBER — boleh tampil sebagai angka. */
  faktaBernilai: PfFaktaNegara[];
  /** Fakta tanpa sumber — nilainya TIDAK tampil sebagai angka. */
  faktaTanpaSumber: PfFaktaNegara[];
  berita: PfArtikelRingkas[];
  events: PfEventNegara[];
  indikator: PfIndikatorNegara[];
  /** Cerita TERBIT yang memuat peristiwa di negara ini
   *  (Tahap F — tautan story ↔ negara). pf_stories TIDAK
   *  punya kolom negara_kode sendiri, jadi tautan diturunkan
   *  dari peristiwa yang dimuat cerita itu
   *  (pf_story_events -> pf_events.negara_kode); cerita yang
   *  peristiwa-peristiwanya di negara lain tidak masuk.
   *  Hanya cerita terbit; draf tidak pernah bocor. [] bila
   *  tidak ada. Dibatasi peristiwa yang dibaca getNegara
   *  (20 terbaru) — cerita yang hanya memuat peristiwa lama
   *  di luar batas itu tidak tampil di sini. */
  cerita: PfCeritaNegara[];
};

const KOLOM_NEGARA =
  "id, kode, nama, ibu_kota, populasi, pdb, sistem_pemerintahan, luas_km2, bahasa, mata_uang, sumber, periode_referensi, dibuat_pada, diperbarui_pada";
const KOLOM_FAKTA =
  "id, country_id, kunci, nilai, satuan, sumber, periode";
const KOLOM_BERITA =
  "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada";
const KOLOM_EVENT =
  "id, judul, ringkasan, lokasi_teks, dimulai_pada, berakhir_pada, sumber_url, era, penting";
const KOLOM_INDIKATOR =
  "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, tanggal_pembaruan";

const POLA_KODE = /^[A-Z]{2}$/;
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalisasi kode ISO-2: buang spasi, huruf besar. */
export function normalisasiKode(kode: string): string {
  return kode.trim().toUpperCase();
}

/** true bila kode sudah bentuk ISO-2 (dua huruf A–Z). */
export function kodeValid(kode: string): boolean {
  return POLA_KODE.test(normalisasiKode(kode));
}

export function punyaSumber(sumber: string | null | undefined): boolean {
  return typeof sumber === "string" && sumber.trim().length > 0;
}

function keAngka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Angka dari nilai fakta teks. Memahami pemisah Indonesia
 * ("275,5" -> 275.5; "1.234.567" -> 1234567) dan pemisah
 * Inggris ("1,234,567" -> 1234567). null bila nilai bukan angka
 * murni (mis. "Republik" atau "lebih dari 17.000 pulau").
 */
export function angkaDariNilai(nilai: string): number | null {
  const t = nilai.trim().replace(/\s+/g, "");
  if (!t) return null;
  // Desimal Indonesia: digit + koma + digit (tanpa titik ribuan ganda).
  if (/^-?[\d.]+,\d+$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // Ribuan Indonesia bertitik (tepat 3 digit sesudah titik =
  // ribuan, bukan desimal); boleh diikuti desimal koma.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // Ribuan Inggris: "1,234,567" (koma diikuti tepat 3 digit, berulang).
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  // Polos: hanya digit + titik desimal opsional.
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Pisahkan fakta menjadi yang BOLEH tampil sebagai angka
 * (nilai numerik + sumber tercatat) dan yang TIDAK BOLEH
 * (nilai numerik tanpa sumber, atau nilai non-numerik).
 * Fakta non-numerik (mis. kunci "sistem_pemerintahan" bernilai
 * teks) masuk tanpaSumber HANYA bila tak bersumber; bila
 * bersumber, ia tetap teks biasa — pemanggil menampilkannya
 * sebagai teks, bukan angka. Aturan angka: numerik + sumber.
 */
export function pisahkanFakta(
  fakta: PfFaktaNegara[],
): { bernilai: PfFaktaNegara[]; tanpaSumber: PfFaktaNegara[] } {
  const bernilai: PfFaktaNegara[] = [];
  const tanpaSumber: PfFaktaNegara[] = [];
  for (const f of fakta) {
    if (angkaDariNilai(f.nilai) !== null && !punyaSumber(f.sumber)) {
      tanpaSumber.push(f);
    } else if (!punyaSumber(f.sumber)) {
      tanpaSumber.push(f);
    } else {
      bernilai.push(f);
    }
  }
  return { bernilai, tanpaSumber };
}

export type KelompokFakta =
  | "pendidikan"
  | "energi"
  | "geografi"
  | "hubungan_internasional"
  | "lainnya";

export const LABEL_KELOMPOK_FAKTA: Record<KelompokFakta, string> = {
  pendidikan: "Pendidikan",
  energi: "Energi",
  geografi: "Geografi",
  hubungan_internasional: "Hubungan Internasional",
  lainnya: "Fakta Lain",
};

const KATA_KUNCI_KELOMPOK: Array<{ kelompok: KelompokFakta, kata: string[] }> = [
  {
    kelompok: "pendidikan",
    kata: ["pendidikan", "sekolah", "literasi", "guru", "siswa", "kuliah", "universitas", "melek_huruf", "angka_partisipasi"],
  },
  {
    kelompok: "energi",
    kata: ["energi", "listrik", "bahan_bakar", "minyak", "gas", "batubara", "terbarukan", "plta", "pltu"],
  },
  {
    kelompok: "geografi",
    kata: ["geografi", "luas", "pulau", "iklim", "gunung", "sungai", "garis_pantai", "ketinggian", "lintang", "bujur"],
  },
  {
    kelompok: "hubungan_internasional",
    kata: ["hubungan", "internasional", "diplomasi", "anggota", "asean", "pbb", "perdagangan_luar", "ekspor", "impor", "kedutaan"],
  },
];

/** Kelompokkan fakta bersumber berdasarkan kata kunci di `kunci`.
 *  Deterministik; kunci tak dikenal -> "lainnya". */
export function kelompokkanFakta(
  fakta: PfFaktaNegara[],
): Record<KelompokFakta, PfFaktaNegara[]> {
  const hasil: Record<KelompokFakta, PfFaktaNegara[]> = {
    pendidikan: [],
    energi: [],
    geografi: [],
    hubungan_internasional: [],
    lainnya: [],
  };
  for (const f of fakta) {
    const rendah = f.kunci.toLowerCase();
    let kelompok: KelompokFakta = "lainnya";
    for (const { kelompok: k, kata } of KATA_KUNCI_KELOMPOK) {
      if (kata.some((w) => rendah.includes(w))) {
        kelompok = k;
        break;
      }
    }
    hasil[kelompok].push(f);
  }
  return hasil;
}

/** Format angka gaya Indonesia (275.000.000) — definisi kanonis
 *  kini di src/lib/format.ts; ekspor ulang di sini agar importer
 *  lama (halaman negara, admin negara, FaktaNegara) tetap jalan. */
export { formatAngka } from "@/lib/format";

function barisNegara(r: Record<string, unknown>): PfNegara {
  return {
    id: String(r.id),
    kode: String(r.kode ?? ""),
    nama: String(r.nama ?? ""),
    ibu_kota: (r.ibu_kota as string | null) ?? null,
    populasi: keAngka(r.populasi),
    pdb: keAngka(r.pdb),
    sistem_pemerintahan: (r.sistem_pemerintahan as string | null) ?? null,
    luas_km2: keAngka(r.luas_km2),
    bahasa: (r.bahasa as string | null) ?? null,
    mata_uang: (r.mata_uang as string | null) ?? null,
    sumber: (r.sumber as string | null) ?? null,
    periode_referensi: (r.periode_referensi as string | null) ?? null,
    dibuat_pada: (r.dibuat_pada as string | null) ?? null,
    diperbarui_pada: (r.diperbarui_pada as string | null) ?? null,
  };
}

function barisFakta(r: Record<string, unknown>): PfFaktaNegara {
  return {
    id: String(r.id),
    country_id: String(r.country_id ?? ""),
    kunci: String(r.kunci ?? ""),
    nilai: String(r.nilai ?? ""),
    satuan: (r.satuan as string | null) ?? null,
    sumber: (r.sumber as string | null) ?? null,
    periode: (r.periode as string | null) ?? null,
  };
}

/** Daftar semua profil negara, urut nama. [] bila tabel belum ada. */
export async function getDaftarNegara(): Promise<PfNegara[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_countries")
      // P3-5 (B-R5): daftar dibatasi 500 (negara dunia < 250;
      // batas ini pagar pengaman bila daftar tumbuh).
      .select(KOLOM_NEGARA)
      .order("nama", { ascending: true })
      .limit(500);
    if (error) {
      if (catatGalatBaca("getDaftarNegara", error)) return [];
      throw new GalatBaca("getDaftarNegara", error);
    }
    if (!data) return [];
    return (data as unknown as Record<string, unknown>[]).map(barisNegara);
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getDaftarNegara", err)) return [];
    throw new GalatBaca("getDaftarNegara", err);
  }
}

/**
 * Negara yang punya berita terbit (pf_articles.negara_kode).
 * Dipakai halaman daftar untuk menandai negara yang sudah
 * punya liputan. [] bila tabel belum ada / belum ada berita.
 */
export async function getNegaraDenganBerita(): Promise<PfNegara[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select("negara_kode")
      .eq("status", "terbit")
      .not("negara_kode", "is", null)
      .limit(500);
    if (error) {
      if (catatGalatBaca("getNegaraDenganBerita", error)) return [];
      throw new GalatBaca("getNegaraDenganBerita", error);
    }
    if (!data) return [];
    const kode = [
      ...new Set(
        (data as { negara_kode: string | null }[])
          .map((r) => r.negara_kode)
          .filter((k): k is string => Boolean(k)),
      ),
    ];
    if (kode.length === 0) return [];
    const daftar = await getDaftarNegara();
    const punya = new Set(kode);
    return daftar.filter((n) => punya.has(n.kode));
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getNegaraDenganBerita", err)) return [];
    throw new GalatBaca("getNegaraDenganBerita", err);
  }
}

/**
 * Profil lengkap satu negara: identitas + fakta + berita terbit
 * terbaru + event + indikator + cerita terbit yang memuat
 * peristiwa di negara ini (Tahap F). null bila kode tak ada /
 * tabel belum ada. Berita HANYA yang terbit; draf tidak pernah bocor.
 */
export async function getNegara(kode: string): Promise<ProfilNegara | null> {
  const kodeNormal = normalisasiKode(kode);
  if (!kodeValid(kodeNormal)) return null;
  try {
    const supabase = await createClient();
    const { data: baris, error: errNegara } = await supabase
      .from("pf_countries")
      .select(KOLOM_NEGARA)
      .eq("kode", kodeNormal)
      .maybeSingle();
    if (errNegara) {
      if (catatGalatBaca("getNegara", errNegara)) return null;
      throw new GalatBaca("getNegara", errNegara);
    }
    if (!baris) return null;
    const negara = barisNegara(baris as unknown as Record<string, unknown>);

    const [faktaRes, beritaRes, eventRes, indRes] = await Promise.all([
      supabase
        .from("pf_country_facts")
        .select(KOLOM_FAKTA)
        .eq("country_id", negara.id)
        .order("kunci", { ascending: true }),
      supabase
        .from("pf_articles")
        .select(KOLOM_BERITA)
        .eq("status", "terbit")
        .eq("negara_kode", kodeNormal)
        .order("diterbitkan_pada", { ascending: false })
        .limit(10),
      supabase
        .from("pf_events")
        .select(KOLOM_EVENT)
        .eq("negara_kode", kodeNormal)
        .order("dimulai_pada", { ascending: false })
        .limit(20),
      supabase
        .from("pf_data_indicators")
        .select(KOLOM_INDIKATOR)
        .eq("negara_kode", kodeNormal)
        .order("nama", { ascending: true }),
    ]);

    // Galat sub-kueri dicatat (bukan ditelan): seksi yang gagal
    // tampil kosong, seksi lain tetap tampil.
    for (const [nama, res] of [
      ["fakta", faktaRes],
      ["berita", beritaRes],
      ["event", eventRes],
      ["indikator", indRes],
    ] as const) {
      if (res.error) {
        catatGalatBaca(`getNegara.${nama}`, res.error);
      }
    }
    const fakta = (
      !faktaRes.error && faktaRes.data ? faktaRes.data : []
    ) as unknown as Record<string, unknown>[];
    const { bernilai, tanpaSumber } = pisahkanFakta(fakta.map(barisFakta));

    const berita = (
      !beritaRes.error && beritaRes.data ? beritaRes.data : []
    ) as PfArtikelRingkas[];

    const events: PfEventNegara[] = (
      !eventRes.error && eventRes.data ? eventRes.data : []
    ).map((r) => {
      const row = r as unknown as Record<string, unknown>;
      return {
        id: String(row.id),
        judul: String(row.judul ?? ""),
        ringkasan: (row.ringkasan as string | null) ?? null,
        lokasi_teks: (row.lokasi_teks as string | null) ?? null,
        dimulai_pada: (row.dimulai_pada as string | null) ?? null,
        berakhir_pada: (row.berakhir_pada as string | null) ?? null,
        sumber_url: (row.sumber_url as string | null) ?? null,
        era: (row.era as string | null) ?? null,
        penting: row.penting === true,
      };
    });

    const indikator: PfIndikatorNegara[] = [];
    const daftarIndikator = (
      !indRes.error && indRes.data ? indRes.data : []
    ) as unknown as Record<string, unknown>[];
    // Nilai terakhir SEMUA indikator dalam SATU query (bukan
    // N+1 per indikator) — terbaru per indikator di memori.
    const nilaiTerakhir = new Map<
      string,
      { nilai: number | null; tanggal: string | null }
    >();
    if (daftarIndikator.length > 0) {
      try {
        const { data: semuaPoin, error: errPoin } = await supabase
          .from("pf_data_points")
          .select("indikator_id, tanggal, nilai")
          .in(
            "indikator_id",
            daftarIndikator.map((r) => String(r.id)),
          )
          .order("tanggal", { ascending: false })
          .limit(500);
        if (errPoin) {
          catatGalatBaca("getNegara.nilai_indikator", errPoin);
        } else if (semuaPoin) {
          for (const p of semuaPoin as unknown as Record<string, unknown>[]) {
            const idInd = String(p.indikator_id ?? "");
            if (!idInd || nilaiTerakhir.has(idInd)) continue;
            nilaiTerakhir.set(idInd, {
              nilai: keAngka(p.nilai),
              tanggal:
                typeof p.tanggal === "string" ? p.tanggal : null,
            });
          }
        }
      } catch (err) {
        // Poin gagal dibaca: indikator tetap tampil tanpa nilai.
        catatGalatBaca("getNegara.nilai_indikator", err);
      }
    }
    for (const r of daftarIndikator) {
      const poin = nilaiTerakhir.get(String(r.id));
      indikator.push({
        id: String(r.id),
        nama: String(r.nama ?? ""),
        slug: String(r.slug ?? ""),
        kategori: String(r.kategori ?? ""),
        satuan: (r.satuan as string | null) ?? null,
        sumber_nama: (r.sumber_nama as string | null) ?? null,
        sumber_url: (r.sumber_url as string | null) ?? null,
        tanggal_pembaruan: (r.tanggal_pembaruan as string | null) ?? null,
        nilai_terakhir: poin?.nilai ?? null,
        tanggal_nilai_terakhir: poin?.tanggal ?? null,
      });
    }

    // Cerita TERBIT yang memuat peristiwa di negara ini
    // (Tahap F — tautan story ↔ negara). pf_stories tidak punya
    // negara_kode: tautan diturunkan dari pf_story_events ->
    // pf_events.negara_kode. Hanya cerita terbit (join inner +
    // filter status) — tautan ke cerita draf TIDAK bocor.
    // Galat di sini tidak menggagalkan profil: seksi cerita
    // tampil kosong, seksi lain tetap tampil.
    let cerita: PfCeritaNegara[] = [];
    if (events.length > 0) {
      try {
        const { data: tautanCerita, error: errCerita } = await supabase
          .from("pf_story_events")
          .select("pf_stories!inner(slug, judul, status, status_perkembangan)")
          .in(
            "event_id",
            events.map((e) => e.id),
          )
          .eq("pf_stories.status", "terbit");
        if (errCerita) {
          catatGalatBaca("getNegara.cerita", errCerita);
        } else if (tautanCerita) {
          const perSlug = new Map<string, PfCeritaNegara>();
          for (const t of tautanCerita as unknown as Record<
            string,
            unknown
          >[]) {
            const s = t.pf_stories as Record<string, unknown> | null;
            if (!s || typeof s.slug !== "string" || !s.slug) continue;
            if (!perSlug.has(s.slug)) {
              perSlug.set(s.slug, {
                slug: s.slug,
                judul: typeof s.judul === "string" ? s.judul : s.slug,
                status_perkembangan:
                  typeof s.status_perkembangan === "string"
                    ? s.status_perkembangan
                    : "",
              });
            }
          }
          cerita = [...perSlug.values()].sort((a, b) =>
            a.judul.localeCompare(b.judul, "id"),
          );
        }
      } catch (err) {
        catatGalatBaca("getNegara.cerita", err);
      }
    }

    return {
      negara,
      angkaTersedia: punyaSumber(negara.sumber),
      faktaBernilai: bernilai,
      faktaTanpaSumber: tanpaSumber,
      berita,
      events,
      indikator,
      cerita,
    };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getNegara", err)) return null;
    throw new GalatBaca("getNegara", err);
  }
}

/** Daftar negara + fakta per negara untuk halaman admin.
 *  tersedia=false bila tabel belum bisa dibaca. */
export async function getNegaraAdmin(): Promise<{
  negara: PfNegara[];
  fakta: Record<string, PfFaktaNegara[]>;
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_countries")
      .select(KOLOM_NEGARA)
      .order("nama", { ascending: true })
      .limit(500);
    if (error) {
      if (catatGalatBaca("getNegaraAdmin", error)) {
        return { negara: [], fakta: {}, tersedia: false };
      }
      throw new GalatBaca("getNegaraAdmin", error);
    }
    if (!data) return { negara: [], fakta: {}, tersedia: false };
    const daftar = (data as unknown as Record<string, unknown>[]).map(
      barisNegara,
    );
    const fakta: Record<string, PfFaktaNegara[]> = {};
    if (daftar.length > 0) {
      const { data: faktaData, error: errFakta } = await supabase
        .from("pf_country_facts")
        .select(KOLOM_FAKTA)
        .in(
          "country_id",
          daftar.map((n) => n.id),
        )
        .order("kunci", { ascending: true });
      if (errFakta) {
        catatGalatBaca("getNegaraAdmin.fakta", errFakta);
      } else if (faktaData) {
        for (const r of faktaData as unknown as Record<string, unknown>[]) {
          const f = barisFakta(r);
          (fakta[f.country_id] ??= []).push(f);
        }
      }
    }
    return { negara: daftar, fakta, tersedia: true };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getNegaraAdmin", err)) {
      return { negara: [], fakta: {}, tersedia: false };
    }
    throw new GalatBaca("getNegaraAdmin", err);
  }
}

/* ============================================================
   Validasi input admin (fungsi murni — dipakai route admin
   dan diuji tanpa database).
   ============================================================ */

export type InputNegara = {
  kode?: unknown;
  nama?: unknown;
  ibu_kota?: unknown;
  populasi?: unknown;
  pdb?: unknown;
  sistem_pemerintahan?: unknown;
  luas_km2?: unknown;
  bahasa?: unknown;
  mata_uang?: unknown;
  sumber?: unknown;
  periode_referensi?: unknown;
};

function teksValid(v: unknown, maks: number): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maks;
}

function angkaOpsionalValid(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Validasi baris negara. Aturan angka-bersumber: bila SATU PUN
 * angka (populasi/PDB/luas) diisi, sumber WAJIB diisi — kalau
 * tidak, angka itu tidak akan pernah tampil (lihat
 * angkaTersedia), jadi tolak di pintu masuk saja.
 */
export function validasiNegaraInput(input: InputNegara): string | null {
  if (
    typeof input.kode !== "string" ||
    !kodeValid(normalisasiKode(input.kode))
  ) {
    return "Kode negara wajib dua huruf (ISO-2, contoh: ID).";
  }
  if (!teksValid(input.nama, 120)) {
    return "Nama negara wajib diisi (maksimal 120 karakter).";
  }
  for (const [label, v] of [
    ["Populasi", input.populasi],
    ["PDB", input.pdb],
    ["Luas", input.luas_km2],
  ] as const) {
    if (!angkaOpsionalValid(v)) {
      return `${label} wajib berupa angka 0 atau lebih.`;
    }
  }
  const adaAngka = [input.populasi, input.pdb, input.luas_km2].some(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (adaAngka && !punyaSumber(input.sumber as string | null)) {
    return "Angka negara (populasi/PDB/luas) wajib disertai sumber — tanpa sumber, angka tidak akan ditampilkan.";
  }
  for (const [label, v, maks] of [
    ["Ibu kota", input.ibu_kota, 120],
    ["Sistem pemerintahan", input.sistem_pemerintahan, 120],
    ["Bahasa", input.bahasa, 200],
    ["Mata uang", input.mata_uang, 120],
    ["Sumber", input.sumber, 200],
    ["Periode referensi", input.periode_referensi, 120],
  ] as const) {
    if (
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !teksValid(v, maks as number)
    ) {
      return `${label} maksimal ${maks as number} karakter.`;
    }
  }
  return null;
}

export type InputFaktaNegara = {
  country_id?: unknown;
  kunci?: unknown;
  nilai?: unknown;
  satuan?: unknown;
  sumber?: unknown;
  periode?: unknown;
};

/** Validasi fakta negara: kunci + nilai wajib; nilai numerik
 *  tanpa sumber ditolak (aturan angka-bersumber yang sama). */
export function validasiFaktaInput(input: InputFaktaNegara): string | null {
  if (
    typeof input.country_id !== "string" ||
    !POLA_UUID.test(input.country_id)
  ) {
    return "country_id tidak valid.";
  }
  if (!teksValid(input.kunci, 120)) {
    return "Kunci fakta wajib diisi (maksimal 120 karakter).";
  }
  if (!teksValid(input.nilai, 500)) {
    return "Nilai fakta wajib diisi (maksimal 500 karakter).";
  }
  if (
    typeof input.nilai === "string" &&
    angkaDariNilai(input.nilai) !== null &&
    !punyaSumber(input.sumber as string | null)
  ) {
    return "Nilai fakta berupa angka wajib disertai sumber — tanpa sumber, angka tidak akan ditampilkan.";
  }
  for (const [label, v, maks] of [
    ["Satuan", input.satuan, 60],
    ["Sumber", input.sumber, 200],
    ["Periode", input.periode, 120],
  ] as const) {
    if (
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !teksValid(v, maks as number)
    ) {
      return `${label} maksimal ${maks as number} karakter.`;
    }
  }
  return null;
}
