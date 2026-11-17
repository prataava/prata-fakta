"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Aksi interaktif halaman /perpustakaan (P1-1): pindah bookmark
// ke folder, hapus catatan, hapus pencarian tersimpan. Semua
// lewat API yang sudah ada (/api/bookmark, /api/catatan,
// /api/saya/pencarian-tersimpan) + router.refresh() agar daftar
// server terbarui tanpa muat ulang penuh.

/** Pindah satu bookmark ke folder (nama bebas, "" = Tanpa folder). */
export function FormPindahFolder({
  artikelId,
  pengetahuanId,
  folderAwal,
  daftarFolder,
}: {
  artikelId?: string;
  pengetahuanId?: string;
  folderAwal: string | null;
  daftarFolder: string[];
}) {
  const router = useRouter();
  const [folder, setFolder] = useState(folderAwal ?? "");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function pindah() {
    setSibuk(true);
    setPesan("");
    try {
      const res = await fetch("/api/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(artikelId ? { artikel_id: artikelId } : {}),
          ...(pengetahuanId ? { pengetahuan_id: pengetahuanId } : {}),
          folder,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPesan(data.error ?? "Gagal memindahkan bookmark.");
        return;
      }
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <span
      style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
    >
      <label htmlFor={`folder-${artikelId ?? pengetahuanId}`} className="sr-only">
        Folder bookmark
      </label>
      <input
        id={`folder-${artikelId ?? pengetahuanId}`}
        type="text"
        value={folder}
        maxLength={50}
        list={`daftar-folder-${artikelId ?? pengetahuanId}`}
        placeholder="Tanpa folder"
        aria-label="Nama folder"
        onChange={(e) => setFolder(e.target.value)}
        style={{ width: 140 }}
      />
      <datalist id={`daftar-folder-${artikelId ?? pengetahuanId}`}>
        {daftarFolder.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <button
        type="button"
        className="tombol"
        onClick={pindah}
        disabled={sibuk || folder === (folderAwal ?? "")}
      >
        {sibuk ? "Memindahkan…" : "Pindahkan"}
      </button>
      {pesan && (
        <span className="pesan-error" role="alert" style={{ fontSize: "0.88rem" }}>
          {pesan}
        </span>
      )}
    </span>
  );
}

/** Hapus satu catatan pribadi (konfirmasi dua langkah). */
export function TombolHapusCatatan({ id }: { id: string }) {
  const router = useRouter();
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function hapus() {
    setSibuk(true);
    setPesan("");
    try {
      const res = await fetch("/api/catatan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPesan(data.error ?? "Gagal menghapus catatan.");
        return;
      }
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setSibuk(false);
    }
  }

  if (konfirmasi) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="tombol tombol-primer"
          onClick={hapus}
          disabled={sibuk}
        >
          Ya, hapus
        </button>
        <button
          type="button"
          className="tombol tombol-hantu"
          onClick={() => setKonfirmasi(false)}
        >
          Batal
        </button>
        {pesan && (
          <span className="pesan-error" role="alert" style={{ fontSize: "0.88rem" }}>
            {pesan}
          </span>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="tombol tombol-hantu"
      onClick={() => setKonfirmasi(true)}
    >
      Hapus
    </button>
  );
}

/** Hapus satu pencarian tersimpan. */
export function TombolHapusPencarian({
  q,
  disimpanPada,
}: {
  q: string;
  disimpanPada: string;
}) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function hapus() {
    setSibuk(true);
    setPesan("");
    try {
      const res = await fetch("/api/saya/pencarian-tersimpan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, disimpan_pada: disimpanPada }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPesan(data.error ?? "Gagal menghapus pencarian.");
        return;
      }
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        className="tombol tombol-hantu"
        onClick={hapus}
        disabled={sibuk}
      >
        {sibuk ? "Menghapus…" : "Hapus"}
      </button>
      {pesan && (
        <span className="pesan-error" role="alert" style={{ fontSize: "0.88rem" }}>
          {pesan}
        </span>
      )}
    </span>
  );
}
