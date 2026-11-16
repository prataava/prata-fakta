// GET /api/podcast — daftar episode TERBIT (publik).
// Filter ?jenis=brief|artikel|mingguan. Batas: pembuatan file
// audio server = BELUM BISA (tanpa layanan TTS server gratis);
// episode tanpa audio_url diputar via TTS browser — lihat
// /podcast/[slug]. RSS podcast enclosure TIDAK dibuat (tanpa
// file audio); jangan klaim feed podcast berbasis file.
import { NextResponse } from "next/server";
import { getDaftarEpisode, type JenisEpisode } from "@/lib/podcast";

const JENIS_VALID: JenisEpisode[] = ["brief", "artikel", "mingguan"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jenisParam = url.searchParams.get("jenis") ?? undefined;
  if (jenisParam && !JENIS_VALID.includes(jenisParam as JenisEpisode)) {
    return NextResponse.json(
      { ok: false, error: "Jenis episode tidak valid." },
      { status: 400 },
    );
  }
  const episode = await getDaftarEpisode(
    jenisParam as JenisEpisode | undefined,
  );
  return NextResponse.json({ ok: true, episode });
}
