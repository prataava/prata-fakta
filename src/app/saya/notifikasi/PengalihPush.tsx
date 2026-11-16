"use client";

import { useEffect, useState } from "react";

// Pengalih langganan push VAPID (Gelombang B2-D, E3).
// Alur: daftar service worker /sw.js → minta izin Notification
// → pushManager.subscribe (kunci publik dari
// NEXT_PUBLIC_VAPID_PUBLIC_KEY) → POST /api/push/langganan.
// Berhenti: unsubscribe + DELETE /api/push/langganan.
// Bila kunci publik klien belum diatur (push belum
// terkonfigurasi di deploy), komponen menampilkan penjelasan
// jujur, bukan tombol yang tidak berfungsi.
function kunciKeUint8(kunci: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (kunci.length % 4)) % 4);
  const b64 = (kunci + pad).replace(/-/g, "+").replace(/_/g, "/");
  const mentah = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(mentah.length));
  for (let i = 0; i < mentah.length; i++) {
    out[i] = mentah.charCodeAt(i);
  }
  return out;
}

type Status = "memuat" | "tidak-dukung" | "belum-konfigurasi" | "aktif" | "nonaktif";

export default function PengalihPush() {
  const [status, setStatus] = useState<Status>("memuat");
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    async function periksa() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!batal) setStatus("tidak-dukung");
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        if (!batal) setStatus("belum-konfigurasi");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const langganan = reg
          ? await reg.pushManager.getSubscription()
          : null;
        if (!batal) setStatus(langganan ? "aktif" : "nonaktif");
      } catch {
        if (!batal) setStatus("nonaktif");
      }
    }
    void periksa();
    return () => {
      batal = true;
    };
  }, []);

  async function aktifkan() {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const kunciPublik = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!kunciPublik) {
        setStatus("belum-konfigurasi");
        return;
      }
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setPesan("Izin notifikasi tidak diberikan di browser.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const langganan = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: kunciKeUint8(kunciPublik),
      });
      const res = await fetch("/api/push/langganan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: langganan.toJSON() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPesan(data?.error ?? "Gagal menyimpan langganan push.");
        await langganan.unsubscribe().catch(() => undefined);
        return;
      }
      // Aktifkan juga sakelar push_notifikasi agar pengiriman
      // push benar-benar jalan (notifikasi in-app tetap jalan
      // walau push mati).
      await fetch("/api/saya/preferensi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push_notifikasi: true }),
      }).catch(() => undefined);
      setStatus("aktif");
      setPesan("Notifikasi push aktif di perangkat ini.");
    } catch (err) {
      setPesan(
        err instanceof Error
          ? `Gagal mengaktifkan push: ${err.message}`
          : "Gagal mengaktifkan push.",
      );
    } finally {
      setSibuk(false);
    }
  }

  async function nonaktifkan() {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const langganan = reg
        ? await reg.pushManager.getSubscription()
        : null;
      if (langganan) {
        await fetch("/api/push/langganan", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: langganan.endpoint }),
        }).catch(() => undefined);
        await langganan.unsubscribe().catch(() => undefined);
      }
      await fetch("/api/saya/preferensi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push_notifikasi: false }),
      }).catch(() => undefined);
      setStatus("nonaktif");
      setPesan("Notifikasi push dimatikan di perangkat ini.");
    } catch {
      setPesan("Gagal mematikan push. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  if (status === "memuat") {
    return <p className="artikel-meta-kecil">Memeriksa dukungan push…</p>;
  }
  if (status === "tidak-dukung") {
    return (
      <p className="artikel-meta-kecil">
        Browser ini tidak mendukung notifikasi push. Notifikasi in-app di
        halaman ini tetap berfungsi.
      </p>
    );
  }
  if (status === "belum-konfigurasi") {
    return (
      <p className="artikel-meta-kecil">
        Push belum terkonfigurasi di server (kunci VAPID deploy belum
        diatur). Notifikasi in-app di halaman ini tetap berfungsi; push
        aktif sesudah koordinator mengatur kunci VAPID.
      </p>
    );
  }
  return (
    <div>
      <p className="artikel-meta-kecil">
        {status === "aktif"
          ? "Push aktif di perangkat ini: ketukan push dikirim saat ada notifikasi baru untuk Anda."
          : "Push belum aktif di perangkat ini. Aktifkan agar ketukan push sampai walau situs tidak dibuka."}
      </p>
      <button
        className="tombol"
        type="button"
        onClick={() => void (status === "aktif" ? nonaktifkan() : aktifkan())}
        disabled={sibuk}
      >
        {sibuk
          ? "Memproses…"
          : status === "aktif"
            ? "Matikan push di perangkat ini"
            : "Aktifkan push di perangkat ini"}
      </button>
      {pesan ? (
        <p role="status" className="artikel-meta-kecil">
          {pesan}
        </p>
      ) : null}
    </div>
  );
}
