// /rutin/angka dilebur ke /data?cakupan=indonesia (F-S3): halaman
// Data sudah menampilkan indikator nasional dengan filter cakupan
// yang setara. Rute dipertahankan sebagai redirect agar tautan
// lama tetap jalan.
import { redirect } from "next/navigation";

export default function RutinAngka() {
  redirect("/data?cakupan=indonesia");
}
