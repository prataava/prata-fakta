// Format tanggal/waktu Indonesia untuk halaman admin (server).
export function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export function formatWaktu(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export const LABEL_STATUS_ARTIKEL: Record<string, string> = {
  draft: "Draft",
  terbit: "Terbit",
  terjadwal: "Terjadwal",
  diarsipkan: "Diarsipkan",
};

export function labelStatusArtikel(status: string): string {
  return LABEL_STATUS_ARTIKEL[status] ?? status;
}
