import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import TombolIkutiTopik from "@/components/lanjutan/TombolIkutiTopik";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { getTopikDiikuti, type PfTopikDiikuti } from "@/lib/lanjutan";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Topik yang saya ikuti",
  description:
    "Arsip semua topik yang Anda ikuti di PRATA FAKTA: kategori, negara, dan isu — beserta tombol berhenti mengikuti.",
};

// Arsip topik yang diikuti (P1-5). Wajib login — redirect /masuk
// bila tamu (pola /saya). Daftar dari pf_followed_topics milik
// pengguna sendiri; tanpa data dummy.
export const instant = false;

const LABEL_TIPE: Record<string, string> = {
  kategori: "Kategori",
  negara: "Negara",
  isu: "Isu",
};

/** Nama tampil target (slug kategori → nama kategori). */
function namaTarget(t: PfTopikDiikuti): string {
  if (t.tipe === "kategori") {
    return KATEGORI_UTAMA.find((k) => k.slug === t.target)?.nama ?? t.target;
  }
  return t.target;
}

/** Tautan ke permukaan topik itu (jujur: bila target negara berupa
 *  nama — bukan kode — tautannya ke daftar negara, karena rute
 *  /negara/[kode] memakai kode ISO-2). */
function tautanTopik(t: PfTopikDiikuti): string {
  if (t.tipe === "kategori") return `/kategori/${t.target}`;
  if (t.tipe === "negara") {
    return /^[A-Za-z]{2}$/.test(t.target)
      ? `/negara/${t.target.toUpperCase()}`
      : "/negara";
  }
  return `/arsip?q=${encodeURIComponent(t.target)}`;
}

export default async function TopikSayaArsip() {
  const supabase = await createClient();
  let penggunaId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) redirect("/masuk");

  const topik = await getTopikDiikuti(penggunaId);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-topik-saya">
        <span className="hero-label">Saya · Topik</span>
        <h1 id="judul-topik-saya">Topik yang saya ikuti</h1>
        <p>
          {topik.length === 0
            ? "Semua kategori, negara, dan isu yang Anda ikuti — artikel baru pada topik ini memunculkan notifikasi (bila sakelar notifikasi topik aktif)."
            : `${topik.length} topik Anda ikuti — artikel baru pada topik ini memunculkan notifikasi (bila sakelar notifikasi topik aktif).`}
        </p>
        <p>
          <Link className="tombol tombol-hantu" href="/saya">
            ← Kembali ke Saya
          </Link>{" "}
          <Link className="tombol tombol-hantu" href="/feed-saya">
            Ikuti topik lain
          </Link>
        </p>
      </section>

      {topik.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Anda belum mengikuti topik apa pun."
            pesan="Ikuti kategori dari halaman kategori, negara dari halaman profil negara, atau isu dari Feed Saya — topik yang Anda ikuti akan terkumpul di sini."
            aksi={
              <Link className="tombol" href="/feed-saya">
                Buka Feed Saya
              </Link>
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar topik yang diikuti">
          <ul
            style={{
              display: "grid",
              gap: 12,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {topik.map((t) => (
              <li key={t.id} className="kartu" style={{ margin: 0 }}>
                <span className="kartu-kategori">
                  {LABEL_TIPE[t.tipe] ?? t.tipe}
                </span>
                <Link className="kartu-judul" href={tautanTopik(t)}>
                  {namaTarget(t)}
                </Link>
                <span style={{ marginTop: 8 }}>
                  <TombolIkutiTopik
                    tipe={t.tipe as "kategori" | "negara" | "isu"}
                    target={t.target}
                    mengikutiAwal
                    mengikutiId={t.id}
                    masuk
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
