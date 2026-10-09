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
     termasuk objek yang ditampung variabel (`const row = {...}`) atau dibangun
     lewat `.map((x) => ({...}))`
  4. `.insert`/`.upsert` wajib mengisi kolom NOT NULL yang tidak punya default,
     dan nilainya tidak boleh `null` / `... ?? null`
  5. argumen `.eq/.in/.is/.gt/.gte/.lt/.order/.neq('kolom')` → kolom ada
  6. relasi bersarang → ada FK dari tabel anak ke tabel induk (syarat PostgREST)
  7. daftar tabel di `resetDemo()` (dipakai via variabel) → tabel ada

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
TARGET = os.environ.get(
    'AUDIT_TARGET',
    os.path.join(ROOT, 'packages', 'shared', 'src', 'lib', 'backend', 'irbidBackend.js'),
)
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
    # Kolom wajib: NOT NULL tanpa default dan bukan identity.
    required = {}
    for line in psql("select table_name, column_name from information_schema.columns "
                     "where table_schema='public' and is_nullable='NO' "
                     "and column_default is null and is_identity='NO'").splitlines():
        t, c = line.split('|')
        required.setdefault(t, set()).add(c)
    return cols, fks, (fk_rows, total_fk, fk_luar), required


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


def match_pair(s, i, open_ch, close_ch):
    """i = indeks karakter pembuka -> indeks tepat setelah pasangannya."""
    depth = 0
    while i < len(s):
        if s[i] == open_ch:
            depth += 1
        elif s[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(s)


def object_entries(body):
    """Isi di dalam { } -> {key: nilai} untuk key tingkat atas saja."""
    out = {}
    depth, buf, parts = 0, '', []
    for ch in body:
        if ch in '{[(':
            depth += 1
        elif ch in '}])':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(buf)
            buf = ''
        else:
            buf += ch
    parts.append(buf)
    for p in parts:
        # Buang komentar baris dulu: `a: 1, // catatan\n b: 2` membuat bagian
        # berikutnya ikut menempel di belakang komentar dan kuncinya hilang.
        p = re.sub(r'//[^\n]*', '', p)
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", p, re.S)
        if m:
            out[m.group(1)] = ' '.join(m.group(2).split())
            continue
        # properti singkat: { role, phone } == { role: role, phone: phone }
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*$", p)
        if m:
            out[m.group(1)] = m.group(1)
    return out


def insert_objects(arg, src, abs_pos):
    """Cari object literal pada argumen insert/update/upsert.

    Menangani: `{...}` langsung, variabel (`const row = {...}`), dan objek yang
    dibangun `.map((x) => ({...}))` (dulu luput dari pemeriksaan).
    `abs_pos` = posisi panggilan insert di dalam src, supaya `const NAME =` yang
    diambil adalah yang TERDEKAT SEBELUMNYA, bukan kemunculan pertama di berkas.
    """
    objs = []
    cands = []
    t = arg.strip()
    if t.startswith('{'):
        return [t[1:match_pair(t, 0, '{', '}') - 1]]
    expr = t
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)', t)
    if m:
        best = None
        for am in re.finditer(r'\bconst\s+' + re.escape(m.group(1)) + r'\s*=\s*', src):
            if am.end() <= abs_pos:
                best = am
        if best:
            rest = src[best.end():]
            depth, cut = 0, len(rest)
            for i, ch in enumerate(rest):        # batasi sampai akhir pernyataan
                if ch in '([{':
                    depth += 1
                elif ch in ')]}':
                    depth -= 1
                elif ch == ';' and depth == 0:
                    cut = i
                    break
            expr = rest[:cut]
    blocks = []
    for om in re.finditer(r'=>\s*\(?\s*\{', expr):
        st = expr.index('{', om.start())
        en = match_pair(expr, st, '{', '}') - 1
        inner = expr[st + 1:en]
        rm = re.search(r'\breturn\s*\{', inner)
        if rm:
            # `=> { ... return {baris} }` = badan blok. Yang jadi baris insert
            # hanya objek setelah `return`, BUKAN objek lain di dalam blok
            # (mis. `const modifiers = xs.map((x) => ({...}))` di atasnya).
            rst = st + 1 + inner.index('{', rm.start())
            ren = match_pair(expr, rst, '{', '}') - 1
            blocks.append((st, en))
            cands.append((rst, ren))
            continue
        if any(bs < st < be for bs, be in blocks):
            continue          # objek perantara di dalam badan blok -> bukan baris
        cands.append((st, en))
    if not cands:
        e = expr.lstrip()
        if e.startswith('{'):
            expr = e
            cands.append((0, match_pair(e, 0, '{', '}') - 1))
    # Buang objek yang bersarang di dalam objek lain: baris insert = objek TERLUAR.
    # (Kalau tidak, objek di dalam `.map()` bertingkat ikut diperiksa sebagai baris.)
    cands.sort()
    kept = []
    for st, en in cands:
        if kept and st < kept[-1][1]:
            continue
        kept.append((st, en))
    return [expr[st + 1:en] for st, en in kept]


def audit_adapter(src, cols, fks, required):
    consts = resolve_constants(src)
    problems = []
    table_refs = set()
    column_checks = 0
    relation_checks = 0
    insert_checks = 0
    insert_skipped = 0

    # 1-4) rantai per `.from(...)`
    froms = list(re.finditer(r"\.from\(\s*'([a-z_]+)'\s*\)|\.from\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)", src))
    for i, m in enumerate(froms):
        if m.group(1) is None:
            continue  # from(variabel) → ditangani di (6)
        table = m.group(1)
        table_refs.add(table)
        end = froms[i + 1].start() if i + 1 < len(froms) else len(src)
        chain = src[m.end():end]
        base = m.end()
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

        # kunci objek insert/update/upsert — termasuk yang lewat variabel/map
        for om in re.finditer(r"\.(insert|update|upsert)\(", chain):
            op = om.group(1)
            arg = chain[om.end():match_pair(chain, om.end() - 1, '(', ')') - 1]
            objs = insert_objects(arg, src, base + om.end())
            if not objs:
                insert_skipped += 1
                continue
            for body in objs:
                entries = object_entries(body)
                insert_checks += 1
                for col, val in entries.items():
                    column_checks += 1
                    if col not in known:
                        problems.append(f'{table}.{col} (di .{op}) tidak ada')
                if op in ('insert', 'upsert'):
                    req = required.get(table, set())
                    for col in sorted(req - set(entries)):
                        problems.append(
                            f'{table}.{col} WAJIB diisi (not null tanpa default) '
                            f'tapi tidak ada di .{op}')
                    for col, val in entries.items():
                        if col in req and (val == 'null' or val.endswith('?? null')):
                            problems.append(
                                f'{table}.{col} WAJIB diisi tapi nilainya bisa null: {val}')

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

    return problems, table_refs, column_checks, relation_checks, insert_checks, insert_skipped


def main():
    if not os.path.exists(TARGET):
        sys.exit(f'GAGAL: {TARGET} tidak ada')
    src = open(TARGET).read()
    print('TARGET:', os.path.relpath(TARGET, ROOT))
    print('-' * 74)
    cols, fks, (fk_rows, total_fk, fk_luar), required = boot_and_introspect()
    print(f'skema nyata: {len(cols)} tabel; FK {fk_rows} baris / {len(fks)} pasangan unik; '
          f'total pg_constraint {total_fk} ({fk_luar} menunjuk ke luar public)\n')
    problems, refs, cchecks, rchecks, ichecks, iskip = audit_adapter(src, cols, fks, required)
    print(f'tabel dirujuk              : {len(refs)}')
    print(f'kolom diperiksa            : {cchecks}')
    print(f'relasi bersarang diperiksa : {rchecks}')
    print(f'objek insert/update diperiksa: {ichecks}  (insert dinamis dilewati: {iskip})')
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
