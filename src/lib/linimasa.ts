// Helper murni garis waktu /timeline (P1-4) — TANPA dependensi dan
// TANPA membaca jam dinding: semua fungsi menerima tanggal sebagai
// string ISO YYYY-MM-DD / milidetik eksplisit dari pemanggil
// (server). Sengaja tidak memakai `new Date()` di sini kecuali
// untuk memvalidasi tanggal kalender nyata (bukan jam saat ini),
// agar komponen klien yang mengimpor berkas ini tetap
// deterministik di prerender (pola GrafikInteraktif.tsx).
//
// Dipakai server (page.tsx: filter ?dari=&sampai=, penanda
// "perkembangan terbaru", batas zoom) dan klien (GarisWaktu.tsx:
// posisi titik di sumbu).

const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Pecah YYYY-MM-DD menjadi [tahun, bulan 1-12, hari], null bila
 *  bukan format itu. */
function pecahTanggal(tanggal: string): [number, number, number] | null {
  const m = POLA_TANGGAL.exec(tanggal);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** true bila string adalah tanggal kalender nyata (2026-02-30
 *  ditolak — bukan hanya formatnya yang benar). */
export function tanggalValid(tanggal: string): boolean {
  const p = pecahTanggal(tanggal);
  if (!p) return false;
  const [th, bl, hr] = p;
  if (bl < 1 || bl > 12 || hr < 1 || hr > 31) return false;
  const d = new Date(Date.UTC(th, bl - 1, hr));
  return (
    d.getUTCFullYear() === th &&
    d.getUTCMonth() === bl - 1 &&
    d.getUTCDate() === hr
  );
}

export type RentangTanggal = {
  dari?: string;
  sampai?: string;
  /** true bila ada parameter tapi tak valid (format salah, tanggal
   *  tidak nyata, atau dari > sampai). */
  tidakValid: boolean;
};

/**
 * Urai ?dari= & ?sampai= (YYYY-MM-DD). Satu sisi boleh kosong
 * (filter satu arah). Mengembalikan rentang yang sudah
 * tervalidasi; bila tidak valid, pemanggil menampilkan SEMUA
 * peristiwa + pesan jujur (bukan error / bukan kosong).
 */
export function uraiRentangTanggal(
  dari?: string,
  sampai?: string,
): RentangTanggal {
  const d = typeof dari === "string" ? dari.trim() : "";
  const s = typeof sampai === "string" ? sampai.trim() : "";
  if (!d && !s) return { tidakValid: false };
  if ((d && !tanggalValid(d)) || (s && !tanggalValid(s))) {
    return { tidakValid: true };
  }
  if (d && s && d > s) return { tidakValid: true };
  return {
    ...(d ? { dari: d } : {}),
    ...(s ? { sampai: s } : {}),
    tidakValid: false,
  };
}

/**
 * Saring event berdasarkan dimulai_pada (bagian tanggalnya saja,
 * perbandingan string ISO — kronologis). Event tanpa tanggal
 * dikeluarkan bila filter aktif (tidak bisa ditempatkan dalam
 * rentang). Tanpa rentang, kembalikan daftar apa adanya.
 */
export function saringEventRentang<T extends { dimulai_pada: string | null }>(
  events: T[],
  rentang: RentangTanggal,
): T[] {
  if (rentang.tidakValid || (!rentang.dari && !rentang.sampai)) {
    return events;
  }
  return events.filter((e) => {
    if (!e.dimulai_pada) return false;
    const t = e.dimulai_pada.slice(0, 10);
    if (rentang.dari && t < rentang.dari) return false;
    if (rentang.sampai && t > rentang.sampai) return false;
    return true;
  });
}

/** Jumlah hari dalam satu bulan (kalender Gregorian). */
function hariDalamBulan(tahun: number, bulan: number): number {
  // Hari ke-0 bulan berikut = hari terakhir bulan ini.
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/**
 * Kurangi N bulan kalender dari tanggal ISO (hari dijepit ke akhir
 * bulan bila bulan tujuan lebih pendek — 31 Mar − 1 bln = 28 Feb).
 * Murni aritmetika string, tanpa jam dinding.
 */
export function kurangiBulan(tanggal: string, bulan: number): string {
  const p = pecahTanggal(tanggal);
  if (!p) return tanggal;
  const [th, bl, hr] = p;
  const total = th * 12 + (bl - 1) - bulan;
  const tahunBaru = Math.floor(total / 12);
  const bulanBaru = total - tahunBaru * 12 + 1;
  const hariBaru = Math.min(hr, hariDalamBulan(tahunBaru, bulanBaru));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tahunBaru}-${pad(bulanBaru)}-${pad(hariBaru)}`;
}

export type BatasZoom = {
  satuTahun: string;
  enamBulan: string;
  tigaBulan: string;
};

/** Batas bawah tiap periode zoom, relatif terhadap tanggal jangkar
 *  (tanggal hari ini WIB, dihitung server). */
export function batasZoom(jangkar: string): BatasZoom {
  return {
    satuTahun: kurangiBulan(jangkar, 12),
    enamBulan: kurangiBulan(jangkar, 6),
    tigaBulan: kurangiBulan(jangkar, 3),
  };
}

/**
 * Hari sejak epoch untuk satu tanggal kalender (algoritma
 * days_from_civil Howard Hinnant — aritmetika murni, tanpa Date).
 * Dipakai GarisWaktu untuk menempatkan titik secara proporsional
 * pada sumbu waktu.
 */
export function hariDariSipil(tahun: number, bulan: number, hari: number): number {
  const y = bulan <= 2 ? tahun - 1 : tahun;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const mp = (bulan + 9) % 12; // Mar=0 .. Feb=11
  const doy = Math.floor((153 * mp + 2) / 5) + hari - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Hari sejak epoch untuk tanggal ISO YYYY-MM-DD. */
export function hariDariISO(tanggal: string): number {
  const p = pecahTanggal(tanggal);
  if (!p) return 0;
  return hariDariSipil(p[0], p[1], p[2]);
}

/**
 * true bila entri kronologi terbaru event terjadi dalam
 * `batasHari` hari terakhir (relatif terhadap `sekarangMs` yang
 * diberikan server). Entri berwaktu di masa depan tidak dihitung
 * sebagai perkembangan terbaru.
 */
export function adaPerkembanganTerbaru(
  kronologi: { waktu: string | null }[],
  sekarangMs: number,
  batasHari = 7,
): boolean {
  let terbaru: number | null = null;
  for (const k of kronologi) {
    if (!k.waktu) continue;
    const t = Date.parse(k.waktu);
    if (Number.isNaN(t)) continue;
    if (terbaru === null || t > terbaru) terbaru = t;
  }
  if (terbaru === null) return false;
  const selisih = sekarangMs - terbaru;
  return selisih >= 0 && selisih <= batasHari * 24 * 60 * 60 * 1000;
}
