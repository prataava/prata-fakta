import type { Metadata } from "next";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import { getDaftarMataUang, getKurs, getKursTabel } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Kurs Mata Uang — Data Live",
  description:
    "Konverter kurs dan tabel nilai tukar terhadap rupiah dari kurs referensi Bank Sentral Eropa (Frankfurter).",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

const UTAMA = ["USD", "EUR", "SGD", "JPY", "GBP", "AUD", "CNY", "MYR", "THB", "KRW"];

function formatAngka(n: number, digit = 2): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digit,
    maximumFractionDigits: digit,
  }).format(n);
}

async function Konverter({
  dari,
  ke,
  jumlah,
}: {
  dari: string;
  ke: string;
  jumlah: number;
}) {
  const [hasil, mataUang] = await Promise.all([
    getKurs(dari, ke, jumlah),
    getDaftarMataUang(),
  ]);
  if (!hasil.ok || !mataUang.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Kurs belum tersedia"
        pesan="Sumber Frankfurter sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  const kode = Object.keys(mataUang.data).sort();
  return (
    <div>
      <form method="get" className="kartu-form" style={{ marginBottom: 24 }}>
        <div className="formulir">
          <label htmlFor="kurs-jumlah">
            Jumlah
            <input
              id="kurs-jumlah"
              name="jumlah"
              type="number"
              min="0"
              step="any"
              defaultValue={String(jumlah)}
              inputMode="decimal"
            />
          </label>
          <label htmlFor="kurs-dari">
            Dari
            <select id="kurs-dari" name="dari" defaultValue={dari}>
              {kode.map((k) => (
                <option key={k} value={k}>
                  {k} — {mataUang.data[k]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="kurs-ke">
            Ke
            <select id="kurs-ke" name="ke" defaultValue={ke}>
              {kode.map((k) => (
                <option key={k} value={k}>
                  {k} — {mataUang.data[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="tombol tombol-primer">
          Hitung kurs
        </button>
      </form>

      <div className="kartu" style={{ marginBottom: 24 }}>
        <span className="kartu-kategori">
          {formatAngka(jumlah, 0)} {dari} → {ke}
        </span>
        <span className="kartu-judul">
          {formatAngka(hasil.data.hasil)} {ke}
        </span>
        <span className="kartu-teks">
          Kurs: 1 {dari} = {formatAngka(hasil.data.kurs, 4)} {ke}
        </span>
        <span className="kartu-meta">
          Kurs referensi {hasil.data.tanggal} (ECB, via Frankfurter)
        </span>
      </div>
    </div>
  );
}

async function TabelKurs() {
  const hasil = await getKursTabel(UTAMA);
  if (!hasil.ok) return null;
  return (
    <section className="seksi" aria-labelledby="judul-tabel">
      <div className="seksi-kepala">
        <h2 id="judul-tabel">Nilai tukar terhadap rupiah</h2>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 12 }}>
        Kurs {hasil.data.tanggal} — angka di bawah adalah nilai 1 rupiah
        dalam mata uang tersebut (kurs ECB).
      </p>
      <div className="tabel-gulir">
        <table className="tabel-data">
          <thead>
            <tr>
              <th scope="col">Mata uang</th>
              <th scope="col">1 IDR =</th>
              <th scope="col">1 unit = (IDR)</th>
            </tr>
          </thead>
          <tbody>
            {UTAMA.filter((k) => hasil.data.kurs[k] !== undefined).map((k) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{formatAngka(hasil.data.kurs[k], 6)}</td>
                <td>
                  {formatAngka(1 / hasil.data.kurs[k], 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Kurs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dari =
    typeof sp.dari === "string" && /^[A-Z]{3}$/.test(sp.dari) ? sp.dari : "USD";
  const ke =
    typeof sp.ke === "string" && /^[A-Z]{3}$/.test(sp.ke) ? sp.ke : "IDR";
  const jumlahMentah = typeof sp.jumlah === "string" ? Number(sp.jumlah) : NaN;
  const jumlah =
    Number.isFinite(jumlahMentah) && jumlahMentah > 0 ? jumlahMentah : 1;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-kurs">
        <p className="hero-label">Data Live · Frankfurter / ECB</p>
        <h1 id="judul-kurs">
          Kurs <em>mata uang.</em>
        </h1>
        <p className="hero-teks">
          Konverter kurs dari kurs referensi Bank Sentral Eropa — tanpa
          kunci, diperbarui tiap jam (cache).
        </p>
      </section>

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat kurs…</p>
          </div>
        }
      >
        <Konverter dari={dari} ke={ke} jumlah={jumlah} />
      </Suspense>

      <Suspense fallback={null}>
        <TabelKurs />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://www.frankfurter.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Frankfurter (frankfurter.dev)
        </a>{" "}
        — kurs referensi European Central Bank.
      </p>
    </div>
  );
}
