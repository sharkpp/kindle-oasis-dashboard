/**
 * 表示内容の組み立て。
 *
 * 一定間隔で外部フィードを更新し、設定どおりに各項目の表示内容を作る。
 *
 * フィードは取得元の名前で持つ。同じ種別の取得元がいくつあっても、それぞれ別の
 * キャッシュになる。
 *
 * 設定は動いたまま差し替えられる。差し替えでは取得元ごとに新旧を比べ、
 * 実際に変わった取得元だけを作り直す。変わっていない取得元のキャッシュは残るので、
 * レイアウトを直しただけで外部へ取りに行くことはない。
 */

import { SOURCE_KINDS } from './sources/index.js';
import { getWidget } from './widgets/index.js';

export class Dashboard {
  constructor(config) {
    this.config = config;
    this.feeds = {};
    this.feedKeys = {};
    this.view = null;
    this.#syncFeeds(config);
    // フィードの取得を待たずに描ける状態にしておく。取得中であることは各項目が出す。
    this.#apply(new Date());
  }

  /**
   * 設定を差し替える。変わった点の一覧を返す。
   * 設定の検証は呼ぶ側で済ませておくこと。
   */
  applyConfig(next, now = new Date()) {
    const changes = [...this.#syncFeeds(next), ...describeChanges(this.config, next)];
    this.config = next;
    this.#apply(now);
    return changes;
  }

  /** 設定の変わった取得元だけを作り直す。 */
  #syncFeeds(config) {
    const changes = [];
    const names = new Set([...Object.keys(this.feeds), ...Object.keys(config.sources)]);

    for (const name of names) {
      const source = config.sources[name];
      const kind = source && SOURCE_KINDS[source.type];
      const key = kind ? JSON.stringify(kind.args(source, config)) : null;
      if (key === (this.feedKeys[name] ?? null)) continue;

      const had = Boolean(this.feeds[name]);
      if (kind) {
        this.feeds[name] = kind.create(kind.args(source, config));
        this.feedKeys[name] = key;
        changes.push(`${name}: ${had ? '取得元が変わったので取り直す' : `取得元を設定 (${kind.label})`}`);
      } else {
        delete this.feeds[name];
        delete this.feedKeys[name];
        changes.push(`${name}: 取得元の設定を外した`);
      }
    }
    return changes;
  }

  /** フィードを必要に応じて取り直し、表示内容を作り直す。 */
  async tick(now = new Date()) {
    await Promise.all(Object.values(this.feeds).map((feed) => feed.refresh(now.getTime())));
    this.#apply(now);
  }

  #apply(now) {
    this.view = this.#build(now);
  }

  #build(now) {
    const sources = Object.fromEntries(
      Object.entries(this.feeds).map(([name, feed]) => [name, feed.snapshot(now.getTime())])
    );
    const ctx = { now, timezone: this.config.timezone, sources };
    return {
      columns: this.config.columns.map((column) => ({
        width: column.width,
        items: column.items.map((item) => ({
          type: item.type,
          height: item.height,
          model: getWidget(item.type).build(item.options, ctx),
        })),
      })),
    };
  }
}

/** 取得元以外で、新旧の設定が変わった点を日本語で並べる。 */
function describeChanges(prev, next) {
  const changes = [];
  if (prev.timezone !== next.timezone) changes.push(`タイムゾーン: ${next.timezone}`);
  if (JSON.stringify(prev.columns) !== JSON.stringify(next.columns)) changes.push('レイアウト');
  if (JSON.stringify(prev.padding) !== JSON.stringify(next.padding)) changes.push('余白');
  if (prev.gap !== next.gap) changes.push('すき間');
  if (prev.refreshSec !== next.refreshSec) changes.push(`再読み込みの間隔: ${next.refreshSec} 秒`);
  if (prev.tickSec !== next.tickSec) changes.push(`更新間隔: ${next.tickSec} 秒`);
  return changes;
}
