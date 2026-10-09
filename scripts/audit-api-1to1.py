#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit 1:1 — `docs/backend/openapi.yaml` vs sumber spek di repo `za7tein-pwa`.

Memeriksa:
  A. Entitas + field di `schema-draft-v1.md` -> ada padanannya sebagai schema OpenAPI
  B. Entitas di `flows/INDEX.json` §trace (dan §links) -> ada schema-nya
  C. Nama event di `flows/INDEX.json` §links -> ada di x-realtime
  D. Setiap `entity:` di x-realtime -> ada schema-nya (tidak menggantung)
  E. Setiap id di x-unresolved -> punya `sourceIds` yang bisa ditelusuri ke dokumen sumber
  F. Setiap operation/event/entity di x-traceability -> benar-benar ada di spec
  G. Integritas $ref
  H. YAML valid

Cara pakai:
    /usr/bin/python3 scripts/audit-api-1to1.py [path-ke-repo-za7tein-pwa]

Keluar dengan kode 1 bila masih ada gap, supaya bisa dipakai di CI/pre-commit.
"""

import json
import os
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit('Butuh PyYAML: /usr/bin/python3 -m pip install --user PyYAML')

SPEC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'backend', 'openapi.yaml')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/za7tein-pwa')

# Nama entitas draft -> nama schema (yang sengaja diganti diberi alasan)
RENAME_ENTITY = {
    'ledger': 'LedgerEntry',
    'chat': 'ChatThread',
    'chatMessage': 'ChatMessage',
    'incidentResolution': 'Dispute',
}
# Nama field draft -> nama field di spec (mis. sufiks mata uang)
RENAME_FIELD = {
    'subTotal': 'subTotalJod', 'deliveryFee': 'deliveryFeeJod', 'platformFee': 'platformFeeJod',
    'total': 'totalJod', 'tip': 'tipJod', 'promoAmount': 'promoAmountJod', 'price': 'priceJod',
    'unitPrice': 'unitPriceJod', 'lineTotal': 'lineTotalJod', 'balance': 'balanceJod',
    'reservedBalance': 'reservedBalanceJod', 'amount': 'amountJod', 'refundAmount': 'refundAmountJod',
    'deposit': 'depositJod', 'etaPrepare': 'etaPrepareSeconds', 'etaDelivery': 'etaDeliverySeconds',
    'user': 'userId', 'users': 'userId', 'merchant': 'merchantId', 'menu': 'menuId', 'order': 'orderId',
    'batch': 'batchId', 'customer': 'customerId', 'deliveryAddress': 'deliveryAddressId', 'courier': 'courierId',
    'chatRef': 'chatId', 'sender': 'senderId',
}
# nama tabel di flows -> schema
NORM_TABLE = {
    'orders': 'Order', 'wallets': 'Wallet', 'merchants': 'Merchant', 'users': 'User',
    'chats': 'ChatThread', 'chat_messages': 'ChatMessage', 'couriers': 'Courier', 'menu_items': 'Menu',
    'batches': 'Batch', 'addresses': 'Address', 'rating_reviews': 'RatingReview',
    'review_replies': 'ReviewReply', 'disputes': 'Dispute', 'incident_resolutions': 'Dispute',
    'wallet_ledgers': 'LedgerEntry', 'wallet_holds': 'WalletHold', 'zones': 'Zone',
    'tax_reports': 'TaxReport', 'platform_profit': 'PlatformProfit', 'platform_switches': 'PlatformSwitch',
    'audit_logs': 'AuditEntry', 'liabilities': 'LiabilitySummary', 'topups': 'TopUp', 'cashouts': 'CashOut',
    'push_subscriptions': 'PushSubscription', 'fees': 'Fee', 'taxes': 'Tax', 'deposits': 'Deposit',
    'protection_fund': 'ProtectionFund', 'merchant_credit': 'MerchantCredit',
    'cashback_tiers': 'CashbackTier', 'exchange_rates': 'ExchangeRate',
    'phone_verifications': 'PhoneVerification', 'payments': 'Payment', 'roles': 'Role', 'operators': 'Operator',
    'checkpoints': 'Checkpoint',
}

fails = []
notes = []


def load():
    with open(SPEC) as f:
        raw = f.read()
    try:
        return raw, yaml.safe_load(raw)
    except yaml.YAMLError as e:
        sys.exit(f'H. YAML TIDAK VALID: {e}')


def schema_props(schemas, name, seen=None):
    """Properti sebuah schema, menelusuri $ref di dalam allOf."""
    seen = seen or set()
    if name in seen or name not in schemas:
        return set()
    seen.add(name)
    sc = schemas[name]
    out = set(sc.get('properties') or {})
    for part in sc.get('allOf', []):
        if '$ref' in part:
            out |= schema_props(schemas, part['$ref'].split('/')[-1], seen)
        else:
            out |= set(part.get('properties') or {})
    return out


def main():
    raw, d = load()
    S = d['components']['schemas']
    draft = open(os.path.join(SRC, 'docs/product/schema-draft-v1.md')).read()
    idx = json.load(open(os.path.join(SRC, 'docs/design/flows/INDEX.json')))

    print('SPEC :', os.path.relpath(SPEC, os.path.dirname(SPEC)))
    print('SUMBER:', SRC)
    print('-' * 78)

    # ---- A. entitas draft ----
    secs = re.findall(r'^###\s+\d+\.\s+([A-Za-z]+).*?\n(.*?)(?=^###\s+\d+\.|\Z)', draft, re.S | re.M)
    # Satu section bisa memuat >1 entitas dalam satu blok kode (mis. `chat` + `chatMessage`).
    # Pisahkan HANYA bila komentar `// nama` diikuti langsung field `id:` (penanda awal entitas),
    # supaya komentar biasa seperti `// tambahan (money path + timer):` tidak dianggap entitas.
    units = []
    for name, body in secs:
        m = re.search(r'```ts\n(.*?)```', body, re.S)
        block = m.group(1) if m else ''
        lines = block.splitlines()
        nxt = [''] * len(lines)
        later = ''
        for i in range(len(lines) - 1, -1, -1):
            nxt[i] = later
            if lines[i].strip():
                later = lines[i].strip()
        cur_name, cur_lines = name, []
        for i, ln in enumerate(lines):
            cm = re.match(r'^\s*//\s*([A-Za-z]\w*)', ln)
            if cm and re.match(r'^id\s*:', nxt[i]) and cur_lines:
                units.append((cur_name, '\n'.join(cur_lines)))
                cur_name, cur_lines = cm.group(1), []
                continue
            cur_lines.append(ln)
        if cur_lines:
            units.append((cur_name, '\n'.join(cur_lines)))

    print('A. entitas draft: %d section -> %d entitas' % (len(secs), len(units)))
    for name, block in units:
        tgt = RENAME_ENTITY.get(name, name[0].upper() + name[1:])
        fields = [f.group(1) for f in re.finditer(r'^([A-Za-z][A-Za-z0-9]*)\s*:', block, re.M)]
        if tgt not in S:
            fails.append(f'A: entitas draft "{name}" tidak punya schema (harus {tgt})')
            print('   GAP  %-18s -> tidak ada schema' % name)
            continue
        have = schema_props(S, tgt)
        miss = [x for x in fields
                if not ({x, RENAME_FIELD.get(x), x + 'Jod', x + 'Id', x + 'Seconds'} & have)]
        if miss:
            fails.append(f'A: {name} -> {tgt}: field tanpa padanan {miss}')
            print('   GAP  %-18s -> %-16s field tanpa padanan: %s' % (name, tgt, miss))
        else:
            print('   ok   %-18s -> %-16s (%d field)' % (name, tgt, len(fields)))

    # ---- B. entitas flows trace ----
    tables = sorted({e for t in idx.get('trace', []) for e in t.get('entities', [])}
                    | {e for l in idx.get('links', []) for e in (l.get('entities') or [])})
    print('B. entitas dari flows: %d' % len(tables))
    for t in tables:
        tgt = NORM_TABLE.get(t, t[0].upper() + t[1:])
        if tgt not in S:
            fails.append(f'B: entitas flows "{t}" tidak punya schema ({tgt})')
            print('   GAP  %-22s -> %s' % (t, tgt))
    if not any(f.startswith('B:') for f in fails):
        print('   ok   semua punya schema')

    # ---- C. event ----
    ie = {l['event'] for l in idx.get('links', []) if l.get('event')}
    se = {ev['name'] for c in d['x-realtime']['channels'] for ev in c['events']}
    aliases = {a for c in d['x-realtime']['channels'] for ev in c['events'] for a in (ev.get('aliases') or [])}
    print('C. event: flows=%d spec=%d' % (len(ie), len(se)))
    for e in sorted(ie - se - aliases):
        fails.append(f'C: event "{e}" dari flows tidak ada di spec')
        print('   GAP  %s' % e)
    if not (ie - se - aliases):
        print('   ok   semua event flows tercakup')
    for e in sorted(se - ie):
        extra = [ev for c in d['x-realtime']['channels'] for ev in c['events'] if ev['name'] == e]
        if not any(ev.get('x-source') or ev.get('aliases') for ev in extra):
            notes.append(f'C: event "{e}" ada di spec tapi tidak di flows (beri x-source bila memang tambahan)')

    # ---- D. entity x-realtime ----
    print('D. referensi entity di x-realtime')
    dangling = [(c['topic'], ev['name'], ev['entity']) for c in d['x-realtime']['channels']
                for ev in c['events'] if ev['entity'] not in S]
    for t, n, e in dangling:
        fails.append(f'D: x-realtime {t}/{n} menunjuk entity "{e}" yang tidak punya schema')
        print('   GAP  %s/%s -> %s' % (t, n, e))
    if not dangling:
        print('   ok   semua entity punya schema')

    # ---- E. x-unresolved ----
    print('E. UNRESOLVED: %d item' % len(d['x-unresolved']['items']))
    for it in d['x-unresolved']['items']:
        if not it.get('sourceIds'):
            fails.append(f'E: x-unresolved {it["id"]} tidak punya sourceIds (tidak bisa ditelusuri)')
            print('   GAP  %s tanpa sourceIds' % it['id'])
    if not any(f.startswith('E:') for f in fails):
        print('   ok   semua punya sourceIds')

    # ---- F. traceability ----
    ops = {f"{m.upper()} {p}" for p, v in d['paths'].items()
           for m in v if m in ('get', 'post', 'patch', 'put', 'delete')}
    print('F. traceability: %d requirement' % len(d.get('x-traceability', {}).get('requirements', [])))
    for r in d.get('x-traceability', {}).get('requirements', []):
        for o in r.get('operations', []):
            if o not in ops:
                fails.append(f'F: {r["id"]} menunjuk operation "{o}" yang tidak ada di spec')
                print('   GAP  %s -> %s' % (r['id'], o))
        for e in r.get('events', []):
            if e not in se:
                fails.append(f'F: {r["id"]} menunjuk event "{e}" yang tidak ada di spec')
                print('   GAP  %s -> event {e}' % r['id'])
        for ent in r.get('entities', []):
            if ent not in S:
                fails.append(f'F: {r["id"]} menunjuk entity "{ent}" yang tidak punya schema')
                print('   GAP  %s -> entity {ent}' % r['id'])
    if not any(f.startswith('F:') for f in fails):
        print('   ok   semua rujukan valid')

    # ---- G. $ref ----
    refs = sorted(set(re.findall(r"\$ref: '#/([^']+)'", raw)))

    def resolve(path):
        cur = d
        for part in path.split('/'):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return None
        return cur

    broken = [r for r in refs if resolve(r) is None]
    print('G. $ref: %d unik, %d rusak' % (len(refs), len(broken)))
    for b in broken:
        fails.append(f'G: $ref rusak -> #/{b}')
        print('   GAP  #/%s' % b)
    if not broken:
        print('   ok   semua resolve')

    print('-' * 78)
    print('RINGKASAN: path=%d operasi=%d schema=%d kanal=%d event=%d unresolved=%d'
          % (len(d['paths']), len(ops), len(S), len(d['x-realtime']['channels']), len(se),
             len(d['x-unresolved']['items'])))
    if notes:
        print('\nCATATAN (bukan gap):')
        for n in notes:
            print('  -', n)
    if fails:
        print('\nHASIL: GAGAL — %d gap' % len(fails))
        for f in fails:
            print('  ✗', f)
        return 1
    print('\nHASIL: LULUS — 0 gap (1:1 dengan sumber)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
