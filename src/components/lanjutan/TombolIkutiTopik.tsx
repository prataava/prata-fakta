// Tombol Ikuti / Berhenti mengikuti SATU topik (P1-5) — komponen
// bersama untuk SEMUA permukaan tipe topik pf_followed_topics
// (kategori, negara, isu): halaman kategori, halaman negara,
// /saya/topik, dan permukaan lain yang butuh. JANGAN duplikasi
// logika ini di halaman lain — pakai komponen ini.
// Memanggil POST / DELETE /api/topik (login saja; 401 bila
// anonim). "cerita" BUKAN topik (lihat lib/topik.ts) — cerita
// memakai TombolIkutiCerita, bukan komponen ini.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TipeTopik = "kategori" | "negara" | "isu";

const LABEL_TIPE: Record<TipeTopik, string> = {
  kategori: "kategori",
  negara: "negara",
  isu: "isu",
};

export default function TombolIkutiTopik({
  tipe,
  target,
  mengikutiAwal,
  mengikutiId,
  masuk,
}: {
  tipe: TipeTopik;
  target: string;
  mengikutiAwal: boolean;
  /** Id baris pf_followed_topics bila sudah mengikuti (dipakai
   *  DELETE by id — akurat walau target punya dua ejaan, mis.
   *  negara "ID" vs "Indonesia"). */
  mengikutiId?: string | null;
  /** false = pengguna belum login (tombol mengarah ke /masuk). */
  masuk: boolean;
}) {
  const [mengikuti, setMengikuti] = useState(mengikutiAwal);
  const [idBaris, setIdBaris] = useState<string | null>(
    mengikutiId ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim() {
    if (!masuk) {
      router.push("/masuk");
      return;
    }
    setLoading(true);
    setPesan("");
    try {
      const res = await fetch("/api/topik", {
        method: mengikuti ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mengikuti
            ? idBaris
              ? { id: idBaris }
              : { tipe, target }
            : { tipe, target },
        ),
      });
      let data: {
        ok?: boolean;
        error?: string;
        topik?: { id: string };
        sudahDiikuti?: boolean;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}). Coba lagi.`);
        return;
      }
      if (mengikuti) {
        setMengikuti(false);
        setIdBaris(null);
      } else {
        setMengikuti(true);
        if (data.topik?.id) setIdBaris(data.topik.id);
      }
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        className={mengikuti ? "tombol tombol-hantu" : "tombol tombol-primer"}
        onClick={kirim}
        disabled={loading}
      >
        {loading
          ? "Memproses…"
          : mengikuti
            ? "Berhenti mengikuti"
            : masuk
              ? `Ikuti ${LABEL_TIPE[tipe]} ini`
              : "Masuk untuk mengikuti"}
      </button>
      {pesan && (
        <span
          className="pesan-error"
          role="status"
          style={{ marginBottom: 0, marginLeft: 8 }}
        >
          {pesan}
        </span>
      )}
    </span>
  );
}
