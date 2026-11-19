// Marquee sumber tier-1 (Fase 4, adaptasi Butter): nama sumber
// NYATA dari data (props — disaring tier 1 di halaman beranda
// lewat tierDariPrioritas). Bila daftar kosong, tidak tampil
// sama sekali — bukan marquee karangan. Server component; gerak
// hanya transform translateX; berhenti saat hover; mati total
// saat prefers-reduced-motion.
import gaya from "./MarqueeSumber.module.css";

export default function MarqueeSumber({
  namaSumber,
}: {
  namaSumber: string[];
}) {
  if (namaSumber.length === 0) return null;
  const trek = (tersembunyi: boolean) => (
    <span className={gaya.trek} aria-hidden={tersembunyi || undefined}>
      {namaSumber.map((nama) => (
        <span key={nama} className={gaya.butir}>
          {nama}
        </span>
      ))}
    </span>
  );
  return (
    <div
      className={gaya.marquee}
      role="note"
      aria-label="Sumber tier-1 yang dipakai redaksi"
    >
      <span className={gaya.label}>Diliput dari sumber tier-1</span>
      <div className={gaya.viewport}>
        <div className={gaya.jalur}>
          {trek(false)}
          {trek(true)}
        </div>
      </div>
    </div>
  );
}
