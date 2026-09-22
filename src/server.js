import http from 'node:http';
import os from 'node:os';
import process from 'node:process';
import { ConfigError, loadConfig } from './config.js';
import { Dashboard } from './dashboard.js';
import { renderScreen } from './render.js';
import { renderPage } from './page.js';

const PORT = Number(process.env.PORT ?? 3000);
const CONFIG_PATH = process.env.CONFIG ?? 'config.yaml';

/** 初回の HTML を描くときの想定サイズ（Kindle Oasis 第9世代のパネル解像度）。 */
const DEFAULT_VIEWPORT = { width: 1264, height: 1680 };

let config;
try {
  config = loadConfig(CONFIG_PATH);
} catch (err) {
  console.error(err instanceof ConfigError ? `設定エラー — ${err.message}` : err);
  process.exit(1);
}

const dashboard = new Dashboard(config);
/** クライアントが実測したビューポート。次の HTML 生成に使う。 */
let viewport = { ...DEFAULT_VIEWPORT };

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

/** クライアントが URL に載せてきた実測ビューポートを取り込む。 */
function recordViewport(params) {
  const width = clampSize(params.get('w'), 0);
  const height = clampSize(params.get('h'), 0);
  if (width && height && (viewport.width !== width || viewport.height !== height)) {
    viewport = { width, height };
    console.log(`ビューポート: ${width} x ${height} px`);
  }
}

async function handle(req, res, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const body = renderPage({
      width: viewport.width,
      height: viewport.height,
      revision: dashboard.revision,
      pollSec: config.pollSec,
      token: Date.now(),
    });
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  if (url.pathname === '/revision') {
    recordViewport(url.searchParams);
    const body = String(dashboard.revision);
    noStore(res);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    return;
  }

  if (url.pathname === '/screen.png') {
    recordViewport(url.searchParams);
    const png = await renderScreen({
      view: dashboard.view,
      width: clampSize(url.searchParams.get('w'), DEFAULT_VIEWPORT.width),
      height: clampSize(url.searchParams.get('h'), DEFAULT_VIEWPORT.height),
      padding: config.padding,
      gap: config.gap,
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
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname}`);
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

// 表示内容が変わったときだけ版番号が上がる。クライアントはそれを見て画像を取り直す。
const tick = setInterval(() => {
  dashboard.tick().catch((err) => console.error(err));
}, config.tickSec * 1000);
tick.unref();

// 最初の取得は待たずに待ち受けを始める。取得中であることは画面の各項目が出す。
dashboard.tick().catch((err) => console.error(err));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MyRealDashboard — 設定 ${CONFIG_PATH} / ${config.tickSec} 秒ごとに更新 / ${config.pollSec} 秒ごとにポーリング`);
  for (const address of ['localhost', ...lanAddresses()]) {
    console.log(`  http://${address}:${PORT}/`);
  }
});
