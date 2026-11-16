import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";
import { periksaKesehatan } from "@/lib/kesehatan";

export const metadata: Metadata = {
  title: "API Health — Admin",
  description:
    "Status /api/health, run ingestion/AI terakhir, dan status secret (nama saja).",
};

export const instant = false;

// HANYA nama secret yang diperiksa — nilai tidak pernah dibaca,
// dicatat, atau ditampilkan di mana pun.
const SECRET = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PF_INGESTION_SECRET",
  "PF_AI_SECRET",
  "PF_SITE_URL",
] as const;

export default async function AdminApiSehat() {
  const kesehatan = await periksaKesehatan();
  let tersedia = true;
  type IngestionTerakhir = {
    sumber_nama: string | null;
    status: string;
    dimulai_pada: string | null;
    ditemukan: number;
    baru: number;
    gagal: number;
    error: string | null;
  };
  type AiTerakhir = {
    agen: string;
    status: string;
    error: string | null;
    dimulai_pada: string | null;
  };
  let ingestionTerakhir: IngestionTerakhir | null = null;
  let aiTerakhir: AiTerakhir | null = null;
  try {
    const supabase = await createClient();
    const [ing, ai] = await Promise.all([
      supabase
        .from("pf_ingestion_runs")
        .select("sumber_nama,status,dimulai_pada,ditemukan,baru,gagal,error")
        .order("dimulai_pada", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("pf_ai_runs")
        .select("agen,status,error,dimulai_pada")
        .order("dimulai_pada", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (ing.error || ai.error) {
      tersedia = false;
    } else {
      ingestionTerakhir = (ing.data ?? null) as IngestionTerakhir | null;
      aiTerakhir = (ai.data ?? null) as AiTerakhir | null;
    }
  } catch {
    tersedia = false;
  }

  const secret = SECRET.map((nama) => ({
    nama,
    terpasang: Boolean(process.env[nama]),
  }));

  return (
    <>
      <section className="seksi" aria-labelledby="judul-health">
        <div className="seksi-kepala">
          <h2 id="judul-health">Status /api/health</h2>
          <p>
            Sama dengan yang dilaporkan <a href="/api/health">/api/health</a>.
          </p>
        </div>
        <div className="tabel-gulir">
          <table className="tabel-data">
            <tbody>
              <tr>
                <th>Database</th>
                <td>
                  {kesehatan.db === "ok"
                    ? "Terhubung"
                    : kesehatan.db === "belum_tersedia"
                      ? "Belum tersedia (migrasi belum dijalankan)"
                      : kesehatan.db === "belum_dikonfigurasi"
                        ? "Belum dikonfigurasi"
                        : "Gagal"}
                </td>
              </tr>
              <tr>
                <th>Latensi</th>
                <td>{kesehatan.latensiMs} ms</td>
              </tr>
              <tr>
                <th>Diperiksa</th>
                <td>{formatWaktu(kesehatan.waktu)}</td>
              </tr>
              <tr>
                <th>Detail</th>
                <td>{kesehatan.detail}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="seksi" aria-labelledby="judul-run">
        <div className="seksi-kepala">
          <h2 id="judul-run">Run Terakhir</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Run terakhir belum tersedia"
            pesan="Tabel pf_ingestion_runs / pf_ai_runs tidak dapat dibaca — migrasi Fase 3/4 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          <>
            <p>
              Ingestion terakhir:{" "}
              {ingestionTerakhir
                ? `${ingestionTerakhir.sumber_nama ?? "sumber tak dikenal"} — ${ingestionTerakhir.status}, ditemukan ${ingestionTerakhir.ditemukan}, baru ${ingestionTerakhir.baru}, gagal ${ingestionTerakhir.gagal} (${formatWaktu(ingestionTerakhir.dimulai_pada)})`
                : "belum ada run ingestion tercatat."}
            </p>
            <p>
              Pipeline AI terakhir:{" "}
              {aiTerakhir
                ? `${aiTerakhir.agen} — ${aiTerakhir.status} (${formatWaktu(aiTerakhir.dimulai_pada)})`
                : "belum ada run pipeline AI tercatat."}
            </p>
          </>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-secret">
        <div className="seksi-kepala">
          <h2 id="judul-secret">Secret &amp; Environment</h2>
        </div>
        <p className="artikel-meta-kecil">
          Hanya status terpasang/tidak — NAMA secret saja, nilai tidak
          pernah dibaca atau ditampilkan. Isi secret di Vercel / GitHub
          Actions (butuh pemilik; lihat CUTOVER.md).
        </p>
        <div className="tabel-gulir">
          <table className="tabel-data">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {secret.map((s) => (
                <tr key={s.nama}>
                  <td>{s.nama}</td>
                  <td>{s.terpasang ? "Terpasang" : "Belum diatur"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
