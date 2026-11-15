"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LABEL_JENIS_LAPORAN_PUBLIK } from "@/lib/laporan";

// Lacak status laporan masyarakat (GET /api/laporan-publik).
// Yang tampil HANYA nomor, jenis, status, dan tanggal — tanpa
// data pelapor.
const LABEL_STATUS: Record<string, string> = {
  baru: "Baru — menunggu ditinjau redaksi",
  ditinjau: "Sedang ditinjau redaksi",
  diperbaiki: "Sudah diperbaiki",
  ditolak: "Ditolak redaksi",
};

type HasilLacak = {
  nomor_lacak: string;
  jenis: string;
  status: string;
  dibuat_pada: string | null;
};

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function FormLacak() {
  const params = useSearchParams();
  const awal = params.get("nomor") ?? "";
  const [nomor, setNomor] = useState(awal);
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">(
    "idle",
  );
  const [pesanError, setPesanError] = useState("");
  const [hasil, setHasil] = useState<HasilLacak | null>(null);

  async function lacak(e?: React.FormEvent) {
    e?.preventDefault();
    const n = nomor.trim().toUpperCase();
    if (!/^PF-[A-Z0-9]{8}$/.test(n)) {
      setStatus("error");
      setPesanError("Nomor lacak tidak valid (format: PF-XXXXXXXX).");
      setHasil(null);
      return;
    }
    setStatus("loading");
    setPesanError("");
    try {
      const res = await fetch(
        `/api/laporan-publik?nomor=${encodeURIComponent(n)}`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        laporan?: HasilLacak;
      };
      if (!res.ok || !data.ok || !data.laporan) {
        setStatus("error");
        setPesanError(data.error ?? "Laporan tidak ditemukan.");
        setHasil(null);
        return;
      }
      setHasil(data.laporan);
      setStatus("sukses");
    } catch {
      setStatus("error");
      setPesanError("Tidak dapat terhubung ke server. Coba lagi.");
      setHasil(null);
    }
  }

  return (
    <>
      <form className="formulir" onSubmit={lacak} style={{ maxWidth: 480 }}>
        {status === "error" && pesanError && (
          <p className="pesan-error" role="alert">
            {pesanError}
          </p>
        )}
        <label>
          Nomor lacak *
          <input
            type="text"
            value={nomor}
            onChange={(e) => setNomor(e.target.value.toUpperCase())}
            placeholder="PF-XXXXXXXX"
            maxLength={11}
            required
            style={{ textTransform: "uppercase" }}
          />
        </label>
        <button
          type="submit"
          className="tombol tombol-primer"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Melacak…" : "Lacak laporan"}
        </button>
      </form>

      {status === "sukses" && hasil && (
        <div className="kartu" style={{ marginTop: 16, maxWidth: 480 }}>
          <span className="kartu-kategori">
            Laporan {hasil.nomor_lacak}
          </span>
          <span className="kartu-judul">
            {LABEL_JENIS_LAPORAN_PUBLIK[hasil.jenis] ?? hasil.jenis}
          </span>
          <span className="kartu-teks">
            Status: {LABEL_STATUS[hasil.status] ?? hasil.status}
          </span>
          <span className="kartu-meta">
            Dilaporkan {formatTanggal(hasil.dibuat_pada)}
          </span>
        </div>
      )}
    </>
  );
}

export default function LacakLaporan() {
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-lacak">
        <span className="hero-label">Laporan Masyarakat</span>
        <h1 id="judul-lacak">Lacak Status Laporan</h1>
        <p>
          Masukkan nomor lacak yang Anda terima sesudah mengirim laporan
          untuk melihat statusnya. Hanya status dan jenis laporan yang
          ditampilkan — tanpa data pelapor.
        </p>
      </section>
      <Suspense>
        <FormLacak />
      </Suspense>
      <p style={{ marginTop: 16 }}>
        <Link href="/laporkan">← Kirim laporan baru</Link>
      </p>
    </div>
  );
}
