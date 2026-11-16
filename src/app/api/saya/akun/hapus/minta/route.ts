// POST /api/saya/akun/hapus/minta — minta tautan konfirmasi hapus
// akun lewat email (Gelombang B2-A, A1).
//
// KEPUTUSAN METODE VERIFIKASI (koordinator): tautan email, BUKAN
// kata sandi — berlaku untuk semua pengguna termasuk yang daftar
// via Google OAuth (tanpa kata sandi), dan tidak ada penanganan
// kata sandi di alur ini.
//
// Alur:
//   1. Pengguna login meminta hapus -> token acak dibuat, yang
//      disimpan HANYA sha256-nya di pf_account_deletions
//      (status 'menunggu', kedaluwarsa 24 jam; permintaan lama
//      yang masih menunggu dibatalkan dulu).
//   2. Tautan dikirim ke email akun via email bawaan Supabase Auth
//      (signInWithOtp / magic link) dengan redirect ke
//      /saya/hapus-akun/konfirmasi?token=... — TANPA layanan email
//      baru (Resend L-E2 masih menunggu pemilik; bila Resend sudah
//      ada, pengirim di sini yang diganti, bukan alurnya).
//      PRASYARAT OWNER: URL redirect
//      /saya/hapus-akun/konfirmasi harus ada di daftar Redirect
//      URLs Supabase Auth; teks templat email "Magic Link" boleh
//      disesuaikan di dashboard (opsional — halaman konfirmasi
//      yang menjelaskan konteks penghapusan).
//   3. Audit 'akun.hapus.minta' dicatat SESUDAH tautan terkirim.
//      Bila pengiriman gagal, baris permintaan ditandai 'gagal'
//      (compensating update) dan dijawab 503 — token yang tidak
//      terkirim tidak boleh bisa dipakai.
//
// JANGAN PERNAH menghapus akun tanpa tautan terkonfirmasi:
// route ini hanya MENGIRIM tautan; penghapusan hanya di
// DELETE /api/saya/akun (butuh token + sesi login yang sama).
// Rate limit KERAS (fail-closed) 3/jam/akun + cek Origin (CSRF).
// 503 jujur bila migrasi v14 / service key / email belum siap.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib, responGalatAudit } from "@/lib/admin/audit";
import {
  buatRateLimiterKeras,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import {
  buatTokenHapus,
  hashEmail,
  hashToken,
  KEDALUWARSA_HAPUS_MS,
} from "@/lib/akun/token-hapus";
import {
  apakahGalatAksiAuditBelumAda,
  apakahGalatTabelTakAda,
  responV14BelumSiap,
} from "@/lib/akun/respons";

const batasiKeras = buatRateLimiterKeras(3, 3_600_000);

function asalSitus(req: Request): string {
  const dariEnv = process.env.PF_SITE_URL?.replace(/\/$/, "");
  if (dariEnv) return dariEnv;
  const host = req.headers.get("host") ?? "";
  if (!host) return "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const hasil = await batasiKeras(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();

  let pengguna: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    pengguna = data.user ?? null;
  } catch {
    pengguna = null;
  }
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menghapus akun Anda." },
      { status: 401 },
    );
  }
  if (!pengguna.email) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Akun Anda tidak memiliki alamat email, jadi verifikasi lewat tautan email tidak bisa dilakukan. Hubungi administrator.",
      },
      { status: 400 },
    );
  }
  const asal = asalSitus(req);
  if (!asal) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Alamat situs belum dikonfigurasi (PF_SITE_URL), tautan konfirmasi tidak dapat dibuat.",
      },
      { status: 503 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan hapus akun belum siap (kunci service belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }

  const userId = pengguna.id;
  const email = pengguna.email;
  const emailHash = hashEmail(email);
  const token = buatTokenHapus();
  const kedaluwarsaPada = new Date(
    Date.now() + KEDALUWARSA_HAPUS_MS,
  ).toISOString();

  // Batalkan permintaan lama yang masih menunggu (satu tautan aktif
  // per pengguna — tautan lama yang sudah terkirim ikut mati).
  const { error: errBatal } = await service
    .from("pf_account_deletions")
    .update({ status: "dibatalkan" })
    .eq("user_id", userId)
    .eq("status", "menunggu");
  if (errBatal) {
    if (apakahGalatTabelTakAda(errBatal)) return responV14BelumSiap();
    return NextResponse.json(
      { ok: false, error: "Gagal menyiapkan permintaan hapus akun." },
      { status: 500 },
    );
  }

  const { data: baris, error: errSisip } = await service
    .from("pf_account_deletions")
    .insert({
      user_id: userId,
      email_hash: emailHash,
      token_hash: hashToken(token),
      status: "menunggu",
      kedaluwarsa_pada: kedaluwarsaPada,
    })
    .select("id")
    .single();
  if (errSisip || !baris) {
    if (errSisip && apakahGalatTabelTakAda(errSisip)) {
      return responV14BelumSiap();
    }
    return NextResponse.json(
      { ok: false, error: "Gagal menyiapkan permintaan hapus akun." },
      { status: 500 },
    );
  }

  // Kirim tautan via email bawaan Supabase Auth (magic link).
  // Token hapus akun menumpang di emailRedirectTo; tautan Supabase
  // sendiri yang memverifikasi kepemilikan email.
  const sesi = await createClient();
  const { error: errOtp } = await sesi.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${asal}/saya/hapus-akun/konfirmasi?token=${token}`,
    },
  });
  if (errOtp) {
    // Compensating: token yang tidak terkirim tidak boleh dipakai.
    await service
      .from("pf_account_deletions")
      .update({ status: "gagal" })
      .eq("id", (baris as { id: string }).id);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Tautan konfirmasi gagal dikirim ke email Anda. Periksa alamat email akun lalu coba lagi.",
      },
      { status: 503 },
    );
  }

  try {
    await catatAuditWajib({
      aktor_id: userId,
      // SENGAJA null: jejak audit penghapusan tidak boleh menyimpan
      // email polos — hanya hash di sesudah.
      aktor_email: null,
      aksi: "akun.hapus.minta",
      entitas: "pf_account_deletions",
      entitas_id: (baris as { id: string }).id,
      sebelum: null,
      sesudah: { email_hash: emailHash, kedaluwarsa_pada: kedaluwarsaPada },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    // Tautan sudah terkirim tapi audit gagal: matikan token agar
    // tidak ada permintaan tanpa jejak audit, lalu jawab galat.
    await service
      .from("pf_account_deletions")
      .update({ status: "gagal" })
      .eq("id", (baris as { id: string }).id);
    if (apakahGalatAksiAuditBelumAda(err)) return responV14BelumSiap();
    return responGalatAudit(err);
  }

  return NextResponse.json({
    ok: true,
    email,
    kedaluwarsa_pada: kedaluwarsaPada,
    pesan:
      "Tautan konfirmasi telah dikirim ke email Anda. Tautan berlaku 24 jam dan hanya bisa dipakai sekali.",
  });
}
