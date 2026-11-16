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
// - DRAF (B2-E, F1): job /api/tanya/draf menulis jawaban_draf.
//   { jawaban_draf?: string } → edit draf (status tetap
//   'menunggu', TIDAK mempublikasikan).
//   { aksi_draf: 'setujui' } → draf menjadi jawaban resmi
//   (status 'terjawab', dijawab_pada = kini; draf dibersihkan
//   sesudah disalin) — SATU-SATUNYA jalan draf menjadi jawaban.
//   { aksi_draf: 'tolak' } → draf dihapus, status tetap menunggu.
//   Setujui WAJIB punya referensi (referensi_draf atau referensi
//   baru di body) — sama seperti jawaban manual.
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
import { kirimNotifikasiJawaban } from "@/lib/notifikasi/tulis";
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
  const jawabanDraf =
    typeof body.jawaban_draf === "string"
      ? body.jawaban_draf.trim()
      : undefined;
  const aksiDraf =
    typeof body.aksi_draf === "string" ? body.aksi_draf : undefined;
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
    aksiDraf !== undefined &&
    aksiDraf !== "setujui" &&
    aksiDraf !== "tolak"
  ) {
    return NextResponse.json(
      { ok: false, error: "Aksi draf tidak valid (setujui/tolak)." },
      { status: 400 },
    );
  }
  if (aksiDraf !== undefined && jawaban !== undefined && jawaban !== "") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Pilih salah satu: jawaban manual atau aksi draf — jangan keduanya sekaligus.",
      },
      { status: 400 },
    );
  }
  if (jawabanDraf !== undefined && jawabanDraf.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Draf jawaban terlalu panjang (maksimal 2000 karakter)." },
      { status: 400 },
    );
  }
  if (
    jawaban === undefined &&
    jawabanDraf === undefined &&
    aksiDraf === undefined &&
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
      .select("id, status, referensi, jawaban_draf, referensi_draf, draf_dibuat_pada")
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
    const drafLama =
      typeof (lama as { jawaban_draf?: unknown }).jawaban_draf === "string"
        ? ((lama as { jawaban_draf: string }).jawaban_draf ?? "")
        : "";
    const referensiDrafLama = Array.isArray(
      (lama as { referensi_draf: unknown }).referensi_draf,
    )
      ? ((lama as { referensi_draf: unknown[] }).referensi_draf as { judul: string; url: string | null }[])
      : [];

    const patch: Record<string, unknown> = {};
    // --- Aksi draf (B2-E, F1): setujui/tolak/edit. Setujui adalah
    // SATU-SATUNYA jalan draf menjadi jawaban resmi.
    if (aksiDraf === "setujui") {
      const drafFinal = (jawabanDraf !== undefined ? jawabanDraf : drafLama).trim();
      if (!drafFinal) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Tidak ada draf untuk disetujui. Minta job draf membuat draf dulu, atau tulis jawaban manual.",
          },
          { status: 400 },
        );
      }
      const refFinal =
        referensiMasuk ??
        (referensiDrafLama.length > 0 ? referensiDrafLama : referensiLama);
      if (refFinal.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Draf tanpa referensi tidak bisa disetujui. Sertakan referensi, atau tolak pertanyaan sebagai tidak_ada_data.",
          },
          { status: 400 },
        );
      }
      patch.jawaban = drafFinal;
      patch.status = "terjawab";
      patch.dijawab_pada = new Date().toISOString();
      patch.referensi = refFinal;
      // Draf dibersihkan sesudah disalin ke jawaban resmi.
      patch.jawaban_draf = null;
      patch.referensi_draf = [];
      patch.draf_dibuat_pada = null;
    } else if (aksiDraf === "tolak") {
      patch.jawaban_draf = null;
      patch.referensi_draf = [];
      patch.draf_dibuat_pada = null;
    } else if (jawabanDraf !== undefined) {
      if ((lama as { status: string }).status !== "menunggu") {
        return NextResponse.json(
          {
            ok: false,
            error: "Draf hanya bisa diubah selagi pertanyaan berstatus menunggu.",
          },
          { status: 400 },
        );
      }
      if (jawabanDraf === "") {
        patch.jawaban_draf = null;
        patch.referensi_draf = [];
        patch.draf_dibuat_pada = null;
      } else {
        patch.jawaban_draf = jawabanDraf;
        patch.draf_dibuat_pada = new Date().toISOString();
        if (referensiMasuk) patch.referensi_draf = referensiMasuk;
      }
    }
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
        "id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu, dibuat_pada, dijawab_pada, jawaban_draf, referensi_draf, draf_dibuat_pada",
      )
      .maybeSingle();
    if (error) throw error;
    // Audit fail-closed (Tahap 13A, T10): jawab/tolak/ubah
    // pertanyaan dicatat sebagai tanya.jawab dengan admin + waktu.
    // Aksi draf (edit/setujui/tolak) memakai aksi yang sama —
    // AksiAudit adalah union tertutup yang HARUS sama persis
    // dengan CHECK pf_audit_logs (migrasi v11); aksi baru
    // ("tanya.draf") butuh migrasi dan BUKAN bagian tugas ini.
    // Detail draf (sebelum/sesudah) tetap tercatat di patch.
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
    // B2-D (E1): pertanyaan terjawab / tidak ada data → beri tahu
    // penanya. Best-effort — TIDAK PERNAH menggagalkan jawaban.
    // Menyetujui draf (aksiDraf 'setujui') juga masuk sini karena
    // patch.status menjadi 'terjawab'.
    if (
      patch.status === "terjawab" ||
      patch.status === "tidak_ada_data"
    ) {
      try {
        await kirimNotifikasiJawaban(null, id);
      } catch {
        // Diam-diam: jawaban sudah tersimpan.
      }
    }
    return NextResponse.json({ ok: true, pertanyaan: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
