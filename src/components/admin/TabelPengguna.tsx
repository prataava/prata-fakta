"use client";

import { useEffect, useState } from "react";
import DialogKonfirmasi from "@/components/admin/DialogKonfirmasi";

// Tabel pengguna admin — Client Component karena daftar email hanya
// tersedia lewat /api/admin/pengguna (service role), bukan lewat
// session client. Fetch saat mount: skeleton saat loading, pesan
// jujur saat gagal. Kontrol ubah role / nonaktifkan HANYA tampil
// bila isSuperAdmin (API tetap menegakkan izin di server).
type Pengguna = {
  id: string;
  email: string;
  nama_tampilan: string | null;
  nonaktif: boolean;
  roles: string[];
};

const SEMUA_ROLE = ["super_admin", "editor", "fact_checker", "writer"] as const;

export default function TabelPengguna({
  isSuperAdmin,
}: {
  isSuperAdmin: boolean;
}) {
  const [pengguna, setPengguna] = useState<Pengguna[] | null>(null);
  const [error, setError] = useState("");
  const [aksiId, setAksiId] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");
  // Pengguna yang menunggu konfirmasi ubah status (dialog
  // dalam-halaman, bukan window.confirm — dialog bawaan ditolak
  // otomatisasi).
  const [statusTertunda, setStatusTertunda] = useState<Pengguna | null>(
    null,
  );

  useEffect(() => {
    let batal = false;
    fetch("/api/admin/pengguna")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          pengguna?: Pengguna[];
        };
        if (batal) return;
        if (!res.ok || data.ok === false) {
          setError(data.error ?? `Gagal memuat pengguna (${res.status}).`);
          return;
        }
        setPengguna(data.pengguna ?? []);
      })
      .catch(() => {
        if (!batal) setError("Tidak dapat terhubung ke server.");
      });
    return () => {
      batal = true;
    };
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setAksiId(id);
    setPesan("");
    try {
      const res = await fetch(`/api/admin/pengguna/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}).`);
        return;
      }
      setPengguna((lama) =>
        (lama ?? []).map((p) =>
          p.id === id
            ? {
                ...p,
                ...(typeof body.roles !== "undefined"
                  ? { roles: body.roles as string[] }
                  : {}),
                ...(typeof body.nonaktif !== "undefined"
                  ? { nonaktif: body.nonaktif as boolean }
                  : {}),
              }
            : p,
        ),
      );
      setPesan("Perubahan berhasil disimpan.");
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setAksiId(null);
    }
  }

  function toggleRole(p: Pengguna, role: string) {
    const roles = p.roles.includes(role)
      ? p.roles.filter((r) => r !== role)
      : [...p.roles, role];
    void patch(p.id, { roles });
  }

  if (error) {
    return <p className="pesan-error" role="alert">{error}</p>;
  }
  if (pengguna === null) {
    return <div className="kerangka" aria-label="Memuat pengguna…" />;
  }
  if (pengguna.length === 0) {
    return (
      <div className="kosong" role="status">
        <h3>Belum ada pengguna</h3>
        <p>Belum ada pengguna terdaftar yang bisa dikelola.</p>
      </div>
    );
  }

  return (
    <>
      {pesan && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      {!isSuperAdmin && (
        <p className="artikel-meta-kecil">
          Anda bukan super_admin — perubahan role dan status akun hanya bisa
          dilakukan super_admin.
        </p>
      )}
      <div className="tabel-gulir">
        <table className="tabel-data">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nama tampilan</th>
              <th>Role</th>
              <th>Status</th>
              {isSuperAdmin && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {pengguna.map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td>
                <td>{p.nama_tampilan ?? "—"}</td>
                <td>
                  {isSuperAdmin ? (
                    <span className="admin-aksi">
                      {SEMUA_ROLE.map((r) => (
                        <label
                          key={r}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: "0.85rem",
                            fontWeight: 400,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={p.roles.includes(r)}
                            disabled={aksiId === p.id}
                            onChange={() => toggleRole(p, r)}
                          />
                          {r}
                        </label>
                      ))}
                    </span>
                  ) : (
                    p.roles.length > 0 ? p.roles.join(", ") : "user"
                  )}
                </td>
                <td>{p.nonaktif ? "Nonaktif" : "Aktif"}</td>
                {isSuperAdmin && (
                  <td>
                    <button
                      type="button"
                      className="tombol tombol-hantu"
                      disabled={aksiId === p.id}
                      onClick={() => setStatusTertunda(p)}
                    >
                      {aksiId === p.id
                        ? "Memproses…"
                        : p.nonaktif
                          ? "Aktifkan"
                          : "Nonaktifkan"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DialogKonfirmasi
        terbuka={statusTertunda !== null}
        judul={
          statusTertunda?.nonaktif ? "Aktifkan akun?" : "Nonaktifkan akun?"
        }
        pesan={
          statusTertunda
            ? statusTertunda.nonaktif
              ? `Aktifkan kembali akun ${statusTertunda.email}?`
              : `Nonaktifkan akun ${statusTertunda.email}? Pengguna tidak bisa masuk sampai diaktifkan lagi.`
            : ""
        }
        labelKonfirmasi={
          statusTertunda?.nonaktif ? "Ya, aktifkan" : "Ya, nonaktifkan"
        }
        varian="bahaya"
        sibuk={statusTertunda !== null && aksiId === statusTertunda.id}
        onKonfirmasi={() => {
          if (statusTertunda) {
            const p = statusTertunda;
            setStatusTertunda(null);
            void patch(p.id, { nonaktif: !p.nonaktif });
          }
        }}
        onTutup={() => setStatusTertunda(null)}
      />
    </>
  );
}
