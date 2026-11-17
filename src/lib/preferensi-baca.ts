// Preferensi baca (P3-2) — tipe, nilai valid, default, dan helper
// klien + penyimpanan tamu. Berkas ini AMAN DIIMPOR KOMPONEN
// KLIEN: tanpa impor server (tanpa createClient, tanpa
// next/headers). Nilai enum di sini WAJIB sama persis dengan
// CHECK migrasi v21 dan dengan tipe di PembacaArtikel.tsx —
// bila satu sisi berubah, ubah ketiganya.
//
// Tamu (belum login): preferensi disimpan di localStorage
// (kunci PF-PREFERENSI-BACA, JSON) dan diterapkan saat mount.
// Saat login, preferensi AKUN menang (menimpa localStorage);
// localStorage TIDAK diunggah otomatis ke akun.
import type { ModeBaca, UkuranFont } from "@/components/artikel/PembacaArtikel";
// Tipe Bahasa dipakai bersama dengan P3-3 (src/lib/i18n.ts) —
// SATU definisi di i18n.ts, di sini hanya re-export type-only
// (dihapus saat kompilasi; tidak ada impor runtime baru, jadi
// berkas ini tetap aman diimpor komponen klien).
import type { Bahasa } from "@/lib/i18n";

export type { Bahasa, ModeBaca, UkuranFont };

export type Kepadatan = "nyaman" | "rapat";

export type PreferensiBaca = {
  mode_baca: ModeBaca;
  ukuran_font: UkuranFont;
  kepadatan: Kepadatan;
  bahasa: Bahasa;
};

export const DEFAULT_PREFERENSI_BACA: PreferensiBaca = {
  mode_baca: "3menit",
  ukuran_font: "M",
  kepadatan: "nyaman",
  bahasa: "id",
};

/** Nilai yang diterima tiap kunci string (cermin CHECK v21). */
export const NILAI_PREFERENSI_BACA: Record<keyof PreferensiBaca, readonly string[]> = {
  mode_baca: ["1menit", "3menit", "mendalam"],
  ukuran_font: ["S", "M", "L"],
  kepadatan: ["nyaman", "rapat"],
  bahasa: ["id", "en"],
};

export const KUNCI_PREFERENSI_BACA = [
  "mode_baca",
  "ukuran_font",
  "kepadatan",
  "bahasa",
] as const;

export type KunciPreferensiBaca = (typeof KUNCI_PREFERENSI_BACA)[number];

/** true bila nilai diizinkan untuk kunci itu (cermin CHECK v21). */
export function nilaiPreferensiBacaValid(
  kunci: KunciPreferensiBaca,
  nilai: unknown,
): nilai is string {
  return (
    typeof nilai === "string" &&
    (NILAI_PREFERENSI_BACA[kunci] as readonly string[]).includes(nilai)
  );
}

/**
 * Validasi satu patch preferensi baca dari body PATCH.
 * Kembalikan { ok: true, perubahan } bila semua kunci yang ada
 * valid, atau { ok: false, error } dengan pesan jujur bila ada
 * kunci tak dikenal / nilai di luar CHECK.
 */
export function validasiPatchPreferensiBaca(
  body: Record<string, unknown>,
): { ok: true; perubahan: Partial<PreferensiBaca> } | { ok: false; error: string } {
  const perubahan: Partial<PreferensiBaca> = {};
  for (const kunci of KUNCI_PREFERENSI_BACA) {
    if (!(kunci in body)) continue;
    const nilai = body[kunci];
    if (!nilaiPreferensiBacaValid(kunci, nilai)) {
      return {
        ok: false,
        error: `Nilai ${kunci} tidak valid. Nilai yang diterima: ${NILAI_PREFERENSI_BACA[kunci].join(", ")}.`,
      };
    }
    (perubahan as Record<string, string>)[kunci] = nilai;
  }
  return { ok: true, perubahan };
}

/** Normalisasi baris DB (atau parsial) ke PreferensiBaca lengkap. */
export function dariBarisPreferensiBaca(
  data: Record<string, unknown> | null | undefined,
): PreferensiBaca {
  if (!data) return { ...DEFAULT_PREFERENSI_BACA };
  return {
    mode_baca: nilaiPreferensiBacaValid("mode_baca", data.mode_baca)
      ? (data.mode_baca as ModeBaca)
      : DEFAULT_PREFERENSI_BACA.mode_baca,
    ukuran_font: nilaiPreferensiBacaValid("ukuran_font", data.ukuran_font)
      ? (data.ukuran_font as UkuranFont)
      : DEFAULT_PREFERENSI_BACA.ukuran_font,
    kepadatan: nilaiPreferensiBacaValid("kepadatan", data.kepadatan)
      ? (data.kepadatan as Kepadatan)
      : DEFAULT_PREFERENSI_BACA.kepadatan,
    bahasa: nilaiPreferensiBacaValid("bahasa", data.bahasa)
      ? (data.bahasa as Bahasa)
      : DEFAULT_PREFERENSI_BACA.bahasa,
  };
}

// ---------- Penyimpanan tamu (localStorage) ----------

export const KUNCI_LOCALSTORAGE_BACA = "pf-preferensi-baca";

/** Baca preferensi tamu dari localStorage; null bila tidak ada/rusak. */
export function bacaPreferensiBacaTamu(): Partial<PreferensiBaca> | null {
  if (typeof window === "undefined") return null;
  try {
    const mentah = window.localStorage.getItem(KUNCI_LOCALSTORAGE_BACA);
    if (!mentah) return null;
    const parsed = JSON.parse(mentah) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const hasil: Partial<PreferensiBaca> = {};
    for (const kunci of KUNCI_PREFERENSI_BACA) {
      if (nilaiPreferensiBacaValid(kunci, parsed[kunci])) {
        (hasil as Record<string, string>)[kunci] = parsed[kunci] as string;
      }
    }
    return Object.keys(hasil).length > 0 ? hasil : null;
  } catch {
    return null;
  }
}

/** Simpan (gabung) preferensi tamu ke localStorage. Diam bila gagal. */
export function simpanPreferensiBacaTamu(perubahan: Partial<PreferensiBaca>): void {
  if (typeof window === "undefined") return;
  try {
    const lama = bacaPreferensiBacaTamu() ?? {};
    window.localStorage.setItem(
      KUNCI_LOCALSTORAGE_BACA,
      JSON.stringify({ ...lama, ...perubahan }),
    );
  } catch {
    // localStorage penuh/diblokir: preferensi sesi ini tetap berlaku.
  }
}

// ---------- Penerapan ke DOM ----------

/**
 * Terapkan kepadatan ke <body> (aturan CSS di globals.css).
 * "nyaman" = default: atribut dihapus agar CSS bawaan berlaku.
 */
export function terapkanKepadatan(kepadatan: Kepadatan): void {
  if (typeof document === "undefined") return;
  if (kepadatan === "rapat") {
    document.body.setAttribute("data-kepadatan", "rapat");
  } else {
    document.body.removeAttribute("data-kepadatan");
  }
}

/**
 * PATCH /api/saya/preferensi untuk satu/beberapa kunci baca.
 * Kembalikan true bila server menerima (res.ok + data.ok).
 * Dipakai komponen klien (debounce dilakukan pemanggil).
 */
export async function kirimPreferensiBaca(
  perubahan: Partial<PreferensiBaca>,
): Promise<boolean> {
  try {
    const res = await fetch("/api/saya/preferensi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perubahan),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}
