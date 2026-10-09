#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sync migrasi dari ERD — `docs/backend/ERD.md` adalah sumber kanonik DDL.

Tiga blok ```sql di ERD.md (fase 1/2/3) di-generate ulang menjadi:
    supabase/migrations/0001_identity_catalog.sql
    supabase/migrations/0002_order_money.sql
    supabase/migrations/0003_ops_platform.sql

Tujuannya: dokumen dan migrasi tidak bisa drift. File migrasi JANGAN diedit langsung.

Pemakaian:  /usr/bin/python3 scripts/sync-migrations.py [--check]
            --check  : keluar 1 bila file migrasi berbeda dengan hasil generate (untuk CI)
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ERD = os.path.join(ROOT, 'docs', 'backend', 'ERD.md')
OUT = os.path.join(ROOT, 'supabase', 'migrations')

META = [
    ('0001_identity_catalog.sql', 'Fase 1 (M2) — identitas & katalog',
     'ERD.md §3. Bergantung pada: 0000_drop_legacy.sql.'),
    ('0002_order_money.sql', 'Fase 2 (M3) — order & uang',
     'ERD.md §4. Bergantung pada: 0001_identity_catalog.sql.'),
    ('0003_ops_platform.sql', 'Fase 3 (M4) — ops & platform',
     'ERD.md §5. Bergantung pada: 0001 + 0002.'),
]


def header(title, dep):
    return (
        '-- ============================================================\n'
        f'--  Sa7tein — {title}\n'
        f'--  Sumber kanonik: docs/backend/{dep}\n'
        '--  DDL ini di-generate dari ERD.md supaya dokumen & migrasi tidak drift.\n'
        '--  JANGAN edit file ini langsung — ubah ERD.md lalu jalankan\n'
        '--  `npm run db:migrations:sync`.\n'
        '-- ============================================================\n\n'
    )


def main():
    check_only = '--check' in sys.argv
    erd = open(ERD).read()
    blocks = re.findall(r'```sql\n(.*?)```', erd, re.S)
    if len(blocks) != 3:
        sys.exit(f'GAGAL: ERD.md harus punya 3 blok ```sql (fase 1/2/3), ditemukan {len(blocks)}')

    os.makedirs(OUT, exist_ok=True)
    drift = []
    for (fname, title, dep), body in zip(META, blocks):
        want = header(title, dep) + body.strip('\n') + '\n'
        path = os.path.join(OUT, fname)
        have = open(path).read() if os.path.exists(path) else None
        if have == want:
            print(f'  ok     {fname}')
            continue
        if check_only:
            drift.append(fname)
            print(f'  DRIFT  {fname}')
        else:
            open(path, 'w').write(want)
            print(f'  tulis  {fname}  ({want.count(chr(10))} baris)')

    if check_only and drift:
        print('\nGAGAL: migrasi tidak sinkron dengan ERD.md — jalankan tanpa --check')
        return 1
    if check_only:
        print('\nLULUS: migrasi sinkron dengan ERD.md')
    return 0


if __name__ == '__main__':
    sys.exit(main())
