#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cek skema di Supabase CLOUD (read-only) — memastikan migrasi 0000-0006 benar
sudah jalan, sebelum portal di-deploy.

Kenapa: verifikator lain (`db:verify`, `db:e2e`, `db:audit-backend`) memakai
Postgres lokal. Setelah menempel `supabase/apply-all.sql` di SQL Editor, yang
perlu dibuktikan adalah database CLOUD-nya — dan itu hanya bisa lewat REST
(service role), bukan psql.

Yang diperiksa:
  1. setiap tabel hasil migrasi benar-benar ada
  2. tabel yang seharusnya diisi seed (0005) tidak kosong
  3. tabel skema LAMA sudah hilang (bukti 0000 jalan)
  4. kolom kunci ada di beberapa tabel (deteksi tabel bernama sama tapi beda
     struktur, mis. `merchants` lama vs baru)

Pemakaian:
    /usr/bin/python3 scripts/check-remote-schema.py

Exit 1 bila ada tabel yang belum ada.
"""

import glob
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG_DIR = os.path.join(ROOT, 'supabase', 'migrations')

# Tabel yang seharusnya terisi setelah 0005_seed_irbid.sql.
SEEDED = ['zones', 'roles', 'platform_switches', 'users', 'merchants', 'menus', 'wallets']
# Tabel skema lama yang WAJIB sudah tidak ada setelah 0000.
LEGACY = ['profiles', 'menu_items', 'order_messages', 'settings']
# Kolom penanda struktur BARU (kalau tabel ada tapi kolom ini tidak, berarti
# tabel itu sisa skema lama yang namanya kebetulan sama).
MARKERS = {
    'merchants': 'store_name',
    'orders': 'sub_total_jod',
    'couriers': 'availability',
}


def env(name):
    p = os.path.join(ROOT, '.env')
    for line in open(p, encoding='utf-8'):
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


def tables_from_migrations():
    names = set()
    for f in sorted(glob.glob(os.path.join(MIG_DIR, '*.sql'))):
        for m in re.finditer(r'^create table ([a-z_]+) \(', open(f).read(), re.M):
            names.add(m.group(1))
    return sorted(names)


def probe(url, key, table, select='*', limit=0):
    """GET 1 halaman kecil. Kembalikan (status_code, daftar baris / None).

    `select='*'` dipakai untuk cek keberadaan tabel — JANGAN pakai `select=id`,
    karena tidak semua tabel punya kolom `id` (`chat_participants` pakai pk
    gabungan, `platform_switches` pakai `key`). `select=<kolom>` tetap dipakai
    untuk memeriksa kolom tertentu: 200 = kolom ada, 400 = tabel ada tapi kolom
    tidak, 404 = tabel tidak ada.
    """
    req = urllib.request.Request(
        f'{url}/rest/v1/{table}?select={select}&limit={limit}',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b'[]')
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:            # noqa: BLE001 - laporkan apa adanya
        return 0, str(e)


def count_rows(url, key, table):
    """Jumlah baris tepat lewat header Content-Range (Prefer: count=exact)."""
    req = urllib.request.Request(
        f'{url}/rest/v1/{table}?select=*',
        headers={
            'apikey': key, 'Authorization': f'Bearer {key}',
            'Accept': 'application/json', 'Prefer': 'count=exact', 'Range': '0-0',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            cr = r.headers.get('Content-Range', '')      # contoh: "0-0/42"
            return int(cr.split('/')[-1]) if '/' in cr else None
    except Exception:                # noqa: BLE001
        return None


def main():
    url, key = env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print('SKIP: .env belum berisi VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
        return 0
    print(f'project: {url.replace("https://", "")}')
    tables = tables_from_migrations()
    print(f'tabel target (dari migrasi): {len(tables)}\n')

    missing, found = [], []
    for t in tables:
        code, rows = probe(url, key, t)
        if code == 200:
            found.append(t)
        else:
            missing.append((t, code))

    print(f'ADA   : {len(found)}/{len(tables)}')
    if missing:
        print(f'HILANG: {len(missing)}')
        for t, code in missing:
            print(f'  ✗ {t} (HTTP {code})')

    print('\n-- 3. skema lama sudah hilang? --')
    legacy_left = []
    for t in LEGACY:
        code, _ = probe(url, key, t)
        if code == 200:
            legacy_left.append(t)
    if legacy_left:
        print(f'  ✗ masih ada: {", ".join(legacy_left)} -> 0000 belum jalan')
    else:
        print('  ok  tidak ada tabel skema lama yang tersisa')

    print('\n-- 4. struktur baru pada tabel bernama sama --')
    bad_cols = []
    for t, col in MARKERS.items():
        code, _ = probe(url, key, t, select=col, limit=1)
        if code != 200:
            bad_cols.append(f'{t}.{col} (HTTP {code})')
        else:
            print(f'  ok  {t}.{col}')

    print('\n-- 2. tabel seed tidak kosong --')
    empty = []
    for t in SEEDED:
        n = count_rows(url, key, t)
        print(f'  {t}: {"tidak terhitung" if n is None else str(n) + " baris"}')
        if n == 0:
            empty.append(t)

    print('\n' + '-' * 70)
    problems = []
    if missing:
        problems.append(f'{len(missing)} tabel belum ada')
    if legacy_left:
        problems.append('tabel skema lama masih ada (0000 belum jalan)')
    if bad_cols:
        problems.append('struktur tabel belum baru: ' + ', '.join(bad_cols))
    if empty:
        problems.append('tabel seed kosong: ' + ', '.join(empty))
    if problems:
        print('HASIL: BELUM SIAP DEPLOY — ' + '; '.join(problems))
        return 1
    print('HASIL: SIAP — skema baru lengkap, skema lama sudah bersih, seed terisi')
    return 0


if __name__ == '__main__':
    sys.exit(main())
