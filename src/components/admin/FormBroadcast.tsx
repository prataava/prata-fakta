"use client";

import { useState, type FormEvent } from "react";
import DialogKonfirmasi from "@/components/admin/DialogKonfirmasi";

// Form broadcast push (super_admin): kirim notifikasi ke SEMUA perangkat
// berlangganan lewat POST /api/admin/notifikasi/kirim, atau kirim satu
// ketukan uji ke perangkat sendiri lewat POST /api/push/uji (tanpa isi —
// route uji mengirim push tanpa payload ke langganan pemanggil).
// Konfirmasi memakai DialogKonfirmasi (Radix, dalam-halaman) — BUKAN
// dialog bawaan browser: dialog bawaan ditolak otomatisasi (pelajaran
// tombol "Terbitkan", 17 Nov 2026). Validasi lokal mengikuti validasi
// server broadcast (judul 1–200, isi 1–500, url path same-origin,
// bukan "//"); jalur uji tidak butuh judul/isi.
// Catatan jujur: broadcast MENGABAIKAN preferensi push_notifikasi per
// pengguna (aksi admin eksplisit); opt-out = berhenti berlangganan
// di /saya/notifikasi.
type AksiBroadcast = "broadcast" | "uji";

export default function FormBroadcast({
  jumlahLangganan,
}: {
  /** Jumlah perangkat berlangganan saat ini (null = belum tersedia). */
  jumlahLangganan: number | null;
}) {
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [url, setUrl] = useState("/");
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "sukses"
  >("idle");
  const [pesan, setPesan] = useState("");
  const [dialogAksi, setDialogAksi] = useState<AksiBroadcast | null>(null);

  function validasiBroadcast(): string | null {
    const j = judul.trim();
    const b = isi.trim();
    const u = url.trim();
    if (!j || j.length > 200) return "Judul wajib 1–200 karakter.";
    if (!b || b.length > 500) return "Isi wajib 1–500 karakter.";
    if (u && (!u.startsWith("/") || u.startsWith("//") || u.length > 500))
      return "Tautan harus path same-origin (diawali \"/\", bukan \"//\").";
    return null;
  }

  /** Submit broadcast: validasi dulu, baru buka dialog konfirmasi. */
  function mintaBroadcast(e: FormEvent) {
    e.preventDefault();
    const galat = validasiBroadcast();
    if (galat) {
      setStatus("error");
      setPesan(galat);
      return;
    }
    setStatus("idle");
    setPesan("");
    setDialogAksi("broadcast");
  }

  /** Tombol uji: tanpa validasi judul/isi, langsung buka dialog. */
  function mintaUji() {
    setStatus("idle");
    setPesan("");
    setDialogAksi("uji");
  }

  async function kirim() {
    const aksi = dialogAksi;
    if (!aksi) return;
    setDialogAksi(null);
    setStatus("loading");
    setPesan("");
    try {
      const endpoint =
        aksi === "broadcast"
          ? "/api/admin/notifikasi/kirim"
          : "/api/push/uji";
      const body =
        aksi === "broadcast"
          ? { title: judul.trim(), body: isi.trim(), url: url.trim() || "/" }
          : undefined;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: {
        ok?: boolean;
        success?: boolean;
        error?: string;
        broadcasted?: number;
        gagal?: number;
        dihapus?: number;
        terkirim?: number;
        terkonfigurasi?: boolean;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false || data.success === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal (${res.status}). Coba lagi.`);
        return;
      }
      setStatus("sukses");
      if (aksi === "broadcast") {
        setPesan(
          `Broadcast terkirim ke ${data.broadcasted ?? 0} perangkat · ${data.gagal ?? 0} gagal · ${data.dihapus ?? 0} langganan mati dihapus.`,
        );
      } else {
        setPesan(
          `Uji terkirim ke ${data.terkirim ?? 0} perangkat Anda · ${data.dihapus ?? 0} langganan mati dihapus.`,
        );
      }
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <>
      <form
        className="formulir"
        style={{ maxWidth: "100%" }}
        onSubmit={mintaBroadcast}
      >
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
        {jumlahLangganan === null ? (
          <p className="artikel-meta-kecil">
            Jumlah langganan belum tersedia.
          </p>
        ) : jumlahLangganan === 0 ? (
          <p className="pesan-error" role="alert">
            Belum ada perangkat berlangganan — broadcast akan terkirim ke 0
            perangkat. Minta pengguna menyalakan notifikasi di
            /saya/notifikasi dulu.
          </p>
        ) : (
          <p className="artikel-meta-kecil">
            {jumlahLangganan} perangkat berlangganan akan menerima broadcast
            ini.
          </p>
        )}
        <label>
          Judul
          <input
            type="text"
            required
            maxLength={200}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Judul notifikasi (maks 200 karakter)"
          />
        </label>
        <label>
          Isi
          <textarea
            required
            maxLength={500}
            rows={3}
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            placeholder="Isi notifikasi (maks 500 karakter)"
          />
        </label>
        <label>
          Tautan saat diklik (opsional)
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/"
          />
        </label>
        <p className="artikel-meta-kecil">
          Broadcast adalah aksi admin eksplisit — preferensi push per pengguna
          tidak diperiksa; berhenti berlangganan adalah opt-out-nya.
        </p>
        <div className="admin-aksi">
          <button
            className="tombol tombol-primer"
            type="submit"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Mengirim…" : "Kirim broadcast ke semua"}
          </button>
          <button
            className="tombol"
            type="button"
            disabled={status === "loading"}
            onClick={mintaUji}
          >
            Kirim uji ke saya
          </button>
        </div>
      </form>
      <DialogKonfirmasi
        terbuka={dialogAksi !== null}
        judul={dialogAksi === "uji" ? "Kirim uji push?" : "Kirim broadcast?"}
        pesan={
          dialogAksi === "uji"
            ? "Kirim satu ketukan push uji ke perangkat Anda sendiri?"
            : `Kirim “${judul.trim()}” ke ${jumlahLangganan ?? "?"} perangkat berlangganan?`
        }
        labelKonfirmasi={
          dialogAksi === "uji" ? "Ya, kirim uji" : "Ya, kirim broadcast"
        }
        sibuk={status === "loading"}
        onKonfirmasi={() => void kirim()}
        onTutup={() => setDialogAksi(null)}
      />
    </>
  );
}
