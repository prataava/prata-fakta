// Hapus data per jenis (klien) — bagian "Data saya" di /saya.
// GET /api/saya/data untuk jumlah nyata per jenis; DELETE
// /api/saya/data {jenis, semua: true} untuk hapus massal per
// jenis. Konfirmasi dua langkah per tombol (tekan sekali untuk
// bersiap, sekali lagi untuk benar-benar hapus) — tidak ada hapus
// sekali tekan. Jumlah null = tabel belum dapat dibaca (jujur
// "tidak diketahui", bukan 0).
"use client";

import { useEffect, useState } from "react";
import {
  DAFTAR_JENIS_DATA,
  JENIS_DATA,
  type JenisData,
} from "@/lib/akun/jenis-data";

type Jumlah = Record<JenisData, number | null>;

export default function HapusDataPerItem() {
  const [jumlah, setJumlah] = useState<Jumlah | null>(null);
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState("");
  const [bersiap, setBersiap] = useState<JenisData | null>(null);
  const [menghapus, setMenghapus] = useState<JenisData | null>(null);
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    fetch("/api/saya/data")
      .then((r) => r.json())
      .then((data: { ok?: boolean; jumlah?: Jumlah; error?: string }) => {
        if (data.ok && data.jumlah) {
          setJumlah(data.jumlah);
        } else {
          setGalat(data.error ?? "Jumlah data belum dapat dimuat.");
        }
      })
      .catch(() => {
        setGalat("Tidak dapat terhubung ke server. Coba lagi.");
      })
      .finally(() => setSiap(true));
  }, []);

  async function hapusSemua(jenis: JenisData) {
    setMenghapus(jenis);
    setPesan("");
    try {
      const res = await fetch("/api/saya/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenis, semua: true }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        dihapus?: number;
        pesan?: string;
      };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Penghapusan gagal. Coba lagi.");
        return;
      }
      setJumlah((lama) =>
        lama ? { ...lama, [jenis]: 0 } : lama,
      );
      setPesan(data.pesan ?? "Data telah dihapus.");
    } catch {
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    } finally {
      setMenghapus(null);
      setBersiap(null);
    }
  }

  if (!siap) {
    return (
      <div className="kartu-form">
        <div className="kerangka" aria-label="Memuat jumlah data…" />
      </div>
    );
  }

  if (!jumlah) {
    return (
      <div className="kartu-form">
        <p className="pesan-error" role="alert">
          {galat || "Jumlah data belum dapat dimuat."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {DAFTAR_JENIS_DATA.map((jenis) => {
          const info = JENIS_DATA[jenis];
          const n = jumlah[jenis];
          const sedangMenghapus = menghapus === jenis;
          const sedangBersiap = bersiap === jenis;
          return (
            <div key={jenis} className="kartu" style={{ margin: 0 }}>
              <span className="kartu-judul">{info.label}</span>
              <span className="kartu-teks">{info.keterangan}</span>
              <span className="kartu-meta">
                {n === null
                  ? "Jumlah tidak dapat dibaca saat ini."
                  : n === 0
                    ? "Belum ada data — tidak ada yang dihapus."
                    : `${n} data tersimpan.`}
              </span>
              <span>
                <button
                  className="tombol tombol-hantu"
                  type="button"
                  disabled={
                    n === null || n === 0 || sedangMenghapus || menghapus !== null
                  }
                  onClick={() => {
                    if (sedangBersiap) {
                      void hapusSemua(jenis);
                    } else {
                      setBersiap(jenis);
                    }
                  }}
                >
                  {sedangMenghapus
                    ? "Menghapus…"
                    : sedangBersiap
                      ? `Yakin hapus semua ${n ?? ""} data ini?`
                      : "Hapus semua"}
                </button>
                {sedangBersiap && (
                  <button
                    className="tombol"
                    type="button"
                    onClick={() => setBersiap(null)}
                    style={{ marginLeft: 8 }}
                  >
                    Batal
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {pesan && (
        <p className="pesan-sukses" role="status" style={{ marginTop: 12 }}>
          {pesan}
        </p>
      )}
      <p style={{ color: "var(--muted)", marginTop: 12 }}>
        Menghapus satu jenis data hanya menghapus data jenis itu. Untuk
        menghapus seluruh akun beserta semua data sekaligus, gunakan
        halaman Hapus Akun.
      </p>
    </div>
  );
}
