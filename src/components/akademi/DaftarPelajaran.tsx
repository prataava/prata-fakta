"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PfKuisSoalPublik } from "@/lib/lanjutan";
import type {
  PfKursusDetail,
  PfPelajaran,
  PfProgresPelajaran,
  RiwayatNilaiSoal,
} from "@/lib/akademi";
import PembahasanKuis from "@/components/akademi/PembahasanKuis";

// Daftar modul → pelajaran satu kursus (client). Menandai selesai
// lewat POST /api/akademi/progres (login saja); kuis pelajaran
// dimainkan lewat PembahasanKuis dan skornya DIHITUNG SERVER dari
// jawaban tersimpan — klien tidak pernah mengirim skor (B2-B,
// L-B1/I-4). Progres tampil dari angka nyata pf_course_progress,
// bukan dari state lokal semata. Riwayat nilai per soal (H6)
// tampil dari pf_quiz_user_answers.
export default function DaftarPelajaran({
  detail,
  progresAwal,
  soalKuis,
  riwayatKuis,
  masuk,
}: {
  detail: PfKursusDetail;
  progresAwal: Record<string, PfProgresPelajaran>;
  soalKuis: Record<string, PfKuisSoalPublik[]>;
  riwayatKuis: Record<string, RiwayatNilaiSoal[]>;
  masuk: boolean;
}) {
  const [progres, setProgres] =
    useState<Record<string, PfProgresPelajaran>>(progresAwal);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");

  const semuaPelajaran: PfPelajaran[] = useMemo(
    () => detail.modul.flatMap((m) => m.pelajaran),
    [detail],
  );
  const total = semuaPelajaran.length;
  const selesaiCount = useMemo(
    () =>
      semuaPelajaran.filter((p) => progres[p.id]?.selesai === true)
        .length,
    [semuaPelajaran, progres],
  );
  const persen = total > 0 ? Math.round((selesaiCount / total) * 100) : 0;

  async function tandaiSelesai(lessonId: string): Promise<boolean> {
    if (!masuk) {
      setPesan("Masuk terlebih dahulu untuk menyimpan progres belajar.");
      return false;
    }
    setMenyimpan(lessonId);
    setPesan("");
    try {
      const res = await fetch("/api/akademi/progres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lessonId,
          selesai: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        progres?: PfProgresPelajaran;
      };
      if (!res.ok || !data.ok || !data.progres) {
        setPesan(data.error ?? "Progres gagal disimpan. Coba lagi.");
        return false;
      }
      setProgres((lama) => ({ ...lama, [lessonId]: data.progres! }));
      return true;
    } catch {
      setPesan("Progres gagal disimpan (jaringan). Coba lagi.");
      return false;
    } finally {
      setMenyimpan(null);
    }
  }

  function labelJenis(p: PfPelajaran): string {
    if (p.jenis === "artikel") return "Artikel";
    if (p.jenis === "kuis") return "Kuis";
    return "Materi";
  }

  return (
    <div>
      <section className="seksi" aria-labelledby="judul-progres">
        <div className="seksi-kepala">
          <h2 id="judul-progres">Progres belajar Anda</h2>
          <p>
            {total === 0
              ? "Kursus ini belum memiliki pelajaran."
              : `${selesaiCount} dari ${total} pelajaran selesai (${persen}%).`}
          </p>
        </div>
        {total > 0 && (
          <div
            role="progressbar"
            aria-valuenow={persen}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progres belajar"
            style={{
              height: 12,
              borderRadius: 6,
              background: "var(--surface-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${persen}%`,
                height: "100%",
                background: "var(--accent)",
              }}
            />
          </div>
        )}
        {!masuk && total > 0 && (
          <p style={{ marginTop: 12 }}>
            <Link href="/masuk">Masuk</Link> untuk menyimpan progres
            belajar Anda — tanpa masuk, pelajaran tetap bisa dibaca
            tetapi progres tidak tersimpan.
          </p>
        )}
        {pesan && (
          <p role="status" style={{ marginTop: 12 }}>
            {pesan}
          </p>
        )}
      </section>

      {detail.modul.length === 0 ? (
        <p role="status">
          Kursus ini belum memiliki modul. Redaksi sedang menyusun
          materinya.
        </p>
      ) : (
        detail.modul.map(({ modul, pelajaran }) => (
          <section
            className="seksi"
            key={modul.id}
            aria-labelledby={`modul-${modul.id}`}
          >
            <div className="seksi-kepala">
              <h2 id={`modul-${modul.id}`}>{modul.judul}</h2>
              {modul.deskripsi && <p>{modul.deskripsi}</p>}
            </div>
            {pelajaran.length === 0 ? (
              <p>Modul ini belum memiliki pelajaran.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {pelajaran.map((p) => {
                  const sudah = progres[p.id]?.selesai === true;
                  const skor = progres[p.id]?.skor ?? null;
                  const dibuka = terbuka === p.id;
                  const soal = soalKuis[p.id] ?? [];
                  return (
                    <article className="kartu" key={p.id}>
                      <span className="kartu-kategori">
                        {labelJenis(p)}
                        {sudah ? " · Selesai ✓" : ""}
                      </span>
                      <span className="kartu-judul">{p.judul}</span>
                      {sudah && skor !== null && p.jenis === "kuis" && (
                        <span className="kartu-meta">
                          Skor kuis Anda (dihitung server dari jawaban
                          tersimpan): {skor} benar
                          {(() => {
                            const dinilai = (
                              riwayatKuis[p.id] ?? []
                            ).filter((r) => r.benar !== null).length;
                            return dinilai > 0
                              ? ` dari ${dinilai} soal yang dinilai`
                              : "";
                          })()}
                        </span>
                      )}
                      {p.jenis === "kuis" &&
                        (riwayatKuis[p.id] ?? []).length > 0 && (
                          <span className="kartu-meta">
                            Riwayat nilai per soal:{" "}
                            {soal.length > 0
                              ? soal.map((s, i) => {
                                  const r = (riwayatKuis[p.id] ?? []).find(
                                    (x) => x.soal_id === s.id,
                                  );
                                  const label =
                                    !r || r.benar === null
                                      ? "menunggu penilaian"
                                      : r.benar
                                        ? "benar ✓"
                                        : "salah ✗";
                                  return `Soal ${i + 1}: ${label}`;
                                }).join(" · ")
                              : (riwayatKuis[p.id] ?? [])
                                  .map((r, i) => {
                                    const label =
                                      r.benar === null
                                        ? "menunggu penilaian"
                                        : r.benar
                                          ? "benar ✓"
                                          : "salah ✗";
                                    return `Soal ${i + 1}: ${label}`;
                                  })
                                  .join(" · ")}
                          </span>
                        )}
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 12,
                        }}
                      >
                        <button
                          className="tombol"
                          type="button"
                          onClick={() =>
                            setTerbuka(dibuka ? null : p.id)
                          }
                          aria-expanded={dibuka}
                        >
                          {dibuka ? "Tutup pelajaran" : "Buka pelajaran"}
                        </button>
                        {!sudah && p.jenis !== "kuis" && (
                          <button
                            className="tombol tombol-primer"
                            type="button"
                            disabled={menyimpan === p.id}
                            onClick={() => void tandaiSelesai(p.id)}
                          >
                            {menyimpan === p.id
                              ? "Menyimpan…"
                              : "Tandai selesai"}
                          </button>
                        )}
                      </div>
                      {dibuka && (
                        <div style={{ marginTop: 16 }}>
                          {p.jenis === "artikel" && (
                            <p>
                              {p.artikel_slug && p.artikel_judul ? (
                                <>
                                  Pelajaran ini merujuk artikel:{" "}
                                  <Link href={`/artikel/${p.artikel_slug}`}>
                                    {p.artikel_judul}
                                  </Link>
                                </>
                              ) : (
                                "Artikel rujukan pelajaran ini belum tersedia atau belum terbit."
                              )}
                            </p>
                          )}
                          {p.isi && (
                            <div className="prosa">
                              {p.isi.split(/\n{2,}/).map((par, i) => (
                                <p key={i}>{par}</p>
                              ))}
                            </div>
                          )}
                          {p.jenis === "kuis" &&
                            (soal.length === 0 ? (
                              <p role="status">
                                Soal kuis untuk pelajaran ini belum
                                tersedia. Redaksi belum menyiapkan
                                pertanyaan kuis untuk tanggal{" "}
                                {p.kuis_tanggal ?? "pelajaran ini"}.
                              </p>
                            ) : (
                              <PembahasanKuis
                                lessonId={p.id}
                                soal={soal}
                                masuk={masuk}
                                onSelesai={(benar, totalDinilai) => {
                                  void tandaiSelesai(p.id).then(
                                    (ok) => {
                                      if (ok) {
                                        setPesan(
                                          `Kuis selesai: ${benar} dari ${totalDinilai} soal yang dinilai benar. Progres tersimpan.`,
                                        );
                                      }
                                    },
                                  );
                                }}
                              />
                            ))}
                          {p.referensi.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <h3>Referensi belajar</h3>
                              <ul>
                                {p.referensi.map((r, i) => (
                                  <li key={`${r.url ?? r.judul ?? i}-${i}`}>
                                    {r.url ? (
                                      <a
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {r.judul ?? r.url}
                                      </a>
                                    ) : (
                                      (r.judul ?? "Referensi")
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
