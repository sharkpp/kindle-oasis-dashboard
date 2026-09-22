/**
 * 外部フィードの取得とキャッシュ。
 *
 * 取得間隔は設定で決め、その間は前回の内容をそのまま使う。
 * 失敗しても前回の内容は捨てない（ぴよログの仕様でも、エラーを「記録 0 件」と扱わないよう求められている）。
 * 連続失敗時は待ち時間を指数的に伸ばし、少しゆらぎを足して再試行が重ならないようにする。
 */

const MAX_BACKOFF_MS = 30 * 60 * 1000;

export class CachedFeed {
  /**
   * @param {object} options
   * @param {string} options.name        ログに出す名前
   * @param {string} options.url         取得先。URL 自体が認証情報なのでログには出さない
   * @param {number} options.intervalSec 取得間隔
   * @param {(body: string) => any} options.parse 応答本文を表示用のデータに変える
   */
  constructor({ name, url, intervalSec, parse }) {
    this.name = name;
    this.url = url;
    this.intervalMs = intervalSec * 1000;
    this.parse = parse;
    this.data = null;
    this.fetchedAt = 0;
    this.error = null;
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.inFlight = null;
  }

  /** 次の取得までの待ち時間。失敗が続くほど長くする。 */
  #waitMs() {
    if (this.failures === 0) return this.intervalMs;
    const backoff = Math.min(this.intervalMs * 2 ** this.failures, MAX_BACKOFF_MS);
    return backoff * (0.8 + Math.random() * 0.4);
  }

  /** 取得間隔を過ぎていれば取り直す。過ぎていなければ何もしない。 */
  async refresh(now = Date.now()) {
    if (this.inFlight) return this.inFlight;
    if (now < this.nextAttemptAt) return undefined;
    this.inFlight = this.#fetch().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async #fetch() {
    try {
      const res = await fetch(this.url, {
        headers: { Accept: 'application/json, text/calendar, */*' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await errorCode(res)}`);
      const data = this.parse(await res.text());
      this.data = data;
      this.fetchedAt = Date.now();
      this.error = null;
      this.failures = 0;
      console.log(`${this.name}: 取得しました`);
    } catch (err) {
      this.failures += 1;
      this.error = err.message;
      console.error(`${this.name}: 取得できませんでした (${this.failures} 回目) — ${err.message}`);
    }
    this.nextAttemptAt = Date.now() + this.#waitMs();
  }

  /** 表示側に渡す状態。データがまだ無いか、古すぎるかも分かるようにする。 */
  snapshot(now = Date.now()) {
    return {
      data: this.data,
      error: this.error,
      ageMs: this.data ? now - this.fetchedAt : null,
    };
  }
}

/** JSON のエラー本文から `error.code` を拾う。無ければ空文字。 */
async function errorCode(res) {
  try {
    const body = await res.json();
    return body?.error?.code ?? '';
  } catch {
    return '';
  }
}
