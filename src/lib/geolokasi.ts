// Helper geolokasi sisi klien (PRATA FAKTA).
//
// Modul ini AMAN-KLIEN: tidak mengimpor apa pun dari server, tidak
// mengirim koordinat ke server kami, dan tidak menyimpan apa pun ke
// database (tidak ada migrasi untuk fitur ini). Dipakai /peta
// (tombol "Lokasi saya"), /data/live cuaca (tombol "Cuaca di
// lokasiku"), dan seksi "Izin browser" di /saya (tombol "Cek
// lokasi saya"). Lokasi HANYA dibaca sekali saat pengguna menekan
// tombol — JANGAN pakai watchPosition, dan JANGAN minta ulang
// otomatis bila pengguna menolak.
//
// Catatan kejujuran: reverse geocode di PemilihWilayah dan
// SeksiIzin mengirim koordinat SEKALI ke server PRATA FAKTA
// (/api/geocode/balik), yang meneruskannya ke Nominatim
// (OpenStreetMap, layanan publik tanpa kunci) untuk diubah menjadi
// nama wilayah/tempat; server kami tidak menyimpan koordinat.
// Pesan di UI cuaca dan kartu lokasi menyebutkannya secara eksplisit.

export type AlasanGagalLokasi =
  | "ditolak"
  | "tidak-tersedia"
  | "timeout"
  | "tidak-didukung";

export type HasilLokasi =
  | { ok: true; lintang: number; bujur: number; akurasi: number }
  | { ok: false; alasan: AlasanGagalLokasi };

export type StatusIzinLokasi =
  | "diizinkan"
  | "ditolak"
  | "bertanya"
  | "tidak-diketahui";

// Minta posisi pengguna sekali. Timeout 10 detik, hasil cache
// maksimal 60 detik, tanpa akurasi tinggi (hemat baterai —
// cukup untuk peta dan pencocokan wilayah).
export function mintaLokasi(): Promise<HasilLokasi> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve({ ok: false, alasan: "tidak-didukung" });
  }
  return new Promise((selesai) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        selesai({
          ok: true,
          lintang: pos.coords.latitude,
          bujur: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
        });
      },
      (galat) => {
        let alasan: AlasanGagalLokasi = "tidak-tersedia";
        if (galat.code === galat.PERMISSION_DENIED) alasan = "ditolak";
        else if (galat.code === galat.TIMEOUT) alasan = "timeout";
        selesai({ ok: false, alasan });
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  });
}

// Baca status izin lewat Permissions API bila tersedia. Di
// peramban tanpa Permissions API (atau tanpa dukungan geolocation
// di dalamnya) hasilnya "tidak-diketahui" — bukan "ditolak".
export async function bacaStatusIzin(): Promise<StatusIzinLokasi> {
  try {
    if (
      typeof navigator === "undefined" ||
      !navigator.permissions ||
      typeof navigator.permissions.query !== "function"
    ) {
      return "tidak-diketahui";
    }
    const status = await navigator.permissions.query({
      name: "geolocation",
    });
    if (status.state === "granted") return "diizinkan";
    if (status.state === "denied") return "ditolak";
    if (status.state === "prompt") return "bertanya";
    return "tidak-diketahui";
  } catch {
    return "tidak-diketahui";
  }
}

// Pesan jujur untuk kegagalan lokasi. "konteks" menentukan
// kalimat lanjutannya: di peta, semua peristiwa tetap tampil;
// di cuaca, pemilih wilayah manual tetap jalan.
export function pesanGagalLokasi(
  alasan: AlasanGagalLokasi,
  konteks: "peta" | "cuaca",
): string {
  const lanjutan =
    konteks === "peta"
      ? "Peta tetap menampilkan semua peristiwa."
      : "Silakan pilih wilayah secara manual di bawah ini.";
  switch (alasan) {
    case "ditolak":
      return `Izin lokasi ditolak. ${lanjutan}`;
    case "tidak-tersedia":
      return `Lokasi tidak tersedia di perangkat ini saat ini. ${lanjutan}`;
    case "timeout":
      return `Permintaan lokasi kehabisan waktu (10 detik). ${lanjutan}`;
    case "tidak-didukung":
      return `Peramban ini tidak mendukung geolokasi. ${lanjutan}`;
  }
}
