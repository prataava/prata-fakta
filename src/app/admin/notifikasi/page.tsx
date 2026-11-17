import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormBroadcast from "@/components/admin/FormBroadcast";
import { getAdminSession } from "@/lib/admin/data";
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
  if (superAdmin) {
    try {
      const service = cobaServiceClient();
      if (service) {
        const { count, error } = await service
          .from("pf_push_subscriptions")
          .select("*", { count: "exact", head: true });
        if (!error && typeof count === "number") jumlahLangganan = count;
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
        Anda sendiri.
      </p>
      <section className="seksi" aria-labelledby="judul-broadcast">
        <div className="seksi-kepala">
          <h2 id="judul-broadcast">Broadcast push</h2>
        </div>
        <FormBroadcast jumlahLangganan={jumlahLangganan} />
      </section>
    </>
  );
}
