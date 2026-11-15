// Lapisan baca admin PRATA FAKTA (Server Components).
// Prinsip sama seperti src/lib/data.ts: gagal-aman. Bila tabel pf_*
// belum dibuat (migrasi belum dijalankan) atau query gagal / RLS
// menolak, fungsi mengembalikan [] / null / tersedia:false dan
// pemanggil menampilkan empty state jujur — bukan angka palsu.
// TIDAK ada fetch ke route /api/admin/* sendiri dari sini: Server
// Component membaca tabel langsung via session client (RLS
// menegakkan izin baca staf). Pengecualian: daftar pengguna butuh
// email dari auth — itu dibaca Client Component lewat
// /api/admin/pengguna (lihat TabelPengguna).
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES, type Role } from "@/lib/auth/roles";
import { getKategori, type PfCategoryRow } from "@/lib/data";

export const PERAN_STAF: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.EDITOR,
  ROLES.FACT_CHECKER,
  ROLES.WRITER,
];

export type SesiAdmin = {
  userId: string;
  email: string | null;
  roles: Role[];
};

/**
 * Sesi staf untuk guard layout /admin. null bila belum login, bukan
 * staf, atau dinonaktifkan (pf_profiles.nonaktif).
 */
export async function getAdminSession(): Promise<SesiAdmin | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const roles = await getUserRoles(user.id);
    if (!punyaRole(roles, ROLES.EDITOR, ROLES.FACT_CHECKER, ROLES.WRITER)) {
      return null;
    }
    // Pengguna nonaktif tidak boleh masuk dashboard meski punya role.
    try {
      const { data: profil } = await supabase
        .from("pf_profiles")
        .select("nonaktif")
        .eq("id", user.id)
        .maybeSingle();
      if (profil && (profil as { nonaktif?: boolean }).nonaktif === true) {
        return null;
      }
    } catch {
      // Tabel profil belum ada: jangan blokir staf.
    }
    return { userId: user.id, email: user.email ?? null, roles };
  } catch {
    return null;
  }
}

/* ============================================================
   Ringkasan overview
   ============================================================ */

export type IngestionRunAdmin = {
  id: string;
  sumber_nama: string | null;
  status: string;
  dimulai_pada: string | null;
  selesai_pada: string | null;
  ditemukan: number;
  baru: number;
  duplikat: number;
  gagal: number;
  error: string | null;
};

export type AiRunAdmin = {
  id: string;
  agen: string;
  status: string;
  error: string | null;
  dimulai_pada: string | null;
  selesai_pada: string | null;
};

export type ScheduledJobAdmin = {
  id: string;
  nama: string;
  jadwal_cron: string;
  deskripsi: string | null;
  aktif: boolean;
  terakhir_jalan: string | null;
  status_terakhir: string;
  error_terakhir: string | null;
};

export type RingkasanAdmin = {
  /** false = satu/lebih query ringkasan gagal (mis. tabel belum ada). */
  tersedia: boolean;
  total_artikel: number;
  terbit: number;
  draft: number;
  terjadwal: number;
  antrean_verifikasi: number;
  belum_terkonfirmasi: number;
  dikoreksi: number;
  per_kategori: { kategori_slug: string; kategori_nama: string; jumlah: number }[];
  sumber: { total: number; aktif: number; run_terakhir: IngestionRunAdmin[] };
  ai: { run_gagal_terakhir: AiRunAdmin[] };
  jobs: ScheduledJobAdmin[];
  api_health: { supabase: { ok: boolean; ms: number | null } };
  /** Lapisan baca server tidak menjangkau GitHub — status workflow
   *  hanya tersedia lewat /api/admin/ringkasan (agen API). */
  github_workflows: { terhubung: boolean; pesan: string };
  error_logs: { pesan: string; waktu: string | null }[];
};

async function hitungBaris(
  tabel: string,
  kolomEq?: [string, string],
): Promise<number | null> {
  try {
    const supabase = await createClient();
    let q = supabase.from(tabel).select("id", { count: "exact", head: true });
    if (kolomEq) q = q.eq(kolomEq[0], kolomEq[1]);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function getRingkasanAdmin(): Promise<RingkasanAdmin> {
  const kosong: RingkasanAdmin = {
    tersedia: false,
    total_artikel: 0,
    terbit: 0,
    draft: 0,
    terjadwal: 0,
    antrean_verifikasi: 0,
    belum_terkonfirmasi: 0,
    dikoreksi: 0,
    per_kategori: [],
    sumber: { total: 0, aktif: 0, run_terakhir: [] },
    ai: { run_gagal_terakhir: [] },
    jobs: [],
    api_health: { supabase: { ok: false, ms: null } },
    github_workflows: {
      terhubung: false,
      pesan:
        "Status workflow GitHub Actions tidak dapat dibaca dari lapisan server ini — lihat ringkasan API (/api/admin/ringkasan) setelah route admin tersedia.",
    },
    error_logs: [],
  };

  try {
    // Tandai render sebagai request-time SEBELUM membaca waktu:
    // Next 16 menolak Date.now() saat prerender bila belum ada
    // akses data dinamis sebelumnya (aturan yang sama dengan TASIK:
    // jangan baca waktu di jalur render tanpa connection()).
    await connection();
    const supabase = await createClient();
    const mulai = Date.now();
    const [
      total,
      terbit,
      draft,
      terjadwal,
      belumTerkonfirmasi,
      dikoreksi,
      sumberTotal,
      sumberAktif,
    ] = await Promise.all([
      hitungBaris("pf_articles"),
      hitungBaris("pf_articles", ["status", "terbit"]),
      hitungBaris("pf_articles", ["status", "draft"]),
      hitungBaris("pf_articles", ["status", "terjadwal"]),
      hitungBaris("pf_articles", ["status_verifikasi", "UNCONFIRMED"]),
      hitungBaris("pf_articles", ["status_verifikasi", "CORRECTED"]),
      hitungBaris("pf_sources"),
      hitungBaris("pf_sources", ["aktif", "true"]),
    ]);
    const ms = Date.now() - mulai;
    const ok = total !== null;
    kosong.api_health = { supabase: { ok, ms: ok ? ms : null } };
    if (!ok) return kosong;

    kosong.tersedia = true;
    kosong.total_artikel = total ?? 0;
    kosong.terbit = terbit ?? 0;
    kosong.draft = draft ?? 0;
    kosong.terjadwal = terjadwal ?? 0;
    kosong.belum_terkonfirmasi = belumTerkonfirmasi ?? 0;
    kosong.dikoreksi = dikoreksi ?? 0;
    kosong.sumber.total = sumberTotal ?? 0;
    kosong.sumber.aktif = sumberAktif ?? 0;

    // Antrean verifikasi: draft/terjadwal ATAU status verifikasi
    // belum terkonfirmasi / disengketakan.
    const { data: antrean, error: errAntrean } = await supabase
      .from("pf_articles")
      .select("id")
      .or("status.eq.draft,status.eq.terjadwal,status_verifikasi.eq.UNCONFIRMED,status_verifikasi.eq.DISPUTED")
      .limit(5000);
    kosong.antrean_verifikasi = errAntrean ? 0 : (antrean?.length ?? 0);

    // Statistik per kategori utama (hitung di JS dari kolom saja).
    const kategori = await getKategori();
    const utama = kategori.filter((k) => !k.induk_id);
    const { data: kolomKategori } = await supabase
      .from("pf_articles")
      .select("kategori_slug")
      .limit(5000);
    const hitungKat = new Map<string, number>();
    for (const r of (kolomKategori ?? []) as { kategori_slug: string | null }[]) {
      if (!r.kategori_slug) continue;
      hitungKat.set(r.kategori_slug, (hitungKat.get(r.kategori_slug) ?? 0) + 1);
    }
    kosong.per_kategori = utama.map((k) => ({
      kategori_slug: k.slug,
      kategori_nama: k.nama,
      jumlah: hitungKat.get(k.slug) ?? 0,
    }));

    // Run ingestion terakhir (5).
    const { data: runs } = await supabase
      .from("pf_ingestion_runs")
      .select("id, sumber_nama, status, dimulai_pada, selesai_pada, ditemukan, baru, duplikat, gagal, error")
      .order("dimulai_pada", { ascending: false })
      .limit(5);
    kosong.sumber.run_terakhir = (runs ?? []) as IngestionRunAdmin[];

    // Run AI gagal terakhir (10) + error log gabungan.
    const { data: aiGagal } = await supabase
      .from("pf_ai_runs")
      .select("id, agen, status, error, dimulai_pada, selesai_pada")
      .eq("status", "gagal")
      .order("dimulai_pada", { ascending: false })
      .limit(10);
    kosong.ai.run_gagal_terakhir = (aiGagal ?? []) as AiRunAdmin[];

    const { data: ingestionGagal } = await supabase
      .from("pf_ingestion_runs")
      .select("sumber_nama, error, dimulai_pada")
      .eq("status", "gagal")
      .order("dimulai_pada", { ascending: false })
      .limit(5);
    const logs: { pesan: string; waktu: string | null }[] = [];
    for (const r of kosong.ai.run_gagal_terakhir) {
      logs.push({
        pesan: `AI ${r.agen}: ${r.error ?? "gagal tanpa pesan error"}`,
        waktu: r.dimulai_pada,
      });
    }
    for (const r of (ingestionGagal ?? []) as {
      sumber_nama: string | null;
      error: string | null;
      dimulai_pada: string | null;
    }[]) {
      logs.push({
        pesan: `Ingestion ${r.sumber_nama ?? "sumber tak dikenal"}: ${r.error ?? "gagal tanpa pesan error"}`,
        waktu: r.dimulai_pada,
      });
    }
    kosong.error_logs = logs.slice(0, 10);

    // Jobs terjadwal.
    const { data: jobs } = await supabase
      .from("pf_scheduled_jobs")
      .select("id, nama, jadwal_cron, deskripsi, aktif, terakhir_jalan, status_terakhir, error_terakhir")
      .order("nama", { ascending: true });
    kosong.jobs = (jobs ?? []) as ScheduledJobAdmin[];

    return kosong;
  } catch {
    return kosong;
  }
}

/* ============================================================
   Antrean review
   ============================================================ */

export type ArtikelAntrean = {
  id: string;
  slug: string;
  judul: string;
  kategori_slug: string | null;
  status: string;
  status_verifikasi: string;
  sumber_url: string | null;
  dibuat_pada: string | null;
  verifikasi_terakhir: string | null;
  review_terakhir: { keputusan: string; dibuat_pada: string | null } | null;
};

export async function getAntreanAdmin(): Promise<{
  antrean: ArtikelAntrean[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select("id, slug, judul, kategori_slug, status, status_verifikasi, sumber_url, dibuat_pada")
      .or("status.eq.draft,status.eq.terjadwal,status_verifikasi.eq.UNCONFIRMED,status_verifikasi.eq.DISPUTED")
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (error || !data) return { antrean: [], tersedia: false };
    const artikel = data as ArtikelAntrean[];
    if (artikel.length === 0) return { antrean: [], tersedia: true };

    const ids = artikel.map((a) => a.id);
    const [ver, rev] = await Promise.all([
      supabase
        .from("pf_verification_records")
        .select("artikel_id, keputusan, dibuat_pada")
        .in("artikel_id", ids)
        .order("dibuat_pada", { ascending: false }),
      supabase
        .from("pf_editorial_reviews")
        .select("artikel_id, keputusan, dibuat_pada")
        .in("artikel_id", ids)
        .order("dibuat_pada", { ascending: false }),
    ]);
    const verTerakhir = new Map<string, string>();
    for (const r of (ver.data ?? []) as {
      artikel_id: string;
      keputusan: string;
      dibuat_pada: string;
    }[]) {
      if (!verTerakhir.has(r.artikel_id)) {
        verTerakhir.set(r.artikel_id, `${r.keputusan} · ${r.dibuat_pada}`);
      }
    }
    const revTerakhir = new Map<
      string,
      { keputusan: string; dibuat_pada: string | null }
    >();
    for (const r of (rev.data ?? []) as {
      artikel_id: string;
      keputusan: string;
      dibuat_pada: string | null;
    }[]) {
      if (!revTerakhir.has(r.artikel_id)) {
        revTerakhir.set(r.artikel_id, {
          keputusan: r.keputusan,
          dibuat_pada: r.dibuat_pada,
        });
      }
    }
    return {
      antrean: artikel.map((a) => ({
        ...a,
        verifikasi_terakhir: verTerakhir.get(a.id) ?? null,
        review_terakhir: revTerakhir.get(a.id) ?? null,
      })),
      tersedia: true,
    };
  } catch {
    return { antrean: [], tersedia: false };
  }
}

/* ============================================================
   Daftar + detail artikel admin
   ============================================================ */

export type ArtikelAdminRingkas = {
  id: string;
  slug: string;
  judul: string;
  kategori_slug: string | null;
  status: string;
  status_verifikasi: string;
  dibuat_pada: string | null;
  diterbitkan_pada: string | null;
};

export type FilterArtikelAdmin = {
  status?: string;
  kategori?: string;
  q?: string;
  page?: number;
};

const PER_HALAMAN = 20;

export async function getDaftarArtikelAdmin(
  filter: FilterArtikelAdmin,
): Promise<{
  artikel: ArtikelAdminRingkas[];
  total: number;
  page: number;
  tersedia: boolean;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const dari = (page - 1) * PER_HALAMAN;
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_articles")
      .select(
        "id, slug, judul, kategori_slug, status, status_verifikasi, dibuat_pada, diterbitkan_pada",
        { count: "exact" },
      )
      .order("dibuat_pada", { ascending: false })
      .range(dari, dari + PER_HALAMAN - 1);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.kategori) query = query.eq("kategori_slug", filter.kategori);
    if (filter.q) {
      const pola = `%${filter.q.replace(/[%_]/g, "")}%`;
      query = query.or(`judul.ilike.${pola},ringkasan.ilike.${pola}`);
    }
    const { data, error, count } = await query;
    if (error || !data) return { artikel: [], total: 0, page, tersedia: false };
    return {
      artikel: data as ArtikelAdminRingkas[],
      total: count ?? 0,
      page,
      tersedia: true,
    };
  } catch {
    return { artikel: [], total: 0, page, tersedia: false };
  }
}

export type EvidenceAdmin = {
  id: string;
  sumber_url: string;
  sumber_nama: string | null;
  kutipan: string | null;
  arah: string;
};

export type KlaimAdmin = {
  id: string;
  teks: string;
  jenis: string;
  status: string;
  evidence: EvidenceAdmin[];
};

export type VerifikasiAdmin = {
  id: string;
  agen: string;
  keputusan: string;
  catatan: string | null;
  dibuat_pada: string | null;
};

export type ReviewAdmin = {
  id: string;
  keputusan: string;
  catatan: string;
  dibuat_pada: string | null;
};

export type ArtikelAdmin = {
  id: string;
  slug: string;
  judul: string;
  subjudul: string | null;
  ringkasan: string | null;
  isi: string | null;
  kategori_slug: string | null;
  subkategori_slug: string | null;
  status: string;
  status_verifikasi: string;
  penulis_nama: string | null;
  sumber_url: string | null;
  gambar_url: string | null;
  dijadwalkan_pada: string | null;
  diterbitkan_pada: string | null;
  dibuat_pada: string | null;
  diperbarui_pada: string | null;
  klaim: KlaimAdmin[];
  verifikasi_terakhir: VerifikasiAdmin | null;
  review_terakhir: ReviewAdmin | null;
  reviews: ReviewAdmin[];
  versi: { versi: number; judul: string | null; dibuat_pada: string | null; catatan: string | null }[];
};

const KOLOM_ARTIKEL_ADMIN =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, status, status_verifikasi, penulis_nama, sumber_url, gambar_url, dijadwalkan_pada, diterbitkan_pada, dibuat_pada, diperbarui_pada";

export async function getArtikelAdmin(
  id: string,
): Promise<ArtikelAdmin | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_ADMIN)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const artikel = data as unknown as Omit<
      ArtikelAdmin,
      "klaim" | "verifikasi_terakhir" | "review_terakhir" | "reviews" | "versi"
    >;

    const [klaimRes, evRes, verRes, revRes, versiRes] = await Promise.all([
      supabase
        .from("pf_claims")
        .select("id, teks, jenis, status")
        .eq("artikel_id", id)
        .order("dibuat_pada", { ascending: true }),
      supabase
        .from("pf_evidence")
        .select("id, klaim_id, sumber_url, sumber_nama, kutipan, arah"),
      supabase
        .from("pf_verification_records")
        .select("id, agen, keputusan, catatan, dibuat_pada")
        .eq("artikel_id", id)
        .order("dibuat_pada", { ascending: false }),
      supabase
        .from("pf_editorial_reviews")
        .select("id, keputusan, catatan, dibuat_pada")
        .eq("artikel_id", id)
        .order("dibuat_pada", { ascending: false }),
      supabase
        .from("pf_article_versions")
        .select("versi, judul, dibuat_pada, catatan")
        .eq("artikel_id", id)
        .order("versi", { ascending: false })
        .limit(10),
    ]);

    // Evidence hanya relevan bila klaimnya ada; filter di JS agar
    // satu query cukup (tabel evidence kecil per artikel).
    const klaimIds = new Set(
      ((klaimRes.data ?? []) as { id: string }[]).map((k) => k.id),
    );
    const evidencePerKlaim = new Map<string, EvidenceAdmin[]>();
    for (const e of (evRes.data ?? []) as unknown as (EvidenceAdmin & {
      klaim_id: string;
    })[]) {
      if (!klaimIds.has(e.klaim_id)) continue;
      const daftar = evidencePerKlaim.get(e.klaim_id) ?? [];
      daftar.push({
        id: e.id,
        sumber_url: e.sumber_url,
        sumber_nama: e.sumber_nama,
        kutipan: e.kutipan,
        arah: e.arah,
      });
      evidencePerKlaim.set(e.klaim_id, daftar);
    }
    const klaim: KlaimAdmin[] = ((klaimRes.data ?? []) as {
      id: string;
      teks: string;
      jenis: string;
      status: string;
    }[]).map((k) => ({
      ...k,
      evidence: evidencePerKlaim.get(k.id) ?? [],
    }));

    const verifikasi = (verRes.data ?? []) as VerifikasiAdmin[];
    const reviews = (revRes.data ?? []) as ReviewAdmin[];
    return {
      ...artikel,
      klaim,
      verifikasi_terakhir: verifikasi[0] ?? null,
      review_terakhir: reviews[0] ?? null,
      reviews,
      versi: (versiRes.data ?? []) as ArtikelAdmin["versi"],
    };
  } catch {
    return null;
  }
}

/* ============================================================
   Koreksi (laporan pembaca)
   ============================================================ */

export type KoreksiAdmin = {
  id: string;
  artikel_id: string;
  artikel_judul: string | null;
  nama: string | null;
  email: string | null;
  jenis: string;
  pesan: string;
  status: string;
  dibuat_pada: string | null;
};

export const LABEL_JENIS_KOREKSI: Record<string, string> = {
  fakta_salah: "Fakta salah",
  sumber: "Sumber bermasalah",
  typo: "Salah ketik",
  lainnya: "Lainnya",
};

export async function getKoreksiAdmin(status?: string): Promise<{
  laporan: KoreksiAdmin[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_correction_reports")
      .select("id, artikel_id, nama, email, jenis, pesan, status, dibuat_pada, pf_articles(judul)")
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error || !data) return { laporan: [], tersedia: false };
    return {
      laporan: (data as unknown as {
        id: string;
        artikel_id: string;
        nama: string | null;
        email: string | null;
        jenis: string;
        pesan: string;
        status: string;
        dibuat_pada: string | null;
        pf_articles: { judul: string } | null;
      }[]).map((r) => ({
        id: r.id,
        artikel_id: r.artikel_id,
        artikel_judul: r.pf_articles?.judul ?? null,
        nama: r.nama,
        email: r.email,
        jenis: r.jenis,
        pesan: r.pesan,
        status: r.status,
        dibuat_pada: r.dibuat_pada,
      })),
      tersedia: true,
    };
  } catch {
    return { laporan: [], tersedia: false };
  }
}

/* ============================================================
   Sistem (jobs + kategori) & sumber admin
   ============================================================ */

export type PfSourceAdmin = {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  aktif: boolean;
  prioritas: number;
  terakhir_cek: string | null;
  status_terakhir: string | null;
  terakhir_diambil: string | null;
  jumlah_item: number;
};

export async function getSumberAdmin(): Promise<{
  sumber: PfSourceAdmin[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_sources")
      .select("id, nama, jenis, url, aktif, prioritas, terakhir_cek, status_terakhir, terakhir_diambil, jumlah_item")
      .order("prioritas", { ascending: false });
    if (error || !data) return { sumber: [], tersedia: false };
    return { sumber: data as PfSourceAdmin[], tersedia: true };
  } catch {
    return { sumber: [], tersedia: false };
  }
}

export async function getSistemAdmin(): Promise<{
  jobs: ScheduledJobAdmin[];
  kategori: PfCategoryRow[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const [jobsRes, katRes] = await Promise.all([
      supabase
        .from("pf_scheduled_jobs")
        .select("id, nama, jadwal_cron, deskripsi, aktif, terakhir_jalan, status_terakhir, error_terakhir")
        .order("nama", { ascending: true }),
      supabase
        .from("pf_categories")
        .select("id, slug, nama, deskripsi, induk_id, urutan, aktif")
        .order("urutan", { ascending: true }),
    ]);
    if (jobsRes.error && katRes.error) {
      return { jobs: [], kategori: [], tersedia: false };
    }
    return {
      jobs: (jobsRes.data ?? []) as ScheduledJobAdmin[],
      kategori: (katRes.data ?? []) as PfCategoryRow[],
      tersedia: true,
    };
  } catch {
    return { jobs: [], kategori: [], tersedia: false };
  }
}

/* ============================================================
   Audit log
   ============================================================ */

export type AuditLogAdmin = {
  id: string;
  aktor_email: string | null;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  sebelum: unknown;
  sesudah: unknown;
  dibuat_pada: string | null;
};

export function ringkasJson(v: unknown, batas = 120): string {
  if (v === null || v === undefined) return "—";
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s || s === "{}") return "—";
    return s.length > batas ? `${s.slice(0, batas)}…` : s;
  } catch {
    return "—";
  }
}

export async function getAuditAdmin(filter: {
  aksi?: string;
  entitas?: string;
  page?: number;
}): Promise<{
  log: AuditLogAdmin[];
  total: number;
  page: number;
  tersedia: boolean;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const dari = (page - 1) * PER_HALAMAN;
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_audit_logs")
      .select(
        "id, aktor_email, aksi, entitas, entitas_id, sebelum, sesudah, dibuat_pada",
        { count: "exact" },
      )
      .order("dibuat_pada", { ascending: false })
      .range(dari, dari + PER_HALAMAN - 1);
    if (filter.aksi) query = query.eq("aksi", filter.aksi);
    if (filter.entitas) query = query.eq("entitas", filter.entitas);
    const { data, error, count } = await query;
    if (error || !data) return { log: [], total: 0, page, tersedia: false };
    return {
      log: data as AuditLogAdmin[],
      total: count ?? 0,
      page,
      tersedia: true,
    };
  } catch {
    return { log: [], total: 0, page, tersedia: false };
  }
}

/* ============================================================
   Brief admin
   ============================================================ */

export type BriefAdmin = {
  id: string;
  tanggal: string;
  status: string;
  dibuat_pada: string | null;
  diterbitkan_pada: string | null;
  jumlah_entri: number;
};

export async function getBriefAdmin(): Promise<{
  brief: BriefAdmin[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_daily_briefs")
      .select("id, tanggal, isi, status, dibuat_pada, diterbitkan_pada")
      .order("tanggal", { ascending: false })
      .limit(30);
    if (error || !data) return { brief: [], tersedia: false };
    return {
      brief: (data as unknown as {
        id: string;
        tanggal: string;
        isi: unknown;
        status: string;
        dibuat_pada: string | null;
        diterbitkan_pada: string | null;
      }[]).map((b) => {
        let jumlah = 0;
        const isi = b.isi as {
          seksi?: Record<string, unknown[]>;
          isu_berkembang?: unknown[];
        } | null;
        if (isi && typeof isi === "object") {
          if (isi.seksi && typeof isi.seksi === "object") {
            for (const daftar of Object.values(isi.seksi)) {
              if (Array.isArray(daftar)) jumlah += daftar.length;
            }
          }
          if (Array.isArray(isi.isu_berkembang)) jumlah += isi.isu_berkembang.length;
        }
        return {
          id: b.id,
          tanggal: b.tanggal,
          status: b.status,
          dibuat_pada: b.dibuat_pada,
          diterbitkan_pada: b.diterbitkan_pada,
          jumlah_entri: jumlah,
        };
      }),
      tersedia: true,
    };
  } catch {
    return { brief: [], tersedia: false };
  }
}
