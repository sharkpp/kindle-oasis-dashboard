/**
 * ぴよログを読む項目に共通の設定と、状態の取り出し。
 *
 * どのぴよログを見るか、どの記録を対象にするかは項目ごとに指定でき、
 * 省略したときの決まりも同じにしておく。
 */

import { asArray, asSourceNames, asString } from '../validate.js';

/** 既定はミルク（調乳）。母乳も対象にしたい場合は設定で足す。 */
export const DEFAULT_RECORD_TYPES = ['Formula'];

export function readPiyologOptions(item, path, sources) {
  return {
    // どのぴよログを見るか。省略すれば最初に定義されているもの。
    source:
      asSourceNames(item.source, `${path}.source`, { sources, type: 'piyolog' })[0] ?? null,
    recordTypes: item.record_types
      ? asArray(item.record_types, `${path}.record_types`, { min: 1 }).map((value, i) =>
          asString(value, `${path}.record_types[${i}]`)
        )
      : DEFAULT_RECORD_TYPES,
  };
}

/**
 * 項目が使うぴよログの中身。まだ取れていなければ、その理由だけを返す。
 * @returns {{data?: object, note?: string}}
 */
export function piyologData(options, ctx) {
  const feed = options.source && ctx.sources[options.source];
  if (!feed) return { note: 'ぴよログの設定がありません' };
  if (!feed.data) return { note: feed.error ? 'ぴよログを取得できません' : 'ぴよログを取得中' };
  return { data: feed.data };
}
