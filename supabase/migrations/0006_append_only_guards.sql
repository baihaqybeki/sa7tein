-- ============================================================
--  Sa7tein — 0006: penjaga append-only
--
--  DITEMUKAN OLEH E2E (scripts/e2e-irbid.sh, S8): tanpa trigger ini,
--  UPDATE dan DELETE pada `wallet_ledgers` BERHASIL. ERD mengklaim tabel ini
--  append-only, tetapi RLS saja tidak menegakkannya — RLS hanya membatasi
--  peran non-owner; pemilik tabel & service role tetap bisa mengubah.
--  Trigger di bawah menutup celah itu untuk semua peran.
--
--  Bergantung pada: 0004.
-- ============================================================

create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Tabel % bersifat append-only: TRUNCATE tidak diizinkan', tg_table_name
      using errcode = 'restrict_violation';
  end if;
  raise exception 'Tabel % bersifat append-only: % tidak diizinkan (baris id %)',
    tg_table_name, tg_op, coalesce(old.id::text, '?')
    using errcode = 'restrict_violation';
end $$;

comment on function public.forbid_mutation() is
  'Penjaga append-only: menolak UPDATE/DELETE/TRUNCATE pada tabel jejak (ledger, audit).';

do $$
declare t text;
begin
  -- wallet_ledgers: mutasi uang tidak boleh diubah setelah tercatat (double-entry append-only)
  -- audit_logs:     jejak aksi operator tidak boleh diubah atau dihapus
  foreach t in array array['wallet_ledgers', 'audit_logs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only_row', t);
    execute format('drop trigger if exists %I on public.%I', t || '_append_only_trunc', t);
    execute format(
      'create trigger %I before update or delete on public.%I
         for each row execute function public.forbid_mutation()',
      t || '_append_only_row', t);
    execute format(
      'create trigger %I before truncate on public.%I
         for each statement execute function public.forbid_mutation()',
      t || '_append_only_trunc', t);
  end loop;
end $$;
