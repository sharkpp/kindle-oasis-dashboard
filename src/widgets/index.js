/**
 * 組み込みの項目一覧。
 *
 * 設定で選べるのはここにある種類だけ。各項目は自分の設定の検証・表示内容の組み立て・描画を持つ。
 */

import * as calendar from './calendar.js';
import * as clock from './clock.js';
import * as countdown from './countdown.js';
import * as milk from './milk.js';
import * as section from './section.js';

const WIDGETS = Object.fromEntries(
  [calendar, clock, countdown, milk, section].map((widget) => [widget.type, widget])
);

export const widgetTypes = Object.keys(WIDGETS).sort();

export function getWidget(type) {
  return WIDGETS[type] ?? null;
}
