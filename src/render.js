/**
 * 画面の描画。
 *
 * 表示内容を SVG に組み立て、sharp で 16 階調グレースケール PNG に変換する。
 * 電子ペーパー向けに白背景・黒描画で、階調は文字の主従を示すためだけに使う。
 */

import sharp from 'sharp';
import { layout } from './layout.js';
import { getWidget } from './widgets/index.js';

function buildSvg({ view, width, height, padding, gap }) {
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
</svg>`;
}

export async function renderScreen(options) {
  return sharp(Buffer.from(buildSvg(options)))
    .grayscale()
    .png({ colours: 16, compressionLevel: 9 })
    .toBuffer();
}

export { buildSvg };
