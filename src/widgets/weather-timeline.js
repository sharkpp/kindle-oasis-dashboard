/**
 * 時間帯ごとの天気と降水確率。
 *
 * 気象庁は降水確率を 6 時間ごとにしか出していないので、6 時間の帯になる。
 * 1 時間ごとの天気や降水確率は、防災情報の JSON でも XML でも出していない。
 *
 * いまが入っている帯から先を並べる。今日の帯を出し切れば翌日に続く。
 */

import { MONO, fitSize, round, text } from '../svg.js';
import { INK, SUB_INK, footer, header, inset } from './common.js';
import { sameDayAt } from '../time.js';
import { dayLabel, daysFrom, readLabel, readWeatherSource, todayKey, weatherData } from './weather-common.js';
import { asNumber } from '../validate.js';

export const type = 'weather-timeline';

/** 行の高さの比。 */
const TIME_WEIGHT = 1;
const BAR_WEIGHT = 3;
const POP_WEIGHT = 1;

export function normalize(item, path, sources) {
  return {
    label: readLabel(item, path),
    count: asNumber(item.count, `${path}.count`, { fallback: 4, min: 1, max: 12, integer: true }),
    ...readWeatherSource(item, path, sources),
  };
}

export function build(options, ctx) {
  const { data, note } = weatherData(options, ctx);
  if (!data) return { label: options.label, bands: [], note };

  const today = todayKey(ctx);
  const bands = data.bands
    // すでに終わった帯は落とす。
    .filter(
      (band) =>
        sameDayAt(ctx.now, ctx.timezone, band.hour + band.hours, 0, daysFrom(today, band.date)) >
        ctx.now
    )
    .slice(0, options.count)
    .map((band) => {
      const offset = daysFrom(today, band.date);
      const span = `${String(band.hour).padStart(2, '0')}-${String(band.hour + band.hours).padStart(2, '0')}`;
      return {
        time: offset === 0 ? span : `${dayLabel(offset, band.date)} ${span}`,
        pop: band.pop,
      };
    });

  return {
    label: options.label,
    bands,
    note: bands.length === 0 ? 'この先の降水確率がありません' : '',
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  const area = foot.rest;
  if (model.bands.length === 0) return head.svg + foot.svg;

  const columnWidth = area.w / model.bands.length;
  const totalWeight = TIME_WEIGHT + BAR_WEIGHT + POP_WEIGHT;
  const heightOf = (weight) => (area.h * weight) / totalWeight;

  const timeHeight = heightOf(TIME_WEIGHT);
  const barHeight = heightOf(BAR_WEIGHT);
  const popHeight = heightOf(POP_WEIGHT);
  const barWidth = columnWidth * 0.5;
  const barTop = area.y + timeHeight;

  // 文字の大きさは帯ごとに変えず、いちばん長い表記に合わせて行の中で揃える。
  const fitRow = (texts, height, ratio, font) =>
    Math.min(height * ratio, ...texts.map((value) => fitSize(value, columnWidth * 0.92, height, font)));
  const timeSize = fitRow(model.bands.map((band) => band.time), timeHeight, 0.7, MONO);
  const popSize = fitRow(model.bands.map((band) => `${band.pop}%`), popHeight, 0.8, MONO);

  return (
    head.svg +
    foot.svg +
    model.bands
      .map((band, index) => {
        const centerX = area.x + columnWidth * (index + 0.5);
        const barX = centerX - barWidth / 2;
        const filled = (barHeight * band.pop) / 100;

        return (
          text(band.time, {
            x: centerX,
            y: area.y + timeHeight / 2,
            size: timeSize,
            anchor: 'middle',
            font: MONO,
            fill: SUB_INK,
          }) +
          `<rect x="${round(barX)}" y="${round(barTop)}" width="${round(barWidth)}" height="${round(barHeight)}" fill="none" stroke="${SUB_INK}" stroke-width="2"/>` +
          `<rect x="${round(barX)}" y="${round(barTop + barHeight - filled)}" width="${round(barWidth)}" height="${round(filled)}" fill="${INK}"/>` +
          text(`${band.pop}%`, {
            x: centerX,
            y: barTop + barHeight + popHeight / 2,
            size: popSize,
            anchor: 'middle',
            font: MONO,
            fill: INK,
          })
        );
      })
      .join('')
  );
}
