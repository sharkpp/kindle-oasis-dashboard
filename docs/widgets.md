# 項目（widgets）の仕様

画面に置ける項目の一覧と、それぞれの設定。項目は組み込みで、設定で選んで並べる。
画面全体の設定・レイアウト・取得元（`sources`）の書き方は [README](../README.md#設定) を見る。

- [共通の設定](#共通の設定)
- [取得元の指し方](#取得元の指し方)
- 項目
  - [`countdown` — 指定の時間までの残り時間](#countdown--指定の時間までの残り時間)
  - [`milk` — 次のミルクの時間](#milk--次のミルクの時間)
  - [`milk-total` — きょうのミルクの回数と量](#milk-total--きょうのミルクの回数と量)
  - [`calendar` — 次の予定](#calendar--次の予定)
  - [`weather` — 今日・明日・明後日の天気](#weather--今日明日明後日の天気)
  - [`weather-timeline` — 時間帯ごとの天気と降水確率](#weather-timeline--時間帯ごとの天気と降水確率)
  - [`weather-today` — 当日の天気を書式で](#weather-today--当日の天気を書式で)
  - [`clock` — 時間の表示](#clock--時間の表示)
  - [`section` — セクションタイトル](#section--セクションタイトル)
- [新しい項目を足す](#新しい項目を足す)

## 共通の設定

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `type` | （必須） | 項目の種類 |
| `height` | `1` | カラムの中での高さの比率。端末の画素数に合わせて引き伸ばされる |
| `label` | なし | 項目の上に出る小さな見出し（`section` を除く） |

多くの項目は「見出し（小）＋主役の値（大）＋補足（中）」の形で描く。
電子ペーパーは階調が粗いので、色ではなく大きさで情報の主従を付けている。

## 取得元の指し方

外部データを使う項目は、`sources` に定義した取得元を名前で指す。
省略すると、その種別で最初に定義された取得元を使う。

| 項目 | 指す種別 | 設定 |
| --- | --- | --- |
| `milk` / `milk-total` | `piyolog` | `source: ぴよログ` |
| `calendar` | `calendar` | `sources: [かぞく, ほいくえん]`（複数可） |
| `weather` / `weather-timeline` / `weather-today` | `weather` | `source: てんき` |

名前の間違いと種別の食い違いは設定の読み込み時に弾くので、起動前に分かる。
取得元がまだ取れていないときは、その理由が項目の中に出る。

---

## `countdown` — 指定の時間までの残り時間

繰り返す時刻のうち、今より後でいちばん近いものを選び、その時刻と残り時間を出す。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `times` | （必須） | 時刻の一覧。`"18:00"` か `{ at, name, days }` |
| `times[].at` | （必須） | `HH:MM` |
| `times[].name` | なし | 補足に出す名前（`おやつ`） |
| `times[].days` | 項目の `days` | その時刻だけの曜日 |
| `days` | 毎日 | 項目全体の曜日の既定。`sun` `mon` `tue` `wed` `thu` `fri` `sat` |

```yaml
- type: countdown
  height: 3
  label: つぎのごはん
  days: [mon, tue, wed, thu, fri]
  times:
    - { at: "07:30", name: あさごはん }
    - { at: "12:00", name: おひるごはん }
    - { at: "10:00", name: ほいくえん, days: [tue, thu] }
    - "18:00"
```

曜日で絞ると次の時刻が最大で 1 週間先になる。日をまたぐときは「あす」、
週をまたぐときは日付（`9/26(土)`）を補足に添える。

## `milk` — 次のミルクの時間

ぴよログの直近の記録から、指定時間後を目標にする。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `interval_min` | （必須） | 前回の記録から何分後を目標にするか（1〜1440） |
| `source` | 最初の `piyolog` | どのぴよログを見るか |
| `record_types` | `[Formula]` | 対象にするぴよログの記録種別 |

```yaml
- type: milk
  height: 3
  label: つぎのミルク
  source: ぴよログ
  interval_min: 180
  record_types: [Formula, BreastFeeding]
```

`record_types` は `Formula`（ミルク）、`BreastFeeding`（母乳）、
`ExpressedBreastMilk`（搾母乳）など、ぴよログの記録種別をそのまま書く。
目標を過ぎていれば、残り時間ではなく過ぎた時間を出す。
補足には前回の時刻と量が出る。

## `milk-total` — きょうのミルクの回数と量

その日のミルクの回数と量の合計を出す。日の境目は `timezone` の 0 時。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `source` | 最初の `piyolog` | どのぴよログを見るか |
| `record_types` | `[Formula]` | 対象にするぴよログの記録種別 |

```yaml
- type: milk-total
  height: 2
  label: きょうのごうけい
  source: ぴよログ
  record_types: [Formula]
```

量が未入力の記録も回数には数え、合計からは外す。外した件数は補足に出る
（ぴよログは未入力の数値を項目ごと省略するので、0 とは数えない）。

## `calendar` — 次の予定

進行中の予定も残したうえで、この先の予定を日付順に並べる。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `count` | `3` | 出す件数（1〜10） |
| `sources` | 最初の `calendar` | どのカレンダーを見るか。複数指定するとまとめて並べる |
| `match` | なし | 件名の絞り込み |
| `levels` | 自動 | 文字の大きさを直近から順に当てる |

```yaml
- type: calendar
  height: 6
  label: つぎのよてい
  count: 5
  sources: [かぞく, ほいくえん]
  match: "*クリニック*"
  levels:
    - font_scale: 0.065
    - font_scale: 0.05
    - font_scale: 0.038
```

今日なら時刻だけ、翌日なら「あす」、それ以降は日付を添える。
終日の予定は「終日」と出る。

### `match` — 件名の絞り込み

`/.../` で囲めば正規表現、そうでなければワイルドカード（`*` と `?`、全体一致）。

```yaml
match: "*クリニック*"            # 件名に「クリニック」を含む
match: "/^(えんそく|けんしん)/"   # 件名が「えんそく」か「けんしん」で始まる
match: "/clinic/i"              # 大文字小文字を区別しない
```

正規表現は設定の読み込み時に組み立てるので、書き間違いは起動前に分かる。

### `levels` — 文字の大きさ

見せ方を直近から順に当てる。**予定は日でまとめる**ので、同じ日の予定はまとめて
同じ段階になる。あすと明後日に予定があれば、あすの分だけが最初の段階に入る。
予定のない日は飛ばす。段階が尽きた分は最後の段階を使うので、
「最初 / その次 / その他」なら 3 つ書く。

| 項目 | 内容 |
| --- | --- |
| `font_size` | 文字の大きさ（px、6〜400） |
| `font_scale` | 項目の高さに対する割合（0.01〜1） |

各段階には `font_size` か `font_scale` のどちらか一方を書く。両方書いた場合と、
どちらも書かない場合は設定エラーになる。`font_scale` なら端末の画素数が変わっても
同じ見え方になるので、複数の端末で使うならこちらが向いている。

```yaml
levels:
  - font_scale: 0.065   # 直近の日の予定
  - font_scale: 0.05    # その次の日の予定
  - font_scale: 0.038   # それ以降
```

行の高さも文字の大きさの比で割り振るので、大きい段階ほど広くなる。
指定した大きさが枠に収まらなければ、収まるところまで自動で縮める。
時刻の欄が幅の 60% を超えることもない（件名を出す幅を残すため）。
件名の開始位置は、同じ大きさの行どうしで揃う。

## `weather` — 今日・明日・明後日の天気

1 日を 1 列にして横に並べ、上から日・記号・天気・降水確率・気温を出す。
天気は「くもり時々晴れ」「晴のち曇」のように、つなぎ言葉まで入れた表記で出す。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `days` | `3` | 出す日数（1〜3） |
| `source` | 最初の `weather` | どの天気予報を見るか |

```yaml
- type: weather
  height: 3
  label: てんき
  source: てんき
  days: 3
```

降水確率はその日の 6 時間ごとの値のうち、いちばん高いものを出す。
気温は「最低/最高」。値が無い日は `—` になる（17 時発表では当日の気温が落ちる）。

## `weather-timeline` — 時間帯ごとの天気と降水確率

いまが入っている時間帯から先を、帯ごとに棒で並べる。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `count` | `4` | 出す帯の数（1〜12） |
| `source` | 最初の `weather` | どの天気予報を見るか |

```yaml
- type: weather-timeline
  height: 2.5
  label: こうすいかくりつ
  source: てんき
  count: 4
```

**帯の細かさは取得元による。**

| `provider` | 帯 | 天気の記号 |
| --- | --- | --- |
| `jma` | 6 時間ごと（00-06 / 06-12 / 12-18 / 18-24） | 出ない |
| `tenki` | 1 時間ごと | 出る |

気象庁は 1 時間ごとの天気や降水確率を、防災情報の JSON でも XML でも出していない。
細かく出したいなら `provider: tenki` を使う。1 時間ごとにすると帯の数が要るので、
`count` も大きめにする。

今日の帯を出し切ると翌日の帯に続く。その帯には「あす」を添える。

## `weather-today` — 当日の天気を書式で

行ごとに書式を書き、差し込む値を `{...}` で指定する。

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `lines` | 下記 | 行ごとの書式。文字列か `{ text, scale }` |
| `lines[].text` | （必須） | 書式 |
| `lines[].scale` | `1` | 行の高さの比（0.1〜20） |
| `source` | 最初の `weather` | どの天気予報を見るか |

```yaml
- type: weather-today
  height: 3
  label: きょうのてんき
  source: てんき
  lines:
    - { text: "{symbol} {weather_short}", scale: 3 }
    - { text: "降水 {pop}%  {temp_min}〜{temp_max}℃", scale: 1.4 }
    - { text: "{warning}", scale: 1.2 }
```

上の内容が `lines` の既定でもある。天気の言葉は 3 つの細かさから選べる。

気象庁の発表文は、主な天気のあとに時間帯や場所で限った天気が続く
（`雨 夜のはじめ頃 くもり`）。`{weather_detail}` は時間帯の言葉が出たところで切るので、
その日の主な天気が「のち」「時々」「一時」を含んだ形で取れる。
tenki.jp はもともと `晴のち曇` の形なので、そのまま入る。

**値が空になった行は出さない**ので、`{warning}` の行は警報・注意報が出ているときだけ現れる。

| 書式 | 内容 |
| --- | --- |
| `{symbol}` | 天気の記号（☀ ☁ ☂ ☃） |
| `{weather}` | 発表そのままの天気の文（`くもり 時々 晴れ 未明 雨`） |
| `{weather_detail}` | その日の主な天気を、つなぎ言葉まで入れて（`くもり時々晴れ`） |
| `{weather_short}` | 主な天気だけ（`くもり`） |
| `{pop}` | 降水確率の数値 |
| `{temp_min}` / `{temp_max}` | 最低気温 / 最高気温 |
| `{warning}` | 発表中の警報・注意報（`雷注意報 大雨注意報`）。無ければ空 |
| `{area}` | 予報区の名前（`東京地方`） |
| `{city}` | 設定に書いた市町村の名前（`千代田区`） |
| `{day}` | きょう / あす / あさって |

知らない名前を書くと設定エラーになるので、書き間違いは起動前に分かる。

## `clock` — 時間の表示

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `date` | `true` | 日付も出すか |
| `seconds` | `false` | 秒まで出すか |

```yaml
- type: clock
  height: 3
  date: true
  seconds: false
```

秒を出すと毎秒画面が変わる。電子ペーパーでは `false` のままが向いている。

## `section` — セクションタイトル

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| `text` | （必須） | 見出しの文字 |

```yaml
- type: section
  height: 0.8
  text: ごはん
```

下に罫線を引く。ひとまとまりの項目に見出しを付けるために使う。

---

## 新しい項目を足す

項目は `src/widgets/` に 1 ファイルずつ置き、`src/widgets/index.js` に登録する。
各項目は自分の設定の検証・表示内容の組み立て・描画を持ち、項目どうしは互いを知らない。

```js
/** 設定の `type`。 */
export const type = 'clock';

/**
 * 設定を検証して、表示に必要な形に直す。戻り値が build の options になる。
 * 誤りがあれば validate.js の関数が ConfigError を投げ、起動前に止まる。
 *
 * @param {object} item    設定に書かれた項目
 * @param {string} path    設定中の位置（`columns[0].items[1]`）。エラーに添える
 * @param {object} sources 定義済みの取得元（名前 → { type, ... }）
 */
export function normalize(item, path, sources) {}

/**
 * 表示内容（model）を組み立てる。
 *
 * model は JSON にできる素のデータだけにする。画面全体の model が前回と
 * 一字一句同じなら版番号を上げず、電子ペーパーを書き換えない。
 * 時刻を秒まで入れると毎秒書き換わるので、必要な粒度まで落としておく。
 *
 * @param {object} options normalize の戻り値
 * @param {{now: Date, timezone: string, sources: object}} ctx
 *   `ctx.sources` は名前 → `{ data, error, ageMs }`。data が無ければ取得前か失敗
 */
export function build(options, ctx) {}

/**
 * model を SVG の文字列にする。
 *
 * @param {object} model build の戻り値
 * @param {{x: number, y: number, w: number, h: number}} box 割り当てられた領域（px）
 */
export function render(model, box) {}
```

使える道具:

| ファイル | 内容 |
| --- | --- |
| `src/validate.js` | 設定の検証（`asString` / `asNumber` / `asSourceNames` など） |
| `src/svg.js` | `text` の組み立てと、フォント別の字幅の見積もり |
| `src/time.js` | 表示タイムゾーンでの時刻の読み書きと日本語の整形 |
| `src/widgets/common.js` | 見出し・補足・主役の値の描き分け（`header` / `footer` / `stack`） |
| `src/widgets/piyolog.js` | ぴよログを読む項目に共通の設定と状態の取り出し |
| `src/widgets/weather-common.js` | 天気の項目に共通の設定と日付の選び方 |

このファイルのサンプルは `npm test` がそのまま設定として読み込んで確かめている。
項目を足したら、ここにも設定項目とサンプルを書く。
