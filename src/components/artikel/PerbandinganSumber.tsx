// Multi-Source View (Area 3, Fase 8 Gelombang 1 + Remediasi) —
// matriks klaim × sumber di halaman artikel. Data dari
// getPerbandinganSumber (lib/data.ts). Prinsip: TANPA kesetaraan
// palsu — klaim tanpa bukti ditandai "Klaim tanpa bukti", sumber
// yang tidak punya bukti untuk klaim itu ditandai "Belum
// diketahui" (bukan "sama"). "Sumber independen" dihitung dari
// AKAR rantai salinan: satu berita yang disalin 3 media = 1
// sumber independen, bukan 3. Bila rantai salinan belum
// terverifikasi (RPC belum diterapkan), hitungan ditandai belum
// dapat dipastikan — bukan ditampilkan sebagai angka pasti.
// Bobot bukti eksplisit per klaim: jumlah sumber independen yang
// mendukung + skor kredibilitas tertinggi dari tier AKAR
// (tier 90/75/60 dari prioritas pf_sources).
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

const LABEL_ARAH: Record<string, string> = {
  mendukung: "Mendukung",
  menentang: "Menentang",
  netral: "Netral",
};

export default function PerbandinganSumber({
  perbandingan,
}: {
  perbandingan: PerbandinganSumber;
}) {
  const { klaim, sumber, sel, bobot } = perbandingan;
  const bobotPerKlaim = new Map(bobot.map((b) => [b.klaimId, b]));
  const teksKlaim = new Map(klaim.map((k) => [k.id, k.teks]));
  const rantaiTersedia = perbandingan.rantaiTersedia;
  const buktiTakTercocokkan = perbandingan.buktiTakTercocokkan ?? [];
  const parafrase = perbandingan.parafrase ?? [];

  return (
    <section className="seksi" aria-labelledby="seksi-perbandingan-sumber">
      <div className="seksi-kepala">
        <h2 id="seksi-perbandingan-sumber">Perbandingan Sumber</h2>
        <p>
          Apakah sumber-sumber artikel ini berkata hal yang sama?
          Baris = klaim dalam artikel; kolom = sumber. &ldquo;Sama&rdquo;
          berarti sumber itu punya bukti yang mendukung klaim;
          &ldquo;Berbeda&rdquo; berarti ada bukti yang menentang;
          &ldquo;Beda waktu&rdquo; berarti ada liputan independen yang
          lebih baru untuk klaim itu (cerita berkembang) — salinan
          yang terbit belakangan dari berita yang sama TIDAK
          dihitung sebagai beda waktu. &ldquo;Belum diketahui&rdquo;
          berarti sumber itu tidak punya bukti tercatat untuk klaim
          tersebut — bukan berarti ia setuju atau tidak setuju.
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
          {!rantaiTersedia && (
            <p className="pesan-error" role="status">
              Rantai salinan belum terverifikasi — hitungan independen belum dapat dipastikan. Jumlah sumber independen di
              bawah dihitung dari kolom sumber, bukan dari akar rantai
              salinan, sehingga satu berita yang disalin beberapa
              media bisa terhitung lebih dari satu sumber.
            </p>
          )}
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
                      {s.disalinDari && (
                        <>
                          <br />
                          <span className="lencana">
                            Disalin dari {s.disalinDari}
                          </span>
                        </>
                      )}
                      {s.tier !== null && s.skor !== null ? (
                        <>
                          <br />
                          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                            Tier {s.tier} · skor {s.skor}
                          </span>
                        </>
                      ) : (
                        <>
                          <br />
                          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                            Tier tidak diketahui
                          </span>
                        </>
                      )}
                      {rantaiTersedia && !s.rantaiTerverifikasi && (
                        <>
                          <br />
                          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                            Rantai belum terverifikasi
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
                              {b.salinan > 0 && ` · ${b.salinan} salinan`}
                              {rantaiTersedia &&
                                ` · ${b.independenTerverifikasi} terverifikasi rantainya`}
                              {b.kemungkinanParafrase > 0 &&
                                ` · ${b.kemungkinanParafrase} kemungkinan parafrase (tidak dihitung)`}
                              {b.buktiTakTercocokkan > 0 &&
                                ` · ${b.buktiTakTercocokkan} bukti tak tercocokkan`}
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
                            {c.disalinDari && (
                              <>
                                {" "}
                                <span className="lencana">
                                  Disalin dari {c.disalinDari}
                                </span>
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
            Cara hitung independen: satu berita yang disalin oleh
            beberapa media dihitung sebagai SATU sumber independen
            (akar rantai salinan = 1 sumber), bukan satu per media
            yang menyalin. Tier dihitung dari prioritas sumber
            (tier 1 = skor 90, tier 2 = 75, tier 3 = 60) dan skor
            tertinggi diambil dari tier sumber AKAR, bukan dari media
            penyalin. Bukti kuat berarti banyak sumber independen
            yang sepakat — satu sumber saja, betapa pun tinggi
            tier-nya, tidak disamakan dengan banyak sumber
            independen.
          </p>
          {parafrase.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>
                Kemungkinan salinan/parafrase — belum terverifikasi
                sebagai independen
              </h3>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                Sumber-sumber di bawah ini judulnya sangat mirip
                dengan sumber lain, tanpa rantai salinan yang
                menghubungkan keduanya. Mereka TIDAK dihitung sebagai
                sumber independen sampai ada verifikasi bahwa ini
                liputan yang benar-benar terpisah.
              </p>
              <ul>
                {parafrase.map((p) => (
                  <li key={p.akarKunci}>
                    {p.akarNama ?? "Sumber tanpa nama"}
                    {p.akarJudul && (
                      <>
                        {" — “"}
                        {p.akarJudul}
                        {"”"}
                      </>
                    )}
                    {p.miripDengan && (
                      <>
                        {" (mirip dengan “"}
                        {p.miripDengan}
                        {"”)"}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {buktiTakTercocokkan.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>
                Bukti yang tidak dapat dicocokkan ke sumber di atas
              </h3>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                Bukti-bukti ini tercatat untuk klaim di bawah, tetapi
                sumbernya tidak cocok dengan kolom sumber mana pun —
                ditampilkan di sini agar tidak hilang diam-diam.
              </p>
              <ul>
                {buktiTakTercocokkan.map((b, i) => (
                  <li key={`${b.klaimId}-${i}`}>
                    {teksKlaim.get(b.klaimId) ?? "Klaim tidak dikenal"}
                    {" — "}
                    {b.sumber_nama ? (
                      b.sumber_url ? (
                        <Link href={b.sumber_url} target="_blank" rel="noopener noreferrer">
                          {b.sumber_nama}
                        </Link>
                      ) : (
                        b.sumber_nama
                      )
                    ) : b.sumber_url ? (
                      <Link href={b.sumber_url} target="_blank" rel="noopener noreferrer">
                        {b.sumber_url}
                      </Link>
                    ) : (
                      "Sumber tanpa nama"
                    )}
                    {` (${LABEL_ARAH[b.arah] ?? b.arah})`}
                    {b.kutipan && (
                      <>
                        {" — “"}
                        {b.kutipan}
                        {"”"}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
