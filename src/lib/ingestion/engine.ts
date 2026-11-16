// Mesin ingestion PRATA FAKTA — kode deterministik, BUKAN AI.
// Mengambil feed RSS (dan GDELT sebagai cadangan), mendedup, lalu
// menyimpan item mentah ke pf_raw_items. TIDAK ADA auto-publish dan
// TIDAK ADA auto-VERIFIED di sini: semua item baru berstatus
// status_verifikasi 'UNCONFIRMED' dan menunggu kurasi manusia/editor.
// Hak cipta: hanya metadata + ringkasan sumber + URL yang disimpan.

import { fetchRss } from "./rss.ts";
import type { ItemMentah } from "./rss.ts";
import { fetchGdelt } from "./gdelt.ts";
import { hashJudul, hashUrl, tentukanStatusDuplikat } from "./dedup.ts";

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
}

// ---------- Tipe input / output engine ----------

export interface SumberIngestion {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  prioritas: number;
  aktif: boolean;
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
}

const PANJANG_JUDUL_MINIMAL = 5;

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

  // 1. Ambil feed. Bila fetch gagal total -> run 'gagal', lanjut sumber lain.
  let items: ItemMentah[] = [];
  let httpStatus = 0;
  try {
    if (sumber.jenis === "api") {
      // Satu-satunya sumber API saat ini: GDELT DOC API.
      // Topik dari opsi (default "Indonesia" — perilaku lama).
      const gdelt = await fetchGdelt(opsi.topikGdelt ?? "Indonesia", {
        maxRecords: 25,
        timeoutMs: 30000,
        fetchFn: opsi.fetchFn,
      });
      items = gdelt.items;
      httpStatus = gdelt.httpStatus;
    } else if (sumber.jenis === "rss") {
      const rss = await fetchRss(sumber.url, {
        timeoutMs,
        fetchFn: opsi.fetchFn,
      });
      items = rss.items;
      httpStatus = rss.httpStatus;
    } else {
      throw new Error(`Jenis sumber tidak didukung: ${sumber.jenis}`);
    }
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    hasil.error = pesan;
    hasil.gagal = 1;
    try {
      await adapter.tutupRun(runId, {
        selesai_pada: new Date(),
        status: "gagal",
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 1,
        error: pesan,
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

      // Aturan 5: selain itu -> item baru.
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
        alasan: null,
        metadata: {
          ...(item.metadata ?? {}),
          guid: item.guid,
          gambar_url: item.gambarUrl,
          kategori_feed: item.kategoriFeed,
        },
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
  const statusRun =
    hasil.gagal > 0 && hasil.baru + hasil.duplikat === 0
      ? "gagal"
      : hasil.gagal > 0
        ? "sebagian"
        : "selesai";
  const statusSumber =
    statusRun === "selesai"
      ? `ok HTTP ${httpStatus}, ${items.length} item`
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
      error: hasil.error,
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
