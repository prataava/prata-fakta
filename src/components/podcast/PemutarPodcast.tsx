// Pemutar Podcast PRATA FAKTA — client component.
// Dua mode pemutaran, dipilih jujur berdasarkan data episode:
//  - audio_url ADA → <audio> native (file rekaman), dengan
//    kecepatan 0.75/1/1.25/1.5/2 dan posisi disimpan berkala.
//  - audio_url TIDAK ADA → TTS browser (SpeechSynthesis) atas
//    teks_naskah, pola PembacaSuara.tsx (pecah per kalimat,
//    suara id-ID bila ada). Pembuatan file audio server = BELUM
//    BISA (tanpa layanan TTS server gratis) — label "Audio TTS
//    browser" ditampilkan, bukan pura-pura rekaman.
// Riwayat posisi disimpan via POST /api/podcast/riwayat bila
// login (mode <audio>: tiap perubahan waktu ≥5 detik + saat
// jeda/selesai; mode TTS: hanya saat selesai, karena posisi
// detik TTS tidak dapat diukur jujur dari SpeechSynthesis).
// Tombol playlist ada di TombolPlaylist (dipakai halaman detail).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pecahUntukSuara } from "@/components/artikel/PembacaSuara";

const KECEPATAN: number[] = [0.75, 1, 1.25, 1.5, 2];

type StatusPutar = "berhenti" | "memutar" | "jeda";

function pilihSuaraIndonesia(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const suara = window.speechSynthesis.getVoices();
  return (
    suara.find((s) => s.lang.toLowerCase() === "id-id") ??
    suara.find((s) => s.lang.toLowerCase().startsWith("id")) ??
    null
  );
}

export default function PemutarPodcast({
  episodeId,
  judul,
  teksNaskah,
  audioUrl,
  durasiDetik,
  posisiAwal,
  sudahLogin,
}: {
  episodeId: string;
  judul: string;
  teksNaskah: string;
  audioUrl: string | null;
  durasiDetik: number | null;
  posisiAwal: number;
  sudahLogin: boolean;
}) {
  const [didukung, setDidukung] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StatusPutar>("berhenti");
  const [kecepatan, setKecepatan] = useState<number>(1);
  const [bagian, setBagian] = useState(0);
  const [posisiAudio, setPosisiAudio] = useState(posisiAwal);
  const [pesanRiwayat, setPesanRiwayat] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const potonganRef = useRef<string[]>([]);
  const kecepatanRef = useRef(kecepatan);
  const statusRef = useRef<StatusPutar>("berhenti");
  const terakhirSimpanRef = useRef(0);

  const potongan = pecahUntukSuara(teksNaskah);
  const adaTeks = potongan.length > 0;
  const modeAudio = !!audioUrl;

  useEffect(() => {
    const t = setTimeout(() => {
      setDidukung(
        typeof window !== "undefined" &&
          (modeAudio || "speechSynthesis" in window),
      );
    }, 0);
    return () => clearTimeout(t);
  }, [modeAudio]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const setStatusSemua = useCallback((s: StatusPutar) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const simpanRiwayat = useCallback(
    async (posisi: number, selesai: boolean) => {
      if (!sudahLogin) return;
      try {
        await fetch("/api/podcast/riwayat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episode_id: episodeId,
            posisi_detik: Math.floor(posisi),
            selesai,
          }),
        });
      } catch {
        setPesanRiwayat("Riwayat dengar gagal disimpan.");
      }
    },
    [episodeId, sudahLogin],
  );

  // ---------- Mode TTS ----------
  function ucapkanBagian(indeks: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const daftar = potonganRef.current;
    if (indeks >= daftar.length) {
      setStatusSemua("berhenti");
      setBagian(0);
      // Selesai dibacakan: simpan selesai (posisi = durasi bila
      // diketahui, sonst 0 — posisi detik TTS tak terukur jujur).
      void simpanRiwayat(durasiDetik ?? 0, true);
      return;
    }
    setBagian(indeks + 1);
    const ujaran = new SpeechSynthesisUtterance(daftar[indeks]);
    ujaran.lang = "id-ID";
    ujaran.rate = kecepatanRef.current;
    const suara = pilihSuaraIndonesia();
    if (suara) ujaran.voice = suara;
    ujaran.onend = () => {
      if (statusRef.current === "memutar") ucapkanBagian(indeks + 1);
    };
    ujaran.onerror = () => {
      setStatusSemua("berhenti");
      setBagian(0);
    };
    window.speechSynthesis.speak(ujaran);
  }

  function putarTts() {
    if (!didukung || !adaTeks) return;
    window.speechSynthesis.cancel();
    potonganRef.current = potongan;
    setStatusSemua("memutar");
    ucapkanBagian(0);
  }

  function jedaTts() {
    window.speechSynthesis.pause();
    setStatusSemua("jeda");
  }

  function lanjutkanTts() {
    window.speechSynthesis.resume();
    setStatusSemua("memutar");
  }

  function berhentiTts() {
    window.speechSynthesis.cancel();
    setStatusSemua("berhenti");
    setBagian(0);
  }

  function gantiKecepatan(nilai: number) {
    setKecepatan(nilai);
    kecepatanRef.current = nilai;
    if (modeAudio) {
      if (audioRef.current) audioRef.current.playbackRate = nilai;
    } else if (statusRef.current === "memutar") {
      window.speechSynthesis.cancel();
      ucapkanBagian(0);
    }
  }

  // ---------- Mode <audio> ----------
  function saatWaktuBerubah() {
    const a = audioRef.current;
    if (!a) return;
    const pos = a.currentTime;
    setPosisiAudio(pos);
    if (pos - terakhirSimpanRef.current >= 5) {
      terakhirSimpanRef.current = pos;
      void simpanRiwayat(pos, false);
    }
  }

  function saatAudioSelesai() {
    setStatusSemua("berhenti");
    setPosisiAudio(0);
    terakhirSimpanRef.current = 0;
    void simpanRiwayat(durasiDetik ?? audioRef.current?.duration ?? 0, true);
  }

  function saatAudioJeda() {
    const a = audioRef.current;
    if (!a) return;
    setStatusSemua("jeda");
    void simpanRiwayat(a.currentTime, false);
  }

  function saatAudioPutar() {
    setStatusSemua("memutar");
  }

  if (didukung === null) return null;

  if (!didukung) {
    return (
      <div className="kartu" role="status">
        <span className="kartu-kategori">Pemutar podcast</span>
        <span className="kartu-teks">
          Browser Anda tidak mendukung text-to-speech, dan episode ini
          belum punya file audio rekaman.
        </span>
      </div>
    );
  }

  const sedangMemutar = status === "memutar";
  const sedangJeda = status === "jeda";

  return (
    <div className="kartu" aria-label="Pemutar podcast">
      <span className="kartu-kategori">
        {modeAudio ? "Audio rekaman" : "Audio TTS browser"}
      </span>
      <span className="kartu-judul">{judul}</span>
      {modeAudio ? (
        <>
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            controls
            preload="metadata"
            onTimeUpdate={saatWaktuBerubah}
            onEnded={saatAudioSelesai}
            onPause={saatAudioJeda}
            onPlay={saatAudioPutar}
            style={{ width: "100%" }}
          />
          <span className="kartu-meta">
            {posisiAwal > 0
              ? `Terakhir didengar pada ${Math.floor(posisiAudio)} detik.`
              : "Belum pernah didengar."}
          </span>
        </>
      ) : (
        <>
          <div role="group" aria-label="Kontrol suara">
            {!sedangMemutar && !sedangJeda && (
              <button
                type="button"
                className="tombol tombol-primer"
                onClick={putarTts}
                disabled={!adaTeks}
              >
                ▶ Putar dengan suara
              </button>
            )}
            {sedangMemutar && (
              <button type="button" className="tombol" onClick={jedaTts}>
                ⏸ Jeda
              </button>
            )}
            {sedangJeda && (
              <button
                type="button"
                className="tombol tombol-primer"
                onClick={lanjutkanTts}
              >
                ▶ Lanjutkan
              </button>
            )}
            {(sedangMemutar || sedangJeda) && (
              <button type="button" className="tombol" onClick={berhentiTts}>
                ⏹ Berhenti
              </button>
            )}
          </div>
          <span className="kartu-meta" role="status">
            {sedangMemutar
              ? `Membacakan “${judul}” — bagian ${bagian} dari ${potongan.length}.`
              : sedangJeda
                ? `Dijeda pada bagian ${bagian} dari ${potongan.length}.`
                : adaTeks
                  ? "Episode dibacakan dengan suara bahasa Indonesia bila tersedia di perangkat Anda. Posisi dengar TTS hanya tersimpan saat selesai dibacakan."
                  : "Tidak ada teks naskah yang bisa dibacakan."}
          </span>
        </>
      )}
      <label style={{ display: "block", marginTop: 8 }}>
        Kecepatan
        <select
          value={kecepatan}
          onChange={(e) => gantiKecepatan(Number(e.target.value))}
          aria-label="Kecepatan pemutaran"
          style={{ marginLeft: 8 }}
        >
          {KECEPATAN.map((k) => (
            <option key={k} value={k}>
              {k}×
            </option>
          ))}
        </select>
      </label>
      {pesanRiwayat && (
        <span className="kartu-meta" role="status">
          {pesanRiwayat}
        </span>
      )}
      {!sudahLogin && (
        <span className="kartu-meta">
          Masuk untuk menyimpan riwayat dengar dan playlist Anda.
        </span>
      )}
    </div>
  );
}
