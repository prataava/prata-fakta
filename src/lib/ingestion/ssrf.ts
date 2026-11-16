// Pelindung SSRF (temuan T6 audit keamanan Fase 7; dikeraskan Tahap 13B).
// Sebelum server mem-fetch URL apa pun (feed RSS, cek sumber, teks halaman
// artikel di agen Research), pastikan host-nya tidak mengarah ke alamat
// privat/link-local — editor yang akunnya dikompromikan tidak boleh
// memakai server untuk memindai jaringan internal atau metadata
// cloud (mis. 169.254.169.254).
//
// LAPISAN PERTAHANAN (Tahap 13B) — tidak satu pun mengandalkan yang lain:
//   1. `tolakHostPrivat`: cek DNS per hop (fail-closed bila ada alamat
//      privat; fail-open bila DNS gagal — fetch akan gagal alami).
//   2. Allowlist host KETAT untuk ingestion (`feed-allowlist.ts`):
//      feed RSS/GDELT hanya dari 8 host yang dikenal, termasuk
//      target redirect-nya.
//   3. IP pinning (`fetchTerpin`): koneksi dibuka ke IP yang SUDAH
//      divalidasi (lookup kustom + Host header + SNI = hostname asli),
//      sehingga DNS TIDAK di-resolve ulang oleh fetch — jendela TOCTOU
//      tertutup untuk hop itu.
//   4. Re-resolusi pasca-fetch (`periksaUlangResolusi`): sesudah fetch
//      (jalur fallback / fetch mock), resolve ulang host akhir dan
//      bandingkan dengan IP yang divalidasi sebelum fetch; bila tidak
//      ada irisan, respons DIBUANG — menangkap rebinding yang
//      bertahan sesudah fetch.
//
// SISA CELAH YANG JUJUR (baca sebelum mengklaim "T6 tertutup"):
//   a. Pinning HANYA bekerja bila koneksi TCP langsung ke IP tujuan
//      bisa dibuka. Di VM ini (egress middlebox) koneksi langsung ke
//      IP GAGAL ("socket disconnected before secure TLS connection")
//      — middlebox menjawab DNS dengan 198.18/15 palsu dan merutekan
//      lewat SNI/hostname — sehingga fetchAman JATUH ke fallback
//      (fetch biasa + re-resolusi). Di lingkungan itu TOCTOU hanya
//      DIPERSEMPIT (lapisan 4), tidak tertutup. Di produksi (Vercel,
//      egress langsung) jalur pinning yang dipakai; verifikasi live
//      pinning HTTPS di produksi BELUM dilakukan — koordinator wajib
//      mengujinya sebelum mengklaim T6 tertutup penuh.
//   b. Re-resolusi pasca-fetch tidak menangkap penyerang yang
//      membalik DNS kembali ke IP semula SEBELUM pemeriksaan ulang
//      (jendela milidetik, butuh TTL ~0 + timing presisi) — tetapi
//      penyerang itu harus mengendalikan DNS target DAN menjawab
//      tepat di dua jendela; jauh lebih sulit daripada rebinding
//      satu-kali yang ditutup lapisan 3.
//   c. 198.18/15 (benchmarking) SENGAJA tidak diblokir (lihat
//      ipPrivat): resolver egress VM menjawab SEMUA hostname dari
//      198.18/15, jadi memblokirnya menolak setiap host di lingkungan
//      ini. Rentang itu bukan RFC1918/metadata cloud; risiko sisa
//      rendah dan dicatat di laporan gate Fase 8.
//   d. Fail-open bila DNS gagal dipertahankan (tolakHostPrivat
//      mengembalikan null): host yang tak ter-resolve tidak bisa
//      dinilai; fetch-nya akan gagal secara alami.
//   f. DNS lookup TANPA batas waktu (diperbaiki integrasi B1):
//      lookup() berjalan SEBELUM signal dibuat di fetchTerpin dan
//      resolusiHost tidak menerima signal sama sekali — resolver
//      yang menggantung (mis. middlebox egress VM) menahan
//      ingestion/scheduler selamanya meski pemanggil memberi
//      AbortSignal.timeout(). SEMUA resolve DNS di berkas ini kini
//      dibatasi BATAS_DNS_MS (di bawah); timeout = gagal resolve
//      (fail-open di tolakHostPrivat/resolusiHost, fallback di
//      fetchTerpin), BUKAN gantung.
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

/** Batas waktu SATU resolve DNS (ms). Longgar untuk DNS sehat,
 *  cukup untuk fail-fast bila resolver menggantung — tanpa ini,
 *  fetchAman bisa tertahan selamanya sebelum signal pemanggil
 *  sempat bekerja (temuan integrasi B1: tahap13b §E menggantung
 *  >10 menit di VM karena lookup example.com tak kembali). */
export const BATAS_DNS_MS = 5000;

/** Balapkan satu promise melawan timer; tolak bila timer menang.
 *  Dipakai untuk SEMUA resolve DNS di berkas ini (lookup bawaan
 *  maupun resolver kustom yang disuntik pemanggil). */
async function denganBatasWaktu<T>(
  janji: Promise<T>,
  batasMs: number,
  pesan: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      janji,
      new Promise<never>((_selesai, tolak) => {
        timer = setTimeout(() => tolak(new Error(pesan)), batasMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export interface HasilResolusi {
  host: string;
  alamat: string[];
}

/**
 * Resolve host URL sekali; kembalikan null bila URL tidak valid atau
 * DNS gagal (fail-open di pemanggil — fetch akan gagal alami).
 * Bila host-nya sendiri literal IP, kembalikan literal itu tanpa DNS.
 */
export async function resolusiHost(url: string): Promise<HasilResolusi | null> {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  if (ipPrivat(host)) return { host, alamat: [host] };
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return { host, alamat: [host] };
  if (host.includes(":")) return { host, alamat: [host] };
  try {
    // Lookup dibatasi BATAS_DNS_MS (lihat atas): resolver yang
    // menggantung melempar timeout → null (fail-open), bukan gantung.
    const hasil = await denganBatasWaktu(
      lookup(host, { all: true }),
      BATAS_DNS_MS,
      `DNS ${host} kehabisan waktu (${BATAS_DNS_MS} ms).`,
    );
    return { host, alamat: hasil.map((a) => a.address) };
  } catch {
    return null;
  }
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
  const hasil = await resolusiHost(url);
  if (!hasil) return null; // DNS gagal → biarkan fetch yang gagal (fail-open).
  if (hasil.alamat.some((a) => ipPrivat(a))) {
    return "Host mengarah ke alamat privat.";
  }
  return null;
}

/**
 * Re-resolusi pasca-fetch (lapisan 4): resolve ulang host URL dan
 * bandingkan dengan alamat yang divalidasi SEBELUM fetch.
 * Kembalikan null bila cocok / tidak bisa diperiksa (DNS gagal →
 * fail-open, didokumentasikan), atau pesan penolakan bila TIDAK ADA
 * irisan — artinya DNS berubah di antara validasi dan fetch
 * (kemungkinan rebinding); pemanggil WAJIB membuang respons.
 * Fungsi murni atas resolver yang bisa di-mock — dipakai uji.
 */
export async function periksaUlangResolusi(
  url: string,
  alamatDivalidasi: string[],
  selesaikan: (host: string) => Promise<string[]> = async (host) => {
    const hasil = await lookup(host, { all: true });
    return hasil.map((a) => a.address);
  },
): Promise<string | null> {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "URL tidak valid.";
  }
  let alamatBaru: string[];
  try {
    // Resolver dibatasi BATAS_DNS_MS: yang menggantung → null
    // (fail-open, sama seperti DNS gagal — didokumentasikan).
    alamatBaru = await denganBatasWaktu(
      selesaikan(host),
      BATAS_DNS_MS,
      `DNS ${host} kehabisan waktu (${BATAS_DNS_MS} ms).`,
    );
  } catch {
    return null; // DNS gagal sesudah fetch → tidak bisa membuktikan; fail-open.
  }
  if (alamatBaru.length === 0) return null;
  const irisan = alamatBaru.some((a) => alamatDivalidasi.includes(a));
  if (!irisan) {
    return `DNS host ${host} berubah sesudah fetch (kemungkinan rebinding): respons dibuang.`;
  }
  return null;
}

// ---------- IP pinning (lapisan 3) ----------

export interface OpsiFetchTerpin {
  /** Resolver pengganti — HANYA untuk uji (memetakan host ke IP lokal). */
  penyelesaian?: (host: string) => Promise<string[]>;
  /** Izinkan alamat privat — HANYA untuk uji transport lokal. */
  izinkanPrivat?: boolean;
  /** Batas waktu percobaan koneksi terpin (ms). Default 2000 —
   *  sengaja pendek: bila koneksi langsung ke IP tidak bisa dibuka
   *  (mis. middlebox egress VM yang memutusnya), fetchAman harus
   *  segera jatuh ke fallback + re-resolusi, bukan menghabiskan
   *  anggaran timeout pemanggil (10 dtk/feed). Di produksi yang
   *  egress-nya langsung, connect TLS yang sehat jauh di bawah ini;
   *  bila melebihi batas, fallback tetap aman (re-resolusi). */
  batasMs?: number;
}

/** Gabungkan signal pemanggil dengan batas waktu; null bila keduanya kosong. */
function gabungSignal(
  signal: AbortSignal | null | undefined,
  batasMs: number,
): { signal: AbortSignal | undefined; batal: () => void } {
  if (!signal && !batasMs) return { signal: undefined, batal: () => {} };
  const pengendali = new AbortController();
  const timer = batasMs > 0 ? setTimeout(() => pengendali.abort(), batasMs) : null;
  const teruskan = () => pengendali.abort();
  if (signal) {
    if (signal.aborted) pengendali.abort();
    else signal.addEventListener("abort", teruskan, { once: true });
  }
  return {
    signal: pengendali.signal,
    batal: () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", teruskan);
    },
  };
}

/**
 * Fetch dengan IP pinning memakai stdlib node:http/https SAJA (tanpa
 * dependensi baru): host di-resolve SEKALI ke IP yang sudah divalidasi,
 * lalu koneksi dibuka langsung ke IP itu — DNS tidak di-resolve ulang.
 * Header `Host` = hostname asli dan SNI TLS (`servername`) = hostname
 * asli, sehingga virtual hosting + verifikasi sertifikat tetap
 * memakai nama host, bukan IP.
 *
 * Hanya GET/HEAD. Melempar `URL ditolak: ...` untuk penolakan validasi
 * (JANGAN di-fallback oleh pemanggil) dan error jaringan biasa bila
 * koneksi gagal (pemanggil BOLEH fallback ke fetch biasa + re-resolusi
 * — lihat fetchAman). Mengembalikan Response Web standar.
 */
export async function fetchTerpin(
  url: string,
  init: RequestInit = {},
  opsi: OpsiFetchTerpin = {},
): Promise<Response> {
  let terurai: URL;
  try {
    terurai = new URL(url);
  } catch {
    throw new Error("URL ditolak: URL tidak valid.");
  }
  if (terurai.protocol !== "http:" && terurai.protocol !== "https:") {
    throw new Error("URL ditolak: Hanya http(s) yang diizinkan.");
  }
  const metode = (init.method ?? "GET").toUpperCase();
  if (metode !== "GET" && metode !== "HEAD") {
    throw new Error(`URL ditolak: Metode ${metode} tidak didukung pinning.`);
  }
  const host = terurai.hostname.toLowerCase();
  if (host === "localhost" || host === "" || !host.includes(".")) {
    throw new Error("URL ditolak: Host lokal tidak diizinkan.");
  }
  if (ipPrivat(host) && !opsi.izinkanPrivat) {
    throw new Error("URL ditolak: Host mengarah ke alamat privat.");
  }

  const selesaikan =
    opsi.penyelesaian ??
    (async (h: string) => {
      const hasil = await denganBatasWaktu(
        lookup(h, { all: true }),
        BATAS_DNS_MS,
        `DNS ${h} kehabisan waktu (${BATAS_DNS_MS} ms).`,
      );
      return hasil.map((a) => a.address);
    });
  let alamat: string[];
  try {
    alamat = ipPrivat(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")
      ? [host]
      : await denganBatasWaktu(
          selesaikan(host),
          BATAS_DNS_MS,
          `DNS ${host} kehabisan waktu (${BATAS_DNS_MS} ms).`,
        );
  } catch (err) {
    // Timeout resolve adalah kegagalan JARINGAN (boleh di-fallback
    // pemanggil), BUKAN penolakan validasi "URL ditolak:".
    if (err instanceof Error && err.message.includes("kehabisan waktu")) {
      throw err;
    }
    throw new Error(`URL ditolak: DNS ${host} gagal di-resolve.`);
  }
  if (alamat.length === 0) {
    throw new Error(`URL ditolak: DNS ${host} tidak mengembalikan alamat.`);
  }
  if (!opsi.izinkanPrivat && alamat.some((a) => ipPrivat(a))) {
    throw new Error("URL ditolak: Host mengarah ke alamat privat.");
  }
  const ip = alamat[0];
  const port = terurai.port
    ? Number(terurai.port)
    : terurai.protocol === "https:"
      ? 443
      : 80;
  const jalur = `${terurai.pathname}${terurai.search}` || "/";

  const headerKirim: Record<string, string> = {};
  const headerInit = init.headers as
    | Record<string, string>
    | Array<[string, string]>
    | Headers
    | undefined;
  if (headerInit) {
    if (headerInit instanceof Headers) {
      headerInit.forEach((nilai, nama) => {
        headerKirim[nama] = nilai;
      });
    } else if (Array.isArray(headerInit)) {
      for (const [nama, nilai] of headerInit) headerKirim[nama] = nilai;
    } else {
      Object.assign(headerKirim, headerInit);
    }
  }
  // Host header WAJIB hostname asli (bukan IP) — server virtual-host
  // dan CDN merutekan dari sini. Port non-standar ikut disertakan.
  const hostHeader =
    (terurai.protocol === "https:" && port === 443) ||
    (terurai.protocol === "http:" && port === 80)
      ? terurai.hostname
      : terurai.host;
  headerKirim["host"] = hostHeader;

  const { signal, batal } = gabungSignal(
    init.signal ?? null,
    opsi.batasMs ?? 2000,
  );
  try {
    return await new Promise<Response>((selesai, tolak) => {
      const peminta =
        terurai.protocol === "https:" ? https.request : http.request;
      const req = peminta(
        {
          hostname: ip,
          port,
          path: jalur,
          method: metode,
          headers: headerKirim,
          // SNI = hostname asli: sertifikat diverifikasi terhadap nama
          // host, bukan terhadap IP yang dihubungi.
          ...(terurai.protocol === "https:"
            ? { servername: terurai.hostname }
            : {}),
          signal,
        },
        (res) => {
          const potongan: Buffer[] = [];
          res.on("data", (c: Buffer | string) => {
            potongan.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          });
          res.on("end", () => {
            const headerBalas = new Headers();
            for (const [nama, nilai] of Object.entries(res.headers)) {
              if (nilai === undefined) continue;
              if (Array.isArray(nilai)) {
                for (const v of nilai) headerBalas.append(nama, v);
              } else {
                headerBalas.set(nama, nilai);
              }
            }
            const badan =
              res.statusCode === 204 || res.statusCode === 304
                ? null
                : Buffer.concat(potongan);
            try {
              selesai(
                new Response(badan, {
                  status: res.statusCode ?? 500,
                  headers: headerBalas,
                }),
              );
            } catch (err) {
              tolak(err instanceof Error ? err : new Error(String(err)));
            }
          });
          res.on("error", (err) => {
            tolak(err);
          });
        },
      );
      req.on("error", (err) => {
        tolak(err);
      });
      req.on("timeout", () => {
        req.destroy(new Error("Waktu habis (pinning)."));
      });
      req.end();
    });
  } finally {
    batal();
  }
}

// ---------- fetchAman ----------

const MAKS_REDIRECT = 5;

export interface OpsiFetchAman {
  /** Pemeriksa hop pertama (default: tolakHostPrivat). */
  periksaHost?: (url: string) => Promise<string | null>;
  /** Pemeriksa hop redirect ke-2 dst (default: sama dengan periksaHost). */
  periksaHopLanjutan?: (url: string) => Promise<string | null>;
  /** Coba IP pinning bila memakai fetch global (default true). */
  pinIp?: boolean;
  /** Resolver pengganti untuk pinning — HANYA untuk uji. */
  penyelesaian?: (host: string) => Promise<string[]>;
  /** Izinkan alamat privat pada pinning — HANYA untuk uji transport lokal. */
  izinkanPrivat?: boolean;
}

/**
 * Fetch yang aman dari SSRF lewat redirect: fetch bawaan mengikuti
 * redirect (301/302/307/308) ke host mana pun TANPA validasi ulang,
 * sehingga URL publik yang me-redirect ke 169.254.169.254 menembus
 * tolakHostPrivat. Helper ini memakai redirect manual dan memvalidasi
 * SETIAP target redirect (maks 5 hop).
 * Per hop: validasi → coba pinning IP (fetch global saja) → bila
 * koneksi terpin gagal di jaringan, fallback ke fetch biasa +
 * re-resolusi pasca-fetch (respons dibuang bila DNS berubah).
 * Melempar bila URL awal/target ditolak, DNS berubah sesudah fetch,
 * atau redirect berlebih. `ambil` (fetch pengganti) dipakai uji;
 * di produksi = fetch global.
 */
export async function fetchAman(
  url: string,
  init: RequestInit = {},
  ambil: typeof fetch = fetch,
  opsi: OpsiFetchAman = {},
): Promise<Response> {
  const periksaAwal = opsi.periksaHost ?? tolakHostPrivat;
  const periksaLanjutan =
    opsi.periksaHopLanjutan ?? opsi.periksaHost ?? tolakHostPrivat;
  const pakaiFetchGlobal = ambil === fetch;
  let saatIni = url;
  for (let hop = 0; hop <= MAKS_REDIRECT; hop++) {
    const ditolak = await (hop === 0 ? periksaAwal : periksaLanjutan)(
      saatIni,
    );
    if (ditolak) throw new Error(`URL ditolak: ${ditolak}`);
    const pra = await resolusiHost(saatIni);
    const alamatDivalidasi = pra ? pra.alamat : null;

    let respons: Response | null = null;
    let dipakaiPinning = false;
    if (pakaiFetchGlobal && opsi.pinIp !== false) {
      try {
        respons = await fetchTerpin(
          saatIni,
          { ...init, redirect: "manual" },
          {
            penyelesaian: opsi.penyelesaian,
            izinkanPrivat: opsi.izinkanPrivat,
          },
        );
        dipakaiPinning = true;
      } catch (err) {
        const pesan = err instanceof Error ? err.message : String(err);
        // Penolakan validasi TIDAK boleh di-fallback: host privat
        // tetap privat apa pun transportnya.
        if (pesan.startsWith("URL ditolak:")) throw err;
        // Kegagalan jaringan pada koneksi terpin (mis. middlebox
        // egress VM yang memutus koneksi langsung ke IP) → fallback
        // ke fetch biasa; re-resolusi pasca-fetch di bawah tetap
        // berjalan sebagai jaring pengaman.
        respons = null;
      }
    }
    if (!respons) {
      respons = await ambil(saatIni, { ...init, redirect: "manual" });
    }

    // Re-resolusi pasca-fetch — HANYA untuk jalur non-pinning:
    // jalur pinning sudah terhubung ke IP tervalidasi, jadi tidak
    // ada yang perlu diperiksa ulang (dan host CDN round-robin
    // bisa memberi jawaban berbeda yang sah).
    if (!dipakaiPinning && pakaiFetchGlobal && alamatDivalidasi) {
      const berubah = await periksaUlangResolusi(saatIni, alamatDivalidasi);
      if (berubah) {
        // Buang respons: jangan biarkan pemanggil membaca badan yang
        // mungkin berasal dari host hasil rebinding.
        try {
          await respons.arrayBuffer();
        } catch {
          // Abaikan — penolakan tetap dilempar.
        }
        throw new Error(`URL ditolak: ${berubah}`);
      }
    }

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
