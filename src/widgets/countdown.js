/**
 * 指定の時間までの残り時間。
 *
 * 時刻は毎日同じ時間に繰り返すものとして扱い、複数指定できる。
 * 今より後でいちばん近いものを選ぶ。今日の分が全部過ぎていれば翌日の最初の時刻になる。
 */

import {
  dayDiff,
  formatClock,
  formatRemaining,
  formatShortDate,
  parseHourMinute,
  sameDayAt,
  zonedParts,
} from '../time.js';
import { footer, header, inset, stack } from './common.js';
import { asArray, asString, reject } from '../validate.js';

export const type = 'countdown';

/** 曜日の書き方。`Date` の曜日番号（日曜が 0）に合わせる。 */
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const EVERY_DAY = DAY_NAMES.map((_, index) => index);

/** 有効にする曜日。省略すれば毎日。 */
function readDays(raw, path, fallback) {
  if (raw === undefined || raw === null) return fallback;
  return asArray(raw, path, { min: 1 }).map((value, i) => {
    const index = DAY_NAMES.indexOf(asString(value, `${path}[${i}]`).toLowerCase());
    if (index < 0) reject(`${path}[${i}]`, `曜日は ${DAY_NAMES.join(' / ')} で指定してください`);
    return index;
  });
}

export function normalize(item, path) {
  // 項目に書いた曜日が既定で、時刻ごとに上書きできる。
  const days = readDays(item.days, `${path}.days`, EVERY_DAY);
  const times = asArray(item.times, `${path}.times`, { min: 1 }).map((entry, i) => {
    const at = typeof entry === 'string' ? entry : entry?.at;
    const parsed = parseHourMinute(at ?? '');
    if (!parsed) reject(`${path}.times[${i}]`, 'HH:MM の形式で指定してください');
    return {
      ...parsed,
      name: typeof entry === 'string' ? '' : asString(entry.name, `${path}.times[${i}].name`, { fallback: '' }),
      days: typeof entry === 'string' ? days : readDays(entry.days, `${path}.times[${i}].days`, days),
    };
  });
  return { label: asString(item.label, `${path}.label`, { fallback: '' }), times };
}

/**
 * 今より後でいちばん近い時刻。
 * 曜日で絞ると最大で 1 週間先になるので、今日から 8 日分の候補を見る。
 */
function nextOccurrence(times, now, timezone) {
  let best = null;
  for (const time of times) {
    for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
      const at = sameDayAt(now, timezone, time.hour, time.minute, dayOffset);
      if (at <= now) continue;
      if (!time.days.includes(zonedParts(at, timezone).weekday)) continue;
      // この時刻についてはこれが最短なので、これ以上先は見なくてよい。
      if (!best || at < best.at) best = { at, name: time.name };
      break;
    }
  }
  return best;
}

export function build(options, ctx) {
  const next = nextOccurrence(options.times, ctx.now, ctx.timezone);
  const days = dayDiff(ctx.now, next.at, ctx.timezone);
  const dayLabel = days === 0 ? '' : days === 1 ? 'あす' : formatShortDate(next.at, ctx.timezone);
  return {
    label: options.label,
    time: formatClock(next.at, ctx.timezone),
    remaining: `あと ${formatRemaining(next.at - ctx.now)}`,
    note: [dayLabel, next.name].filter(Boolean).join(' · '),
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  return head.svg + foot.svg + stack(foot.rest, model.time, model.remaining);
}
