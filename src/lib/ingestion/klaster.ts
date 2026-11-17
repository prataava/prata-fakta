// Pengelompokan klaster event — Fase 7 (c).
// Fungsi murni: kelompokkan item mentah tentang PERISTIWA SAMA
// (multi-sumber) menjadi satu klaster, TANPA menghapus atau
// menggabungkan laporan: klaster = 1 event dengan N laporan utuh
// (tiap laporan tetap baris pf_raw_items sendiri; klaster hanya
// menunjuk mereka lewat pf_item_cluster_members, migrasi v24).
//
// Aturan keanggotaan (ketiganya harus terpenuhi):
//   1. judul mirip: kemiripan Jaccard token >= 0,8 (sama dengan
//      ambang dedup lunak) ATAU judul ternormalisasi identik;
//   2. jendela waktu: selisih waktu efektif <= 48 jam (waktu
//      terbit bila ada, bila tidak waktu_diambil — GDELT tidak
//      punya tanggal terbit, jadi waktu_diambil yang dipakai);
//   3. klaster hanya disimpan bila >= 2 item dari >= 2 sumber
//      berbeda (satu sumber yang menulis 2x bukan "multi-sumber").
//
// KENAPA TABEL BARU (v24), BUKAN pf_story_events/pf_story_articles:
// pf_story_events menghubungkan pf_stories <-> pf_events, dan
// pf_story_articles menghubungkan pf_stories <-> pf_articles —
// keduanya butuh entitas editorial (cerita/peristiwa/artikel)
// yang BELUM ADA saat item mentah masuk. Klaster ingestion
// menghubungkan item MENTAH satu sama lain, jadi butuh tabel
// sendiri (pf_item_clusters + pf_item_cluster_members).
// Bila nanti sebuah klaster diangkat jadi cerita editorial,
// pf_stories dapat merujuk klaster itu — bukan sebaliknya.

import { createHash } from "node:crypto";
import {
  AMBANG_DUPLIKAT_LUNAK,
  kemiripanJudul,
  normalisasiJudul,
  tokenJudul,
} from "./dedup.ts";

/** Jendela waktu satu peristiwa (48 jam, sama dengan dedup lunak). */
export const JENDELA_KLASTER_MS = 48 * 60 * 60 * 1000;
/** Ambang kemiripan judul untuk satu klaster (sama dengan dedup lunak). */
export const AMBANG_KLASTER = AMBANG_DUPLIKAT_LUNAK;

export interface BarisItemKlaster {
  id: string;
  judul: string;
  sumber_id: string | null;
  waktu_terbit_asli: string | null;
  waktu_diambil: string;
}

export interface Klaster {
  /** Kunci stabil (sha256 16 hex dari token judul wakil). */
  kunci: string;
  /** Judul wakil: judul item paling awal dalam klaster. */
  judul: string;
  item_ids: string[];
  sumber_ids: string[];
  /** ISO waktu efektif paling awal / paling akhir dalam klaster. */
  waktu_min: string | null;
  waktu_maks: string | null;
}

function waktuEfektifMs(baris: BarisItemKlaster): number | null {
  const kandidat = [baris.waktu_terbit_asli, baris.waktu_diambil];
  for (const iso of kandidat) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

/** Kunci stabil dari judul wakil (token unik terurut -> sha256). */
export function kunciKlaster(judul: string): string {
  const token = tokenJudul(judul).sort().join(" ");
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16);
}

/**
 * Kelompokkan item menjadi klaster (union-find atas pasangan yang
 * memenuhi aturan). Fungsi murni. Hanya klaster >= 2 item dari
 * >= 2 sumber berbeda yang dikembalikan; item tunggal / satu
 * sumber dibuang (bukan klaster multi-sumber).
 */
export function kelompokkanKlaster(
  items: BarisItemKlaster[],
  opsi: { ambang?: number; jendelaMs?: number } = {},
): Klaster[] {
  const ambang = opsi.ambang ?? AMBANG_KLASTER;
  const jendelaMs = opsi.jendelaMs ?? JENDELA_KLASTER_MS;

  const induk = items.map((_b, i) => i);
  const cari = (i: number): number => {
    let akar = i;
    while (induk[akar] !== akar) akar = induk[akar];
    // Kompresi jalur (iteratif, tanpa rekursi).
    let j = i;
    while (induk[j] !== akar) {
      const berikut = induk[j];
      induk[j] = akar;
      j = berikut;
    }
    return akar;
  };
  const gabung = (a: number, b: number): void => {
    const ra = cari(a);
    const rb = cari(b);
    if (ra !== rb) induk[rb] = ra;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      // Sumber sama tidak pernah membentuk klaster berdua (butuh
      // >= 2 sumber — dicek lagi di akhir, tapi pasangan sesumber
      // juga tidak digabung agar tidak menarik item ketiga lewat
      // rantai sesumber).
      if (a.sumber_id !== null && a.sumber_id === b.sumber_id) continue;
      const mirip =
        normalisasiJudul(a.judul) === normalisasiJudul(b.judul) ||
        kemiripanJudul(a.judul, b.judul) >= ambang;
      if (!mirip) continue;
      const ta = waktuEfektifMs(a);
      const tb = waktuEfektifMs(b);
      if (ta === null || tb === null) continue;
      if (Math.abs(ta - tb) > jendelaMs) continue;
      gabung(i, j);
    }
  }

  const kelompok = new Map<number, BarisItemKlaster[]>();
  for (let i = 0; i < items.length; i++) {
    const akar = cari(i);
    const daftar = kelompok.get(akar) ?? [];
    daftar.push(items[i]);
    kelompok.set(akar, daftar);
  }

  const hasil: Klaster[] = [];
  for (const anggota of kelompok.values()) {
    if (anggota.length < 2) continue;
    const sumberUnik = [...new Set(anggota.map((b) => b.sumber_id))].filter(
      (s): s is string => s !== null,
    );
    if (sumberUnik.length < 2) continue;
    const terurut = [...anggota].sort((a, b) => {
      const ta = waktuEfektifMs(a) ?? 0;
      const tb = waktuEfektifMs(b) ?? 0;
      return ta - tb;
    });
    const wakil = terurut[0];
    const waktu = anggota
      .map((b) => waktuEfektifMs(b))
      .filter((ms): ms is number => ms !== null);
    hasil.push({
      kunci: kunciKlaster(wakil.judul),
      judul: wakil.judul,
      item_ids: anggota.map((b) => b.id),
      sumber_ids: sumberUnik,
      waktu_min:
        waktu.length > 0 ? new Date(Math.min(...waktu)).toISOString() : null,
      waktu_maks:
        waktu.length > 0 ? new Date(Math.max(...waktu)).toISOString() : null,
    });
  }

  // Urutan deterministik (kunci) agar hasil stabil antar run.
  hasil.sort((a, b) => (a.kunci < b.kunci ? -1 : a.kunci > b.kunci ? 1 : 0));
  return hasil;
}
