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

// ---------- Penanda "sedang diproses" (Fase 5, migrasi v23) ----------
// Penanda diproses_pada dianggap basi sesudah 30 menit: satu
// panggilan pipeline paling lama ~5 menit (gateway memutus di ~5
// menit; 50 item ~7,5 menit), jadi penanda yang lebih tua dari
// 30 menit pasti milik worker yang mati — boleh diklaim ulang run
// berikutnya. 30 menit juga jauh lebih singkat dari interval cron
// editorial (2 jam), jadi item yatim tidak menunggu lama.
export const BATAS_BASI_TANDA_DIPROSES_MENIT = 30;

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

  // Kueri dasar antrean UNCONFIRMED dengan urutan yang sama untuk
  // pemilihan kandidat (select "id") maupun pengambilan baris penuh.
  private kueriAntrean(kolom: string, mode: "terbaru" | "terlama") {
    const kueri = this.klien
      .from("pf_raw_items")
      .select(kolom)
      .eq("status_verifikasi", "UNCONFIRMED");
    if (mode === "terlama") {
      // P2-8 (integrasi B1): mode kejar — item TERTUA dulu
      // (waktu_diambil ASC), tanpa memandang prioritas/tanggal
      // terbit, agar antrean lama terkuras sebelum kedaluwarsa.
      kueri.order("waktu_diambil", { ascending: true });
    } else {
      kueri
        .order("prioritas", { foreignTable: "pf_sources", ascending: false })
        // P1-1 (N-T2): item tanpa tanggal terbit PALING BELAKANG
        // (NULLS LAST) — tanggal tidak diketahui bukan berarti baru.
        .order("waktu_terbit_asli", { ascending: false, nullsFirst: false })
        .order("waktu_diambil", { ascending: false });
    }
    return kueri;
  }

  async ambilAntrean(
    limit: number,
    mode: "terbaru" | "terlama" = "terbaru",
    opsi: { klaim?: boolean } = {},
  ): Promise<RawItemAntrean[]> {
    const kolomPenuh =
      "id, sumber_id, url, judul, ringkasan, isi_ringkas, penulis, " +
      "waktu_terbit_asli, waktu_diambil, status, disalin_dari_id, " +
      "metadata, pf_sources(nama, prioritas)";
    // 1. Pilih kandidat (id saja, urutan antrean dipertahankan).
    // PGRST108 (run #27/#28, 17 Nov 2026): PostgREST MENOLAK
    // .order("prioritas", { foreignTable: "pf_sources" }) bila
    // pf_sources TIDAK ikut di-embed di select — "is not an
    // embedded resource in this request" (HTTP 500). Karena
    // kueriAntrean mode "terbaru" mengurutkan berdasarkan
    // prioritas sumber, select kandidat WAJIB meng-embed
    // pf_sources(prioritas); kolom tambahannya diabaikan di bawah
    // (hanya .id yang dipakai). Embed-nya sendiri sah — FK
    // pf_raw_items.sumber_id -> pf_sources(id) ada sejak migrasi v3
    // (terbukti: select dengan embed tidak error di produksi).
    const { data: kandidat, error: errKandidat } = await this.kueriAntrean(
      "id, pf_sources(prioritas)",
      mode,
    ).limit(limit);
    if (errKandidat)
      throw new Error(`ambilAntrean gagal: ${errKandidat.message}`);
    const ids = (
      (kandidat as unknown as Array<{ id: string }> | null) ?? []
    ).map((b) => b.id);
    if (ids.length === 0) return [];

    // 2. Klaim atomik (Fase 5, bila diminta): UPDATE bersyarat —
    // hanya baris yang penandanya masih kosong/basi yang berhasil
    // diklaim. Dua worker yang memilih kandidat yang sama: UPDATE
    // kedua mengevaluasi ulang WHERE sesudah commit pertama dan
    // mendapat 0 baris untuk item yang sudah diklaim — item yang
    // sedang diproses worker lain tidak pernah terambil.
    // Kegagalan klaim (mis. kolom v23 belum diterapkan di produksi)
    // TIDAK menggagalkan antrean: degradasi anggun ke perilaku lama
    // (kandidat dikembalikan tanpa penanda); lock job tetap penjaga
    // utama, penanda hanya pertahanan lapis kedua.
    let idsTerpilih = ids;
    if (opsi.klaim) {
      try {
        const batasBasi = new Date(
          Date.now() - BATAS_BASI_TANDA_DIPROSES_MENIT * 60_000,
        ).toISOString();
        const { data: diklaim, error: errKlaim } = await this.klien
          .from("pf_raw_items")
          .update({ diproses_pada: new Date().toISOString() })
          .in("id", ids)
          .or(
            `diproses_pada.is.null,diproses_pada.lt.${batasBasi}`,
          )
          .select("id");
        if (errKlaim) throw errKlaim;
        idsTerpilih = (
          (diklaim as unknown as Array<{ id: string }> | null) ?? []
        ).map((b) => b.id);
        if (idsTerpilih.length === 0) return [];
      } catch {
        idsTerpilih = ids;
      }
    }

    // 3. Ambil baris penuh untuk id terpilih (urutan antrean sama).
    const { data, error } = await this.kueriAntrean(kolomPenuh, mode).in(
      "id",
      idsTerpilih,
    );
    if (error) throw new Error(`ambilAntrean gagal: ${error.message}`);
    // Select memakai embed pf_sources: tipe bawaan supabase-js tidak
    // bisa mengurai string select ini, jadi baca lewat unknown.
    const barisSemua = (data as unknown as Array<Record<string, unknown>> | null) ?? [];
    return barisSemua.map((baris) => {
      const sumber = baris.pf_sources as
        | { nama?: string; prioritas?: number }
        | null
        | undefined;
      // Foto sumber tersimpan di metadata.gambar_url (BUKAN kolom —
      // pf_raw_items tidak punya kolom gambar_url; baca kolom itu
      // akan gagal 42703 di produksi).
      const meta = (baris.metadata as Record<string, unknown> | null) ?? null;
      const gambarUrl =
        meta && typeof meta.gambar_url === "string" && meta.gambar_url
          ? meta.gambar_url
          : null;
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
        gambar_url: gambarUrl,
        metadata: meta,
      };
    });
  }

  // Tandai SATU item "sedang diproses" (Fase 5, migrasi v23) —
  // dipakai pipeline untuk jalur hanyaItemId (satu item, bukan
  // batch). Mengembalikan true bila penanda berhasil diklaim
  // (kosong/basi), false bila item sedang diproses worker lain.
  // Metode opsional (pola AdapterRekonsiliasi di pipeline.ts):
  // adapter tanpa metode ini tetap jalan — penandaan satu item
  // best-effort, lock job tetap penjaga utama. Bila kolom v23
  // belum ada, mengembalikan false (bukan melempar).
  async tandaiItemDiproses(id: string): Promise<boolean> {
    try {
      const batasBasi = new Date(
        Date.now() - BATAS_BASI_TANDA_DIPROSES_MENIT * 60_000,
      ).toISOString();
      const { data, error } = await this.klien
        .from("pf_raw_items")
        .update({ diproses_pada: new Date().toISOString() })
        .eq("id", id)
        .or(`diproses_pada.is.null,diproses_pada.lt.${batasBasi}`)
        .select("id")
        .maybeSingle();
      if (error) return false;
      return data !== null && data !== undefined;
    } catch {
      return false;
    }
  }

  // P2-8 (integrasi B1): waktu diambil item UNCONFIRMED tertua
  // (ISO) atau null bila antrean kosong — dipakai pipeline
  // memutuskan mode kejar ("terlama") sebelum mengambil antrean.
  async ambilWaktuAntreanTertua(): Promise<string | null> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select("waktu_diambil")
      .eq("status_verifikasi", "UNCONFIRMED")
      .order("waktu_diambil", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new Error(`ambilWaktuAntreanTertua gagal: ${error.message}`);
    return (data as { waktu_diambil?: string } | null)?.waktu_diambil ?? null;
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

  // P2-10 (N-S12): dedup evidence per (klaim_id, sumber_url) di
  // kode SEBELUM insert — run ulang atas item yang sama tidak
  // boleh menumpuk baris evidence duplikat. Bila pasangan sudah
  // ada, insert dilewati diam-diam (idempotent).
  // (Unique index DB per (klaim_id, sumber_url) adalah follow-up
  // migrasi v13 — cek-lalu-sisip di sini tetap punya celah race
  // bila dua run bersamaan; indeks itulah penutupnya.)
  async simpanBukti(b: SimpanBuktiInput): Promise<void> {
    const { data: sudahAda, error: errCek } = await this.klien
      .from("pf_evidence")
      .select("id")
      .eq("klaim_id", b.klaim_id)
      .eq("sumber_url", b.sumber_url)
      .limit(1)
      .maybeSingle();
    if (errCek) throw new Error(`simpanBukti gagal: ${errCek.message}`);
    if (sudahAda) return;
    const { error } = await this.klien.from("pf_evidence").insert({
      klaim_id: b.klaim_id,
      sumber_url: b.sumber_url,
      sumber_nama: b.sumber_nama ?? null,
      kutipan: b.kutipan ?? null,
      arah: b.arah,
    });
    if (error) throw new Error(`simpanBukti gagal: ${error.message}`);
  }

  /** True bila evidence untuk pasangan (klaim_id, sumber_url)
   *  sudah ada — dipakai pipeline untuk menghitung evidence baru
   *  secara jujur (simpanBukti bertipe void di interface). */
  async cariBuktiSama(
    klaim_id: string,
    sumber_url: string,
  ): Promise<boolean> {
    const { data, error } = await this.klien
      .from("pf_evidence")
      .select("id")
      .eq("klaim_id", klaim_id)
      .eq("sumber_url", sumber_url)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`cariBuktiSama gagal: ${error.message}`);
    return !!data;
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
        // Foto sumber ikut ke artikel agar halaman artikel tidak
        // placeholder kosong (halaman sudah merender gambar_url).
        gambar_url: d.gambar_url ?? null,
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
    // Fase 5 (v23): lepas penanda "sedang diproses" — item sudah
    // diputuskan, tidak lagi menunggu di antrean. Best-effort dan
    // TERPISAH dari update status di atas: bila kolom v23 belum ada,
    // kegagalan di sini tidak boleh menggagalkan update status
    // (penanda yang tertinggal dibersihkan oleh kebasian 30 menit).
    // Jalur yang TIDAK memanggil perbaruiStatusItem (riset gagal,
    // draf gagal, worker crash) mengandalkan kebasian itu.
    try {
      await this.klien
        .from("pf_raw_items")
        .update({ diproses_pada: null })
        .eq("id", id);
    } catch {
      // Abaikan — penanda basi yang membersihkan.
    }
  }

  // ---------- Batas ulang quality_check (v29) ----------
  // Item yang gagal quality_check 3x berturut-turut ditandai
  // terminal 'DITOLAK' (migrasi v29 §1–§2) agar tidak diklaim
  // antrean tiap run selamanya (akar run pipeline #32: status
  // tetap UNCONFIRMED sesudah gagal, jadi dicoba lagi tanpa
  // pernah lolos). KEDUA metode fail-open (BAYANGAN pola
  // diproses_pada di atas): sebelum migrasi v29 diterapkan,
  // kolom qc_gagal_berturut_turut BELUM ADA — select/update
  // mengembalikan galat (PGRST204) dan metode diam-diam
  // mengembalikan "tidak diketahui" TANPA melempar, agar
  // pipeline lama tetap berjalan. JANGAN mengubah ke throw.
  //   catatGagalQualityCheck: tambah 1; di 3 ubah status
  //     menjadi 'DITOLAK' (update bersyarat status masih
  //     UNCONFIRMED — bila status sudah berubah di tengah
  //     jalan, flip tidak terjadi dan terminal=false).
  //   resetGagalQualityCheck: nol-kan sesudah item berhasil
  //     diproses (langkah 8) — "berturut-turut" dihitung dalam
  //     satu rentang UNCONFIRMED, bukan sepanjang hidup item.
  async catatGagalQualityCheck(
    itemId: string,
  ): Promise<{ terminal: boolean; hitungan: number | null }> {
    try {
      const { data, error } = await this.klien
        .from("pf_raw_items")
        .select("qc_gagal_berturut_turut")
        .eq("id", itemId)
        .maybeSingle();
      if (error || !data) return { terminal: false, hitungan: null };
      const hitungan =
        ((data.qc_gagal_berturut_turut as number | null) ?? 0) + 1;
      if (hitungan >= 3) {
        // Update BERSYARAT status masih UNCONFIRMED + minta
        // baris yang ter-update kembali (.select): bila status
        // sudah berubah di tengah jalan, 0 baris ter-update dan
        // terminal=false (jangan klaim flip yang tidak terjadi).
        const { data: flip, error: errFlip } = await this.klien
          .from("pf_raw_items")
          .update({
            qc_gagal_berturut_turut: hitungan,
            status_verifikasi: "DITOLAK",
          })
          .eq("id", itemId)
          .eq("status_verifikasi", "UNCONFIRMED")
          .select("id");
        if (errFlip) return { terminal: false, hitungan };
        return {
          terminal: Array.isArray(flip) && flip.length > 0,
          hitungan,
        };
      }
      const { error: errNaik } = await this.klien
        .from("pf_raw_items")
        .update({ qc_gagal_berturut_turut: hitungan })
        .eq("id", itemId);
      if (errNaik) return { terminal: false, hitungan: null };
      return { terminal: false, hitungan };
    } catch {
      return { terminal: false, hitungan: null };
    }
  }

  async resetGagalQualityCheck(itemId: string): Promise<void> {
    try {
      await this.klien
        .from("pf_raw_items")
        .update({ qc_gagal_berturut_turut: 0 })
        .eq("id", itemId);
    } catch {
      // Abaikan — kolom pra-v29 belum ada.
    }
  }

  async simpanMetadataItem(
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.klien
      .from("pf_raw_items")
      .update({ metadata })
      .eq("id", id);
    if (error) throw new Error(`simpanMetadataItem gagal: ${error.message}`);
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

  async simpanBrief(
    tanggal: string,
    isi: unknown,
    status: "draft" | "terbit" = "draft",
  ): Promise<string> {
    // v29: status 'terbit' HANYA dipakai Daily Brief mode artikel
    // terbit (jalankanBriefHarian) — semua entri sudah terbit.
    // Bila status 'terbit', isi juga diterbitkan_pada (dipakai
    // /brief + daftar brief admin). Upsert per tanggal seperti
    // semula; pemanggil yang sama (lock job "brief") menjamin
    // tidak ada dua penulis bersamaan.
    const baris: Record<string, unknown> = { tanggal, isi, status };
    if (status === "terbit") {
      baris.diterbitkan_pada = new Date().toISOString();
    }
    const { data, error } = await this.klien
      .from("pf_daily_briefs")
      .upsert(baris, { onConflict: "tanggal" })
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
      .select(
        "id, judul, ringkasan, kategori_slug, status_verifikasi, sumber_url, dibuat_pada, raw_item_id",
      )
      .eq("status", "draft")
      .order("dibuat_pada", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`ambilDrafArtikel gagal: ${error.message}`);
    const draf = (data ?? []) as Array<{
      id: string;
      judul: string;
      ringkasan: string;
      kategori_slug: string;
      status_verifikasi: string;
      sumber_url: string;
      dibuat_pada: string;
      raw_item_id: string | null;
    }>;
    // P2-4 (N-S7): waktu terbit asli berita dibaca dari raw item
    // asal draf (bukan dibuat_pada draf). Draf manual/lama tanpa
    // raw_item_id -> waktu_terbit_asli null (label "tanggal tidak
    // diketahui" di entriBriefDariDraf).
    const ids = [...new Set(
      draf.map((d) => d.raw_item_id).filter((v): v is string => !!v),
    )];
    const waktuPerItem = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: itemRows, error: errItem } = await this.klien
        .from("pf_raw_items")
        .select("id, waktu_terbit_asli")
        .in("id", ids);
      if (errItem) {
        throw new Error(`ambilDrafArtikel gagal: ${errItem.message}`);
      }
      for (const row of (itemRows ?? []) as Array<{
        id: string;
        waktu_terbit_asli: string | null;
      }>) {
        waktuPerItem.set(row.id, row.waktu_terbit_asli);
      }
    }
    return draf.map((d) => ({
      judul: d.judul as string,
      ringkasan: d.ringkasan as string,
      kategori_slug: d.kategori_slug as string,
      status_verifikasi: d.status_verifikasi as string,
      sumber_url: d.sumber_url as string,
      dibuat_pada: d.dibuat_pada as string,
      raw_item_id: d.raw_item_id,
      waktu_terbit_asli: d.raw_item_id
        ? (waktuPerItem.get(d.raw_item_id) ?? null)
        : null,
    }));
  }

  // v29 (Fitur 3): artikel TERBIT 24 jam terakhir untuk Daily
  // Brief pagi — cermin ambilDrafArtikel di atas, bedanya:
  // status='terbit', jendela diterbitkan_pada >= now-24j,
  // urutan terbaru dulu. Waktu terbit asli berita tetap dibaca
  // dari raw item asal (P2-4) seperti draf.
  async ambilArtikelTerbit24Jam(
    limit: number,
  ): Promise<ArtikelDrafRingkas[]> {
    const batas = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.klien
      .from("pf_articles")
      .select(
        "id, judul, ringkasan, kategori_slug, status_verifikasi, sumber_url, dibuat_pada, raw_item_id",
      )
      .eq("status", "terbit")
      .gte("diterbitkan_pada", batas)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error(`ambilArtikelTerbit24Jam gagal: ${error.message}`);
    }
    const terbit = (data ?? []) as Array<{
      id: string;
      judul: string;
      ringkasan: string;
      kategori_slug: string;
      status_verifikasi: string;
      sumber_url: string;
      dibuat_pada: string;
      raw_item_id: string | null;
    }>;
    const ids = [...new Set(
      terbit.map((d) => d.raw_item_id).filter((v): v is string => !!v),
    )];
    const waktuPerItem = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: itemRows, error: errItem } = await this.klien
        .from("pf_raw_items")
        .select("id, waktu_terbit_asli")
        .in("id", ids);
      if (errItem) {
        throw new Error(`ambilArtikelTerbit24Jam gagal: ${errItem.message}`);
      }
      for (const row of (itemRows ?? []) as Array<{
        id: string;
        waktu_terbit_asli: string | null;
      }>) {
        waktuPerItem.set(row.id, row.waktu_terbit_asli);
      }
    }
    return terbit.map((d) => ({
      judul: d.judul as string,
      ringkasan: d.ringkasan as string,
      kategori_slug: d.kategori_slug as string,
      status_verifikasi: d.status_verifikasi as string,
      sumber_url: d.sumber_url as string,
      dibuat_pada: d.dibuat_pada as string,
      raw_item_id: d.raw_item_id,
      waktu_terbit_asli: d.raw_item_id
        ? (waktuPerItem.get(d.raw_item_id) ?? null)
        : null,
    }));
  }

  // ---------- Rekonsiliasi (P1-2 / N-T3) ----------
  // Metode di bawah ini BUKAN bagian interface AiAdapter (tipe
  // bersama di types.ts tidak diubah gelombang ini) — pipeline
  // memakainya lewat metode opsional dan memeriksa keberadaannya
  // dulu, agar adapter lain/uji lama tetap jalan.

  /** Item VERIFIED/CROSS-CHECKED yang belum punya artikel sama
   *  sekali (draf hilang karena status diubah sebelum draf dibuat
   *  pada versi pipeline lama, atau simpanArtikel pernah gagal). */
  async cariItemTerverifikasiTanpaArtikel(
    limit: number,
  ): Promise<RawItemAntrean[]> {
    const { data, error } = await this.klien
      .from("pf_raw_items")
      .select(
        "id, sumber_id, url, judul, ringkasan, isi_ringkas, penulis, " +
          "waktu_terbit_asli, waktu_diambil, status, disalin_dari_id, " +
          "metadata, pf_sources(nama, prioritas)",
      )
      .in("status_verifikasi", ["VERIFIED", "CROSS-CHECKED"])
      .order("waktu_diambil", { ascending: true })
      .limit(limit * 3);
    if (error) {
      throw new Error(
        `cariItemTerverifikasiTanpaArtikel gagal: ${error.message}`,
      );
    }
    const barisSemua =
      (data as unknown as Array<Record<string, unknown>> | null) ?? [];
    const { data: artikel, error: errArtikel } = await this.klien
      .from("pf_articles")
      .select("raw_item_id")
      .not("raw_item_id", "is", null)
      .limit(1000);
    if (errArtikel) {
      throw new Error(
        `cariItemTerverifikasiTanpaArtikel gagal: ${errArtikel.message}`,
      );
    }
    const sudahPunyaArtikel = new Set(
      ((artikel ?? []) as Array<{ raw_item_id: string | null }>)
        .map((a) => a.raw_item_id)
        .filter((v): v is string => !!v),
    );
    return barisSemua
      .filter((baris) => !sudahPunyaArtikel.has(baris.id as string))
      .slice(0, limit)
      .map((baris) => {
        const sumber = baris.pf_sources as
          | { nama?: string; prioritas?: number }
          | null
          | undefined;
        // Foto sumber tersimpan di metadata.gambar_url (BUKAN kolom).
        const meta = (baris.metadata as Record<string, unknown> | null) ?? null;
        const gambarUrl =
          meta && typeof meta.gambar_url === "string" && meta.gambar_url
            ? meta.gambar_url
            : null;
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
          gambar_url: gambarUrl,
          metadata: meta,
        };
      });
  }

  /** Artikel (draft) yang item asalnya VERIFIED/CROSS-CHECKED
   *  tetapi belum punya verification record ber-artikel_id
   *  (tautan P0-1 putus — mis. penulisan tautan gagal sesudah
   *  draf tersimpan). Dipakai job rekonsiliasi untuk menulis
   *  ulang tautannya. */
  async cariArtikelTanpaVerifikasiTerkait(
    limit: number,
  ): Promise<
    Array<{ artikel_id: string; raw_item_id: string; keputusan: string }>
  > {
    const { data, error } = await this.klien
      .from("pf_articles")
      .select("id, raw_item_id, status_verifikasi")
      .eq("status", "draft")
      .in("status_verifikasi", ["VERIFIED", "CROSS-CHECKED"])
      .not("raw_item_id", "is", null)
      .order("dibuat_pada", { ascending: true })
      .limit(limit * 3);
    if (error) {
      throw new Error(
        `cariArtikelTanpaVerifikasiTerkait gagal: ${error.message}`,
      );
    }
    const barisSemua =
      (data as unknown as Array<Record<string, unknown>> | null) ?? [];
    const { data: verifikasi, error: errVer } = await this.klien
      .from("pf_verification_records")
      .select("artikel_id")
      .not("artikel_id", "is", null)
      .limit(1000);
    if (errVer) {
      throw new Error(
        `cariArtikelTanpaVerifikasiTerkait gagal: ${errVer.message}`,
      );
    }
    const sudahTertaut = new Set(
      ((verifikasi ?? []) as Array<{ artikel_id: string | null }>)
        .map((v) => v.artikel_id)
        .filter((v): v is string => !!v),
    );
    return barisSemua
      .filter((b) => !sudahTertaut.has(b.id as string))
      .slice(0, limit)
      .map((b) => ({
        artikel_id: b.id as string,
        raw_item_id: b.raw_item_id as string,
        keputusan: b.status_verifikasi as string,
      }));
  }

  /** Id artikel yang sudah dibuat dari satu raw item (atau null).
   *  Dipakai pipeline agar run ulang atas item yang drafnya sudah
   *  ada tidak membuat draf duplikat (bentrok slug). */
  async cariArtikelUntukItem(rawItemId: string): Promise<string | null> {
    const { data, error } = await this.klien
      .from("pf_articles")
      .select("id")
      .eq("raw_item_id", rawItemId)
      .order("dibuat_pada", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`cariArtikelUntukItem gagal: ${error.message}`);
    }
    return data ? (data.id as string) : null;
  }
}

// Factory bawaan: melempar error jelas bila service key belum diatur
// (route handler mengubahnya menjadi 503 yang jujur).
export function buatSupabaseAiAdapter(): SupabaseAiAdapter {
  return new SupabaseAiAdapter();
}
