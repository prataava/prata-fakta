import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import {
  getDaftarKotaSholat,
  getHijriah,
  getJadwalSholat,
} from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Jadwal Sholat & Hijriah — Data Live",
  description:
    "Jadwal sholat harian per kota di Indonesia dan tanggal Hijriah hari ini dari MyQuran.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

function tanggalHariIni(): { iso: string; tahun: number; bulan: number; tanggal: number } {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  const tahun = d.getFullYear();
  const bulan = d.getMonth() + 1;
  const tanggal = d.getDate();
  const iso = `${tahun}-${String(bulan).padStart(2, "0")}-${String(tanggal).padStart(2, "0")}`;
  return { iso, tahun, bulan, tanggal };
}

async function Jadwal({ kotaId }: { kotaId: string }) {
  // Baca waktu HANYA sesudah connection() — aturan cacheComponents.
  await connection();
  const { iso, tahun, bulan, tanggal } = tanggalHariIni();
  const [jadwal, hijriah, kota] = await Promise.all([
    getJadwalSholat(kotaId, tahun, bulan, tanggal),
    getHijriah(iso),
    getDaftarKotaSholat(),
  ]);
  if (!jadwal.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Jadwal sholat belum tersedia"
        pesan="Sumber MyQuran sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  const d = jadwal.data;
  const baris: { nama: string; waktu: string }[] = [
    { nama: "Imsak", waktu: d.imsak },
    { nama: "Subuh", waktu: d.subuh },
    { nama: "Terbit", waktu: d.terbit },
    { nama: "Dhuha", waktu: d.dhuha },
    { nama: "Dzuhur", waktu: d.dzuhur },
    { nama: "Ashar", waktu: d.ashar },
    { nama: "Maghrib", waktu: d.maghrib },
    { nama: "Isya", waktu: d.isya },
  ];
  return (
    <div>
      <div className="kartu" style={{ marginBottom: 24 }}>
        <span className="kartu-kategori">{d.lokasi}</span>
        <span className="kartu-judul">{d.tanggal}</span>
        <span className="kartu-teks">
          {hijriah.ok ? `Hijriah: ${hijriah.data}` : d.daerah}
        </span>
        {!hijriah.ok && (
          <span className="kartu-meta">Tanggal Hijriah tidak dapat dimuat.</span>
        )}
      </div>

      <div className="tabel-gulir" style={{ marginBottom: 24 }}>
        <table className="tabel-data">
          <thead>
            <tr>
              <th scope="col">Waktu</th>
              <th scope="col">Jam (WIB)</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.nama}>
                <td>{b.nama}</td>
                <td>{b.waktu}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {kota.ok && (
        <form method="get" className="kartu-form" style={{ marginBottom: 24 }}>
          <div className="formulir">
            <label htmlFor="pilih-kota">
              Ganti kota
              <select id="pilih-kota" name="kota" defaultValue={kotaId}>
                {kota.data.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.lokasi}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="tombol tombol-primer">
            Tampilkan jadwal
          </button>
        </form>
      )}
    </div>
  );
}

export default async function Sholat({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kotaId =
    typeof sp.kota === "string" && /^\d+$/.test(sp.kota) ? sp.kota : "1301";

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-sholat">
        <p className="hero-label">Data Live · MyQuran</p>
        <h1 id="judul-sholat">
          Jadwal sholat <em>&amp; Hijriah.</em>
        </h1>
        <p className="hero-teks">
          Jadwal sholat hari ini dan tanggal Hijriah — langsung dari
          MyQuran. Bila belum memilih kota, ditampilkan jadwal Kota
          Jakarta.
        </p>
      </section>

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat jadwal…</p>
          </div>
        }
      >
        <Jadwal kotaId={kotaId} />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://api.myquran.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          MyQuran (api.myquran.com)
        </a>
        .
      </p>
    </div>
  );
}
