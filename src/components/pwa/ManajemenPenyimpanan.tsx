"use client";

import { useEffect, useState } from "react";

// Manajemen penyimpanan offline (P3-1).
// DIPASANG oleh integrator P3-5 ke /saya/pengaturan — komponen ini
// saja TIDAK memasang dirinya sendiri.
// Menampilkan estimasi navigator.storage.estimate(), daftar cache
// service worker, dan jumlah artikel tersimpan (entri cache yang
// URL-nya diawali /artikel/). Tombol "Hapus cache offline"
// menghapus SEMUA cache yang dibuat service worker.
// Catatan jujur: hanya konten publik yang disimpan; data akun
// tidak pernah di-cache (sw.js melewati /api/*, /saya/*, /masuk,
// /daftar, /admin/* sepenuhnya).

type CacheInfo = { nama: string; jumlahEntri: number };

function formatBytes(nilai: number | undefined): string {
  if (nilai === undefined || Number.isNaN(nilai)) return "Tidak diketahui";
  if (nilai < 1024) return `${nilai} B`;
  if (nilai < 1024 * 1024) return `${(nilai / 1024).toFixed(1)} KB`;
  return `${(nilai / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManajemenPenyimpanan() {
  const [didukung, setDidukung] = useState<boolean | null>(null);
  const [pemakaian, setPemakaian] = useState<number | undefined>(undefined);
  const [kuota, setKuota] = useState<number | undefined>(undefined);
  const [cache, setCache] = useState<CacheInfo[]>([]);
  const [artikelTersimpan, setArtikelTersimpan] = useState(0);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [memuat, setMemuat] = useState(true);

  // Pola sama seperti PengalihPush: pemuat didefinisikan DI DALAM
  // effect agar lint react-hooks/set-state-in-effect lolos.
  useEffect(() => {
    let batal = false;
    async function muat() {
      try {
        if (!("storage" in navigator) || !("caches" in window)) {
          if (!batal) setDidukung(false);
          return;
        }
        if (!batal) setDidukung(true);
        const estimasi = await navigator.storage.estimate().catch(() => null);
        if (batal) return;
        if (estimasi) {
          setPemakaian(estimasi.usage);
          setKuota(estimasi.quota);
        }
        const namaCache = await caches.keys();
        if (batal) return;
        const info: CacheInfo[] = [];
        let artikel = 0;
        for (const nama of namaCache) {
          const c = await caches.open(nama);
          const kunci = await c.keys();
          info.push({ nama, jumlahEntri: kunci.length });
          for (const req of kunci) {
            const url = new URL(req.url);
            if (url.pathname.startsWith("/artikel/")) artikel += 1;
          }
        }
        if (batal) return;
        setCache(info);
        setArtikelTersimpan(artikel);
      } catch {
        if (!batal) setPesan("Gagal membaca penyimpanan offline di browser ini.");
      } finally {
        if (!batal) setMemuat(false);
      }
    }
    void muat();
    return () => {
      batal = true;
    };
  }, []);

  async function hapusCache() {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const namaCache = await caches.keys();
      for (const nama of namaCache) {
        await caches.delete(nama);
      }
      // Cache kini kosong — tampilkan keadaan itu langsung tanpa
      // memuat ulang dari storage.
      setCache([]);
      setArtikelTersimpan(0);
      setPemakaian(undefined);
      setKuota(undefined);
      setPesan("Cache offline dihapus. Artikel perlu dibuka lagi saat online agar tersimpan kembali.");
    } catch {
      setPesan("Gagal menghapus cache offline. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  if (didukung === false) {
    return (
      <p className="artikel-meta-kecil">
        Browser ini tidak mendukung penyimpanan offline (Cache Storage).
      </p>
    );
  }

  const totalEntri = cache.reduce((acc, c) => acc + c.jumlahEntri, 0);

  return (
    <div>
      {memuat ? (
        <p className="artikel-meta-kecil">Memeriksa penyimpanan offline…</p>
      ) : (
        <>
          <p className="artikel-meta-kecil">
            Pemakaian penyimpanan: {formatBytes(pemakaian)}
            {kuota !== undefined ? ` dari kuota ${formatBytes(kuota)}` : ""}.
          </p>
          <p className="artikel-meta-kecil">
            {totalEntri === 0
              ? "Belum ada konten offline yang tersimpan. Buka artikel saat online agar bisa dibaca saat offline."
              : `${totalEntri} entri tersimpan di ${cache.length} cache, termasuk ${artikelTersimpan} artikel.`}
          </p>
          {cache.length > 0 ? (
            <ul>
              {cache.map((c) => (
                <li key={c.nama} className="artikel-meta-kecil">
                  {c.nama} — {c.jumlahEntri} entri
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <button
        className="tombol tombol-hantu"
        type="button"
        onClick={() => void hapusCache()}
        disabled={sibuk || memuat}
      >
        {sibuk ? "Menghapus…" : "Hapus cache offline"}
      </button>
      <p className="artikel-meta-kecil">
        Hanya konten publik yang disimpan; data akun tidak pernah di-cache.
      </p>
      {pesan ? (
        <p role="status" className="artikel-meta-kecil">
          {pesan}
        </p>
      ) : null}
    </div>
  );
}
