"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Masuk() {
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: sandi });
    if (error) {
      setStatus("error");
      setPesan(
        error.message === "Invalid login credentials"
          ? "Email atau kata sandi salah. Periksa kembali."
          : `Gagal masuk: ${error.message}`,
      );
      return;
    }
    // Akun nonaktif (dibatasi super_admin) tidak boleh lanjut: keluar
    // lagi dan tampilkan pesan. Bila endpoint status belum tersedia /
    // gagal dibaca, login tetap dilanjutkan (fail-open untuk login).
    try {
      const res = await fetch("/api/akun/status");
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; nonaktif?: boolean };
        if (data.nonaktif === true) {
          await supabase.auth.signOut();
          setStatus("error");
          setPesan("Akun Anda dibatasi. Hubungi admin.");
          return;
        }
      }
    } catch {
      // Endpoint belum tersedia: lanjut seperti biasa.
    }
    router.push("/profil");
    router.refresh();
  }

  return (
    <div className="wadah">
      <div className="kartu-form">
        <h1>Masuk</h1>
        <p>Masuk ke akun PRATA FAKTA Anda untuk bookmark, mengikuti topik, dan rekomendasi personal.</p>
        <form className="formulir" onSubmit={kirim}>
          {status === "error" && (
            <p className="pesan-error" role="alert">
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
            Kata sandi
            <input
              type="password"
              required
              value={sandi}
              onChange={(e) => setSandi(e.target.value)}
              autoComplete="current-password"
              placeholder="Kata sandi Anda"
            />
          </label>
          <button className="tombol tombol-primer" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: "0.92rem", color: "var(--muted)" }}>
          Belum punya akun?{" "}
          <Link href="/daftar" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Daftar gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
