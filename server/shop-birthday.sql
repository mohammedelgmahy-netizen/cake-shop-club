-- Cake Shop Dessert Cafe — تحديث 7: خصم عيد الميلاد على الطلب الأونلاين (آمن للتكرار)
alter table cakeshop.mc_shop_orders add column if not exists birthday_discount numeric(12,2) not null default 0;
