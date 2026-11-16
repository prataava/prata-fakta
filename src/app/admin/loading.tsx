// Loading segmen admin (F-S5): skeleton .kerangka, bukan teks
// "Memuat…" polos.
export default function LoadingAdmin() {
  return (
    <div>
      <div className="kerangka" role="status" aria-label="Memuat…" />
      <p role="status">Memuat…</p>
    </div>
  );
}
