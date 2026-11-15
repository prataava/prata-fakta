// Proxy: refresh sesi Supabase di setiap request (pola resmi @supabase/ssr).
// Next 16.4: konvensi "middleware" sudah deprecated → memakai "proxy".
// Tidak memblokir rute publik; proteksi rute admin dilakukan di layout
// halaman admin (Fase 5) dengan pemeriksaan role lewat server client.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cariKategori } from "@/lib/categories";

// Pemeriksaan keberadaan slug di tabel Supabase lewat REST publik.
// Mengembalikan true bila slug PASTI tidak ada (hasil kosong, atau
// tabel belum ada = PGRST205 → belum ada satu pun baris yang bisa
// terbit). Mengembalikan false bila ada ATAU bila pemeriksaan gagal
// (fail-open: halaman yang menangani). Dipakai untuk 404 nyata di
// rute dinamis — dengan Cache Components, shell statis sudah mengalir
// dengan status 200 sebelum notFound() di halaman sempat berjalan
// (lihat panduan streaming Next: "To return a request-time 404, use
// Proxy before the page renders").
async function slugTidakAda(
  tabel: string,
  slug: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabel}?slug=eq.${encodeURIComponent(slug)}&status=eq.terbit&select=id&limit=1`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      },
    );
    if (res.ok) {
      const baris = (await res.json()) as unknown[];
      return Array.isArray(baris) && baris.length === 0;
    }
    if (res.status === 404) {
      // PGRST205 = tabel belum ada di database (migrasi belum
      // dijalankan) → belum ada satu pun baris yang bisa terbit,
      // jadi slug apa pun memang 404. Status lain (500, dst.)
      // tetap fail-open agar halaman yang menangani.
      try {
        const body = (await res.json()) as { code?: string };
        if (body.code === "PGRST205") return true;
      } catch {
        // Abaikan; lanjut ke halaman.
      }
    }
  } catch {
    // Fail-open: halaman yang menangani (notFound + noindex).
  }
  return false;
}

export default async function proxy(request: NextRequest) {
  // Artikel tidak ada → 404 SEBELUM halaman dirender (Fase 2).
  const cocokArtikel = /^\/artikel\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (cocokArtikel) {
    const slug = decodeURIComponent(cocokArtikel[1]);
    if (await slugTidakAda("pf_articles", slug)) {
      return NextResponse.rewrite(new URL("/_not-found", request.url));
    }
  }

  // Pengetahuan tidak ada → 404 SEBELUM halaman dirender (Fase 7).
  // Memperbaiki utang Fase 6: /pengetahuan/[slug] yang tidak ada
  // menampilkan UI 404 yang benar tetapi dengan status HTTP 200
  // (Partial Prerender mengirim shell 200 sebelum notFound() di
  // lubang dinamis berjalan). generateMetadata + notFound() di
  // halaman TIDAK mengubah status; pemeriksaan di proxy inilah
  // yang menghasilkan 404 nyata.
  const cocokPengetahuan = /^\/pengetahuan\/([^/]+)$/.exec(
    request.nextUrl.pathname,
  );
  if (cocokPengetahuan) {
    const slug = decodeURIComponent(cocokPengetahuan[1]);
    if (await slugTidakAda("pf_knowledge_articles", slug)) {
      return NextResponse.rewrite(new URL("/_not-found", request.url));
    }
  }

  // Kategori tidak ada → 404 SEBELUM halaman dirender (Fase 7).
  // Taksonomi kategori statis (src/lib/categories.ts) — tanpa
  // perlu query database; bila slug tidak dikenal taksonomi,
  // halaman kategori juga memanggil notFound(), tetapi statusnya
  // tetap 200 tanpa pemeriksaan di sini.
  const cocokKategori = /^\/kategori\/([^/]+)$/.exec(
    request.nextUrl.pathname,
  );
  if (cocokKategori) {
    const slug = decodeURIComponent(cocokKategori[1]);
    if (!cariKategori(slug)) {
      return NextResponse.rewrite(new URL("/_not-found", request.url));
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
