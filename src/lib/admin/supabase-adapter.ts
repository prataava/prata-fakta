// Adapter Supabase untuk lapisan admin PRATA FAKTA (Fase 5).
// Memakai createServiceClient() (service role, bypass RLS) — otorisasi
// SUDAH diperiksa guard route sebelum adapter dipanggil. Adapter ini
// TIDAK berisi aturan bisnis (aturan ada di editorial.ts).
// Galat "tabel belum ada" (migrasi belum dijalankan) dan "service key
// belum diatur" dilempar dengan awalan LAYANAN_BELUM_SIAP agar route
// bisa menjawab 503 yang jujur.
import { createServiceClient } from "../supabase/service.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { galatKolomBelumAda } from "../galat.ts";
import {
  AWALAN_BELUM_SIAP,
  adalahGalatTabelBelumAda,
  type AdminAdapter,
  type Artikel,
  type ArtikelInput,
  type ArtikelPatch,
  type AuditInput,
  type AuditLog,
  type BriefAdmin,
  type CatatanVerifikasi,
  type EvidenceArtikel,
  type FilterArtikel,
  type FilterAudit,
  type HasilListArtikel,
  type HasilListAudit,
  type JobPatch,
  type JobTerjadwal,
  type Kategori,
  type KategoriInput,
  type KategoriPatch,
  type KesehatanSupabase,
  type KlaimArtikel,
  type Koreksi,
  type NamaJob,
  type PenggunaAdmin,
  type Review,
  type ReviewInput,
  type RingkasanAdmin,
  type RunAi,
  type RunIngestion,
  type StatusKoreksi,
  type StatusVerifikasi,
  type SumberArtikel,
  type VerificationInput,
  type VersiArtikel,
  type VersiInput,
} from "./types.ts";
import type { Role } from "../auth/roles.ts";

const KOLOM_ARTIKEL =
  "id,slug,judul,subjudul,ringkasan,isi,kategori_slug,subkategori_slug," +
  "status_verifikasi,status,penulis_nama,penulis_id,sumber_url,gambar_url," +
  "estimasi_baca_menit,kronologi,fakta_penting,data_pendukung,mengapa_penting," +
  "dampak,belum_diketahui,dijadwalkan_pada,diterbitkan_pada,diterbitkan_oleh," +
  "dibuat_pada,diperbarui_pada";

const KOLOM_AI_RUN =
  "id,agen,input_ref,input_jenis,output_ref,status,error,durasi_ms," +
  "detail,dipicu_oleh,dimulai_pada,selesai_pada";

export class SupabaseAdminAdapter implements AdminAdapter {
  private klienCache: SupabaseClient | null = null;

  private klien(): SupabaseClient {
    if (this.klienCache) return this.klienCache;
    try {
      this.klienCache = createServiceClient();
    } catch (err) {
      throw new Error(
        `${AWALAN_BELUM_SIAP} Kunci service Supabase belum diatur.`,
        { cause: err },
      );
    }
    return this.klienCache;
  }

  /** Ubah galat Supabase menjadi Error; tandai galat tabel belum ada. */
  private lempar(nama: string, error: unknown): never {
    if (adalahGalatTabelBelumAda(error)) {
      const pesan =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "";
      throw new Error(
        `${AWALAN_BELUM_SIAP} Tabel yang dibutuhkan ${nama} belum dibuat (migrasi belum dijalankan). ${pesan}`,
      );
    }
    const pesan =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "galat tak dikenal");
    throw new Error(`${nama} gagal: ${pesan}`);
  }

  // ---------- Artikel ----------

  async getArtikel({ id }: { id: string }): Promise<Artikel | null> {
    const { data, error } = await this.klien()
      .from("pf_articles")
      .select(KOLOM_ARTIKEL)
      .eq("id", id)
      .maybeSingle();
    if (error) this.lempar("getArtikel", error);
    return (data as Artikel | null) ?? null;
  }

  async getArtikelBySlug({ slug }: { slug: string }): Promise<Artikel | null> {
    const { data, error } = await this.klien()
      .from("pf_articles")
      .select(KOLOM_ARTIKEL)
      .eq("slug", slug)
      .maybeSingle();
    if (error) this.lempar("getArtikelBySlug", error);
    return (data as Artikel | null) ?? null;
  }

  async listArtikel(filter: FilterArtikel): Promise<HasilListArtikel> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const dari = (page - 1) * limit;
    let q = this.klien()
      .from("pf_articles")
      .select(KOLOM_ARTIKEL, { count: "exact" })
      .order("dibuat_pada", { ascending: false });
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.kategori) q = q.eq("kategori_slug", filter.kategori);
    if (filter.q) {
      const pola = `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`;
      q = q.or(`judul.ilike.${pola},ringkasan.ilike.${pola}`);
    }
    const { data, error, count } = await q.range(dari, dari + limit - 1);
    if (error) this.lempar("listArtikel", error);
    return {
      artikel: (data as unknown as Artikel[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  async buatArtikel(input: ArtikelInput): Promise<Artikel> {
    const { data, error } = await this.klien()
      .from("pf_articles")
      .insert({
        slug: input.slug,
        judul: input.judul,
        subjudul: input.subjudul ?? null,
        ringkasan: input.ringkasan,
        isi: input.isi,
        kategori_slug: input.kategori_slug,
        subkategori_slug: input.subkategori_slug ?? null,
        status: "draft",
        status_verifikasi: "UNCONFIRMED",
        penulis_nama: input.penulis_nama ?? null,
        penulis_id: input.penulis_id ?? null,
        sumber_url: input.sumber_url ?? null,
        gambar_url: input.gambar_url ?? null,
        estimasi_baca_menit: input.estimasi_baca_menit ?? null,
        kronologi: input.kronologi ?? [],
        fakta_penting: input.fakta_penting ?? [],
        data_pendukung: input.data_pendukung ?? [],
        mengapa_penting: input.mengapa_penting ?? null,
        dampak: input.dampak ?? null,
        belum_diketahui: input.belum_diketahui ?? null,
        // Tahap C-5 (v15): isu artikel; pre-v15 insert ini
        // gagal PGRST204 → lempar() memetakannya ke 503 jujur.
        isu: input.isu ?? null,
      })
      .select(KOLOM_ARTIKEL)
      .single();
    if (error) this.lempar("buatArtikel", error);
    return data as unknown as Artikel;
  }

  async perbaruiArtikel({
    id,
    patch,
    harapkanStatus,
  }: {
    id: string;
    patch: ArtikelPatch;
    harapkanStatus?: string;
  }): Promise<Artikel | null> {
    const { catatan_versi: _catatan, ...kolom } = patch;
    void _catatan;
    // P2-9 (integrasi B1): bila harapkanStatus diisi, update
    // bersyarat status saat ini — dua penerbit bersamaan tidak
    // bisa sama-sama berhasil (yang kedua mendapat 0 baris).
    let kueri = this.klien()
      .from("pf_articles")
      .update(kolom)
      .eq("id", id);
    if (harapkanStatus) kueri = kueri.eq("status", harapkanStatus);
    const { data, error } = await kueri
      .select(KOLOM_ARTIKEL)
      .maybeSingle();
    if (error) this.lempar("perbaruiArtikel", error);
    return (data as Artikel | null) ?? null;
  }

  async hapusArtikel({ id }: { id: string }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_articles")
      .delete()
      .eq("id", id);
    if (error) this.lempar("hapusArtikel", error);
  }

  // Compensating T10 (follow-up 1): sisipkan kembali artikel
  // yang terhapus dengan id aslinya. Riwayat versi yang ikut
  // terhapus cascade TIDAK dipulihkan (lihat editorial.ts).
  async pulihkanArtikel({
    artikel,
  }: {
    artikel: Artikel;
  }): Promise<Artikel> {
    const { data, error } = await this.klien()
      .from("pf_articles")
      .insert({
        id: artikel.id,
        slug: artikel.slug,
        judul: artikel.judul,
        subjudul: artikel.subjudul ?? null,
        ringkasan: artikel.ringkasan,
        isi: artikel.isi,
        kategori_slug: artikel.kategori_slug,
        subkategori_slug: artikel.subkategori_slug ?? null,
        status: artikel.status,
        status_verifikasi: artikel.status_verifikasi,
        penulis_nama: artikel.penulis_nama ?? null,
        penulis_id: artikel.penulis_id ?? null,
        sumber_url: artikel.sumber_url ?? null,
        gambar_url: artikel.gambar_url ?? null,
        estimasi_baca_menit: artikel.estimasi_baca_menit ?? null,
        kronologi: artikel.kronologi ?? [],
        fakta_penting: artikel.fakta_penting ?? [],
        data_pendukung: artikel.data_pendukung ?? [],
        mengapa_penting: artikel.mengapa_penting ?? null,
        dampak: artikel.dampak ?? null,
        belum_diketahui: artikel.belum_diketahui ?? null,
        dijadwalkan_pada: artikel.dijadwalkan_pada ?? null,
        diterbitkan_pada: artikel.diterbitkan_pada ?? null,
        diterbitkan_oleh: artikel.diterbitkan_oleh ?? null,
        dibuat_pada: artikel.dibuat_pada,
        diperbarui_pada: artikel.diperbarui_pada,
        isu: artikel.isu ?? null,
      })
      .select(KOLOM_ARTIKEL)
      .single();
    if (error) this.lempar("pulihkanArtikel", error);
    return data as unknown as Artikel;
  }

  // ---------- Verifikasi & review ----------

  async getVerifikasiTerakhir({
    artikel_id,
  }: {
    artikel_id: string;
  }): Promise<CatatanVerifikasi | null> {
    const { data, error } = await this.klien()
      .from("pf_verification_records")
      .select(
        "id,artikel_id,raw_item_id,agen,keputusan,catatan,bukti,dibuat_oleh,dibuat_pada",
      )
      .eq("artikel_id", artikel_id)
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.lempar("getVerifikasiTerakhir", error);
    return (data as CatatanVerifikasi | null) ?? null;
  }

  // ---------- Hard gate auto-publish (v27) ----------

  async listSumberArtikel({
    artikel_id,
  }: {
    artikel_id: string;
  }): Promise<SumberArtikel[]> {
    const { data, error } = await this.klien()
      .from("pf_article_sources")
      .select("sumber_id, url")
      .eq("artikel_id", artikel_id);
    if (error) this.lempar("listSumberArtikel", error);
    return (data as SumberArtikel[] | null) ?? [];
  }

  async listKlaimArtikel({
    artikel_id,
    raw_item_id,
  }: {
    artikel_id: string;
    raw_item_id?: string | null;
  }): Promise<KlaimArtikel[]> {
    const gabung = new Map<string, KlaimArtikel>();
    const { data, error } = await this.klien()
      .from("pf_claims")
      .select("id, teks, jenis, status")
      .eq("artikel_id", artikel_id);
    if (error) this.lempar("listKlaimArtikel", error);
    for (const k of (data as KlaimArtikel[] | null) ?? []) {
      gabung.set(k.id, k);
    }
    if (raw_item_id) {
      const { data: dataItem, error: errItem } = await this.klien()
        .from("pf_claims")
        .select("id, teks, jenis, status")
        .eq("raw_item_id", raw_item_id);
      if (errItem) this.lempar("listKlaimArtikel", errItem);
      for (const k of (dataItem as KlaimArtikel[] | null) ?? []) {
        gabung.set(k.id, k);
      }
    }
    return [...gabung.values()];
  }

  async listEvidenceArtikel({
    klaim_id,
  }: {
    klaim_id: string[];
  }): Promise<EvidenceArtikel[]> {
    if (klaim_id.length === 0) return [];
    const { data, error } = await this.klien()
      .from("pf_evidence")
      .select("id, klaim_id, sumber_url, sumber_nama, kutipan, arah")
      .in("klaim_id", klaim_id);
    if (error) this.lempar("listEvidenceArtikel", error);
    return (data as EvidenceArtikel[] | null) ?? [];
  }

  async listTanggalSumberArtikel({
    artikel_id,
    raw_item_id,
  }: {
    artikel_id: string;
    raw_item_id?: string | null;
  }): Promise<string[]> {
    const tanggal = new Set<string>();
    const catat = (nilai: unknown) => {
      if (typeof nilai === "string" && nilai.trim() !== "") {
        tanggal.add(nilai);
      }
    };
    // (a) Item mentah catatan verifikasi (jalur pipeline — paling
    //     dapat diandalkan: satu item = satu tanggal).
    if (raw_item_id) {
      const { data, error } = await this.klien()
        .from("pf_raw_items")
        .select("waktu_terbit_asli")
        .eq("id", raw_item_id)
        .maybeSingle();
      if (error) this.lempar("listTanggalSumberArtikel", error);
      catat(
        (data as { waktu_terbit_asli?: unknown } | null)?.waktu_terbit_asli,
      );
    }
    // (b) Item mentah yang URL-nya cocok dengan tautan sumber
    //     artikel (jalur draf lama / multi-sumber).
    const sumber = await this.listSumberArtikel({ artikel_id });
    const url = [
      ...new Set(
        sumber
          .map((s) => (typeof s.url === "string" ? s.url.trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (url.length > 0) {
      const { data, error } = await this.klien()
        .from("pf_raw_items")
        .select("waktu_terbit_asli")
        .in("url", url);
      if (error) this.lempar("listTanggalSumberArtikel", error);
      for (const r of (data as { waktu_terbit_asli?: unknown }[] | null) ??
        []) {
        catat(r.waktu_terbit_asli);
      }
    }
    return [...tanggal];
  }

  async simpanReview(input: ReviewInput): Promise<Review> {
    const { data, error } = await this.klien()
      .from("pf_editorial_reviews")
      .insert({
        artikel_id: input.artikel_id,
        reviewer_id: input.reviewer_id,
        keputusan: input.keputusan,
        catatan: input.catatan,
      })
      .select("id,artikel_id,reviewer_id,keputusan,catatan,dibuat_pada")
      .single();
    if (error) this.lempar("simpanReview", error);
    return data as Review;
  }

  async getReviewTerakhir({
    artikel_id,
  }: {
    artikel_id: string;
  }): Promise<Review | null> {
    const { data, error } = await this.klien()
      .from("pf_editorial_reviews")
      .select("id,artikel_id,reviewer_id,keputusan,catatan,dibuat_pada")
      .eq("artikel_id", artikel_id)
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.lempar("getReviewTerakhir", error);
    return (data as Review | null) ?? null;
  }

  // Compensating T10: hapus-balik satu baris review.
  async hapusReview({ id }: { id: string }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_editorial_reviews")
      .delete()
      .eq("id", id);
    if (error) this.lempar("hapusReview", error);
  }

  async simpanVerification(
    input: VerificationInput,
  ): Promise<CatatanVerifikasi> {
    const { data, error } = await this.klien()
      .from("pf_verification_records")
      .insert({
        artikel_id: input.artikel_id,
        raw_item_id: input.raw_item_id ?? null,
        agen: input.agen,
        keputusan: input.keputusan,
        catatan: input.catatan,
        bukti: input.bukti ?? [],
        dibuat_oleh: input.dibuat_oleh,
      })
      .select(
        "id,artikel_id,raw_item_id,agen,keputusan,catatan,bukti,dibuat_oleh,dibuat_pada",
      )
      .single();
    if (error) this.lempar("simpanVerification", error);
    return data as CatatanVerifikasi;
  }

  // Compensating T10: hapus-balik satu catatan verifikasi.
  async hapusVerifikasi({ id }: { id: string }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_verification_records")
      .delete()
      .eq("id", id);
    if (error) this.lempar("hapusVerifikasi", error);
  }

  async ubahStatusVerifikasiArtikel({
    id,
    keputusan,
  }: {
    id: string;
    keputusan: StatusVerifikasi;
  }): Promise<Artikel | null> {
    const { data, error } = await this.klien()
      .from("pf_articles")
      .update({ status_verifikasi: keputusan })
      .eq("id", id)
      .select(KOLOM_ARTIKEL)
      .maybeSingle();
    if (error) this.lempar("ubahStatusVerifikasiArtikel", error);
    return (data as Artikel | null) ?? null;
  }

  // ---------- Versi ----------

  async simpanVersi(input: VersiInput): Promise<VersiArtikel> {
    // v27: isi_sebelum dicatat bila ada. Bila migrasi v27 BELUM
    // diterapkan di produksi, kolom belum ada (42703) — mundur ke
    // insert tanpa isi_sebelum agar penerbitan tidak gagal; isi
    // sesudah revisi tetap tersimpan.
    const { data, error } = await this.klien()
      .from("pf_article_versions")
      .insert({
        artikel_id: input.artikel_id,
        versi: input.versi,
        judul: input.judul,
        isi: input.isi,
        isi_sebelum: input.isi_sebelum ?? null,
        dibuat_oleh: input.dibuat_oleh,
        catatan: input.catatan,
      })
      .select("id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan")
      .single();
    if (error && galatKolomBelumAda(error)) {
      const { data: dataLama, error: errorLama } = await this.klien()
        .from("pf_article_versions")
        .insert({
          artikel_id: input.artikel_id,
          versi: input.versi,
          judul: input.judul,
          isi: input.isi,
          dibuat_oleh: input.dibuat_oleh,
          catatan: input.catatan,
        })
        .select("id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan")
        .single();
      if (errorLama) this.lempar("simpanVersi", errorLama);
      return dataLama as VersiArtikel;
    }
    if (error) this.lempar("simpanVersi", error);
    return data as VersiArtikel;
  }

  async getVersiTerakhir({
    artikel_id,
  }: {
    artikel_id: string;
  }): Promise<VersiArtikel | null> {
    const { data, error } = await this.klien()
      .from("pf_article_versions")
      .select("id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan")
      .eq("artikel_id", artikel_id)
      .order("versi", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.lempar("getVersiTerakhir", error);
    return (data as VersiArtikel | null) ?? null;
  }

  // Compensating T10: hapus-balik satu baris versi.
  async hapusVersi({ id }: { id: string }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_article_versions")
      .delete()
      .eq("id", id);
    if (error) this.lempar("hapusVersi", error);
  }

  // ---------- Audit ----------

  async catatAudit(input: AuditInput): Promise<void> {
    const { error } = await this.klien().from("pf_audit_logs").insert({
      aktor_id: input.aktor_id,
      aktor_email: input.aktor_email,
      aksi: input.aksi,
      entitas: input.entitas,
      entitas_id: input.entitas_id,
      sebelum: input.sebelum ?? null,
      sesudah: input.sesudah ?? null,
      ip: input.ip ?? null,
    });
    if (error) this.lempar("catatAudit", error);
  }

  // ---------- Koreksi ----------

  async getKoreksi({ id }: { id: string }): Promise<Koreksi | null> {
    const { data, error } = await this.klien()
      .from("pf_correction_reports")
      .select(
        "id,artikel_id,pelapor_id,nama,email,pelapor_email,jenis,pesan,status,nomor_lacak,tautan_artikel,dibuat_pada",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) this.lempar("getKoreksi", error);
    return (data as Koreksi | null) ?? null;
  }

  async listKoreksi(input: {
    status?: StatusKoreksi;
  }): Promise<Koreksi[]> {
    let q = this.klien()
      .from("pf_correction_reports")
      .select(
        "id,artikel_id,pelapor_id,nama,email,pelapor_email,jenis,pesan,status,nomor_lacak,tautan_artikel,dibuat_pada",
      )
      .order("dibuat_pada", { ascending: false });
    if (input.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) this.lempar("listKoreksi", error);
    return (data as Koreksi[]) ?? [];
  }

  async perbaruiKoreksi({
    id,
    status,
  }: {
    id: string;
    status: StatusKoreksi;
  }): Promise<Koreksi | null> {
    const { data, error } = await this.klien()
      .from("pf_correction_reports")
      .update({ status })
      .eq("id", id)
      .select(
        "id,artikel_id,pelapor_id,nama,email,pelapor_email,jenis,pesan,status,nomor_lacak,tautan_artikel,dibuat_pada",
      )
      .maybeSingle();
    if (error) this.lempar("perbaruiKoreksi", error);
    return (data as Koreksi | null) ?? null;
  }

  // ---------- Pengguna ----------

  private async ambilRolesPengguna(
    userId: string,
  ): Promise<Role[]> {
    const { data, error } = await this.klien()
      .from("pf_user_roles")
      .select("pf_roles(nama)")
      .eq("user_id", userId);
    if (error) this.lempar("ambilRolesPengguna", error);
    const roles: Role[] = [];
    for (const row of (data ?? []) as unknown as {
      pf_roles: { nama: string } | null;
    }[]) {
      if (row.pf_roles) roles.push(row.pf_roles.nama as Role);
    }
    return roles;
  }

  private async ambilProfilPengguna(
    userId: string,
  ): Promise<{ nama_tampilan: string | null; nonaktif: boolean } | null> {
    const { data, error } = await this.klien()
      .from("pf_profiles")
      .select("nama_tampilan,nonaktif")
      .eq("id", userId)
      .maybeSingle();
    if (error) this.lempar("ambilProfilPengguna", error);
    return (data as {
      nama_tampilan: string | null;
      nonaktif: boolean;
    } | null) ?? null;
  }

  async getPengguna({ id }: { id: string }): Promise<PenggunaAdmin | null> {
    const klien = this.klien();
    let email: string | null = null;
    let emailTidakTersedia = false;
    let dibuatPada: string | null = null;
    let adaDiAuth = false;
    try {
      const { data, error } = await klien.auth.admin.getUserById(id);
      if (error) throw error;
      adaDiAuth = !!data.user;
      email = data.user?.email ?? null;
      dibuatPada = data.user?.created_at ?? null;
    } catch {
      // Fallback: tanpa akses auth.admin, email tidak bisa dibaca
      // (pf_profiles tidak punya kolom email) — kembalikan pengguna
      // tanpa email + tandai, bukan gagal total.
      emailTidakTersedia = true;
    }
    const profil = await this.ambilProfilPengguna(id);
    // Tidak ada profil DAN tidak ada akun auth yang terbaca:
    // pengguna tidak ditemukan.
    if (!profil && !adaDiAuth) return null;
    const roles = await this.ambilRolesPengguna(id);
    return {
      id,
      email,
      email_tidak_tersedia: emailTidakTersedia,
      nama_tampilan: profil?.nama_tampilan ?? null,
      nonaktif: profil?.nonaktif ?? false,
      roles,
      dibuat_pada: dibuatPada,
    };
  }

  async listPengguna(): Promise<PenggunaAdmin[]> {
    const klien = this.klien();
    const pengguna: PenggunaAdmin[] = [];
    let emailTidakTersedia = false;
    try {
      // auth.admin.listUsers dipaginasi (50/halaman bawaan).
      let halaman = 1;
      for (;;) {
        const { data, error } = await klien.auth.admin.listUsers({
          page: halaman,
          perPage: 100,
        });
        if (error) throw error;
        for (const u of data.users) {
          pengguna.push({
            id: u.id,
            email: u.email ?? null,
            email_tidak_tersedia: false,
            nama_tampilan: null,
            nonaktif: false,
            roles: [],
            dibuat_pada: u.created_at ?? null,
          });
        }
        if (data.users.length < 100) break;
        halaman += 1;
      }
    } catch {
      // Fallback: daftar dari pf_profiles saja (tanpa email).
      emailTidakTersedia = true;
    }

    // Gabung profil + peran untuk setiap pengguna.
    const { data: profilSemua, error: errProfil } = await klien
      .from("pf_profiles")
      .select("id,nama_tampilan,nonaktif");
    if (errProfil) this.lempar("listPengguna", errProfil);
    const petaProfil = new Map(
      ((profilSemua ?? []) as {
        id: string;
        nama_tampilan: string | null;
        nonaktif: boolean;
      }[]).map((p) => [p.id, p]),
    );
    const { data: peranSemua, error: errPeran } = await klien
      .from("pf_user_roles")
      .select("user_id,pf_roles(nama)");
    if (errPeran) this.lempar("listPengguna", errPeran);
    const petaPeran = new Map<string, Role[]>();
    for (const row of (peranSemua ?? []) as unknown as {
      user_id: string;
      pf_roles: { nama: string } | null;
    }[]) {
      if (!row.pf_roles) continue;
      const daftar = petaPeran.get(row.user_id) ?? [];
      daftar.push(row.pf_roles.nama as Role);
      petaPeran.set(row.user_id, daftar);
    }

    if (emailTidakTersedia) {
      // Fallback: pengguna = semua profil (tanpa email).
      return [...petaProfil.entries()].map(([id, p]) => ({
        id,
        email: null,
        email_tidak_tersedia: true,
        nama_tampilan: p.nama_tampilan,
        nonaktif: p.nonaktif,
        roles: petaPeran.get(id) ?? [],
        dibuat_pada: null,
      }));
    }
    for (const p of pengguna) {
      const profil = petaProfil.get(p.id);
      p.nama_tampilan = profil?.nama_tampilan ?? null;
      p.nonaktif = profil?.nonaktif ?? false;
      p.roles = petaPeran.get(p.id) ?? [];
    }
    // Pengguna yang punya profil tapi belum muncul di daftar auth
    // (jarang) tetap ditampilkan tanpa email.
    for (const [id, profil] of petaProfil) {
      if (!pengguna.some((p) => p.id === id)) {
        pengguna.push({
          id,
          email: null,
          email_tidak_tersedia: true,
          nama_tampilan: profil.nama_tampilan,
          nonaktif: profil.nonaktif,
          roles: petaPeran.get(id) ?? [],
          dibuat_pada: null,
        });
      }
    }
    return pengguna;
  }

  async setPeranPengguna({
    id,
    roles,
  }: {
    id: string;
    roles: string[];
  }): Promise<void> {
    const klien = this.klien();
    // Validasi: semua nama peran harus ada di pf_roles.
    const { data: peranAda, error: errPeran } = await klien
      .from("pf_roles")
      .select("id,nama")
      .in("nama", roles.length > 0 ? roles : ["__tidak_ada__"]);
    if (errPeran) this.lempar("setPeranPengguna", errPeran);
    const peta = new Map(
      ((peranAda ?? []) as { id: string; nama: string }[]).map((r) => [
        r.nama,
        r.id,
      ]),
    );
    const takDikenal = roles.filter((r) => !peta.has(r));
    if (takDikenal.length > 0) {
      throw new Error(
        `Peran tidak dikenal: ${takDikenal.join(", ")}.`,
      );
    }
    const { error: errHapus } = await klien
      .from("pf_user_roles")
      .delete()
      .eq("user_id", id);
    if (errHapus) this.lempar("setPeranPengguna", errHapus);
    if (roles.length === 0) return;
    const { error: errSisip } = await klien.from("pf_user_roles").insert(
      roles.map((nama) => ({ user_id: id, role_id: peta.get(nama)! })),
    );
    if (errSisip) this.lempar("setPeranPengguna", errSisip);
  }

  async setNonaktif({
    id,
    nonaktif,
  }: {
    id: string;
    nonaktif: boolean;
  }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_profiles")
      .upsert({ id, nonaktif }, { onConflict: "id" });
    if (error) this.lempar("setNonaktif", error);
  }

  // ---------- Job terjadwal ----------

  async getJob({ nama }: { nama: NamaJob }): Promise<JobTerjadwal | null> {
    const { data, error } = await this.klien()
      .from("pf_scheduled_jobs")
      .select(
        "id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada",
      )
      .eq("nama", nama)
      .maybeSingle();
    if (error) this.lempar("getJob", error);
    return (data as JobTerjadwal | null) ?? null;
  }

  async listJobs(): Promise<JobTerjadwal[]> {
    const { data, error } = await this.klien()
      .from("pf_scheduled_jobs")
      .select(
        "id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada",
      )
      .order("nama", { ascending: true });
    if (error) this.lempar("listJobs", error);
    return (data as JobTerjadwal[]) ?? [];
  }

  async perbaruiJob({
    nama,
    patch,
  }: {
    nama: NamaJob;
    patch: JobPatch;
  }): Promise<JobTerjadwal | null> {
    const { data, error } = await this.klien()
      .from("pf_scheduled_jobs")
      .update(patch)
      .eq("nama", nama)
      .select(
        "id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada",
      )
      .maybeSingle();
    if (error) this.lempar("perbaruiJob", error);
    return (data as JobTerjadwal | null) ?? null;
  }

  // ---------- Kategori ----------

  async listKategori(): Promise<Kategori[]> {
    const { data, error } = await this.klien()
      .from("pf_categories")
      .select("id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada")
      .order("urutan", { ascending: true })
      .order("nama", { ascending: true });
    if (error) this.lempar("listKategori", error);
    return (data as Kategori[]) ?? [];
  }

  async buatKategori(input: KategoriInput): Promise<Kategori> {
    const { data, error } = await this.klien()
      .from("pf_categories")
      .insert({
        slug: input.slug,
        nama: input.nama,
        deskripsi: input.deskripsi ?? null,
        induk_id: input.induk_id ?? null,
        urutan: input.urutan ?? 0,
        aktif: input.aktif ?? true,
      })
      .select("id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada")
      .single();
    if (error) this.lempar("buatKategori", error);
    return data as Kategori;
  }

  async perbaruiKategori({
    id,
    patch,
  }: {
    id: string;
    patch: KategoriPatch;
  }): Promise<Kategori | null> {
    const { data, error } = await this.klien()
      .from("pf_categories")
      .update(patch)
      .eq("id", id)
      .select("id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada")
      .maybeSingle();
    if (error) this.lempar("perbaruiKategori", error);
    return (data as Kategori | null) ?? null;
  }

  async hapusKategori({ id }: { id: string }): Promise<void> {
    const { error } = await this.klien()
      .from("pf_categories")
      .delete()
      .eq("id", id);
    if (error) this.lempar("hapusKategori", error);
  }

  // Compensating T10: sisipkan kembali kategori yang terhapus
  // dengan id aslinya.
  async pulihkanKategori({
    kategori,
  }: {
    kategori: Kategori;
  }): Promise<Kategori> {
    const { data, error } = await this.klien()
      .from("pf_categories")
      .insert({
        id: kategori.id,
        slug: kategori.slug,
        nama: kategori.nama,
        deskripsi: kategori.deskripsi ?? null,
        induk_id: kategori.induk_id ?? null,
        urutan: kategori.urutan ?? 0,
        aktif: kategori.aktif ?? true,
        dibuat_pada: kategori.dibuat_pada,
      })
      .select("id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada")
      .single();
    if (error) this.lempar("pulihkanKategori", error);
    return data as Kategori;
  }

  // ---------- Brief ----------

  async terbitkanBrief({ id }: { id: string }): Promise<BriefAdmin | null> {
    const { data, error } = await this.klien()
      .from("pf_daily_briefs")
      .update({ status: "terbit", diterbitkan_pada: new Date().toISOString() })
      .eq("id", id)
      .select("id,tanggal,isi,status,dibuat_pada,diterbitkan_pada")
      .maybeSingle();
    if (error) this.lempar("terbitkanBrief", error);
    return (data as BriefAdmin | null) ?? null;
  }

  async listBrief(): Promise<BriefAdmin[]> {
    const { data, error } = await this.klien()
      .from("pf_daily_briefs")
      .select("id,tanggal,isi,status,dibuat_pada,diterbitkan_pada")
      .order("tanggal", { ascending: false })
      .limit(60);
    if (error) this.lempar("listBrief", error);
    return (data as BriefAdmin[]) ?? [];
  }

  // Compensating T10: kembalikan brief terbit ke draft.
  async pulihkanBrief({ id }: { id: string }): Promise<BriefAdmin | null> {
    const { data, error } = await this.klien()
      .from("pf_daily_briefs")
      .update({ status: "draft", diterbitkan_pada: null })
      .eq("id", id)
      .select("id,tanggal,isi,status,dibuat_pada,diterbitkan_pada")
      .maybeSingle();
    if (error) this.lempar("pulihkanBrief", error);
    return (data as BriefAdmin | null) ?? null;
  }

  // ---------- Audit, ringkasan, kesehatan ----------

  async listAudit(filter: FilterAudit): Promise<HasilListAudit> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const dari = (page - 1) * limit;
    let q = this.klien()
      .from("pf_audit_logs")
      .select(
        "id,aktor_id,aktor_email,aksi,entitas,entitas_id,sebelum,sesudah,ip,dibuat_pada",
        { count: "exact" },
      )
      .order("dibuat_pada", { ascending: false });
    if (filter.aksi) q = q.eq("aksi", filter.aksi);
    if (filter.entitas) q = q.eq("entitas", filter.entitas);
    const { data, error, count } = await q.range(dari, dari + limit - 1);
    if (error) this.lempar("listAudit", error);
    return {
      log: (data as AuditLog[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  private async hitung(
    tabel: string,
    kolom: string,
    nilai: string,
  ): Promise<number> {
    const { count, error } = await this.klien()
      .from(tabel)
      .select("id", { count: "exact", head: true })
      .eq(kolom, nilai);
    if (error) this.lempar("hitungRingkasan", error);
    return count ?? 0;
  }

  async hitungRingkasan(): Promise<RingkasanAdmin> {
    const klien = this.klien();
    const [terbit, draft, terjadwal, belumTerkonfirmasi, dikoreksi] =
      await Promise.all([
        this.hitung("pf_articles", "status", "terbit"),
        this.hitung("pf_articles", "status", "draft"),
        this.hitung("pf_articles", "status", "terjadwal"),
        this.hitung("pf_articles", "status_verifikasi", "UNCONFIRMED"),
        this.hitung("pf_articles", "status_verifikasi", "CORRECTED"),
      ]);
    // Total tanpa filter: hitung semua baris.
    const { count: totalSemua, error: errTotal } = await klien
      .from("pf_articles")
      .select("id", { count: "exact", head: true });
    if (errTotal) this.lempar("hitungRingkasan", errTotal);
    const { data: kategori, error: errKategori } = await klien
      .from("pf_articles")
      .select("kategori_slug")
      .limit(5000);
    if (errKategori) this.lempar("hitungRingkasan", errKategori);
    const peta = new Map<string, number>();
    for (const row of (kategori ?? []) as { kategori_slug: string }[]) {
      peta.set(row.kategori_slug, (peta.get(row.kategori_slug) ?? 0) + 1);
    }
    return {
      total_artikel: totalSemua ?? 0,
      terbit,
      draft,
      terjadwal,
      antrean_verifikasi: draft,
      belum_terkonfirmasi: belumTerkonfirmasi,
      dikoreksi,
      per_kategori: [...peta.entries()]
        .map(([kategori_slug, jumlah]) => ({ kategori_slug, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah),
    };
  }

  async hitungSumber(): Promise<{ total: number; aktif: number }> {
    const klien = this.klien();
    const { count: total, error: errTotal } = await klien
      .from("pf_sources")
      .select("id", { count: "exact", head: true });
    if (errTotal) this.lempar("hitungSumber", errTotal);
    const { count: aktif, error: errAktif } = await klien
      .from("pf_sources")
      .select("id", { count: "exact", head: true })
      .eq("aktif", true);
    if (errAktif) this.lempar("hitungSumber", errAktif);
    return { total: total ?? 0, aktif: aktif ?? 0 };
  }

  async listAiRuns({ limit }: { limit: number }): Promise<RunAi[]> {
    const { data, error } = await this.klien()
      .from("pf_ai_runs")
      .select(KOLOM_AI_RUN)
      .order("dimulai_pada", { ascending: false })
      .limit(Math.min(500, Math.max(1, limit)));
    if (error) this.lempar("listAiRuns", error);
    return (data as unknown as RunAi[]) ?? [];
  }

  async runIngestionTerakhir({
    limit,
  }: {
    limit: number;
  }): Promise<RunIngestion[]> {
    const { data, error } = await this.klien()
      .from("pf_ingestion_runs")
      .select(
        "id,sumber_id,sumber_nama,dimulai_pada,selesai_pada,status,ditemukan,baru,duplikat,ditolak,gagal,error,dipicu_oleh",
      )
      .order("dimulai_pada", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error) this.lempar("runIngestionTerakhir", error);
    return (data as RunIngestion[]) ?? [];
  }

  async runAiGagalTerakhir({
    limit,
  }: {
    limit: number;
  }): Promise<RunAi[]> {
    const { data, error } = await this.klien()
      .from("pf_ai_runs")
      .select(KOLOM_AI_RUN)
      .eq("status", "gagal")
      .order("dimulai_pada", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error) this.lempar("runAiGagalTerakhir", error);
    return (data as unknown as RunAi[]) ?? [];
  }

  async cekSupabaseSehat(): Promise<KesehatanSupabase> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return { ok: false, ms: 0 };
    const mulai = Date.now();
    try {
      const respon = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        signal: AbortSignal.timeout(5000),
      });
      // /rest/v1/ menjawab 200 (spesifikasi OpenAPI) bila REST hidup.
      return { ok: respon.ok, ms: Date.now() - mulai };
    } catch {
      return { ok: false, ms: Date.now() - mulai };
    }
  }
}

export function buatAdminAdapter(): AdminAdapter {
  return new SupabaseAdminAdapter();
}
