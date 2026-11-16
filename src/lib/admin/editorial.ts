// Aturan bisnis admin PRATA FAKTA (Fase 5) — SEMUA aturan di sini,
// bukan di adapter maupun route. Route hanya: rate limit -> guard
// -> panggil fungsi di sini -> jawab JSON. Adapter hanya: baca/tulis
// Supabase. Fungsi di sini melempar Error berbahasa Indonesia bila
// aturan dilanggar; GalatGateTerbit dipakai route untuk menjawab 409.
import { buatSlug } from "../ai/slug.ts";
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

/** Gate terbit: verifikasi terakhir artikel harus ADA dan keputusannya
 *  BUKAN UNCONFIRMED/DISPUTED. Melempar GalatGateTerbit bila tidak lolos. */
export async function periksaGateTerbit(
  adapter: AdminAdapter,
  artikelId: string,
): Promise<void> {
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
  const baru = await adapter.perbaruiArtikel({
    id,
    patch: {
      status: "terbit",
      dijadwalkan_pada: null,
      diterbitkan_pada: sekarang,
      diterbitkan_oleh: aktor.id,
    },
  });
  if (!baru) throw new Error("Artikel tidak ditemukan.");
  await simpanVersiBaru(adapter, baru, aktor, "Terbit");
  await catat(adapter, aktor, "artikel.terbit", "pf_articles", id, {
    status: artikel.status,
  }, { status: "terbit", diterbitkan_pada: sekarang });
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
): Promise<Artikel> {
  const artikel = await adapter.getArtikel({ id });
  if (!artikel) throw new Error("Artikel tidak ditemukan.");
  const waktu = new Date(dijadwalkanPada);
  if (Number.isNaN(waktu.getTime())) {
    throw new Error("dijadwalkan_pada tidak valid (harus tanggal ISO).");
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
  }, { status: "terjadwal", dijadwalkan_pada: waktu.toISOString() });
  return baru;
}

export interface HasilTerbitkanTerjadwal {
  diterbitkan: { id: string; judul: string }[];
  dilewati: { id: string; judul: string; alasan: string }[];
}

export async function terbitkanTerjadwal(
  adapter: AdminAdapter,
  aktor: Aktor,
): Promise<HasilTerbitkanTerjadwal> {
  const hasil: HasilTerbitkanTerjadwal = { diterbitkan: [], dilewati: [] };
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
  // AKSI AUDIT: tidak ada 'koreksi.ditinjau' di CHECK
  // pf_audit_logs_aksi_check_v8 (migrasi v8: 46 aksi, hanya
  // 'koreksi.terima'/'koreksi.tolak') — jadi penandaan 'ditinjau'
  // dicatat dengan aksi 'koreksi.terima' yang sudah diizinkan dan
  // status 'ditinjau' tertulis eksplisit di kolom detail (sesudah).
  // Aksi audit 'koreksi.ditinjau' yang eksplisit butuh migrasi
  // lanjutan (v9) yang memperluas CHECK tersebut.
  if (input.aksi === "ditinjau") {
    if (koreksi.status === "ditinjau") {
      throw new Error("Laporan koreksi ini sudah ditinjau.");
    }
    await adapter.perbaruiKoreksi({ id: koreksi.id, status: "ditinjau" });
    await catat(adapter, aktor, "koreksi.terima", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditinjau", catatan });
    return { status: "ditinjau" };
  }
  if (input.aksi === "tolak") {
    await adapter.perbaruiKoreksi({ id: koreksi.id, status: "ditolak" });
    await catat(adapter, aktor, "koreksi.tolak", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditolak", catatan });
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
    await catat(adapter, aktor, "koreksi.terima", "pf_correction_reports", koreksi.id, {
      status: koreksi.status,
    }, { status: "ditinjau", catatan: catatanUmum, catatan_moderator: catatan });
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
