import type { Metadata } from "next";
import Link from "next/link";
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
  if (!penggunaId) {
    // v28 — TAMU TIDAK LAGI DIALIHKAN: seksi push (PengalihPush)
    // memang dirancang untuk tamu — aktifkanPush() memakai
    // endpoint tamu POST /api/notifications/subscribe (user_id
    // NULL) dan PATCH /api/saya/preferensi hanya best-effort
    // (.catch). Sebelum v28, baris pengalihan ke /masuk di sini
    // membuat TIDAK ADA SATU PUN UI tamu yang bisa mencapai
    // endpoint itu — fitur langganan tamu praktis mati
    // (pf_push_subscriptions 0 sebelum dan sesudah uji).
    // Tamu HANYA melihat seksi push + ajakan masuk; daftar
    // notifikasi in-app + FormPreferensiNotifikasi tetap hanya
    // untuk pengguna masuk (di bawah).
    return (
      <div>
        <section className="seksi" aria-labelledby="judul-push">
          <div className="seksi-kepala">
            <h2 id="judul-push">Notifikasi push</h2>
          </div>
          <p className="artikel-meta-kecil">
            Aktifkan notifikasi push untuk menerima kabar terbaru —
            tanpa perlu masuk. Langganan tersimpan di perangkat ini.
          </p>
          <PengalihPush />
          <p className="artikel-meta-kecil">
            Sudah punya akun?{" "}
            <Link href="/masuk">Masuk</Link> untuk melihat daftar
            notifikasi in-app dan mengatur preferensi notifikasi.
          </p>
        </section>
      </div>
    );
  }

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
