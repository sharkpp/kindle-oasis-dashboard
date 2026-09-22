/**
 * 指定の時間までの残り時間。
 *
 * 時刻は毎日同じ時間に繰り返すものとして扱い、複数指定できる。
 * 今より後でいちばん近いものを選ぶ。今日の分が全部過ぎていれば翌日の最初の時刻になる。
 */

import { dayDiff, formatClock, formatRemaining, parseHourMinute, sameDayAt } from '../time.js';
import { footer, header, inset, stack } from './common.js';
import { asArray, asString, reject } from '../validate.js';

export const type = 'countdown';

export function normalize(item, path) {
  const times = asArray(item.times, `${path}.times`, { min: 1 }).map((entry, i) => {
    const at = typeof entry === 'string' ? entry : entry?.at;
    const parsed = parseHourMinute(at ?? '');
    if (!parsed) reject(`${path}.times[${i}]`, 'HH:MM の形式で指定してください');
    return {
      ...parsed,
      name: typeof entry === 'string' ? '' : asString(entry.name, `${path}.times[${i}].name`, { fallback: '' }),
    };
  });
  return { label: asString(item.label, `${path}.label`, { fallback: '' }), times };
}

/** 今より後でいちばん近い時刻。今日と翌日の候補から選ぶ。 */
function nextOccurrence(times, now, timezone) {
  let best = null;
  for (const time of times) {
    for (const dayOffset of [0, 1]) {
      const at = sameDayAt(now, timezone, time.hour, time.minute, dayOffset);
      if (at > now && (!best || at < best.at)) best = { at, name: time.name };
    }
  }
  return best;
}

export function build(options, ctx) {
  const next = nextOccurrence(options.times, ctx.now, ctx.timezone);
  // 候補は今日と翌日からしか選ばないので、日をまたぐのは「あす」だけ。
  const dayLabel = dayDiff(ctx.now, next.at, ctx.timezone) === 0 ? '' : 'あす';
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
