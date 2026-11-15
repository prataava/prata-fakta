// Label & kelas lencana status verifikasi — fungsi murni, aman dipakai
// Server Component maupun Client Component.
export type StatusVerifikasi =
  | "VERIFIED"
  | "CROSS-CHECKED"
  | "DEVELOPING"
  | "UNCONFIRMED"
  | "DISPUTED"
  | "CORRECTED";

export const LABEL_STATUS_VERIFIKASI: Record<StatusVerifikasi, string> = {
  VERIFIED: "Terverifikasi",
  "CROSS-CHECKED": "Cek Silang",
  DEVELOPING: "Berkembang",
  UNCONFIRMED: "Belum Terkonfirmasi",
  DISPUTED: "Disengketakan",
  CORRECTED: "Dikoreksi",
};

export const KELAS_LENCANA: Record<StatusVerifikasi, string> = {
  VERIFIED: "lencana lencana-verified",
  "CROSS-CHECKED": "lencana lencana-cross-checked",
  DEVELOPING: "lencana lencana-developing",
  UNCONFIRMED: "lencana lencana-unconfirmed",
  DISPUTED: "lencana lencana-disputed",
  CORRECTED: "lencana lencana-corrected",
};

export function labelStatusVerifikasi(status: string): string {
  return (
    LABEL_STATUS_VERIFIKASI[status as StatusVerifikasi] ?? status
  );
}

export function kelasLencanaStatus(status: string): string {
  return KELAS_LENCANA[status as StatusVerifikasi] ?? "lencana";
}
