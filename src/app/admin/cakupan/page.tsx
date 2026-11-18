import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Cakupan Global — Admin",
  description:
    "Cakupan liputan PRATA FAKTA per sumber, kategori, dan frekuensi — dihitung dari data yang ada, tanpa persentase karangan.",
};

export const instant = false;

const BATAS_ITEM_HARI = 7;
const BATAS_ARTIKEL_HARI = 30;

// Batas waktu dihitung di fungsi module-level, BUKAN di render —
// eslint react-hooks/purity melarang Date.now() di render
// (pola nilaiSemuaJob di /admin/reliability, v27 C5).
function hitungBatas(): { batasItem: string; batasArtikel: string } {
  const sekarang = Date.now();
  return {
    batasItem: new Date(
      sekarang - BATAS_ITEM_HARI * 24 * 60 * 60 * 1000,
    ).toISOString(),
    batasArtikel: new Date(
      sekarang - BATAS_ARTIKEL_HARI * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export default async function AdminCakupan() {
  // Render per request (instant=false + connection): halaman ini
  // membaca waktu (batas 7/30 hari) — connection() menunda segmen
  // sampai request (pola /kebijakan/koreksi, CSP $RT/$RV).
  await connection();
  const { batasItem, batasArtikel } = hitungBatas();

  let tersedia = true;
  let sumber: { id: string; nama: string; jenis: string; aktif: boolean }[] =
    [];
  const itemPerSumber = new Map<string, number>();
  const artikelPerKategori = new Map<string, number>();
  let totalArtikelTerbit = 0;
  try {
    const supabase = await createClient();
    const { data: daftarSumber, error: errSumber } = await supabase
      .from("pf_sources")
      .select("id,nama,jenis,aktif")
      .order("nama", { ascending: true });
    if (errSumber || !daftarSumber) {
      tersedia = false;
    } else {
      sumber = daftarSumber as typeof sumber;
      // Hitungan item 7 hari per sumber: count exact (head) per
      // sumber — eksak, bukan sampel. 20 sumber = 20 kueri paralel.
      const hitungan = await Promise.all(
        sumber.map(async (s) => {
          const { count, error } = await supabase
            .from("pf_raw_items")
            .select("id", { count: "exact", head: true })
            .eq("sumber_id", s.id)
            .gte("waktu_diambil", batasItem);
          return { id: s.id, jumlah: error ? null : (count ?? 0) };
        }),
      );
      for (const h of hitungan) {
        if (h.jumlah !== null) itemPerSumber.set(h.id, h.jumlah);
      }
      const { data: artikel, error: errArtikel } = await supabase
        .from("pf_articles")
        .select("kategori_slug")
        .eq("status", "terbit")
        .gte("diterbitkan_pada", batasArtikel)
        .limit(1000);
      if (!errArtikel) {
        totalArtikelTerbit = (artikel ?? []).length;
        for (const a of (artikel ?? []) as { kategori_slug: string | null }[]) {
          const k = a.kategori_slug ?? "(tanpa kategori)";
          artikelPerKategori.set(k, (artikelPerKategori.get(k) ?? 0) + 1);
        }
      }
    }
  } catch {
    tersedia = false;
  }

  const aktif = sumber.filter((s) => s.aktif).length;
  const totalItem7h = [...itemPerSumber.values()].reduce((a, b) => a + b, 0);
  const kategoriTerurut = [...artikelPerKategori.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <>
      <section className="seksi" aria-labelledby="judul-cakupan">
        <div className="seksi-kepala">
          <h2 id="judul-cakupan">Cakupan Global</h2>
        </div>
        <p className="artikel-meta-kecil">
          Cakupan dihitung dari data yang ada: item mentah per sumber
          (7 hari terakhir), artikel terbit per kategori (30 hari
          terakhir), dan status aktif sumber. TIDAK ADA persentase
          cakupan di sini — persentase &quot;liputan dunia&quot;
          tidak bisa dihitung tanpa penyebut yang terdefinisi.
          Perincian per negara/bahasa TIDAK tersedia: skema
          pf_sources tidak punya kolom negara/bahasa (hanya nama,
          jenis, URL, aktif, prioritas). Peta geografis artikel ada
          di <Link href="/peta">/peta</Link>.
        </p>
        {!tersedia ? (
          <EmptyState
            judul="Cakupan tidak dapat dibaca"
            pesan="Sumber tidak dapat dibaca — periksa koneksi atau izin baca staf untuk pf_sources."
          />
        ) : (
          <>
            <p className="artikel-meta-kecil">
              {aktif} dari {sumber.length} sumber aktif ·{" "}
              {totalItem7h} item mentah 7 hari terakhir ·{" "}
              {totalArtikelTerbit} artikel terbit 30 hari terakhir.
            </p>
            <div className="tabel-gulir">
              <table className="tabel-data">
                <thead>
                  <tr>
                    <th>Sumber</th>
                    <th>Jenis</th>
                    <th>Aktif</th>
                    <th>Item 7 hari</th>
                  </tr>
                </thead>
                <tbody>
                  {sumber.map((s) => (
                    <tr key={s.id}>
                      <td>{s.nama}</td>
                      <td>{s.jenis}</td>
                      <td>{s.aktif ? "Ya" : "Tidak"}</td>
                      <td>
                        {itemPerSumber.has(s.id)
                          ? itemPerSumber.get(s.id)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Artikel terbit per kategori (30 hari)</h3>
            {kategoriTerurut.length === 0 ? (
              <p className="artikel-meta-kecil">
                Tidak ada artikel terbit dalam 30 hari terakhir.
              </p>
            ) : (
              <div className="tabel-gulir">
                <table className="tabel-data">
                  <thead>
                    <tr>
                      <th>Kategori</th>
                      <th>Artikel terbit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kategoriTerurut.map(([k, j]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{j}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
