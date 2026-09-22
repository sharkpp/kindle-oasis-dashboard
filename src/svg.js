/**
 * SVG の組み立てに使う小さな道具。
 *
 * 描画先は librsvg（sharp 経由）なので、`textLength` のように対応が読めない機能は使わず、
 * 文字幅を見積もってフォントサイズを決める方針を取る。
 */

export const SANS = 'Hiragino Sans, Noto Sans CJK JP, sans-serif';
export const MONO = 'Menlo, DejaVu Sans Mono, monospace';

export const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 1em を 1 とした半角の字幅。等幅は 0.6em、和文フォントの欧文は 0.55em ほど。 */
const ASCII_EM = { [MONO]: 0.6, [SANS]: 0.55 };

/** 1em を 1 とした文字列の幅。全角は 1em として数える。 */
export function textWidth(text, font = SANS) {
  const ascii = ASCII_EM[font] ?? 0.6;
  let em = 0;
  for (const ch of String(text)) em += ch.codePointAt(0) < 0x2e80 ? ascii : 1;
  return em;
}

/** `maxWidth` px に収まる最大のフォントサイズ。`max` を超えては大きくしない。 */
export function fitSize(text, maxWidth, max, font = SANS) {
  const em = textWidth(text, font);
  return em > 0 ? Math.min(max, maxWidth / em) : max;
}

/** 指定サイズで `maxWidth` px に収まらない分を落とし、末尾を … にする。 */
export function ellipsize(text, maxWidth, size, font = SANS) {
  const chars = [...String(text)];
  if (textWidth(chars.join(''), font) * size <= maxWidth) return chars.join('');
  const limit = maxWidth / size - textWidth('…', font);
  let em = 0;
  const kept = [];
  for (const ch of chars) {
    const next = em + textWidth(ch, font);
    if (next > limit) break;
    em = next;
    kept.push(ch);
  }
  return `${kept.join('')}…`;
}

/**
 * `<text>` を 1 行描く。`y` は文字の縦中央、`anchor` は start / middle / end。
 * 縦中央合わせは `dominant-baseline` に頼らず、フォントサイズからの実測比で寄せる。
 */
export function text(content, { x, y, size, anchor = 'start', font = SANS, weight = 'normal', fill = '#000' }) {
  const baseline = y + size * 0.35;
  return `<text x="${round(x)}" y="${round(baseline)}" font-family="${font}" font-size="${round(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(content)}</text>`;
}

export function round(n) {
  return Math.round(n * 100) / 100;
}
