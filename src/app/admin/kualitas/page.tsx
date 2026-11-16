import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Article Quality Control — Admin",
  description:
    "Hasil cek kualitas editorial deterministik (agen editorial_quality) atas draf artikel.",
};

export const instant = false;

type RunKualitas = {
  id: string;
  input_ref: string | null;
  status: string;
  error: string | null;
  detail: unknown;
  durasi_ms: number | null;
  dimulai_pada: string | null;
};

function bacaDetail(detail: unknown): {
  lolos: boolean | null;
  kegagalan: string[];
  siap_review: boolean | null;
} {
  if (!detail || typeof detail !== "object") {
    return { lolos: null, kegagalan: [], siap_review: null };
  }
  const d = detail as Record<string, unknown>;
  return {
    lolos: typeof d.lolos === "boolean" ? d.lolos : null,
    kegagalan: Array.isArray(d.kegagalan)
      ? (d.kegagalan as unknown[]).map((k) => String(k))
      : [],
    siap_review:
      typeof d.siap_review === "boolean" ? d.siap_review : null,
  };
}

export default async function AdminKualitas() {
  let tersedia = true;
  let runs: RunKualitas[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_ai_runs")
      .select("id,input_ref,status,error,detail,durasi_ms,dimulai_pada")
      .eq("agen", "editorial_quality")
      .order("dimulai_pada", { ascending: false })
      .limit(50);
    if (error) {
      tersedia = false;
    } else {
      runs = (data ?? []) as RunKualitas[];
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Quality control belum tersedia"
          pesan="Tabel pf_ai_runs tidak dapat dibaca — migrasi Fase 4 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  const terurai = runs.map((r) => ({ ...r, cek: bacaDetail(r.detail) }));
  const lolos = terurai.filter((r) => r.cek.lolos === true).length;
  const gagal = terurai.filter((r) => r.cek.lolos === false).length;

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Hasil Quality Check</h2>
        </div>
        <p className="artikel-meta-kecil">
          Tidak ada kolom kualitas di pf_articles — hasil cek kualitas
          hanya tersimpan sebagai run agen editorial_quality di
          pf_ai_runs (detail: lolos, kegagalan, siap_review). Cek ini
          deterministik (Fase 4, lib/ai/quality.ts): draf tetap tersimpan
          bila gagal, tapi tidak ditandai siap-review.
        </p>
        {runs.length === 0 ? (
          <EmptyState
            judul="Belum tersedia — belum ada hasil quality check"
            pesan="Belum ada satu pun run agen editorial_quality tercatat di pf_ai_runs. Pipeline editorial belum pernah menjalankan langkah quality check, atau tabel masih kosong."
          />
        ) : (
          <p>
            {runs.length} run quality check tercatat (50 terbaru) · Lolos:{" "}
            {lolos} · Tidak lolos: {gagal} · Tanpa hasil terbaca:{" "}
            {runs.length - lolos - gagal}
          </p>
        )}
      </section>

      {runs.length > 0 && (
        <section className="seksi" aria-labelledby="judul-daftar">
          <div className="seksi-kepala">
            <h2 id="judul-daftar">Run Quality Check Terbaru</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Artikel (input_ref)</th>
                  <th>Status run</th>
                  <th>Lolos</th>
                  <th>Siap review</th>
                  <th>Kegagalan</th>
                  <th>Dimulai</th>
                </tr>
              </thead>
              <tbody>
                {terurai.map((r) => (
                  <tr key={r.id}>
                    <td>{r.input_ref ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.cek.lolos === null
                        ? "—"
                        : r.cek.lolos
                          ? "Ya"
                          : "Tidak"}
                    </td>
                    <td>
                      {r.cek.siap_review === null
                        ? "—"
                        : r.cek.siap_review
                          ? "Ya"
                          : "Tidak"}
                    </td>
                    <td>
                      {r.cek.kegagalan.length > 0
                        ? r.cek.kegagalan.join("; ")
                        : (r.error ?? "—")}
                    </td>
                    <td>{formatWaktu(r.dimulai_pada)}</td>
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
