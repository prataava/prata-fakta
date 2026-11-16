"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfNegara } from "@/lib/negara";

// Formulir tambah / ubah profil negara (staf).
// Memakai /api/admin/negara (POST tambah, PATCH ubah).
// Catatan di bawah kolom angka: angka HANYA tampil di publik
// bila sumber diisi (aturan angka-bersumber — API menolak 400
// bila angka diisi tanpa sumber).
export default function FormNegara({
  negara,
}: {
  negara?: PfNegara | null;
}) {
  const edit = Boolean(negara);
  const [kode, setKode] = useState(negara?.kode ?? "");
  const [nama, setNama] = useState(negara?.nama ?? "");
  const [ibuKota, setIbuKota] = useState(negara?.ibu_kota ?? "");
  const [populasi, setPopulasi] = useState(
    negara?.populasi !== null && negara?.populasi !== undefined
      ? String(negara.populasi)
      : "",
  );
  const [pdb, setPdb] = useState(
    negara?.pdb !== null && negara?.pdb !== undefined
      ? String(negara.pdb)
      : "",
  );
  const [sistem, setSistem] = useState(negara?.sistem_pemerintahan ?? "");
  const [luas, setLuas] = useState(
    negara?.luas_km2 !== null && negara?.luas_km2 !== undefined
      ? String(negara.luas_km2)
      : "",
  );
  const [bahasa, setBahasa] = useState(negara?.bahasa ?? "");
  const [mataUang, setMataUang] = useState(negara?.mata_uang ?? "");
  const [sumber, setSumber] = useState(negara?.sumber ?? "");
  const [periode, setPeriode] = useState(negara?.periode_referensi ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      kode: kode.trim().toUpperCase(),
      nama: nama.trim(),
      ibu_kota: ibuKota.trim() || null,
      populasi: populasi.trim() === "" ? null : Number(populasi),
      pdb: pdb.trim() === "" ? null : Number(pdb),
      sistem_pemerintahan: sistem.trim() || null,
      luas_km2: luas.trim() === "" ? null : Number(luas),
      bahasa: bahasa.trim() || null,
      mata_uang: mataUang.trim() || null,
      sumber: sumber.trim() || null,
      periode_referensi: periode.trim() || null,
    };
    try {
      const res = await fetch(
        edit ? `/api/admin/negara/${negara?.id}` : "/api/admin/negara",
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan negara (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(
        edit ? "Negara berhasil diubah." : "Negara berhasil ditambah.",
      );
      router.refresh();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {status === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {status === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Kode ISO-2 (contoh: ID)
        <input
          type="text"
          required
          maxLength={2}
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          placeholder="ID"
          disabled={edit}
        />
      </label>
      {edit && (
        <p className="kartu-meta">
          Kode tidak bisa diubah (dipakai sebagai rujukan artikel, event,
          dan indikator).
        </p>
      )}
      <label>
        Nama negara
        <input
          type="text"
          required
          maxLength={120}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Indonesia"
        />
      </label>
      <label>
        Ibu kota
        <input
          type="text"
          maxLength={120}
          value={ibuKota}
          onChange={(e) => setIbuKota(e.target.value)}
          placeholder="Contoh: Jakarta"
        />
      </label>
      <label>
        Populasi (jiwa)
        <input
          type="number"
          min={0}
          step={1}
          value={populasi}
          onChange={(e) => setPopulasi(e.target.value)}
          placeholder="Isi sesuai sumber resmi"
        />
      </label>
      <label>
        PDB (angka tercatat)
        <input
          type="number"
          min={0}
          step="any"
          value={pdb}
          onChange={(e) => setPdb(e.target.value)}
          placeholder="Sesuai sumber resmi"
        />
      </label>
      <label>
        Luas (km²)
        <input
          type="number"
          min={0}
          step="any"
          value={luas}
          onChange={(e) => setLuas(e.target.value)}
          placeholder="Isi sesuai sumber resmi"
        />
      </label>
      <label>
        Sistem pemerintahan
        <input
          type="text"
          maxLength={120}
          value={sistem}
          onChange={(e) => setSistem(e.target.value)}
          placeholder="Contoh: Republik presidensial"
        />
      </label>
      <label>
        Bahasa
        <input
          type="text"
          maxLength={200}
          value={bahasa}
          onChange={(e) => setBahasa(e.target.value)}
          placeholder="Contoh: Bahasa Indonesia"
        />
      </label>
      <label>
        Mata uang
        <input
          type="text"
          maxLength={120}
          value={mataUang}
          onChange={(e) => setMataUang(e.target.value)}
          placeholder="Contoh: Rupiah (IDR)"
        />
      </label>
      <label>
        Sumber angka (wajib bila populasi/PDB/luas diisi)
        <input
          type="text"
          maxLength={200}
          value={sumber}
          onChange={(e) => setSumber(e.target.value)}
          placeholder="Contoh: BPS — Sensus Penduduk"
        />
      </label>
      <label>
        Periode referensi
        <input
          type="text"
          maxLength={120}
          value={periode}
          onChange={(e) => setPeriode(e.target.value)}
          placeholder="Contoh: 2024"
        />
      </label>
      <p className="kartu-meta">
        Data awal hanya Indonesia dari sumber resmi (mis. BPS). Jangan
        mengarang angka: angka tanpa sumber tidak akan tampil di publik.
      </p>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah negara"}
      </button>
    </form>
  );
}
