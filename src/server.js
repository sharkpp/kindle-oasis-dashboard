import http from 'node:http';
import os from 'node:os';
import process from 'node:process';
import { statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig } from './config.js';
import { Dashboard } from './dashboard.js';
import { ORIENTATIONS, renderScreen } from './render.js';
import { renderPage } from './page.js';

const USAGE = `使い方: npm start -- [オプション]

  -c, --config <path>        設定ファイル（既定: config.yaml）
  -p, --port <number>        待ち受けポート（既定: 3000）
  -o, --orientation <name>   端末の置き方（既定: portrait）
                             ${ORIENTATIONS.join(' / ')}
      --markers              四隅に位置合わせマーカーと画像サイズを描く
  -h, --help                 この使い方を表示する
`;

function parseOptions() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c', default: 'config.yaml' },
      port: { type: 'string', short: 'p', default: '3000' },
      orientation: { type: 'string', short: 'o', default: 'portrait' },
      markers: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port が正しくありません: ${values.port}`);
  }
  if (!ORIENTATIONS.includes(values.orientation)) {
    throw new Error(
      `--orientation が正しくありません: ${values.orientation}（${ORIENTATIONS.join(' / ')}）`
    );
  }
  return { ...values, port };
}

let options;
let dashboard;
try {
  options = parseOptions();
  dashboard = new Dashboard(loadConfig(options.config));
} catch (err) {
  console.error(err instanceof ConfigError ? `設定エラー — ${err.message}` : err.message);
  process.exit(1);
}

/** 初回の HTML を描くときの想定サイズ（Kindle Oasis 第9世代のパネル解像度）。 */
const DEFAULT_VIEWPORT = { width: 1264, height: 1680 };
/** クライアントが実測したビューポート。次の HTML 生成に使う。 */
let viewport = { ...DEFAULT_VIEWPORT };

/** 設定ファイルが書き換わったかを見分けるための印。 */
function configStamp() {
  try {
    const stat = statSync(options.config);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}
let stamp = configStamp();

/**
 * 設定ファイルが書き換わっていれば読み直す。
 * 読めない設定は捨てて、動いている設定をそのまま使い続ける。
 */
function reloadConfigIfChanged() {
  const next = configStamp();
  if (next === stamp) return;
  stamp = next;
  try {
    const changes = dashboard.applyConfig(loadConfig(options.config));
    console.log(
      changes.length
        ? `設定を読み直しました — ${changes.join(' / ')}`
        : '設定を読み直しました（表示に影響する変更はありません）'
    );
  } catch (err) {
    const reason = err instanceof ConfigError ? err.message : err;
    console.error(`設定を読み直せませんでした — ${reason}（前の設定のまま続けます）`);
  }
}

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
  const config = dashboard.config;

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
      orientation: options.orientation,
      showMarkers: options.markers,
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

// 設定を読み直してから表示内容を作る。更新間隔も設定で変わるので、毎回組み直す。
async function loop() {
  reloadConfigIfChanged();
  await dashboard.tick();
  setTimeout(loop, dashboard.config.tickSec * 1000).unref();
}
loop().catch((err) => console.error(err));

server.listen(options.port, '0.0.0.0', () => {
  console.log(
    `MyRealDashboard — 設定 ${options.config} / ${options.orientation}` +
      (options.markers ? ' / 位置合わせマーカーあり' : '')
  );
  for (const address of ['localhost', ...lanAddresses()]) {
    console.log(`  http://${address}:${options.port}/`);
  }
});
