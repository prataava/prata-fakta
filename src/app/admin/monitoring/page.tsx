import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Live News Monitoring — Admin",
  description:
    "Pantau ingestion terbaru dan antrean item mentah PRATA FAKTA.",
};

export const instant = false;

type RunIngestion = {
  id: string;
  sumber_nama: string | null;
  status: string;
  dimulai_pada: string | null;
  selesai_pada: string | null;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
  dipicu_oleh: string;
};

// Galat aplikasi dari tabel sendiri (Gelombang B2-D, D1):
// ditulis lib/analytics/galat.ts oleh responGalatAdmin + route
// baru; TIDAK PERNAH berisi isi pribadi pengguna.
type GalatAplikasi = {
  id: string;
  sumber: string;
  pesan: string;
  kode: string | null;
  rute: string | null;
  dibuat_pada: string;
};

async function hitung(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabel: string,
  kolom: string,
  nilai: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(tabel)
    .select("id", { count: "exact", head: true })
    .eq(kolom, nilai);
  if (error) return null;
  return count ?? 0;
}

export default async function AdminMonitoring() {
  let tersedia = true;
  let runs: RunIngestion[] = [];
  let antrean: Record<string, number> = {};
  let totalItem = 0;
  // Galat aplikasi: kegagalan membaca tabel v14 TIDAK menggagalkan
  // seluruh halaman (bagian ingestion tetap tampil).
  let galatTersedia = true;
  let galat: GalatAplikasi[] = [];
  try {
    const supabase = await createClient();
    const { data: dataRuns, error: errRuns } = await supabase
      .from("pf_ingestion_runs")
      .select(
        "id,sumber_nama,status,dimulai_pada,selesai_pada,ditemukan,baru,duplikat,ditolak,gagal,error,dipicu_oleh",
      )
      .order("dimulai_pada", { ascending: false })
      .limit(10);
    if (errRuns) {
      tersedia = false;
    } else {
      runs = (dataRuns ?? []) as RunIngestion[];
      const [baru, duplikat, ditolak, disalin, total] = await Promise.all([
        hitung(supabase, "pf_raw_items", "status", "baru"),
        hitung(supabase, "pf_raw_items", "status", "duplikat"),
        hitung(supabase, "pf_raw_items", "status", "ditolak"),
        hitung(supabase, "pf_raw_items", "status", "disalin_dari"),
        supabase
          .from("pf_raw_items")
          .select("id", { count: "exact", head: true })
          .then((r) => (r.error ? null : (r.count ?? 0))),
      ]);
      if (
        baru === null ||
        duplikat === null ||
        ditolak === null ||
        disalin === null ||
        total === null
      ) {
        tersedia = false;
      } else {
        antrean = { baru, duplikat, ditolak, disalin_dari: disalin };
        totalItem = total;
      }
    }
    // Galat aplikasi (v14) — dibaca terpisah agar ketiadaannya
    // tidak menutup monitoring ingestion.
    if (tersedia) {
      const { data: dataGalat, error: errGalat } = await supabase
        .from("pf_app_errors")
        .select("id,sumber,pesan,kode,rute,dibuat_pada")
        .order("dibuat_pada", { ascending: false })
        .limit(20);
      if (errGalat) {
        galatTersedia = false;
      } else {
        galat = (dataGalat ?? []) as GalatAplikasi[];
      }
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Monitoring belum tersedia"
          pesan="Tabel pf_ingestion_runs / pf_raw_items tidak dapat dibaca — migrasi Fase 3 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-antrean">
        <div className="seksi-kepala">
          <h2 id="judul-antrean">Antrean Item Mentah</h2>
        </div>
        <p>
          Total {totalItem} item mentah tercatat · Baru: {antrean.baru} ·{" "}
          Duplikat: {antrean.duplikat} · Ditolak: {antrean.ditolak} ·{" "}
          Disalin dari sumber lain: {antrean.disalin_dari}
        </p>
        {totalItem === 0 && (
          <p className="artikel-meta-kecil">
            Belum ada item mentah — ingestion belum pernah berjalan atau
            tabel masih kosong.
          </p>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-run">
        <div className="seksi-kepala">
          <h2 id="judul-run">Run Ingestion Terbaru</h2>
        </div>
        {runs.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada run ingestion tercatat.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Sumber</th>
                  <th>Status</th>
                  <th>Ditemukan</th>
                  <th>Baru</th>
                  <th>Duplikat</th>
                  <th>Ditolak</th>
                  <th>Gagal</th>
                  <th>Dimulai</th>
                  <th>Dipicu oleh</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sumber_nama ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>{r.ditemukan}</td>
                    <td>{r.baru}</td>
                    <td>{r.duplikat}</td>
                    <td>{r.ditolak}</td>
                    <td>{r.gagal}</td>
                    <td>{formatWaktu(r.dimulai_pada)}</td>
                    <td>{r.dipicu_oleh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs.some((r) => r.error) && (
          <ul className="artikel-daftar">
            {runs
              .filter((r) => r.error)
              .map((r) => (
                <li key={r.id}>
                  {r.sumber_nama ?? "Sumber tak dikenal"}: {r.error}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-galat">
        <div className="seksi-kepala">
          <h2 id="judul-galat">Galat Aplikasi (DB sendiri)</h2>
        </div>
        {!galatTersedia ? (
          <p className="artikel-meta-kecil">
            Log galat belum aktif — tabel pf_app_errors tidak dapat
            dibaca (migrasi v14 belum dijalankan). Galat admin saat ini
            hanya tercatat di log server (console), bukan di database.
          </p>
        ) : galat.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada galat aplikasi tercatat di database.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Sumber</th>
                  <th>Pesan</th>
                  <th>Kode</th>
                  <th>Rute</th>
                </tr>
              </thead>
              <tbody>
                {galat.map((g) => (
                  <tr key={g.id}>
                    <td>{formatWaktu(g.dibuat_pada)}</td>
                    <td>{g.sumber}</td>
                    <td>{g.pesan}</td>
                    <td>{g.kode ?? "—"}</td>
                    <td>{g.rute ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="artikel-meta-kecil">
          20 galat terbaru. Baris lebih tua dari 90 hari dihapus
          (retensi v14). Log ini tidak pernah berisi isi pribadi
          pengguna.
        </p>
      </section>
    </>
  );
}
