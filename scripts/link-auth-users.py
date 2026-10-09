#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hubungkan akun Supabase Auth ke tabel `users` (kolom `auth_user_id`).

Kenapa perlu: `0005_seed_irbid.sql` membuat 4 baris `public.users` TANPA
`auth_user_id` (akun auth tidak bisa dibuat lewat SQL biasa). Akibatnya login
lolos di Supabase Auth tetapi RLS & `loadUserRow()` tidak menemukan profil
(`users.auth_user_id = auth.uid()` → null) sehingga aplikasi menolak:
"This account has no profile in the new schema."

Skrip ini memakai Admin API (butuh `SUPABASE_SERVICE_ROLE_KEY`) untuk membaca
akun auth, mencocokkannya dengan `public.users` berdasarkan email, lalu mengisi
`auth_user_id` yang masih kosong. Idempotent — aman dijalankan berulang.

Pemakaian:
    /usr/bin/python3 scripts/link-auth-users.py            # dry-run (lihat rencana)
    /usr/bin/python3 scripts/link-auth-users.py --apply    # tulis perubahan
"""

import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env(name):
    p = os.path.join(ROOT, '.env')
    if not os.path.exists(p):
        return ''
    for line in open(p, encoding='utf-8'):
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


def req(url, key, method='GET', body=None, extra=None):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
        headers['Prefer'] = 'return=representation'
    headers.update(extra or {})
    r = urllib.request.Request(url, method=method, headers=headers,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=25) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def main():
    apply_changes = '--apply' in sys.argv
    url, key = env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print('SKIP: .env belum berisi VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
        return 0

    code, auth = req(f'{url}/auth/v1/admin/users?per_page=1000', key)
    if code != 200:
        print(f'GAGAL membaca akun auth (HTTP {code}): {auth}')
        return 1
    auth_users = auth.get('users', []) if isinstance(auth, dict) else auth
    by_email = {u.get('email'): u.get('id') for u in auth_users if u.get('email')}
    print(f'akun auth: {len(auth_users)}')

    code, rows = req(f'{url}/rest/v1/users?select=id,role,email,auth_user_id&order=id', key)
    if code != 200:
        print(f'GAGAL membaca public.users (HTTP {code}): {rows}')
        return 1
    print(f'baris public.users: {len(rows)}\n')

    todo, already, no_auth = [], [], []
    for r in rows:
        if r['auth_user_id']:
            already.append(r['email'])
        elif r['email'] in by_email:
            todo.append((r['id'], r['role'], r['email'], by_email[r['email']]))
        else:
            no_auth.append(r['email'])

    for e in already:
        print(f'  ok    sudah terhubung: {e}')
    for e in no_auth:
        print(f'  warn  belum ada akun auth dengan email: {e}')
    for uid, role, email, auid in todo:
        print(f'  {">>>" if apply_changes else "..."} {role:<9} {email} -> {auid}')

    if not todo:
        print('\nTIDAK ADA yang perlu diubah.')
        return 0
    if not apply_changes:
        print(f'\nDRY-RUN: {len(todo)} baris siap dihubungkan. Jalankan ulang dengan --apply.')
        return 0

    gagal = 0
    for uid, role, email, auid in todo:
        code, out = req(f'{url}/rest/v1/users?id=eq.{uid}', key, method='PATCH',
                        body={'auth_user_id': auid})
        if code in (200, 201, 204):
            print(f'  ok    {email} terhubung')
        else:
            gagal += 1
            print(f'  GAGAL {email} (HTTP {code}): {out}')

    print(f'\nselesai: {len(todo) - gagal} terhubung, {gagal} gagal')
    return 1 if gagal else 0


if __name__ == '__main__':
    sys.exit(main())
