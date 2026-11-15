"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import TombolAksi from "@/components/admin/TombolAksi";
import type { ScheduledJobAdmin } from "@/lib/admin/data";

// Pengaturan satu scheduled job: ubah jadwal cron + aktif/nonaktif
// (PATCH), dan tombol jalankan ulang (POST jalankan_ulang).
export default function FormJob({ job }: { job: ScheduledJobAdmin }) {
  const [jadwalCron, setJadwalCron] = useState(job.jadwal_cron);
  const [aktif, setAktif] = useState(job.aktif);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/sistem/jobs/${job.nama}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jadwal_cron: jadwalCron.trim(), aktif }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan job (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan("Pengaturan job berhasil disimpan.");
      router.refresh();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {status === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {status === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Jadwal cron
        <input
          type="text"
          required
          value={jadwalCron}
          onChange={(e) => setJadwalCron(e.target.value)}
          placeholder="*/30 * * * *"
        />
      </label>
      <label
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <input
          type="checkbox"
          checked={aktif}
          onChange={(e) => setAktif(e.target.checked)}
        />
        Job aktif
      </label>
      <div className="admin-aksi">
        <button
          className="tombol tombol-primer"
          type="submit"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Menyimpan…" : "Simpan jadwal"}
        </button>
        <TombolAksi
          url={`/api/admin/sistem/jobs/${job.nama}`}
          body={{ aksi: "jalankan_ulang" }}
          label="Jalankan ulang sekarang"
          labelLoading="Menjalankan…"
          konfirmasi={`Jalankan ulang job "${job.nama}" sekarang?`}
        />
      </div>
    </form>
  );
}
