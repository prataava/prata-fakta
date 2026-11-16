// Halaman admin Event & Cerita (Story Tracker + Historical Archive,
// Fase 8 Gel. 2) — PRASYARAT operasional area 2/12: tanpa halaman
// ini editor tidak bisa membuat event maupun cerita.
// Client Component: memuat daftar lewat GET /api/admin/event +
// GET /api/admin/cerita (service role, termasuk draf) dan menulis
// lewat route yang sama. Guard staf sudah ditegakkan layout
// /admin (server); route API menegakkannya sekali lagi.
// Formulir dipindah ke src/components/admin/ (F-S8): FormEvent,
// FormCerita, KelolaTautanCerita — halaman ini tinggal menyusun.
"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";
import FormEvent, { type EventAdmin } from "@/components/admin/FormEvent";
import FormCerita, {
  type ArtikelPilihan,
  type CeritaAdmin,
} from "@/components/admin/FormCerita";
import KelolaTautanCerita from "@/components/admin/KelolaTautanCerita";
import { formatTanggal } from "@/lib/format";

/* ================= Halaman ================= */

export default function AdminEvent() {
  const [events, setEvents] = useState<EventAdmin[]>([]);
  const [cerita, setCerita] = useState<CeritaAdmin[]>([]);
  const [artikelTerbit, setArtikelTerbit] = useState<ArtikelPilihan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  const muat = useCallback(async () => {
    setGalat("");
    try {
      const [resEvent, resCerita] = await Promise.all([
        fetch("/api/admin/event?limit=100"),
        fetch("/api/admin/cerita"),
      ]);
      let dEvent: {
        ok?: boolean;
        error?: string;
        events?: EventAdmin[];
      } = {};
      let dCerita: {
        ok?: boolean;
        error?: string;
        cerita?: CeritaAdmin[];
        artikel_terbit?: ArtikelPilihan[];
      } = {};
      try {
        dEvent = (await resEvent.json()) as typeof dEvent;
      } catch {
        // Bukan JSON.
      }
      try {
        dCerita = (await resCerita.json()) as typeof dCerita;
      } catch {
        // Bukan JSON.
      }
      if (!resEvent.ok || dEvent.ok === false) {
        setGalat(
          dEvent.error ?? `Gagal memuat event (${resEvent.status}).`,
        );
      } else {
        setEvents(dEvent.events ?? []);
      }
      if (!resCerita.ok || dCerita.ok === false) {
        setGalat(
          (galatSebelumnya) =>
            galatSebelumnya ||
            (dCerita.error ??
              `Gagal memuat cerita (${resCerita.status}).`),
        );
      } else {
        setCerita(dCerita.cerita ?? []);
        setArtikelTerbit(dCerita.artikel_terbit ?? []);
      }
    } catch {
      setGalat("Tidak dapat terhubung ke server.");
    } finally {
      setMemuat(false);
    }
  }, []);

  // Muat awal mengikuti pola TabelPengguna (lihat /admin/akademi):
  // fetch di dalam effect dengan .then() — setState berjalan di
  // callback asinkron, bukan sinkron di badan effect (dilarang lint
  // react-hooks/set-state-in-effect). `muat` dipakai tombol
  // "Coba lagi" dan sesudah simpan/hapus.
  useEffect(() => {
    let batal = false;
    Promise.all([
      fetch("/api/admin/event?limit=100"),
      fetch("/api/admin/cerita"),
    ])
      .then(async ([resEvent, resCerita]) => {
        let dEvent: {
          ok?: boolean;
          error?: string;
          events?: EventAdmin[];
        } = {};
        let dCerita: {
          ok?: boolean;
          error?: string;
          cerita?: CeritaAdmin[];
          artikel_terbit?: ArtikelPilihan[];
        } = {};
        try {
          dEvent = (await resEvent.json()) as typeof dEvent;
        } catch {
          // Bukan JSON.
        }
        try {
          dCerita = (await resCerita.json()) as typeof dCerita;
        } catch {
          // Bukan JSON.
        }
        if (batal) return;
        if (!resEvent.ok || dEvent.ok === false) {
          setGalat(
            dEvent.error ?? `Gagal memuat event (${resEvent.status}).`,
          );
        } else {
          setEvents(dEvent.events ?? []);
        }
        if (!resCerita.ok || dCerita.ok === false) {
          setGalat(
            (galatSebelumnya) =>
              galatSebelumnya ||
              (dCerita.error ??
                `Gagal memuat cerita (${resCerita.status}).`),
          );
        } else {
          setCerita(dCerita.cerita ?? []);
          setArtikelTerbit(dCerita.artikel_terbit ?? []);
        }
      })
      .catch(() => {
        if (!batal) setGalat("Tidak dapat terhubung ke server.");
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  return (
    <>
      <section className="seksi" aria-labelledby="judul-event-baru">
        <div className="seksi-kepala">
          <h2 id="judul-event-baru">Tambah Event</h2>
          <p>
            Event adalah peristiwa yang muncul di Timeline, Peta, dan
            Arsip Sejarah — dan bisa dikelompokkan menjadi cerita.
          </p>
        </div>
        <article className="kartu">
          <FormEvent onSelesai={muat} />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-event">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-event">Daftar Event</h2>
        </div>
        {memuat ? (
          <div className="kerangka" role="status" aria-label="Memuat daftar event…" />
        ) : galat ? (
          <EmptyState
            judul="Daftar event belum tersedia"
            pesan={galat}
          />
        ) : events.length === 0 ? (
          <EmptyState
            judul="Belum ada event"
            pesan="Belum ada peristiwa yang tercatat. Tambah event pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Dimulai</th>
                  <th>Era</th>
                  <th>Penting</th>
                  <th>Negara</th>
                  <th>Lokasi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.judul}</td>
                    <td>{formatTanggal(ev.dimulai_pada)}</td>
                    <td>{ev.era ?? "—"}</td>
                    <td>{ev.penting ? "Ya" : "Tidak"}</td>
                    <td>{ev.negara_kode ?? "—"}</td>
                    <td>{ev.lokasi_teks ?? "—"}</td>
                    <td>
                      <span className="admin-aksi">
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormEvent event={ev} onSelesai={muat} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/admin/event/${ev.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus event "${ev.judul}"? Tautan cerita dan kronologinya ikut terhapus.`}
                          onSelesai={muat}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-cerita-baru">
        <div className="seksi-kepala">
          <h2 id="judul-cerita-baru">Tambah Cerita</h2>
          <p>
            Cerita mengelompokkan beberapa event + berita terkait
            menjadi satu alur yang diikuti pembaca. Cerita baru
            selalu berstatus draf sampai diterbitkan.
          </p>
        </div>
        <article className="kartu">
          <FormCerita onSelesai={muat} />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-cerita">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-cerita">Daftar Cerita</h2>
        </div>
        {memuat ? (
          <div className="kerangka" role="status" aria-label="Memuat daftar cerita…" />
        ) : galat ? (
          <EmptyState
            judul="Daftar cerita belum tersedia"
            pesan={galat}
          />
        ) : cerita.length === 0 ? (
          <EmptyState
            judul="Belum ada cerita"
            pesan="Belum ada cerita yang dibuat. Tambah cerita pertama lewat formulir di atas, lalu tautkan peristiwa dan berita di bawahnya."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Perkembangan</th>
                  <th>Event</th>
                  <th>Berita</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {cerita.map((c) => (
                  <tr key={c.id}>
                    <td>{c.judul}</td>
                    <td>{c.slug}</td>
                    <td>{c.status}</td>
                    <td>{c.status_perkembangan}</td>
                    <td>{c.jumlah_event}</td>
                    <td>{c.jumlah_artikel}</td>
                    <td>
                      <span className="admin-aksi">
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormCerita cerita={c} onSelesai={muat} />
                          </div>
                        </details>
                        <details>
                          <summary>Kelola tautan</summary>
                          <KelolaTautanCerita
                            cerita={c}
                            events={events}
                            artikelTerbit={artikelTerbit}
                            onSelesai={muat}
                          />
                        </details>
                        <TombolAksi
                          url={`/api/admin/cerita/${c.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus cerita "${c.judul}"? Tautan dan pengikutnya ikut terhapus.`}
                          onSelesai={muat}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
