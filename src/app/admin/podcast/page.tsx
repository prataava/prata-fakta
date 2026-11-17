// Admin Podcast — kelola episode (staf).
// Client component: memuat /api/admin/podcast, membuat episode
// baru (pilih Daily Brief / artikel sendiri), mengubah status,
// dan menghapus. audio_url opsional — episode tanpa audio tetap
// jalan via TTS browser. Pembuatan file audio server = BELUM
// BISA (tanpa layanan TTS server gratis).
"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import DialogKonfirmasi from "@/components/admin/DialogKonfirmasi";

type Episode = {
  id: string;
  slug: string;
  judul: string;
  deskripsi: string | null;
  jenis: string;
  teks_naskah: string;
  audio_url: string | null;
  durasi_detik: number | null;
  tanggal: string;
  status: string;
  artikel_id: string | null;
  brief_tanggal: string | null;
};

type Pilihan = { nilai: string; label: string };

const JENIS = ["brief", "artikel", "mingguan"];

export default function AdminPodcast() {
  const [daftar, setDaftar] = useState<Episode[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  // Episode yang menunggu konfirmasi hapus (dialog dalam-halaman,
  // bukan window.confirm — dialog bawaan ditolak otomatisasi).
  const [hapusTarget, setHapusTarget] = useState<Episode | null>(null);
  const [briefPilihan, setBriefPilihan] = useState<Pilihan[]>([]);
  const [artikelPilihan, setArtikelPilihan] = useState<Pilihan[]>([]);

  // Formulir episode baru.
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jenis, setJenis] = useState("artikel");
  const [teksNaskah, setTeksNaskah] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [durasi, setDurasi] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [status, setStatus] = useState("draft");
  const [artikelId, setArtikelId] = useState("");
  const [briefTanggal, setBriefTanggal] = useState("");

  // Muat awal mengikuti pola TabelPengguna (lihat /admin/akademi):
  // fetch di dalam effect dengan .then() — setState berjalan di
  // callback asinkron, bukan sinkron di badan effect (dilarang lint
  // react-hooks/set-state-in-effect).
  useEffect(() => {
    let batal = false;
    fetch("/api/admin/podcast")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          episode?: Episode[];
          error?: string;
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setGalat(data.error ?? "Daftar episode belum bisa dimuat.");
          setDaftar([]);
          return;
        }
        setDaftar(data.episode ?? []);
      })
      .catch(() => {
        if (!batal) {
          setGalat(
            "Daftar episode belum bisa dimuat. Periksa koneksi lalu coba lagi.",
          );
          setDaftar([]);
        }
      });
    // Pilihan sumber episode (best-effort; gagal dimuat = opsi
    // kosong, staf tetap bisa mengetik tanggal/UUID manual).
    fetch("/api/admin/brief")
      .then((r) => r.json())
      .then((d: { ok?: boolean; brief?: { tanggal: string }[] }) => {
        if (d.ok && Array.isArray(d.brief)) {
          setBriefPilihan(
            d.brief.map((b) => ({
              nilai: b.tanggal,
              label: `Daily Brief ${b.tanggal}`,
            })),
          );
        }
      })
      .catch(() => undefined);
    fetch("/api/admin/artikel?status=terbit&limit=100")
      .then((r) => r.json())
      .then((d: { ok?: boolean; artikel?: { id: string; judul: string }[] }) => {
        if (d.ok && Array.isArray(d.artikel)) {
          setArtikelPilihan(
            d.artikel.map((a) => ({ nilai: a.id, label: a.judul })),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);

  async function buat(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setPesan(null);
    try {
      const res = await fetch("/api/admin/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul,
          deskripsi,
          jenis,
          teks_naskah: teksNaskah,
          audio_url: audioUrl || undefined,
          durasi_detik: durasi ? Number(durasi) : undefined,
          tanggal: tanggal || undefined,
          status,
          artikel_id: artikelId || undefined,
          brief_tanggal: briefTanggal || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        episode?: Episode;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.episode) {
        setPesan(data.error ?? "Gagal membuat episode.");
        return;
      }
      setDaftar((lama) => [data.episode!, ...(lama ?? [])]);
      setPesan(`Episode “${data.episode.judul}” dibuat (${data.episode.status}).`);
      setJudul("");
      setDeskripsi("");
      setTeksNaskah("");
      setAudioUrl("");
      setDurasi("");
      setTanggal("");
      setArtikelId("");
      setBriefTanggal("");
    } catch {
      setPesan("Gagal membuat episode. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  async function ubahStatus(ep: Episode) {
    setSibuk(true);
    const baru = ep.status === "terbit" ? "draft" : "terbit";
    try {
      const res = await fetch(`/api/admin/podcast/${ep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: baru }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        episode?: Episode;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.episode) {
        setPesan(data.error ?? "Gagal mengubah status.");
        return;
      }
      setDaftar((lama) =>
        (lama ?? []).map((x) => (x.id === ep.id ? data.episode! : x)),
      );
      setPesan(`Episode “${ep.judul}” kini ${baru}.`);
    } catch {
      setPesan("Gagal mengubah status. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(ep: Episode) {
    setHapusTarget(null);
    setSibuk(true);
    try {
      const res = await fetch(`/api/admin/podcast/${ep.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Gagal menghapus episode.");
        return;
      }
      setDaftar((lama) => (lama ?? []).filter((x) => x.id !== ep.id));
      setPesan(`Episode “${ep.judul}” dihapus.`);
    } catch {
      setPesan("Gagal menghapus episode. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <section className="seksi" aria-labelledby="judul-admin-podcast">
      <div className="seksi-kepala">
        <h2 id="judul-admin-podcast">Podcast</h2>
        <p>
          Episode dibuat dari Daily Brief dan artikel PRATA FAKTA sendiri.
          audio_url opsional — episode tanpa audio tetap diputar via TTS
          browser. Pembuatan file audio server belum bisa dilakukan
          (tanpa layanan TTS server gratis).
        </p>
      </div>

      <form className="formulir" onSubmit={buat}>
        <h3>Episode baru</h3>
        <label>
          Judul
          <input
            type="text"
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            required
            maxLength={300}
          />
        </label>
        <label>
          Deskripsi
          <textarea
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            rows={2}
          />
        </label>
        <label>
          Jenis
          <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
            {JENIS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </label>
        <label>
          Teks naskah (dibacakan TTS bila tanpa audio)
          <textarea
            value={teksNaskah}
            onChange={(e) => setTeksNaskah(e.target.value)}
            rows={6}
            required
            maxLength={50000}
          />
        </label>
        <label>
          URL audio rekaman (opsional — kosong = TTS browser)
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://…/episode.mp3"
          />
        </label>
        <label>
          Durasi (detik, opsional)
          <input
            type="number"
            min={0}
            value={durasi}
            onChange={(e) => setDurasi(e.target.value)}
          />
        </label>
        <label>
          Tanggal (YYYY-MM-DD, kosong = hari ini)
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="terbit">terbit</option>
          </select>
        </label>
        <label>
          Dari Daily Brief (opsional)
          <select
            value={briefTanggal}
            onChange={(e) => setBriefTanggal(e.target.value)}
          >
            <option value="">— tanpa brief —</option>
            {briefPilihan.map((b) => (
              <option key={b.nilai} value={b.nilai}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dari artikel (opsional)
          <select
            value={artikelId}
            onChange={(e) => setArtikelId(e.target.value)}
          >
            <option value="">— tanpa artikel —</option>
            {artikelPilihan.map((a) => (
              <option key={a.nilai} value={a.nilai}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="tombol tombol-primer"
          disabled={sibuk}
        >
          Buat episode
        </button>
        {pesan && (
          <span className="kartu-meta" role="status">
            {pesan}
          </span>
        )}
      </form>

      {daftar === null ? (
        <p role="status">Memuat episode…</p>
      ) : daftar.length === 0 ? (
        <EmptyState
          judul="Belum ada episode."
          pesan={galat ?? "Belum ada episode podcast. Buat episode pertama lewat formulir di atas."}
        />
      ) : (
        <div className="grid-berita" style={{ marginTop: 16 }}>
          {daftar.map((ep) => (
            <article className="kartu" key={ep.id}>
              <span className="kartu-kategori">
                {ep.jenis} · {ep.status} ·{" "}
                {ep.audio_url ? "Audio rekaman" : "Audio TTS browser"}
              </span>
              <span className="kartu-judul">{ep.judul}</span>
              {ep.deskripsi && <span className="kartu-teks">{ep.deskripsi}</span>}
              <span className="kartu-meta">
                {ep.tanggal} · {ep.slug}
                {ep.brief_tanggal ? ` · Brief ${ep.brief_tanggal}` : ""}
              </span>
              <span>
                <button
                  type="button"
                  className="tombol"
                  disabled={sibuk}
                  onClick={() => ubahStatus(ep)}
                >
                  {ep.status === "terbit" ? "Jadikan draf" : "Terbitkan"}
                </button>{" "}
                <button
                  type="button"
                  className="tombol"
                  disabled={sibuk}
                  onClick={() => setHapusTarget(ep)}
                >
                  Hapus
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
      <DialogKonfirmasi
        terbuka={hapusTarget !== null}
        judul="Hapus episode?"
        pesan={
          hapusTarget
            ? `Hapus episode “${hapusTarget.judul}”? Riwayat dan playlist episode ini ikut terhapus.`
            : ""
        }
        labelKonfirmasi="Ya, hapus"
        varian="bahaya"
        sibuk={sibuk}
        onKonfirmasi={() => {
          if (hapusTarget) void hapus(hapusTarget);
        }}
        onTutup={() => setHapusTarget(null)}
      />
    </section>
  );
}
