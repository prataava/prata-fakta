import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

// Halaman dirender per request (`instant = false`), BUKAN prerender
// statis — pola yang sama dengan /jelajahi (lihat komentar di
// src/app/jelajahi/page.tsx): sebagai halaman statis murni (tanpa
// data / komponen klien / async apa pun), skrip bootstrap $RC React
// ikut terpanggang TANPA nonce ke shell statis. CSP (script-src
// nonce+hash) memblokir skrip itu → $RC undefined → hidrasi gagal
// (#419) → React me-render ulang → isi halaman ganda di DOM (h1=2).
// Dengan `instant = false`, render terjadi per request dalam konteks
// nonce proxy dan hidrasi berhasil. Biaya: nyaris nol (teks statis
// tanpa DB). JANGAN hapus baris ini tanpa menguji ulang halaman ini
// di CDP (h1 harus = 1, tanpa $RC error).
export const instant = false;

export const metadata: Metadata = {
  title: "Metodologi FACT SCORE & Verifikasi",
  description:
    "Bagaimana PRATA FAKTA menghitung FACT SCORE (0–100) dan memutuskan status verifikasi sebuah artikel.",
};

export default async function Metodologi() {
  await connection();
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Metodologi FACT SCORE &amp; Verifikasi</h1>
        <p className="prosa-meta">Terakhir diperbarui: 17 November 2026</p>
        <p>
          Halaman ini menjelaskan cara kami menilai bukti di balik sebuah
          artikel. Semua angka di halaman artikel bisa Anda periksa
          sendiri dari klaim, bukti, dan sumber yang tercantum di sana.
        </p>

        <h2>Bagaimana FACT SCORE dihitung?</h2>
        <p>
          FACT SCORE menilai seberapa kuat bukti di balik sebuah artikel,
          dari 0 sampai 100. Skor ini dihitung dari empat hal yang
          semuanya bisa Anda periksa sendiri di halaman artikel:
        </p>
        <ol>
          <li>
            <strong>Sumber independen (40 poin)</strong> — berapa media
            berbeda yang memberitakan fakta yang sama secara independen.
            Satu berita yang disalin oleh tiga media dihitung sebagai
            satu sumber, bukan tiga.
          </li>
          <li>
            <strong>Kredibilitas sumber (30 poin)</strong> — tingkat
            kepercayaan sumbernya: Tier 1 (mis. Antara, CNN Indonesia)
            bernilai paling tinggi, lalu Tier 2, lalu Tier 3. Tingkat
            ini ditentukan dari rekam sumber, bukan dari popularitas.
          </li>
          <li>
            <strong>Konsistensi klaim (20 poin)</strong> — berapa klaim
            dalam artikel yang didukung bukti dan tidak ada bukti yang
            menentangnya.
          </li>
          <li>
            <strong>Rekam koreksi (10 poin)</strong> — apakah ada laporan
            koreksi dari pembaca yang belum kami tindaklanjuti. Artikel
            yang pernah kami koreksi secara terbuka tidak dikurangi
            nilainya — justru sebaliknya, koreksi yang transparan
            adalah bagian dari kepercayaan.
          </li>
        </ol>
        <p>
          Skor ini <strong>bukan</strong> vonis benar/salah, dan{" "}
          <strong>bukan</strong> pengganti status verifikasi
          (Terverifikasi / Terverifikasi Silang / Berkembang / Belum
          Terkonfirmasi) yang tampil di sampingnya. Artikel tanpa klaim
          yang bisa dinilai tidak diberi skor — kami menulis
          &ldquo;Belum dinilai&rdquo; daripada mengarang angka.
        </p>

        <h2>Rumus</h2>
        <p>FACT SCORE = bulatkan (A + B + C + D), skala 0–100.</p>
        <ul>
          <li>
            <strong>A — Cakupan independen, maks 40 poin.</strong> n =
            jumlah akar sumber independen berbeda yang mendukung
            setidaknya satu klaim (gabungan akar semua klaim; satu akar
            dihitung sekali). A = min(n, 3) / 3 × 40. Contoh: 0 sumber
            → 0; 1 sumber → 13,3; 2 sumber → 26,7; 3 sumber atau lebih
            → 40.
          </li>
          <li>
            <strong>B — Kredibilitas sumber, maks 30 poin.</strong> s =
            skor kredibilitas tertinggi dari tier akar pendukung. B = s
            / 90 × 30. Tier 1 → 30; tier 2 → 25; tier 3 → 20; tanpa
            pendukung → 0.
          </li>
          <li>
            <strong>C — Konsistensi klaim, maks 20 poin.</strong> k =
            jumlah klaim artikel; kd = klaim dengan setidaknya satu
            bukti &ldquo;mendukung&rdquo; dan nol bukti
            &ldquo;menentang&rdquo;. C = (kd / k) × 20. Artikel tanpa
            klaim tidak dinilai sama sekali.
          </li>
          <li>
            <strong>D — Rekam koreksi, maks 10 poin.</strong> t = jumlah
            laporan koreksi artikel ini yang masih terbuka (status
            &ldquo;baru&rdquo; atau &ldquo;ditinjau&rdquo;). D = maks(0,
            10 − 5 × t). Contoh: 0 laporan terbuka → 10; 1 laporan
            terbuka → 5; 2 laporan terbuka atau lebih → 0. Laporan yang
            sudah diperbaiki atau ditolak tidak mengurangi nilai.
          </li>
        </ul>

        <h2>Label skor</h2>
        <ul>
          <li>85–100: Sangat kuat</li>
          <li>70–84: Kuat</li>
          <li>50–69: Cukup</li>
          <li>25–49: Lemah</li>
          <li>0–24: Sangat lemah</li>
        </ul>
        <p>
          Skor selalu tampil bersama rincian keempat komponennya, agar
          pembaca bisa melihat kenapa angkanya begitu. Skor dihitung
          saat halaman dibaca dari data saat itu juga — bila bukti atau
          laporan koreksi berubah, skor ikut berubah; tidak ada skor
          basi yang tersimpan.
        </p>

        <h2>Contoh hitungan</h2>
        <ul>
          <li>
            <strong>Contoh 1 — 82 (Kuat):</strong> 2 sumber independen
            (tier-1 + tier-2) mendukung klaim; 4 klaim, 3 di antaranya
            didukung tanpa bukti menentang; 0 laporan koreksi terbuka.
            A = 2/3 × 40 = 26,7; B = 90/90 × 30 = 30; C = 3/4 × 20 =
            15; D = 10 → 81,7 → 82.
          </li>
          <li>
            <strong>Contoh 2 — 63 (Cukup):</strong> 1 sumber tier-1
            saja; 2 klaim, 1 didukung tanpa menentang; 0 laporan
            terbuka. A = 1/3 × 40 = 13,3; B = 30; C = 1/2 × 20 = 10; D
            = 10 → 63,3 → 63. Ini profil tipikal artikel dari satu
            sumber tier-1 — skor &ldquo;Cukup&rdquo; adalah tampilan
            yang jujur untuknya, bukan &ldquo;Kuat&rdquo;.
          </li>
          <li>
            <strong>Contoh 3 — 95 (Sangat kuat):</strong> 3 sumber
            independen atau lebih termasuk tier-1; 5 dari 5 klaim
            didukung tanpa menentang; 1 laporan koreksi terbuka. A =
            40; B = 30; C = 20; D = 10 − 5 = 5 → 95.
          </li>
          <li>
            <strong>Contoh 4 — Belum dinilai:</strong> artikel tanpa
            satu pun klaim → tidak ada angka, hanya teks
            &ldquo;Belum dinilai&rdquo;.
          </li>
        </ul>

        <h2>Tier sumber</h2>
        <p>
          Tier ditentukan dari prioritas sumber di daftar sumber kami:
          prioritas 90 ke atas → Tier 1 (skor kredibilitas 90);
          prioritas 70–89 → Tier 2 (skor 75); prioritas di bawah 70 →
          Tier 3 (skor 60). Contoh Tier 1: Antara, CNN Indonesia,
          Liputan6. Tier bukan penilaian mutu jurnalistik dan bukan
          pengganti kurasi manusia — tier hanya dipakai sebagai bobot
          dalam perhitungan di atas.
        </p>

        <h2>Aturan verifikasi</h2>
        <p>
          Terpisah dari FACT SCORE, setiap artikel punya status
          verifikasi:
        </p>
        <ul>
          <li>
            <strong>Terverifikasi</strong> — minimal 2 sumber independen
            tier-1 memberitakan hal yang sama.
          </li>
          <li>
            <strong>Terverifikasi Silang</strong> — minimal 2 sumber
            independen apa pun memberitakan hal yang sama, atau 1 sumber
            tier-1 saja (sumber tier-1 punya verifikasi editorial
            sendiri; artikel tetap wajib ditinjau editor sebelum
            terbit).
          </li>
          <li>
            <strong>Berkembang</strong> — topik sedang ramai (minimal 3
            pemberitaan dalam 24 jam terakhir) tetapi baru didukung 1
            sumber independen.
          </li>
          <li>
            <strong>Belum Terkonfirmasi</strong> — bukti belum cukup.
          </li>
        </ul>
        <p>
          Status &ldquo;Disengketakan&rdquo; dan &ldquo;Dikoreksi&rdquo;
          tidak pernah ditentukan otomatis oleh sistem — keduanya hanya
          berasal dari pemeriksaan manusia.
        </p>

        <h2>Melaporkan koreksi</h2>
        <p>
          Menemukan kesalahan di sebuah artikel? Setiap artikel
          memiliki tombol &ldquo;Laporkan Kesalahan&rdquo;, atau
          laporkan langsung lewat{" "}
          <Link href="/laporkan">halaman laporan</Link>. Laporan dibaca
          redaksi dan diverifikasi sebelum ditindaklanjuti; laporan
          yang terbukti benar akan dikoreksi dan artikel diberi label
          koreksi beserta tanggalnya. Prosedur lengkapnya ada di{" "}
          <Link href="/kebijakan/koreksi">Koreksi &amp; Hak Jawab</Link>.
        </p>
      </article>
    </div>
  );
}
