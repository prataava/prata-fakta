// Metode Verifikasi (P0 Worker D) — seksi publik di halaman
// artikel: ringkasan bahasa awam tentang bagaimana sebuah
// artikel dinyatakan terverifikasi, status artikel ini, dan
// berapa sumber independen yang mendukungnya.
// Data BUKAN dari query baru: halaman artikel sudah mengambil
// getPerbandinganSumber() + getJejakFakta() dan meneruskan
// hasilnya lewat props (status + hitungan sumber).
// Aturan di bawah disalin dari lib/ai/verification.ts:
//   - VERIFIED = >= 2 sumber independen tier-1
//   - CROSS-CHECKED = >= 2 sumber independen apa pun, atau
//     1 sumber tier-1 (ambang dilonggarkan 16 Nov 2026)
//   - DEVELOPING = topik ramai (>= 3 item dalam 24 jam) + 1 sumber
//   - UNCONFIRMED = bukti tidak cukup
//   - Satu berita yang disalin beberapa media = SATU sumber
//     independen, bukan satu per media.
//   - DISPUTED / CORRECTED hanya dari pemeriksaan manusia.
import Link from "next/link";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

const ATURAN: { status: string; judul: string; penjelasan: string }[] = [
  {
    status: "VERIFIED",
    judul: "Terverifikasi",
    penjelasan:
      "Minimal 2 sumber independen tier-1 memberitakan hal yang sama.",
  },
  {
    status: "CROSS-CHECKED",
    judul: "Cek Silang",
    penjelasan:
      "Minimal 2 sumber independen apa pun memberitakan hal yang sama — atau 1 sumber tier-1 saja (sumber tier-1 punya verifikasi editorial sendiri, jadi satu sumber itu cukup untuk draf, tetapi artikel tetap wajib ditinjau editor sebelum terbit).",
  },
  {
    status: "DEVELOPING",
    judul: "Berkembang",
    penjelasan:
      "Topik sedang ramai (minimal 3 pemberitaan dalam 24 jam terakhir) tetapi baru didukung 1 sumber independen — ceritanya masih berkembang.",
  },
  {
    status: "UNCONFIRMED",
    judul: "Belum Terkonfirmasi",
    penjelasan:
      "Bukti belum cukup: hanya 1 sumber independen yang bukan tier-1 dan topiknya tidak ramai.",
  },
];

export default function MetodeVerifikasi({
  statusVerifikasi,
  jumlahSumber,
  jumlahSumberIndependen,
  tersedia,
}: {
  /** Status verifikasi artikel ini (artikel.status_verifikasi). */
  statusVerifikasi: string;
  /** Jumlah kolom sumber tercatat untuk artikel ini
   *  (perbandingan.sumber.length). */
  jumlahSumber: number;
  /** Jumlah sumber INDEPENDEN (akar rantai salinan berbeda)
   *  untuk artikel ini — salinan tidak dihitung ganda. */
  jumlahSumberIndependen: number;
  /** false bila data klaim/sumber artikel belum dapat dibaca. */
  tersedia: boolean;
}) {
  return (
    <section className="seksi" aria-labelledby="seksi-metode-verifikasi">
      <div className="seksi-kepala">
        <h2 id="seksi-metode-verifikasi">Metode Verifikasi</h2>
        <p>
          Bagaimana kami memutuskan sebuah artikel bisa dipercaya:
          bukan dari satu pemberitaan saja, melainkan dari berapa
          sumber independen yang memberitakan hal yang sama — dan
          seberapa tepercaya sumber-sumber itu. Satu berita yang
          disalin oleh beberapa media dihitung sebagai SATU sumber
          independen, bukan satu per media yang menyalin.
        </p>
      </div>

      {!tersedia ? (
        <p className="pesan-error" role="status">
          Metode verifikasi artikel ini belum dapat ditampilkan —
          data klaim dan sumber belum dapat dibaca (migrasi Fase 4/8
          mungkin belum dijalankan).
        </p>
      ) : (
        <>
          <p>
            <span className={kelasLencanaStatus(statusVerifikasi)}>
              {labelStatusVerifikasi(statusVerifikasi)}
            </span>{" "}
            Artikel ini didukung oleh{" "}
            <strong>
              {jumlahSumberIndependen} sumber independen
            </strong>{" "}
            dari {jumlahSumber} sumber yang tercatat
            {jumlahSumberIndependen < jumlahSumber &&
              " (sebagian sumber tercatat ternyata salinan dari sumber yang sama)"}
            .
          </p>
          <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {ATURAN.map((a) => (
              <li key={a.status} className="kartu" style={{ margin: 0 }}>
                <span className={kelasLencanaStatus(a.status)}>
                  {labelStatusVerifikasi(a.status)}
                </span>
                {a.status === statusVerifikasi && (
                  <>
                    {" "}
                    <span className="lencana">Status artikel ini</span>
                  </>
                )}
                <span className="kartu-teks">{a.penjelasan}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 12 }}>
            Status &ldquo;Disengketakan&rdquo; dan &ldquo;Dikoreksi&rdquo;
            tidak pernah ditentukan otomatis oleh sistem — keduanya
            hanya berasal dari pemeriksaan manusia (editor atau
            koreksi yang masuk sesudah artikel terbit).
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="tombol" href="/sumber">
              Lihat daftar sumber
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
