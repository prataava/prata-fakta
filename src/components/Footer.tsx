import Link from "next/link";
import { KATEGORI_UTAMA } from "@/lib/categories";
import TahunIni from "@/components/TahunIni";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wadah">
        <div className="footer-dalam">
          <div>
            <h4>PRATA FAKTA</h4>
            <p>
              Pahami dunia. Berdasarkan fakta. Platform berita dan pengetahuan
              digital: berita terkini Indonesia dan dunia dengan sumber jelas,
              pemeriksaan fakta, data, dan kronologi.
            </p>
          </div>
          <div>
            <h4>Kategori</h4>
            <ul>
              {KATEGORI_UTAMA.slice(0, 6).map((k) => (
                <li key={k.slug}>
                  <Link href={`/kategori/${k.slug}`}>{k.nama}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Layanan</h4>
            <ul>
              <li>
                <Link href="/brief">Daily Brief</Link>
              </li>
              <li>
                <Link href="/arsip">Arsip Berita</Link>
              </li>
              <li>
                <Link href="/kategori/fakta-mitos">Fakta &amp; Mitos</Link>
              </li>
              <li>
                <Link href="/kategori/data-statistik">Data &amp; Statistik</Link>
              </li>
              <li>
                <Link href="/cari">Pencarian</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Redaksi &amp; Legal</h4>
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
            © <TahunIni /> PRATA FAKTA. Seluruh artikel orisinal ditulis
            berdasarkan sumber yang tercantum.
          </span>
          <span>Bahasa Indonesia · Indonesia &amp; Dunia</span>
        </div>
      </div>
    </footer>
  );
}
