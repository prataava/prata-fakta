import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";
import {
  JENIS_LAPORAN_PUBLIK,
  buatNomorLacak,
  nomorLacakValid,
} from "@/lib/laporan";

// POST /api/laporan-publik — laporan masyarakat (Area 13).
// Body: { jenis (5 jenis baru), tautan_artikel?, deskripsi, nama?, email? }
// Berbeda dari POST /api/laporan (laporan koreksi artikel, wajib
// artikel_id + 4 jenis lama). Di sini artikel_id BOLEH null:
// tautan artikel dipetakan ke artikel terbit bila berupa URL
// /artikel/<slug> situs ini; bila tidak dapat dipetakan, tautan
// disimpan apa adanya di tautan_artikel.
// Tulis via service role (T5 — TIDAK ADA policy INSERT publik
// untuk pf_correction_reports sesudah migrasi v8). Rate limit
// 5/menit/IP. 503 jujur bila service key / tabel belum ada.
// SEMUA laporan berstatus awal 'baru' dan WAJIB dimoderasi di
// /admin/koreksi sebelum diproses — status tidak berubah tanpa
// aksi moderator.
// GET /api/laporan-publik?nomor=PF-XXXXXXXX — lacak status
// laporan. Yang dibaca publik HANYA nomor, jenis, status, dan
// tanggal — TANPA data pelapor (nama/email tidak pernah
// dikembalikan). Rate limit 10/menit/IP.
const batasiKirim = buatRateLimiter(5);
const batasiLacak = buatRateLimiter(10);

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function respon503(pesan: string) {
  return NextResponse.json({ ok: false, error: pesan }, { status: 503 });
}

export async function POST(req: Request) {
  if (!batasiKirim(ipDariRequest(req))) return responRateLimit();

  let body: {
    jenis?: unknown;
    tautan_artikel?: unknown;
    deskripsi?: unknown;
    nama?: unknown;
    email?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  const jenis = typeof body.jenis === "string" ? body.jenis : "";
  const tautan =
    typeof body.tautan_artikel === "string"
      ? body.tautan_artikel.trim()
      : "";
  const deskripsi =
    typeof body.deskripsi === "string" ? body.deskripsi.trim() : "";
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (
    !JENIS_LAPORAN_PUBLIK.includes(
      jenis as (typeof JENIS_LAPORAN_PUBLIK)[number],
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Jenis laporan tidak valid." },
      { status: 400 },
    );
  }
  if (tautan) {
    if (tautan.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Tautan artikel terlalu panjang (maksimal 500 karakter)." },
        { status: 400 },
      );
    }
    try {
      const u = new URL(tautan);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("protokol bukan http(s)");
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Tautan artikel tidak valid (harus URL http/https)." },
        { status: 400 },
      );
    }
  }
  if (!deskripsi || deskripsi.length < 10 || deskripsi.length > 2000) {
    return NextResponse.json(
      {
        ok: false,
        error: "Deskripsi laporan wajib diisi (10–2000 karakter).",
      },
      { status: 400 },
    );
  }
  if (nama.length > 120) {
    return NextResponse.json(
      { ok: false, error: "Nama terlalu panjang (maksimal 120 karakter)." },
      { status: 400 },
    );
  }
  if (email && (!POLA_EMAIL.test(email) || email.length > 254)) {
    return NextResponse.json(
      { ok: false, error: "Alamat email tidak valid." },
      { status: 400 },
    );
  }

  // Petakan tautan /artikel/<slug> ke artikel terbit (bila bisa).
  // Gagal petakan bukan kesalahan: laporan tetap diterima dengan
  // artikel_id null + tautan tersimpan.
  let artikelId: string | null = null;
  if (tautan) {
    try {
      const u = new URL(tautan);
      const cocok = /^\/artikel\/([^/?#]+)\/?$/.exec(u.pathname);
      if (cocok) {
        const supabase = await createClient();
        const { data } = await supabase
          .from("pf_articles")
          .select("id")
          .eq("slug", decodeURIComponent(cocok[1]))
          .eq("status", "terbit")
          .maybeSingle();
        if (data && typeof (data as { id?: unknown }).id === "string") {
          artikelId = (data as { id: string }).id;
        }
      }
    } catch {
      artikelId = null;
    }
  }

  // Pelapor yang login dicatat id-nya; anonim tetap boleh.
  let pelaporId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    pelaporId = data.user?.id ?? null;
  } catch {
    pelaporId = null;
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return respon503(
      "Layanan laporan belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
    );
  }

  // Sisipkan dengan nomor lacak unik; coba sekali lagi bila
  // kebetulan bentrok (23505).
  let nomorLacak = buatNomorLacak();
  for (let percobaan = 0; percobaan < 2; percobaan++) {
    const { error } = await service.from("pf_correction_reports").insert({
      artikel_id: artikelId,
      pelapor_id: pelaporId,
      nama: nama || null,
      pelapor_email: email || null,
      jenis,
      pesan: deskripsi,
      status: "baru",
      nomor_lacak: nomorLacak,
      tautan_artikel: tautan || null,
    });
    if (!error) {
      return NextResponse.json({ ok: true, nomor_lacak: nomorLacak });
    }
    if ((error as { code?: string }).code === "23505") {
      nomorLacak = buatNomorLacak();
      continue;
    }
    const kode = (error as { code?: string }).code;
    if (kode === "PGRST205") {
      return respon503(
        "Layanan laporan belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2/8 dijalankan.",
      );
    }
    return respon503(
      "Layanan laporan belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2/8 dijalankan.",
    );
  }
  return NextResponse.json(
    { ok: false, error: "Gagal membuat nomor lacak. Coba lagi." },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  if (!batasiLacak(ipDariRequest(req))) return responRateLimit();
  const nomor = new URL(req.url).searchParams.get("nomor") ?? "";
  if (!nomorLacakValid(nomor)) {
    return NextResponse.json(
      { ok: false, error: "Nomor lacak tidak valid (format: PF-XXXXXXXX)." },
      { status: 400 },
    );
  }
  let service;
  try {
    service = createServiceClient();
  } catch {
    return respon503(
      "Layanan lacak belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
    );
  }
  const { data, error } = await service
    .from("pf_correction_reports")
    .select("nomor_lacak, jenis, status, dibuat_pada")
    .eq("nomor_lacak", nomor)
    .maybeSingle();
  if (error) {
    const kode = (error as { code?: string }).code;
    if (kode === "PGRST205") {
      return respon503(
        "Layanan lacak belum aktif (tabel database belum dibuat).",
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal melacak laporan. Coba lagi." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Nomor lacak tidak ditemukan." },
      { status: 404 },
    );
  }
  // HANYA status + jenis yang dikembalikan — tanpa data pelapor.
  return NextResponse.json({
    ok: true,
    laporan: {
      nomor_lacak: (data as { nomor_lacak: string }).nomor_lacak,
      jenis: (data as { jenis: string }).jenis,
      status: (data as { status: string }).status,
      dibuat_pada: (data as { dibuat_pada: string | null }).dibuat_pada,
    },
  });
}
