// GET /api/dokumen — cari dokumen TERBIT (publik).
// Parameter: q (kata kunci judul/penerbit), jenis (salah satu dari
// JENIS_DOKUMEN), kategori. Jenis tak dikenal -> 400 jujur.
import { NextResponse } from "next/server";
import { cariDokumen, JENIS_DOKUMEN } from "@/lib/riset";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const jenis = url.searchParams.get("jenis") ?? undefined;
  const kategori = url.searchParams.get("kategori") ?? undefined;
  if (
    jenis &&
    !(JENIS_DOKUMEN as readonly string[]).includes(jenis)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Jenis tidak dikenal: ${jenis}. Jenis yang tersedia: ${JENIS_DOKUMEN.join(", ")}.`,
      },
      { status: 400 },
    );
  }
  try {
    const dokumen = await cariDokumen(q, jenis, kategori);
    return NextResponse.json({ ok: true, dokumen });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Arsip dokumen belum tersedia." },
      { status: 503 },
    );
  }
}
