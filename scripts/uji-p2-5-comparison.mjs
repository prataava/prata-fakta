// Uji P2-5 (Muse AI Research Workflow) — langkah pipeline
// `comparison` + provenance pembaca.
// PGlite in-memory (bagian §C) + adapter memori (§B) — aman,
// tidak menyentuh DB produksi. Keluar 0 bila semua asersi lolos,
// 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-p2-5-comparison.mjs
// Loader /tmp/pf-register.mjs memetakan alias "@/" ke src/ dan
// men-stub next/headers — diperlukan untuk impor pipeline.ts.
// Tanpa loader, impor alias "@/..." gagal jujur.
//
// YANG DIUJI:
//   §A  bandingkanAntarItem (pure): pasangan judul identik +
//       klaim terkoroborasi, memakai ulang verification.ts.
//   §B  jalankanPipelineEditorial di atas adapter memori:
//       baris comparison tercatat di pf_ai_runs (detail.langkah
//       = 'comparison'); keputusan verification SAMA seperti
//       hitungan langsung verification.ts; satu item gagal /
//       tidak ada pasangan TIDAK menggagalkan antrean.
//   §C  CHECK pf_ai_runs.agen (migrasi v1–v8 di PGlite):
//       agen harfiah 'comparison' DITOLAK database; pencatatan
//       CHECK-aman (agen 'fact_verification' + detail.langkah)
//       DITERIMA — bukti blokir + bukti implementasi aman.
//   §D  Penjaga statis: urutan Fase 1 → comparison → Fase 2;
//       tidak ada agen 'comparison' di kode; tidak ada migrasi
//       v20; ProvenanceAI menyembunyikan seksi bila tak ada data.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");

import {
  bandingkanAntarItem,
  jalankanPipelineEditorial,
} from "../src/lib/ai/pipeline.ts";
import {
  gabungkanKeputusan,
  tentukanKeputusanDariKlaim,
  tentukanKeputusanVerifikasi,
} from "../src/lib/ai/verification.ts";
import { intiKlaim } from "../src/lib/ai/research.ts";
import { hashJudul } from "../src/lib/ingestion/dedup.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function bacaFile(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}

// fetch yang langsung gagal — riset memakai fallback ringkasan
// (telitiItem best-effort; tanpa jaringan dalam uji).
const fetchGagal = async () => {
  throw new Error("jaringan dimatikan dalam uji");
};

// ---------- Adapter memori (kontrak AiAdapter, secukupnya) ----------
function keItemSerupa(item) {
  return {
    id: item.id,
    sumber_id: item.sumber_id,
    url: item.url,
    judul: item.judul,
    ringkasan: item.ringkasan,
    waktu_terbit_asli: item.waktu_terbit_asli,
    disalin_dari_id: item.disalin_dari_id,
  };
}

class AdapterMemori {
  constructor(items, sumber) {
    this.items = new Map(items.map((i) => [i.id, { ...i }]));
    this.sumber = new Map(sumber.map((s) => [s.id, s]));
    this.klaim = [];
    this.bukti = [];
    this.verifikasi = [];
    this.artikel = [];
    this.runs = [];
    this.n = 0;
  }
  async ambilAntrean(limit) {
    return [...this.items.values()]
      .filter((i) => i.status === "UNCONFIRMED")
      .slice(0, limit);
  }
  async ambilWaktuAntreanTertua() {
    return null;
  }
  async ambilSumber(id) {
    return this.sumber.get(id) ?? null;
  }
  async ambilItemSerupa(hash, kecualiId) {
    return [...this.items.values()]
      .filter((i) => hashJudul(i.judul) === hash && i.id !== kecualiId)
      .map(keItemSerupa);
  }
  async cariKlaimSerupa(inti, kecualiItemId, batas = 20) {
    const norm = inti.toLowerCase();
    return this.klaim
      .filter(
        (k) =>
          k.raw_item_id !== kecualiItemId &&
          k.teks.toLowerCase().includes(norm),
      )
      .slice(0, batas)
      .map((k) => {
        const item = this.items.get(k.raw_item_id);
        return {
          id: k.id,
          raw_item_id: k.raw_item_id,
          teks: k.teks,
          jenis: k.jenis,
          sumber_id: item?.sumber_id ?? null,
          judul_item: item?.judul ?? "",
          url_item: item?.url ?? "",
          ringkasan_item: item?.ringkasan ?? "",
          waktu_terbit_asli: item?.waktu_terbit_asli ?? null,
          disalin_dari_id: item?.disalin_dari_id ?? null,
        };
      });
  }
  async catatRun(run) {
    const id = `run-${++this.n}`;
    this.runs.push({
      id,
      agen: run.agen,
      input_ref: run.input_ref ?? null,
      input_jenis: run.input_jenis ?? "raw_item",
      dipicu_oleh: run.dipicu_oleh ?? "manual",
      status: "berjalan",
      detail: {},
      error: null,
    });
    return id;
  }
  async tutupRun(id, patch) {
    const run = this.runs.find((r) => r.id === id);
    if (!run) throw new Error(`run tak dikenal: ${id}`);
    run.status = patch.status;
    run.error = patch.error ?? null;
    run.durasi_ms = patch.durasi_ms ?? null;
    run.output_ref = patch.output_ref ?? null;
    run.detail = patch.detail ?? {};
  }
  async simpanKlaim(k) {
    const ada = this.klaim.find(
      (x) => x.raw_item_id === k.raw_item_id && x.teks === k.teks,
    );
    if (ada) return ada.id;
    const id = `klaim-${++this.n}`;
    this.klaim.push({ id, ...k });
    return id;
  }
  async cariKlaimSama(rawItemId, teks) {
    const ada = this.klaim.find(
      (x) => x.raw_item_id === rawItemId && x.teks === teks,
    );
    return ada ? ada.id : null;
  }
  async simpanBukti(b) {
    this.bukti.push({ ...b });
  }
  async simpanVerification(r) {
    const id = `ver-${++this.n}`;
    this.verifikasi.push({ id, ...r });
    return id;
  }
  async simpanArtikel(d) {
    const id = `artikel-${++this.n}`;
    this.artikel.push({ id, ...d });
    return id;
  }
  async perbaruiStatusItem(id, status) {
    const item = this.items.get(id);
    if (item) item.status = status;
  }
  async simpanMetadataItem(id, metadata) {
    const item = this.items.get(id);
    if (item) item.metadata = metadata;
  }
  async ambilKlaimTanpaVerifikasi() {
    return [];
  }
  async simpanBrief() {
    return "brief-1";
  }
  async ambilBriefTerbaru() {
    return null;
  }
  async ambilDrafArtikel() {
    return [];
  }
}

function buatItem(id, sumberId, judul, ringkasan, url) {
  return {
    id,
    sumber_id: sumberId,
    sumber_nama: sumberId === "s1" ? "Antara" : "CNN Indonesia",
    sumber_prioritas: 95,
    url,
    judul,
    ringkasan,
    isi_ringkas: "",
    penulis: null,
    waktu_terbit_asli: new Date().toISOString(),
    waktu_diambil: new Date().toISOString(),
    status: "UNCONFIRMED",
    disalin_dari_id: null,
    metadata: null,
  };
}

const JUDUL_SAMA =
  "Pemerintah Salurkan Bantuan bagi Korban Banjir di Jakarta";
const RINGKAS_SAMA =
  "Bantuan mencapai 150 juta rupiah untuk korban banjir di Jakarta. " +
  "Pemerintah memastikan penyaluran berjalan cepat.";
const SUMBER_TIER1 = [
  { id: "s1", nama: "Antara", jenis: "kantor_berita", url: "https://www.antaranews.com", prioritas: 95 },
  { id: "s2", nama: "CNN Indonesia", jenis: "media", url: "https://www.cnnindonesia.com", prioritas: 92 },
];

// ---------- §A: bandingkanAntarItem (pure) ----------
console.log("--- §A bandingkanAntarItem (pure) ---");
{
  const ctxDua = [
    {
      item: buatItem("a1", "s1", JUDUL_SAMA, RINGKAS_SAMA, "https://www.antaranews.com/berita/uji-1"),
      klaimTersimpan: [
        { teks: JUDUL_SAMA, jenis: "fakta" },
        { teks: "Bantuan mencapai 150 juta rupiah untuk korban banjir di Jakarta.", jenis: "angka" },
      ],
      idKlaim: ["k1", "k2"],
      tierUtama: 1,
    },
    {
      item: buatItem("a2", "s2", JUDUL_SAMA, RINGKAS_SAMA, "https://www.cnnindonesia.com/berita/uji-1"),
      klaimTersimpan: [
        { teks: JUDUL_SAMA, jenis: "fakta" },
        { teks: "Bantuan mencapai 150 juta rupiah untuk korban banjir di Jakarta.", jenis: "angka" },
      ],
      idKlaim: ["k3", "k4"],
      tierUtama: 1,
    },
  ];
  const h = bandingkanAntarItem(ctxDua);
  cek("A1 dua item judul identik: 1 pasangan dibandingkan", h.pasanganDibandingkan === 1, `dapat ${h.pasanganDibandingkan}`);
  cek("A2 dua item judul identik: 1 pasangan judul identik", h.pasanganJudulIdentik === 1, `dapat ${h.pasanganJudulIdentik}`);
  cek("A3 dua item judul identik: 2 sumber independen judul", h.sumberIndependenJudul === 2, `dapat ${h.sumberIndependenJudul}`);
  cek("A4 dua item berbagi inti angka: 1 klaim terkoroborasi", h.klaimTerkoroborasi === 1, `dapat ${h.klaimTerkoroborasi}`);
  cek("A5 klaim dibandingkan = 2 (satu inti per item)", h.klaimDibandingkan === 2, `dapat ${h.klaimDibandingkan}`);

  const hSatu = bandingkanAntarItem([ctxDua[0]]);
  cek("A6 satu item: 0 pasangan, 0 klaim terkoroborasi", hSatu.pasanganDibandingkan === 0 && hSatu.klaimTerkoroborasi === 0);
  cek("A7 konteks kosong: 0 pasangan", bandingkanAntarItem([]).pasanganDibandingkan === 0);

  const ctxBeda = [
    ctxDua[0],
    {
      item: buatItem("b1", "s2", "Timnas Menang Tipis atas Rival di Laga Persahabatan", "Gol tunggal dicetak pada babak kedua pertandingan.", "https://www.cnnindonesia.com/berita/uji-2"),
      klaimTersimpan: [{ teks: "Timnas Menang Tipis atas Rival di Laga Persahabatan", jenis: "fakta" }],
      idKlaim: ["k5"],
      tierUtama: 1,
    },
  ];
  const hBeda = bandingkanAntarItem(ctxBeda);
  cek("A8 judul beda + tanpa inti bersama: 0 judul identik, 0 terkoroborasi", hBeda.pasanganJudulIdentik === 0 && hBeda.klaimTerkoroborasi === 0);
  cek("A9 judul beda: tetap 1 pasangan DIBANDINGKAN", hBeda.pasanganDibandingkan === 1, `dapat ${hBeda.pasanganDibandingkan}`);
}

// ---------- §B: pipeline end-to-end (adapter memori) ----------
console.log("--- §B jalankanPipelineEditorial ---");
{
  // Skenario B1: dua item judul identik, dua sumber tier-1.
  const adapter = new AdapterMemori(
    [
      buatItem("a1", "s1", JUDUL_SAMA, RINGKAS_SAMA, "https://www.antaranews.com/berita/uji-1"),
      buatItem("a2", "s2", JUDUL_SAMA, RINGKAS_SAMA, "https://www.cnnindonesia.com/berita/uji-1"),
    ],
    SUMBER_TIER1,
  );
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    dipicu_oleh: "manual",
    fetchFn: fetchGagal,
    rekonsiliasi: false,
  });
  const barisComparison = adapter.runs.filter(
    (r) => r.detail && r.detail.langkah === "comparison",
  );
  cek("B1 satu baris comparison tercatat tiap run", barisComparison.length === 1, `dapat ${barisComparison.length}`);
  const bc = barisComparison[0];
  cek("B2 baris comparison berstatus berhasil (ada temuan)", bc && bc.status === "berhasil", bc ? `status ${bc.status}` : "tidak ada baris");
  cek("B3 baris comparison memakai agen CHECK-aman", bc && bc.agen === "fact_verification", bc ? `agen ${bc.agen}` : "tidak ada baris");
  cek("B4 detail comparison: 1 pasangan, 1 judul identik, 1 klaim terkoroborasi",
    bc && bc.detail.pasangan_dibandingkan === 1 && bc.detail.pasangan_judul_identik === 1 && bc.detail.klaim_terkoroborasi === 1,
    bc ? JSON.stringify(bc.detail) : "tidak ada baris");
  cek("B5 pipeline: 2 diproses, 2 draf, 0 gagal", hasil.diproses === 2 && hasil.draf === 2 && hasil.gagal === 0, JSON.stringify(hasil));

  // Keputusan verification SAMA seperti hitungan langsung
  // verification.ts (bukti comparison tidak mengubah keputusan).
  const tierMap = new Map([["s1", 1], ["s2", 1]]);
  for (const item of adapter.items.values()) {
    const rec = adapter.verifikasi.find(
      (v) => v.raw_item_id === item.id && !v.artikel_id,
    );
    const utama = keItemSerupa(item);
    const serupa = [...adapter.items.values()]
      .filter((i) => i.id !== item.id && hashJudul(i.judul) === hashJudul(item.judul))
      .map(keItemSerupa);
    const vJudul = tentukanKeputusanVerifikasi(utama, serupa, tierMap);
    const klaimItem = adapter.klaim.filter((k) => k.raw_item_id === item.id);
    const klaimDenganInti = klaimItem.map((k) => ({ teks: k.teks, jenis: k.jenis, inti: intiKlaim(k) }));
    const koroborasi = [];
    for (const k of klaimDenganInti) {
      if (!k.inti) continue;
      const cocok = await adapter.cariKlaimSerupa(k.inti, item.id, 20);
      for (const c of cocok) {
        koroborasi.push({
          inti: k.inti, jenis: c.jenis, teksKlaim: c.teks, itemId: c.raw_item_id,
          sumberId: c.sumber_id, judul: c.judul_item, url: c.url_item,
          ringkasan: c.ringkasan_item, waktuTerbitAsli: c.waktu_terbit_asli,
          disalinDariId: c.disalin_dari_id,
        });
      }
    }
    const petaItem = new Map([...adapter.items.values()].map((i) => [i.id, keItemSerupa(i)]));
    const vKlaim = tentukanKeputusanDariKlaim(utama, klaimDenganInti, koroborasi, tierMap, petaItem);
    const harapan = klaimItem.length === 0
      ? "UNCONFIRMED"
      : vKlaim.keputusan
        ? gabungkanKeputusan(vJudul.keputusan, vKlaim.keputusan)
        : vJudul.keputusan;
    cek(`B6 keputusan ${item.id} sama dengan hitungan langsung (${harapan})`, rec && rec.keputusan === harapan, rec ? `record ${rec.keputusan}` : "tidak ada record");
  }

  // Skenario B2: satu item saja → comparison dilewati, item tetap diproses.
  const adapterSatu = new AdapterMemori(
    [buatItem("a1", "s1", JUDUL_SAMA, RINGKAS_SAMA, "https://www.antaranews.com/berita/uji-1")],
    SUMBER_TIER1,
  );
  const hasilSatu = await jalankanPipelineEditorial(adapterSatu, {
    limit: 10, dipicu_oleh: "manual", fetchFn: fetchGagal, rekonsiliasi: false,
  });
  const bcSatu = adapterSatu.runs.find((r) => r.detail && r.detail.langkah === "comparison");
  cek("B7 satu item: comparison dicatat dilewati (bukan gagal)", bcSatu && bcSatu.status === "dilewati", bcSatu ? `status ${bcSatu.status}` : "tidak ada baris");
  cek("B8 satu item: alasan jujur menyebut 1 item", bcSatu && typeof bcSatu.error === "string" && bcSatu.error.includes("1 item"), bcSatu ? bcSatu.error : "tidak ada baris");
  cek("B9 satu item tier-1: tetap diproses + draf (CROSS-CHECKED), 0 gagal",
    hasilSatu.diproses === 1 && hasilSatu.draf === 1 && hasilSatu.gagal === 0, JSON.stringify(hasilSatu));

  // Skenario B3: dua item tanpa temuan → comparison dilewati, antrean tetap jalan.
  const adapterBeda = new AdapterMemori(
    [
      buatItem("a1", "s1", JUDUL_SAMA, RINGKAS_SAMA, "https://www.antaranews.com/berita/uji-1"),
      {
        ...buatItem("b1", "s2", "Timnas Menang Tipis atas Rival di Laga Persahabatan", "Gol tunggal dicetak pada babak kedua pertandingan.", "https://www.cnnindonesia.com/berita/uji-2"),
        sumber_prioritas: 50,
      },
    ],
    [
      ...SUMBER_TIER1,
      { id: "s2", nama: "CNN Indonesia", jenis: "media", url: "https://www.cnnindonesia.com", prioritas: 50 },
    ],
  );
  const hasilBeda = await jalankanPipelineEditorial(adapterBeda, {
    limit: 10, dipicu_oleh: "manual", fetchFn: fetchGagal, rekonsiliasi: false,
  });
  const bcBeda = adapterBeda.runs.find((r) => r.detail && r.detail.langkah === "comparison");
  cek("B10 tanpa temuan: comparison dicatat dilewati (bukan gagal)", bcBeda && bcBeda.status === "dilewati", bcBeda ? `status ${bcBeda.status}` : "tidak ada baris");
  cek("B11 tanpa temuan: antrean tetap jalan (2 diproses, 0 gagal)",
    hasilBeda.diproses === 2 && hasilBeda.gagal === 0, JSON.stringify(hasilBeda));
}

// ---------- §C: CHECK pf_ai_runs.agen di PGlite ----------
console.log("--- §C CHECK pf_ai_runs.agen (PGlite, migrasi v1–v8) ---");
{
  const MIGRASI_V1_V8 = [
    "20261116_pf_v1_foundation.sql",
    "20261116_pf_v2_articles.sql",
    "20261116_pf_v3_ingestion.sql",
    "20261116_pf_v4_ai.sql",
    "20261116_pf_v5_editorial.sql",
    "20261116_pf_v6_advanced.sql",
    "20261116_pf_v7_quiz_scores.sql",
    "20261116_pf_v8_expansion.sql",
  ];
  function bacaMigrasi(nama) {
    let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
    sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
    sql = sql.replace(/\bcitext\b/gi, "text");
    return sql;
  }
  const db = new PGlite();
  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create schema if not exists extensions;`);
  await db.exec(`create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`);
  await db.exec(`create role anon nologin;`);
  await db.exec(`create role authenticated nologin;`);
  await db.exec(`create role service_role nologin;`);
  let migrasiOk = true;
  for (const nama of MIGRASI_V1_V8) {
    try {
      await db.exec(bacaMigrasi(nama));
    } catch (e) {
      migrasiOk = false;
      console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
    }
  }
  cek("C1 migrasi v1–v8 diterapkan di PGlite", migrasiOk);

  let ditolakComparison = false;
  try {
    await db.query(
      `insert into public.pf_ai_runs (agen, input_ref, input_jenis, dipicu_oleh) values ($1, $2, $3, $4)`,
      ["comparison", "batch-uji", "lain", "manual"],
    );
  } catch (e) {
    ditolakComparison = /check/i.test(String(e.message));
  }
  cek("C2 agen harfiah 'comparison' DITOLAK CHECK pf_ai_runs", ditolakComparison, ditolakComparison ? "CHECK violation (bukti blokir)" : "insert lolos — CHECK tidak berlaku?!");

  let tulisAmanOk = false;
  try {
    await db.query(
      `insert into public.pf_ai_runs (agen, input_ref, input_jenis, dipicu_oleh, status, detail) values ($1, $2, $3, $4, $5, $6)`,
      ["fact_verification", "batch-uji", "lain", "manual", "berhasil", JSON.stringify({ langkah: "comparison", pasangan_dibandingkan: 1 })],
    );
    tulisAmanOk = true;
  } catch (e) {
    console.log(`GAGAL: tulis CHECK-aman — ${String(e.message).split("\n")[0]}`);
  }
  cek("C3 pencatatan CHECK-aman (fact_verification + detail.langkah) DITERIMA", tulisAmanOk);
  const r = await db.query(
    `select count(*)::int as n from public.pf_ai_runs where detail->>'langkah' = 'comparison'`,
  );
  cek("C4 baris comparison dapat ditemukan lewat detail.langkah", r.rows[0].n === 1, `dapat ${r.rows[0].n}`);
  await db.close();
}

// ---------- §D: penjaga statis ----------
console.log("--- §D penjaga statis ---");
{
  const pipeline = bacaFile("src/lib/ai/pipeline.ts");
  const idxFase1 = pipeline.indexOf("Fase 1: riset SEMUA item dulu");
  const idxComparison = pipeline.indexOf("bandingkanAntarItem(konteks)");
  const idxFase2 = pipeline.indexOf("Fase 2: verifikasi + draf per item");
  cek("D1 urutan Fase 1 → comparison → Fase 2", idxFase1 > 0 && idxFase1 < idxComparison && idxComparison < idxFase2);
  cek("D2 tidak ada agen: \"comparison\" di pipeline.ts", !/agen:\s*"comparison"/.test(pipeline));
  cek("D3 pipeline mencatat detail.langkah = \"comparison\"", pipeline.includes('langkah: "comparison"'));
  cek("D4 tipe AgenAi TIDAK diubah (tanpa 'comparison')", !bacaFile("src/lib/ai/types.ts").includes('"comparison"'));
  const adaV20 = fs.readdirSync(DIR_MIGRASI).some((f) => /v20/i.test(f));
  cek("D5 tidak ada migrasi v20 (CHECK tidak diubah diam-diam)", !adaV20);
  const prov = bacaFile("src/components/artikel/ProvenanceAI.tsx");
  // Komentar penjelas menyebut frasa terlarang sebagai larangan —
  // yang diuji adalah teks RENDER (tanpa komentar).
  const provTanpaKomentar = prov
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !/^\s*\/\//.test(b))
    .join("\n");
  cek("D6 ProvenanceAI menyembunyikan seksi bila tak ada data (return null)", prov.includes("return null"));
  cek("D7 ProvenanceAI tidak menulis \"0 klaim\"", !provTanpaKomentar.includes("0 klaim"));
  cek("D8 ProvenanceAI tidak mengklaim mutlak \"ditulis AI\"", !/ditulis AI/i.test(provTanpaKomentar));
  const halaman = bacaFile("src/app/artikel/[slug]/page.tsx");
  cek("D9 halaman artikel memakai ProvenanceAI", halaman.includes("ProvenanceAI"));
  cek("D10 halaman artikel tidak menambah ke data.ts (getter dipakai ulang)", !halaman.includes("getProvenance"));
}

console.log(`\nP2-5: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
