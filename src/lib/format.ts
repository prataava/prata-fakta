// Format tanggal & angka publik (bahasa Indonesia) — SATU modul
// bersama untuk kartu dan halaman publik. Dipakai KartuArtikel,
// KartuCerita, KartuNegara, KartuKursus, KartuEpisode, /saya,
// /timeline, /sejarah, PetaDunia, dan ProfilKeamanan.
//
// BEDA dengan src/lib/admin/format.ts (bulan SINGKAT, khusus
// halaman admin) — sengaja tidak disatukan agar tampilan admin
// tidak berubah. formatAngka di sini adalah definisi kanonis;
// src/lib/negara.ts hanya mengekspor ulang dari modul ini agar
// importer lama (halaman negara, admin negara) tetap jalan.
export function formatTanggal(
  iso: string | null,
  kosong = "—",
): string {
  if (!iso) return kosong;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Tanggal + jam (format panjang), mis. "16 November 2026 pukul 10.19". */
export function formatTanggalJam(
  waktu: string | null,
  kosong = "—",
): string {
  if (!waktu) return kosong;
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Tanggal saja "YYYY-MM-DD" → format panjang (dipakai kartu episode
 *  podcast dan "Hari ini dalam sejarah"). */
export function formatTanggalHari(tanggal: string): string {
  if (!tanggal) return "—";
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Format angka gaya Indonesia (275.000.000). */
export function formatAngka(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}
