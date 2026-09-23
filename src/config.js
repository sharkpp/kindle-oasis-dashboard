/**
 * YAML 設定の読み込みと検証。
 *
 * 表示する項目・レイアウト・外部フィードの接続先は、すべてここで決まる。
 * 検証は起動時に一度だけ行い、以降の処理は正しい形の設定だけを扱う。
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { SOURCE_KINDS, sourceKinds } from './sources/index.js';
import { getWidget, widgetTypes } from './widgets/index.js';
import { ConfigError, asArray, asNumber, asObject, asString, reject } from './validate.js';

function checkTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    reject('timezone', `不明なタイムゾーンです: ${timezone}`);
  }
  return timezone;
}

const DEFAULT_PADDING = 24;
const EDGES = ['top', 'right', 'bottom', 'left'];

/**
 * 画面の外周の余白。数値ひとつなら四辺とも同じ、辺ごとに指定することもできる。
 *
 * 端末が返すビューポートと実際に見えている範囲がずれることがあるので、
 * その分をここで詰める。値は回転後の「読む向き」での上下左右。
 */
function readPadding(raw, path) {
  if (raw === undefined || raw === null || typeof raw === 'number') {
    const all = asNumber(raw, path, { fallback: DEFAULT_PADDING, min: 0, max: 400 });
    return Object.fromEntries(EDGES.map((edge) => [edge, all]));
  }
  const edges = asObject(raw, path);
  return Object.fromEntries(
    EDGES.map((edge) => [
      edge,
      asNumber(edges[edge], `${path}.${edge}`, { fallback: DEFAULT_PADDING, min: 0, max: 400 }),
    ])
  );
}

/**
 * 取得元。名前を付けて `type` で種別を選ぶので、同じ種別をいくつでも定義できる。
 */
function readSources(raw, path) {
  if (raw === undefined || raw === null) return {};
  const sources = asObject(raw, path);
  return Object.fromEntries(
    Object.entries(sources).map(([name, value]) => {
      const at = `${path}.${name}`;
      const source = asObject(value, at);
      const type = asString(source.type, `${at}.type`);
      const kind = SOURCE_KINDS[type];
      if (!kind) {
        reject(`${at}.type`, `不明な取得元です: ${type}（使えるのは ${sourceKinds.join(' / ')}）`);
      }
      return [
        name,
        {
          name,
          type,
          intervalSec: asNumber(source.interval_sec, `${at}.interval_sec`, {
            fallback: kind.defaultIntervalSec,
            min: kind.minIntervalSec,
            max: 86400,
          }),
          // 何を取りに行くかは種別ごとに違う。
          ...kind.read(source, at),
        },
      ];
    })
  );
}

function readItem(raw, path, sources) {
  const item = asObject(raw, path);
  const type = asString(item.type, `${path}.type`);
  const widget = getWidget(type);
  if (!widget) reject(`${path}.type`, `不明な項目です: ${type}（使えるのは ${widgetTypes.join(' / ')}）`);
  return {
    type,
    height: asNumber(item.height, `${path}.height`, { fallback: 1, min: 0.01, max: 100 }),
    options: widget.normalize(item, path, sources),
  };
}

function readColumn(raw, path, sources) {
  const column = asObject(raw, path);
  return {
    width: asNumber(column.width, `${path}.width`, { fallback: 1, min: 0.01, max: 100 }),
    items: asArray(column.items, `${path}.items`, { min: 1 }).map((item, i) =>
      readItem(item, `${path}.items[${i}]`, sources)
    ),
  };
}

export function loadConfig(path) {
  let raw;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${path} を読めませんでした — ${err.message}`);
  }
  const root = asObject(raw, '設定');

  // 項目は取得元を名前で指すので、取得元を先に読む。
  const sources = readSources(root.sources, 'sources');
  return {
    timezone: checkTimezone(asString(root.timezone, 'timezone', { fallback: 'Asia/Tokyo' })),
    pollSec: asNumber(root.poll_sec, 'poll_sec', { fallback: 10, min: 1, max: 600 }),
    tickSec: asNumber(root.tick_sec, 'tick_sec', { fallback: 20, min: 1, max: 600 }),
    padding: readPadding(root.padding, 'padding'),
    gap: asNumber(root.gap, 'gap', { fallback: 16, min: 0, max: 200 }),
    sources,
    columns: asArray(root.columns, 'columns', { min: 1 }).map((column, i) =>
      readColumn(column, `columns[${i}]`, sources)
    ),
  };
}

export { ConfigError };
