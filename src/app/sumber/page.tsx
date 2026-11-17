// Halaman /sumber — pusat transparansi sumber (P0 Worker D).
// Daftar publik pf_sources: nama, jenis, tier + skor kredibilitas
// (deterministik dari prioritas — lihat lib/ai/source-analysis.ts),
// terakhir diperiksa, status pemeriksaan terakhir, dan jumlah
// artikel yang memakai sumber itu (dihitung dari
// pf_article_sources, BUKAN karangan). Hanya sumber yang ada di
// pf_sources yang tampil; sumber tanpa baris pendukung tidak
// ditampilkan.
// Filter jenis/tier lewat searchParams (form GET) — rute diblokir
// di server per request (pola resmi cacheComponents: connection()
// + <Suspense>), bukan di-prerender.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import { getSumber, type PfSourceRow } from "@/lib/data";
import { skorKredibilitas, tierDariPrioritas } from "@/lib/ai/source-analysis";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sumber",
  description:
    "Daftar sumber berita PRATA FAKTA beserta tier, skor kredibilitas, dan rekam pemeriksaannya.",
};

export const instant = false;

const JENIS_VALID = ["rss", "api", "resmi", "manual"] as const;
type JenisSumber = (typeof JENIS_VALID)[number];

const LABEL_JENIS: Record<JenisSumber, string> = {
  rss: "RSS",
  api: "API",
  resmi: "Resmi",
  manual: "Manual",
};

const LABEL_TIER: Record<number, string> = {
  1: "Tier 1 — paling tepercaya",
  2: "Tier 2",
  3: "Tier 3",
};

type FilterSumber = {
  jenis?: JenisSumber;
  tier?: 1 | 2 | 3;
};

function tautanFilter(basis: FilterSumber, ubah: Partial<FilterSumber>): string {
  const p = new URLSearchParams();
  const gabung = { ...basis, ...ubah };
  if (gabung.jenis) p.set("jenis", gabung.jenis);
  if (gabung.tier) p.set("tier", String(gabung.tier));
  const s = p.toString();
  return s ? `/sumber?${s}` : "/sumber";
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "Belum pernah diperiksa";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function namaHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function DaftarSumber({ filter }: { filter: FilterSumber }) {
  const sumber = await getSumber();

  // Jumlah artikel per sumber — dihitung dari pf_article_sources
  // (satu query, tally di memori; dibatasi 10.000 baris agar tidak
  // menarik seluruh tabel tanpa batas). Bila query gagal, jumlah
  // ditandai tidak dapat dibaca — bukan ditebak 0.
  let jumlahPerSumber: Map<string, number> | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_article_sources")
      .select("sumber_id")
      .limit(10000);
    if (error) throw error;
    jumlahPerSumber = new Map<string, number>();
    for (const baris of (data ?? []) as { sumber_id: string | null }[]) {
      if (!baris.sumber_id) continue;
      jumlahPerSumber.set(
        baris.sumber_id,
        (jumlahPerSumber.get(baris.sumber_id) ?? 0) + 1,
      );
    }
  } catch {
    jumlahPerSumber = null;
  }

  const tampil = sumber.filter((s) => {
    if (filter.jenis && s.jenis !== filter.jenis) return false;
    if (filter.tier && tierDariPrioritas(s.prioritas) !== filter.tier) return false;
    return true;
  });

  if (sumber.length === 0) {
    return (
      <EmptyState
        judul="Belum ada sumber yang terdaftar"
        pesan="Belum ada sumber berita aktif di database. Sumber pertama masuk lewat mesin berita (Fase 3) atau ditambahkan editor lewat halaman manajemen sumber."
      />
    );
  }

  if (tampil.length === 0) {
    return (
      <EmptyState
        judul="Tidak ada sumber yang cocok dengan filter ini"
        pesan="Coba longgarkan filter jenis atau tier di atas — atau lihat semua sumber tanpa filter."
        aksi={
          <Link className="tombol" href="/sumber">
            Hapus semua filter
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid-berita">
      {tampil.map((s: PfSourceRow) => {
        const tier = tierDariPrioritas(s.prioritas);
        const skor = skorKredibilitas(tier);
        const jumlah = jumlahPerSumber?.get(s.id);
        return (
          <article key={s.id} className="kartu">
            <span className="kartu-kategori">
              {LABEL_JENIS[s.jenis as JenisSumber] ?? s.jenis}
              {" · "}
              {LABEL_TIER[tier] ?? `Tier ${tier}`}
              {" · skor "}
              {skor}
            </span>
            <span className="kartu-judul">
              {s.url ? (
                <Link href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.nama}
                </Link>
              ) : (
                s.nama
              )}
            </span>
            <span className="kartu-teks">{namaHost(s.url)}</span>
            <span className="kartu-meta">
              Terakhir diperiksa: {formatTanggal(s.terakhir_cek)}
            </span>
            <span className="kartu-meta">
              Status pemeriksaan: {s.status_terakhir ?? "Belum ada status pemeriksaan"}
            </span>
            <span className="kartu-meta">
              {jumlah === undefined
                ? "Jumlah artikel belum dapat dibaca"
                : jumlah === 0
                  ? "Belum dipakai di artikel mana pun"
                  : `Dipakai di ${jumlah} artikel`}
            </span>
          </article>
        );
      })}
    </div>
  );
}

export default async function HalamanSumber({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Baca searchParams HANYA sesudah connection() — aturan
  // cacheComponents (pola Fase 5).
  await connection();
  const sp = await searchParams;
  const ambil = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const jenisMentah = ambil("jenis");
  const tierMentah = ambil("tier");
  const filter: FilterSumber = {
    jenis: (JENIS_VALID as readonly string[]).includes(jenisMentah ?? "")
      ? (jenisMentah as JenisSumber)
      : undefined,
    tier:
      tierMentah === "1" || tierMentah === "2" || tierMentah === "3"
        ? Number(tierMentah) as 1 | 2 | 3
        : undefined,
  };
  const adaFilterAktif = Boolean(filter.jenis || filter.tier);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-sumber">
        <span className="hero-label">Transparansi</span>
        <h1 id="judul-sumber">Sumber Berita</h1>
        <p>
          Dari mana berita di situs ini berasal. Setiap sumber punya
          tier dan skor kredibilitas yang dihitung dari prioritasnya
          (tier 1 = skor 90, tier 2 = 75, tier 3 = 60) — bukan dari
          popularitas. Tier menentukan bobot sumber saat verifikasi
          silang sebuah artikel.
        </p>
      </section>

      <section aria-label="Filter sumber">
        <form
          className="arsip-filter-tanggal"
          action="/sumber"
          method="get"
          aria-label="Filter jenis dan tier sumber"
        >
          <label>
            Jenis
            <select name="jenis" defaultValue={filter.jenis ?? ""}>
              <option value="">Semua jenis</option>
              {JENIS_VALID.map((j) => (
                <option key={j} value={j}>
                  {LABEL_JENIS[j]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tier
            <select name="tier" defaultValue={filter.tier ? String(filter.tier) : ""}>
              <option value="">Semua tier</option>
              <option value="1">Tier 1 — paling tepercaya</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </select>
          </label>
          <button className="tombol tombol-primer" type="submit">
            Terapkan
          </button>
          {adaFilterAktif && (
            <Link className="tombol tombol-hantu" href="/sumber">
              Hapus filter
            </Link>
          )}
        </form>

        <div className="chip-baris" role="group" aria-label="Filter tier cepat">
          <Link
            className={`chip${!filter.tier ? " aktif" : ""}`}
            href={tautanFilter(filter, { tier: undefined })}
          >
            Semua tier
          </Link>
          {([1, 2, 3] as const).map((t) => (
            <Link
              key={t}
              className={`chip${filter.tier === t ? " aktif" : ""}`}
              href={tautanFilter(filter, { tier: t })}
            >
              Tier {t}
            </Link>
          ))}
        </div>
      </section>

      <section className="seksi" aria-label="Daftar sumber">
        <Suspense fallback={<div className="kerangka" aria-label="Memuat daftar sumber…" />}>
          <DaftarSumber filter={filter} />
        </Suspense>
      </section>
    </div>
  );
}
