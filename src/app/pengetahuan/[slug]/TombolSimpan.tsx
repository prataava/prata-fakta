"use client";

// Tombol Simpan untuk halaman detail pengetahuan (F11,
// follow-up 5/6): toggle bookmark artikel pengetahuan lewat
// POST /api/bookmark { pengetahuan_id } (kolom
// pf_bookmarks.pengetahuan_id, migrasi v16). Pola yang sama
// dengan tombol bookmark PembacaArtikel (artikel berita).
// Bila belum login, tombol menjadi tautan ke /masuk.
import { useState } from "react";
import Link from "next/link";

export default function TombolSimpan({
  pengetahuanId,
  bookmarkAwal,
  loggedIn,
}: {
  pengetahuanId: string;
  bookmarkAwal: boolean;
  loggedIn: boolean;
}) {
  const [bookmark, setBookmark] = useState(bookmarkAwal);
  const [pesan, setPesan] = useState("");
  const [loading, setLoading] = useState(false);

  async function toggleSimpan() {
    setLoading(true);
    setPesan("");
    try {
      const res = await fetch("/api/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pengetahuan_id: pengetahuanId }),
      });
      const data = (await res.json()) as { bookmarked?: boolean; error?: string };
      if (!res.ok) {
        setPesan(data.error ?? "Gagal mengubah bookmark.");
        return;
      }
      setBookmark(Boolean(data.bookmarked));
      setPesan(
        data.bookmarked
          ? "Artikel pengetahuan disimpan ke bookmark."
          : "Bookmark dihapus.",
      );
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  if (!loggedIn) {
    return (
      <Link className="tombol tombol-hantu" href="/masuk">
        ☆ Simpan
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        className="tombol tombol-hantu"
        onClick={toggleSimpan}
        disabled={loading}
        aria-pressed={bookmark}
      >
        {loading ? "Menyimpan…" : bookmark ? "★ Tersimpan" : "☆ Simpan"}
      </button>
      {pesan && (
        <span className="kartu-meta" role="status">
          {pesan}
        </span>
      )}
    </>
  );
}
