"use client";

import { useEffect, useState } from "react";

// Tahun berjalan untuk footer — diisi lewat useEffect (aturan
// cacheComponents: jangan baca waktu di jalur render komponen klien;
// pola useSyncExternalStore/getServerSnapshot TIDAK bisa dipakai di sini
// karena getServerSnapshot yang memanggil new Date() juga ditolak
// prerender). Disable lint set-state-in-effect sengaja: ini satu-satunya
// pola yang diizinkan Next untuk nilai waktu di Client Component.
export default function TahunIni() {
  const [tahun, setTahun] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTahun(new Date().getFullYear());
  }, []);
  return <>{tahun ?? "—"}</>;
}
