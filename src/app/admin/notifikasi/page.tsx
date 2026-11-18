import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormBroadcast from "@/components/admin/FormBroadcast";
import { getAdminSession } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";
import { cobaServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Notifikasi Push — Admin",
  description:
    "Kirim broadcast push ke semua perangkat berlangganan, atau kirim satu ketukan uji ke perangkat sendiri.",
};

export const instant = false;

// Halaman dibaca per request (pola cacheComponents seperti /admin/ops).
// Guard route tetap di /api/admin/notifikasi/kirim + /api/push/uji
// (super_admin); halaman ini hanya menyembunyikan form dari non-admin.
export default async function AdminNotifikasi() {
  const sesi = await getAdminSession();
  const superAdmin = sesi?.roles.includes("super_admin") ?? false;

  // Jumlah perangkat berlangganan (service client — RLS menolak baca
  // anon; pola src/app/admin/data/page.tsx). Gagal dibaca = null,
  // form tetap tampil dengan keterangan "belum tersedia".
  let jumlahLangganan: number | null = null;
  // Riwayat pengiriman (v27, pf_push_deliveries): 20 terakhir.
  // null = tabel belum ada (migrasi v27 belum diterapkan) atau
  // galat baca — BUKAN "belum ada pengiriman".
  type BarisRiwayatPush = {
    endpoint: string;
    judul: string | null;
    status: string;
    kode_http: number | null;
    dibuat_pada: string;
  };
  let riwayat: BarisRiwayatPush[] | null = null;
  if (superAdmin) {
    try {
      const service = cobaServiceClient();
      if (service) {
        const { count, error } = await service
          .from("pf_push_subscriptions")
          .select("*", { count: "exact", head: true });
        if (!error && typeof count === "number") jumlahLangganan = count;
        const { data: log, error: errLog } = await service
          .from("pf_push_deliveries")
          .select("endpoint,judul,status,kode_http,dibuat_pada")
          .order("dibuat_pada", { ascending: false })
          .limit(20);
        if (!errLog && log) {
          riwayat = log as BarisRiwayatPush[];
        }
      }
    } catch {
      jumlahLangganan = null;
    }
  }

  if (!superAdmin) {
    return (
      <EmptyState
        judul="Hanya super_admin"
        pesan="Mengirim broadcast push hanya untuk super_admin. Route API juga menolak peran lain."
      />
    );
  }

  return (
    <>
      <p className="artikel-meta-kecil">
        Broadcast terkirim sebagai payload terenkripsi web-push ke semua
        perangkat berlangganan. Langganan mati (410/404) dihapus otomatis.
        Tombol uji mengirim satu ketukan push tanpa payload ke perangkat
        Anda sendiri. Broadcast menghormati preferensi push_notifikasi
        (pengguna yang mematikannya dilewati) dan frequency cap 5
        pengiriman per perangkat per 24 jam.
      </p>
      <section className="seksi" aria-labelledby="judul-broadcast">
        <div className="seksi-kepala">
          <h2 id="judul-broadcast">Broadcast push</h2>
        </div>
        <FormBroadcast jumlahLangganan={jumlahLangganan} />
      </section>
      <section className="seksi" aria-labelledby="judul-riwayat">
        <div className="seksi-kepala">
          <h2 id="judul-riwayat">Riwayat pengiriman — 20 terakhir</h2>
        </div>
        {riwayat === null ? (
          <EmptyState
            judul="Riwayat pengiriman belum tersedia"
            pesan="Tabel pf_push_deliveries belum ada — migrasi v27 belum diterapkan di produksi. Pengiriman tetap jalan; riwayat mulai tercatat sesudah v27 diterapkan."
          />
        ) : riwayat.length === 0 ? (
          <EmptyState
            judul="Belum ada pengiriman tercatat"
            pesan="Belum ada percobaan kirim push sejak migrasi v27 diterapkan."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Status</th>
                  <th>Kode HTTP</th>
                  <th>Endpoint</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((r, i) => (
                  <tr key={`${r.endpoint}-${r.dibuat_pada}-${i}`}>
                    <td>{r.judul ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>{r.kode_http ?? "—"}</td>
                    <td>{`${r.endpoint.slice(0, 48)}…`}</td>
                    <td>{formatWaktu(r.dibuat_pada)}</td>
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
