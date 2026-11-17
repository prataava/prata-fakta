import type { Metadata } from "next";
import { connection } from "next/server";
import ArsipTanyaClient from "./ArsipTanyaClient";

export const metadata: Metadata = {
  title: "Arsip Tanya Jawab",
  description:
    "Pertanyaan yang sudah dijawab dan ditandai publik oleh redaksi PRATA FAKTA — beserta jawaban dan referensinya.",
};

// Halaman dirender per request (`instant = false` + connection() di
// bawah), BUKAN prerender statis — 17 Nov 2026 (perbaikan CSP
// $RT/$RV): sebagai halaman klien murni, boundary loading.tsx root
// selesai di shell prerender sehingga skrip definisi $RV/$RC React
// ikut terpanggang TANPA nonce; CSP (script-src nonce+hash)
// memblokirnya → $RC undefined → hidrasi gagal (#419) → isi halaman
// ganda di DOM (h1=2). Karena connection() hanya bisa dipanggil
// komponen server, isi klien dipindah ke ArsipTanyaClient.tsx dan
// page ini tinggal wrapper server-nya. JANGAN jadikan page ini
// halaman klien lagi tanpa menguji ulang halaman ini di CDP
// (definisi $RV/$RC harus ber-nonce, h1 harus = 1).
export const instant = false;

export default async function ArsipTanya() {
  await connection();
  return <ArsipTanyaClient />;
}
