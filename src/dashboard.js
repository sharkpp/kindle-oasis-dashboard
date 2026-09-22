/**
 * 表示内容の組み立て。
 *
 * 一定間隔で外部フィードを更新し、設定どおりに各項目の表示内容を作る。
 * 作った内容が前回と一字一句同じなら版番号を上げない。電子ペーパーの書き換えは
 * 見た目が変わるときだけで足りる。
 *
 * 設定は動いたまま差し替えられる。差し替えでは取得元ごとに新旧を比べ、
 * 実際に変わった取得元だけを作り直す。変わっていない取得元のキャッシュは残るので、
 * レイアウトを直しただけで外部へ取りに行くことはない。
 */

import { createCalendarFeed } from './sources/calendar.js';
import { createPiyologFeed } from './sources/piyolog.js';
import { getWidget } from './widgets/index.js';

/**
 * 取得元の定義。`args` はフィードを作るための引数で、これが変われば作り直す。
 */
const SOURCES = {
  piyolog: {
    label: 'ぴよログ',
    create: createPiyologFeed,
    args: (config) => config.sources.piyolog && { ...config.sources.piyolog },
  },
  calendar: {
    label: 'カレンダー',
    create: createCalendarFeed,
    // 解釈にタイムゾーンを使うので、タイムゾーンが変われば取り直す。
    args: (config) =>
      config.sources.calendar && { ...config.sources.calendar, timezone: config.timezone },
  },
};

export class Dashboard {
  constructor(config) {
    this.config = config;
    this.feeds = {};
    this.feedKeys = {};
    this.view = null;
    this.revision = 0;
    this.signature = null;
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

  /** 取得元の設定が変わったフィードだけを作り直す。 */
  #syncFeeds(config) {
    const changes = [];
    for (const [name, source] of Object.entries(SOURCES)) {
      const args = source.args(config);
      const key = args ? JSON.stringify(args) : null;
      if (key === (this.feedKeys[name] ?? null)) continue;

      const had = Boolean(this.feeds[name]);
      if (args) {
        this.feeds[name] = source.create(args);
        this.feedKeys[name] = key;
        changes.push(`${source.label}: ${had ? '取得元が変わったので取り直す' : '取得元を設定'}`);
      } else {
        delete this.feeds[name];
        delete this.feedKeys[name];
        changes.push(`${source.label}: 取得元の設定を外した`);
      }
    }
    return changes;
  }

  /** フィードを必要に応じて取り直し、表示内容を作り直す。 */
  async tick(now = new Date()) {
    await Promise.all(Object.values(this.feeds).map((feed) => feed.refresh(now.getTime())));
    return this.#apply(now);
  }

  /** 作った内容が前回と違うときだけ差し替え、版番号を上げる。 */
  #apply(now) {
    const view = this.#build(now);
    const signature = JSON.stringify(view);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.view = view;
    this.revision += 1;
    return true;
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
  if (prev.pollSec !== next.pollSec) changes.push(`ポーリング間隔: ${next.pollSec} 秒`);
  if (prev.tickSec !== next.tickSec) changes.push(`更新間隔: ${next.tickSec} 秒`);
  return changes;
}
