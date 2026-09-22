/** セクションタイトル。ひとまとまりの項目に見出しを付ける。 */

import { SANS, ellipsize, fitSize, round, text } from '../svg.js';
import { INK, inset } from './common.js';
import { asString } from '../validate.js';

export const type = 'section';

export function normalize(item, path) {
  return { text: asString(item.text, `${path}.text`) };
}

export function build(options) {
  return { text: options.text };
}

export function render(model, box) {
  const area = inset(box, 0.04);
  const size = Math.min(area.h * 0.62, fitSize(model.text, area.w, area.h));
  const baselineY = area.y + area.h - size * 0.25;
  return (
    text(ellipsize(model.text, area.w, size), {
      x: area.x,
      y: baselineY - size / 2,
      size,
      font: SANS,
      weight: 'bold',
      fill: INK,
    }) +
    `<rect x="${round(area.x)}" y="${round(area.y + area.h - 2)}" width="${round(area.w)}" height="2" fill="${INK}"/>`
  );
}
