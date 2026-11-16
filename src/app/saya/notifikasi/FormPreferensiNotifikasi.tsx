"use client";

import { useEffect, useState } from "react";

// Formulir preferensi notifikasi (Gelombang B2-D, E1).
// Membaca + menyimpan lewat /api/saya/preferensi. Perubahan
// disimpan per sakelar (PATCH) agar pengguna tidak perlu tombol
// simpan. Bila migrasi v14 belum dijalankan, sakelar baru
// menjawab 503 jujur dan nilainya kembali seperti semula.
type Preferensi = {
  notifikasi_topik: boolean;
  notifikasi_koreksi: boolean;
  notifikasi_jawaban: boolean;
  notifikasi_podcast: boolean;
};

const LABEL: { kunci: keyof Preferensi; teks: string }[] = [
  { kunci: "notifikasi_topik", teks: "Artikel baru pada topik yang saya ikuti" },
  { kunci: "notifikasi_koreksi", teks: "Tindak lanjut laporan koreksi saya" },
  { kunci: "notifikasi_jawaban", teks: "Jawaban atas pertanyaan saya" },
  { kunci: "notifikasi_podcast", teks: "Episode podcast baru" },
];

const BAWAN: Preferensi = {
  notifikasi_topik: true,
  notifikasi_koreksi: true,
  notifikasi_jawaban: true,
  notifikasi_podcast: true,
};

export default function FormPreferensiNotifikasi() {
  const [nilai, setNilai] = useState<Preferensi | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    void fetch("/api/saya/preferensi", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (batal || !data || typeof data !== "object") return;
        const p = (data as { preferensi?: Record<string, unknown> })
          .preferensi;
        if (!p) return;
        const berikutnya: Preferensi = { ...BAWAN };
        for (const kunci of Object.keys(BAWAN) as (keyof Preferensi)[]) {
          if (typeof p[kunci] === "boolean") {
            berikutnya[kunci] = p[kunci] as boolean;
          }
        }
        setNilai(berikutnya);
      })
      .catch(() => {
        // Preferensi gagal dimuat = formulir tetap menampilkan
        // nilai bawaan sesudah muat ulang halaman.
      });
    return () => {
      batal = true;
    };
  }, []);

  async function ubah(kunci: keyof Preferensi, baru: boolean) {
    const lama = nilai;
    setNilai((n) => (n ? { ...n, [kunci]: baru } : n));
    setPesan(null);
    try {
      const res = await fetch("/api/saya/preferensi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kunci]: baru }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPesan(data?.error ?? "Gagal menyimpan preferensi.");
        if (lama) setNilai(lama);
      } else {
        setPesan("Preferensi tersimpan.");
      }
    } catch {
      setPesan("Gagal menyimpan preferensi.");
      if (lama) setNilai(lama);
    }
  }

  if (!nilai) {
    return <p className="artikel-meta-kecil">Memuat preferensi…</p>;
  }

  return (
    <div>
      <p className="artikel-meta-kecil">
        Pilih jenis notifikasi yang mau Anda terima. Mematikan jenis
        berarti kejadian itu tidak lagi menulis notifikasi untuk Anda.
      </p>
      {LABEL.map(({ kunci, teks }) => (
        <label key={kunci} style={{ display: "block", margin: "8px 0" }}>
          <input
            type="checkbox"
            checked={nilai[kunci]}
            onChange={(e) => void ubah(kunci, e.target.checked)}
          />{" "}
          {teks}
        </label>
      ))}
      {pesan ? (
        <p role="status" className="artikel-meta-kecil">
          {pesan}
        </p>
      ) : null}
    </div>
  );
}
