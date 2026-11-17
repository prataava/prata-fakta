// Adapter Supabase untuk mesin ingestion PRATA FAKTA.
// Memakai service role key agar bisa menulis pf_raw_items /
// pf_ingestion_runs / pf_sources melewati RLS (hanya dipakai di sisi
// server — route handler / cron — JANGAN pernah dipakai di browser).
// Tanpa secret di repo: URL + key dibaca dari environment.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IngestionAdapter,
  ItemSimpan,
  PatchTutupRun,
} from "./engine.ts";
import {
  petakanStatusRunAman,
  type KeadaanSumberMentah,
} from "./ketahanan.ts";
import type { BarisItemKlaster } from "./klaster.ts";

// Kolom v22 pf_sources (migrasi Worker A). Dipakai untuk mendeteksi
// galat "kolom belum ada" pada fallback fail-soft di bawah.
const KOLOM_V22 = [
  "poll_interval_minutes",
  "cooldown_until",
  "failure_count",
  "health_status",
  "etag",
  "last_modified",
  "last_success_at",
] as const;

function pesanMenyebutKolomV22(pesan: string): boolean {
  const rendah = pesan.toLowerCase();
  return KOLOM_V22.some((k) => rendah.includes(k));
}

function ambilEnv(nama: string): string | undefined {
  const nilai = process.env[nama];
  return nilai && nilai.trim() ? nilai.trim() : undefined;
}

export class SupabaseIngestionAdapter implements IngestionAdapter {
  private klien: SupabaseClient;

  constructor(
    url?: string,
    serviceRoleKey?: string,
  ) {
    const supabaseUrl = url ?? ambilEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey =
      serviceRoleKey ?? ambilEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diatur");
    }
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diatur");
    }
    this.klien = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async cariHashUrl(hashUrl: string): Promise<{ id: string } | null> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id")
      .eq("hash_url", hashUrl)
      .maybeSingle();
    if (error) throw new Error(`cariHashUrl gagal: ${error.message}`);
    return data ? { id: data.id as string } : null;
  }

  async cariHashJudul(hashJudul: string): Promise<
    Array<{
      id: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  > {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id, sumber_id, waktu_terbit_asli, waktu_diambil")
      .eq("hash_judul", hashJudul)
      .order("waktu_diambil", { ascending: true });
    if (error) throw new Error(`cariHashJudul gagal: ${error.message}`);
    return (data ?? []).map((baris) => ({
      id: baris.id as string,
      sumber_id: (baris.sumber_id as string | null) ?? null,
      waktu_terbit_asli: (baris.waktu_terbit_asli as string | null) ?? null,
      waktu_diambil: baris.waktu_diambil as string,
    }));
  }

  async simpanItem(item: ItemSimpan): Promise<string | void> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .insert({
        sumber_id: item.sumber_id,
        run_id: item.run_id,
        url: item.url,
        hash_url: item.hash_url,
        judul: item.judul,
        hash_judul: item.hash_judul,
        ringkasan: item.ringkasan,
        isi_ringkas: item.isi_ringkas,
        penulis: item.penulis,
        waktu_terbit_asli: item.waktu_terbit_asli
          ? item.waktu_terbit_asli.toISOString()
          : null,
        waktu_diambil: item.waktu_diambil.toISOString(),
        status: item.status,
        status_verifikasi: item.status_verifikasi,
        disalin_dari_id: item.disalin_dari_id,
        diterbitkan_ulang: item.diterbitkan_ulang,
        alasan: item.alasan,
        metadata: item.metadata,
      })
      .select("id")
      .single();
    if (error) throw new Error(`simpanItem gagal: ${error.message}`);
    return data?.id as string | undefined;
  }

  async buatRun(input: {
    sumber_id: string | null;
    sumber_nama: string;
    dipicu_oleh: string;
  }): Promise<string> {
    const { data, error } = await this.klien
      .from("pf_ingestion_runs")
      .insert({
        sumber_id: input.sumber_id,
        sumber_nama: input.sumber_nama,
        dimulai_pada: new Date().toISOString(),
        status: "berjalan",
        dipicu_oleh: input.dipicu_oleh,
      })
      .select("id")
      .single();
    if (error) throw new Error(`buatRun gagal: ${error.message}`);
    return data.id as string;
  }

  async tutupRun(id: string, patch: PatchTutupRun): Promise<void> {
    // Percobaan 1: status + kelas_gagal apa adanya (butuh migrasi
    // v22/v24 di produksi). Bila gagal, fallback bertahap agar run
    // tidak menggantung 'berjalan' selamanya di DB lama:
    //   2. tanpa kelas_gagal (kolom belum ada);
    //   3. status dipetakan ke nilai CHECK-aman v3.
    const percobaan: Array<Record<string, unknown>> = [
      {
        selesai_pada: patch.selesai_pada.toISOString(),
        status: patch.status,
        ditemukan: patch.ditemukan,
        baru: patch.baru,
        duplikat: patch.duplikat,
        ditolak: patch.ditolak,
        gagal: patch.gagal,
        error: patch.error,
        ...(patch.kelasGagal !== undefined
          ? { kelas_gagal: patch.kelasGagal }
          : {}),
      },
    ];
    const tanpaKelas = { ...percobaan[0] };
    delete tanpaKelas.kelas_gagal;
    percobaan.push(tanpaKelas);
    percobaan.push({
      ...tanpaKelas,
      status: petakanStatusRunAman(patch.status),
    });
    let galatTerakhir: string | null = null;
    for (const body of percobaan) {
      const { error } = await this.klien
        .from("pf_ingestion_runs")
        .update(body)
        .eq("id", id);
      if (!error) return;
      galatTerakhir = error.message;
      const pesan = error.message.toLowerCase();
      // Hanya lanjut ke fallback bila galatnya memang soal kolom /
      // CHECK; galat lain (mis. jaringan) langsung dilempar agar
      // pemanggil tahu pencatatan gagal.
      const soalKolom =
        pesan.includes("kelas_gagal") ||
        pesan.includes("column") ||
        pesan.includes("check constraint") ||
        pesan.includes("violates check");
      if (!soalKolom) break;
    }
    throw new Error(`tutupRun gagal: ${galatTerakhir}`);
  }

  async daftarJudulBaruSejak(sejak: Date, batas = 500): Promise<
    Array<{
      id: string;
      judul: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  > {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id, judul, sumber_id, waktu_terbit_asli, waktu_diambil")
      .gte("waktu_diambil", sejak.toISOString())
      .order("waktu_diambil", { ascending: true })
      .limit(batas);
    if (error) {
      throw new Error(`daftarJudulBaruSejak gagal: ${error.message}`);
    }
    return (data ?? []).map((baris) => ({
      id: baris.id as string,
      judul: baris.judul as string,
      sumber_id: (baris.sumber_id as string | null) ?? null,
      waktu_terbit_asli: (baris.waktu_terbit_asli as string | null) ?? null,
      waktu_diambil: baris.waktu_diambil as string,
    }));
  }

  async jumlahItemBaruSejak(sumberId: string, sejak: Date): Promise<number> {
    const { count, error } = await this.klien
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("sumber_id", sumberId)
      .gte("waktu_diambil", sejak.toISOString());
    if (error) {
      throw new Error(`jumlahItemBaruSejak gagal: ${error.message}`);
    }
    return count ?? 0;
  }

  async waktuItemTerbaru(sumberId: string): Promise<Date | null> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("waktu_diambil")
      .eq("sumber_id", sumberId)
      .order("waktu_diambil", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`waktuItemTerbaru gagal: ${error.message}`);
    }
    if (!data || typeof data.waktu_diambil !== "string") return null;
    const tanggal = new Date(data.waktu_diambil as string);
    return Number.isNaN(tanggal.getTime()) ? null : tanggal;
  }

  /**
   * Tandai item UNCONFIRMED yang lebih tua dari batas sebagai
   * kedaluwarsa (P2-8 / N-S11). Status 'ditolak' dipakai karena
   * CHECK status pf_raw_items hanya mengizinkan
   * baru/duplikat/ditolak/disalin_dari — tidak ada nilai 'kedaluwarsa'
   * tanpa migrasi. Penanda aslinya ada di alasan (awalan
   * "Kedaluarsa otomatis") + metadata.kedaluarsa_pada, sehingga
   * item tetap dapat ditemukan dan dipulihkan admin bila perlu.
   * Mengembalikan jumlah item yang ditandai (maks 200 per panggilan).
   */
  async tandaiItemKedaluarsa(batas: Date, alasan: string): Promise<number> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id, metadata")
      .eq("status_verifikasi", "UNCONFIRMED")
      .in("status", ["baru", "disalin_dari", "duplikat"])
      .lt("waktu_diambil", batas.toISOString())
      .limit(200);
    if (error) {
      throw new Error(`tandaiItemKedaluarsa (baca) gagal: ${error.message}`);
    }
    const baris = (data ?? []) as Array<{
      id: string;
      metadata: Record<string, unknown> | null;
    }>;
    let ditandai = 0;
    for (const b of baris) {
      const { error: errUpdate } = await this.klien
        .from("pf_raw_items")
        .update({
          status: "ditolak",
          alasan,
          metadata: {
            ...(b.metadata ?? {}),
            kedaluarsa_pada: new Date().toISOString(),
          },
        })
        .eq("id", b.id);
      if (!errUpdate) ditandai += 1;
    }
    return ditandai;
  }

  /**
   * Tulis peringatan basi ke pf_sources.status_terakhir (P1-6).
   * Segmen "BASI: ..." lama diganti (bukan ditumpuk) agar teks
   * tidak tumbuh tanpa batas dari run ke run.
   */
  async tandaiSumberBasi(sumberId: string, pesan: string): Promise<void> {
    const { data } = await this.klien
      .from("pf_sources")
      .select("status_terakhir")
      .eq("id", sumberId)
      .maybeSingle();
    const lama =
      data && typeof data.status_terakhir === "string"
        ? (data.status_terakhir as string).replace(/ · BASI:[^·]*/g, "").trim()
        : "";
    const baru = lama ? `${lama} · ${pesan}` : pesan;
    const { error } = await this.klien
      .from("pf_sources")
      .update({ status_terakhir: baru })
      .eq("id", sumberId);
    if (error) {
      throw new Error(`tandaiSumberBasi gagal: ${error.message}`);
    }
  }

  async perbaruiSumber(
    id: string,
    patch: {
      terakhir_diambil: Date;
      status_terakhir: string;
      tambah_item: number;
    },
  ): Promise<void> {
    // jumlah_item tidak punya operator tambah di PostgREST: baca nilai
    // sekarang, lalu tulis nilai baru.
    const { data, error: errorBaca } = await this.klien
      .from("pf_sources")
      .select("jumlah_item")
      .eq("id", id)
      .maybeSingle();
    if (errorBaca) {
      throw new Error(`perbaruiSumber (baca) gagal: ${errorBaca.message}`);
    }
    const sekarang =
      data && typeof data.jumlah_item === "number" ? data.jumlah_item : 0;
    const { error } = await this.klien
      .from("pf_sources")
      .update({
        terakhir_diambil: patch.terakhir_diambil.toISOString(),
        status_terakhir: patch.status_terakhir,
        jumlah_item: sekarang + patch.tambah_item,
      })
      .eq("id", id);
    if (error) throw new Error(`perbaruiSumber gagal: ${error.message}`);
  }

  // ---------- Metode Fase 3 + 6 (v22, fail-soft) ----------

  /**
   * Baca keadaan v22 satu sumber. Bila kolom v22 belum ada di DB
   * (migrasi belum diterapkan), PostgREST menolak select -> kembalikan
   * null (bukan melempar): engine memakai bawaan dan tetap jalan.
   * Galat lain (mis. jaringan) juga menghasilkan null — keadaan
   * yang tidak bisa dibaca TIDAK BOLEH menghentikan ingestion.
   */
  async bacaKeadaanSumber(
    sumberId: string,
  ): Promise<KeadaanSumberMentah | null> {
    const { data, error } = await this.klien
      .from("pf_sources")
      .select(
        "poll_interval_minutes,cooldown_until,failure_count,health_status,etag,last_modified,terakhir_cek,last_success_at",
      )
      .eq("id", sumberId)
      .maybeSingle();
    if (error || !data) return null;
    const baris = data as Record<string, unknown>;
    const ambilTanggal = (kunci: string): string | null => {
      const nilai = baris[kunci];
      return typeof nilai === "string" ? nilai : null;
    };
    return {
      poll_interval_minutes:
        typeof baris.poll_interval_minutes === "number"
          ? (baris.poll_interval_minutes as number)
          : null,
      cooldown_until: ambilTanggal("cooldown_until"),
      failure_count:
        typeof baris.failure_count === "number"
          ? (baris.failure_count as number)
          : null,
      health_status:
        typeof baris.health_status === "string"
          ? (baris.health_status as string)
          : null,
      etag: typeof baris.etag === "string" ? (baris.etag as string) : null,
      last_modified: ambilTanggal("last_modified"),
      terakhir_cek: ambilTanggal("terakhir_cek"),
      last_success_at: ambilTanggal("last_success_at"),
    };
  }

  /**
   * Tulis sebagian keadaan v22. Fail-soft dua lapis (TIDAK PERNAH
   * melempar): bila update penuh gagal karena menyebut kolom v22
   * (kolom belum ada), ulangi hanya dengan terakhir_cek (kolom v1,
   * selalu ada); bila itu pun gagal, diam — ingestion tetap jalan.
   * Nilai Date diubah ke ISO; null eksplisit dipertahankan (untuk
   * menghapus cooldown_until sesudah sukses).
   */
  async tulisKeadaanSumber(
    sumberId: string,
    patch: KeadaanSumberMentah,
  ): Promise<void> {
    const keIso = (nilai: Date | string | null | undefined): string | null => {
      if (nilai === null || nilai === undefined) return null;
      if (nilai instanceof Date) {
        return Number.isNaN(nilai.getTime()) ? null : nilai.toISOString();
      }
      return nilai;
    };
    const body: Record<string, unknown> = {};
    if (patch.poll_interval_minutes !== undefined) {
      body.poll_interval_minutes = patch.poll_interval_minutes;
    }
    if (patch.cooldown_until !== undefined) {
      body.cooldown_until = keIso(patch.cooldown_until);
    }
    if (patch.failure_count !== undefined) {
      body.failure_count = patch.failure_count;
    }
    if (patch.health_status !== undefined) {
      body.health_status = patch.health_status;
    }
    if (patch.etag !== undefined) body.etag = patch.etag;
    if (patch.last_modified !== undefined) {
      body.last_modified = keIso(patch.last_modified);
    }
    if (patch.terakhir_cek !== undefined) {
      body.terakhir_cek = keIso(patch.terakhir_cek);
    }
    if (patch.last_success_at !== undefined) {
      body.last_success_at = keIso(patch.last_success_at);
    }
    if (Object.keys(body).length === 0) return;
    const { error } = await this.klien
      .from("pf_sources")
      .update(body)
      .eq("id", sumberId);
    if (!error) return;
    if (!pesanMenyebutKolomV22(error.message)) return;
    // Fallback: hanya terakhir_cek (kolom v1) bila patch membawanya.
    if (body.terakhir_cek !== undefined) {
      await this.klien
        .from("pf_sources")
        .update({ terakhir_cek: body.terakhir_cek })
        .eq("id", sumberId);
    }
  }

  /**
   * Cari item berdasarkan GUID RSS (metadata->>guid). GUID disimpan
   * di metadata jsonb, bukan kolom sendiri (Fase 3, butir 8:
   * GUID hanya kunci dedup tambahan). Galat apa pun -> null
   * (dedup GUID dilewati; dedup URL/judul tetap jalan).
   */
  async cariGuid(guid: string): Promise<{ id: string } | null> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id")
      .eq("metadata->>guid", guid)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id as string };
  }

  // ---------- Metode Fase 7 (klaster v24, best-effort) ----------

  /** Baca baris minimal item tersimpan untuk pengelompokan klaster. */
  async bacaItemUntukKlaster(
    itemIds: string[],
  ): Promise<BarisItemKlaster[]> {
    if (itemIds.length === 0) return [];
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("id, judul, sumber_id, waktu_terbit_asli, waktu_diambil")
      .in("id", itemIds);
    if (error) throw new Error(`bacaItemUntukKlaster gagal: ${error.message}`);
    return (data ?? []).map((baris) => ({
      id: baris.id as string,
      judul: baris.judul as string,
      sumber_id: (baris.sumber_id as string | null) ?? null,
      waktu_terbit_asli: (baris.waktu_terbit_asli as string | null) ?? null,
      waktu_diambil: baris.waktu_diambil as string,
    }));
  }

  /**
   * Simpan satu klaster + anggotanya (upsert berdasarkan kunci;
   * anggota duplikat diabaikan). Melempar bila tabel v24 belum ada —
   * engine menangkapnya dan melanjutkan ingestion tanpa klaster.
   */
  async simpanKlaster(input: {
    kunci: string;
    judul: string;
    itemIds: string[];
  }): Promise<string | void> {
    const { data, error } = await this.klien
      .from("pf_item_clusters")
      .upsert(
        { kunci: input.kunci, judul: input.judul },
        { onConflict: "kunci" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`simpanKlaster gagal: ${error.message}`);
    const clusterId = data.id as string;
    if (input.itemIds.length > 0) {
      const { error: errorAnggota } = await this.klien
        .from("pf_item_cluster_members")
        .upsert(
          input.itemIds.map((rawItemId) => ({
            cluster_id: clusterId,
            raw_item_id: rawItemId,
          })),
          { onConflict: "cluster_id,raw_item_id" },
        );
      if (errorAnggota) {
        throw new Error(`simpanKlaster (anggota) gagal: ${errorAnggota.message}`);
      }
    }
    return clusterId;
  }
}

// Factory bawaan: melempar error jelas bila service key belum diatur
// (route handler mengubahnya menjadi 503 yang jujur).
export function buatSupabaseAdapter(): SupabaseIngestionAdapter {
  return new SupabaseIngestionAdapter();
}
