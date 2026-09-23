/**
 * 当日の天気を、書式に沿って表示する。
 *
 * 行ごとに書式を書き、差し込む値を `{...}` で指定する。空になった行は出さないので、
 * 警報・注意報の行は、出ているときだけ現れる。
 */

import { SANS, ellipsize, fitSize, text } from '../svg.js';
import { INK, footer, header, inset } from './common.js';
import { dayLabel, daysFrom, readLabel, readWeatherSource, todayKey, upcomingDays, weatherData } from './weather-common.js';
import { asArray, asNumber, asObject, asString, reject } from '../validate.js';

export const type = 'weather-today';

/** 書式に差し込める値。 */
const FIELDS = {
  symbol: (day) => day.symbol,
  weather: (day) => day.weather,
  weather_short: (day) => day.short,
  pop: (day) => (day.pop === null ? '—' : String(day.pop)),
  temp_min: (day) => (day.tempMin === null ? '—' : String(day.tempMin)),
  temp_max: (day) => (day.tempMax === null ? '—' : String(day.tempMax)),
  warning: (day, data) => data.warnings.join(' '),
  area: (day, data) => data.areaName,
  day: (day, data, ctx) => dayLabel(daysFrom(todayKey(ctx), day.date), day.date),
};

const FIELD_NAMES = Object.keys(FIELDS).sort();

const DEFAULT_LINES = [
  { text: '{symbol} {weather_short}', scale: 3 },
  { text: '降水 {pop}%  {temp_min}〜{temp_max}℃', scale: 1.4 },
  { text: '{warning}', scale: 1.2 },
];

/** 1 行分の書式。文字列だけなら高さの比は 1。 */
function readLine(raw, path) {
  if (typeof raw === 'string') return { text: asString(raw, path), scale: 1 };
  const line = asObject(raw, path);
  return {
    text: asString(line.text, `${path}.text`),
    scale: asNumber(line.scale, `${path}.scale`, { fallback: 1, min: 0.1, max: 20 }),
  };
}

export function normalize(item, path, sources) {
  const lines = item.lines
    ? asArray(item.lines, `${path}.lines`, { min: 1 }).map((line, i) =>
        readLine(line, `${path}.lines[${i}]`)
      )
    : DEFAULT_LINES;

  // 書式に知らない名前が混ざっていれば、起動前に知らせる。
  for (const [i, line] of lines.entries()) {
    for (const [, name] of line.text.matchAll(/\{([a-z_]+)\}/g)) {
      if (!FIELDS[name]) {
        reject(`${path}.lines[${i}]`, `使えない値です: {${name}}（使えるのは ${FIELD_NAMES.join(' / ')}）`);
      }
    }
  }

  return { label: readLabel(item, path), lines, ...readWeatherSource(item, path, sources) };
}

export function build(options, ctx) {
  const { data, note } = weatherData(options, ctx);
  if (!data) return { label: options.label, lines: [], note };

  const [today] = upcomingDays(data, ctx);
  if (!today) return { label: options.label, lines: [], note: '今日の予報がありません' };

  const lines = options.lines
    .map((line) => ({
      text: line.text.replace(/\{([a-z_]+)\}/g, (_, name) => FIELDS[name](today, data, ctx)).trim(),
      scale: line.scale,
    }))
    // 値が空になった行は出さない。警報・注意報の行は出ているときだけ現れる。
    .filter((line) => line.text !== '');

  return { label: options.label, lines, note: '' };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  const area = foot.rest;
  if (model.lines.length === 0) return head.svg + foot.svg;

  const totalScale = model.lines.reduce((sum, line) => sum + line.scale, 0);
  let top = area.y;

  return (
    head.svg +
    foot.svg +
    model.lines
      .map((line) => {
        const height = (area.h * line.scale) / totalScale;
        const size = Math.min(height * 0.72, fitSize(line.text, area.w, height, SANS));
        const svg = text(ellipsize(line.text, area.w, size, SANS), {
          x: area.x + area.w / 2,
          y: top + height / 2,
          size,
          anchor: 'middle',
          font: SANS,
          fill: INK,
        });
        top += height;
        return svg;
      })
      .join('')
  );
}
