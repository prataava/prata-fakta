// PATCH /api/admin/tanya/[id] — jawab / tandai publik / ubah
// kategori / tolak pertanyaan (staf: editor, fact_checker,
// super_admin lewat guard).
// Body: { jawaban?: string, publik?: boolean, kategori?: string,
//   status?: 'terjawab' | 'tidak_ada_data' }.
// - jawaban non-kosong → status 'terjawab', dijawab_pada = kini.
//   Jawaban WAJIB menunjuk referensi yang sudah ada: jawaban
//   tanpa referensi tidak diterima di sini (referensi lama
//   dipertahankan bila ada; bila pertanyaan belum punya referensi,
//   staf wajib menyertakan referensi di body { referensi: [...] }).
//   Tanpa referensi → 400, jangan karang jawaban.
// - status 'tidak_ada_data' (tanpa jawaban) → tolak: pertanyaan
//   dinyatakan tidak ada datanya.
// - publik/kategori bisa diubah sendiri tanpa mengubah jawaban.
// Rate limit 30/menit/IP. Tulis via service role.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib } from "@/lib/admin/audit";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const KATEGORI_VALID = [
  "umum",
  "ekonomi",
  "dunia",
  "indonesia",
  "sains",
  "teknologi",
] as const;

type ReferensiMasuk = { judul?: unknown; url?: unknown };

function referensiValid(masuk: unknown): { judul: string; url: string | null }[] | null {
  if (!Array.isArray(masuk)) return null;
  const hasil: { judul: string; url: string | null }[] = [];
  for (const r of masuk as ReferensiMasuk[]) {
    if (!r || typeof r !== "object") return null;
    const judul = typeof r.judul === "string" ? r.judul.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : null;
    if (!judul) return null;
    hasil.push({ judul, url: url || null });
  }
  return hasil;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.FACT_CHECKER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  const jawaban =
    typeof body.jawaban === "string" ? body.jawaban.trim() : undefined;
  const publik = typeof body.publik === "boolean" ? body.publik : undefined;
  const kategori =
    typeof body.kategori === "string" ? body.kategori.trim() : undefined;
  const statusDiminta =
    typeof body.status === "string" ? body.status : undefined;
  const referensiMasuk =
    body.referensi !== undefined ? referensiValid(body.referensi) : undefined;
  if (body.referensi !== undefined && referensiMasuk === null) {
    return NextResponse.json(
      { ok: false, error: "Referensi tidak valid (tiap referensi wajib punya judul)." },
      { status: 400 },
    );
  }
  if (
    kategori !== undefined &&
    kategori !== "" &&
    !(KATEGORI_VALID as readonly string[]).includes(kategori)
  ) {
    return NextResponse.json(
      { ok: false, error: "Kategori tidak valid." },
      { status: 400 },
    );
  }
  if (
    statusDiminta !== undefined &&
    statusDiminta !== "terjawab" &&
    statusDiminta !== "tidak_ada_data"
  ) {
    return NextResponse.json(
      { ok: false, error: "Status tidak valid." },
      { status: 400 },
    );
  }
  if (jawaban !== undefined && jawaban.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Jawaban terlalu panjang (maksimal 2000 karakter)." },
      { status: 400 },
    );
  }
  if (
    jawaban === undefined &&
    publik === undefined &&
    (kategori === undefined || kategori === "") &&
    statusDiminta === undefined
  ) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang diminta." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap (kunci service belum diatur)." },
      { status: 503 },
    );
  }
  try {
    const { data: lama, error: errLama } = await service
      .from("pf_questions")
      .select("id, status, referensi")
      .eq("id", id)
      .maybeSingle();
    if (errLama) throw errLama;
    if (!lama) {
      return NextResponse.json(
        { ok: false, error: "Pertanyaan tidak ditemukan." },
        { status: 404 },
      );
    }
    const referensiLama = Array.isArray(
      (lama as { referensi: unknown }).referensi,
    )
      ? ((lama as { referensi: unknown[] }).referensi as { judul: string; url: string | null }[])
      : [];
    const referensiAkhir = referensiMasuk ?? referensiLama;

    const patch: Record<string, unknown> = {};
    if (jawaban !== undefined && jawaban !== "") {
      // Jawab → wajib ada referensi (lama atau baru).
      if (referensiAkhir.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Jawaban wajib menunjuk referensi yang sudah ada. Sertakan referensi, atau tolak pertanyaan sebagai tidak_ada_data.",
          },
          { status: 400 },
        );
      }
      patch.jawaban = jawaban;
      patch.status = "terjawab";
      patch.dijawab_pada = new Date().toISOString();
      patch.referensi = referensiAkhir;
    } else if (statusDiminta === "tidak_ada_data") {
      patch.status = "tidak_ada_data";
      if (referensiMasuk) patch.referensi = referensiMasuk;
    } else if (statusDiminta === "terjawab") {
      return NextResponse.json(
        { ok: false, error: "Menandai terjawab wajib menyertakan jawaban." },
        { status: 400 },
      );
    }
    if (publik !== undefined) patch.publik = publik;
    if (kategori !== undefined && kategori !== "") patch.kategori = kategori;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Tidak ada perubahan yang diminta." },
        { status: 400 },
      );
    }

    const { data, error } = await service
      .from("pf_questions")
      .update(patch)
      .eq("id", id)
      .select(
        "id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu, dibuat_pada, dijawab_pada",
      )
      .maybeSingle();
    if (error) throw error;
    // Audit fail-closed (Tahap 13A, T10): jawab/tolak/ubah
    // pertanyaan dicatat sebagai tanya.jawab dengan admin + waktu.
    // Gagal audit → operasi ditolak (galat naik ke responGalatAdmin).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "tanya.jawab",
      entitas: "pf_questions",
      entitas_id: id,
      sebelum: {
        status: (lama as { status: string }).status,
        referensi: (lama as { referensi: unknown }).referensi,
      },
      sesudah: patch,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, pertanyaan: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
