// Kartu cerita + tombol Ikuti/Berhenti mengikuti (Story Tracker,
// Fase 8 Gel. 2). Client Component: tombol memanggil
// POST /api/cerita/[slug]/ikuti (login saja; 401 bila anonim).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PfCeritaRingkas } from "@/lib/cerita";
import Kartu from "@/components/Kartu";

/** Tombol Ikuti / Berhenti mengikuti satu cerita. */
export function TombolIkutiCerita({
  slug,
  mengikutiAwal,
  masuk,
}: {
  slug: string;
  mengikutiAwal: boolean;
  /** false = pengguna belum login (tombol mengarah ke /masuk). */
  masuk: boolean;
}) {
  const [mengikuti, setMengikuti] = useState(mengikutiAwal);
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
      const res = await fetch(`/api/cerita/${slug}/ikuti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: mengikuti ? "berhenti" : "ikuti" }),
      });
      let data: { ok?: boolean; error?: string; mengikuti?: boolean } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}). Coba lagi.`);
        return;
      }
      setMengikuti(data.mengikuti ?? !mengikuti);
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
              ? "Ikuti cerita"
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

const LABEL_PERKEMBANGAN: Record<string, string> = {
  berkembang: "Masih berkembang",
  selesai: "Selesai",
};

/** Kartu ringkas satu cerita terbit (daftar /cerita). */
export default function KartuCerita({
  cerita,
  mengikuti,
  masuk,
  tampilkanIkuti = false,
}: {
  cerita: PfCeritaRingkas;
  mengikuti?: boolean;
  masuk?: boolean;
  tampilkanIkuti?: boolean;
}) {
  return (
    <Kartu
      judulHref={`/cerita/${cerita.slug}`}
      kategori={
        <>
          {LABEL_PERKEMBANGAN[cerita.status_perkembangan] ??
            cerita.status_perkembangan}
          {mengikuti ? " · Anda ikuti" : ""}
        </>
      }
      judul={cerita.judul}
      teks={cerita.ringkasan ?? undefined}
      meta={`${cerita.jumlah_event} peristiwa · ${cerita.jumlah_artikel} berita terkait · ${cerita.jumlah_pengikut} pengikut`}
      aksi={
        tampilkanIkuti ? (
          <span style={{ marginTop: 8 }}>
            <TombolIkutiCerita
              slug={cerita.slug}
              mengikutiAwal={mengikuti ?? false}
              masuk={masuk ?? false}
            />
          </span>
        ) : undefined
      }
    />
  );
}
