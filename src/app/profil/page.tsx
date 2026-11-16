// /profil dilebur ke /saya (F-T2): satu-satunya permukaan akun
// adalah dasbor /saya (seksi "Profil & Keamanan"). Rute /profil
// dipertahankan sebagai redirect agar tautan lama (mis. sesudah
// masuk/daftar) tetap jalan.
import { redirect } from "next/navigation";

export default function Profil() {
  redirect("/saya#profil-keamanan");
}
