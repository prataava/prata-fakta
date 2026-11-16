// Aturan bisnis admin PRATA FAKTA (Fase 5) — SEMUA aturan di sini,
// bukan di adapter maupun route. Route hanya: rate limit -> guard
// -> panggil fungsi di sini -> jawab JSON. Adapter hanya: baca/tulis
// Supabase. Fungsi di sini melempar Error berbahasa Indonesia bila
// aturan dilanggar; GalatGateTerbit dipakai route untuk menjawab 409.
import { buatSlug } from "../ai/slug.ts";
import {
  kirimNotifikasiKoreksi,
  kirimNotifikasiTopik,
} from "../notifikasi/tulis.ts";
import type {
  AdminAdapter,
  AksiAudit,
  Artikel,
  ArtikelInput,
  ArtikelPatch,
  BriefAdmin,
  JobPatch,
  KategoriInput,
  KategoriPatch,
  KeputusanReview,
  NamaJob,
  StatusVerifikasi,
} from "./types.ts";

export interface Aktor {
  id: string | null;
  email: string | null;
  ip?: string | null;
}

/** Dilempar terbitkanArtikel / terbitkanTerjadwal bila gate verifikasi
 *  tidak lolos. Route menjawab 409 {ok:false, error, alasan}. */
export class GalatGateTerbit extends Error {
  readonly alasan: string;
  constructor(alasan: string) {
    super(`Artikel tidak dapat diterbitkan: ${alasan}`);
    this.name = "GalatGateTerbit";
    this.alasan = alasan;
  }
}

async function catat(
  adapter: AdminAdapter,
  aktor: Aktor,
  aksi: AksiAudit,
  entitas: string,
  entitasId: string | null,
  sebelum?: unknown,
  sesudah?: unknown,
): Promise<void> {
  await adapter.catatAudit({
    aktor_id: aktor.id,
    aktor_email: aktor.email,
    aksi,
    entitas,
    entitas_id: entitasId,
    sebelum: sebelum ?? null,
    sesudah: sesudah ?? null,
    ip: aktor.ip ?? null,
  });
}

async function simpanVersiBaru(
  adapter: AdminAdapter,
  artikel: Artikel,
  aktor: Aktor,
  catatan: string,
): Promise<void> {
  const terakhir = await adapter.getVersiTerakhir({ artikel_id: artikel.id });
  await adapter.simpanVersi({
    artikel_id: artikel.id,
    versi: (terakhir?.versi ?? 0) + 1,
    judul: artikel.judul,
    isi: artikel.isi,
    dibuat_oleh: aktor.id,
    catatan,
  });
}

/** Slug unik: buatSlug sudah menyertakan hash judul, tapi tetap
 *  periksa bentrok dan tambah suffix -2, -3, ... bila perlu. */
async function slugUnik(
  adapter: AdminAdapter,
  judul: string,
): Promise<string> {
  const dasar = buatSlug(judul);
  let slug = dasar;
  let n = 2;
  for (;;) {
    const ada = await adapter.getArtikelBySlug({ slug });
    if (!ada) return slug;
    slug = `${dasar}-${n}`;
    n += 1;
  }
}

function wajibTeks(nilai: unknown, nama: string, maks = 0): string {
  const teks = typeof nilai === "string" ? nilai.trim() : "";
  if (!teks) throw new Error(`${nama} wajib diisi.`);
  if (maks > 0 && teks.length > maks) {
    throw new Error(`${nama} maksimal ${maks} karakter.`);
  }
  return teks;
}

/**
 * Normalisasi isu artikel (Tahap C-5, v15): opsional; string
 * kosong → null; lebih dari 120 karakter → dilempar (batas
 * yang sama seperti target topik di /api/topik).
 */
function normalisasiIsu(nilai: unknown): string | null {
  if (nilai === undefined || nilai === null) return null;
  if (typeof nilai !== "string") {
    throw new Error("Isu harus berupa teks.");
  }
  const teks = nilai.trim();
  if (teks === "") return null;
  if (teks.length > 120) {
    throw new Error("Isu maksimal 120 karakter.");
  }
  return teks;
}

// ---------- Artikel ----------

export async function buatArtikel(
  adapter: AdminAdapter,
  input: ArtikelInput,
  aktor: Aktor,
): Promise<Artikel> {
  const judul = wajibTeks(input.judul, "Judul", 300);
  const ringkasan = wajibTeks(input.ringkasan, "Ringkasan", 2000);
  const isi = wajibTeks(input.isi, "Isi artikel");
  const kategori_slug = wajibTeks(input.kategori_slug, "Kategori");
  const slug = await slugUnik(adapter, judul);
  const artikel = await adapter.buatArtikel({
    ...input,
    judul,
    ringkasan,
    isi,
    kategori_slug,
    slug,
    isu: normalisasiIsu(input.isu),
  });
  await adapter.simpanVersi({
    artikel_id: artikel.id,
    versi: 1,
    judul: artikel.judul,
    isi: artikel.isi,
    dibuat_oleh: aktor.id,
    catatan: "Draf awal",
  });
  await catat(adapter, aktor, "artikel.buat", "pf_articles", artikel.id, null, {
    judul: artikel.judul,
    slug: artikel.slug,
    kategori_slug: artikel.kategori_slug,
    status: "draft",
  });
  return artikel;
}

export async function perbaruiArtikel(
  adapter: AdminAdapter,
  id: string,
  patch: ArtikelPatch,
  aktor: Aktor,
): Promise<Artikel> {
  const lama = await adapter.getArtikel({ id });
  if (!lama) throw new Error("Artikel tidak ditemukan.");
  const bersih: ArtikelPatch = { ...patch };
  if (bersih.judul !== undefined) bersih.judul = wajibTeks(bersih.judul, "Judul", 300);
  if (bersih.ringkasan !== undefined) {
    bersih.ringkasan = wajibTeks(bersih.ringkasan, "Ringkasan", 2000);
  }
  if (bersih.isi !== undefined) bersih.isi = wajibTeks(bersih.isi, "Isi artikel");
  if (bersih.kategori_slug !== undefined) {
    bersih.kategori_slug = wajibTeks(bersih.kategori_slug, "Kategori");
  }
  // Tahap C-5 (v15): isu opsional — string kosong berarti hapus
  // isu (null). Pre-v15, update ini gagal PGRST204 → adapter
  // memetakannya ke 503 jujur (migrasi belum dijalankan).
  if (bersih.isu !== undefined) {
    bersih.isu = normalisasiIsu(bersih.isu);
  }
  const catatanVersi =
    typeof patch.catatan_versi === "string" && patch.catatan_versi.trim()
      ? patch.catatan_versi.trim()
      : "Revisi";
  delete bersih.catatan_versi;
  const baru = await adapter.perbaruiArtikel({ id, patch: bersih });
  if (!baru) throw new Error("Artikel tidak ditemukan.");
  await simpanVersiBaru(adapter, baru, aktor, catatanVersi);
  await catat(adapter, aktor, "artikel.ubah", "pf_articles", id, {
    judul: lama.judul,
    status: lama.status,
  }, {
    judul: baru.judul,
    status: baru.status,
    perubahan: Object.keys(bersih),
  });
  return baru;
}

export async function hapusArtikel(
  adapter: AdminAdapter,
  id: string,
  aktor: Aktor,
): Promise<void> {
  const artikel = await adapter.getArtikel({ id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  if (artikel.status !== "draft" && artikel.status !== "diarsipkan") {
    throw new Error(
      `Artikel berstatus '${artikel.status}' tidak dapat dihapus. ` +
        "Hanya artikel berstatus draft atau diarsipkan yang boleh dihapus; " +
        "artikel terbit/terjadwal harus dibatalkan dulu.",
    );
  }
  await adapter.hapusArtikel({ id });
  await catat(adapter, aktor, "artikel.hapus", "pf_articles", id, {
    judul: artikel.judul,
    slug: artikel.slug,
    status: artikel.status,
  }, null);
}

// ---------- Penerbitan (gate verifikasi) ----------

/** Gate terbit (P0-2 / N-K2, diperketat Gelombang B1):
 *  1. Verifikasi terakhir artikel harus ADA dan keputusannya
 *     BUKAN UNCONFIRMED/DISPUTED — dan BUKAN DEVELOPING: artikel
 *     yang masih berkembang (1 sumber independen) TIDAK BOLEH
 *     terbit. Dipilih penolakan penuh (bukan "boleh dengan label
 *     Berkembang"), karena label itu belum ada di UI publik dan
 *     pengecualian diam-diam adalah jalan pintas yang sama dengan
 *     yang ditutup di sini.
 *  2. Review editorial terakhir harus ADA dan keputusannya
 *     'setuju' — tanpa review (atau ditolak/dikembalikan) artikel
 *     tidak boleh terbit.
 *  3. Review dianggap KEDALUWARSA bila artikel diubah (versi baru)
 *     atau diverifikasi ulang SESUDAH review disetujui — persetujuan
 *     berlaku untuk isi yang ditinjau, bukan isi yang sudah berubah.
 *  Melempar GalatGateTerbit bila tidak lolos. */
export async function periksaGateTerbit(
  adapter: AdminAdapter,
  artikelId: string,
): Promise<void> {
  const artikel = await adapter.getArtikel({ id: artikelId });
  if (!artikel) {
    throw new GalatGateTerbit("artikel tidak ditemukan.");
  }
  if (artikel.status_verifikasi === "DEVELOPING") {
    throw new GalatGateTerbit(
      "status verifikasi artikel DEVELOPING (masih berkembang, 1 sumber independen) — artikel yang masih berkembang tidak boleh terbit.",
    );
  }
  const verifikasi = await adapter.getVerifikasiTerakhir({
    artikel_id: artikelId,
  });
  if (!verifikasi) {
    throw new GalatGateTerbit(
      "artikel belum pernah diverifikasi (tidak ada catatan verifikasi).",
    );
  }
  if (verifikasi.keputusan === "UNCONFIRMED") {
    throw new GalatGateTerbit(
      "status verifikasi terakhir masih UNCONFIRMED (belum terkonfirmasi).",
    );
  }
  if (verifikasi.keputusan === "DISPUTED") {
    throw new GalatGateTerbit(
      "status verifikasi terakhir DISPUTED (diperdebatkan) — selesaikan sengketa dulu.",
    );
  }
  if (verifikasi.keputusan === "DEVELOPING") {
    throw new GalatGateTerbit(
      "status verifikasi terakhir DEVELOPING (masih berkembang) — artikel yang masih berkembang tidak boleh terbit.",
    );
  }
  const review = await adapter.getReviewTerakhir({
    artikel_id: artikelId,
  });
  if (!review) {
    throw new GalatGateTerbit(
      "belum ada review editorial — artikel hanya boleh terbit sesudah editor menyetujui (review 'setuju').",
    );
  }
  if (review.keputusan !== "setuju") {
    throw new GalatGateTerbit(
      `review editorial terakhir '${review.keputusan}' — hanya review 'setuju' yang membolehkan terbit.`,
    );
  }
  // Kedaluwarsa: persetujuan tidak berlaku lagi bila artikel diubah
  // atau diverifikasi ulang sesudah review disetujui.
  const waktuReview = new Date(review.dibuat_pada).getTime();
  const versiTerakhir = await adapter.getVersiTerakhir({
    artikel_id: artikelId,
  });
  if (
    versiTerakhir &&
    !Number.isNaN(waktuReview) &&
    new Date(versiTerakhir.dibuat_pada).getTime() > waktuReview
  ) {
    throw new GalatGateTerbit(
      "review editorial kedaluwarsa: artikel diubah sesudah review disetujui — minta review ulang atas isi terbaru.",
    );
  }
  if (
    verifikasi.dibuat_pada &&
    !Number.isNaN(waktuReview) &&
    new Date(verifikasi.dibuat_pada).getTime() > waktuReview
  ) {
    throw new GalatGateTerbit(
      "review editorial kedaluwarsa: verifikasi berubah sesudah review disetujui — minta review ulang.",
    );
  }
}

/** Hasil pemeriksaan kualitas terakhir satu artikel (P2-2 / N-S3):
 *  dibaca dari pf_ai_runs (agen editorial_quality, input_ref =
 *  artikel_id) — tempat pipeline mencatat siap_review + kegagalan.
 *  null bila belum pernah ada pemeriksaan kualitas (mis. artikel
 *  buatan manual) — penjadwalan tidak diblokir oleh ketiadaan
 *  sinyal. (Kolom siap_review di pf_articles adalah follow-up
 *  migrasi v13; sampai saat itu pf_ai_runs adalah sumbernya.) */
export interface KualitasTerakhir {
  lolos: boolean;
  kegagalan: string[];
  dimulai_pada: string;
}

export async function periksaKualitasTerakhir(
  adapter: AdminAdapter,
  artikelId: string,
): Promise<KualitasTerakhir | null> {
  let runs: Awaited<ReturnType<AdminAdapter["listAiRuns"]>>;
  try {
    runs = await adapter.listAiRuns({ limit: 500 });
  } catch {
    // Riwayat run tidak terbaca -> tidak ada sinyal kualitas yang
    // bisa ditegakkan; penjadwalan diputuskan gate lain.
    return null;
  }
  const cocok = runs
    .filter((r) => r.agen === "editorial_quality" && r.input_ref === artikelId)
    .sort(
      (a, b) =>
        new Date(b.dimulai_pada).getTime() -
        new Date(a.dimulai_pada).getTime(),
    );
  if (cocok.length === 0) return null;
  const terbaru = cocok[0];
  const detail =
    terbaru.detail !== null &&
    typeof terbaru.detail === "object" &&
    !Array.isArray(terbaru.detail)
      ? (terbaru.detail as Record<string, unknown>)
      : {};
  if (typeof detail.lolos !== "boolean") return null;
  return {
    lolos: detail.lolos,
    kegagalan: Array.isArray(detail.kegagalan)
      ? detail.kegagalan.filter((k): k is string => typeof k === "string")
      : [],
    dimulai_pada: terbaru.dimulai_pada,
  };
}

export async function terbitkanArtikel(
  adapter: AdminAdapter,
  id: string,
  aktor: Aktor,
): Promise<Artikel> {
  const artikel = await adapter.getArtikel({ id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  if (artikel.status === "terbit") {
    throw new Error("Artikel sudah berstatus terbit.");
  }
  await periksaGateTerbit(adapter, id);
  const sekarang = new Date().toISOString();
  // P2-9 (integrasi B1): update bersyarat status — bila proses
  // lain sudah menerbitkan artikel ini di antara baca dan tulis,
  // update memengaruhi 0 baris (bukan terbit ganda + versi ganda).
  const baru = await adapter.perbaruiArtikel({
    id,
    patch: {
      status: "terbit",
      dijadwalkan_pada: null,
      diterbitkan_pada: sekarang,
      diterbitkan_oleh: aktor.id,
    },
    harapkanStatus: artikel.status,
  });
  if (!baru)
    throw new Error(
      "Artikel berubah status sesudah dibaca (kemungkinan diterbitkan proses lain) — muat ulang dan coba lagi.",
    );
  await simpanVersiBaru(adapter, baru, aktor, "Terbit");
  await catat(adapter, aktor, "artikel.terbit", "pf_articles", id, {
    status: artikel.status,
  }, { status: "terbit", diterbitkan_pada: sekarang });
  // B2-D (E1): beri tahu pengikut kategori/negara artikel ini.
  // Best-effort — notifikasi TIDAK PERNAH menggagalkan penerbitan.
  try {
    await kirimNotifikasiTopik(null, baru.id);
  } catch {
    // Diam-diam: artikel sudah terbit; notifikasi hanya tambahan.
  }
  return baru;
}

export async function batalkanPublikasi(
  adapter: AdminAdapter,
  id: string,
  aktor: Aktor,
): Promise<Artikel> {
  const artikel = await adapter.getArtikel({ id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  if (artikel.status !== "terbit") {
    throw new Error(
      `Hanya artikel terbit yang dapat dibatalkan (status saat ini: '${artikel.status}').`,
    );
  }
  const baru = await adapter.perbaruiArtikel({
    id,
    patch: { status: "draft" },
  });
  if (!baru) throw new Error("Artikel tidak ditemukan.");
  // diterbitkan_pada SENGAJA dipertahankan sebagai riwayat.
  await catat(adapter, aktor, "artikel.batal_terbit", "pf_articles", id, {
    status: "terbit",
  }, { status: "draft" });
  return baru;
}

export async function jadwalkanArtikel(
  adapter: AdminAdapter,
  id: string,
  dijadwalkanPada: string,
  aktor: Aktor,
  opsi?: { overrideKualitas?: boolean; alasanOverride?: string },
): Promise<Artikel> {
  const artikel = await adapter.getArtikel({ id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  const waktu = new Date(dijadwalkanPada);
  if (Number.isNaN(waktu.getTime())) {
    throw new Error("dijadwalkan_pada tidak valid (harus tanggal ISO).");
  }
  // P0-2 / N-S4: penjadwalan memeriksa gate yang SAMA dengan
  // penerbitan (verifikasi + review setuju + bukan DEVELOPING) —
  // kegagalan tidak boleh baru ketahuan saat jam terbit tiba.
  await periksaGateTerbit(adapter, id);
  // P2-2 / N-S3: blokir penjadwalan bila pemeriksaan kualitas
  // terakhir GAGAL, kecuali override eksplisit editor yang
  // tercatat di audit (dengan alasan wajib).
  const kualitas = await periksaKualitasTerakhir(adapter, id);
  let overrideKualitas = false;
  let alasanOverride: string | null = null;
  if (kualitas && !kualitas.lolos) {
    if (!opsi?.overrideKualitas) {
      throw new GalatGateTerbit(
        `pemeriksaan kualitas draf gagal (${kualitas.kegagalan.join("; ")}) — ` +
          "perbaiki draf dulu, atau jadwalkan dengan override editor yang tercatat (alasan wajib).",
      );
    }
    alasanOverride = (opsi.alasanOverride ?? "").trim();
    if (!alasanOverride) {
      throw new Error(
        "Alasan override kualitas wajib diisi bila menjadwalkan draf yang gagal pemeriksaan kualitas.",
      );
    }
    overrideKualitas = true;
  }
  const baru = await adapter.perbaruiArtikel({
    id,
    patch: {
      status: "terjadwal",
      dijadwalkan_pada: waktu.toISOString(),
    },
  });
  if (!baru) throw new Error("Artikel tidak ditemukan.");
  await catat(adapter, aktor, "artikel.jadwalkan", "pf_articles", id, {
    status: artikel.status,
  }, {
    status: "terjadwal",
    dijadwalkan_pada: waktu.toISOString(),
    ...(overrideKualitas
      ? {
          override_kualitas: true,
          alasan_override: alasanOverride,
          kegagalan_kualitas: kualitas?.kegagalan ?? [],
        }
      : {}),
  });
  return baru;
}

export interface HasilTerbitkanTerjadwal {
  diterbitkan: { id: string; judul: string }[];
  dilewati: { id: string; judul: string; alasan: string }[];
  /** Artikel yang gagal gate pada run sebelumnya dan masih dalam
   *  masa backoff (F12) — TIDAK dicoba ulang run ini, dan TIDAK
   *  dihitung sebagai error (bukan noise log tiap jam). */
  ditunda_backoff: {
    id: string;
    judul: string;
    alasan: string;
    coba_lagi_pada: string;
  }[];
}

/**
 * Backoff gate (Tahap 13C, F12): artikel terjadwal yang gagal
 * gate TIDAK dicoba ulang tiap jam. Jeda 6 jam sesudah upaya
 * gate terakhir yang gagal — cukup lama untuk meredam noise
 * log, cukup singkat agar artikel yang sudah diperbaiki editor
 * tidak tertunda berhari-hari.
 *
 * Penanda upaya gagal = baris audit aksi 'sistem.job',
 * entitas 'pf_articles', sesudah { gagal_gate:true, alasan }
 * (aksi sudah ada di CHECK pf_audit_logs v8/v9 — tanpa kolom
 * baru, tanpa migrasi). Penanda HANYA ditulis saat upaya
 * SESUNGGUHNYA gagal gate; artikel yang ditunda karena backoff
 * TIDAK menulis penanda baru (kalau tidak, backoff akan
 * memperpanjang dirinya sendiri selamanya).
 *
 * Bila adapter tidak menyediakan listAudit/catatAudit atau
 * tabel audit belum ada, backoff dilewati dengan aman (upaya
 * tetap dicoba seperti sebelum Tahap 13C).
 */
export const BACKOFF_GATE_JAM = 6;

async function periksaBackoffGate(
  adapter: AdminAdapter,
  artikelId: string,
): Promise<{ alasan: string; coba_lagi_pada: string } | null> {
  try {
    if (typeof adapter.listAudit !== "function") return null;
    const { log } = await adapter.listAudit({
      aksi: "sistem.job",
      entitas: "pf_articles",
      page: 1,
      limit: 100,
    });
    const penanda = (log ?? []).find(
      (r) =>
        r.entitas_id === artikelId &&
        r.sesudah !== null &&
        typeof r.sesudah === "object" &&
        (r.sesudah as Record<string, unknown>).gagal_gate === true,
    );
    if (!penanda || !penanda.dibuat_pada) return null;
    const terakhir = new Date(penanda.dibuat_pada).getTime();
    if (Number.isNaN(terakhir)) return null;
    // P2-3 (N-S4): backoff DIRESET bila artikel diperbarui sesudah
    // gagal gate — editor sudah memperbaiki penyebabnya, jadi tidak
    // perlu menunggu 6 jam. Sinyal pembaruan: diperbarui_pada
    // artikel, versi baru, atau review 'setuju' yang baru (review
    // memperbaiki penyebab umum gagal gate: belum ada persetujuan).
    try {
      const artikel = await adapter.getArtikel({ id: artikelId });
      const versi = await adapter.getVersiTerakhir({
        artikel_id: artikelId,
      });
      const review = await adapter.getReviewTerakhir({
        artikel_id: artikelId,
      });
      const pembaruan = [
        artikel?.diperbarui_pada,
        versi?.dibuat_pada,
        review && review.keputusan === "setuju"
          ? review.dibuat_pada
          : undefined,
      ];
      for (const waktu of pembaruan) {
        if (!waktu) continue;
        const ms = new Date(waktu).getTime();
        if (!Number.isNaN(ms) && ms > terakhir) return null;
      }
    } catch {
      // Sinyal reset tidak terbaca -> lanjut ke pemeriksaan backoff
      // normal (gagal aman: backoff tetap berlaku).
    }
    const cobaLagi = terakhir + BACKOFF_GATE_JAM * 3_600_000;
    if (Date.now() < cobaLagi) {
      const alasanSebelumnya =
        typeof penanda.sesudah === "object" &&
        penanda.sesudah !== null &&
        typeof (penanda.sesudah as Record<string, unknown>).alasan ===
          "string"
          ? ((penanda.sesudah as Record<string, unknown>).alasan as string)
          : "tanpa keterangan";
      return {
        alasan: `Gagal gate sebelumnya (${alasanSebelumnya}) — dicoba lagi setelah ${new Date(cobaLagi).toISOString()}.`,
        coba_lagi_pada: new Date(cobaLagi).toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function catatUpayaGate(
  adapter: AdminAdapter,
  aktor: Aktor,
  artikelId: string,
  alasan: string,
): Promise<void> {
  try {
    if (typeof adapter.catatAudit !== "function") return;
    await adapter.catatAudit({
      aktor_id: aktor.id,
      aktor_email: aktor.email,
      aksi: "sistem.job",
      entitas: "pf_articles",
      entitas_id: artikelId,
      sebelum: null,
      sesudah: {
        gagal_gate: true,
        alasan,
        job: "terbitkan-terjadwal",
      },
      ip: aktor.ip ?? null,
    });
  } catch {
    // Penanda backoff bersifat best-effort: kegagalan mencatat
    // tidak boleh menggagalkan run terbitkan-terjadwal.
  }
}

export async function terbitkanTerjadwal(
  adapter: AdminAdapter,
  aktor: Aktor,
): Promise<HasilTerbitkanTerjadwal> {
  const hasil: HasilTerbitkanTerjadwal = {
    diterbitkan: [],
    dilewati: [],
    ditunda_backoff: [],
  };
  const sekarang = Date.now();
  // Ambil semua terjadwal (maks 100 per batch — cukup untuk antrean
  // editorial harian; sisanya terbit pada jam berikutnya).
  const { artikel } = await adapter.listArtikel({
    status: "terjadwal",
    page: 1,
    limit: 100,
  });
  for (const a of artikel) {
    if (!a.dijadwalkan_pada) {
      hasil.dilewati.push({
        id: a.id,
        judul: a.judul,
        alasan: "tidak punya dijadwalkan_pada.",
      });
      continue;
    }
    if (new Date(a.dijadwalkan_pada).getTime() > sekarang) continue;
    // F12: masih dalam masa backoff sesudah gagal gate -> tunda
    // tanpa mencoba ulang, tanpa menulis penanda baru, dan
    // tanpa menghitungnya sebagai error.
    const tunda = await periksaBackoffGate(adapter, a.id);
    if (tunda) {
      hasil.ditunda_backoff.push({
        id: a.id,
        judul: a.judul,
        alasan: tunda.alasan,
        coba_lagi_pada: tunda.coba_lagi_pada,
      });
      continue;
    }
    try {
      await terbitkanArtikel(adapter, a.id, aktor);
      hasil.diterbitkan.push({ id: a.id, judul: a.judul });
    } catch (err) {
      const alasan =
        err instanceof GalatGateTerbit
          ? err.alasan
          : err instanceof Error
            ? err.message
            : "gagal tanpa keterangan.";
      hasil.dilewati.push({ id: a.id, judul: a.judul, alasan });
      // F12: hanya kegagalan GATE yang menandai backoff (bukan
      // galat teknis lain), agar galat teknis tetap dicoba
      // ulang jam berikutnya.
      if (err instanceof GalatGateTerbit) {
        await catatUpayaGate(adapter, aktor, a.id, alasan);
      }
    }
  }
  return hasil;
}

// ---------- Review & verifikasi ----------

export async function putuskanReview(
  adapter: AdminAdapter,
  input: {
    artikel_id: string;
    keputusan: KeputusanReview;
    catatan: string;
    reviewer_id: string | null;
  },
  aktor: Aktor,
): Promise<{ artikel: Artikel; keputusan: KeputusanReview }> {
  const catatan = wajibTeks(input.catatan, "Catatan review", 2000);
  const artikel = await adapter.getArtikel({ id: input.artikel_id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  if (artikel.status !== "draft" && artikel.status !== "terjadwal") {
    throw new Error(
      `Review hanya untuk artikel draft/terjadwal (status saat ini: '${artikel.status}').`,
    );
  }
  await adapter.simpanReview({
    artikel_id: input.artikel_id,
    reviewer_id: input.reviewer_id,
    keputusan: input.keputusan,
    catatan,
  });
  await catat(
    adapter,
    aktor,
    `review.${input.keputusan}` as AksiAudit,
    "pf_articles",
    input.artikel_id,
    { status: artikel.status },
    { keputusan: input.keputusan, catatan },
  );
  return { artikel, keputusan: input.keputusan };
}

export async function ubahStatusVerifikasi(
  adapter: AdminAdapter,
  input: {
    artikel_id: string;
    keputusan: StatusVerifikasi;
    catatan: string;
  },
  aktor: Aktor,
): Promise<Artikel> {
  const catatan = wajibTeks(input.catatan, "Catatan verifikasi", 2000);
  const artikel = await adapter.getArtikel({ id: input.artikel_id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  await adapter.simpanVerification({
    artikel_id: input.artikel_id,
    agen: "fact_checker",
    keputusan: input.keputusan,
    catatan,
    bukti: [],
    dibuat_oleh: aktor.id,
  });
  const baru = await adapter.ubahStatusVerifikasiArtikel({
    id: input.artikel_id,
    keputusan: input.keputusan,
  });
  if (!baru) throw new Error("Artikel tidak ditemukan.");
  await catat(adapter, aktor, "verifikasi.ubah", "pf_articles", input.artikel_id, {
    status_verifikasi: artikel.status_verifikasi,
  }, { status_verifikasi: input.keputusan, catatan });
  return baru;
}

// ---------- Koreksi ----------

/**
 * B2-D (E1): beri tahu pelapor hasil tindak lanjut koreksinya.
 * Best-effort — TIDAK PERNAH melempar / menggagalkan tindak lanjut.
 */
async function beriNotifikasiKoreksi(
  adapter: AdminAdapter,
  koreksi: { id: string; artikel_id: string | null },
  statusAkhir: "diperbaiki" | "ditolak" | "ditinjau",
): Promise<void> {
  try {
    let slug: string | null = null;
    if (koreksi.artikel_id) {
      const artikel = await adapter.getArtikel({ id: koreksi.artikel_id });
      slug = artikel?.slug ?? null;
    }
    await kirimNotifikasiKoreksi(null, koreksi.id, statusAkhir, slug);
  } catch {
    // Diam-diam: tindak lanjut sudah tersimpan.
  }
}

export async function tindaklanjutiKoreksi(
  adapter: AdminAdapter,
  input: { koreksi_id: string; aksi: "terima" | "tolak" | "ditinjau"; catatan: string },
  aktor: Aktor,
): Promise<{ status: string }> {
  const catatan = wajibTeks(input.catatan, "Catatan tindak lanjut", 2000);
  const koreksi = await adapter.getKoreksi({ id: input.koreksi_id });
  if (!koreksi) throw new Error("Laporan koreksi tidak ditemukan.");
  if (koreksi.status === "diperbaiki" || koreksi.status === "ditolak") {
    throw new Error(
      `Laporan koreksi ini sudah ditindaklanjuti (status: '${koreksi.status}').`,
    );
  }
  // AKSI AUDIT: 'koreksi.ditinjau' eksplisit (CHECK
  // pf_audit_logs_aksi_check_v9, migrasi v9 §6 — 47 aksi).
  if (input.aksi === "ditinjau") {
    if (koreksi.status === "ditinjau") {
      throw new Error("Laporan koreksi ini sudah ditinjau.");
    }
    await adapter.perbaruiKoreksi({ id: koreksi.id, status: "ditinjau" });
    await catat(adapter, aktor, "koreksi.ditinjau", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditinjau", catatan });
    await beriNotifikasiKoreksi(adapter, koreksi, "ditinjau");
    return { status: "ditinjau" };
  }
  if (input.aksi === "tolak") {
    await adapter.perbaruiKoreksi({ id: koreksi.id, status: "ditolak" });
    await catat(adapter, aktor, "koreksi.tolak", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditolak", catatan });
    await beriNotifikasiKoreksi(adapter, koreksi, "ditolak");
    return { status: "ditolak" };
  }
  // Terima laporan UMUM tanpa artikel_id (laporan masyarakat,
  // artikel_id nullable sejak migrasi v8): tidak ada artikel yang
  // dikoreksi — diterima untuk ditinjau redaksi, status 'ditinjau'.
  if (!koreksi.artikel_id) {
    const catatanUmum =
      "Laporan umum tanpa artikel — diterima untuk ditinjau redaksi, " +
      "tidak ada artikel yang dikoreksi.";
    await adapter.perbaruiKoreksi({ id: koreksi.id, status: "ditinjau" });
    await catat(adapter, aktor, "koreksi.ditinjau", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditinjau", catatan: catatanUmum, catatan_moderator: catatan });
    await beriNotifikasiKoreksi(adapter, koreksi, "ditinjau");
    return { status: "ditinjau" };
  }
  // Terima: laporan 'diperbaiki' + versi baru + artikel CORRECTED +
  // verification record CORRECTED agen 'editor'.
  const artikel = await adapter.getArtikel({ id: koreksi.artikel_id });
  if (!artikel) throw new Error("Artikel laporan koreksi tidak ditemukan.");
  await adapter.perbaruiKoreksi({ id: koreksi.id, status: "diperbaiki" });
  await simpanVersiBaru(adapter, artikel, aktor, `Koreksi: ${catatan}`);
  await adapter.simpanVerification({
    artikel_id: artikel.id,
    agen: "editor",
    keputusan: "CORRECTED",
    catatan: `Koreksi diterima: ${catatan}`,
    bukti: [],
    dibuat_oleh: aktor.id,
  });
  await adapter.ubahStatusVerifikasiArtikel({
    id: artikel.id,
    keputusan: "CORRECTED",
  });
  await catat(adapter, aktor, "koreksi.terima", "pf_correction_reports", koreksi.id, {
    status: koreksi.status,
    status_verifikasi: artikel.status_verifikasi,
  }, { status: "diperbaiki", status_verifikasi: "CORRECTED", catatan });
  await beriNotifikasiKoreksi(adapter, koreksi, "diperbaiki");
  return { status: "diperbaiki" };
}

// ---------- Pengguna ----------

export async function aturPeranPengguna(
  adapter: AdminAdapter,
  input: { user_id: string; roles: string[] },
  aktor: Aktor,
): Promise<{ roles: string[] }> {
  const sebelum = await adapter.getPengguna({ id: input.user_id });
  if (!sebelum) throw new Error("Pengguna tidak ditemukan.");
  await adapter.setPeranPengguna({ id: input.user_id, roles: input.roles });
  await catat(adapter, aktor, "pengguna.role", "pf_profiles", input.user_id, {
    roles: sebelum.roles,
  }, { roles: input.roles });
  return { roles: input.roles };
}

export async function setNonaktifPengguna(
  adapter: AdminAdapter,
  input: { user_id: string; nonaktif: boolean },
  aktor: Aktor,
): Promise<{ nonaktif: boolean }> {
  const sebelum = await adapter.getPengguna({ id: input.user_id });
  if (!sebelum) throw new Error("Pengguna tidak ditemukan.");
  await adapter.setNonaktif({ id: input.user_id, nonaktif: input.nonaktif });
  await catat(
    adapter,
    aktor,
    input.nonaktif ? "pengguna.nonaktif" : "pengguna.aktifkan",
    "pf_profiles",
    input.user_id,
    { nonaktif: sebelum.nonaktif },
    { nonaktif: input.nonaktif },
  );
  return { nonaktif: input.nonaktif };
}

// ---------- Sistem & brief ----------

export async function perbaruiJob(
  adapter: AdminAdapter,
  input: { nama: NamaJob; patch: JobPatch },
  aktor: Aktor,
): Promise<JobPatch & { nama: NamaJob }> {
  const sebelum = await adapter.getJob({ nama: input.nama });
  if (!sebelum) throw new Error(`Job '${input.nama}' tidak ditemukan.`);
  if (input.patch.jadwal_cron !== undefined && input.patch.jadwal_cron !== null) {
    const cron = input.patch.jadwal_cron.trim();
    // Validasi ringan format cron 5 kolom (angka/* , - /).
    if (!/^[\d*,/-]+(\s+[\d*,/-]+){4}$/.test(cron)) {
      throw new Error("jadwal_cron tidak valid (harus format cron 5 kolom).");
    }
    input.patch.jadwal_cron = cron;
  }
  const sesudah = await adapter.perbaruiJob({
    nama: input.nama,
    patch: input.patch,
  });
  if (!sesudah) throw new Error(`Job '${input.nama}' tidak ditemukan.`);
  await catat(adapter, aktor, "sistem.job", "pf_scheduled_jobs", sebelum.id, {
    jadwal_cron: sebelum.jadwal_cron,
    aktif: sebelum.aktif,
  }, {
    jadwal_cron: sesudah.jadwal_cron,
    aktif: sesudah.aktif,
  });
  return { nama: input.nama, ...input.patch };
}

/** Slug kategori sederhana (tanpa hash): 'Berita Dunia' -> 'berita-dunia'. */
export function buatSlugKategori(nama: string): string {
  return (
    nama
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "kategori"
  );
}

export async function buatKategori(
  adapter: AdminAdapter,
  input: KategoriInput,
  aktor: Aktor,
): Promise<{ slug: string; nama: string }> {
  const nama = wajibTeks(input.nama, "Nama kategori", 120);
  const slug = input.slug
    ? wajibTeks(input.slug, "Slug kategori", 120)
    : buatSlugKategori(nama);
  const kategori = await adapter.buatKategori({ ...input, slug, nama });
  await catat(adapter, aktor, "sistem.kategori", "pf_categories", kategori.id, null, {
    slug: kategori.slug,
    nama: kategori.nama,
  });
  return { slug: kategori.slug, nama: kategori.nama };
}

export async function perbaruiKategori(
  adapter: AdminAdapter,
  input: { id: string; patch: KategoriPatch },
  aktor: Aktor,
): Promise<{ slug: string; nama: string }> {
  const lama = (await adapter.listKategori()).find((k) => k.id === input.id);
  if (!lama) throw new Error("Kategori tidak ditemukan.");
  const patch = { ...input.patch };
  if (patch.nama !== undefined) patch.nama = wajibTeks(patch.nama, "Nama kategori", 120);
  const baru = await adapter.perbaruiKategori({ id: input.id, patch });
  if (!baru) throw new Error("Kategori tidak ditemukan.");
  await catat(adapter, aktor, "sistem.kategori", "pf_categories", input.id, {
    nama: lama.nama,
    aktif: lama.aktif,
  }, { nama: baru.nama, aktif: baru.aktif });
  return { slug: baru.slug, nama: baru.nama };
}

export async function hapusKategori(
  adapter: AdminAdapter,
  id: string,
  aktor: Aktor,
): Promise<void> {
  const kategori = (await adapter.listKategori()).find((k) => k.id === id);
  if (!kategori) throw new Error("Kategori tidak ditemukan.");
  const { total } = await adapter.listArtikel({
    kategori: kategori.slug,
    page: 1,
    limit: 1,
  });
  if (total > 0) {
    throw new Error(
      `Kategori '${kategori.nama}' masih dipakai ${total} artikel dan tidak dapat dihapus. ` +
        "Pindahkan dulu artikelnya ke kategori lain.",
    );
  }
  await adapter.hapusKategori({ id });
  await catat(adapter, aktor, "sistem.kategori", "pf_categories", id, {
    slug: kategori.slug,
    nama: kategori.nama,
  }, null);
}

export async function terbitkanBrief(
  adapter: AdminAdapter,
  id: string,
  aktor: Aktor,
): Promise<BriefAdmin> {
  const daftar = await adapter.listBrief();
  const brief = daftar.find((b) => b.id === id);
  if (!brief) throw new Error("Brief tidak ditemukan.");
  if (brief.status === "terbit") {
    throw new Error("Brief sudah berstatus terbit.");
  }
  const baru = await adapter.terbitkanBrief({ id });
  if (!baru) throw new Error("Brief tidak ditemukan.");
  await catat(adapter, aktor, "brief.terbit", "pf_daily_briefs", id, {
    status: "draft",
    tanggal: brief.tanggal,
  }, { status: "terbit", tanggal: brief.tanggal });
  return baru;
}
