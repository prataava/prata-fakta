// Glosarium interaktif (client): pencarian + filter kategori + indeks
// A–Z. Semua penyaringan lokal atas props — tanpa fetch, tanpa
// data baru. Tombol reset benar-benar mengosongkan pencarian.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  tautanKbbi,
  type EntriGlosarium,
  type KategoriGlosarium,
} from "@/lib/glosarium-murni";

const KATEGORI: ("Semua" | KategoriGlosarium)[] = [
  "Semua",
  "Hukum & Pemerintahan",
  "Ekonomi",
  "Sosial & Budaya",
  "Pengetahuan",
];

const HURUF_AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function hurufEntri(istilah: string): string {
  const h = istilah.trim().charAt(0).toUpperCase();
  return h >= "A" && h <= "Z" ? h : "#";
}

export default function GlosariumInteraktif({
  entri,
}: {
  entri: EntriGlosarium[];
}) {
  const [kata, setKata] = useState("");
  const [kategori, setKategori] = useState<"Semua" | KategoriGlosarium>(
    "Semua",
  );

  const tersaring = useMemo(() => {
    const q = kata.toLowerCase().trim();
    return entri.filter((e) => {
      if (kategori !== "Semua" && e.kategori !== kategori) return false;
      if (!q) return true;
      return (
        e.istilah.toLowerCase().includes(q) ||
        (e.arti ?? "").toLowerCase().includes(q)
      );
    });
  }, [entri, kata, kategori]);

  const grup = useMemo(() => {
    const m = new Map<string, EntriGlosarium[]>();
    for (const e of tersaring) {
      const h = hurufEntri(e.istilah);
      const daftar = m.get(h);
      if (daftar) daftar.push(e);
      else m.set(h, [e]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "id-ID"));
  }, [tersaring]);

  const hurufAda = new Set(grup.map(([h]) => h));

  function reset(): void {
    setKata("");
    setKategori("Semua");
  }

  return (
    <div>
      <div className="seksi">
        <label htmlFor="cari-glosarium">Cari istilah</label>
        <input
          id="cari-glosarium"
          type="search"
          value={kata}
          onChange={(e) => setKata(e.target.value)}
          placeholder="Ketik istilah atau artinya, mis. amnesti"
          aria-label="Cari istilah glosarium"
        />
      </div>

      <div className="chip-baris" role="group" aria-label="Filter kategori">
        {KATEGORI.map((k) => (
          <button
            key={k}
            type="button"
            className={`chip${kategori === k ? " aktif" : ""}`}
            aria-pressed={kategori === k}
            onClick={() => setKategori(k)}
          >
            {k}
          </button>
        ))}
      </div>

      <p role="status">
        Menampilkan {tersaring.length} dari {entri.length} istilah
        {kata.trim() || kategori !== "Semua"
          ? ` (pencarian: “${kata.trim() || "—"}”, kategori: ${kategori})`
          : ""}
        .
      </p>

      {tersaring.length === 0 ? (
        <EmptyState
          judul="Tidak ada istilah yang cocok."
          pesan={
            entri.length === 0
              ? "Glosarium belum berisi istilah apa pun."
              : "Coba kata kunci lain atau ubah filter kategori."
          }
          aksi={
            <button type="button" className="tombol" onClick={reset}>
              Reset pencarian
            </button>
          }
        />
      ) : (
        <>
          <nav
            className="chip-baris"
            aria-label="Indeks huruf"
          >
            {HURUF_AZ.map((h) =>
              hurufAda.has(h) ? (
                <a key={h} className="chip" href={`#huruf-${h}`}>
                  {h}
                </a>
              ) : (
                <span
                  key={h}
                  className="chip"
                  aria-disabled="true"
                  style={{ opacity: 0.4 }}
                >
                  {h}
                </span>
              ),
            )}
          </nav>

          {grup.map(([huruf, daftar]) => (
            <section
              key={huruf}
              className="seksi"
              aria-labelledby={`huruf-${huruf}`}
            >
              <div className="seksi-kepala">
                <h2 id={`huruf-${huruf}`}>{huruf}</h2>
              </div>
              <div className="grid-berita">
                {daftar.map((e) => (
                  <article className="kartu" key={e.istilah}>
                    <span className="kartu-kategori">{e.kategori}</span>
                    <span className="kartu-judul">{e.istilah}</span>
                    {e.arti ? (
                      <span className="kartu-teks">{e.arti}</span>
                    ) : (
                      <span className="kartu-teks">
                        Definisi istilah ini ada di artikel sumber — buka
                        tautan artikel di bawah.
                      </span>
                    )}
                    {e.konteks && (
                      <span className="kartu-teks">
                        <em>Konteks: {e.konteks}</em>
                      </span>
                    )}
                    <span className="kartu-meta">
                      <a
                        href={tautanKbbi(e.istilah)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        KBBI ↗
                      </a>
                      {e.tautanPengetahuan.map((slug) => (
                        <span key={slug}>
                          {" · "}
                          <Link href={`/pengetahuan/${slug}`}>
                            Artikel sumber
                          </Link>
                        </span>
                      ))}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
