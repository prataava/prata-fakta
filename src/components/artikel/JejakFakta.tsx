// Jejak Fakta (Area 1, Fase 8 Gelombang 1) — seksi publik di
// halaman artikel: rantai klaim → bukti → catatan verifikasi.
// Data dari getJejakFakta (lib/data.ts); hanya artikel terbit
// yang punya jejak (RLS v8). Tanpa klaim, seksi menampilkan
// empty state jujur — bukan jejak karangan.
import Link from "next/link";
import type { JejakFakta } from "@/lib/data";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

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

function formatTanggal(iso: string | null): string {
  if (!iso) return "Tanggal belum tersedia";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function namaSumberDariUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function JejakFakta({ jejak }: { jejak: JejakFakta }) {
  return (
    <section className="seksi" aria-labelledby="seksi-jejak-fakta">
      <div className="seksi-kepala">
        <h2 id="seksi-jejak-fakta">Jejak Fakta</h2>
        <p>
          Dari mana setiap klaim dalam artikel ini berasal: klaim, bukti
          yang mendukung atau menentangnya, dan hasil pemeriksaan
          redaksi. Hanya klaim yang tercatat di sistem yang tampil di
          sini.
        </p>
      </div>

      {!jejak.tersedia ? (
        <p className="pesan-error" role="status">
          Jejak fakta belum tersedia — data verifikasi belum dapat
          dibaca (migrasi Fase 4/8 mungkin belum dijalankan).
        </p>
      ) : jejak.klaim.length === 0 && jejak.verifikasi.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Belum ada klaim atau catatan verifikasi yang tercatat untuk
          artikel ini.
        </p>
      ) : (
        <>
          {jejak.klaim.length > 0 && (
            <ol style={{ display: "grid", gap: 16, listStyle: "none", padding: 0, margin: 0 }}>
              {jejak.klaim.map((k) => (
                <li key={k.id} className="kartu" style={{ margin: 0 }}>
                  <span className="kartu-kategori">
                    Klaim · {k.jenis} · {LABEL_STATUS_KLAIM[k.status] ?? k.status}
                  </span>
                  <span className="kartu-judul">{k.teks}</span>
                  {k.bukti.length === 0 ? (
                    <span className="kartu-teks" style={{ color: "var(--muted)" }}>
                      Belum ada bukti yang tercatat untuk klaim ini.
                    </span>
                  ) : (
                    <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                      {k.bukti.map((b) => (
                        <li key={b.id} style={{ fontSize: "0.92rem" }}>
                          <span className="lencana">{LABEL_ARAH[b.arah] ?? b.arah}</span>{" "}
                          {b.sumber_url ? (
                            <Link href={b.sumber_url} target="_blank" rel="noopener noreferrer">
                              {b.sumber_nama ?? namaSumberDariUrl(b.sumber_url)}
                            </Link>
                          ) : (
                            (b.sumber_nama ?? "Sumber tidak bernama")
                          )}
                          {b.kutipan && (
                            <blockquote style={{ margin: "4px 0 0", color: "var(--ink-2)" }}>
                              &ldquo;{b.kutipan}&rdquo;
                            </blockquote>
                          )}
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                            {" "}
                            · {formatTanggal(b.dibuat_pada)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}

          {jejak.verifikasi.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>Hasil pemeriksaan redaksi</h3>
              <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {jejak.verifikasi.map((v) => (
                  <li key={v.id} className="kartu" style={{ margin: 0 }}>
                    <span className={kelasLencanaStatus(v.keputusan)}>
                      {labelStatusVerifikasi(v.keputusan)}
                    </span>
                    {v.catatan && <span className="kartu-teks">{v.catatan}</span>}
                    <span className="kartu-meta">{formatTanggal(v.dibuat_pada)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
