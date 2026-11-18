// Perbandingan dua artikel berdampingan (P1-3) — varian side-by-side
// dari PerbandinganSumber (matriks klaim × sumber per artikel).
// Data dari getPerbandinganDuaArtikel (lib/data.ts).
//
// Prinsip kejujuran:
// - "Klaim bersama" = dua klaim yang TEKSNYA SAMA setelah
//   normalisasi (huruf kecil, tanda baca dilepas, spasi diringkas)
//   — karena pf_claims.artikel_id hanya menunjuk SATU artikel,
//   tidak ada baris klaim yang tertaut ke kedua artikel.
// - Bila tidak ada klaim bersama, tampilkan JUJUR "tidak ada klaim
//   bersama" + tetap tampilkan ringkasan per artikel berdampingan.
//   Kesamaan TIDAK PERNAH dikarang dari kemiripan judul/topik.
// - Setiap klaim menaut ke /klaim/[id] (Pelacak Klaim, P1-2).
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import type { PerbandinganDuaArtikel, SikapBukti } from "@/lib/data";
import { formatSikapBukti } from "@/lib/perbandingan-dua";
import { formatTanggal } from "@/lib/format";
import {
  kelasLencanaStatus,
  labelStatusVerifikasi,
} from "@/lib/verifikasi";

const LABEL_STATUS_KLAIM: Record<string, string> = {
  terverifikasi: "Terverifikasi",
  terbantah: "Terbantah",
  belum_terverifikasi: "Belum terverifikasi",
  tidak_dapat_diverifikasi: "Tidak dapat diverifikasi",
};

/** Satu sel sikap bukti. undefined = bukti tidak terbaca
 *  (getter gagal) — ditampilkan jujur sebagai "belum dibaca",
 *  bukan "tanpa bukti". */
function SelSikap({ sikap }: { sikap: SikapBukti | undefined }) {
  if (sikap === undefined) {
    return <span style={{ color: "var(--muted)" }}>belum dibaca</span>;
  }
  return <span>{formatSikapBukti(sikap)}</span>;
}

export default function PerbandinganBersebelahan({
  perbandingan,
}: {
  perbandingan: PerbandinganDuaArtikel;
}) {
  const { artikelA, artikelB, bersama, hanyaA, hanyaB, sumberA, sumberB } =
    perbandingan;

  return (
    <section className="seksi" aria-labelledby="seksi-bersebelahan">
      <div className="seksi-kepala">
        <h2 id="seksi-bersebelahan">Bersebelahan: dua liputan</h2>
        <p>
          Dua artikel terbit berdampingan. &ldquo;Klaim bersama&rdquo;
          berarti kedua artikel memuat klaim dengan teks yang sama
          persis (sesudah normalisasi huruf dan tanda baca) — bukan
          sekadar topik yang sama. Klaim yang hanya ada di satu
          artikel dicantumkan terpisah, bukan disembunyikan.
        </p>
      </div>

      {!perbandingan.tersedia || !artikelA || !artikelB ? (
        <EmptyState
          varian="error"
          judul="Perbandingan belum tersedia"
          pesan="Kedua artikel tidak dapat dibandingkan — salah satu artikel tidak ditemukan, masih berstatus draf, atau data klaim belum dapat dibaca. Periksa kembali tautan artikelnya."
        />
      ) : (
        <>
          {/* Ringkasan per artikel, berdampingan (menumpuk di layar sempit). */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {[
              { artikel: artikelA, sumber: sumberA, label: "Artikel A" },
              { artikel: artikelB, sumber: sumberB, label: "Artikel B" },
            ].map(({ artikel, sumber, label }) => (
              <article key={artikel.id} className="kartu">
                <div className="kartu-isi">
                  <p className="kartu-meta">{label}</p>
                  <h3 className="kartu-judul">
                    <Link href={`/artikel/${artikel.slug}`}>
                      {artikel.judul}
                    </Link>
                  </h3>
                  {artikel.ringkasan && (
                    <p className="kartu-teks">{artikel.ringkasan}</p>
                  )}
                  <p className="kartu-meta">
                    <span
                      className={kelasLencanaStatus(
                        artikel.status_verifikasi,
                      )}
                    >
                      {labelStatusVerifikasi(artikel.status_verifikasi)}
                    </span>
                    {artikel.kategori_slug
                      ? ` · ${artikel.kategori_slug}`
                      : ""}
                    {` · ${formatTanggal(
                      artikel.diterbitkan_pada,
                      "Tanggal belum tersedia",
                    )}`}
                  </p>
                  <p className="kartu-teks">
                    Sumber ({sumber.length}):{" "}
                    {sumber.length === 0
                      ? "belum ada sumber tercatat untuk artikel ini."
                      : sumber.map((s, i) => (
                          <span key={`${s.url ?? s.nama}-${i}`}>
                            {i > 0 && "; "}
                            {s.url ? (
                              <Link
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {s.nama}
                              </Link>
                            ) : (
                              s.nama
                            )}
                          </span>
                        ))}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* Klaim bersama — jujur bila kosong. */}
          {bersama.length === 0 ? (
            <EmptyState
              judul="Tidak ada klaim bersama"
              pesan="Kedua artikel tidak memuat satu pun klaim dengan teks yang sama. Ini bukan berarti keduanya bertentangan — hanya berarti tidak ada pernyataan yang dirumuskan sama persis di keduanya. Ringkasan kedua artikel di atas tetap dapat dibandingkan, dan klaim masing-masing tercantum di bawah."
            />
          ) : (
            <>
              <h3 style={{ marginTop: 24 }}>
                Klaim bersama ({bersama.length})
              </h3>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                Klaim-klaim di bawah ini muncul di kedua artikel dengan
                teks yang sama. Statusnya bisa berbeda — status
                dicatat per artikel, bukan per teks. &ldquo;Sikap
                bukti&rdquo; dihitung mesin dari bukti
                (pf_evidence.arah: mendukung/menentang/netral) di
                balik tiap klaim — bukan label opini. Kejujuran yang
                perlu diketahui: pipeline menulis arah secara
                deterministik — &ldquo;mendukung&rdquo; bila kalimat
                pendukung verbatim ditemukan di sumber,
                &ldquo;netral&rdquo; bila tidak ditemukan (sikap
                verbatim tidak terkonfirmasi); &ldquo;menentang&rdquo;
                hanya dari label manual redaksi. Jadi
                &ldquo;mendukung&rdquo; di kedua sisi berarti kedua
                sisi punya kalimat pendukung verbatim — bukan
                berarti kedua artikel sepakat.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="tabel-data">
                  <thead>
                    <tr>
                      <th scope="col">Klaim</th>
                      <th scope="col">Di artikel A</th>
                      <th scope="col">Sikap bukti di A</th>
                      <th scope="col">Di artikel B</th>
                      <th scope="col">Sikap bukti di B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bersama.map((pasangan) => (
                      <tr key={pasangan.klaimA.id}>
                        <th
                          scope="row"
                          style={{ textAlign: "left", fontWeight: 600 }}
                        >
                          {pasangan.teks}
                        </th>
                        <td>
                          <span className="lencana">
                            {LABEL_STATUS_KLAIM[pasangan.klaimA.status] ??
                              pasangan.klaimA.status}
                          </span>{" "}
                          <Link href={`/klaim/${pasangan.klaimA.id}`}>
                            Lacak klaim
                          </Link>
                        </td>
                        <td>
                          <SelSikap sikap={pasangan.sikapA} />
                        </td>
                        <td>
                          <span className="lencana">
                            {LABEL_STATUS_KLAIM[pasangan.klaimB.status] ??
                              pasangan.klaimB.status}
                          </span>{" "}
                          <Link href={`/klaim/${pasangan.klaimB.id}`}>
                            Lacak klaim
                          </Link>
                        </td>
                        <td>
                          <SelSikap sikap={pasangan.sikapB} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Klaim yang hanya ada di satu artikel. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              marginTop: 24,
            }}
          >
            <div>
              <h3>Hanya di artikel A ({hanyaA.length})</h3>
              {hanyaA.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>
                  Semua klaim artikel A juga muncul di artikel B.
                </p>
              ) : (
                <ul>
                  {hanyaA.map((k) => (
                    <li key={k.id}>
                      {k.teks}{" "}
                      <span style={{ color: "var(--muted)" }}>
                        ({LABEL_STATUS_KLAIM[k.status] ?? k.status})
                      </span>{" "}
                      <Link href={`/klaim/${k.id}`}>Lacak klaim</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Hanya di artikel B ({hanyaB.length})</h3>
              {hanyaB.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>
                  Semua klaim artikel B juga muncul di artikel A.
                </p>
              ) : (
                <ul>
                  {hanyaB.map((k) => (
                    <li key={k.id}>
                      {k.teks}{" "}
                      <span style={{ color: "var(--muted)" }}>
                        ({LABEL_STATUS_KLAIM[k.status] ?? k.status})
                      </span>{" "}
                      <Link href={`/klaim/${k.id}`}>Lacak klaim</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
