// Klien Supabase service-role untuk Route Handler ingestion.
// Kunci ini HANYA di server (env Vercel SUPABASE_SERVICE_ROLE_KEY) dan
// TIDAK PERNAH dikirim ke frontend. Dipakai ingestion untuk menulis
// pf_raw_items / pf_ingestion_runs melewati RLS (service role bypass RLS).
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
