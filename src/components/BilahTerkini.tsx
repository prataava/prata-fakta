// Bilah TERKINI (muka baru, 20 Nov 2026): strip gelap tepat
// di bawah masthead berisi judul-judul artikel terbaru NYATA
// (data yang sudah diambil beranda — tanpa kueri baru) yang
// berjalan sebagai marquee; setiap judul adalah tautan ke
// artikelnya. Pola marquee sama dengan MarqueeSumber (trek
// digandakan untuk loop mulus; duplikat aria-hidden +
// tabIndex -1). Berhenti saat hover; prefers-reduced-motion:
// animasi mati, trek duplikat disembunyikan, strip bisa
// digeser horizontal. Server component; gerak hanya
// transform translateX.
import Link from "next/link";
import gaya from "./BilahTerkini.module.css";

export type ButirTerkini = { slug: string; judul: string };

export default function BilahTerkini({
  items,
}: {
  items: ButirTerkini[];
}) {
  if (items.length === 0) return null;
  const trek = (duplikat: boolean) => (
    <span
      className={`${gaya.trek}${duplikat ? ` ${gaya.trekDuplikat}` : ""}`}
      aria-hidden={duplikat || undefined}
    >
      {items.map((a) => (
        <Link
          key={a.slug}
          href={`/artikel/${a.slug}`}
          className={gaya.butir}
          tabIndex={duplikat ? -1 : undefined}
        >
          {a.judul}
        </Link>
      ))}
    </span>
  );
  return (
    <div className={gaya.bilah} role="region" aria-label="Berita terkini">
      <span className={gaya.label}>Terkini</span>
      <div className={gaya.viewport}>
        <div className={gaya.jalur}>
          {trek(false)}
          {trek(true)}
        </div>
      </div>
    </div>
  );
}
