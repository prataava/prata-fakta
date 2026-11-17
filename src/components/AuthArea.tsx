"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PemilihBahasa from "@/components/PemilihBahasa";
import { t, type Bahasa } from "@/lib/i18n";
import { useBahasa } from "@/lib/useBahasa";

// Area auth di header: membaca sesi di client (useEffect) agar tidak
// menghalangi prerender shell statis (aturan cacheComponents).
// P3-3: label Masuk/Daftar/Keluar dari kamus + PemilihBahasa
// dipasang di sini (terlihat desktop + seluler). Bahasa akun dibaca
// best-effort dari GET /api/saya/preferensi sesudah sesi ketemu —
// bila endpoint belum menyertakan `bahasa` (kolom v21 P3-2 belum
// ada) atau gagal, nilainya tetap null dan cookie yang berlaku;
// jangan lempar, jangan tampilkan galat.
export default function AuthArea() {
  const [email, setEmail] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const [bahasaAkun, setBahasaAkun] = useState<Bahasa | null>(null);
  const bahasa = useBahasa();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setSiap(true);
      if (data.user) {
        // Best-effort: preferensi akun (bahasa) untuk sinkronisasi
        // cookie awal PemilihBahasa. Gagal = abaikan.
        fetch("/api/saya/preferensi")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            const b = j?.bahasa;
            if (b === "id" || b === "en") setBahasaAkun(b);
          })
          .catch(() => {});
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, sesi) => {
      setEmail(sesi?.user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function keluar() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  if (!siap)
    return (
      <>
        <span className="tombol tombol-hantu" aria-hidden="true">…</span>
        <PemilihBahasa />
      </>
    );

  if (!email) {
    return (
      <>
        <Link className="tombol tombol-hantu" href="/masuk">
          {t(bahasa, "auth.masuk")}
        </Link>
        <Link className="tombol tombol-primer" href="/daftar">
          {t(bahasa, "auth.daftar")}
        </Link>
        <PemilihBahasa bahasaAkun={bahasaAkun} masuk={false} />
      </>
    );
  }

  return (
    <>
      <Link className="tombol tombol-hantu" href="/saya" title={email}>
        {email.length > 18 ? `${email.slice(0, 16)}…` : email}
      </Link>
      <button className="tombol tombol-hantu" type="button" onClick={keluar}>
        {t(bahasa, "auth.keluar")}
      </button>
      <PemilihBahasa bahasaAkun={bahasaAkun} masuk />
    </>
  );
}
