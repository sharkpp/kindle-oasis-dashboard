/**
 * 次のミルクの時間。
 *
 * ぴよログのフィードから直近のミルク記録を探し、そこから指定時間後を目標にする。
 * 目標を過ぎている場合は残り時間ではなく、過ぎた時間を出す。
 */

import { latestRecord } from '../sources/piyolog.js';
import { dayDiff, formatClock, formatElapsed, formatRemaining } from '../time.js';
import { footer, header, inset, stack, unavailable } from './common.js';
import { asArray, asNumber, asSourceNames, asString, reject } from '../validate.js';

export const type = 'milk';

/** 既定はミルク（調乳）。母乳も対象にしたい場合は設定で足す。 */
const DEFAULT_RECORD_TYPES = ['Formula'];

export function normalize(item, path, sources) {
  const types = item.record_types
    ? asArray(item.record_types, `${path}.record_types`, { min: 1 }).map((value, i) =>
        asString(value, `${path}.record_types[${i}]`)
      )
    : DEFAULT_RECORD_TYPES;
  if (!item.interval_min) reject(`${path}.interval_min`, '必須です（前回から何分後を目標にするか）');
  // どのぴよログを見るか。省略すれば最初に定義されているもの。
  const [source = null] = asSourceNames(item.source, `${path}.source`, {
    sources,
    type: 'piyolog',
  });
  return {
    label: asString(item.label, `${path}.label`, { fallback: '' }),
    intervalMin: asNumber(item.interval_min, `${path}.interval_min`, { min: 1, max: 1440 }),
    recordTypes: types,
    source,
  };
}

export function build(options, ctx) {
  const feed = options.source && ctx.sources[options.source];
  if (!feed) return { label: options.label, state: 'unset', note: 'ぴよログの設定がありません' };
  if (!feed.data) {
    return {
      label: options.label,
      state: 'unavailable',
      note: feed.error ? 'ぴよログを取得できません' : 'ぴよログを取得中',
    };
  }

  const last = latestRecord(feed.data, options.recordTypes);
  if (!last) {
    return { label: options.label, state: 'none', note: '直近の記録がありません' };
  }

  const target = new Date(last.at.getTime() + options.intervalMin * 60000);
  const days = dayDiff(ctx.now, target, ctx.timezone);
  const overdue = target <= ctx.now;
  return {
    label: options.label,
    state: 'ok',
    time: formatClock(target, ctx.timezone),
    remaining: overdue
      ? `${formatElapsed(ctx.now - target)} 過ぎています`
      : `あと ${formatRemaining(target - ctx.now)}`,
    note: [
      days === 1 ? 'あす' : '',
      `前回 ${formatClock(last.at, ctx.timezone)}`,
      last.ml ? `${last.ml}ml` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  if (model.state !== 'ok') return head.svg + foot.svg + unavailable(foot.rest);
  return head.svg + foot.svg + stack(foot.rest, model.time, model.remaining);
}
