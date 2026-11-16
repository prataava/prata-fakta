import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Verification Dashboard — Admin",
  description:
    "Agregat status verifikasi dan antrean review PRATA FAKTA.",
};

export const instant = false;

const KEPUTUSAN = [
  "VERIFIED",
  "CROSS-CHECKED",
  "DEVELOPING",
  "UNCONFIRMED",
  "DISPUTED",
  "CORRECTED",
] as const;

type ArtikelAntrean = {
  id: string;
  judul: string;
  slug: string;
  status: string;
  status_verifikasi: string;
  dibuat_pada: string | null;
};

type VerifikasiTerakhir = {
  id: string;
  artikel_id: string | null;
  agen: string;
  keputusan: string;
  catatan: string | null;
  dibuat_pada: string | null;
};

export default async function AdminVerifikasi() {
  let tersedia = true;
  let agregat: Record<string, number> = {};
  let totalCatatan = 0;
  let antrean: ArtikelAntrean[] = [];
  let terakhir: VerifikasiTerakhir[] = [];
  try {
    const supabase = await createClient();
    const hitungan = await Promise.all(
      KEPUTUSAN.map(async (k) => {
        const { count, error } = await supabase
          .from("pf_verification_records")
          .select("id", { count: "exact", head: true })
          .eq("keputusan", k);
        return { k, n: error ? null : (count ?? 0) };
      }),
    );
    if (hitungan.some((h) => h.n === null)) {
      tersedia = false;
    } else {
      agregat = Object.fromEntries(hitungan.map((h) => [h.k, h.n as number]));
      totalCatatan = hitungan.reduce((a, h) => a + (h.n as number), 0);
      const [antreanRes, terakhirRes] = await Promise.all([
        supabase
          .from("pf_articles")
          .select("id,judul,slug,status,status_verifikasi,dibuat_pada")
          .in("status_verifikasi", ["UNCONFIRMED", "DISPUTED"])
          .order("dibuat_pada", { ascending: false })
          .limit(20),
        supabase
          .from("pf_verification_records")
          .select("id,artikel_id,agen,keputusan,catatan,dibuat_pada")
          .order("dibuat_pada", { ascending: false })
          .limit(10),
      ]);
      if (antreanRes.error || terakhirRes.error) {
        tersedia = false;
      } else {
        antrean = (antreanRes.data ?? []) as ArtikelAntrean[];
        terakhir = (terakhirRes.data ?? []) as VerifikasiTerakhir[];
      }
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Dashboard verifikasi belum tersedia"
          pesan="Tabel pf_verification_records / pf_articles tidak dapat dibaca — migrasi Fase 4 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-agregat">
        <div className="seksi-kepala">
          <h2 id="judul-agregat">Agregat Status Verifikasi</h2>
        </div>
        <p>Total {totalCatatan} catatan verifikasi.</p>
        {totalCatatan === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada catatan verifikasi — pipeline editorial belum pernah
            mencatat keputusan.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Keputusan</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {KEPUTUSAN.map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{agregat[k] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-antrean">
        <div className="seksi-kepala">
          <h2 id="judul-antrean">Antrean Review</h2>
          <Link href="/admin/review">Buka antrean review</Link>
        </div>
        <p>
          {antrean.length} artikel berstatus UNCONFIRMED atau DISPUTED
          (20 terbaru).
        </p>
        {antrean.length === 0 ? (
          <p className="artikel-meta-kecil">
            Tidak ada artikel menunggu verifikasi.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Status artikel</th>
                  <th>Status verifikasi</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {antrean.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/admin/artikel/${a.id}`}>{a.judul}</Link>
                    </td>
                    <td>{a.status}</td>
                    <td>{a.status_verifikasi}</td>
                    <td>{formatWaktu(a.dibuat_pada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-terakhir">
        <div className="seksi-kepala">
          <h2 id="judul-terakhir">Catatan Verifikasi Terbaru</h2>
        </div>
        {terakhir.length === 0 ? (
          <p className="artikel-meta-kecil">Belum ada catatan verifikasi.</p>
        ) : (
          <ul className="artikel-daftar">
            {terakhir.map((v) => (
              <li key={v.id}>
                {v.keputusan} · agen {v.agen} · {formatWaktu(v.dibuat_pada)}
                {v.catatan ? ` — ${v.catatan}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
