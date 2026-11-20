-- Cake Shop - Bebrave — «تصفح منتجاتنا»: الأقسام والمنتجات (مرة واحدة، آمن للتكرار)
create extension if not exists pgcrypto;

create table if not exists cakeshop.mc_shop_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '',
  image text not null default '',
  sort integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mc_shop_categories_name_uq on cakeshop.mc_shop_categories (lower(name));

create table if not exists cakeshop.mc_shop_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references cakeshop.mc_shop_categories(id) on delete restrict,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  old_price numeric(12,2) not null default 0 check (old_price >= 0),
  available boolean not null default true,
  hidden boolean not null default false,
  images jsonb not null default '[]',
  specs jsonb not null default '[]',
  colors jsonb not null default '[]',
  variants jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mc_shop_products_cat_idx on cakeshop.mc_shop_products (category_id);
create index if not exists mc_shop_products_created_idx on cakeshop.mc_shop_products (created_at desc);

-- مغلقة أمام المتصفح مثل باقي الجداول: الوصول من الخادم فقط
alter table cakeshop.mc_shop_categories enable row level security;
alter table cakeshop.mc_shop_products enable row level security;
revoke all on cakeshop.mc_shop_categories, cakeshop.mc_shop_products from anon, authenticated;

-- الأقسام المبدئية (تتعدل وتتحذف من لوحة الإدارة)
insert into cakeshop.mc_shop_categories (name, icon, sort) values
  ('تورت', '🎂', 1), ('دونتس', '🍩', 2), ('كب كيك', '🧁', 3), ('جاتوه وقطع', '🍰', 4), ('حلويات شرقية', '🍯', 5),
  ('آيس كريم', '🍨', 6), ('كوكيز', '🍪', 7), ('شوكولاتة', '🍫', 8), ('مشروبات', '☕', 9)
on conflict do nothing;

-- صور المنتجات
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-products', 'cs-products', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
