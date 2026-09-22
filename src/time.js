/**
 * 表示タイムゾーンでの時刻の読み書き。
 *
 * サーバーのローカル時刻には依存せず、設定の `timezone` を唯一の基準にする。
 * 変換は Intl に任せ、オフセットの表を自前で持たない。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const formatters = new Map();
function partsFormatter(timezone) {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, fmt);
  }
  return fmt;
}

/** その時刻を `timezone` で読んだときの年月日時分秒と曜日。 */
export function zonedParts(date, timezone) {
  const found = Object.fromEntries(
    partsFormatter(timezone)
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const year = Number(found.year);
  const month = Number(found.month);
  const day = Number(found.day);
  return {
    year,
    month,
    day,
    hour: Number(found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** `timezone` の壁時計と UTC の差（ミリ秒）。 */
function zoneOffset(date, timezone) {
  const p = zonedParts(date, timezone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** `timezone` の壁時計として与えた年月日時分から、実際の時刻を求める。 */
export function fromZoned({ year, month, day, hour = 0, minute = 0, second = 0 }, timezone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  // オフセットはその瞬間によって変わりうるので、仮の時刻で引いてからもう一度確かめる。
  const first = new Date(wall - zoneOffset(new Date(wall), timezone));
  return new Date(wall - zoneOffset(first, timezone));
}

/** `date` と同じ日の `hour:minute`。`dayOffset` で前後の日にずらす。 */
export function sameDayAt(date, timezone, hour, minute, dayOffset = 0) {
  const p = zonedParts(date, timezone);
  return fromZoned({ year: p.year, month: p.month, day: p.day + dayOffset, hour, minute }, timezone);
}

/** 同じ暦日かどうか。 */
export function sameDay(a, b, timezone) {
  const x = zonedParts(a, timezone);
  const y = zonedParts(b, timezone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/** 暦日の差。今日なら 0、明日なら 1。 */
export function dayDiff(from, to, timezone) {
  const a = zonedParts(from, timezone);
  const b = zonedParts(to, timezone);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000
  );
}

const pad = (n) => String(n).padStart(2, '0');

/** `HH:MM`。 */
export function formatClock(date, timezone) {
  const p = zonedParts(date, timezone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** `HH:MM:SS`。 */
export function formatClockSeconds(date, timezone) {
  const p = zonedParts(date, timezone);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** `2026年9月22日 (火)`。 */
export function formatDate(date, timezone) {
  const p = zonedParts(date, timezone);
  return `${p.year}年${p.month}月${p.day}日 (${WEEKDAYS[p.weekday]})`;
}

/** `9/22(火)`。 */
export function formatShortDate(date, timezone) {
  const p = zonedParts(date, timezone);
  return `${p.month}/${p.day}(${WEEKDAYS[p.weekday]})`;
}

/** 残り時間を分単位の日本語にする。1 分未満は「まもなく」。 */
export function formatRemaining(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'まもなく';
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}分`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

/** 経過時間を分単位の日本語にする。 */
export function formatElapsed(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'いま';
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}分`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

/** `HH:MM` を時と分に分ける。形式が違えば null。 */
export function parseHourMinute(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
