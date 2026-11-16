// Loader ESM untuk baterai uji-tahap13c.mjs — HANYA dipakai baterai.
// Node type-stripping tidak menyelesaikan alias `@/` dan impor
// relatif tanpa ekstensi (mis. "./types"), jadi loader ini:
//   - memetakan `@/...` -> `<repo>/src/...` (+ .ts/.tsx bila perlu);
//   - menambahkan ekstensi .ts/.tsx pada impor relatif;
//   - mengganti `next/headers` dengan stub (baterai tidak punya
//     runtime Next; pemicuJobManual memakai service client, bukan
//     createClient server).
// Daftarkan dari baterai dengan:
//   import { register } from "node:module";
//   register("./uji-tahap13c-loader.mjs", import.meta.url);
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const DIR_REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIR_SRC = path.join(DIR_REPO, "src");

function cobaFile(dasar) {
  const kandidat = [
    dasar,
    `${dasar}.ts`,
    `${dasar}.tsx`,
    path.join(dasar, "index.ts"),
  ];
  for (const k of kandidat) {
    try {
      if (existsSync(k)) return k;
    } catch {
      // Abaikan dan coba kandidat berikut.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return {
      url: new URL(
        "./uji-tahap13c-next-headers-stub.mjs",
        import.meta.url,
      ).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const target = cobaFile(path.join(DIR_SRC, specifier.slice(2)));
    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL
  ) {
    const induk = fileURLToPath(context.parentURL);
    const target = cobaFile(
      path.resolve(path.dirname(induk), specifier),
    );
    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
