// Penulis notifikasi in-app (Gelombang B2-D, E1).
// SEBELUM gelombang ini: 0 INSERT ke pf_notifications di seluruh
// src/ (temuan audit P1-13) — tabel + API baca sudah ada sejak v6,
// tetapi tidak ada kejadian yang pernah menulis. Modul ini menutup
// celah itu: setiap kejadian nyata aplikasi memanggil salah satu
// fungsi di bawah (best-effort — notifikasi TIDAK PERNAH
// menggagalkan operasi utama).
//
// KEJADIAN YANG DITULIS (semuanya sudah ada jalurnya di kode):
//   topik    — artikel terbit di kategori/negara/isu yang diikuti
//              (dipanggil terbitkanArtikel; Tahap C-5: isu
//              dicocokkan terhadap kolom pf_articles.isu v15 —
//              pengikut tipe 'isu' sudah didukung /api/topik
//              sejak v6, yang hilang hanya kolom + pencocokan
//              ini)
//   jawaban  — pertanyaan pengguna terjawab / dinyatakan tidak ada
//              datanya (PATCH /api/admin/tanya/[id])
//   koreksi  — laporan koreksi pengguna diterima/ditolak/ditinjau
//              (tindaklanjutiKoreksi)
//   podcast  — episode baru berstatus terbit (POST/PATCH
//              /api/admin/podcast)
// JENIS 'artikel'/'breaking'/'brief'/'peristiwa' tetap didukung
// tulisannya (kirimNotifikasi umum) untuk pemakaian staf nanti.
//
// ATURAN:
// - Preferensi per pengguna (pf_user_preferences): tiap jenis
//   punya sakelarnya (notifikasi_topik/koreksi/jawaban/podcast);
//   tanpa baris preferensi = semua default AKTIF (kecuali push).
// - Dedup: kunci_dedup (user_id, kunci) unik — satu kejadian
//   hanya menghasilkan SATU notifikasi per pengguna, walau
//   pemicu terpanggil dua kali (mis. PATCH podcast status
//   'terbit' berulang).
// - Privasi: judul/isi notifikasi TIDAK PERNAH berisi isi
//   pertanyaan/komentar pengguna — hanya status kejadiannya.
// - Sesudah INSERT berhasil, ketukan push VAPID dikirim bila
//   pengguna mengaktifkan push_notifikasi + ada langganan push
//   (lihat lib/notifikasi/push.ts). Push gagal = notifikasi
//   in-app tetap tersimpan.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cobaServiceClient } from "../supabase/service.ts";
import { kirimPushKePengguna } from "./push.ts";

export const JENIS_NOTIFIKASI = [
  "breaking",
  "topik",
  "brief",
  "artikel",
  "koreksi",
  "peristiwa",
  "jawaban",
  "podcast",
] as const;
export type JenisNotifikasi = (typeof JENIS_NOTIFIKASI)[number];

/** Kolom preferensi yang mengendalikan tiap jenis (null = selalu kirim). */
const PETA_PREFERENSI: Record<JenisNotifikasi, string | null> = {
  breaking: null,
  topik: "notifikasi_topik",
  brief: null,
  artikel: "notifikasi_topik",
  koreksi: "notifikasi_koreksi",
  peristiwa: null,
  jawaban: "notifikasi_jawaban",
  podcast: "notifikasi_podcast",
};

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HasilKirim =
  | { ok: true; terkirim: boolean; alasan?: string }
  | { ok: false; alasan: string };

function klienAtauNull(
  service?: SupabaseClient | null,
): SupabaseClient | null {
  if (service) return service;
  return cobaServiceClient();
}

type PreferensiNotifikasi = Record<string, boolean>;

async function bacaPreferensi(
  service: SupabaseClient,
  userId: string,
): Promise<PreferensiNotifikasi> {
  const bawaan: PreferensiNotifikasi = {
    notifikasi_topik: true,
    notifikasi_koreksi: true,
    notifikasi_jawaban: true,
    notifikasi_podcast: true,
    push_notifikasi: false,
  };
  try {
    const { data, error } = await service
      .from("pf_user_preferences")
      .select(
        "notifikasi_topik, notifikasi_koreksi, notifikasi_jawaban, notifikasi_podcast, push_notifikasi",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return bawaan;
    const baris = data as Record<string, unknown>;
    for (const kunci of Object.keys(bawaan)) {
      // Kolom v14 belum ada (sebelum migrasi dijalankan) dibaca
      // sebagai undefined → pakai nilai bawaan, bukan gagal.
      if (typeof baris[kunci] === "boolean") bawaan[kunci] = baris[kunci];
    }
    return bawaan;
  } catch {
    return bawaan;
  }
}

async function bacaPreferensiBanyak(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, PreferensiNotifikasi>> {
  const peta = new Map<string, PreferensiNotifikasi>();
  if (userIds.length === 0) return peta;
  try {
    const { data, error } = await service
      .from("pf_user_preferences")
      .select(
        "user_id, notifikasi_topik, notifikasi_koreksi, notifikasi_jawaban, notifikasi_podcast, push_notifikasi",
      )
      .in("user_id", userIds);
    if (!error && data) {
      for (const baris of data as Record<string, unknown>[]) {
        const id = String(baris.user_id);
        const pref: PreferensiNotifikasi = {
          notifikasi_topik: true,
          notifikasi_koreksi: true,
          notifikasi_jawaban: true,
          notifikasi_podcast: true,
          push_notifikasi: false,
        };
        for (const kunci of Object.keys(pref)) {
          if (typeof baris[kunci] === "boolean") pref[kunci] = baris[kunci];
        }
        peta.set(id, pref);
      }
    }
  } catch {
    // Gagal baca preferensi = pakai bawaan (semua aktif).
  }
  for (const id of userIds) {
    if (!peta.has(id)) {
      peta.set(id, {
        notifikasi_topik: true,
        notifikasi_koreksi: true,
        notifikasi_jawaban: true,
        notifikasi_podcast: true,
        push_notifikasi: false,
      });
    }
  }
  return peta;
}

export type InputNotifikasi = {
  userId: string;
  jenis: JenisNotifikasi;
  judul: string;
  isi?: string | null;
  tautan?: string | null;
  /** Kunci dedup stabil per kejadian, mis. `topik:<artikel_id>`. */
  kunciDedup?: string | null;
};

/**
 * Tulis SATU notifikasi untuk satu pengguna (dengan cek preferensi
 * + dedup). TIDAK PERNAH melempar.
 */
export async function kirimNotifikasi(
  service: SupabaseClient | null | undefined,
  input: InputNotifikasi,
): Promise<HasilKirim> {
  const klien = klienAtauNull(service ?? null);
  if (!klien) return { ok: false, alasan: "service-tidak-tersedia" };
  const judul = input.judul.trim();
  if (!POLA_UUID.test(input.userId)) {
    return { ok: false, alasan: "user-tidak-valid" };
  }
  if (!judul || judul.length > 200) {
    return { ok: false, alasan: "judul-tidak-valid" };
  }
  if (!JENIS_NOTIFIKASI.includes(input.jenis)) {
    return { ok: false, alasan: "jenis-tidak-valid" };
  }
  const isi =
    typeof input.isi === "string" && input.isi.trim()
      ? input.isi.trim().slice(0, 500)
      : null;
  const tautan =
    typeof input.tautan === "string" && input.tautan.startsWith("/")
      ? input.tautan.slice(0, 500)
      : null;
  const kunciDedup =
    typeof input.kunciDedup === "string" && input.kunciDedup
      ? input.kunciDedup.slice(0, 200)
      : null;

  const pref = await bacaPreferensi(klien, input.userId);
  const kolomPref = PETA_PREFERENSI[input.jenis];
  if (kolomPref && pref[kolomPref] === false) {
    return { ok: true, terkirim: false, alasan: "preferensi-nonaktif" };
  }
  try {
    if (kunciDedup) {
      const { data: ada } = await klien
        .from("pf_notifications")
        .select("id")
        .eq("user_id", input.userId)
        .eq("kunci_dedup", kunciDedup)
        .maybeSingle();
      if (ada) return { ok: true, terkirim: false, alasan: "duplikat" };
    }
    const { error } = await klien.from("pf_notifications").insert({
      user_id: input.userId,
      jenis: input.jenis,
      judul,
      isi,
      tautan,
      kunci_dedup: kunciDedup,
    });
    if (error) {
      // Balapan dedup: dua pemicu bersamaan → abaikan 23505.
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, terkirim: false, alasan: "duplikat" };
      }
      console.error("[notifikasi] gagal insert:", error);
      return { ok: false, alasan: "gagal-tulis" };
    }
  } catch (err) {
    console.error("[notifikasi] gagal insert:", err);
    return { ok: false, alasan: "gagal-tulis" };
  }
  // Push best-effort (tidak pernah menggagalkan notifikasi in-app).
  if (pref.push_notifikasi === true) {
    try {
      await kirimPushKePengguna(klien, input.userId);
    } catch {
      // Push gagal = diam-diam dilewati; in-app tetap tersimpan.
    }
  }
  return { ok: true, terkirim: true };
}

/**
 * Tulis notifikasi yang SAMA ke banyak pengguna (fan-out topik /
 * podcast): satu baca preferensi + satu cek dedup + satu insert
 * massal. Mengembalikan jumlah baris yang benar-benar ditulis.
 */
async function kirimMassal(
  klien: SupabaseClient,
  input: {
    userIds: string[];
    jenis: JenisNotifikasi;
    kolomPref: string;
    judul: string;
    isi: string | null;
    tautan: string | null;
    kunciDedup: string;
  },
): Promise<number> {
  const unik = [...new Set(input.userIds)].filter((id) =>
    POLA_UUID.test(id),
  );
  if (unik.length === 0) return 0;
  const prefs = await bacaPreferensiBanyak(klien, unik);
  const diizinkan = unik.filter(
    (id) => prefs.get(id)?.[input.kolomPref] !== false,
  );
  if (diizinkan.length === 0) return 0;
  let sudah: Set<string> = new Set();
  try {
    const { data } = await klien
      .from("pf_notifications")
      .select("user_id")
      .in("user_id", diizinkan)
      .eq("kunci_dedup", input.kunciDedup);
    sudah = new Set((data ?? []).map((r) => String((r as { user_id: string }).user_id)));
  } catch {
    sudah = new Set();
  }
  const baru = diizinkan.filter((id) => !sudah.has(id));
  if (baru.length === 0) return 0;
  const baris = baru.map((userId) => ({
    user_id: userId,
    jenis: input.jenis,
    judul: input.judul,
    isi: input.isi,
    tautan: input.tautan,
    kunci_dedup: input.kunciDedup,
  }));
  const { error } = await klien.from("pf_notifications").insert(baris);
  if (error) {
    console.error("[notifikasi] gagal insert massal:", error);
    return 0;
  }
  // Push best-effort, dibatasi 100 penerima per kejadian agar
  // satu episode tidak menahan respons admin.
  const untukPush = baru
    .filter((id) => prefs.get(id)?.push_notifikasi === true)
    .slice(0, 100);
  for (const id of untukPush) {
    try {
      await kirimPushKePengguna(klien, id);
    } catch {
      // Abaikan — in-app tetap tersimpan.
    }
  }
  return baru.length;
}

/** Artikel terbit → beri tahu pengikut kategori / negara / isunya. */
export async function kirimNotifikasiTopik(
  service: SupabaseClient | null | undefined,
  artikelId: string,
): Promise<number> {
  const klien = klienAtauNull(service ?? null);
  if (!klien || !POLA_UUID.test(artikelId)) return 0;
  try {
    // Tahap C-5 (v15): kolom isu dibaca bila ada; bila migrasi
    // v15 belum dijalankan, PostgREST menjawab PGRST204 dan
    // fungsi mundur ke select tanpa isu (notifikasi isu
    // dilewati; kategori/negara tetap jalan).
    let artikelRes = await klien
      .from("pf_articles")
      .select("id, slug, judul, kategori_slug, negara_kode, isu")
      .eq("id", artikelId)
      .maybeSingle();
    if (
      artikelRes.error &&
      (artikelRes.error as { code?: string }).code === "PGRST204"
    ) {
      artikelRes = await klien
        .from("pf_articles")
        .select("id, slug, judul, kategori_slug, negara_kode")
        .eq("id", artikelId)
        .maybeSingle();
    }
    const { data: artikel, error } = artikelRes;
    if (error || !artikel) return 0;
    const a = artikel as {
      slug: string;
      judul: string;
      kategori_slug: string | null;
      negara_kode: string | null;
      isu?: string | null;
    };
    const syarat: string[] = [];
    if (a.kategori_slug) syarat.push(`kategori:${a.kategori_slug}`);
    if (a.negara_kode) syarat.push(`negara:${a.negara_kode}`);
    if (a.isu) syarat.push(`isu:${a.isu}`);
    if (syarat.length === 0) return 0;
    // Target topik negara boleh berupa kode ISO-2 ('ID') ATAU nama
    // ('Indonesia') — validasi ikut di /api/topik menerima keduanya
    // (negaraAda). Karena itu pencocokan negara memakai ilike
    // terhadap kode DAN nama negara artikel ini.
    let namaNegara: string | null = null;
    if (a.negara_kode) {
      try {
        const { data: negara } = await klien
          .from("pf_countries")
          .select("nama")
          .eq("kode", a.negara_kode)
          .maybeSingle();
        namaNegara = (negara as { nama: string } | null)?.nama ?? null;
      } catch {
        namaNegara = null;
      }
    }
    const kondisi: string[] = [];
    if (a.kategori_slug) {
      kondisi.push(`and(tipe.eq.kategori,target.eq.${a.kategori_slug})`);
    }
    if (a.negara_kode) {
      kondisi.push(`and(tipe.eq.negara,target.ilike.${a.negara_kode})`);
      if (namaNegara) {
        kondisi.push(`and(tipe.eq.negara,target.ilike.${namaNegara})`);
      }
    }
    // Tahap C-5: pengikut topik tipe 'isu' dicocokkan dengan
    // ilike terhadap isu artikel (case-insensitive, seperti
    // negara — target isu divalidasi huruf/spasi/tanda hubung
    // di /api/topik, jadi tidak ada karakter or() yang lolos).
    if (a.isu) {
      kondisi.push(`and(tipe.eq.isu,target.ilike.${a.isu})`);
    }
    // Pengikut kategori ATAU negara artikel ini.
    const { data: pengikut, error: errIkut } = await klien
      .from("pf_followed_topics")
      .select("user_id, tipe, target")
      .or(kondisi.join(","));
    if (errIkut || !pengikut) return 0;
    // Batas fan-out: 1000 penerima per artikel.
    const userIds = [...new Set(
      (pengikut as { user_id: string }[]).map((p) => p.user_id),
    )].slice(0, 1000);
    return await kirimMassal(klien, {
      userIds,
      jenis: "topik",
      kolomPref: "notifikasi_topik",
      judul: `Artikel baru: ${a.judul}`.slice(0, 200),
      isi: "Artikel baru terbit pada topik yang Anda ikuti.",
      tautan: `/artikel/${a.slug}`,
      kunciDedup: `topik:${artikelId}`,
    });
  } catch (err) {
    console.error("[notifikasi] gagal notifikasi topik:", err);
    return 0;
  }
}

/** Pertanyaan terjawab / tidak ada data → beri tahu penanya. */
export async function kirimNotifikasiJawaban(
  service: SupabaseClient | null | undefined,
  pertanyaanId: string,
): Promise<HasilKirim> {
  const klien = klienAtauNull(service ?? null);
  if (!klien || !POLA_UUID.test(pertanyaanId)) {
    return { ok: false, alasan: "tidak-valid" };
  }
  try {
    const { data, error } = await klien
      .from("pf_questions")
      .select("id, user_id, status")
      .eq("id", pertanyaanId)
      .maybeSingle();
    if (error || !data) return { ok: false, alasan: "tidak-ditemukan" };
    const q = data as { user_id: string | null; status: string };
    if (!q.user_id) {
      return { ok: true, terkirim: false, alasan: "anonim" };
    }
    const terjawab = q.status === "terjawab";
    return await kirimNotifikasi(klien, {
      userId: q.user_id,
      jenis: "jawaban",
      judul: terjawab
        ? "Pertanyaan Anda sudah dijawab"
        : "Pertanyaan Anda dinyatakan tidak ada datanya",
      isi: terjawab
        ? "Jawaban beserta referensinya sudah tersedia di arsip Tanya."
        : "Redaksi tidak menemukan data yang cukup untuk menjawab pertanyaan Anda.",
      tautan: "/tanya/arsip",
      kunciDedup: `jawaban:${pertanyaanId}:${q.status}`,
    });
  } catch (err) {
    console.error("[notifikasi] gagal notifikasi jawaban:", err);
    return { ok: false, alasan: "gagal-tulis" };
  }
}

/** Laporan koreksi ditindaklanjuti → beri tahu pelapor. */
export async function kirimNotifikasiKoreksi(
  service: SupabaseClient | null | undefined,
  koreksiId: string,
  statusAkhir: "diperbaiki" | "ditolak" | "ditinjau",
  slugArtikel?: string | null,
): Promise<HasilKirim> {
  const klien = klienAtauNull(service ?? null);
  if (!klien || !POLA_UUID.test(koreksiId)) {
    return { ok: false, alasan: "tidak-valid" };
  }
  try {
    const { data, error } = await klien
      .from("pf_correction_reports")
      .select("id, pelapor_id, artikel_id")
      .eq("id", koreksiId)
      .maybeSingle();
    if (error || !data) return { ok: false, alasan: "tidak-ditemukan" };
    const k = data as {
      pelapor_id: string | null;
      artikel_id: string | null;
    };
    if (!k.pelapor_id) {
      return { ok: true, terkirim: false, alasan: "anonim" };
    }
    const peta: Record<
      typeof statusAkhir,
      { judul: string; isi: string }
    > = {
      diperbaiki: {
        judul: "Laporan koreksi Anda diterima — artikel diperbaiki",
        isi: "Terima kasih: artikel yang Anda laporkan sudah dikoreksi redaksi.",
      },
      ditolak: {
        judul: "Laporan koreksi Anda ditolak redaksi",
        isi: "Redaksi meninjau laporan Anda dan memutuskan tidak ada koreksi yang diperlukan.",
      },
      ditinjau: {
        judul: "Laporan koreksi Anda sedang ditinjau",
        isi: "Redaksi sedang meninjau laporan koreksi Anda.",
      },
    };
    const teks = peta[statusAkhir];
    return await kirimNotifikasi(klien, {
      userId: k.pelapor_id,
      jenis: "koreksi",
      judul: teks.judul,
      isi: teks.isi,
      tautan: slugArtikel ? `/artikel/${slugArtikel}` : "/saya/notifikasi",
      kunciDedup: `koreksi:${koreksiId}:${statusAkhir}`,
    });
  } catch (err) {
    console.error("[notifikasi] gagal notifikasi koreksi:", err);
    return { ok: false, alasan: "gagal-tulis" };
  }
}

/** Episode podcast terbit → beri tahu pengguna yang mengaktifkan notifikasi podcast. */
export async function kirimNotifikasiPodcast(
  service: SupabaseClient | null | undefined,
  episodeId: string,
): Promise<number> {
  const klien = klienAtauNull(service ?? null);
  if (!klien || !POLA_UUID.test(episodeId)) return 0;
  try {
    const { data: episode, error } = await klien
      .from("pf_podcast_episodes")
      .select("id, slug, judul, status")
      .eq("id", episodeId)
      .maybeSingle();
    if (error || !episode) return 0;
    const e = episode as { slug: string; judul: string; status: string };
    if (e.status !== "terbit") return 0;
    // Penerima: pengguna yang mengaktifkan notifikasi podcast.
    // Batas fan-out: 500 penerima per episode.
    const { data: prefs, error: errPref } = await klien
      .from("pf_user_preferences")
      .select("user_id")
      .eq("notifikasi_podcast", true)
      .limit(500);
    if (errPref || !prefs) return 0;
    const userIds = (prefs as { user_id: string }[]).map((p) => p.user_id);
    return await kirimMassal(klien, {
      userIds,
      jenis: "podcast",
      kolomPref: "notifikasi_podcast",
      judul: `Episode podcast baru: ${e.judul}`.slice(0, 200),
      isi: "Episode baru PRATA Podcast sudah terbit.",
      tautan: `/podcast/${e.slug}`,
      kunciDedup: `podcast:${episodeId}`,
    });
  } catch (err) {
    console.error("[notifikasi] gagal notifikasi podcast:", err);
    return 0;
  }
}
