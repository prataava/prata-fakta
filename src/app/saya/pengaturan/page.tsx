// /saya/pengaturan dilebur ke /saya (F-T2): pengaturannya kini
// seksi "Pengaturan & Privasi" di dasbor /saya. Rute lama
// dipertahankan sebagai redirect ke jangkar seksi itu.
import { redirect } from "next/navigation";

export default function PengaturanSaya() {
  redirect("/saya#pengaturan-privasi");
}
