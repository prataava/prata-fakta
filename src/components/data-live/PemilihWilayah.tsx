"use client";

// Pemilih wilayah bertingkat untuk prakiraan BMKG: provinsi →
// kabupaten/kota → kecamatan → desa. Daftar wilayah diambil dari
// API statis Emsifa (tanpa kunci). Begitu desa dipilih, halaman
// dinavigasi ke ?adm4=<kode desa BMKG> agar server mengambil
// prakiraannya. Tanpa JS, prakiraan default (Gambir) tetap tampil.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Wilayah = { id: string; nama: string };

async function ambilWilayah(
  tingkat: string,
  indukId?: string,
): Promise<Wilayah[]> {
  let url: string;
  if (tingkat === "provinsi") {
    url = "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json";
  } else if (tingkat === "kabupaten") {
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${indukId}.json`;
  } else if (tingkat === "kecamatan") {
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/districts/${indukId}.json`;
  } else {
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/villages/${indukId}.json`;
  }
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  const daftar: Wilayah[] = [];
  for (const r of data as unknown[]) {
    if (typeof r === "object" && r !== null) {
      const o = r as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        daftar.push({ id: o.id, nama: o.name });
      }
    }
  }
  return daftar;
}

function desaKeAdm4(idDesa: string): string | null {
  if (!/^\d{10}$/.test(idDesa)) return null;
  return `${idDesa.slice(0, 2)}.${idDesa.slice(2, 4)}.${idDesa.slice(4, 6)}.${idDesa.slice(6, 10)}`;
}

export default function PemilihWilayah() {
  const router = useRouter();
  const [provinsi, setProvinsi] = useState<Wilayah[]>([]);
  const [kabupaten, setKabupaten] = useState<Wilayah[]>([]);
  const [kecamatan, setKecamatan] = useState<Wilayah[]>([]);
  const [desa, setDesa] = useState<Wilayah[]>([]);
  const [idProvinsi, setIdProvinsi] = useState("");
  const [idKabupaten, setIdKabupaten] = useState("");
  const [idKecamatan, setIdKecamatan] = useState("");
  const [galat, setGalat] = useState(false);

  useEffect(() => {
    let batal = false;
    ambilWilayah("provinsi")
      .then((d) => {
        if (!batal) setProvinsi(d);
      })
      .catch(() => {
        if (!batal) setGalat(true);
      });
    return () => {
      batal = true;
    };
  }, []);

  async function pilihProvinsi(id: string) {
    setIdProvinsi(id);
    setIdKabupaten("");
    setIdKecamatan("");
    setKabupaten([]);
    setKecamatan([]);
    setDesa([]);
    if (!id) return;
    try {
      setKabupaten(await ambilWilayah("kabupaten", id));
    } catch {
      setGalat(true);
    }
  }

  async function pilihKabupaten(id: string) {
    setIdKabupaten(id);
    setIdKecamatan("");
    setKecamatan([]);
    setDesa([]);
    if (!id) return;
    try {
      setKecamatan(await ambilWilayah("kecamatan", id));
    } catch {
      setGalat(true);
    }
  }

  async function pilihKecamatan(id: string) {
    setIdKecamatan(id);
    setDesa([]);
    if (!id) return;
    try {
      setDesa(await ambilWilayah("desa", id));
    } catch {
      setGalat(true);
    }
  }

  function pilihDesa(id: string) {
    const adm4 = desaKeAdm4(id);
    if (adm4) router.push(`/data/live/cuaca?adm4=${adm4}`);
  }

  return (
    <div className="kartu-form" style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>Pilih wilayah</h2>
      <p style={{ color: "var(--muted)", marginBottom: 12 }}>
        Pilih sampai tingkat desa untuk melihat prakiraan BMKG di sana.
      </p>
      {galat && (
        <p role="alert" style={{ color: "var(--danger)" }}>
          Daftar wilayah tidak dapat dimuat saat ini.
        </p>
      )}
      <div className="formulir">
        <label htmlFor="pilih-provinsi">
          Provinsi
          <select
            id="pilih-provinsi"
            value={idProvinsi}
            onChange={(e) => void pilihProvinsi(e.target.value)}
          >
            <option value="">— Pilih provinsi —</option>
            {provinsi.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="pilih-kabupaten">
          Kabupaten / Kota
          <select
            id="pilih-kabupaten"
            value={idKabupaten}
            disabled={kabupaten.length === 0}
            onChange={(e) => void pilihKabupaten(e.target.value)}
          >
            <option value="">— Pilih kabupaten/kota —</option>
            {kabupaten.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="pilih-kecamatan">
          Kecamatan
          <select
            id="pilih-kecamatan"
            value={idKecamatan}
            disabled={kecamatan.length === 0}
            onChange={(e) => void pilihKecamatan(e.target.value)}
          >
            <option value="">— Pilih kecamatan —</option>
            {kecamatan.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="pilih-desa">
          Desa / Kelurahan
          <select
            id="pilih-desa"
            disabled={desa.length === 0}
            defaultValue=""
            onChange={(e) => pilihDesa(e.target.value)}
          >
            <option value="">— Pilih desa/kelurahan —</option>
            {desa.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
