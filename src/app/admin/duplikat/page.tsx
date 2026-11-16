import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Duplicate Detection — Admin",
  description:
    "Daftar item mentah yang terdeteksi duplikat atau disalin dari sumber lain.",
};

export const instant = false;

type Duplikat = {
  id: string;
  judul: string;
  url: string;
  status: string;
  disalin_dari_id: string | null;
  diterbitkan_ulang: boolean;
  waktu_terbit_asli: string | null;
  sumber_nama: string | null;
};

export default async function AdminDuplikat() {
  let tersedia = true;
  let daftar: Duplikat[] = [];
  let jumlahDisalin = 0;
  let jumlahTerbitUlang = 0;
  let jumlahDuplikat = 0;
  try {
    const supabase = await createClient();
    const [disalinRes, ulangRes, duplikatRes, daftarRes] = await Promise.all([
      supabase
        .from("pf_raw_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "disalin_dari"),
      supabase
        .from("pf_raw_items")
        .select("id", { count: "exact", head: true })
        .eq("diterbitkan_ulang", true),
      supabase
        .from("pf_raw_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "duplikat"),
      supabase
        .from("pf_raw_items")
        .select(
          "id,judul,url,status,disalin_dari_id,diterbitkan_ulang,waktu_terbit_asli,pf_sources(nama)",
        )
        .or("status.eq.disalin_dari,status.eq.duplikat,diterbitkan_ulang.eq.true")
        .order("waktu_terbit_asli", { ascending: false })
        .limit(50),
    ]);
    if (
      disalinRes.error ||
      ulangRes.error ||
      duplikatRes.error ||
      daftarRes.error
    ) {
      tersedia = false;
    } else {
      jumlahDisalin = disalinRes.count ?? 0;
      jumlahTerbitUlang = ulangRes.count ?? 0;
      jumlahDuplikat = duplikatRes.count ?? 0;
      const mentah = (daftarRes.data ?? []) as unknown as (Omit<
        Duplikat,
        "sumber_nama"
      > & { pf_sources: { nama: string } | null })[];
      daftar = mentah.map((r) => ({
        id: r.id,
        judul: r.judul,
        url: r.url,
        status: r.status,
        disalin_dari_id: r.disalin_dari_id,
        diterbitkan_ulang: r.diterbitkan_ulang,
        waktu_terbit_asli: r.waktu_terbit_asli,
        sumber_nama: r.pf_sources?.nama ?? null,
      }));
      // Judul item induk (disalin dari mana) — satu query tambahan.
      const indukIds = [
        ...new Set(
          daftar
            .map((d) => d.disalin_dari_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (indukIds.length > 0) {
        const { data: induk } = await supabase
          .from("pf_raw_items")
          .select("id,judul")
          .in("id", indukIds);
        const petaInduk = new Map(
          ((induk ?? []) as { id: string; judul: string }[]).map((r) => [
            r.id,
            r.judul,
          ]),
        );
        daftar = daftar.map((d) => ({
          ...d,
          sumber_nama: d.disalin_dari_id
            ? (petaInduk.get(d.disalin_dari_id) ?? d.sumber_nama)
            : d.sumber_nama,
        }));
      }
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Deteksi duplikat belum tersedia"
          pesan="Tabel pf_raw_items tidak dapat dibaca — migrasi Fase 3 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Ringkasan Duplikat</h2>
        </div>
        <p>
          Disalin dari sumber lain: {jumlahDisalin} · Duplikat:{" "}
          {jumlahDuplikat} · Diterbitkan ulang: {jumlahTerbitUlang}
        </p>
        <p className="artikel-meta-kecil">
          Deteksi di sini memakai kolom ingestion nyata (status
          disalin_dari/duplikat, disalin_dari_id, diterbitkan_ulang).
          Parafrase tanpa rantai salinan TIDAK terdeteksi oleh kolom ini
          — itu keterbatasan yang diketahui (lihat audit mendalam
          Multi-Source View, LAPORAN-FASE-8 §12).
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar">
        <div className="seksi-kepala">
          <h2 id="judul-daftar">Daftar Duplikat / Salinan (50 terbaru)</h2>
        </div>
        {daftar.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada duplikat atau salinan tercatat.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Status</th>
                  <th>Disalin dari</th>
                  <th>Diterbitkan ulang</th>
                  <th>Waktu terbit asli</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={d.url}>{d.judul}</a>
                    </td>
                    <td>{d.status}</td>
                    <td>{d.disalin_dari_id ? (d.sumber_nama ?? "—") : "—"}</td>
                    <td>{d.diterbitkan_ulang ? "Ya" : "Tidak"}</td>
                    <td>{formatWaktu(d.waktu_terbit_asli)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
