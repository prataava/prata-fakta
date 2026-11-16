// Pengambil + parser feed RSS/Atom untuk PRATA FAKTA.
// Hanya memakai Node built-in (fetch global) — tanpa library XML.
// Hak cipta: yang disimpan hanya metadata + ringkasan sumber + URL;
// JANGAN pernah menyalin isi penuh artikel media lain ke database.
import { fetchAman, tolakHostPrivat } from "./ssrf.ts";
import { tolakHostFeed, tolakHostFeedAman } from "./feed-allowlist.ts";

export interface ItemMentah {
  url: string;
  judul: string;
  ringkasan: string;
  isiRingkas: string;
  penulis: string | null;
  waktuTerbit: Date | null;
  guid: string | null;
  gambarUrl: string | null;
  kategoriFeed: string[];
  // Metadata tambahan dari sumber (mis. GDELT: domain, bahasa, negara).
  metadata?: Record<string, unknown>;
}

export interface OpsiFetchRss {
  timeoutMs?: number;
  // fetch pengganti (untuk pengujian / fallback curl di dry-run).
  fetchFn?: typeof fetch;
  // Lewati allowlist host feed — HANYA untuk uji dengan fetch mock
  // (sumber sintetis contoh.test di scripts/uji-ingestion.mjs).
  // JANGAN PERNAH diisi di jalur produksi: allowlist adalah
  // pertahanan lapis-2 SSRF untuk ingestion (Tahap 13B).
  lewatiAllowlist?: boolean;
}

export interface HasilFetchRss {
  items: ItemMentah[];
  httpStatus: number;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0";

const BATAS_RINGKASAN = 1000;
const BATAS_ISI_RINGKAS = 3000;

// ---------- Pembersih teks ----------

// Decode entitas HTML yang umum + entitas numerik (desimal & heksadesimal).
export function decodeEntitas(teks: string): string {
  return teks
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const kode = parseInt(hex, 16);
      return Number.isNaN(kode) ? _m : String.fromCodePoint(kode);
    })
    .replace(/&#(\d+);/g, (_m, des: string) => {
      const kode = parseInt(des, 10);
      return Number.isNaN(kode) ? _m : String.fromCodePoint(kode);
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Buang semua tag HTML, lalu rapikan spasi.
export function bersihkanHtml(teks: string): string {
  const tanpaTag = decodeEntitas(teks).replace(/<[^>]*>/g, " ");
  return tanpaTag.replace(/\s+/g, " ").trim();
}

function potong(teks: string, batas: number): string {
  return teks.length > batas ? teks.slice(0, batas) : teks;
}

// ---------- Parser XML toleran (tanpa library) ----------

// Ambil isi tag <nama>...</nama> (dengan CDATA bila ada) dari sebuah blok.
function ambilTag(blok: string, namaTag: string): string | null {
  const lolos = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolos}(?:\\s[^>]*)?>([\\s\\S]*?)</${lolos}>`,
    "i",
  );
  const cocok = blok.match(pola);
  if (!cocok) return null;
  let isi = cocok[1].trim();
  const cdata = isi.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) isi = cdata[1];
  return isi.trim();
}

// Ambil semua isi tag <nama>...</nama>.
function ambilSemuaTag(blok: string, namaTag: string): string[] {
  const lolos = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolos}(?:\\s[^>]*)?>([\\s\\S]*?)</${lolos}>`,
    "gi",
  );
  const hasil: string[] = [];
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(blok)) !== null) {
    let isi = cocok[1].trim();
    const cdata = isi.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
    if (cdata) isi = cdata[1];
    const bersih = decodeEntitas(isi).trim();
    if (bersih) hasil.push(bersih);
  }
  return hasil;
}

// Ambil nilai atribut dari sebuah tag pembuka, mis. <link href="..."/> atau
// <media:thumbnail url="..."/>.
function ambilAtribut(blok: string, namaTag: string, atribut: string): string | null {
  const lolosTag = namaTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lolosAt = atribut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pola = new RegExp(
    `<${lolosTag}(?:\\s[^>]*?)?\\s${lolosAt}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const cocok = blok.match(pola);
  if (!cocok) return null;
  return decodeEntitas((cocok[1] ?? cocok[2] ?? "").trim()) || null;
}

function parseTanggal(teks: string | null): Date | null {
  if (!teks) return null;
  const tanggal = new Date(teks.trim());
  return Number.isNaN(tanggal.getTime()) ? null : tanggal;
}

// Parse satu blok <item> RSS 2.0 atau <entry> Atom menjadi ItemMentah.
// Mengembalikan null bila blok tidak punya url maupun judul yang berguna.
function parseSatuItem(blok: string): ItemMentah | null {
  // Tautan: RSS memakai teks <link>; Atom memakai atribut href.
  let url = ambilAtribut(blok, "link", "href");
  if (!url) {
    const teksLink = ambilTag(blok, "link");
    if (teksLink) url = decodeEntitas(teksLink).trim();
  }
  // Atom kadang menaruh tautan alternatif di <link rel="alternate" href>.
  if (!url) {
    const semuaLink = blok.match(/<link[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi);
    if (semuaLink) {
      for (const tag of semuaLink) {
        const href = tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        if (href && (href[1] || href[2])) {
          url = decodeEntitas(href[1] || href[2] || "").trim();
          break;
        }
      }
    }
  }

  const judulMentah = ambilTag(blok, "title");
  const judul = judulMentah ? bersihkanHtml(judulMentah) : "";

  if (!url && !judul) return null;

  const deskripsiMentah =
    ambilTag(blok, "description") ?? ambilTag(blok, "summary") ?? "";
  const kontenMentah =
    ambilTag(blok, "content:encoded") ?? ambilTag(blok, "content") ?? "";
  const ringkasan = potong(bersihkanHtml(deskripsiMentah), BATAS_RINGKASAN);
  const isiRingkas = potong(bersihkanHtml(kontenMentah), BATAS_ISI_RINGKAS);

  const tanggalMentah =
    ambilTag(blok, "pubDate") ??
    ambilTag(blok, "published") ??
    ambilTag(blok, "updated") ??
    ambilTag(blok, "dc:date") ??
    null;
  const waktuTerbit = parseTanggal(tanggalMentah);

  const penulisMentah =
    ambilTag(blok, "dc:creator") ?? ambilTag(blok, "author") ?? null;
  // <author><name>...</name></author> pada Atom.
  let penulis: string | null = null;
  if (penulisMentah) {
    const namaDalam = ambilTag(penulisMentah, "name");
    penulis = bersihkanHtml(namaDalam ?? penulisMentah) || null;
  }

  const guid =
    ambilTag(blok, "guid") ?? ambilTag(blok, "id") ?? null;
  const guidBersih = guid ? decodeEntitas(guid).trim() || null : null;

  const gambarUrl =
    ambilAtribut(blok, "media:thumbnail", "url") ??
    ambilAtribut(blok, "media:content", "url") ??
    ambilAtribut(blok, "enclosure", "url") ??
    null;

  const kategoriFeed = ambilSemuaTag(blok, "category");

  return {
    url: url ?? "",
    judul,
    ringkasan,
    isiRingkas,
    penulis,
    waktuTerbit,
    guid: guidBersih,
    gambarUrl,
    kategoriFeed,
  };
}

// Parse XML feed (RSS 2.0 <item> atau Atom <entry>) menjadi daftar item.
// Satu item rusak tidak boleh menggagalkan seluruh feed.
export function parseRss(xml: string): ItemMentah[] {
  const hasil: ItemMentah[] = [];
  const polaItem = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
  let cocok: RegExpExecArray | null;
  while ((cocok = polaItem.exec(xml)) !== null) {
    const blok = cocok[2];
    try {
      const item = parseSatuItem(blok);
      if (item) hasil.push(item);
    } catch {
      // Satu item rusak dilewati; feed tetap diproses.
      continue;
    }
  }
  return hasil;
}

// Ambil satu feed RSS/Atom lewat HTTP dan parse isinya.
export async function fetchRss(
  url: string,
  opsi: OpsiFetchRss = {},
): Promise<HasilFetchRss> {
  const timeoutMs = opsi.timeoutMs ?? 10000;
  // Pelindung SSRF (Fase 7): tolak host privat sebelum fetch.
  // fetchFn kustom (dipakai uji) tetap melewati pemeriksaan ini —
  // URL yang sama akan ditolak baik di produksi maupun di uji.
  const ditolak = await tolakHostPrivat(url);
  if (ditolak) throw new Error(`Feed ditolak: ${ditolak}`);
  // Tahap 13B (T6, lapis 2): feed ingestion HANYA dari host di
  // allowlist (feed-allowlist.ts) — berlaku juga untuk target
  // redirect (periksaHost diteruskan ke fetchAman untuk semua hop).
  // lewatiAllowlist HANYA untuk uji mock; produksi selalu memeriksa.
  if (!opsi.lewatiAllowlist) {
    const ditolakAllowlist = tolakHostFeed(url);
    if (ditolakAllowlist) throw new Error(`Feed ditolak: ${ditolakAllowlist}`);
  }
  const ambil = opsi.fetchFn ?? fetch;
  let respons: Response;
  try {
    // Gate Fase 8 (T6): fetchAman, bukan fetch mentah — redirect ke
    // host privat ditolak di tiap hop, bukan hanya URL awal.
    respons = await fetchAman(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
      ambil,
      opsi.lewatiAllowlist
        ? {}
        : {
            periksaHost: tolakHostFeedAman,
            periksaHopLanjutan: tolakHostFeedAman,
          },
    );
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal mengambil feed ${url}: ${pesan}`);
  }
  if (!respons.ok) {
    throw new Error(
      `Gagal mengambil feed ${url}: HTTP ${respons.status}`,
    );
  }
  const xml = await respons.text();
  const items = parseRss(xml);
  return { items, httpStatus: respons.status };
}
