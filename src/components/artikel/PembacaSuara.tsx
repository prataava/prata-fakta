// Pembaca Suara (text-to-speech) PRATA FAKTA — client component.
// Memakai Web Speech API bawaan browser (window.speechSynthesis):
// tanpa server, tanpa kunci API, tanpa biaya. Teks panjang dipecah
// per kalimat/paragraf dan diantrekan sebagai beberapa utterance
// karena speechSynthesis punya batas panjang per utterance.
// Feature-detect jujur: bila browser tidak mendukung, tombol
// nonaktif + pesan jelas (bukan pura-pura jalan). Ucapan dibatalkan
// saat komponen unmount.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gaya from "./PembacaSuara.module.css";

type StatusSuara = "berhenti" | "memutar" | "jeda";

const KECEPATAN: number[] = [0.75, 1, 1.25, 1.5];

// Panjang maksimum satu utterance (karakter). Potongan dipecah di
// batas kalimat agar ucapan tidak terpotong di tengah kata.
const BATAS_UTTERANCE = 200;

/** Pecah teks menjadi potongan pendek di batas paragraf/kalimat. */
export function pecahUntukSuara(teks: string): string[] {
  const potongan: string[] = [];
  const paragraf = teks
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of paragraf) {
    // Pecah per kalimat (tanda akhir kalimat dipertahankan).
    const kalimat = p.match(/[^.!?…]+[.!?…]+["”']?\s*|[^.!?…]+$/g) ?? [p];
    let berjalan = "";
    for (const k of kalimat) {
      const kTrim = k.trim();
      if (!kTrim) continue;
      if (berjalan && berjalan.length + kTrim.length + 1 > BATAS_UTTERANCE) {
        potongan.push(berjalan);
        berjalan = kTrim;
      } else {
        berjalan = berjalan ? `${berjalan} ${kTrim}` : kTrim;
      }
    }
    if (berjalan) potongan.push(berjalan);
  }
  return potongan;
}

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

export default function PembacaSuara({
  judul,
  teks,
}: {
  judul: string;
  teks: string;
}) {
  const [didukung, setDidukung] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StatusSuara>("berhenti");
  const [kecepatan, setKecepatan] = useState<number>(1);
  const [bagian, setBagian] = useState(0);
  const potonganRef = useRef<string[]>([]);
  const indeksRef = useRef(0);
  const kecepatanRef = useRef(kecepatan);
  const statusRef = useRef<StatusSuara>("berhenti");

  const potongan = useMemo(() => pecahUntukSuara(teks), [teks]);
  const adaTeks = potongan.length > 0;

  // Feature-detect saat mount (speechSynthesis hanya ada di browser).
  // setState di dalam callback setTimeout (bukan sinkron di badan
  // effect) agar tidak memicu cascading render; nilai awal null
  // mencegah ketidakcocokan hidrasi SSR.
  useEffect(() => {
    const t = setTimeout(() => {
      setDidukung(
        typeof window !== "undefined" && "speechSynthesis" in window,
      );
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Batalkan ucapan saat unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const setStatusSemua = useCallback((s: StatusSuara) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // Deklarasi fungsi biasa (bukan useCallback): onend memanggil
  // dirinya sendiri untuk antrean berikutnya; sebagai function
  // declaration ia ter-hoist sehingga rekursi ini sah. Isi yang
  // dibaca lewat ref (potonganRef/statusRef/kecepatanRef) selalu
  // mutakhir walau closure berasal dari render lama.
  function ucapkanBagian(indeks: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const daftar = potonganRef.current;
    if (indeks >= daftar.length) {
      setStatusSemua("berhenti");
      setBagian(0);
      return;
    }
    indeksRef.current = indeks;
    setBagian(indeks + 1);
    const ujaran = new SpeechSynthesisUtterance(daftar[indeks]);
    ujaran.lang = "id-ID";
    ujaran.rate = kecepatanRef.current;
    const suara = pilihSuaraIndonesia();
    if (suara) ujaran.voice = suara;
    ujaran.onend = () => {
      // Lanjut hanya bila masih dalam mode memutar (pengguna bisa
      // saja menekan Berhenti di tengah antrean).
      if (statusRef.current === "memutar") {
        ucapkanBagian(indeks + 1);
      }
    };
    ujaran.onerror = () => {
      setStatusSemua("berhenti");
      setBagian(0);
    };
    window.speechSynthesis.speak(ujaran);
  }

  function putar() {
    if (!didukung || !adaTeks) return;
    window.speechSynthesis.cancel();
    potonganRef.current = potongan;
    setStatusSemua("memutar");
    ucapkanBagian(0);
  }

  function jeda() {
    if (!didukung) return;
    window.speechSynthesis.pause();
    setStatusSemua("jeda");
  }

  function lanjutkan() {
    if (!didukung) return;
    window.speechSynthesis.resume();
    setStatusSemua("memutar");
  }

  function berhenti() {
    if (!didukung) return;
    window.speechSynthesis.cancel();
    setStatusSemua("berhenti");
    setBagian(0);
  }

  function gantiKecepatan(nilai: number) {
    setKecepatan(nilai);
    kecepatanRef.current = nilai;
    // Kecepatan baru berlaku untuk utterance berikutnya: mulai ulang
    // dari awal bila sedang memutar.
    if (statusRef.current === "memutar") {
      window.speechSynthesis.cancel();
      ucapkanBagian(0);
    }
  }

  // Feature-detect belum selesai: jangan tampilkan apa pun dulu agar
  // tidak berkedip antara "didukung" dan "tidak didukung" saat SSR.
  if (didukung === null) return null;

  if (!didukung) {
    return (
      <div className={gaya["pembaca-suara"]} aria-label="Pembaca suara">
        <span className={gaya["pembaca-suara-judul"]}>Dengarkan artikel</span>
        <p className={gaya["pembaca-suara-pesan"]} role="status">
          Browser Anda tidak mendukung text-to-speech.
        </p>
        <button type="button" className="tombol" disabled>
          Putar
        </button>
      </div>
    );
  }

  const sedangMemutar = status === "memutar";
  const sedangJeda = status === "jeda";

  return (
    <div className={gaya["pembaca-suara"]} aria-label="Pembaca suara">
      <span className={gaya["pembaca-suara-judul"]}>Dengarkan artikel</span>
      <div className={gaya["pembaca-suara-tombol"]} role="group" aria-label="Kontrol suara">
        {!sedangMemutar && !sedangJeda && (
          <button
            type="button"
            className="tombol tombol-primer"
            onClick={putar}
            disabled={!adaTeks}
          >
            ▶ Putar
          </button>
        )}
        {sedangMemutar && (
          <button type="button" className="tombol" onClick={jeda}>
            ⏸ Jeda
          </button>
        )}
        {sedangJeda && (
          <button
            type="button"
            className="tombol tombol-primer"
            onClick={lanjutkan}
          >
            ▶ Lanjutkan
          </button>
        )}
        {(sedangMemutar || sedangJeda) && (
          <button type="button" className="tombol" onClick={berhenti}>
            ⏹ Berhenti
          </button>
        )}
        <label className={gaya["pembaca-suara-kecepatan"]}>
          Kecepatan
          <select
            value={kecepatan}
            onChange={(e) => gantiKecepatan(Number(e.target.value))}
            aria-label="Kecepatan baca"
          >
            {KECEPATAN.map((k) => (
              <option key={k} value={k}>
                {k}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={gaya["pembaca-suara-pesan"]} role="status">
        {sedangMemutar
          ? `Membacakan “${judul}” — bagian ${bagian} dari ${potongan.length}.`
          : sedangJeda
            ? `Dijeda pada bagian ${bagian} dari ${potongan.length}.`
            : adaTeks
              ? "Artikel dibacakan dengan suara bahasa Indonesia bila tersedia di perangkat Anda."
              : "Tidak ada teks artikel yang bisa dibacakan."}
      </p>
    </div>
  );
}
