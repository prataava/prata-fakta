"use client";

// Pemilih wilayah bertingkat untuk prakiraan BMKG: provinsi →
// kabupaten/kota → kecamatan → desa. Daftar wilayah diambil dari
// API statis Emsifa (tanpa kunci) LEWAT proxy server /api/wilayah
// — fetch klien langsung ke emsifa.com diblokir CSP connect-src
// produksi (hanya 'self' + Supabase), jadi server yang mengambilnya
// (pekerja F, cabang fitur/izin-browser). Begitu desa dipilih,
// halaman dinavigasi ke ?adm4=<kode desa BMKG> agar server mengambil
// prakiraannya. Tanpa JS, prakiraan default (Gambir) tetap tampil.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mintaLokasi, pesanGagalLokasi } from "@/lib/geolokasi";

type Wilayah = { id: string; nama: string };

async function ambilWilayah(
  tingkat: string,
  indukId?: string,
): Promise<Wilayah[]> {
  // Proxy server /api/wilayah (bukan emsifa.com langsung — fetch
  // klien ke sana diblokir CSP connect-src produksi). Tingkat
  // "desa" di klien = "kelurahan" di API wilayah.
  const tingkatApi = tingkat === "desa" ? "kelurahan" : tingkat;
  const params = new URLSearchParams({ tingkat: tingkatApi });
  if (indukId) params.set("induk", indukId);
  const res = await fetch(`/api/wilayah?${params.toString()}`);
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

// ---- Pencocokan nama Emsifa ↔ Nominatim -----------------------
// Emsifa menulis "KABUPATEN BANDUNG" (huruf besar, berawalan),
// Nominatim menulis "Kabupaten Bandung" atau "Bandung" — keduanya
// dinormalisasi dulu: huruf kecil, buang tanda baca, buang awalan
// "kabupaten"/"kota"/"kecamatan"/"kelurahan"/"desa" dan singkatannya.
// Cocok persis didahulukan; cadangan: salah satu nama memuat yang
// lain ("jakarta" ⊂ "dki jakarta", "yogyakarta" ⊂ "di yogyakarta").
// Pencocokan TIDAK PERNAH menebak: bila tidak ada yang cocok,
// pemilih manual dibiarkan apa adanya.
function normalisasiNama(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(kabupaten|kota|kecamatan|kelurahan|desa|kab|kec|kel)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cariCocokan(
  nilai: (string | undefined)[],
  daftar: Wilayah[],
  abaikan: string[] = [],
): Wilayah | null {
  const abaikanNormal = abaikan.map(normalisasiNama);
  const target = nilai
    .map((n) => (n ? normalisasiNama(n) : ""))
    .filter((t) => t.length > 0 && !abaikanNormal.includes(t));
  if (target.length === 0) return null;
  for (const t of target) {
    const persis = daftar.find((w) => normalisasiNama(w.nama) === t);
    if (persis) return persis;
  }
  for (const t of target) {
    const kira = daftar.find((w) => {
      const n = normalisasiNama(w.nama);
      return n.length > 0 && (n.includes(t) || t.includes(n));
    });
    if (kira) return kira;
  }
  return null;
}

// ---- Peta kode ISO 3166-2:ID → nama provinsi (Emsifa) --------
// Nominatim reverse (zoom=10) untuk Jakarta (-6.2, 106.8)
// mengembalikan address TANPA `state` (hanya city "Jakarta Barat"
// + "ISO3166-2-lvl4": "ID-JK") — tanpa peta ini, gerbang provinsi
// selalu gagal ("tidak cocok") karena satu-satunya kandidat lama
// adalah address.state. Kode dipakai HANYA sebagai kandidat
// tambahan: pencocokan tetap persis/contains ke daftar Emsifa,
// jadi kode liar hanya gagal cocok (jujur), tidak pernah salah
// cocok ke provinsi lain. Diekspor agar baterai uji-izin-browser
// bisa memeriksa isinya tanpa mengekstrak teks.
export const PETA_PROVINSI_ISO3166_2: Readonly<Record<string, string>> = {
  "ID-AC": "ACEH",
  "ID-SU": "SUMATERA UTARA",
  "ID-SB": "SUMATERA BARAT",
  "ID-RI": "RIAU",
  "ID-KR": "KEPULAUAN RIAU",
  "ID-JA": "JAMBI",
  "ID-SS": "SUMATERA SELATAN",
  "ID-BB": "KEPULAUAN BANGKA BELITUNG",
  "ID-BE": "BENGKULU",
  "ID-LA": "LAMPUNG",
  "ID-BT": "BANTEN",
  "ID-JK": "DKI JAKARTA",
  "ID-JB": "JAWA BARAT",
  "ID-JT": "JAWA TENGAH",
  "ID-YO": "DI YOGYAKARTA",
  "ID-JI": "JAWA TIMUR",
  "ID-BA": "BALI",
  "ID-NB": "NUSA TENGGARA BARAT",
  "ID-NT": "NUSA TENGGARA TIMUR",
  "ID-KB": "KALIMANTAN BARAT",
  "ID-KT": "KALIMANTAN TENGAH",
  "ID-KS": "KALIMANTAN SELATAN",
  "ID-KI": "KALIMANTAN TIMUR",
  "ID-KU": "KALIMANTAN UTARA",
  "ID-SA": "SULAWESI UTARA",
  "ID-ST": "SULAWESI TENGAH",
  "ID-SN": "SULAWESI SELATAN",
  "ID-SG": "SULAWESI TENGGARA",
  "ID-GO": "GORONTALO",
  "ID-SR": "SULAWESI BARAT",
  "ID-MA": "MALUKU",
  "ID-MU": "MALUKU UTARA",
  "ID-PA": "PAPUA",
  "ID-PB": "PAPUA BARAT",
  "ID-PS": "PAPUA SELATAN",
  "ID-PT": "PAPUA TENGAH",
  "ID-PE": "PAPUA PEGUNUNGAN",
  "ID-PD": "PAPUA BARAT DAYA",
};

// Kandidat provinsi dari satu alamat Nominatim, berurutan:
// 1) address.state (jalur lama — bila ada, tetap didahulukan),
// 2) nama provinsi dari peta ISO 3166-2 (address["ISO3166-2-lvl4"]
//    atau address.state_code),
// 3) tiap bagian display_name yang dipisah koma, lalu varian tiap
//    bagian dengan kata depan dibuang satu demi satu ("Daerah
//    Khusus Ibukota Jakarta" → … → "Jakarta") — varian ekor hanya
//    dipakai bila tidak ada yang cocok persis atau contains dari
//    kandidat penuh (pencocokan mencoba persis dulu untuk SEMUA
//    kandidat, baru contains berurutan).
// Kata tunggal yang terlalu umum TIDAK dipakai sebagai kandidat
// sendirian: "Barat" akan cocok ke Jawa Barat padahal lokasi bisa
// di Kalimantan Barat; "Jawa" akan cocok ke Jawa Barat padahal
// bisa di Jawa Tengah. Aturan ini hanya berlaku untuk kandidat
// dari display_name — state/ISO dari Nominatim tidak disaring.
function kandidatProvinsi(alamat: AlamatNominatim): (string | undefined)[] {
  const kataTerlaluUmum = new Set([
    "barat",
    "timur",
    "tengah",
    "utara",
    "selatan",
    "jawa",
    "indonesia",
    "pulau",
  ]);
  const kodeIso = (alamat["ISO3166-2-lvl4"] ?? alamat.state_code ?? "")
    .trim()
    .toUpperCase();
  const dariIso = kodeIso ? PETA_PROVINSI_ISO3166_2[kodeIso] : undefined;
  const bagian = (alamat.display_name ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const ekor: string[] = [];
  for (const b of bagian) {
    const kata = b.split(/\s+/);
    for (let i = 1; i < kata.length; i += 1) {
      ekor.push(kata.slice(i).join(" "));
    }
  }
  const dariDisplay = [...bagian, ...ekor].filter(
    (k) => !kataTerlaluUmum.has(normalisasiNama(k)),
  );
  return [alamat.state, dariIso, ...dariDisplay];
}

// ---- Reverse geocode via proxy server /api/geocode/balik ----
// Server meneruskan koordinat ke Nominatim
// (https://nominatim.openstreetmap.org/reverse) dengan header
// User-Agent "PRATA-FAKTA/1.0" — fetch peramban TIDAK mengizinkan
// header User-Agent kustom, dan fetch klien langsung ke Nominatim
// diblokir CSP connect-src produksi. Koordinat dikirim SEKALI ke
// server kami, diteruskan ke Nominatim untuk diubah jadi nama
// wilayah, dan tidak disimpan.
type AlamatNominatim = {
  // display_name ada di tingkat atas respons Nominatim (bukan di
  // dalam address) — alamatDariKoordinat menggabungkannya ke sini
  // agar kandidat provinsi bisa memakai bagian-bagiannya.
  display_name?: string;
  state?: string;
  // Kode ISO 3166-2 tingkat provinsi; Nominatim menulisnya sebagai
  // "ISO3166-2-lvl4" (mis. "ID-JK" untuk Jakarta). state_code
  // didukung sebagai alias bila penyedia mengembalikannya.
  "ISO3166-2-lvl4"?: string;
  state_code?: string;
  county?: string;
  city?: string;
  town?: string;
  municipality?: string;
  city_district?: string;
  state_district?: string;
  village?: string;
  suburb?: string;
  hamlet?: string;
  neighbourhood?: string;
  quarter?: string;
};

async function alamatDariKoordinat(
  lintang: number,
  bujur: number,
): Promise<AlamatNominatim | null> {
  const res = await fetch(
    `/api/geocode/balik?lat=${lintang}&lon=${bujur}`,
  );
  if (!res.ok) return null;
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null) return null;
  const alamat = (data as Record<string, unknown>).address;
  if (typeof alamat !== "object" || alamat === null) return null;
  // display_name (tingkat atas respons) digabung ke alamat agar
  // kandidatProvinsi bisa memakai bagian-bagiannya.
  const tampil = (data as Record<string, unknown>).display_name;
  return {
    ...(alamat as AlamatNominatim),
    ...(typeof tampil === "string" ? { display_name: tampil } : {}),
  };
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
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);
  const [memuatLokasi, setMemuatLokasi] = useState(false);

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

  // "Cuaca di lokasiku": geolocation → reverse geocode lewat proxy
  // /api/geocode/balik → cocokkan nama wilayah dari atas ke bawah
  // (provinsi → kabupaten → kecamatan → desa) memakai ambilWilayah
  // yang sama dengan alur manual. Bila desa cocok, navigasi persis
  // seperti alur manual. Bila hanya cocok sebagian, select diisi
  // sampai tingkat yang cocok dan pengguna melanjutkan manual. Bila
  // tidak cocok sama sekali (atau izin gagal), pesan jujur +
  // pemilih manual tetap jalan. Alur manual tidak diubah.
  async function cuacaDiLokasiku() {
    if (memuatLokasi) return;
    setMemuatLokasi(true);
    setPesanLokasi(null);
    const hasil = await mintaLokasi();
    if (!hasil.ok) {
      setPesanLokasi(pesanGagalLokasi(hasil.alasan, "cuaca"));
      setMemuatLokasi(false);
      return;
    }
    let alamat: AlamatNominatim | null = null;
    try {
      alamat = await alamatDariKoordinat(hasil.lintang, hasil.bujur);
    } catch {
      alamat = null;
    }
    if (!alamat) {
      setPesanLokasi(
        "Alamat dari lokasi Anda tidak dapat dibaca saat ini — silakan pilih wilayah secara manual di bawah ini.",
      );
      setMemuatLokasi(false);
      return;
    }

    const daftarProv =
      provinsi.length > 0 ? provinsi : await ambilWilayah("provinsi");
    if (provinsi.length === 0) setProvinsi(daftarProv);
    // Gerbang provinsi: kandidat berurutan state → nama dari kode
    // ISO 3166-2 → bagian display_name (lihat kandidatProvinsi).
    // Address Nominatim sering tanpa `state` (mis. Jakarta hanya
    // punya city + "ISO3166-2-lvl4": "ID-JK") — kandidat tambahan
    // itulah yang membuat gerbang ini tahan terhadapnya.
    const prov = cariCocokan(kandidatProvinsi(alamat), daftarProv);
    if (!prov) {
      setPesanLokasi(
        "Lokasi Anda tidak cocok dengan daftar wilayah — silakan pilih wilayah secara manual di bawah ini.",
      );
      setMemuatLokasi(false);
      return;
    }
    const daftarKab = await ambilWilayah("kabupaten", prov.id);
    setIdProvinsi(prov.id);
    setKabupaten(daftarKab);
    setIdKabupaten("");
    setIdKecamatan("");
    setKecamatan([]);
    setDesa([]);
    const kab = cariCocokan(
      [alamat.county, alamat.city, alamat.town],
      daftarKab,
      [prov.nama],
    );
    if (!kab) {
      setPesanLokasi(
        `Ditemukan: ${prov.nama}. Pilih kabupaten/kota untuk melanjutkan.`,
      );
      setMemuatLokasi(false);
      return;
    }
    const daftarKec = await ambilWilayah("kecamatan", kab.id);
    setIdKabupaten(kab.id);
    setKecamatan(daftarKec);
    setIdKecamatan("");
    setDesa([]);
    const kec = cariCocokan(
      [
        alamat.city_district,
        alamat.state_district,
        alamat.suburb,
        alamat.town,
        alamat.municipality,
        alamat.city,
      ],
      daftarKec,
      [kab.nama],
    );
    if (!kec) {
      setPesanLokasi(
        `Ditemukan: ${kab.nama}, ${prov.nama}. Pilih kecamatan dan desa untuk melihat prakiraan.`,
      );
      setMemuatLokasi(false);
      return;
    }
    const daftarDesa = await ambilWilayah("desa", kec.id);
    setIdKecamatan(kec.id);
    setDesa(daftarDesa);
    const desaCocok = cariCocokan(
      [
        alamat.village,
        alamat.suburb,
        alamat.hamlet,
        alamat.neighbourhood,
        alamat.quarter,
      ],
      daftarDesa,
      [kec.nama, kab.nama],
    );
    if (!desaCocok) {
      setPesanLokasi(
        `Ditemukan: ${kec.nama}, ${kab.nama}. Pilih desa untuk melihat prakiraan.`,
      );
      setMemuatLokasi(false);
      return;
    }
    pilihDesa(desaCocok.id);
    setMemuatLokasi(false);
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          className="tombol"
          style={{ color: "var(--ink)" }}
          onClick={() => void cuacaDiLokasiku()}
          disabled={memuatLokasi}
        >
          {memuatLokasi ? "Mencari lokasi…" : "◎ Cuaca di lokasiku"}
        </button>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
          Lokasi hanya dipakai di perangkat ini untuk menemukan wilayah
          Anda — koordinat dikirim sekali ke server PRATA FAKTA yang
          meneruskannya ke Nominatim (OpenStreetMap) untuk diubah jadi
          nama wilayah, dan tidak disimpan di server kami.
        </p>
      </div>
      {pesanLokasi && (
        <p role="status" style={{ color: "var(--muted)", marginBottom: 12 }}>
          {pesanLokasi}
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
