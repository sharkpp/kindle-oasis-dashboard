/**
 * 次の予定。Google カレンダーの iCal フィードから取得する。
 *
 * 進行中の予定も「いま」の欄として残し、その後に控えている予定を続ける。
 * 取得元は複数指定でき、まとめて日付順に並べる。
 */

import { MONO, SANS, ellipsize, fitSize, text, textWidth } from '../svg.js';
import { dayDiff, formatClock, formatShortDate } from '../time.js';
import { SUB_INK, footer, header, inset, unavailable } from './common.js';
import { asArray, asNumber, asObject, asSourceNames, asString, reject } from '../validate.js';

export const type = 'calendar';

/** 行の高さに対する文字の大きさ。 */
const ROW_SPACING = 0.46;
/** 大きさを自動で決めるとき、時刻の欄に充てる幅の割合。 */
const WHEN_WIDTH = 0.42;
/** 時刻の欄はここまで。これを超えたら一律で縮める。件名を出す幅を残すため。 */
const WHEN_WIDTH_LIMIT = 0.6;

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

/**
 * 段階ごとの見せ方。`font_size` は px、`font_scale` は項目の高さに対する割合。
 * 端末ごとに画素数が違うので、割合で書けば同じ見え方になる。
 */
function readLevel(raw, path) {
  const level = asObject(raw, path);
  const hasSize = level.font_size !== undefined && level.font_size !== null;
  const hasScale = level.font_scale !== undefined && level.font_scale !== null;
  if (hasSize && hasScale) reject(path, 'font_size と font_scale はどちらか一方だけ指定してください');
  if (!hasSize && !hasScale) reject(path, 'font_size か font_scale を指定してください');
  return {
    fontSize: hasSize ? asNumber(level.font_size, `${path}.font_size`, { min: 6, max: 400 }) : null,
    fontScale: hasScale ? asNumber(level.font_scale, `${path}.font_scale`, { min: 0.01, max: 1 }) : null,
  };
}

/**
 * 直近から順に当てる段階。予定は日でまとめるので、同じ日の予定は同じ段階になる。
 * 段階が尽きた分は最後の段階を使う（最初 / その次 / その他 なら 3 つ書く）。
 */
function readLevels(raw, path) {
  if (raw === undefined || raw === null) return null;
  return asArray(raw, path, { min: 1 }).map((level, i) => readLevel(level, `${path}[${i}]`));
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
    // 省略すれば枠に収まる大きさを自動で決める。
    levels: readLevels(item.levels, `${path}.levels`),
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

/**
 * 予定を日でまとめ、直近から 0, 1, 2 … の段階を振る。
 * 「明日と明後日の予定があれば明日だけが段階 0」になる。予定のない日は飛ばす。
 */
function withLevels(entries) {
  let level = -1;
  let previousDay = null;
  return entries.map((entry) => {
    if (entry.day !== previousDay) {
      level += 1;
      previousDay = entry.day;
    }
    const { day, ...rest } = entry;
    return { ...rest, level };
  });
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
      day: dayDiff(ctx.now, event.start, ctx.timezone),
    }));

  return {
    label: options.label,
    entries: withLevels(entries),
    note: pending.length ? pendingNote : entries.length === 0 ? 'この先の予定はありません' : '',
    // 見せ方も表示内容の一部。変えれば版番号が上がる。
    levels: options.levels,
  };
}

/**
 * 各行の位置・高さ・文字の大きさ。
 *
 * 行の高さは、その行に求められた文字の大きさの比で割り振る。大きい行ほど広くなる。
 * 求められた大きさが枠に収まらなければ、収まるところまで縮める。
 * `levels` を省いたときは、枠に収まる大きさを自動で決めてすべての行に使う。
 *
 * @returns {{rows: Array<{y:number, size:number, gutter:number}>}}
 *   `gutter` は時刻の欄の幅（px）。同じ大きさの行どうしで件名の開始位置を揃える。
 */
export function rowMetrics(entries, area, { levels = null, itemHeight = 0 } = {}) {
  // 大きさを決めるときは、最も長い時刻の表記が収まることを基準にする。
  const longestWhen = entries.reduce(
    (longest, entry) => (textWidth(entry.when, MONO) > textWidth(longest, MONO) ? entry.when : longest),
    ''
  );
  const autoSize = fitSize(longestWhen, area.w * WHEN_WIDTH, Infinity, MONO);

  const requested = entries.map((entry) => {
    if (!levels) return autoSize;
    // 段階が尽きた分は最後の段階を使う。
    const level = levels[Math.min(entry.level, levels.length - 1)];
    return level.fontSize ?? level.fontScale * itemHeight;
  });
  const total = requested.reduce((sum, size) => sum + size, 0);

  let top = area.y;
  const rows = requested.map((size) => {
    const height = (area.h * size) / total;
    const row = { y: top + height / 2, size: Math.min(size, height * ROW_SPACING) };
    top += height;
    return row;
  });

  // 件名の開始位置は、同じ大きさの行どうしで揃える。大きさを指定していなければ
  // 全行が同じ大きさなので、結果として全行で揃う。
  const gutters = new Map();
  rows.forEach((row, i) => {
    const width = (textWidth(entries[i].when, MONO) + 0.6) * row.size;
    gutters.set(row.size, Math.max(gutters.get(row.size) ?? 0, width));
  });

  // 時刻の欄が広がりすぎたら、件名を出す幅が残るところまで一律で縮める。
  // 仕上がりの幅で判断するので、日付の長い行に他の行が引きずられない。
  const limit = area.w * WHEN_WIDTH_LIMIT;
  const widest = Math.max(...gutters.values());
  const scale = widest > limit ? limit / widest : 1;

  return {
    rows: rows.map((row) => ({
      y: row.y,
      size: row.size * scale,
      gutter: gutters.get(row.size) * scale,
    })),
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  if (model.entries.length === 0) return head.svg + foot.svg + unavailable(foot.rest);

  const area = foot.rest;
  // font_scale は項目の高さに対する割合。端末の画素数が変わっても同じ見え方になる。
  const { rows } = rowMetrics(model.entries, area, {
    levels: model.levels,
    itemHeight: box.h,
  });

  return (
    head.svg +
    foot.svg +
    model.entries
      .map((entry, i) => {
        const { y, size, gutter } = rows[i];
        const summaryX = area.x + gutter;
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
