import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormTanya from "@/components/lanjutan/FormTanya";
import { createClient } from "@/lib/supabase/server";
import {
  getJumlahPertanyaanMenunggu,
  getPertanyaanSaya,
  type PfPertanyaan,
} from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Tanya PRATA FAKTA",
  description:
    "Tanyakan apa pun tentang berita dan pengetahuan — jawaban hanya dari data yang sudah ada di PRATA FAKTA, beserta referensinya.",
};

// Halaman tanya membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis).
export const instant = false;

const LABEL_STATUS: Record<string, string> = {
  menunggu: "Menunggu jawaban editor",
  terjawab: "Terjawab",
  tidak_ada_data: "Tidak ada data",
};

function formatTanggal(waktu: string | null): string {
  if (!waktu) return "—";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function KartuPertanyaan({ p }: { p: PfPertanyaan }) {
  return (
    <article className="kartu">
      <span className="kartu-kategori">
        {LABEL_STATUS[p.status] ?? p.status}
      </span>
      <span className="kartu-judul">{p.pertanyaan}</span>
      {p.jawaban && <span className="kartu-teks">{p.jawaban}</span>}
      {p.referensi.length > 0 && (
        <span className="kartu-teks">
          Referensi:{" "}
          {p.referensi.map((r, i) => (
            <span key={`${r.url ?? r.judul ?? i}-${i}`}>
              {i > 0 ? " · " : ""}
              {r.url ? <a href={r.url}>{r.judul ?? r.url}</a> : (r.judul ?? "Referensi")}
            </span>
          ))}
        </span>
      )}
      <span className="kartu-meta">{formatTanggal(p.dibuat_pada)}</span>
    </article>
  );
}

export default async function Tanya() {
  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  const [menunggu, riwayat] = await Promise.all([
    getJumlahPertanyaanMenunggu(),
    penggunaId ? getPertanyaanSaya(penggunaId) : Promise.resolve([]),
  ]);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-tanya">
        <span className="hero-label">Tanya</span>
        <h1 id="judul-tanya">Tanya PRATA FAKTA</h1>
        <p>
          Tanyakan apa pun tentang berita dan pengetahuan. Jawaban hanya
          diambil dari artikel dan pengetahuan yang sudah ada di PRATA FAKTA —
          tidak pernah dikarang. Bila belum ada data yang bisa menjawab,
          pertanyaan Anda masuk antrean untuk dijawab editor/Muse.
        </p>
        <p>
          <strong>
            Antrean saat ini: {menunggu} pertanyaan menunggu jawaban.
          </strong>
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-form-tanya">
        <div className="seksi-kepala">
          <h2 id="seksi-form-tanya">Ajukan pertanyaan</h2>
          <p>Boleh anonim — masuk untuk melihat riwayat pertanyaan Anda.</p>
        </div>
        <FormTanya />
      </section>

      {penggunaId ? (
        <section className="seksi" aria-labelledby="seksi-riwayat-tanya">
          <div className="seksi-kepala">
            <h2 id="seksi-riwayat-tanya">Pertanyaan saya</h2>
          </div>
          {riwayat.length === 0 ? (
            <EmptyState
              judul="Belum ada pertanyaan."
              pesan="Anda belum mengajukan pertanyaan. Pertanyaan yang Anda ajukan akan tampil di sini beserta statusnya."
            />
          ) : (
            <div className="grid-berita">
              {riwayat.map((p) => (
                <KartuPertanyaan key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="seksi">
          <EmptyState
            judul="Masuk untuk melihat riwayat pertanyaan"
            pesan="Pertanyaan tetap bisa diajukan tanpa masuk. Masuk untuk melihat pertanyaan Anda sebelumnya beserta statusnya."
            aksi={
              <Link className="tombol tombol-primer" href="/masuk">
                Masuk
              </Link>
            }
          />
        </section>
      )}
    </div>
  );
}
