/* お知らせを data/news.js から表示する（管理ページで書いた内容） */
(function () {
  'use strict';
  // いつも最新のお知らせを読み込む（ブラウザに古いデータが残っていても上書きする）
  function parse(t) { var i = t.indexOf('{', t.indexOf('TP_NEWS')), j = t.lastIndexOf('}'); return JSON.parse(t.slice(i, j + 1)); }
  var first = window.TP_NEWS;
  if (first && first.items) render(first);
  fetch('data/news.js?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; })
    .then(function (t) { if (!t) throw 0; var d = parse(t); if (!first || d.version !== first.version || !first.items) render(d); })
    .catch(function () { if (!first || !first.items) render({ items: [] }); });
  function render(D) {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var now = Date.now();
  var live = D.items.filter(function (n) {
    if (n.draft) return false;
    if (n.start && Date.parse(n.start) > now) return false;
    if (n.end && Date.parse(n.end) <= now) return false;
    return true;
  }).sort(function (a, b) {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
  var isShop = function (n) { return n.type === '店舗'; };
  function li(n) {
    return '<li><a href="news-detail.html?id=' + encodeURIComponent(n.id) + '"><span class="date">' + esc(n.date.replace(/-/g, '.')) + '</span>' +
      '<span class="tag">' + (n.pinned ? '📌 ' : '') + esc(n.type) + '</span><span class="t">' + esc(n.title) + '</span><span class="ar">→</span></a></li>';
  }
  document.querySelectorAll('[data-news]').forEach(function (ul) {
    var cat = ul.getAttribute('data-news'), lim = +(ul.getAttribute('data-limit') || 999);
    var its = live.filter(function (n) { return cat === 'shop' ? isShop(n) : cat === 'info' ? !isShop(n) : true; }).slice(0, lim);
    ul.innerHTML = its.length ? its.map(li).join('') : '<li class="news-empty">現在、お知らせはありません。</li>';
  });
  var box = document.getElementById('newsDetail');
  if (box) {
    var id = decodeURIComponent((location.search.match(/[?&]id=([^&]+)/) || [])[1] || '');
    var n = live.filter(function (x) { return x.id === id; })[0];
    var back = '<p class="nd-back"><a class="link-arrow" href="news.html">お知らせ一覧へ <i>→</i></a></p>';
    if (!n) { box.innerHTML = '<p>このお知らせは見つからないか、掲載期間が終わりました。</p>' + back; return; }
    document.title = n.title + '｜たんぽぽ福祉会';
    var files = (n.files || []).filter(function (f) { return /^files\/[\w.\-]+$/.test(f.path); });
    var imgs = files.filter(function (f) { return f.kind === 'image'; }), docs = files.filter(function (f) { return f.kind !== 'image'; });
    box.innerHTML = '<p class="nd-meta"><span class="date">' + esc(n.date.replace(/-/g, '.')) + '</span><span class="tag">' + esc(n.type) + '</span></p>' +
      '<h2 class="nd-title">' + esc(n.title) + '</h2>' +
      imgs.map(function (f) { return '<img class="nd-img" src="' + esc(f.path) + '" alt="' + esc(f.name) + '">'; }).join('') +
      (n.body ? '<div class="nd-body">' + esc(n.body).replace(/\n/g, '<br>') + '</div>' : '') +
      (docs.length ? '<ul class="nd-files">' + docs.map(function (f) { return '<li><a class="btn line" href="' + esc(f.path) + '" target="_blank" rel="noopener">📄 ' + esc(f.name) + ' ↗</a></li>'; }).join('') + '</ul>' : '') + back;
  }
}
})();
