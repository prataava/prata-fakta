"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ambilEventInstalasi,
  bersihkanEventInstalasi,
  useStatusInstalasi,
} from "@/lib/instalasi-pwa";
import { mintaLokasi } from "@/lib/geolokasi";

// Seksi "Izin browser" di /saya#izin-browser (pekerja C).
// Menampilkan status saat ini + tombol aksi untuk tiga izin:
// notifikasi, lokasi, dan instalasi aplikasi. Semua status
// dibaca SESUDAH mount (useEffect + useSyncExternalStore di
// store instalasi) — render pertama identik server/klien,
// tanpa hydration mismatch (pelajaran P3 #418).
//
// Jujur soal yang tidak bisa dideteksi andal:
// - Status langganan push hanya dibaca (getSubscription), tidak
//   pernah dibuat di sini — logika subscribe tetap milik
//   PengalihPush di /saya/notifikasi.
// - Izin lokasi lewat Permissions API tidak selalu mencerminkan
//   keadaan sebenarnya (mis. "prompt" bisa berarti belum pernah
//   diminta); tombol "Cek lokasi saya" adalah satu-satunya cara
//   andal untuk tahu apakah lokasi benar-benar bisa dipakai.
// - Status instalasi "tidak-tersedia" mencakup tiga keadaan yang
//   tidak bisa dibedakan dari browser (sudah terinstal / tidak
//   didukung / kriteria belum terpenuhi) — ditampilkan apa adanya.

type IzinNotifikasi =
  | "memeriksa"
  | "tidak-dukung"
  | "default"
  | "granted"
  | "denied";

type StatusPush =
  | "memeriksa"
  | "tidak-dukung"
  | "tidak-dapat-diperiksa"
  | "aktif"
  | "belum-aktif";

type IzinLokasi =
  | "memeriksa"
  | "tidak-diketahui"
  | "granted"
  | "denied"
  | "prompt";

type HasilLokasi = {
  koordinat: string;
  tempat: string | null;
};

const LABEL_IZIN_NOTIFIKASI: Record<IzinNotifikasi, string> = {
  memeriksa: "Memeriksa…",
  "tidak-dukung": "Browser ini tidak mendukung notifikasi.",
  default: "Belum diputuskan — Anda belum pernah menjawab tawaran notifikasi.",
  granted: "Diizinkan.",
  denied: "Ditolak di browser ini.",
};

const LABEL_STATUS_PUSH: Record<StatusPush, string> = {
  memeriksa: "Memeriksa langganan…",
  "tidak-dukung": "Browser ini tidak mendukung push.",
  "tidak-dapat-diperiksa":
    "Langganan push tidak dapat diperiksa dari perangkat ini.",
  aktif: "Langganan push aktif di perangkat ini.",
  "belum-aktif": "Belum berlangganan push di perangkat ini.",
};

const LABEL_IZIN_LOKASI: Record<IzinLokasi, string> = {
  memeriksa: "Memeriksa…",
  "tidak-diketahui":
    "Belum diketahui — browser ini tidak melaporkan status izin lokasi. Ketuk “Cek lokasi saya” untuk mencoba.",
  granted: "Diizinkan.",
  denied: "Ditolak di browser ini.",
  prompt: "Belum diputuskan — browser akan menanyakan izin saat lokasi diminta.",
};

// Helper baca level modul (murni, tanpa setState) — dipakai
// pemeriksaan saat mount (di dalam useEffect, pola PengalihPush)
// maupun tombol "Periksa lagi".
async function bacaStatusNotifikasi(): Promise<{
  izin: IzinNotifikasi;
  push: StatusPush;
}> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { izin: "tidak-dukung", push: "tidak-dukung" };
  }
  const izin = Notification.permission;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { izin, push: "tidak-dukung" };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const langganan = reg ? await reg.pushManager.getSubscription() : null;
    return { izin, push: langganan ? "aktif" : "belum-aktif" };
  } catch {
    return { izin, push: "tidak-dapat-diperiksa" };
  }
}

async function bacaStatusLokasi(): Promise<PermissionStatus | null> {
  if (
    typeof navigator === "undefined" ||
    !("permissions" in navigator) ||
    typeof navigator.permissions.query !== "function"
  ) {
    return null;
  }
  try {
    return await navigator.permissions.query({ name: "geolocation" });
  } catch {
    return null;
  }
}

export default function SeksiIzin() {
  const statusInstalasi = useStatusInstalasi();
  const [izinNotifikasi, setIzinNotifikasi] =
    useState<IzinNotifikasi>("memeriksa");
  const [statusPush, setStatusPush] = useState<StatusPush>("memeriksa");
  const [izinLokasi, setIzinLokasi] = useState<IzinLokasi>("memeriksa");
  const [hasilLokasi, setHasilLokasi] = useState<HasilLokasi | null>(null);
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);
  const [sibukLokasi, setSibukLokasi] = useState(false);
  const [pesanInstal, setPesanInstal] = useState<string | null>(null);
  const [sibukInstal, setSibukInstal] = useState(false);
  // Status izin lokasi yang sedang dipantau (untuk cleanup
  // onchange saat unmount).
  const statusIzinLokasiRef = useRef<PermissionStatus | null>(null);

  // Pemeriksaan saat mount — fungsi didefinisikan DI DALAM
  // effect mengikuti pola PengalihPush (react-hooks/
  // set-state-in-effect melarang pemanggilan fungsi
  // level-komponen yang memanggil setState dari badan effect).
  useEffect(() => {
    let batal = false;
    async function periksaAwal(): Promise<void> {
      const notif = await bacaStatusNotifikasi();
      if (batal) return;
      setIzinNotifikasi(notif.izin);
      setStatusPush(notif.push);
      const statusIzin = await bacaStatusLokasi();
      if (batal) return;
      if (!statusIzin) {
        setIzinLokasi("tidak-diketahui");
        return;
      }
      setIzinLokasi(statusIzin.state);
      // Daftar di onchange supaya kartu ikut berubah bila pengguna
      // mengubah izin dari pengaturan browser.
      statusIzin.onchange = () => {
        if (!batal) setIzinLokasi(statusIzin.state);
      };
      statusIzinLokasiRef.current = statusIzin;
    }
    void periksaAwal();
    return () => {
      batal = true;
      if (statusIzinLokasiRef.current) {
        statusIzinLokasiRef.current.onchange = null;
      }
    };
  }, []);

  // Membaca ulang status notifikasi + langganan push (tombol
  // "Periksa lagi"). Hanya MEMBACA — tidak pernah memanggil
  // requestPermission() atau subscribe(); aman ditekan
  // berkali-kali walau izin ditolak.
  async function periksaNotifikasi(): Promise<void> {
    const hasil = await bacaStatusNotifikasi();
    setIzinNotifikasi(hasil.izin);
    setStatusPush(hasil.push);
  }

  // Membaca ulang status izin lokasi (dipanggil sesudah
  // "Cek lokasi saya" — izin bisa berubah karena pengguna
  // menjawab prompt geolocation).
  async function periksaLokasi(): Promise<void> {
    const statusIzin = await bacaStatusLokasi();
    if (!statusIzin) {
      setIzinLokasi("tidak-diketahui");
      return;
    }
    setIzinLokasi(statusIzin.state);
    statusIzin.onchange = () => setIzinLokasi(statusIzin.state);
    statusIzinLokasiRef.current = statusIzin;
  }

  // "Cek lokasi saya": meminta geolocation SEKALI (hanya dari
  // ketukan tombol ini) lewat helper bersama mintaLokasi()
  // (@/lib/geolokasi — dipakai juga /peta dan /data/live cuaca),
  // lalu mencari nama tempat lewat reverse geocode via proxy server
  // /api/geocode/balik (server meneruskan koordinat ke Nominatim,
  // OpenStreetMap, tanpa kunci — penyedia yang sama dipakai
  // server di src/lib/data-live.ts). Koordinat hanya
  // ditampilkan di perangkat ini dan tidak disimpan di server
  // PRATA FAKTA; koordinat dikirim ke server kami (proxy) hanya
  // untuk diteruskan ke Nominatim mencari nama tempat. Bila nama
  // tempat gagal dicari, koordinat tetap ditampilkan dengan
  // penjelasan jujur.
  async function cekLokasi(): Promise<void> {
    if (sibukLokasi) return;
    if (
      typeof navigator === "undefined" ||
      !("geolocation" in navigator)
    ) {
      setPesanLokasi("Browser ini tidak mendukung geolocation.");
      return;
    }
    setSibukLokasi(true);
    setPesanLokasi(null);
    setHasilLokasi(null);
    try {
      const hasil = await mintaLokasi();
      if (!hasil.ok) {
        if (hasil.alasan === "ditolak") {
          setPesanLokasi(
            "Izin lokasi ditolak. Aktifkan lewat ikon gembok di address bar → Setelan situs → Lokasi → Izinkan, lalu coba lagi.",
          );
        } else if (hasil.alasan === "tidak-tersedia") {
          setPesanLokasi(
            "Lokasi tidak dapat ditentukan di perangkat ini (mis. GPS tidak aktif).",
          );
        } else if (hasil.alasan === "timeout") {
          setPesanLokasi("Permintaan lokasi kehabisan waktu. Coba lagi.");
        } else {
          setPesanLokasi("Browser ini tidak mendukung geolocation.");
        }
        return;
      }
      const lat = hasil.lintang;
      const lon = hasil.bujur;
      const koordinat = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      let tempat: string | null = null;
      try {
        const res = await fetch(
          `/api/geocode/balik?lat=${lat}&lon=${lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            display_name?: unknown;
          };
          tempat =
            typeof data.display_name === "string"
              ? data.display_name
              : null;
        }
      } catch {
        tempat = null;
      }
      setHasilLokasi({ koordinat, tempat });
      if (!tempat) {
        setPesanLokasi(
          "Nama tempat tidak dapat dicari (layanan geocode tidak merespons) — koordinat di atas tetap lokasi Anda.",
        );
      }
      void periksaLokasi();
    } finally {
      setSibukLokasi(false);
    }
  }

  // Tombol "Instal aplikasi": memanggil event.prompt() yang
  // tersimpan di store. Satu event hanya bisa dipakai sekali —
  // sesudah prompt() selesai (diterima/ditolak), store
  // dibersihkan; bila diterima, event appinstalled akan menandai
  // status "terinstal".
  async function instal(): Promise<void> {
    const event = ambilEventInstalasi();
    if (!event || sibukInstal) return;
    setSibukInstal(true);
    setPesanInstal(null);
    try {
      await event.prompt();
      const pilihan = await event.userChoice;
      bersihkanEventInstalasi();
      if (pilihan.outcome === "accepted") {
        setPesanInstal(
          "Pemasangan diterima — bila selesai, status di atas berubah menjadi “Sudah terinstal”.",
        );
      } else {
        setPesanInstal(
          "Tawaran instalasi ditutup. Tawaran muncul lagi saat browser menganggap aplikasi dapat diinstal.",
        );
      }
    } catch {
      bersihkanEventInstalasi();
      setPesanInstal("Tawaran instalasi gagal dibuka. Coba lagi nanti.");
    } finally {
      setSibukInstal(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="kartu" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>Notifikasi</h3>
        <p className="artikel-meta-kecil" style={{ margin: 0 }}>
          Izin browser: {LABEL_IZIN_NOTIFIKASI[izinNotifikasi]}
        </p>
        <p className="artikel-meta-kecil" style={{ margin: 0 }}>
          Push: {LABEL_STATUS_PUSH[statusPush]}
        </p>
        {izinNotifikasi === "denied" && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Izin tidak bisa diminta ulang dari halaman ini — aktifkan lewat
            pengaturan browser: Chrome / Edge: ikon gembok di address bar →
            Setelan situs → Notifikasi → Izinkan. Firefox: ikon gembok →
            Izin → Notifikasi → Izinkan. Safari (iOS): Pengaturan → Safari →
            Notifikasi → izinkan untuk situs ini.
          </p>
        )}
        {izinNotifikasi === "granted" && statusPush === "belum-aktif" && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Izin sudah diberikan tapi perangkat ini belum berlangganan push —
            selesaikan dari halaman notifikasi.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="tombol" href="/saya/notifikasi">
            Kelola di /saya/notifikasi
          </Link>
          <button
            className="tombol tombol-hantu"
            type="button"
            onClick={() => void periksaNotifikasi()}
          >
            Periksa lagi
          </button>
        </div>
      </div>

      <div className="kartu" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>Lokasi</h3>
        <p className="artikel-meta-kecil" style={{ margin: 0 }}>
          Izin browser: {LABEL_IZIN_LOKASI[izinLokasi]}
        </p>
        {hasilLokasi && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Lokasi Anda: {hasilLokasi.tempat ?? "—"} (
            {hasilLokasi.koordinat})
          </p>
        )}
        {pesanLokasi && (
          <p className="pesan-error" role="status" style={{ margin: 0 }}>
            {pesanLokasi}
          </p>
        )}
        <p className="artikel-meta-kecil" style={{ margin: 0 }}>
          Koordinat dikirim ke server PRATA FAKTA (proxy) yang
          meneruskannya ke Nominatim (OpenStreetMap) hanya untuk
          mencari nama tempat; server kami tidak menyimpan koordinat
          — koordinat hanya ditampilkan di perangkat ini.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            className="tombol tombol-primer"
            type="button"
            onClick={() => void cekLokasi()}
            disabled={sibukLokasi}
          >
            {sibukLokasi ? "Mencari lokasi…" : "Cek lokasi saya"}
          </button>
          <Link className="tombol" href="/peta">
            Buka peta
          </Link>
          <Link className="tombol" href="/data/live/cuaca">
            Buka cuaca
          </Link>
        </div>
      </div>

      <div className="kartu" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>Instalasi aplikasi</h3>
        {statusInstalasi === "dapat-diinstal" && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Aplikasi dapat dipasang di perangkat ini — terpasang sebagai
            aplikasi mandiri (tanpa address bar) dan tetap bisa dibuka
            saat offline untuk artikel yang sudah tersimpan.
          </p>
        )}
        {statusInstalasi === "terinstal" && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Sudah terinstal di perangkat ini.
          </p>
        )}
        {statusInstalasi === "tidak-tersedia" && (
          <p className="artikel-meta-kecil" style={{ margin: 0 }}>
            Belum tersedia: aplikasi mungkin sudah terinstal, browser ini
            tidak mendukung instalasi, atau kriteria instalasi belum
            terpenuhi. Coba buka lewat Chrome atau Edge (Android/desktop);
            di iPhone/iPad gunakan menu Bagikan → Tambah ke Layar Utama di
            Safari.
          </p>
        )}
        {pesanInstal && (
          <p className="pesan-sukses" role="status" style={{ margin: 0 }}>
            {pesanInstal}
          </p>
        )}
        {statusInstalasi === "dapat-diinstal" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              className="tombol tombol-primer"
              type="button"
              onClick={() => void instal()}
              disabled={sibukInstal}
            >
              {sibukInstal ? "Membuka tawaran…" : "Instal aplikasi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
