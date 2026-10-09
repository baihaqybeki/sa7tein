#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bundle migrasi — menggabungkan supabase/migrations/*.sql menjadi SATU berkas
(supabase/apply-all.sql) agar bisa ditempel sekali di SQL Editor Supabase.

Kenapa: cloud Supabase tidak kita punya kredensial psql-nya, jadi jalur termudah
adalah satu skrip untuk ditempel. Lihat docs/backend/MIGRATION-RUNBOOK.md §5.

Berkas gabungan ini DI-GENERATE. Jangan diedit langsung: ubah berkas migrasi
(atau ERD.md lalu `npm run db:migrations:sync`), lalu jalankan ulang skrip ini.

Pemakaian:
    /usr/bin/python3 scripts/bundle-migrations.py            # tulis ulang
    /usr/bin/python3 scripts/bundle-migrations.py --check    # exit 1 bila basi
"""

import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG_DIR = os.path.join(ROOT, 'supabase', 'migrations')
OUT = os.path.join(ROOT, 'supabase', 'apply-all.sql')

HEADER = """-- ============================================================
--  Sa7tein — SEMUA MIGRASI (0000-0006) dalam satu berkas
--
--  ⚠️  DESTRUKTIF. Berkas ini menghapus 7 tabel skema lama BESERTA SELURUH
--      ISINYA (bagian 0000). Jalankan HANYA setelah backup.
--      Backup sebelum perubahan: supabase/backup-legacy-*/ (lihat catatan di
--      docs/backend/MIGRATION-RUNBOOK.md §2).
--
--  Cara pakai (SQL Editor Supabase):
--    1. Supabase Dashboard -> SQL Editor -> New query
--    2. Tempel SELURUH isi berkas ini, lalu Run
--    3. Jalankan `npm run db:remote-check` untuk memastikan hasilnya
--
--  Catatan:
--   * Bagian 0005 berisi data DEMO (4 user, 1 merchant, 4 menu, 3 wallet).
--     Kalau tidak mau, hapus bagian 0005 sebelum Run.
--   * Berkas ini di-GENERATE oleh `npm run db:migrations:bundle` — jangan
--     diedit langsung.
-- ============================================================

"""


def build():
    files = sorted(glob.glob(os.path.join(MIG_DIR, '*.sql')))
    if not files:
        sys.exit('GAGAL: tidak ada berkas di supabase/migrations/')
    parts = [HEADER]
    for f in files:
        name = os.path.basename(f)
        body = open(f).read().rstrip('\n')
        parts.append(
            f'\n-- ########## {name} ##########\n'
            f'-- (sumber: supabase/migrations/{name}, {len(body.splitlines())} baris)\n\n'
            f'{body}\n'
        )
    parts.append('\n-- ########## SELESAI ##########\n')
    return ''.join(parts), files


def main():
    content, files = build()
    if '--check' in sys.argv:
        current = open(OUT).read() if os.path.exists(OUT) else None
        if current != content:
            print('GAGAL: supabase/apply-all.sql basi — jalankan db:migrations:bundle')
            return 1
        print(f'OK: apply-all.sql sinkron dengan {len(files)} berkas migrasi')
        return 0
    open(OUT, 'w').write(content)
    print(f'apply-all.sql ditulis dari {len(files)} berkas:')
    for f in files:
        print(f'  - {os.path.basename(f)}')
    print(f'total: {len(content.splitlines())} baris')
    return 0


if __name__ == '__main__':
    sys.exit(main())
