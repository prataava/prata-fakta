// Lapisan akses data Story Tracker PRATA FAKTA (Fase 8 Gel. 2).
// Prinsip sama seperti src/lib/data.ts: gagal-aman (try/catch → []
// / null), Bahasa Indonesia, tanpa data palsu. Bila tabel pf_*
// Gelombang 2 belum dibuat (migrasi v10 masih menunggu dijalankan
// di SQL Editor) atau query gagal, fungsi mengembalikan array
// kosong / null dan pemanggil menampilkan empty state jujur.
//
// Aturan anti-kesetaraan-palsu (pelajaran Gelombang 1, §12.9.1):
// "sumber independen" untuk berita terkait HANYA dihitung dari
// AKAR rantai salinan lewat RPC pf_akar_salinan (v9) — satu berita
// yang disalin 3 media = 1 sumber independen. Bila RPC gagal /
// belum diterapkan, sumber_independen = null dan komponen WAJIB
// menampilkan jumlah artikel saja, tanpa klaim independen.
import { createClient } from "@/lib/supabase/server";
import type { PfTimelineEvent } from "@/lib/lanjutan";

/* ============================================================
   Tipe
   ============================================================ */

export type PfCeritaRingkas = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  status: string;
  status_perkembangan: string;
  jumlah_event: number;
  jumlah_artikel: number;
  jumlah_pengikut: number;
  dibuat_pada: string | null;
};

export type PfCeritaEvent = {
  tautan_id: string;
  event_id: string;
  urutan: number;
  catatan: string | null;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  dimulai_pada: string | null;
  berakhir_pada: string | null;
  dampak: string | null;
  sumber_url: string | null;
  era: string | null;
  penting: boolean;
  negara_kode: string | null;
  timeline: PfTimelineEvent[];
};

export type PfCeritaArtikel = {
  tautan_id: string;
  artikel_id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  diterbitkan_pada: string | null;
  peran: string;
  sumber_url: string | null;
  /** Nama sumber akar bila artikel ini berasal dari salinan. */
  disalin_dari: string | null;
  /** Id item akar rantai salinan (RPC v9); null bila rantai
   *  belum terverifikasi untuk artikel ini. */
  akar_id: string | null;
  rantai_terverifikasi: boolean;
};

export type PfCerita = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  status: string;
  status_perkembangan: string;
  dibuat_pada: string | null;
  diperbarui_pada: string | null;
  events: PfCeritaEvent[];
  artikel: PfCeritaArtikel[];
  jumlah_pengikut: number;
  /** true/false bila userId diberikan, null bila anonim. */
  mengikuti: boolean | null;
  /** Jumlah sumber INDEPENDEN berbeda di antara artikel terkait
   *  (distinct akar rantai salinan). null bila rantai TIDAK
   *  terverifikasi untuk semua artikel — pemanggil menampilkan
   *  jumlah artikel saja, tanpa klaim independen. */
  sumber_independen: number | null;
  /** true hanya bila RPC pf_akar_salinan berhasil untuk SEMUA
   *  artikel terkait (bila tidak ada artikel terkait, true —
   *  tidak ada klaim yang perlu diverifikasi). */
  rantai_tersedia: boolean;
};

/* ============================================================
   Fungsi murni (diekspor agar bisa diuji tanpa database —
   pola hitungBobotPerbandingan di src/lib/data.ts).
   ============================================================ */

/** Slug cerita valid: huruf kecil/angka/dipisah '-', 3–100 karakter. */
export function slugCeritaValid(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/** Validasi aksi ikuti: "ikuti" | "berhenti"; null bila valid,
 *  pesan galat bila tidak. */
export function validasiAksiIkuti(aksi: string): string | null {
  if (aksi === "ikuti" || aksi === "berhenti") return null;
  return "Aksi tidak valid (ikuti atau berhenti).";
}

/**
 * Hitung sumber independen dari baris rantai salinan (satu baris
 * per URL artikel terkait, hasil RPC pf_akar_salinan).
 * independen = jumlah akar_id BERBEDA (satu berita yang disalin
 * 3 media = 1); salinan = baris yang disalin dari akar lain;
 * terverifikasi = baris yang akar_id-nya terisi.
 */
export function hitungAkarIndependen(
  baris: { akarId: string | null; disalin: boolean }[],
): { independen: number; salinan: number; terverifikasi: number } {
  const akar = new Set<string>();
  let salinan = 0;
  let terverifikasi = 0;
  for (const b of baris) {
    if (b.disalin) salinan += 1;
    if (b.akarId) {
      terverifikasi += 1;
      akar.add(b.akarId);
    }
  }
  return { independen: akar.size, salinan, terverifikasi };
}

/* ============================================================
   Util internal
   ============================================================ */

function normalisasiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function hitungPerCerita(
  baris: { story_id: string }[],
): Map<string, number> {
  const peta = new Map<string, number>();
  for (const b of baris) {
    peta.set(b.story_id, (peta.get(b.story_id) ?? 0) + 1);
  }
  return peta;
}

/** Hitungan tautan + pengikut untuk sekumpulan id cerita. */
async function hitungJumlahCerita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storyId: string[],
): Promise<{
  event: Map<string, number>;
  artikel: Map<string, number>;
  pengikut: Map<string, number>;
}> {
  const kosong = {
    event: new Map<string, number>(),
    artikel: new Map<string, number>(),
    pengikut: new Map<string, number>(),
  };
  if (storyId.length === 0) return kosong;
  try {
    const [ev, ar, fo] = await Promise.all([
      supabase
        .from("pf_story_events")
        .select("story_id")
        .in("story_id", storyId)
        .limit(5000),
      supabase
        .from("pf_story_articles")
        .select("story_id")
        .in("story_id", storyId)
        .limit(5000),
      supabase
        .from("pf_story_followers")
        .select("story_id")
        .in("story_id", storyId)
        .limit(5000),
    ]);
    return {
      event: hitungPerCerita(
        (ev.data ?? []) as { story_id: string }[],
      ),
      artikel: hitungPerCerita(
        (ar.data ?? []) as { story_id: string }[],
      ),
      pengikut: hitungPerCerita(
        (fo.data ?? []) as { story_id: string }[],
      ),
    };
  } catch {
    return kosong;
  }
}

/* ============================================================
   Baca publik
   ============================================================ */

/** Daftar cerita TERBIT, terbaru dulu, beserta hitungannya.
 *  [] bila tabel v10 belum ada / query gagal. */
export async function getDaftarCerita(
  limit = 50,
): Promise<PfCeritaRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_stories")
      .select("id, slug, judul, ringkasan, status, status_perkembangan, dibuat_pada")
      .eq("status", "terbit")
      .order("dibuat_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const rows = data as unknown as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id));
    const hitung = await hitungJumlahCerita(supabase, ids);
    return rows.map((r) => {
      const id = String(r.id);
      return {
        id,
        slug: String(r.slug ?? ""),
        judul: String(r.judul ?? ""),
        ringkasan: (r.ringkasan as string | null) ?? null,
        status: String(r.status ?? ""),
        status_perkembangan: String(r.status_perkembangan ?? "berkembang"),
        jumlah_event: hitung.event.get(id) ?? 0,
        jumlah_artikel: hitung.artikel.get(id) ?? 0,
        jumlah_pengikut: hitung.pengikut.get(id) ?? 0,
        dibuat_pada: (r.dibuat_pada as string | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Satu cerita TERBIT beserta kronologi event, artikel terkait,
 * dan jumlah pengikut. null bila slug tak ada / masih draf /
 * tabel belum ada. Cek status='terbit' eksplisit di aplikasi
 * (defense-in-depth, jangan hanya mengandalkan RLS v10).
 *
 * Artikel terkait: hanya artikel berstatus 'terbit' (join inner
 * + filter status) — tautan ke artikel draf TIDAK bocor meski
 * policy pf_story_articles hanya memeriksa status cerita.
 */
export async function getCerita(
  slug: string,
  userId?: string | null,
): Promise<PfCerita | null> {
  try {
    const supabase = await createClient();
    const { data: cerita, error: errCerita } = await supabase
      .from("pf_stories")
      .select("id, slug, judul, ringkasan, status, status_perkembangan, dibuat_pada, diperbarui_pada")
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (errCerita || !cerita) return null;
    const row = cerita as unknown as Record<string, unknown>;
    const storyId = String(row.id);

    const [tautanEvent, tautanArtikel, pengikut] = await Promise.all([
      supabase
        .from("pf_story_events")
        .select(
          "id, urutan, catatan, pf_events(id, judul, ringkasan, lokasi_teks, dimulai_pada, berakhir_pada, dampak, sumber_url, era, penting, negara_kode)",
        )
        .eq("story_id", storyId)
        .order("urutan", { ascending: true }),
      supabase
        .from("pf_story_articles")
        .select(
          "id, peran, pf_articles!inner(id, slug, judul, ringkasan, diterbitkan_pada, sumber_url, status)",
        )
        .eq("story_id", storyId)
        .eq("pf_articles.status", "terbit"),
      supabase
        .from("pf_story_followers")
        .select("id", { count: "exact", head: true })
        .eq("story_id", storyId),
    ]);
    if (tautanEvent.error || tautanArtikel.error) return null;

    // Kronologi (pf_event_timeline) untuk semua event dalam cerita.
    const events: PfCeritaEvent[] = [];
    const eventIds: string[] = [];
    for (const t of (tautanEvent.data ?? []) as unknown as Record<
      string,
      unknown
    >[]) {
      const ev = t.pf_events as Record<string, unknown> | null;
      if (!ev) continue;
      const eventId = String(ev.id);
      eventIds.push(eventId);
      events.push({
        tautan_id: String(t.id),
        event_id: eventId,
        urutan: typeof t.urutan === "number" ? t.urutan : 0,
        catatan: (t.catatan as string | null) ?? null,
        judul: String(ev.judul ?? ""),
        ringkasan: (ev.ringkasan as string | null) ?? null,
        lokasi_teks: (ev.lokasi_teks as string | null) ?? null,
        dimulai_pada: (ev.dimulai_pada as string | null) ?? null,
        berakhir_pada: (ev.berakhir_pada as string | null) ?? null,
        dampak: (ev.dampak as string | null) ?? null,
        sumber_url: (ev.sumber_url as string | null) ?? null,
        era: (ev.era as string | null) ?? null,
        penting: ev.penting === true,
        negara_kode: (ev.negara_kode as string | null) ?? null,
        timeline: [],
      });
    }
    if (eventIds.length > 0) {
      try {
        const { data: tl, error: errTl } = await supabase
          .from("pf_event_timeline")
          .select("id, event_id, waktu, peristiwa, sumber, perubahan")
          .in("event_id", eventIds)
          .order("waktu", { ascending: true });
        if (!errTl && tl) {
          const perEvent = new Map<string, PfTimelineEvent[]>();
          for (const r of tl as unknown as Record<string, unknown>[]) {
            const daftar = perEvent.get(String(r.event_id)) ?? [];
            daftar.push({
              id: String(r.id),
              event_id: String(r.event_id),
              waktu: (r.waktu as string | null) ?? null,
              peristiwa: String(r.peristiwa ?? ""),
              sumber: (r.sumber as string | null) ?? null,
              perubahan: (r.perubahan as string | null) ?? null,
            });
            perEvent.set(String(r.event_id), daftar);
          }
          for (const e of events) {
            e.timeline = perEvent.get(e.event_id) ?? [];
          }
        }
      } catch {
        // Timeline gagal dibaca: event tetap tampil tanpa rincian.
      }
    }

    // Artikel terkait + rantai salinan per artikel (RPC v9).
    const artikel: PfCeritaArtikel[] = [];
    const artikelRows = (tautanArtikel.data ?? []) as unknown as Record<
      string,
      unknown
    >[];
    const artikelIds = artikelRows
      .map((t) => t.pf_articles as Record<string, unknown> | null)
      .filter((a): a is Record<string, unknown> => Boolean(a))
      .map((a) => String(a.id));
    // URL sumber per artikel (untuk RPC): sumber_url artikel +
    // URL dari pf_article_sources.
    const urlPerArtikel = new Map<string, string[]>();
    if (artikelIds.length > 0) {
      try {
        const { data: sum } = await supabase
          .from("pf_article_sources")
          .select("artikel_id, url")
          .in("artikel_id", artikelIds);
        for (const r of (sum ?? []) as unknown as Record<string, unknown>[]) {
          const daftar = urlPerArtikel.get(String(r.artikel_id)) ?? [];
          if (typeof r.url === "string" && r.url) daftar.push(r.url);
          urlPerArtikel.set(String(r.artikel_id), daftar);
        }
      } catch {
        // Tanpa URL sumber tambahan, RPC tetap dipanggil dengan
        // sumber_url artikel saja.
      }
    }
    let rantaiTersedia = true;
    const akarSemua: { akarId: string | null; disalin: boolean }[] = [];
    for (const t of artikelRows) {
      const a = t.pf_articles as Record<string, unknown> | null;
      if (!a) continue;
      const artikelId = String(a.id);
      const sumberUrl =
        typeof a.sumber_url === "string" ? (a.sumber_url as string) : null;
      const urls = [
        ...(sumberUrl ? [sumberUrl] : []),
        ...(urlPerArtikel.get(artikelId) ?? []),
      ];
      const unik = [...new Set(urls.map(normalisasiUrl).filter(Boolean))];
      let disalinDari: string | null = null;
      let akarId: string | null = null;
      let terverifikasi = false;
      if (unik.length > 0) {
        try {
          const { data: rantai, error: errRantai } = await supabase.rpc(
            "pf_akar_salinan",
            { p_artikel_id: artikelId, p_url: unik },
          );
          if (errRantai || !Array.isArray(rantai)) {
            rantaiTersedia = false;
          } else {
            // Satu artikel bisa cocok ke beberapa URL (sumber_url +
            // article_sources): pakai baris pertama yang terurut
            // sebagai akar artikel ini; semua akar dicatat untuk
            // hitungan independen cerita.
            for (const r of rantai as unknown as Record<string, unknown>[]) {
              const akar = typeof r.akar_id === "string" ? r.akar_id : null;
              akarSemua.push({
                akarId: akar,
                disalin: r.disalin === true,
              });
              if (!terverifikasi && akar) {
                akarId = akar;
                disalinDari =
                  r.disalin === true
                    ? ((r.akar_nama as string | null) ?? null)
                    : null;
                terverifikasi = true;
              }
            }
            if (rantai.length === 0) {
              // URL tak tercocokkan ke raw item mana pun: rantai
              // artikel ini tidak terverifikasi (bukan bukti
              // salinan — hanya tidak diketahui).
              rantaiTersedia = false;
            }
          }
        } catch {
          rantaiTersedia = false;
        }
      } else {
        // Artikel tanpa URL sumber sama sekali: tidak ada rantai
        // yang bisa diverifikasi.
        rantaiTersedia = false;
      }
      artikel.push({
        tautan_id: String(t.id),
        artikel_id: artikelId,
        slug: String(a.slug ?? ""),
        judul: String(a.judul ?? ""),
        ringkasan: (a.ringkasan as string | null) ?? null,
        diterbitkan_pada: (a.diterbitkan_pada as string | null) ?? null,
        peran: String(t.peran ?? "terkait"),
        sumber_url: sumberUrl,
        disalin_dari: disalinDari,
        akar_id: akarId,
        rantai_terverifikasi: terverifikasi,
      });
    }
    const { independen } = hitungAkarIndependen(akarSemua);
    // Klaim independen hanya sah bila rantai terverifikasi untuk
    // SEMUA artikel; bila tidak, tampilkan jumlah artikel saja.
    const sumberIndependen =
      artikel.length === 0
        ? 0
        : rantaiTersedia
          ? independen
          : null;

    let mengikuti: boolean | null = null;
    if (userId) {
      try {
        const { data: f } = await supabase
          .from("pf_story_followers")
          .select("id")
          .eq("user_id", userId)
          .eq("story_id", storyId)
          .maybeSingle();
        mengikuti = Boolean(f);
      } catch {
        mengikuti = false;
      }
    }

    return {
      id: storyId,
      slug: String(row.slug ?? ""),
      judul: String(row.judul ?? ""),
      ringkasan: (row.ringkasan as string | null) ?? null,
      status: String(row.status ?? ""),
      status_perkembangan: String(row.status_perkembangan ?? "berkembang"),
      dibuat_pada: (row.dibuat_pada as string | null) ?? null,
      diperbarui_pada: (row.diperbarui_pada as string | null) ?? null,
      events,
      artikel,
      jumlah_pengikut:
        typeof pengikut.count === "number" ? pengikut.count : 0,
      mengikuti,
      sumber_independen: sumberIndependen,
      rantai_tersedia: rantaiTersedia,
    };
  } catch {
    return null;
  }
}

/** Cerita TERBIT yang memuat artikel ini (Tahap 14 — tautan
 *  artikel → cerita). Satu artikel bisa ditautkan ke beberapa
 *  cerita; yang dikembalikan adalah tautan terbaru. Hanya cerita
 *  berstatus 'terbit' (join inner + filter status) — tautan ke
 *  cerita draf TIDAK bocor. Gagal-aman: null bila tabel belum ada
 *  atau query gagal; pemanggil menampilkan tanpa kartu cerita. */
export type PfCeritaUntukArtikel = {
  slug: string;
  judul: string;
  status_perkembangan: string;
};

export async function getCeritaUntukArtikel(
  artikelId: string,
): Promise<PfCeritaUntukArtikel | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_story_articles")
      .select("pf_stories!inner(slug, judul, status, status_perkembangan)")
      .eq("artikel_id", artikelId)
      .eq("pf_stories.status", "terbit")
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const cerita = (data as unknown as Record<string, unknown>).pf_stories as
      | { slug?: unknown; judul?: unknown; status_perkembangan?: unknown }
      | null;
    if (!cerita || typeof cerita.slug !== "string") return null;
    return {
      slug: cerita.slug,
      judul: typeof cerita.judul === "string" ? cerita.judul : cerita.slug,
      status_perkembangan:
        typeof cerita.status_perkembangan === "string"
          ? cerita.status_perkembangan
          : "",
    };
  } catch {
    return null;
  }
}

/** Cerita TERBIT yang diikuti pengguna, terbaru dulu. */
export async function getCeritaDiikuti(
  userId: string,
  limit = 20,
): Promise<PfCeritaRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_story_followers")
      .select("pf_stories!inner(id, slug, judul, ringkasan, status, status_perkembangan, dibuat_pada)")
      .eq("user_id", userId)
      .eq("pf_stories.status", "terbit")
      .order("dibuat_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const rows = (data as unknown as Record<string, unknown>[])
      .map((r) => r.pf_stories as Record<string, unknown> | null)
      .filter((s): s is Record<string, unknown> => Boolean(s));
    const ids = rows.map((r) => String(r.id));
    const hitung = await hitungJumlahCerita(supabase, ids);
    return rows.map((r) => {
      const id = String(r.id);
      return {
        id,
        slug: String(r.slug ?? ""),
        judul: String(r.judul ?? ""),
        ringkasan: (r.ringkasan as string | null) ?? null,
        status: String(r.status ?? ""),
        status_perkembangan: String(r.status_perkembangan ?? "berkembang"),
        jumlah_event: hitung.event.get(id) ?? 0,
        jumlah_artikel: hitung.artikel.get(id) ?? 0,
        jumlah_pengikut: hitung.pengikut.get(id) ?? 0,
        dibuat_pada: (r.dibuat_pada as string | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** Id event dalam satu cerita TERBIT (untuk filter ?cerita= di
 *  /timeline). null bila cerita tak ada / masih draf. */
export async function getEventIdDalamCerita(
  slug: string,
): Promise<string[] | null> {
  try {
    const supabase = await createClient();
    const { data: cerita, error: errCerita } = await supabase
      .from("pf_stories")
      .select("id")
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (errCerita || !cerita) return null;
    const { data, error } = await supabase
      .from("pf_story_events")
      .select("event_id")
      .eq("story_id", (cerita as { id: string }).id)
      .order("urutan", { ascending: true });
    if (error || !data) return [];
    return (data as { event_id: string }[]).map((r) => r.event_id);
  } catch {
    return null;
  }
}

/* ============================================================
   Ikuti / berhenti mengikuti (tulis via session client — RLS
   pf_story_followers menegakkan user_id = auth.uid()).
   Dipakai route /api/cerita/[slug]/ikuti.
   ============================================================ */

/** Apakah pengguna mengikuti cerita ini. */
export async function isMengikutiCerita(
  userId: string,
  storyId: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_story_followers")
      .select("id")
      .eq("user_id", userId)
      .eq("story_id", storyId)
      .maybeSingle();
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

/** Ikuti cerita; idempoten (sudah diikuti → sudahDiikuti: true). */
export async function ikutiCerita(
  userId: string,
  storyId: string,
): Promise<{ ok: boolean; sudahDiikuti?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pf_story_followers")
      .insert({ user_id: userId, story_id: storyId });
    if (error) {
      if (error.code === "23505") return { ok: true, sudahDiikuti: true };
      if (error.code === "PGRST205") {
        return {
          ok: false,
          error:
            "Layanan cerita belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
        };
      }
      return { ok: false, error: "Gagal mengikuti cerita. Coba lagi." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal mengikuti cerita. Coba lagi." };
  }
}

/** Berhenti mengikuti cerita (idempoten — tidak mengikuti pun ok). */
export async function berhentiIkutiCerita(
  userId: string,
  storyId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pf_story_followers")
      .delete()
      .eq("user_id", userId)
      .eq("story_id", storyId);
    if (error) {
      if (error.code === "PGRST205") {
        return {
          ok: false,
          error:
            "Layanan cerita belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
        };
      }
      return { ok: false, error: "Gagal berhenti mengikuti cerita. Coba lagi." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal berhenti mengikuti cerita. Coba lagi." };
  }
}
