// Klien Supabase service-role untuk Route Handler ingestion.
// Kunci ini HANYA di server (env Vercel SUPABASE_SERVICE_ROLE_KEY) dan
// TIDAK PERNAH dikirim ke frontend. Dipakai ingestion untuk menulis
// pf_raw_items / pf_ingestion_runs melewati RLS (service role bypass RLS).
// Sejak Fase 8 Gelombang 1 (T5): dipakai juga route publik yang
// menulis tanpa login (langganan, laporan, tanya) — policy INSERT
// anonim dicabut di migrasi v8, jadi INSERT publik HANYA lewat
// service role dari API yang di-rate-limit.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diatur");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

/**
 * Service client bila key tersedia, null bila belum diatur.
 * Untuk jalur baca server yang BOLEH mundur ke session client
 * (mis. getKuisHarian): pakai service bila ada (wajib sesudah
 * REVOKE kunci v8), bila tidak ada pakai session client seperti
 * sebelumnya. JANGAN dipakai untuk INSERT publik T5 — di sana
 * ketiadaan key dijawab 503 jujur, bukan mundur ke session.
 */
export function cobaServiceClient(): SupabaseClient | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}
