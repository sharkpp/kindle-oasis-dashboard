import sharp from 'sharp';

const MONO = 'Menlo, DejaVu Sans Mono, monospace';
const SANS = 'Hiragino Sans, Noto Sans CJK JP, sans-serif';

const esc = (value) =>
  String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const pad = (n) => String(n).padStart(2, '0');

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** ポーリングが生きているかを一目で判断するための行。 */
function clientStatus(client) {
  if (!client) return 'js poll: none yet -- javascript may be disabled';
  const ago = Math.round(client.lastSeenAgoMs / 1000);
  return `js poll #${client.polls}  errors ${client.errors}  last ${ago}s ago`;
}

/**
 * 画面全体を占める SVG を組み立てる。
 * 幅・高さは端末のビューポートに合わせて可変なので、すべて比率で配置する。
 */
function buildSvg({ width, height, now, count, revision, updateSec, pollSec, uptimeMs, client }) {
  const base = Math.min(width, height);
  const margin = Math.round(base * 0.02);
  const line = Math.max(2, Math.round(base * 0.004));

  const clockText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const contentW = width - margin * 4;
  // 等幅フォントの字幅は 0.6em。行が収まる最大のフォントサイズを求める。
  const fitMono = (text, max) => Math.min(max, contentW / (text.length * 0.6));
  const clockSize = Math.min(fitMono(clockText, height * 0.26), contentW / 4.8);
  const headSize = base * 0.036;
  const dateSize = base * 0.055;
  const infoSize = base * 0.038;

  // 四隅の L 字マーカー。すべて見えていれば画面いっぱいに表示できている。
  const mark = Math.round(base * 0.07);
  const corners = [
    [0, 0, 1, 1],
    [width, 0, -1, 1],
    [0, height, 1, -1],
    [width, height, -1, -1],
  ]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M ${x + dx * mark} ${y + (dy * line) / 2} H ${x + (dx * line) / 2} V ${y + dy * mark}"/>`
    )
    .join('');

  // 「秒」の進み具合を示すバー。更新のたびに確実に見た目が変わる。
  const barX = margin * 2;
  const barW = width - margin * 4;
  const barY = height * 0.66;
  const barH = base * 0.05;
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;

  // e-ink の階調確認用グレースケールバー。
  const steps = 16;
  const grayY = height * 0.78;
  const grayH = base * 0.04;
  const grayW = barW / steps;
  const grays = Array.from({ length: steps }, (_, i) => {
    const v = Math.round((255 * i) / (steps - 1));
    return `<rect x="${barX + grayW * i}" y="${grayY}" width="${grayW}" height="${grayH}" fill="rgb(${v},${v},${v})"/>`;
  }).join('');

  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} (${WEEKDAYS[now.getDay()]})`;
  const status = clientStatus(client);
  const statusSize = fitMono(status, base * 0.034);
  const footer = `viewport ${width} x ${height} px  /  uptime ${formatUptime(uptimeMs)}  /  polling, no meta refresh`;
  const footSize = fitMono(footer, base * 0.028);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#000000" stroke-width="${line}"/>
<g fill="none" stroke="#000000" stroke-width="${line * 2}">${corners}</g>

<text x="${margin * 2}" y="${margin * 2 + headSize}" font-family="${SANS}" font-size="${headSize}" fill="#000000">MyRealDashboard — prototype</text>
<text x="${width - margin * 2}" y="${margin * 2 + headSize}" font-family="${MONO}" font-size="${headSize}" fill="#000000" text-anchor="end">rev ${revision} / #${count}</text>

<text x="${width / 2}" y="${height * 0.3}" font-family="${SANS}" font-size="${dateSize}" fill="#000000" text-anchor="middle">${esc(date)}</text>
<text x="${width / 2}" y="${height * 0.5}" font-family="${MONO}" font-size="${clockSize}" fill="#000000" text-anchor="middle">${clockText}</text>
<text x="${width / 2}" y="${height * 0.575}" font-family="${SANS}" font-size="${infoSize}" fill="#000000" text-anchor="middle">${updateSec} 秒ごとに更新 / ${pollSec} 秒ごとにポーリング</text>

<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="none" stroke="#000000" stroke-width="${line}"/>
<rect x="${barX}" y="${barY}" width="${(barW * seconds) / 60}" height="${barH}" fill="#000000"/>
${grays}
<text x="${width / 2}" y="${height * 0.87}" font-family="${MONO}" font-size="${statusSize}" fill="#000000" text-anchor="middle">${esc(status)}</text>
<text x="${width / 2}" y="${height - margin * 2}" font-family="${MONO}" font-size="${footSize}" fill="#000000" text-anchor="middle">${esc(footer)}</text>
</svg>`;
}

/** ダッシュボード画面を 16 階調グレースケールの PNG として描画する。 */
export async function renderScreen(options) {
  const svg = buildSvg(options);
  return sharp(Buffer.from(svg))
    .grayscale()
    .png({ colours: 16, compressionLevel: 9 })
    .toBuffer();
}
