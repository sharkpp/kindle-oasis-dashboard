import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { Dashboard } from '../src/dashboard.js';
import { parseIcs } from '../src/sources/calendar.js';
import { parseFeed } from '../src/sources/piyolog.js';
import { renderScreen } from '../src/render.js';
import { parseWeather } from '../src/sources/weather.js';
import * as calendarWidget from '../src/widgets/calendar.js';
import * as countdownWidget from '../src/widgets/countdown.js';
import * as weatherTodayWidget from '../src/widgets/weather-today.js';

const TZ = 'Asia/Tokyo';
/** 2026-09-22 (火) 14:00 JST。固定した「いま」。 */
const NOW = new Date('2026-09-22T05:00:00.000Z');

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const configPath = (name = '../config.example.yaml') => new URL(name, import.meta.url).pathname;

const FEED_FIXTURES = {
  ぴよログ: () => parseFeed(fixture('piyolog.json')),
  かぞく: () => parseIcs(fixture('calendar.ics'), { timezone: TZ, from: NOW }),
  ほいくえん: () => parseIcs(fixture('calendar2.ics'), { timezone: TZ, from: NOW }),
  てんき: () => weatherFixture(),
};

/** 気象庁の予報と警報のフィクスチャを読む。 */
const weatherFixture = (options = {}) =>
  parseWeather(
    { forecast: fixture('weather-forecast.json'), warning: fixture('weather-warning.json') },
    options
  );

/** 実際の取得はせず、固定データを入れたダッシュボードを作る。 */
function dashboardWithFixtures(config = loadConfig(configPath())) {
  const dashboard = new Dashboard(config);
  for (const [name, feed] of Object.entries(dashboard.feeds)) {
    feed.data = FEED_FIXTURES[name]();
    feed.nextAttemptAt = Infinity;
  }
  return dashboard;
}

/** 項目の検証に渡す、定義済みの取得元。 */
const DEFINED_SOURCES = {
  ぴよログ: { type: 'piyolog' },
  かぞく: { type: 'calendar' },
  ほいくえん: { type: 'calendar' },
};

/** カレンダー項目に渡す、取得済みの状態。 */
const calendarContext = () => ({
  now: NOW,
  timezone: TZ,
  sources: {
    かぞく: { data: FEED_FIXTURES['かぞく'](), error: null, ageMs: 0 },
    ほいくえん: { data: FEED_FIXTURES['ほいくえん'](), error: null, ageMs: 0 },
  },
});

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
  assert.deepEqual(Object.keys(config.sources), ['ぴよログ', 'かぞく', 'ほいくえん', 'てんき']);
  assert.equal(config.sources['ぴよログ'].intervalSec, 300);
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
  assert.equal(data.records.length, 6);
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

test('同じ種別の取得元をいくつでも持てる', () => {
  const dashboard = dashboardWithFixtures();
  assert.deepEqual(Object.keys(dashboard.feeds), ['ぴよログ', 'かぞく', 'ほいくえん', 'てんき']);
  // 同じ種別でも、取得元ごとに別のキャッシュになる。
  assert.notEqual(dashboard.feeds['かぞく'], dashboard.feeds['ほいくえん']);
  assert.notEqual(dashboard.feeds['かぞく'].data, dashboard.feeds['ほいくえん'].data);
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

test('きょうのミルクは回数と量の合計を出す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  // 09:30 に 120ml、12:15 に 140ml。前日 22:00 の 150ml は数えない。
  assert.deepEqual(findItem(dashboard.view, 'milk-total'), {
    label: 'きょうのごうけい',
    state: 'ok',
    total: '260ml',
    count: '2回',
    note: '',
  });
});

test('量の記録がない回も数え、合計から外したことを出す', async () => {
  const config = loadConfig(configPath());
  const item = config.columns[0].items.find((entry) => entry.type === 'milk-total');
  item.options.recordTypes = ['Formula', 'BreastFeeding'];
  const dashboard = dashboardWithFixtures(config);
  await dashboard.tick(NOW);
  // 10:40 の母乳は量が未入力。回数には入るが合計には入らない。
  const model = findItem(dashboard.view, 'milk-total');
  assert.equal(model.count, '3回');
  assert.equal(model.total, '260ml');
  assert.equal(model.note, '量の記録がない 1回をのぞく');
});

test('日をまたぐと、きょうのミルクは数え直される', async () => {
  const dashboard = dashboardWithFixtures();
  // 9/23 の 00:30 JST。9/22 の記録はすべて前日になる。
  await dashboard.tick(new Date('2026-09-22T15:30:00.000Z'));
  const model = findItem(dashboard.view, 'milk-total');
  assert.equal(model.count, '0回');
  assert.equal(model.total, '0ml');
});

test('気象庁の予報を日付ごとにまとめる', () => {
  const data = weatherFixture();
  assert.equal(data.areaName, '東京地方');

  // 短期の 3 日分。降水確率は 6 時間ごとの値のうち、その日のいちばん高いもの。
  assert.deepEqual(data.days.slice(0, 3), [
    { date: '2026-09-22', code: '101', symbol: '☀', weather: '晴れ 時々 くもり', short: '晴れ', pop: 20, tempMin: 19, tempMax: 28 },
    { date: '2026-09-23', code: '201', symbol: '☁', weather: 'くもり 時々 晴れ', short: 'くもり', pop: 40, tempMin: 21, tempMax: 26 },
    // 明後日の天気は短期から、降水確率と気温は週間から。
    { date: '2026-09-24', code: '300', symbol: '☂', weather: '雨', short: '雨', pop: 60, tempMin: 18, tempMax: 22 },
  ]);

  // 週間だけの日は、文章が無いのでコードの大分類を短い天気に使う。
  const snowy = data.days.find((day) => day.date === '2026-09-29');
  assert.deepEqual([snowy.code, snowy.symbol, snowy.short], ['400', '☃', '雪']);
});

test('発表中の警報・注意報だけを出す', () => {
  // 解除されたもの（乾燥注意報）と「発表なし」は含めない。
  assert.deepEqual(weatherFixture().warnings, ['雷注意報', '大雨注意報']);
  assert.deepEqual(weatherFixture({ subArea: '130020' }).warnings, []);
});

test('週間予報に区域が無くても、短期の分だけで出す', () => {
  // 伊豆諸島北部は週間予報の区分に無い。明後日の降水確率と気温は埋まらない。
  const data = weatherFixture({ subArea: '130020', tempArea: '44172' });
  assert.equal(data.areaName, '伊豆諸島北部');
  assert.deepEqual(data.days[2], {
    date: '2026-09-24',
    code: '200',
    symbol: '☁',
    weather: 'くもり',
    short: 'くもり',
    pop: null,
    tempMin: null,
    tempMax: null,
  });
});

test('今日・明日・明後日の天気を並べる', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  assert.deepEqual(findItem(dashboard.view, 'weather').columns, [
    { day: 'きょう', symbol: '☀', weather: '晴れ', pop: '20%', temp: '19/28' },
    { day: 'あす', symbol: '☁', weather: 'くもり', pop: '40%', temp: '21/26' },
    { day: 'あさって', symbol: '☂', weather: '雨', pop: '60%', temp: '18/22' },
  ]);
});

test('当日の天気を書式に沿って出す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  assert.deepEqual(findItem(dashboard.view, 'weather-today').lines, [
    { text: '☀ 晴れ', scale: 3 },
    { text: '降水 20%  19〜28℃', scale: 1.4 },
    { text: '雷注意報 大雨注意報', scale: 1.2 },
  ]);
});

test('値が空になった行は出さない', () => {
  const options = weatherTodayWidget.normalize(
    { type: 'weather-today', lines: ['{area} {weather}', '{warning}'] },
    'columns[0].items[0]',
    { てんき: { type: 'weather' } }
  );
  // 警報・注意報が出ていない区域では、その行ごと消える。
  const ctx = {
    now: NOW,
    timezone: TZ,
    sources: { てんき: { data: weatherFixture({ subArea: '130020' }), error: null, ageMs: 0 } },
  };
  assert.deepEqual(weatherTodayWidget.build(options, ctx).lines, [
    { text: '伊豆諸島北部 雨', scale: 1 },
  ]);
});

test('書式に知らない値を書けば起動前に分かる', () => {
  assert.throws(
    () =>
      weatherTodayWidget.normalize(
        { type: 'weather-today', lines: ['{humidity}%'] },
        'columns[0].items[0]',
        { てんき: { type: 'weather' } }
      ),
    /使えない値です: \{humidity\}/
  );
});

test('つぎの予定は、複数のカレンダーをまとめて日付の近いものから', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const model = findItem(dashboard.view, 'calendar');
  // 「かぞく」と「ほいくえん」が混ざって時刻順に並ぶ。
  // 同じ日の予定はまとめて同じ段階になる。段階は直近の日から 0, 1, 2 …。
  assert.deepEqual(model.entries, [
    { when: '15:30', summary: 'こどもクリニック 予防接種', now: false, level: 0 },
    { when: '16:30', summary: 'おむかえ', now: false, level: 0 },
    { when: 'あす 終日', summary: 'えんそく', now: false, level: 1 },
    { when: '9/25(金) 09:30', summary: 'けんしん', now: false, level: 2 },
    { when: '9/29(火) 11:00', summary: 'リトミック教室 (時間変更)', now: false, level: 3 },
  ]);
});

test('カレンダーはワイルドカードで件名を絞り込める', () => {
  const options = calendarWidget.normalize(
    { type: 'calendar', count: 10, sources: ['かぞく', 'ほいくえん'], match: '*けんしん*' },
    'columns[0].items[0]',
    DEFINED_SOURCES
  );
  const model = calendarWidget.build(options, calendarContext());
  assert.deepEqual(
    model.entries.map((entry) => entry.summary),
    ['けんしん']
  );
});

test('カレンダーは正規表現でも件名を絞り込める', () => {
  const options = calendarWidget.normalize(
    { type: 'calendar', count: 10, sources: ['かぞく', 'ほいくえん'], match: '/^リトミック/' },
    'columns[0].items[0]',
    DEFINED_SOURCES
  );
  const model = calendarWidget.build(options, calendarContext());
  assert.deepEqual(
    model.entries.map((entry) => entry.summary),
    ['リトミック教室 (時間変更)', 'リトミック教室', 'リトミック教室', 'リトミック教室']
  );
});

/** 段階を振った行。`level` は直近の日から 0, 1, 2 …。 */
const leveledEntries = (levels) =>
  levels.map((level, i) => ({ when: `9/2${i}(金) 09:30`, summary: 'よてい', now: false, level }));

test('カレンダーの文字の大きさを段階ごとに指定できる', () => {
  const entries = leveledEntries([0, 0, 1, 2]);
  const area = { x: 0, y: 0, w: 1200, h: 800 };

  // 省略すれば、行の高さと時刻の欄の幅から自動で決まる。すべて同じ高さ。
  const auto = calendarWidget.rowMetrics(entries, area);
  assert.deepEqual(
    auto.rows.map((row) => row.y),
    [100, 300, 500, 700]
  );
  assert.ok(auto.rows.every((row) => row.size === auto.rows[0].size));

  // 段階がひとつなら全行に効く。行は等分のまま、文字だけ小さくなる。
  const uniform = calendarWidget.rowMetrics(entries, area, {
    levels: [{ fontSize: 20, fontScale: null }],
  });
  assert.deepEqual(
    uniform.rows.map((row) => row.size),
    [20, 20, 20, 20]
  );
  assert.deepEqual(
    uniform.rows.map((row) => row.y),
    [100, 300, 500, 700]
  );

  // 最初 / その次 / その他 の 3 段階。同じ日の 2 件はまとめて最初の段階になる。
  const { rows } = calendarWidget.rowMetrics(entries, area, {
    levels: [
      { fontSize: 40, fontScale: null },
      { fontSize: 30, fontScale: null },
      { fontSize: 20, fontScale: null },
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.size),
    [40, 40, 30, 20]
  );
  // 40:40:30:20 → 800px を 246:246:185:123 で分ける。
  assert.deepEqual(
    rows.map((row) => Math.round(row.y)),
    [123, 369, 585, 738]
  );
});

test('段階が尽きた分は最後の段階を使う', () => {
  const { rows } = calendarWidget.rowMetrics(
    leveledEntries([0, 1, 2, 3]),
    { x: 0, y: 0, w: 1200, h: 800 },
    { levels: [{ fontSize: 40, fontScale: null }, { fontSize: 20, fontScale: null }] }
  );
  assert.deepEqual(
    rows.map((row) => row.size),
    [40, 20, 20, 20]
  );
});

test('文字の大きさを項目の高さの割合で指定できる', () => {
  const entries = leveledEntries([0, 1]);
  const area = { x: 0, y: 0, w: 2000, h: 800 };
  const levels = [
    { fontSize: null, fontScale: 0.1 },
    { fontSize: null, fontScale: 0.05 },
  ];

  // 項目の高さ 1000px なら 100px と 50px。
  const tall = calendarWidget.rowMetrics(entries, area, { levels, itemHeight: 1000 });
  assert.deepEqual(
    tall.rows.map((row) => row.size),
    [100, 50]
  );

  // 端末が小さくなれば、同じ設定でも同じ比で小さくなる。
  const half = calendarWidget.rowMetrics(entries, { ...area, h: 400 }, { levels, itemHeight: 500 });
  assert.deepEqual(
    half.rows.map((row) => row.size),
    [50, 25]
  );
});

test('大きすぎる指定は枠に収まるところまで縮める', () => {
  const entries = leveledEntries([0, 0, 0, 0]).map((entry) => ({ ...entry, when: '15:30' }));
  const levels = [{ fontSize: 200, fontScale: null }];

  // 1 行 50px に 200px の文字は入らない。行の高さに収まるところまで下げる。
  const tall = calendarWidget.rowMetrics(entries, { x: 0, y: 0, w: 1200, h: 200 }, { levels });
  assert.ok(tall.rows.every((row) => row.size < 50), '行からあふれない');
  assert.ok(tall.rows.every((row) => row.size === tall.rows[0].size), '一律で縮める');

  // 時刻の欄が幅の 60% を超えるほど大きくもしない。件名の場所が無くなるため。
  const wide = calendarWidget.rowMetrics(entries, { x: 0, y: 0, w: 400, h: 2000 }, { levels });
  assert.ok(Math.max(...wide.rows.map((row) => row.gutter)) <= 240, '件名を出す幅が残る');
});

test('取得元の指定が間違っていれば起動前に分かる', () => {
  const at = 'columns[0].items[0]';
  assert.throws(
    () => calendarWidget.normalize({ type: 'calendar', sources: ['よその'] }, at, DEFINED_SOURCES),
    /そのような取得元はありません: よその/
  );
  assert.throws(
    () => calendarWidget.normalize({ type: 'calendar', sources: ['ぴよログ'] }, at, DEFINED_SOURCES),
    /calendar の取得元を指定してください/
  );
});

test('countdown は曜日で絞り込める', () => {
  const ctx = { now: NOW, timezone: TZ, sources: {} };
  const at = 'columns[0].items[0]';

  // 2026-09-22 (火) 14:00 から見て、次の水曜は翌日。
  const weekdays = countdownWidget.normalize(
    { type: 'countdown', days: ['mon', 'wed', 'fri'], times: ['09:00'] },
    at
  );
  assert.deepEqual(countdownWidget.build(weekdays, ctx), {
    label: '',
    time: '09:00',
    remaining: 'あと 19時間',
    note: 'あす',
  });

  // 週をまたぐときは日付を添える。
  const saturday = countdownWidget.normalize({ type: 'countdown', days: ['sat'], times: ['07:00'] }, at);
  assert.equal(countdownWidget.build(saturday, ctx).note, '9/26(土)');

  // 時刻ごとの days は項目の days より優先される。
  const override = countdownWidget.normalize(
    { type: 'countdown', days: ['sat'], times: [{ at: '09:00', name: 'ほいくえん', days: ['wed'] }] },
    at
  );
  assert.equal(countdownWidget.build(override, ctx).note, 'あす · ほいくえん');
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
  assert.equal(dashboard.feeds['ぴよログ'], feeds['ぴよログ'], '同じフィードを使い続ける');
  assert.equal(dashboard.feeds['かぞく'], feeds['かぞく']);
  assert.ok(dashboard.feeds['ぴよログ'].data, '取り込み済みの内容が残る');
});

test('取得元が変われば、そのフィードだけ作り直す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const feeds = { ...dashboard.feeds };

  const next = loadConfig(configPath());
  next.sources['ぴよログ'].url = 'https://feed.piyolog.com/v1/feed/24h/OTHER/SECRET';
  const changes = dashboard.applyConfig(next, NOW);

  assert.deepEqual(changes, ['ぴよログ: 取得元が変わったので取り直す']);
  assert.notEqual(dashboard.feeds['ぴよログ'], feeds['ぴよログ']);
  assert.equal(dashboard.feeds['ぴよログ'].data, null, '新しい取得元のキャッシュは空から始まる');
  assert.equal(dashboard.feeds['かぞく'], feeds['かぞく'], '変えていない取得元は触らない');
});

test('タイムゾーンを変えるとカレンダーだけ作り直す', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);
  const feeds = { ...dashboard.feeds };

  const next = loadConfig(configPath());
  next.timezone = 'Asia/Seoul';
  const changes = dashboard.applyConfig(next, NOW);

  // 終日の予定の解釈にタイムゾーンを使うので、カレンダーは読み直す必要がある。
  assert.deepEqual(changes, [
    'かぞく: 取得元が変わったので取り直す',
    'ほいくえん: 取得元が変わったので取り直す',
    'タイムゾーン: Asia/Seoul',
  ]);
  assert.equal(dashboard.feeds['ぴよログ'], feeds['ぴよログ']);
  assert.notEqual(dashboard.feeds['かぞく'], feeds['かぞく']);
});

test('取得元を外すとフィードごと消える', async () => {
  const dashboard = dashboardWithFixtures();
  await dashboard.tick(NOW);

  const next = loadConfig(configPath());
  delete next.sources['ぴよログ'];
  const changes = dashboard.applyConfig(next, NOW);

  // 設定を読み直したのではなく直接外したので、項目が指す名前はそのまま残る。
  assert.deepEqual(changes, ['ぴよログ: 取得元の設定を外した']);
  assert.equal(dashboard.feeds['ぴよログ'], undefined);
  assert.equal(findItem(dashboard.view, 'milk').note, 'ぴよログの設定がありません');
});
