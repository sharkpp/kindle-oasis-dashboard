# MyRealDashboard

Kindle Oasis（第9世代）の内蔵ブラウザに常時表示する、子供の予定ダッシュボード。
次のごはんまでの残り時間、次のミルクの時間、Google カレンダーの次の予定などを、
電子ペーパー向けの 1 枚の画像として描く。

要件と設計の前提は [SPEC.md](SPEC.md) に書いてある。

## 起動

```sh
npm install
cp config.example.yaml config.yaml   # URL と時間を自分のものに書き換える
npm start
```

起動すると、Kindle から開く URL が表示される。

```
MyRealDashboard — 設定 config.yaml / 20 秒ごとに更新 / 10 秒ごとにポーリング
  http://localhost:3000/
  http://192.168.11.35:3000/
```

Kindle を同じ Wi-Fi につなぎ、ブラウザ（ホーム → メニュー → ウェブブラウザ）で
`http://<PC の IP>:3000/` を開く。

| 環境変数 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `CONFIG` | `config.yaml` | 設定ファイルのパス |

`config.yaml` にはフィードの秘密 URL が入るので、コミットしない（`.gitignore` 済み）。

## 設定

[config.example.yaml](config.example.yaml) をそのまま雛形にできる。

### 画面全体

| 項目 | 既定値 | 内容 |
| --- | --- | --- |
| `timezone` | `Asia/Tokyo` | 表示に使うタイムゾーン |
| `poll_sec` | `10` | クライアントが更新を確認する間隔（秒） |
| `tick_sec` | `20` | 表示内容を作り直す間隔（秒） |
| `padding` | `24` | 画面の外周の余白（px） |
| `gap` | `16` | 項目どうしのすき間（px） |

### データ取得元（`sources`）

```yaml
sources:
  piyolog:
    url: "https://feed.piyolog.com/v1/feed/24h/FEED_ID/SECRET"
    interval_sec: 300
  calendar:
    url: "https://calendar.google.com/calendar/ical/xxxx%40group.calendar.google.com/private-yyyy/basic.ics"
    interval_sec: 600
```

- `piyolog` — ぴよログの iOS アプリで「設定 → データフィード」から発行した URL。
  取得は 1 分に 1 回までが目安で、取得期間ごとにキャッシュ保持時間がある
  （24h: 1 分 / 3d: 2 分 / 7d: 5 分 / 28d: 15 分）。`interval_sec` はそれ以上にする。
- `calendar` — Google カレンダーの「設定 → カレンダーの統合 → iCal 形式の非公開 URL」。
- 使わない項目しか置いていないなら、その取得元は省略してよい。

### レイアウト（`columns`）

画面をカラムに横分割し、各カラムの中で項目を縦に積む。
`width` と `height` は比率で、端末の画素数に合わせて引き伸ばされる。

```yaml
columns:
  - width: 1          # カラムの幅の比率（既定 1）
    items:
      - type: clock
        height: 3     # カラム内での高さの比率（既定 1）
        date: true
```

### 項目

すべての項目に `type` と `height` を指定できる。`label` は項目の上に出る小さな見出し。

#### `countdown` — 指定の時間までの残り時間

```yaml
- type: countdown
  label: つぎのごはん
  times:
    - { at: "07:30", name: あさごはん }
    - { at: "12:00", name: おひるごはん }
    - "18:00"
```

`times` は毎日繰り返す時刻の一覧。今より後でいちばん近いものを選び、
その時刻・残り時間・名前を出す。今日の分が全部過ぎていれば翌日の最初の時刻になる。
`name` を省いた `"18:00"` のような書き方もできる。

#### `milk` — 次のミルクの時間

```yaml
- type: milk
  label: つぎのミルク
  interval_min: 180
  record_types: [Formula, BreastFeeding]
```

ぴよログの直近の記録から `interval_min` 分後を目標にする。
`record_types` は対象にする記録の種類（既定は `[Formula]`）。
`Formula` = ミルク、`BreastFeeding` = 母乳、`ExpressedBreastMilk` = 搾母乳。
目標を過ぎていれば、残り時間ではなく過ぎた時間を出す。

#### `calendar` — 次の予定

```yaml
- type: calendar
  label: つぎのよてい
  count: 5
```

`count` は出す件数（既定 3）。進行中の予定も残す。
今日なら時刻だけ、翌日なら「あす」、それ以降は日付を添える。

#### `clock` — 時間の表示

```yaml
- type: clock
  date: true
  seconds: false
```

`seconds` を `true` にすると秒まで出る。ただし秒を出すと毎秒画面が変わるので、
電子ペーパーでは `false` のままが向いている。

#### `section` — セクションタイトル

```yaml
- type: section
  height: 0.8
  text: ごはん
```

## 仕組み

サーバーは `tick_sec` ごとに、フィードを（取得間隔を過ぎていれば）取り直し、
設定どおりに表示内容を組み立てる。組み立てた内容が前回と一字一句同じなら、
版番号は上げない。クライアントは `poll_sec` ごとに `/revision` を問い合わせ、
番号が変わったときだけ新しい画像を読み込んで `<img>` を差し替える。

- `GET /` — 全画面 `<img>` とポーリング用スクリプトを含む HTML。
- `GET /revision` — 現在の版番号を数字だけで返す。クライアントの実測ビューポートもここで受け取る。
- `GET /screen.png` — SVG を組み立てて sharp で 16 階調グレースケール PNG に変換。

設計上の選択:

- **表示内容が変わったときだけ版番号を上げる** — 電子ペーパーの書き換えを、
  見た目が変わるときだけに絞る。時刻の表示が分単位なら、書き換えも 1 分に 1 回で済む。
- **ページリロードではなく画像の差し替え** — HTML・スクリプトを取り直さない。
  新しい画像を `new Image()` で読み終えてから `src` を差し替えるので、白い画面を挟まない。
- **クライアントは ES5 のみ** — Kindle の内蔵ブラウザは古い WebKit。
  `var` と `XMLHttpRequest` だけを使い、`let`/`const`/アロー関数/`fetch`/`Promise` は使わない。
- **ビューポートはクライアントが実測** — サーバーはその画素数ちょうどの画像を描く。拡大縮小が入らない。
- **取得に失敗しても前回の内容を捨てない** — 失敗は該当する項目に出し、再試行は間隔を伸ばしながら行う。
- **キャッシュは全面的に無効化** — URL に毎回変わるトークンを付け、`Cache-Control: no-store` も併せて送る。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/server.js` | HTTP サーバー、ルーティング |
| `src/config.js` | YAML 設定の読み込みと検証 |
| `src/dashboard.js` | フィードの更新と表示内容の組み立て、版番号の管理 |
| `src/layout.js` | カラムと項目の配置 |
| `src/render.js` | SVG 組み立て → グレースケール PNG |
| `src/page.js` | 全画面 `<img>` + ES5 ポーリングスクリプト |
| `src/sources/` | ぴよログ・カレンダーの取得とキャッシュ |
| `src/widgets/` | 組み込みの項目（検証・組み立て・描画） |

## テスト

```sh
npm test
```

固定した日時と固定のフィードデータで、設定の検証・フィードの解釈・各項目の表示内容・
PNG の描画までを確かめる。
