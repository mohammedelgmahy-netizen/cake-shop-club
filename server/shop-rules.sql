-- التحكم في نقاط الولاء والعروض لكل قسم ولكل منتج (إعدادات المنتج ليها الأولوية على القسم)
alter table cakeshop.mc_shop_categories
  add column if not exists points_enabled boolean not null default true,
  add column if not exists general_offers boolean not null default true,
  add column if not exists special_offers boolean not null default true;
alter table cakeshop.mc_shop_products
  add column if not exists points_mode text not null default 'inherit' check (points_mode in ('inherit','yes','no')),
  add column if not exists general_offers_mode text not null default 'inherit' check (general_offers_mode in ('inherit','yes','no')),
  add column if not exists special_offers_mode text not null default 'inherit' check (special_offers_mode in ('inherit','yes','no'));
-- المبلغ اللي بيتحسب عليه النقاط في الطلب (null = طلبات قديمة: كل قيمة الطلب)
alter table cakeshop.mc_shop_orders add column if not exists points_amount numeric(12,2);
