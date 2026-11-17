import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { formatTanggalJam } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getRiwayatBaca } from "@/lib/lanjutan";
import {
  getBookmarkDalamFolder,
  getCatatanPengguna,
  getFolderBookmark,
  getPencarianTersimpan,
  type PencarianTersimpan,
} from "@/lib/perpustakaan";
import {
  FormPindahFolder,
  TombolHapusCatatan,
  TombolHapusPencarian,
} from "./AksiPerpustakaan";

export const metadata: Metadata = {
  title: "Perpustakaan — My Prata",
  description:
    "Perpustakaan pribadi PRATA FAKTA: folder bookmark, catatan pribadi, bacaan yang dilanjutkan, dan pencarian tersimpan Anda.",
};

// Perpustakaan pribadi (P1-1): hub personal — folder bookmark,
// catatan saya, lanjutkan membaca, pencarian tersimpan.
// Wajib login, redirect /masuk bila tamu (pola /saya). Semua
// angka NYATA dari data pengguna sendiri — tanpa angka palsu.
//
// Render per request (`instant = false`) + `await connection()`
// (insiden /jelajahi: halaman yang membaca data per request
// tanpa connection() berisiko skrip $RC terpanggang tanpa nonce
// → hidrasi gagal #419). JANGAN hapus keduanya.
export const instant = false;

/** URL /cari untuk satu pencarian tersimpan. */
function tautanCari(p: PencarianTersimpan): string {
  const params = new URLSearchParams();
  params.set("q", p.q);
  if (p.dari) params.set("dari", p.dari);
  if (p.sampai) params.set("sampai", p.sampai);
  if (p.sumber) params.set("sumber", p.sumber);
  if (p.status) params.set("status", p.status);
  return `/cari?${params.toString()}`;
}

function labelFolder(folder: string | null): string {
  return folder ?? "Tanpa folder";
}

export default async function Perpustakaan({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string | string[] }>;
}) {
  await connection();
  const supabase = await createClient();
  let penggunaId: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) redirect("/masuk");

  const sp = await searchParams;
  const mentahFolder = Array.isArray(sp.folder) ? sp.folder[0] : sp.folder;
  // Param tak ada = semua folder; "?folder=" (kosong) = Tanpa folder.
  const folderTerpilih: string | null | undefined =
    mentahFolder === undefined ? undefined : mentahFolder === "" ? null : mentahFolder;

  const [daftarFolder, catatan, riwayat, pencarian, isiFolder] =
    await Promise.all([
      getFolderBookmark(penggunaId),
      getCatatanPengguna(penggunaId, { limit: 20 }),
      getRiwayatBaca(penggunaId, 10),
      getPencarianTersimpan(penggunaId),
      getBookmarkDalamFolder(penggunaId, folderTerpilih, 20),
    ]);
  const belumSelesai = riwayat.filter((r) => !r.selesai).slice(0, 5);
  const namaFolder = daftarFolder
    .map((f) => f.folder)
    .filter((f): f is string => f !== null);
  const totalBookmark = daftarFolder.reduce((n, f) => n + f.jumlah, 0);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-perpustakaan">
        <span className="hero-label">My Prata</span>
        <h1 id="judul-perpustakaan">Perpustakaan</h1>
        <p>
          Perpustakaan pribadi Anda{email ? ` (${email})` : ""}: artikel
          yang disimpan dalam folder, catatan pribadi, bacaan yang
          belum selesai, dan pencarian tersimpan. Semua di sini
          berasal dari aktivitas Anda sendiri.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <Link className="tombol" href="/saya">
            Kembali ke Saya
          </Link>
          <Link className="tombol" href="/saya/topik">
            Topik yang saya ikuti
          </Link>
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-folder">
        <div className="seksi-kepala">
          <h2 id="seksi-folder">Folder bookmark</h2>
          <p>
            {totalBookmark === 0
              ? "Belum ada bookmark — simpan artikel untuk mengisinya."
              : `${totalBookmark} bookmark dalam ${daftarFolder.length} folder.`}
          </p>
        </div>
        {daftarFolder.length === 0 ? (
          <EmptyState
            judul="Belum ada bookmark."
            pesan="Simpan artikel dari halaman artikel — bookmark tanpa folder masuk ke “Tanpa folder”, dan Anda bisa memindahkannya ke folder bernama bebas dari sini."
            aksi={
              <Link className="tombol" href="/arsip">
                Jelajahi arsip
              </Link>
            }
          />
        ) : (
          <>
            <p style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Link
                className="chip"
                href="/perpustakaan"
                aria-current={folderTerpilih === undefined ? "true" : undefined}
                style={
                  folderTerpilih === undefined
                    ? { outline: "2px solid var(--aksen, #68e4c1)" }
                    : undefined
                }
              >
                Semua ({totalBookmark})
              </Link>
              {daftarFolder.map((f) => (
                <Link
                  key={f.folder ?? "__tanpa__"}
                  className="chip"
                  href={`/perpustakaan?folder=${encodeURIComponent(f.folder ?? "")}`}
                  aria-current={
                    folderTerpilih === f.folder ? "true" : undefined
                  }
                  style={
                    folderTerpilih === f.folder
                      ? { outline: "2px solid var(--aksen, #68e4c1)" }
                      : undefined
                  }
                >
                  {labelFolder(f.folder)} ({f.jumlah})
                </Link>
              ))}
            </p>
            {isiFolder.length === 0 ? (
              <EmptyState
                judul={
                  folderTerpilih === undefined
                    ? "Tidak ada bookmark yang bisa ditampilkan."
                    : `Folder “${labelFolder(folderTerpilih)}” kosong.`
                }
                pesan="Artikel yang sudah tidak terbit tidak ditampilkan di sini."
              />
            ) : (
              <ul
                style={{
                  display: "grid",
                  gap: 8,
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {isiFolder.map((b) => (
                  <li key={b.bookmark_id} className="kartu" style={{ margin: 0 }}>
                    <span className="kartu-kategori">
                      {b.jenis === "artikel" ? "Berita" : "Pengetahuan"}
                      {b.folder ? ` · Folder: ${b.folder}` : " · Tanpa folder"}
                    </span>
                    <span className="kartu-judul">
                      {b.slug ? (
                        <Link
                          href={
                            b.jenis === "artikel"
                              ? `/artikel/${b.slug}`
                              : `/pengetahuan/${b.slug}`
                          }
                        >
                          {b.judul ?? "Tanpa judul"}
                        </Link>
                      ) : (
                        (b.judul ?? "Tanpa judul")
                      )}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      <FormPindahFolder
                        artikelId={b.artikel_id ?? undefined}
                        pengetahuanId={b.pengetahuan_id ?? undefined}
                        folderAwal={b.folder}
                        daftarFolder={namaFolder}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-catatan">
        <div className="seksi-kepala">
          <h2 id="seksi-catatan">Catatan saya</h2>
          <p>Catatan pribadi Anda — hanya Anda yang bisa melihatnya.</p>
        </div>
        {catatan.length === 0 ? (
          <EmptyState
            judul="Belum ada catatan."
            pesan="Tulis catatan dari halaman artikel (di bawah isi artikel) — catatan tersimpan di akun Anda dan bisa diubah atau dihapus kapan saja."
            aksi={
              <Link className="tombol" href="/arsip">
                Jelajahi arsip
              </Link>
            }
          />
        ) : (
          <ul
            style={{
              display: "grid",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {catatan.map((c) => (
              <li key={c.id} className="kartu" style={{ margin: 0 }}>
                <span className="kartu-kategori">
                  {c.jenis_target === "pengetahuan" ? "Pengetahuan" : "Berita"}
                </span>
                {c.slug_target ? (
                  <span className="kartu-judul">
                    <Link
                      href={
                        c.jenis_target === "pengetahuan"
                          ? `/pengetahuan/${c.slug_target}`
                          : `/artikel/${c.slug_target}`
                      }
                    >
                      {c.judul_target ?? "Artikel"}
                    </Link>
                  </span>
                ) : (
                  <span className="kartu-judul">
                    {c.judul_target ?? "Artikel (sudah tidak tersedia)"}
                  </span>
                )}
                <span className="kartu-teks" style={{ whiteSpace: "pre-wrap" }}>
                  {c.isi}
                </span>
                <span className="kartu-meta">
                  Ditulis {formatTanggalJam(c.dibuat_pada)}
                  {c.diubah_pada &&
                    c.diubah_pada !== c.dibuat_pada &&
                    ` · Diubah ${formatTanggalJam(c.diubah_pada)}`}
                </span>
                <span
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 8,
                  }}
                >
                  {c.slug_target && (
                    <Link
                      className="tombol"
                      href={
                        c.jenis_target === "pengetahuan"
                          ? `/pengetahuan/${c.slug_target}`
                          : `/artikel/${c.slug_target}`
                      }
                    >
                      Ubah di artikel
                    </Link>
                  )}
                  <TombolHapusCatatan id={c.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-lanjutkan">
        <div className="seksi-kepala">
          <h2 id="seksi-lanjutkan">Lanjutkan membaca</h2>
          <p>Artikel yang mulai Anda baca tapi belum selesai.</p>
        </div>
        {belumSelesai.length === 0 ? (
          <EmptyState
            judul="Tidak ada bacaan yang belum selesai."
            pesan="Semua artikel yang Anda baca sudah selesai, atau Anda belum mulai membaca artikel apa pun."
            aksi={
              <Link className="tombol" href="/arsip">
                Jelajahi arsip
              </Link>
            }
          />
        ) : (
          <ul
            style={{
              display: "grid",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {belumSelesai.map((r) => (
              <li key={r.id} className="kartu" style={{ margin: 0 }}>
                <span className="kartu-kategori">
                  {r.artikel.kategori_slug ?? "Umum"}
                </span>
                <span className="kartu-judul">
                  <Link href={`/artikel/${r.artikel.slug}`}>
                    {r.artikel.judul}
                  </Link>
                </span>
                <span className="kartu-meta">
                  Dibaca {formatTanggalJam(r.dibaca_pada)} · Belum selesai
                  {" · "}
                  <Link href={`/artikel/${r.artikel.slug}`}>
                    Lanjutkan membaca
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-pencarian">
        <div className="seksi-kepala">
          <h2 id="seksi-pencarian">Pencarian tersimpan</h2>
          <p>Pencarian yang Anda simpan dari halaman Cari.</p>
        </div>
        {pencarian.length === 0 ? (
          <EmptyState
            judul="Belum ada pencarian tersimpan."
            pesan="Simpan pencarian dari halaman Cari agar bisa dijalankan lagi dari sini."
            aksi={
              <Link className="tombol" href="/cari">
                Buka pencarian
              </Link>
            }
          />
        ) : (
          <ul
            style={{
              display: "grid",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {pencarian.map((p) => (
              <li
                key={`${p.q}::${p.disimpan_pada}`}
                className="kartu"
                style={{ margin: 0 }}
              >
                <span className="kartu-judul">
                  <Link href={tautanCari(p)}>“{p.q}”</Link>
                </span>
                <span className="kartu-meta">
                  Disimpan {formatTanggalJam(p.disimpan_pada)}
                  {p.status ? ` · Status: ${p.status}` : ""}
                  {p.dari || p.sampai
                    ? ` · ${p.dari ?? "…"} s.d. ${p.sampai ?? "…"}`
                    : ""}
                </span>
                <span style={{ display: "block", marginTop: 8 }}>
                  <TombolHapusPencarian
                    q={p.q}
                    disimpanPada={p.disimpan_pada}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
