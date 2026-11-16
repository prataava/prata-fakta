import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "News Clustering — Admin",
  description:
    "Kelompok berita yang disalin dari sumber yang sama (rantai disalin_dari).",
};

export const instant = false;

type ItemMentah = {
  id: string;
  judul: string;
  url: string;
  disalin_dari_id: string | null;
  diterbitkan_ulang: boolean;
  waktu_terbit_asli: string | null;
  sumber_nama: string | null;
};

/** Telusuri rantai disalin_dari sampai akar (maks 10 langkah).
 *  Mengembalikan id akar — atau id sendiri bila tidak berantai. */
async function cariAkar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mulaiId: string,
  peta: Map<string, ItemMentah>,
): Promise<string> {
  let sekarang = mulaiId;
  for (let i = 0; i < 10; i++) {
    const baris = peta.get(sekarang);
    if (!baris?.disalin_dari_id) return sekarang;
    sekarang = baris.disalin_dari_id;
    if (!peta.has(sekarang)) {
      // Induk belum dimuat — ambil satu baris.
      const { data } = await supabase
        .from("pf_raw_items")
        .select("id,judul,url,disalin_dari_id,diterbitkan_ulang,waktu_terbit_asli")
        .eq("id", sekarang)
        .maybeSingle();
      if (!data) return sekarang;
      peta.set(sekarang, {
        ...(data as ItemMentah),
        sumber_nama: null,
      });
    }
  }
  return sekarang;
}

export default async function AdminKlaster() {
  let tersedia = true;
  let klaster: {
    akarId: string;
    akarJudul: string;
    akarUrl: string;
    jumlahSalinan: number;
    salinan: ItemMentah[];
  }[] = [];
  let totalSalinan = 0;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_raw_items")
      .select(
        "id,judul,url,disalin_dari_id,diterbitkan_ulang,waktu_terbit_asli,pf_sources(nama)",
      )
      .not("disalin_dari_id", "is", null)
      .order("waktu_terbit_asli", { ascending: false })
      .limit(200);
    if (error) {
      tersedia = false;
    } else {
      const salinan = ((data ?? []) as unknown as (Omit<
        ItemMentah,
        "sumber_nama"
      > & { pf_sources: { nama: string } | null })[]).map((r) => ({
        id: r.id,
        judul: r.judul,
        url: r.url,
        disalin_dari_id: r.disalin_dari_id,
        diterbitkan_ulang: r.diterbitkan_ulang,
        waktu_terbit_asli: r.waktu_terbit_asli,
        sumber_nama: r.pf_sources?.nama ?? null,
      }));
      totalSalinan = salinan.length;
      const peta = new Map(salinan.map((s) => [s.id, s]));
      const kelompok = new Map<string, ItemMentah[]>();
      for (const s of salinan) {
        const akarId = await cariAkar(supabase, s.id, peta);
        const daftar = kelompok.get(akarId) ?? [];
        daftar.push(s);
        kelompok.set(akarId, daftar);
      }
      klaster = [...kelompok.entries()]
        .map(([akarId, daftar]) => {
          const akar = peta.get(akarId);
          return {
            akarId,
            akarJudul: akar?.judul ?? "Item akar tidak terbaca",
            akarUrl: akar?.url ?? "",
            jumlahSalinan: daftar.length,
            salinan: daftar,
          };
        })
        .sort((a, b) => b.jumlahSalinan - a.jumlahSalinan);
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Klaster belum tersedia"
          pesan="Tabel pf_raw_items tidak dapat dibaca — migrasi Fase 3 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-klaster">
        <div className="seksi-kepala">
          <h2 id="judul-klaster">Klaster Berita Disalin</h2>
        </div>
        <p>
          {totalSalinan} item tercatat sebagai salinan (disalin_dari) dalam
          200 item terbaru · {klaster.length} akar rantai berbeda.
        </p>
        <p className="artikel-meta-kecil">
          Penting: salinan BUKAN sumber independen — satu berita yang
          disalin 3 media dihitung sebagai 1 sumber independen, bukan 3.
          Hitungan independen per artikel memakai RPC pf_akar_salinan di
          Multi-Source View; halaman ini hanya mengelompokkan rantai
          salinan apa adanya.
        </p>
        {klaster.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada salinan tercatat — belum ada item dengan
            disalin_dari.
          </p>
        ) : (
          klaster.map((k) => (
            <article className="kartu" key={k.akarId} style={{ marginBottom: 16 }}>
              <span className="kartu-kategori">
                Akar: {k.akarJudul} · {k.jumlahSalinan} salinan
              </span>
              <span className="kartu-teks">
                {k.akarUrl ? (
                  <a href={k.akarUrl}>{k.akarUrl}</a>
                ) : (
                  "Tanpa URL akar."
                )}
              </span>
              <ul className="artikel-daftar">
                {k.salinan.map((s) => (
                  <li key={s.id}>
                    {s.judul}
                    {s.sumber_nama ? ` — ${s.sumber_nama}` : ""} ·{" "}
                    {formatWaktu(s.waktu_terbit_asli)}
                    {s.diterbitkan_ulang ? " · diterbitkan ulang" : ""}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </>
  );
}
