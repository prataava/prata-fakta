"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProfilSesi = {
  email: string | undefined;
  dibuat: string | undefined;
  terkonfirmasi: boolean;
};

export default function Profil() {
  const [profil, setProfil] = useState<ProfilSesi | null>(null);
  const [siap, setSiap] = useState(false);
  const [reset, setReset] = useState<"idle" | "loading" | "sukses" | "error">("idle");
  const [pesanReset, setPesanReset] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setProfil(
        u
          ? {
              email: u.email,
              dibuat: u.created_at,
              terkonfirmasi: Boolean(u.email_confirmed_at),
            }
          : null,
      );
      setSiap(true);
    });
  }, []);

  async function keluar() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function kirimReset() {
    if (!profil?.email) return;
    setReset("loading");
    setPesanReset("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(profil.email, {
      redirectTo: `${window.location.origin}/masuk`,
    });
    if (error) {
      setReset("error");
      setPesanReset(`Gagal mengirim email: ${error.message}`);
      return;
    }
    setReset("sukses");
    setPesanReset("Tautan ubah kata sandi telah dikirim ke email Anda.");
  }

  if (!siap) {
    return (
      <div className="wadah">
        <div className="kartu-form">
          <div className="kerangka" aria-label="Memuat profil…" />
        </div>
      </div>
    );
  }

  if (!profil) {
    return (
      <div className="wadah">
        <div className="kartu-form">
          <h1>Profil</h1>
          <p>Anda belum masuk. Masuk atau daftar untuk melihat profil Anda.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Link className="tombol tombol-primer" href="/masuk">
              Masuk
            </Link>
            <Link className="tombol" href="/daftar">
              Daftar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wadah">
      <div className="kartu-form">
        <h1>Profil Saya</h1>
        <p>Informasi akun PRATA FAKTA Anda.</p>
        <dl style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          <div>
            <dt style={{ fontWeight: 600 }}>Email</dt>
            <dd>{profil.email}</dd>
          </div>
          <div>
            <dt style={{ fontWeight: 600 }}>Bergabung sejak</dt>
            <dd>
              {profil.dibuat
                ? new Date(profil.dibuat).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt style={{ fontWeight: 600 }}>Status email</dt>
            <dd>
              {profil.terkonfirmasi ? (
                <span className="lencana lencana-verified">Terverifikasi</span>
              ) : (
                <span className="lencana">Belum dikonfirmasi — periksa email Anda</span>
              )}
            </dd>
          </div>
        </dl>
        {reset === "sukses" && (
          <p className="pesan-sukses" role="status">
            {pesanReset}
          </p>
        )}
        {reset === "error" && (
          <p className="pesan-error" role="alert">
            {pesanReset}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="tombol tombol-primer" href="/saya">
            Dasbor Saya
          </Link>
          <Link className="tombol" href="/feed-saya">
            Feed Saya
          </Link>
          <Link className="tombol" href="/kuis">
            Kuis Harian
          </Link>
          <Link className="tombol" href="/tanya">
            Tanya PRATA FAKTA
          </Link>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          <button className="tombol" type="button" onClick={kirimReset} disabled={reset === "loading"}>
            {reset === "loading" ? "Mengirim…" : "Kirim tautan ubah kata sandi"}
          </button>
          <button className="tombol tombol-hantu" type="button" onClick={keluar}>
            Keluar
          </button>
        </div>
        <p style={{ marginTop: 20, fontSize: "0.88rem", color: "var(--muted)" }}>
          Penghapusan akun: penghapusan mandiri tersedia setelah backend admin
          siap (Fase 5). Sementara ini, ajukan penghapusan lewat email redaksi
          yang tercantum di halaman Kebijakan Privasi.
        </p>
      </div>
    </div>
  );
}
