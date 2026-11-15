"use client";

import { useEffect, useState } from "react";

type Preferensi = {
  digest_harian: boolean;
  notifikasi_topik: boolean;
  notifikasi_koreksi: boolean;
  tampilkan_profil_publik: boolean;
};

const LABEL: { kunci: keyof Preferensi; label: string; keterangan: string }[] = [
  {
    kunci: "digest_harian",
    label: "Digest harian",
    keterangan: "Terima ringkasan harian dari topik yang Anda ikuti.",
  },
  {
    kunci: "notifikasi_topik",
    label: "Notifikasi topik",
    keterangan: "Beri tahu saya bila ada perkembangan pada topik yang saya ikuti.",
  },
  {
    kunci: "notifikasi_koreksi",
    label: "Notifikasi koreksi",
    keterangan: "Beri tahu saya bila artikel yang saya baca atau laporkan dikoreksi.",
  },
  {
    kunci: "tampilkan_profil_publik",
    label: "Tampilkan profil secara publik",
    keterangan: "Izinkan profil saya terlihat pengguna lain (nonaktif secara default).",
  },
];

// Formulir preferensi My Prata (GET/PATCH /api/saya/preferensi).
// Disimpan per akun di pf_user_preferences (migrasi v8).
export default function FormPengaturan() {
  const [preferensi, setPreferensi] = useState<Preferensi | null>(null);
  const [siap, setSiap] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">(
    "idle",
  );
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    fetch("/api/saya/preferensi")
      .then((r) => r.json())
      .then((data: { ok?: boolean; preferensi?: Preferensi; error?: string }) => {
        if (data.ok && data.preferensi) {
          setPreferensi(data.preferensi);
        } else {
          setStatus("error");
          setPesan(data.error ?? "Preferensi belum dapat dimuat.");
        }
      })
      .catch(() => {
        setStatus("error");
        setPesan("Tidak dapat terhubung ke server. Coba lagi.");
      })
      .finally(() => setSiap(true));
  }, []);

  async function simpan(kunci: keyof Preferensi, nilai: boolean) {
    if (!preferensi) return;
    const sebelumnya = preferensi[kunci];
    setPreferensi({ ...preferensi, [kunci]: nilai });
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/saya/preferensi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kunci]: nilai }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        preferensi?: Preferensi;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preferensi) {
        setPreferensi({ ...preferensi, [kunci]: sebelumnya });
        setStatus("error");
        setPesan(data.error ?? "Preferensi gagal disimpan.");
        return;
      }
      setPreferensi(data.preferensi);
      setStatus("sukses");
      setPesan("Preferensi tersimpan.");
    } catch {
      setPreferensi({ ...preferensi, [kunci]: sebelumnya });
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  async function ekspor() {
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/saya/ekspor");
      const data = (await res.json()) as { ok?: boolean; error?: string; data?: unknown };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Ekspor gagal. Coba lagi.");
        return;
      }
      const blob = new Blob([JSON.stringify(data.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prata-fakta-data-saya.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("sukses");
      setPesan("Data Anda berhasil diekspor sebagai JSON.");
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  if (!siap) {
    return (
      <div className="kartu-form">
        <div className="kerangka" aria-label="Memuat pengaturan…" />
      </div>
    );
  }

  if (!preferensi) {
    return (
      <div className="kartu-form">
        <p className="pesan-error" role="alert">
          {pesan || "Preferensi belum dapat dimuat."}
        </p>
      </div>
    );
  }

  return (
    <div className="kartu-form">
      {status === "sukses" && pesan && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      {status === "error" && pesan && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      <h2>Notifikasi &amp; digest</h2>
      <div style={{ display: "grid", gap: 16, margin: "12px 0 24px" }}>
        {LABEL.map((item) => (
          <label
            key={item.kunci}
            style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
          >
            <input
              type="checkbox"
              checked={preferensi[item.kunci]}
              disabled={status === "loading"}
              onChange={(e) => simpan(item.kunci, e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong>{item.label}</strong>
              <br />
              <span style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
                {item.keterangan}
              </span>
            </span>
          </label>
        ))}
      </div>

      <h2>Data saya</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Unduh seluruh data akun Anda (preferensi, bookmark, riwayat baca,
        skor kuis, topik diikuti, notifikasi, dan pertanyaan) sebagai
        berkas JSON. Hanya data milik Anda yang diekspor.
      </p>
      <button
        type="button"
        className="tombol tombol-primer"
        onClick={ekspor}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menyiapkan…" : "Ekspor data saya (JSON)"}
      </button>
      <p style={{ marginTop: 20, fontSize: "0.88rem", color: "var(--muted)" }}>
        Penghapusan akun: penghapusan mandiri tersedia setelah backend admin
        siap (Fase 5). Sementara ini, ajukan penghapusan lewat email redaksi
        yang tercantum di halaman Kebijakan Privasi.
      </p>
    </div>
  );
}
