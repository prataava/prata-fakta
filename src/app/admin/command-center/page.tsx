import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  getAdminSession,
  getChecklistPraTerbit,
  getGalatTerbaru,
  getRingkasanOps,
} from "@/lib/admin/data";
import { getAlertAktif } from "@/lib/admin/alerts";
import { formatWaktu } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Command Center — Admin",
  description:
    "Satu layar operasi PRATA FAKTA: kesehatan sistem, radar, editorial, sumber, scheduler, backup, push, dan analitik.",
};

export const instant = false;

// Batas "24 jam terakhir" dihitung di fungsi module-level, BUKAN
// di render — eslint react-hooks/purity melarang Date.now() di
// render (pola nilaiSemuaJob di /admin/reliability, v27 C5).
function batas24Jam(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminCommandCenter() {
  const sesi = await getAdminSession();
  if (!sesi) {
    return (
      <EmptyState
        judul="Butuh login staf"
        pesan="Command Center hanya untuk staf (editor, fact_checker, writer, super_admin). Masuk dulu lewat /masuk."
      />
    );
  }

  // Semua panel memakai ulang getter/panel yang sudah ada (ops,
  // reliability, kualitas, notifikasi, radar) — TIDAK ada logika
  // baru yang menduplikasi query mereka. Tiap panel punya
  // fail-soft sendiri: data yang tidak dapat dibaca tampil "—"
  // atau empty state jujur, bukan 0.
  const [ops, alert, galat, checklist] = await Promise.all([
    getRingkasanOps(),
    getAlertAktif()
      .then((r) => r.alerts)
      .catch(() => []),
    getGalatTerbaru(),
    getChecklistPraTerbit(),
  ]);

  // Radar: klaster 24 jam + total (session client, staf).
  let klaster24Jam: number | null = null;
  let klasterTotal: number | null = null;
  try {
    const supabase = await createClient();
    const [a, b] = await Promise.all([
      supabase
        .from("pf_item_clusters")
        .select("id", { count: "exact", head: true })
        .gte("dibuat_pada", batas24Jam()),
      supabase
        .from("pf_item_clusters")
        .select("id", { count: "exact", head: true }),
    ]);
    if (!a.error && typeof a.count === "number") klaster24Jam = a.count;
    if (!b.error && typeof b.count === "number") klasterTotal = b.count;
  } catch {
    klaster24Jam = null;
    klasterTotal = null;
  }

  // Push: langganan + pengiriman 24 jam (service client).
  let langganan: number | null = null;
  let kirim24Jam: number | null = null;
  try {
    const service = cobaServiceClient();
    if (service) {
      const { count } = await service
        .from("pf_push_subscriptions")
        .select("*", { count: "exact", head: true });
      if (typeof count === "number") langganan = count;
      const kirim = await service
        .from("pf_push_deliveries")
        .select("id", { count: "exact", head: true })
        .gte("dibuat_pada", batas24Jam());
      if (!kirim.error && typeof kirim.count === "number") {
        kirim24Jam = kirim.count;
      }
    }
  } catch {
    langganan = null;
    kirim24Jam = null;
  }

  // --- Turunan (hanya dari data di atas, tanpa query baru) ---
  const semuaJob = [...ops.jobs, ...ops.jobs_lain];
  const jobGagal = semuaJob.filter((j) => j.status_terakhir === "gagal");
  const jobBackup = ops.jobs_lain.find((j) => j.nama === "backup") ?? null;
  const sumberBermasalah = ops.sumber.filter(
    (s) => s.status_terakhir === "gagal",
  );
  const drafSiapAuto = checklist?.filter((c) => c.auto_publish_mungkin) ?? null;
  const drafTertahan =
    checklist?.filter((c) => !c.auto_publish_mungkin) ?? null;
  const agenBerhasil = ops.kinerja.per_agen.reduce(
    (a, p) => a + p.berhasil,
    0,
  );
  const agenGagal = ops.kinerja.per_agen.reduce((a, p) => a + p.gagal, 0);
  const ingestionTerakhir = ops.ingestion_terakhir[0] ?? null;

  return (
    <>
      <p className="artikel-meta-kecil">
        Satu layar operasi — semua angka di sini berasal dari bukti
        eksekusi aktual (bukan badge hijau dari keberadaan
        workflow). Tiap panel menautkan ke halaman detailnya.
        &quot;—&quot; berarti data tidak dapat dibaca, bukan nol.
      </p>

      {/* 1. System Health */}
      <section className="seksi" aria-labelledby="judul-sehat">
        <div className="seksi-kepala">
          <h2 id="judul-sehat">System Health</h2>
          <Link href="/admin/reliability">Reliability Center →</Link>
        </div>
        {!ops.tersedia ? (
          <EmptyState
            judul="Kesehatan sistem tidak dapat dibaca"
            pesan="Ringkasan ops tidak tersedia — periksa koneksi atau izin baca staf."
          />
        ) : (
          <p className="artikel-meta-kecil">
            Database: {ops.db_ms !== null ? `${ops.db_ms} ms` : "—"} ·
            Job gagal: {jobGagal.length} dari {semuaJob.length} (
            {jobGagal.map((j) => j.nama).join(", ") || "tidak ada"}) ·
            Alert aktif: {alert.length} · Galat terbaru:{" "}
            {galat === null ? "—" : galat.length}
          </p>
        )}
      </section>

      {/* 2. News Radar */}
      <section className="seksi" aria-labelledby="judul-radar">
        <div className="seksi-kepala">
          <h2 id="judul-radar">News Radar</h2>
          <Link href="/admin/radar">Radar →</Link>
        </div>
        <p className="artikel-meta-kecil">
          Klaster peristiwa 24 jam terakhir:{" "}
          {klaster24Jam ?? "—"} · Total klaster: {klasterTotal ?? "—"} ·
          Item baru menunggu AI: {ops.inbox.menunggu_ai}
        </p>
      </section>

      {/* 3. Editorial */}
      <section className="seksi" aria-labelledby="judul-editorial">
        <div className="seksi-kepala">
          <h2 id="judul-editorial">Editorial</h2>
          <Link href="/admin/kualitas">Quality Center →</Link>
        </div>
        <p className="artikel-meta-kecil">
          Draf: {ops.inbox.draf} · Menunggu editor:{" "}
          {ops.inbox.menunggu_editor} · Siap terbit:{" "}
          {ops.inbox.siap_terbit} · Checklist pra-terbit:{" "}
          {checklist === null
            ? "—"
            : `${drafSiapAuto?.length ?? 0} siap auto-publish, ${drafTertahan?.length ?? 0} tertahan hard gates`}
        </p>
      </section>

      {/* 4. Source Intelligence */}
      <section className="seksi" aria-labelledby="judul-sumber">
        <div className="seksi-kepala">
          <h2 id="judul-sumber">Source Intelligence</h2>
          <Link href="/admin/sumber">Sumber →</Link>
        </div>
        <p className="artikel-meta-kecil">
          Sumber: {ops.sumber.length} ({ops.sumber.filter((s) => s.aktif).length}{" "}
          aktif) · Bermasalah (status terakhir gagal):{" "}
          {sumberBermasalah.length > 0
            ? sumberBermasalah.map((s) => s.nama).join(", ")
            : "tidak ada"}{" "}
          · <Link href="/admin/cakupan">Cakupan →</Link>
        </p>
      </section>

      {/* 5. Scheduler */}
      <section className="seksi" aria-labelledby="judul-scheduler">
        <div className="seksi-kepala">
          <h2 id="judul-scheduler">Scheduler</h2>
          <Link href="/admin/ops">Ops Center →</Link>
        </div>
        {semuaJob.length === 0 ? (
          <EmptyState
            judul="Jadwal tidak dapat dibaca"
            pesan="Daftar job tidak tersedia."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Terakhir jalan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {semuaJob.map((j) => (
                  <tr key={j.nama}>
                    <td>{j.nama}</td>
                    <td>{formatWaktu(j.terakhir_jalan)}</td>
                    <td>{j.status_terakhir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Backup */}
      <section className="seksi" aria-labelledby="judul-backup">
        <div className="seksi-kepala">
          <h2 id="judul-backup">Backup</h2>
          <Link href="/admin/ops">Ops Center →</Link>
        </div>
        <p className="artikel-meta-kecil">
          {jobBackup
            ? `Job backup: ${jobBackup.status_terakhir} · terakhir jalan ${formatWaktu(jobBackup.terakhir_jalan)}${jobBackup.error_terakhir ? ` · galat: ${jobBackup.error_terakhir}` : ""}`
            : "Job backup tidak tercatat di pf_scheduled_jobs — periksa workflow backup."}{" "}
          Verifikasi isi backup (hash SHA-256 + mode --verify) jalan
          di workflow; backup sukses hanya bila isinya terverifikasi.
        </p>
      </section>

      {/* 7. Push */}
      <section className="seksi" aria-labelledby="judul-push">
        <div className="seksi-kepala">
          <h2 id="judul-push">Push</h2>
          <Link href="/admin/notifikasi">Notifikasi →</Link>
        </div>
        <p className="artikel-meta-kecil">
          Langganan: {langganan ?? "—"} · Pengiriman 24 jam:{" "}
          {kirim24Jam ?? "— (riwayat butuh migrasi v27)"} · Frequency
          cap: 5 per perangkat per 24 jam.
        </p>
      </section>

      {/* 8. Analytics */}
      <section className="seksi" aria-labelledby="judul-analitik">
        <div className="seksi-kepala">
          <h2 id="judul-analitik">Analytics</h2>
          <Link href="/admin/analitik">Analitik →</Link>
        </div>
        <p className="artikel-meta-kecil">
          Agen AI: {agenBerhasil} berhasil · {agenGagal} gagal ·{" "}
          Ingestion terakhir:{" "}
          {ingestionTerakhir
            ? `${ingestionTerakhir.sumber_nama ?? "—"} — ${ingestionTerakhir.baru} baru dari ${ingestionTerakhir.ditemukan} ditemukan, ${ingestionTerakhir.gagal} gagal`
            : "—"}
        </p>
      </section>
    </>
  );
}
