# MyRealDashboard — Kindle Oasis 表示プロトタイプ

Kindle Oasis 第9世代の内蔵ブラウザで、ダッシュボード画像を画面いっぱいに表示し、
更新をポーリングで検知して差し替えられるかを確認するためのプロトタイプ。

## 起動

```sh
npm install
npm start
```

起動すると、Kindle から開く URL が表示される。

```
MyRealDashboard prototype — update every 30s, poll every 5s
image size: 1264 x 1680 px (default)
  http://localhost:3000/
  http://192.168.11.35:3000/
```

Kindle を同じ Wi-Fi につなぎ、ブラウザ（ホーム → メニュー → ウェブブラウザ）で
`http://<PC の IP>:3000/` を開く。

| 環境変数 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `UPDATE_SEC` | `30` | 画面内容を新しくする間隔（秒） |
| `POLL_SEC` | `5` | クライアントが更新を確認する間隔（秒） |

## 仕組み

サーバーは画面の版番号（`revision`）を持ち、`UPDATE_SEC` ごとに進める。
クライアントは `POLL_SEC` ごとに `/revision` を問い合わせ、番号が変わったときだけ
新しい画像を読み込んで `<img>` を差し替える。ページ全体はリロードしない。

- `GET /` — 全画面 `<img>` とポーリング用スクリプトを含む HTML。
- `GET /revision` — 現在の版番号を数字だけで返す（十数バイト）。クライアントの稼働状況もここで受け取る。
- `GET /screen.png` — SVG を組み立てて sharp で 16 階調グレースケール PNG に変換。e-ink 向けに白背景・黒描画。

設計上の選択:

- **ページリロードではなく画像の差し替え** — HTML・スクリプトを取り直さず、e-ink の全面再描画も 1 回で済む。新しい画像を `new Image()` で読み終えてから `src` を差し替えるので、切り替え時に白い画面を挟まない。
- **クライアントは ES5 のみ** — Kindle の内蔵ブラウザは古い WebKit。`var` と `XMLHttpRequest` だけを使い、`let`/`const`/アロー関数/`fetch`/`Promise` は使わない。
- **ビューポートはクライアントが実測** — `document.documentElement.clientWidth/clientHeight` をリクエストに載せ、サーバーはその画素数ぴったりの画像を描く。拡大縮小が入らない。初回だけ既定値 1264 x 1680 px（Oasis 第9世代のパネル解像度）で描画し、直後に実測値で描き直す。
- **キャッシュは全面的に無効化** — URL に毎回変わるトークンを付け、`Cache-Control: no-store` も併せて送る。

## 実機で確認すること

1. 画面下部の `js poll #N errors 0 last Xs ago` が出ているか
   - 出ていれば JavaScript とポーリングが動いている
   - `js poll: none yet -- javascript may be disabled` のままなら、内蔵ブラウザでスクリプトが動いていない
2. `UPDATE_SEC` ごとに時刻・`rev` が進むか（ポーリングによる差し替えが効いている）
3. 四隅の L 字マーカーが 4 つとも見えるか（欠けていれば画面が収まっていない）
4. スクロールバー・余白が出ていないか
5. サーバーのコンソールに `viewport reported by client: W x H px` が出るか（実機の実効ビューポートが分かる）
6. グレースケールバーの階調が識別できるか

## 検証済みの動作（headless Chrome / 1264 x 1680）

```
GET /screen.png?w=1264&h=1593&rev=10&polls=4&errors=0
GET /screen.png?w=1264&h=1593&rev=11&polls=8&errors=0
GET /screen.png?w=1264&h=1593&rev=12&polls=12&errors=0
```

版番号が変わったときだけ画像を取得し、ポーリング自体は `/revision` の数バイトで済んでいる。
