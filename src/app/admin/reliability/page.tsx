import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  getGalatTerbaru,
  getRingkasanOps,
  type RingkasanOps,
} from "@/lib/admin/data";
import { getAlertAktif } from "@/lib/admin/alerts";
import { formatWaktu } from "@/lib/admin/format";
import {
  INTERVAL_JOB_MENIT,
  nilaiKesehatanJob,
  ringkasWatchdog,
  type HasilKesehatanJob,
} from "@/lib/admin/reliability";

export const metadata: Metadata = {
  title: "Reliability Center — Admin",
  description:
    "PRATA Reliability Center: kesehatan job terjadwal dari bukti eksekusi aktual (terakhir jalan vs interval), galat terbaru, dan sumber bermasalah — bukan badge hijau dari keberadaan workflow.",
};

export const instant = false;

function labelInterval(menit: number | null): string {
  if (menit === null) return "Tanpa jadwal (manual)";
  if (menit < 60) return `Setiap ${menit} menit`;
  if (menit < 1440) return `Setiap ${menit / 60} jam`;
  if (menit < 10080) return "Setiap hari";
  if (menit < 43200) return "Setiap minggu";
  return "Setiap bulan";
}

type BarisKesehatan = HasilKesehatanJob & {
  label: string;
  jadwalTeks: string;
  terakhirJalan: string | null;
  statusDb: string;
};

// Penilaian kesehatan di luar badan komponen: aturan purity React
// melarang Date.now() di render — "sekarang" dibaca di fungsi
// module-level ini (pola yang sama seperti getRingkasanOps).
function nilaiSemuaJob(ops: RingkasanOps): BarisKesehatan[] {
  const sekarang = Date.now();
  const hasil: BarisKesehatan[] = [];
  // Job dikenal (label + jadwal dari DAFTAR_JOB_DIKENAL) + job
  // lain yang tercatat di DB tetapi tidak dikenal (backup,
  // tanya-jawab, retensi, ...).
  for (const j of ops.jobs) {
    const h = nilaiKesehatanJob(
      {
        nama: j.nama,
        tercatat: j.tercatat,
        aktif: j.aktif,
        terakhir_jalan: j.terakhir_jalan,
        status_terakhir: j.status_terakhir,
        error_terakhir: j.error_terakhir,
      },
      sekarang,
    );
    hasil.push({
      ...h,
      label: j.label,
      jadwalTeks: j.jadwal_workflow,
      terakhirJalan: j.terakhir_jalan,
      statusDb: j.status_terakhir,
    });
  }
  for (const j of ops.jobs_lain) {
    const h = nilaiKesehatanJob(
      {
        nama: j.nama,
        tercatat: true,
        aktif: j.aktif,
        terakhir_jalan: j.terakhir_jalan,
        status_terakhir: j.status_terakhir,
        error_terakhir: j.error_terakhir,
      },
      sekarang,
    );
    hasil.push({
      ...h,
      label: j.nama,
      jadwalTeks: labelInterval(INTERVAL_JOB_MENIT[j.nama] ?? null),
      terakhirJalan: j.terakhir_jalan,
      statusDb: j.status_terakhir,
    });
  }
  return hasil;
}

export default async function AdminReliability() {
  const [ops, galat, alert] = await Promise.all([
    getRingkasanOps(),
    getGalatTerbaru(),
    getAlertAktif(),
  ]);
  const hasil = nilaiSemuaJob(ops);
  const watchdog = ringkasWatchdog(hasil);

  const sumberBermasalah = ops.sumber.filter(
    (s) =>
      s.health_status === "gagal" ||
      s.health_status === "basi" ||
      s.run_gagal_terakhir > 0,
  );

  return (
    <>
      <p className="artikel-meta-kecil">
        Status di halaman ini dihitung dari bukti eksekusi aktual —
        terakhir jalan vs interval jadwal yang diharapkan, error
        terakhir, run per-sumber, dan galat aplikasi. Status
        &quot;berhasil&quot; di pf_scheduled_jobs TIDAK dipakai sebagai
        bukti sehat: run #31 (44197264506) tercatat &quot;berhasil&quot;
        di sana padahal workflow-nya Failure, karena panggilan
        terakhir yang berhasil menimpa kegagalan panggilan
        sebelumnya. Monitoring di sini polling berkala dari tabel —
        bukan monitoring per-detik.
      </p>

      {/* ============ A: Ringkasan watchdog ============ */}
      <section className="seksi" aria-labelledby="judul-watchdog">
        <div className="seksi-kepala">
          <h2 id="judul-watchdog">A. Watchdog — Ringkasan</h2>
        </div>
        <p>
          Sehat: {watchdog.sehat} · Terlambat: {watchdog.terlambat} ·
          Gagal: {watchdog.gagal} · Belum pernah:{" "}
          {watchdog.belum_pernah} · Tidak tercatat:{" "}
          {watchdog.tidak_tercatat} · Alert aktif: {alert.alerts.length}
        </p>
        {watchdog.masalah.length === 0 ? (
          <p>Semua job yang terpantau sehat menurut bukti terakhir.</p>
        ) : (
          <ul>
            {watchdog.masalah.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {alert.alerts.length > 0 && (
          <p className="artikel-meta-kecil">
            Alert aktif terbaru:{" "}
            {alert.alerts
              .slice(0, 3)
              .map((a) => `${a.kejadian} — ${a.judul}`)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* ============ B: Kesehatan per job ============ */}
      <section className="seksi" aria-labelledby="judul-job">
        <div className="seksi-kepala">
          <h2 id="judul-job">B. Kesehatan Job Terjadwal</h2>
        </div>
        {!ops.jobs_tersedia ? (
          <EmptyState
            judul="Status scheduler belum tersedia"
            pesan="Tabel pf_scheduled_jobs tidak dapat dibaca — migrasi Fase 5 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Jadwal</th>
                  <th>Terakhir jalan</th>
                  <th>Status DB</th>
                  <th>Kesehatan (dihitung)</th>
                  <th>Terlambat</th>
                  <th>Perkiraan berikut</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((h) => (
                  <tr key={h.nama}>
                    <td>{h.label}</td>
                    <td>{h.jadwalTeks}</td>
                    <td>{formatWaktu(h.terakhirJalan)}</td>
                    <td>{h.statusDb}</td>
                    <td>
                      <strong>{h.status}</strong>
                      <br />
                      <span className="artikel-meta-kecil">
                        {h.alasan}
                      </span>
                    </td>
                    <td>
                      {h.keterlambatan_menit === null
                        ? "—"
                        : `${h.keterlambatan_menit} mnt`}
                    </td>
                    <td>
                      {h.perkiraan_berikut
                        ? formatWaktu(h.perkiraan_berikut)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="artikel-meta-kecil">
          &quot;Terlambat&quot; = terakhir jalan lebih dari 2x interval
          yang diharapkan (ambang longgar karena scheduler GitHub
          terbukti telat berjam-jam). &quot;Perkiraan berikut&quot; =
          terakhir jalan + interval — perkiraan, bukan jadwal cron
          yang sebenarnya. Lihat juga <Link href="/admin/ops">Ops
          Center</Link> dan <Link href="/admin/kendali">Kendali</Link>.
        </p>
      </section>

      {/* ============ C: Sumber bermasalah ============ */}
      <section className="seksi" aria-labelledby="judul-sumber">
        <div className="seksi-kepala">
          <h2 id="judul-sumber">C. Sumber Bermasalah</h2>
        </div>
        {!ops.sumber_tersedia ? (
          <EmptyState
            judul="Kesehatan sumber belum tersedia"
            pesan="Tabel pf_sources tidak dapat dibaca."
          />
        ) : sumberBermasalah.length === 0 ? (
          <p>
            Tidak ada sumber dengan status gagal/basi atau run gagal
            tercatat pada 50 run terakhir.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Sumber</th>
                  <th>Status kesehatan</th>
                  <th>Run gagal (50 terakhir)</th>
                  <th>Sukses terakhir</th>
                  <th>Cooldown sampai</th>
                </tr>
              </thead>
              <tbody>
                {sumberBermasalah.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nama}</td>
                    <td>{s.health_status ?? "—"}</td>
                    <td>{s.run_gagal_terakhir}</td>
                    <td>{formatWaktu(s.last_success_at)}</td>
                    <td>{formatWaktu(s.cooldown_until)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ============ D: Galat terbaru ============ */}
      <section className="seksi" aria-labelledby="judul-galat">
        <div className="seksi-kepala">
          <h2 id="judul-galat">D. Galat Aplikasi Terbaru</h2>
        </div>
        {galat === null ? (
          <EmptyState
            judul="Galat aplikasi tidak dapat dibaca"
            pesan="Tabel pf_app_errors hanya bisa dibaca via service client (RLS menolak session client). Bila service key belum diatur di server, seksi ini tetap kosong — itu berarti 'tidak dapat dibaca', bukan 'tidak ada galat'."
          />
        ) : galat.length === 0 ? (
          <p>Belum ada galat tercatat di pf_app_errors.</p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Sumber</th>
                  <th>Rute</th>
                  <th>Pesan</th>
                </tr>
              </thead>
              <tbody>
                {galat.map((g, i) => (
                  <tr key={`${g.dibuat_pada ?? ""}-${i}`}>
                    <td>{formatWaktu(g.dibuat_pada)}</td>
                    <td>{g.sumber ?? "—"}</td>
                    <td>{g.rute ?? "—"}</td>
                    <td>{g.pesan ?? "—"}</td>
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
