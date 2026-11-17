import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";
import {
  getAdminSession,
  getRingkasanOps,
} from "@/lib/admin/data";
import { getAlertAktif } from "@/lib/admin/alerts";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Operations Center — Admin",
  description:
    "PRATA News Operations Center: status live, kesehatan sumber, inbox berita, performa, dan kontrol antrean — dirakit dari data admin yang sudah ada.",
};

export const instant = false;

export default async function AdminOps() {
  const sesi = await getAdminSession();
  const superAdmin = sesi?.roles.includes("super_admin") ?? false;
  const [ops, alert] = await Promise.all([
    getRingkasanOps(),
    getAlertAktif(),
  ]);

  return (
    <>
      <p className="artikel-meta-kecil">
        Dirakit dari halaman admin yang sudah ada (monitoring, kendali,
        sumber, pipeline AI, kinerja, API sehat) — bukan duplikasi.
        Setiap seksi yang tidak bisa dibaca (RLS menolak / migrasi
        belum diterapkan) menampilkan &quot;belum tersedia&quot;, bukan
        angka 0.
      </p>

      {/* ============ Panel A: Live system status ============ */}
      <section className="seksi" aria-labelledby="judul-ops-status">
        <div className="seksi-kepala">
          <h2 id="judul-ops-status">A. Status Live Sistem</h2>
        </div>
        <p className="artikel-meta-kecil">
          Ingestion + pipeline + DB + scheduler + run terakhir. Jadwal
          &quot;berikutnya&quot; tidak dihitung karangan — yang tampil
          adalah jadwal workflow + terakhir jalan; run berikutnya
          mengikuti workflow GitHub Actions.
        </p>
        <p>
          Database:{" "}
          {ops.db_ms === null
            ? "belum tersedia"
            : `terjangkau (${ops.db_ms} ms)`}{" "}
          · <Link href="/admin/api-sehat">API Sehat</Link> ·{" "}
          <Link href="/admin/kendali">Kendali</Link>
        </p>
        {!ops.jobs_tersedia ? (
          <EmptyState
            judul="Status scheduler belum tersedia"
            pesan="Tabel pf_scheduled_jobs tidak dapat dibaca — migrasi Fase 5 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          ops.jobs.map((j) => (
            <article className="kartu" key={j.nama} style={{ marginBottom: 12 }}>
              <span className="kartu-kategori">
                {j.label} · {j.tercatat ? "tercatat" : "belum tercatat"} ·{" "}
                {j.aktif ? "Aktif" : "Nonaktif"}
              </span>
              <span className="kartu-teks">
                Jadwal workflow: {j.jadwal_workflow}
              </span>
              <span className="kartu-meta">
                Terakhir jalan: {formatWaktu(j.terakhir_jalan)} · Status
                terakhir: {j.status_terakhir}
                {j.error_terakhir ? ` · Error: ${j.error_terakhir}` : ""}
              </span>
            </article>
          ))
        )}
        <h3>Run ingestion terakhir</h3>
        {ops.ingestion_terakhir.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada run ingestion yang terbaca (tabel kosong atau
            tidak dapat dibaca).
          </p>
        ) : (
          <ul>
            {ops.ingestion_terakhir.map((r) => (
              <li key={r.id}>
                {r.sumber_nama ?? "sumber tak dikenal"} · {r.status} ·{" "}
                {r.baru} baru / {r.duplikat} duplikat / {r.gagal} gagal ·{" "}
                {formatWaktu(r.dimulai_pada)}
                {r.error ? ` · ${r.error}` : ""}
              </li>
            ))}
          </ul>
        )}
        <h3>Alert aktif (Fase 15)</h3>
        {!alert.tersedia ? (
          <EmptyState
            judul="Alert belum tersedia"
            pesan="Tabel pf_alerts tidak dapat dibaca — migrasi v25 (20261117_pf_v25_alerts.sql) mungkin belum dijalankan di produksi, atau akun Anda belum punya izin baca staf."
          />
        ) : alert.alerts.length === 0 ? (
          <p className="artikel-meta-kecil">
            Tidak ada alert aktif. Alert dievaluasi dari data nyata
            (bukan dari tebakan) — tekan &quot;Periksa &amp; rekam
            alert&quot; untuk mengevaluasi 10 kejadian mandat sekarang.
          </p>
        ) : (
          <ul>
            {alert.alerts.map((a) => (
              <li key={a.id}>
                <strong>[{a.tingkat}] {a.judul}</strong> — {a.pesan} (
                {formatWaktu(a.dibuat_pada)}){" "}
                <TombolAksi
                  url={`/api/admin/alerts/${a.id}/akui`}
                  method="POST"
                  label="Akui"
                  labelLoading="Mengakui…"
                  konfirmasi={`Akui alert '${a.judul}'? Alert yang diakui tidak tercatat lagi sampai cooldown-nya lewat.`}
                />
              </li>
            ))}
          </ul>
        )}
        {superAdmin && (
          <p>
            <TombolAksi
              url="/api/admin/alerts/evaluasi"
              method="POST"
              label="Periksa & rekam alert"
              labelLoading="Mengevaluasi…"
              konfirmasi="Evaluasi 10 kejadian alert dari data nyata sekarang dan rekam yang lolos dedup + cooldown?"
              varian="primer"
            />
          </p>
        )}
      </section>

      {/* ============ Panel B: Source health ============ */}
      <section className="seksi" aria-labelledby="judul-ops-sumber">
        <div className="seksi-kepala">
          <h2 id="judul-ops-sumber">B. Kesehatan Sumber</h2>
        </div>
        <p className="artikel-meta-kecil">
          <Link href="/admin/sumber">Kelola sumber</Link> · Kolom
          kesehatan v22 (last_success_at, failure_count,
          health_status, cooldown, interval poll, response time,
          HTTP){" "}
          {ops.sumber_v22_tersedia
            ? "tersedia."
            : "BELUM tersedia — kolom v22 (Worker A) belum diterapkan di produksi (berkas migrasinya ada di repo, belum diterapkan). Yang tampil di bawah ini hanya kolom yang benar-benar ada (terakhir_cek, status_terakhir, terakhir_diambil, jumlah_item) + status run terakhir dari pf_ingestion_runs. Response time dan HTTP terakhir tidak disimpan di tabel mana pun — tidak ditampilkan sebagai angka karangan."}
        </p>
        {!ops.sumber_tersedia ? (
          <EmptyState
            judul="Daftar sumber belum tersedia"
            pesan="Tabel pf_sources tidak dapat dibaca — migrasi belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : ops.sumber.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada sumber yang terdaftar.
          </p>
        ) : (
          <ul>
            {ops.sumber.map((s) => (
              <li key={s.id}>
                <strong>{s.nama}</strong> ({s.jenis}) ·{" "}
                {s.aktif ? "Aktif" : "Nonaktif"} · Terakhir dicek:{" "}
                {formatWaktu(s.terakhir_cek)} · Terakhir diambil:{" "}
                {formatWaktu(s.terakhir_diambil)} · Status terakhir:{" "}
                {s.status_terakhir ?? "—"} · {s.jumlah_item} item · Run
                terakhir: {s.run_terakhir_status ?? "—"}
                {s.run_gagal_terakhir > 0
                  ? ` · ${s.run_gagal_terakhir} run gagal (dari 50 run terakhir)`
                  : ""}
                {ops.sumber_v22_tersedia && (
                  <>
                    {" "}
                    · Sukses terakhir: {formatWaktu(s.last_success_at)}{" "}
                    · Error: {s.failure_count ?? "—"} · Sehat:{" "}
                    {s.health_status ?? "—"} · Interval:{" "}
                    {s.poll_interval_minutes ?? "—"} mnt · Cooldown
                    sampai: {formatWaktu(s.cooldown_until)}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ============ Panel C: News inbox ============ */}
      <section className="seksi" aria-labelledby="judul-ops-inbox">
        <div className="seksi-kepala">
          <h2 id="judul-ops-inbox">C. News Inbox</h2>
        </div>
        <p className="artikel-meta-kecil">
          <Link href="/admin/monitoring">Monitoring</Link> ·{" "}
          <Link href="/admin/review">Review</Link> ·{" "}
          <Link href="/admin/artikel">Artikel</Link> · &quot;Menunggu
          AI&quot; = item mentah &apos;baru&apos; (belum diproses
          pipeline) — pipeline tidak punya antrean eksplisit, jadi
          angka ini adalah proxy yang diberi label jujur.
        </p>
        {!ops.inbox_tersedia ? (
          <EmptyState
            judul="Inbox belum tersedia"
            pesan="Tabel pf_raw_items / pf_articles tidak dapat dibaca — migrasi belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          <ul>
            <li>Baru: {ops.inbox.baru}</li>
            <li>Duplikat: {ops.inbox.duplikat}</li>
            <li>Ditolak: {ops.inbox.ditolak}</li>
            <li>Disalin dari item lain: {ops.inbox.disalin_dari}</li>
            <li>Menunggu AI: {ops.inbox.menunggu_ai}</li>
            <li>Draf artikel: {ops.inbox.draf}</li>
            <li>Menunggu editor: {ops.inbox.menunggu_editor}</li>
            <li>Siap terbit: {ops.inbox.siap_terbit}</li>
            <li>Terbit: {ops.inbox.terbit}</li>
          </ul>
        )}
      </section>

      {/* ============ Panel D: Performance ============ */}
      <section className="seksi" aria-labelledby="judul-ops-kinerja">
        <div className="seksi-kepala">
          <h2 id="judul-ops-kinerja">D. Performa</h2>
        </div>
        <p className="artikel-meta-kecil">
          <Link href="/admin/kinerja">Kinerja</Link> ·{" "}
          <Link href="/admin/agen-ai">Pipeline AI</Link> · Per sumber:
          agregat 50 run ingestion terakhir. Per agen AI: 200 run
          terakhir. Per kategori: seluruh artikel.
        </p>
        {!ops.kinerja_tersedia ? (
          <EmptyState
            judul="Performa belum tersedia"
            pesan="Tabel pf_ingestion_runs / pf_ai_runs tidak dapat dibaca — migrasi belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : (
          <>
            <h3>Per sumber</h3>
            {ops.kinerja.per_sumber.length === 0 ? (
              <p className="artikel-meta-kecil">Belum ada run.</p>
            ) : (
              <ul>
                {ops.kinerja.per_sumber.map((k) => (
                  <li key={k.sumber}>
                    {k.sumber}: {k.run} run · {k.ditemukan} ditemukan ·{" "}
                    {k.baru} baru · {k.duplikat} duplikat · {k.gagal}{" "}
                    gagal
                  </li>
                ))}
              </ul>
            )}
            <h3>Per agen AI</h3>
            {ops.kinerja.per_agen.length === 0 ? (
              <p className="artikel-meta-kecil">Belum ada run AI.</p>
            ) : (
              <ul>
                {ops.kinerja.per_agen.map((k) => (
                  <li key={k.agen}>
                    {k.agen}: {k.berhasil} berhasil · {k.gagal} gagal ·{" "}
                    {k.berjalan} berjalan · {k.dilewati} dilewati
                  </li>
                ))}
              </ul>
            )}
            <h3>Per kategori</h3>
            <ul>
              {ops.kinerja.per_kategori.map((k) => (
                <li key={k.kategori_slug}>
                  {k.kategori_nama}: {k.jumlah} artikel
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ============ Panel E: Queue control ============ */}
      <section className="seksi" aria-labelledby="judul-ops-kontrol">
        <div className="seksi-kepala">
          <h2 id="judul-ops-kontrol">E. Kontrol Antrean</h2>
        </div>
        <p className="artikel-meta-kecil">
          <Link href="/admin/kendali">Kendali (detail + feature flags)</Link>{" "}
          · Semua aksi di sini tercatat di audit log
          (&apos;sistem.job&apos; / &apos;sumber.aktif&apos;). Pause /
          resume / disable / reprocess idempoten: diulang 2x hasilnya
          sama. Menonaktifkan job tidak membatalkan run yang sedang
          jalan — yang dihentikan hanyalah run terjadwal berikutnya.
        </p>
        {!superAdmin ? (
          <EmptyState
            judul="Kontrol antrean hanya untuk super_admin"
            pesan="Menjalankan, menjeda, menonaktifkan, dan memproses ulang job hanya dapat dilakukan oleh super_admin. Akun Anda bisa melihat panel A–D, tetapi tidak mengubah antrean."
          />
        ) : !ops.jobs_tersedia ? (
          <EmptyState
            judul="Kontrol belum tersedia"
            pesan="Tabel pf_scheduled_jobs tidak dapat dibaca."
          />
        ) : (
          <>
            {ops.jobs.map((j) => (
              <article className="kartu" key={j.nama} style={{ marginBottom: 12 }}>
                <span className="kartu-kategori">
                  {j.label} · {j.aktif ? "Aktif" : "Nonaktif"}
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
                    aplikasi. {j.alasan_tanpa_pemicu ?? ""}
                  </p>
                )}
                <p>
                  {j.aktif ? (
                    <TombolAksi
                      url="/api/admin/kendali/kontrol"
                      method="POST"
                      body={{ job: j.nama, aksi: "pause" }}
                      label="Pause"
                      labelLoading="Menjeda…"
                      konfirmasi={`Jeda job '${j.label}'? Run terjadwal berikutnya dilewati sampai di-resume.`}
                    />
                  ) : (
                    <TombolAksi
                      url="/api/admin/kendali/kontrol"
                      method="POST"
                      body={{ job: j.nama, aksi: "resume" }}
                      label="Resume"
                      labelLoading="Melanjutkan…"
                      konfirmasi={`Lanjutkan lagi job '${j.label}'?`}
                      varian="primer"
                    />
                  )}{" "}
                  <TombolAksi
                    url="/api/admin/kendali/kontrol"
                    method="POST"
                    body={{ job: j.nama, aksi: "disable" }}
                    label="Disable"
                    labelLoading="Menonaktifkan…"
                    konfirmasi={`NONAKTIFKAN job '${j.label}'? Run terjadwal berikutnya dilewati. Aksi ini tercatat di audit log.`}
                    varian="bahaya"
                  />
                </p>
              </article>
            ))}
            <h3>Sumber</h3>
            {!ops.sumber_tersedia ? (
              <p className="artikel-meta-kecil">
                Daftar sumber belum tersedia.
              </p>
            ) : (
              <ul>
                {ops.sumber.map((s) => (
                  <li key={s.id}>
                    {s.nama} · {s.aktif ? "Aktif" : "Nonaktif"}{" "}
                    <TombolAksi
                      url={`/api/sumber/${s.id}`}
                      method="PATCH"
                      body={{ aktif: !s.aktif }}
                      label={s.aktif ? "Nonaktifkan" : "Aktifkan"}
                      labelLoading="Memproses…"
                      konfirmasi={
                        s.aktif
                          ? `Nonaktifkan sumber '${s.nama}'? Ingestion akan melewatinya.`
                          : `Aktifkan lagi sumber '${s.nama}'?`
                      }
                      varian={s.aktif ? "bahaya" : "primer"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
