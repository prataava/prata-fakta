import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormKonfirmasiHapus from "./FormKonfirmasiHapus";

export const metadata: Metadata = {
  title: "Konfirmasi Hapus Akun — My Prata",
  description:
    "Konfirmasi akhir penghapusan akun PRATA FAKTA beserta seluruh data pribadi Anda.",
};

// Halaman konfirmasi akhir hapus akun (Gelombang B2-A, A1):
// langkah 3 dari 3 — dibuka dari tautan email. Wajib login;
// token dibaca komponen klien dari query URL (?token=...).
export default async function KonfirmasiHapusAkun() {
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/masuk");
  } catch {
    redirect("/masuk");
  }
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-konfirmasi-hapus">
        <span className="hero-label">My Prata</span>
        <h1 id="judul-konfirmasi-hapus">Konfirmasi Hapus Akun</h1>
        <p>
          Anda membuka halaman ini dari tautan konfirmasi di email. Ini
          langkah terakhir — sesudah tombol di bawah ditekan, akun dan
          seluruh data pribadi Anda dihapus permanen dan tidak dapat
          dikembalikan.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <Link className="tombol" href="/saya">
            Batal — kembali ke Saya
          </Link>
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-konfirmasi">
        <div className="seksi-kepala">
          <h2 id="seksi-konfirmasi">Konfirmasi akhir</h2>
        </div>
        <FormKonfirmasiHapus />
      </section>
    </div>
  );
}
