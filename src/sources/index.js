/**
 * 取得元の種別。
 *
 * 設定では取得元に名前を付け、`type` で種別を選ぶ。同じ種別をいくつでも定義できる
 * （子供が 2 人ならぴよログを 2 つ、カレンダーも家族用と保育園用で分ける、など）。
 */

import { createCalendarFeed } from './calendar.js';
import { createPiyologFeed } from './piyolog.js';
import { createWeatherFeed } from './weather.js';
import { asString } from '../validate.js';

/** URL だけを持つ取得元の読み取り。 */
const readUrl = (raw, path) => ({ url: asString(raw.url, `${path}.url`) });

export const SOURCE_KINDS = {
  piyolog: {
    label: 'ぴよログ',
    // ぴよログの推奨は「同じ URL へ 1 分に 1 回程度まで」。
    minIntervalSec: 60,
    defaultIntervalSec: 300,
    read: readUrl,
    create: createPiyologFeed,
    args: (source) => ({ name: source.name, url: source.url, intervalSec: source.intervalSec }),
  },
  calendar: {
    label: 'カレンダー',
    minIntervalSec: 60,
    defaultIntervalSec: 600,
    read: readUrl,
    create: createCalendarFeed,
    // 解釈にタイムゾーンを使うので、タイムゾーンが変われば取り直す。
    args: (source, config) => ({
      name: source.name,
      url: source.url,
      intervalSec: source.intervalSec,
      timezone: config.timezone,
    }),
  },
  weather: {
    label: '天気予報',
    // 気象庁の発表は 1 日 3 回（05 / 11 / 17 時）。短い間隔で取りに行く意味がない。
    minIntervalSec: 600,
    defaultIntervalSec: 1800,
    read: (raw, path) => ({
      // 府県予報区のコード。東京都なら 130000。
      area: asString(raw.area, `${path}.area`),
      // 同じ予報区の中の細かい区域。省略すれば最初の区域（多くは県の主要部）。
      subArea: asString(raw.sub_area, `${path}.sub_area`, { fallback: '' }),
      // 気温を取るアメダス地点。省略すれば最初の地点。
      tempArea: asString(raw.temp_area, `${path}.temp_area`, { fallback: '' }),
    }),
    create: createWeatherFeed,
    args: (source) => ({
      name: source.name,
      area: source.area,
      subArea: source.subArea,
      tempArea: source.tempArea,
      intervalSec: source.intervalSec,
    }),
  },
};

export const sourceKinds = Object.keys(SOURCE_KINDS).sort();
