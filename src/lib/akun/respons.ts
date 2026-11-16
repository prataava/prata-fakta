// Respons + deteksi galat khusus alur hapus akun (Gelombang B2-A).
// Dipakai route /api/saya/akun/hapus/* dan /api/saya/data agar
// ketiadaan migrasi v14 dijawab 503 JUJUR ("belum diterapkan"),
// bukan 500 yang menyesatkan.
import { NextResponse } from "next/server";

export function responV14BelumSiap(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan hapus akun belum aktif: migrasi database v14 belum dijalankan. Coba lagi setelah migrasi diterapkan.",
    },
    { status: 503 },
  );
}

/**
 * true bila galat berasal dari CHECK aksi audit (aksi
 * akun.hapus.* / data.hapus belum masuk CHECK) — artinya tabel
 * pf_account_deletions sudah ada tapi CHECK v14 belum diterapkan.
 * Adapter membungkus galat PostgREST menjadi Error("catatAudit
 * gagal: ... violates check constraint ..."), jadi deteksi lewat
 * pesan.
 */
export function apakahGalatAksiAuditBelumAda(err: unknown): boolean {
  const pesan = err instanceof Error ? err.message : String(err ?? "");
  return (
    pesan.includes("pf_audit_logs_aksi_check") &&
    pesan.includes("violates check constraint")
  );
}

/** true bila galat PostgREST berarti tabel belum ada (PGRST205). */
export function apakahGalatTabelTakAda(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === "PGRST205" ||
    (error?.message ?? "").includes("Could not find the table")
  );
}
