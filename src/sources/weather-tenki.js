/**
 * 天気予報の取得元（tenki.jp）。日本気象協会のページを読む。
 *
 * - 今日・明日  https://tenki.jp/forecast/{地点のパス}/
 * - 1 時間ごと  https://tenki.jp/forecast/{地点のパス}/1hour.html
 *
 * 気象庁が出していない「1 時間ごとの天気・気温・降水確率」が取れるのがこちらの利点。
 * 代わりに警報・注意報は載っていないので空になる。
 *
 * HTML を読むので、ページの作りが変われば取れなくなる。欲しい欄が無ければ空にして、
 * 取れた分だけを出す。robots.txt は /forecast/ を禁じていないが、ページを 2 枚取りに
 * 行くので取得間隔は長めにしてある。
 */

import * as cheerio from 'cheerio';
import { CachedFeed } from './feed.js';
import { zonedParts } from '../time.js';

/** tenki.jp の時刻は日本時間。 */
const TIMEZONE = 'Asia/Tokyo';

/** 天気の言葉から記号を決める。「曇一時雨」なら先頭の「曇」を見る。 */
const SYMBOLS = { 晴: '☀', 曇: '☁', 雨: '☂', 雪: '☃' };

const pad = (n) => String(n).padStart(2, '0');

const toNumber = (text) => {
  const m = /-?\d+(\.\d+)?/.exec(String(text));
  return m ? Number(m[0]) : null;
};

/** 「晴のち曇」「曇一時雨」から主な天気を取り出す。 */
const mainWeather = (telop) => String(telop).split(/のち|時々|一時|後/)[0].trim();

/** 「小雨」「雨」のように前に言葉が付くことがあるので、主な天気の中から探す。 */
function symbolOf(telop) {
  for (const ch of mainWeather(telop)) {
    if (SYMBOLS[ch]) return SYMBOLS[ch];
  }
  return '';
}

/** その日の暦日（日本時間）。 */
function todayKey(now) {
  const p = zonedParts(now, TIMEZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * 「09月25日」のような月日を暦日にする。年が書かれていないので、
 * 今日から見て近い年を選ぶ。年をまたぐ 12 月末と 1 月初めのために前後の年も見る。
 */
function resolveDate(month, day, today) {
  const year = Number(today.slice(0, 4));
  for (const candidate of [year, year + 1, year - 1]) {
    const date = `${candidate}-${pad(month)}-${pad(day)}`;
    const diff = daysBetween(today, date);
    if (diff >= -1 && diff <= 20) return date;
  }
  return null;
}

/** 月日を含む文字列から暦日を取る。 */
function dateFromText(text, today) {
  const m = /(\d{1,2})月(\d{1,2})日/.exec(String(text));
  return m ? resolveDate(Number(m[1]), Number(m[2]), today) : null;
}

const emptyDay = (date) => ({
  date,
  code: null,
  symbol: '',
  weather: '',
  detail: '',
  short: '',
  pop: null,
  tempMin: null,
  tempMax: null,
});

/** 今日・明日の欄（section.today-weather / section.tomorrow-weather）。 */
function readDaySection($, section, today) {
  const date = dateFromText($(section).find('.date-box').first().text(), today);
  if (!date) return null;

  const telop = $(section).find('.weather-telop').first().text().trim();
  const day = {
    ...emptyDay(date),
    symbol: symbolOf(telop),
    weather: telop,
    // tenki.jp は「晴のち曇」のように、もともと短くまとまった書き方をしている。
    detail: telop,
    short: mainWeather(telop),
    tempMax: toNumber($(section).find('dd.high-temp.temp .value').first().text()),
    tempMin: toNumber($(section).find('dd.low-temp.temp .value').first().text()),
  };

  // 降水確率は 00-06 / 06-12 / 12-18 / 18-24 の 4 つ。過ぎた時間帯は --- になる。
  const spans = $(section)
    .find('.precip-table th')
    .map((_, th) => $(th).text().trim())
    .get()
    .filter((text) => /^\d{2}-\d{2}$/.test(text));
  const bands = $(section)
    .find('.precip-table tr.rain-probability td')
    .map((i, td) => {
      const pop = toNumber($(td).text());
      const span = spans[i];
      if (pop === null || !span) return null;
      const hour = Number(span.slice(0, 2));
      return { date, hour, hours: Number(span.slice(3)) - hour, pop, symbol: '', short: '', temp: null };
    })
    .get()
    .filter(Boolean);

  day.pop = bands.length ? Math.max(...bands.map((band) => band.pop)) : null;
  return { day, bands };
}

/** 表の見出しが `label` の行の td。`offset` を 1 にすると次の行。 */
function rowCells($, table, label, offset = 0) {
  const rows = $(table).find('tr').get();
  const index = rows.findIndex((row) => $(row).find('th').first().text().trim().startsWith(label));
  if (index < 0) return [];
  return $(rows[index + offset]).find('td').get();
}

/** 10 日間天気の表。明後日以降を埋めるのに使う。 */
function readWeekTable($, table, today) {
  const dates = rowCells($, table, '日付').map((td) => dateFromText($(td).text(), today));
  const weathers = rowCells($, table, '天気').map((td) => $(td).find('p').first().text().trim());
  const pops = rowCells($, table, '降水確率').map((td) => toNumber($(td).find('.precip').text()));
  const highs = rowCells($, table, '気温').map((td) => toNumber($(td).find('.high-temp').text()));
  const lows = rowCells($, table, '気温').map((td) => toNumber($(td).find('.low-temp').text()));

  return dates
    .map((date, i) =>
      date
        ? {
            ...emptyDay(date),
            symbol: symbolOf(weathers[i] ?? ''),
            weather: weathers[i] ?? '',
            detail: weathers[i] ?? '',
            short: mainWeather(weathers[i] ?? ''),
            pop: pops[i] ?? null,
            tempMax: highs[i] ?? null,
            tempMin: lows[i] ?? null,
          }
        : null
    )
    .filter(Boolean);
}

/** 1 時間ごとの表。1 日分で 24 列あり、列 N は N-1 時からの 1 時間。 */
function readHourTable($, table, today) {
  const date = dateFromText(rowCells($, table, '日付').map((td) => $(td).text())[0] ?? '', today);
  if (!date) return [];

  const hours = rowCells($, table, '時刻', 1).map((td) => toNumber($(td).text()));
  const weathers = rowCells($, table, '天気').map((td) => $(td).find('p').first().text().trim());
  const pops = rowCells($, table, '降水確率').map((td) => toNumber($(td).text()));
  const temps = rowCells($, table, '気温', 1).map((td) => toNumber($(td).text()));

  return hours
    .map((hour, i) =>
      hour === null
        ? null
        : {
            date,
            hour: hour - 1,
            hours: 1,
            pop: pops[i] ?? null,
            symbol: symbolOf(weathers[i] ?? ''),
            short: mainWeather(weathers[i] ?? ''),
            temp: temps[i] ?? null,
          }
    )
    .filter((band) => band && band.pop !== null);
}

export function parseTenki({ forecast, hourly }, { now = new Date() } = {}) {
  const today = todayKey(now);
  const $ = cheerio.load(forecast);

  const heading = $('h2').first().clone();
  heading.children().remove();
  const name = heading.text().trim().replace(/の天気$/, '');

  const days = new Map();
  let bands = [];
  for (const selector of ['.today-weather', '.tomorrow-weather']) {
    const read = readDaySection($, $(selector).first(), today);
    if (!read) continue;
    days.set(read.day.date, read.day);
    bands = bands.concat(read.bands);
  }
  for (const day of readWeekTable($, $('table.forecast-point-week').first(), today)) {
    if (!days.has(day.date)) days.set(day.date, day);
  }

  // 1 時間ごとが取れたら、6 時間ごとの帯より細かいのでそちらを使う。
  if (hourly) {
    const $h = cheerio.load(hourly);
    const hourBands = $h('table.forecast-point-1h')
      .get()
      .flatMap((table) => readHourTable($h, table, today));
    if (hourBands.length) bands = hourBands;
  }

  return {
    reportedAt: now,
    areaName: name,
    cityName: name,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    bands: bands.sort((a, b) => `${a.date}${pad(a.hour)}`.localeCompare(`${b.date}${pad(b.hour)}`)),
    // tenki.jp の予報ページには警報・注意報が載っていない。
    warnings: [],
  };
}

export function createTenkiFeed({ name, url, intervalSec }) {
  const base = url.endsWith('/') ? url : `${url}/`;
  return new CachedFeed({
    name,
    urls: { forecast: base, hourly: `${base}1hour.html` },
    intervalSec,
    parse: (bodies) => parseTenki(bodies),
  });
}
