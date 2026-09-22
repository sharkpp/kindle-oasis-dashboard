import http from 'node:http';
import os from 'node:os';
import { renderScreen } from './render.js';
import { renderPage } from './page.js';

const PORT = Number(process.env.PORT ?? 3000);
/** 画面の内容を新しくする間隔。これが変わるとクライアントが画像を取り直す。 */
const UPDATE_SEC = Number(process.env.UPDATE_SEC ?? 30);
/** クライアントが更新の有無を確認しに来る間隔。 */
const POLL_SEC = Number(process.env.POLL_SEC ?? 5);

const DEFAULT_VIEWPORT = { width: 1264, height: 1680 };

const startedAt = Date.now();
let screenCount = 0;
let revision = 1;

/** 直近にポーリングしてきたクライアントの状態。画像に描いて実機で確認する。 */
let client = null;
/** クライアントが実測したビューポート。次の HTML 生成に使う。 */
let viewport = { ...DEFAULT_VIEWPORT };

const updateTimer = setInterval(() => {
  revision += 1;
}, UPDATE_SEC * 1000);
updateTimer.unref();

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

function clampCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/** クライアントが URL に載せてきた稼働状況を取り込む。 */
function recordClient(params) {
  if (!params.has('polls')) return;
  client = {
    polls: clampCount(params.get('polls')),
    errors: clampCount(params.get('errors')),
    lastSeenAt: Date.now(),
  };
  const width = clampSize(params.get('w'), 0);
  const height = clampSize(params.get('h'), 0);
  if (width && height && (viewport.width !== width || viewport.height !== height)) {
    viewport = { width, height };
    console.log(`  -> viewport reported by client: ${width} x ${height} px`);
  }
}

async function handle(req, res, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const body = renderPage({
      width: viewport.width,
      height: viewport.height,
      revision,
      pollSec: POLL_SEC,
      token: Date.now(),
    });
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  if (url.pathname === '/revision') {
    recordClient(url.searchParams);
    const body = String(revision);
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    return;
  }

  if (url.pathname === '/screen.png') {
    recordClient(url.searchParams);
    const width = clampSize(url.searchParams.get('w'), DEFAULT_VIEWPORT.width);
    const height = clampSize(url.searchParams.get('h'), DEFAULT_VIEWPORT.height);
    screenCount += 1;
    const png = await renderScreen({
      width,
      height,
      now: new Date(),
      count: screenCount,
      revision,
      updateSec: UPDATE_SEC,
      pollSec: POLL_SEC,
      uptimeMs: Date.now() - startedAt,
      client: client && { ...client, lastSeenAgoMs: Date.now() - client.lastSeenAt },
    });
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
    res.end(png);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  // ポーリングはログが流れやすいので、画面が変わるやり取りだけを残す。
  if (url.pathname !== '/revision') {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.url} ua="${req.headers['user-agent'] ?? '-'}"`
    );
  }
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
  console.log(`MyRealDashboard prototype — update every ${UPDATE_SEC}s, poll every ${POLL_SEC}s`);
  console.log(`image size: ${viewport.width} x ${viewport.height} px (default)`);
  for (const address of ['localhost', ...lanAddresses()]) {
    console.log(`  http://${address}:${PORT}/`);
  }
});

// ポーリングが届いているかを定期的に知らせる。実機で JavaScript が動いたかの判断材料。
const watchTimer = setInterval(() => {
  const age = client ? Math.round((Date.now() - client.lastSeenAt) / 1000) : null;
  console.log(
    client
      ? `client: poll #${client.polls}, errors ${client.errors}, last ${age}s ago, rev ${revision}`
      : `client: no polling yet, rev ${revision}`
  );
}, Math.max(UPDATE_SEC, 30) * 1000);
watchTimer.unref();
