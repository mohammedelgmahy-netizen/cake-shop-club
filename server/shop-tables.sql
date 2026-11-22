-- Cake Shop Dessert Cafe — نظام الترابيزات (Dine-in & Table Ordering) — آمن للتكرار

-- الترابيزات: كل ترابيزة ليها QR خاص بيها (qr_key)
create table if not exists cakeshop.mc_shop_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seats integer not null default 2 check (seats between 1 and 100),
  active boolean not null default true,
  qr_key text not null unique default replace(gen_random_uuid()::text, '-', ''),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mc_shop_tables_name_uq on cakeshop.mc_shop_tables (lower(name));

-- جلسة الترابيزة: من أول طلب لحد ما الموظف يقفل الحساب. جلسة مفتوحة واحدة بس لكل ترابيزة
create sequence if not exists cakeshop.mc_shop_session_no start 1001;
create table if not exists cakeshop.mc_shop_table_sessions (
  id uuid primary key default gen_random_uuid(),
  session_no bigint not null unique default nextval('cakeshop.mc_shop_session_no'),
  table_id uuid not null references cakeshop.mc_shop_tables(id) on delete restrict,
  table_name text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  customer_id text not null default '',
  customer_name text not null default '',
  customer_phone text not null default '',
  member_no text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text not null default '',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  orders_count integer not null default 0,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  points_amount numeric(12,2) not null default 0,
  invoice_no text not null default '',
  invoice_status text not null default 'none',
  invoice_error text not null default '',
  points_awarded numeric(12,2) not null default 0
);
create unique index if not exists mc_shop_table_sessions_open_uq on cakeshop.mc_shop_table_sessions (table_id) where status = 'open';
create index if not exists mc_shop_table_sessions_opened_idx on cakeshop.mc_shop_table_sessions (opened_at desc);

-- طلبات المساعدة من الترابيزة (Call Staff)
create table if not exists cakeshop.mc_shop_table_help (
  id bigserial primary key,
  table_id uuid not null references cakeshop.mc_shop_tables(id) on delete cascade,
  table_name text not null default '',
  session_id uuid,
  kind text not null default 'help',
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text not null default ''
);
create index if not exists mc_shop_table_help_open_idx on cakeshop.mc_shop_table_help (table_id) where status = 'open';

-- ربط الطلب بالترابيزة وجلستها. نوع الطلب: delivery = 'dinein'
alter table cakeshop.mc_shop_orders add column if not exists table_id uuid;
alter table cakeshop.mc_shop_orders add column if not exists table_name text not null default '';
alter table cakeshop.mc_shop_orders add column if not exists session_id uuid;
create index if not exists mc_shop_orders_session_idx on cakeshop.mc_shop_orders (session_id) where session_id is not null;
alter table cakeshop.mc_shop_orders drop constraint if exists mc_shop_orders_status_check;
alter table cakeshop.mc_shop_orders add constraint mc_shop_orders_status_check
  check (status in ('pending','approved','preparing','ready','shipped','served','completed','rejected','cancelled'));

-- إشعار الإدارة بالطلب الجديد: يوضح نوع الطلب (ترابيزة / توصيل / استلام)
create or replace function cakeshop.orders_notify_ins() returns trigger language plpgsql as $$
begin
  insert into cakeshop.mc_shop_notifications (kind, title, body, ref_type, ref_id, dedupe_key)
  values ('new_order',
          case when new.delivery = 'dinein' then '🍽️ طلب ترابيزة جديد #' || new.order_no else '🛍️ طلب جديد #' || new.order_no end,
          case when new.delivery = 'dinein' then '🍽️ ' || new.table_name || coalesce(nullif(' · ' || new.customer_name, ' · '), '')
               else new.customer_name end
            || ' · ' || to_char(new.total, 'FM999999990.00') || ' ج.م'
            || case when new.delivery = 'dinein' then ' · Dine-in' when new.delivery = 'delivery' then ' · 🚚 توصيل' else ' · 🏪 استلام من الفرع' end,
          'order', new.id::text, 'order:' || new.id::text)
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

alter table cakeshop.mc_shop_tables enable row level security;
alter table cakeshop.mc_shop_table_sessions enable row level security;
alter table cakeshop.mc_shop_table_help enable row level security;
revoke all on cakeshop.mc_shop_tables, cakeshop.mc_shop_table_sessions, cakeshop.mc_shop_table_help from anon, authenticated;
revoke all on sequence cakeshop.mc_shop_session_no, cakeshop.mc_shop_table_help_id_seq from anon, authenticated;
revoke all on function cakeshop.orders_notify_ins() from public, anon, authenticated;
