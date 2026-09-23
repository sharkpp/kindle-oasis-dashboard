/**
 * 取得元の種別。
 *
 * 設定では取得元に名前を付け、`type` で種別を選ぶ。同じ種別をいくつでも定義できる
 * （子供が 2 人ならぴよログを 2 つ、カレンダーも家族用と保育園用で分ける、など）。
 */

import { createCalendarFeed } from './calendar.js';
import { createPiyologFeed } from './piyolog.js';
import { WEATHER_PROVIDERS, providerNames } from './weather.js';
import { asEnum, asString } from '../validate.js';

/** URL だけを持つ取得元の読み取り。 */
const readUrl = (raw, path) => ({ url: asString(raw.url, `${path}.url`) });

const DEFAULT_PROVIDER = 'jma';
/** 設定に書かれた天気予報のプロバイダ。不明なら既定のもので読み、検証で弾く。 */
const provider = (raw) => WEATHER_PROVIDERS[raw.provider] ?? WEATHER_PROVIDERS[DEFAULT_PROVIDER];

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
    // どこから取るかで、取りに行ってよい間隔も、指定する項目も変わる。
    minIntervalSec: (raw) => provider(raw).minIntervalSec,
    defaultIntervalSec: (raw) => provider(raw).defaultIntervalSec,
    read: (raw, path) => ({
      provider: asEnum(raw.provider, `${path}.provider`, providerNames, DEFAULT_PROVIDER),
      ...provider(raw).read(raw, path),
    }),
    create: (args) => WEATHER_PROVIDERS[args.provider].create(args),
    args: (source) => {
      const { type, ...rest } = source;
      return rest;
    },
  },
};

export const sourceKinds = Object.keys(SOURCE_KINDS).sort();
