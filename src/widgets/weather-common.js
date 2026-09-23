/**
 * 天気の項目に共通の設定と、日付の選び方。
 *
 * 気象庁の日時はすべて日本時間なので、暦日は文字列 (YYYY-MM-DD) のまま扱う。
 */

import { zonedParts } from '../time.js';
import { asSourceNames, asString } from '../validate.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LABELS = ['きょう', 'あす', 'あさって'];

export function readWeatherSource(item, path, sources) {
  return {
    // どの天気予報を見るか。省略すれば最初に定義されているもの。
    source: asSourceNames(item.source, `${path}.source`, { sources, type: 'weather' })[0] ?? null,
  };
}

/** 項目が使う天気予報の中身。まだ取れていなければ、その理由だけを返す。 */
export function weatherData(options, ctx) {
  const feed = options.source && ctx.sources[options.source];
  if (!feed) return { note: '天気予報の設定がありません' };
  if (!feed.data) return { note: feed.error ? '天気予報を取得できません' : '天気予報を取得中' };
  return { data: feed.data };
}

/** 表示タイムゾーンでの今日の暦日。 */
export function todayKey(ctx) {
  const p = zonedParts(ctx.now, ctx.timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 今日を 0 とした日数の差。 */
export function daysFrom(todayDate, date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000);
}

/** きょう / あす / あさって、それ以降は日付。 */
export function dayLabel(offset, date) {
  if (DAY_LABELS[offset]) return DAY_LABELS[offset];
  const at = new Date(`${date}T00:00:00Z`);
  return `${at.getUTCMonth() + 1}/${at.getUTCDate()}(${WEEKDAYS[at.getUTCDay()]})`;
}

/** 今日以降の予報。今日の分が無ければ空。 */
export function upcomingDays(data, ctx) {
  const today = todayKey(ctx);
  return data.days.filter((day) => day.date >= today);
}

export const readLabel = (item, path) =>
  asString(item.label, `${path}.label`, { fallback: '' });
