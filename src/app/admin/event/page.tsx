// Halaman admin Event & Cerita (Story Tracker + Historical Archive,
// Fase 8 Gel. 2) — PRASYARAT operasional area 2/12: tanpa halaman
// ini editor tidak bisa membuat event maupun cerita.
// Client Component: memuat daftar lewat GET /api/admin/event +
// GET /api/admin/cerita (service role, termasuk draf) dan menulis
// lewat route yang sama. Guard staf sudah ditegakkan layout
// /admin (server); route API menegakkannya sekali lagi.
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";

type EventAdmin = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  lintang: number | null;
  bujur: number | null;
  dimulai_pada: string | null;
  berakhir_pada: string | null;
  dampak: string | null;
  sumber_url: string | null;
  era: string | null;
  penting: boolean;
  negara_kode: string | null;
};

type TautanEvent = {
  id: string;
  event_id: string;
  urutan: number;
  catatan: string | null;
  judul: string | null;
  dimulai_pada: string | null;
};

type TautanArtikel = {
  id: string;
  artikel_id: string;
  peran: string;
  judul: string | null;
  slug: string | null;
};

type CeritaAdmin = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  status: string;
  status_perkembangan: string;
  jumlah_event: number;
  jumlah_artikel: number;
  tautan_event: TautanEvent[];
  tautan_artikel: TautanArtikel[];
};

type ArtikelPilihan = { id: string; slug: string; judul: string };

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** ISO timestamptz → nilai input datetime-local (YYYY-MM-DDTHH:mm). */
function keInputTanggal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/* ================= Formulir event ================= */

function FormEventBaru({
  event,
  onSelesai,
}: {
  event?: EventAdmin | null;
  onSelesai: () => void;
}) {
  const edit = Boolean(event);
  const [judul, setJudul] = useState(event?.judul ?? "");
  const [ringkasan, setRingkasan] = useState(event?.ringkasan ?? "");
  const [dimulai, setDimulai] = useState(keInputTanggal(event?.dimulai_pada ?? null));
  const [berakhir, setBerakhir] = useState(keInputTanggal(event?.berakhir_pada ?? null));
  const [lokasi, setLokasi] = useState(event?.lokasi_teks ?? "");
  const [era, setEra] = useState(event?.era ?? "");
  const [penting, setPenting] = useState(event?.penting ?? false);
  const [negara, setNegara] = useState(event?.negara_kode ?? "");
  const [sumberUrl, setSumberUrl] = useState(event?.sumber_url ?? "");
  const [dampak, setDampak] = useState(event?.dampak ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">("idle");
  const [pesan, setPesan] = useState("");

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      ringkasan: ringkasan.trim() || null,
      dimulai_pada: dimulai || null,
      berakhir_pada: berakhir || null,
      lokasi_teks: lokasi.trim() || null,
      era: era.trim() || null,
      penting,
      negara_kode: negara.trim().toUpperCase() || null,
      sumber_url: sumberUrl.trim() || null,
      dampak: dampak.trim() || null,
    };
    try {
      const res = await fetch(
        edit ? `/api/admin/event/${event?.id}` : "/api/admin/event",
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan event (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(edit ? "Event berhasil diubah." : "Event berhasil ditambah.");
      if (!edit) {
        setJudul("");
        setRingkasan("");
        setDimulai("");
        setBerakhir("");
        setLokasi("");
        setEra("");
        setPenting(false);
        setNegara("");
        setSumberUrl("");
        setDampak("");
      }
      onSelesai();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {status === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {status === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Judul event
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Pemilihan umum 2024"
        />
      </label>
      <label>
        Ringkasan
        <textarea
          rows={3}
          maxLength={2000}
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
        />
      </label>
      <label>
        Dimulai pada
        <input
          type="datetime-local"
          required={!edit}
          value={dimulai}
          onChange={(e) => setDimulai(e.target.value)}
        />
      </label>
      <label>
        Berakhir pada (opsional)
        <input
          type="datetime-local"
          value={berakhir}
          onChange={(e) => setBerakhir(e.target.value)}
        />
      </label>
      <label>
        Lokasi (teks)
        <input
          type="text"
          maxLength={200}
          value={lokasi}
          onChange={(e) => setLokasi(e.target.value)}
          placeholder="Contoh: Jakarta"
        />
      </label>
      <label>
        Era (opsional — untuk Arsip Sejarah)
        <input
          type="text"
          maxLength={60}
          value={era}
          onChange={(e) => setEra(e.target.value)}
          placeholder="Contoh: Reformasi"
        />
      </label>
      <label>
        Kode negara (opsional, 2 huruf — mis. ID)
        <input
          type="text"
          maxLength={2}
          value={negara}
          onChange={(e) => setNegara(e.target.value)}
          placeholder="ID"
        />
      </label>
      <label>
        URL sumber (opsional)
        <input
          type="url"
          value={sumberUrl}
          onChange={(e) => setSumberUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Dampak (opsional)
        <textarea
          rows={2}
          maxLength={2000}
          value={dampak}
          onChange={(e) => setDampak(e.target.value)}
        />
      </label>
      <label
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <input
          type="checkbox"
          checked={penting}
          onChange={(e) => setPenting(e.target.checked)}
        />
        Event penting (ditampilkan di Arsip Sejarah bila difilter)
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah event"}
      </button>
    </form>
  );
}

/* ================= Formulir cerita ================= */

function FormCeritaBaru({
  cerita,
  onSelesai,
}: {
  cerita?: CeritaAdmin | null;
  onSelesai: () => void;
}) {
  const edit = Boolean(cerita);
  const [judul, setJudul] = useState(cerita?.judul ?? "");
  const [slug, setSlug] = useState(cerita?.slug ?? "");
  const [ringkasan, setRingkasan] = useState(cerita?.ringkasan ?? "");
  const [status, setStatus] = useState(cerita?.status ?? "draft");
  const [perkembangan, setPerkembangan] = useState(
    cerita?.status_perkembangan ?? "berkembang",
  );
  const [statusKirim, setStatusKirim] = useState<
    "idle" | "loading" | "error" | "sukses"
  >("idle");
  const [pesan, setPesan] = useState("");

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatusKirim("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      ringkasan: ringkasan.trim() || null,
      status,
      status_perkembangan: perkembangan,
    };
    if (slug.trim() !== "") payload.slug = slug.trim().toLowerCase();
    try {
      const res = await fetch(
        edit ? `/api/admin/cerita/${cerita?.id}` : "/api/admin/cerita",
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatusKirim("error");
        setPesan(data.error ?? `Gagal menyimpan cerita (${res.status}).`);
        return;
      }
      setStatusKirim("sukses");
      setPesan(edit ? "Cerita berhasil diubah." : "Cerita berhasil ditambah.");
      if (!edit) {
        setJudul("");
        setSlug("");
        setRingkasan("");
        setStatus("draft");
        setPerkembangan("berkembang");
      }
      onSelesai();
    } catch {
      setStatusKirim("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {statusKirim === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {statusKirim === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Judul cerita
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Krisis iklim global"
        />
      </label>
      <label>
        Slug {edit ? "" : "(opsional — dibuat otomatis dari judul bila kosong)"}
        <input
          type="text"
          maxLength={100}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="contoh: krisis-iklim-global"
        />
      </label>
      <label>
        Ringkasan
        <textarea
          rows={3}
          maxLength={2000}
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
        />
      </label>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">Draf (belum terlihat publik)</option>
          <option value="terbit">Terbit</option>
        </select>
      </label>
      <label>
        Status perkembangan
        <select
          value={perkembangan}
          onChange={(e) => setPerkembangan(e.target.value)}
        >
          <option value="berkembang">Masih berkembang</option>
          <option value="selesai">Selesai</option>
        </select>
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={statusKirim === "loading"}
      >
        {statusKirim === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah cerita"}
      </button>
    </form>
  );
}

/* ================= Pengelola tautan cerita ================= */

function KelolaTautanCerita({
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
          <FormEventBaru onSelesai={muat} />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-event">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-event">Daftar Event</h2>
        </div>
        {memuat ? (
          <p>Memuat…</p>
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
                            <FormEventBaru event={ev} onSelesai={muat} />
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
          <FormCeritaBaru onSelesai={muat} />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-cerita">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-cerita">Daftar Cerita</h2>
        </div>
        {memuat ? (
          <p>Memuat…</p>
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
                            <FormCeritaBaru cerita={c} onSelesai={muat} />
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
