import { gzipSync } from 'node:zlib';

const STEP = 8;
const WIDTHS = range(240, 2400);
const HEIGHTS = range(240, 3200);

function range(from, to) {
  const out = [];
  for (let v = from; v <= to; v += STEP) out.push(v);
  return out;
}

/**
 * JavaScript を使わずにビューポート寸法を測るための CSS。
 * メディアクエリに一致した背景画像だけがブラウザから取得されるので、
 * 条件に合致した最大の幅・高さがそのままサーバーに伝わる。
 * 背景が他の要素に隠れていると取得を省くブラウザがあるため、
 * プローブは最前面に置いた 1px の要素に載せる。
 */
const CSS = [
  '.probe{position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;background-repeat:no-repeat;z-index:9}',
  '.probe-h{left:1px}',
  ...WIDTHS.map((w) => `@media (min-width:${w}px){.probe-w{background-image:url(/probe?w=${w})}}`),
  ...HEIGHTS.map((h) => `@media (min-height:${h}px){.probe-h{background-image:url(/probe?h=${h})}}`),
].join('\n');

const CSS_GZIP = gzipSync(Buffer.from(CSS, 'utf8'));

export function probeCss(acceptsGzip) {
  return acceptsGzip
    ? { body: CSS_GZIP, encoding: 'gzip' }
    : { body: Buffer.from(CSS, 'utf8'), encoding: null };
}

/** 透過 1x1 GIF。プローブの応答は見た目に影響しない。 */
export const PROBE_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
