// Stub next/server untuk baterai uji-tahap13c.mjs — HANYA dipakai
// baterai. NextResponse.json dibuat fungsional (Response standar)
// karena responGalatAudit memakainya di jalur yang diuji; sisanya
// (connection/after/redirect/dll.) melempar dengan jelas bila
// dipanggil — baterai tidak punya runtime Next.
export class NextResponse extends Response {
  static json(data, init) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  static redirect() {
    throw new Error("NextResponse.redirect tidak tersedia di baterai uji-tahap13c");
  }
}

export function NextRequest() {
  throw new Error("NextRequest tidak tersedia di baterai uji-tahap13c");
}

export async function connection() {
  throw new Error("next/server connection() tidak tersedia di baterai uji-tahap13c");
}

export function after() {
  throw new Error("next/server after() tidak tersedia di baterai uji-tahap13c");
}

export function redirect() {
  throw new Error("next/server redirect() tidak tersedia di baterai uji-tahap13c");
}
