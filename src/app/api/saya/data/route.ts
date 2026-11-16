// GET + DELETE /api/saya/data — ringkasan jumlah + hapus data
// per item (Gelombang B2-A, A2).
//
// GET -> {ok, jumlah: {bookmark: n, ...}} — jumlah NYATA dari
// tabel pengguna sendiri; null per jenis bila tabelnya belum
// ada (bukan 0 palsu). Dipakai UI /saya untuk empty state jujur.
//
// DELETE {jenis, id? | semua: true} -> hapus SATU baris milik
// sendiri (id) ATAU seluruh baris jenis itu milik sendiri
// (semua: true). Tanpa id dan tanpa semua: true -> 400 (tidak
// ada hapus diam-diam). Konfirmasi dilakukan di UI; route tetap
// menuntut semua: true eksplisit untuk hapus massal.
//
// KEPEMILIKAN: hapus lewat service role DENGAN filter
// .eq("user_id", userId) di kode + verifikasi jumlah baris
// terhapus — karena 4 tabel (skor kuis, notifikasi, preferensi,
// pertanyaan) BELUM punya policy DELETE pemilik di migrasi
// v1–v13 (butuh v14). Filter kode + hitung baris mencegah hapus
// lintas pengguna dan mencegah klaim palsu "terhapus" saat 0
// baris kena (pelajaran PostgREST: sukses 0 baris).
// Audit 'data.hapus' dicatat sesudah hapus (preseden route
// DELETE admin: hapus dulu, audit, galat audit naik -> 500).
// Rate limit KERAS (fail-closed) 30/menit + cek Origin (CSRF).
// 503 jujur bila tabel / service key belum siap.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib, responGalatAudit } from "@/lib/admin/audit";
import { bacaBody, responBodyTakValid } from "@/lib/admin/guard";
import {
  buatRateLimiter,
  buatRateLimiterKeras,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import {
  apakahJenisData,
  DAFTAR_JENIS_DATA,
  JENIS_DATA,
  type JenisData,
} from "@/lib/akun/jenis-data";
import {
  apakahGalatAksiAuditBelumAda,
  apakahGalatTabelTakAda,
  responV14BelumSiap,
} from "@/lib/akun/respons";

const batasiBaca = buatRateLimiter(30);
const batasiHapus = buatRateLimiterKeras(30);

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function penggunaMasuk(): Promise<{ id: string } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

function layananBelumSiap(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Layanan data belum siap (kunci service belum diatur). Coba lagi nanti.",
    },
    { status: 503 },
  );
}

export async function GET(req: Request) {
  if (!(await batasiBaca(req))) return responRateLimit();
  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk melihat data Anda." },
      { status: 401 },
    );
  }
  let service;
  try {
    service = createServiceClient();
  } catch {
    return layananBelumSiap();
  }
  const userId = pengguna.id;
  const jumlah: Record<JenisData, number | null> = {} as Record<
    JenisData,
    number | null
  >;
  for (const jenis of DAFTAR_JENIS_DATA) {
    const { count, error } = await service
      .from(JENIS_DATA[jenis].tabel)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) {
      // Tabel belum ada / galat baca -> null (jujur "tidak
      // diketahui"), bukan 0 yang menyiratkan "tidak ada data".
      jumlah[jenis] = null;
      continue;
    }
    jumlah[jenis] = count ?? 0;
  }
  return NextResponse.json({ ok: true, jumlah });
}

export async function DELETE(req: Request) {
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const hasil = await batasiHapus(req);
  if (!hasil.lolos && hasil.alasan === "rpc-gagal") {
    return responRateLimitBelumSiap(hasil.jenisGalat);
  }
  if (!hasil.lolos) return responRateLimit();

  const pengguna = await penggunaMasuk();
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk menghapus data Anda." },
      { status: 401 },
    );
  }
  const body = await bacaBody(req);
  const jenisParam =
    body?.jenis ?? new URL(req.url).searchParams.get("jenis");
  if (!apakahJenisData(jenisParam)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Jenis data tidak dikenal. Pilih salah satu: " +
          DAFTAR_JENIS_DATA.join(", ") +
          ".",
      },
      { status: 400 },
    );
  }
  const jenis = jenisParam as JenisData;
  const id = typeof body?.id === "string" ? body.id : null;
  const semua = body?.semua === true;
  if (!id && !semua) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Tentukan satu item (id) atau konfirmasi hapus semua (semua: true).",
      },
      { status: 400 },
    );
  }
  if (id && !POLA_UUID.test(id)) return responBodyTakValid();
  if (id && jenis === "preferensi") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Preferensi hanya satu baris per akun — hapus dengan semua: true untuk mengembalikannya ke bawaan.",
      },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return layananBelumSiap();
  }
  const userId = pengguna.id;
  const tabel = JENIS_DATA[jenis].tabel;

  let hapus = service.from(tabel).delete().eq("user_id", userId);
  if (id) hapus = hapus.eq("id", id);
  const { data: terhapus, error } = await hapus.select("id");
  if (error) {
    if (apakahGalatTabelTakAda(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan hapus data belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi dijalankan.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus data." },
      { status: 500 },
    );
  }
  const dihapus = terhapus?.length ?? 0;
  if (id && dihapus === 0) {
    return NextResponse.json(
      { ok: false, error: "Item tidak ditemukan atau bukan milik Anda." },
      { status: 404 },
    );
  }

  try {
    await catatAuditWajib({
      aktor_id: userId,
      aktor_email: null,
      aksi: "data.hapus",
      entitas: tabel,
      entitas_id: id ?? null,
      sebelum: { jenis, jumlah_sebelum: null },
      sesudah: { jenis, dihapus, semua: semua || undefined },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    // Data SUDAH terhapus (compensating restore mustahil —
    // preseden route DELETE admin). Jawab 500 jujur + log keras
    // lewat responGalatAudit agar kegagalan audit tidak senyap.
    if (apakahGalatAksiAuditBelumAda(err)) return responV14BelumSiap();
    return responGalatAudit(err);
  }

  return NextResponse.json({
    ok: true,
    jenis,
    dihapus,
    pesan:
      dihapus === 0
        ? "Tidak ada data yang dihapus (tidak ada data jenis ini)."
        : `${dihapus} data (${JENIS_DATA[jenis].label}) telah dihapus.`,
  });
}
