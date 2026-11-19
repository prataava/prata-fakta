// Helper bersama baterai PGlite — HANYA dipakai baterai.
// Me-resolve @electric-sql/pglite dari node_modules repo
// (via package.json repo), bukan dari direktori /tmp yang
// tidak ada di VM ini (semua baterai PGlite crash
// ERR_MODULE_NOT_FOUND saat start).
// Cara pakai dari baterai di scripts/:
//   import { PGlite } from "./butuh-pglite.mjs";
// Perilaku identik dengan pola lama (createRequire dari
// package.json lalu require("@electric-sql/pglite")).
// Pengecualian: dua baterai yang memakai `require` telanjang
// untuk keperluan lain (uji-tahapD-security.mjs, uji-p0-cari.mjs)
// tetap memakai createRequire, hanya argumennya diarahkan ke
// package.json repo (pola requireRepo yang sudah dipakai di
// banyak baterai lain).
import { createRequire } from "node:module";

const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
export const { PGlite } = requireRepo("@electric-sql/pglite");
