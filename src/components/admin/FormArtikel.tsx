"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfCategoryRow } from "@/lib/data";
import type { ArtikelAdmin } from "@/lib/admin/data";

// Formulir buat / edit artikel. Mode ditentukan dari prop artikel:
// ada = edit (PATCH), tidak ada = buat (POST). Slug dibuat otomatis
// oleh API dari judul — tidak diisi manual di sini.
export default function FormArtikel({
  artikel,
  kategori,
}: {
  artikel?: ArtikelAdmin | null;
  kategori: PfCategoryRow[];
}) {
  const edit = Boolean(artikel);
  const [judul, setJudul] = useState(artikel?.judul ?? "");
  const [subjudul, setSubjudul] = useState(artikel?.subjudul ?? "");
  const [ringkasan, setRingkasan] = useState(artikel?.ringkasan ?? "");
  const [isi, setIsi] = useState(artikel?.isi ?? "");
  const [kategoriSlug, setKategoriSlug] = useState(
    artikel?.kategori_slug ?? kategori.find((k) => !k.induk_id)?.slug ?? "",
  );
  const [subkategoriSlug, setSubkategoriSlug] = useState(
    artikel?.subkategori_slug ?? "",
  );
  const [sumberUrl, setSumberUrl] = useState(artikel?.sumber_url ?? "");
  const [gambarUrl, setGambarUrl] = useState(artikel?.gambar_url ?? "");
  const [penulisNama, setPenulisNama] = useState(artikel?.penulis_nama ?? "");
  // Tahap C-5 (v15): isu artikel — pengikut topik tipe 'isu'
  // mendapat notifikasi saat artikel ini terbit.
  const [isu, setIsu] = useState(artikel?.isu ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  const kategoriUtama = kategori.filter((k) => !k.induk_id);
  const subkategori = kategori.filter(
    (k) => k.induk_id && kategoriUtama.some((u) => u.id === k.induk_id),
  );
  const subDariKategori = subkategori.filter((s) => {
    const induk = kategoriUtama.find((u) => u.slug === kategoriSlug);
    return induk ? s.induk_id === induk.id : false;
  });

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      subjudul: subjudul.trim() || undefined,
      ringkasan: ringkasan.trim(),
      isi: isi.trim(),
      kategori_slug: kategoriSlug,
      subkategori_slug: subkategoriSlug || undefined,
      sumber_url: sumberUrl.trim() || undefined,
      gambar_url: gambarUrl.trim() || undefined,
      penulis_nama: penulisNama.trim() || undefined,
      // Tahap C-5 (v15): isu artikel; string kosong berarti
      // tanpa isu (server menormalisasi ke null).
      isu: isu.trim() || undefined,
    };
    try {
      const res = await fetch(
        edit ? `/api/admin/artikel/${artikel?.id}` : "/api/admin/artikel",
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let data: {
        ok?: boolean;
        error?: string;
        artikel?: { id?: string };
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(edit ? "Artikel berhasil disimpan." : "Artikel berhasil dibuat.");
      router.refresh();
      if (!edit && data.artikel?.id) {
        router.push(`/admin/artikel/${data.artikel.id}`);
      }
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir form-lebar" onSubmit={kirim}>
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
        Judul
        <input
          type="text"
          required
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Judul artikel"
        />
      </label>
      <label>
        Subjudul (opsional)
        <input
          type="text"
          value={subjudul}
          onChange={(e) => setSubjudul(e.target.value)}
          placeholder="Subjudul singkat"
        />
      </label>
      <label>
        Ringkasan
        <textarea
          required
          rows={3}
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
          placeholder="Ringkasan 30–60 detik"
        />
      </label>
      <label>
        Isi artikel
        <textarea
          required
          rows={12}
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          placeholder="Isi lengkap. Pisahkan paragraf dengan baris kosong."
        />
      </label>
      <label>
        Kategori
        <select
          required
          value={kategoriSlug}
          onChange={(e) => {
            setKategoriSlug(e.target.value);
            setSubkategoriSlug("");
          }}
        >
          <option value="">Pilih kategori</option>
          {kategoriUtama.map((k) => (
            <option key={k.slug} value={k.slug}>
              {k.nama}
            </option>
          ))}
        </select>
      </label>
      {subDariKategori.length > 0 && (
        <label>
          Subkategori (opsional)
          <select
            value={subkategoriSlug}
            onChange={(e) => setSubkategoriSlug(e.target.value)}
          >
            <option value="">Tanpa subkategori</option>
            {subDariKategori.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.nama}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        URL sumber asli (opsional)
        <input
          type="url"
          value={sumberUrl}
          onChange={(e) => setSumberUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        URL gambar (opsional)
        <input
          type="url"
          value={gambarUrl}
          onChange={(e) => setGambarUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Nama penulis (opsional)
        <input
          type="text"
          value={penulisNama}
          onChange={(e) => setPenulisNama(e.target.value)}
          placeholder="Nama penulis — kosong berarti Redaksi"
        />
      </label>
      <label>
        Isu artikel (opsional)
        <input
          type="text"
          value={isu}
          onChange={(e) => setIsu(e.target.value)}
          maxLength={120}
          placeholder="Contoh: pemilu 2029"
        />
        <span>
          Pengikut topik isu ini mendapat notifikasi saat artikel
          terbit. Huruf, spasi, dan tanda hubung saja.
        </span>
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Buat artikel"}
      </button>
    </form>
  );
}
