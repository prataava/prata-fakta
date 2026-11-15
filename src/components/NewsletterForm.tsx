"use client";

import { useState, type FormEvent } from "react";

// Formulir newsletter — menyimpan email ke pf_newsletter_subscribers
// lewat POST /api/langganan. Menampilkan state loading/sukses/error nyata.
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "duplikat" | "error">("idle");
  const [pesan, setPesan] = useState("");

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/langganan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.status === 409) {
        setStatus("duplikat");
        setPesan("Email ini sudah terdaftar. Anda akan menerima Daily Brief setiap pagi.");
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Pendaftaran gagal. Coba lagi.");
        return;
      }
      setStatus("sukses");
      setPesan("Berhasil! Daily Brief akan dikirim ke email Anda setiap pagi.");
      setEmail("");
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    }
  }

  return (
    <form onSubmit={kirim} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <div className="cari" style={{ margin: 0, maxWidth: "100%" }}>
        <label htmlFor="newsletter-email" className="sr-only" style={{ position: "absolute", left: -9999 }}>
          Alamat email
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alamat@email.com"
          autoComplete="email"
          disabled={status === "loading"}
        />
        <button className="tombol tombol-primer" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Mendaftar…" : "Berlangganan"}
        </button>
      </div>
      {status === "sukses" && <p className="pesan-sukses" role="status">{pesan}</p>}
      {status === "duplikat" && <p className="pesan-sukses" role="status">{pesan}</p>}
      {status === "error" && <p className="pesan-error" role="alert">{pesan}</p>}
    </form>
  );
}
