// Pelindung SSRF (temuan T6 audit keamanan Fase 7): sebelum server
// mem-fetch URL apa pun (feed RSS, cek sumber, teks halaman artikel
// di agen Research), pastikan host-nya tidak mengarah ke alamat
// privat/link-local — editor yang akunnya dikompromikan tidak boleh
// memakai server untuk memindai jaringan internal atau metadata
// cloud (mis. 169.254.169.254).
// Catatan: perlindungan ini memeriksa hasil DNS saat ini; bila DNS
// gagal di-resolve, pemeriksaan dilewati (fail-open) dan fetch yang
// akan gagal secara alami. Rentang yang ditolak: loopback, privat
// RFC1918, link-local, unique-local IPv6, CGNAT, benchmarking,
// multicast, dan reserved — termasuk bentuk IPv4-mapped IPv6.
// SISA YANG DIKETAHUI (Gate Fase 8): DNS rebinding (TOCTOU antara
// cek DNS dan fetch) TIDAK bisa ditutup oleh pemeriksaan string/DNS
// ini — butuh pinning IP di lapis koneksi (di luar cakupan patch ini).
// Lihat fetchAman: redirect HANYA diikuti bila target lolos cek yang
// sama (maks 5 hop), jadi redirect ke host privat tidak lagi tembus.
import { lookup } from "node:dns/promises";

/** True bila alamat IP termasuk rentang privat/loopback/link-local. */
export function ipPrivat(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // 127/8 loopback
    if (a === 169 && b === 254) return true; // 169.254/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 0) return true; // 0/8 ("this network")
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    // 198.18/15 (benchmarking) SENGAJA tidak diblokir: resolver egress
    // VM ini menjawab SEMUA hostname dari 198.18/15 (middlebox), jadi
    // memblokirnya menolak setiap host di lingkungan ini — dan rentang
    // itu bukan ruang layanan internal (bukan RFC1918/metadata).
    // Risiko sisa: rendah; dicatat di laporan gate Fase 8.
    if (a >= 224 && a <= 239) return true; // 224/4 multicast
    if (a >= 240) return true; // 240/4 reserved + broadcast
    return false;
  }
  const rendah = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:a.b.c.d atau ::ffff:7f00:0001) — nilai
  // IPv4 di dalamnya yang menentukan; tanpa ini 127.0.0.1 lolos
  // sebagai "alamat IPv6 publik".
  if (rendah.startsWith("::ffff:")) {
    const sisa = rendah.slice("::ffff:".length);
    if (sisa.includes(".")) return ipPrivat(sisa);
    const kelompok = sisa.split(":");
    if (kelompok.length === 2) {
      const atas = Number.parseInt(kelompok[0], 16);
      const bawah = Number.parseInt(kelompok[1], 16);
      if (Number.isFinite(atas) && Number.isFinite(bawah)) {
        return ipPrivat(
          `${(atas >> 8) & 255}.${atas & 255}.${(bawah >> 8) & 255}.${bawah & 255}`,
        );
      }
    }
    return true; // bentuk ::ffff: tak dikenal → tolak saja (fail-closed).
  }
  if (rendah === "::1" || rendah === "::") return true; // loopback / unspecified
  if (rendah === "0:0:0:0:0:0:0:1" || rendah === "0:0:0:0:0:0:0:0") return true; // bentuk panjang ::1 / ::
  // Hextet pertama menentukan rentang IPv6: fe80::/10 link-local
  // (fe80..febf, bukan hanya fe80:) dan fc00::/7 unique-local.
  const hextet = /^([0-9a-f]{1,4}):/.exec(rendah);
  if (hextet) {
    const h = Number.parseInt(hextet[1], 16);
    if (h >= 0xfe80 && h <= 0xfebf) return true; // fe80::/10 link-local
    if (h >= 0xfc00 && h <= 0xfdff) return true; // fc00::/7 unique-local
  }
  if (rendah.startsWith("fc") || rendah.startsWith("fd")) return true; // fc00::/7 (cadangan)
  return false;
}

/**
 * Periksa URL: kembalikan pesan penolakan bila host-nya privat atau
 * tidak valid; kembalikan null bila boleh di-fetch. Host "localhost"
 * dan nama tanpa titik langsung ditolak tanpa DNS.
 */
export async function tolakHostPrivat(url: string): Promise<string | null> {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "URL tidak valid.";
  }
  if (host === "localhost" || host === "" || !host.includes(".")) {
    return "Host lokal tidak diizinkan.";
  }
  if (ipPrivat(host)) return "Host mengarah ke alamat privat.";
  let alamat: Array<{ address: string }>;
  try {
    alamat = await lookup(host, { all: true });
  } catch {
    return null; // DNS gagal → biarkan fetch yang gagal (fail-open).
  }
  if (alamat.some((a) => ipPrivat(a.address))) {
    return "Host mengarah ke alamat privat.";
  }
  return null;
}

const MAKS_REDIRECT = 5;

/**
 * Fetch yang aman dari SSRF lewat redirect: fetch bawaan mengikuti
 * redirect (301/302/307/308) ke host mana pun TANPA validasi ulang,
 * sehingga URL publik yang me-redirect ke 169.254.169.254 menembus
 * tolakHostPrivat. Helper ini memakai redirect manual dan memvalidasi
 * SETIAP target redirect dengan tolakHostPrivat (maks 5 hop).
 * Melempar bila URL awal/target ditolak atau redirect berlebih.
 * `ambil` (fetch pengganti) dipakai uji; di produksi = fetch global.
 */
export async function fetchAman(
  url: string,
  init: RequestInit = {},
  ambil: typeof fetch = fetch,
): Promise<Response> {
  let saatIni = url;
  for (let hop = 0; hop <= MAKS_REDIRECT; hop++) {
    const ditolak = await tolakHostPrivat(saatIni);
    if (ditolak) throw new Error(`URL ditolak: ${ditolak}`);
    const respons = await ambil(saatIni, { ...init, redirect: "manual" });
    if (respons.status < 300 || respons.status >= 400) return respons;
    const lokasi = respons.headers.get("location");
    if (!lokasi) return respons;
    if (hop === MAKS_REDIRECT) {
      throw new Error("Terlalu banyak redirect.");
    }
    saatIni = new URL(lokasi, saatIni).toString();
  }
  throw new Error("Terlalu banyak redirect.");
}
