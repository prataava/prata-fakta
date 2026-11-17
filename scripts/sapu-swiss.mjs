// Sapuan CDP re-skin Swiss PRATA FAKTA — dijalankan INTEGRATOR
// (bukan Worker I: VM ini tanpa Chrome dan tanpa server; Worker I
// dilarang `next build` dan dilarang `next start` paralel).
//
// Prasyarat:
//   1. Integrator menjalankan `next build` lalu `next start`
//      dari branch ini (port bebas, mis. 3000).
//   2. Chrome/Chromium dengan remote debugging:
//      chromium --headless=new --remote-debugging-port=9222
//      (atau Chrome biasa dengan flag yang sama).
//   3. Node >= 22 (WebSocket + fetch global, tanpa dependensi).
//
// Cara pakai:
//   node scripts/sapu-swiss.mjs --base http://localhost:3000 --cdp http://127.0.0.1:9222
//
// Memeriksa tiap rute x viewport [320,390,768,1280,1920] x tema
// [light,dark]: h1=1, 0 overflow horizontal, 0 error konsol,
// header sticky menempel sesudah gulir; plus palette buka/tutup
// incl. tombol X ≥44px di 390px. Keluar 0 bila semua lolos.
const args = process.argv.slice(2);
function arg(nama, bawaan) {
  const i = args.indexOf(nama);
  return i >= 0 && args[i + 1] ? args[i + 1] : bawaan;
}
const BASE = (arg("--base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const CDP = (arg("--cdp", "http://127.0.0.1:9222") ?? "").replace(/\/$/, "");

const VIEWPORTS = [320, 390, 768, 1280, 1920];
const TEMAS = ["light", "dark"];
// h1: "ketat" = wajib tepat 1; "lapor" = hanya dilaporkan (halaman
// yang dapat mengalihkan ke /masuk, mis. /admin).
const RUTES = [
  { path: "/", h1: "ketat" },
  { path: "/kategori", h1: "ketat" },
  { path: "/arsip", h1: "ketat" },
  { path: "/sumber", h1: "ketat" },
  { path: "/klaim", h1: "ketat" },
  { path: "/observatorium", h1: "ketat" },
  { path: "/data/live", h1: "ketat" },
  { path: "/data/live/kurs", h1: "ketat" },
  { path: "/admin", h1: "lapor" },
];

let gagal = 0;
let lolos = 0;
const temuan = [];
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos += 1;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
    temuan.push(label);
  }
}
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

async function buatTarget() {
  // Chrome baru: /json/new butuh PUT; Chrome lama: GET.
  for (const method of ["PUT", "GET"]) {
    const res = await fetch(`${CDP}/json/new?about:blank`, { method });
    if (res.ok) return res.json();
  }
  throw new Error("tidak bisa membuat target CDP di " + CDP);
}

const ws = new WebSocket((await buatTarget()).webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
let idBerikut = 1;
const menunggu = new Map();
const errorKonsol = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && menunggu.has(msg.id)) {
    const { res, rej } = menunggu.get(msg.id);
    menunggu.delete(msg.id);
    if (msg.error) rej(new Error(`${msg.error.code}: ${msg.error.message}`));
    else res(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") {
    errorKonsol.push(`exception: ${msg.params.exceptionDetails?.text ?? ""} ${msg.params.exceptionDetails?.exception?.description ?? ""}`.trim());
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errorKonsol.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    errorKonsol.push(`log: ${msg.params.entry.text} (${msg.params.entry.url ?? ""})`);
  }
});
function kirim(method, params = {}) {
  const id = idBerikut++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => menunggu.set(id, { res, rej }));
}
async function evalJs(expression) {
  const r = await kirim("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
  return r.result.value;
}

await kirim("Page.enable");
await kirim("Runtime.enable");
await kirim("Log.enable");
await kirim("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

for (const tema of TEMAS) {
  for (const rute of RUTES) {
    for (const lebar of VIEWPORTS) {
      const label = `${rute.path} @${lebar}px ${tema}`;
      errorKonsol.length = 0;
      await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 900, deviceScaleFactor: 1, mobile: lebar < 768 });
      await kirim("Page.navigate", { url: `${BASE}${rute.path}` });
      await tunggu(1500);
      // Tema diterapkan lewat localStorage pf-tema + muat ulang
      // (mekanisme yang sama dengan skrip tema inline).
      await evalJs(`localStorage.setItem('pf-tema','${tema}'); document.documentElement.setAttribute('data-theme','${tema}');`);
      await kirim("Page.navigate", { url: `${BASE}${rute.path}` });
      await tunggu(1500);
      const h1 = await evalJs(`document.querySelectorAll('h1').length`);
      const overflow = await evalJs(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      const headerAda = await evalJs(`!!document.querySelector('.header')`);
      await evalJs(`window.scrollTo(0, 600);`);
      await tunggu(400);
      const headerAtas = await evalJs(`(() => { const el = document.querySelector('.header'); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.top); })()`);
      await evalJs(`window.scrollTo(0, 0);`);
      if (rute.h1 === "ketat") cek(`h1=1 — ${label}`, h1 === 1, `h1=${h1}`);
      else console.log(`INFO: h1=${h1} — ${label} (hanya laporan, /admin dapat mengalihkan)`);
      cek(`0 overflow horizontal — ${label}`, overflow <= 0, `luapan=${overflow}px`);
      cek(`header sticky menempel — ${label}`, headerAda && headerAtas !== null && headerAtas <= 1, `top=${headerAtas}px`);
      cek(`0 error konsol — ${label}`, errorKonsol.length === 0, errorKonsol.slice(0, 2).join(" | "));
    }
  }
}

// ---------- Command Palette di 390px (terang) ----------
{
  const label = "palette @390px terang";
  errorKonsol.length = 0;
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await kirim("Page.navigate", { url: `${BASE}/` });
  await tunggu(1500);
  await evalJs(`localStorage.setItem('pf-tema','light'); document.documentElement.setAttribute('data-theme','light');`);
  await kirim("Page.navigate", { url: `${BASE}/` });
  await tunggu(1500);
  await evalJs(`window.dispatchEvent(new Event('pf:buka-palette'));`);
  await tunggu(500);
  const terbuka = await evalJs(`(() => { const el = document.querySelector('.palette-konten'); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
  cek(`palette terbuka — ${label}`, terbuka === true);
  const ukuranTutup = await evalJs(`(() => { const el = document.querySelector('.palette-tutup'); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  cek(`tombol X palette ≥44px — ${label}`, Boolean(ukuranTutup) && ukuranTutup.w >= 44 && ukuranTutup.h >= 44, ukuranTutup ? `${ukuranTutup.w}x${ukuranTutup.h}` : "tombol tidak ditemukan");
  await evalJs(`document.querySelector('.palette-tutup')?.click();`);
  await tunggu(400);
  const tertutup = await evalJs(`!document.querySelector('.palette-konten')`);
  cek(`palette tertutup via tombol X — ${label}`, tertutup === true);
  cek(`0 error konsol — ${label}`, errorKonsol.length === 0, errorKonsol.slice(0, 2).join(" | "));
}

ws.close();
console.log(`\n${lolos} lolos, ${gagal} gagal.${temuan.length ? ` Gagal: ${temuan.join("; ")}` : ""}`);
process.exit(gagal === 0 ? 0 : 1);
