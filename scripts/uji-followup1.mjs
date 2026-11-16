// Baterai follow-up 1 PRATA FAKTA — compensating editorial.ts (T10 residual).
// Membuktikan compensating BENAR-BENAR memulihkan state bila catatAudit
// melempar SESUDAH mutasi (bukan hanya penanda statis), untuk ke-17
// fungsi editorial.ts yang diaudit, + asersi statis penanda compensating
// dengan regex yang SAMA seperti baterai Tahap D (§E).
//
// Cara kerja: editorial.ts di-transpile (TypeScript compiler, pola
// uji-integrasi14.mjs) dengan import nilai diganti stub — buatSlug
// lokal, kirimNotifikasi* dicatat di globalThis — lalu dijalankan
// melawan adapter stub in-memory. TIDAK menyentuh database / jaringan.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const requireRepo = createRequire(new URL("../package.json", import.meta.url).pathname);
const tsCompiler = requireRepo("typescript");

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- Muat editorial.ts (transpile + stub import nilai) ----------
globalThis.__panggilanNotifikasi = { topik: 0, koreksi: 0 };
const srcEditorial = fs.readFileSync(
  path.join(DIR_REPO, "src/lib/admin/editorial.ts"),
  "utf8",
);
let kode = srcEditorial
  .replace(
    /import \{ buatSlug \} from "\.\.\/ai\/slug\.ts";/,
    `const buatSlug = (judul) => String(judul).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "artikel";`,
  )
  .replace(
    /import \{\s*kirimNotifikasiKoreksi,\s*kirimNotifikasiTopik,\s*\} from "\.\.\/notifikasi\/tulis\.ts";/,
    `const kirimNotifikasiTopik = async () => { globalThis.__panggilanNotifikasi.topik++; };` +
      `const kirimNotifikasiKoreksi = async () => { globalThis.__panggilanNotifikasi.koreksi++; };`,
  );
if (kode.includes("../ai/slug.ts") || kode.includes("../notifikasi/tulis.ts")) {
  throw new Error("gagal mengganti import nilai editorial.ts (pola import berubah?)");
}
const js = tsCompiler.transpileModule(kode, {
  compilerOptions: {
    module: tsCompiler.ModuleKind.CommonJS,
    target: tsCompiler.ScriptTarget.ES2020,
  },
}).outputText;
const modul = { exports: {} };
new Function("module", "exports", "require", js)(modul, modul.exports, () => {
  throw new Error("require tak terduga di editorial.ts");
});
const {
  buatArtikel,
  perbaruiArtikel,
  hapusArtikel,
  terbitkanArtikel,
  batalkanPublikasi,
  jadwalkanArtikel,
  terbitkanTerjadwal,
  putuskanReview,
  ubahStatusVerifikasi,
  tindaklanjutiKoreksi,
  aturPeranPengguna,
  setNonaktifPengguna,
  perbaruiJob,
  buatKategori,
  perbaruiKategori,
  hapusKategori,
  terbitkanBrief,
} = modul.exports;

// ---------- Adapter stub in-memory ----------
function buatStub() {
  const s = {
    artikel: new Map(),
    versi: [],
    review: [],
    verifikasi: [],
    koreksi: new Map(),
    pengguna: new Map(),
    job: new Map(),
    kategori: new Map(),
    brief: new Map(),
    audit: [],
    gagalAudit: false,
    gagalPulihArtikel: false,
    hitung: {
      hapusArtikel: 0,
      pulihkanArtikel: 0,
      hapusVersi: 0,
      hapusReview: 0,
      hapusVerifikasi: 0,
      pulihkanKategori: 0,
      pulihkanBrief: 0,
    },
    nArtikel: 0,
    nVersi: 0,
    nReview: 0,
    nVerifikasi: 0,
    nKategori: 0,
  };
  const salin = (x) => JSON.parse(JSON.stringify(x));
  const adapter = {
    async getArtikel({ id }) {
      return s.artikel.has(id) ? salin(s.artikel.get(id)) : null;
    },
    async getArtikelBySlug({ slug }) {
      for (const a of s.artikel.values()) if (a.slug === slug) return salin(a);
      return null;
    },
    async listArtikel(filter) {
      let daftar = [...s.artikel.values()];
      if (filter.status) daftar = daftar.filter((a) => a.status === filter.status);
      if (filter.kategori) daftar = daftar.filter((a) => a.kategori_slug === filter.kategori);
      return { artikel: daftar.map(salin), total: daftar.length, page: 1, limit: 100 };
    },
    async buatArtikel(input) {
      const a = {
        id: `art-${++s.nArtikel}`,
        slug: input.slug,
        judul: input.judul,
        subjudul: input.subjudul ?? null,
        ringkasan: input.ringkasan,
        isi: input.isi,
        kategori_slug: input.kategori_slug,
        subkategori_slug: input.subkategori_slug ?? null,
        status_verifikasi: "UNCONFIRMED",
        status: "draft",
        penulis_nama: input.penulis_nama ?? null,
        penulis_id: input.penulis_id ?? null,
        isu: input.isu ?? null,
        sumber_url: input.sumber_url ?? null,
        gambar_url: input.gambar_url ?? null,
        estimasi_baca_menit: input.estimasi_baca_menit ?? null,
        kronologi: input.kronologi ?? [],
        fakta_penting: input.fakta_penting ?? [],
        data_pendukung: input.data_pendukung ?? [],
        mengapa_penting: input.mengapa_penting ?? null,
        dampak: input.dampak ?? null,
        belum_diketahui: input.belum_diketahui ?? null,
        dijadwalkan_pada: null,
        diterbitkan_pada: null,
        diterbitkan_oleh: null,
        dibuat_pada: "2026-11-16T00:00:00.000Z",
        diperbarui_pada: "2026-11-16T00:00:00.000Z",
      };
      s.artikel.set(a.id, salin(a));
      return salin(a);
    },
    async perbaruiArtikel({ id, patch, harapkanStatus }) {
      const lama = s.artikel.get(id);
      if (!lama) return null;
      if (harapkanStatus && lama.status !== harapkanStatus) return null;
      const { catatan_versi: _c, ...kolom } = patch;
      void _c;
      const baru = { ...lama, ...kolom };
      s.artikel.set(id, salin(baru));
      return salin(baru);
    },
    async hapusArtikel({ id }) {
      s.hitung.hapusArtikel++;
      s.artikel.delete(id);
      s.versi = s.versi.filter((v) => v.artikel_id !== id);
    },
    async pulihkanArtikel({ artikel }) {
      s.hitung.pulihkanArtikel++;
      if (s.gagalPulihArtikel) throw new Error("PULIH_GAGAL_SIMULASI");
      s.artikel.set(artikel.id, salin(artikel));
      return salin(artikel);
    },
    async simpanVersi(input) {
      const v = {
        id: `ver-${++s.nVersi}`,
        artikel_id: input.artikel_id,
        versi: input.versi,
        judul: input.judul,
        isi: input.isi,
        dibuat_oleh: input.dibuat_oleh,
        dibuat_pada: "2026-11-16T01:00:00.000Z",
        catatan: input.catatan,
      };
      s.versi.push(salin(v));
      return salin(v);
    },
    async getVersiTerakhir({ artikel_id }) {
      const daftar = s.versi.filter((v) => v.artikel_id === artikel_id);
      if (daftar.length === 0) return null;
      return salin(daftar.reduce((a, b) => (b.versi > a.versi ? b : a)));
    },
    async hapusVersi({ id }) {
      s.hitung.hapusVersi++;
      s.versi = s.versi.filter((v) => v.id !== id);
    },
    async catatAudit(input) {
      if (s.gagalAudit) throw new Error("AUDIT_GAGAL_SIMULASI");
      s.audit.push(salin(input));
    },
    async listAudit() {
      return { log: [], total: 0, page: 1, limit: 100 };
    },
    async listAiRuns() {
      return [];
    },
    async simpanReview(input) {
      const r = {
        id: `rev-${++s.nReview}`,
        artikel_id: input.artikel_id,
        reviewer_id: input.reviewer_id,
        keputusan: input.keputusan,
        catatan: input.catatan,
        dibuat_pada: "2026-11-16T00:00:00.000Z",
      };
      s.review.push(salin(r));
      return salin(r);
    },
    async hapusReview({ id }) {
      s.hitung.hapusReview++;
      s.review = s.review.filter((r) => r.id !== id);
    },
    async getReviewTerakhir({ artikel_id }) {
      const daftar = s.review.filter((r) => r.artikel_id === artikel_id);
      return daftar.length ? salin(daftar[daftar.length - 1]) : null;
    },
    async simpanVerification(input) {
      const v = {
        id: `vf-${++s.nVerifikasi}`,
        artikel_id: input.artikel_id,
        raw_item_id: input.raw_item_id ?? null,
        agen: input.agen,
        keputusan: input.keputusan,
        catatan: input.catatan,
        bukti: input.bukti ?? [],
        dibuat_oleh: input.dibuat_oleh,
        dibuat_pada: "2026-11-15T00:00:00.000Z",
      };
      s.verifikasi.push(salin(v));
      return salin(v);
    },
    async hapusVerifikasi({ id }) {
      s.hitung.hapusVerifikasi++;
      s.verifikasi = s.verifikasi.filter((v) => v.id !== id);
    },
    async getVerifikasiTerakhir({ artikel_id }) {
      const daftar = s.verifikasi.filter((v) => v.artikel_id === artikel_id);
      return daftar.length ? salin(daftar[daftar.length - 1]) : null;
    },
    async ubahStatusVerifikasiArtikel({ id, keputusan }) {
      const a = s.artikel.get(id);
      if (!a) return null;
      a.status_verifikasi = keputusan;
      s.artikel.set(id, salin(a));
      return salin(a);
    },
    async getKoreksi({ id }) {
      return s.koreksi.has(id) ? salin(s.koreksi.get(id)) : null;
    },
    async perbaruiKoreksi({ id, status }) {
      const k = s.koreksi.get(id);
      if (!k) return null;
      k.status = status;
      s.koreksi.set(id, salin(k));
      return salin(k);
    },
    async getPengguna({ id }) {
      return s.pengguna.has(id) ? salin(s.pengguna.get(id)) : null;
    },
    async setPeranPengguna({ id, roles }) {
      const p = s.pengguna.get(id);
      if (p) p.roles = [...roles];
    },
    async setNonaktif({ id, nonaktif }) {
      const p = s.pengguna.get(id);
      if (p) p.nonaktif = nonaktif;
    },
    async getJob({ nama }) {
      return s.job.has(nama) ? salin(s.job.get(nama)) : null;
    },
    async perbaruiJob({ nama, patch }) {
      const j = s.job.get(nama);
      if (!j) return null;
      Object.assign(j, patch);
      s.job.set(nama, salin(j));
      return salin(j);
    },
    async listKategori() {
      return [...s.kategori.values()].map(salin);
    },
    async buatKategori(input) {
      const k = {
        id: `kat-${++s.nKategori}`,
        slug: input.slug,
        nama: input.nama,
        deskripsi: input.deskripsi ?? null,
        induk_id: input.induk_id ?? null,
        urutan: input.urutan ?? 0,
        aktif: input.aktif ?? true,
        dibuat_pada: "2026-11-16T00:00:00.000Z",
      };
      s.kategori.set(k.id, salin(k));
      return salin(k);
    },
    async perbaruiKategori({ id, patch }) {
      const k = s.kategori.get(id);
      if (!k) return null;
      Object.assign(k, patch);
      s.kategori.set(id, salin(k));
      return salin(k);
    },
    async hapusKategori({ id }) {
      s.kategori.delete(id);
    },
    async pulihkanKategori({ kategori }) {
      s.hitung.pulihkanKategori++;
      s.kategori.set(kategori.id, salin(kategori));
      return salin(kategori);
    },
    async terbitkanBrief({ id }) {
      const b = s.brief.get(id);
      if (!b) return null;
      b.status = "terbit";
      b.diterbitkan_pada = new Date().toISOString();
      s.brief.set(id, salin(b));
      return salin(b);
    },
    async pulihkanBrief({ id }) {
      s.hitung.pulihkanBrief++;
      const b = s.brief.get(id);
      if (!b) return null;
      b.status = "draft";
      b.diterbitkan_pada = null;
      s.brief.set(id, salin(b));
      return salin(b);
    },
    async listBrief() {
      return [...s.brief.values()].map(salin);
    },
  };
  return { stub: s, adapter };
}

const AKTOR = { id: "aktor-1", email: "editor@uji.id", ip: "127.0.0.1" };
const INPUT_ARTIKEL = {
  judul: "Judul Artikel Uji",
  ringkasan: "Ringkasan artikel uji.",
  isi: "Isi artikel uji.",
  kategori_slug: "nasional",
};

function benihArtikel(stub, over = {}) {
  const a = {
    id: "art-1",
    slug: "judul-artikel",
    judul: "Judul Artikel",
    subjudul: null,
    ringkasan: "Ringkasan.",
    isi: "Isi artikel.",
    kategori_slug: "nasional",
    subkategori_slug: null,
    status_verifikasi: "UNCONFIRMED",
    status: "draft",
    penulis_nama: null,
    penulis_id: null,
    isu: null,
    sumber_url: null,
    gambar_url: null,
    estimasi_baca_menit: 5,
    kronologi: [],
    fakta_penting: [],
    data_pendukung: [],
    mengapa_penting: null,
    dampak: null,
    belum_diketahui: null,
    dijadwalkan_pada: null,
    diterbitkan_pada: null,
    diterbitkan_oleh: null,
    dibuat_pada: "2026-11-16T00:00:00.000Z",
    diperbarui_pada: "2026-11-16T00:00:00.000Z",
    ...over,
  };
  stub.artikel.set(a.id, JSON.parse(JSON.stringify(a)));
  return a;
}

/** Gate terbit butuh verifikasi VERIFIED + review setuju yang
 *  lebih baru dari verifikasi, tanpa versi sesudah review. */
function benihGate(stub, artikelId) {
  stub.verifikasi.push({
    id: "vf-gate",
    artikel_id: artikelId,
    raw_item_id: null,
    agen: "fact_checker",
    keputusan: "VERIFIED",
    catatan: "ok",
    bukti: [],
    dibuat_oleh: "aktor-1",
    dibuat_pada: "2026-11-15T00:00:00.000Z",
  });
  stub.review.push({
    id: "rev-gate",
    artikel_id: artikelId,
    reviewer_id: "aktor-1",
    keputusan: "setuju",
    catatan: "ok",
    dibuat_pada: "2026-11-16T00:00:00.000Z",
  });
}

/** Harapkan fungsi melempar galat audit ASLI; kembalikan galatnya. */
async function harapkanGalatAudit(label, fn) {
  try {
    await fn();
  } catch (err) {
    cek(`${label}: melempar galat audit asli`, err instanceof Error && err.message === "AUDIT_GAGAL_SIMULASI", err instanceof Error ? err.message : String(err));
    return err;
  }
  cek(`${label}: melempar galat audit asli`, false, "tidak melempar");
  return null;
}

// ---------- 1. buatArtikel (create) ----------
{
  const { stub, adapter } = buatStub();
  const dibuat = await buatArtikel(adapter, INPUT_ARTIKEL, AKTOR);
  cek("buatArtikel sukses: artikel ada + versi v1", (await adapter.getArtikel({ id: dibuat.id })) !== null && stub.versi.length === 1, `id=${dibuat.id}`);
  cek("buatArtikel sukses: compensating TIDAK jalan", stub.hitung.hapusArtikel === 0, `hapusArtikel=${stub.hitung.hapusArtikel}`);

  const { stub: s2, adapter: a2 } = buatStub();
  s2.gagalAudit = true;
  await harapkanGalatAudit("buatArtikel audit-gagal", () => buatArtikel(a2, INPUT_ARTIKEL, AKTOR));
  cek("buatArtikel audit-gagal: artikel hapus-balik (tidak ada)", s2.artikel.size === 0 && s2.versi.length === 0, `artikel=${s2.artikel.size} versi=${s2.versi.length}`);
  cek("buatArtikel audit-gagal: compensating dipanggil", s2.hitung.hapusArtikel === 1, `hapusArtikel=${s2.hitung.hapusArtikel}`);
}

// ---------- 2. perbaruiArtikel (update + versi) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  const baru = await perbaruiArtikel(adapter, "art-1", { judul: "Judul Baru" }, AKTOR);
  cek("perbaruiArtikel sukses: judul berubah + versi dibuat", baru.judul === "Judul Baru" && stub.versi.length === 1, `versi=${stub.versi.length}`);
  cek("perbaruiArtikel sukses: compensating TIDAK jalan", stub.hitung.hapusVersi === 0, `hapusVersi=${stub.hitung.hapusVersi}`);

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  s2.gagalAudit = true;
  await harapkanGalatAudit("perbaruiArtikel audit-gagal", () => perbaruiArtikel(a2, "art-1", { judul: "Judul Baru", isi: "Isi baru." }, AKTOR));
  const pulih = await a2.getArtikel({ id: "art-1" });
  cek("perbaruiArtikel audit-gagal: judul + isi dipulihkan", pulih.judul === "Judul Artikel" && pulih.isi === "Isi artikel.", `judul=${pulih.judul}`);
  cek("perbaruiArtikel audit-gagal: versi baru hapus-balik", s2.versi.length === 0, `versi=${s2.versi.length}`);
}

// ---------- 3. hapusArtikel (delete) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  await hapusArtikel(adapter, "art-1", AKTOR);
  cek("hapusArtikel sukses: artikel hilang", (await adapter.getArtikel({ id: "art-1" })) === null, "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  s2.gagalAudit = true;
  await harapkanGalatAudit("hapusArtikel audit-gagal", () => hapusArtikel(a2, "art-1", AKTOR));
  const kembali = await a2.getArtikel({ id: "art-1" });
  cek("hapusArtikel audit-gagal: artikel kembali id asli", kembali !== null && kembali.id === "art-1" && kembali.judul === "Judul Artikel" && kembali.status === "draft", kembali ? `id=${kembali.id}` : "null");
  cek("hapusArtikel audit-gagal: pulihkanArtikel dipanggil", s2.hitung.pulihkanArtikel === 1, `pulihkanArtikel=${s2.hitung.pulihkanArtikel}`);

  // Compensating ikut gagal TIDAK BOLEH menutupi galat audit asli.
  const { stub: s3, adapter: a3 } = buatStub();
  benihArtikel(s3);
  s3.gagalAudit = true;
  s3.gagalPulihArtikel = true;
  const consoleErrorAsli = console.error;
  let errorTercatat = 0;
  console.error = () => { errorTercatat++; };
  let galat = null;
  try {
    await hapusArtikel(a3, "art-1", AKTOR);
  } catch (err) {
    galat = err;
  }
  console.error = consoleErrorAsli;
  cek("hapusArtikel compensating-gagal: galat audit asli tetap dilempar", galat instanceof Error && galat.message === "AUDIT_GAGAL_SIMULASI", galat instanceof Error ? galat.message : String(galat));
  cek("hapusArtikel compensating-gagal: kegagalan compensating dicatat (console.error)", errorTercatat >= 1, `console.error=${errorTercatat}`);
}

// ---------- 4. terbitkanArtikel (status + versi) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  benihGate(stub, "art-1");
  const terbit = await terbitkanArtikel(adapter, "art-1", AKTOR);
  cek("terbitkanArtikel sukses: status terbit + notifikasi terkirim", terbit.status === "terbit" && globalThis.__panggilanNotifikasi.topik === 1, `status=${terbit.status}`);

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  benihGate(s2, "art-1");
  s2.gagalAudit = true;
  globalThis.__panggilanNotifikasi.topik = 0;
  await harapkanGalatAudit("terbitkanArtikel audit-gagal", () => terbitkanArtikel(a2, "art-1", AKTOR));
  const pulih = await a2.getArtikel({ id: "art-1" });
  cek("terbitkanArtikel audit-gagal: status kembali draft", pulih.status === "draft", `status=${pulih.status}`);
  cek("terbitkanArtikel audit-gagal: diterbitkan_pada kembali null", pulih.diterbitkan_pada === null, `diterbitkan_pada=${pulih.diterbitkan_pada}`);
  cek("terbitkanArtikel audit-gagal: versi Terbit hapus-balik", s2.versi.length === 0, `versi=${s2.versi.length}`);
  cek("terbitkanArtikel audit-gagal: notifikasi TIDAK terkirim", globalThis.__panggilanNotifikasi.topik === 0, `notifikasi=${globalThis.__panggilanNotifikasi.topik}`);
}

// ---------- 5. batalkanPublikasi (status) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub, { status: "terbit", diterbitkan_pada: "2026-11-16T00:30:00.000Z" });
  const batal = await batalkanPublikasi(adapter, "art-1", AKTOR);
  cek("batalkanPublikasi sukses: status draft, diterbitkan_pada dipertahankan", batal.status === "draft" && batal.diterbitkan_pada === "2026-11-16T00:30:00.000Z", "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2, { status: "terbit", diterbitkan_pada: "2026-11-16T00:30:00.000Z" });
  s2.gagalAudit = true;
  await harapkanGalatAudit("batalkanPublikasi audit-gagal", () => batalkanPublikasi(a2, "art-1", AKTOR));
  const pulih = await a2.getArtikel({ id: "art-1" });
  cek("batalkanPublikasi audit-gagal: status kembali terbit", pulih.status === "terbit", `status=${pulih.status}`);
}

// ---------- 6. jadwalkanArtikel (status) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  benihGate(stub, "art-1");
  const terjadwal = await jadwalkanArtikel(adapter, "art-1", "2026-11-17T10:00:00.000Z", AKTOR);
  cek("jadwalkanArtikel sukses: status terjadwal", terjadwal.status === "terjadwal" && terjadwal.dijadwalkan_pada === "2026-11-17T10:00:00.000Z", "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  benihGate(s2, "art-1");
  s2.gagalAudit = true;
  await harapkanGalatAudit("jadwalkanArtikel audit-gagal", () => jadwalkanArtikel(a2, "art-1", "2026-11-17T10:00:00.000Z", AKTOR));
  const pulih = await a2.getArtikel({ id: "art-1" });
  cek("jadwalkanArtikel audit-gagal: status + jadwal dipulihkan", pulih.status === "draft" && pulih.dijadwalkan_pada === null, `status=${pulih.status}`);
}

// ---------- 7. terbitkanTerjadwal (delegasi ke terbitkanArtikel) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub, { status: "terjadwal", dijadwalkan_pada: "2026-11-01T00:00:00.000Z" });
  benihGate(stub, "art-1");
  stub.gagalAudit = true;
  const hasil = await terbitkanTerjadwal(adapter, AKTOR);
  const pulih = await adapter.getArtikel({ id: "art-1" });
  cek("terbitkanTerjadwal audit-gagal: artikel tetap terjadwal (compensating delegasi)", pulih.status === "terjadwal", `status=${pulih.status}`);
  cek("terbitkanTerjadwal audit-gagal: masuk dilewati, bukan diterbitkan", hasil.dilewati.length === 1 && hasil.diterbitkan.length === 0, `dilewati=${hasil.dilewati.length}`);
}

// ---------- 8. putuskanReview (create review) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  const hasil = await putuskanReview(adapter, { artikel_id: "art-1", keputusan: "setuju", catatan: "Bagus.", reviewer_id: "aktor-1" }, AKTOR);
  cek("putuskanReview sukses: review tersimpan", hasil.keputusan === "setuju" && stub.review.length === 1, "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  s2.gagalAudit = true;
  await harapkanGalatAudit("putuskanReview audit-gagal", () => putuskanReview(a2, { artikel_id: "art-1", keputusan: "setuju", catatan: "Bagus.", reviewer_id: "aktor-1" }, AKTOR));
  cek("putuskanReview audit-gagal: review hapus-balik", s2.review.length === 0 && (await a2.getReviewTerakhir({ artikel_id: "art-1" })) === null, `review=${s2.review.length}`);
}

// ---------- 9. ubahStatusVerifikasi (verifikasi + status) ----------
{
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  const baru = await ubahStatusVerifikasi(adapter, { artikel_id: "art-1", keputusan: "VERIFIED", catatan: "Terverifikasi." }, AKTOR);
  cek("ubahStatusVerifikasi sukses: status VERIFIED + catatan tersimpan", baru.status_verifikasi === "VERIFIED" && stub.verifikasi.length === 1, "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  s2.gagalAudit = true;
  await harapkanGalatAudit("ubahStatusVerifikasi audit-gagal", () => ubahStatusVerifikasi(a2, { artikel_id: "art-1", keputusan: "VERIFIED", catatan: "Terverifikasi." }, AKTOR));
  const pulih = await a2.getArtikel({ id: "art-1" });
  cek("ubahStatusVerifikasi audit-gagal: status verifikasi dipulihkan", pulih.status_verifikasi === "UNCONFIRMED", `status=${pulih.status_verifikasi}`);
  cek("ubahStatusVerifikasi audit-gagal: catatan verifikasi hapus-balik", s2.verifikasi.length === 0, `verifikasi=${s2.verifikasi.length}`);
}

// ---------- 10. tindaklanjutiKoreksi (3 cabang) ----------
function benihKoreksi(stub, over = {}) {
  const k = {
    id: "kor-1",
    artikel_id: "art-1",
    pelapor_id: null,
    nama: "Pelapor",
    email: null,
    pelapor_email: null,
    jenis: "fakta_salah",
    pesan: "Ada kesalahan fakta.",
    status: "baru",
    nomor_lacak: null,
    tautan_artikel: null,
    dibuat_pada: "2026-11-16T00:00:00.000Z",
    ...over,
  };
  stub.koreksi.set(k.id, JSON.parse(JSON.stringify(k)));
  return k;
}
{
  // Cabang terima (dengan artikel): koreksi + versi + verifikasi + status.
  const { stub, adapter } = buatStub();
  benihArtikel(stub);
  benihKoreksi(stub);
  const hasil = await tindaklanjutiKoreksi(adapter, { koreksi_id: "kor-1", aksi: "terima", catatan: "Diperbaiki." }, AKTOR);
  cek("tindaklanjutiKoreksi terima sukses: status diperbaiki", hasil.status === "diperbaiki" && stub.versi.length === 1 && stub.verifikasi.length === 1, "");

  const { stub: s2, adapter: a2 } = buatStub();
  benihArtikel(s2);
  benihKoreksi(s2);
  s2.gagalAudit = true;
  await harapkanGalatAudit("tindaklanjutiKoreksi terima audit-gagal", () => tindaklanjutiKoreksi(a2, { koreksi_id: "kor-1", aksi: "terima", catatan: "Diperbaiki." }, AKTOR));
  const kor = await a2.getKoreksi({ id: "kor-1" });
  const art = await a2.getArtikel({ id: "art-1" });
  cek("tindaklanjutiKoreksi terima audit-gagal: status koreksi dipulihkan", kor.status === "baru", `status=${kor.status}`);
  cek("tindaklanjutiKoreksi terima audit-gagal: status verifikasi artikel dipulihkan", art.status_verifikasi === "UNCONFIRMED", `status=${art.status_verifikasi}`);
  cek("tindaklanjutiKoreksi terima audit-gagal: versi + verifikasi hapus-balik", s2.versi.length === 0 && s2.verifikasi.length === 0, `versi=${s2.versi.length} verifikasi=${s2.verifikasi.length}`);

  // Cabang ditinjau.
  const { stub: s3, adapter: a3 } = buatStub();
  benihArtikel(s3);
  benihKoreksi(s3);
  s3.gagalAudit = true;
  await harapkanGalatAudit("tindaklanjutiKoreksi ditinjau audit-gagal", () => tindaklanjutiKoreksi(a3, { koreksi_id: "kor-1", aksi: "ditinjau", catatan: "Ditinjau." }, AKTOR));
  cek("tindaklanjutiKoreksi ditinjau audit-gagal: status koreksi dipulihkan", (await a3.getKoreksi({ id: "kor-1" })).status === "baru", "");

  // Cabang tolak.
  const { stub: s4, adapter: a4 } = buatStub();
  benihArtikel(s4);
  benihKoreksi(s4);
  s4.gagalAudit = true;
  await harapkanGalatAudit("tindaklanjutiKoreksi tolak audit-gagal", () => tindaklanjutiKoreksi(a4, { koreksi_id: "kor-1", aksi: "tolak", catatan: "Ditolak." }, AKTOR));
  cek("tindaklanjutiKoreksi tolak audit-gagal: status koreksi dipulihkan", (await a4.getKoreksi({ id: "kor-1" })).status === "baru", "");
}

// ---------- 11. aturPeranPengguna ----------
{
  const { stub, adapter } = buatStub();
  stub.pengguna.set("user-1", { id: "user-1", email: "u@uji.id", email_tidak_tersedia: false, nama_tampilan: "U", nonaktif: false, roles: ["editor"], dibuat_pada: null });
  const hasil = await aturPeranPengguna(adapter, { user_id: "user-1", roles: ["admin"] }, AKTOR);
  cek("aturPeranPengguna sukses: peran berubah", hasil.roles[0] === "admin" && stub.pengguna.get("user-1").roles[0] === "admin", "");

  const { stub: s2, adapter: a2 } = buatStub();
  s2.pengguna.set("user-1", { id: "user-1", email: "u@uji.id", email_tidak_tersedia: false, nama_tampilan: "U", nonaktif: false, roles: ["editor"], dibuat_pada: null });
  s2.gagalAudit = true;
  await harapkanGalatAudit("aturPeranPengguna audit-gagal", () => aturPeranPengguna(a2, { user_id: "user-1", roles: ["admin"] }, AKTOR));
  cek("aturPeranPengguna audit-gagal: peran dipulihkan", s2.pengguna.get("user-1").roles[0] === "editor", `roles=${s2.pengguna.get("user-1").roles}`);
}

// ---------- 12. setNonaktifPengguna ----------
{
  const { stub, adapter } = buatStub();
  stub.pengguna.set("user-1", { id: "user-1", email: "u@uji.id", email_tidak_tersedia: false, nama_tampilan: "U", nonaktif: false, roles: ["editor"], dibuat_pada: null });
  await setNonaktifPengguna(adapter, { user_id: "user-1", nonaktif: true }, AKTOR);
  cek("setNonaktifPengguna sukses: nonaktif true", stub.pengguna.get("user-1").nonaktif === true, "");

  const { stub: s2, adapter: a2 } = buatStub();
  s2.pengguna.set("user-1", { id: "user-1", email: "u@uji.id", email_tidak_tersedia: false, nama_tampilan: "U", nonaktif: false, roles: ["editor"], dibuat_pada: null });
  s2.gagalAudit = true;
  await harapkanGalatAudit("setNonaktifPengguna audit-gagal", () => setNonaktifPengguna(a2, { user_id: "user-1", nonaktif: true }, AKTOR));
  cek("setNonaktifPengguna audit-gagal: nonaktif dipulihkan", s2.pengguna.get("user-1").nonaktif === false, "");
}

// ---------- 13. perbaruiJob ----------
{
  const { stub, adapter } = buatStub();
  stub.job.set("brief", { id: "job-1", nama: "brief", jadwal_cron: "0 6 * * *", deskripsi: null, aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null, diperbarui_pada: "2026-11-16T00:00:00.000Z" });
  await perbaruiJob(adapter, { nama: "brief", patch: { jadwal_cron: "0 7 * * *", aktif: false } }, AKTOR);
  cek("perbaruiJob sukses: cron + aktif berubah", stub.job.get("brief").jadwal_cron === "0 7 * * *" && stub.job.get("brief").aktif === false, "");

  const { stub: s2, adapter: a2 } = buatStub();
  s2.job.set("brief", { id: "job-1", nama: "brief", jadwal_cron: "0 6 * * *", deskripsi: null, aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null, diperbarui_pada: "2026-11-16T00:00:00.000Z" });
  s2.gagalAudit = true;
  await harapkanGalatAudit("perbaruiJob audit-gagal", () => perbaruiJob(a2, { nama: "brief", patch: { jadwal_cron: "0 7 * * *", aktif: false } }, AKTOR));
  cek("perbaruiJob audit-gagal: cron + aktif dipulihkan", s2.job.get("brief").jadwal_cron === "0 6 * * *" && s2.job.get("brief").aktif === true, `cron=${s2.job.get("brief").jadwal_cron}`);
}

// ---------- 14. buatKategori / 15. perbaruiKategori / 16. hapusKategori ----------
{
  const { stub, adapter } = buatStub();
  const kat = await buatKategori(adapter, { slug: "dunia", nama: "Dunia" }, AKTOR);
  cek("buatKategori sukses: kategori ada", stub.kategori.has(kat.slug === "dunia" ? [...stub.kategori.keys()][0] : ""), `slug=${kat.slug}`);

  const { stub: s2, adapter: a2 } = buatStub();
  s2.gagalAudit = true;
  await harapkanGalatAudit("buatKategori audit-gagal", () => buatKategori(a2, { slug: "dunia", nama: "Dunia" }, AKTOR));
  cek("buatKategori audit-gagal: kategori hapus-balik", s2.kategori.size === 0, `kategori=${s2.kategori.size}`);

  const { stub: s3, adapter: a3 } = buatStub();
  s3.kategori.set("kat-1", { id: "kat-1", slug: "dunia", nama: "Dunia", deskripsi: null, induk_id: null, urutan: 0, aktif: true, dibuat_pada: "2026-11-16T00:00:00.000Z" });
  await perbaruiKategori(a3, { id: "kat-1", patch: { nama: "Dunia Baru" } }, AKTOR);
  cek("perbaruiKategori sukses: nama berubah", s3.kategori.get("kat-1").nama === "Dunia Baru", "");

  const { stub: s4, adapter: a4 } = buatStub();
  s4.kategori.set("kat-1", { id: "kat-1", slug: "dunia", nama: "Dunia", deskripsi: null, induk_id: null, urutan: 0, aktif: true, dibuat_pada: "2026-11-16T00:00:00.000Z" });
  s4.gagalAudit = true;
  await harapkanGalatAudit("perbaruiKategori audit-gagal", () => perbaruiKategori(a4, { id: "kat-1", patch: { nama: "Dunia Baru" } }, AKTOR));
  cek("perbaruiKategori audit-gagal: nama dipulihkan", s4.kategori.get("kat-1").nama === "Dunia", `nama=${s4.kategori.get("kat-1").nama}`);

  const { stub: s5, adapter: a5 } = buatStub();
  s5.kategori.set("kat-1", { id: "kat-1", slug: "dunia", nama: "Dunia", deskripsi: null, induk_id: null, urutan: 0, aktif: true, dibuat_pada: "2026-11-16T00:00:00.000Z" });
  await hapusKategori(a5, "kat-1", AKTOR);
  cek("hapusKategori sukses: kategori hilang", s5.kategori.size === 0, "");

  const { stub: s6, adapter: a6 } = buatStub();
  s6.kategori.set("kat-1", { id: "kat-1", slug: "dunia", nama: "Dunia", deskripsi: null, induk_id: null, urutan: 0, aktif: true, dibuat_pada: "2026-11-16T00:00:00.000Z" });
  s6.gagalAudit = true;
  await harapkanGalatAudit("hapusKategori audit-gagal", () => hapusKategori(a6, "kat-1", AKTOR));
  const kembali = s6.kategori.get("kat-1");
  cek("hapusKategori audit-gagal: kategori kembali id asli", kembali !== undefined && kembali.id === "kat-1" && kembali.nama === "Dunia", kembali ? `id=${kembali.id}` : "hilang");
}

// ---------- 17. terbitkanBrief ----------
{
  const { stub, adapter } = buatStub();
  stub.brief.set("brief-1", { id: "brief-1", tanggal: "2026-11-16", isi: [], status: "draft", dibuat_pada: "2026-11-16T00:00:00.000Z", diterbitkan_pada: null });
  const terbit = await terbitkanBrief(adapter, "brief-1", AKTOR);
  cek("terbitkanBrief sukses: status terbit", terbit.status === "terbit", "");

  const { stub: s2, adapter: a2 } = buatStub();
  s2.brief.set("brief-1", { id: "brief-1", tanggal: "2026-11-16", isi: [], status: "draft", dibuat_pada: "2026-11-16T00:00:00.000Z", diterbitkan_pada: null });
  s2.gagalAudit = true;
  await harapkanGalatAudit("terbitkanBrief audit-gagal", () => terbitkanBrief(a2, "brief-1", AKTOR));
  const pulih = s2.brief.get("brief-1");
  cek("terbitkanBrief audit-gagal: brief kembali draft + diterbitkan_pada null", pulih.status === "draft" && pulih.diterbitkan_pada === null, `status=${pulih.status}`);
}

// ---------- Asersi statis (regex SAMA seperti baterai Tahap D §E) ----------
const TUJUH_BELAS = [
  "buatArtikel", "perbaruiArtikel", "hapusArtikel", "terbitkanArtikel",
  "batalkanPublikasi", "jadwalkanArtikel", "putuskanReview",
  "ubahStatusVerifikasi", "tindaklanjutiKoreksi", "aturPeranPengguna",
  "setNonaktifPengguna", "perbaruiJob", "buatKategori", "perbaruiKategori",
  "hapusKategori", "terbitkanBrief", "terbitkanTerjadwal",
];
{
  const tanpa = TUJUH_BELAS.filter((nama) => {
    const m = new RegExp(`export async function ${nama}\\([\\s\\S]*?\\n\\}`).exec(srcEditorial);
    return !m || !/compensat|pulih|hapus-balik|kembalikan/i.test(m[0]);
  });
  cek("statis: ke-17 fungsi mengandung penanda compensating (regex baterai D)", tanpa.length === 0, tanpa.length ? `tanpa penanda: ${tanpa.join(", ")}` : "17/17");
  const catatLangsung = [...srcEditorial.matchAll(/await catat\(/g)].length;
  cek("statis: semua situs audit tetap `await catat(` fail-closed (19 situs: 15 fungsi x1 + tindaklanjutiKoreksi x4)", catatLangsung === 19, `ditemukan ${catatLangsung}`);
  cek("statis: catatUpayaGate TIDAK disentuh (best-effort penanda backoff)", /Penanda backoff bersifat best-effort/.test(srcEditorial) && /async function catatUpayaGate[\s\S]*?catch \{\s*\/\/ Penanda backoff bersifat best-effort/.test(srcEditorial), "");
}

console.log(`\n${lolos} lolos, ${gagal} gagal (uji-followup1)`);
process.exit(gagal > 0 ? 1 : 0);
