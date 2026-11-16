import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// POST /api/kuis/skor — simpan skor kuis harian pengguna login.
// Body: { tanggal: "YYYY-MM-DD" } — benar/total TIDAK LAGI
// diterima dari klien (Tahap C-3, menutup celah yang sama
// seperti L-B1 Academy sebelum B2: sebelumnya route ini
// menerima benar/total mentah dan menyimpannya apa adanya,
// sehingga skor 5/5 bisa dipalsukan satu POST). Skor kini
// DIHITUNG SERVER dari jawaban tersimpan di
// pf_quiz_daily_answers (ditulis service role oleh
// POST /api/kuis/jawab saat pengguna login menjawab) +
// jumlah soal tanggal itu di pf_quiz_questions. Nilai
// benar/total yang masih dikirim klien lama DIABAIKAN
// (bukan 400 — klien lama tetap jalan, skornya dikoreksi
// server). Trigger v15 pf_hitung_skor_harian menghitung
// ulang sekali lagi di database, sehingga tulis langsung
// lewat REST pun tidak bisa memalsukan skor.
// Keputusan Fase 7 (lihat migrasi v7): skor HANYA disimpan
// untuk pengguna login — riwayat skor hanya bermakna bila
// terikat akun; skor anonim tidak disimpan (tidak dapat
// ditampilkan kembali dan tidak dapat dihapus pemiliknya).
// Satu skor per pengguna per tanggal; main ulang di hari yang
// sama menimpa skor sebelumnya (upsert). Rate limit 5
// request/menit (limiter database lintas instance, Tahap 13A,
// T3). 401 bila belum login; 409 bila jawaban tersimpan belum
// lengkap (kuis belum selesai dijawab semua); 503 jujur bila
// tabel pf_quiz_scores / pf_quiz_daily_answers belum ada
// (migrasi v7/v15 belum dijalankan).
const batasi = buatRateLimiterKeras(5);

function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function kemarinWib(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Satu jawaban kuis harian tersimpan (dari pf_quiz_daily_answers). */
export type JawabanHarianTersimpan = {
  soal_id: string;
  benar: boolean;
};

/**
 * Hitung skor harian dari jawaban tersimpan (murni, diekspos
 * untuk uji). Mengembalikan { ok: false } bila jawaban
 * tersimpan belum mencakup SEMUA soal hari itu — skor parsial
 * tidak pernah disimpan (pengguna harus menyelesaikan kuis
 * dulu; main ulang menimpa jawaban tersimpan sebelumnya).
 */
export function hitungSkorDariJawabanTersimpan(
  jawabanTersimpan: JawabanHarianTersimpan[],
  soalHariIni: string[],
):
  | { ok: true; benar: number; total: number }
  | { ok: false; error: string; terjawab: number; total: number } {
  const total = soalHariIni.length;
  if (total === 0) {
    return {
      ok: false,
      error: "Belum ada soal kuis untuk tanggal ini.",
      terjawab: 0,
      total: 0,
    };
  }
  const idSoal = new Set(soalHariIni);
  const terjawab = new Set<string>();
  let benar = 0;
  for (const j of jawabanTersimpan) {
    if (!idSoal.has(j.soal_id) || terjawab.has(j.soal_id)) continue;
    terjawab.add(j.soal_id);
    if (j.benar) benar += 1;
  }
  if (terjawab.size < total) {
    return {
      ok: false,
      error: `Jawaban tersimpan belum lengkap (${terjawab.size} dari ${total} soal) — selesaikan kuis hari ini dulu.`,
      terjawab: terjawab.size,
      total,
    };
  }
  return { ok: true, benar, total };
}

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu untuk menyimpan skor." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const { tanggal } = body as Record<string, unknown>;
  // CATATAN: field benar/total dari klien SENGAJA tidak dibaca
  // lagi (Tahap C-3) — skor dihitung server di bawah. Klien lama
  // yang masih mengirimnya tetap diterima, nilainya diabaikan.

  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return NextResponse.json(
      { ok: false, error: "Tanggal harus format YYYY-MM-DD." },
      { status: 400 },
    );
  }
  // Tanggal yang diterima: hari ini atau kemarin (WIB) — memberi
  // ruang bila pengguna menyelesaikan kuis melewati tengah malam.
  const hariIni = tanggalWibHariIni();
  if (tanggal !== hariIni && tanggal !== kemarinWib(hariIni)) {
    return NextResponse.json(
      { ok: false, error: "Tanggal skor harus hari ini atau kemarin." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan kuis belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }

  // 1. Soal hari itu (penyebut skor).
  const { data: daftarSoal, error: errSoal } = await service
    .from("pf_quiz_questions")
    .select("id")
    .eq("tanggal", tanggal);
  if (errSoal) {
    const kode = (errSoal as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tabel soal kuis belum tersedia (migrasi v6 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/kuis/skor", errSoal);
    return NextResponse.json(
      { ok: false, error: "Skor gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }
  const soalHariIni = (daftarSoal ?? []).map((s) =>
    String((s as { id: string }).id),
  );

  // 2. Jawaban tersimpan pengguna untuk tanggal itu.
  const { data: daftarJawaban, error: errJawaban } = await service
    .from("pf_quiz_daily_answers")
    .select("soal_id, benar")
    .eq("user_id", user.id)
    .eq("tanggal", tanggal);
  if (errJawaban) {
    const kode = (errJawaban as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tabel jawaban kuis belum tersedia (migrasi v15 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/kuis/skor", errJawaban);
    return NextResponse.json(
      { ok: false, error: "Skor gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }
  const jawabanTersimpan = (daftarJawaban ?? []).map((j) => {
    const r = j as { soal_id: string; benar: boolean };
    return { soal_id: String(r.soal_id), benar: r.benar === true };
  });

  // 3. Hitung server — skor klien TIDAK PERNAH dipakai.
  const hitung = hitungSkorDariJawabanTersimpan(
    jawabanTersimpan,
    soalHariIni,
  );
  if (!hitung.ok) {
    return NextResponse.json(
      { ok: false, error: hitung.error },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("pf_quiz_scores")
    .upsert(
      { user_id: user.id, tanggal, benar: hitung.benar, total: hitung.total },
      { onConflict: "user_id,tanggal" },
    )
    .select("tanggal, benar, total")
    .single();

  if (error) {
    const kode = (error as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tabel skor kuis belum tersedia (migrasi v7 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/kuis/skor", error);
    return NextResponse.json(
      { ok: false, error: "Skor gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    skor: data,
    dihitung_server: true,
  });
}
