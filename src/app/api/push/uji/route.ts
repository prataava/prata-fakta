// POST /api/push/uji — kirim satu ketukan push uji ke diri sendiri
// (staf: editor / fact_checker / super_admin). Dipakai memverifikasi
// konfigurasi VAPID sesudah kunci deploy diatur, tanpa menunggu
// kejadian nyata. Menjawab { ok, terkonfigurasi, terkirim, dihapus }.
// Bila VAPID belum terkonfigurasi → 503 jujur dengan nama env var
// yang kurang (tanpa membocorkan nilainya).
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  cekOrigin,
  responRateLimit,
} from "@/lib/admin/guard";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  apakahPushTerkonfigurasi,
  ENV_VAPID_PRIVATE,
  ENV_VAPID_PUBLIC,
  ENV_VAPID_SUBJECT,
  kirimPushKePengguna,
} from "@/lib/notifikasi/push";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(
    req,
    ROLES.EDITOR,
    ROLES.FACT_CHECKER,
  );
  if (auth instanceof NextResponse) return auth;
  if (!apakahPushTerkonfigurasi()) {
    const kurang = [ENV_VAPID_PUBLIC, ENV_VAPID_PRIVATE, ENV_VAPID_SUBJECT]
      .filter((nama) => !process.env[nama])
      .join(", ");
    return NextResponse.json(
      {
        ok: false,
        terkonfigurasi: false,
        error: `Push belum terkonfigurasi — env var belum diatur: ${kurang}.`,
      },
      { status: 503 },
    );
  }
  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap." },
      { status: 503 },
    );
  }
  const hasil = await kirimPushKePengguna(service, auth.user.id);
  return NextResponse.json({ ok: true, ...hasil });
}
