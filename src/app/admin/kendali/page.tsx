import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormFlag from "@/components/admin/FormFlag";
import TombolAksi from "@/components/admin/TombolAksi";
import { getAdminSession } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";
import {
  CATATAN_F6,
  getFlags,
  getStatusScheduler,
} from "@/lib/admin/kendali";

export const metadata: Metadata = {
  title: "Kendali — Admin",
  description:
    "Advanced Admin Control Center: feature flags, pemicu job manual, status scheduler, dan ekspor audit log.",
};

export const instant = false;

export default async function AdminKendali() {
  const sesi = await getAdminSession();
  // Halaman kendali HANYA super_admin (flag + pemicu job mengubah
  // perilaku sistem). Staf lain tetap bisa membaca halaman admin
  // lain lewat layout; di sini mereka mendapat penjelasan jujur.
  if (!sesi || !sesi.roles.includes("super_admin")) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Halaman Kendali hanya untuk super_admin"
          pesan="Feature flags, pemicu job manual, dan ekspor audit log hanya dapat diubah oleh super_admin. Akun Anda tidak punya peran itu."
        />
      </section>
    );
  }

  const [{ flags, tersedia: flagsTersedia }, scheduler] = await Promise.all([
    getFlags(),
    getStatusScheduler(),
  ]);

  return (
    <>
      <section className="seksi" aria-labelledby="judul-flags">
        <div className="seksi-kepala">
          <h2 id="judul-flags">Feature Flags</h2>
        </div>
        <p className="artikel-meta-kecil">
          Disimpan di pf_system_settings (migrasi v10 §6, baca staf-only).
          Perubahan dicatat ke audit log (aksi sistem.flag).
        </p>
        <p className="artikel-meta-kecil">
          Penegakan flag (Tahap 13C): ingestion_aktif menonaktifkan
          POST /api/ingestion/jalankan (503), pipeline_editorial_aktif
          menonaktifkan POST /api/ai/jalankan (503),
          pendaftaran_terbuka menutup halaman /daftar, dan mode
          pemeliharaan menampilkan pengumuman di Header semua
          halaman. auto_publish_tier1 (Fase 11) mengizinkan pipeline
          menerbitkan otomatis draf Tier-1 ber-FACT SCORE ≥85
          (bawaan aktif, disetujui pemilik 17 Nov 2026); tiap
          auto-publish tercatat di audit log (aksi artikel.terbit,
          sesudah.auto_publish=true). Nilai bawaan dipakai bila flag
          belum disetel.
        </p>
        {!flagsTersedia ? (
          <EmptyState
            judul="Feature flags belum tersedia"
            pesan="Tabel pf_system_settings tidak dapat dibaca — migrasi v10 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          flags.map((f) => (
            <FormFlag
              key={f.kunci}
              kunci={f.kunci}
              label={f.label}
              deskripsi={f.deskripsi}
              jenis={f.jenis}
              nilai={f.nilai}
              disetel={f.disetel}
            />
          ))
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-scheduler">
        <div className="seksi-kepala">
          <h2 id="judul-scheduler">Status Scheduler &amp; Pemicu Manual</h2>
        </div>
        <p className="artikel-meta-kecil">{CATATAN_F6}</p>
        <p className="artikel-meta-kecil">
          Pemicu manual memanggil route internal yang sama dengan workflow
          GitHub Actions — tidak ada logika ingestion/AI yang diduplikasi
          di sini. Job yang gagal gate (mis. artikel terjadwal gagal
          verifikasi) dilewati dan dicatat alasannya oleh route itu
          sendiri; upaya gate yang gagal tidak dicoba ulang selama 6 jam
          (backoff F12, Tahap 13C) dan muncul sebagai ditunda, bukan
          error. Workflow editorial lama (editorial.yml, dispatch
          tugas=keduanya) sudah dipecah jadi 3 workflow per jadwal —
          dispatch keduanya kini berarti dispatch tiap workflow (atau
          picu dari sini).
        </p>
        {!scheduler.tersedia ? (
          <EmptyState
            judul="Status scheduler belum tersedia"
            pesan="Tabel pf_scheduled_jobs tidak dapat dibaca — migrasi Fase 5 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          scheduler.jobs.map((j) => (
            <article className="kartu" key={j.nama} style={{ marginBottom: 16 }}>
              <span className="kartu-kategori">
                {j.label} · {j.tercatat ? "tercatat" : "belum tercatat"} ·{" "}
                {j.baris?.aktif ?? true ? "Aktif" : "Nonaktif"}
              </span>
              <span className="kartu-teks">
                Jadwal workflow: {j.jadwal_workflow}
                {j.baris?.jadwal_cron
                  ? ` · Cron di tabel: ${j.baris.jadwal_cron}`
                  : ""}
              </span>
              <span className="kartu-meta">
                Terakhir jalan: {formatWaktu(j.baris?.terakhir_jalan ?? null)}
                {j.baris
                  ? ` · Status terakhir: ${j.baris.status_terakhir}`
                  : " · Baris job ini belum ada — seed 5 job belum diterapkan (lihat LAPORAN-FASE-8 §14)."}
                {j.baris?.error_terakhir
                  ? ` · Error: ${j.baris.error_terakhir}`
                  : ""}
              </span>
              {j.bisa_dipicu ? (
                <p>
                  <TombolAksi
                    url="/api/admin/kendali/jalankan"
                    method="POST"
                    body={{ job: j.nama }}
                    label={`Jalankan ${j.label} sekarang`}
                    labelLoading="Menjalankan…"
                    konfirmasi={`Jalankan job '${j.label}' sekarang? Job berjalan penuh (ingestion/editorial bisa memakan waktu).`}
                    varian="primer"
                  />{" "}
                  <TombolAksi
                    url="/api/admin/kendali/kontrol"
                    method="POST"
                    body={{ job: j.nama, aksi: "reprocess" }}
                    label="Reprocess"
                    labelLoading="Memproses ulang…"
                    konfirmasi={`Proses ulang job '${j.label}' sekarang? Idempoten: engine dedup + lock mencegah duplikasi item.`}
                  />
                </p>
              ) : (
                <p className="artikel-meta-kecil">
                  Job ini tidak bisa dijalankan / diproses ulang dari
                  aplikasi.{" "}
                  {j.alasan_tanpa_pemicu ??
                    "Belum ada endpoint pemicu untuknya (temuan F7)."}
                </p>
              )}
              <p>
                {(j.baris?.aktif ?? true) ? (
                  <TombolAksi
                    url="/api/admin/kendali/kontrol"
                    method="POST"
                    body={{ job: j.nama, aksi: "pause" }}
                    label={`Pause ${j.label}`}
                    labelLoading="Menjeda…"
                    konfirmasi={`Jeda job '${j.label}'? Run terjadwal berikutnya dilewati sampai di-resume.`}
                  />
                ) : (
                  <TombolAksi
                    url="/api/admin/kendali/kontrol"
                    method="POST"
                    body={{ job: j.nama, aksi: "resume" }}
                    label={`Resume ${j.label}`}
                    labelLoading="Melanjutkan…"
                    konfirmasi={`Lanjutkan lagi job '${j.label}'?`}
                    varian="primer"
                  />
                )}{" "}
                <TombolAksi
                  url="/api/admin/kendali/kontrol"
                  method="POST"
                  body={{ job: j.nama, aksi: "disable" }}
                  label={`Disable ${j.label}`}
                  labelLoading="Menonaktifkan…"
                  konfirmasi={`NONAKTIFKAN job '${j.label}'? Run terjadwal berikutnya dilewati. Aksi ini tercatat di audit log ('sistem.job').`}
                  varian="bahaya"
                />
              </p>
              <p className="artikel-meta-kecil">
                Kontrol antrean (pause / resume / disable / reprocess)
                idempoten dan tersedia untuk kedelapan job — termasuk
                yang tidak bisa dijalankan. Ringkasannya ada di{" "}
                <Link href="/admin/ops">Operations Center</Link>.
              </p>
            </article>
          ))
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-ekspor">
        <div className="seksi-kepala">
          <h2 id="judul-ekspor">Ekspor Audit Log</h2>
        </div>
        <p>
          Unduh 200 baris audit log terbaru sebagai CSV (kolom: id,
          aktor_email, aksi, entitas, entitas_id, dibuat_pada). Data
          diambil langsung dari pf_audit_logs — tanpa angka palsu.
        </p>
        <p>
          <a className="tombol tombol-primer" href="/api/admin/kendali/ekspor-audit">
            Unduh CSV audit log
          </a>{" "}
          <Link href="/admin/audit">Lihat audit log di browser</Link>
        </p>
      </section>
    </>
  );
}
