// Mesin ingestion PRATA FAKTA — kode deterministik, BUKAN AI.
// Mengambil feed RSS (dan GDELT sebagai cadangan), mendedup, lalu
// menyimpan item mentah ke pf_raw_items. TIDAK ADA auto-publish dan
// TIDAK ADA auto-VERIFIED di sini: semua item baru berstatus
// status_verifikasi 'UNCONFIRMED' dan menunggu kurasi manusia/editor.
// Hak cipta: hanya metadata + ringkasan sumber + URL yang disimpan.

import { fetchRss } from "./rss.ts";
import type { ItemMentah } from "./rss.ts";
import { fetchGdelt } from "./gdelt.ts";
import {
  cariKandidatDuplikatLunak,
  hashJudul,
  hashUrl,
  JENDELA_DUPLIKAT_LUNAK_MS,
  tentukanStatusDuplikat,
} from "./dedup.ts";
import { cobaUlang, percobaanGalat, type OpsiCobaUlang } from "./retry.ts";

// ---------- Adapter database (injeksi dependensi) ----------
// Engine tidak tahu Supabase/PGlite — semua akses DB lewat adapter ini.

export interface ItemSimpan {
  sumber_id: string;
  run_id: string | null;
  url: string;
  hash_url: string;
  judul: string;
  hash_judul: string;
  ringkasan: string;
  isi_ringkas: string;
  penulis: string | null;
  waktu_terbit_asli: Date | null;
  waktu_diambil: Date;
  status: "baru" | "duplikat" | "ditolak" | "disalin_dari";
  status_verifikasi: string;
  disalin_dari_id: string | null;
  diterbitkan_ulang: boolean;
  alasan: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PatchTutupRun {
  selesai_pada: Date;
  status: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
}

export interface IngestionAdapter {
  cariHashUrl(hashUrl: string): Promise<{ id: string } | null>;
  cariHashJudul(hashJudul: string): Promise<
    Array<{
      id: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  >;
  simpanItem(item: ItemSimpan): Promise<void>;
  buatRun(input: {
    sumber_id: string | null;
    sumber_nama: string;
    dipicu_oleh: string;
  }): Promise<string>;
  tutupRun(id: string, patch: PatchTutupRun): Promise<void>;
  perbaruiSumber(
    id: string,
    patch: {
      terakhir_diambil: Date;
      status_terakhir: string;
      tambah_item: number;
    },
  ): Promise<void>;
  // --- Metode opsional Gelombang B1 (adapter lama tetap jalan:
  // engine memeriksa keberadaannya sebelum memakai). ---
  /** Judul item 48 jam terakhir (untuk dedup lunak tahap-2). */
  daftarJudulBaruSejak?(sejak: Date, batas?: number): Promise<
    Array<{
      id: string;
      judul: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  >;
  /** Jumlah item sumber ini sejak tanggal tertentu (deteksi basi). */
  jumlahItemBaruSejak?(sumberId: string, sejak: Date): Promise<number>;
  /** Waktu item terbaru sumber ini (pemeriksaan basi harian). */
  waktuItemTerbaru?(sumberId: string): Promise<Date | null>;
  /** Tandai item UNCONFIRMED kedaluwarsa (lihat pemeliharaan.ts). */
  tandaiItemKedaluarsa?(batas: Date, alasan: string): Promise<number>;
  /** Tulis peringatan basi ke status_terakhir sumber (dashboard admin). */
  tandaiSumberBasi?(sumberId: string, pesan: string): Promise<void>;
}

// ---------- Tipe input / output engine ----------

export interface SumberIngestion {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  prioritas: number;
  aktif: boolean;
  // Topik GDELT khusus sumber ini (kolom pf_sources.topik_gdelt,
  // migrasi v13 — bila belum ada, diisi dari opsi/topik bawaan).
  // Hanya dipakai bila jenis === "api".
  topik_gdelt?: string | null;
}

export interface HasilPerSumber {
  sumber_id: string;
  sumber_nama: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
  // Peringatan basi (P1-6): 0 item dari sumber yang biasanya produktif.
  peringatan_basi?: string | null;
  // Kandidat duplikat lunak tahap-2 (P1-7): item tetap disimpan,
  // hanya ditandai untuk review — daftar dibatasi 10 entri pertama.
  kandidat_duplikat_lunak?: Array<{
    judul: string;
    judul_mirip: string;
    kemiripan: number;
    tipe: "duplikat" | "disalin_dari";
    item_id_mirip: string;
  }>;
  duplikat_lunak?: number;
  // Jumlah percobaan fetch yang dipakai (1 bila tanpa retry, P2-3).
  percobaan_fetch?: number;
}

export interface HasilIngestion {
  perSumber: HasilPerSumber[];
  total: {
    ditemukan: number;
    baru: number;
    duplikat: number;
    ditolak: number;
    gagal: number;
  };
}

export interface OpsiIngestion {
  dipicu_oleh?: string;
  fetchFn?: typeof fetch;
  hanyaSumberId?: string;
  // Timeout per feed RSS (ms). GDELT memakai timeout sendiri (30 dtk).
  timeoutMs?: number;
  // Topik GDELT untuk sumber jenis "api" (Gelombang 2: dulu
  // hardcoded "Indonesia" di bawah — utang audit §5.11).
  // Default tetap "Indonesia" agar perilaku lama tidak berubah.
  topikGdelt?: string;
  // Topik GDELT per sumber (P3-3): kunci = id ATAU nama sumber.
  // Mengalahkan topikGdelt; sumber.topik_gdelt (dari DB) mengalahkan
  // keduanya. Bila tidak ada satu pun, topik bawaan "Indonesia".
  topikGdeltPerSumber?: Record<string, string>;
  // Opsi retry per-sumber (P2-3): percobaanMaks bawaan 3, jeda awal
  // 1000 ms (backoff x2). Uji mengisi jedaAwalMs kecil agar cepat.
  retry?: OpsiCobaUlang;
  // Lewati allowlist host feed — HANYA untuk uji dengan fetch mock
  // (sumber sintetis contoh.test di scripts/uji-ingestion.mjs).
  // JANGAN PERNAH diisi di jalur produksi.
  lewatiAllowlistFeed?: boolean;
}

const PANJANG_JUDUL_MINIMAL = 5;

// Jendela "biasanya produktif" (P1-6): sumber dianggap produktif bila
// ada item baru dalam 7 hari terakhir.
const JENDELA_PRODUKTIF_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- Validasi item ----------

function urlValid(url: string): boolean {
  try {
    const terurai = new URL(url);
    return terurai.protocol === "http:" || terurai.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------- Proses satu sumber ----------

async function prosesSatuSumber(
  adapter: IngestionAdapter,
  sumber: SumberIngestion,
  opsi: OpsiIngestion,
): Promise<HasilPerSumber> {
  const dipicuOleh = opsi.dipicu_oleh ?? "manual";
  const timeoutMs = opsi.timeoutMs ?? 10000;
  const hasil: HasilPerSumber = {
    sumber_id: sumber.id,
    sumber_nama: sumber.nama,
    ditemukan: 0,
    baru: 0,
    duplikat: 0,
    ditolak: 0,
    gagal: 0,
    error: null,
  };

  let runId: string | null = null;
  try {
    runId = await adapter.buatRun({
      sumber_id: sumber.id,
      sumber_nama: sumber.nama,
      dipicu_oleh: dipicuOleh,
    });
  } catch (err) {
    // Run tidak bisa dibuat: catat sebagai gagal, tanpa run.
    const pesan = err instanceof Error ? err.message : String(err);
    hasil.error = `Gagal membuat baris run: ${pesan}`;
    hasil.gagal = 1;
    return hasil;
  }

  // 1. Ambil feed — DENGAN retry per-sumber (P2-3 / N-S5): satu sumber
  // yang gagal sementara (GDELT 429, 5xx, gangguan jaringan) dicoba
  // ulang sendiri (maks 3x, backoff eksponensial, hormati Retry-After)
  // tanpa mengulang seluruh job. Bila fetch gagal total -> run 'gagal',
  // lanjut sumber lain.
  let items: ItemMentah[] = [];
  let httpStatus = 0;
  try {
    const ambilSekali = async (): Promise<{
      items: ItemMentah[];
      httpStatus: number;
    }> => {
      if (sumber.jenis === "api") {
        // Satu-satunya sumber API saat ini: GDELT DOC API.
        // Topik per sumber (P3-3): kolom DB sumber.topik_gdelt dulu,
        // lalu peta opsi.topikGdeltPerSumber (id/nama), lalu opsi
        // topikGdelt, terakhir bawaan "Indonesia".
        const topik =
          (sumber.topik_gdelt ?? "").trim() ||
          opsi.topikGdeltPerSumber?.[sumber.id]?.trim() ||
          opsi.topikGdeltPerSumber?.[sumber.nama]?.trim() ||
          opsi.topikGdelt?.trim() ||
          "Indonesia";
        const gdelt = await fetchGdelt(topik, {
          maxRecords: 25,
          timeoutMs: 30000,
          fetchFn: opsi.fetchFn,
        });
        return { items: gdelt.items, httpStatus: gdelt.httpStatus };
      } else if (sumber.jenis === "rss") {
        const rss = await fetchRss(sumber.url, {
          timeoutMs,
          fetchFn: opsi.fetchFn,
          lewatiAllowlist: opsi.lewatiAllowlistFeed,
        });
        return { items: rss.items, httpStatus: rss.httpStatus };
      }
      throw new Error(`Jenis sumber tidak didukung: ${sumber.jenis}`);
    };
    const { nilai, percobaan } = await cobaUlang(ambilSekali, {
      percobaanMaks: 3,
      jedaAwalMs: 1000,
      ...(opsi.retry ?? {}),
    });
    items = nilai.items;
    httpStatus = nilai.httpStatus;
    hasil.percobaan_fetch = percobaan;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    const percobaan = percobaanGalat(err);
    const pesanAkhir =
      percobaan !== null && percobaan > 1
        ? `${pesan} (gagal sesudah ${percobaan} percobaan)`
        : pesan;
    hasil.error = pesanAkhir;
    hasil.gagal = 1;
    hasil.percobaan_fetch = percobaan ?? 1;
    try {
      await adapter.tutupRun(runId, {
        selesai_pada: new Date(),
        status: "gagal",
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 1,
        error: pesanAkhir,
      });
      await adapter.perbaruiSumber(sumber.id, {
        terakhir_diambil: new Date(),
        status_terakhir: `gagal: ${pesan}`,
        tambah_item: 0,
      });
    } catch {
      // Kegagalan pencatatan tidak boleh menggagalkan sumber berikut.
    }
    return hasil;
  }

  hasil.ditemukan = items.length;
  const waktuDiambil = new Date();

  // Deteksi sumber basi (P1-6 / N-T4): feed 0 item dari sumber yang
  // biasanya produktif = anomali (feed berubah format / sumber mati),
  // bukan sukses penuh. "Biasanya produktif" = ada item baru dalam
  // 7 hari terakhir. Run ditandai 'sebagian' + peringatan di bawah.
  if (items.length === 0 && adapter.jumlahItemBaruSejak) {
    try {
      const tujuhHariLalu = new Date(
        waktuDiambil.getTime() - JENDELA_PRODUKTIF_MS,
      );
      const jumlahBaru = await adapter.jumlahItemBaruSejak(
        sumber.id,
        tujuhHariLalu,
      );
      if (jumlahBaru > 0) {
        hasil.peringatan_basi =
          `0 item — sumber biasanya produktif (${jumlahBaru} item baru ` +
          `7 hari terakhir); kemungkinan feed berubah format atau sumber mati`;
      }
    } catch {
      // Gagal memeriksa riwayat: jangan mengubah status run.
    }
  }

  // Kandidat dedup lunak tahap-2 (P1-7): muat SEKALI per run (bukan
  // per item) — judul 48 jam terakhir. Gagal memuat = dedup lunak
  // dilewati, dedup hash tetap jalan.
  let kandidatJudul: Array<{
    id: string;
    judul: string;
    sumber_id: string | null;
    waktu_terbit_asli: string | null;
    waktu_diambil: string;
  }> = [];
  if (adapter.daftarJudulBaruSejak) {
    try {
      kandidatJudul = await adapter.daftarJudulBaruSejak(
        new Date(waktuDiambil.getTime() - JENDELA_DUPLIKAT_LUNAK_MS),
        500,
      );
    } catch {
      kandidatJudul = [];
    }
  }

  // Jumlah baris yang benar-benar tersimpan untuk sumber ini
  // (baru + disalin_dari + diterbitkan_ulang) — dipakai untuk
  // pf_sources.jumlah_item, agar tidak hanya menghitung 'baru'.
  let disimpan = 0;

  // 2. Proses tiap item secara berurutan (dedup butuh urutan deterministik).
  for (const item of items) {
    try {
      const judul = (item.judul ?? "").trim();
      const url = (item.url ?? "").trim();

      // Aturan validasi: tanpa url/judul valid, url bukan http(s), atau
      // judul < 5 karakter -> ditolak (jangan insert).
      if (!url || !judul || judul.length < PANJANG_JUDUL_MINIMAL || !urlValid(url)) {
        hasil.ditolak += 1;
        continue;
      }

      const hash_url = hashUrl(url);
      const hash_judul = hashJudul(judul);

      // Aturan dedup 1: hash_url sudah ada -> duplikat (jangan insert).
      const sudahAdaUrl = await adapter.cariHashUrl(hash_url);
      if (sudahAdaUrl) {
        hasil.duplikat += 1;
        continue;
      }

      // Aturan dedup 2-4: cocok berdasarkan hash_judul.
      const cocok = await adapter.cariHashJudul(hash_judul);
      const keputusan = tentukanStatusDuplikat({
        sumberId: sumber.id,
        cocok,
        waktuTerbit: item.waktuTerbit,
        waktuDiambil,
      });

      if (keputusan.status === "duplikat") {
        // Judul sama sumber sama + tanggal dekat -> duplikat, jangan insert.
        // Judul sama sumber sama + tanggal jauh -> INSERT sebagai duplikat
        // dengan diterbitkan_ulang = true (jejak penerbitan ulang).
        if (keputusan.diterbitkanUlang) {
          await adapter.simpanItem({
            sumber_id: sumber.id,
            run_id: runId,
            url,
            hash_url,
            judul,
            hash_judul,
            ringkasan: item.ringkasan ?? "",
            isi_ringkas: item.isiRingkas ?? "",
            penulis: item.penulis,
            waktu_terbit_asli: item.waktuTerbit,
            waktu_diambil: waktuDiambil,
            status: "duplikat",
            status_verifikasi: "UNCONFIRMED",
            disalin_dari_id: null,
            diterbitkan_ulang: true,
            alasan: keputusan.alasan,
            metadata: {
              ...(item.metadata ?? {}),
              guid: item.guid,
              gambar_url: item.gambarUrl,
              kategori_feed: item.kategoriFeed,
            },
          });
          disimpan += 1;
        }
        hasil.duplikat += 1;
        continue;
      }

      if (keputusan.status === "disalin_dari") {
        // Judul identik dari penerbit lain -> simpan sebagai salinan,
        // BUKAN sebagai sumber independen.
        await adapter.simpanItem({
          sumber_id: sumber.id,
          run_id: runId,
          url,
          hash_url,
          judul,
          hash_judul,
          ringkasan: item.ringkasan ?? "",
          isi_ringkas: item.isiRingkas ?? "",
          penulis: item.penulis,
          waktu_terbit_asli: item.waktuTerbit,
          waktu_diambil: waktuDiambil,
          status: "disalin_dari",
          status_verifikasi: "UNCONFIRMED",
          disalin_dari_id: keputusan.disalinDariId,
          diterbitkan_ulang: false,
          alasan: keputusan.alasan,
          metadata: {
            ...(item.metadata ?? {}),
            guid: item.guid,
            gambar_url: item.gambarUrl,
            kategori_feed: item.kategoriFeed,
          },
        });
        disimpan += 1;
        hasil.duplikat += 1;
        continue;
      }

      // Aturan 5: selain itu -> item baru. Sebelum disimpan, jalankan
      // dedup lunak tahap-2 (P1-7): bila judulnya mirip (>= 0,8) dengan
      // item 48 jam terakhir, item TETAP disimpan sebagai 'baru' —
      // hanya ditandai kandidat di metadata + alasan + log run, untuk
      // review manusia. Tidak ada penghapusan otomatis di sini.
      let lunak: ReturnType<typeof cariKandidatDuplikatLunak> | null = null;
      if (kandidatJudul.length > 0) {
        lunak = cariKandidatDuplikatLunak({
          judul,
          sumberId: sumber.id,
          waktuDiambil,
          kandidat: kandidatJudul,
        });
      }
      const metadataBaru: Record<string, unknown> = {
        ...(item.metadata ?? {}),
        guid: item.guid,
        gambar_url: item.gambarUrl,
        kategori_feed: item.kategoriFeed,
      };
      let alasanBaru: string | null = null;
      if (lunak && lunak.kandidat && lunak.miripDengan && lunak.tipe) {
        metadataBaru.kandidat_duplikat_lunak = {
          item_id: lunak.miripDengan.id,
          judul_mirip: lunak.miripDengan.judul,
          kemiripan: Math.round(lunak.miripDengan.kemiripan * 1000) / 1000,
          tipe: lunak.tipe,
        };
        alasanBaru = lunak.alasan;
        hasil.duplikat_lunak = (hasil.duplikat_lunak ?? 0) + 1;
        if ((hasil.kandidat_duplikat_lunak ?? []).length < 10) {
          (hasil.kandidat_duplikat_lunak ??= []).push({
            judul,
            judul_mirip: lunak.miripDengan.judul,
            kemiripan: Math.round(lunak.miripDengan.kemiripan * 1000) / 1000,
            tipe: lunak.tipe,
            item_id_mirip: lunak.miripDengan.id,
          });
        }
      }
      await adapter.simpanItem({
        sumber_id: sumber.id,
        run_id: runId,
        url,
        hash_url,
        judul,
        hash_judul,
        ringkasan: item.ringkasan ?? "",
        isi_ringkas: item.isiRingkas ?? "",
        penulis: item.penulis,
        waktu_terbit_asli: item.waktuTerbit,
        waktu_diambil: waktuDiambil,
        status: "baru",
        status_verifikasi: "UNCONFIRMED",
        disalin_dari_id: null,
        diterbitkan_ulang: false,
        alasan: alasanBaru,
        metadata: metadataBaru,
      });
      disimpan += 1;
      hasil.baru += 1;
    } catch (err) {
      // Satu item gagal (mis. DB error) tidak boleh menghentikan feed.
      hasil.gagal += 1;
      if (!hasil.error) {
        hasil.error =
          err instanceof Error ? err.message : String(err);
      }
    }
  }

  // 3. Tutup run dengan hitungan nyata + perbarui pf_sources.
  // 'sebagian' bila ada kegagalan item ATAU peringatan basi (P1-6:
  // 0 item dari sumber yang biasanya produktif bukan sukses penuh).
  const statusRun =
    hasil.gagal > 0 && hasil.baru + hasil.duplikat === 0
      ? "gagal"
      : hasil.gagal > 0 || hasil.peringatan_basi
        ? "sebagian"
        : "selesai";
  // Peringatan basi dicatat ke kolom error run agar terlihat di
  // pf_ingestion_runs / dashboard (bukan hanya di respons JSON).
  const errorRun = hasil.error ?? hasil.peringatan_basi ?? null;
  const statusSumber =
    statusRun === "selesai"
      ? `ok HTTP ${httpStatus}, ${items.length} item`
      : hasil.peringatan_basi && hasil.gagal === 0
        ? `basi: HTTP ${httpStatus} — ${hasil.peringatan_basi}`
        : `sebagian: HTTP ${httpStatus}, ${items.length} item, ${hasil.gagal} gagal`;
  try {
    await adapter.tutupRun(runId, {
      selesai_pada: new Date(),
      status: statusRun,
      ditemukan: hasil.ditemukan,
      baru: hasil.baru,
      duplikat: hasil.duplikat,
      ditolak: hasil.ditolak,
      gagal: hasil.gagal,
      error: errorRun,
    });
  } catch {
    // Pencatatan run gagal: hasil hitungan tetap dilaporkan ke pemanggil.
  }
  try {
    await adapter.perbaruiSumber(sumber.id, {
      terakhir_diambil: new Date(),
      status_terakhir: statusSumber,
      tambah_item: disimpan,
    });
  } catch {
    // Sama: kegagalan update sumber tidak mengubah hitungan.
  }

  return hasil;
}

// ---------- Titik masuk utama ----------

// Jalankan ingestion untuk semua sumber aktif. Feed diambil SECARA
// PARALEL (Promise.allSettled) agar total run cepat; satu sumber mati
// tidak menggagalkan sumber lain.
export async function jalankanIngestion(
  adapter: IngestionAdapter,
  sumber: SumberIngestion[],
  opsi: OpsiIngestion = {},
): Promise<HasilIngestion> {
  const daftar = sumber
    .filter((s) => s.aktif)
    .filter((s) => !opsi.hanyaSumberId || s.id === opsi.hanyaSumberId)
    .sort((a, b) => b.prioritas - a.prioritas);

  const hasilSettled = await Promise.allSettled(
    daftar.map((s) => prosesSatuSumber(adapter, s, opsi)),
  );

  const perSumber: HasilPerSumber[] = [];
  for (let i = 0; i < hasilSettled.length; i++) {
    const settled = hasilSettled[i];
    if (settled.status === "fulfilled") {
      perSumber.push(settled.value);
    } else {
      // Seharusnya tidak terjadi (prosesSatuSumber menangkap error
      // internal), tapi jangan sampai satu sumber menelan seluruh run.
      const s = daftar[i];
      perSumber.push({
        sumber_id: s.id,
        sumber_nama: s.nama,
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 1,
        error:
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
      });
    }
  }

  const total = perSumber.reduce(
    (ak, h) => ({
      ditemukan: ak.ditemukan + h.ditemukan,
      baru: ak.baru + h.baru,
      duplikat: ak.duplikat + h.duplikat,
      ditolak: ak.ditolak + h.ditolak,
      gagal: ak.gagal + h.gagal,
    }),
    { ditemukan: 0, baru: 0, duplikat: 0, ditolak: 0, gagal: 0 },
  );

  return { perSumber, total };
}
