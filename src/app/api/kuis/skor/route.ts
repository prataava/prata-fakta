import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/kuis/skor — simpan skor kuis harian pengguna login.
// Body: { tanggal: "YYYY-MM-DD", benar: 0..5, total: 1..10 }
// Keputusan Fase 7 (lihat migrasi v7): skor HANYA disimpan untuk
// pengguna login — riwayat skor hanya bermakna bila terikat akun;
// skor anonim tidak disimpan (tidak dapat ditampilkan kembali dan
// tidak dapat dihapus pemiliknya). Satu skor per pengguna per
// tanggal; main ulang di hari yang sama menimpa skor sebelumnya
// (upsert). Rate limit 5 request/menit/IP. 401 bila belum login;
// 503 jujur bila tabel pf_quiz_scores belum ada (migrasi v7 belum
// dijalankan).
const BATAS = 5;
const JENDELA_MS = 60_000;
const hitungan = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(ip: string): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= BATAS) return false;
  entri.n += 1;
  return true;
}

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

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

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
  const { tanggal, benar, total } = body as Record<string, unknown>;

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
  if (
    typeof benar !== "number" ||
    !Number.isInteger(benar) ||
    benar < 0 ||
    benar > 5
  ) {
    return NextResponse.json(
      { ok: false, error: "Jumlah benar harus bilangan bulat 0 sampai 5." },
      { status: 400 },
    );
  }
  if (
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 1 ||
    total > 10
  ) {
    return NextResponse.json(
      { ok: false, error: "Total soal harus bilangan bulat 1 sampai 10." },
      { status: 400 },
    );
  }
  if (benar > total) {
    return NextResponse.json(
      { ok: false, error: "Jumlah benar tidak boleh melebihi total soal." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("pf_quiz_scores")
    .upsert(
      { user_id: user.id, tanggal, benar, total },
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
    return NextResponse.json(
      { ok: false, error: "Skor gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, skor: data });
}
