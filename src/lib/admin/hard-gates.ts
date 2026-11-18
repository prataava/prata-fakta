// Hard gates auto-publish — PRATA FAKTA (v27, 18 Nov 2026).
//
// Mandat pemilik 18 Nov 2026: FACT SCORE ≥85 BUKAN berarti berita
// benar. Skor hanya mengukur cakupan independen (A) + kredibilitas
// (B) + konsistensi klaim (C) + rekam koreksi (D) — rumus itu
// TIDAK diubah (src/lib/fact-score.ts). Gate di sini berjalan
// SESUDAH gate skor/toggle/verifikasi di terbitkanOtomatis dan
// SEBELUM status diubah: SATU gate gagal = tetap draft, alasan
// dicatat di detail run pipeline agar masuk antrean review
// manusia (/admin/review). Tidak ada artikel yang lolos gate ini
// tanpa jejak: hasil per gate ikut ditulis ke audit 'artikel.terbit'
// (sesudah.hard_gates) bila akhirnya terbit.
//
// Gate (fail-closed — ragu = jangan terbitkan otomatis):
//   G1 Independensi: ≥2 sumber_id BERBEDA di pf_article_sources
//      untuk klaim utama. Satu outlet yang menyalin berita yang
//      sama = satu sumber (unique artikel_id+sumber_id).
//   G2 Konflik: tidak ada evidence arah 'menentang' dan tidak ada
//      klaim berstatus 'terbantah' untuk artikel ini.
//   G3 Referensi: semua tautan sumber + sumber_url artikel adalah
//      URL https yang strukturnya valid (host tidak kosong).
//      Keterjangkauan LANGSUNG (HTTP GET) sengaja TIDAK diperiksa
//      di sini — fetch saat terbit rapuh/lambat; kesehatan sumber
//      dipantau ingestion (pf_sources.health_status + run
//      ingestion) dan ditampilkan di /admin/ops.
//   G4 Ketertelusuran: periksaKualitasKlaimDraf (K1–K7) diulang
//      dari data DB (bukan dari memori pipeline): tiap angka /
//      kutipan / tanggal di draf harus tertelusur ke klaim +
//      evidence, tiap klaim harus tercantum di draf. Draf yang
//      dibuat sebelum quality-check ada, atau diubah sesudahnya,
//      tertangkap di sini.
//   G5 Kebaruan: tanggal terbit sumber TERBARU ≤ 14 hari dari
//      saat terbit (BATAS_BASI_HARI — sama dengan ambang
//      kedaluwarsa UNCONFIRMED 14 hari di pipeline). Tanpa satu
//      pun tanggal sumber yang diketahui = GAGAL (ragu = jangan
//      terbitkan sebagai berita baru).
//   G6 Sensitif: kategori konflik/geopolitik/hukum ATAU kata kunci
//      konflik/kriminalitas/kesehatan/tuduhan terhadap individu di
//      judul+isi = WAJIB review manusia tanpa memandang skor.
//
// Modul ini pure kecuali evaluasiHardGate (membaca lewat
// AdminAdapter — service client, sudah dijaga guard route).
// Tanpa I/O lain: tanpa fetch, tanpa tanggal dinding tersembunyi
// (parameter `sekarang` bisa diinjeksikan untuk tes).
import {
  normalisasiTanggal,
  periksaKualitasKlaimDraf,
} from "../ai/quality-check.ts";
import type { JenisKlaim } from "../ai/types.ts";
import type {
  AdminAdapter,
  Artikel,
  CatatanVerifikasi,
} from "./types.ts";

/** Umur maksimum sumber terbaru agar draf masih dianggap berita
 *  baru (hari). Sama dengan ambang kedaluwarsa UNCONFIRMED. */
export const BATAS_BASI_HARI = 14;

/** Jumlah sumber independen minimum untuk klaim utama. */
export const MIN_SUMBER_INDEPENDEN = 2;

/** Kategori/subkategori yang selalu butuh review manusia. */
export const KATEGORI_SENSITIF: ReadonlySet<string> = new Set([
  "konflik-internasional",
  "geopolitik",
  "hukum",
]);

/** Kata kunci topik sensitif (dicocokkan per kata, case-insensitive,
 *  di judul + isi). Kelompok: konflik, kriminalitas, kesehatan,
 *  tuduhan terhadap individu. */
export const KATA_KUNCI_SENSITIF: readonly string[] = [
  // Konflik
  "perang",
  "konflik",
  "militer",
  "kudeta",
  "teror",
  "terorisme",
  "pemberontakan",
  "invasi",
  "gencatan senjata",
  // Kriminalitas
  "pembunuhan",
  "pemerkosaan",
  "pelecehan seksual",
  "korupsi",
  "suap",
  "gratifikasi",
  "tersangka",
  "terdakwa",
  "dakwaan",
  "tuntutan",
  "vonis",
  "penculikan",
  "perampokan",
  "penipuan",
  "penggelapan",
  "narkoba",
  // Tuduhan terhadap individu
  "tuduhan",
  "diduga",
  "dituduh",
  "pencemaran nama baik",
  // Kesehatan
  "penyakit",
  "wabah",
  "pandemi",
  "epidemi",
  "vaksin",
  "kanker",
  "diabetes",
  "stroke",
  "hiv",
  "bunuh diri",
  "keracunan",
  "kesehatan",
];

function lepasRegex(teks: string): string {
  return teks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deteksi topik sensitif (pure). Mengembalikan pencetus yang
 * ditemukan (kategori atau kata kunci) agar alasan penolakan bisa
 * menyebutkannya — tanpa menyebut berarti tanpa pencetus.
 */
export function deteksiTopikSensitif(input: {
  kategori_slug: string;
  subkategori_slug?: string | null;
  judul: string;
  isi: string;
}): { sensitif: boolean; pencetus: string[] } {
  const pencetus: string[] = [];
  for (const slug of [input.kategori_slug, input.subkategori_slug ?? ""]) {
    if (slug && KATEGORI_SENSITIF.has(slug)) {
      pencetus.push(`kategori ${slug}`);
    }
  }
  const teks = `${input.judul}\n${input.isi}`.toLowerCase();
  for (const kata of KATA_KUNCI_SENSITIF) {
    const pola = new RegExp(`\\b${lepasRegex(kata)}\\b`, "i");
    if (pola.test(teks)) pencetus.push(`kata kunci "${kata}"`);
  }
  return { sensitif: pencetus.length > 0, pencetus };
}

/** URL referensi valid: https + host tidak kosong. */
export function urlReferensiValid(nilai: string | null | undefined): boolean {
  if (typeof nilai !== "string" || nilai.trim() === "") return false;
  try {
    const u = new URL(nilai.trim());
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}

export interface HasilHardGate {
  lolos: boolean;
  /** Kode gate yang menggagalkan ("G1".."G6"), null bila lolos. */
  gate: string | null;
  alasan: string | null;
  /** Ringkasan per gate (untuk audit log + detail run). */
  rincian: Record<string, { lolos: boolean; detail: string }>;
}

function gagal(
  gate: string,
  alasan: string,
  rincian: Record<string, { lolos: boolean; detail: string }>,
): HasilHardGate {
  return { lolos: false, gate, alasan, rincian };
}

const JENIS_KLAIM_VALID: ReadonlySet<string> = new Set([
  "fakta",
  "angka",
  "kutipan",
  "tanggal",
  "lain",
]);

function jenisKlaimAman(jenis: string): JenisKlaim {
  return (JENIS_KLAIM_VALID.has(jenis) ? jenis : "fakta") as JenisKlaim;
}

/**
 * Evaluasi semua hard gate untuk satu artikel draf. Urutan: G6
 * (murni, tanpa DB) dulu, lalu baca data sekali (sumber + klaim +
 * evidence + tanggal), lalu G1–G5. Gate pertama yang gagal
 * menghentikan evaluasi — alasannya yang dilaporkan.
 */
export async function evaluasiHardGate(
  adapter: AdminAdapter,
  artikel: Artikel,
  verifikasi: CatatanVerifikasi,
  sekarang: Date = new Date(),
): Promise<HasilHardGate> {
  const rincian: Record<string, { lolos: boolean; detail: string }> = {};
  const catat = (gate: string, lolos: boolean, detail: string) => {
    rincian[gate] = { lolos, detail };
  };

  // ---- G6: topik sensitif (tanpa DB) ----
  const sensitif = deteksiTopikSensitif({
    kategori_slug: artikel.kategori_slug,
    subkategori_slug: artikel.subkategori_slug,
    judul: artikel.judul,
    isi: artikel.isi,
  });
  if (sensitif.sensitif) {
    catat(
      "G6",
      false,
      `topik sensitif (${sensitif.pencetus.join(", ")}) — wajib review manusia.`,
    );
    return gagal(
      "G6",
      `topik sensitif (${sensitif.pencetus.join(", ")}) — auto-publish ditahan, butuh persetujuan editor manusia.`,
      rincian,
    );
  }
  catat("G6", true, "bukan topik sensitif.");

  // ---- Baca data gate (sekali) ----
  const rawItemId = verifikasi.raw_item_id;
  const [sumber, klaim, tanggalSumber] = await Promise.all([
    adapter.listSumberArtikel({ artikel_id: artikel.id }),
    adapter.listKlaimArtikel({ artikel_id: artikel.id, raw_item_id: rawItemId }),
    adapter.listTanggalSumberArtikel({
      artikel_id: artikel.id,
      raw_item_id: rawItemId,
    }),
  ]);
  const evidence = await adapter.listEvidenceArtikel({
    klaim_id: klaim.map((k) => k.id),
  });

  // ---- G1: ≥2 sumber independen ----
  const sumberUnik = new Set(sumber.map((s) => s.sumber_id));
  if (sumberUnik.size < MIN_SUMBER_INDEPENDEN) {
    catat(
      "G1",
      false,
      `hanya ${sumberUnik.size} sumber independen (butuh ≥${MIN_SUMBER_INDEPENDEN}).`,
    );
    return gagal(
      "G1",
      `hanya ${sumberUnik.size} sumber independen untuk klaim utama (butuh minimal ${MIN_SUMBER_INDEPENDEN}) — FACT SCORE bukan bukti kebenaran.`,
      rincian,
    );
  }
  catat("G1", true, `${sumberUnik.size} sumber independen.`);

  // ---- G2: tanpa konflik material ----
  const menentang = evidence.filter((e) => e.arah === "menentang");
  const terbantah = klaim.filter((k) => k.status === "terbantah");
  if (menentang.length > 0 || terbantah.length > 0) {
    const bagian = [
      menentang.length > 0
        ? `${menentang.length} evidence menentang`
        : null,
      terbantah.length > 0 ? `${terbantah.length} klaim terbantah` : null,
    ]
      .filter(Boolean)
      .join(", ");
    catat("G2", false, `konflik material belum terselesaikan: ${bagian}.`);
    return gagal(
      "G2",
      `konflik informasi material belum terselesaikan (${bagian}) — butuh review manusia.`,
      rincian,
    );
  }
  catat("G2", true, "tidak ada evidence menentang / klaim terbantah.");

  // ---- G3: referensi valid ----
  const urlBuruk: string[] = [];
  for (const s of sumber) {
    if (!urlReferensiValid(s.url)) {
      urlBuruk.push(s.sumber_id.slice(0, 8));
    }
  }
  if (artikel.sumber_url && !urlReferensiValid(artikel.sumber_url)) {
    urlBuruk.push("sumber_url artikel");
  }
  if (urlBuruk.length > 0) {
    catat(
      "G3",
      false,
      `${urlBuruk.length} referensi tidak valid (bukan URL https): ${urlBuruk.join(", ")}.`,
    );
    return gagal(
      "G3",
      `referensi penting tidak valid/dapat diakses (${urlBuruk.length} tautan bukan URL https) — butuh review manusia.`,
      rincian,
    );
  }
  catat(
    "G3",
    true,
    `${sumber.length} tautan sumber + sumber_url artikel valid (https).`,
  );

  // ---- G4: ketertelusuran (K1–K7 diulang dari data DB) ----
  if (klaim.length === 0) {
    catat("G4", false, "tidak ada klaim terverifikasi yang bisa diperiksa.");
    return gagal(
      "G4",
      "tidak ada klaim terverifikasi yang bisa diperiksa ketertelusurannya — butuh review manusia.",
      rincian,
    );
  }
  const teksPerKlaim = new Map(klaim.map((k) => [k.id, k.teks]));
  const faktaArtikel = Array.isArray(artikel.fakta_penting)
    ? (artikel.fakta_penting as unknown[]).filter(
        (f): f is string => typeof f === "string",
      )
    : [];
  const tanggalDiketahui: string[] = [];
  for (const t of tanggalSumber) {
    const d = normalisasiTanggal(t);
    if (d) tanggalDiketahui.push(d);
  }
  for (const k of klaim) {
    if (k.jenis === "tanggal") {
      const d = normalisasiTanggal(k.teks);
      if (d) tanggalDiketahui.push(d);
    }
  }
  const hasilKualitas = periksaKualitasKlaimDraf({
    judul: artikel.judul,
    ringkasan: artikel.ringkasan,
    isi: artikel.isi,
    fakta: faktaArtikel.length > 0 ? faktaArtikel : klaim.map((k) => k.teks),
    sumber: sumber.map((s) => ({
      nama:
        (() => {
          try {
            return s.url ? new URL(s.url).hostname : s.sumber_id;
          } catch {
            return s.sumber_id;
          }
        })(),
      url: s.url ?? "",
    })),
    klaim: klaim.map((k) => ({ teks: k.teks, jenis: jenisKlaimAman(k.jenis) })),
    evidence: evidence.map((e) => ({
      klaim_teks: teksPerKlaim.get(e.klaim_id) ?? "",
      sumber_url: e.sumber_url,
      kutipan: e.kutipan,
    })),
    tanggalDiketahui,
  });
  if (!hasilKualitas.lolos) {
    const kode = hasilKualitas.pelanggaran
      .map((p) => p.kode)
      .join(", ");
    catat(
      "G4",
      false,
      `quality-check gagal: ${kode} (${hasilKualitas.pelanggaran.length} pelanggaran).`,
    );
    return gagal(
      "G4",
      `pemeriksaan kualitas gagal (${kode}) — angka/kutipan/tanggal tidak tertelusur ke bukti; butuh review manusia.`,
      rincian,
    );
  }
  catat("G4", true, "quality-check K1–K7 lolos.");

  // ---- G5: kebaruan ----
  if (tanggalSumber.length === 0) {
    catat("G5", false, "tanggal terbit sumber tidak diketahui.");
    return gagal(
      "G5",
      "tanggal terbit sumber tidak diketahui — tidak bisa dipastikan ini berita baru, bukan berita lama; butuh review manusia.",
      rincian,
    );
  }
  const terbaruMs = Math.max(
    ...tanggalSumber.map((t) => Date.parse(t)).filter((n) => !Number.isNaN(n)),
  );
  if (!Number.isFinite(terbaruMs)) {
    catat("G5", false, "tanggal terbit sumber tidak bisa diurai.");
    return gagal(
      "G5",
      "tanggal terbit sumber tidak bisa diurai — butuh review manusia.",
      rincian,
    );
  }
  const umurHari = (sekarang.getTime() - terbaruMs) / 86_400_000;
  if (umurHari < -1) {
    catat(
      "G5",
      false,
      `tanggal sumber terbaru di masa depan (${Math.round(-umurHari)} hari lagi).`,
    );
    return gagal(
      "G5",
      "tanggal terbit sumber berada di masa depan (data tidak wajar) — butuh review manusia.",
      rincian,
    );
  }
  if (umurHari > BATAS_BASI_HARI) {
    catat(
      "G5",
      false,
      `sumber terbaru berumur ${Math.round(umurHari)} hari (> ${BATAS_BASI_HARI} hari).`,
    );
    return gagal(
      "G5",
      `sumber terbaru berumur ${Math.round(umurHari)} hari — indikasi berita lama dipresentasikan sebagai baru; butuh review manusia.`,
      rincian,
    );
  }
  catat(
    "G5",
    true,
    `sumber terbaru berumur ${Math.max(0, Math.round(umurHari))} hari (≤ ${BATAS_BASI_HARI} hari).`,
  );

  return { lolos: true, gate: null, alasan: null, rincian };
}
