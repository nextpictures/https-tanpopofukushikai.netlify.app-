/* アクセス記録（Umami）。個人を特定する情報は記録しません（Cookieも使いません）。
   ・ページの表示
   ・トップページの各ブロックがどこまで見られたか（sec:〇〇）
   ・押されたボタン（btn:〇〇）と、サイト内のリンク（link:〇〇） */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  if (!C.umamiWebsiteId) return;
  try { if (localStorage.getItem('tp_no_track') === '1') return; } catch (e) {}
  if (window.top !== window.self || /[?&]heatmap=1/.test(location.search)) return;
  var s = document.createElement('script');
  s.defer = true; s.src = C.umamiScript || 'https://cloud.umami.is/script.js';
  s.setAttribute('data-website-id', C.umamiWebsiteId);
  document.head.appendChild(s);

  var pending = [];
  function track(name) {
    name = String(name).slice(0, 48);
    if (window.umami && window.umami.track) window.umami.track(name); else pending.push(name);
  }
  var t = setInterval(function () { if (window.umami && window.umami.track) { clearInterval(t); pending.splice(0).forEach(track); } }, 500);
  setTimeout(function () { clearInterval(t); }, 20000);

  // どこまで見られたか（各ブロックが画面に半分以上入ったら1回だけ記録）
  var secs = document.querySelectorAll('[data-sec]');
  if (secs.length && 'IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var n = e.target.getAttribute('data-sec');
        if (seen[n]) return; seen[n] = 1; io.unobserve(e.target);
        track('sec:' + n);
      });
    }, { threshold: [0.35] });
    secs.forEach(function (el) { io.observe(el); });
  }

  // 押されたボタン・リンク
  var PAGES = { 'index.html': 'トップ', 'about.html': '恵那たんぽぽについて', 'company.html': '法人概要', 'greeting.html': '理事長あいさつ', 'shien-system.html': '支援システム', 'information.html': '情報公開', 'work.html': 'たんぽぽの仕事', 'service.html': '事業所・店舗', 'group-home.html': 'グループホーム', 'type-a.html': 'A型事業', 'guide.html': 'ご利用案内', 'visit.html': '施設見学', 'recruit.html': '採用情報', 'news.html': 'お知らせ', 'news-detail.html': 'お知らせ詳細', 'contact.html': 'お問い合わせ' };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a,button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (/^tel:/i.test(href)) return track('btn:電話 ' + href.slice(4));
    if (/^mailto:/i.test(href)) return track('btn:メール');
    if (/instagram\.com/i.test(href)) return track('btn:インスタグラム');
    if (/facebook\.com/i.test(href)) return track('btn:Facebook');
    if (/line\.me/i.test(href)) return track('btn:LINE');
    if (/\.pdf(\?|$)/i.test(href)) return track('btn:PDF ' + (label || href.split('/').pop()));
    if (/visit\.html|data-pick/.test(href) || a.hasAttribute('data-pick')) return track('btn:見学申込 ' + label);
    if (a.matches('.btn, .head-cta a, button[type=submit]')) track('btn:' + (label || 'ボタン'));
    var m = href.match(/^(?:\.\/)?([a-z0-9\-]+\.html)/i);
    if (m && PAGES[m[1]]) track('link:' + PAGES[m[1]]);
  }, true);
})();
