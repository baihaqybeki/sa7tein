#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit adapter ↔ skema — memastikan setiap tabel, kolom, dan relasi yang dirujuk
`irbidBackend.js` benar-benar ada di skema nyata (docs/backend/ERD.md → migrasi).

Kenapa perlu: Supabase/PostgREST tidak punya type-check. Salah nama kolom baru
ketahuan saat runtime (di produksi, di depan user). Skrip ini menangkapnya statis
dengan membandingkan terhadap database yang benar-benar dibangun dari migrasi.

Yang diperiksa:
  1. `.from('tabel')`               → tabel ada
  2. kolom di `.select('...')`      → kolom ada di tabel itu
     termasuk bentuk bersarang: `dependen(kolom, ...)` dan alias `x:tabel(kolom)`
  3. kunci objek `.insert/.update/.upsert({...})` → kolom ada
  4. argumen `.eq/.in/.is/.gt/.gte/.lt/.order/.neq('kolom')` → kolom ada
  5. relasi bersarang → ada FK dari tabel anak ke tabel induk (syarat PostgREST)
  6. daftar tabel di `resetDemo()` (dipakai via variabel) → tabel ada

Pemakaian:
    /usr/bin/python3 scripts/audit-backend-schema.py [port]

Keluar 1 bila ada rujukan yang tidak dikenal.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = os.path.join(ROOT, 'supabase', 'migrations')
TARGET = os.path.join(ROOT, 'packages', 'shared', 'src', 'lib', 'backend', 'irbidBackend.js')
PG = os.environ.get('PG_BIN', '/usr/local/bin')
PORT = sys.argv[1] if len(sys.argv) > 1 else '55470'
PGDATA = f'/tmp/sa7tein-audit-pg-{PORT}'
DB = 'schema_audit'


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def boot_and_introspect():
    for b in ('initdb', 'pg_ctl', 'psql', 'createdb', 'pg_isready'):
        if not os.path.exists(os.path.join(PG, b)):
            print(f'SKIP: {PG}/{b} tidak ada (set PG_BIN)')
            sys.exit(0)
    shutil.rmtree(PGDATA, ignore_errors=True)
    r = sh([f'{PG}/initdb', '-D', PGDATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'])
    if r.returncode:
        sys.exit('GAGAL initdb: ' + r.stderr[-400:])
    sh([f'{PG}/pg_ctl', '-D', PGDATA, '-l', f'/tmp/audit-pg-{PORT}.log',
        '-o', f"-p {PORT} -k /tmp -c listen_addresses=''", 'start'])
    for _ in range(40):
        if sh([f'{PG}/pg_isready', '-h', '/tmp', '-p', PORT, '-U', 'postgres']).returncode == 0:
            break
        time.sleep(0.25)
    sh([f'{PG}/createdb', '-h', '/tmp', '-p', PORT, '-U', 'postgres', DB])

    def psql(sql):
        return sh([f'{PG}/psql', '-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', DB,
                   '-t', '-A', '-F', '|', '-c', sql]).stdout.strip()

    psql("create schema if not exists auth; "
         "create table if not exists auth.users (id uuid primary key, email text); "
         "create or replace function auth.uid() returns uuid language sql stable as "
         "'select null::uuid';")
    for f in sorted(os.listdir(MIG)):
        if not f.endswith('.sql'):
            continue
        r = sh([f'{PG}/psql', '-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', DB,
                '-v', 'ON_ERROR_STOP=1', '-q', '-f', os.path.join(MIG, f)])
        if r.returncode:
            sys.exit(f'GAGAL migrasi {f}: ' + r.stderr[-400:])

    cols = {}
    for line in psql("select table_name, column_name from information_schema.columns "
                     "where table_schema='public' order by table_name, ordinal_position").splitlines():
        t, c = line.split('|')
        cols.setdefault(t, set()).add(c)
    fks = set()
    fk_rows = 0
    for line in psql("select conrelid::regclass::text, confrelid::regclass::text from pg_constraint "
                     "where contype='f' and connamespace='public'::regnamespace").splitlines():
        child, parent = line.split('|')
        fks.add((child, parent))
        fk_rows += 1
    total_fk = int(psql("select count(*) from pg_constraint where contype='f'") or 0)
    fk_luar = int(psql("select count(*) from pg_constraint c join pg_class t on t.oid=c.confrelid "
                       "join pg_namespace n on n.oid=t.relnamespace where c.contype='f' "
                       "and n.nspname <> 'public'") or 0)
    return cols, fks, (fk_rows, total_fk, fk_luar)


def cleanup():
    sh([f'{PG}/pg_ctl', '-D', PGDATA, 'stop', '-m', 'immediate'])
    shutil.rmtree(PGDATA, ignore_errors=True)


# ---------------------------------------------------------------- parser JS
CHAIN_METHODS = ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'order', 'limit', 'select', 'delete')


def resolve_constants(src):
    """`const X = \\`...\\`` → dipakai di select(X)."""
    out = {}
    for m in re.finditer(r'const\s+([A-Z_][A-Z0-9_]*)\s*=\s*`([^`]*)`', src, re.S):
        out[m.group(1)] = m.group(2)
    return out


def parse_select_list(sel):
    """Kembalikan (kolom_datar, [(relasi, [kolom, ...]), ...])."""
    flat, nested = [], []
    depth, buf, parts = 0, '', []
    for ch in sel:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(buf)
            buf = ''
        else:
            buf += ch
    parts.append(buf)
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m = re.match(r'^(?:([A-Za-z_]+)\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$', p, re.S)
        if m:
            nested.append((m.group(2), parse_select_list(m.group(3))[0]))
            continue
        if p == '*':
            continue
        if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', p):
            flat.append(p)
    return flat, [n for n in nested], nested


def audit_adapter(src, cols, fks):
    consts = resolve_constants(src)
    problems = []
    table_refs = set()
    column_checks = 0
    relation_checks = 0

    # 1-4) rantai per `.from(...)`
    froms = list(re.finditer(r"\.from\(\s*'([a-z_]+)'\s*\)|\.from\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)", src))
    for i, m in enumerate(froms):
        if m.group(1) is None:
            continue  # from(variabel) → ditangani di (6)
        table = m.group(1)
        table_refs.add(table)
        end = froms[i + 1].start() if i + 1 < len(froms) else len(src)
        chain = src[m.end():end]
        known = cols.get(table)
        if known is None:
            problems.append(f'tabel tidak ada: "{table}"')
            continue

        # select — dukung literal, template, dan konstanta: .select(ORDER_SELECT)
        for sm in re.finditer(r"\.select\(\s*('[^']*'|`[^`]*`|[A-Z_][A-Z0-9_]*)", chain, re.S):
            raw = sm.group(1)
            if raw[0] in "'`":
                sel = raw[1:-1]
            else:
                sel = consts.get(raw, '')
                if not sel:
                    problems.append(f'{table}: .select({raw}) — konstanta tidak ditemukan')
            for col in parse_select_list(sel)[0]:
                column_checks += 1
                if col not in known and col != '*':
                    problems.append(f'{table}.{col} (di .select) tidak ada')
            _, _, nested = parse_select_list(sel)
            for rel, rel_cols in nested:
                relation_checks += 1
                if rel not in cols:
                    problems.append(f'{table} → relasi "{rel}" bukan tabel')
                    continue
                for rc in rel_cols:
                    column_checks += 1
                    if rc not in cols[rel]:
                        problems.append(f'{rel}.{rc} (nested di {table}) tidak ada')
                # PostgREST mendukung embed ke induk (anak→induk) maupun ke anak (induk→anak)
                if (rel, table) not in fks and (table, rel) not in fks:
                    problems.append(f'{table} → "{rel}" tanpa FK di kedua arah (PostgREST butuh ini)')

        # kunci objek insert/update/upsert
        for om in re.finditer(r"\.(insert|update|upsert)\(\s*\{([^{}]*)\}", chain, re.S):
            for km in re.finditer(r'(?:^|[\s,{])([a-z_][a-z0-9_]*)\s*:', om.group(2)):
                col = km.group(1)
                column_checks += 1
                if col not in known:
                    problems.append(f'{table}.{col} (di .{om.group(1)}) tidak ada')

        # kolom pada filter & order
        for cm in re.finditer(r"\.(eq|neq|gt|gte|lt|lte|is|in|order)\(\s*'([a-z_]+)'", chain):
            col = cm.group(2)
            column_checks += 1
            if col not in known:
                problems.append(f'{table}.{col} (di .{cm.group(1)}) tidak ada')

    # 6) from(variabel) → array literal terdekat sebelumnya
    for m in re.finditer(r'for\s*\(\s*const\s+(\w+)\s+of\s*\[([^\]]+)\]\s*\)', src):
        var = m.group(1)
        if not re.search(r"\.from\(\s*" + re.escape(var) + r"\s*\)", src[m.end():m.end() + 4000]):
            continue
        for t in re.findall(r"'([a-z_]+)'", m.group(2)):
            table_refs.add(t)
            if t not in cols:
                problems.append(f'tabel tidak ada (via variabel di resetDemo): "{t}"')

    return problems, table_refs, column_checks, relation_checks


def main():
    if not os.path.exists(TARGET):
        sys.exit(f'GAGAL: {TARGET} tidak ada')
    src = open(TARGET).read()
    print('TARGET:', os.path.relpath(TARGET, ROOT))
    print('-' * 74)
    cols, fks, (fk_rows, total_fk, fk_luar) = boot_and_introspect()
    print(f'skema nyata: {len(cols)} tabel; FK {fk_rows} baris / {len(fks)} pasangan unik; '
          f'total pg_constraint {total_fk} ({fk_luar} menunjuk ke luar public)\n')
    problems, refs, cchecks, rchecks = audit_adapter(src, cols, fks)
    print(f'tabel dirujuk            : {len(refs)}')
    print(f'kolom diperiksa          : {cchecks}')
    print(f'relasi bersarang diperiksa: {rchecks}')
    print('-' * 74)
    if problems:
        print(f'HASIL: GAGAL — {len(problems)} rujukan tidak dikenal')
        for p in problems:
            print('  ✗', p)
        return 1
    print('HASIL: LULUS — semua tabel/kolom/relasi yang dirujuk ada di skema')
    return 0


if __name__ == '__main__':
    try:
        code = main()
    finally:
        cleanup()
    sys.exit(code)
