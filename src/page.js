/**
 * ダッシュボードの HTML。JavaScript は一切使わず、meta refresh だけで更新する。
 * 画像の URL には毎回異なるトークンを付けて、端末側のキャッシュを確実に避ける。
 */
export function renderPage({ width, height, refreshSec, token }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="${refreshSec}">
<meta http-equiv="Cache-Control" content="no-cache, no-store">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>MyRealDashboard</title>
<link rel="stylesheet" href="/probe.css">
<style>
html, body { margin:0; padding:0; border:0; width:100%; height:100%; background:#fff; overflow:hidden; }
img.screen { display:block; width:100%; height:100%; border:0; margin:0; padding:0; }
</style>
</head>
<body>
<div class="probe probe-w"></div>
<div class="probe probe-h"></div>
<img class="screen" src="/screen.png?w=${width}&amp;h=${height}&amp;t=${token}" width="${width}" height="${height}" alt="dashboard">
</body>
</html>
`;
}
