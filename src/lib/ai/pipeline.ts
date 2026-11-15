// Orkestrator pipeline editorial AI PRATA FAKTA.
// Alur DUA FASE per batch (berurutan, sesuai urutan adapter):
//   Fase 1 (riset): semua item -> research -> source-analysis ->
//     simpan klaim. Klaim SEMUA item harus tersimpan dulu agar fase 2
//     bisa membandingkan klaim antar item.
//   Fase 2 (verifikasi): per item -> verification (sinyal judul
//     identik + sinyal koroborasi klaim) -> simpan evidence +
//     verification record -> perbarui status item ->
//     (bila VERIFIED/CROSS-CHECKED: summarization -> translation-check
//     -> writing -> quality) -> draf artikel.
// SETIAP langkah agen dibungkus try/catch dan menulis pf_ai_runs
// (berhasil/gagal/dilewati + durasi_ms + error/alasan). Satu langkah
// gagal tidak menggagalkan item lain; satu item gagal tidak
// menggagalkan antrean.
// Catatan jujur: langkah-langkah di sini deterministik (aturan tetap +
// ekstraksi pola). Tidak ada LLM di dalam kode ini — draf yang
// dihasilkan adalah draf awal yang disempurnakan Muse lewat cron/chat
// dan disetujui editor sebelum terbit.
import { hashJudul } from "../ingestion/dedup.ts";
import type {
  AgenAi,
  AiAdapter,
  DipicuOleh,
  InputJenisAi,
  RawItemAntrean,
} from "./types.ts";
import { intiKlaim, telitiItem } from "./research.ts";
import type { KlaimTerekstrak } from "./research.ts";
import {
  analisisSumber,
  tierDariPrioritas,
} from "./source-analysis.ts";
import {
  daftarSumberIndependen,
  gabungkanKeputusan,
  tentukanKeputusanDariKlaim,
  tentukanKeputusanVerifikasi,
} from "./verification.ts";
import type {
  ItemSerupaVerifikasi,
  KlaimKoroborasi,
} from "./verification.ts";
import { buatRingkasan } from "./summarization.ts";
import { periksaTerjemahan } from "./translation.ts";
import { susunDrafArtikel } from "./writing.ts";
import type { SumberDraf } from "./writing.ts";
import { periksaKualitasDraf } from "./quality.ts";
import { hitungTren } from "./trends.ts";
import type { TopikTren } from "./trends.ts";
import { entriBriefDariDraf, susunBrief } from "./brief.ts";
import type { EntriBrief } from "./brief.ts";

export interface OpsiPipeline {
  limit?: number;
  hanyaItemId?: string;
  dipicu_oleh?: DipicuOleh;
  fetchFn?: typeof fetch;
}

export interface HasilPipeline {
  diproses: number;
  draf: number;
  terverifikasi: number;
  cross_checked: number;
  developing: number;
  unconfirmed: number;
  dilewati: number;
  gagal: number;
}

export interface OpsiBrief {
  tanggal?: string;
  dipicu_oleh?: DipicuOleh;
  // Entri artikel/draf VERIFIED/CROSS-CHECKED dari pemanggil (mis.
  // API route yang membaca pf_articles). Bila kurang dari 5, dilengkapi
  // entri UNCONFIRMED dari antrean — ditandai jujur statusnya.
  entri?: EntriBrief[];
}

export interface HasilBrief {
  tanggal: string;
  briefId: string;
  jumlahEntri: number;
  jumlahIsu: number;
}

// ---------- Util ----------

// Tanggal hari ini dalam WIB (Asia/Jakarta), format YYYY-MM-DD.
export function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface HasilLangkah<T> {
  nilai: T;
  detail?: Record<string, unknown>;
  outputRef?: string;
  // Bila true, run ditutup 'dilewati' (bukan 'berhasil').
  dilewati?: boolean;
  alasanDilewati?: string;
}

// Jalankan satu langkah agen dengan pencatatan pf_ai_runs:
// catat 'berjalan' -> jalankan fn -> tutup 'berhasil'/'dilewati';
// bila fn melempar -> tutup 'gagal' lalu lempar ulang.
async function jalankanLangkah<T>(
  adapter: AiAdapter,
  agen: AgenAi,
  inputRef: string,
  inputJenis: InputJenisAi,
  dipicuOleh: DipicuOleh,
  fn: () => Promise<HasilLangkah<T>>,
): Promise<T> {
  const runId = await adapter.catatRun({
    agen,
    input_ref: inputRef,
    input_jenis: inputJenis,
    dipicu_oleh: dipicuOleh,
  });
  const mulai = Date.now();
  try {
    const hasil = await fn();
    await adapter.tutupRun(runId, {
      status: hasil.dilewati ? "dilewati" : "berhasil",
      error: hasil.dilewati ? hasil.alasanDilewati : undefined,
      durasi_ms: Date.now() - mulai,
      output_ref: hasil.outputRef,
      detail: hasil.detail,
    });
    return hasil.nilai;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Kegagalan pencatatan run tidak boleh menelan error asli.
    }
    throw err;
  }
}

// Catat satu run 'dilewati' tanpa menjalankan langkah (mis. draf
// dilewati karena keputusan belum terverifikasi).
async function catatDilewati(
  adapter: AiAdapter,
  agen: AgenAi,
  inputRef: string,
  inputJenis: InputJenisAi,
  dipicuOleh: DipicuOleh,
  alasan: string,
): Promise<void> {
  try {
    const runId = await adapter.catatRun({
      agen,
      input_ref: inputRef,
      input_jenis: inputJenis,
      dipicu_oleh: dipicuOleh,
    });
    await adapter.tutupRun(runId, {
      status: "dilewati",
      error: alasan,
      durasi_ms: 0,
    });
  } catch {
    // Pencatatan dilewati bersifat informatif; kegagalannya tidak
    // boleh menggagalkan pemrosesan item.
  }
}

// ---------- Konteks item antar-fase ----------

interface KonteksItem {
  item: RawItemAntrean;
  klaimTersimpan: KlaimTerekstrak[];
  idKlaim: string[];
  tierUtama: number;
}

// ---------- Fase 1: riset satu item ----------
// Research + simpan klaim + source-analysis. Mengembalikan null bila
// research gagal total (item tetap UNCONFIRMED di antrean, dicoba lagi
// pada run berikutnya). TIDAK ada keputusan verifikasi di sini.

async function risetSatuItem(
  adapter: AiAdapter,
  item: RawItemAntrean,
  opsi: OpsiPipeline,
  hasil: HasilPipeline,
): Promise<KonteksItem | null> {
  const dipicu = opsi.dipicu_oleh ?? "manual";

  // 1. Research — ekstrak klaim (best-effort fetch halaman).
  let riset: Awaited<ReturnType<typeof telitiItem>>;
  try {
    riset = await jalankanLangkah(adapter, "research", item.id, "raw_item", dipicu, async () => {
      const r = await telitiItem(
        {
          url: item.url,
          judul: item.judul,
          ringkasan: item.ringkasan,
          isi_ringkas: item.isi_ringkas,
        },
        { fetchFn: opsi.fetchFn },
      );
      return {
        nilai: r,
        detail: {
          jumlah_klaim: r.klaim.length,
          fetch_berhasil: r.fetchBerhasil,
          fallback: r.fallback,
        },
      };
    });
  } catch {
    // Research gagal total: item tetap UNCONFIRMED di antrean dan
    // dicoba lagi pada run berikutnya.
    hasil.gagal += 1;
    return null;
  }

  // Simpan klaim yang terekstrak (satu klaim gagal tidak menggagalkan item).
  // Klaim yang teksnya sudah tersimpan untuk item ini dipakai ulang
  // id-nya — run ulang atas item yang tetap UNCONFIRMED tidak boleh
  // menduplikasi klaim (idKlaim harus sejajar dengan klaimTersimpan).
  const idKlaim: string[] = [];
  const klaimTersimpan: KlaimTerekstrak[] = [];
  for (const k of riset.klaim) {
    try {
      const idSudahAda = await adapter.cariKlaimSama(item.id, k.teks);
      if (idSudahAda) {
        idKlaim.push(idSudahAda);
        klaimTersimpan.push(k);
        continue;
      }
      const id = await adapter.simpanKlaim({
        raw_item_id: item.id,
        teks: k.teks,
        jenis: k.jenis,
      });
      idKlaim.push(id);
      klaimTersimpan.push(k);
    } catch {
      continue;
    }
  }

  // 2. Source analysis — tier + skor dari prioritas sumber.
  // Gagal membaca sumber -> fallback tier 3 (skor 60), lanjut.
  let tierUtama = 3;
  try {
    const sumber = await jalankanLangkah(
      adapter,
      "source_analysis",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const s = item.sumber_id
          ? await adapter.ambilSumber(item.sumber_id)
          : null;
        const analisis = analisisSumber({
          nama: s?.nama ?? item.sumber_nama,
          prioritas: s?.prioritas ?? item.sumber_prioritas,
        });
        return {
          nilai: analisis,
          detail: {
            tier: analisis.tier,
            skor: analisis.skor,
            sumber: s?.nama ?? item.sumber_nama,
          },
        };
      },
    );
    tierUtama = sumber.tier;
  } catch {
    tierUtama = 3;
  }

  return { item, klaimTersimpan, idKlaim, tierUtama };
}
// ---------- Fase 2: verifikasi + draf satu item ----------
// Dijalankan SETELAH fase 1 selesai untuk semua item, agar
// koroborasi klaim bisa melihat klaim item lain dalam batch yang sama.

async function verifikasiSatuItem(
  adapter: AiAdapter,
  ctx: KonteksItem,
  opsi: OpsiPipeline,
  hasil: HasilPipeline,
): Promise<void> {
  const { item, klaimTersimpan, idKlaim, tierUtama } = ctx;
  const dipicu = opsi.dipicu_oleh ?? "manual";

  // 3. Verification — dua sinyal (judul identik + koroborasi klaim).
  const itemUtama: ItemSerupaVerifikasi = {
    id: item.id,
    sumber_id: item.sumber_id,
    url: item.url,
    judul: item.judul,
    ringkasan: item.ringkasan,
    waktu_terbit_asli: item.waktu_terbit_asli,
    disalin_dari_id: item.disalin_dari_id,
  };
  // 3a. Kelompok judul identik.
  let serupa: Awaited<ReturnType<AiAdapter["ambilItemSerupa"]>> = [];
  try {
    serupa = await adapter.ambilItemSerupa(hashJudul(item.judul), item.id);
  } catch {
    serupa = [];
  }
  // Peta tier per sumber_id + peta item untuk penelusuran rantai
  // disalin_dari (dipakai kedua sinyal verifikasi).
  const tierPerSumber = new Map<string, number>();
  const petaItem = new Map<string, ItemSerupaVerifikasi>();
  petaItem.set(itemUtama.id, itemUtama);
  for (const s of serupa) {
    petaItem.set(s.id, {
      id: s.id,
      sumber_id: s.sumber_id,
      url: s.url,
      judul: s.judul,
      ringkasan: s.ringkasan,
      waktu_terbit_asli: s.waktu_terbit_asli,
      disalin_dari_id: s.disalin_dari_id,
    });
  }
  const sumberIds = new Set<string>();
  if (item.sumber_id) sumberIds.add(item.sumber_id);
  for (const s of serupa) if (s.sumber_id) sumberIds.add(s.sumber_id);
  for (const sid of sumberIds) {
    try {
      const s = await adapter.ambilSumber(sid);
      if (s) tierPerSumber.set(sid, tierDariPrioritas(s.prioritas));
    } catch {
      // Sumber tak terbaca -> tier default 3 di verification.ts.
    }
  }
  if (item.sumber_id && !tierPerSumber.has(item.sumber_id)) {
    // Sumber utama tak terbaca lewat ambilSumber: pakai tier dari
    // langkah source-analysis (dihitung dari prioritas antrean).
    tierPerSumber.set(item.sumber_id, tierUtama);
  }

  const verifikasiJudul = await jalankanLangkah(
    adapter,
    "fact_verification",
    item.id,
    "raw_item",
    dipicu,
    async () => {
      const v = tentukanKeputusanVerifikasi(itemUtama, serupa, tierPerSumber);
      return {
        nilai: v,
        detail: {
          keputusan: v.keputusan,
          sumber_independen: v.sumberIndependen,
          jumlah_item: v.jumlahItem,
          tier1: v.jumlahTier1,
          item_24j: v.item24Jam,
        },
      };
    },
  );

  // 3b. Koroborasi klaim — cari klaim lain yang memuat inti klaim
  // distintif item ini (angka/kutipan), dari item lain mana pun.
  const klaimDenganInti = klaimTersimpan.map((k) => ({
    teks: k.teks,
    jenis: k.jenis,
    inti: intiKlaim(k),
  }));
  const koroborasi: KlaimKoroborasi[] = [];
  for (const k of klaimDenganInti) {
    if (!k.inti) continue;
    let cocok: Awaited<ReturnType<AiAdapter["cariKlaimSerupa"]>> = [];
    try {
      cocok = await adapter.cariKlaimSerupa(k.inti, item.id, 20);
    } catch {
      continue;
    }
    for (const c of cocok) {
      koroborasi.push({
        klaimId: c.id,
        inti: k.inti,
        jenis: c.jenis,
        teksKlaim: c.teks,
        itemId: c.raw_item_id,
        sumberId: c.sumber_id,
        judul: c.judul_item,
        url: c.url_item,
        ringkasan: c.ringkasan_item,
        waktuTerbitAsli: c.waktu_terbit_asli,
        disalinDariId: c.disalin_dari_id,
      });
      if (!petaItem.has(c.raw_item_id)) {
        petaItem.set(c.raw_item_id, {
          id: c.raw_item_id,
          sumber_id: c.sumber_id,
          url: c.url_item,
          judul: c.judul_item,
          ringkasan: c.ringkasan_item,
          waktu_terbit_asli: c.waktu_terbit_asli,
          disalin_dari_id: c.disalin_dari_id,
        });
      }
      if (c.sumber_id && !tierPerSumber.has(c.sumber_id)) {
        try {
          const s = await adapter.ambilSumber(c.sumber_id);
          if (s) tierPerSumber.set(c.sumber_id, tierDariPrioritas(s.prioritas));
        } catch {
          // Sumber tak terbaca -> tier default 3.
        }
      }
    }
  }
  const verifikasiKlaim = tentukanKeputusanDariKlaim(
    itemUtama,
    klaimDenganInti,
    koroborasi,
    tierPerSumber,
    petaItem,
  );

  // Gabung kedua sinyal (yang lebih kuat menang). Tanpa klaim
  // tersimpan, keputusan tidak punya dasar: paksa UNCONFIRMED.
  const keputusanAkhir =
    klaimTersimpan.length === 0
      ? "UNCONFIRMED"
      : verifikasiKlaim.keputusan
        ? gabungkanKeputusan(
            verifikasiJudul.keputusan,
            verifikasiKlaim.keputusan,
          )
        : verifikasiJudul.keputusan;
  const alasanAkhir =
    klaimTersimpan.length === 0
      ? "Tidak ada klaim yang dapat diekstrak dari item ini — tetap UNCONFIRMED."
      : verifikasiKlaim.keputusan
        ? `Sinyal judul: ${verifikasiJudul.alasan} Sinyal klaim: ${verifikasiKlaim.alasan}`
        : verifikasiJudul.alasan;

  // Evidence — per klaim, hanya dari sumber yang benar-benar memuat
  // klaim itu:
  //   - klaim 'fakta' (judul): sumber independen kelompok judul.
  //   - klaim 'angka'/'kutipan': koroborator inti klaim itu.
  //   - klaim lain: hanya sumber item sendiri.
  // Semua klaim juga mendapat evidence dari sumber item sendiri.
  const independenJudul = daftarSumberIndependen(
    [itemUtama, ...serupa],
    tierPerSumber,
  );
  const namaSumber = new Map<string | null, string>();
  namaSumber.set(item.sumber_id, item.sumber_nama);
  async function namaUntuk(sumberId: string | null): Promise<string> {
    if (namaSumber.has(sumberId)) {
      return namaSumber.get(sumberId) as string;
    }
    let nama = "Sumber tidak diketahui";
    if (sumberId) {
      try {
        const info = await adapter.ambilSumber(sumberId);
        if (info) nama = info.nama;
      } catch {
        // Pakai fallback di atas.
      }
    }
    namaSumber.set(sumberId, nama);
    return nama;
  }
  // Koroborator per inti (sudah didedup per sumber di verification.ts).
  const koroboratorPerInti = new Map<
    string,
    Array<{ nama: string; url: string; kutipan: string }>
  >();
  for (const kor of verifikasiKlaim.koroborator) {
    const daftar = koroboratorPerInti.get(kor.inti) ?? [];
    const entri = koroborasi.find(
      (k) => k.itemId === kor.itemId && k.inti === kor.inti,
    );
    daftar.push({
      nama: await namaUntuk(kor.sumberId),
      url: kor.url,
      kutipan: entri?.ringkasan ? entri.ringkasan.slice(0, 300) : "",
    });
    koroboratorPerInti.set(kor.inti, daftar);
  }

  let jumlahEvidence = 0;
  async function tulisBukti(
    klaimId: string,
    sumberUrl: string,
    sumberNama: string,
    kutipan?: string,
  ): Promise<void> {
    try {
      await adapter.simpanBukti({
        klaim_id: klaimId,
        sumber_url: sumberUrl,
        sumber_nama: sumberNama,
        kutipan,
        arah: "mendukung",
      });
      jumlahEvidence += 1;
    } catch {
      // Satu evidence gagal: lanjut ke sumber berikut.
    }
  }
  for (let i = 0; i < klaimTersimpan.length; i++) {
    const klaim = klaimTersimpan[i];
    const klaimId = idKlaim[i];
    if (!klaimId) continue;
    const sudahTulis = new Set<string>();
    // (a) Sumber item sendiri — selalu.
    await tulisBukti(
      klaimId,
      item.url,
      item.sumber_nama,
      item.ringkasan ? item.ringkasan.slice(0, 300) : undefined,
    );
    sudahTulis.add(item.url);
    // (b) Klaim 'fakta': sumber independen kelompok judul.
    if (klaim.jenis === "fakta") {
      for (const s of independenJudul) {
        if (sudahTulis.has(s.itemAkar.url)) continue;
        sudahTulis.add(s.itemAkar.url);
        await tulisBukti(
          klaimId,
          s.itemAkar.url,
          await namaUntuk(s.sumberId),
          s.itemAkar.ringkasan
            ? s.itemAkar.ringkasan.slice(0, 300)
            : undefined,
        );
      }
    }
    // (c) Klaim 'angka'/'kutipan': koroborator inti klaim itu.
    const inti = intiKlaim(klaim);
    if ((klaim.jenis === "angka" || klaim.jenis === "kutipan") && inti) {
      for (const kor of koroboratorPerInti.get(inti) ?? []) {
        if (sudahTulis.has(kor.url)) continue;
        sudahTulis.add(kor.url);
        await tulisBukti(klaimId, kor.url, kor.nama, kor.kutipan || undefined);
      }
    }
  }

  // Simpan verification record + perbarui status item.
  try {
    await adapter.simpanVerification({
      raw_item_id: item.id,
      keputusan: keputusanAkhir,
      catatan:
        `${alasanAkhir} Keputusan dihitung dari judul identik ` +
        `(hash_judul), koroborasi inti klaim (angka/kutipan), dan ` +
        `rantai disalin_dari; bukan penilaian isi oleh manusia.`,
      bukti: {
        sumber_independen: Math.max(
          verifikasiJudul.sumberIndependen,
          verifikasiKlaim.sumberIndependen,
        ),
        jumlah_item: verifikasiJudul.jumlahItem,
        tier1: Math.max(
          verifikasiJudul.jumlahTier1,
          verifikasiKlaim.jumlahTier1,
        ),
        jumlah_klaim: idKlaim.length,
        jumlah_evidence: jumlahEvidence,
        koroborasi_klaim: {
          inti_cocok: verifikasiKlaim.intiCocok,
          sumber_independen: verifikasiKlaim.sumberIndependen,
        },
      },
    });
  } catch {
    // Verification record gagal disimpan: status item tetap diperbarui
    // agar antrean tidak macet; kegagalan tercatat di bawah lewat hasil.
  }
  try {
    await adapter.perbaruiStatusItem(item.id, keputusanAkhir);
  } catch {
    hasil.gagal += 1;
    return;
  }

  if (keputusanAkhir === "VERIFIED") hasil.terverifikasi += 1;
  else if (keputusanAkhir === "CROSS-CHECKED") hasil.cross_checked += 1;
  else if (keputusanAkhir === "DEVELOPING") hasil.developing += 1;
  else hasil.unconfirmed += 1;

  // Item UNCONFIRMED/DEVELOPING TIDAK dibuatkan draf (log dilewati).
  if (keputusanAkhir !== "VERIFIED" && keputusanAkhir !== "CROSS-CHECKED") {
    await catatDilewati(
      adapter,
      "article_writing",
      item.id,
      "raw_item",
      dipicu,
      `Draf dilewati: keputusan ${keputusanAkhir} — ${alasanAkhir}`,
    );
    hasil.dilewati += 1;
    return;
  }

  // 4. Summarization — ringkasan ekstraktif dari ringkasan sumber.
  let ringkasan: string;
  try {
    const r = await jalankanLangkah(
      adapter,
      "summarization",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const hasilRingkasan = buatRingkasan(item);
        return {
          nilai: hasilRingkasan,
          detail: {
            jumlah_karakter: hasilRingkasan.jumlahKarakter,
            perkiraan_detik_baca: hasilRingkasan.perkiraanDetikBaca,
          },
        };
      },
    );
    ringkasan = r.ringkasan;
  } catch {
    hasil.gagal += 1;
    return;
  }

  // 5. Translation-check — heuristik bahasa; TIDAK ADA terjemahan mesin.
  // Selalu 'dilewati': Indonesia -> 'tidak diperlukan', Inggris/tak
  // dikenal -> 'menunggu terjemahan Muse (cron/chat)'.
  await jalankanLangkah(
    adapter,
    "translation",
    item.id,
    "raw_item",
    dipicu,
    async () => {
      const t = periksaTerjemahan(item, { nama: item.sumber_nama });
      return {
        nilai: t,
        dilewati: true,
        alasanDilewati: t.alasan,
        detail: { bahasa: t.bahasa, alasan: t.alasan },
      };
    },
  );

  // 6. Writing — draf artikel dari klaim terverifikasi saja.
  // Sumber draf = gabungan sumber independen kedua sinyal (judul +
  // koroborasi klaim), didedup per URL.
  const sumberDrafMap = new Map<string, SumberDraf>();
  for (const s of independenJudul) {
    const nama = namaSumber.get(s.sumberId) ?? "Sumber tidak diketahui";
    if (!sumberDrafMap.has(s.itemAkar.url)) {
      sumberDrafMap.set(s.itemAkar.url, { nama, url: s.itemAkar.url });
    }
  }
  for (const kor of verifikasiKlaim.koroborator) {
    if (!sumberDrafMap.has(kor.url)) {
      sumberDrafMap.set(kor.url, {
        nama: namaSumber.get(kor.sumberId) ?? "Sumber tidak diketahui",
        url: kor.url,
      });
    }
  }
  const sumberDraf: SumberDraf[] = [...sumberDrafMap.values()];
  let artikelId: string;
  try {
    artikelId = await jalankanLangkah(
      adapter,
      "article_writing",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const draf = susunDrafArtikel({
          item,
          klaim: klaimTersimpan,
          ringkasan,
          keputusan: keputusanAkhir,
          sumber: sumberDraf,
        });
        const id = await adapter.simpanArtikel(draf);
        return {
          nilai: id,
          outputRef: id,
          detail: {
            slug: draf.slug,
            kategori_slug: draf.kategori_slug,
            jumlah_klaim: klaimTersimpan.length,
          },
        };
      },
    );
    hasil.draf += 1;
  } catch {
    hasil.gagal += 1;
    return;
  }

  // 7. Editorial quality — cek deterministik draf. Draf tetap tersimpan
  // bila gagal, tapi TIDAK ditandai siap-review (dicatat di detail run).
  try {
    await jalankanLangkah(
      adapter,
      "editorial_quality",
      artikelId,
      "artikel",
      dipicu,
      async () => {
        const draf = susunDrafArtikel({
          item,
          klaim: klaimTersimpan,
          ringkasan,
          keputusan: keputusanAkhir,
          sumber: sumberDraf,
        });
        const kualitas = periksaKualitasDraf({
          judul: draf.judul,
          ringkasan: draf.ringkasan,
          isi: draf.isi,
          kategori_slug: draf.kategori_slug,
          sumber_url: draf.sumber_url,
          jumlahKlaimTerverifikasi: klaimTersimpan.length,
          jumlahEvidence,
        });
        return {
          nilai: kualitas,
          detail: {
            lolos: kualitas.lolos,
            kegagalan: kualitas.kegagalan,
            siap_review: kualitas.lolos,
          },
        };
      },
    );
  } catch {
    // Kegagalan cek kualitas tidak membatalkan draf yang tersimpan.
  }
}

// ---------- Titik masuk utama ----------

export async function jalankanPipelineEditorial(
  adapter: AiAdapter,
  opsi: OpsiPipeline = {},
): Promise<HasilPipeline> {
  const hasil: HasilPipeline = {
    diproses: 0,
    draf: 0,
    terverifikasi: 0,
    cross_checked: 0,
    developing: 0,
    unconfirmed: 0,
    dilewati: 0,
    gagal: 0,
  };

  const antrean = await adapter.ambilAntrean(
    opsi.hanyaItemId ? 500 : (opsi.limit ?? 10),
  );
  let daftar = antrean;
  if (opsi.hanyaItemId) {
    const satu = antrean.find((i) => i.id === opsi.hanyaItemId);
    if (!satu) {
      // Item tidak ada di antrean (sudah diproses / id salah): dilewati.
      hasil.dilewati += 1;
      return hasil;
    }
    daftar = [satu];
  }

  // Fase 1: riset SEMUA item dulu — klaim harus tersimpan sebelum
  // verifikasi silang antar-klaim bisa berjalan.
  const konteks: KonteksItem[] = [];
  for (const item of daftar) {
    hasil.diproses += 1;
    try {
      const ctx = await risetSatuItem(adapter, item, opsi, hasil);
      if (ctx) konteks.push(ctx);
    } catch {
      // Satu item gagal total (di luar langkah yang sudah dicatat):
      // hitung gagal, lanjut ke item berikutnya.
      hasil.gagal += 1;
    }
  }

  // Fase 2: verifikasi + draf per item (memakai klaim fase 1).
  for (const ctx of konteks) {
    try {
      await verifikasiSatuItem(adapter, ctx, opsi, hasil);
    } catch {
      hasil.gagal += 1;
    }
  }
  return hasil;
}

// ---------- Daily Brief ----------

export async function jalankanBriefHarian(
  adapter: AiAdapter,
  opsi: OpsiBrief = {},
): Promise<HasilBrief> {
  const dipicu = opsi.dipicu_oleh ?? "manual";
  const tanggal = opsi.tanggal ?? tanggalWibHariIni();
  const runId = await adapter.catatRun({
    agen: "daily_brief",
    input_ref: tanggal,
    input_jenis: "brief",
    dipicu_oleh: dipicu,
  });
  const mulai = Date.now();
  try {
    const entri: EntriBrief[] = [...(opsi.entri ?? [])];
    // Bila pemanggil tidak menyediakan entri, ambil dari draf artikel
    // terbaru (maks 10) — draf adalah satu-satunya entri "terverifikasi"
    // yang boleh masuk brief; artikel TIDAK PERNAH auto-terbit.
    if (opsi.entri === undefined) {
      const draf = await adapter.ambilDrafArtikel(10);
      for (const d of draf) entri.push(entriBriefDariDraf(d));
    }
    // Lengkapi dari antrean bila entri kurang dari 10 — entri ini
    // JUJUR berstatus UNCONFIRMED (tidak dinaikkan). Brief selalu
    // diisi sampai 10 entri bila antrean tersedia, campuran entri
    // terverifikasi dan UNCONFIRMED yang masing-masing berlabel
    // statusnya sendiri.
    if (entri.length < 10) {
      const antrean = await adapter.ambilAntrean(20);
      const tautanAda = new Set(entri.map((e) => e.tautan));
      for (const item of antrean) {
        if (entri.length >= 10) break;
        if (tautanAda.has(item.url)) continue;
        const nama = item.sumber_nama.toLowerCase();
        entri.push({
          judul: item.judul,
          ringkasan: item.ringkasan || item.isi_ringkas || item.judul,
          waktu: item.waktu_terbit_asli,
          lokasi:
            typeof item.metadata?.lokasi === "string"
              ? (item.metadata.lokasi as string)
              : null,
          kategori:
            nama.includes("gdelt") || nama.includes("bbc")
              ? "dunia"
              : "indonesia",
          sumber: item.sumber_nama,
          status_verifikasi: "UNCONFIRMED",
          tautan: item.url,
        });
      }
    }

    const isu = await analisisTren(adapter, { jam: 168 });
    const isi = susunBrief({
      tanggal,
      entri,
      isuBerkembang: isu.filter((t) => t.berkembang),
    });
    const briefId = await adapter.simpanBrief(tanggal, isi);
    await adapter.tutupRun(runId, {
      status: "berhasil",
      durasi_ms: Date.now() - mulai,
      output_ref: briefId,
      detail: {
        jumlah_entri: entri.length,
        jumlah_isu: isi.isu_berkembang.length,
      },
    });
    return {
      tanggal,
      briefId,
      jumlahEntri: entri.length,
      jumlahIsu: isi.isu_berkembang.length,
    };
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Abaikan kegagalan pencatatan.
    }
    throw err;
  }
}

// ---------- Analisis tren ----------

export async function analisisTren(
  adapter: AiAdapter,
  opsi: { jam?: number } = {},
): Promise<TopikTren[]> {
  const jam = opsi.jam ?? 168;
  const runId = await adapter.catatRun({
    agen: "trend_analysis",
    input_ref: `tren-${jam}j`,
    input_jenis: "lain",
    dipicu_oleh: "manual",
  });
  const mulai = Date.now();
  try {
    const antrean = await adapter.ambilAntrean(200);
    const batas = Date.now() - jam * 60 * 60 * 1000;
    const items = antrean
      .filter(
        (i) =>
          !i.waktu_terbit_asli ||
          new Date(i.waktu_terbit_asli).getTime() >= batas,
      )
      .map((i) => ({
        id: i.id,
        judul: i.judul,
        sumber_id: i.sumber_id,
        waktu_terbit_asli: i.waktu_terbit_asli,
        disalin_dari_id: i.disalin_dari_id,
      }));
    const hasil = hitungTren(items);
    await adapter.tutupRun(runId, {
      status: "berhasil",
      durasi_ms: Date.now() - mulai,
      detail: {
        jumlah_item: items.length,
        jumlah_topik: hasil.length,
        berkembang: hasil.filter((t) => t.berkembang).length,
      },
    });
    return hasil;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Abaikan kegagalan pencatatan.
    }
    throw err;
  }
}
