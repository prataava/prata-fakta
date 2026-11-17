// Bilah pencarian: form GET biasa ke /cari — berfungsi tanpa
// JavaScript. Dengan JavaScript, input ditempeli dropdown saran
// (SaranPencarian) dan setiap submit menyimpan kueri ke riwayat
// pencarian perangkat-lokal (localStorage 'pf-riwayat-cari').
// Dipakai 2x di beranda (header + hero), jadi id input/daftar
// dibuat unik per instance via useId — JANGAN ganti ke id statis.
"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SaranPencarian, {
  simpanRiwayatCari,
  type SaranCari,
} from "@/components/SaranPencarian";

export default function SearchBar({ nilaiAwal = "" }: { nilaiAwal?: string }) {
  const router = useRouter();
  const idUnik = useId();
  const idInput = `cari-q-${idUnik}`;
  const idDaftar = `saran-cari-${idUnik}`;
  const [nilai, setNilai] = useState(nilaiAwal);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pembungkusRef = useRef<HTMLDivElement | null>(null);

  // Submit form biasa (GET /cari): simpan kueri ke riwayat, lalu
  // biarkan submit native berjalan (tanpa preventDefault) agar
  // perilaku tanpa-JS tetap sama.
  function saatSubmit() {
    const q = inputRef.current?.value.trim() ?? "";
    if (q.length > 0) simpanRiwayatCari(q);
  }

  // Saran dipilih via keyboard (Enter): simpan ke riwayat lalu
  // navigasi SPA ke url saran (artikel / kategori / /cari?q=...).
  function pilihSaran(item: SaranCari) {
    simpanRiwayatCari(item.teks);
    if (item.url.startsWith("/")) {
      router.push(item.url);
    } else {
      window.location.assign(item.url);
    }
  }

  return (
    <form
      className="cari"
      action="/cari"
      method="get"
      role="search"
      onSubmit={saatSubmit}
    >
      <label htmlFor={idInput} className="sr-only">
        Cari berita, topik, atau sumber
      </label>
      <div className="saran-pembungkus" ref={pembungkusRef}>
        <input
          id={idInput}
          ref={inputRef}
          type="search"
          name="q"
          defaultValue={nilaiAwal}
          placeholder="Cari berita, topik, atau sumber…"
          autoComplete="off"
          role="combobox"
          aria-expanded="false"
          aria-controls={idDaftar}
          aria-autocomplete="list"
          onChange={(e) => setNilai(e.target.value)}
        />
        <SaranPencarian
          nilai={nilai}
          inputRef={inputRef}
          pembungkusRef={pembungkusRef}
          idDaftar={idDaftar}
          onPilih={pilihSaran}
        />
      </div>
      <button className="tombol tombol-primer" type="submit">
        Cari
      </button>
    </form>
  );
}
