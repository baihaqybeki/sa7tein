// ============================================================
//  Sa7tein — server demo lokal (menyajikan tiga portal pada satu origin)
//  Menyajikan setiap app build dari port yang sama memungkinkan Local Demo Mode
//  (localStorage + BroadcastChannel) sinkron antar portal, seperti cara
//  ekosistem Sa7tein bekerja.
//  Jalankan dengan: npm run demo  (setelah npm run build)
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

// Semua alamat IPv4 mesin ini (kecuali loopback) agar server bisa memberi tahu
// cara membuka app dari HP di Wi-Fi yang sama.
function lanIps() {
  const out = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const APPS = [
  { path: '/customer/', dir: path.join(root, 'apps/customer/dist'), label: 'Customer' },
  { path: '/merchant/', dir: path.join(root, 'apps/merchant/dist'), label: 'Merchant' },
  { path: '/courier/', dir: path.join(root, 'apps/courier/dist'), label: 'Courier' },
  { path: '/cs/', dir: path.join(root, 'apps/cs/dist'), label: 'CS' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

const LANDING = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sa7tein — Three Portals</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f9fafb; color:#111827; margin:0; display:grid; place-items:center; min-height:100vh; }
    .wrap { text-align:center; padding:24px; }
    h1 { font-size:28px; margin:0 0 4px; }
    h1 span { color:#e04020; }
    p { color:#6b7280; margin:0 0 24px; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; max-width:720px; }
    a { text-decoration:none; color:inherit; background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.05); transition:.15s; }
    a:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,.08); }
    .emoji { font-size:40px; }
    .name { font-weight:800; margin-top:8px; }
    .desc { font-size:13px; color:#6b7280; margin-top:4px; }
    .hint { margin-top:24px; font-size:12px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Sa7<span>tein</span></h1>
    <p>Three separate portals, built like the Sa7tein ecosystem — open all four for a real-time demo</p>
    <div class="cards">
      ${APPS.map(
        (a) => `
      <a href="${a.path}">
        <div class="emoji">${a.path === '/customer/' ? '🛍️' : a.path === '/merchant/' ? '👨‍🍳' : '🛵'}</div>
        <div class="name">${a.label}</div>
        <div class="desc">${a.path === '/customer/' ? 'Order food & track your courier' : a.path === '/merchant/' ? 'Accept orders & manage the menu' : 'Pick up & deliver orders'}</div>
      </a>`,
      ).join('')}
    </div>
    <div class="hint">💡 Open them in three separate tabs — data stays in sync via Local Demo Mode</div>
  </div>
</body>
</html>`;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Halaman landing di root
    if (pathname === '/' || pathname === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(LANDING);
    }

    // Unduhan APK agar app bisa diinstal di HP
    if (pathname === '/apk/' || pathname === '/apk') {
      const dir = path.join(root, 'mobile-builds');
      const files = existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith('.apk'))
            .sort()
        : [];
      const rows = files.map((f) => `<li><a href="/apk/${f}">📦 ${f}</a> <span style="color:#6b7280;font-size:12px">(${Math.round(statSync(path.join(dir, f)).size / 1024)} KB)</span></li>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sa7tein — Install APK</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827;display:grid;place-items:center;min-height:100vh;margin:0}.wrap{width:min(92vw,420px)}h1{font-size:20px;text-align:center;margin:0 0 6px}h1 span{color:#e04020}p.hint{color:#6b7280;font-size:13px;text-align:center;margin:0 0 18px}ul{list-style:none;padding:0;display:grid;gap:12px;margin:0}li{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px}a{color:#111827;text-decoration:none;font-weight:700;display:block}</style></head><body><div class="wrap"><h1>Sa7<span>tein</span></h1><p class="hint">Tap untuk mengunduh APK, lalu buka file untuk menginstal.</p><ul>${rows}</ul></div></body></html>`,
      );
    }
    if (pathname.startsWith('/apk/')) {
      const name = path.basename(pathname);
      const file = path.join(root, 'mobile-builds', name);
      if (name.endsWith('.apk') && existsSync(file)) {
        const data = await readFile(file);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Content-Length': data.length,
        });
        return res.end(data);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('APK not found');
    }

    const app = APPS.find((a) => pathname === a.path || pathname.startsWith(a.path));
    if (!app) {
      // Path app tanpa slash di akhir (mis. /merchant): arahkan ke URL kanonik
      // agar SPA termuat, alih-alih jatuh ke /customer/.
      const noSlash = APPS.find((a) => a.path.slice(0, -1) === pathname);
      if (noSlash) {
        res.writeHead(302, { Location: noSlash.path });
        return res.end();
      }
      res.writeHead(302, { Location: '/customer/' });
      return res.end();
    }

    // rel menjaga path tetap di dalam app (mis. /customer/cart → /cart)
    const rel = pathname.slice(app.path.length - 1);
    let filePath = path.join(app.dir, rel === '/' ? 'index.html' : rel);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      // Fallback SPA → index.html milik app itu
      filePath = path.join(app.dir, 'index.html');
    }

    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Jangan pernah men-cache shell HTML agar app hasil build baru langsung terpakai;
    // aset ber-hash (nama file immutable) bisa di-cache jangka panjang. File service
    // worker di-fetch ulang agar update PWA juga diterapkan dengan bersih.
    if (ext === '.html' || pathname.includes('sw.js') || pathname.includes('workbox')) {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Sa7tein demo server error: ' + (err && err.message));
  }
}).listen(PORT, () => {
  console.log('');
  console.log('🍽️  Sa7tein — four portals on one origin (realtime sync):');
  console.log(`   🛍️  Customer → http://localhost:${PORT}/customer/`);
  console.log(`   👨‍🍳 Merchant → http://localhost:${PORT}/merchant/`);
  console.log(`   🛵 Courier  → http://localhost:${PORT}/courier/`);
  console.log(`   🎧 CS        → http://localhost:${PORT}/cs/`);
  const ips = lanIps();
  if (ips.length) {
    console.log('');
    console.log(`   📱 On your phone (same Wi-Fi), open e.g.:`);
    for (const ip of ips) {
      console.log(`      http://${ip}:${PORT}/customer/   (or /merchant/ , /courier/ , /cs/)`);
    }
  }
  console.log('');
  console.log('   Open all three in separate tabs — customer orders show up live on the merchant portal, etc.');
  console.log('');
});
