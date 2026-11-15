// Pemeriksaan kesehatan sistem (dipakai /api/health dan halaman
// /admin/sistem). TIDAK mengembalikan data sensitif — hanya status
// koneksi database, latensi, dan waktu pemeriksaan.
// Status db:
//   "ok"               — tabel pf_categories bisa dibaca.
//   "belum_tersedia"   — Supabase menjawab tetapi tabel pf_* belum
//                        ada (migrasi belum dijalankan; PGRST205).
//   "belum_dikonfigurasi" — env Supabase belum diatur.
//   "gagal"            — jaringan/HTTP lain (angka status dicatat
//                        di detail, bukan isi respons).

export type StatusDb =
  | "ok"
  | "belum_tersedia"
  | "belum_dikonfigurasi"
  | "gagal";

export type HasilKesehatan = {
  db: StatusDb;
  latensiMs: number;
  waktu: string;
  detail: string;
};

export async function periksaKesehatan(): Promise<HasilKesehatan> {
  const mulai = Date.now();
  const waktu = new Date().toISOString();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      db: "belum_dikonfigurasi",
      latensiMs: Date.now() - mulai,
      waktu,
      detail: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY belum diatur.",
    };
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/pf_categories?select=id&limit=1`,
      {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
        },
      },
    );
    const latensiMs = Date.now() - mulai;
    if (res.ok) {
      return { db: "ok", latensiMs, waktu, detail: "pf_categories terbaca." };
    }
    if (res.status === 404) {
      try {
        const body = (await res.json()) as { code?: string };
        if (body.code === "PGRST205") {
          return {
            db: "belum_tersedia",
            latensiMs,
            waktu,
            detail:
              "Tabel pf_categories belum ada — migrasi belum dijalankan di Supabase.",
          };
        }
      } catch {
        // Lanjut ke gagal generik di bawah.
      }
    }
    return {
      db: "gagal",
      latensiMs,
      waktu,
      detail: `Supabase menjawab HTTP ${res.status}.`,
    };
  } catch (err) {
    return {
      db: "gagal",
      latensiMs: Date.now() - mulai,
      waktu,
      detail: `Tidak dapat menghubungi Supabase: ${err instanceof Error ? err.message : "error jaringan"}.`,
    };
  }
}
