import Link from "next/link";
import { Suspense } from "react";
import { KATEGORI_UTAMA } from "@/lib/categories";
import TahunIni from "@/components/TahunIni";
import { getBahasa, t, type Bahasa } from "@/lib/i18n";

// Footer (P3-3): label seksi + "Tentang" + tautan generik dari
// kamus; nama kategori, nama dokumen kebijakan, dan "Daily Brief"
// adalah nama resmi — tetap Indonesia.
// Bahasa dibaca server (getBahasa → cookie pf-bahasa) di dalam
// komponen async yang dibungkus <Suspense> di DALAM Footer — pola
// yang sama dengan BannerPemeliharaan di Header: shell footer
// tetap prerender (fallback = footer Indonesia), versi terjemahan
// mengalir sesudahnya. JANGAN panggil getBahasa() di root layout
// (aturan rumah) dan JANGAN jadikan Footer sendiri async tanpa
// Suspense (akan memaksa semua halaman dinamis).
function FooterIsi({ bahasa }: { bahasa: Bahasa }) {
  return (
    <footer className="footer">
      <div className="wadah">
        <div className="footer-dalam">
          <div>
            <h4>
              PRATA <em>FAKTA</em>
            </h4>
            <p>{t(bahasa, "footer.tentang")}</p>
          </div>
          <div>
            <h4>{t(bahasa, "footer.kategori")}</h4>
            <ul>
              {KATEGORI_UTAMA.slice(0, 6).map((k) => (
                <li key={k.slug}>
                  <Link href={`/kategori/${k.slug}`}>{k.nama}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>{t(bahasa, "footer.layanan")}</h4>
            <ul>
              <li>
                <Link href="/brief">Daily Brief</Link>
              </li>
              <li>
                <Link href="/arsip">{t(bahasa, "footer.arsipBerita")}</Link>
              </li>
              <li>
                <Link href="/kategori/fakta-mitos">Fakta &amp; Mitos</Link>
              </li>
              <li>
                <Link href="/kategori/data-statistik">Data &amp; Statistik</Link>
              </li>
              <li>
                <Link href="/cari">{t(bahasa, "footer.pencarian")}</Link>
              </li>
              <li>
                <Link href="/laporkan">{t(bahasa, "footer.laporkan")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>{t(bahasa, "footer.redaksiLegal")}</h4>
            <ul>
              <li>
                <Link href="/kebijakan/redaksi">Kebijakan Redaksi</Link>
              </li>
              <li>
                <Link href="/kebijakan/koreksi">Koreksi &amp; Hak Jawab</Link>
              </li>
              <li>
                <Link href="/kebijakan/privasi">Kebijakan Privasi</Link>
              </li>
              <li>
                <Link href="/kebijakan/syarat">Syarat Penggunaan</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bawah">
          <span>
            © <TahunIni /> PRATA FAKTA. {t(bahasa, "footer.hakCipta")}
          </span>
          <span>{t(bahasa, "footer.bahasaWilayah")}</span>
        </div>
      </div>
    </footer>
  );
}

async function FooterTerjemah() {
  const bahasa = await getBahasa();
  return <FooterIsi bahasa={bahasa} />;
}

export default function Footer() {
  return (
    <Suspense fallback={<FooterIsi bahasa="id" />}>
      <FooterTerjemah />
    </Suspense>
  );
}
