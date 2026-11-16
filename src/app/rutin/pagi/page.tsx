// /rutin/pagi dilebur ke /brief (F-S3): isinya sama persis dengan
// Daily Brief terbaru — satu permukaan saja, tanpa duplikat.
// Rute dipertahankan sebagai redirect agar tautan lama tetap jalan.
import { redirect } from "next/navigation";

export default function RutinPagi() {
  redirect("/brief");
}
