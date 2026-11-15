// Adapter Supabase untuk pipeline editorial AI PRATA FAKTA.
// Memakai service role key agar bisa menulis pf_ai_runs / pf_claims /
// pf_evidence / pf_verification_records / pf_daily_briefs /
// pf_articles / pf_raw_items melewati RLS (hanya dipakai di sisi
// server — route handler / cron — JANGAN pernah dipakai di browser).
// Tanpa secret di repo: URL + key dibaca dari environment.
// Pola mengikuti src/lib/ingestion/supabase-adapter.ts.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { polaPencarianInti } from "./research.ts";
import type {
  AiAdapter,
  ArtikelDrafRingkas,
  BriefTersimpan,
  CatatRunInput,
  ItemSerupa,
  JenisKlaim,
  KlaimSerupa,
  KlaimTanpaVerifikasi,
  RawItemAntrean,
  SimpanArtikelInput,
  SimpanBuktiInput,
  SimpanKlaimInput,
  SimpanVerificationInput,
  SumberRingkas,
  TutupRunPatch,
} from "./types.ts";

function ambilEnv(nama: string): string | undefined {
  const nilai = process.env[nama];
  return nilai && nilai.trim() ? nilai.trim() : undefined;
}

function estimasiBacaMenit(isi: string): number {
  const kata = isi.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(kata / 200));
}

export class SupabaseAiAdapter implements AiAdapter {
  private klien: SupabaseClient;

  constructor(url?: string, serviceRoleKey?: string) {
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

  async ambilAntrean(limit: number): Promise<RawItemAntrean[]> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select(
        "id, sumber_id, url, judul, ringkasan, isi_ringkas, penulis, " +
          "waktu_terbit_asli, waktu_diambil, status, disalin_dari_id, " +
          "metadata, pf_sources(nama, prioritas)",
      )
      .eq("status_verifikasi", "UNCONFIRMED")
      .order("prioritas", { foreignTable: "pf_sources", ascending: false })
      .order("waktu_terbit_asli", { ascending: false })
      .order("waktu_diambil", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`ambilAntrean gagal: ${error.message}`);
    // Select memakai embed pf_sources: tipe bawaan supabase-js tidak
    // bisa mengurai string select ini, jadi baca lewat unknown.
    const barisSemua = (data as unknown as Array<Record<string, unknown>> | null) ?? [];
    return barisSemua.map((baris) => {
      const sumber = baris.pf_sources as
        | { nama?: string; prioritas?: number }
        | null
        | undefined;
      return {
        id: baris.id as string,
        sumber_id: (baris.sumber_id as string | null) ?? null,
        sumber_nama:
          typeof sumber?.nama === "string" && sumber.nama
            ? sumber.nama
            : "Tidak diketahui",
        sumber_prioritas:
          typeof sumber?.prioritas === "number" ? sumber.prioritas : 0,
        url: baris.url as string,
        judul: baris.judul as string,
        ringkasan: (baris.ringkasan as string) ?? "",
        isi_ringkas: (baris.isi_ringkas as string) ?? "",
        penulis: (baris.penulis as string | null) ?? null,
        waktu_terbit_asli: (baris.waktu_terbit_asli as string | null) ?? null,
        waktu_diambil: baris.waktu_diambil as string,
        status: baris.status as string,
        disalin_dari_id: (baris.disalin_dari_id as string | null) ?? null,
        metadata:
          (baris.metadata as Record<string, unknown> | null) ?? null,
      };
    });
  }

  async ambilSumber(id: string): Promise<SumberRingkas | null> {
    if (!id) return null;
    const { data, error } = await this.klien
      .from("pf_sources")
      .select("id, nama, jenis, url, prioritas")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`ambilSumber gagal: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id as string,
      nama: data.nama as string,
      jenis: data.jenis as string,
      url: data.url as string,
      prioritas: data.prioritas as number,
    };
  }

  async ambilItemSerupa(
    hashJudul: string,
    kecualiId: string,
  ): Promise<ItemSerupa[]> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select(
        "id, sumber_id, url, judul, ringkasan, waktu_terbit_asli, disalin_dari_id",
      )
      .eq("hash_judul", hashJudul)
      .neq("id", kecualiId)
      .order("waktu_diambil", { ascending: true });
    if (error) throw new Error(`ambilItemSerupa gagal: ${error.message}`);
    return (data ?? []).map((baris) => ({
      id: baris.id as string,
      sumber_id: (baris.sumber_id as string | null) ?? null,
      url: baris.url as string,
      judul: baris.judul as string,
      ringkasan: (baris.ringkasan as string) ?? "",
      waktu_terbit_asli: (baris.waktu_terbit_asli as string | null) ?? null,
      disalin_dari_id: (baris.disalin_dari_id as string | null) ?? null,
    }));
  }

  // Pencarian kandidat koroborasi: pola token dari polaPencarianInti
  // (recall longgar — presisi dijamin verification.ts). Loloskan
  // karakter wildcard LIKE (%, _, \) agar inti klaim yang
  // mengandung '%' tidak melebar menjadi pola.
  async cariKlaimSerupa(
    inti: string,
    kecualiItemId: string,
    batas = 20,
  ): Promise<KlaimSerupa[]> {
    const pola = polaPencarianInti(inti);
    const { data, error } = await this.klien
      .from("pf_claims")
      .select(
        "id, raw_item_id, teks, jenis, " +
          "pf_raw_items!inner(sumber_id, judul, url, ringkasan, waktu_terbit_asli, disalin_dari_id)",
      )
      .ilike("teks", pola)
      .neq("raw_item_id", kecualiItemId)
      .order("dibuat_pada", { ascending: true })
      .limit(batas);
    if (error) throw new Error(`cariKlaimSerupa gagal: ${error.message}`);
    const barisSemua = (data as unknown as Array<Record<string, unknown>> | null) ?? [];
    return barisSemua.map((baris) => {
      const item = baris.pf_raw_items as
        | {
            sumber_id?: string | null;
            judul?: string;
            url?: string;
            ringkasan?: string;
            waktu_terbit_asli?: string | null;
            disalin_dari_id?: string | null;
          }
        | null
        | undefined;
      return {
        id: baris.id as string,
        raw_item_id: baris.raw_item_id as string,
        teks: baris.teks as string,
        jenis: baris.jenis as JenisKlaim,
        sumber_id: (item?.sumber_id as string | null) ?? null,
        judul_item: (item?.judul as string) ?? "",
        url_item: (item?.url as string) ?? "",
        ringkasan_item: (item?.ringkasan as string) ?? "",
        waktu_terbit_asli: (item?.waktu_terbit_asli as string | null) ?? null,
        disalin_dari_id: (item?.disalin_dari_id as string | null) ?? null,
      };
    });
  }

  async catatRun(run: CatatRunInput): Promise<string> {
    const { data, error } = await this.klien
      .from("pf_ai_runs")
      .insert({
        agen: run.agen,
        input_ref: run.input_ref ?? null,
        input_jenis: run.input_jenis ?? "raw_item",
        dipicu_oleh: run.dipicu_oleh ?? "manual",
      })
      .select("id")
      .single();
    if (error) throw new Error(`catatRun gagal: ${error.message}`);
    return data.id as string;
  }

  async tutupRun(id: string, patch: TutupRunPatch): Promise<void> {
    const { error } = await this.klien
      .from("pf_ai_runs")
      .update({
        status: patch.status,
        error: patch.error ?? null,
        durasi_ms: patch.durasi_ms ?? null,
        output_ref: patch.output_ref ?? null,
        detail: patch.detail ?? {},
        selesai_pada: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(`tutupRun gagal: ${error.message}`);
  }

  async simpanKlaim(k: SimpanKlaimInput): Promise<string> {
    if (!k.raw_item_id && !k.artikel_id) {
      throw new Error(
        "simpanKlaim: raw_item_id atau artikel_id wajib diisi (check pf_claims).",
      );
    }
    const { data, error } = await this.klien
      .from("pf_claims")
      .insert({
        raw_item_id: k.raw_item_id ?? null,
        artikel_id: k.artikel_id ?? null,
        teks: k.teks,
        jenis: k.jenis,
      })
      .select("id")
      .single();
    if (error) throw new Error(`simpanKlaim gagal: ${error.message}`);
    return data.id as string;
  }

  async cariKlaimSama(raw_item_id: string, teks: string): Promise<string | null> {
    const { data, error } = await this.klien
      .from("pf_claims")
      .select("id")
      .eq("raw_item_id", raw_item_id)
      .eq("teks", teks)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`cariKlaimSama gagal: ${error.message}`);
    return data ? (data.id as string) : null;
  }

  async simpanBukti(b: SimpanBuktiInput): Promise<void> {
    const { error } = await this.klien.from("pf_evidence").insert({
      klaim_id: b.klaim_id,
      sumber_url: b.sumber_url,
      sumber_nama: b.sumber_nama ?? null,
      kutipan: b.kutipan ?? null,
      arah: b.arah,
    });
    if (error) throw new Error(`simpanBukti gagal: ${error.message}`);
  }

  async simpanVerification(r: SimpanVerificationInput): Promise<string> {
    const { data, error } = await this.klien
      .from("pf_verification_records")
      .insert({
        artikel_id: r.artikel_id ?? null,
        raw_item_id: r.raw_item_id,
        keputusan: r.keputusan,
        catatan: r.catatan ?? null,
        bukti: r.bukti ?? [],
      })
      .select("id")
      .single();
    if (error) throw new Error(`simpanVerification gagal: ${error.message}`);
    return data.id as string;
  }

  async simpanArtikel(d: SimpanArtikelInput): Promise<string> {
    const { data, error } = await this.klien
      .from("pf_articles")
      .insert({
        slug: d.slug,
        judul: d.judul,
        subjudul: d.subjudul ?? null,
        ringkasan: d.ringkasan,
        isi: d.isi,
        kategori_slug: d.kategori_slug,
        status_verifikasi: d.status_verifikasi,
        // Draf SELALU 'draft' — tidak pernah auto-terbit.
        status: "draft",
        penulis_nama: d.penulis_nama,
        sumber_url: d.sumber_url,
        kronologi: d.kronologi,
        fakta_penting: d.fakta_penting,
        mengapa_penting: d.mengapa_penting ?? null,
        belum_diketahui: d.belum_diketahui ?? null,
        raw_item_id: d.raw_item_id,
        estimasi_baca_menit: estimasiBacaMenit(d.isi),
      })
      .select("id")
      .single();
    if (error) throw new Error(`simpanArtikel gagal: ${error.message}`);
    return data.id as string;
  }

  async perbaruiStatusItem(
    id: string,
    status_verifikasi: string,
  ): Promise<void> {
    const { error } = await this.klien
      .from("pf_raw_items")
      .update({ status_verifikasi })
      .eq("id", id);
    if (error) throw new Error(`perbaruiStatusItem gagal: ${error.message}`);
  }

  async ambilKlaimTanpaVerifikasi(
    limit: number,
  ): Promise<KlaimTanpaVerifikasi[]> {
    // Catatan: PostgREST tidak menyediakan anti-join NOT EXISTS secara
    // langsung, jadi verifikasi disaring di sini: ambil klaim tertua
    // (3x limit) + daftar id yang sudah punya verification record
    // (maks 1000 baris terakhir), lalu saring di memori. Bila
    // verification record melebihi 1000 baris, sebagian klaim lama
    // yang sebenarnya sudah terverifikasi bisa ikut terambil — tetap
    // aman (hanya dibaca ulang, tidak ditulis ganda).
    const { data: klaim, error: errorKlaim } = await this.klien
      .from("pf_claims")
      .select("id, teks, raw_item_id, artikel_id")
      .order("dibuat_pada", { ascending: true })
      .limit(limit * 3);
    if (errorKlaim) {
      throw new Error(`ambilKlaimTanpaVerifikasi gagal: ${errorKlaim.message}`);
    }
    const { data: verifikasi, error: errorVer } = await this.klien
      .from("pf_verification_records")
      .select("raw_item_id, artikel_id")
      .limit(1000);
    if (errorVer) {
      throw new Error(`ambilKlaimTanpaVerifikasi gagal: ${errorVer.message}`);
    }
    const sudahRaw = new Set(
      (verifikasi ?? [])
        .map((v) => v.raw_item_id as string | null)
        .filter((v): v is string => !!v),
    );
    const sudahArtikel = new Set(
      (verifikasi ?? [])
        .map((v) => v.artikel_id as string | null)
        .filter((v): v is string => !!v),
    );
    return (klaim ?? [])
      .filter(
        (k) =>
          !(
            (k.raw_item_id && sudahRaw.has(k.raw_item_id as string)) ||
            (k.artikel_id && sudahArtikel.has(k.artikel_id as string))
          ),
      )
      .slice(0, limit)
      .map((k) => ({
        id: k.id as string,
        teks: k.teks as string,
        raw_item_id: (k.raw_item_id as string | null) ?? null,
        artikel_id: (k.artikel_id as string | null) ?? null,
      }));
  }

  async simpanBrief(tanggal: string, isi: unknown): Promise<string> {
    const { data, error } = await this.klien
      .from("pf_daily_briefs")
      .upsert(
        { tanggal, isi, status: "draft" },
        { onConflict: "tanggal" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`simpanBrief gagal: ${error.message}`);
    return data.id as string;
  }

  async ambilBriefTerbaru(): Promise<BriefTersimpan | null> {
    const { data, error } = await this.klien
      .from("pf_daily_briefs")
      .select("id, tanggal, isi, status")
      .order("tanggal", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`ambilBriefTerbaru gagal: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id as string,
      tanggal: data.tanggal as string,
      isi: data.isi as unknown,
      status: data.status as string,
    };
  }

  async ambilDrafArtikel(limit: number): Promise<ArtikelDrafRingkas[]> {
    const { data, error } = await this.klien
      .from("pf_articles")
      .select("judul, ringkasan, kategori_slug, status_verifikasi, sumber_url, dibuat_pada")
      .eq("status", "draft")
      .order("dibuat_pada", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`ambilDrafArtikel gagal: ${error.message}`);
    return (data ?? []).map((d) => ({
      judul: d.judul as string,
      ringkasan: d.ringkasan as string,
      kategori_slug: d.kategori_slug as string,
      status_verifikasi: d.status_verifikasi as string,
      sumber_url: d.sumber_url as string,
      dibuat_pada: d.dibuat_pada as string,
    }));
  }
}

// Factory bawaan: melempar error jelas bila service key belum diatur
// (route handler mengubahnya menjadi 503 yang jujur).
export function buatSupabaseAiAdapter(): SupabaseAiAdapter {
  return new SupabaseAiAdapter();
}
