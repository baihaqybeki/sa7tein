-- ============================================================
--  Sa7tein — 0004: M5 — helper, index, RLS, realtime
--
--  Bergantung pada: 0001 + 0002 + 0003.
--  RLS memakai Supabase Auth: `users.auth_user_id` menjembatani auth.uid()
--  ke id internal kita. Untuk uji lokal, `auth.uid()` disediakan stub
--  (lihat scripts/verify-migrations.sh).
-- ============================================================

-- ------------------------------------------------------------
--  Helper: siapa saya, dan apa peran saya
-- ------------------------------------------------------------
create or replace function public.app_uid() returns bigint
language sql stable security definer set search_path = public as $$
  select u.id from public.users u where u.auth_user_id = auth.uid()
$$;
comment on function public.app_uid() is
  'Id internal (users.id) dari sesi Supabase Auth yang aktif. null bila belum terhubung.';

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select u.role from public.users u where u.auth_user_id = auth.uid()
$$;
comment on function public.app_role() is 'Peran sesi aktif; null bila belum terhubung.';

create or replace function public.app_is_ops() returns boolean
language sql stable as $$
  select coalesce(public.app_role() in ('cs','superadmin'), false)
$$;
comment on function public.app_is_ops() is 'true untuk CS & Super Admin (pengawas lintas tenant).';

-- ------------------------------------------------------------
--  Index untuk query panas
--  (M5 hanya ini + unique/check yang sudah ada di 0001–0003)
-- ------------------------------------------------------------
create index if not exists menus_merchant_idx            on public.menus (merchant_id, available);
create index if not exists menu_variants_menu_idx        on public.menu_variants (menu_id);
create index if not exists couriers_merchant_idx         on public.couriers (merchant_id, availability);
create index if not exists addresses_user_idx            on public.addresses (user_id, is_default);
create index if not exists orders_merchant_status_idx    on public.orders (merchant_id, status, created_at desc);
create index if not exists orders_customer_idx           on public.orders (customer_id, created_at desc);
create index if not exists orders_courier_idx            on public.orders (courier_id, status);
create index if not exists orders_placed_idx             on public.orders (placed_at desc) where placed_at is not null;
create index if not exists order_items_order_idx         on public.order_items (order_id);
create index if not exists wallet_ledgers_user_idx       on public.wallet_ledgers (user_id, created_at desc);
create index if not exists wallet_holds_wallet_idx       on public.wallet_holds (wallet_id, status);
create index if not exists chat_messages_chat_idx        on public.chat_messages (chat_id, at);
create index if not exists checkpoints_order_idx         on public.checkpoints (order_id, at);
create index if not exists disputes_status_idx           on public.disputes (status, created_at desc);
create index if not exists rating_reviews_merchant_idx   on public.rating_reviews (merchant_id, created_at desc);
create index if not exists audit_logs_actor_idx          on public.audit_logs (actor_id, at desc);
create index if not exists payments_order_idx            on public.payments (order_id, status);
create index if not exists batches_merchant_status_idx   on public.batches (merchant_id, status);
-- batas 3 kurir per merchant ditegakkan di API, tetapi index ini membuat pengecekannya murah
create index if not exists couriers_merchant_count_idx   on public.couriers (merchant_id);

-- ------------------------------------------------------------
--  RLS
--  Prinsip: default TOLAK. Yang tidak punya policy = tidak bisa diakses.
--  Anon hanya boleh membaca katalog yang memang publik (merchant approved, menu).
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users','phone_verifications','customers','addresses','zones','merchants','couriers',
    'fav_merchants','menus','menu_variants',
    'orders','order_items','batches','fees','taxes','payments','wallets','wallet_holds',
    'wallet_ledgers','topups','cashouts','deposits','merchant_credits','cashback_tiers',
    'disputes','dispute_appeals','protection_fund','exchange_rates',
    'chats','chat_participants','chat_messages','checkpoints','rating_reviews','review_replies',
    'marketing','push_subscriptions','roles','operators','audit_logs','tax_reports',
    'platform_profit','platform_switches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- users: diri sendiri; ops boleh semua
create policy users_self_read on public.users for select
  using (auth_user_id = auth.uid() or public.app_is_ops());
create policy users_self_update on public.users for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy users_insert_self on public.users for insert
  with check (auth_user_id = auth.uid());

-- customers: diri sendiri; merchant perlu membaca nama customer pada ordernya
create policy customers_self on public.customers for all
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());

-- addresses: hanya pemilik; merchant/kurir membaca lewat order (lihat policy orders)
create policy addresses_owner on public.addresses for all
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());

-- zones: publik baca (dipakai gate coverage); tulis hanya Super Admin
create policy zones_read on public.zones for select using (true);
create policy zones_sa_write on public.zones for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');

-- merchants: katalog publik (hanya yang approved); pemilik boleh melihat & mengubah miliknya; ops semua
create policy merchants_public_read on public.merchants for select
  using (tenant_status = 'approved' or user_id = public.app_uid() or public.app_is_ops());
create policy merchants_owner_write on public.merchants for update
  using (user_id = public.app_uid() or public.app_is_ops())
  with check (user_id = public.app_uid() or public.app_is_ops());
create policy merchants_insert_self on public.merchants for insert
  with check (user_id = public.app_uid());

-- menus & varian: publik baca; tulis oleh merchant pemilik
create policy menus_public_read on public.menus for select using (true);
create policy menus_owner_write on public.menus for all
  using (exists (select 1 from public.merchants m
                 where m.id = menus.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (exists (select 1 from public.merchants m
                      where m.id = menus.merchant_id and m.user_id = public.app_uid())
              or public.app_is_ops());
create policy menu_variants_public_read on public.menu_variants for select using (true);
create policy menu_variants_owner_write on public.menu_variants for all
  using (exists (select 1 from public.menus mn join public.merchants m on m.id = mn.merchant_id
                 where mn.id = menu_variants.menu_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (exists (select 1 from public.menus mn join public.merchants m on m.id = mn.merchant_id
                      where mn.id = menu_variants.menu_id and m.user_id = public.app_uid())
              or public.app_is_ops());

-- couriers: hanya merchant pemilik & dirinya sendiri & ops
create policy couriers_read on public.couriers for select
  using (user_id = public.app_uid()
         or exists (select 1 from public.merchants m
                    where m.id = couriers.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops());
create policy couriers_self_update on public.couriers for update
  using (user_id = public.app_uid()
         or exists (select 1 from public.merchants m
                    where m.id = couriers.merchant_id and m.user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);

-- fav_merchants
create policy fav_owner on public.fav_merchants for all
  using (user_id = public.app_uid()) with check (user_id = public.app_uid());

-- orders: pihak yang terlibat saja
create policy orders_parties on public.orders for select
  using (
    public.app_is_ops()
    or customer_id in (select id from public.customers where user_id = public.app_uid())
    or merchant_id in (select id from public.merchants where user_id = public.app_uid())
    or courier_id in (select id from public.couriers where user_id = public.app_uid())
  );
create policy orders_customer_insert on public.orders for insert
  with check (customer_id in (select id from public.customers where user_id = public.app_uid()));
create policy orders_parties_update on public.orders for update
  using (
    public.app_is_ops()
    or customer_id in (select id from public.customers where user_id = public.app_uid())
    or merchant_id in (select id from public.merchants where user_id = public.app_uid())
    or courier_id in (select id from public.couriers where user_id = public.app_uid())
  )
  with check (true);

-- order_items / fees / taxes / payments / checkpoints: ikut keterlihatan order-nya
do $$
declare t text;
begin
  foreach t in array array['order_items','fees','taxes','payments','checkpoints'] loop
    execute format($f$
      create policy %1$s_via_order on public.%1$I for all
        using (exists (select 1 from public.orders o where o.id = %1$I.order_id))
        with check (exists (select 1 from public.orders o where o.id = %1$I.order_id))
    $f$, t);
  end loop;
end $$;

-- wallet & uang: hanya pemilik; ops boleh membaca (monitoring), bukan menulis
create policy wallets_owner on public.wallets for all
  using (user_id = public.app_uid() or public.app_role() = 'superadmin')
  with check (user_id = public.app_uid() or public.app_is_ops());
create policy wallet_holds_owner on public.wallet_holds for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);
-- ledger append-only: baca milik sendiri, tulis hanya lewat jalur sistem (service role)
create policy wallet_ledgers_read on public.wallet_ledgers for select
  using (user_id = public.app_uid() or public.app_is_ops());
create policy topups_owner on public.topups for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);
create policy cashouts_owner on public.cashouts for all
  using (wallet_id in (select id from public.wallets where user_id = public.app_uid())
         or public.app_is_ops())
  with check (true);

-- deposits / merchant_credits / cashback_tiers: merchant pemilik + ops
create policy deposits_scope on public.deposits for select
  using (merchant_id in (select id from public.merchants where user_id = public.app_uid())
         or public.app_is_ops());
create policy deposits_ops_write on public.deposits for all
  using (public.app_is_ops()) with check (public.app_is_ops());
create policy merchant_credits_scope on public.merchant_credits for select
  using (merchant_id in (select id from public.merchants where user_id = public.app_uid())
         or public.app_is_ops());
create policy cashback_tiers_read on public.cashback_tiers for select using (true);

-- disputes: pihak order + ops
create policy disputes_scope on public.disputes for select
  using (public.app_is_ops()
         or order_id in (
              select o.id from public.orders o
              where o.customer_id in (select id from public.customers where user_id = public.app_uid())
                 or o.merchant_id in (select id from public.merchants where user_id = public.app_uid())
                 or o.courier_id  in (select id from public.couriers  where user_id = public.app_uid())
            ));
create policy disputes_open on public.disputes for insert
  with check (opened_by = public.app_uid());
create policy disputes_ops_resolve on public.disputes for update
  using (public.app_is_ops()) with check (public.app_is_ops());
create policy dispute_appeals_sa on public.dispute_appeals for all
  using (public.app_role() = 'superadmin' or filed_by = public.app_uid())
  with check (filed_by = public.app_uid() or public.app_role() = 'superadmin');
create policy protection_fund_ops on public.protection_fund for select using (public.app_is_ops());

-- exchange_rates: publik baca (dipakai konversi tampilan)
create policy exchange_rates_read on public.exchange_rates for select using (true);

-- chat: peserta thread
create policy chats_participants on public.chats for select
  using (public.app_is_ops()
         or exists (select 1 from public.chat_participants cp
                    where cp.chat_id = chats.id and cp.user_id = public.app_uid()));
create policy chat_participants_read on public.chat_participants for select
  using (public.app_is_ops() or user_id = public.app_uid()
         or chat_id in (select chat_id from public.chat_participants where user_id = public.app_uid()));
create policy chat_messages_participants on public.chat_messages for select
  using (public.app_is_ops()
         or exists (select 1 from public.chat_participants cp
                    where cp.chat_id = chat_messages.chat_id and cp.user_id = public.app_uid()));
create policy chat_messages_send on public.chat_messages for insert
  with check (sender_id = public.app_uid()
              and exists (select 1 from public.chat_participants cp
                          where cp.chat_id = chat_messages.chat_id and cp.user_id = public.app_uid()));

-- ulasan: publik baca; tulis oleh customer yang ordernya
create policy rating_reviews_public_read on public.rating_reviews for select using (true);
create policy rating_reviews_owner_write on public.rating_reviews for insert
  with check (customer_id in (select id from public.customers where user_id = public.app_uid()));
create policy review_replies_public_read on public.review_replies for select using (true);
create policy review_replies_merchant_write on public.review_replies for insert
  with check (merchant_id in (select id from public.merchants where user_id = public.app_uid()));

-- marketing: publik baca promo aktif; tulis ops
create policy marketing_read on public.marketing for select using (true);
create policy marketing_ops_write on public.marketing for all
  using (public.app_is_ops()) with check (public.app_is_ops());

-- push_subscriptions: milik sendiri
create policy push_owner on public.push_subscriptions for all
  using (user_id = public.app_uid()) with check (user_id = public.app_uid());

-- platform: roles/operators/audit/tax/profit/switches → Super Admin (ops boleh baca audit & profit)
create policy roles_sa on public.roles for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy operators_sa on public.operators for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy audit_ops_read on public.audit_logs for select using (public.app_is_ops());
create policy audit_insert_ops on public.audit_logs for insert with check (public.app_is_ops());
create policy tax_reports_sa on public.tax_reports for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy platform_profit_sa on public.platform_profit for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');
create policy platform_switches_read on public.platform_switches for select using (true);
create policy platform_switches_sa on public.platform_switches for all
  using (public.app_role() = 'superadmin') with check (public.app_role() = 'superadmin');

-- ------------------------------------------------------------
--  Realtime — hanya tabel yang memang perlu didorong ke klien.
--  (Bukan semua tabel: publikasi berlebihan = beban & data bocor.)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'orders',            -- status & penugasan kurir
    'couriers',          -- lokasi + ketersediaan
    'merchants',         -- buka/tutup + status tenant
    'chats','chat_messages',
    'wallets','wallet_holds','wallet_ledgers',  -- reserve → settle
    'disputes','batches','menus'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- `replica identity full` supaya UPDATE/DELETE membawa nilai lama
-- (dibutuhkan untuk reserve→settle & perubahan status).
do $$
declare t text;
begin
  foreach t in array array['orders','couriers','merchants','wallets','wallet_holds','batches','disputes'] loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
