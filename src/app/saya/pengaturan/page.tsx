import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FormPengaturan from "@/components/saya/FormPengaturan";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pengaturan — Saya",
  description:
    "Pengaturan My Prata: preferensi notifikasi dan digest, privasi, dan ekspor data Anda.",
};

export const instant = false;

export default async function PengaturanSaya() {
  const supabase = await createClient();
  let masuk = false;
  try {
    const { data } = await supabase.auth.getUser();
    masuk = Boolean(data.user);
  } catch {
    masuk = false;
  }
  if (!masuk) redirect("/masuk");

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-pengaturan">
        <span className="hero-label">My Prata</span>
        <h1 id="judul-pengaturan">Pengaturan &amp; Privasi</h1>
        <p>
          Preferensi notifikasi dan digest Anda, tersimpan di akun dan
          berlaku di semua perangkat. Perubahan tersimpan otomatis saat
          Anda mengubahnya.
        </p>
      </section>
      <FormPengaturan />
    </div>
  );
}
