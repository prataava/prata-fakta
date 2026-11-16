// Agen Fact Verification PRATA FAKTA — keputusan DETERMINISTIK dari
// metadata judul identik + tier sumber. BUKAN penilaian isi oleh LLM.
//   - Sumber INDEPENDEN = sumber_id berbeda DAN tidak terhubung rantai
//     disalin_dari: item yang disalin_dari_id-nya menunjuk item lain
//     dalam kelompok yang sama dihitung SATU sumber dengan aslinya.
//     Banyak media menyalin berita yang sama TIDAK PERNAH dihitung
//     sebagai banyak sumber independen.
//   - >= 2 sumber independen tier-1 mendukung -> VERIFIED
//   - >= 2 sumber independen tier berapa pun -> CROSS-CHECKED
//   "Sumber independen" dihitung TOTAL termasuk sumber item utama
//   (aturan dua-sumber: utama + 1 koroborator independen sudah
//   terkoroborasi; koroborator saja tidak dihitung tanpa utama).
//   - Topik ramai (>= 3 item dalam 24 jam terakhir) + 1 sumber
//     -> DEVELOPING
//   - Selain itu -> UNCONFIRMED (bukti tidak cukup = TETAP UNCONFIRMED)
// JANGAN PERNAH auto-DISPUTED dari metadata: DISPUTED hanya dari
// evidence arah='menentang' yang dimasukkan review manusia/Muse
// lewat chat. CORRECTED juga hanya dari koreksi manusia.
import type { KeputusanVerifikasi } from "./types.ts";
import type { TierSumber } from "./source-analysis.ts";

export interface ItemSerupaVerifikasi {
  id: string;
  sumber_id: string | null;
  url: string;
  judul: string;
  ringkasan: string;
  waktu_terbit_asli: string | null;
  disalin_dari_id: string | null;
}

export interface SumberIndependen {
  // sumber_id akar rantai salinan (null bila sumber tak dikenal —
  // dihitung satu sumber per item akar).
  sumberId: string | null;
  itemAkar: ItemSerupaVerifikasi;
  tier: TierSumber;
}

export interface HasilVerifikasi {
  keputusan: KeputusanVerifikasi;
  sumberIndependen: number;
  jumlahItem: number;
  jumlahTier1: number;
  item24Jam: number;
  alasan: string;
}

const SATU_HARI_MS = 24 * 60 * 60 * 1000;

// Ikuti rantai disalin_dari_id sampai item akar (item yang bukan
// salinan dari item lain dalam kelompok). Pengaman siklus: berhenti
// bila id sudah dikunjungi.
export function cariAkarItem(
  item: ItemSerupaVerifikasi,
  peta: Map<string, ItemSerupaVerifikasi>,
): ItemSerupaVerifikasi {
  const dikunjungi = new Set<string>();
  let sekarang = item;
  while (
    sekarang.disalin_dari_id &&
    peta.has(sekarang.disalin_dari_id) &&
    !dikunjungi.has(sekarang.id)
  ) {
    dikunjungi.add(sekarang.id);
    sekarang = peta.get(sekarang.disalin_dari_id) as ItemSerupaVerifikasi;
  }
  return sekarang;
}

// Kelompokkan item-item berjudul identik menjadi sumber-sumber
// independen (satu entri per akar rantai salinan per sumber_id).
export function daftarSumberIndependen(
  kelompok: ItemSerupaVerifikasi[],
  tierPerSumber: Map<string, number>,
): SumberIndependen[] {
  const peta = new Map<string, ItemSerupaVerifikasi>();
  for (const item of kelompok) {
    if (!peta.has(item.id)) peta.set(item.id, item);
  }
  const perKunci = new Map<string, SumberIndependen>();
  for (const item of peta.values()) {
    const akar = cariAkarItem(item, peta);
    const kunci = akar.sumber_id ?? `item:${akar.id}`;
    if (perKunci.has(kunci)) continue;
    const tierMentah = akar.sumber_id
      ? tierPerSumber.get(akar.sumber_id)
      : undefined;
    const tier: TierSumber =
      tierMentah === 1 || tierMentah === 2 || tierMentah === 3
        ? tierMentah
        : 3;
    perKunci.set(kunci, { sumberId: akar.sumber_id, itemAkar: akar, tier });
  }
  return [...perKunci.values()];
}

function dalam24Jam(
  item: ItemSerupaVerifikasi,
  sekarang: Date,
): boolean {
  // P1-1 (N-T2, AUDIT-ULTIMATE §7.1): tanpa tanggal terbit, umur
  // item TIDAK DIKETAHUI — jangan hitung sebagai "baru". Item
  // tanpa tanggal tidak boleh membuat topik terlihat ramai.
  if (!item.waktu_terbit_asli) return false;
  const terbit = new Date(item.waktu_terbit_asli).getTime();
  if (Number.isNaN(terbit)) return false;
  return sekarang.getTime() - terbit <= SATU_HARI_MS;
}

export function tentukanKeputusanVerifikasi(
  itemUtama: ItemSerupaVerifikasi,
  serupa: ItemSerupaVerifikasi[],
  tierPerSumber: Map<string, number>,
  sekarang: Date = new Date(),
): HasilVerifikasi {
  const kelompokMap = new Map<string, ItemSerupaVerifikasi>();
  for (const item of [itemUtama, ...serupa]) {
    if (!kelompokMap.has(item.id)) kelompokMap.set(item.id, item);
  }
  const kelompok = [...kelompokMap.values()];
  const independen = daftarSumberIndependen(kelompok, tierPerSumber);
  const jumlahTier1 = independen.filter((s) => s.tier === 1).length;
  const item24Jam = kelompok.filter((i) => dalam24Jam(i, sekarang)).length;

  let keputusan: KeputusanVerifikasi;
  let alasan: string;
  if (independen.length >= 2 && jumlahTier1 >= 2) {
    keputusan = "VERIFIED";
    alasan =
      `${independen.length} sumber independen (tier-1: ${jumlahTier1}) ` +
      `memberitakan judul yang sama — terverifikasi.`;
  } else if (independen.length >= 2) {
    keputusan = "CROSS-CHECKED";
    alasan =
      `${independen.length} sumber independen (tier-1: ${jumlahTier1}) ` +
      `memberitakan judul yang sama — cek silang, belum memenuhi ` +
      `syarat VERIFIED (butuh >= 2 sumber independen tier-1).`;
  } else if (item24Jam >= 3) {
    keputusan = "DEVELOPING";
    alasan =
      `Topik ramai (${item24Jam} item dalam 24 jam terakhir) tetapi ` +
      `hanya 1 sumber independen — masih berkembang.`;
  } else {
    keputusan = "UNCONFIRMED";
    alasan =
      `Bukti tidak cukup: ${independen.length} sumber independen, ` +
      `${item24Jam} item dalam 24 jam terakhir — tetap UNCONFIRMED.`;
  }

  return {
    keputusan,
    sumberIndependen: independen.length,
    jumlahItem: kelompok.length,
    jumlahTier1,
    item24Jam,
    alasan,
  };
}

// ============================================================
// Verifikasi berbasis KLAIM (sinyal kedua, melengkapi judul identik)
// ============================================================
// Judul identik antar-penerbit hampir selalu berarti salinan (satu
// sumber independen), sehingga sinyal judul saja praktis tidak
// pernah memverifikasi apa pun dari feed RSS nyata. Sinyal klaim
// membandingkan INTI klaim distintif ('angka': fragmen angka+satuan;
// 'kutipan': teks kutipan) antar item: dua pemberitaan berbeda
// tentang peristiwa yang sama dapat memuat angka/kutipan yang sama
// meski judulnya berbeda. Aturan pengaman:
//   - Koroborator harus berbagi >= 1 token penting judul dengan item
//     utama (topik yang sama) — angka generik seperti "10 persen"
//     dari dua berita tak berhubungan TIDAK dihitung.
//   - Koroborator yang terhubung rantai disalin_dari dengan item
//     utama dihitung SATU sumber dengan aslinya (aturan yang sama).
//   - Klaim 'fakta' (judul) TIDAK dipakai di sini — sudah dicakup
//     sinyal judul di atas.

export interface KlaimKoroborasi {
  // Id klaim kandidat (bila diketahui pemanggil).
  klaimId?: string;
  // Inti klaim kandidat yang dicari (sudah ternormalisasi).
  inti: string;
  jenis: string;
  // Teks klaim kandidat (kalimat/kutipan utuh, untuk verifikasi ulang).
  teksKlaim: string;
  itemId: string;
  sumberId: string | null;
  judul: string;
  url: string;
  ringkasan: string;
  waktuTerbitAsli: string | null;
  disalinDariId: string | null;
}

export interface KoroboratorKlaim {
  sumberId: string | null;
  tier: TierSumber;
  itemId: string;
  judul: string;
  url: string;
  inti: string;
}

export interface HasilVerifikasiKlaim {
  keputusan: KeputusanVerifikasi | null;
  sumberIndependen: number;
  jumlahTier1: number;
  intiCocok: string[];
  koroborator: KoroboratorKlaim[];
  alasan: string;
}

// Stopword ringkas untuk penjaga topik (token judul yang bermakna).
const STOPWORD_TOPIK = new Set([
  "yang", "dan", "dari", "untuk", "dengan", "pada", "dalam",
  "sebagai", "oleh", "akan", "telah", "sudah", "juga", "tidak",
  "adalah", "ini", "itu", "para", "seorang", "sebuah", "hingga",
  "antara", "terhadap", "melalui", "tanpa", "bisa", "dapat",
  "harus", "kini", "hari", "tahun", "bulan", "pukul", "kata",
  "ujar", "sebut", "bilang", "ungkap", "menurut", "masih",
  "kembali", "baru", "salah", "satu", "tersebut", "mereka",
  "persen", "rupiah", "dolar", "juta", "miliar", "triliun",
  "the", "and", "for", "with", "from", "says", "said", "news",
]);

// Token penting judul: lowercase, panjang >= 4, bukan stopword.
export function tokenPentingJudul(judul: string): string[] {
  const kata = judul
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 4 && !STOPWORD_TOPIK.has(k));
  return [...new Set(kata)];
}

function normalisasiTeksSederhana(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const URUTAN_KEPUTUSAN: Record<KeputusanVerifikasi, number> = {
  UNCONFIRMED: 0,
  DEVELOPING: 1,
  "CROSS-CHECKED": 2,
  VERIFIED: 3,
};

// Ambil keputusan yang lebih kuat dari dua keputusan.
export function gabungkanKeputusan(
  a: KeputusanVerifikasi,
  b: KeputusanVerifikasi,
): KeputusanVerifikasi {
  return URUTAN_KEPUTUSAN[a] >= URUTAN_KEPUTUSAN[b] ? a : b;
}

export function tentukanKeputusanDariKlaim(
  itemUtama: ItemSerupaVerifikasi,
  klaimUtama: Array<{ teks: string; jenis: string; inti: string | null }>,
  koroborasi: KlaimKoroborasi[],
  tierPerSumber: Map<string, number>,
  petaItem: Map<string, ItemSerupaVerifikasi>,
): HasilVerifikasiKlaim {
  const kosong: HasilVerifikasiKlaim = {
    keputusan: null,
    sumberIndependen: 0,
    jumlahTier1: 0,
    intiCocok: [],
    koroborator: [],
    alasan: "Tidak ada klaim distintif yang terkoroborasi sumber independen.",
  };
  const intiUtama = klaimUtama.filter(
    (k): k is { teks: string; jenis: string; inti: string } =>
      !!k.inti && (k.jenis === "angka" || k.jenis === "kutipan"),
  );
  if (intiUtama.length === 0) return kosong;

  const tokenUtama = new Set(tokenPentingJudul(itemUtama.judul));
  const akarUtama = cariAkarItem(itemUtama, petaItem);
  const kunciAkarUtama = akarUtama.sumber_id ?? `item:${akarUtama.id}`;

  // Per inti: koroborator valid = klaim kandidat memuat inti yang
  // sama + berbagi token topik + bukan dari sumber utama.
  const koroboratorPerInti = new Map<string, KoroboratorKlaim[]>();
  for (const klaim of intiUtama) {
    const daftar: KoroboratorKlaim[] = [];
    for (const k of koroborasi) {
      if (k.inti !== klaim.inti) continue;
      if (k.itemId === itemUtama.id) continue;
      // Kandidat harus benar-benar memuat inti di teks klaimnya
      // (pencarian ILIKE di adapter bersifat longgar — verifikasi
      // ulang di sini, bukan percaya begitu saja).
      if (!normalisasiTeksSederhana(k.teksKlaim).includes(k.inti)) {
        continue;
      }
      // Penjaga topik: judul kandidat harus berbagi token penting.
      const tokenKandidat = tokenPentingJudul(k.judul);
      if (!tokenKandidat.some((t) => tokenUtama.has(t))) continue;
      // Akar rantai salinan kandidat (butuh entri di petaItem).
      const itemKandidat: ItemSerupaVerifikasi = {
        id: k.itemId,
        sumber_id: k.sumberId,
        url: k.url,
        judul: k.judul,
        ringkasan: k.ringkasan,
        waktu_terbit_asli: k.waktuTerbitAsli,
        disalin_dari_id: k.disalinDariId,
      };
      const petaLengkap = new Map(petaItem);
      if (!petaLengkap.has(itemKandidat.id)) {
        petaLengkap.set(itemKandidat.id, itemKandidat);
      }
      const akar = cariAkarItem(itemKandidat, petaLengkap);
      const kunciAkar = akar.sumber_id ?? `item:${akar.id}`;
      if (kunciAkar === kunciAkarUtama) continue;
      const tierMentah = akar.sumber_id
        ? tierPerSumber.get(akar.sumber_id)
        : undefined;
      const tier: TierSumber =
        tierMentah === 1 || tierMentah === 2 || tierMentah === 3
          ? tierMentah
          : 3;
      daftar.push({
        sumberId: akar.sumber_id,
        tier,
        itemId: k.itemId,
        judul: k.judul,
        url: k.url,
        inti: klaim.inti,
      });
    }
    if (daftar.length > 0) koroboratorPerInti.set(klaim.inti, daftar);
  }

  // Koroborator per (inti, sumber independen) — untuk evidence per
  // klaim. Satu sumber yang mengoroborasi 2 inti muncul 2x di sini
  // (satu per inti); hitungan sumber independen di bawah tetap unik
  // per sumber (untuk keputusan).
  const perKunciInti = new Map<string, KoroboratorKlaim>();
  for (const [inti, daftar] of koroboratorPerInti) {
    for (const kor of daftar) {
      const kunci = `${inti}|${kor.sumberId ?? `item:${kor.itemId}`}`;
      if (!perKunciInti.has(kunci)) perKunciInti.set(kunci, kor);
    }
  }
  const semuaKoroborator = [...perKunciInti.values()];
  // Sumber independen TOTAL = sumber item utama (akar rantainya) +
  // koroborator independen. Aturan dua-sumber jurnalistik: klaim yang
  // muncul di 2 outlet independen (utama + 1 koroborator) sudah
  // terkoroborasi; VERIFIED butuh total >= 2 dengan >= 2 tier-1.
  // (Koroborator saja tidak pernah dihitung tanpa sumber utama.)
  const tierAkarUtamaRaw = akarUtama.sumber_id
    ? tierPerSumber.get(akarUtama.sumber_id)
    : undefined;
  const tierAkarUtama: TierSumber =
    tierAkarUtamaRaw === 1 || tierAkarUtamaRaw === 2 || tierAkarUtamaRaw === 3
      ? tierAkarUtamaRaw
      : 3;
  const perKunciSumber = new Map<string, KoroboratorKlaim>();
  for (const kor of semuaKoroborator) {
    const kunci = kor.sumberId ?? `item:${kor.itemId}`;
    if (!perKunciSumber.has(kunci)) perKunciSumber.set(kunci, kor);
  }
  const independenKorob = [...perKunciSumber.values()];
  const totalIndependen = 1 + independenKorob.length;
  const totalTier1 =
    (tierAkarUtama === 1 ? 1 : 0) +
    independenKorob.filter((s) => s.tier === 1).length;

  if (totalIndependen < 2) {
    return {
      ...kosong,
      sumberIndependen: totalIndependen,
      jumlahTier1: totalTier1,
      intiCocok: [...koroboratorPerInti.keys()],
      koroborator: semuaKoroborator,
      alasan:
        `Koroborasi klaim tidak cukup: ${totalIndependen} sumber ` +
        `independen berbagi inti klaim (butuh >= 2, termasuk sumber utama).`,
    };
  }

  const keputusan: KeputusanVerifikasi =
    totalTier1 >= 2 ? "VERIFIED" : "CROSS-CHECKED";
  const alasan =
    keputusan === "VERIFIED"
      ? `${totalIndependen} sumber independen (tier-1: ${totalTier1}) ` +
        `memuat inti klaim yang sama (${[...koroboratorPerInti.keys()].join("; ")}) — terverifikasi.`
      : `${totalIndependen} sumber independen (tier-1: ${totalTier1}) ` +
        `memuat inti klaim yang sama (${[...koroboratorPerInti.keys()].join("; ")}) — cek silang.`;
  return {
    keputusan,
    sumberIndependen: totalIndependen,
    jumlahTier1: totalTier1,
    intiCocok: [...koroboratorPerInti.keys()],
    koroborator: semuaKoroborator,
    alasan,
  };
}
