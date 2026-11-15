// Multi-Source View (Area 3, Fase 8 Gelombang 1) — matriks
// klaim × sumber di halaman artikel. Data dari
// getPerbandinganSumber (lib/data.ts). Prinsip: TANPA kesetaraan
// palsu — klaim tanpa bukti ditandai "Klaim tanpa bukti", sumber
// yang tidak punya bukti untuk klaim itu ditandai "Belum
// diketahui" (bukan "sama"). Bobot bukti eksplisit per klaim:
// jumlah sumber independen yang mendukung + skor kredibilitas
// tertinggi (tier 90/75/60 dari prioritas pf_sources).
import Link from "next/link";
import type {
  PerbandinganSumber,
  StatusSelPerbandingan,
} from "@/lib/data";

const LABEL_SEL: Record<StatusSelPerbandingan, string> = {
  sama: "Sama",
  berbeda: "Berbeda",
  beda_waktu: "Beda waktu",
  tanpa_bukti: "Klaim tanpa bukti",
  belum_diketahui: "Belum diketahui",
};

const KELAS_SEL: Record<StatusSelPerbandingan, string> = {
  sama: "lencana lencana-verified",
  berbeda: "lencana lencana-disputed",
  beda_waktu: "lencana",
  tanpa_bukti: "lencana",
  belum_diketahui: "lencana",
};

const LABEL_STATUS_KLAIM: Record<string, string> = {
  terverifikasi: "Terverifikasi",
  terbantah: "Terbantah",
  belum_terverifikasi: "Belum terverifikasi",
  tidak_dapat_diverifikasi: "Tidak dapat diverifikasi",
};

export default function PerbandinganSumber({
  perbandingan,
}: {
  perbandingan: PerbandinganSumber;
}) {
  const { klaim, sumber, sel, bobot } = perbandingan;
  const bobotPerKlaim = new Map(bobot.map((b) => [b.klaimId, b]));

  return (
    <section className="seksi" aria-labelledby="seksi-perbandingan-sumber">
      <div className="seksi-kepala">
        <h2 id="seksi-perbandingan-sumber">Perbandingan Sumber</h2>
        <p>
          Apakah sumber-sumber artikel ini berkata hal yang sama?
          Baris = klaim dalam artikel; kolom = sumber. &ldquo;Sama&rdquo;
          berarti sumber itu punya bukti yang mendukung klaim;
          &ldquo;Berbeda&rdquo; berarti ada bukti yang menentang;
          &ldquo;Beda waktu&rdquo; berarti bukti untuk klaim itu dicatat
          pada tanggal berbeda (cerita berkembang). &ldquo;Belum
          diketahui&rdquo; berarti sumber itu tidak punya bukti
          tercatat untuk klaim tersebut — bukan berarti ia setuju
          atau tidak setuju.
        </p>
      </div>

      {!perbandingan.tersedia ? (
        <p className="pesan-error" role="status">
          Perbandingan sumber belum tersedia — data klaim dan sumber
          belum dapat dibaca (migrasi Fase 4/8 mungkin belum
          dijalankan).
        </p>
      ) : klaim.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Belum ada klaim yang tercatat untuk artikel ini, sehingga
          belum ada yang bisa dibandingkan antar-sumber.
        </p>
      ) : sumber.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Belum ada sumber yang tercatat untuk artikel ini.
        </p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="tabel-data">
              <thead>
                <tr>
                  <th scope="col">Klaim</th>
                  {sumber.map((s) => (
                    <th key={s.id} scope="col">
                      {s.url ? (
                        <Link href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.nama}
                        </Link>
                      ) : (
                        s.nama
                      )}
                      {s.utama && (
                        <>
                          <br />
                          <span className="lencana">Sumber awal</span>
                        </>
                      )}
                      {s.tier !== null && s.skor !== null && (
                        <>
                          <br />
                          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                            Tier {s.tier} · skor {s.skor}
                          </span>
                        </>
                      )}
                      {s.peran && s.peran !== "utama" && (
                        <>
                          <br />
                          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                            Peran: {s.peran}
                          </span>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {klaim.map((k) => {
                  const b = bobotPerKlaim.get(k.id);
                  return (
                    <tr key={k.id}>
                      <th scope="row" style={{ textAlign: "left", fontWeight: 600 }}>
                        {k.teks}
                        <br />
                        <span style={{ fontWeight: 400, fontSize: "0.85rem", color: "var(--muted)" }}>
                          {LABEL_STATUS_KLAIM[k.status] ?? k.status}
                          {b && (
                            <>
                              {" · "}
                              {b.independen} sumber independen mendukung
                              {b.skorTertinggi !== null
                                ? ` · skor tertinggi ${b.skorTertinggi}`
                                : " · tanpa skor sumber"}
                            </>
                          )}
                        </span>
                      </th>
                      {sumber.map((s) => {
                        const c = sel[k.id]?.[s.id];
                        if (!c) return <td key={s.id}>—</td>;
                        return (
                          <td key={s.id}>
                            <span className={KELAS_SEL[c.status]}>
                              {LABEL_SEL[c.status]}
                            </span>
                            {c.sumberAwal && c.status !== "tanpa_bukti" && (
                              <>
                                {" "}
                                <span className="lencana">Sumber awal</span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 12 }}>
            Bobot bukti: tier dihitung dari prioritas sumber
            (tier 1 = skor 90, tier 2 = 75, tier 3 = 60) dan jumlah
            sumber independen yang mendukung klaim. Bukti kuat
            berarti banyak sumber independen yang sepakat — satu
            sumber saja, betapa pun tinggi tier-nya, tidak
            disamakan dengan banyak sumber independen.
          </p>
        </>
      )}
    </section>
  );
}
