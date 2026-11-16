// Formulir konfirmasi akhir hapus akun (klien).
// Membaca ?token=... dari URL (tanpa useSearchParams agar tidak
// butuh Suspense), memverifikasi ke GET /api/saya/akun/hapus,
// lalu mengeksekusi DELETE /api/saya/akun sesudah pengguna
// mencentang pemahaman + menekan tombol. Tanggal ditampilkan
// sebagai potongan string ISO (tanpa new Date() di render —
// aturan Next 16 cacheComponents di AGENTS.md).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = "memuat" | "siap" | "menghapus" | "selesai" | "error";

function potongTanggal(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default function FormKonfirmasiHapus() {
  // Token dibaca sekali saat mount (lazy initializer — aman saat
  // prerender karena window dicek). Status awal diturunkan dari
  // token, bukan di-set di dalam effect (aturan react-hooks).
  const [token] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : (new URLSearchParams(window.location.search).get("token") ?? null),
  );
  const [status, setStatus] = useState<Status>(
    token === null ? "error" : "memuat",
  );
  const [pesan, setPesan] = useState(
    token === null
      ? "Tautan tidak membawa token konfirmasi. Buka tautan dari email Anda, atau minta tautan baru dari halaman hapus akun."
      : "",
  );
  const [dimintaPada, setDimintaPada] = useState<string | null>(null);
  const [kedaluwarsaPada, setKedaluwarsaPada] = useState<string | null>(null);
  const [paham, setPaham] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/saya/akun/hapus?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(
        (data: {
          ok?: boolean;
          error?: string;
          diminta_pada?: string;
          kedaluwarsa_pada?: string;
        }) => {
          if (!data.ok) {
            setStatus("error");
            setPesan(data.error ?? "Tautan tidak dapat diverifikasi.");
            return;
          }
          setDimintaPada(data.diminta_pada ?? null);
          setKedaluwarsaPada(data.kedaluwarsa_pada ?? null);
          setStatus("siap");
        },
      )
      .catch(() => {
        setStatus("error");
        setPesan("Tidak dapat terhubung ke server. Coba lagi.");
      });
  }, [token]);

  async function hapusAkun() {
    if (!token || !paham) return;
    setStatus("menghapus");
    setPesan("");
    try {
      const res = await fetch("/api/saya/akun/hapus", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Penghapusan gagal. Coba lagi.");
        return;
      }
      setStatus("selesai");
      setPesan(
        "Akun Anda beserta seluruh data pribadi telah dihapus. Terima kasih sudah memakai PRATA FAKTA.",
      );
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  if (status === "memuat") {
    return (
      <div className="kartu-form">
        <div className="kerangka" aria-label="Memeriksa tautan…" />
        <p role="status">Memeriksa tautan konfirmasi…</p>
      </div>
    );
  }

  if (status === "selesai") {
    return (
      <div className="kartu-form">
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
        <p>
          <Link className="tombol" href="/">
            Kembali ke Beranda
          </Link>
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="kartu-form">
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
        <p>
          <Link className="tombol" href="/saya/hapus-akun">
            Minta tautan baru
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="kartu-form">
      <p style={{ marginTop: 0 }}>
        Tautan ini diminta pada {potongTanggal(dimintaPada)} dan berlaku
        sampai {potongTanggal(kedaluwarsaPada)}. Tautan hanya bisa dipakai
        sekali — sesudah dipakai atau kedaluwarsa, minta tautan baru bila
        masih ingin menghapus akun.
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={paham}
          onChange={(e) => setPaham(e.target.checked)}
          disabled={status === "menghapus"}
        />
        <span>
          Saya memahami bahwa penghapusan ini permanen: profil, bookmark,
          riwayat baca, skor kuis, topik, notifikasi, preferensi, progres
          kursus, riwayat podcast, dan langganan newsletter saya akan
          hilang dan tidak dapat dikembalikan.
        </span>
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <button
          className="tombol tombol-primer"
          type="button"
          onClick={hapusAkun}
          disabled={!paham || status === "menghapus"}
        >
          {status === "menghapus"
            ? "Menghapus…"
            : "Hapus akun saya secara permanen"}
        </button>
        <Link className="tombol tombol-hantu" href="/saya">
          Batalkan
        </Link>
      </div>
    </div>
  );
}
