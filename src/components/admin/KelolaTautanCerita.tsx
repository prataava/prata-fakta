// Pengelola tautan cerita admin (F-S8) — dipindah dari
// src/app/admin/event/page.tsx tanpa mengubah logika: tautkan /
// hapus peristiwa dan berita terkait satu cerita.
"use client";

import { useState } from "react";
import TombolAksi from "@/components/admin/TombolAksi";
import type {
  ArtikelPilihan,
  CeritaAdmin,
} from "@/components/admin/FormCerita";
import type { EventAdmin } from "@/components/admin/FormEvent";
import { formatTanggal } from "@/lib/format";

export default function KelolaTautanCerita({
  cerita,
  events,
  artikelTerbit,
  onSelesai,
}: {
  cerita: CeritaAdmin;
  events: EventAdmin[];
  artikelTerbit: ArtikelPilihan[];
  onSelesai: () => void;
}) {
  const [eventId, setEventId] = useState("");
  const [urutan, setUrutan] = useState("0");
  const [catatan, setCatatan] = useState("");
  const [artikelId, setArtikelId] = useState("");
  const [peran, setPeran] = useState("terkait");
  const [pesan, setPesan] = useState("");
  const [loading, setLoading] = useState(false);

  async function tambahTautan(
    aksi: "tambah_event" | "tambah_artikel",
    payload: Record<string, unknown>,
  ) {
    setLoading(true);
    setPesan("");
    try {
      const res = await fetch(`/api/admin/cerita/${cerita.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi, ...payload }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}).`);
        return;
      }
      setPesan("Tautan berhasil ditambah.");
      onSelesai();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  const eventSudahDitaut = new Set(cerita.tautan_event.map((t) => t.event_id));
  const artikelSudahDitaut = new Set(
    cerita.tautan_artikel.map((t) => t.artikel_id),
  );

  return (
    <div style={{ marginTop: 12 }}>
      {pesan && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <h4>Peristiwa dalam cerita ({cerita.tautan_event.length})</h4>
      {cerita.tautan_event.length === 0 ? (
        <p>Belum ada peristiwa yang ditautkan.</p>
      ) : (
        <ul>
          {cerita.tautan_event.map((t) => (
            <li key={t.id}>
              {t.urutan}. {t.judul ?? t.event_id} —{" "}
              {formatTanggal(t.dimulai_pada)}
              {t.catatan ? ` · ${t.catatan}` : ""}{" "}
              <TombolAksi
                url={`/api/admin/cerita/${cerita.id}`}
                method="PATCH"
                body={{ aksi: "hapus_event", event_id: t.event_id }}
                label="Hapus tautan"
                labelLoading="Menghapus…"
                varian="hantu"
                onSelesai={onSelesai}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="formulir"
        style={{ maxWidth: "100%" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!eventId) return;
          void tambahTautan("tambah_event", {
            event_id: eventId,
            urutan: Number(urutan) || 0,
            catatan: catatan.trim() || null,
          });
        }}
      >
        <label>
          Tambah peristiwa
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">— pilih event —</option>
            {events
              .filter((ev) => !eventSudahDitaut.has(ev.id))
              .map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.judul} ({formatTanggal(ev.dimulai_pada)})
                </option>
              ))}
          </select>
        </label>
        <label>
          Urutan
          <input
            type="number"
            step={1}
            value={urutan}
            onChange={(e) => setUrutan(e.target.value)}
          />
        </label>
        <label>
          Catatan redaksi (opsional)
          <input
            type="text"
            maxLength={500}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
          />
        </label>
        <button
          className="tombol"
          type="submit"
          disabled={loading || !eventId}
        >
          {loading ? "Menyimpan…" : "Tautkan peristiwa"}
        </button>
      </form>

      <h4 style={{ marginTop: 16 }}>
        Berita terkait ({cerita.tautan_artikel.length})
      </h4>
      {cerita.tautan_artikel.length === 0 ? (
        <p>Belum ada berita yang ditautkan.</p>
      ) : (
        <ul>
          {cerita.tautan_artikel.map((t) => (
            <li key={t.id}>
              {t.judul ?? t.artikel_id} · peran: {t.peran}{" "}
              <TombolAksi
                url={`/api/admin/cerita/${cerita.id}`}
                method="PATCH"
                body={{ aksi: "hapus_artikel", artikel_id: t.artikel_id }}
                label="Hapus tautan"
                labelLoading="Menghapus…"
                varian="hantu"
                onSelesai={onSelesai}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="formulir"
        style={{ maxWidth: "100%" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!artikelId) return;
          void tambahTautan("tambah_artikel", {
            artikel_id: artikelId,
            peran,
          });
        }}
      >
        <label>
          Tambah berita (hanya artikel terbit)
          <select
            value={artikelId}
            onChange={(e) => setArtikelId(e.target.value)}
          >
            <option value="">— pilih artikel —</option>
            {artikelTerbit
              .filter((a) => !artikelSudahDitaut.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.judul}
                </option>
              ))}
          </select>
        </label>
        <label>
          Peran
          <select value={peran} onChange={(e) => setPeran(e.target.value)}>
            <option value="terkait">Terkait</option>
            <option value="pembaruan">Pembaruan</option>
            <option value="latar">Latar</option>
          </select>
        </label>
        <button
          className="tombol"
          type="submit"
          disabled={loading || !artikelId}
        >
          {loading ? "Menyimpan…" : "Tautkan berita"}
        </button>
      </form>
    </div>
  );
}
