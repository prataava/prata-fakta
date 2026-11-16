// Helper audit FAIL-CLOSED bersama (Tahap 13A, T10).
//
// SATU-SATUNYA jalan menulis pf_audit_logs dari route handler.
// Memakai adapter admin (service role — pf_audit_logs TIDAK punya
// policy INSERT pengguna, hanya SELECT staf; lihat migrasi v5).
// Menulis lewat adapter.catatAudit yang MELEMPAR bila insert gagal
// (pola Fase 7) — pemanggil TIDAK BOLEH menangkap lalu melanjutkan.
//
// Kontrak fail-closed: gagal insert audit → operasi DITOLAK.
// Route memanggil helper ini SESUDAH mutasi berhasil (audit butuh
// id + keadaan sesudah) dan MEMBIARKAN galatnya naik ke penangkap
// route (responGalatAdmin → 500, atau 503 bila service key /
// tabel belum siap). Respons gagal berarti "operasi dilaporkan
// gagal" — route WAJIB melakukan compensating delete/restore
// sesudah audit gagal (hapus-balik baris yang baru dibuat /
// kembalikan nilai lama; lihat pengetahuan/riset/data route +
// kendali.ts) agar tidak ada baris tanpa jejak audit.
// CATATAN JUJUR: compensating BUKAN transaksi atomik — bila
// delete/restore-nya sendiri gagal, baris yatim tanpa audit masih
// mungkin (dicatat keras di log server). Atomicity penuh
// (transaksi/RPC lintas tulis+audit) adalah follow-up migrasi;
// JANGAN klaim atomik.
//
// JANGAN pakai pola lama di route baru:
//   try { await insertAudit(...) } catch (err) { console.error(...) }
//   — pola itu (best-effort Akademi sebelum Tahap 13A) menelan
//   kegagalan audit dan sudah dihapus dari route akademi.
import { NextResponse } from "next/server";
import { buatAdminAdapter } from "./supabase-adapter";
import { adalahGalatBelumSiap, type AuditInput } from "./types";

/**
 * Catat satu baris audit. Melempar bila insert gagal (termasuk
 * bila service key belum diatur atau tabel belum ada) — pemanggil
 * wajib membiarkan galat naik agar route menjawab 500/503.
 */
export async function catatAuditWajib(input: AuditInput): Promise<void> {
  const adapter = buatAdminAdapter();
  await adapter.catatAudit(input);
}

/**
 * Terjemahkan galat audit menjadi respons penolakan operasi:
 * layanan belum siap → 503 jujur; galat lain → 500 dengan pesan
 * bahwa operasi ditolak karena audit gagal dicatat.
 */
export function responGalatAudit(err: unknown): NextResponse {
  if (adalahGalatBelumSiap(err)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan audit belum siap (migrasi atau kunci service belum diatur); operasi ditolak karena audit wajib.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: "Gagal mencatat audit; operasi ditolak.",
    },
    { status: 500 },
  );
}
