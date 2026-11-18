import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";
import { createClient } from "@/lib/supabase/server";
import type { ArahBukti } from "@/lib/ai/types";

export const metadata: Metadata = {
  title: "Label Sikap Bukti — Admin",
  description:
    "Tetapkan label sikap manual (mendukung/menentang/netral) per bukti — label manual selalu menang atas label otomatis pipeline.",
};

export const instant = false;

type BarisEvidence = {
  id: string;
  klaim_id: string;
  sumber_url: string;
  sumber_nama: string | null;
  kutipan: string | null;
  arah: ArahBukti;
  dibuat_pada: string | null;
  dilabel_manual: boolean | null;
  dilabel_pada: string | null;
};

const LABEL_ARAH: { nilai: ArahBukti; label: string }[] = [
  { nilai: "mendukung", label: "Mendukung" },
  { nilai: "menentang", label: "Menentang" },
  { nilai: "netral", label: "Netral" },
];

function formatWaktu(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminLabelSikap() {
  let tersedia = true;
  let baris: BarisEvidence[] = [];
  const teksKlaim = new Map<string, string>();
  const artikelPerKlaim = new Map<string, string | null>();
  const artikelKlaim = new Map<
    string,
    { judul: string; slug: string | null }
  >();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_evidence")
      .select(
        "id,klaim_id,sumber_url,sumber_nama,kutipan,arah,dibuat_pada,dilabel_manual,dilabel_pada",
      )
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (error) {
      tersedia = false;
    } else {
      baris = (data ?? []) as BarisEvidence[];
      const klaimIds = [...new Set(baris.map((b) => b.klaim_id))];
      if (klaimIds.length > 0) {
        const { data: klaim } = await supabase
          .from("pf_claims")
          .select("id,teks,artikel_id")
          .in("id", klaimIds);
        const artikelIds: string[] = [];
        for (const k of (klaim ?? []) as {
          id: string;
          teks: string;
          artikel_id: string | null;
        }[]) {
          teksKlaim.set(k.id, k.teks);
          artikelPerKlaim.set(k.id, k.artikel_id);
          if (k.artikel_id) artikelIds.push(k.artikel_id);
        }
        if (artikelIds.length > 0) {
          const { data: artikel } = await supabase
            .from("pf_articles")
            .select("id,judul,slug")
            .in("id", [...new Set(artikelIds)]);
          for (const a of (artikel ?? []) as {
            id: string;
            judul: string;
            slug: string | null;
          }[]) {
            artikelKlaim.set(a.id, { judul: a.judul, slug: a.slug });
          }
        }
      }
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Label sikap belum tersedia"
          pesan="Tabel pf_evidence tidak dapat dibaca — migrasi v29 (kolom dilabel_manual/dilabel_oleh/dilabel_pada) mungkin belum diterapkan di Supabase."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-aturan">
        <div className="seksi-kepala">
          <h2 id="judul-aturan">Aturan label sikap</h2>
        </div>
        <p>
          Taksonomi label hanya tiga nilai CHECK pf_evidence.arah:{" "}
          <strong>mendukung</strong>, <strong>menentang</strong>,{" "}
          <strong>netral</strong>. Pipeline melabel secara
          deterministik (bukan LLM): &ldquo;mendukung&rdquo; bila
          kalimat pendukung verbatim ditemukan di sumber,{" "}
          &ldquo;netral&rdquo; bila tidak ditemukan.{" "}
          <strong>&ldquo;Menentang&rdquo; hanya dari label manual
          di halaman ini</strong> — tidak pernah otomatis.
        </p>
        <p className="artikel-meta-kecil">
          Label manual SELALU menang: pipeline tidak pernah menimpa
          baris yang sudah berlabel manual (dedup simpanBukti).
          Setiap perubahan dicatat di audit log
          (&ldquo;evidence.label&rdquo;) beserta siapa dan kapan.
          Label editorial tertutup di luar tiga nilai ini (mis.
          &ldquo;pro-pemerintah/kritis&rdquo;) masih keputusan
          terbuka pemilik — bukan ditebak di sini.
        </p>
      </section>

      {baris.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada bukti"
            pesan="Pipeline belum mencatat satu pun baris pf_evidence."
          />
        </section>
      ) : (
        <section className="seksi" aria-labelledby="judul-daftar">
          <div className="seksi-kepala">
            <h2 id="judul-daftar">Bukti terbaru (50)</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Klaim</th>
                  <th>Artikel</th>
                  <th>Sumber</th>
                  <th>Arah</th>
                  <th>Label</th>
                  <th>Ubah label</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => {
                  const teks = teksKlaim.get(b.klaim_id) ?? "Klaim tidak terbaca";
                  const artikelId = artikelPerKlaim.get(b.klaim_id);
                  const art = artikelId
                    ? artikelKlaim.get(artikelId)
                    : undefined;
                  return (
                    <tr key={b.id}>
                      <td>
                        {teks.length > 140 ? `${teks.slice(0, 140)}…` : teks}
                        {b.kutipan ? (
                          <div className="artikel-meta-kecil">
                            Kutipan: &ldquo;
                            {b.kutipan.length > 120
                              ? `${b.kutipan.slice(0, 120)}…`
                              : b.kutipan}
                            &rdquo;
                          </div>
                        ) : (
                          <div className="artikel-meta-kecil">
                            Tanpa kalimat kutipan verbatim.
                          </div>
                        )}
                      </td>
                      <td>
                        {art ? (
                          art.slug ? (
                            <Link href={`/artikel/${art.slug}`}>
                              {art.judul}
                            </Link>
                          ) : (
                            art.judul
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {b.sumber_nama ?? "Sumber"}
                        <div className="artikel-meta-kecil">
                          <Link href={b.sumber_url}>Buka sumber</Link>
                        </div>
                      </td>
                      <td>{b.arah}</td>
                      <td>
                        {b.dilabel_manual
                          ? `Manual · ${formatWaktu(b.dilabel_pada)}`
                          : "Otomatis"}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {LABEL_ARAH.map((l) => (
                            <TombolAksi
                              key={l.nilai}
                              url={`/api/admin/evidence/${b.id}/label`}
                              body={{ arah: l.nilai }}
                              label={l.label}
                              labelLoading="Menyimpan…"
                              varian={
                                b.arah === l.nilai ? "primer" : "biasa"
                              }
                              konfirmasi={
                                b.arah === l.nilai
                                  ? undefined
                                  : `Ubah label sikap bukti ini menjadi "${l.nilai}"? Label manual selalu menang atas label otomatis pipeline.`
                              }
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
