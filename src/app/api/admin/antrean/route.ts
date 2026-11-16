// GET /api/admin/antrean — antrean editorial: artikel draft +
// terjadwal, masing-masing dengan verifikasi terakhir + review
// terakhir. Staf mana pun. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const adapter = buatAdminAdapter();
    const [draft, terjadwal] = await Promise.all([
      adapter.listArtikel({ status: "draft", page: 1, limit: 100 }),
      adapter.listArtikel({ status: "terjadwal", page: 1, limit: 100 }),
    ]);
    const semua = [...draft.artikel, ...terjadwal.artikel];
    const antrean = await Promise.all(
      semua.map(async (artikel) => {
        const [verifikasi_terakhir, review_terakhir] = await Promise.all([
          adapter.getVerifikasiTerakhir({ artikel_id: artikel.id }),
          adapter.getReviewTerakhir({ artikel_id: artikel.id }),
        ]);
        return { artikel, verifikasi_terakhir, review_terakhir };
      }),
    );
    return NextResponse.json({
      ok: true,
      antrean,
      jumlah: antrean.length,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
