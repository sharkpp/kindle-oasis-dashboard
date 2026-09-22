import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { Dashboard } from '../src/dashboard.js';
import { parseIcs } from '../src/sources/calendar.js';
import { parseFeed } from '../src/sources/piyolog.js';
import { renderScreen } from '../src/render.js';

const TZ = 'Asia/Tokyo';
/** 2026-09-22 (火) 14:00 JST。固定した「いま」。 */
const NOW = new Date('2026-09-22T05:00:00.000Z');

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const configPath = (name = '../config.example.yaml') => new URL(name, import.meta.url).pathname;

/** 実際の取得はせず、固定データを入れたダッシュボードを作る。 */
function dashboardWithFixtures() {
  const config = loadConfig(configPath());
  const dashboard = new Dashboard(config);
  dashboard.feeds.piyolog.data = parseFeed(fixture('piyolog.json'));
  dashboard.feeds.piyolog.nextAttemptAt = Infinity;
  dashboard.feeds.calendar.data = parseIcs(fixture('calendar.ics'), { timezone: TZ, from: NOW });
  dashboard.feeds.calendar.nextAttemptAt = Infinity;
  return dashboard;
}

/** 描画に渡す共通の引数。 */
const renderOptions = (dashboard) => ({
  view: dashboard.view,
  width: 1264,
  height: 1593,
  padding: dashboard.config.padding,
  gap: dashboard.config.gap,
});

/** 種類で項目を探す。 */
const findItem = (view, type) =>
  view.columns.flatMap((column) => column.items).find((item) => item.type === type).model;

test('config.example.yaml が読める', () => {
  const config = loadConfig(configPath());
  assert.equal(config.timezone, TZ);
  assert.equal(config.columns.length, 2);
  assert.equal(config.sources.piyolog.intervalSec, 300);
  // 数値ひとつの余白は四辺に広がる。
  assert.deepEqual(config.padding, { top: 28, right: 28, bottom: 28, left: 28 });
});

test('余白は辺ごとに指定できる', () => {
  const config = loadConfig(configPath('./fixtures/padding.yaml'));
  // 端末で切れる分を詰めるための指定。書かなかった辺は既定値のまま。
  assert.deepEqual(config.padding, { top: 24, right: 20, bottom: 60, left: 20 });
});

test('設定の誤りは項目名つきで知らせる', () => {
  assert.throws(() => loadConfig(configPath('./fixtures/broken.yaml')), /columns\[0\]\.items\[0\]\.times\[1\]/);
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
  const config = loadConfig(configPath());
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
  const png = await renderScreen({ ...renderOptions(dashboard), orientation: 'portrait' });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const meta = await sharp(png).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['png', 1264, 1593]);
  // 16 色のパレット PNG。どの色も無彩色であることを確かめる。
  const { channels } = await sharp(png).stats();
  assert.ok(channels.every((channel) => channel.mean === channels[0].mean), 'グレースケール');
});

test('横向きの指定では縦横を入れ替えて描いてから回す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const rendered = {};
  for (const orientation of ['portrait', 'landscape', 'portrait-reverse', 'landscape-reverse']) {
    rendered[orientation] = await renderScreen({ ...renderOptions(dashboard), orientation });
    const meta = await sharp(rendered[orientation]).metadata();
    // どの向きでも、出来上がる画像は端末のビューポートちょうど。
    assert.deepEqual([meta.width, meta.height], [1264, 1593], orientation);
  }
  const images = Object.values(rendered);
  for (let i = 0; i < images.length; i += 1) {
    for (let j = i + 1; j < images.length; j += 1) {
      assert.ok(!images[i].equals(images[j]), '向きごとに違う絵になる');
    }
  }
});

test('設定を読み直しても、取得元が同じならキャッシュを捨てない', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const feeds = { ...dashboard.feeds };

  const next = loadConfig(configPath());
  next.columns[0].items[0].height = 5;
  const changes = dashboard.applyConfig(next, NOW);

  assert.deepEqual(changes, ['レイアウト']);
  assert.equal(dashboard.feeds.piyolog, feeds.piyolog, '同じフィードを使い続ける');
  assert.equal(dashboard.feeds.calendar, feeds.calendar);
  assert.ok(dashboard.feeds.piyolog.data, '取り込み済みの内容が残る');
});

test('取得元が変われば、そのフィードだけ作り直す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const feeds = { ...dashboard.feeds };

  const next = loadConfig(configPath());
  next.sources.piyolog.interval_sec = undefined;
  next.sources.piyolog.url = 'https://feed.piyolog.com/v1/feed/24h/OTHER/SECRET';
  const changes = dashboard.applyConfig(next, NOW);

  assert.deepEqual(changes, ['ぴよログ: 取得元が変わったので取り直す']);
  assert.notEqual(dashboard.feeds.piyolog, feeds.piyolog);
  assert.equal(dashboard.feeds.piyolog.data, null, '新しい取得元のキャッシュは空から始まる');
  assert.equal(dashboard.feeds.calendar, feeds.calendar, '変えていない取得元は触らない');
});

test('タイムゾーンを変えるとカレンダーだけ作り直す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const feeds = { ...dashboard.feeds };

  const next = loadConfig(configPath());
  next.timezone = 'Asia/Seoul';
  const changes = dashboard.applyConfig(next, NOW);

  // 終日の予定の解釈にタイムゾーンを使うので、カレンダーは読み直す必要がある。
  assert.deepEqual(changes, ['カレンダー: 取得元が変わったので取り直す', 'タイムゾーン: Asia/Seoul']);
  assert.equal(dashboard.feeds.piyolog, feeds.piyolog);
  assert.notEqual(dashboard.feeds.calendar, feeds.calendar);
});

test('取得元を外すとフィードごと消える', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);

  const next = loadConfig(configPath());
  next.sources.piyolog = null;
  const changes = dashboard.applyConfig(next, NOW);

  assert.deepEqual(changes, ['ぴよログ: 取得元の設定を外した']);
  assert.equal(dashboard.feeds.piyolog, undefined);
  assert.equal(findItem(dashboard.view, 'milk').note, 'ぴよログの設定がありません');
});
