// Klien Supabase untuk Client Components (browser).
// Hanya memakai anon key publik; keamanan ditegakkan RLS di database.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
