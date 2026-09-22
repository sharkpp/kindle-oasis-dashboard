/**
 * 画面の描画。
 *
 * 表示内容を SVG に組み立て、sharp で 16 階調グレースケール PNG に変換する。
 * 電子ペーパー向けに白背景・黒描画で、階調は文字の主従を示すためだけに使う。
 */

import sharp from 'sharp';
import { layout } from './layout.js';
import { MONO, text } from './svg.js';
import { getWidget } from './widgets/index.js';

/** 端末の置き方。描いた画像をこの角度だけ時計回りに回してから返す。 */
export const ROTATION = {
  portrait: 0,
  landscape: 90,
  'portrait-reverse': 180,
  'landscape-reverse': 270,
};

export const ORIENTATIONS = Object.keys(ROTATION);

/**
 * 四隅の L 字マーカーと画像サイズ。表示領域の確認に使う。
 * 欠けている隅があれば、その辺が端末で切れている。
 */
function markers(width, height) {
  const size = Math.round(Math.min(width, height) * 0.06);
  const line = 3;
  const corners = [
    [0, 0, 1, 1],
    [width, 0, -1, 1],
    [0, height, 1, -1],
    [width, height, -1, -1],
  ]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M ${x + dx * size} ${y + (dy * line) / 2} H ${x + (dx * line) / 2} V ${y + dy * size}"/>`
    )
    .join('');
  return (
    `<g fill="none" stroke="#000000" stroke-width="${line * 2}">${corners}</g>` +
    text(`${width} x ${height}`, {
      x: width / 2,
      y: height - size / 2,
      size: Math.round(size * 0.35),
      anchor: 'middle',
      font: MONO,
      fill: '#555555',
    })
  );
}

function buildSvg({ view, width, height, padding, gap, showMarkers }) {
  const area = {
    x: padding.left,
    y: padding.top,
    w: width - padding.left - padding.right,
    h: height - padding.top - padding.bottom,
  };
  const body = layout(view.columns, area, gap)
    .map(({ item, ...box }) => getWidget(item.type).render(item.model, box))
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${body}
${showMarkers ? markers(width, height) : ''}
</svg>`;
}

/**
 * 画面を描く。`width` / `height` は端末のビューポート（出来上がる画像の大きさ）。
 * 横向きの指定では縦横を入れ替えて描いてから回すので、端末は縦のままでよい。
 */
export async function renderScreen({ orientation = 'portrait', width, height, ...rest }) {
  const rotation = ROTATION[orientation];
  const swap = rotation % 180 !== 0;
  const svg = buildSvg({ ...rest, width: swap ? height : width, height: swap ? width : height });
  return sharp(Buffer.from(svg))
    .rotate(rotation)
    .grayscale()
    .png({ colours: 16, compressionLevel: 9 })
    .toBuffer();
}

export { buildSvg };
