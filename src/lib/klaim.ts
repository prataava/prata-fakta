// Getter publik Pelacak Klaim (P1-2) — src/lib/klaim.ts (BARU).
//
// Aturan bocor-draf (defense-in-depth, pola getJejakFakta di
// lib/data.ts): klaim HANYA dibaca bila artikel asalnya berstatus
// 'terbit'. Klaim yang artikel_id-nya NULL (hanya raw_item_id) atau
// yang artikelnya draf/terjadwal/diarsipkan TIDAK PERNAH dikembalikan
// — RLS v8 ("pf_claims baca terbit atau staf") sudah menutupnya di
// lapis database, dan getter ini menutupnya lagi di lapis aplikasi.
// getKlaim mengembalikan null untuk klaim tak ada ATAU klaim draf
// (halaman memanggil notFound() untuk keduanya — isi draf tidak
// dibocorkan lewat perbedaan respons).
//
// Linimasa: pf_verification_records TIDAK punya kolom klaim_id
// (v4: hanya artikel_id / raw_item_id) — linimasa satu klaim adalah
// catatan verifikasi artikel asalnya, urut kronologis menaik.
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STATUS_KLAIM = [
  "terverifikasi",
  "terbantah",
  "belum_terverifikasi",
  "tidak_dapat_diverifikasi",
] as const;
export type StatusKlaim = (typeof STATUS_KLAIM)[number];

export const JENIS_KLAIM = [
  "fakta",
  "angka",
  "kutipan",
  "tanggal",
  "lain",
] as const;
export type JenisKlaim = (typeof JENIS_KLAIM)[number];

export const LABEL_STATUS_KLAIM: Record<StatusKlaim, string> = {
  terverifikasi: "Terverifikasi",
  terbantah: "Terbantah",
  belum_terverifikasi: "Belum terverifikasi",
  tidak_dapat_diverifikasi: "Tidak dapat diverifikasi",
};

export const LABEL_JENIS_KLAIM: Record<JenisKlaim, string> = {
  fakta: "Fakta",
  angka: "Angka",
  kutipan: "Kutipan",
  tanggal: "Tanggal",
  lain: "Lainnya",
};

export const LABEL_ARAH_BUKTI: Record<string, string> = {
  mendukung: "Mendukung",
  menentang: "Menentang",
  netral: "Netral",
};

export type ArtikelAsalKlaim = {
  id: string;
  slug: string;
  judul: string;
  status_verifikasi: string;
};

export type BuktiKlaim = {
  id: string;
  sumber_url: string;
  sumber_nama: string | null;
  kutipan: string | null;
  arah: string;
  dibuat_pada: string | null;
};

export type CatatanVerifikasiKlaim = {
  id: string;
  keputusan: string;
  catatan: string | null;
  agen: string;
  dibuat_pada: string | null;
};

export type KlaimDetail = {
  id: string;
  teks: string;
  jenis: string;
  status: string;
  dibuat_pada: string | null;
  artikel: ArtikelAsalKlaim;
  bukti: BuktiKlaim[];
  linimasa: CatatanVerifikasiKlaim[];
};

export type KlaimRingkas = {
  id: string;
  teks: string;
  jenis: string;
  status: string;
  dibuat_pada: string | null;
  artikel: ArtikelAsalKlaim;
};

export type FilterDaftarKlaim = {
  status?: StatusKlaim;
  jenis?: JenisKlaim;
  q?: string;
  halaman?: number;
  perHalaman?: number;
};

export type HasilDaftarKlaim = {
  klaim: KlaimRingkas[];
  total: number;
  halaman: number;
  perHalaman: number;
  totalHalaman: number;
};

export const PER_HALAMAN_KLAIM = 20;

/** Artikel asal wajib terbit — null bila tak ada / bukan terbit. */
async function getArtikelTerbit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artikelId: string,
): Promise<ArtikelAsalKlaim | null> {
  const { data, error } = await supabase
    .from("pf_articles")
    .select("id, slug, judul, status_verifikasi")
    .eq("id", artikelId)
    .eq("status", "terbit")
    .maybeSingle();
  if (error) {
    if (catatGalatBaca("getArtikelTerbit", error)) return null;
    throw new GalatBaca("getArtikelTerbit", error);
  }
  if (!data) return null;
  return data as unknown as ArtikelAsalKlaim;
}

function petakanBukti(
  baris: unknown,
): BuktiKlaim {
  const b = baris as Record<string, unknown>;
  return {
    id: String(b.id),
    sumber_url: String(b.sumber_url ?? ""),
    sumber_nama: (b.sumber_nama as string | null) ?? null,
    kutipan: (b.kutipan as string | null) ?? null,
    arah: String(b.arah ?? "netral"),
    dibuat_pada: (b.dibuat_pada as string | null) ?? null,
  };
}

function petakanCatatan(
  baris: unknown,
): CatatanVerifikasiKlaim {
  const v = baris as Record<string, unknown>;
  return {
    id: String(v.id),
    keputusan: String(v.keputusan ?? "UNCONFIRMED"),
    catatan: (v.catatan as string | null) ?? null,
    agen: String(v.agen ?? "fact_verification"),
    dibuat_pada: (v.dibuat_pada as string | null) ?? null,
  };
}

/**
 * Satu klaim artikel TERBIT beserta bukti dan linimasa verifikasi
 * artikel asalnya. null bila id tak ada, bukan UUID, klaim tanpa
 * artikel, atau artikelnya bukan terbit. null (bukan throw) bila
 * tabel belum ada — halaman menampilkan 404 jujur.
 */
export async function getKlaim(id: string): Promise<KlaimDetail | null> {
  try {
    if (!POLA_UUID.test(id)) return null;
    const supabase = await createClient();
    const { data: klaim, error: errKlaim } = await supabase
      .from("pf_claims")
      .select("id, artikel_id, teks, jenis, status, dibuat_pada")
      .eq("id", id)
      .maybeSingle();
    if (errKlaim) {
      if (catatGalatBaca("getKlaim", errKlaim)) return null;
      throw new GalatBaca("getKlaim", errKlaim);
    }
    if (!klaim) return null;
    const baris = klaim as Record<string, unknown>;
    const artikelId =
      typeof baris.artikel_id === "string" ? baris.artikel_id : null;
    // Klaim tanpa artikel (hanya raw_item) bukan klaim publik.
    if (!artikelId) return null;
    const artikel = await getArtikelTerbit(supabase, artikelId);
    if (!artikel) return null;

    const [buktiRes, linimasaRes] = await Promise.all([
      supabase
        .from("pf_evidence")
        .select("id, sumber_url, sumber_nama, kutipan, arah, dibuat_pada")
        .eq("klaim_id", id)
        .order("dibuat_pada", { ascending: true }),
      supabase
        .from("pf_verification_records")
        .select("id, keputusan, catatan, agen, dibuat_pada")
        .eq("artikel_id", artikelId)
        .order("dibuat_pada", { ascending: true }),
    ]);
    if (buktiRes.error) {
      if (catatGalatBaca("getKlaim.bukti", buktiRes.error)) {
        return {
          id: String(baris.id),
          teks: String(baris.teks ?? ""),
          jenis: String(baris.jenis ?? "lain"),
          status: String(baris.status ?? "belum_terverifikasi"),
          dibuat_pada: (baris.dibuat_pada as string | null) ?? null,
          artikel,
          bukti: [],
          linimasa: [],
        };
      }
      throw new GalatBaca("getKlaim.bukti", buktiRes.error);
    }
    if (linimasaRes.error) {
      if (catatGalatBaca("getKlaim.linimasa", linimasaRes.error)) {
        return {
          id: String(baris.id),
          teks: String(baris.teks ?? ""),
          jenis: String(baris.jenis ?? "lain"),
          status: String(baris.status ?? "belum_terverifikasi"),
          dibuat_pada: (baris.dibuat_pada as string | null) ?? null,
          artikel,
          bukti: ((buktiRes.data ?? []) as unknown[]).map(petakanBukti),
          linimasa: [],
        };
      }
      throw new GalatBaca("getKlaim.linimasa", linimasaRes.error);
    }

    return {
      id: String(baris.id),
      teks: String(baris.teks ?? ""),
      jenis: String(baris.jenis ?? "lain"),
      status: String(baris.status ?? "belum_terverifikasi"),
      dibuat_pada: (baris.dibuat_pada as string | null) ?? null,
      artikel,
      bukti: ((buktiRes.data ?? []) as unknown[]).map(petakanBukti),
      linimasa: ((linimasaRes.data ?? []) as unknown[]).map(petakanCatatan),
    };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKlaim", err)) return null;
    throw new GalatBaca("getKlaim", err);
  }
}

/**
 * Linimasa verifikasi satu klaim = catatan verifikasi artikel
 * asalnya, urut kronologis menaik (tertua dulu). [] bila klaim
 * tak ada / tanpa artikel / artikelnya bukan terbit.
 */
export async function getLinimasaKlaim(
  id: string,
): Promise<CatatanVerifikasiKlaim[]> {
  const detail = await getKlaim(id);
  return detail ? detail.linimasa : [];
}

/**
 * Daftar klaim artikel TERBIT saja, dengan filter status + jenis +
 * cari teks dan paginasi 20/halaman. Total dihitung dari query
 * yang sama (count exact) agar angka halaman jujur.
 */
export async function getDaftarKlaim(
  filter: FilterDaftarKlaim = {},
): Promise<HasilDaftarKlaim> {
  const perHalaman = PER_HALAMAN_KLAIM;
  const halaman = Math.max(1, Math.floor(filter.halaman ?? 1) || 1);
  const kosong: HasilDaftarKlaim = {
    klaim: [],
    total: 0,
    halaman,
    perHalaman,
    totalHalaman: 1,
  };
  try {
    const supabase = await createClient();
    // Id artikel terbit dulu — klaim draf tidak pernah masuk
    // daftar, apa pun filternya (batas 10.000 id; di atas itu
    // daftar ditandai lewat total yang tetap benar karena query
    // klaim memakai .in() atas id yang terbaca).
    const { data: artikelTerbit, error: errArtikel } = await supabase
      .from("pf_articles")
      .select("id")
      .eq("status", "terbit")
      .limit(10000);
    if (errArtikel) {
      if (catatGalatBaca("getDaftarKlaim.artikel", errArtikel)) return kosong;
      throw new GalatBaca("getDaftarKlaim.artikel", errArtikel);
    }
    const idTerbit = ((artikelTerbit ?? []) as { id: string }[]).map(
      (a) => a.id,
    );
    if (idTerbit.length === 0) return kosong;

    const bangunQuery = () => {
      let q = supabase
        .from("pf_claims")
        .select("id, artikel_id, teks, jenis, status, dibuat_pada", {
          count: "exact",
        })
        .in("artikel_id", idTerbit)
        .order("dibuat_pada", { ascending: false });
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.jenis) q = q.eq("jenis", filter.jenis);
      if (filter.q) {
        const pola = `%${filter.q.replace(/[%_]/g, "")}%`;
        q = q.ilike("teks", pola);
      }
      return q;
    };

    const { count, error: errCount } = await bangunQuery().range(0, 0);
    // count exact lewat head tidak tersedia di builder ini tanpa
    // select ulang — pakai hasil range(0,0) yang tetap membawa
    // count bila diminta di select().
    if (errCount) {
      if (catatGalatBaca("getDaftarKlaim.hitung", errCount)) return kosong;
      throw new GalatBaca("getDaftarKlaim.hitung", errCount);
    }
    const total = count ?? 0;
    const totalHalaman = Math.max(1, Math.ceil(total / perHalaman));
    const halamanEfektif = Math.min(halaman, totalHalaman);
    if (total === 0) {
      return { klaim: [], total, halaman: halamanEfektif, perHalaman, totalHalaman };
    }

    const dari = (halamanEfektif - 1) * perHalaman;
    const { data, error } = await bangunQuery().range(
      dari,
      dari + perHalaman - 1,
    );
    if (error) {
      if (catatGalatBaca("getDaftarKlaim", error)) return kosong;
      throw new GalatBaca("getDaftarKlaim", error);
    }
    const baris = (data ?? []) as unknown as Record<string, unknown>[];
    if (baris.length === 0) {
      return { klaim: [], total, halaman: halamanEfektif, perHalaman, totalHalaman };
    }

    // Artikel asal untuk halaman ini (sudah pasti terbit — id
    // berasal dari daftar id terbit di atas).
    const idArtikelHalaman = [...new Set(baris.map((b) => String(b.artikel_id)))];
    const { data: artikelData, error: errArtikelHalaman } = await supabase
      .from("pf_articles")
      .select("id, slug, judul, status_verifikasi")
      .in("id", idArtikelHalaman);
    if (errArtikelHalaman) {
      if (catatGalatBaca("getDaftarKlaim.artikelHalaman", errArtikelHalaman)) {
        return { klaim: [], total, halaman: halamanEfektif, perHalaman, totalHalaman };
      }
      throw new GalatBaca("getDaftarKlaim.artikelHalaman", errArtikelHalaman);
    }
    const petaArtikel = new Map<string, ArtikelAsalKlaim>();
    for (const a of (artikelData ?? []) as unknown as Record<string, unknown>[]) {
      petaArtikel.set(String(a.id), {
        id: String(a.id),
        slug: String(a.slug ?? ""),
        judul: String(a.judul ?? ""),
        status_verifikasi: String(a.status_verifikasi ?? "UNCONFIRMED"),
      });
    }

    const klaim: KlaimRingkas[] = [];
    for (const b of baris) {
      const artikel = petaArtikel.get(String(b.artikel_id));
      if (!artikel) continue;
      klaim.push({
        id: String(b.id),
        teks: String(b.teks ?? ""),
        jenis: String(b.jenis ?? "lain"),
        status: String(b.status ?? "belum_terverifikasi"),
        dibuat_pada: (b.dibuat_pada as string | null) ?? null,
        artikel,
      });
    }
    return { klaim, total, halaman: halamanEfektif, perHalaman, totalHalaman };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getDaftarKlaim", err)) return kosong;
    throw new GalatBaca("getDaftarKlaim", err);
  }
}
