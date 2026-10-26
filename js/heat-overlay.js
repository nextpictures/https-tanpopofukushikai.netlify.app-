/* 管理ページの「ホームページの上でヒートマップを見る」用。?heatmap=1 のときだけ動きます。 */
(function () {
  if (!/[?&]heatmap=1/.test(location.search)) return;
  var d; try { d = JSON.parse(localStorage.getItem('tp_heat') || 'null'); } catch (e) {}
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1C2119;color:#fff;font:700 15px/1.6 sans-serif;padding:12px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap';
  bar.innerHTML = d ? 'ヒートマップ表示中（' + d.label + '・トップを開いた ' + d.base + '人のうち、その場所まで見た割合）<span style="flex:1"></span><a href="' + location.pathname + '" style="color:#F2B81E">ふつうの表示に戻す</a>'
    : '管理ページで「ヒートマップを見る」を押してから開いてください。';
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(bar);
    if (!d) return;
    document.querySelectorAll('[data-sec]').forEach(function (el) {
      var n = el.getAttribute('data-sec'), v = d.sec[n] || 0, p = d.base ? Math.round(v * 100 / d.base) : 0;
      var col = p >= 90 ? '230,40,30' : p >= 70 ? '245,140,20' : p >= 50 ? '240,210,30' : p >= 30 ? '60,200,90' : '40,150,230';
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      var o = document.createElement('div');
      o.style.cssText = 'position:absolute;inset:0;background:rgba(' + col + ',.38);z-index:50;pointer-events:none;outline:3px solid rgba(' + col + ',.9);outline-offset:-3px';
      var t = document.createElement('div');
      t.style.cssText = 'position:absolute;left:16px;top:16px;background:rgb(' + col + ');color:#fff;font:700 18px/1.4 sans-serif;padding:6px 14px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.25)';
      t.textContent = n + '　' + p + '%（' + v + '回）';
      o.appendChild(t); el.appendChild(o);
    });
  });
})();
