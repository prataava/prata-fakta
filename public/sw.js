/* Service worker PRATA FAKTA — push VAPID (Gelombang B2-D, E3)
 * + PWA / offline reading (P3-1).
 * Push: HANYA menangani push + klik notifikasi (blok di bawah ini
 * WAJIB utuh — perilaku jalur tanpa payload tidak boleh berubah).
 * PWA: precache halaman publik + fallback /offline + strategi
 * cache per jenis aset. Yang TIDAK PERNAH di-cache: semua /api/*,
 * navigasi /admin/*, /saya/*, /masuk, /daftar (butuh login / auth),
 * respons bukan-200, dan respons ber-Set-Cookie.
 * Dua jalur push:
 *  (a) Broadcast admin (Tugas 1, v26): payload {title, body, url}
 *      terenkripsi web-push — ditampilkan langsung (+ ikon).
 *  (b) Ketukan tanpa payload (payload-less): saat ketukan
 *      diterima, worker mengambil notifikasi belum dibaca terbaru
 *      dari /api/notifikasi lalu menampilkannya. Klik notifikasi
 *      membuka tautannya (atau /saya/notifikasi bila tidak ada).
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      // Jalur (a): broadcast admin — payload {title, body, url}
      // terenkripsi web-push. Tampilkan langsung bila ada.
      let dariPayload = null;
      try {
        const j = event.data ? event.data.json() : null;
        if (j && typeof j === "object") dariPayload = j;
      } catch {
        // Bukan JSON — jatuh ke jalur tanpa payload di bawah.
      }
      if (
        dariPayload &&
        typeof dariPayload.title === "string" &&
        dariPayload.title
      ) {
        const mentah =
          typeof dariPayload.url === "string"
            ? dariPayload.url
            : "/saya/notifikasi";
        // Hanya path same-origin ("/..." bukan "//...") agar klik
        // tidak membuka situs luar.
        const tautan =
          mentah.startsWith("/") && !mentah.startsWith("//")
            ? mentah
            : "/saya/notifikasi";
        await self.registration.showNotification(dariPayload.title, {
          body:
            typeof dariPayload.body === "string"
              ? dariPayload.body
              : "Ada notifikasi baru untuk Anda.",
          icon: "/icons/icon-512.png",
          data: { tautan },
        });
        return;
      }
      // Jalur (b): ketukan tanpa payload — ambil notifikasi
      // terbaru dari /api/notifikasi (perilaku lama, tidak berubah).
      let judul = "PRATA FAKTA";
      let isi = "Ada notifikasi baru untuk Anda.";
      let tautan = "/saya/notifikasi";
      try {
        const res = await fetch("/api/notifikasi", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const daftar = Array.isArray(data.notifikasi)
            ? data.notifikasi
            : [];
          const belum = daftar.find((n) => n && n.dibaca === false);
          const pertama = belum || daftar[0];
          if (pertama) {
            if (pertama.judul) judul = pertama.judul;
            if (pertama.isi) isi = pertama.isi;
            if (pertama.tautan) tautan = pertama.tautan;
          }
        }
      } catch {
        // Gagal ambil detail = tampilkan notifikasi generik.
      }
      await self.registration.showNotification(judul, {
        body: isi,
        icon: "/icons/icon-512.png",
        data: { tautan },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tautan =
    (event.notification.data && event.notification.data.tautan) ||
    "/saya/notifikasi";
  const url = new URL(tautan, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const semua = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const klien of semua) {
        if (klien.url === url && "focus" in klien) {
          klien.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/* ---------- PWA + offline reading (P3-1) ---------- */

// v2 (18 Nov 2026, v27): batas runtime + TTL navigasi. Naik versi
// MEMAKSA instalasi lama membuang cache v1 (activate di bawah
// menghapus semua nama cache lain) sehingga kebijakan baru
// langsung berlaku di perangkat yang sudah memasang v1.
const CACHE_VERSION = "prata-fakta-v2";
const PRECACHE = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

// Batas runtime (v27): maks 100 entri BUKAN-precache di cache.
// Tanpa batas, navigasi + gambar menumpuk tanpa henti (Cache
// Storage tidak mengusir sendiri) sampai kuota browser penuh.
// TTL navigasi 7 hari: halaman yang tersimpan lebih lama dari
// itu dianggap basi dan TIDAK disajikan saat offline (jatuh ke
// /offline) — berita basi lebih buruk daripada "offline".
// Aset ber-hash (/_next/static, ikon, font) immutable — tanpa
// TTL. Gambar stale-while-revalidate — diperbarui di latar.
const BATAS_ENTRI_RUNTIME = 100;
const TTL_NAVIGASI_MS = 7 * 24 * 60 * 60 * 1000;

// Apakah URL ini WAJIB dilewati total (tanpa cache)?
// /api/* (respons API, apalagi yang butuh auth) + halaman yang
// butuh login: /admin/*, /saya/*, /masuk, /daftar.
function lewatiCache(pathname) {
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/saya/")) return true;
  if (pathname === "/masuk" || pathname.startsWith("/masuk/")) return true;
  if (pathname === "/daftar" || pathname.startsWith("/daftar/")) return true;
  return false;
}

// Respons boleh di-cache hanya bila 200/ok dan tanpa Set-Cookie.
function bolehCache(res) {
  if (!res || !res.ok) return false;
  // Set-Cookie adalah forbidden response header bagi SW, jadi
  // has() hampir selalu false — tetap diperiksa sebagai pagar
  // eksplisit sesuai aturan (jangan cache respons sesi).
  if (res.headers.has("set-cookie")) return false;
  return true;
}

async function simpanKeCache(request, response) {
  if (!bolehCache(response)) return;
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
    await pangkasCache(cache);
  } catch {
    // Gagal tulis cache (mis. kuota) = bukan error fatal.
  }
}

// Pangkas entri runtime tertua (FIFO menurut urutan keys())
// sampai di bawah batas; precache TIDAK pernah dihapus.
async function pangkasCache(cache) {
  try {
    const kunci = await cache.keys();
    const runtime = kunci.filter(
      (k) => !PRECACHE.includes(new URL(k.url).pathname),
    );
    const lebih = runtime.length - BATAS_ENTRI_RUNTIME;
    for (let i = 0; i < lebih; i++) {
      await cache.delete(runtime[i]);
    }
  } catch {
    // Gagal memangkas = bukan error fatal.
  }
}

// Apakah respons cache sudah melewati TTL? Header Date asal
// tidak ada = tidak bisa dinilai → dianggap segar (jangan buang
// yang tidak bisa dibuktikan basi).
function apakahBasi(response, ttlMs) {
  const tanggal = response.headers.get("date");
  if (!tanggal) return false;
  const waktu = Date.parse(tanggal);
  if (Number.isNaN(waktu)) return false;
  return Date.now() - waktu > ttlMs;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Precache satu per satu (bukan addAll): satu aset gagal
      // tidak menggagalkan seluruh install.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (bolehCache(res)) await cache.put(url, res);
          } catch {
            // Aset precache gagal = lewati, install tetap jalan.
          }
        }),
      );
      // Beri tahu halaman yang terbuka: versi baru terpasang
      // (dipakai BannerPembaruan untuk menampilkan banner).
      const semua = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const klien of semua) {
        klien.postMessage({ type: "SW_BARU" });
      }
      // skipWaiting HANYA sesudah precache selesai.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namaCache = await caches.keys();
      await Promise.all(
        namaCache.map((nama) => {
          if (nama !== CACHE_VERSION) return caches.delete(nama);
          return Promise.resolve(false);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

// Pesan dari halaman: SKIP_WAITING (dipakai BannerPembaruan saat
// pengguna menekan "Muat ulang").
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // HANYA GET same-origin yang ditangani.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // LEWATI TOTAL: API + halaman butuh login — tanpa cache,
  // tanpa intersepsi (biarkan jaringan apa adanya).
  if (lewatiCache(path)) return;

  // Navigasi publik → network-first, jatuh ke cache, jatuh ke /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Simpan salinan navigasi publik yang sukses agar bisa
          // dibaca saat offline; jangan tunggu tulis cache.
          void simpanKeCache(req, res);
          return res;
        } catch {
          const dariCache = await caches.match(req);
          // Sajikan cache hanya bila belum basi (TTL navigasi);
          // halaman basi jatuh ke /offline, bukan ke berita lama.
          if (dariCache && !apakahBasi(dariCache, TTL_NAVIGASI_MS)) {
            return dariCache;
          }
          const offline = await caches.match("/offline");
          if (offline) return offline;
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Aset immutable ber-hash + ikon + font → cache-first.
  const asetStatis =
    path.startsWith("/_next/static/") ||
    path.startsWith("/icons/") ||
    /\.(woff2?|ttf|otf)$/i.test(path);
  if (asetStatis) {
    event.respondWith(
      (async () => {
        const dariCache = await caches.match(req);
        if (dariCache) return dariCache;
        const res = await fetch(req);
        await simpanKeCache(req, res);
        return res;
      })(),
    );
    return;
  }

  // Gambar → stale-while-revalidate.
  const adalahGambar = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(path);
  if (adalahGambar) {
    event.respondWith(
      (async () => {
        const dariCache = await caches.match(req);
        const ambil = fetch(req)
          .then(async (res) => {
            await simpanKeCache(req, res);
            return res;
          })
          .catch(() => undefined);
        if (dariCache) {
          void ambil;
          return dariCache;
        }
        const res = await ambil;
        return res || Response.error();
      })(),
    );
    return;
  }

  // Sisanya (mis. /manifest.webmanifest): biarkan jaringan.
});
