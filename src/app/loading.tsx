// Loading root (F-T1/F-S5): skeleton .kerangka yang sama dipakai
// semua pemuatan client — bukan teks "Memuat…" polos.
export default function Loading() {
  return (
    <div className="wadah">
      <div className="kerangka" role="status" aria-label="Memuat…" />
      <div className="kerangka" role="status" aria-label="Memuat…" />
      <p role="status">Memuat…</p>
    </div>
  );
}
