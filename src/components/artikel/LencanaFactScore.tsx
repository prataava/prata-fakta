// Lencana FACT SCORE (P0 Worker F) — server component di halaman
// artikel, tepat di bawah judul. Menampilkan angka + label + rincian
// 4 komponen (A/B/C/D) yang bisa dibuka/tutup + tautan metodologi.
// Rincian memakai <details>/<summary> bawaan browser (berfungsi
// tanpa JavaScript) — bukan tombol, jadi tidak ada tombol yang
// butuh handler. Skor tampil BERSAMA status verifikasi artikel
// (lencana status tetap di atas judul); FACT SCORE tidak pernah
// menggantikan status verifikasi.
// Bila dinilai = false -> tampilkan "Belum dinilai — bukti belum
// cukup" (bukan angka, bukan 0).
import Link from "next/link";
import type { HasilFactScore } from "@/lib/fact-score";

/** Format komponen (satu desimal, koma Indonesia): 26,7. */
function formatKomponen(nilai: number): string {
  return nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

export default function LencanaFactScore({
  hasil,
  koreksiDiketahui = true,
}: {
  /** Hasil hitungFactScore() untuk artikel ini. */
  hasil: HasilFactScore;
  /** false bila jumlah laporan koreksi terbuka tidak dapat dibaca
   *  (mis. kunci service belum tersedia) — komponen koreksi lalu
   *  memakai 10 poin sementara dan itu ditulis jujur di bawah. */
  koreksiDiketahui?: boolean;
}) {
  if (!hasil.dinilai || hasil.skor === null || hasil.label === null) {
    return (
      <div className="kartu" id="lencana-fact-score" role="status">
        <p style={{ margin: 0 }}>
          <strong>FACT SCORE: Belum dinilai</strong>
          {" — "}
          {hasil.alasanTidakDinilai ??
            "Belum dinilai — bukti belum cukup"}
        </p>
        <p style={{ margin: "8px 0 0" }}>
          <Link href="/kebijakan/metodologi">Lihat metodologi</Link>
        </p>
      </div>
    );
  }

  const k = hasil.komponen;
  return (
    <div className="kartu" id="lencana-fact-score">
      <p style={{ margin: 0 }}>
        <strong>
          FACT SCORE: {hasil.skor} — {hasil.label}
        </strong>
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "6px 0 0" }}>
        Seberapa kuat bukti di balik artikel ini, dari 0 sampai 100.
        Skor ini bukan vonis benar/salah dan bukan pengganti status
        verifikasi yang tampil di atas judul.
      </p>
      <details style={{ marginTop: 12 }}>
        <summary>Rincian 4 komponen skor</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 22 }}>
          <li>
            Sumber independen: {formatKomponen(k.independen)} dari 40 —
            akar sumber independen berbeda yang mendukung setidaknya
            satu klaim (satu berita yang disalin tiga media dihitung
            satu).
          </li>
          <li>
            Kredibilitas sumber: {formatKomponen(k.kredibilitas)} dari
            30 — skor tertinggi dari tier akar pendukung (tier 1 = 90,
            tier 2 = 75, tier 3 = 60).
          </li>
          <li>
            Konsistensi klaim: {formatKomponen(k.konsistensi)} dari 20 —
            klaim yang didukung bukti dan tidak ada bukti yang
            menentangnya.
          </li>
          <li>
            Rekam koreksi: {formatKomponen(k.koreksi)} dari 10 — 10
            poin bila tidak ada laporan koreksi terbuka, berkurang 5
            poin per laporan yang belum ditindaklanjuti.
            {!koreksiDiketahui &&
              " (Jumlah laporan koreksi terbuka belum dapat dibaca saat ini, jadi komponen ini memakai 10 poin sementara.)"}
          </li>
        </ul>
      </details>
      <p style={{ margin: "12px 0 0" }}>
        <Link href="/kebijakan/metodologi">Lihat metodologi</Link>
      </p>
    </div>
  );
}
