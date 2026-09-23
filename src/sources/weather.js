/**
 * 天気予報の取得元。どこから取るかは `provider` で選ぶ。
 *
 * どのプロバイダも同じ形にして返す。項目はどちらから来たかを知らない。
 *
 * ```
 * {
 *   reportedAt: Date,      // 発表時刻
 *   areaName: string,      // 予報の区域名
 *   cityName: string,      // 設定で指した地点の名前
 *   days: [{ date, code, symbol, weather, short, pop, tempMin, tempMax }],
 *   bands: [{ date, hour, hours, pop, symbol, short, temp }],  // 時間帯ごと
 *   warnings: string[],    // 発表中の警報・注意報
 * }
 * ```
 *
 * `days[].date` と `bands[].date` は `YYYY-MM-DD`。日本の天気予報なので日本時間で数える。
 * プロバイダによって埋まらない欄がある（気象庁は時間帯ごとの天気を出していない、
 * tenki.jp は警報・注意報を出していない）。埋まらない欄は null か空にする。
 */

import { createJmaFeed } from './weather-jma.js';
import { createTenkiFeed } from './weather-tenki.js';
import { asString } from '../validate.js';

export const WEATHER_PROVIDERS = {
  jma: {
    label: '気象庁',
    // 気象庁の発表は 1 日 3 回（05 / 11 / 17 時）。短い間隔で取りに行く意味がない。
    defaultIntervalSec: 1800,
    minIntervalSec: 600,
    // 市町村コード（千代田区なら 1310100）。予報区と気温の地点はここから求める。
    read: (raw, path) => ({ city: asString(raw.city, `${path}.city`) }),
    create: createJmaFeed,
  },
  tenki: {
    label: 'tenki.jp',
    // ページを読みに行くので、気象庁より控えめにする。
    defaultIntervalSec: 3600,
    minIntervalSec: 1800,
    // 地点のページの URL。tenki.jp で地点を開いたときのアドレスをそのまま書く。
    read: (raw, path) => ({ url: asString(raw.url, `${path}.url`) }),
    create: createTenkiFeed,
  },
};

export const providerNames = Object.keys(WEATHER_PROVIDERS);
