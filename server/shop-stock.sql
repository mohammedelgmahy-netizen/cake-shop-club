-- Cake Shop Dessert Cafe — «تصفح منتجاتنا» تحديث 5: المخزون وحجز الكميات (آمن للتكرار)
-- كل منطق الحجز والفك والخصم هنا في قاعدة البيانات نفسها (Triggers) علشان يتطبق على أي طريقة بيتغير بيها الطلب.
--   المتاح = الفعلي − المحجوز
--   الطلب الجديد (أي حالة نشطة) → حجز | ملغي/مرفوض → فك الحجز | تم إتمام الطلب → خصم نهائي من الفعلي
-- المنتج اللي مش متفعل عليه «تتبع المخزون» بيفضل زي ما هو (متوفر/غير متوفر بس).

alter table cakeshop.mc_shop_products add column if not exists track_stock boolean not null default false;

-- المخزون لكل منتج ولكل اختيار (النكهة|الحجم). المفتاح '|' = المنتج من غير اختيارات.
create table if not exists cakeshop.mc_shop_stock (
  product_id uuid not null references cakeshop.mc_shop_products(id) on delete cascade,
  key text not null default '|',
  physical integer not null default 0 check (physical >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, key)
);

-- سجل كل حركات المخزون
create table if not exists cakeshop.mc_shop_stock_moves (
  id bigserial primary key,
  product_id uuid,
  product_name text not null default '',
  key text not null default '|',
  kind text not null,                -- adjust | reserve | release | deduct | return | unreserve
  d_physical integer not null default 0,
  d_reserved integer not null default 0,
  physical_after integer not null default 0,
  reserved_after integer not null default 0,
  order_id uuid,
  order_no bigint,
  note text not null default '',
  by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mc_shop_stock_moves_product_idx on cakeshop.mc_shop_stock_moves (product_id, created_at desc);
create index if not exists mc_shop_stock_moves_order_idx on cakeshop.mc_shop_stock_moves (order_id);

-- حالة المخزون على الطلب + السطور اللي اتحجزت فعلاً (علشان الفك/الخصم يحصل مرة واحدة بس وبنفس الكميات)
alter table cakeshop.mc_shop_orders add column if not exists stock_state text not null default 'none';  -- none | reserved | released | deducted
alter table cakeshop.mc_shop_orders add column if not exists stock_lines jsonb not null default '[]';   -- [{product_id, key, qty, name}]

alter table cakeshop.mc_shop_stock enable row level security;
alter table cakeshop.mc_shop_stock_moves enable row level security;
revoke all on cakeshop.mc_shop_stock, cakeshop.mc_shop_stock_moves from anon, authenticated;
revoke all on sequence cakeshop.mc_shop_stock_moves_id_seq from anon, authenticated;

create or replace function cakeshop.stock_key(color text, variant text) returns text
language sql immutable as $$ select coalesce(color, '') || '|' || coalesce(variant, '') $$;

-- الحالة المطلوبة للمخزون حسب حالة الطلب
create or replace function cakeshop.stock_target(st text) returns text
language sql immutable as $$
  select case when st in ('rejected','cancelled') then 'released' when st = 'completed' then 'deducted' else 'reserved' end
$$;

-- نقل سطور طلب من حالة مخزون لحالة تانية. بيقفل صفوف المخزون بالترتيب علشان الطلبات المتزامنة متتخطاش المتاح.
create or replace function cakeshop.stock_move_order(p_order_id uuid, p_order_no bigint, p_lines jsonb, p_from text, p_to text, p_by text)
returns void language plpgsql as $$
declare
  ln record; s record; dp integer; dr integer; need_avail boolean; kind text; label text;
begin
  if p_from = p_to or p_from = 'none' then return; end if;
  for ln in
    select (x->>'product_id')::uuid pid, coalesce(x->>'key', '|') k, sum((x->>'qty')::int)::int q, max(coalesce(x->>'name', '')) nm
    from jsonb_array_elements(p_lines) x group by 1, 2 order by 1, 2
  loop
    -- التغيير على (الفعلي، المحجوز) لكل انتقال
    dp := 0; dr := 0; need_avail := false;
    if p_from = 'new' and p_to = 'reserved' then dr := ln.q; need_avail := true; kind := 'reserve';
    elsif p_from = 'new' and p_to = 'deducted' then dp := -ln.q; need_avail := true; kind := 'deduct';
    elsif p_from = 'reserved' and p_to = 'released' then dr := -ln.q; kind := 'release';
    elsif p_from = 'reserved' and p_to = 'deducted' then dp := -ln.q; dr := -ln.q; kind := 'deduct';
    elsif p_from = 'released' and p_to = 'reserved' then dr := ln.q; need_avail := true; kind := 'reserve';
    elsif p_from = 'released' and p_to = 'deducted' then dp := -ln.q; need_avail := true; kind := 'deduct';
    elsif p_from = 'deducted' and p_to = 'reserved' then dp := ln.q; dr := ln.q; kind := 'unreserve';
    elsif p_from = 'deducted' and p_to = 'released' then dp := ln.q; kind := 'return';
    else continue;
    end if;
    select * into s from cakeshop.mc_shop_stock where product_id = ln.pid and key = ln.k for update;
    label := ln.nm || case when ln.k <> '|' then ' (' || trim(both ' ' from replace(trim(both '|' from ln.k), '|', ' - ')) || ')' else '' end;
    if not found then
      if need_avail then
        raise exception 'الكمية المتاحة من «%» هي 0 بس', label using errcode = 'P0001';
      end if;
      insert into cakeshop.mc_shop_stock (product_id, key) values (ln.pid, ln.k) returning * into s;
    end if;
    if need_avail and (s.physical - s.reserved) < ln.q then
      raise exception 'الكمية المتاحة من «%» هي % بس', label, greatest(s.physical - s.reserved, 0) using errcode = 'P0001';
    end if;
    update cakeshop.mc_shop_stock set physical = greatest(physical + dp, 0), reserved = greatest(reserved + dr, 0), updated_at = now()
      where product_id = ln.pid and key = ln.k returning * into s;
    insert into cakeshop.mc_shop_stock_moves (product_id, product_name, key, kind, d_physical, d_reserved, physical_after, reserved_after, order_id, order_no, by_name)
      values (ln.pid, ln.nm, ln.k, kind, dp, dr, s.physical, s.reserved, p_order_id, p_order_no, coalesce(p_by, ''));
  end loop;
end $$;

-- عند إنشاء الطلب: نحجز الكميات للمنتجات اللي عليها تتبع مخزون (والطلب كله بيفشل لو الكمية مش كفاية)
create or replace function cakeshop.orders_stock_ins() returns trigger language plpgsql as $$
declare lines jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'key', cakeshop.stock_key(i->>'color', i->>'variant'),
           'qty', (i->>'qty')::int, 'name', p.name)), '[]'::jsonb)
    into lines
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i
    join cakeshop.mc_shop_products p on p.id = (i->>'product_id')::uuid and p.track_stock;
  new.stock_lines := lines;
  if jsonb_array_length(lines) = 0 then new.stock_state := 'none'; return new; end if;
  perform cakeshop.stock_move_order(new.id, new.order_no, lines, 'new', cakeshop.stock_target(new.status), coalesce(nullif(current_setting('cakeshop.actor', true), ''), 'العميل'));
  new.stock_state := cakeshop.stock_target(new.status);
  return new;
end $$;

-- عند تغيير حالة الطلب: فك الحجز / الخصم النهائي / إعادة الحجز — مرة واحدة بس لكل انتقال
create or replace function cakeshop.orders_stock_upd() returns trigger language plpgsql as $$
declare tgt text;
begin
  if new.stock_state = 'none' or new.status is not distinct from old.status then return new; end if;
  tgt := cakeshop.stock_target(new.status);
  if tgt = old.stock_state then return new; end if;
  perform cakeshop.stock_move_order(new.id, new.order_no, old.stock_lines, old.stock_state, tgt, coalesce(nullif(current_setting('cakeshop.actor', true), ''), 'النظام'));
  new.stock_state := tgt;
  return new;
end $$;

drop trigger if exists mc_shop_orders_stock_ins on cakeshop.mc_shop_orders;
create trigger mc_shop_orders_stock_ins before insert on cakeshop.mc_shop_orders for each row execute function cakeshop.orders_stock_ins();
drop trigger if exists mc_shop_orders_stock_upd on cakeshop.mc_shop_orders;
create trigger mc_shop_orders_stock_upd before update of status on cakeshop.mc_shop_orders for each row execute function cakeshop.orders_stock_upd();

-- تعديل الكمية الفعلية من الإدارة (جرد / إضافة بضاعة) مع تسجيل الحركة. مينفعش الفعلي يبقى أقل من المحجوز.
create or replace function cakeshop.stock_set_physical(p_product uuid, p_key text, p_physical integer, p_by text, p_note text)
returns void language plpgsql as $$
declare s record; nm text;
begin
  if p_physical is null or p_physical < 0 then raise exception 'الكمية لازم تكون رقم صحيح 0 أو أكتر' using errcode = 'P0001'; end if;
  select name into nm from cakeshop.mc_shop_products where id = p_product;
  if nm is null then raise exception 'المنتج غير موجود' using errcode = 'P0001'; end if;
  insert into cakeshop.mc_shop_stock (product_id, key) values (p_product, p_key) on conflict do nothing;
  select * into s from cakeshop.mc_shop_stock where product_id = p_product and key = p_key for update;
  if p_physical = s.physical then return; end if;
  if p_physical < s.reserved then
    raise exception 'مينفعش الكمية الفعلية لـ«%» تبقى أقل من المحجوز في طلبات (%)', nm || case when p_key <> '|' then ' ' || trim(both '|' from p_key) else '' end, s.reserved using errcode = 'P0001';
  end if;
  update cakeshop.mc_shop_stock set physical = p_physical, updated_at = now() where product_id = p_product and key = p_key;
  insert into cakeshop.mc_shop_stock_moves (product_id, product_name, key, kind, d_physical, d_reserved, physical_after, reserved_after, note, by_name)
    values (p_product, nm, p_key, 'adjust', p_physical - s.physical, 0, p_physical, s.reserved, coalesce(p_note, ''), coalesce(p_by, ''));
end $$;

revoke all on function cakeshop.stock_move_order(uuid, bigint, jsonb, text, text, text), cakeshop.stock_set_physical(uuid, text, integer, text, text),
  cakeshop.orders_stock_ins(), cakeshop.orders_stock_upd() from public, anon, authenticated;
