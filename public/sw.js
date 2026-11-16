/* Service worker PRATA FAKTA — push VAPID (Gelombang B2-D, E3).
 * HANYA menangani push + klik notifikasi; TIDAK ada caching /
 * fetch handler, jadi tidak mengganggu navigasi Next.js.
 * Push dikirim TANPA payload (payload-less): saat ketukan
 * diterima, worker mengambil notifikasi belum dibaca terbaru
 * dari /api/notifikasi lalu menampilkannya. Klik notifikasi
 * membuka tautannya (atau /saya/notifikasi bila tidak ada).
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
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
