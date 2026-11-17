// Arsip Q&A terjawab PUBLIK — komponen klien (Fase 8 Gelombang 2,
// Area 6). Memuat /api/tanya/arsip (hanya publik=true + status
// terjawab) + tombol "membantu" per pertanyaan (POST
// /api/tanya/[id]/membantu, tanpa login, satu vote per IP per
// hari). Empty state jujur bila arsip kosong / layanan belum siap.
// Dipisah dari page.tsx 17 Nov 2026 (perbaikan CSP $RT/$RV):
// page.tsx WAJIB komponen server agar bisa await connection() —
// halaman "use client" murni membuat boundary loading.tsx root
// selesai di shell prerender sehingga skrip definisi $RV/$RC React
// terpanggang TANPA nonce → CSP memblokir → hidrasi gagal (#419)
// → isi ganda (h1=2).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";

type Referensi = { judul: string | null; url: string | null };

type EntriArsip = {
  id: string;
  pertanyaan: string;
  jawaban: string | null;
  referensi: Referensi[];
  status: string;
  kategori: string | null;
  membantu: number;
  dibuat_pada: string | null;
  dijawab_pada: string | null;
};

function formatTanggal(waktu: string | null): string {
  if (!waktu) return "—";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function ArsipTanyaClient() {
  const [arsip, setArsip] = useState<EntriArsip[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [vote, setVote] = useState<Record<string, string>>({});

  useEffect(() => {
    let batal = false;
    fetch("/api/tanya/arsip")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          arsip?: EntriArsip[];
          error?: string;
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setGalat(data.error ?? "Arsip belum bisa dimuat.");
          setArsip([]);
          return;
        }
        setArsip(data.arsip ?? []);
      })
      .catch(() => {
        if (!batal) {
          setGalat("Arsip belum bisa dimuat. Periksa koneksi lalu coba lagi.");
          setArsip([]);
        }
      });
    return () => {
      batal = true;
    };
  }, []);

  async function tandaiMembantu(id: string) {
    setVote((v) => ({ ...v, [id]: "Mengirim…" }));
    try {
      const res = await fetch(`/api/tanya/${id}/membantu`, { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        membantu?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setVote((v) => ({ ...v, [id]: data.error ?? "Gagal menyimpan vote." }));
        return;
      }
      setArsip((lama) =>
        (lama ?? []).map((e) =>
          e.id === id ? { ...e, membantu: data.membantu ?? e.membantu + 1 } : e,
        ),
      );
      setVote((v) => ({ ...v, [id]: "Terima kasih — vote Anda tersimpan." }));
    } catch {
      setVote((v) => ({ ...v, [id]: "Gagal menyimpan vote. Coba lagi." }));
    }
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-arsip-tanya">
        <span className="hero-label">Arsip Tanya</span>
        <h1 id="judul-arsip-tanya">Arsip Tanya Jawab</h1>
        <p>
          Pertanyaan yang sudah dijawab dan ditandai publik oleh redaksi —
          beserta jawaban dan referensinya. Pertanyaan yang belum
          ditandai publik tidak tampil di sini.
        </p>
        <p>
          <Link className="tombol tombol-primer" href="/tanya">
            Ajukan pertanyaan
          </Link>
        </p>
      </section>

      {arsip === null ? (
        <section className="seksi">
          <p role="status">Memuat arsip…</p>
        </section>
      ) : arsip.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Arsip masih kosong."
            pesan={
              galat ??
              "Belum ada pertanyaan terjawab yang ditandai publik oleh redaksi. Ajukan pertanyaan Anda di halaman Tanya — bila dijawab dan ditandai publik, pertanyaan itu akan tampil di sini."
            }
            aksi={
              <Link className="tombol tombol-primer" href="/tanya">
                Ke halaman Tanya
              </Link>
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-labelledby="seksi-arsip">
          <div className="seksi-kepala">
            <h2 id="seksi-arsip">Pertanyaan terjawab</h2>
            <p>{arsip.length} pertanyaan di arsip.</p>
          </div>
          <div className="grid-berita">
            {arsip.map((e) => (
              <article className="kartu" key={e.id}>
                <span className="kartu-kategori">
                  Terjawab{e.kategori ? ` · ${e.kategori}` : ""}
                </span>
                <span className="kartu-judul">{e.pertanyaan}</span>
                {e.jawaban && <span className="kartu-teks">{e.jawaban}</span>}
                {e.referensi.length > 0 && (
                  <span className="kartu-teks">
                    Referensi:{" "}
                    {e.referensi.map((r, i) => (
                      <span key={`${r.url ?? r.judul ?? i}-${i}`}>
                        {i > 0 ? " · " : ""}
                        {r.url ? <a href={r.url}>{r.judul ?? r.url}</a> : (r.judul ?? "Referensi")}
                      </span>
                    ))}
                  </span>
                )}
                <span className="kartu-meta">{formatTanggal(e.dijawab_pada ?? e.dibuat_pada)}</span>
                <span className="kartu-meta">
                  {e.membantu} orang menandai membantu
                </span>
                <button
                  type="button"
                  className="tombol"
                  onClick={() => tandaiMembantu(e.id)}
                  disabled={!!vote[e.id]?.startsWith("Terima kasih")}
                >
                  👍 Membantu
                </button>
                {vote[e.id] && (
                  <span className="kartu-meta" role="status">
                    {vote[e.id]}
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
