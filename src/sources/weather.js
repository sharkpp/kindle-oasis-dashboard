/**
 * 気象庁の防災情報 JSON から天気予報と警報・注意報を読む。
 *
 * - 予報 https://www.jma.go.jp/bosai/forecast/data/forecast/{area}.json
 * - 警報 https://www.jma.go.jp/bosai/warning/data/warning/{area}.json
 *
 * `{area}` は府県予報区のコード（東京都なら 130000）。予報 JSON は
 * 短期（今日・明日・明後日）と週間の 2 つに分かれ、同じ日の値が両方に出てくる。
 * ここでは日付をキーにして重ね、細かい方（短期）を優先する。
 *
 * 公開されている静的ファイルで、認証も利用登録もいらない。そのぶん取りに行きすぎない
 * よう、発表は 1 日 3 回（05/11/17 時）であることを踏まえて取得間隔を長めにする。
 */

import { CachedFeed } from './feed.js';

const FORECAST_URL = (area) => `https://www.jma.go.jp/bosai/forecast/data/forecast/${area}.json`;
const WARNING_URL = (area) => `https://www.jma.go.jp/bosai/warning/data/warning/${area}.json`;

/** 天気コードの百の位が天気の大分類。記号と、文章が無いときの短い天気はこれで決まる。 */
const SYMBOLS = { 1: '☀', 2: '☁', 3: '☂', 4: '☃' };
const CATEGORIES = { 1: '晴れ', 2: 'くもり', 3: '雨', 4: '雪' };

/** 気象警報・注意報の種類コード。 */
const WARNING_NAMES = {
  '02': '暴風雪警報',
  '03': '大雨警報',
  '04': '洪水警報',
  '05': '暴風警報',
  '06': '大雪警報',
  '07': '波浪警報',
  '08': '高潮警報',
  10: '大雨注意報',
  12: '大雪注意報',
  13: '風雪注意報',
  14: '雷注意報',
  15: '強風注意報',
  16: '波浪注意報',
  17: '融雪注意報',
  18: '洪水注意報',
  19: '高潮注意報',
  20: '濃霧注意報',
  21: '乾燥注意報',
  22: 'なだれ注意報',
  23: '低温注意報',
  24: '霜注意報',
  25: '着氷注意報',
  26: '着雪注意報',
  32: '暴風雪特別警報',
  33: '大雨特別警報',
  35: '暴風特別警報',
  36: '大雪特別警報',
  37: '波浪特別警報',
  38: '高潮特別警報',
};

/** 日時の文字列から暦日だけを取り出す。気象庁の日時はすべて日本時間。 */
const dayOf = (isoString) => String(isoString).slice(0, 10);

const toNumber = (value) => {
  const n = Number(value);
  return value === '' || value === undefined || value === null || !Number.isFinite(n) ? null : n;
};

/** その日の欄を作る。無ければ用意する。 */
function dayEntry(days, date) {
  let day = days.get(date);
  if (!day) {
    day = { date, code: null, symbol: '', weather: '', short: '', pop: null, tempMin: null, tempMax: null };
    days.set(date, day);
  }
  return day;
}

/**
 * 指定したコードの区域。コードを省いたら最初の区域。
 * 週間予報は短期予報より区域のくくりが粗く、同じコードが無いこともある
 * （東京都なら伊豆諸島北部・南部が週間では「伊豆諸島」にまとまる）。
 * その場合に備えて、見つからなくてよい区域は `optional` を立てる。
 */
function pickArea(timeSeries, code, label, { optional = false } = {}) {
  if (!code) return timeSeries.areas[0];
  const area = timeSeries.areas.find((entry) => entry.area.code === code);
  if (!area && !optional) throw new Error(`${label} に区域 ${code} がありません`);
  return area ?? null;
}

/** 天気・降水確率・気温を日付ごとに重ねる。後から入れた値では上書きしない。 */
function fill(day, values) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '' && day[key] === null) day[key] = value;
  }
}

function parseForecast(json, { subArea, tempArea }) {
  const [short, weekly] = json;
  const days = new Map();

  // 短期の天気。今日・明日・明後日の 3 日分で、文章つき。
  const weather = pickArea(short.timeSeries[0], subArea, '天気');
  short.timeSeries[0].timeDefines.forEach((at, i) => {
    const day = dayEntry(days, dayOf(at));
    const code = weather.weatherCodes?.[i] ?? null;
    day.code = code;
    day.symbol = SYMBOLS[Number(String(code).charAt(0))] ?? '';
    // 気象庁の天気の文は全角空白で区切られる。先頭が主な天気。
    day.weather = (weather.weathers?.[i] ?? '').replace(/　+/g, ' ').trim();
    day.short = day.weather.split(' ')[0] ?? '';
  });

  // 短期の降水確率は 6 時間ごと。その日のいちばん高い値を代表にする。
  const pops = pickArea(short.timeSeries[1], subArea, '降水確率');
  short.timeSeries[1].timeDefines.forEach((at, i) => {
    const value = toNumber(pops.pops?.[i]);
    if (value === null) return;
    const day = dayEntry(days, dayOf(at));
    day.pop = day.pop === null ? value : Math.max(day.pop, value);
  });

  // 短期の気温は 00 時が最低、09 時が最高。片方だけの日もある。
  const temps = pickArea(short.timeSeries[2], tempArea, '気温');
  short.timeSeries[2].timeDefines.forEach((at, i) => {
    const value = toNumber(temps.temps?.[i]);
    if (value === null) return;
    const day = dayEntry(days, dayOf(at));
    day[Number(at.slice(11, 13)) < 6 ? 'tempMin' : 'tempMax'] = value;
  });

  // 週間予報で、短期に無い日を埋める。区域が見つからなければ短期の分だけで出す。
  const weeklyWeather = weekly && pickArea(weekly.timeSeries[0], subArea, '週間天気', { optional: true });
  if (weeklyWeather) {
    weekly.timeSeries[0].timeDefines.forEach((at, i) => {
      const day = dayEntry(days, dayOf(at));
      const code = weeklyWeather.weatherCodes?.[i] ?? null;
      if (day.code === null && code) {
        const category = Number(String(code).charAt(0));
        day.code = code;
        day.symbol = SYMBOLS[category] ?? '';
        // 週間予報には文章が無いので、コードの大分類を短い天気として使う。
        day.short = CATEGORIES[category] ?? '';
        day.weather = day.short;
      }
      fill(day, { pop: toNumber(weeklyWeather.pops?.[i]) });
    });

  }

  const weeklyTemps = weekly && pickArea(weekly.timeSeries[1], tempArea, '週間気温', { optional: true });
  if (weeklyTemps) {
    weekly.timeSeries[1].timeDefines.forEach((at, i) => {
      fill(dayEntry(days, dayOf(at)), {
        tempMin: toNumber(weeklyTemps.tempsMin?.[i]),
        tempMax: toNumber(weeklyTemps.tempsMax?.[i]),
      });
    });
  }

  return {
    reportedAt: new Date(short.reportDatetime),
    areaName: weather.area.name,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** 発表中の警報・注意報。解除されたものと「発表なし」は除く。 */
function parseWarning(json, { subArea }) {
  const areas = json.areaTypes?.[0]?.areas ?? [];
  const area = subArea ? areas.find((entry) => entry.code === subArea) : areas[0];
  if (!area) return [];
  return (area.warnings ?? [])
    .filter((warning) => warning.code && warning.status !== '解除')
    .map((warning) => WARNING_NAMES[warning.code] ?? `警報・注意報 ${warning.code}`);
}

export function parseWeather({ forecast, warning }, options) {
  return {
    ...parseForecast(JSON.parse(forecast), options),
    warnings: parseWarning(JSON.parse(warning), options),
  };
}

export function createWeatherFeed({ name, area, subArea, tempArea, intervalSec }) {
  return new CachedFeed({
    name,
    urls: { forecast: FORECAST_URL(area), warning: WARNING_URL(area) },
    intervalSec,
    parse: (bodies) => parseWeather(bodies, { subArea, tempArea }),
  });
}
