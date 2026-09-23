/**
 * 組み込みの項目一覧。
 *
 * 設定で選べるのはここにある種類だけ。項目どうしは互いを知らず、それぞれが
 * 次の 4 つを持つ。設定項目とサンプルは docs/widgets.md にまとめてある。
 *
 * - `type`      設定の `type` に書く名前
 * - `normalize(item, path, sources)`
 *     設定を検証して、表示に必要な形（options）に直す。`path` は設定中の位置で、
 *     エラーに添えて「どの項目のどの設定が悪いか」を示す。`sources` は定義済みの
 *     取得元（名前 → `{ type, ... }`）で、項目が指す取得元の名前と種別を確かめる。
 *     誤りがあれば validate.js の関数が ConfigError を投げ、起動前に止まる。
 * - `build(options, ctx)`
 *     表示内容（model）を組み立てる。`ctx` は `{ now, timezone, sources }` で、
 *     `ctx.sources` は名前 → `{ data, error, ageMs }`。
 *     model は JSON にできる素のデータだけにする。画面全体の model が前回と一字一句
 *     同じなら版番号を上げず、電子ペーパーを書き換えない。だから時刻は必要な粒度まで
 *     落としておく（秒まで入れると毎秒書き換わる）。
 * - `render(model, box)`
 *     model を SVG の文字列にする。`box` は割り当てられた領域 `{ x, y, w, h }`（px）。
 */

import * as calendar from './calendar.js';
import * as clock from './clock.js';
import * as countdown from './countdown.js';
import * as milk from './milk.js';
import * as milkTotal from './milk-total.js';
import * as section from './section.js';
import * as weather from './weather.js';
import * as weatherTimeline from './weather-timeline.js';
import * as weatherToday from './weather-today.js';

const WIDGETS = Object.fromEntries(
  [calendar, clock, countdown, milk, milkTotal, section, weather, weatherTimeline, weatherToday].map(
    (widget) => [widget.type, widget]
  )
);

export const widgetTypes = Object.keys(WIDGETS).sort();

export function getWidget(type) {
  return WIDGETS[type] ?? null;
}
