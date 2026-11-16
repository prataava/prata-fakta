// Formulir artikel pengetahuan admin (F-S8) — dipindah dari
// src/app/admin/pengetahuan/page.tsx tanpa mengubah logika
// submit/validasi. Dipakai tambah artikel baru maupun ubah artikel
// (prop `artikel` terisi = mode ubah). Halaman me-remount komponen
// ini per artikel (key=editId) agar state awal selalu dari artikel
// yang dipilih.
"use client";

import { useState, type FormEvent as ReactFormEvent } from "react";

export type ReferensiPengetahuan = { judul: string | null; url: string | null };

export type ArtikelPengetahuanAdmin = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  isi: string | null;
  topik: string;
  referensi: ReferensiPengetahuan[];
  status: string;
  harian_tanggal: string | null;
  penulis_nama: string | null;
  jenis: string;
  tingkat: string;
  estimasi_baca_menit: number | null;
  seri_slug: string | null;
};

const TOPIK = [
  "sejarah",
  "geografi",
  "negara",
  "sains",
  "teknologi",
  "ekonomi",
  "alam",
  "tubuh",
  "umum",
] as const;

export const LABEL_TOPIK: Record<string, string> = {
  sejarah: "Sejarah",
  geografi: "Geografi",
  negara: "Negara",
  sains: "Sains",
  teknologi: "Teknologi",
  ekonomi: "Ekonomi",
  alam: "Alam",
  tubuh: "Tubuh Manusia",
  umum: "Umum",
};

function referensiKeTeks(referensi: ReferensiPengetahuan[]): string {
  return referensi
    .map((r) => (r.url ? `${r.judul ?? ""} | ${r.url}` : (r.judul ?? "")))
    .filter((s) => s.trim() !== "")
    .join("\n");
}

function teksKeReferensi(teks: string): ReferensiPengetahuan[] {
  const hasil: ReferensiPengetahuan[] = [];
  for (const baris of teks.split("\n")) {
    const s = baris.trim();
    if (!s) continue;
    const pisah = s.split("|");
    if (pisah.length >= 2) {
      hasil.push({
        judul: (pisah[0] ?? "").trim() || null,
        url: pisah.slice(1).join("|").trim() || null,
      });
    } else {
      hasil.push({ judul: s, url: null });
    }
  }
  return hasil;
}

type StatusForm = "idle" | "loading" | "error" | "sukses";

export default function FormPengetahuan({
  artikel,
  onSelesai,
  onBatal,
}: {
  artikel?: ArtikelPengetahuanAdmin | null;
  onSelesai: () => void;
  onBatal?: () => void;
}) {
  const editId = artikel?.id ?? null;
  const [judul, setJudul] = useState(artikel?.judul ?? "");
  const [slug, setSlug] = useState(artikel?.slug ?? "");
  const [topik, setTopik] = useState<string>(artikel?.topik ?? "umum");
  const [jenis, setJenis] = useState<string>(artikel?.jenis ?? "artikel");
  const [tingkat, setTingkat] = useState<string>(artikel?.tingkat ?? "pemula");
  const [estimasi, setEstimasi] = useState(
    artikel?.estimasi_baca_menit ? String(artikel.estimasi_baca_menit) : "",
  );
  const [seri, setSeri] = useState(artikel?.seri_slug ?? "");
  const [status, setStatus] = useState<string>(artikel?.status ?? "draft");
  const [ringkasan, setRingkasan] = useState(artikel?.ringkasan ?? "");
  const [isi, setIsi] = useState(artikel?.isi ?? "");
  const [referensiTeks, setReferensiTeks] = useState(
    referensiKeTeks(artikel?.referensi ?? []),
  );
  const [harian, setHarian] = useState(artikel?.harian_tanggal ?? "");
  const [penulis, setPenulis] = useState(artikel?.penulis_nama ?? "");
  const [statusForm, setStatusForm] = useState<StatusForm>("idle");
  const [pesanForm, setPesanForm] = useState("");

  async function kirim(e: ReactFormEvent) {
    e.preventDefault();
    setStatusForm("loading");
    setPesanForm("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      slug: slug.trim(),
      topik,
      jenis,
      tingkat,
      estimasi_baca_menit: estimasi.trim() === "" ? null : Number(estimasi),
      seri_slug: seri.trim() === "" ? null : seri.trim(),
      status,
      ringkasan: ringkasan.trim() === "" ? null : ringkasan.trim(),
      isi: isi.trim() === "" ? null : isi,
      referensi: teksKeReferensi(referensiTeks),
      harian_tanggal: harian.trim() === "" ? null : harian.trim(),
      penulis_nama: penulis.trim() === "" ? null : penulis.trim(),
    };
    try {
      const res = await fetch(
        editId ? `/api/admin/pengetahuan/${editId}` : "/api/admin/pengetahuan",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatusForm("error");
        setPesanForm(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatusForm("sukses");
      setPesanForm(
        editId ? "Artikel berhasil diubah." : "Artikel berhasil ditambah.",
      );
      onSelesai();
    } catch {
      setStatusForm("error");
      setPesanForm("Gagal menyimpan (jaringan).");
    }
  }

  return (
    <form className="formulir" onSubmit={kirim}>
      <label>
        Judul
        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          required
          maxLength={200}
        />
      </label>
      <label>
        Slug (huruf kecil, angka, tanda -)
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </label>
      <label>
        Topik
        <select
          value={topik}
          onChange={(e) => setTopik(e.target.value)}
        >
          {TOPIK.map((t) => (
            <option key={t} value={t}>
              {LABEL_TOPIK[t] ?? t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Jenis
        <select
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
        >
          <option value="artikel">Artikel</option>
          <option value="explainer">Explainer</option>
        </select>
      </label>
      <label>
        Tingkat kesulitan
        <select
          value={tingkat}
          onChange={(e) => setTingkat(e.target.value)}
        >
          <option value="pemula">Pemula</option>
          <option value="menengah">Menengah</option>
          <option value="mendalam">Mendalam</option>
        </select>
      </label>
      <label>
        Estimasi baca (menit, opsional)
        <input
          value={estimasi}
          onChange={(e) => setEstimasi(e.target.value)}
          type="number"
          min={1}
          max={120}
          inputMode="numeric"
        />
      </label>
      <label>
        Seri (slug seri, opsional — kelompokkan explainer se-topik)
        <input
          value={seri}
          onChange={(e) => setSeri(e.target.value)}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </label>
      <label>
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="terbit">Terbit</option>
        </select>
      </label>
      <label>
        Ringkasan
        <textarea
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
          rows={3}
        />
      </label>
      <label>
        Isi (paragraf dipisah baris kosong)
        <textarea
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          rows={10}
        />
      </label>
      <p className="artikel-meta-kecil">
        Konvensi explainer: paragraf diawali &ldquo;Mengapa
        penting&rdquo; menjadi seksi Mengapa penting; paragraf
        diawali tahun/tanggal (&ldquo;2024 — ...&rdquo;) menjadi
        Linimasa; referensi berjudul &ldquo;Istilah: kata —
        definisi&rdquo; menjadi Istilah kunci.
      </p>
      <label>
        Referensi (satu per baris: Judul | https://... — tanpa |
        berarti judul saja)
        <textarea
          value={referensiTeks}
          onChange={(e) => setReferensiTeks(e.target.value)}
          rows={4}
        />
      </label>
      <label>
        Fakta Hari Ini (tanggal, opsional)
        <input
          value={harian}
          onChange={(e) => setHarian(e.target.value)}
          type="date"
        />
      </label>
      <label>
        Penulis (opsional)
        <input
          value={penulis}
          onChange={(e) => setPenulis(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="tombol tombol-primer"
          type="submit"
          disabled={statusForm === "loading"}
        >
          {statusForm === "loading"
            ? "Menyimpan…"
            : editId
              ? "Simpan perubahan"
              : "Tambah artikel"}
        </button>
        {editId && onBatal && (
          <button className="tombol" type="button" onClick={onBatal}>
            Batal ubah
          </button>
        )}
      </div>
      {statusForm === "error" && (
        <p role="alert" className="pesan-error">
          {pesanForm}
        </p>
      )}
      {statusForm === "sukses" && (
        <p role="status" className="pesan-sukses">
          {pesanForm}
        </p>
      )}
    </form>
  );
}
