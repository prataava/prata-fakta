import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import SearchBar from "@/components/SearchBar";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import {
  cariKonten,
  cariArtikel,
  cariNegara,
  getSumber,
  STATUS_VERIFIKASI,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
// P3-3: EmptyState halaman ini memakai kamus (bahasa dari cookie
// via getBahasa). Judul/hasil lain halaman tetap Indonesia — di
// luar cakupan minimal P3-3.
import { getBahasa, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Pencarian",
  description:
    "Cari berita, topik, kategori, sumber, dan negara di PRATA FAKTA.",
};

// Halaman pencarian bergantung pada searchParams (?q, ?dari, ?sampai,
// ?sumber, ?status) — tunggu request nyata (connection(), aturan
// cacheComponents) dan bungkus hasil di <Suspense>, bukan di-prerender.
export const instant = false;

type FilterCari = {
  q: string;
  dari?: string;
  sampai?: string;
  sumber?: string;
  status?: string;
};

/** Bentuk satu entri pencarian tersimpan (kolom
 *  pf_user_preferences.pencarian_tersimpan, migrasi v18) — dibaca
 *  defensif: baris lama/rusak dilewati, bukan 500. */
type PencarianTersimpan = {
  q: string;
  dari: string | null;
  sampai: string | null;
  sumber: string | null;
  status: string | null;
  disimpan_pada: string;
};

function entriTersimpanValid(e: unknown): e is PencarianTersimpan {
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

/** Pencarian tersimpan milik pengguna; [] bila belum login, belum
 *  ada baris, atau kolom v18 belum diterapkan. */
async function bacaPencarianTersimpan(
  supabase: SupabaseClient,
  userId: string,
): Promise<PencarianTersimpan[]> {
  try {
    const { data, error } = await supabase
      .from("pf_user_preferences")
      .select("pencarian_tersimpan")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return [];
    const mentah = (data as { pencarian_tersimpan?: unknown })
      .pencarian_tersimpan;
    if (!Array.isArray(mentah)) return [];
    return mentah.filter(entriTersimpanValid);
  } catch {
    return [];
  }
}

function tautanPencarian(p: PencarianTersimpan): string {
  const params = new URLSearchParams();
  params.set("q", p.q);
  if (p.dari) params.set("dari", p.dari);
  if (p.sampai) params.set("sampai", p.sampai);
  if (p.sumber) params.set("sumber", p.sumber);
  if (p.status) params.set("status", p.status);
  return `/cari?${params.toString()}`;
}

function labelPencarian(p: PencarianTersimpan): string {
  const bagian = [p.q];
  if (p.dari || p.sampai) {
    bagian.push(`${p.dari ?? "…"} s.d. ${p.sampai ?? "…"}`);
  }
  if (p.status) bagian.push(p.status);
  return bagian.join(" · ");
}

function tanggalSimpan(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function HasilCari({
  filter,
  bahasa,
}: {
  filter: FilterCari;
  bahasa: "id" | "en";
}) {
  const [hasil, hasilArtikel, hasilNegara] = await Promise.all([
    cariKonten(filter.q),
    cariArtikel(filter.q, {
      dari: filter.dari,
      sampai: filter.sampai,
      sumberId: filter.sumber,
      statusVerifikasi: filter.status,
    }),
    cariNegara(filter.q),
  ]);
  const kosong =
    hasil.kategori.length === 0 &&
    hasil.sumber.length === 0 &&
    hasilArtikel.artikel.length === 0 &&
    hasilNegara.negara.length === 0;

  return (
    <div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Hasil untuk “<strong>{filter.q}</strong>”
        {kosong
          ? " — tidak ditemukan."
          : ` — ${hasilArtikel.artikel.length} artikel, ${hasil.kategori.length} kategori, ${hasil.sumber.length} sumber, ${hasilNegara.negara.length} negara.`}
      </p>

      {hasilArtikel.artikel.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Artikel</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasilArtikel.artikel.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        </>
      )}

      {!hasilArtikel.tersedia && (
        <div className="kosong" style={{ marginBottom: 24 }}>
          <h3>Pencarian artikel belum tersedia</h3>
          <p>
            Isi artikel belum bisa dicari saat ini karena arsip
            artikel belum tersedia. Yang bisa dicari saat ini: kategori,
            sumber berita, dan negara terdaftar.
          </p>
        </div>
      )}

      {hasilNegara.negara.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Negara</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasilNegara.negara.map((n) => (
              <Link key={n.id} className="kartu" href={`/negara/${n.kode}`}>
                <span className="kartu-kategori">{n.kode}</span>
                <span className="kartu-judul">{n.nama}</span>
                <span className="kartu-teks">
                  {n.ibu_kota ? `Ibu kota: ${n.ibu_kota}` : "Buka profil negara"}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!hasilNegara.tersedia && (
        <div className="kosong" style={{ marginBottom: 24 }}>
          <h3>Pencarian negara belum tersedia</h3>
          <p>
            Profil negara belum bisa dicari saat ini karena data negara
            belum tersedia.
          </p>
        </div>
      )}

      {hasil.kategori.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Kategori</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasil.kategori.map((k) => (
              <Link key={k.id} className="kartu" href={`/kategori/${k.slug}`}>
                <span className="kartu-kategori">{k.nama}</span>
                <span className="kartu-teks">{k.deskripsi ?? "Buka kategori"}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {hasil.sumber.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Sumber</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasil.sumber.map((s) => (
              <a
                key={s.id}
                className="kartu"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="kartu-kategori">{s.jenis}</span>
                <span className="kartu-judul">{s.nama}</span>
                <span className="kartu-meta">{s.url}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {kosong && (
        <EmptyState
          judul={t(bahasa, "cari.tidakAdaHasilJudul")}
          pesan={t(bahasa, "cari.tidakAdaHasilPesan", { q: filter.q })}
          aksi={
            <Link className="tombol" href="/arsip">
              {t(bahasa, "cari.jelajahiArsip")}
            </Link>
          }
        />
      )}
    </div>
  );
}

export default async function Cari({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Halaman membaca searchParams → tunggu request nyata (aturan
  // cacheComponents, pola /jelajahi + docs connection()).
  await connection();
  const bahasa = await getBahasa();
  const sp = await searchParams;
  const ambil = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const q = (ambil("q") ?? "").trim();
  const filter: FilterCari = {
    q,
    dari: ambil("dari"),
    sampai: ambil("sampai"),
    sumber: ambil("sumber"),
    status: ambil("status"),
  };
  const adaFilterAktif = Boolean(
    filter.dari || filter.sampai || filter.sumber || filter.status,
  );
  const tersimpan = ambil("tersimpan") === "1";
  const galatSimpanPenuh = ambil("galat-simpan") === "penuh";
  const sumberList = await getSumber();

  // Seksi pencarian tersimpan hanya bila login — tanpa sesi,
  // seksi disembunyikan (bukan error).
  let masuk = false;
  let tersimpanList: PencarianTersimpan[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      masuk = true;
      tersimpanList = await bacaPencarianTersimpan(supabase, data.user.id);
    }
  } catch {
    masuk = false;
    tersimpanList = [];
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cari">
        <span className="hero-label">Pencarian</span>
        <h1 id="judul-cari">Cari di PRATA FAKTA</h1>
        <p>Cari kategori, sumber berita, negara, dan isi artikel.</p>
        <div style={{ marginTop: 18 }}>
          <SearchBar nilaiAwal={q} />
        </div>
      </section>

      {tersimpan && (
        <p className="kosong" role="status" style={{ marginTop: 16 }}>
          Pencarian ini sudah disimpan.
        </p>
      )}
      {galatSimpanPenuh && (
        <p className="kosong" role="status" style={{ marginTop: 16 }}>
          Anda sudah menyimpan 10 pencarian — hapus salah satu dulu
          sebelum menyimpan yang baru.
        </p>
      )}

      {q && (
        <section aria-label="Filter pencarian">
          <form
            className="arsip-filter-tanggal"
            action="/cari"
            method="get"
            aria-label="Filter tanggal, sumber, dan status verifikasi"
          >
            <input type="hidden" name="q" value={q} />
            <label>
              Dari
              <input type="date" name="dari" defaultValue={filter.dari ?? ""} />
            </label>
            <label>
              Sampai
              <input type="date" name="sampai" defaultValue={filter.sampai ?? ""} />
            </label>
            <label>
              Sumber
              <select name="sumber" defaultValue={filter.sumber ?? ""}>
                <option value="">Semua sumber</option>
                {sumberList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status verifikasi
              <select name="status" defaultValue={filter.status ?? ""}>
                <option value="">Semua status</option>
                {STATUS_VERIFIKASI.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button className="tombol" type="submit">
              Terapkan
            </button>
            {adaFilterAktif && (
              <Link
                className="tombol tombol-hantu"
                href={`/cari?q=${encodeURIComponent(q)}`}
              >
                Hapus filter
              </Link>
            )}
          </form>

          {masuk && (
            <form
              action="/api/saya/pencarian-tersimpan"
              method="post"
              style={{ marginTop: 12 }}
            >
              <input type="hidden" name="q" value={q} />
              {filter.dari && <input type="hidden" name="dari" value={filter.dari} />}
              {filter.sampai && (
                <input type="hidden" name="sampai" value={filter.sampai} />
              )}
              {filter.sumber && (
                <input type="hidden" name="sumber" value={filter.sumber} />
              )}
              {filter.status && (
                <input type="hidden" name="status" value={filter.status} />
              )}
              <button className="tombol" type="submit">
                Simpan pencarian ini
              </button>
            </form>
          )}
        </section>
      )}

      <section className="seksi">
        {q ? (
          <Suspense fallback={<div className="kerangka" aria-label="Mencari…" />}>
            <HasilCari filter={filter} bahasa={bahasa} />
          </Suspense>
        ) : (
          <EmptyState
            judul={t(bahasa, "cari.masukkanKataKunciJudul")}
            pesan={t(bahasa, "cari.masukkanKataKunciPesan")}
          />
        )}
      </section>

      {masuk && (
        <section className="seksi" aria-label="Pencarian tersimpan">
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>
            Pencarian tersimpan
          </h2>
          {tersimpanList.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              Belum ada pencarian tersimpan. Cari sesuatu, lalu tekan
              “Simpan pencarian ini”.
            </p>
          ) : (
            <div className="grid-berita">
              {tersimpanList.map((p) => (
                <Link
                  key={`${p.q}|${p.disimpan_pada}`}
                  className="kartu"
                  href={tautanPencarian(p)}
                >
                  <span className="kartu-judul">{labelPencarian(p)}</span>
                  <span className="kartu-teks">
                    {tanggalSimpan(p.disimpan_pada) ??
                      "Tanggal simpan tidak diketahui"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
