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

  async simpanItem(item: ItemSimpan): Promise<void> {
    const { error } = await this.klien.from("pf_raw_items").insert({
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
    });
    if (error) throw new Error(`simpanItem gagal: ${error.message}`);
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
    const { error } = await this.klien
      .from("pf_ingestion_runs")
      .update({
        selesai_pada: patch.selesai_pada.toISOString(),
        status: patch.status,
        ditemukan: patch.ditemukan,
        baru: patch.baru,
        duplikat: patch.duplikat,
        ditolak: patch.ditolak,
        gagal: patch.gagal,
        error: patch.error,
      })
      .eq("id", id);
    if (error) throw new Error(`tutupRun gagal: ${error.message}`);
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
}

// Factory bawaan: melempar error jelas bila service key belum diatur
// (route handler mengubahnya menjadi 503 yang jujur).
export function buatSupabaseAdapter(): SupabaseIngestionAdapter {
  return new SupabaseIngestionAdapter();
}
