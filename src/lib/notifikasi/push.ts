// Pengiriman push VAPID (Gelombang B2-D, E3) — TANPA dependensi
// berbayar dan TANPA pustaka push eksternal: JWT ES256 ditandatangani
// dengan node:crypto, pengiriman lewat fetch biasa ke endpoint
// langganan. Push dikirim TANPA body terenkripsi (payload-less):
// service worker menerima "ketukan" lalu mengambil notifikasi
// terbaru dari /api/notifikasi — jadi tidak ada enkripsi
// aes128gcm yang harus diimplementasikan, dan tidak ada isi
// pribadi yang transit lewat layanan push pihak ketiga.
//
// KONFIGURASI DEPLOY (bukan di repo — JANGAN hardcode/generate
// diam-diam di repo):
//   VAPID_PUBLIC_KEY  — kunci publik base64url (format keluaran
//                        `npx web-push generate-vapid-keys`)
//   VAPID_PRIVATE_KEY — kunci privat base64url (format yang sama)
//   VAPID_SUBJECT     — kontak pemilik, mis. "mailto:admin@prata.id"
// Nama publik punya ALTERNATIF (v26, 17 Nov 2026):
// NEXT_PUBLIC_VAPID_PUBLIC_KEY — varian yang sama, dipakai klien
// browser (PengalihPush) dan sudah tersimpan di .env.local.
// Server menerima salah satu dari keduanya (ambilKunciPublikVapid
// di bawah) agar kunci yang sama tidak perlu diduplikasi di
// deploy; Bila ketiganya belum diatur, pengiriman push dilewati
// diam-diam (notifikasi in-app tetap jalan) dan GET
// /api/push/langganan melaporkan terkonfigurasi: false. Generate
// kunci sekali di mesin deploy — butuh
// `npx web-push generate-vapid-keys` (instalasi sekali di sisi
// koordinator, bukan di repo ini).
import { createPrivateKey, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ENV_VAPID_PUBLIC = "VAPID_PUBLIC_KEY";
export const ENV_VAPID_PUBLIC_ALTERNATIF = "NEXT_PUBLIC_VAPID_PUBLIC_KEY";
export const ENV_VAPID_PRIVATE = "VAPID_PRIVATE_KEY";
export const ENV_VAPID_SUBJECT = "VAPID_SUBJECT";

/**
 * Kunci publik VAPID yang dipakai server: nama kanonik
 * VAPID_PUBLIC_KEY, jatuh ke NEXT_PUBLIC_VAPID_PUBLIC_KEY bila
 * tidak ada (kunci yang sama — varian NEXT_PUBLIC_ dibaca server
 * Next.js juga). null bila keduanya kosong.
 */
export function ambilKunciPublikVapid(): string | null {
  return (
    process.env[ENV_VAPID_PUBLIC] ||
    process.env[ENV_VAPID_PUBLIC_ALTERNATIF] ||
    null
  );
}

/**
 * Nama env VAPID yang kurang (untuk pesan 503 yang jujur —
 * tanpa membocorkan nilai). Kunci publik dianggap ada bila salah
 * satu dari dua namanya terisi.
 */
export function daftarEnvVapidKurang(): string[] {
  const kurang: string[] = [];
  if (!ambilKunciPublikVapid()) {
    kurang.push(`${ENV_VAPID_PUBLIC} (atau ${ENV_VAPID_PUBLIC_ALTERNATIF})`);
  }
  if (!process.env[ENV_VAPID_PRIVATE]) kurang.push(ENV_VAPID_PRIVATE);
  if (!process.env[ENV_VAPID_SUBJECT]) kurang.push(ENV_VAPID_SUBJECT);
  return kurang;
}

/** true bila ketiga env VAPID terisi (push bisa dikirim). */
export function apakahPushTerkonfigurasi(): boolean {
  return Boolean(
    ambilKunciPublikVapid() &&
      process.env[ENV_VAPID_PRIVATE] &&
      process.env[ENV_VAPID_SUBJECT],
  );
}

function base64urlKeBuffer(masuk: string): Buffer {
  return Buffer.from(masuk, "base64url");
}

function bufferKeBase64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Bangun JWT VAPID (RFC 8292 §2.1): header {typ JWT, alg ES256},
 * klaim {aud: origin endpoint, exp: kini + 12 jam, sub: subject}.
 * Tanda tangan ES256 mentah (R||S, JOSE) lewat node:crypto.
 * Mengembalikan null bila kunci tidak valid / tidak terkonfigurasi.
 */
export function buatJwtVapid(aud: string): string | null {
  const publik = ambilKunciPublikVapid();
  const privat = process.env[ENV_VAPID_PRIVATE];
  const subject = process.env[ENV_VAPID_SUBJECT];
  if (!publik || !privat || !subject) return null;
  try {
    const pubBuf = base64urlKeBuffer(publik);
    const privBuf = base64urlKeBuffer(privat);
    if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) return null;
    if (privBuf.length !== 32) return null;
    const x = pubBuf.subarray(1, 33);
    const y = pubBuf.subarray(33, 65);
    const kunciPrivat = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: bufferKeBase64url(Buffer.from(x)),
        y: bufferKeBase64url(Buffer.from(y)),
        d: bufferKeBase64url(privBuf),
      },
      format: "jwk",
    });
    const header = bufferKeBase64url(
      Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })),
    );
    const klaim = bufferKeBase64url(
      Buffer.from(
        JSON.stringify({
          aud,
          exp: Math.floor(Date.now() / 1000) + 12 * 3600,
          sub: subject,
        }),
      ),
    );
    const data = `${header}.${klaim}`;
    // ES256 = ECDSA P-256 + SHA-256; dsaEncoding ieee-p1363
    // menghasilkan tanda tangan mentah R||S (format JOSE).
    const tanda = sign("sha256", Buffer.from(data, "utf8"), {
      key: kunciPrivat,
      dsaEncoding: "ieee-p1363",
    });
    return `${data}.${bufferKeBase64url(tanda)}`;
  } catch {
    return null;
  }
}

type LanggananPush = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Kirim ketukan push (tanpa payload) ke SEMUA langganan push
 * pengguna. TIDAK PERNAH melempar: gagal kirim per endpoint hanya
 * dicatat; endpoint 404/410 (langganan kedaluwarsa) dihapus dari
 * pf_push_subscriptions. Mengembalikan jumlah endpoint yang
 * menerima (2xx) dan yang dihapus.
 */
export async function kirimPushKePengguna(
  service: SupabaseClient,
  userId: string,
): Promise<{ terkirim: number; dihapus: number; terkonfigurasi: boolean }> {
  const kosong = { terkirim: 0, dihapus: 0, terkonfigurasi: false };
  if (!apakahPushTerkonfigurasi()) return kosong;
  let langganan: LanggananPush[] = [];
  try {
    const { data, error } = await service
      .from("pf_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error || !data) return { ...kosong, terkonfigurasi: true };
    langganan = data as LanggananPush[];
  } catch {
    return { ...kosong, terkonfigurasi: true };
  }
  if (langganan.length === 0) return { ...kosong, terkonfigurasi: true };
  const publik = ambilKunciPublikVapid() as string;
  let terkirim = 0;
  let dihapus = 0;
  for (const s of langganan) {
    try {
      const asal = new URL(s.endpoint).origin;
      const jwt = buatJwtVapid(asal);
      if (!jwt) continue;
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${jwt}, k=${publik}`,
          TTL: "86400",
          Urgency: "normal",
        },
      });
      if (res.status === 404 || res.status === 410) {
        // Langganan kedaluwarsa di sisi layanan push — bersihkan.
        await service
          .from("pf_push_subscriptions")
          .delete()
          .eq("id", s.id);
        dihapus += 1;
      } else if (res.ok) {
        terkirim += 1;
      } else {
        console.error(
          `[push] kirim gagal (${res.status}) ke endpoint ${s.endpoint.slice(0, 60)}…`,
        );
      }
    } catch (err) {
      console.error("[push] galat kirim:", err);
    }
  }
  return { terkirim, dihapus, terkonfigurasi: true };
}
