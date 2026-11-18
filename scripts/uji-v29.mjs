// Uji fitur v29 PRATA FAKTA — fungsi murni + adapter dengan
// klien mock (TANPA DB produksi, TANPA fetch, TANPA PGlite).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-v29.mjs
//
// YANG DIUJI:
//   §A  Audience Intelligence (src/lib/audiens.ts): jendela 30
//       hari, kategori, tren harian, durasi, istilah pencarian.
//   §B  Broadcast bersama (src/lib/notifikasi/broadcast.ts):
//       payload Daily Brief + validasi broadcast.
//   §C  Aturan arah deterministik (pipeline tentukanArahBukti).
//   §D  Batas ulang QC di adapter (catat + reset) dengan klien
//       mock: 3x -> terminal 'DITOLAK', reset, flip bersyarat,
//       fail-open bila kolom pra-v29 belum ada.
//   §E  Statis: halaman label-sikap (TombolAksi + konfirmasi,
//       tanpa window.confirm) + route brief (push best-effort).
import fs from "node:fs";
import path from "node:path";
import {
  agregatDurasi,
  agregatHarian,
  agregatKategori,
  agregatPencarian,
  saringJendela,
} from "../src/lib/audiens.ts";
import {
  buatPayloadBrief,
  validasiBroadcast,
} from "../src/lib/notifikasi/broadcast.ts";
import { tentukanArahBukti } from "../src/lib/ai/pipeline.ts";
import { SupabaseAiAdapter } from "../src/lib/ai/supabase-adapter.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;
function baca(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}

let lolos = 0;
let gagal = 0;
function periksa(nama, kondisi, rincian = "") {
  if (kondisi) {
    lolos += 1;
    console.log(`OK: ${nama}`);
  } else {
    gagal += 1;
    console.error(`GAGAL: ${nama}${rincian ? ` — ${rincian}` : ""}`);
  }
}

// ---------- §A: audiens ----------
console.log("--- §A audiens (fungsi murni) ---");
{
  const SEKARANG = Date.parse("2026-11-18T12:00:00+07:00");
  const baris = [
    { artikel_id: "a1", dibaca_pada: "2026-11-18T10:00:00+07:00", durasi_detik: 120, selesai: true },
    { artikel_id: "a1", dibaca_pada: "2026-11-17T09:00:00+07:00", durasi_detik: 60, selesai: false },
    { artikel_id: "a1", dibaca_pada: "2026-11-18T11:00:00+07:00", durasi_detik: 90, selesai: true },
    { artikel_id: "a2", dibaca_pada: "2026-11-10T09:00:00+07:00", durasi_detik: 30, selesai: true },
    { artikel_id: "a2", dibaca_pada: "2026-10-01T09:00:00+07:00", durasi_detik: 999, selesai: false },
    { artikel_id: "a3", dibaca_pada: null, durasi_detik: null, selesai: false },
    { artikel_id: "a1", dibaca_pada: "2026-11-18T11:30:00+07:00", durasi_detik: -5, selesai: true },
  ];
  const jendela = saringJendela(baris, 30, SEKARANG);
  periksa(
    "A1 jendela 30 hari: 5 baris (tua + tanpa tanggal dikeluarkan)",
    jendela.length === 5,
    `dapat ${jendela.length}`,
  );
  const kategori = agregatKategori(
    jendela,
    new Map([["a1", "indonesia"], ["a2", "dunia"]]),
  );
  periksa(
    "A2 kategori: indonesia 4, dunia 1, terurut",
    kategori.length === 2 &&
      kategori[0].kategori === "indonesia" &&
      kategori[0].dibaca === 4 &&
      kategori[1].kategori === "dunia" &&
      kategori[1].dibaca === 1,
    JSON.stringify(kategori),
  );
  const kategoriTanpa = agregatKategori(jendela, new Map());
  periksa(
    "A3 artikel tanpa kategori dikelompokkan '(tanpa kategori)'",
    kategoriTanpa.length === 1 &&
      kategoriTanpa[0].kategori === "(tanpa kategori)" &&
      kategoriTanpa[0].dibaca === 5,
    JSON.stringify(kategoriTanpa),
  );
  const harian = agregatHarian(jendela, 30, SEKARANG);
  const tgl18 = harian.find((h) => h.tanggal === "2026-11-18");
  const tgl17 = harian.find((h) => h.tanggal === "2026-11-17");
  const tgl10 = harian.find((h) => h.tanggal === "2026-11-10");
  periksa(
    "A4 tren harian: 30 hari, hitungan per tanggal benar (18:3, 17:1, 10:1)",
    harian.length === 30 &&
      tgl18?.dibaca === 3 &&
      tgl17?.dibaca === 1 &&
      tgl10?.dibaca === 1,
    `panjang ${harian.length}`,
  );
  periksa(
    "A5 tren harian: tanggal tanpa baca = 0",
    harian.find((h) => h.tanggal === "2026-11-15")?.dibaca === 0,
  );
  // Durasi dihitung dari jendela yang sama (30 hari): 120+60+90+30
  // = 300/4 = 75; baris 999 (di luar jendela) + null + negatif
  // tidak ikut.
  const durasi = agregatDurasi(jendela);
  periksa(
    "A6 durasi: rata-rata 75 detik dari 4 berdurasi (null + negatif + luar jendela diabaikan)",
    durasi.rata_rata_detik === 75 && durasi.dengan_durasi === 4,
    JSON.stringify(durasi),
  );
  periksa(
    "A7 durasi per artikel: min 3 pembacaan — a1 masuk (3, rata-rata 90), a2 tidak (1)",
    durasi.per_artikel.length === 1 &&
      durasi.per_artikel[0].artikel_id === "a1" &&
      durasi.per_artikel[0].rata_rata_detik === 90,
    JSON.stringify(durasi.per_artikel),
  );
  const prefs = [
    { pencarian_tersimpan: [{ q: "  Prabowo  ", disimpan_pada: "2026-11-18" }, { q: "prabowo", disimpan_pada: "2026-11-17" }, { q: "IKN", disimpan_pada: "2026-11-17" }] },
    { pencarian_tersimpan: [{ q: "Prabowo", disimpan_pada: "2026-11-18" }, { q: "", disimpan_pada: "2026-11-18" }] },
    { pencarian_tersimpan: "bukan-array" },
    {},
    { pencarian_tersimpan: [{ q: "ikn", disimpan_pada: "2026-11-18" }] },
  ];
  const cari = agregatPencarian(prefs);
  periksa(
    "A8 pencarian: dihitung per pengguna (prabowo 2, ikn 2), case-insensitive, duplikat per pengguna sekali",
    cari.length === 2 &&
      cari[0].istilah === "prabowo" &&
      cari[0].pengguna === 2 &&
      cari[1].istilah === "ikn" &&
      cari[1].pengguna === 2,
    JSON.stringify(cari),
  );
}

// ---------- §B: broadcast ----------
console.log("--- §B broadcast (fungsi murni) ---");
{
  const payload = buatPayloadBrief("2026-11-18", [
    "Pemerintah umumkan bantuan pangan",
    "Harga beras turun di pasar induk",
    "Timnas menang 2-0",
    "Berita keempat tidak dipakai",
  ]);
  periksa(
    "B1 payload brief: judul tanggal id-ID + url /brief",
    payload !== null &&
      payload.title === "Daily Brief — 18 November 2026" &&
      payload.url === "/brief",
    JSON.stringify(payload),
  );
  periksa(
    "B2 payload brief: isi 3 headline pertama dipisah ' • '",
    payload !== null &&
      payload.body ===
        "Pemerintah umumkan bantuan pangan • Harga beras turun di pasar induk • Timnas menang 2-0",
    payload?.body ?? "",
  );
  periksa(
    "B3 payload brief: tanpa entri -> null (tidak kirim push)",
    buatPayloadBrief("2026-11-18", []) === null,
  );
  const panjang = buatPayloadBrief("2026-11-18", ["x".repeat(600)]);
  periksa(
    "B4 payload brief: isi >500 dipotong + diakhiri …",
    panjang !== null && panjang.body.length <= 500 && panjang.body.endsWith("…"),
    `panjang ${panjang?.body.length}`,
  );
  periksa(
    "B5 validasi broadcast: payload sah lolos, url default '/'",
    JSON.stringify(validasiBroadcast({ title: "Halo", body: "Isi" })) ===
      JSON.stringify({ title: "Halo", body: "Isi", url: "/" }),
  );
  periksa(
    "B6 validasi broadcast: judul >200 ditolak",
    validasiBroadcast({ title: "x".repeat(201), body: "Isi" }) === null,
  );
  periksa(
    "B7 validasi broadcast: isi >500 ditolak",
    validasiBroadcast({ title: "Halo", body: "x".repeat(501) }) === null,
  );
  periksa(
    "B8 validasi broadcast: url '//evil.com' ditolak, '/brief' diterima",
    validasiBroadcast({ title: "Halo", body: "Isi", url: "//evil.com" }) === null &&
      validasiBroadcast({ title: "Halo", body: "Isi", url: "/brief" })?.url === "/brief",
  );
}

// ---------- §C: arah deterministik ----------
console.log("--- §C aturan arah deterministik ---");
{
  periksa(
    "C1 kutipan ditemukan -> 'mendukung'",
    tentukanArahBukti("Kalimat pendukung di sumber.") === "mendukung",
  );
  periksa(
    "C2 tanpa kutipan (null) -> 'netral'",
    tentukanArahBukti(null) === "netral",
  );
  periksa(
    "C3 tanpa kutipan (string kosong/spasi) -> 'netral'",
    tentukanArahBukti("   ") === "netral",
  );
  periksa(
    "C4 'menentang' TIDAK PERNAH dihasilkan otomatis (hanya 2 keluaran)",
    tentukanArahBukti("x") !== "menentang" &&
      tentukanArahBukti(null) !== "menentang",
  );
}

// ---------- §D: adapter counter (klien mock) ----------
console.log("--- §D batas ulang QC di adapter (mock) ---");
{
  // Klien mock minimal yang meniru rantai PostgREST yang dipakai
  // catatGagalQualityCheck / resetGagalQualityCheck:
  //   from().select().eq().maybeSingle()
  //   from().update().eq()            (await langsung)
  //   from().update().eq().eq().select() (flip bersyarat)
  function buatKlienMock(awal, kolomAda = true) {
    const store = new Map(Object.entries(awal));
    class Builder {
      constructor() {
        this.mode = null;
        this.patch = null;
        this.filter = [];
        this.mintaSelect = false;
      }
      select() {
        this.mintaSelect = true;
        return this;
      }
      update(patch) {
        this.mode = "update";
        this.patch = patch;
        return this;
      }
      eq(k, v) {
        this.filter.push([k, v]);
        return this;
      }
      async maybeSingle() {
        if (!kolomAda) {
          return { data: null, error: { code: "PGRST204", message: "column does not exist" } };
        }
        const row = [...store.values()].find((r) =>
          this.filter.every(([k, v]) => r[k] === v),
        );
        return { data: row ?? null, error: null };
      }
      then(resolve, reject) {
        return this.jalankan().then(resolve, reject);
      }
      async jalankan() {
        if (!kolomAda) {
          return { data: null, error: { code: "PGRST204", message: "column does not exist" } };
        }
        const cocok = [...store.entries()].filter(([, r]) =>
          this.filter.every(([k, v]) => r[k] === v),
        );
        if (this.mode === "update") {
          for (const [id, r] of cocok) {
            store.set(id, { ...r, ...this.patch });
          }
          if (this.mintaSelect) {
            return { data: cocok.map(([id]) => ({ id })), error: null };
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }
    }
    return {
      from() {
        return {
          select() {
            const b = new Builder();
            b.mode = "select";
            return b;
          },
          update(patch) {
            const b = new Builder();
            return b.update(patch);
          },
        };
      },
      _store: store,
    };
  }

  const ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const adapter = new SupabaseAiAdapter(
    "https://contoh.supabase.co",
    "dummy-service-key-untuk-uji",
  );
  // D1: 1x, 2x tidak terminal; 3x terminal + status DITOLAK.
  adapter.klien = buatKlienMock({
    [ID]: { id: ID, qc_gagal_berturut_turut: 0, status_verifikasi: "UNCONFIRMED" },
  });
  const r1 = await adapter.catatGagalQualityCheck(ID);
  const r2 = await adapter.catatGagalQualityCheck(ID);
  const r3 = await adapter.catatGagalQualityCheck(ID);
  periksa(
    "D1 hitungan 1 dan 2 tidak terminal",
    r1.terminal === false && r1.hitungan === 1 &&
      r2.terminal === false && r2.hitungan === 2,
    JSON.stringify([r1, r2]),
  );
  periksa(
    "D2 hitungan 3 terminal + status jadi DITOLAK",
    r3.terminal === true && r3.hitungan === 3 &&
      adapter.klien._store.get(ID).status_verifikasi === "DITOLAK" &&
      adapter.klien._store.get(ID).qc_gagal_berturut_turut === 3,
    JSON.stringify(r3),
  );
  // D3: reset nol-kan counter.
  await adapter.resetGagalQualityCheck(ID);
  periksa(
    "D3 reset nol-kan counter",
    adapter.klien._store.get(ID).qc_gagal_berturut_turut === 0,
  );
  // D4: flip bersyarat — status sudah berubah (VERIFIED) di
  // hitungan 3 -> terminal false, status TIDAK diubah.
  adapter.klien = buatKlienMock({
    [ID]: { id: ID, qc_gagal_berturut_turut: 2, status_verifikasi: "VERIFIED" },
  });
  const r4 = await adapter.catatGagalQualityCheck(ID);
  periksa(
    "D4 status sudah berubah -> flip tidak terjadi (terminal false)",
    r4.terminal === false && r4.hitungan === 3 &&
      adapter.klien._store.get(ID).status_verifikasi === "VERIFIED",
    JSON.stringify(r4),
  );
  // D5: fail-open bila kolom pra-v29 belum ada (PGRST204).
  adapter.klien = buatKlienMock(
    { [ID]: { id: ID, status_verifikasi: "UNCONFIRMED" } },
    false,
  );
  let tidakLempar = true;
  let hasilFailOpen = null;
  try {
    hasilFailOpen = await adapter.catatGagalQualityCheck(ID);
    await adapter.resetGagalQualityCheck(ID);
  } catch {
    tidakLempar = false;
  }
  periksa(
    "D5 kolom belum ada -> fail-open {terminal:false, hitungan:null}, tanpa throw",
    tidakLempar &&
      hasilFailOpen !== null &&
      hasilFailOpen.terminal === false &&
      hasilFailOpen.hitungan === null,
    JSON.stringify(hasilFailOpen),
  );
}

// ---------- §E: statis halaman + route ----------
console.log("--- §E statis halaman label-sikap + route brief ---");
{
  const halaman = baca("src/app/admin/label-sikap/page.tsx");
  periksa(
    "E1 halaman label-sikap: 3 TombolAksi (arah) + konfirmasi Radix, tanpa window.confirm",
    halaman.includes("TombolAksi") &&
      halaman.includes('body={{ arah: l.nilai }}') &&
      halaman.includes("konfirmasi=") &&
      !halaman.includes("window.confirm"),
  );
  periksa(
    "E2 halaman label-sikap: menjelaskan aturan (deterministik + manual menang + taksonomi 3 nilai)",
    halaman.includes("deterministik") &&
      halaman.includes("SELALU menang") &&
      halaman.includes("menentang"),
  );
  const routeBrief = baca("src/app/api/ai/brief/route.ts");
  periksa(
    "E3 route brief: push best-effort (try/catch) + VAPID dicek dulu",
    routeBrief.includes("try {") &&
      routeBrief.includes("kirimBroadcastPush(service, payload)") &&
      routeBrief.includes("VAPID belum terkonfigurasi"),
  );
  periksa(
    "E4 route brief: tanpa VAPID push dilewati (bukan 503) — brief tetap sukses",
    routeBrief.includes('dikirim: false,') &&
      routeBrief.includes("brief tidak diterbitkan"),
  );
  const routeLabel = baca("src/app/api/admin/evidence/[id]/label/route.ts");
  periksa(
    "E5 route label: 503 jujur bila kolom v29 belum ada",
    routeLabel.includes("migrasi v29 belum diterapkan"),
  );
}

console.log(`\nSELESAI: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
