import http from 'node:http';
import os from 'node:os';
import { renderScreen } from './render.js';
import { renderPage } from './page.js';
import {
  DEFAULT_VIEWPORT,
  PROBE_GIF,
  getViewport,
  isDetected,
  probeCss,
  recordProbe,
} from './viewport.js';

const PORT = Number(process.env.PORT ?? 3000);
const REFRESH_SEC = Number(process.env.REFRESH_SEC ?? 30);

const startedAt = Date.now();
let screenCount = 0;

/** 端末がキャッシュを返さないよう、毎回すべての手段で無効化する。 */
function noStore(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function clampSize(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 120 && n <= 4096 ? Math.round(n) : fallback;
}

async function handle(req, res, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const { width, height } = getViewport();
    const body = renderPage({ width, height, refreshSec: REFRESH_SEC, token: Date.now() });
    noStore(res);
    // meta refresh に加えて HTTP ヘッダでも更新を指示する。
    res.setHeader('Refresh', String(REFRESH_SEC));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  if (url.pathname === '/screen.png') {
    const width = clampSize(url.searchParams.get('w'), DEFAULT_VIEWPORT.width);
    const height = clampSize(url.searchParams.get('h'), DEFAULT_VIEWPORT.height);
    screenCount += 1;
    const png = await renderScreen({
      width,
      height,
      now: new Date(),
      count: screenCount,
      refreshSec: REFRESH_SEC,
      uptimeMs: Date.now() - startedAt,
    });
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
    res.end(png);
    return;
  }

  if (url.pathname === '/probe.css') {
    const { body, encoding } = probeCss(/\bgzip\b/.test(req.headers['accept-encoding'] ?? ''));
    noStore(res);
    if (encoding) res.setHeader('Content-Encoding', encoding);
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    return;
  }

  if (url.pathname === '/probe') {
    const changed = recordProbe({
      width: clampSize(url.searchParams.get('w'), 0),
      height: clampSize(url.searchParams.get('h'), 0),
    });
    if (changed) {
      console.log(`  -> viewport detected: ${changed.width} x ${changed.height} px`);
    }
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': PROBE_GIF.length });
    res.end(PROBE_GIF);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.url} ua="${req.headers['user-agent'] ?? '-'}"`
  );
  handle(req, res, url).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('render failed\n');
  });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

server.listen(PORT, '0.0.0.0', () => {
  const size = getViewport();
  console.log(`MyRealDashboard prototype — refresh every ${REFRESH_SEC}s`);
  console.log(`image size: ${size.width} x ${size.height} px${isDetected() ? '' : ' (default)'}`);
  for (const address of ['localhost', ...lanAddresses()]) {
    console.log(`  http://${address}:${PORT}/`);
  }
});
