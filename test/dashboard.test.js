import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { Dashboard } from '../src/dashboard.js';
import { parseIcs } from '../src/sources/calendar.js';
import { parseFeed } from '../src/sources/piyolog.js';
import { renderScreen } from '../src/render.js';

const TZ = 'Asia/Tokyo';
/** 2026-09-22 (火) 14:00 JST。固定した「いま」。 */
const NOW = new Date('2026-09-22T05:00:00.000Z');

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** 実際の取得はせず、固定データを入れたダッシュボードを作る。 */
function dashboardWithFixtures() {
  const config = loadConfig(new URL('../config.example.yaml', import.meta.url).pathname);
  const dashboard = new Dashboard(config);
  dashboard.feeds.piyolog.data = parseFeed(fixture('piyolog.json'));
  dashboard.feeds.piyolog.nextAttemptAt = Infinity;
  dashboard.feeds.calendar.data = parseIcs(fixture('calendar.ics'), { timezone: TZ, from: NOW });
  dashboard.feeds.calendar.nextAttemptAt = Infinity;
  return dashboard;
}

/** 種類で項目を探す。 */
const findItem = (view, type) =>
  view.columns.flatMap((column) => column.items).find((item) => item.type === type).model;

test('config.example.yaml が読める', () => {
  const config = loadConfig(new URL('../config.example.yaml', import.meta.url).pathname);
  assert.equal(config.timezone, TZ);
  assert.equal(config.columns.length, 2);
  assert.equal(config.sources.piyolog.intervalSec, 300);
});

test('設定の誤りは項目名つきで知らせる', () => {
  assert.throws(
    () => loadConfig(new URL('./fixtures/broken.yaml', import.meta.url).pathname),
    /columns\[0\]\.items\[0\]\.times\[1\]/
  );
});

test('ぴよログのフィードを読む', () => {
  const data = parseFeed(fixture('piyolog.json'));
  assert.equal(data.records.length, 5);
  const formula = data.records.filter((record) => record.type === 'Formula');
  assert.equal(formula.at(-1).ml, 140);
  // 量が未入力の記録は 0 ではなく null。
  assert.equal(data.records.find((record) => record.type === 'BreastFeeding').ml, null);
});

test('カレンダーの繰り返しと差し替えを展開する', () => {
  const { events } = parseIcs(fixture('calendar.ics'), { timezone: TZ, from: NOW });
  const summaries = events.slice(0, 3).map((event) => event.summary);
  assert.deepEqual(summaries, ['こどもクリニック 予防接種', 'えんそく', 'リトミック教室 (時間変更)']);
  // 終日の予定は表示タイムゾーンの 0 時から始まる。
  assert.equal(events[1].start.toISOString(), '2026-09-22T15:00:00.000Z');
  // 中止の予定は含めない。
  assert.ok(!events.some((event) => event.summary === '中止になった予定'));
  // すでに終わった今日の繰り返しは含めない。
  assert.ok(!events.some((event) => event.start < NOW));
});

test('つぎのごはんは今より後でいちばん近い時刻', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const model = findItem(dashboard.view, 'countdown');
  assert.equal(model.time, '15:00');
  assert.equal(model.remaining, 'あと 1時間');
  assert.equal(model.note, 'おやつ');
});

test('つぎのミルクは前回の記録から指定時間後', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const model = findItem(dashboard.view, 'milk');
  assert.equal(model.state, 'ok');
  assert.equal(model.time, '15:15');
  assert.equal(model.remaining, 'あと 1時間15分');
  assert.equal(model.note, '前回 12:15 · 140ml');
});

test('つぎの予定は日付の近いものから', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const model = findItem(dashboard.view, 'calendar');
  assert.equal(model.entries.length, 5);
  assert.deepEqual(model.entries.slice(0, 3), [
    { when: '15:30', summary: 'こどもクリニック 予防接種', now: false },
    { when: 'あす 終日', summary: 'えんそく', now: false },
    { when: '9/29(火) 11:00', summary: 'リトミック教室 (時間変更)', now: false },
  ]);
});

test('ぴよログが取れていなければ項目に理由を出す', async () => {
  const config = loadConfig(new URL('../config.example.yaml', import.meta.url).pathname);
  const dashboard = new Dashboard(config);
  for (const feed of Object.values(dashboard.feeds)) {
    feed.nextAttemptAt = Infinity;
    feed.error = 'HTTP 404 feed_unavailable';
  }
  await dashboard.tick(NOW);
  assert.equal(findItem(dashboard.view, 'milk').note, 'ぴよログを取得できません');
  assert.equal(findItem(dashboard.view, 'calendar').note, 'カレンダーを取得できません');
});

test('表示内容が同じ間は版番号を上げない', async () => {
  const dashboard = dashboardWithFixtures();
  // 分の境目からずらしておく。残り時間は目標時刻から数えるので、境目ちょうどだと毎回変わる。
  const base = new Date(NOW.getTime() + 30000);
  await dashboard.tick(base);
  const first = dashboard.revision;
  await dashboard.tick(new Date(base.getTime() + 10000));
  assert.equal(dashboard.revision, first, '表示が変わらない間は画面を書き換えない');
  await dashboard.tick(new Date(base.getTime() + 61000));
  assert.equal(dashboard.revision, first + 1, '残り時間の分が変われば書き換える');
});

test('画面をグレースケール PNG に描ける', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const png = await renderScreen({
    view: dashboard.view,
    width: 1264,
    height: 1593,
    padding: 28,
    gap: 18,
  });
  assert.ok(png.length > 1000);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});
