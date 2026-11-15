// URL publik situs — dipakai sitemap, robots, RSS, canonical, dan
// JSON-LD agar semuanya memakai satu sumber kebenaran.
// PF_SITE_URL diisi dari env deploy (lihat .env.example); bila belum
// diatur, memakai URL Vercel yang direncanakan. Situs BELUM LIVE di
// URL ini sampai deploy berhasil (lihat LAPORAN-AKHIR.md) — nilai
// ini adalah alamat yang dituju, bukan klaim bahwa situs sudah live.
export function urlSitus(): string {
  const dariEnv = process.env.PF_SITE_URL?.trim().replace(/\/+$/, "");
  return dariEnv && dariEnv.length > 0
    ? dariEnv
    : "https://prata-fakta.vercel.app";
}
