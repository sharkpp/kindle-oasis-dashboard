/**
 * 設定値の検証。
 *
 * 起動時に設定の誤りを、どの項目が悪いのかが分かる形で知らせる。
 * 誤った設定のまま動かすと、電子ペーパーの画面を見ても原因が分からないため。
 */

export class ConfigError extends Error {}

const fail = (path, message) => {
  throw new ConfigError(`${path}: ${message}`);
};

export function asObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'オブジェクトを指定してください');
  }
  return value;
}

export function asArray(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value)) fail(path, '配列を指定してください');
  if (value.length < min) fail(path, `${min} 個以上の要素が必要です`);
  return value;
}

export function asString(value, path, { fallback } = {}) {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    fail(path, '必須です');
  }
  if (typeof value !== 'string' || value.trim() === '') fail(path, '空でない文字列を指定してください');
  return value;
}

export function asNumber(value, path, { fallback, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    fail(path, '必須です');
  }
  const n = Number(value);
  if (!Number.isFinite(n)) fail(path, '数値を指定してください');
  if (integer && !Number.isInteger(n)) fail(path, '整数を指定してください');
  if (n < min || n > max) fail(path, `${min} 以上 ${max} 以下で指定してください`);
  return n;
}

export function asBoolean(value, path, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') fail(path, 'true か false を指定してください');
  return value;
}

/** 決まった語のどれかであること。 */
export function asEnum(value, path, allowed, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value)) fail(path, `${allowed.join(' / ')} のいずれかを指定してください`);
  return value;
}

export function reject(path, message) {
  fail(path, message);
}
