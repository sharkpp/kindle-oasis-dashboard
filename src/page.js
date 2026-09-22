/**
 * ダッシュボードの HTML。
 *
 * 画面更新はクライアント側の JavaScript が担う。`/revision` を一定間隔で問い合わせ、
 * サーバーの版が変わったときだけ新しい画像を読み込んで差し替える。
 * ページ全体をリロードしないので、e-ink の全面再描画とスクリプトの再起動を避けられる。
 *
 * Kindle の内蔵ブラウザは古い WebKit なので、クライアントは ES5 の範囲で書く
 * （var / XMLHttpRequest のみ。let, const, arrow function, fetch, Promise は使わない）。
 */
export function renderPage({ width, height, revision, pollSec, token }) {
  const initialSrc = `/screen.png?w=${width}&amp;h=${height}&amp;rev=${revision}&amp;t=${token}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>MyRealDashboard</title>
<style>
html, body { margin:0; padding:0; border:0; width:100%; height:100%; background:#fff; overflow:hidden; }
img.screen { display:block; width:100%; height:100%; border:0; margin:0; padding:0; }
</style>
</head>
<body>
<img class="screen" id="screen" src="${initialSrc}" width="${width}" height="${height}" alt="dashboard">
<script type="text/javascript">
(function () {
  var POLL_MS = ${pollSec * 1000};
  var screenImg = document.getElementById('screen');
  var revision = ${revision};
  var assumedWidth = ${width};
  var assumedHeight = ${height};
  var polls = 0;
  var errors = 0;

  // ビューポートの実測値。サーバーはこの画素数ぴったりの画像を描く。
  function viewport() {
    var el = document.documentElement;
    return {
      w: el.clientWidth || window.innerWidth || assumedWidth,
      h: el.clientHeight || window.innerHeight || assumedHeight
    };
  }

  function screenUrl(rev) {
    var v = viewport();
    return '/screen.png?w=' + v.w + '&h=' + v.h + '&rev=' + rev +
      '&polls=' + polls + '&errors=' + errors + '&t=' + new Date().getTime();
  }

  // 読み込み終わってから差し替える。描画途中の白い画面を挟まない。
  function swap(rev) {
    var next = new Image();
    next.onload = function () { screenImg.src = next.src; };
    next.onerror = function () { errors++; };
    next.src = screenUrl(rev);
  }

  function poll() {
    polls++;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/revision?polls=' + polls + '&errors=' + errors +
      '&w=' + viewport().w + '&h=' + viewport().h + '&t=' + new Date().getTime(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status === 200) {
        var rev = parseInt(xhr.responseText, 10);
        if (!isNaN(rev) && rev !== revision) {
          revision = rev;
          swap(rev);
        }
      } else {
        errors++;
      }
    };
    xhr.send(null);
  }

  // 実測サイズが HTML 生成時の想定と違えば、すぐ描き直す。
  var v = viewport();
  if (v.w !== assumedWidth || v.h !== assumedHeight) { swap(revision); }

  setInterval(poll, POLL_MS);
  poll();
})();
</script>
</body>
</html>
`;
}
