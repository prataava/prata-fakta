import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import { getKoreksiDiterbitkan } from "@/lib/data";
import { formatTanggal } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Pusat Koreksi",
  description:
    "Daftar koreksi yang sudah diterapkan PRATA FAKTA: artikel terkait, tanggal, jenis kesalahan, dan tanggapan redaksi. Riwayat koreksi tidak disembunyikan.",
};

// Halaman dirender per request (`instant = false` + connection()),
// BUKAN prerender statis — pola yang sama seperti
// /kebijakan/koreksi (CSP $RT/$RV: definisi $RV/$RC harus
// diterbitkan saat resume DENGAN nonce; jangan hapus connection()
// tanpa menguji ulang di CDP).
export const instant = false;

const LABEL_JENIS: Record<string, string> = {
  fakta_salah: "Fakta salah",
  sumber: "Sumber",
  typo: "Salah ketik",
  lainnya: "Lainnya",
  kesalahan_informasi: "Kesalahan informasi",
  sumber_tidak_valid: "Sumber tidak valid",
  gambar_tidak_sesuai: "Gambar tidak sesuai",
  duplikat: "Duplikat",
  perlu_pembaruan: "Perlu pembaruan",
};

export default async function PusatKoreksi() {
  await connection();
  // null = tidak dapat dimuat (bukan "belum ada koreksi").
  const daftar = await getKoreksiDiterbitkan();
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Pusat Koreksi</h1>
        <p className="prosa-meta">
          Transparansi koreksi PRATA FAKTA — riwayat koreksi tidak
          disembunyikan.
        </p>
        <p>
          Bila sebuah artikel terbukti keliru, artikel diperbaiki
          dan diberi label CORRECTED; koreksinya tercatat di sini
          beserta tanggal, jenis kesalahan, dan tanggapan redaksi.
          Artikel yang dikoreksi tidak pernah dihapus diam-diam.
          Cara melaporkan kesalahan ada di{" "}
          <Link href="/kebijakan/koreksi">Koreksi &amp; Hak Jawab</Link>.
        </p>
      </article>
      {daftar === null ? (
        <EmptyState
          judul="Daftar koreksi tidak dapat dimuat"
          pesan="Data koreksi belum dapat dibaca dari server — ini berarti 'tidak dapat dimuat', bukan 'belum ada koreksi'."
        />
      ) : daftar.length === 0 ? (
        <EmptyState
          judul="Belum ada koreksi yang diterbitkan"
          pesan="Belum ada laporan koreksi berstatus 'diperbaiki' saat ini."
        />
      ) : (
        <section className="seksi" aria-labelledby="judul-daftar">
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th>Jenis kesalahan</th>
                  <th>Dilaporkan</th>
                  <th>Diterapkan</th>
                  <th>Versi</th>
                  <th>Tanggapan redaksi</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((k) => (
                  <tr key={k.id}>
                    <td>
                      {k.artikel_slug ? (
                        <Link href={`/artikel/${k.artikel_slug}`}>
                          {k.artikel_judul ?? "Artikel"}
                        </Link>
                      ) : (
                        (k.artikel_judul ?? "Laporan umum")
                      )}
                    </td>
                    <td>{LABEL_JENIS[k.jenis] ?? k.jenis}</td>
                    <td>{formatTanggal(k.dibuat_pada)}</td>
                    <td>
                      {k.diterapkan_pada
                        ? formatTanggal(k.diterapkan_pada)
                        : "—"}
                    </td>
                    <td>
                      {k.versi_artikel !== null && k.versi_artikel !== undefined
                        ? `v${k.versi_artikel}`
                        : "—"}
                    </td>
                    <td>{k.tanggapan_redaksi ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
