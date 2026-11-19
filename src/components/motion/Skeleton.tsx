// PRATA FAKTA — Skeleton (Fase 3 redesign).
// Placeholder muat dengan shimmer. TANPA layout shift: ukuran
// TETAP lewat props lebar/tinggi (atau className) — shimmer hanya
// menggerakkan ::after di motion.css. Reduced motion mematikan
// shimmer (lihat @media prefers-reduced-motion di motion.css).

type SkeletonProps = {
  lebar?: string | number;
  tinggi?: string | number;
  className?: string;
  /** Label untuk screen reader bila skeleton bermakna. */
  label?: string;
};

export function Skeleton({ lebar, tinggi, className, label }: SkeletonProps) {
  return (
    <div
      className={`skeleton-gerak${className ? ` ${className}` : ""}`}
      style={{
        width: lebar ?? "100%",
        height: tinggi ?? 16,
      }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "status" : undefined}
    />
  );
}
