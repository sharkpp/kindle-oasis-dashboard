/**
 * ぴよログ データフィード（schema v1）の取得。
 * 仕様: https://www.piyolog.com/app/piyolog/data_feed/ja/
 *
 * 取得結果はその時点のスナップショットで、差分ではない。毎回すべて読み直す。
 * キャッシュ保持時間は取得期間ごとに 1〜15 分あり、同じ URL への取得は 1 分に 1 回までが目安。
 */

import { CachedFeed } from './feed.js';

/** 量を持つ記録の種類。ミルク量の表示に使う。 */
const VOLUME_TYPES = new Set(['BreastFeeding', 'Formula', 'ExpressedBreastMilk', 'Pumping', 'Drink']);

/** 応答をそのまま信じず、必要な形をしているかだけ確かめる。 */
export function parseFeed(body) {
  const json = JSON.parse(body);
  if (json.schema_version !== 1) {
    throw new Error(`未対応の schema_version: ${json.schema_version}`);
  }
  if (!Array.isArray(json.records)) throw new Error('records が配列ではありません');

  const records = json.records
    .filter((record) => typeof record?.datetime === 'string' && typeof record?.type === 'string')
    .map((record) => ({
      id: record.event_id,
      type: record.type,
      at: new Date(record.datetime),
      // 未入力の数値は項目ごと省略される。0 と解釈しない。
      ml: VOLUME_TYPES.has(record.type) && record.value?.unit === 'ml' ? record.value.value : null,
      memo: typeof record.memo === 'string' ? record.memo : null,
    }))
    .filter((record) => Number.isFinite(record.at.getTime()))
    .sort((a, b) => a.at - b.at);

  return { generatedAt: new Date(json.generated_at), records };
}

export function createPiyologFeed({ url, intervalSec }) {
  return new CachedFeed({ name: 'ぴよログ', url, intervalSec, parse: parseFeed });
}

/** 指定した種類のうち、いちばん新しい記録。無ければ null。 */
export function latestRecord(data, types) {
  if (!data) return null;
  for (let i = data.records.length - 1; i >= 0; i -= 1) {
    if (types.includes(data.records[i].type)) return data.records[i];
  }
  return null;
}
