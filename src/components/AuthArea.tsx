"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Area auth di header: membaca sesi di client (useEffect) agar tidak
// menghalangi prerender shell statis (aturan cacheComponents).
export default function AuthArea() {
  const [email, setEmail] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setSiap(true);
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

  if (!siap) return <span className="tombol tombol-hantu" aria-hidden="true">…</span>;

  if (!email) {
    return (
      <>
        <Link className="tombol tombol-hantu" href="/masuk">
          Masuk
        </Link>
        <Link className="tombol tombol-primer" href="/daftar">
          Daftar
        </Link>
      </>
    );
  }

  return (
    <>
      <Link className="tombol tombol-hantu" href="/saya" title={email}>
        {email.length > 18 ? `${email.slice(0, 16)}…` : email}
      </Link>
      <button className="tombol tombol-hantu" type="button" onClick={keluar}>
        Keluar
      </button>
    </>
  );
}
