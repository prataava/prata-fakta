// Graf Pengetahuan v1 — visualisasi SVG buatan tangan (P1-2),
// v2 (P2-1): simpul negara + kategori, sisi berlabel (arah bukti
// dari pf_evidence, "diliput dalam", "bagian dari cerita",
// "profil negara", "kategori artikel"), dan tautan dua arah —
// klik simpul entitas (sumber/negara/cerita/kategori) membuka
// halaman entitasnya di /graf/[jenis]/[id].
// v3 (Fase 4 redesign): label TIDAK terpotong di tepi (posisi
// label di-clamp + anchor menyesuaikan), pil filter kategori
// KOSONG (jumlah 0) dinonaktifkan secara jujur, sisi digambar
// sebagai kurva, dan mode jelajah: pan (seret) / zoom (tombol
// + keyboard) + tur terpandu simpul demi simpul + navigasi
// keyboard (panah pindah simpul, Enter buka).
// Tanpa library grafik (aturan P1). Tata letak berlapis: satu kolom
// per jenis simpul; sisi digambar sebagai garis antar simpul.
// Klik simpul menyorot tetangganya (sisi + simpul tetangga tetap
// penuh, sisanya meredup) dan membuka panel detail (nama + jenis +
// tautan).
// Komponen klien: tanpa new Date() di render (aturan cacheComponents)
// — tanggal tidak dipakai di sini sama sekali.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import gaya from "./GrafPengetahuan.module.css";

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
const ZOOM_MIN = 0.6;
const ZOOM_MAKS = 2.5;

function potongTeks(teks: string, maks = 26): string {
  return teks.length > maks ? `${teks.slice(0, maks - 1)}…` : teks;
}

/** Posisi label simpul yang TIDAK terpotong di tepi graf:
 *  label tengah di-clamp; bila simpul terlalu dekat tepi kiri/
 *  kanan, anchor digeser (start/end) agar teks tetap di dalam
 *  viewBox. Lebar label diperkirakan 6,4px/karakter (font 11px). */
function labelTampil(
  simpul: SimpulGraf,
  p: { x: number; y: number },
): { x: number; anchor: "middle" | "start" | "end"; teks: string } {
  const teks = potongTeks(simpul.label);
  const lebar = Math.min(teks.length * 6.4 + 12, 230);
  const setengah = lebar / 2;
  if (p.x - setengah < 8) return { x: 8, anchor: "start", teks };
  if (p.x + setengah > LEBAR - 8)
    return { x: LEBAR - 8, anchor: "end", teks };
  return { x: p.x, anchor: "middle", teks };
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
  const router = useRouter();
  const [jenisAktif, setJenisAktif] = useState<Set<JenisSimpul>>(
    () => new Set(JENIS_SIMPUL),
  );
  const [terpilih, setTerpilih] = useState<string | null>(null);
  // Mode jelajah: kamera (pan/zoom) + tur terpandu.
  const [kamera, setKamera] = useState({ k: 1, x: 0, y: 0 });
  const [menyeret, setMenyeret] = useState(false);
  /** Indeks tur terpandu dalam simpulTampil; null = tur mati. */
  const [indeksTur, setIndeksTur] = useState<number | null>(null);
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Cermin kamera saat ini untuk pengukuran di dalam callback
  // (pola terbaruRef di SaranPencarian — bukan state baru).
  // Disinkronkan SESUDAH render (bukan saat render — aturan
  // react-hooks/refs).
  const kameraRef = useRef(kamera);
  useEffect(() => {
    kameraRef.current = kamera;
  });
  const seretRef = useRef<{
    x0: number;
    y0: number;
    kx: number;
    ky: number;
    bergerak: boolean;
  } | null>(null);
  const abaikanKlikRef = useRef(false);

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

  /** Batas pan: konten tidak boleh lepas jauh dari viewport.
   *  Skala SVG diukur dari rect SAAT INI (kameraRef) — bukan dari
   *  k baru yang dilewatkan, karena rect masih memakai transform
   *  lama saat fungsi ini dipanggil. */
  const batasi = useCallback(
    (k: number, x: number, y: number) => {
      const wadah = wadahRef.current;
      const svg = svgRef.current;
      if (!wadah || !svg) return { k, x, y };
      const skalaSvg =
        svg.getBoundingClientRect().width /
        Math.max(kameraRef.current.k, 0.01) /
        LEBAR;
      const kontenW = LEBAR * skalaSvg * k;
      const kontenH = tinggi * skalaSvg * k;
      const xMin = Math.min(40, wadah.clientWidth - kontenW - 40);
      const xMaks = Math.max(40, wadah.clientWidth - kontenW);
      const yMin = Math.min(40, wadah.clientHeight - kontenH - 40);
      const yMaks = 40;
      return {
        k,
        x: Math.min(xMaks, Math.max(xMin, x)),
        y: Math.min(yMaks, Math.max(yMin, y)),
      };
    },
    [tinggi],
  );

  /** Geser kamera agar simpul berada di tengah viewport. */
  const pusatkan = useCallback(
    (id: string) => {
      const p = posisi.get(id);
      const wadah = wadahRef.current;
      const svg = svgRef.current;
      if (!p || !wadah || !svg) return;
      const skalaSvg =
        svg.getBoundingClientRect().width /
        Math.max(kameraRef.current.k, 0.01) /
        LEBAR;
      const k = Math.max(kameraRef.current.k, 1.25);
      const skalaBaru = skalaSvg * (k / Math.max(kameraRef.current.k, 0.01));
      setKamera(
        batasi(
          k,
          wadah.clientWidth / 2 - p.x * skalaBaru,
          wadah.clientHeight / 2 - p.y * skalaBaru,
        ),
      );
    },
    [posisi, batasi],
  );

  /** Pilih simpul (klik / keyboard / tur) + pusatkan kamera. */
  const pilihSimpul = useCallback(
    (id: string | null) => {
      setTerpilih(id);
      if (id) pusatkan(id);
    },
    [pusatkan],
  );

  /** Pindah pilihan ke simpul sebelum/berikutnya (urutan tampil). */
  const pindahSimpul = useCallback(
    (delta: number) => {
      if (simpulTampil.length === 0) return;
      const idxSekarang = terpilih
        ? simpulTampil.findIndex((s) => s.id === terpilih)
        : -1;
      const idxBerikut =
        (idxSekarang + delta + simpulTampil.length) % simpulTampil.length;
      const target = simpulTampil[idxBerikut];
      if (!target) return;
      if (indeksTur !== null) setIndeksTur(idxBerikut);
      pilihSimpul(target.id);
    },
    [simpulTampil, terpilih, indeksTur, pilihSimpul],
  );

  /** Buka simpul terpilih (Enter): halaman entitas / tautan simpul. */
  const bukaTerpilih = useCallback(() => {
    if (!simpulDipilih) return;
    const href = hrefEntitasGraf(simpulDipilih) ?? simpulDipilih.href ?? null;
    if (!href) return;
    if (href.startsWith("/")) router.push(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  }, [simpulDipilih, router]);

  const zum = useCallback((faktor: number) => {
    setKamera((lama) => {
      const wadah = wadahRef.current;
      if (!wadah) return lama;
      const k = Math.min(ZOOM_MAKS, Math.max(ZOOM_MIN, lama.k * faktor));
      const cx = wadah.clientWidth / 2;
      const cy = wadah.clientHeight / 2;
      const rasio = k / lama.k;
      return {
        k,
        x: cx - rasio * (cx - lama.x),
        y: cy - rasio * (cy - lama.y),
      };
    });
  }, []);

  const mulaiTur = useCallback(() => {
    if (simpulTampil.length === 0) return;
    const pertama = simpulTampil[0];
    if (!pertama) return;
    setIndeksTur(0);
    pilihSimpul(pertama.id);
  }, [simpulTampil, pilihSimpul]);

  const turBerikutnya = useCallback(() => {
    if (indeksTur === null) return;
    const berikut = indeksTur + 1;
    if (berikut >= simpulTampil.length) {
      setIndeksTur(null);
      return;
    }
    const target = simpulTampil[berikut];
    if (!target) return;
    setIndeksTur(berikut);
    pilihSimpul(target.id);
  }, [indeksTur, simpulTampil, pilihSimpul]);

  const akhiriTur = useCallback(() => {
    setIndeksTur(null);
  }, []);

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
    setIndeksTur(null);
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
          const kosong = jumlah === 0;
          return (
            <button
              key={j}
              type="button"
              // Pil kosong TIDAK memakai "aktif" (merah) — tampil
              // redup abu-abu + nonaktif, dibedakan jujur dari pil
              // berisi (aktif = merah solid).
              className={`chip${!kosong && jenisAktif.has(j) ? " aktif" : ""}${kosong ? ` ${gaya.pilKosong}` : ""}`}
              aria-pressed={!kosong && jenisAktif.has(j)}
              disabled={kosong}
              title={
                kosong
                  ? `${LABEL_JENIS_SIMPUL[j]}: belum ada simpul jenis ini`
                  : undefined
              }
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
        {indeksTur !== null &&
          ` Tur terpandu: simpul ${indeksTur + 1} dari ${simpulTampil.length}.`}
      </p>

      <div
        className={gaya.alatJelajah}
        role="group"
        aria-label="Alat jelajah graf"
      >
        <button
          type="button"
          className={gaya.alat}
          onClick={() => zum(0.8)}
          aria-label="Perkecil graf"
        >
          −
        </button>
        <button
          type="button"
          className={gaya.alat}
          onClick={() => zum(1.25)}
          aria-label="Perbesar graf"
        >
          +
        </button>
        <button
          type="button"
          className={gaya.alat}
          onClick={() => setKamera({ k: 1, x: 0, y: 0 })}
        >
          Reset tampilan
        </button>
        {indeksTur === null ? (
          <button
            type="button"
            className={`${gaya.alat} ${gaya.alatPrimer}`}
            onClick={mulaiTur}
            disabled={simpulTampil.length === 0}
          >
            ▶ Mulai tur terpandu
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`${gaya.alat} ${gaya.alatPrimer}`}
              onClick={turBerikutnya}
            >
              Berikutnya →
            </button>
            <button type="button" className={gaya.alat} onClick={akhiriTur}>
              Akhiri tur
            </button>
          </>
        )}
      </div>

      <div
        ref={wadahRef}
        className={gaya.viewport}
        tabIndex={0}
        role="group"
        aria-label="Graf pengetahuan — seret untuk menggeser, tombol + dan − untuk zoom, panah untuk pindah simpul, Enter untuk membuka simpul terpilih"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          seretRef.current = {
            x0: e.clientX,
            y0: e.clientY,
            kx: kamera.x,
            ky: kamera.y,
            bergerak: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = seretRef.current;
          if (!s) return;
          const dx = e.clientX - s.x0;
          const dy = e.clientY - s.y0;
          if (!s.bergerak && Math.abs(dx) + Math.abs(dy) > 5) {
            s.bergerak = true;
            setMenyeret(true);
          }
          if (s.bergerak) {
            setKamera((lama) => batasi(lama.k, s.kx + dx, s.ky + dy));
          }
        }}
        onPointerUp={() => {
          if (seretRef.current?.bergerak) {
            abaikanKlikRef.current = true;
            window.setTimeout(() => {
              abaikanKlikRef.current = false;
            }, 0);
          }
          seretRef.current = null;
          setMenyeret(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            pindahSimpul(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            pindahSimpul(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            bukaTerpilih();
          } else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zum(1.25);
          } else if (e.key === "-") {
            e.preventDefault();
            zum(0.8);
          } else if (e.key === "Escape") {
            setTerpilih(null);
            akhiriTur();
          }
        }}
      >
        <div
          className={gaya.kamera}
          style={{
            transform: `translate(${kamera.x}px, ${kamera.y}px) scale(${kamera.k})`,
            transition: menyeret
              ? "none"
              : "transform var(--motion-dasar) var(--ease-standar)",
          }}
        >
          <svg
            ref={svgRef}
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
              const aktif =
                !tetangga || (tetangga.has(s.dari) && tetangga.has(s.ke));
              // Kurva lembut (bukan garis lurus) agar sisi yang
              // bersilangan lebih mudah diikuti mata.
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 - 14;
              return (
                <path
                  key={`${s.dari}->${s.ke}-${i}`}
                  d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={aktif ? "var(--ink-2)" : "var(--muted)"}
                  strokeOpacity={aktif ? 0.7 : 0.25}
                  strokeWidth={aktif ? 1.6 : 1}
                >
                  <title>{s.label}</title>
                </path>
              );
            })}
            {simpulTampil.map((s) => {
              const p = posisi.get(s.id);
              if (!p) return null;
              const disorot = !tetangga || tetangga.has(s.id);
              const dipilih = terpilih === s.id;
              const label = labelTampil(s, p);
              return (
                <g
                  key={s.id}
                  opacity={disorot ? 1 : 0.35}
                  onClick={() => {
                    if (abaikanKlikRef.current) return;
                    if (dipilih) {
                      setTerpilih(null);
                    } else {
                      pilihSimpul(s.id);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${LABEL_JENIS_SIMPUL[s.jenis]}: ${s.label}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (dipilih) setTerpilih(null);
                      else pilihSimpul(s.id);
                    }
                  }}
                >
                  <title>
                    {`${LABEL_JENIS_SIMPUL[s.jenis]}: ${s.label}${s.sublabel ? ` — ${s.sublabel}` : ""}`}
                  </title>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={dipilih ? 11 : 8}
                    fill={WARNA_JENIS[s.jenis]}
                    stroke={dipilih ? "var(--ink)" : "none"}
                    strokeWidth={dipilih ? 2 : 0}
                  />
                  <text
                    x={label.x}
                    y={p.y + 24}
                    textAnchor={label.anchor}
                    fill="var(--ink)"
                    fontSize={11}
                  >
                    {label.teks}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <p className={gaya.petunjuk}>
        Seret graf untuk menggeser · tombol +/− atau zoom · panah ← → ↑
        ↓ pindah simpul · Enter buka simpul terpilih · Esc tutup.
      </p>

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
                      onClick={() => pilihSimpul(t.id)}
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
          {indeksTur !== null && (
            <button
              type="button"
              className="tombol tombol-primer"
              onClick={turBerikutnya}
            >
              Berikutnya →
            </button>
          )}
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
