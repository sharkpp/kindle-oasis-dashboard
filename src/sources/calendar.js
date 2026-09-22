/**
 * Google カレンダーの「iCal 形式の非公開 URL」から予定を読む。
 *
 * URL 自体が認証情報なので、ぴよログのフィードと同じ扱いにする。
 * 繰り返し予定は ICS の RRULE をこちら側で展開する。展開の基準時刻は取得時刻で、
 * 取得間隔ごとに作り直すので、先の予定まで毎回引き直す必要はない。
 */

import ICAL from 'ical.js';
import { CachedFeed } from './feed.js';
import { fromZoned } from '../time.js';

/** 何日先まで展開するか。ダッシュボードは直近しか出さないので短くてよい。 */
const WINDOW_DAYS = 31;
/** 繰り返しの展開が止まらなくなったときの歯止め。 */
const MAX_STEPS = 5000;

/** ICAL の時刻を実時刻にする。日付のみ・浮動時刻は表示タイムゾーンの壁時計として読む。 */
function toDate(time, timezone) {
  if (time.isDate || time.zone === ICAL.Timezone.localTimezone) {
    return fromZoned(
      { year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute },
      timezone
    );
  }
  return time.toJSDate();
}

export function parseIcs(body, { timezone, from = new Date() }) {
  const root = new ICAL.Component(ICAL.parse(body));

  // ファイル内の VTIMEZONE を登録しておかないと TZID 付きの時刻が解決できない。
  for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
    const tzid = vtimezone.getFirstPropertyValue('tzid');
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(tzid, new ICAL.Timezone(vtimezone));
    }
  }

  const to = new Date(from.getTime() + WINDOW_DAYS * 86400000);
  const events = [];

  for (const vevent of root.getAllSubcomponents('vevent')) {
    if (vevent.getFirstPropertyValue('status') === 'CANCELLED') continue;

    const event = new ICAL.Event(vevent);
    // 差し替え分（RECURRENCE-ID 付き）は繰り返し本体の展開で拾われる。
    if (event.isRecurrenceException() || !event.startDate) continue;

    if (!event.isRecurring()) {
      const start = toDate(event.startDate, timezone);
      const end = event.endDate ? toDate(event.endDate, timezone) : start;
      if (end > from && start < to) {
        events.push({ summary: event.summary, allDay: event.startDate.isDate, start, end });
      }
      continue;
    }

    const iterator = event.iterator();
    for (let steps = 0; steps < MAX_STEPS; steps += 1) {
      const next = iterator.next();
      if (!next) break;
      const occurrence = event.getOccurrenceDetails(next);
      const start = toDate(occurrence.startDate, timezone);
      if (start >= to) break;
      const end = toDate(occurrence.endDate, timezone);
      if (end > from) {
        events.push({
          summary: occurrence.item.summary,
          allDay: occurrence.startDate.isDate,
          start,
          end,
        });
      }
    }
  }

  events.sort((a, b) => a.start - b.start);
  return { events };
}

export function createCalendarFeed({ url, intervalSec, timezone }) {
  return new CachedFeed({
    name: 'カレンダー',
    url,
    intervalSec,
    parse: (body) => parseIcs(body, { timezone }),
  });
}
