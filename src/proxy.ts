// Proxy: refresh sesi Supabase di setiap request (pola resmi @supabase/ssr).
// Next 16.4: konvensi "middleware" sudah deprecated → memakai "proxy".
// Tidak memblokir rute publik; proteksi rute admin dilakukan di layout
// halaman admin (Fase 5) dengan pemeriksaan role lewat server client.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  // Artikel tidak ada → 404 SEBELUM halaman dirender. Dengan Cache
  // Components, shell statis sudah mengalir dengan status 200 sebelum
  // notFound() di halaman sempat berjalan (lihat panduan streaming Next:
  // "To return a request-time 404, use Proxy before the page renders").
  // Jadi pemeriksaan keberadaan slug dilakukan di sini; bila gagal
  // (tabel belum ada / jaringan error) biarkan halaman yang menangani.
  const cocokArtikel = /^\/artikel\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (cocokArtikel) {
    try {
      const slug = decodeURIComponent(cocokArtikel[1]);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pf_articles?slug=eq.${encodeURIComponent(slug)}&status=eq.terbit&select=id&limit=1`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        },
      );
      if (res.ok) {
        const baris = (await res.json()) as unknown[];
        if (Array.isArray(baris) && baris.length === 0) {
          return NextResponse.rewrite(new URL("/_not-found", request.url));
        }
      } else if (res.status === 404) {
        // PGRST205 = tabel pf_articles belum ada di database (migrasi v2
        // belum dijalankan) → belum ada satu pun artikel yang bisa terbit,
        // jadi slug apa pun memang 404. Status lain (500, dst.) tetap
        // fail-open agar halaman yang menangani.
        try {
          const body = (await res.json()) as { code?: string };
          if (body.code === "PGRST205") {
            return NextResponse.rewrite(new URL("/_not-found", request.url));
          }
        } catch {
          // Abaikan; lanjut ke halaman.
        }
      }
    } catch {
      // Fail-open: halaman artikel yang menangani (notFound + noindex).
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh sesi bila kedaluwarsa; jangan lempar error di sini —
  // halaman publik tetap bisa dibaca sebagai tamu.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
