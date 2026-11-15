// Analisis sumber PRATA FAKTA — tier & skor kredibilitas DETERMINISTIK
// dari prioritas sumber (seed pf_sources v1), BUKAN dari popularitas
// atau jumlah pemberitaan.
//   prioritas >= 90 -> tier 1 (Antara 100, CNN Indonesia 90,
//     Liputan6 90)
//   prioritas 70-89 -> tier 2 (CNBC Indonesia 80, Tribunnews 70,
//     Republika 70)
//   prioritas < 70  -> tier 3 (BBC Indonesia 60, GDELT 50)
// Skor kredibilitas: tier 1 = 90, tier 2 = 75, tier 3 = 60.
// Skor ini HANYA dipakai sebagai bobot verifikasi silang; skor ini
// bukan penilaian mutu jurnalistik dan bukan pengganti kurasi manusia.

export type TierSumber = 1 | 2 | 3;

export interface HasilAnalisisSumber {
  tier: TierSumber;
  skor: number;
  alasan: string;
}

export function tierDariPrioritas(prioritas: number): TierSumber {
  if (prioritas >= 90) return 1;
  if (prioritas >= 70) return 2;
  return 3;
}

export function skorKredibilitas(tier: TierSumber): number {
  if (tier === 1) return 90;
  if (tier === 2) return 75;
  return 60;
}

export function analisisSumber(sumber: {
  nama: string;
  prioritas: number;
}): HasilAnalisisSumber {
  const tier = tierDariPrioritas(sumber.prioritas);
  const skor = skorKredibilitas(tier);
  const alasan =
    `Sumber "${sumber.nama}" prioritas ${sumber.prioritas} ` +
    `-> tier ${tier}, skor kredibilitas ${skor} ` +
    `(tier dari prioritas seed v1, bukan dari popularitas).`;
  return { tier, skor, alasan };
}
