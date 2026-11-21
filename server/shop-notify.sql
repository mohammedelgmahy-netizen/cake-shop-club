-- Cake Shop Dessert Cafe — تحديث 6: تنبيه المخزون المنخفض + فاتورة الطلب ونقاطه + الإشعارات (آمن للتكرار)

-- حد التنبيه للمخزون المنخفض لكل منتج
alter table cakeshop.mc_shop_products add column if not exists low_stock_at integer not null default 3;

-- فاتورة الطلب الأونلاين في برنامج الولاء (فاتورة واحدة بس لكل طلب) + النقاط اللي اتضافت
alter table cakeshop.mc_shop_orders add column if not exists invoice_no text not null default '';
alter table cakeshop.mc_shop_orders add column if not exists invoice_status text not null default 'none';  -- none | done | failed
alter table cakeshop.mc_shop_orders add column if not exists invoice_error text not null default '';
alter table cakeshop.mc_shop_orders add column if not exists invoice_at timestamptz;
alter table cakeshop.mc_shop_orders add column if not exists points_awarded numeric(12,2) not null default 0;
alter table cakeshop.mc_shop_orders add column if not exists completed_at timestamptz;

-- إشعارات الإدارة (طلب جديد، عيد ميلاد بكرة، فاتورة فشلت). dedupe_key بيمنع تكرار نفس الإشعار
create table if not exists cakeshop.mc_shop_notifications (
  id bigserial primary key,
  kind text not null,
  title text not null,
  body text not null default '',
  ref_type text not null default '',
  ref_id text not null default '',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by text not null default ''
);
create index if not exists mc_shop_notifications_created_idx on cakeshop.mc_shop_notifications (created_at desc);

-- إشعارات العميل (بتظهر في الكارت)
create table if not exists cakeshop.mc_shop_customer_notes (
  id bigserial primary key,
  customer_id text not null,
  title text not null,
  body text not null default '',
  ref_type text not null default '',
  ref_id text not null default '',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists mc_shop_customer_notes_cust_idx on cakeshop.mc_shop_customer_notes (customer_id, created_at desc);

alter table cakeshop.mc_shop_notifications enable row level security;
alter table cakeshop.mc_shop_customer_notes enable row level security;
revoke all on cakeshop.mc_shop_notifications, cakeshop.mc_shop_customer_notes from anon, authenticated;
revoke all on sequence cakeshop.mc_shop_notifications_id_seq, cakeshop.mc_shop_customer_notes_id_seq from anon, authenticated;

-- كل طلب جديد بيعمل إشعار للإدارة فوراً (من قاعدة البيانات نفسها، مرة واحدة لكل طلب)
create or replace function cakeshop.orders_notify_ins() returns trigger language plpgsql as $$
begin
  insert into cakeshop.mc_shop_notifications (kind, title, body, ref_type, ref_id, dedupe_key)
  values ('new_order', '🛍️ طلب جديد #' || new.order_no,
          new.customer_name || ' · ' || to_char(new.total, 'FM999999990.00') || ' ج.م · ' || case when new.delivery = 'delivery' then '🚚 توصيل' else '🏪 استلام من الفرع' end,
          'order', new.id::text, 'order:' || new.id::text)
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create or replace trigger mc_shop_orders_notify_ins after insert on cakeshop.mc_shop_orders for each row execute function cakeshop.orders_notify_ins();

revoke all on function cakeshop.orders_notify_ins() from public, anon, authenticated;
