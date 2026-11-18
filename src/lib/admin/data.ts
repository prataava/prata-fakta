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
import { cobaServiceClient } from "@/lib/supabase/service";
import { buatAdminAdapter } from "./supabase-adapter";
import { evaluasiHardGate } from "./hard-gates";
import { getUserRoles, punyaRole, ROLES, type Role } from "@/lib/auth/roles";
import { getKategori, type PfCategoryRow } from "@/lib/data";
// Ops Center (Fase 12): daftar job dikenal dipakai getRingkasanOps.
// kendali.ts tidak mengimpor data.ts — tidak ada siklus impor.
import { DAFTAR_JOB_DIKENAL, type JobDikenal } from "./kendali";

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
  /** Draf siap bulk publish (Fase 11): status draft + verifikasi
   *  CROSS-CHECKED/VERIFIED. Dipakai panel 1-klik di /admin. */
  draft_terverifikasi: number;
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
    draft_terverifikasi: 0,
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

    // Draf siap bulk publish (Fase 11): status draft + verifikasi
    // CROSS-CHECKED/VERIFIED. Gagal baca -> 0 (jujur: panel
    // menampilkan 0 + tombol nonaktif, bukan angka karangan).
    const { count: draftTerverifikasi } = await supabase
      .from("pf_articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .in("status_verifikasi", ["CROSS-CHECKED", "VERIFIED"]);
    kosong.draft_terverifikasi = draftTerverifikasi ?? 0;

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

// ---------- Reliability Center (v27) ----------

export type GalatTerbaru = {
  dibuat_pada: string | null;
  sumber: string | null;
  pesan: string | null;
  rute: string | null;
};

/**
 * Galat aplikasi terbaru (pf_app_errors, 10 terakhir) untuk
 * Reliability Center. Dibaca via SERVICE client — RLS menolak
 * pembacaan tabel ini lewat session client (hasil kosong, bukan
 * error), jadi tanpa service key mustahil membedakan "tidak ada
 * galat" dari "tidak bisa membaca". null = tidak dapat dibaca
 * (service key belum diatur / query gagal); pemanggil menampilkan
 * empty state jujur, bukan "0 galat".
 */
export async function getGalatTerbaru(): Promise<GalatTerbaru[] | null> {
  try {
    await connection();
    const service = cobaServiceClient();
    if (!service) return null;
    const { data, error } = await service
      .from("pf_app_errors")
      .select("dibuat_pada,sumber,pesan,rute")
      .order("dibuat_pada", { ascending: false })
      .limit(10);
    if (error || !data) return null;
    return (data as GalatTerbaru[]).map((r) => ({
      dibuat_pada: r.dibuat_pada ?? null,
      sumber: r.sumber ?? null,
      pesan: r.pesan ?? null,
      rute: r.rute ?? null,
    }));
  } catch {
    return null;
  }
}

// ---------- Source Intelligence (v27) ----------

export type KinerjaSumber = {
  /** Artikel TERBIT yang mencantumkan sumber ini (pf_article_sources). */
  artikel_terbit: number;
  /** Koreksi 'diperbaiki' pada artikel yang mencantumkan sumber ini. */
  koreksi_diperbaiki: number;
};

/**
 * Kinerja editorial per sumber (Source Intelligence): jumlah
 * artikel terbit + koreksi yang diperbaiki per sumber_id.
 * Satu artikel bisa mencantumkan beberapa sumber — koreksi pada
 * artikel itu dihitung untuk SEMUA sumbernya (bukan menuduh satu
 * sumber); kolom tabel menjelaskannya. Dibaca via SERVICE client
 * (pf_correction_reports hanya bisa dibaca staf + pelapor lewat
 * RLS — pola getJumlahKoreksiTerbuka). null = tidak dapat
 * dihitung (service key belum diatur / galat), bukan 0.
 */
export async function getKinerjaSumber(): Promise<Map<
  string,
  KinerjaSumber
> | null> {
  try {
    const service = cobaServiceClient();
    if (!service) return null;
    const { data: kaitan, error: errKaitan } = await service
      .from("pf_article_sources")
      .select("sumber_id,artikel_id,pf_articles!inner(status)")
      .limit(2000);
    if (errKaitan) return null;
    const sumberPerArtikel = new Map<string, string[]>();
    const kinerja = new Map<string, KinerjaSumber>();
    for (const k of (kaitan ?? []) as {
      sumber_id: string;
      artikel_id: string;
      // Embed to-many: PostgREST mengembalikan array (1 elemen
      // karena !inner pada FK artikel_id).
      pf_articles: { status: string }[];
    }[]) {
      if (k.pf_articles?.[0]?.status !== "terbit") continue;
      const daftar = sumberPerArtikel.get(k.artikel_id) ?? [];
      daftar.push(k.sumber_id);
      sumberPerArtikel.set(k.artikel_id, daftar);
      const s = kinerja.get(k.sumber_id) ?? {
        artikel_terbit: 0,
        koreksi_diperbaiki: 0,
      };
      s.artikel_terbit += 1;
      kinerja.set(k.sumber_id, s);
    }
    const { data: koreksi, error: errKoreksi } = await service
      .from("pf_correction_reports")
      .select("artikel_id")
      .eq("status", "diperbaiki")
      .limit(1000);
    if (errKoreksi) return null;
    for (const r of (koreksi ?? []) as { artikel_id: string | null }[]) {
      if (!r.artikel_id) continue;
      for (const sid of sumberPerArtikel.get(r.artikel_id) ?? []) {
        const s = kinerja.get(sid) ?? {
          artikel_terbit: 0,
          koreksi_diperbaiki: 0,
        };
        s.koreksi_diperbaiki += 1;
        kinerja.set(sid, s);
      }
    }
    return kinerja;
  } catch {
    return null;
  }
}

// ---------- Editorial Quality Center (v27) ----------

export type ButirChecklistPraTerbit = {
  artikel_id: string;
  slug: string;
  judul: string;
  status_verifikasi: string;
  verifikasi_terakhir: string | null;
  review_terakhir: string | null;
  hard_gates: { kode: string; lolos: boolean; detail: string }[] | null;
  hard_gates_lolos: boolean | null;
  /** true hanya bila hard gates lolos + verifikasi CROSS/VERIFIED. */
  auto_publish_mungkin: boolean;
  catatan: string;
};

/**
 * Checklist pra-terbit untuk 10 draf terbaru (Editorial Quality
 * Center): status verifikasi + catatan verifikasi terakhir +
 * review editorial terakhir + hard gates G1–G6 (dievaluasi dari
 * data DB via evaluasiHardGate). Dibaca via SERVICE client
 * (buatAdminAdapter) — RLS menolak sebagian bacaan ini lewat
 * session client. null = tidak dapat dinilai (service key belum
 * diatur / adapter gagal); pemanggil menampilkan empty state
 * jujur. Checklist ini TIDAK menerbitkan apa pun — hanya menilai.
 */
export async function getChecklistPraTerbit(): Promise<
  ButirChecklistPraTerbit[] | null
> {
  try {
    await connection();
    let adapter: ReturnType<typeof buatAdminAdapter>;
    try {
      adapter = buatAdminAdapter();
    } catch {
      return null;
    }
    const { artikel } = await adapter.listArtikel({
      status: "draft",
      page: 1,
      limit: 10,
    });
    const hasil: ButirChecklistPraTerbit[] = [];
    for (const a of artikel) {
      let verifikasi: Awaited<
        ReturnType<typeof adapter.getVerifikasiTerakhir>
      > = null;
      let review: Awaited<
        ReturnType<typeof adapter.getReviewTerakhir>
      > = null;
      try {
        verifikasi = await adapter.getVerifikasiTerakhir({
          artikel_id: a.id,
        });
      } catch {
        verifikasi = null;
      }
      try {
        review = await adapter.getReviewTerakhir({ artikel_id: a.id });
      } catch {
        review = null;
      }
      let gates: ButirChecklistPraTerbit["hard_gates"] = null;
      let gatesLolos: boolean | null = null;
      let catatan = "";
      if (!verifikasi) {
        catatan =
          "Tidak ada catatan verifikasi — hard gates tidak dapat dinilai; auto-publish tidak mungkin.";
      } else {
        try {
          const nilai = await evaluasiHardGate(adapter, a, verifikasi);
          gates = Object.entries(nilai.rincian).map(([kode, r]) => ({
            kode,
            lolos: r.lolos,
            detail: r.detail,
          }));
          gatesLolos = nilai.lolos;
          catatan =
            nilai.alasan ??
            (nilai.lolos
              ? "Semua hard gates lolos."
              : "Hard gates gagal (tanpa alasan tercatat).");
        } catch {
          gates = null;
          gatesLolos = null;
          catatan = "Hard gates gagal dievaluasi (galat baca data).";
        }
      }
      const verifikasiOk =
        verifikasi !== null &&
        ["CROSS-CHECKED", "VERIFIED"].includes(verifikasi.keputusan);
      hasil.push({
        artikel_id: a.id,
        slug: a.slug,
        judul: a.judul,
        status_verifikasi: a.status_verifikasi,
        verifikasi_terakhir: verifikasi?.keputusan ?? null,
        review_terakhir: review?.keputusan ?? null,
        hard_gates: gates,
        hard_gates_lolos: gatesLolos,
        auto_publish_mungkin: gatesLolos === true && verifikasiOk,
        catatan,
      });
    }
    return hasil;
  } catch {
    return null;
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
  // Tahap C-5 (v15): isu artikel; null bila kolom belum ada
  // (migrasi v15 belum dijalankan — getArtikelAdmin mundur ke
  // select tanpa isu).
  isu: string | null;
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
  versi: {
    versi: number;
    judul: string | null;
    dibuat_pada: string | null;
    catatan: string | null;
    isi_sebelum?: string | null;
  }[];
};

const KOLOM_ARTIKEL_ADMIN =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, isu, status, status_verifikasi, penulis_nama, sumber_url, gambar_url, dijadwalkan_pada, diterbitkan_pada, dibuat_pada, diperbarui_pada";
const KOLOM_ARTIKEL_ADMIN_LAMA =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, status, status_verifikasi, penulis_nama, sumber_url, gambar_url, dijadwalkan_pada, diterbitkan_pada, dibuat_pada, diperbarui_pada";

export async function getArtikelAdmin(
  id: string,
): Promise<ArtikelAdmin | null> {
  try {
    const supabase = await createClient();
    // Tahap C-5 (v15): kolom isu dibaca bila ada; bila migrasi
    // v15 belum dijalankan, PostgREST menjawab PGRST204 dan
    // fungsi mundur ke select tanpa isu (artikel tetap bisa
    // dibuka — isu tampil kosong). Pola yang sama seperti
    // getKuisHarian untuk kolom jenis v14.
    let res = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_ADMIN)
      .eq("id", id)
      .maybeSingle();
    if (
      res.error &&
      (res.error as { code?: string }).code === "PGRST204"
    ) {
      res = await supabase
        .from("pf_articles")
        .select(KOLOM_ARTIKEL_ADMIN_LAMA)
        .eq("id", id)
        .maybeSingle();
    }
    const { data, error } = res;
    if (error || !data) return null;
    const artikel = data as unknown as Omit<
      ArtikelAdmin,
      "klaim" | "verifikasi_terakhir" | "review_terakhir" | "reviews" | "versi"
    >;

    const [klaimRes, evRes, verRes, revRes] = await Promise.all([
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
    ]);

    // v27: isi_sebelum dibaca bila kolom sudah ada (migrasi v27);
    // bila belum, PostgREST menjawab PGRST204 — mundur ke select
    // tanpa isi_sebelum (pola yang sama seperti kolom isu v15).
    // Kueri ini di luar Promise.all agar fallback-nya bisa
    // diuji sebelum dipakai.
    const versiRes = await supabase
      .from("pf_article_versions")
      .select("versi, judul, dibuat_pada, catatan, isi_sebelum")
      .eq("artikel_id", id)
      .order("versi", { ascending: false })
      .limit(10);
    let versi: ArtikelAdmin["versi"] = [];
    if (!versiRes.error) {
      versi = (versiRes.data ?? []) as ArtikelAdmin["versi"];
    } else if (
      (versiRes.error as { code?: string }).code === "PGRST204"
    ) {
      const versiResLama = await supabase
        .from("pf_article_versions")
        .select("versi, judul, dibuat_pada, catatan")
        .eq("artikel_id", id)
        .order("versi", { ascending: false })
        .limit(10);
      versi = (versiResLama.data ?? []) as ArtikelAdmin["versi"];
    }

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
      versi,
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
  /** null bila laporan masyarakat tanpa artikel (migrasi v8). */
  artikel_id: string | null;
  artikel_judul: string | null;
  nama: string | null;
  email: string | null;
  jenis: string;
  pesan: string;
  status: string;
  dibuat_pada: string | null;
  /** Kode lacak laporan masyarakat; null untuk laporan lama. */
  nomor_lacak: string | null;
  tautan_artikel: string | null;
};

export const LABEL_JENIS_KOREKSI: Record<string, string> = {
  fakta_salah: "Fakta salah",
  sumber: "Sumber bermasalah",
  typo: "Salah ketik",
  lainnya: "Lainnya",
  // Jenis laporan masyarakat (Area 13, migrasi v8).
  kesalahan_informasi: "Kesalahan informasi",
  sumber_tidak_valid: "Sumber tidak valid",
  gambar_tidak_sesuai: "Gambar tidak sesuai",
  duplikat: "Berita duplikat",
  perlu_pembaruan: "Artikel perlu diperbarui",
};

export async function getKoreksiAdmin(
  status?: string,
  jenis?: string,
): Promise<{
  laporan: KoreksiAdmin[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_correction_reports")
      .select(
        "id, artikel_id, nama, email, pelapor_email, jenis, pesan, status, dibuat_pada, nomor_lacak, tautan_artikel, pf_articles(judul)",
      )
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    if (status) query = query.eq("status", status);
    if (jenis) query = query.eq("jenis", jenis);
    const { data, error } = await query;
    if (error || !data) return { laporan: [], tersedia: false };
    return {
      laporan: (data as unknown as {
        id: string;
        artikel_id: string | null;
        nama: string | null;
        email: string | null;
        pelapor_email: string | null;
        jenis: string;
        pesan: string;
        status: string;
        dibuat_pada: string | null;
        nomor_lacak: string | null;
        tautan_artikel: string | null;
        pf_articles: { judul: string } | null;
      }[]).map((r) => ({
        id: r.id,
        artikel_id: r.artikel_id,
        artikel_judul: r.pf_articles?.judul ?? null,
        nama: r.nama,
        // Laporan masyarakat memakai pelapor_email (v8); laporan
        // koreksi artikel lama memakai email — tampilkan yang ada.
        email: r.pelapor_email ?? r.email,
        jenis: r.jenis,
        pesan: r.pesan,
        status: r.status,
        dibuat_pada: r.dibuat_pada,
        nomor_lacak: r.nomor_lacak,
        tautan_artikel: r.tautan_artikel,
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

/* ============================================================
   Operations Center /admin/ops (Fase 12, Worker G)
   ============================================================ */

export type SumberOps = {
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
  /** Kolom v22 (Worker A) — null bila kolom belum ada di DB. */
  poll_interval_minutes: number | null;
  last_success_at: string | null;
  failure_count: number | null;
  health_status: string | null;
  cooldown_until: string | null;
  /** Dari 50 run ingestion terakhir (bukan sepanjang masa). */
  run_terakhir_status: string | null;
  run_gagal_terakhir: number;
};

export type InboxOps = {
  /** pf_raw_items.status = 'baru'. */
  baru: number;
  duplikat: number;
  ditolak: number;
  disalin_dari: number;
  /** Proxy jujur "menunggu AI": item 'baru' (belum diproses
   *  pipeline) — pipeline tidak punya antrean eksplisit. */
  menunggu_ai: number;
  /** pf_articles.status = 'draft'. */
  draf: number;
  /** Draft + status_verifikasi UNCONFIRMED/DISPUTED. */
  menunggu_editor: number;
  /** Draft + status_verifikasi CROSS-CHECKED/VERIFIED. */
  siap_terbit: number;
  terbit: number;
};

export type KinerjaOps = {
  per_sumber: {
    sumber: string;
    run: number;
    ditemukan: number;
    baru: number;
    duplikat: number;
    gagal: number;
  }[];
  per_agen: {
    agen: string;
    berhasil: number;
    gagal: number;
    berjalan: number;
    dilewati: number;
  }[];
  per_kategori: {
    kategori_slug: string;
    kategori_nama: string;
    jumlah: number;
  }[];
};

export type RingkasanOps = {
  /** false bila query inti (pf_scheduled_jobs) gagal. */
  tersedia: boolean;
  db_ms: number | null;
  jobs: (JobDikenal & {
    tercatat: boolean;
    aktif: boolean;
    terakhir_jalan: string | null;
    status_terakhir: string;
    error_terakhir: string | null;
  })[];
  jobs_tersedia: boolean;
  /** Baris pf_scheduled_jobs yang namanya TIDAK ada di
   *  DAFTAR_JOB_DIKENAL (mis. backup, tanya-jawab, retensi) — v27:
   *  job yang tidak dikenal tetap harus terpantau, bukan hilang
   *  diam-diam dari Ops Center. */
  jobs_lain: {
    nama: string;
    aktif: boolean;
    terakhir_jalan: string | null;
    status_terakhir: string;
    error_terakhir: string | null;
  }[];
  sumber: SumberOps[];
  sumber_tersedia: boolean;
  /** true hanya bila kolom kesehatan v22 (Worker A) terbaca. */
  sumber_v22_tersedia: boolean;
  inbox: InboxOps;
  inbox_tersedia: boolean;
  kinerja: KinerjaOps;
  kinerja_tersedia: boolean;
  ingestion_terakhir: IngestionRunAdmin[];
};

async function hitungEqOps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabel: string,
  kolom: string,
  nilai: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(tabel)
    .select("id", { count: "exact", head: true })
    .eq(kolom, nilai);
  if (error) return null;
  return count ?? 0;
}

/**
 * Ringkasan gabungan /admin/ops — dirakit dari getter + tabel
 * yang sudah ada (monitoring, kendali, sumber, pipeline AI,
 * kinerja, API sehat). Setiap seksi punya flag tersedia sendiri:
 * RLS menolak / tabel belum ada -> seksi menampilkan empty state
 * jujur, BUKAN angka 0 (pola /observatorium).
 */
export async function getRingkasanOps(): Promise<RingkasanOps> {
  const kosong: RingkasanOps = {
    tersedia: false,
    db_ms: null,
    jobs: [],
    jobs_tersedia: false,
    jobs_lain: [],
    sumber: [],
    sumber_tersedia: false,
    sumber_v22_tersedia: false,
    inbox: {
      baru: 0,
      duplikat: 0,
      ditolak: 0,
      disalin_dari: 0,
      menunggu_ai: 0,
      draf: 0,
      menunggu_editor: 0,
      siap_terbit: 0,
      terbit: 0,
    },
    inbox_tersedia: false,
    kinerja: { per_sumber: [], per_agen: [], per_kategori: [] },
    kinerja_tersedia: false,
    ingestion_terakhir: [],
  };
  try {
    await connection();
    const supabase = await createClient();
    const mulai = Date.now();

    // --- Seksi A: jobs terjadwal ---
    const { data: dataJobs, error: errJobs } = await supabase
      .from("pf_scheduled_jobs")
      .select("nama,aktif,terakhir_jalan,status_terakhir,error_terakhir")
      .order("nama", { ascending: true });
    kosong.db_ms = Date.now() - mulai;
    if (!errJobs && dataJobs) {
      const peta = new Map(
        (dataJobs as {
          nama: string;
          aktif: boolean;
          terakhir_jalan: string | null;
          status_terakhir: string;
          error_terakhir: string | null;
        }[]).map((j) => [j.nama, j]),
      );
      kosong.jobs = DAFTAR_JOB_DIKENAL.map((d) => {
        const baris = peta.get(d.nama);
        return {
          ...d,
          tercatat: baris !== undefined,
          aktif: baris?.aktif ?? true,
          terakhir_jalan: baris?.terakhir_jalan ?? null,
          status_terakhir: baris?.status_terakhir ?? "belum_pernah",
          error_terakhir: baris?.error_terakhir ?? null,
        };
      });
      // v27: baris job yang namanya tidak dikenal — tetap
      // dikembalikan agar Reliability Center bisa menilainya
      // (backup, tanya-jawab, retensi, ...).
      const namaDikenal = new Set(DAFTAR_JOB_DIKENAL.map((d) => d.nama));
      kosong.jobs_lain = [...peta.values()]
        .filter((b) => !namaDikenal.has(b.nama))
        .map((b) => ({
          nama: b.nama,
          aktif: b.aktif,
          terakhir_jalan: b.terakhir_jalan,
          status_terakhir: b.status_terakhir,
          error_terakhir: b.error_terakhir,
        }))
        .sort((a, b) => a.nama.localeCompare(b.nama));
      kosong.jobs_tersedia = true;
      kosong.tersedia = true;
    }

    // --- Seksi B: sumber + kesehatan ---
    const { data: dataSumber, error: errSumber } = await supabase
      .from("pf_sources")
      .select(
        "id,nama,jenis,url,aktif,prioritas,terakhir_cek,status_terakhir,terakhir_diambil,jumlah_item",
      )
      .order("nama", { ascending: true });
    if (!errSumber && dataSumber) {
      // Probe kolom v22 (Worker A): select terpisah agar
      // ketiadaannya tidak menggagalkan select utama.
      let v22: Map<string, {
        poll_interval_minutes: number | null;
        last_success_at: string | null;
        failure_count: number | null;
        health_status: string | null;
        cooldown_until: string | null;
      }> | null = null;
      const { data: dataV22, error: errV22 } = await supabase
        .from("pf_sources")
        .select(
          "id,poll_interval_minutes,last_success_at,failure_count,health_status,cooldown_until",
        );
      if (!errV22 && dataV22) {
        v22 = new Map(
          (dataV22 as {
            id: string;
            poll_interval_minutes: number | null;
            last_success_at: string | null;
            failure_count: number | null;
            health_status: string | null;
            cooldown_until: string | null;
          }[]).map((r) => [r.id, r]),
        );
        kosong.sumber_v22_tersedia = true;
      }
      kosong.sumber = (dataSumber as {
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
      }[]).map((s) => {
        const kolomV22 = v22?.get(s.id);
        return {
          ...s,
          poll_interval_minutes: kolomV22?.poll_interval_minutes ?? null,
          last_success_at: kolomV22?.last_success_at ?? null,
          failure_count: kolomV22?.failure_count ?? null,
          health_status: kolomV22?.health_status ?? null,
          cooldown_until: kolomV22?.cooldown_until ?? null,
          run_terakhir_status: null,
          run_gagal_terakhir: 0,
        };
      });
      kosong.sumber_tersedia = true;
    }

    // --- Seksi A + D: run ingestion terakhir (50) ---
    const { data: dataRuns, error: errRuns } = await supabase
      .from("pf_ingestion_runs")
      .select(
        "id,sumber_id,sumber_nama,status,dimulai_pada,selesai_pada,ditemukan,baru,duplikat,gagal,error",
      )
      .order("dimulai_pada", { ascending: false })
      .limit(50);
    if (!errRuns && dataRuns) {
      const runs = dataRuns as (IngestionRunAdmin & {
        sumber_id: string | null;
      })[];
      kosong.ingestion_terakhir = runs.slice(0, 10);
      // Kesehatan per sumber dari run terakhir.
      const perSumberRun = new Map<
        string,
        { status: string | null; gagal: number }
      >();
      for (const r of runs) {
        const kunci = r.sumber_id ?? r.sumber_nama ?? "";
        if (!kunci) continue;
        const lama = perSumberRun.get(kunci);
        if (!lama) {
          perSumberRun.set(kunci, {
            status: r.status,
            gagal: r.status === "gagal" ? 1 : 0,
          });
        } else if (r.status === "gagal") {
          lama.gagal += 1;
        }
      }
      for (const s of kosong.sumber) {
        const info =
          perSumberRun.get(s.id) ?? perSumberRun.get(s.nama);
        if (info) {
          s.run_terakhir_status = info.status;
          s.run_gagal_terakhir = info.gagal;
        }
      }
      // Kinerja per sumber (agregat 50 run terakhir).
      const agregat = new Map<
        string,
        {
          sumber: string;
          run: number;
          ditemukan: number;
          baru: number;
          duplikat: number;
          gagal: number;
        }
      >();
      for (const r of runs) {
        const nama = r.sumber_nama ?? "sumber tak dikenal";
        const lama = agregat.get(nama) ?? {
          sumber: nama,
          run: 0,
          ditemukan: 0,
          baru: 0,
          duplikat: 0,
          gagal: 0,
        };
        lama.run += 1;
        lama.ditemukan += r.ditemukan;
        lama.baru += r.baru;
        lama.duplikat += r.duplikat;
        lama.gagal += r.gagal;
        agregat.set(nama, lama);
      }
      kosong.kinerja.per_sumber = [...agregat.values()].sort(
        (a, b) => b.run - a.run,
      );
      kosong.kinerja_tersedia = true;
    }

    // --- Seksi C: inbox ---
    const [baru, duplikat, ditolak, disalin, draf, terbit] =
      await Promise.all([
        hitungEqOps(supabase, "pf_raw_items", "status", "baru"),
        hitungEqOps(supabase, "pf_raw_items", "status", "duplikat"),
        hitungEqOps(supabase, "pf_raw_items", "status", "ditolak"),
        hitungEqOps(supabase, "pf_raw_items", "status", "disalin_dari"),
        hitungEqOps(supabase, "pf_articles", "status", "draft"),
        hitungEqOps(supabase, "pf_articles", "status", "terbit"),
      ]);
    const hitungArtikelVerifikasi = async (
      verifikasi: string[],
    ): Promise<number | null> => {
      const { count, error } = await supabase
        .from("pf_articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft")
        .in("status_verifikasi", verifikasi);
      if (error) return null;
      return count ?? 0;
    };
    const [menungguEditor, siapTerbit] = await Promise.all([
      hitungArtikelVerifikasi(["UNCONFIRMED", "DISPUTED"]),
      hitungArtikelVerifikasi(["CROSS-CHECKED", "VERIFIED"]),
    ]);
    if (
      baru !== null &&
      duplikat !== null &&
      ditolak !== null &&
      disalin !== null &&
      draf !== null &&
      terbit !== null &&
      menungguEditor !== null &&
      siapTerbit !== null
    ) {
      kosong.inbox = {
        baru,
        duplikat,
        ditolak,
        disalin_dari: disalin,
        menunggu_ai: baru,
        draf,
        menunggu_editor: menungguEditor,
        siap_terbit: siapTerbit,
        terbit,
      };
      kosong.inbox_tersedia = true;
    }

    // --- Seksi D: kinerja AI + kategori ---
    const { data: dataAi, error: errAi } = await supabase
      .from("pf_ai_runs")
      .select("agen,status")
      .order("dimulai_pada", { ascending: false })
      .limit(200);
    if (!errAi && dataAi) {
      const perAgen = new Map<
        string,
        {
          agen: string;
          berhasil: number;
          gagal: number;
          berjalan: number;
          dilewati: number;
        }
      >();
      for (const r of dataAi as { agen: string; status: string }[]) {
        const lama = perAgen.get(r.agen) ?? {
          agen: r.agen,
          berhasil: 0,
          gagal: 0,
          berjalan: 0,
          dilewati: 0,
        };
        if (r.status === "berhasil") lama.berhasil += 1;
        else if (r.status === "gagal") lama.gagal += 1;
        else if (r.status === "berjalan") lama.berjalan += 1;
        else if (r.status === "dilewati") lama.dilewati += 1;
        perAgen.set(r.agen, lama);
      }
      kosong.kinerja.per_agen = [...perAgen.values()].sort(
        (a, b) => b.berhasil + b.gagal - (a.berhasil + a.gagal),
      );
    }
    const kategori = await getKategori();
    const utama = kategori.filter((k) => !k.induk_id);
    const { data: kolomKategori } = await supabase
      .from("pf_articles")
      .select("kategori_slug")
      .limit(5000);
    if (kolomKategori) {
      const hitungKat = new Map<string, number>();
      for (const r of kolomKategori as { kategori_slug: string | null }[]) {
        if (!r.kategori_slug) continue;
        hitungKat.set(r.kategori_slug, (hitungKat.get(r.kategori_slug) ?? 0) + 1);
      }
      kosong.kinerja.per_kategori = utama.map((k) => ({
        kategori_slug: k.slug,
        kategori_nama: k.nama,
        jumlah: hitungKat.get(k.slug) ?? 0,
      }));
    }

    return kosong;
  } catch {
    return kosong;
  }
}
