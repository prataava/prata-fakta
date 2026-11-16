import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "AI Agent Logs — Admin",
  description: "Log run agen AI PRATA FAKTA dari pf_ai_runs.",
};

export const instant = false;

const AGEN = [
  "research",
  "source_analysis",
  "fact_verification",
  "summarization",
  "article_writing",
  "translation",
  "trend_analysis",
  "daily_brief",
  "data_analysis",
  "editorial_quality",
  "story_clustering",
  "podcast_script",
  "research_synthesis",
] as const;

type RunAi = {
  id: string;
  agen: string;
  input_ref: string | null;
  input_jenis: string;
  output_ref: string | null;
  status: string;
  error: string | null;
  durasi_ms: number | null;
  dipicu_oleh: string;
  dimulai_pada: string | null;
  selesai_pada: string | null;
};

export default async function AdminAgenAi() {
  let tersedia = true;
  let runs: RunAi[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_ai_runs")
      .select(
        "id,agen,input_ref,input_jenis,output_ref,status,error,durasi_ms,dipicu_oleh,dimulai_pada,selesai_pada",
      )
      .order("dimulai_pada", { ascending: false })
      .limit(500);
    if (error) {
      tersedia = false;
    } else {
      runs = (data ?? []) as RunAi[];
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Log agen AI belum tersedia"
          pesan="Tabel pf_ai_runs tidak dapat dibaca — migrasi Fase 4 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  const perAgen = AGEN.map((agen) => {
    const baris = runs.filter((r) => r.agen === agen);
    return {
      agen,
      total: baris.length,
      berhasil: baris.filter((r) => r.status === "berhasil").length,
      gagal: baris.filter((r) => r.status === "gagal").length,
      dilewati: baris.filter((r) => r.status === "dilewati").length,
      berjalan: baris.filter((r) => r.status === "berjalan").length,
      terakhir: baris.length > 0 ? baris[0].dimulai_pada : null,
    };
  }).filter((a) => a.total > 0);

  return (
    <>
      <section className="seksi" aria-labelledby="judul-peragen">
        <div className="seksi-kepala">
          <h2 id="judul-peragen">Run per Agen (500 run terakhir)</h2>
        </div>
        {perAgen.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada run agen AI tercatat — pipeline belum pernah berjalan.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Agen</th>
                  <th>Total</th>
                  <th>Berhasil</th>
                  <th>Gagal</th>
                  <th>Dilewati</th>
                  <th>Berjalan</th>
                  <th>Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {perAgen.map((a) => (
                  <tr key={a.agen}>
                    <td>{a.agen}</td>
                    <td>{a.total}</td>
                    <td>{a.berhasil}</td>
                    <td>{a.gagal}</td>
                    <td>{a.dilewati}</td>
                    <td>{a.berjalan}</td>
                    <td>{formatWaktu(a.terakhir)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="artikel-meta-kecil">
          Agen story_clustering, podcast_script, dan research_synthesis
          disiapkan CHECK-nya di migrasi v8 tetapi BELUM pernah berjalan —
          agen itu tidak muncul di tabel sampai ada run pertamanya.
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-run">
        <div className="seksi-kepala">
          <h2 id="judul-run">Run Terbaru</h2>
        </div>
        {runs.length === 0 ? (
          <p className="artikel-meta-kecil">Belum ada run agen AI.</p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Agen</th>
                  <th>Status</th>
                  <th>Durasi (ms)</th>
                  <th>Dipicu oleh</th>
                  <th>Error</th>
                  <th>Dimulai</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{r.agen}</td>
                    <td>{r.status}</td>
                    <td>{r.durasi_ms ?? "—"}</td>
                    <td>{r.dipicu_oleh}</td>
                    <td>{r.error ?? "—"}</td>
                    <td>{formatWaktu(r.dimulai_pada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
