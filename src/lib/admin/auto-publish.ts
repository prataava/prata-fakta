// Auto-publish Tier-1 — PRATA FAKTA (Fase 11, paket tambahan).
//
// Otorisasi pemilik 17 Nov 2026 ±11.57 WIB (jawaban "SEMUANYA"):
// draf Tier-1 dengan FACT SCORE ≥85 BOLEH terbit otomatis, toggle
// bawaan AKTIF. Modul ini HANYA berisi keputusan + eksekusi
// auto-publish; ia TIDAK dipanggil dari mana pun di repo ini —
// wiring ke pipeline ditulis di bawah dan dipasang integrator
// sesudah Worker D selesai dengan pipeline.ts (JANGAN edit
// pipeline.ts dari sini).
//
// ============================ GATE (keputusan) ============================
// Satu artikel auto-terbit bila DAN HANYA BILA semuanya benar:
//   1. Toggle aktif — flag pf_system_settings 'auto_publish_tier1'
//      (DAFTAR_FLAG di src/lib/admin/kendali.ts, bawaan true).
//      Toggle diubah hanya super_admin via PATCH
//      /api/admin/kendali/flags; perubahan tercatat audit
//      'sistem.flag'. Bila flag belum pernah disetel, nilainya
//      bawaan (aktif) — lihat nilaiFlagAutoPublish.
//   2. FACT SCORE ≥ 85 (ambang AMBANG_AUTO_PUBLISH; label
//      "Sangat kuat" di src/lib/fact-score.ts). Skor null
//      (artikel tanpa klaim — "Belum dinilai") TIDAK PERNAH
//      auto-terbit.
//   3. Artikel berstatus 'draft'.
//   4. status_verifikasi CROSS-CHECKED atau VERIFIED.
//   5. Catatan verifikasi TERAKHIR (pf_verification_records)
//      keputusannya CROSS-CHECKED/VERIFIED — kolom status saja
//      tidak cukup; record-nya harus ada dan sejalan.
// Gate ini SENGAJA tidak meminta review editorial 'setuju':
// draf pipeline TIDAK PERNAH punya review manusia (pipeline
// tidak menulis pf_editorial_reviews), jadi meminta review
// akan membuat fitur yang sudah disetujui pemilik ini tidak
// pernah menyala. Persetujuan untuk jalur ini ADALAH keputusan
// pemilik 17 Nov 2026 di atas — jalur otomatis ini adalah
// bentuk APPROVED yang kedua di pemetaan Fase 11
// (hidden_files/PEMETAAN-STATUS-EDITORIAL.md §APPROVED):
// manual = review 'setuju', otomatis = Tier-1 + skor ≥85 +
// toggle aktif. Penerbitan manual (terbitkanArtikel) tetap
// mensyaratkan review 'setuju' — jalur itu tidak berubah.
//
// ============================ EKSEKUSI ============================
// terbitkanOtomatis menerbitkan lewat mekanik yang SAMA dengan
// terbitkanArtikel di editorial.ts: update bersyarat status
// (harapkanStatus 'draft' — menutup race dua penerbit), set
// status 'terbit' + dijadwalkan_pada null + diterbitkan_pada now,
// simpan versi "Terbit (auto-publish)", notifikasi topik
// best-effort. Satu perbedaan yang disengaja: penyimpanan versi
// di sini best-effort (gagal versi tidak menggagalkan terbit),
// sedangkan audit FAIL-CLOSED — bila catat audit gagal, status
// dipulihkan ke draft + versi dihapus-balik (compensating pola
// T10 editorial.ts) lalu galat audit ASLI dilempar: TIDAK PERNAH
// ada artikel terbit tanpa jejak audit.
// Audit memakai aksi 'artikel.terbit' yang SUDAH ada di CHECK
// pf_audit_logs_aksi_check_v15 (migrasi v15 §4) — TIDAK ADA aksi
// baru, TIDAK ADA perubahan CHECK, TIDAK ADA migrasi. Penanda
// auto-publish hidup di sesudah: { auto_publish: true,
// fact_score, ambang_auto_publish: 85, keterangan: "auto-publish" }.
//
// ============================ WIRING (integrator) ============================
// Pasang SATU panggilan di src/lib/ai/pipeline.ts, fungsi
// verifikasiSatuItem (baris ~340), SETELAH langkah 9 — yaitu
// sesudah simpanVerification yang menautkan verification record
// ke artikel (baris ~985-1010) dan SEBELUM fungsi selesai.
// Alasan urutan: gate auto-publish membaca verification record
// ber-artikel_id (langkah 9) — dipanggil lebih awal, gate akan
// menolak karena record belum tertaut. Di titik itu tersedia:
// artikelId (dari langkah 6, adapter.simpanArtikel), keputusanAkhir.
// Langkah wiring (semua di dalam try/catch — kegagalan auto-publish
// TIDAK PERNAH menggagalkan item pipeline; draf tetap draft):
//   1. Hitung FACT SCORE artikelId dengan jalur baca yang SAMA
//      seperti halaman publik (src/app/artikel/[slug]/page.tsx):
//      perbandingan = await getPerbandinganSumber(artikelId);
//      koreksiTerbuka = await getJumlahKoreksiTerbuka(artikelId);
//      hasil = hitungFactScore({ ... }) — bila perbandingan tidak
//      tersedia, skor = null (jangan karang angka).
//      (getPerbandinganSumber + getJumlahKoreksiTerbuka ada di
//      src/lib/data.ts; hitungFactScore di src/lib/fact-score.ts.)
//   2. Baca toggle: { flags } = await getFlagsLayanan() dari
//      src/lib/admin/kendali.ts; aktif = nilaiFlagAutoPublish(flags).
//   3. Buat adapter admin: adapterAdmin = buatAdminAdapter() dari
//      src/lib/admin/supabase-adapter.ts (BUKAN AiAdapter pipeline —
//      terbitkanOtomatis butuh AdminAdapter).
//   4. Panggil:
//      await terbitkanOtomatis(adapterAdmin,
//        { artikelId, factScore: hasil.skor,
//          pengaturan: { autoPublishTier1: aktif } },
//        { id: null, email: "pipeline_editorial" });
//      Catat hasilnya (diterbitkan/alasan) ke detail run langkah
//      item agar terlihat di /admin — jangan ditelan diam-diam.
//   5. JANGAN panggil dari rekonsiliasi / jalankanPipelineEditorial
//      langsung, dan JANGAN panggil sebelum langkah 9.
// Bila Worker D mengubah nomor baris / nama langkah di atas,
// sesuaikan titik wiring dengan LANGKAH (sesudah tautan verifikasi),
// bukan dengan nomor baris.
import { kirimNotifikasiTopik } from "../notifikasi/tulis.ts";
import type { Aktor } from "./editorial.ts";
import type { AdminAdapter, StatusVerifikasi } from "./types.ts";

/** Ambang FACT SCORE untuk auto-publish Tier-1 (disetujui pemilik
 *  17 Nov 2026; sama dengan batas label "Sangat kuat" di
 *  src/lib/fact-score.ts). */
export const AMBANG_AUTO_PUBLISH = 85;

/** Kunci flag di pf_system_settings (DAFTAR_FLAG kendali.ts). */
export const KUNCI_FLAG_AUTO_PUBLISH = "auto_publish_tier1";

export interface PengaturanAutoPublish {
  /** Nilai flag auto_publish_tier1 (bawaan true bila belum disetel). */
  autoPublishTier1: boolean;
}

/**
 * Keputusan murni auto-publish: true hanya bila toggle aktif DAN
 * skor FACT SCORE (bulat 0–100, null = belum dinilai) mencapai
 * ambang. Skor null / NaN / di bawah ambang -> false.
 */
export function seharusnyaAutoTerbit(
  factScore: number | null,
  pengaturan: PengaturanAutoPublish,
): boolean {
  if (!pengaturan.autoPublishTier1) return false;
  if (factScore === null || !Number.isFinite(factScore)) return false;
  return factScore >= AMBANG_AUTO_PUBLISH;
}

/**
 * Nilai flag auto-publish dari daftar getFlags()/getFlagsLayanan():
 * true bila baris flag belum ada (bawaan aktif, sesuai otorisasi
 * pemilik) atau nilainya true; false hanya bila tersimpan false.
 */
export function nilaiFlagAutoPublish(
  flags: { kunci: string; nilai: unknown }[],
): boolean {
  const baris = flags.find((f) => f.kunci === KUNCI_FLAG_AUTO_PUBLISH);
  if (!baris) return true;
  return baris.nilai === true;
}

export interface HasilAutoPublish {
  diterbitkan: boolean;
  artikelId: string;
  factScore: number | null;
  /** Alasan bila tidak diterbitkan; null bila diterbitkan. */
  alasan: string | null;
}

/** Status verifikasi yang membolehkan auto-publish — sama seperti
 *  kandidat bulk publish (editorial.ts). */
const STATUS_VERIFIKASI_AUTO: StatusVerifikasi[] = [
  "CROSS-CHECKED",
  "VERIFIED",
];

/**
 * Terbitkan satu artikel secara otomatis (Tier-1). Mengembalikan
 * { diterbitkan, alasan } — TIDAK melempar untuk penolakan gate
 * (toggle mati / skor kurang / bukan draf / verifikasi tidak
 * memenuhi); penolakan gate berarti "tetap draft", bukan galat.
 * Melempar HANYA bila audit gagal dicatat (fail-closed, setelah
 * compensating memulihkan status) atau bila adapter gagal total
 * (mis. service key/tabel belum siap — route menjawab 503).
 */
export async function terbitkanOtomatis(
  adapter: AdminAdapter,
  input: {
    artikelId: string;
    factScore: number | null;
    pengaturan: PengaturanAutoPublish;
  },
  aktor: Aktor,
): Promise<HasilAutoPublish> {
  const { artikelId, factScore, pengaturan } = input;
  if (!seharusnyaAutoTerbit(factScore, pengaturan)) {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan: !pengaturan.autoPublishTier1
        ? "auto-publish Tier-1 nonaktif (flag auto_publish_tier1 mati)."
        : factScore === null
          ? "artikel belum dinilai FACT SCORE (tanpa klaim) — tidak pernah auto-terbit."
          : `FACT SCORE ${factScore} di bawah ambang ${AMBANG_AUTO_PUBLISH}.`,
    };
  }
  const artikel = await adapter.getArtikel({ id: artikelId });
  if (!artikel) {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan: "artikel tidak ditemukan.",
    };
  }
  if (artikel.status !== "draft") {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan: `artikel berstatus '${artikel.status}' (bukan draft).`,
    };
  }
  if (!STATUS_VERIFIKASI_AUTO.includes(artikel.status_verifikasi)) {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan:
        `status verifikasi '${artikel.status_verifikasi}' bukan ` +
        "CROSS-CHECKED/VERIFIED.",
    };
  }
  const verifikasi = await adapter.getVerifikasiTerakhir({
    artikel_id: artikelId,
  });
  if (
    !verifikasi ||
    !STATUS_VERIFIKASI_AUTO.includes(verifikasi.keputusan)
  ) {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan:
        "tidak ada catatan verifikasi CROSS-CHECKED/VERIFIED untuk artikel ini.",
    };
  }

  const sekarang = new Date().toISOString();
  const baru = await adapter.perbaruiArtikel({
    id: artikelId,
    patch: {
      status: "terbit",
      dijadwalkan_pada: null,
      diterbitkan_pada: sekarang,
      diterbitkan_oleh: aktor.id,
    },
    harapkanStatus: "draft",
  });
  if (!baru) {
    return {
      diterbitkan: false,
      artikelId,
      factScore,
      alasan:
        "artikel berubah status sesudah dibaca (kemungkinan diterbitkan proses lain) — coba lagi.",
    };
  }

  // Versi "Terbit (auto-publish)" — best-effort (pola simpanVersiBaru
  // editorial.ts, tapi kegagalannya tidak menggagalkan terbit:
  // yang tidak boleh hilang adalah jejak audit di bawah).
  let versiBaru: { id: string } | null = null;
  try {
    const terakhir = await adapter.getVersiTerakhir({
      artikel_id: artikelId,
    });
    versiBaru = await adapter.simpanVersi({
      artikel_id: artikelId,
      versi: (terakhir?.versi ?? 0) + 1,
      judul: baru.judul,
      isi: baru.isi,
      dibuat_oleh: aktor.id,
      catatan: "Terbit (auto-publish)",
    });
  } catch (err) {
    console.error(
      "auto-publish: simpan versi gagal (best-effort, terbit lanjut)",
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    await adapter.catatAudit({
      aktor_id: aktor.id,
      aktor_email: aktor.email,
      aksi: "artikel.terbit",
      entitas: "pf_articles",
      entitas_id: artikelId,
      sebelum: {
        status: artikel.status,
        status_verifikasi: artikel.status_verifikasi,
      },
      sesudah: {
        status: "terbit",
        diterbitkan_pada: sekarang,
        auto_publish: true,
        fact_score: factScore,
        ambang_auto_publish: AMBANG_AUTO_PUBLISH,
        keterangan: "auto-publish",
      },
      ip: aktor.ip ?? null,
    });
  } catch (err) {
    // Compensating (pola T10 editorial.ts): pulihkan status draft +
    // hapus-balik versi "Terbit (auto-publish)", lalu lempar ulang
    // galat audit ASLI — tidak ada artikel terbit tanpa jejak audit.
    try {
      await adapter.perbaruiArtikel({
        id: artikelId,
        patch: {
          status: "draft",
          dijadwalkan_pada: artikel.dijadwalkan_pada,
          diterbitkan_pada: artikel.diterbitkan_pada,
          diterbitkan_oleh: artikel.diterbitkan_oleh,
        },
      });
    } catch (errPulih) {
      console.error(
        "compensating pulihkan status auto-publish gagal",
        errPulih instanceof Error ? errPulih.message : String(errPulih),
      );
    }
    if (versiBaru) {
      try {
        await adapter.hapusVersi({ id: versiBaru.id });
      } catch (errPulih) {
        console.error(
          "compensating hapus-balik versi auto-publish gagal",
          errPulih instanceof Error ? errPulih.message : String(errPulih),
        );
      }
    }
    throw err;
  }

  // B2-D (E1): beri tahu pengikut kategori/negara artikel ini.
  // Best-effort — notifikasi TIDAK PERNAH menggagalkan penerbitan.
  try {
    await kirimNotifikasiTopik(null, baru.id);
  } catch {
    // Diam-diam: artikel sudah terbit; notifikasi hanya tambahan.
  }
  return { diterbitkan: true, artikelId, factScore, alasan: null };
}
