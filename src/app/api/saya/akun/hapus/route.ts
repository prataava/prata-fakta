// GET + DELETE /api/saya/akun/hapus — verifikasi token dan eksekusi
// hapus akun mandiri (Gelombang B2-A, A1).
//
// GET ?token=... -> periksa tautan masih berlaku (untuk halaman
// konfirmasi). DELETE {token} -> HAPUS akun + semua data pengguna.
// Keduanya wajib: sesi login + token yang (a) ada, (b) milik
// pengguna yang sama, (c) status 'menunggu', (d) belum dipakai,
// (e) belum kedaluwarsa. TANPA token terkonfirmasi, penghapusan
// TIDAK PERNAH terjadi.
//
// Urutan DELETE (fail-closed, alasan di komentar tiap langkah):
//   1. Klaim token sekali pakai (menunggu -> dikonfirmasi).
//   2. Tolak bila pengguna satu-satunya super_admin (mencegah
//      situs tanpa admin).
//   3. Audit 'akun.hapus' SEBELUM deleteUser — WAJIB sebelum,
//      karena FK aktor_id menunjuk auth.users: sesudah pengguna
//      dihapus, insert audit dengan aktor_id itu melanggar FK.
//      aktor_email SENGAJA null (privasi: jejak penghapusan hanya
//      menyimpan hash email, bukan alamat polos).
//   4. Hapus langganan newsletter menurut email — tabel ini TIDAK
//      punya FK ke auth.users (hanya email), jadi cascade TIDAK
//      menyentuhnya; tanpa langkah ini email tetap berlangganan
//      sesudah akun hilang (temuan audit cascade B2-A).
//   5. Tandai baris permintaan 'dihapus', lalu
//      auth.admin.deleteUser -> cascade DB menghapus 12 tabel
//      data personal; 8 FK SET NULL menganonimkan konten publik
//      (artikel/pertanyaan/laporan/kajian tetap ada tanpa nama).
//   Bila langkah 4/5 gagal: baris ditandai 'gagal' + audit
//   'akun.hapus.gagal' (pengguna masih ada, jadi audit bisa
//   ditulis), jawab 500 — pengguna bisa minta tautan baru.
// Rate limit KERAS (fail-closed): cek 10/menit, hapus 5/jam.
// Cek Origin (CSRF) pada DELETE. 503 jujur bila v14 belum siap.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib, responGalatAudit } from "@/lib/admin/audit";
import { bacaBody, responBodyTakValid } from "@/lib/admin/guard";
import { getUserRoles, ROLES } from "@/lib/auth/roles";
import {
  buatRateLimiterKeras,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { hashEmail, hashToken } from "@/lib/akun/token-hapus";
import {
  apakahGalatAksiAuditBelumAda,
  apakahGalatTabelTakAda,
  responV14BelumSiap,
} from "@/lib/akun/respons";
import type { SupabaseClient } from "@supabase/supabase-js";

const batasiCek = buatRateLimiterKeras(10);
const batasiHapus = buatRateLimiterKeras(5, 3_600_000);

type BarisPermintaan = {
  id: string;
  user_id: string;
  email_hash: string;
  status: string;
  diminta_pada: string;
  kedaluwarsa_pada: string;
};

function tokenTakValid(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Tautan konfirmasi tidak ditemukan atau sudah tidak berlaku. Minta tautan baru dari halaman hapus akun.",
    },
    { status: 404 },
  );
}

function tokenKedaluwarsa(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Tautan konfirmasi sudah kedaluwarsa (berlaku 24 jam). Minta tautan baru dari halaman hapus akun.",
    },
    { status: 410 },
  );
}

async function penggunaMasuk(): Promise<{
  id: string;
  email?: string | null;
} | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

function layananBelumSiap(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan hapus akun belum siap (kunci service belum diatur). Coba lagi nanti.",
    },
    { status: 503 },
  );
}

/**
 * Ambil baris permintaan dari token mentah + validasi kepemilikan,
 * status, dan masa berlaku. Mengembalikan baris bila sah, atau
 * respons galat (404/410/503) bila tidak.
 */
async function ambilPermintaanSah(
  service: SupabaseClient,
  token: string,
  userId: string,
): Promise<BarisPermintaan | NextResponse> {
  const { data, error } = await service
    .from("pf_account_deletions")
    .select("id, user_id, email_hash, status, diminta_pada, kedaluwarsa_pada")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error) {
    if (apakahGalatTabelTakAda(error)) return responV14BelumSiap();
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa tautan konfirmasi." },
      { status: 500 },
    );
  }
  const baris = data as BarisPermintaan | null;
  // Token milik orang lain diperlakukan sama seperti tidak ada
  // (tidak membocorkan keberadaan token orang lain).
  if (!baris || baris.user_id !== userId || baris.status !== "menunggu") {
    return tokenTakValid();
  }
  if (new Date(baris.kedaluwarsa_pada).getTime() <= Date.now()) {
    return tokenKedaluwarsa();
  }
  return baris;
}

export async function GET(req: Request) {
  const hasil = await batasiCek(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();

  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return tokenTakValid();

  let service;
  try {
    service = createServiceClient();
  } catch {
    return layananBelumSiap();
  }
  const baris = await ambilPermintaanSah(service, token, pengguna.id);
  if (baris instanceof NextResponse) return baris;
  return NextResponse.json({
    ok: true,
    diminta_pada: baris.diminta_pada,
    kedaluwarsa_pada: baris.kedaluwarsa_pada,
  });
}

export async function DELETE(req: Request) {
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const hasil = await batasiHapus(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();

  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menghapus akun Anda." },
      { status: 401 },
    );
  }
  const body = await bacaBody(req);
  if (!body || typeof body.token !== "string" || body.token === "") {
    return responBodyTakValid();
  }
  const token = body.token as string;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return layananBelumSiap();
  }
  const userId = pengguna.id;
  const baris = await ambilPermintaanSah(service, token, userId);
  if (baris instanceof NextResponse) return baris;

  // Penjaga admin terakhir: pengguna satu-satunya super_admin
  // tidak boleh menghapus dirinya sendiri (situs tanpa admin).
  try {
    const peran = await getUserRoles(userId);
    if (peran.includes(ROLES.SUPER_ADMIN)) {
      const { data: peranSuper } = await service
        .from("pf_roles")
        .select("id")
        .eq("nama", ROLES.SUPER_ADMIN)
        .maybeSingle();
      const idSuper = (peranSuper as { id: string } | null)?.id;
      if (idSuper) {
        const { count } = await service
          .from("pf_user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role_id", idSuper);
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Anda satu-satunya admin situs ini. Tetapkan admin lain dulu sebelum menghapus akun Anda.",
            },
            { status: 403 },
          );
        }
      }
    }
  } catch {
    // Gagal membaca peran bukan alasan memblokir penghapusan
    // akun biasa; penjaga hanya berlaku bila peran terbaca.
  }

  // 1. Klaim token sekali pakai (klaim atomik: hanya baris yang
  //    masih 'menunggu' yang berubah; klaim kedua gagal 0 baris).
  const { data: klaim, error: errKlaim } = await service
    .from("pf_account_deletions")
    .update({ status: "dikonfirmasi", dipakai_pada: new Date().toISOString() })
    .eq("id", baris.id)
    .eq("status", "menunggu")
    .select("id");
  if (errKlaim || !klaim || klaim.length === 0) {
    if (errKlaim && apakahGalatTabelTakAda(errKlaim)) {
      return responV14BelumSiap();
    }
    return tokenTakValid();
  }

  const emailHash = hashEmail(pengguna.email ?? "");
  const ip = ipDariRequest(req);

  // 2. Audit SEBELUM deleteUser (alasan FK di kepala berkas).
  try {
    await catatAuditWajib({
      aktor_id: userId,
      aktor_email: null,
      aksi: "akun.hapus",
      entitas: "auth.users",
      entitas_id: userId,
      sebelum: { email_hash: emailHash },
      sesudah: { email_hash: emailHash, metode: "tautan-email" },
      ip,
    });
  } catch (err) {
    // Token sudah diklaim; kembalikan ke 'menunggu' TIDAK aman
    // (tautan bisa dipakai ulang tanpa jejak) — tandai 'gagal'
    // agar pengguna minta tautan baru dengan jejak lengkap.
    await service
      .from("pf_account_deletions")
      .update({ status: "gagal" })
      .eq("id", baris.id);
    if (apakahGalatAksiAuditBelumAda(err)) return responV14BelumSiap();
    return responGalatAudit(err);
  }

  // 3–4. Hapus langganan newsletter + tandai 'dihapus', lalu hapus
  // akun auth (cascade DB menghapus data personal).
  try {
    if (pengguna.email) {
      const { error: errNews } = await service
        .from("pf_newsletter_subscribers")
        .delete()
        .eq("email", pengguna.email);
      if (errNews && !apakahGalatTabelTakAda(errNews)) throw errNews;
    }
    const { error: errTandai } = await service
      .from("pf_account_deletions")
      .update({
        status: "dihapus",
        dihapus_pada: new Date().toISOString(),
      })
      .eq("id", baris.id);
    if (errTandai) throw errTandai;
    const { error: errHapus } =
      await service.auth.admin.deleteUser(userId);
    if (errHapus) throw errHapus;
  } catch (err) {
    // Pengguna masih ada (deleteUser gagal / langkah sebelum
    // gagal): tandai 'gagal' + audit kegagalan, jawab 500.
    await service
      .from("pf_account_deletions")
      .update({ status: "gagal" })
      .eq("id", baris.id);
    try {
      await catatAuditWajib({
        aktor_id: userId,
        aktor_email: null,
        aksi: "akun.hapus.gagal",
        entitas: "auth.users",
        entitas_id: userId,
        sebelum: { email_hash: emailHash },
        sesudah: {
          email_hash: emailHash,
          galat:
            err instanceof Error ? err.message : String(err ?? "tak dikenal"),
        },
        ip,
      });
    } catch {
      // Audit kegagalan gagal dicatat: sudah dicatat keras di
      // log server oleh catatAuditWajib; jangan menutupi galat
      // penghapusan dengan galat audit.
      console.error(
        "[hapus-akun] deleteUser gagal DAN audit kegagalan gagal dicatat.",
        err,
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "Penghapusan akun gagal di tengah jalan. Akun Anda masih ada — minta tautan baru dan coba lagi.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    dihapus_pada: new Date().toISOString(),
    pesan: "Akun Anda beserta seluruh data pribadi telah dihapus.",
  });
}
