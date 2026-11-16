import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { formatTanggalJam } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import TombolTandaiDibaca from "./TombolTandaiDibaca";
import FormPreferensiNotifikasi from "./FormPreferensiNotifikasi";
import PengalihPush from "./PengalihPush";

export const metadata: Metadata = {
  title: "Notifikasi — Saya",
  description:
    "Daftar notifikasi Anda: artikel topik yang diikuti, jawaban pertanyaan, tindak lanjut koreksi, dan episode podcast baru.",
};

export const instant = false;

type Notifikasi = {
  id: string;
  jenis: string;
  judul: string;
  isi: string | null;
  tautan: string | null;
  dibaca: boolean;
  dibuat_pada: string;
};

function formatTanggal(waktu: string | null): string {
  return formatTanggalJam(waktu);
}

export default async function HalamanNotifikasi() {
  const supabase = await createClient();
  let penggunaId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) redirect("/masuk");

  let tersedia = true;
  let notifikasi: Notifikasi[] = [];
  const { data, error } = await supabase
    .from("pf_notifications")
    .select("id, jenis, judul, isi, tautan, dibaca, dibuat_pada")
    .eq("user_id", penggunaId)
    .order("dibuat_pada", { ascending: false })
    .limit(50);
  if (error) {
    tersedia = false;
  } else {
    notifikasi = (data ?? []) as Notifikasi[];
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Notifikasi belum tersedia"
          pesan="Tabel pf_notifications tidak dapat dibaca — migrasi Fase 6 mungkin belum dijalankan di Supabase."
        />
        <p>
          <Link className="tombol" href="/saya">
            Kembali ke Saya
          </Link>
        </p>
      </section>
    );
  }

  const belumDibaca = notifikasi.filter((n) => !n.dibaca).length;

  return (
    <div>
      <section className="seksi" aria-labelledby="judul-notifikasi">
        <div className="seksi-kepala">
          <h2 id="judul-notifikasi">Notifikasi</h2>
        </div>
        <p className="artikel-meta-kecil">
          {notifikasi.length === 0
            ? "Belum ada notifikasi. Notifikasi muncul bila ada artikel baru pada topik yang Anda ikuti, jawaban atas pertanyaan Anda, tindak lanjut laporan koreksi Anda, atau episode podcast baru."
            : `${notifikasi.length} notifikasi terbaru · ${belumDibaca} belum dibaca.`}
        </p>
        {belumDibaca > 0 ? <TombolTandaiDibaca /> : null}
        {notifikasi.length === 0 ? (
          <EmptyState
            judul="Belum ada notifikasi."
            pesan="Ikuti topik dari Feed Saya, ajukan pertanyaan di /tanya, atau laporkan koreksi pada artikel — notifikasi dari kejadian itu muncul di sini."
            aksi={
              <Link className="tombol" href="/feed-saya">
                Buka Feed Saya
              </Link>
            }
          />
        ) : (
          <ul
            style={{
              display: "grid",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {notifikasi.map((n) => (
              <li
                key={n.id}
                className="kartu"
                style={{
                  margin: 0,
                  opacity: n.dibaca ? 0.75 : 1,
                }}
              >
                <span className="kartu-kategori">
                  {n.jenis}
                  {n.dibaca ? "" : " · baru"}
                </span>
                <span className="kartu-judul">
                  {n.tautan ? (
                    <Link href={n.tautan}>{n.judul}</Link>
                  ) : (
                    n.judul
                  )}
                </span>
                {n.isi ? <span className="kartu-teks">{n.isi}</span> : null}
                <span className="kartu-meta">
                  {formatTanggal(n.dibuat_pada)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link className="tombol tombol-hantu" href="/saya">
            Kembali ke Saya
          </Link>
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-preferensi">
        <div className="seksi-kepala">
          <h2 id="judul-preferensi">Preferensi notifikasi</h2>
        </div>
        <FormPreferensiNotifikasi />
      </section>

      <section className="seksi" aria-labelledby="judul-push">
        <div className="seksi-kepala">
          <h2 id="judul-push">Notifikasi push</h2>
        </div>
        <PengalihPush />
      </section>
    </div>
  );
}
