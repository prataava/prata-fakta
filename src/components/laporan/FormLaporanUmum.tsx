// Formulir laporan TERPADU (F-S1) — satu sumber kebenaran untuk
// laporan koreksi artikel (POST /api/laporan) dan laporan
// masyarakat (POST /api/laporan-publik). Keduanya hanya berbeda
// endpoint, daftar jenis, nama field pesan, dan tampilan sukses
// (nomor lacak) — alur submit/loading/error-nya identik.
// Pembungkus tipis: components/artikel/FormLaporan.tsx (dialog
// koreksi artikel) dan components/laporan/FormLaporanPublik.tsx
// (formulir halaman /laporkan).
"use client";

import { useState } from "react";
import Link from "next/link";

export type OpsiJenisLaporan = { nilai: string; label: string };

export type FormLaporanUmumProps = {
  /** Endpoint POST, mis. "/api/laporan" atau "/api/laporan-publik". */
  endpoint: string;
  daftarJenis: readonly OpsiJenisLaporan[];
  /** Bila diisi, body menyertakan artikel_id (laporan koreksi). */
  artikelId?: string;
  /** Judul artikel yang dilaporkan — tampil di atas formulir. */
  judulArtikel?: string;
  /** Tampilkan field "Tautan artikel" (laporan masyarakat). */
  denganTautanArtikel?: boolean;
  /** Sukses menampilkan nomor lacak + tautan lacak (laporan masyarakat). */
  denganNomorLacak?: boolean;
  /** Nama field isi pesan di body: "pesan" (koreksi) / "deskripsi" (publik). */
  namaFieldPesan?: "pesan" | "deskripsi";
  /** Panjang minimum isi pesan (publik: 10 karakter). */
  minPesan?: number;
  labelJenis?: string;
  labelPesan?: string;
  placeholderPesan?: string;
  /** Lebar maksimum form (inline, menimpa .formulir 440px). */
  lebarMaks?: number | string;
  teksSukses?: string;
  /** Bila diisi, tampilkan tombol Tutup/Batal (mode dialog). */
  onTutup?: () => void;
};

export default function FormLaporanUmum({
  endpoint,
  daftarJenis,
  artikelId,
  judulArtikel,
  denganTautanArtikel = false,
  denganNomorLacak = false,
  namaFieldPesan = "pesan",
  minPesan = 1,
  labelJenis = "Jenis laporan",
  labelPesan = "Pesan laporan",
  placeholderPesan = "Jelaskan kesalahan yang Anda temukan dan, bila ada, fakta atau sumber yang benar…",
  lebarMaks = "100%",
  teksSukses = "Terima kasih — laporan Anda sudah diterima redaksi dan akan ditinjau.",
  onTutup,
}: FormLaporanUmumProps) {
  const [jenis, setJenis] = useState<string>(daftarJenis[0]?.nilai ?? "");
  const [tautan, setTautan] = useState("");
  const [pesan, setPesan] = useState("");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">(
    "idle",
  );
  const [pesanError, setPesanError] = useState("");
  const [nomorLacak, setNomorLacak] = useState("");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (pesan.trim().length < minPesan) {
      setStatus("error");
      setPesanError(
        minPesan > 1
          ? `Deskripsi laporan wajib diisi (minimal ${minPesan} karakter).`
          : "Pesan laporan wajib diisi.",
      );
      return;
    }
    setStatus("loading");
    setPesanError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(artikelId ? { artikel_id: artikelId } : {}),
          jenis,
          ...(denganTautanArtikel
            ? { tautan_artikel: tautan.trim() || undefined }
            : {}),
          [namaFieldPesan]: pesan.trim(),
          nama: nama.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        nomor_lacak?: string;
      };
      if (!res.ok || !data.ok || (denganNomorLacak && !data.nomor_lacak)) {
        setStatus("error");
        setPesanError(data.error ?? "Laporan gagal dikirim. Coba lagi.");
        return;
      }
      if (data.nomor_lacak) setNomorLacak(data.nomor_lacak);
      setStatus("sukses");
    } catch {
      setStatus("error");
      setPesanError("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  if (status === "sukses" && denganNomorLacak) {
    return (
      <div className="kartu-form">
        <p className="pesan-sukses" role="status">
          {teksSukses} Semua laporan wajib dimoderasi sebelum diproses.
        </p>
        <p>
          Nomor lacak laporan Anda:{" "}
          <strong>
            <Link href={`/laporkan/lacak?nomor=${encodeURIComponent(nomorLacak)}`}>
              {nomorLacak}
            </Link>
          </strong>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
          Simpan nomor ini untuk memeriksa status laporan Anda di halaman{" "}
          <Link href="/laporkan/lacak">Lacak Laporan</Link>.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Link className="tombol tombol-primer" href="/laporkan/lacak">
            Lacak status laporan
          </Link>
          <Link className="tombol" href="/">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  if (status === "sukses") {
    return (
      <>
        <p className="pesan-sukses">{teksSukses}</p>
        {onTutup && (
          <button type="button" className="tombol tombol-primer" onClick={onTutup}>
            Tutup
          </button>
        )}
      </>
    );
  }

  return (
    <form className="formulir" onSubmit={kirim} style={{ maxWidth: lebarMaks }}>
      {judulArtikel && (
        <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
          Artikel: <strong>{judulArtikel}</strong>
        </p>
      )}
      {status === "error" && pesanError && (
        <p className="pesan-error" role="alert">
          {pesanError}
        </p>
      )}
      <label>
        {labelJenis}
        <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {daftarJenis.map((j) => (
            <option key={j.nilai} value={j.nilai}>
              {j.label}
            </option>
          ))}
        </select>
      </label>
      {denganTautanArtikel && (
        <label>
          Tautan artikel (opsional)
          <input
            type="url"
            value={tautan}
            onChange={(e) => setTautan(e.target.value)}
            placeholder="https://prata-fakta.vercel.app/artikel/contoh-slug"
            maxLength={500}
          />
        </label>
      )}
      <label>
        {labelPesan} *
        <textarea
          value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          rows={5}
          placeholder={placeholderPesan}
          required
          minLength={minPesan}
          maxLength={2000}
        />
      </label>
      <label>
        Nama (opsional)
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama Anda — boleh dikosongkan"
          maxLength={120}
        />
      </label>
      <label>
        Email (opsional{!denganTautanArtikel ? "" : " — untuk kabar tindak lanjut"})
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@contoh.id — boleh dikosongkan"
          maxLength={254}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="submit"
          className="tombol tombol-primer"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Mengirim…" : "Kirim laporan"}
        </button>
        {onTutup ? (
          <button type="button" className="tombol" onClick={onTutup}>
            Batal
          </button>
        ) : (
          <Link className="tombol" href="/laporkan/lacak">
            Lacak laporan saya
          </Link>
        )}
      </div>
    </form>
  );
}
