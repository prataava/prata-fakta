// Klien Supabase untuk Server Components / Server Actions / Route Handlers.
// Pola resmi @supabase/ssr; sesi dibaca dari cookie dan di-refresh middleware.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// OPSI COOKIE SESI (Gelombang B1, P0-6 / S-10):
// - `secure: true` di produksi (Vercel = HTTPS): cookie sesi tidak
//   pernah terkirim lewat HTTP polos. Di dev (NODE_ENV bukan
//   production) dimatikan agar sesi tetap jalan lewat
//   http://localhost / IP LAN tanpa TLS.
// - `httpOnly: false` SENGAJA di sini (bukan kelalaian) — dan
//   JANGAN diubah menjadi true tanpa refactor di bawah: klien
//   browser aplikasi ini membaca sesi dari document.cookie
//   (@supabase/ssr browser client; dipakai AuthArea.tsx
//   getUser()/onAuthStateChange, profil getUser, masuk signIn).
//   Bila server menulis cookie httpOnly (mis. sesudah refresh
//   token di proxy), document.cookie tidak lagi memuat token —
//   getUser() klien mengembalikan null dan UI menganggap pengguna
//   keluar, padahal sesi server masih sah. Mekanisme ini
//   dibuktikan baterai scripts/uji-ultimate-security.mjs §P0-6
//   (cookie JS terbaca, cookie httpOnly-server tidak).
//   Mengaktifkan httpOnly BUTUH dulu memindahkan pembacaan sesi
//   klien ke Server Components — follow-up di luar Gelombang B1.
// - `maxAge` dibiarkan bawaan @supabase/ssr (400 hari): masa
//   berlaku refresh token diatur Supabase Auth, bukan cookie —
//   memendekkan cookie tidak mempersempit jendela pencurian.
// - `sameSite: "lax"` = bawaan (CSRF ditahan lapis Origin, lihat
//   cekOrigin di lib/ai/route-auth.ts); "strict" akan memecahkan
//   callback OAuth/PKCE lintas situs.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Dipanggil dari Server Component: penulisan cookie
            // ditangani middleware (updateSession).
          }
        },
      },
    },
  );
}
