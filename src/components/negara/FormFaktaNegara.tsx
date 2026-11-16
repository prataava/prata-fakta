"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Formulir tambah fakta kunci untuk satu negara (staf).
// POST /api/admin/negara dengan body fakta (country_id + kunci
// + nilai). Kunci yang sama untuk negara yang sama akan
// memperbarui nilai lama (upsert). Nilai berupa angka wajib
// disertai sumber — API menolak 400 bila tidak.
export default function FormFaktaNegara({
  countryId,
  namaNegara,
}: {
  countryId: string;
  namaNegara: string;
}) {
  const [kunci, setKunci] = useState("");
  const [nilai, setNilai] = useState("");
  const [satuan, setSatuan] = useState("");
  const [sumber, setSumber] = useState("");
  const [periode, setPeriode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/admin/negara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country_id: countryId,
          kunci: kunci.trim(),
          nilai: nilai.trim(),
          satuan: satuan.trim() || null,
          sumber: sumber.trim() || null,
          periode: periode.trim() || null,
        }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan fakta (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan("Fakta berhasil ditambah.");
      setKunci("");
      setNilai("");
      setSatuan("");
      setSumber("");
      setPeriode("");
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
      <p className="kartu-meta">Tambah fakta untuk {namaNegara}.</p>
      <label>
        Kunci (contoh: jumlah_pulau, angka_literasi, konsumsi_listrik)
        <input
          type="text"
          required
          maxLength={120}
          value={kunci}
          onChange={(e) => setKunci(e.target.value)}
          placeholder="Contoh: jumlah_pulau"
        />
      </label>
      <label>
        Nilai
        <input
          type="text"
          required
          maxLength={500}
          value={nilai}
          onChange={(e) => setNilai(e.target.value)}
          placeholder="Isi sesuai sumber resmi"
        />
      </label>
      <label>
        Satuan
        <input
          type="text"
          maxLength={60}
          value={satuan}
          onChange={(e) => setSatuan(e.target.value)}
          placeholder="Contoh: pulau"
        />
      </label>
      <label>
        Sumber (wajib bila nilai berupa angka)
        <input
          type="text"
          maxLength={200}
          value={sumber}
          onChange={(e) => setSumber(e.target.value)}
          placeholder="Contoh: BPS"
        />
      </label>
      <label>
        Periode
        <input
          type="text"
          maxLength={120}
          value={periode}
          onChange={(e) => setPeriode(e.target.value)}
          placeholder="Contoh: 2024"
        />
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menyimpan…" : "Tambah fakta"}
      </button>
    </form>
  );
}
