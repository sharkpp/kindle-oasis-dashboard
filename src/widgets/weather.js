/**
 * 今日・明日・明後日の天気と、降水確率・気温。
 *
 * 1 日を 1 列にして横に並べる。列の中は上から、日・記号・天気・降水確率・気温。
 */

import { MONO, SANS, ellipsize, fitSize, text } from '../svg.js';
import { INK, SUB_INK, footer, header, inset } from './common.js';
import { dayLabel, daysFrom, readLabel, readWeatherSource, todayKey, upcomingDays, weatherData } from './weather-common.js';
import { asNumber } from '../validate.js';

export const type = 'weather';

/** 列の中の行。高さの比と、値の取り出し方。 */
const ROWS = [
  { key: 'day', weight: 1, font: SANS, ink: SUB_INK },
  { key: 'symbol', weight: 3, font: SANS, ink: INK },
  { key: 'weather', weight: 1.2, font: SANS, ink: INK },
  { key: 'pop', weight: 1.2, font: MONO, ink: INK },
  { key: 'temp', weight: 1.2, font: MONO, ink: SUB_INK },
];

export function normalize(item, path, sources) {
  return {
    label: readLabel(item, path),
    days: asNumber(item.days, `${path}.days`, { fallback: 3, min: 1, max: 3, integer: true }),
    ...readWeatherSource(item, path, sources),
  };
}

export function build(options, ctx) {
  const { data, note } = weatherData(options, ctx);
  if (!data) return { label: options.label, columns: [], note };

  const today = todayKey(ctx);
  const columns = upcomingDays(data, ctx)
    .slice(0, options.days)
    .map((day) => ({
      day: dayLabel(daysFrom(today, day.date), day.date),
      symbol: day.symbol || '–',
      weather: day.short,
      pop: day.pop === null ? '—' : `${day.pop}%`,
      temp:
        day.tempMin === null && day.tempMax === null
          ? '—'
          : `${day.tempMin ?? '—'}/${day.tempMax ?? '—'}`,
    }));

  return {
    label: options.label,
    columns,
    note: columns.length === 0 ? '今日以降の予報がありません' : '',
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  const area = foot.rest;
  if (model.columns.length === 0) return head.svg + foot.svg;

  const columnWidth = area.w / model.columns.length;
  const totalWeight = ROWS.reduce((sum, row) => sum + row.weight, 0);

  return (
    head.svg +
    foot.svg +
    model.columns
      .map((column, index) => {
        const centerX = area.x + columnWidth * (index + 0.5);
        let top = area.y;
        return ROWS.map((row) => {
          const height = (area.h * row.weight) / totalWeight;
          const value = column[row.key];
          // 行の高さに収め、列幅からもはみ出させない。
          const size = Math.min(height * 0.7, fitSize(value, columnWidth * 0.88, height, row.font));
          const svg = text(ellipsize(value, columnWidth * 0.88, size, row.font), {
            x: centerX,
            y: top + height / 2,
            size,
            anchor: 'middle',
            font: row.font,
            fill: row.ink,
          });
          top += height;
          return svg;
        }).join('');
      })
      .join('')
  );
}
