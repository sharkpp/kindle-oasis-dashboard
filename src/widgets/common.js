/**
 * 項目の描画で共通して使う部品。
 *
 * どの項目も「見出し（小）＋主役の値（大）＋補足（中）」の形に寄せる。
 * 電子ペーパーは階調が粗いので、色ではなく大きさで情報の主従を付ける。
 */

import { SANS, MONO, ellipsize, fitSize, text } from '../svg.js';

export const INK = '#000000';
export const SUB_INK = '#555555';

/** 枠の内側に余白を取った領域。 */
export function inset(box, ratio = 0.07) {
  const pad = Math.min(box.w, box.h) * ratio;
  return { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
}

/**
 * 見出しを描いて、残りの領域を返す。見出しが無ければ領域をそのまま返す。
 */
export function header(label, area) {
  if (!label) return { svg: '', rest: area };
  const size = fitSize(label, area.w, Math.min(area.h * 0.22, 34));
  const band = size * 1.7;
  return {
    svg: text(ellipsize(label, area.w, size), {
      x: area.x,
      y: area.y + size / 2,
      size,
      fill: SUB_INK,
    }),
    rest: { x: area.x, y: area.y + band, w: area.w, h: area.h - band },
  };
}

/**
 * 主役の値と補足を、領域の中央に積んで描く。
 *
 * @param {object} area
 * @param {string} main 主役の値。時刻など
 * @param {string} [sub] 補足。残り時間など
 * @param {boolean} [mono] 主役を等幅で描くか
 */
export function stack(area, main, sub, mono = true) {
  const mainArea = sub ? area.h * 0.62 : area.h;
  const mainSize = Math.min(mainArea * 0.82, fitSize(main, area.w, area.h));
  const subSize = sub ? Math.min((area.h - mainArea) * 0.62, fitSize(sub, area.w, area.h * 0.3)) : 0;
  const totalHeight = mainSize * 1.05 + (sub ? subSize * 1.5 : 0);
  const top = area.y + (area.h - totalHeight) / 2;
  const centerX = area.x + area.w / 2;

  let svg = text(main, {
    x: centerX,
    y: top + (mainSize * 1.05) / 2,
    size: mainSize,
    anchor: 'middle',
    font: mono ? MONO : SANS,
  });
  if (sub) {
    svg += text(ellipsize(sub, area.w, subSize), {
      x: centerX,
      y: top + mainSize * 1.05 + subSize * 0.75,
      size: subSize,
      anchor: 'middle',
      fill: SUB_INK,
    });
  }
  return svg;
}

/** データが取れていないときの表示。理由は footer に任せ、ここは控えめな横棒だけ。 */
export function unavailable(area) {
  const size = Math.min(area.h * 0.3, area.w * 0.2, 96);
  return text('—', {
    x: area.x + area.w / 2,
    y: area.y + area.h / 2,
    size,
    anchor: 'middle',
    font: MONO,
    fill: SUB_INK,
  });
}

/**
 * 補足を下端に描いて、残りの領域を返す。
 */
export function footer(note, area) {
  if (!note) return { svg: '', rest: area };
  const size = fitSize(note, area.w, Math.min(area.h * 0.18, 28));
  const band = size * 1.6;
  return {
    svg: text(ellipsize(note, area.w, size), {
      x: area.x,
      y: area.y + area.h - band / 2,
      size,
      fill: SUB_INK,
    }),
    rest: { x: area.x, y: area.y, w: area.w, h: area.h - band },
  };
}
