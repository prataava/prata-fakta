import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormMintaHapus from "./FormMintaHapus";

export const metadata: Metadata = {
  title: "Hapus Akun — My Prata",
  description:
    "Minta tautan konfirmasi untuk menghapus akun PRATA FAKTA beserta seluruh data pribadi Anda.",
};

// Halaman minta hapus akun (Gelombang B2-A, A1): langkah 1 dari 3.
// Wajib login; penghapusan sendiri hanya terjadi sesudah tautan
// email diklik + konfirmasi akhir di /saya/hapus-akun/konfirmasi.
export default async function HapusAkun() {
  const supabase = await createClient();
  let email: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
    if (!data.user) redirect("/masuk");
  } catch {
    redirect("/masuk");
  }
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-hapus-akun">
        <span className="hero-label">My Prata</span>
        <h1 id="judul-hapus-akun">Hapus Akun</h1>
        <p>
          Menghapus akun bersifat <strong>permanen dan tidak dapat dibatalkan</strong>.
          Sebelum dihapus, unduh dulu data Anda bila masih diperlukan.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <Link className="tombol" href="/saya">
            Kembali ke Saya
          </Link>
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-apa-yang-terjadi">
        <div className="seksi-kepala">
          <h2 id="seksi-apa-yang-terjadi">Apa yang terjadi bila akun dihapus</h2>
        </div>
        <div className="kartu" style={{ margin: 0 }}>
          <span className="kartu-judul">Dihapus sepenuhnya</span>
          <span className="kartu-teks">
            Profil, peran, bookmark, riwayat baca, skor kuis, topik yang
            diikuti, notifikasi, preferensi, progres kursus, riwayat dan
            daftar putar podcast, cerita yang diikuti, serta langganan
            newsletter pada email{email ? ` ${email}` : " akun"}.
          </span>
          <span className="kartu-judul">Dianonimkan (tetap ada tanpa nama Anda)</span>
          <span className="kartu-teks">
            Pertanyaan yang Anda ajukan, laporan koreksi, dan artikel yang
            Anda tulis tetap ada sebagai arsip publik, tetapi tidak lagi
            terhubung ke akun Anda — nama dan identitas Anda dilepas.
            Alasannya: konten itu sudah menjadi bagian jawaban/arsip yang
            dibaca pengguna lain; menghapusnya akan merusak arsip.
          </span>
          <span className="kartu-judul">Tetap tersimpan sebagai jejak</span>
          <span className="kartu-teks">
            Satu catatan penghapusan (tanpa email polos — hanya hash) dan
            jejak audit penghapusan, agar penghapusan akun dapat dibuktikan
            dan tidak dapat disangkal.
          </span>
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-cara">
        <div className="seksi-kepala">
          <h2 id="seksi-cara">Caranya — verifikasi lewat tautan email</h2>
          <p>
            Kami tidak memakai kata sandi untuk langkah ini, supaya pengguna
            yang mendaftar lewat Google (tanpa kata sandi) tetap bisa
            menghapus akunnya. Tautan konfirmasi dikirim ke email akun
            Anda, berlaku 24 jam, dan hanya bisa dipakai sekali.
          </p>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
          <li>
            Tekan tombol di bawah — tautan konfirmasi dikirim ke email akun
            Anda{email ? ` (${email})` : ""}.
          </li>
          <li>Klik tautan di email — Anda dibawa ke halaman konfirmasi akhir.</li>
          <li>
            Tekan &ldquo;Hapus akun saya secara permanen&rdquo; di halaman itu.
            Hanya sesudah langkah ini akun benar-benar dihapus.
          </li>
        </ol>
      </section>

      <section className="seksi" aria-labelledby="seksi-minta">
        <div className="seksi-kepala">
          <h2 id="seksi-minta">Minta tautan konfirmasi</h2>
        </div>
        <FormMintaHapus email={email} />
      </section>
    </div>
  );
}
