"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function Daftar() {
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [ulang, setUlang] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">("idle");
  const [pesan, setPesan] = useState("");
  const router = { push: (u: string) => (window.location.href = u) };

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (sandi.length < 8) {
      setStatus("error");
      setPesan("Kata sandi minimal 8 karakter.");
      return;
    }
    if (sandi !== ulang) {
      setStatus("error");
      setPesan("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setStatus("loading");
    setPesan("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: sandi,
      options: { emailRedirectTo: `${window.location.origin}/profil` },
    });
    if (error) {
      setStatus("error");
      setPesan(
        error.message.includes("already registered")
          ? "Email ini sudah terdaftar. Silakan masuk."
          : `Gagal mendaftar: ${error.message}`,
      );
      return;
    }
    if (data.session) {
      router.push("/profil");
      return;
    }
    setStatus("sukses");
    setPesan(
      "Akun dibuat. Periksa email Anda dan klik tautan konfirmasi untuk mengaktifkan akun.",
    );
  }

  return (
    <div className="wadah">
      <div className="kartu-form">
        <h1>Daftar gratis</h1>
        <p>Buat akun untuk bookmark, mengikuti topik, riwayat baca, dan rekomendasi personal.</p>
        <form className="formulir" onSubmit={kirim}>
          {status === "error" && (
            <p className="pesan-error" role="alert">
              {pesan}
            </p>
          )}
          {status === "sukses" && (
            <p className="pesan-sukses" role="status">
              {pesan}
            </p>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="alamat@email.com"
            />
          </label>
          <label>
            Kata sandi (minimal 8 karakter)
            <input
              type="password"
              required
              minLength={8}
              value={sandi}
              onChange={(e) => setSandi(e.target.value)}
              autoComplete="new-password"
              placeholder="Buat kata sandi"
            />
          </label>
          <label>
            Ulangi kata sandi
            <input
              type="password"
              required
              value={ulang}
              onChange={(e) => setUlang(e.target.value)}
              autoComplete="new-password"
              placeholder="Ulangi kata sandi"
            />
          </label>
          <button
            className="tombol tombol-primer"
            type="submit"
            disabled={status === "loading" || status === "sukses"}
          >
            {status === "loading" ? "Membuat akun…" : "Buat akun"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: "0.92rem", color: "var(--muted)" }}>
          Sudah punya akun?{" "}
          <Link href="/masuk" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
