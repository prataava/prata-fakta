// Stub next/headers untuk baterai uji-tahap13c.mjs — HANYA dipakai
// baterai. Bila ada kode yang memanggilnya saat baterai berjalan,
// lempar dengan jelas (bukan gagal diam-diam).
export async function cookies() {
  throw new Error("next/headers tidak tersedia di baterai uji-tahap13c");
}

export function headers() {
  throw new Error("next/headers tidak tersedia di baterai uji-tahap13c");
}

export function draftMode() {
  throw new Error("next/headers tidak tersedia di baterai uji-tahap13c");
}
