"use client";

import { useEffect, useState } from "react";

// Tanggal hari ini (id-ID) — diisi lewat useEffect (aturan
// cacheComponents: jangan baca waktu di jalur render komponen klien).
// Disable lint set-state-in-effect sengaja: ini satu-satunya pola yang
// diizinkan Next untuk nilai waktu di Client Component.
export default function TanggalHariIni({ awalan = "" }: { awalan?: string }) {
  const [teks, setTeks] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeks(fmt.format(new Date()));
  }, []);
  return (
    <span>
      {awalan}
      {teks ?? "memuat tanggal…"}
    </span>
  );
}
