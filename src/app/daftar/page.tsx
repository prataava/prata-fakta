import Link from "next/link";
import DaftarForm from "@/components/DaftarForm";
import { bacaPendaftaranTerbuka } from "@/lib/scheduler/flags";

// Halaman /daftar (server component) — menegakkan flag
// pendaftaran_terbuka (Tahap 13C): bila flag nonaktif, form
// TIDAK dirender; pengunjung mendapat pesan jujur bahwa
// pendaftaran sedang ditutup. Bila flag belum disetel / tabel
// belum ada, pendaftaran dibuka (bawaan true).
// Catatan jujur: ini penegakan di lapisan aplikasi. Pendaftaran
// langsung lewat Supabase Auth API tetap bisa dilakukan klien
// yang nekat; penegakan penuh (nonaktifkan signup di dashboard
// Supabase Auth) tetap wewenang pemilik.
export default async function Daftar() {
  const terbuka = await bacaPendaftaranTerbuka();
  if (!terbuka) {
    return (
      <div className="wadah">
        <div className="kartu-form">
          <h1>Pendaftaran ditutup</h1>
          <p role="status">
            Pendaftaran akun baru sedang ditutup oleh administrator.
            Silakan kembali lagi nanti, atau masuk bila Anda sudah
            punya akun.
          </p>
          <p style={{ marginTop: 16, fontSize: "0.92rem" }}>
            <Link href="/masuk" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Masuk
            </Link>
          </p>
        </div>
      </div>
    );
  }
  return <DaftarForm />;
}
