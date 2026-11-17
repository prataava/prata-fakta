// Pelari baterai (Node 24.22.1): daftarkan loader alias @/ +
// stub Next lewat module.register() LALU impor baterai yang
// diminta. Cara pakai (dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-global-intel.mjs
// KENAPA BUKAN --import loader: di Node ini, --import TIDAK
// mendaftarkan hook resolve (terbukti 17 Nov 2026: hook
// minimal tidak pernah terpanggil) sehingga semua impor @/
// crash ERR_MODULE_NOT_FOUND di §B — BUKAN regresi kode.
// module.register() adalah jalur yang didukung loader ini
// (lihat komentar di scripts/uji-tahap13c-loader.mjs).
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error(
    "Pakai: node --experimental-strip-types scripts/jalankan-baterai.mjs <berkas-baterai.mjs>",
  );
  process.exit(2);
}
register(
  "./uji-tahap13c-loader.mjs",
  new URL("./jalankan-baterai.mjs", import.meta.url).href,
);
await import(
  pathToFileURL(path.resolve(process.cwd(), target)).href
);
