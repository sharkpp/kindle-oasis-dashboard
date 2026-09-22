/**
 * 次の予定。Google カレンダーの iCal フィードから取得する。
 *
 * 進行中の予定も「いま」の欄として残し、その後に控えている予定を続ける。
 * 取得元は複数指定でき、まとめて日付順に並べる。
 */

import { MONO, SANS, ellipsize, fitSize, text, textWidth } from '../svg.js';
import { dayDiff, formatClock, formatShortDate } from '../time.js';
import { SUB_INK, footer, header, inset, unavailable } from './common.js';
import { asNumber, asSourceNames, asString, reject } from '../validate.js';

export const type = 'calendar';

/** ワイルドカード（`*` と `?`）を正規表現にする。全体が一致したときだけ通す。 */
function globToRegExp(pattern) {
  const body = [...pattern]
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`);
}

/**
 * 件名の絞り込み。`/.../` で囲めば正規表現、そうでなければワイルドカード。
 * 比較に使う正規表現と、書かれたままの文字列の両方を持つ（設定の差分検知に使う）。
 */
function readMatch(raw, path) {
  if (raw === undefined || raw === null) return null;
  const pattern = asString(raw, path);
  const asRegExp = /^\/(.*)\/([a-z]*)$/s.exec(pattern);
  try {
    return {
      pattern,
      regexp: asRegExp ? new RegExp(asRegExp[1], asRegExp[2]) : globToRegExp(pattern),
    };
  } catch (err) {
    return reject(path, `正規表現として読めません — ${err.message}`);
  }
}

export function normalize(item, path, sources) {
  // どのカレンダーを見るか。省略すれば最初に定義されているもの。
  const names = asSourceNames(item.sources, `${path}.sources`, {
    sources,
    type: 'calendar',
    multiple: true,
  });
  return {
    label: asString(item.label, `${path}.label`, { fallback: '' }),
    count: asNumber(item.count, `${path}.count`, { fallback: 3, min: 1, max: 10, integer: true }),
    sources: names,
    match: readMatch(item.match, `${path}.match`),
  };
}

/** 予定の開始を、その日らしさが分かる短い文字列にする。 */
function whenLabel(event, now, timezone) {
  const days = dayDiff(now, event.start, timezone);
  const day = days === 0 ? '' : days === 1 ? 'あす' : formatShortDate(event.start, timezone);
  if (event.allDay) return [day || 'きょう', '終日'].join(' ');
  const clock = formatClock(event.start, timezone);
  return day ? `${day} ${clock}` : clock;
}

export function build(options, ctx) {
  const feeds = options.sources.map((name) => ctx.sources[name]).filter(Boolean);
  if (feeds.length === 0) return { label: options.label, entries: [], note: 'カレンダーの設定がありません' };

  // まだ取れていない取得元があれば、一覧が欠けていることを伝える。
  const pending = feeds.filter((feed) => !feed.data);
  const pendingNote = pending.some((feed) => feed.error)
    ? 'カレンダーを取得できません'
    : 'カレンダーを取得中';

  const entries = feeds
    .flatMap((feed) => feed.data?.events ?? [])
    .filter((event) => event.end > ctx.now)
    .filter((event) => !options.match || options.match.regexp.test(event.summary ?? ''))
    .sort((a, b) => a.start - b.start)
    .slice(0, options.count)
    .map((event) => ({
      when: whenLabel(event, ctx.now, ctx.timezone),
      summary: event.summary || '(件名なし)',
      now: event.start <= ctx.now,
    }));

  return {
    label: options.label,
    entries,
    note: pending.length ? pendingNote : entries.length === 0 ? 'この先の予定はありません' : '',
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  if (model.entries.length === 0) return head.svg + foot.svg + unavailable(foot.rest);

  const area = foot.rest;
  const rowHeight = area.h / model.entries.length;
  // 時刻の欄は最も長い表記に合わせて固定し、件名の開始位置を揃える。
  const longestWhen = model.entries.reduce(
    (longest, entry) => (textWidth(entry.when, MONO) > textWidth(longest, MONO) ? entry.when : longest),
    ''
  );
  const size = Math.min(rowHeight * 0.46, fitSize(longestWhen, area.w * 0.42, rowHeight, MONO));
  const summaryX = area.x + textWidth(longestWhen, MONO) * size + size * 0.6;

  return (
    head.svg +
    model.entries
      .map((entry, i) => {
        const y = area.y + rowHeight * (i + 0.5);
        const when = text(entry.when, {
          x: area.x,
          y,
          size,
          font: MONO,
          fill: entry.now ? '#000000' : SUB_INK,
        });
        const summary = text(ellipsize(entry.summary, area.x + area.w - summaryX, size, SANS), {
          x: summaryX,
          y,
          size,
          font: SANS,
          weight: entry.now ? 'bold' : 'normal',
        });
        return when + summary;
      })
      .join('')
  );
}
