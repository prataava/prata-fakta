import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Content Performance — Admin",
  description:
    "Artikel paling dibaca dari riwayat baca nyata (pf_reading_history).",
};

export const instant = false;

type BarisRiwayat = {
  artikel_id: string;
  user_id: string;
  durasi_detik: number | null;
  selesai: boolean;
  dibaca_pada: string | null;
};

export default async function AdminKinerja() {
  let tersedia = true;
  let totalBaca = 0;
  let totalSelesai = 0;
  let pembacaUnik = 0;
  let teratas: {
    artikel_id: string;
    judul: string;
    slug: string | null;
    dibaca: number;
    selesai: number;
  }[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_reading_history")
      .select("artikel_id,user_id,durasi_detik,selesai,dibaca_pada")
      .order("dibaca_pada", { ascending: false })
      .limit(5000);
    if (error) {
      tersedia = false;
    } else {
      const baris = (data ?? []) as BarisRiwayat[];
      totalBaca = baris.length;
      totalSelesai = baris.filter((b) => b.selesai).length;
      pembacaUnik = new Set(baris.map((b) => b.user_id)).size;
      const perArtikel = new Map<
        string,
        { dibaca: number; selesai: number }
      >();
      for (const b of baris) {
        const d = perArtikel.get(b.artikel_id) ?? { dibaca: 0, selesai: 0 };
        d.dibaca += 1;
        if (b.selesai) d.selesai += 1;
        perArtikel.set(b.artikel_id, d);
      }
      const ids = [...perArtikel.keys()].slice(0, 50);
      const petaJudul = new Map<string, { judul: string; slug: string }>();
      if (ids.length > 0) {
        const { data: artikel } = await supabase
          .from("pf_articles")
          .select("id,judul,slug")
          .in("id", ids);
        for (const a of (artikel ?? []) as {
          id: string;
          judul: string;
          slug: string;
        }[]) {
          petaJudul.set(a.id, { judul: a.judul, slug: a.slug });
        }
      }
      teratas = [...perArtikel.entries()]
        .map(([artikel_id, d]) => ({
          artikel_id,
          judul: petaJudul.get(artikel_id)?.judul ?? "Artikel tidak terbaca",
          slug: petaJudul.get(artikel_id)?.slug ?? null,
          dibaca: d.dibaca,
          selesai: d.selesai,
        }))
        .sort((a, b) => b.dibaca - a.dibaca)
        .slice(0, 20);
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Kinerja konten belum tersedia"
          pesan="Tabel pf_reading_history tidak dapat dibaca — migrasi Fase 2 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Ringkasan Baca</h2>
        </div>
        <p>
          Total {totalBaca} pembacaan tercatat (5.000 baris terbaru) ·{" "}
          {totalSelesai} selesai dibaca · {pembacaUnik} pembaca unik.
        </p>
        <p className="artikel-meta-kecil">
          Angka dihitung dari pf_reading_history nyata — bukan estimasi
          dan bukan data analitik pihak ketiga (tidak ada layanan
          analitik terpasang; lihat /admin/analitik).
        </p>
        {totalBaca === 0 && (
          <p className="artikel-meta-kecil">
            Belum ada riwayat baca tercatat.
          </p>
        )}
      </section>

      {teratas.length > 0 && (
        <section className="seksi" aria-labelledby="judul-teratas">
          <div className="seksi-kepala">
            <h2 id="judul-teratas">Artikel Paling Dibaca</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th>Dibaca</th>
                  <th>Selesai</th>
                </tr>
              </thead>
              <tbody>
                {teratas.map((a) => (
                  <tr key={a.artikel_id}>
                    <td>
                      {a.slug ? (
                        <Link href={`/artikel/${a.slug}`}>{a.judul}</Link>
                      ) : (
                        a.judul
                      )}
                    </td>
                    <td>{a.dibaca}</td>
                    <td>{a.selesai}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
