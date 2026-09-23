/**
 * きょうのミルクの回数と量の合計。
 *
 * ぴよログのその日の記録を数える。日の境目は表示タイムゾーンの 0 時。
 * 量が未入力の記録も回数には数え、合計からは外したことを補足に出す。
 */

import { sameDayAt } from '../time.js';
import { footer, header, inset, stack, unavailable } from './common.js';
import { piyologData, readPiyologOptions } from './piyolog.js';
import { asString } from '../validate.js';

export const type = 'milk-total';

export function normalize(item, path, sources) {
  return {
    label: asString(item.label, `${path}.label`, { fallback: '' }),
    ...readPiyologOptions(item, path, sources),
  };
}

export function build(options, ctx) {
  const { data, note } = piyologData(options, ctx);
  if (!data) return { label: options.label, state: 'unavailable', note };

  const since = sameDayAt(ctx.now, ctx.timezone, 0, 0);
  const records = data.records.filter(
    (record) => record.at >= since && options.recordTypes.includes(record.type)
  );
  // 量が未入力の記録は項目ごと省略されている。0 とは数えない。
  const measured = records.filter((record) => record.ml !== null);
  const total = measured.reduce((sum, record) => sum + record.ml, 0);
  const unmeasured = records.length - measured.length;

  return {
    label: options.label,
    state: 'ok',
    total: `${total}ml`,
    count: `${records.length}回`,
    note: unmeasured ? `量の記録がない ${unmeasured}回をのぞく` : '',
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  const foot = footer(model.note, head.rest);
  if (model.state !== 'ok') return head.svg + foot.svg + unavailable(foot.rest);
  return head.svg + foot.svg + stack(foot.rest, model.total, model.count);
}
