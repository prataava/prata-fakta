// Helper autentikasi + rate limit untuk route /api/ai/* dan
// route pengguna lain (bookmark, riwayat, topik, kuis, ...).
// Mengikuti pola route ingestion (dua jalur autentikasi untuk POST:
// header secret jadwal ATAU sesi login staf; GET hanya sesi staf).
//
// TAHAP 13A (T3 — rate limiter lintas serverless instance):
// limiter Map in-memory per instance (tanpa eviction, tanpa
// store bersama) DIGANTI limiter database: tabel pf_rate_limits
// + RPC SECURITY DEFINER pf_rate_limit_check (migrasi v11).
// Satu pernyataan INSERT ... ON CONFLICT DO UPDATE yang atomik
// membuat batas berlaku di semua instance sekaligus; dua
// panggilan bersamaan tidak bisa lolos dua-duanya melewati batas.
// Kunci: pengguna login dibatasi PER AKUN ("user:<id>"), anon
// per IP ("ip:<alamat>") — lihat kunciRateLimit.
//
// KEPUTUSAN FAIL-OPEN (didokumentasikan, bukan diam-diam): bila
// RPC gagal (mis. migrasi v11 belum dijalankan di lingkungan
// itu, atau database tidak terjangkau), limiter BAWAH
// (cekRateLimitDb / buatRateLimiter) MENGIZINKAN permintaan
// dan mencatat console.error — bukan memblokir semua trafik
// dengan 429. Rate limit adalah pelindung ketersediaan;
// mematikannya sementara lebih aman daripada mematikan situs.
// Kegagalan RPC mudah ketahuan: log server + baterai
// scripts/uji-tahap13a.mjs menguji RPC langsung.
//
// PENGECUALIAN — FAIL-CLOSED (Gelombang B1, P0-7/S-2): endpoint
// berisiko tinggi (laporan, kuis/jawab, tanya POST, pemicu AI/
// ingestion, sumber cek, langganan) TIDAK BOLEH memakai limiter
// fail-open — bila RPC gagal, mereka menjawab 503 jujur lewat
// cekRateLimitDbKeras / buatRateLimiterKeras +
// responRateLimitBelumSiap. GET + route admin internal boleh
// tetap memakai limiter fail-open di bawah.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import { apakahAsalDiizinkan } from "@/lib/asal";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DipicuOleh } from "./types.ts";

// Bandingkan secret dengan timing-safe equal (temuan T9 audit
// keamanan Fase 7): perbandingan `===` membocorkan panjang awalan
// yang sama lewat waktu eksekusi. Mengembalikan false bila salah
// satu kosong atau panjangnya berbeda.
export function bandingkanSecret(
  masukan: string | null | undefined,
  rahasia: string | undefined,
): boolean {
  if (!masukan || !rahasia) return false;
  const a = Buffer.from(masukan, "utf8");
  const b = Buffer.from(rahasia, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// IP klien yang dapat dipercaya (temuan T3 audit keamanan Fase 8,
// diperbaiki Tahap 13A).
//
// JANGAN PERNAH percaya entri KIRI `x-forwarded-for`: rantai itu
// ditulis klien sendiri — siapa pun bisa menulis
// "X-Forwarded-For: 1.2.3.4" dan mendapat ember limit baru
// (bypass rate limit dengan satu header palsu). Yang dipakai:
//   1. `x-vercel-forwarded-for` bila ada — header ini ditulis
//      edge Vercel, bukan klien (entri pertama = IP asli);
//   2. bila tidak ada, entri TERAKHIR `x-forwarded-for` —
//      entri terakhir ditambahkan oleh proxy tepercaya terakhir
//      (edge) sebelum mencapai server, jadi klien tidak bisa
//      memalsukannya tanpa melewati edge;
//   3. bila keduanya kosong, "tak-dikenal" (semua pemanggil
//      tanpa IP berbagi satu ember — sengaja, agar tidak ada
//      yang lolos tanpa kunci).
//
// SISA RISIKO (jujur): entri terakhir XFF hanya tepercaya bila
// rantai proxy di depan aplikasi memang tepercaya (Vercel edge);
// di luar Vercel, proxy yang tidak tepercaya di tengah rantai
// bisa menulis entri palsu. NAT bersama (kantor/kampus/CGNAT)
// membuat banyak pengguna berbagi satu IP dan satu ember limit —
// pengguna login tidak kena ini (kunci per-akun, lihat
// kunciRateLimit). Bila butuh bukti IP yang lebih kuat, jalankan
// rate limit di edge (Vercel Firewall / Upstash), bukan di sini.
export function ipDariRequest(req: Request): string {
  const dariVercel = req.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (dariVercel) return dariVercel;
  const rantai = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (rantai && rantai.length > 0) return rantai[rantai.length - 1];
  return "tak-dikenal";
}

/**
 * Kunci rate limit untuk satu permintaan: pengguna login dibatasi
 * PER AKUN ("user:<id>") — IP bersama (NAT) tidak membuat akun
 * yang satu memblokir akun yang lain, dan penyerang tidak bisa
 * menghindari limit dengan mengganti IP. Anonim dibatasi per IP
 * ("ip:<alamat>") dari ipDariRequest.
 */
export async function kunciRateLimit(req: Request): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch {
    // Tanpa sesi (atau sesi tidak terbaca) → kunci IP di bawah.
  }
  return `ip:${ipDariRequest(req)}`;
}

/**
 * Klasifikasi galat RPC rate limit (murni, diekspos untuk uji):
 * "belum-siap" = fungsi/tabel belum ada (migrasi v11 belum
 * dijalankan) — 503 jujur yang benar; "transien" = galat lain
 * (jaringan, timeout, 5xx) — mungkin pulih sendiri. Keduanya
 * fail-closed di jalur keras; bedanya hanya pesan + alerting.
 */
export function klasifikasiGalatRpc(
  err: unknown,
): "belum-siap" | "transien" {
  const pesan = err instanceof Error ? err.message : String(err ?? "");
  const kode = (err as { code?: unknown } | null)?.code;
  if (
    kode === "PGRST202" ||
    kode === "PGRST205" ||
    kode === "42P01" ||
    kode === "42883" ||
    /Could not find the function/i.test(pesan) ||
    /relation .* does not exist/i.test(pesan) ||
    /function .* does not exist/i.test(pesan) ||
    /Could not find the table/i.test(pesan)
  ) {
    return "belum-siap";
  }
  return "transien";
}

/**
 * Log terstruktur (satu baris JSON) saat RPC rate limit gagal —
 * dibaca alerting/log server. Log lama ("Rate limit DB gagal"
 * tanpa konteks kunci/jenis) tidak bisa ditindaklanjuti.
 */
export function catatGalatRateLimit(
  err: unknown,
  konteks: {
    kunci: string;
    batas: number;
    mode: "fail-open" | "fail-closed";
  },
): void {
  console.error(
    JSON.stringify({
      event: "rate_limit_rpc_gagal",
      waktu: new Date().toISOString(),
      mode: konteks.mode,
      kunci: konteks.kunci,
      batas: konteks.batas,
      jenis: klasifikasiGalatRpc(err),
      kode: (err as { code?: unknown } | null)?.code ?? null,
      pesan: err instanceof Error ? err.message : String(err ?? ""),
    }),
  );
}

/**
 * Panggil RPC pf_rate_limit_check (migrasi v11). Mengembalikan
 * true bila permintaan ini masih dalam batas. FAIL-OPEN bila RPC
 * gagal (lihat catatan di atas berkas): izinkan + catat error
 * terstruktur. HANYA untuk GET + route admin internal — endpoint
 * berisiko tinggi wajib memakai cekRateLimitDbKeras di bawah.
 */
export async function cekRateLimitDb(
  kunci: string,
  batas: number,
  jendelaDetik = 60,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pf_rate_limit_check", {
      p_kunci: kunci,
      p_batas: batas,
      p_jendela_detik: jendelaDetik,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    catatGalatRateLimit(err, { kunci, batas, mode: "fail-open" });
    return true;
  }
}

export type HasilCekRateLimitKeras =
  | { lolos: true }
  | {
      lolos: false;
      alasan: "terbatas" | "rpc-gagal";
      jenisGalat?: "belum-siap" | "transien";
    };

/**
 * Varian FAIL-CLOSED dari cekRateLimitDb (Gelombang B1, P0-7):
 * bila RPC gagal (fungsi belum ada / database tidak terjangkau),
 * permintaan DITOLAK — bukan diizinkan. Pemanggil membedakan
 * "terbatas" (429, responRateLimit) dari "rpc-gagal" (503 jujur,
 * responRateLimitBelumSiap). Dipakai endpoint berisiko tinggi
 * (laporan, kuis/jawab, tanya POST, pemicu AI/ingestion, sumber
 * cek, langganan, vote "membantu").
 */
export async function cekRateLimitDbKeras(
  kunci: string,
  batas: number,
  jendelaDetik = 60,
): Promise<HasilCekRateLimitKeras> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pf_rate_limit_check", {
      p_kunci: kunci,
      p_batas: batas,
      p_jendela_detik: jendelaDetik,
    });
    if (error) throw error;
    return data === true
      ? { lolos: true }
      : { lolos: false, alasan: "terbatas" };
  } catch (err) {
    catatGalatRateLimit(err, { kunci, batas, mode: "fail-closed" });
    return {
      lolos: false,
      alasan: "rpc-gagal",
      jenisGalat: klasifikasiGalatRpc(err),
    };
  }
}

/**
 * Rate limiter FAIL-CLOSED lintas serverless instance (pasangan
 * buatRateLimiter): tiap panggilan memeriksa RPC
 * pf_rate_limit_check; RPC gagal -> { lolos: false, alasan:
 * "rpc-gagal" }. Pemanggil WAJIB await dan membedakan hasilnya:
 *   const hasil = await batasiKeras(req);
 *   if (!hasil.lolos && hasil.alasan === "rpc-gagal")
 *     return responRateLimitBelumSiap(hasil.jenisGalat);
 *   if (!hasil.lolos) return responRateLimit();
 */
export function buatRateLimiterKeras(
  batas: number,
  jendelaMs = 60_000,
): (req: Request) => Promise<HasilCekRateLimitKeras> {
  const jendelaDetik = Math.max(1, Math.round(jendelaMs / 1000));
  return async (req: Request): Promise<HasilCekRateLimitKeras> => {
    const kunci = await kunciRateLimit(req);
    return cekRateLimitDbKeras(kunci, batas, jendelaDetik);
  };
}

/**
 * Respons 503 jujur saat pembatas rate limit belum siap/gagal
 * (pasangan responRateLimit): bedakan "migrasi belum dijalankan"
 * dari galat transien agar operator tahu yang mana yang rusak.
 */
export function responRateLimitBelumSiap(
  jenisGalat: "belum-siap" | "transien" = "transien",
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        jenisGalat === "belum-siap"
          ? "Layanan pembatas belum siap (migrasi rate limit belum dijalankan). Coba lagi nanti."
          : "Layanan pembatas sementara tidak tersedia. Coba lagi nanti.",
    },
    { status: 503 },
  );
}

export function responOriginTakCocok(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Permintaan lintas situs ditolak." },
    { status: 403 },
  );
}

/**
 * Cek CSRF berbasis Origin/Referer (Gelombang B1, P0-8/S-9,
 * B-S6) — helper bersama untuk SEMUA route POST/PATCH/DELETE.
 * Mengembalikan NextResponse 403 bila permintaan lintas situs,
 * null bila lolos. Logika ada di lib/asal.ts (apakahAsalDiizinkan
 * — dipakai bersama proxy.ts agar satu sumber kebenaran).
 * SameSite=Lax tetap berlaku sebagai lapis kedua; cek ini
 * menutup celah CSRF pada navigasi top-level GET yang membawa
 * cookie Lax (mis. tautan dari situs lain).
 */
export function cekOrigin(req: Request): NextResponse | null {
  return apakahAsalDiizinkan(req.headers, process.env.PF_SITE_URL)
    ? null
    : responOriginTakCocok();
}

// Rate limiter lintas serverless instance (Tahap 13A, T3):
// tiap panggilan memeriksa RPC pf_rate_limit_check dengan kunci
// dari kunciRateLimit (per-akun bila login, per-IP bila anonim).
// Mengembalikan fungsi ASINKRON — pemanggil WAJIB await:
//   if (!(await batasi(req))) return responRateLimit();
// (Versi lama mengembalikan fungsi sinkron atas Map in-memory;
// pola lama itu sudah tidak ada — jangan kembalikan.)
export function buatRateLimiter(
  batas: number,
  jendelaMs = 60_000,
): (req: Request) => Promise<boolean> {
  const jendelaDetik = Math.max(1, Math.round(jendelaMs / 1000));
  return async (req: Request): Promise<boolean> => {
    const kunci = await kunciRateLimit(req);
    return cekRateLimitDb(kunci, batas, jendelaDetik);
  };
}

export function responRateLimit() {
  return NextResponse.json(
    { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
    { status: 429 },
  );
}

/**
 * Tolak akun dibatasi (nonaktif) — helper bersama T4 (Tahap 13A).
 * Dipakai SEMUA route pengguna + staf yang memeriksa sesi login
 * sendiri (bukan lewat autentikasiAdmin/autentikasiStaf, yang
 * sudah memeriksa di dalam). Mengembalikan NextResponse 403 bila
 * akun nonaktif, null bila lolos. FAIL-OPEN bila tabel profil
 * belum ada / query gagal — konsisten dengan guard yang sudah
 * ada (route menjawab 503 yang jujur di langkah berikutnya bila
 * memang layanannya belum siap).
 */
export async function tolakAkunNonaktif(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", userId)
      .maybeSingle();
    if (profil && (profil as { nonaktif: boolean }).nonaktif) {
      return NextResponse.json(
        { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
        { status: 403 },
      );
    }
  } catch {
    // Lanjut — tabel profil belum ada bukan alasan memblokir di sini.
  }
  return null;
}

// Autentikasi staf (GET): harus login + punya role editor/fact_checker
// (super_admin lolos lewat punyaRole). Kembalikan null bila lolos,
// atau NextResponse error bila tidak.
export async function autentikasiStaf(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  // Akun dibatasi (nonaktif) tidak boleh memakai fitur AI editorial
  // (temuan T4 audit keamanan Fase 7 — sebelumnya hanya guard admin
  // yang memeriksa nonaktif).
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR, ROLES.FACT_CHECKER)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses ke fitur AI editorial." },
      { status: 403 },
    );
  }
  return null;
}

export type HasilAutentikasiPemicu =
  | { ok: true; dipicuOleh: DipicuOleh }
  | { ok: false; respon: NextResponse };

// Autentikasi dua jalur (POST pemicu job):
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
export async function autentikasiPemicuAi(
  req: Request,
): Promise<HasilAutentikasiPemicu> {
  const secretEnv = process.env.PF_AI_SECRET;
  const secretHeader = req.headers.get("x-pf-ai-secret");
  const lewatSecret = bandingkanSecret(secretHeader, secretEnv);
  if (lewatSecret) {
    // v28 (pg_cron): pemicu terjadwal dari database mengirim header
    // x-pf-pemicu: pg_cron BERSAMA secret yang sama — dicatat
    // 'pg_cron', bukan 'github_actions'. Header ini hanya bermakna
    // bila secret cocok (tanpa secret, permintaan ditolak di bawah);
    // pemanggil tanpa header tetap 'github_actions' seperti dulu.
    const pemicuHeader = req.headers.get("x-pf-pemicu");
    return {
      ok: true,
      dipicuOleh: pemicuHeader === "pg_cron" ? "pg_cron" : "github_actions",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (!secretEnv) {
      return {
        ok: false,
        respon: NextResponse.json(
          {
            ok: false,
            error:
              "Layanan AI editorial belum dikonfigurasi (secret belum diatur).",
          },
          { status: 503 },
        ),
      };
    }
    return {
      ok: false,
      respon: NextResponse.json(
        { ok: false, error: "Anda harus masuk terlebih dahulu." },
        { status: 401 },
      ),
    };
  }
  // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh memicu job
  // AI editorial — sebelumnya hanya autentikasiStaf (GET) yang
  // memeriksa nonaktif, jalur pemicu POST ini lolos.
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) {
    return { ok: false, respon: ditolak };
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR)) {
    return {
      ok: false,
      respon: NextResponse.json(
        { ok: false, error: "Anda tidak punya akses untuk memicu job AI." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, dipicuOleh: "manual" };
}

// Normalisasi nilai dipicu_oleh dari body (bila pemanggil mengisinya).
// v28: 'pg_cron' diterima (job pg_cron mengirimnya di body ingestion).
export function normalisasiDipicuOleh(
  nilai: unknown,
  bawaan: DipicuOleh,
): DipicuOleh {
  return nilai === "github_actions" ||
    nilai === "manual" ||
    nilai === "pg_cron"
    ? nilai
    : bawaan;
}
