# -*- coding: utf-8 -*-
"""
たんぽぽ福祉会ホームページ　自動バージョンアップ

ページや画像を更新したあとに、このファイルを実行してください。
（Windows: 「更新する.bat」をダブルクリック / Mac: 「更新する.command」をダブルクリック）

やること
  1. サイト内のファイルの変更を調べる
  2. 変更があれば、バージョン番号を 1 つ上げる（例 1.0.3 → 1.0.4）
  3. 全ページのフッターに「Ver.〇〇／最終更新日」を書き込む
  4. CSS・JS・画像の読み込み先に版番号を付け、見る人のブラウザに古い表示が残らないようにする
  5. 変更したファイルを「更新履歴.txt」に記録する
"""
import hashlib, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, 'version.json')
LOG = os.path.join(ROOT, '更新履歴.txt')
SKIP_DIRS = {'.git', '__pycache__', 'data', 'uploads', 'files'}
SKIP_FILES = {'version.json', '更新履歴.txt', 'update_version.py', '更新する.bat', '更新する.command', '管理画面の使い方.txt', '管理ページの使い方.txt'}

def file_hash(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()[:10]

def strip_stamps(text):
    """ハッシュ計算用：自動で書き込む部分を取り除いた内容"""
    text = re.sub(r'<!--VER-->.*?<!--/VER-->', '', text, flags=re.S)
    text = re.sub(r'\?v=[0-9a-f]{6,12}', '', text)
    return text

def content_hash(path):
    if path.endswith('.html'):
        with open(path, encoding='utf-8') as f:
            return hashlib.md5(strip_stamps(f.read()).encode('utf-8')).hexdigest()[:10]
    return file_hash(path)

def all_files():
    out = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for fn in files:
            if fn in SKIP_FILES or fn.startswith('.'):
                continue
            p = os.path.join(d, fn)
            out.append(os.path.relpath(p, ROOT).replace(os.sep, '/'))
    return sorted(out)

def bump(ver):
    a, b, c = (int(x) for x in ver.split('.'))
    return f'{a}.{b}.{c + 1}'

def main(force=False):
    state = {'version': '1.0.0', 'updated': '', 'files': {}}
    if os.path.exists(STATE):
        with open(STATE, encoding='utf-8') as f:
            state = json.load(f)
    old = state.get('files', {})
    files = all_files()
    cur = {p: content_hash(os.path.join(ROOT, p)) for p in files}
    added = [p for p in files if p not in old]
    changed = [p for p in files if p in old and old[p] != cur[p]]
    removed = [p for p in old if p not in cur]
    first = not old

    if not (added or changed or removed or force) and not first:
        print('変更はありません。バージョンは', state['version'], 'のままです。')
        return

    today = datetime.date.today()
    if not first:
        state['version'] = bump(state['version'])
    state['updated'] = today.isoformat()
    ver = state['version']
    date_jp = f'{today.year}年{today.month}月{today.day}日'

    # HTML に版番号と更新日を書き込む
    stamp = f'<!--VER--><span class="site-ver">Ver.{ver}／最終更新 {date_jp}</span><!--/VER-->'
    asset_re = re.compile(r'((?:href|src|poster)=")((?:css|js|img|video|docs)/[^"?#]+)(?:\?v=[0-9a-f]{6,12})?(")')
    for p in files:
        if not p.endswith('.html'):
            continue
        fp = os.path.join(ROOT, p)
        with open(fp, encoding='utf-8') as f:
            s = f.read()
        def add_v(m):
            ref = m.group(2)
            h = cur.get(ref)
            return m.group(1) + ref + (f'?v={h}' if h else '') + m.group(3)
        s = asset_re.sub(add_v, s)
        if '<!--VER-->' in s:
            s = re.sub(r'<!--VER-->.*?<!--/VER-->', stamp, s, flags=re.S)
        else:
            s = s.replace('<span class="en">© Enatanpopo. All rights reserved.</span>',
                          stamp + '<span class="en">© Enatanpopo. All rights reserved.</span>', 1)
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(s)

    # 書き込み後の状態を保存
    state['files'] = {p: content_hash(os.path.join(ROOT, p)) for p in all_files()}
    with open(STATE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)

    lines = [f'■ Ver.{ver}　{date_jp}']
    if first:
        lines.append('  初回登録')
    for label, items in (('追加', added), ('変更', changed), ('削除', removed)):
        for it in items:
            lines.append(f'  {label}：{it}')
    if force and not (added or changed or removed):
        lines.append('  手動でバージョンを更新')
    prev = ''
    if os.path.exists(LOG):
        with open(LOG, encoding='utf-8') as f:
            prev = f.read()
    with open(LOG, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n\n' + prev)

    print(f'バージョンを Ver.{ver} にしました（{date_jp}）')
    print(f'  追加 {len(added)} / 変更 {len(changed)} / 削除 {len(removed)} ファイル')

if __name__ == '__main__':
    main(force='--force' in sys.argv)
