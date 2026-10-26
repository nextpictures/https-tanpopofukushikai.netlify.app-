/* お知らせ管理（たんぽぽ福祉会）
   ・お知らせ：data/news.js を GitHub に保存（＝ホームページに反映）。つながっていないときは「ファイルで書き出す」
   ・アクセス状況：Umami の数字を日本語で表示
   鍵（GitHubトークン・UmamiのAPIキー）は、このブラウザの中にだけ保存します。 */
(() => {
'use strict';
const CFG = window.TP_ADMIN || {};
const SITE = window.SITE_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('ja-JP');
const ls = { get(k, d = '') { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { v === '' || v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const ss = { get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
const toast = (m, ms = 3200) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); };
const busy = (on, msg) => { $('#busy').hidden = !on; if (msg) $('#busyMsg').textContent = msg; };
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const localDT = d => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const jpDT = s => { if (!s) return ''; const d = new Date(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function b64utf8(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function utf8b64(b64) { const bin = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }

/* ============ パスワード ============ */
async function unlock() {
  if (!CFG.passwordHash) { start(); return; }
  if (ss.get('tp_admin_ok') === CFG.passwordHash) { start(); return; }
  $('#lock').hidden = false; $('#lockPw').focus();
}
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!window.crypto || !crypto.subtle) { $('#lockErr').textContent = 'https:// のアドレスで開いてください'; return; }
  const h = await sha256($('#lockPw').value);
  if (h !== CFG.passwordHash) { $('#lockErr').textContent = 'パスワードが違います'; $('#lockPw').select(); return; }
  ss.set('tp_admin_ok', h); $('#lockPw').value = ''; $('#lock').hidden = true; start();
});

/* ============ GitHub ============ */
const gh = () => ({ owner: ls.get('tp_gh_owner', CFG.github?.owner || ''), repo: ls.get('tp_gh_repo', CFG.github?.repo || ''), branch: ls.get('tp_gh_branch', CFG.github?.branch || 'main') || 'main', token: ls.get('tp_gh_token') });
const ghReady = () => { const g = gh(); return !!(g.owner && g.repo && g.token); };
async function ghReq(path, opt = {}) {
  const g = gh();
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}${path}`, {
    ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + g.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (res.status === 404 && opt.allow404) return null;
  if (!res.ok) {
    let m = ''; try { m = (await res.json()).message || ''; } catch (e) {}
    if (res.status === 401) throw new Error('GitHubの鍵（トークン）が正しくないか、期限が切れています。「設定」で入れ直してください。');
    if (res.status === 403) throw new Error('GitHubの鍵に「書き込み」の許可がありません（Contents を Read and write に）。');
    if (res.status === 404) throw new Error('GitHubでリポジトリが見つかりません。「設定」で ①ユーザー名（nextpictures）とリポジトリ名（最後の「-」まで）が正しいか、②トークンを作るときにこのリポジトリを選び、Contents を「Read and write」にしたか を確かめてください。');
    if (res.status === 409) throw new Error('ほかの人が同時に更新しました。少し待ってからもう一度押してください。');
    throw new Error('GitHubに保存できませんでした（' + res.status + ' ' + m + '）');
  }
  return res.json();
}
async function ghGet(path) {
  const r = await ghReq(`/contents/${path}?ref=${encodeURIComponent(gh().branch)}`, { allow404: true });
  return r ? { sha: r.sha, text: r.content ? utf8b64(r.content) : '' } : null;
}
async function ghPut(path, b64, message) {
  const cur = await ghReq(`/contents/${path}?ref=${encodeURIComponent(gh().branch)}`, { allow404: true });
  return ghReq(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64, branch: gh().branch, ...(cur ? { sha: cur.sha } : {}) }) });
}

/* ============ お知らせデータ ============ */
const TYPES = ['お知らせ', 'イベント', '見学会', '採用', '店舗', 'たより'];
let DATA = { version: 0, updated: '', items: [] };
let unsentFiles = {}; // path -> base64（GitHubにまだ送っていないファイル）
function parseNews(text) {
  const i = text.indexOf('{', text.indexOf('TP_NEWS')), j = text.lastIndexOf('}');
  const d = JSON.parse(text.slice(i, j + 1)); d.items = d.items || []; return d;
}
function buildNews(d) {
  return '/* お知らせのデータ（管理ページ /admin/ から自動で書き換えられます。手で直すときは形を崩さないよう注意してください） */\n' +
    'window.TP_NEWS = ' + JSON.stringify(d, null, 2) + ';\n';
}
async function loadData() {
  let d = null;
  try {
    if (ghReady()) { const f = await ghGet('data/news.js'); if (f) d = parseNews(f.text); }
  } catch (e) { showConn(e.message); }
  if (!d) {
    try { const r = await fetch('../data/news.js?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) d = parseNews(await r.text()); } catch (e) {}
  }
  if (!d && window.TP_NEWS) d = window.TP_NEWS;
  d = d || { version: 0, updated: '', items: [] };
  const local = ls.get('tp_news_local');
  if (local) { try { const L = JSON.parse(local); if ((L.version || 0) > (d.version || 0)) d = L; else ls.set('tp_news_local', ''); } catch (e) {} }
  DATA = d; renderVersion(); renderList();
}
function renderVersion() {
  const u = DATA.updated ? new Date(DATA.updated) : null;
  $('#verLine').textContent = DATA.version ? `Ver.${DATA.version}（${u ? `${u.getFullYear()}.${pad(u.getMonth() + 1)}.${pad(u.getDate())} ${pad(u.getHours())}:${pad(u.getMinutes())}` : ''} 更新）` : '';
}
function showConn(extra) {
  const w = $('#connWarn');
  if (ghReady() && !extra) { w.hidden = true; return; }
  w.hidden = false;
  w.innerHTML = extra ? esc(extra) :
    'いまは GitHub とつながっていないため、「公開する」を押しても<b>このパソコンの中に保存されるだけ</b>です。右上の「設定」で GitHub をつなぐと、そのままホームページに出ます。つなぐまでは「ファイルで書き出す」で news.js を保存し、サーバーの data フォルダに上書きしてください。';
}

async function publish(next, files, message) {
  next.version = (DATA.version || 0) + 1;
  next.updated = new Date().toISOString();
  if (!ghReady()) {
    Object.assign(unsentFiles, files);
    ls.set('tp_news_local', JSON.stringify(next));
    DATA = next; renderVersion(); renderList();
    toast('このパソコンに保存しました。「ファイルで書き出す」でホームページに反映してください', 5000);
    showConn(); return true;
  }
  busy(true, 'ホームページに反映しています…');
  try {
    for (const [path, b64] of Object.entries(files)) { $('#busyMsg').textContent = 'ファイルを送っています…'; await ghPut(path, b64, '添付ファイル ' + path); }
    $('#busyMsg').textContent = 'お知らせを保存しています…';
    await ghPut('data/news.js', b64utf8(buildNews(next)), message);
    DATA = next; ls.set('tp_news_local', ''); renderVersion(); renderList();
    toast('ホームページに反映しました。表示が変わるまで1〜2分かかることがあります', 5000);
    return true;
  } catch (e) { toast(e.message, 6000); showConn(e.message); return false; }
  finally { busy(false); }
}

/* ============ フォーム ============ */
let editingId = null, curType = 'お知らせ', atts = [];
function renderChips() {
  $('#typeChips').innerHTML = TYPES.map(t => `<button type="button" role="radio" aria-checked="${t === curType}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}
$('#typeChips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; curType = b.dataset.t; renderChips(); });
$('#f-title').addEventListener('input', () => { $('#titleCount').textContent = `${$('#f-title').value.length} / 40文字`; });
function periodText() {
  const s = $('#f-start').value, e = $('#f-end').value;
  $('#periodText').textContent = `ホームページに表示される期間：${s ? jpDT(s) : '公開してすぐ'} 〜 ${e ? jpDT(e) : 'ずっと'}`;
}
['f-start', 'f-end'].forEach(id => $('#' + id).addEventListener('change', periodText));
$$('.quick button').forEach(b => b.addEventListener('click', () => {
  const n = +b.dataset.q; if (!n) { $('#f-end').value = ''; periodText(); return; }
  const base = $('#f-start').value ? new Date($('#f-start').value) : new Date();
  base.setDate(base.getDate() + n); $('#f-end').value = localDT(base); periodText();
}));
function renderAtts() {
  $('#attList').innerHTML = atts.map((a, i) => `<li>${a.kind === 'image' ? `<img src="${esc(a.preview || '../' + a.path)}" alt="">` : '<span class="pdf">PDF</span>'}<span>${esc(a.name)}</span><button type="button" data-rm="${i}">外す</button></li>`).join('');
}
$('#attList').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { atts.splice(+b.dataset.rm, 1); renderAtts(); } });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#f-files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
function fileB64(blob) { return new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ng; r.readAsDataURL(blob); }); }
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    return { b64: await fileB64(blob), preview: c.toDataURL('image/jpeg', 0.6) };
  } finally { URL.revokeObjectURL(url); }
}
async function addFiles(list) {
  for (const f of [...list]) {
    if (atts.length >= 5) { toast('添付は5つまでです'); break; }
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = /^image\/(jpeg|png|webp)$/.test(f.type);
    if (!isPdf && !isImg) { toast('JPG・PNG・PDF を選んでください'); continue; }
    if (isPdf && f.size > 10 * 1024 * 1024) { toast('PDFは10MBまでです'); continue; }
    const stamp = ymd(new Date()).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8);
    if (isImg) { busy(true, '写真を縮小しています…'); try { const r = await shrink(f); atts.push({ kind: 'image', name: f.name, path: `files/${stamp}.jpg`, b64: r.b64, preview: r.preview }); } catch (e) { toast('写真を読み込めませんでした'); } finally { busy(false); } }
    else atts.push({ kind: 'pdf', name: f.name, path: `files/${stamp}.pdf`, b64: await fileB64(f) });
  }
  renderAtts();
}
function resetForm() {
  editingId = null; curType = 'お知らせ'; atts = [];
  $('#newsForm').reset(); $('#f-date').value = ymd(new Date());
  $('#formTitle').textContent = '新しいお知らせを書く'; $('#publishBtn').textContent = '公開する'; $('#cancelEdit').hidden = true;
  $('#formPanel').classList.remove('editing'); $('#formErr').textContent = '';
  renderChips(); renderAtts(); periodText(); $('#titleCount').textContent = '0 / 40文字';
}
$('#cancelEdit').addEventListener('click', resetForm);
function collect(draft) {
  const title = $('#f-title').value.trim(), date = $('#f-date').value;
  if (!date) { $('#formErr').textContent = '日付を入れてください'; $('#f-date').focus(); return null; }
  if (!title) { $('#formErr').textContent = 'タイトルを入れてください'; $('#f-title').focus(); return null; }
  const s = $('#f-start').value, e = $('#f-end').value;
  if (s && e && new Date(e) <= new Date(s)) { $('#formErr').textContent = '配信終了は、配信開始より後にしてください'; return null; }
  return { id: editingId || ('n' + Date.now().toString(36)), type: curType, date, title, body: $('#f-body').value.replace(/\s+$/, ''),
    pinned: $('#f-pin').checked, start: s ? new Date(s).toISOString() : '', end: e ? new Date(e).toISOString() : '', draft: !!draft,
    files: atts.map(a => ({ name: a.name, path: a.path, kind: a.kind })) };
}
async function save(draft) {
  $('#formErr').textContent = '';
  const item = collect(draft); if (!item) return;
  const files = {}; atts.filter(a => a.b64).forEach(a => files[a.path] = a.b64);
  const items = DATA.items.filter(n => n.id !== item.id); items.unshift(item);
  const ok = await publish({ ...DATA, items }, files, (editingId ? 'お知らせを直す：' : 'お知らせを追加：') + item.title);
  if (ok) { if (ghReady()) toast(draft ? '下書きで保存しました（ホームページには出ません）' : 'ホームページに反映しました。表示が変わるまで1〜2分かかることがあります', 5000); resetForm(); }
}
$('#newsForm').addEventListener('submit', e => { e.preventDefault(); save(false); });
$('#draftBtn').addEventListener('click', () => save(true));

/* ============ 一覧 ============ */
let listFilter = 'all';
const status = n => { const now = Date.now(); if (n.draft) return 'draft'; if (n.start && Date.parse(n.start) > now) return 'soon'; if (n.end && Date.parse(n.end) <= now) return 'ended'; return 'live'; };
const ST = { live: '公開中', soon: '公開予定', ended: '期間終了', draft: '下書き' };
$('#listTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; listFilter = b.dataset.f; $$('#listTabs button').forEach(x => x.classList.toggle('on', x === b)); renderList(); });
function renderList() {
  const items = [...DATA.items].sort((a, b) => (b.pinned - a.pinned) || (a.date < b.date ? 1 : -1)).filter(n => listFilter === 'all' || status(n) === listFilter);
  $('#newsList').innerHTML = items.length ? items.map(n => {
    const s = status(n);
    return `<li><div class="meta"><span class="d">${esc(n.date.replace(/-/g, '.'))}</span><span class="ty">${esc(n.type)}</span><span class="st ${s}">${ST[s]}</span>${n.pinned ? '<span class="pin">📌 固定</span>' : ''}${(n.files || []).length ? `<span>📎 ${n.files.length}</span>` : ''}</div>
      <div class="tt">${esc(n.title)}</div><div class="acts"><button class="ed" data-ed="${esc(n.id)}">直す</button><button class="rm" data-rm="${esc(n.id)}">削除</button></div></li>`;
  }).join('') : '<li class="empty">ここに表示するお知らせはありません。</li>';
}
$('#newsList').addEventListener('click', async e => {
  const ed = e.target.closest('[data-ed]'), rm = e.target.closest('[data-rm]');
  if (ed) {
    const n = DATA.items.find(x => x.id === ed.dataset.ed); if (!n) return;
    editingId = n.id; curType = TYPES.includes(n.type) ? n.type : 'お知らせ';
    $('#f-date').value = n.date; $('#f-title').value = n.title; $('#f-body').value = n.body || ''; $('#f-pin').checked = !!n.pinned;
    $('#f-start').value = n.start ? localDT(new Date(n.start)) : ''; $('#f-end').value = n.end ? localDT(new Date(n.end)) : '';
    atts = (n.files || []).map(f => ({ ...f })); renderChips(); renderAtts(); periodText(); $('#titleCount').textContent = `${n.title.length} / 40文字`;
    $('#formTitle').textContent = 'お知らせを直す'; $('#publishBtn').textContent = '直して公開する'; $('#cancelEdit').hidden = false;
    $('#formPanel').classList.add('editing'); $('#formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#f-title').focus({ preventScroll: true });
  }
  if (rm) {
    const n = DATA.items.find(x => x.id === rm.dataset.rm); if (!n) return;
    if (!(await ask(`「${n.title}」を削除します。ホームページからも消えます。よろしいですか？`))) return;
    const ok = await publish({ ...DATA, items: DATA.items.filter(x => x.id !== n.id) }, {}, 'お知らせを削除：' + n.title);
    if (ok && ghReady()) toast('削除しました。ホームページからも消えます', 4000);
    if (editingId === n.id) resetForm();
  }
});
function ask(msg) {
  return new Promise(ok => { const d = $('#askDlg'); $('#askMsg').textContent = msg; d.returnValue = ''; d.showModal(); d.addEventListener('close', function h() { d.removeEventListener('close', h); ok(d.returnValue === 'yes'); }); });
}

/* ============ 上のボタン ============ */
$('#republishBtn').addEventListener('click', async () => {
  if (!ghReady()) { toast('GitHubとつながっていません。「設定」でつないでください', 5000); return; }
  await publish({ ...DATA }, { ...unsentFiles }, 'もう一度反映する');
  unsentFiles = {};
});
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
$('#exportBtn').addEventListener('click', async () => {
  download('news.js', new Blob([buildNews(DATA)], { type: 'text/javascript' }));
  const fs = Object.entries(unsentFiles);
  for (const [path, b64] of fs) {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await new Promise(r => setTimeout(r, 400)); download(path.split('/').pop(), new Blob([u]));
  }
  toast(fs.length ? `news.js を data フォルダに、写真・PDF（${fs.length}つ）を files フォルダにアップロードしてください` : 'news.js を書き出しました。サーバーの data フォルダに上書きしてください', 7000);
});

/* ============ 設定 ============ */
const um = () => ({ mode: ls.get('tp_um_mode', CFG.umami?.mode || 'cloud'), api: ls.get('tp_um_api', CFG.umami?.api || 'https://api.umami.is/v1').replace(/\/+$/, ''), site: ls.get('tp_um_site', CFG.umami?.websiteId || SITE.umamiWebsiteId || ''), key: ls.get('tp_um_key'), user: ls.get('tp_um_user'), pass: ls.get('tp_um_pass'), dash: ls.get('tp_um_dash', CFG.umami?.dashboardUrl || 'https://cloud.umami.is/') });
function openSettings() {
  const g = gh(), u = um();
  $('#s-owner').value = g.owner; $('#s-repo').value = g.repo; $('#s-branch').value = g.branch; $('#s-token').value = g.token;
  $('#s-umode').value = u.mode; $('#s-uapi').value = u.api; $('#s-uweb').value = u.site; $('#s-ukey').value = u.key; $('#s-uuser').value = u.user; $('#s-upass').value = u.pass; $('#s-udash').value = u.dash;
  $('#s-notrack').checked = ls.get('tp_no_track') === '1'; $('#s-pw1').value = ''; $('#s-pw2').value = ''; $('#setErr').textContent = '';
  $('#ghRes').textContent = ''; $('#umRes').textContent = ''; umodeView(); $('#setDlg').showModal();
}
function umodeView() { const self = $('#s-umode').value === 'self'; $('#ukeyWrap').hidden = self; $('#uselfWrap').hidden = !self; if (self && /api\.umami\.is/.test($('#s-uapi').value)) $('#s-uapi').value = ''; if (!self && !$('#s-uapi').value) $('#s-uapi').value = 'https://api.umami.is/v1'; $('#s-uapi').placeholder = self ? 'https://（Umamiのアドレス）/api' : 'https://api.umami.is/v1'; }
$('#s-umode').addEventListener('change', umodeView);
$('#settingsBtn').addEventListener('click', openSettings);
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
function storeSettings() {
  ls.set('tp_gh_owner', $('#s-owner').value.trim()); ls.set('tp_gh_repo', $('#s-repo').value.trim().replace(/^https?:\/\/github\.com\/[^/]+\//, '').replace(/\.git$/, '').replace(/\/+$/, '')); ls.set('tp_gh_branch', $('#s-branch').value.trim() || 'main'); ls.set('tp_gh_token', $('#s-token').value.trim());
  ls.set('tp_um_mode', $('#s-umode').value); ls.set('tp_um_api', $('#s-uapi').value.trim()); ls.set('tp_um_site', $('#s-uweb').value.trim()); ls.set('tp_um_key', $('#s-ukey').value.trim());
  ls.set('tp_um_user', $('#s-uuser').value.trim()); ls.set('tp_um_pass', $('#s-upass').value); ls.set('tp_um_dash', $('#s-udash').value.trim());
  ls.set('tp_no_track', $('#s-notrack').checked ? '1' : ''); ss.set('tp_um_token', '');
}
$('#ghTest').addEventListener('click', async () => {
  storeSettings(); const r = $('#ghRes'); r.className = 'res'; r.textContent = '確かめています…';
  try { if (!ghReady()) throw new Error('3つとも入れてください'); const info = await ghReq(''); if (info.permissions && !info.permissions.push) throw new Error('リポジトリは見えますが、書き込みの許可がありません（Contents を Read and write に）'); r.className = 'res ok'; r.textContent = '✓ つながりました'; }
  catch (e) { r.className = 'res ng'; r.textContent = e.message; }
});
$('#umTest').addEventListener('click', async () => {
  storeSettings(); const r = $('#umRes'); r.className = 'res'; r.textContent = '確かめています…';
  try { const d = await uReq('/active'); r.className = 'res ok'; r.textContent = '✓ つながりました'; }
  catch (e) { r.className = 'res ng'; r.textContent = e.message; }
});
$('#setSave').addEventListener('click', async () => {
  $('#setErr').textContent = '';
  const p1 = $('#s-pw1').value, p2 = $('#s-pw2').value;
  if (p1 || p2) {
    if (p1.length < 8) { $('#setErr').textContent = 'パスワードは8文字以上にしてください'; return; }
    if (p1 !== p2) { $('#setErr').textContent = '確認用のパスワードが一致しません'; return; }
  }
  storeSettings();
  if (p1) {
    const h = await sha256(p1);
    const next = { ...CFG, passwordHash: h, github: { owner: gh().owner, repo: gh().repo, branch: gh().branch }, umami: { mode: um().mode, api: um().api, websiteId: um().site, dashboardUrl: um().dash } };
    const text = '/* 管理ページの設定（パスワードの暗号・つなぎ先）。管理ページの「設定」から書き換えられます。 */\nwindow.TP_ADMIN = ' + JSON.stringify(next, null, 2) + ';\n';
    if (ghReady()) {
      busy(true, 'パスワードを切り替えています…');
      try { await ghPut('admin/config.js', b64utf8(text), '管理ページのパスワードを変更'); ss.set('tp_admin_ok', h); toast('パスワードを変えました（1〜2分で切り替わります）', 5000); }
      catch (e) { $('#setErr').textContent = e.message; busy(false); return; } finally { busy(false); }
    } else { download('config.js', new Blob([text], { type: 'text/javascript' })); toast('config.js を admin フォルダに上書きすると、新しいパスワードになります', 7000); }
  }
  $('#setDlg').close(); showConn(); loadData(); loadStats();
});
$('#logoutBtn').addEventListener('click', () => { try { sessionStorage.clear(); } catch (e) {} location.reload(); });

/* ============ アクセス状況（Umami） ============ */
const umReady = () => { const u = um(); return !!(u.api && u.site && (u.mode === 'cloud' ? u.key : (u.user && u.pass))); };
async function uToken() {
  const u = um(); let t = ss.get('tp_um_token'); if (t) return t;
  const r = await fetch(u.api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u.user, password: u.pass }) });
  if (!r.ok) throw new Error('Umamiにログインできません。ユーザー名とパスワードを確かめてください');
  t = (await r.json()).token; ss.set('tp_um_token', t); return t;
}
async function uReq(path, params = {}) {
  const u = um(); if (!umReady()) throw new Error('Umamiの設定がまだです');
  const qs = new URLSearchParams(params).toString();
  const headers = { Accept: 'application/json' };
  if (u.mode === 'cloud') headers['x-umami-api-key'] = u.key; else headers.Authorization = 'Bearer ' + await uToken();
  let r;
  try { r = await fetch(`${u.api}/websites/${encodeURIComponent(u.site)}${path}${qs ? '?' + qs : ''}`, { headers }); }
  catch (e) { throw new Error('Umamiにつながりません（アドレスを確かめてください）'); }
  if (r.status === 401) { ss.set('tp_um_token', ''); throw new Error('UmamiのAPIキー（またはログイン）が正しくありません'); }
  if (r.status === 404) throw new Error('UmamiのウェブサイトIDが違うか、この機能に対応していません');
  if (!r.ok) throw new Error('Umamiから数字を受け取れませんでした（' + r.status + '）');
  return r.json();
}
let range = '7', geo = 'region', demo = false;
$('#rangeTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; $$('#rangeTabs button').forEach(x => x.classList.toggle('on', x === b)); loadStats(); });
$('#geoTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; geo = b.dataset.g; $$('#geoTabs button').forEach(x => x.classList.toggle('on', x === b)); loadGeo(); });
$('#printBtn').addEventListener('click', () => window.print());
$('#heatBtn').addEventListener('click', () => $('.heat-box').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('#heatOnSite').addEventListener('click', () => window.open('../index.html?heatmap=1', '_blank', 'noopener'));
function span() {
  const end = Date.now(), d = new Date(); d.setHours(0, 0, 0, 0);
  if (range !== 'today') d.setDate(d.getDate() - (+range - 1));
  return { startAt: d.getTime(), endAt: end, unit: range === 'today' ? 'hour' : 'day', timezone: 'Asia/Tokyo' };
}
const val = x => (x && typeof x === 'object') ? (x.value ?? 0) : (x ?? 0);
const SECS = ['トップ画像', 'お知らせ', '私たちの使命', '恵那たんぽぽを知る', 'インスタグラム', 'お問い合わせ', 'バナー', 'フッター'];
const PAGES = { '/': 'トップページ', '/index.html': 'トップページ', '/about.html': '恵那たんぽぽについて', '/company.html': '法人概要', '/greeting.html': '理事長あいさつ', '/shien-system.html': '支援システム', '/information.html': '情報公開', '/work.html': 'たんぽぽの仕事', '/service.html': '事業所・店舗・製品', '/group-home.html': 'グループホーム', '/type-a.html': 'A型事業 店舗・工場', '/guide.html': 'ご利用案内', '/visit.html': '施設見学', '/recruit.html': '採用情報', '/news.html': 'お知らせ', '/news-detail.html': 'お知らせ（詳細）', '/contact.html': 'お問い合わせ' };
const PREF = ['', '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
let regionName; try { regionName = new Intl.DisplayNames(['ja'], { type: 'region' }); } catch (e) {}
const geoLabel = x => { if (!x) return '不明'; if (geo === 'country') return (regionName && regionName.of(x)) || x; if (geo === 'region') { const m = String(x).match(/^JP-(\d{2})$/); return m ? PREF[+m[1]] : x; } return x; };
const pageLabel = x => { const k = String(x || '/').replace(/\?.*$/, '').replace(/^.*?(\/[a-z0-9\-]*\.html)$/i, '$1'); return PAGES[k] || PAGES[x] || x; };
const devLabel = x => ({ desktop: 'パソコン', laptop: 'パソコン（ノート）', mobile: 'スマホ', tablet: 'タブレット' }[x] || x);
function rank(el, rows, label = x => x) {
  if (!rows || !rows.length) { el.innerHTML = '<li class="none">まだありません</li>'; return; }
  const merged = {}; rows.forEach(r => { const k = label(r.x); merged[k] = (merged[k] || 0) + (+r.y || 0); });
  const arr = Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, 10), max = arr[0][1] || 1;
  el.innerHTML = arr.map(([k, n]) => `<li><i style="width:${n * 100 / max}%"></i><span>${esc(k)}</span><b>${num(n)}</b></li>`).join('');
}
const fmtTime = s => { s = Math.round(s); if (!s) return '0秒'; const m = Math.floor(s / 60); return (m ? m + '分' : '') + (s % 60) + '秒'; };
let lastMetrics = null;
async function get(path, params) { return demo ? demoData(path, params) : uReq(path, params); }
async function loadStats() {
  const msg = $('#statsMsg');
  $('#umamiLink').href = um().dash || 'https://cloud.umami.is/';
  if (!umReady() && !demo) {
    msg.hidden = false; msg.innerHTML = 'アクセス状況を見るには、右上の「設定」で Umami をつないでください。<button class="btn line" type="button" id="demoBtn" style="margin-left:10px">見本の数字で表示してみる</button>';
    $('#demoBtn').onclick = () => { demo = true; loadStats(); }; $('#statsBody').style.opacity = .35; return;
  }
  msg.hidden = !demo; if (demo) msg.innerHTML = '※いま表示しているのは<b>見本の数字</b>です。Umami をつなぐと本当の数字になります。';
  $('#statsBody').style.opacity = 1;
  const p = span();
  try {
    const [st, pv, ev, pages, refs, devs, act] = await Promise.all([
      get('/stats', p), get('/pageviews', p), get('/metrics', { ...p, type: 'event', limit: 100 }), get('/metrics', { ...p, type: 'url', limit: 50 }),
      get('/metrics', { ...p, type: 'referrer', limit: 20 }), get('/metrics', { ...p, type: 'device', limit: 10 }), get('/active').catch(() => null)
    ]);
    const visitors = val(st.visitors), visits = val(st.visits), pvs = val(st.pageviews), bounces = val(st.bounces), tt = val(st.totaltime);
    $('#k-vis').textContent = num(visitors) + '人'; $('#k-visits').textContent = num(visits) + '回'; $('#k-pv').textContent = num(pvs) + '回';
    $('#k-time').textContent = visits ? fmtTime(tt / visits) : '–'; $('#k-bounce').textContent = visits ? Math.round(bounces * 100 / visits) + '%' : '–';
    $('#r-per').textContent = visitors ? (visits / visitors).toFixed(1) + '回' : '–'; $('#r-rep').textContent = visitors ? num(Math.max(0, visits - visitors)) + '回' : '–';
    const a = act ? (act.visitors ?? act.x ?? act.value ?? (Array.isArray(act) ? act.length : 0)) : null;
    $('#liveNow').hidden = a === null; $('#liveNow').textContent = 'いま見ている人：' + (a || 0) + '人';
    drawDays(pv.pageviews || [], pv.sessions || []);
    const evs = ev || [];
    renderSecs(evs);
    rank($('#btnList'), evs.filter(e => /^btn:/.test(e.x)), x => x.replace(/^btn:/, ''));
    rank($('#linkList'), evs.filter(e => /^link:/.test(e.x)), x => x.replace(/^link:/, ''));
    rank($('#pageList'), pages, pageLabel);
    rank($('#refList'), refs, x => x || '（直接・ブックマーク）');
    rank($('#devList'), devs, devLabel);
    loadGeo(); loadWeek();
  } catch (e) { msg.hidden = false; msg.textContent = e.message; }
}
async function loadGeo() { try { rank($('#geoList'), await get('/metrics', { ...span(), type: geo, limit: 20 }), geoLabel); } catch (e) { $('#geoList').innerHTML = `<li class="none">${esc(e.message)}</li>`; } }
async function loadWeek() {
  const t = $('#weekTbl'); let w;
  try { w = await get('/sessions/weekly', span()); } catch (e) { t.innerHTML = '<tr><td style="background:none;color:var(--muted);width:auto">（このUmamiでは表示できません）</td></tr>'; return; }
  if (!Array.isArray(w) || w.length !== 7) { t.innerHTML = ''; return; }
  const max = Math.max(1, ...w.flat()), D = ['日', '月', '火', '水', '木', '金', '土'];
  let h = '<tr><th></th>' + [...Array(24)].map((_, i) => `<th>${i % 3 === 0 ? i + '時' : ''}</th>`).join('') + '</tr>';
  w.forEach((row, d) => { h += `<tr><th>${D[d]}</th>` + row.map(n => `<td style="${n ? `background:rgba(63,107,58,${.18 + .82 * n / max})` : ''}" title="${D[d]}曜 ${n}回">${n || ''}</td>`).join('') + '</tr>'; });
  t.innerHTML = h;
}
function renderSecs(evs) {
  const c = {}; evs.filter(e => /^sec:/.test(e.x)).forEach(e => c[e.x.slice(4)] = (c[e.x.slice(4)] || 0) + (+e.y || 0));
  const base = Math.max(c['トップ画像'] || 0, ...Object.values(c), 0);
  const color = p => p >= 90 ? '#E62A1E' : p >= 70 ? '#EC7A12' : p >= 50 ? '#E3C21A' : p >= 30 ? '#3CB95A' : '#2C90D8';
  $('#secList').innerHTML = SECS.map(n => { const v = c[n] || 0, p = base ? Math.round(v * 100 / base) : 0; return `<li style="background:${base ? color(p) : '#5B6656'}"><span>${esc(n)}</span><b>${base ? p + '%' : '–'}</b><small>${v}回</small></li>`; }).join('');
  ls.set('tp_heat', JSON.stringify({ base, sec: c, label: ({ today: '今日', 7: '7日間', 30: '30日間', 90: '90日間' })[range] }));
}
function drawDays(a, b) {
  const box = $('#dayChart'); const W = box.clientWidth || 900, H = 260, L = 40, R = 10, T = 12, B = 30;
  const keyOf = x => String(x).slice(0, range === 'today' ? 13 : 10);
  const bm = {}; b.forEach(p => bm[keyOf(p.x)] = p.y);
  let pts = a.map(p => ({ k: keyOf(p.x), a: +p.y || 0, b: +bm[keyOf(p.x)] || 0 }));
  if (!pts.length) { box.innerHTML = '<p class="note">まだ記録がありません</p>'; return; }
  const max = Math.max(4, ...pts.map(p => Math.max(p.a, p.b))); const step = Math.ceil(max / 4); const top = step * 4;
  const bw = (W - L - R) / pts.length, Y = v => T + (H - T - B) * (1 - v / top);
  let g = ''; for (let v = 0; v <= top; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E7EBE3"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="#454C41">${v}</text>`;
  const every = Math.ceil(pts.length / 10);
  pts.forEach((p, i) => {
    const x = L + i * bw, w1 = Math.min(42, bw * .6), w2 = w1 * .55, cx = x + bw / 2;
    g += `<rect x="${cx - w1 / 2}" y="${Y(p.a)}" width="${w1}" height="${Y(0) - Y(p.a)}" rx="4" fill="#B6CDA9"><title>${p.k}：ページ表示 ${p.a}回</title></rect>`;
    g += `<rect x="${cx - w2 / 2}" y="${Y(p.b)}" width="${w2}" height="${Y(0) - Y(p.b)}" rx="3" fill="#3F6B3A"><title>${p.k}：訪問 ${p.b}回</title></rect>`;
    if (i % every === 0) { const lab = range === 'today' ? (+p.k.slice(11, 13)) + '時' : (+p.k.slice(5, 7)) + '/' + (+p.k.slice(8, 10)); g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="13" fill="#454C41">${lab}</text>`; }
  });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="日ごとのページ表示回数と訪問回数">${g}</svg>`;
}
window.addEventListener('resize', () => { clearTimeout(window._rs); window._rs = setTimeout(loadStats, 300); });

/* 見本の数字（Umamiをつなぐ前に、画面の様子を見るため） */
function demoData(path, p) {
  const days = range === 'today' ? 24 : +range, rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const seed = n => Math.abs(Math.sin(n * 9.7)) ;
  if (path === '/stats') { const k = range === 'today' ? 1 : days / 7; return { pageviews: Math.round(38 * k), visitors: Math.round(14 * k), visits: Math.round(19 * k), bounces: Math.round(5 * k), totaltime: Math.round(19 * k * 190) }; }
  if (path === '/pageviews') { const out = { pageviews: [], sessions: [] }; const d = new Date(p.startAt); for (let i = 0; i < days; i++) { const x = new Date(d); if (range === 'today') x.setHours(i); else x.setDate(d.getDate() + i); const k = ymd(x) + (range === 'today' ? ' ' + pad(i) : '') + ':00:00'; const v = Math.round(2 + seed(i + 1) * 9); out.pageviews.push({ x: k, y: v }); out.sessions.push({ x: k, y: Math.max(1, Math.round(v / 2.6)) }); } return out; }
  if (path === '/active') return { visitors: 1 };
  if (path === '/sessions/weekly') return [...Array(7)].map((_, d) => [...Array(24)].map((_, h) => (h >= 7 && h <= 21 && seed(d * 24 + h) > .72) ? Math.ceil(seed(d + h) * 3) : 0));
  if (p.type === 'event') return [['sec:トップ画像', 40], ['sec:お知らせ', 37], ['sec:私たちの使命', 30], ['sec:恵那たんぽぽを知る', 22], ['sec:インスタグラム', 15], ['sec:お問い合わせ', 13], ['sec:バナー', 10], ['sec:フッター', 9], ['btn:見学申込 施設見学を申し込む', 5], ['btn:電話 0573264356', 3], ['btn:インスタグラム', 4], ['link:採用情報', 9], ['link:施設見学', 7], ['link:グループホーム', 4], ['link:事業所・店舗', 6]].map(([x, y]) => ({ x, y }));
  if (p.type === 'url') return [['/index.html', 41], ['/recruit.html', 12], ['/visit.html', 9], ['/service.html', 8], ['/group-home.html', 5], ['/about.html', 4]].map(([x, y]) => ({ x, y }));
  if (p.type === 'referrer') return [['', 20], ['google.com', 11], ['instagram.com', 6], ['yahoo.co.jp', 3]].map(([x, y]) => ({ x, y }));
  if (p.type === 'device') return [['mobile', 13], ['desktop', 6], ['tablet', 1]].map(([x, y]) => ({ x, y }));
  if (p.type === 'country') return [{ x: 'JP', y: 19 }, { x: 'US', y: 1 }];
  if (p.type === 'region') return [{ x: 'JP-21', y: 15 }, { x: 'JP-23', y: 3 }, { x: 'JP-13', y: 1 }];
  if (p.type === 'city') return [{ x: 'Ena', y: 9 }, { x: 'Nakatsugawa', y: 5 }, { x: 'Nagoya', y: 3 }];
  return [];
}

/* ============ はじめ ============ */
function start() {
  $('#app').hidden = false; $('#siteName').textContent = CFG.siteName || '';
  resetForm(); showConn(); loadData(); loadStats();
}
unlock();
})();
