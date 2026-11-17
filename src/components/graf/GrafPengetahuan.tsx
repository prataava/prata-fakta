// Graf Pengetahuan v1 — visualisasi SVG buatan tangan (P1-2),
// v2 (P2-1): simpul negara + kategori, sisi berlabel (arah bukti
// dari pf_evidence, "diliput dalam", "bagian dari cerita",
// "profil negara", "kategori artikel"), dan tautan dua arah —
// klik simpul entitas (sumber/negara/cerita/kategori) membuka
// halaman entitasnya di /graf/[jenis]/[id].
// Tanpa library grafik (aturan P1). Tata letak berlapis: satu kolom
// per jenis simpul; sisi digambar sebagai garis antar simpul.
// Klik simpul menyorot tetangganya (sisi + simpul tetangga tetap
// penuh, sisanya meredup) dan membuka panel detail (nama + jenis +
// tautan).
// Komponen klien: tanpa new Date() di render (aturan cacheComponents)
// — tanggal tidak dipakai di sini sama sekali.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  JENIS_SIMPUL,
  LABEL_JENIS_SIMPUL,
  hrefEntitasGraf,
  type JenisSimpul,
} from "@/lib/graf-meta";
import type {
  GrafPengetahuan,
  SimpulGraf,
} from "@/lib/graf";

const WARNA_JENIS: Record<JenisSimpul, string> = {
  artikel: "#68e4c1",
  klaim: "#77d8f0",
  sumber: "#a58bff",
  event: "#f0b877",
  cerita: "#f0779b",
  negara: "#4ade80",
  kategori: "#facc15",
};

const LEBAR = 920;
const TINGGI_BARIS = 54;
const PAD_ATAS = 30;
const PAD_BAWAH = 30;

function potongTeks(teks: string, maks = 26): string {
  return teks.length > maks ? `${teks.slice(0, maks - 1)}…` : teks;
}

export default function GrafPengetahuan({
  graf,
  /** Id simpul entitas yang sedang dibuka halamannya (mini-graf
   *  di /graf/[jenis]/[id]) — tautan "Lihat di graf" untuk simpul
   *  itu disembunyikan karena sudah berada di halamannya. */
  idEntitasAktif,
}: {
  graf: GrafPengetahuan;
  idEntitasAktif?: string | null;
}) {
  const [jenisAktif, setJenisAktif] = useState<Set<JenisSimpul>>(
    () => new Set(JENIS_SIMPUL),
  );
  const [terpilih, setTerpilih] = useState<string | null>(null);

  const jenisTampil = useMemo(
    () => JENIS_SIMPUL.filter((j) => jenisAktif.has(j)),
    [jenisAktif],
  );

  const simpulTampil = useMemo(
    () => graf.simpul.filter((s) => jenisAktif.has(s.jenis)),
    [graf.simpul, jenisAktif],
  );

  const posisi = useMemo(() => {
    const peta = new Map<string, { x: number; y: number }>();
    const lebarKolom = LEBAR / Math.max(1, jenisTampil.length);
    for (const [iKolom, jenis] of jenisTampil.entries()) {
      const kolom = simpulTampil.filter((s) => s.jenis === jenis);
      kolom.forEach((s, i) => {
        peta.set(s.id, {
          x: lebarKolom * (iKolom + 0.5),
          y: PAD_ATAS + i * TINGGI_BARIS + 10,
        });
      });
    }
    return peta;
  }, [simpulTampil, jenisTampil]);

  const tinggi = useMemo(() => {
    const maksKolom = Math.max(
      1,
      ...jenisTampil.map(
        (j) => simpulTampil.filter((s) => s.jenis === j).length,
      ),
    );
    return PAD_ATAS + maksKolom * TINGGI_BARIS + PAD_BAWAH;
  }, [simpulTampil, jenisTampil]);

  const sisiTampil = useMemo(
    () =>
      graf.sisi.filter((s) => posisi.has(s.dari) && posisi.has(s.ke)),
    [graf.sisi, posisi],
  );

  const tetangga = useMemo(() => {
    if (!terpilih) return null;
    const himpunan = new Set<string>([terpilih]);
    for (const s of sisiTampil) {
      if (s.dari === terpilih) himpunan.add(s.ke);
      if (s.ke === terpilih) himpunan.add(s.dari);
    }
    return himpunan;
  }, [terpilih, sisiTampil]);

  const simpulDipilih: SimpulGraf | null = terpilih
    ? (graf.simpul.find((s) => s.id === terpilih) ?? null)
    : null;

  const tetanggaDipilih = useMemo(() => {
    if (!simpulDipilih || !tetangga) return [];
    return graf.simpul.filter(
      (s) => s.id !== simpulDipilih.id && tetangga.has(s.id),
    );
  }, [simpulDipilih, tetangga, graf.simpul]);

  /** Label sisi antara simpul terpilih dan satu tetangga
   *  (arah bukti / jenis relasi) — null bila tidak ada sisi. */
  const relasiDengan = (tetanggaId: string): string | null => {
    if (!simpulDipilih) return null;
    const sisi = graf.sisi.find(
      (s) =>
        (s.dari === simpulDipilih.id && s.ke === tetanggaId) ||
        (s.dari === tetanggaId && s.ke === simpulDipilih.id),
    );
    return sisi ? sisi.label : null;
  };

  const hrefEntitasDipilih = simpulDipilih
    ? hrefEntitasGraf(simpulDipilih)
    : null;

  const alihkanJenis = (jenis: JenisSimpul) => {
    setJenisAktif((sebelum) => {
      const baru = new Set(sebelum);
      if (baru.has(jenis)) {
        // Jangan biarkan semua jenis mati — minimal satu tetap aktif.
        if (baru.size > 1) baru.delete(jenis);
      } else {
        baru.add(jenis);
      }
      return baru;
    });
    setTerpilih(null);
  };

  if (graf.simpul.length === 0) return null;

  return (
    <div>
      <div
        className="chip-baris"
        role="group"
        aria-label="Filter jenis simpul"
        style={{ marginBottom: 16 }}
      >
        {JENIS_SIMPUL.map((j) => {
          const jumlah = graf.simpul.filter((s) => s.jenis === j).length;
          return (
            <button
              key={j}
              type="button"
              className={`chip${jenisAktif.has(j) ? " aktif" : ""}`}
              aria-pressed={jenisAktif.has(j)}
              onClick={() => alihkanJenis(j)}
            >
              {LABEL_JENIS_SIMPUL[j]} ({jumlah})
            </button>
          );
        })}
      </div>

      <p className="kartu-meta" role="status">
        Menampilkan {simpulTampil.length} simpul dan {sisiTampil.length} sisi
        {graf.terpotong
          ? ` — graf dipotong pada batas ${graf.batas} simpul, jadi tidak semua simpul tampil`
          : ` — batas tampilan ${graf.batas} simpul`}
        . Klik simpul untuk menyorot tetangganya; arahkan kursor ke
        garis untuk melihat label relasinya. Simpul sumber, negara,
        cerita, dan kategori punya halaman entitas sendiri.
      </p>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${LEBAR} ${tinggi}`}
          width="100%"
          role="img"
          aria-label="Graf pengetahuan: simpul artikel, klaim, sumber, peristiwa, cerita, negara, dan kategori beserta relasinya"
          style={{ minWidth: 640, display: "block" }}
        >
          {jenisTampil.map((jenis, iKolom) => {
            const lebarKolom = LEBAR / jenisTampil.length;
            return (
              <text
                key={jenis}
                x={lebarKolom * (iKolom + 0.5)}
                y={18}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={12}
              >
                {LABEL_JENIS_SIMPUL[jenis]}
              </text>
            );
          })}
          {sisiTampil.map((s, i) => {
            const a = posisi.get(s.dari);
            const b = posisi.get(s.ke);
            if (!a || !b) return null;
            const aktif = !tetangga || tetangga.has(s.dari) && tetangga.has(s.ke);
            return (
              <line
                key={`${s.dari}->${s.ke}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={aktif ? "var(--ink-2)" : "var(--muted)"}
                strokeOpacity={aktif ? 0.7 : 0.25}
                strokeWidth={aktif ? 1.6 : 1}
              >
                <title>{s.label}</title>
              </line>
            );
          })}
          {simpulTampil.map((s) => {
            const p = posisi.get(s.id);
            if (!p) return null;
            const disorot = !tetangga || tetangga.has(s.id);
            const dipilih = terpilih === s.id;
            return (
              <g
                key={s.id}
                opacity={disorot ? 1 : 0.35}
                onClick={() => setTerpilih(dipilih ? null : s.id)}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-label={`${LABEL_JENIS_SIMPUL[s.jenis]}: ${s.label}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTerpilih(dipilih ? null : s.id);
                  }
                }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={dipilih ? 11 : 8}
                  fill={WARNA_JENIS[s.jenis]}
                  stroke={dipilih ? "var(--ink)" : "none"}
                  strokeWidth={dipilih ? 2 : 0}
                />
                <text
                  x={p.x}
                  y={p.y + 24}
                  textAnchor="middle"
                  fill="var(--ink)"
                  fontSize={11}
                >
                  {potongTeks(s.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {simpulDipilih && (
        <article className="kartu" aria-live="polite" style={{ marginTop: 16 }}>
          <span className="kartu-kategori">
            {LABEL_JENIS_SIMPUL[simpulDipilih.jenis]}
          </span>
          <span className="kartu-judul">{simpulDipilih.label}</span>
          {simpulDipilih.sublabel && (
            <span className="kartu-meta">{simpulDipilih.sublabel}</span>
          )}
          <span className="kartu-meta">
            {tetanggaDipilih.length === 0
              ? "Tidak ada tetangga yang tampil dalam graf ini."
              : `Terhubung dengan ${tetanggaDipilih.length} simpul:`}
          </span>
          {tetanggaDipilih.length > 0 && (
            <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              {tetanggaDipilih.map((t) => {
                const relasi = relasiDengan(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="tombol tombol-hantu"
                      onClick={() => setTerpilih(t.id)}
                    >
                      {LABEL_JENIS_SIMPUL[t.jenis]}: {potongTeks(t.label, 60)}
                      {relasi ? ` — ${relasi}` : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hrefEntitasDipilih && simpulDipilih.id !== idEntitasAktif && (
            <Link className="tombol tombol-hantu" href={hrefEntitasDipilih}>
              Lihat di graf
            </Link>
          )}
          {simpulDipilih.href &&
            (simpulDipilih.href.startsWith("/") ? (
              <Link className="tombol tombol-primer" href={simpulDipilih.href}>
                Buka {LABEL_JENIS_SIMPUL[simpulDipilih.jenis].toLowerCase()} ini
              </Link>
            ) : (
              <a
                className="tombol tombol-primer"
                href={simpulDipilih.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buka sumber
              </a>
            ))}
          <button
            type="button"
            className="tombol tombol-hantu"
            onClick={() => setTerpilih(null)}
          >
            Tutup detail
          </button>
        </article>
      )}
    </div>
  );
}
