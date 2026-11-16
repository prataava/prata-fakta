import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getRingkasanAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Overview Admin",
  description: "Ringkasan operasional PRATA FAKTA: artikel, sumber, pipeline AI, dan scheduler.",
};

export const instant = false;

export default async function AdminOverview() {
  const ringkasan = await getRingkasanAdmin();

  if (!ringkasan.tersedia) {
    return (
      <section className="seksi" aria-label="Ringkasan belum tersedia">
        <EmptyState
          judul="Ringkasan belum tersedia"
          pesan="Data ringkasan tidak dapat dibaca — tabel editorial (migrasi Fase 1–5) mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf. Jalankan migrasi, lalu muat ulang halaman ini."
        />
      </section>
    );
  }

  const kartu: { label: string; angka: number; href: string }[] = [
    { label: "Total artikel", angka: ringkasan.total_artikel, href: "/admin/artikel" },
    { label: "Terbit", angka: ringkasan.terbit, href: "/admin/artikel?status=terbit" },
    { label: "Draft", angka: ringkasan.draft, href: "/admin/artikel?status=draft" },
    { label: "Terjadwal", angka: ringkasan.terjadwal, href: "/admin/artikel?status=terjadwal" },
    { label: "Antrean verifikasi", angka: ringkasan.antrean_verifikasi, href: "/admin/review" },
    { label: "Belum terkonfirmasi", angka: ringkasan.belum_terkonfirmasi, href: "/admin/review" },
    { label: "Dikoreksi", angka: ringkasan.dikoreksi, href: "/admin/koreksi" },
    { label: "Sumber aktif", angka: ringkasan.sumber.aktif, href: "/admin/sumber" },
  ];

  return (
    <>
      <section className="seksi" aria-label="Angka utama">
        <div className="admin-stat-grid">
          {kartu.map((k) => (
            <Link key={k.label} className="kartu admin-stat" href={k.href}>
              <span className="admin-stat-angka">{k.angka}</span>
              <span className="kartu-teks">{k.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-sumber">
        <div className="seksi-kepala">
          <h2 id="seksi-sumber">Aktivitas Sumber</h2>
          <Link href="/admin/sumber">Kelola sumber</Link>
        </div>
        <p className="artikel-meta-kecil">
          {ringkasan.sumber.total} sumber terdaftar · {ringkasan.sumber.aktif}{" "}
          aktif
        </p>
        {ringkasan.sumber.run_terakhir.length === 0 ? (
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
                  <th>Gagal</th>
                  <th>Dimulai</th>
                </tr>
              </thead>
              <tbody>
                {ringkasan.sumber.run_terakhir.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sumber_nama ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>{r.ditemukan}</td>
                    <td>{r.baru}</td>
                    <td>{r.duplikat}</td>
                    <td>{r.gagal}</td>
                    <td>{formatWaktu(r.dimulai_pada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-kesehatan">
        <div className="seksi-kepala">
          <h2 id="seksi-kesehatan">Kesehatan API &amp; Scheduler</h2>
          <Link href="/admin/sistem">Kelola sistem</Link>
        </div>
        <p>
          Supabase:{" "}
          {ringkasan.api_health.supabase.ok ? (
            <strong>
              terhubung
              {ringkasan.api_health.supabase.ms !== null
                ? ` (${ringkasan.api_health.supabase.ms} ms)`
                : ""}
            </strong>
          ) : (
            <strong>tidak terhubung</strong>
          )}
        </p>
        <p>
          Workflow GitHub Actions:{" "}
          {ringkasan.github_workflows.terhubung
            ? "terhubung"
            : ringkasan.github_workflows.pesan}
        </p>
        {ringkasan.jobs.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada job terjadwal tercatat.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Jadwal (cron)</th>
                  <th>Aktif</th>
                  <th>Terakhir jalan</th>
                  <th>Status terakhir</th>
                </tr>
              </thead>
              <tbody>
                {ringkasan.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.nama}</td>
                    <td>{j.jadwal_cron}</td>
                    <td>{j.aktif ? "Ya" : "Tidak"}</td>
                    <td>{formatWaktu(j.terakhir_jalan)}</td>
                    <td>{j.status_terakhir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-ai">
        <div className="seksi-kepala">
          <h2 id="seksi-ai">Status Pipeline AI</h2>
          <Link href="/admin/audit">Lihat audit</Link>
        </div>
        {ringkasan.ai.run_gagal_terakhir.length === 0 ? (
          <p>Tidak ada run pipeline AI yang gagal dalam 10 run terakhir.</p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Agen</th>
                  <th>Error</th>
                  <th>Dimulai</th>
                </tr>
              </thead>
              <tbody>
                {ringkasan.ai.run_gagal_terakhir.map((r) => (
                  <tr key={r.id}>
                    <td>{r.agen}</td>
                    <td>{r.error ?? "Gagal tanpa pesan error"}</td>
                    <td>{formatWaktu(r.dimulai_pada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-kategori">
        <div className="seksi-kepala">
          <h2 id="seksi-kategori">Statistik Kategori</h2>
          <Link href="/admin/artikel">Lihat artikel</Link>
        </div>
        {ringkasan.per_kategori.length === 0 ? (
          <p className="artikel-meta-kecil">Belum ada kategori tercatat.</p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Jumlah artikel</th>
                </tr>
              </thead>
              <tbody>
                {ringkasan.per_kategori.map((k) => (
                  <tr key={k.kategori_slug}>
                    <td>{k.kategori_nama}</td>
                    <td>{k.jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-error">
        <div className="seksi-kepala">
          <h2 id="seksi-error">Log Error Terakhir</h2>
        </div>
        {ringkasan.error_logs.length === 0 ? (
          <p>Tidak ada error tercatat dari run ingestion maupun pipeline AI.</p>
        ) : (
          <ul className="artikel-daftar">
            {ringkasan.error_logs.map((e, i) => (
              <li key={i}>
                {e.pesan} · {formatWaktu(e.waktu)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
