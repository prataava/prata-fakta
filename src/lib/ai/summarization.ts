// Agen Summarization PRATA FAKTA — ringkasan EKSTRAKTIF (bukan parafrase
// generatif): kalimat-kalimat awal ringkasan/isi_ringkas sumber diambil
// apa adanya, tanpa mengubah makna. Target 30-60 detik baca
// (kurang-lebih 300-450 karakter). Bila sumber lebih pendek, dipakai
// seluruhnya apa adanya — JANGAN mengarang tambahan.

export interface HasilRingkasan {
  ringkasan: string;
  jumlahKarakter: number;
  // Perkiraan kasar: ~10 karakter/detik membaca.
  perkiraanDetikBaca: number;
  jumlahKalimat: number;
}

const BATAS_MIN = 300;
const BATAS_MAKS = 450;

function bagiKalimat(teks: string): string[] {
  const hasil: string[] = [];
  const pola = /[^.!?]+(?:[.!?]+["”']?|$)/g;
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(teks)) !== null) {
    const kalimat = cocok[0].replace(/\s+/g, " ").trim();
    if (kalimat) hasil.push(kalimat);
  }
  return hasil;
}

export function buatRingkasan(item: {
  judul: string;
  ringkasan: string;
  isi_ringkas: string;
}): HasilRingkasan {
  const gabungan = [item.ringkasan, item.isi_ringkas]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const kalimat = bagiKalimat(gabungan);

  let ringkasan = "";
  let jumlahKalimat = 0;
  for (const k of kalimat) {
    if (ringkasan.length >= BATAS_MIN) break;
    const kandidat = ringkasan ? `${ringkasan} ${k}` : k;
    // Bila sudah mencapai batas minimal, jangan tambah kalimat yang
    // membuat total melewati batas maksimal.
    if (ringkasan.length >= BATAS_MIN && kandidat.length > BATAS_MAKS) break;
    ringkasan = kandidat;
    jumlahKalimat += 1;
  }
  if (!ringkasan) {
    // Sumber tanpa ringkasan: pakai judul apa adanya (jujur, tanpa karangan).
    ringkasan = item.judul.trim();
    jumlahKalimat = ringkasan ? 1 : 0;
  }

  const jumlahKarakter = ringkasan.length;
  return {
    ringkasan,
    jumlahKarakter,
    perkiraanDetikBaca: Math.max(5, Math.round(jumlahKarakter / 10)),
    jumlahKalimat,
  };
}
