// Pelindung SSRF (temuan T6 audit keamanan Fase 7): sebelum server
// mem-fetch URL apa pun (feed RSS, cek sumber), pastikan host-nya
// tidak mengarah ke alamat privat/link-local — editor yang akunnya
// dikompromikan tidak boleh memakai server untuk memindai jaringan
// internal atau metadata cloud (mis. 169.254.169.254).
// Catatan: perlindungan ini memeriksa hasil DNS saat ini; bila DNS
// gagal di-resolve, pemeriksaan dilewati (fail-open) dan fetch yang
// akan gagal secara alami. Rentang yang ditolak: loopback, privat
// RFC1918, link-local, dan unique-local IPv6.
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
    if (a === 0) return true; // 0/8
    return false;
  }
  const rendah = ip.toLowerCase();
  if (rendah === "::1") return true;
  if (rendah.startsWith("fe80:")) return true; // fe80::/10 link-local
  if (rendah.startsWith("fc") || rendah.startsWith("fd")) return true; // fc00::/7 unique-local
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
