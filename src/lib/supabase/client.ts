// Klien Supabase untuk Client Components (browser).
// Hanya memakai anon key publik; keamanan ditegakkan RLS di database.
import { createBrowserClient } from "@supabase/ssr";

// OPSI COOKIE SESI (Gelombang B1, P0-6 / S-10): sama seperti
// lib/supabase/server.ts — `secure: true` di produksi.
// `httpOnly` SENGAJA TIDAK diaktifkan di sini: penulisan cookie
// lewat document.cookie mengabaikan flag HttpOnly (perilaku
// browser), dan — yang menentukan — klien ini MEMBACA sesi dari
// document.cookie; cookie httpOnly dari server tidak terbaca
// (dibuktikan scripts/uji-ultimate-security.mjs §P0-6). Lihat
// komentar lengkap di lib/supabase/server.ts sebelum mengubah.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // httpOnly: false SENGAJA — lihat komentar di atas berkas.
        httpOnly: false,
      },
    },
  );
}
