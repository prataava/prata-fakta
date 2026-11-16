// Proxy: refresh sesi Supabase di setiap request (pola resmi @supabase/ssr).
// Next 16.4: konvensi "middleware" sudah deprecated → memakai "proxy".
// Tidak memblokir rute publik; proteksi rute admin dilakukan di layout
// halaman admin (Fase 5) dengan pemeriksaan role lewat server client.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cariKategori } from "@/lib/categories";
import { buatHeaderCsp, buatNonce } from "@/lib/csp";
import { apakahAsalDiizinkan } from "@/lib/asal";

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

// Pemeriksaan keberadaan kode negara (ISO-2) di pf_countries
// lewat REST publik. true bila kode PASTI tidak ada (hasil
// kosong, atau tabel belum ada = PGRST205). false bila ada ATAU
// bila pemeriksaan gagal (fail-open: halaman yang menangani).
async function kodeNegaraTidakAda(kode: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pf_countries?kode=eq.${encodeURIComponent(kode)}&select=id&limit=1`,
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
  // CSP nonce per request (Tahap 13B — menutup utang CSP Fase 7).
  // Nonce dipasang di header CSP respons DAN di header request
  // (`x-nonce` + `Content-Security-Policy`) agar Next mengekstraknya
  // untuk skrip framework-nya sendiri dan layout/halaman bisa
  // membacanya lewat headers(). Semua respons di bawah (termasuk
  // rewrite 404) membawa header CSP yang sama.
  const nonce = buatNonce();
  const csp = buatHeaderCsp(nonce, {
    isDev: process.env.NODE_ENV !== "production",
    supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const headerRequest = new Headers(request.headers);
  headerRequest.set("x-nonce", nonce);
  headerRequest.set("Content-Security-Policy", csp);
  const denganCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const rewriteDenganCsp = (tujuan: string) =>
    denganCsp(
      NextResponse.rewrite(new URL(tujuan, request.url), {
        request: { headers: headerRequest },
      }),
    );

  // Cek CSRF terpusat (integrasi B1, P0-8/S-9): SEMUA mutasi API
  // (POST/PATCH/PUT/DELETE /api/*) wajib berasal dari origin
  // aplikasi. Menutup 51 route yang belum dipasangi cekOrigin
  // per-route — cek per-route tetap dipertahankan sebagai lapis
  // kedua (bila matcher proxy berubah, route tetap terlindung).
  // Klien non-browser (tanpa Origin/Referer: curl, workflow
  // GitHub Actions, fetch server-ke-server) tetap diizinkan
  // karena tidak punya konteks CSRF (lihat lib/asal.ts).
  // Ditempatkan SEBELUM refresh sesi agar permintaan jahat
  // ditolak cepat tanpa membebani Supabase.
  const METODE_MUTASI = ["POST", "PATCH", "PUT", "DELETE"];
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    METODE_MUTASI.includes(request.method) &&
    !apakahAsalDiizinkan(request.headers, process.env.PF_SITE_URL)
  ) {
    return denganCsp(
      NextResponse.json(
        { ok: false, error: "Permintaan lintas situs ditolak." },
        { status: 403 },
      ),
    );
  }

  // Negara tidak ada → 404 SEBELUM halaman dirender (Fase 8
  // Gelombang 2, Area 11 — pola yang sama dengan
  // /pengetahuan/[slug] Fase 7). pf_countries tidak punya
  // kolom status: keberadaan dicek dari kode ISO-2 saja.
  // Tabel belum ada (PGRST205) → kode apa pun memang 404.
  const cocokNegara = /^\/negara\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (cocokNegara) {
    const kode = decodeURIComponent(cocokNegara[1]).toUpperCase();
    if (await kodeNegaraTidakAda(kode)) {
      return rewriteDenganCsp("/_not-found");
    }
  }

  // Artikel tidak ada → 404 SEBELUM halaman dirender (Fase 2).
  const cocokArtikel = /^\/artikel\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (cocokArtikel) {
    const slug = decodeURIComponent(cocokArtikel[1]);
    if (await slugTidakAda("pf_articles", slug)) {
      return rewriteDenganCsp("/_not-found");
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
      return rewriteDenganCsp("/_not-found");
    }
  }

  // Gelombang 2 (Fase 8, integrasi koordinator): keempat rute
  // slug baru mengalami utang yang SAMA — smoke test 16 Nov 2026
  // membuktikan /cerita/tidak-ada, /riset/tidak-ada,
  // /akademi/tidak-ada, /podcast/tidak-ada semuanya HTTP 200
  // (UI 404 benar, status salah) karena notFound() di halaman
  // tidak mengubah status shell statis. Pola yang sama:
  // periksa keberadaan slug di proxy sebelum halaman dirender.
  // Keempat tabel punya kolom slug + status ('draft','terbit')
  // di v10, jadi helper slugTidakAda dipakai apa adanya.
  const cocokGel2: Array<{ pola: RegExp; tabel: string }> = [
    { pola: /^\/cerita\/([^/]+)$/, tabel: "pf_stories" },
    { pola: /^\/riset\/([^/]+)$/, tabel: "pf_research_reports" },
    { pola: /^\/akademi\/([^/]+)$/, tabel: "pf_courses" },
    { pola: /^\/podcast\/([^/]+)$/, tabel: "pf_podcast_episodes" },
  ];
  for (const { pola, tabel } of cocokGel2) {
    const cocok = pola.exec(request.nextUrl.pathname);
    if (cocok) {
      const slug = decodeURIComponent(cocok[1]);
      if (await slugTidakAda(tabel, slug)) {
        return rewriteDenganCsp("/_not-found");
      }
      break;
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
      return rewriteDenganCsp("/_not-found");
    }
  }

  // Teruskan header request yang sudah berisi nonce ke render
  // berikutnya; header CSP dipasang pada respons yang dikembalikan
  // (termasuk bila setAll di bawah membuat ulang responsnya).
  let supabaseResponse = denganCsp(
    NextResponse.next({ request: { headers: headerRequest } }),
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Opsi cookie sesi (Gelombang B1, P0-6): `secure: true` di
      // produksi; `httpOnly` SENGAJA tidak diaktifkan — klien
      // browser membaca sesi dari document.cookie dan cookie
      // httpOnly dari refresh di sini akan membuatnya buta sesi
      // (lihat lib/supabase/server.ts + baterai
      // scripts/uji-ultimate-security.mjs §P0-6).
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // httpOnly: false SENGAJA — lihat lib/supabase/server.ts.
        httpOnly: false,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = denganCsp(
            NextResponse.next({ request: { headers: headerRequest } }),
          );
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
