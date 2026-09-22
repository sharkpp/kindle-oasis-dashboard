/**
 * 表示内容の組み立て。
 *
 * 一定間隔で外部フィードを更新し、設定どおりに各項目の表示内容を作る。
 * 作った内容が前回と一字一句同じなら版番号を上げない。電子ペーパーの書き換えは
 * 見た目が変わるときだけで足りる。
 */

import { createCalendarFeed } from './sources/calendar.js';
import { createPiyologFeed } from './sources/piyolog.js';
import { getWidget } from './widgets/index.js';

export class Dashboard {
  constructor(config) {
    this.config = config;
    this.feeds = {};
    if (config.sources.piyolog) {
      this.feeds.piyolog = createPiyologFeed(config.sources.piyolog);
    }
    if (config.sources.calendar) {
      this.feeds.calendar = createCalendarFeed({
        ...config.sources.calendar,
        timezone: config.timezone,
      });
    }
    this.view = null;
    this.revision = 0;
    this.signature = null;
    // フィードの取得を待たずに描ける状態にしておく。取得中であることは各項目が出す。
    this.#apply(new Date());
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
