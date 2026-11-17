// Lapisan akses data Observatorium (P2-2, server).
// Merakit hitungan agregat NYATA dari tabel yang sudah ada —
// tanpa angka hardcode, tanpa statistik palsu. Semua hitungan
// dihitung di sini dari baris database, bukan dari konstanta.
// Prinsip galat sama seperti lib/lanjutan.ts: "tabel belum ada"
// (PGRST205/42P01) → tersedia=false yang jujur; galat lain →
// GalatBaca dilempar (bukan ditelan jadi 0 diam-diam).
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { STATUS_VERIFIKASI } from "@/lib/data";
import {
  getIndikator,
  getPoinIndikator,
  type PfIndikator,
  type PfPoinIndikator,
} from "@/lib/lanjutan";

/* ============================================================
   Hitungan artikel terbit
   ============================================================ */

export type HitunganKategori = {
  slug: string;
  nama: string;
  jumlah: number;
};

export type HitunganStatusVerifikasi = {
  status: string;
  jumlah: number;
};

export type HitunganSumber = {
  sumber_id: string;
  nama: string;
  jumlah: number;
};

export type HitunganArtikel = {
  /** Jumlah artikel status='terbit' (satu-satunya yang boleh
   *  dibaca publik; draf tidak dihitung di sini). */
  totalTerbit: number;
  perKategori: HitunganKategori[];
  /** Keenam status verifikasi selalu tampil, 0 bila tidak ada. */
  perStatusVerifikasi: HitunganStatusVerifikasi[];
  /** Jumlah artikel terbit per sumber (lewat pf_article_sources). */
  perSumber: HitunganSumber[];
  /** false = tabel pf_articles belum ada di lingkungan ini. */
  tersedia: boolean;
};

/** Nama kategori dari taksonomi editorial; slug bila tak dikenal. */
function namaKategori(slug: string): string {
  return KATEGORI_UTAMA.find((k) => k.slug === slug)?.nama ?? slug;
}

const KOSONG_HITUNGAN: HitunganArtikel = {
  totalTerbit: 0,
  perKategori: [],
  perStatusVerifikasi: [],
  perSumber: [],
  tersedia: false,
};

/**
 * Hitungan artikel TERBIT per kategori + per status verifikasi +
 * per sumber, langsung dari DB. Batas baca 5000 baris: jumlah
 * artikel terbit jauh di bawah itu; bila kelak melampaui, fungsi
 * ini wajib diganti agregasi sisi server (bukan diam-diam
 * memotong hitungan).
 */
export async function getHitunganArtikel(): Promise<HitunganArtikel> {
  try {
    const supabase = cobaServiceClient() ?? (await createClient());
    const { data, error } = await supabase
      .from("pf_articles")
      .select("id, kategori_slug, status_verifikasi")
      .eq("status", "terbit")
      .limit(5000);
    if (error) {
      if (catatGalatBaca("getHitunganArtikel", error)) return KOSONG_HITUNGAN;
      throw new GalatBaca("getHitunganArtikel", error);
    }
    const baris = (data ?? []) as unknown as Record<string, unknown>[];

    const perKategoriMap = new Map<string, number>();
    const perStatusMap = new Map<string, number>(
      STATUS_VERIFIKASI.map((s) => [s, 0]),
    );
    for (const r of baris) {
      const kat = String(r.kategori_slug ?? "");
      if (kat) perKategoriMap.set(kat, (perKategoriMap.get(kat) ?? 0) + 1);
      const st = String(r.status_verifikasi ?? "UNCONFIRMED");
      perStatusMap.set(st, (perStatusMap.get(st) ?? 0) + 1);
    }

    // Artikel terbit per sumber — lewat join pf_article_sources.
    // Policy v8 hanya mengizinkan baris sumber milik artikel
    // terbit, jadi hitungan ini konsisten dengan totalTerbit.
    let perSumber: HitunganSumber[] = [];
    try {
      const { data: tautan, error: errTautan } = await supabase
        .from("pf_article_sources")
        .select("artikel_id, sumber_id, pf_sources!inner(nama)")
        .limit(5000);
      if (errTautan) {
        if (catatGalatBaca("getHitunganArtikel.sumber", errTautan)) {
          perSumber = [];
        } else {
          throw new GalatBaca("getHitunganArtikel.sumber", errTautan);
        }
      } else if (tautan) {
        // Satu artikel bisa menaut ke beberapa sumber; hitung
        // artikel UNIK per sumber (bukan baris tautan mentah).
        const artikelPerSumber = new Map<string, Set<string>>();
        const namaPerSumber = new Map<string, string>();
        for (const t of tautan as unknown as Record<string, unknown>[]) {
          const sid = String(t.sumber_id ?? "");
          const aid = String(t.artikel_id ?? "");
          if (!sid || !aid) continue;
          if (!artikelPerSumber.has(sid)) artikelPerSumber.set(sid, new Set());
          artikelPerSumber.get(sid)?.add(aid);
          const sumber = t.pf_sources as
            | { nama?: unknown }
            | { nama?: unknown }[]
            | null;
          const nama = Array.isArray(sumber)
            ? sumber[0]?.nama
            : sumber?.nama;
          if (typeof nama === "string" && nama) {
            namaPerSumber.set(sid, nama);
          }
        }
        perSumber = [...artikelPerSumber.entries()]
          .map(([sumber_id, artikel]) => ({
            sumber_id,
            nama: namaPerSumber.get(sumber_id) ?? sumber_id,
            jumlah: artikel.size,
          }))
          .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama));
      }
    } catch (err) {
      if (err instanceof GalatBaca) throw err;
      if (catatGalatBaca("getHitunganArtikel.sumber", err)) perSumber = [];
      else throw new GalatBaca("getHitunganArtikel.sumber", err);
    }

    return {
      totalTerbit: baris.length,
      perKategori: [...perKategoriMap.entries()]
        .map(([slug, jumlah]) => ({ slug, nama: namaKategori(slug), jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama)),
      perStatusVerifikasi: STATUS_VERIFIKASI.map((status) => ({
        status,
        jumlah: perStatusMap.get(status) ?? 0,
      })),
      perSumber,
      tersedia: true,
    };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getHitunganArtikel", err)) return KOSONG_HITUNGAN;
    throw new GalatBaca("getHitunganArtikel", err);
  }
}

/* ============================================================
   Tren ingestion
   ============================================================ */

export type TrenHarian = {
  /** Tanggal YYYY-MM-DD (WIB tidak relevan: hari dihitung dari
   *  cap waktu UTC apa adanya — lihat komentar di bawah). */
  tanggal: string;
  jumlah: number;
};

export type RunTerakhirSumber = {
  sumber_id: string | null;
  sumber_nama: string;
  status: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  gagal: number;
  dimulai_pada: string | null;
  selesai_pada: string | null;
  dipicu_oleh: string | null;
};

export type TrenIngestion = {
  /** Satu entri per hari, `hari` hari terakhir termasuk hari
   *  ini; hari tanpa item tetap tampil dengan jumlah 0. */
  perHari: TrenHarian[];
  /** Run terbaru tiap sumber (berdasarkan dimulai_pada). */
  runTerakhir: RunTerakhirSumber[];
  /** Total item mentah di pf_raw_items (semua status). */
  totalItem: number;
  /**
   * false = data ingestion belum tersedia di lingkungan ini:
   * tabel belum ada ATAU kunci layanan belum diatur (tanpa
   * service role, RLS staf mengembalikan 0 baris diam-diam —
   * 0 itu akan bohong, jadi pemanggil menampilkan catatan
   * jujur, bukan angka 0).
   */
  tersedia: boolean;
};

const KOSONG_TREN: TrenIngestion = {
  perHari: [],
  runTerakhir: [],
  totalItem: 0,
  tersedia: false,
};

/** Tanggal YYYY-MM-DD sebanyak `mundur` hari sebelum `dari`. */
function geserTanggalIso(dari: string, mundur: number): string {
  const d = new Date(`${dari}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - mundur);
  return d.toISOString().slice(0, 10);
}

/**
 * Item mentah per hari (`hari` hari terakhir) + run terakhir
 * per sumber + total item. Sumber data: pf_raw_items
 * (waktu_diambil) dan pf_ingestion_runs. Hari dihitung dari
 * tanggal UTC cap waktu_diambil — pengelompokan harian
 * observatorium, bukan batas kalender WIB yang presisi.
 */
export async function getTrenIngestion(
  hari = 14,
): Promise<TrenIngestion> {
  const service = cobaServiceClient();
  if (!service) {
    // Tanpa service role, SELECT anon atas pf_raw_items /
    // pf_ingestion_runs dibatasi RLS staf → 0 baris tanpa galat.
    // Menampilkan 0 akan bohong; kembalikan tersedia=false.
    console.error(
      "[baca] getTrenIngestion: SUPABASE_SERVICE_ROLE_KEY belum diatur — data ingestion belum tersedia.",
    );
    return KOSONG_TREN;
  }
  const jumlahHari = Math.max(1, Math.min(Math.floor(hari) || 14, 90));
  try {
    const hariIni = new Date().toISOString().slice(0, 10);
    const dariTanggal = geserTanggalIso(hariIni, jumlahHari - 1);

    const [itemRes, runRes, totalRes] = await Promise.all([
      service
        .from("pf_raw_items")
        .select("waktu_diambil")
        .gte("waktu_diambil", `${dariTanggal}T00:00:00Z`)
        .limit(5000),
      service
        .from("pf_ingestion_runs")
        .select(
          "sumber_id, sumber_nama, status, ditemukan, baru, duplikat, gagal, dimulai_pada, selesai_pada, dipicu_oleh",
        )
        .order("dimulai_pada", { ascending: false })
        .limit(200),
      service
        .from("pf_raw_items")
        .select("id", { count: "exact", head: true }),
    ]);
    for (const [nama, res] of [
      ["getTrenIngestion.item", itemRes],
      ["getTrenIngestion.run", runRes],
      ["getTrenIngestion.total", totalRes],
    ] as const) {
      if (res.error) {
        if (catatGalatBaca(nama, res.error)) return KOSONG_TREN;
        throw new GalatBaca(nama, res.error);
      }
    }

    const hitungPerHari = new Map<string, number>();
    for (let i = 0; i < jumlahHari; i++) {
      hitungPerHari.set(geserTanggalIso(hariIni, i), 0);
    }
    for (const r of (itemRes.data ?? []) as unknown as Record<
      string,
      unknown
    >[]) {
      if (typeof r.waktu_diambil !== "string") continue;
      const tanggal = r.waktu_diambil.slice(0, 10);
      if (hitungPerHari.has(tanggal)) {
        hitungPerHari.set(tanggal, (hitungPerHari.get(tanggal) ?? 0) + 1);
      }
    }
    const perHari: TrenHarian[] = [...hitungPerHari.entries()]
      .map(([tanggal, jumlah]) => ({ tanggal, jumlah }))
      .sort((a, b) => (a.tanggal < b.tanggal ? -1 : 1));

    // Run terbaru tiap sumber: baris sudah urut dimulai_pada
    // menurun — yang pertama per sumber_nama adalah yang terbaru.
    const terbaru = new Map<string, RunTerakhirSumber>();
    for (const r of (runRes.data ?? []) as unknown as Record<
      string,
      unknown
    >[]) {
      const nama = String(r.sumber_nama ?? "");
      if (!nama || terbaru.has(nama)) continue;
      terbaru.set(nama, {
        sumber_id:
          typeof r.sumber_id === "string" ? r.sumber_id : null,
        sumber_nama: nama,
        status: String(r.status ?? ""),
        ditemukan: typeof r.ditemukan === "number" ? r.ditemukan : 0,
        baru: typeof r.baru === "number" ? r.baru : 0,
        duplikat: typeof r.duplikat === "number" ? r.duplikat : 0,
        gagal: typeof r.gagal === "number" ? r.gagal : 0,
        dimulai_pada:
          typeof r.dimulai_pada === "string" ? r.dimulai_pada : null,
        selesai_pada:
          typeof r.selesai_pada === "string" ? r.selesai_pada : null,
        dipicu_oleh:
          typeof r.dipicu_oleh === "string" ? r.dipicu_oleh : null,
      });
    }

    return {
      perHari,
      runTerakhir: [...terbaru.values()],
      totalItem:
        typeof totalRes.count === "number" ? totalRes.count : 0,
      tersedia: true,
    };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getTrenIngestion", err)) return KOSONG_TREN;
    throw new GalatBaca("getTrenIngestion", err);
  }
}

/* ============================================================
   Indikator pilihan
   ============================================================ */

export type IndikatorPilihan = {
  indikator: PfIndikator;
  poin: PfPoinIndikator[];
};

export type HasilIndikatorPilihan = {
  indikator: IndikatorPilihan[];
  /** false = tabel pf_data_indicators belum ada. */
  tersedia: boolean;
};

/**
 * 3–5 indikator yang paling baru diperbarui (urut
 * tanggal_pembaruan menurun, tanpa tanggal diurut terakhir),
 * masing-masing lengkap dengan poin deret waktunya (maks 60
 * titik, untuk grafik mini). Merakit getIndikator +
 * getPoinIndikator yang sudah ada — tanpa query baru yang
 * menduplikasi logika mereka.
 */
export async function getIndikatorPilihan(
  jumlah = 5,
): Promise<HasilIndikatorPilihan> {
  const ambil = Math.max(1, Math.min(Math.floor(jumlah) || 5, 5));
  const semua = await getIndikator();
  if (semua.length === 0) {
    // getIndikator menelan "tabel belum ada" jadi [] — bedakan
    // tabel-belum-ada dari basis yang memang kosong lewat satu
    // probe hitung; probe gagal tabel → tersedia=false.
    try {
      const supabase = cobaServiceClient() ?? (await createClient());
      const { error } = await supabase
        .from("pf_data_indicators")
        .select("id", { count: "exact", head: true });
      if (error) {
        if (catatGalatBaca("getIndikatorPilihan", error)) {
          return { indikator: [], tersedia: false };
        }
        throw new GalatBaca("getIndikatorPilihan", error);
      }
    } catch (err) {
      if (err instanceof GalatBaca) throw err;
      if (catatGalatBaca("getIndikatorPilihan", err)) {
        return { indikator: [], tersedia: false };
      }
      throw new GalatBaca("getIndikatorPilihan", err);
    }
    return { indikator: [], tersedia: true };
  }
  const dipilih = [...semua]
    .sort((a, b) => {
      if (a.tanggal_pembaruan && b.tanggal_pembaruan) {
        return a.tanggal_pembaruan < b.tanggal_pembaruan ? 1 : -1;
      }
      if (a.tanggal_pembaruan) return -1;
      if (b.tanggal_pembaruan) return 1;
      return a.nama.localeCompare(b.nama);
    })
    .slice(0, ambil);
  const hasil: IndikatorPilihan[] = [];
  await Promise.all(
    dipilih.map(async (indikator) => {
      hasil.push({
        indikator,
        poin: await getPoinIndikator(indikator.slug, 60),
      });
    }),
  );
  // Promise.all tidak menjamin urutan — kembalikan urutan dipilih.
  const urutan = new Map(dipilih.map((d, i) => [d.slug, i]));
  hasil.sort(
    (a, b) =>
      (urutan.get(a.indikator.slug) ?? 0) -
      (urutan.get(b.indikator.slug) ?? 0),
  );
  return { indikator: hasil, tersedia: true };
}
