import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Breaking News Radar — Admin",
  description:
    "Perkembangan per peristiwa dari klaster item mentah: baru, peristiwa sama, dan pembaruan.",
};

export const instant = false;

// Batas "pembaruan": anggota klaster yang ditambahkan lebih dari
// 6 jam sesudah klaster dibuat menandakan peristiwa berkembang
// (laporan lanjutan), bukan sekadar laporan awal yang berbarengan.
const BATAS_PEMBARUAN_MS = 6 * 60 * 60 * 1000;

type Klaster = {
  id: string;
  judul: string;
  dibuat_pada: string;
  diperbarui_pada: string;
};

type Anggota = {
  cluster_id: string;
  raw_item_id: string;
  ditambahkan_pada: string;
};

type ItemMentah = {
  id: string;
  judul: string;
  sumber_id: string | null;
  waktu_terbit_asli: string | null;
};

export default async function AdminRadar() {
  let tersedia = true;
  let baris: {
    klaster: Klaster;
    jumlahLaporan: number;
    jumlahSumber: number;
    pertama: string | null;
    terakhir: string | null;
    label: string;
    adaPembaruan: boolean;
  }[] = [];
  try {
    const supabase = await createClient();
    const { data: klaster, error: errKlaster } = await supabase
      .from("pf_item_clusters")
      .select("id,judul,dibuat_pada,diperbarui_pada")
      .order("diperbarui_pada", { ascending: false })
      .limit(20);
    if (errKlaster || !klaster) {
      tersedia = false;
    } else {
      const daftar = klaster as Klaster[];
      const ids = daftar.map((k) => k.id);
      let anggota: Anggota[] = [];
      let item: ItemMentah[] = [];
      if (ids.length > 0) {
        const { data: m } = await supabase
          .from("pf_item_cluster_members")
          .select("cluster_id,raw_item_id,ditambahkan_pada")
          .in("cluster_id", ids);
        anggota = (m ?? []) as Anggota[];
        const itemIds = [...new Set(anggota.map((a) => a.raw_item_id))];
        if (itemIds.length > 0) {
          const { data: it } = await supabase
            .from("pf_raw_items")
            .select("id,judul,sumber_id,waktu_terbit_asli")
            .in("id", itemIds)
            .limit(200);
          item = (it ?? []) as ItemMentah[];
        }
      }
      const petaItem = new Map(item.map((i) => [i.id, i]));
      const anggotaPerKlaster = new Map<string, Anggota[]>();
      for (const a of anggota) {
        const daftarA = anggotaPerKlaster.get(a.cluster_id) ?? [];
        daftarA.push(a);
        anggotaPerKlaster.set(a.cluster_id, daftarA);
      }
      baris = daftar.map((k) => {
        const ang = anggotaPerKlaster.get(k.id) ?? [];
        const sumber = new Set<string>();
        let pertama: string | null = null;
        let terakhir: string | null = null;
        for (const a of ang) {
          const it = petaItem.get(a.raw_item_id);
          if (it?.sumber_id) sumber.add(it.sumber_id);
          if (it?.waktu_terbit_asli && (!pertama || it.waktu_terbit_asli < pertama)) {
            pertama = it.waktu_terbit_asli;
          }
          if (!terakhir || a.ditambahkan_pada > terakhir) {
            terakhir = a.ditambahkan_pada;
          }
        }
        const adaPembaruan =
          ang.length >= 2 &&
          terakhir !== null &&
          new Date(terakhir).getTime() - new Date(k.dibuat_pada).getTime() >
            BATAS_PEMBARUAN_MS;
        const label =
          ang.length <= 1
            ? "baru"
            : adaPembaruan
              ? "peristiwa sama + pembaruan"
              : "peristiwa sama";
        return {
          klaster: k,
          jumlahLaporan: ang.length,
          jumlahSumber: sumber.size,
          pertama,
          terakhir,
          label,
          adaPembaruan,
        };
      });
    }
  } catch {
    tersedia = false;
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-radar">
        <div className="seksi-kepala">
          <h2 id="judul-radar">Breaking News Radar — 20 Klaster Terbaru</h2>
        </div>
        <p className="artikel-meta-kecil">
          Perkembangan per peristiwa dari klaster item mentah
          (pf_item_clusters): 1 laporan = &quot;baru&quot; (belum
          terkoroborasi); ≥2 laporan dari sumber berbeda =
          &quot;peristiwa sama&quot;; anggota yang ditambahkan &gt;6
          jam sesudah klaster dibuat = &quot;pembaruan&quot;.
          &quot;Bertentangan&quot; TIDAK dinilai di radar — butuh
          analisis klaim per artikel, bukan hitungan klaster.
          Jangan klaim trending dari angka ini: radar hanya
          menampilkan klaster terbaru, bukan peringkat popularitas.
        </p>
        {!tersedia ? (
          <EmptyState
            judul="Radar tidak dapat dibaca"
            pesan="Klaster tidak dapat dibaca — periksa koneksi atau izin baca staf untuk pf_item_clusters."
          />
        ) : baris.length === 0 ? (
          <EmptyState
            judul="Belum ada klaster"
            pesan="Belum ada klaster peristiwa yang terbentuk dari item mentah."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Peristiwa</th>
                  <th>Label</th>
                  <th>Laporan</th>
                  <th>Sumber berbeda</th>
                  <th>Laporan pertama</th>
                  <th>Anggota terakhir</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.klaster.id}>
                    <td>{b.klaster.judul}</td>
                    <td>{b.label}</td>
                    <td>{b.jumlahLaporan}</td>
                    <td>{b.jumlahSumber}</td>
                    <td>{formatWaktu(b.pertama)}</td>
                    <td>{formatWaktu(b.terakhir)}</td>
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
