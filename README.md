# MyRealDashboard — Kindle Oasis 表示プロトタイプ

Kindle Oasis 第9世代の内蔵ブラウザで、ダッシュボード画像を画面いっぱいに表示し、
JavaScript を使わずに定期的に再読み込みできるかを確認するためのプロトタイプ。

## 起動

```sh
npm install
npm start
```

起動すると、Kindle から開く URL が表示される。

```
MyRealDashboard prototype — refresh every 30s
image size: 1264 x 1680 px (default)
  http://localhost:3000/
  http://192.168.11.35:3000/
```

Kindle を同じ Wi-Fi につなぎ、ブラウザ（ホーム → メニュー → ウェブブラウザ）で
`http://<PC の IP>:3000/` を開く。

| 環境変数 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `REFRESH_SEC` | `30` | 再読み込み間隔（秒） |

## 仕組み

| 要件 | 実装 |
| --- | --- |
| 画面いっぱいに表示 | `html, body, img` を `width:100%; height:100%` に。画像はビューポートと同じ画素数で生成するため拡大・余白が出ない |
| JavaScript なしで定期再読み込み | `<meta http-equiv="refresh">` と HTTP の `Refresh:` ヘッダ |
| 更新の確認 | 画像に時刻・日付・通し番号（`#N`）・秒の進捗バーを描画 |

- `GET /` — meta refresh 付きの HTML。画像 URL には毎回異なるトークンを付け、`Cache-Control: no-store` と併せて端末側のキャッシュを確実に避ける。
- `GET /screen.png` — SVG を組み立てて sharp で 16 階調グレースケール PNG に変換。e-ink 向けに白背景・黒描画。
- `GET /probe.css` — ビューポート実測用。`@media (min-width/min-height)` に一致した背景画像だけがブラウザから取得される性質を使い、JavaScript なしで画面サイズをサーバーに伝える。検出値はコンソールに出力され、次回以降の描画サイズに反映される。
- `GET /probe` — プローブの受け口。透過 1x1 GIF を返す。

初回表示は既定値 1264 x 1680 px（Oasis 第9世代のパネル解像度）で描画し、
プローブが実測値を返した後の再読み込みから、実際のビューポートぴったりの画像になる。

## 実機で確認すること

1. 四隅の L 字マーカーが 4 つとも見えるか（欠けていれば画面が収まっていない）
2. スクロールバー・余白が出ていないか
3. `REFRESH_SEC` ごとに時刻と `#N` が進むか
4. 起動したコンソールに `viewport detected: W x H px` が出るか（実機の実効ビューポートが分かる）
5. グレースケールバーの階調が識別できるか
