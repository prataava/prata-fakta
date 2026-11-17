// Helper langganan push di browser (Tugas 1, v26) — dipakai
// PengalihPush (/saya/notifikasi). Mekanika subscribe /
// unsubscribe dipusatkan di sini agar tidak tersebar di komponen:
//   serviceWorker.register("/sw.js") → pushManager.subscribe
//   (kunci publik NEXT_PUBLIC_VAPID_PUBLIC_KEY) → POST
//   /api/notifications/subscribe → selesai.
// Berhenti: getSubscription() → DELETE /api/notifications/
// subscribe → unsubscribe().
// Izin Notification TIDAK diminta di sini — pemanggil (komponen)
// yang meminta dengan sopan sesudah ketukan tombol; helper ini
// mengembalikan galat bila izin belum granted. Preferensi
// push_notifikasi (/api/saya/preferensi) juga tetap di komponen,
// bukan di sini.
function urlBase64KeUint8(kunci: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (kunci.length % 4)) % 4);
  const b64 = (kunci + pad).replace(/-/g, "+").replace(/_/g, "/");
  const mentah = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(mentah.length));
  for (let i = 0; i < mentah.length; i++) {
    out[i] = mentah.charCodeAt(i);
  }
  return out;
}

export function apakahPushDidukung(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type HasilPush =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Aktifkan push di perangkat ini. Mengembalikan {ok:false}
 * (BUKAN melempar) bila: browser tak mendukung, kunci publik
 * klien belum diatur, izin belum granted, subscribe gagal, atau
 * server menolak menyimpan langganan — pada kasus terakhir
 * langganan browser dibatalkan lagi agar status tidak gantung.
 */
export async function aktifkanPush(): Promise<HasilPush> {
  if (!apakahPushDidukung()) {
    return { ok: false, error: "Browser ini tidak mendukung notifikasi push." };
  }
  const kunciPublik = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!kunciPublik) {
    return {
      ok: false,
      error: "Push belum terkonfigurasi di server (kunci VAPID belum diatur).",
    };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, error: "Izin notifikasi belum diberikan." };
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const langganan = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64KeUint8(kunciPublik),
    });
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(langganan.toJSON()),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      await langganan.unsubscribe().catch(() => undefined);
      return {
        ok: false,
        error: data?.error ?? "Gagal menyimpan langganan push.",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Gagal mengaktifkan push: ${err.message}`
          : "Gagal mengaktifkan push.",
    };
  }
}

/**
 * Matikan push di perangkat ini: hapus langganan dari server
 * (DELETE diabaikan bila gagal — sama seperti perilaku lama)
 * lalu unsubscribe di browser. {ok:false} hanya bila
 * getSubscription/unsubscribe-nya sendiri yang gagal.
 */
export async function matikanPush(): Promise<HasilPush> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const langganan = reg ? await reg.pushManager.getSubscription() : null;
    if (langganan) {
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: langganan.endpoint }),
      }).catch(() => undefined);
      await langganan.unsubscribe().catch(() => undefined);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal mematikan push. Coba lagi." };
  }
}
