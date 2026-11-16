// Tombol tambah/hapus playlist (client component).
// Bila belum login, tombol mengarah ke /masuk (bukan pura-pura
// menyimpan). State awal diambil dari prop sudahAda.
"use client";

import { useState } from "react";
import Link from "next/link";

export default function TombolPlaylist({
  episodeId,
  sudahLogin,
  sudahAdaAwal,
}: {
  episodeId: string;
  sudahLogin: boolean;
  sudahAdaAwal: boolean;
}) {
  const [sudahAda, setSudahAda] = useState(sudahAdaAwal);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  if (!sudahLogin) {
    return (
      <Link className="tombol" href="/masuk">
        Masuk untuk menyimpan ke playlist
      </Link>
    );
  }

  async function ubah() {
    setSibuk(true);
    setPesan(null);
    try {
      if (sudahAda) {
        const res = await fetch(
          `/api/podcast/playlist?episode_id=${encodeURIComponent(episodeId)}`,
          { method: "DELETE" },
        );
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setPesan(data.error ?? "Gagal menghapus dari playlist.");
          return;
        }
        setSudahAda(false);
        setPesan("Dihapus dari playlist Anda.");
      } else {
        const res = await fetch("/api/podcast/playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episode_id: episodeId }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setPesan(data.error ?? "Gagal menambah playlist.");
          return;
        }
        setSudahAda(true);
        setPesan("Ditambahkan ke playlist Anda.");
      }
    } catch {
      setPesan("Gagal mengubah playlist. Periksa koneksi lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        className="tombol"
        onClick={ubah}
        disabled={sibuk}
      >
        {sudahAda ? "− Hapus dari playlist" : "+ Tambah ke playlist"}
      </button>
      {pesan && (
        <span className="kartu-meta" role="status" style={{ marginLeft: 8 }}>
          {pesan}
        </span>
      )}
    </span>
  );
}
