import { connection } from "next/server";
import FormMasuk from "./FormMasuk";

// Halaman dirender per request (`instant = false`), BUKAN prerender
// statis — 17 Nov 2026: sebagai halaman "use client" murni, SELURUH
// konten ikut ter-prerender di build, sehingga skrip bootstrap $RC
// React ikut terpanggang TANPA nonce ke shell statis. CSP
// (script-src nonce+hash) memblokir skrip itu → $RC undefined →
// hidrasi gagal (#419) → React me-render ulang → h1 "Masuk" ganda
// di DOM (sapuan CDP 17 Nov 2026, juga via /saya tanpa login yang
// redirect ke sini). Dengan `instant = false` + `await connection()`
// di bawah, render terjadi per request dalam konteks nonce proxy,
// skrip $RC membawa nonce seperti halaman dinamis lain dan hidrasi
// berhasil — pola yang sama dengan /jelajahi, /kebijakan/metodologi,
// /data/live. Biaya: nyaris nol (form statis tanpa DB). JANGAN hapus
// baris ini tanpa menguji ulang /masuk di CDP (h1 harus = 1, tanpa
// $RC error). Form login sendiri dipindah verbatim ke FormMasuk.tsx
// (client component) — tidak satu baris logika auth pun berubah.
// Metadata tetap di layout.tsx segmen ini (tidak dipindah).
export const instant = false;

export default async function Masuk() {
  // Render per request (bukan prerender statis): connection()
  // memaksa halaman dirender dalam konteks request sehingga skrip
  // bootstrap $RC React membawa nonce proxy (lihat komentar
  // `instant = false` di atas — tanpa ini saja halaman tetap
  // ter-prerender dan $RC tetap tanpa nonce).
  await connection();
  return <FormMasuk />;
}
