-- Cake Shop — النسخ الاحتياطي الكامل والاسترجاع (Backup & Restore)
-- النسخة: كل جداول cakeshop (ما عدا جلسات الدخول mc_cache وسجل النسخ نفسه) + قيم العدادات (sequences).
-- الملف فيه كود تحقق sha256 على البيانات، والاسترجاع بيرفض أي ملف اتعدّل أو ناقص.
-- الاسترجاع: بيتجرب الأول كامل جوه معاملة وبيترجع (تجربة)، وبعد التأكيد بس بيتنفذ،
-- وقبل التنفيذ بتتحفظ نسخة من البيانات الحالية جوه mc_backup_history (pre_restore).

create table if not exists cakeshop.mc_backup_history (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  kind text not null,                       -- manual | pre_restore | restore
  size_bytes bigint not null default 0,
  checksum text not null default '',
  counts jsonb not null default '{}'::jsonb,
  note text not null default '',
  snapshot jsonb                             -- بيانات كاملة لنسخ pre_restore بس
);
alter table cakeshop.mc_backup_history enable row level security;
revoke all on cakeshop.mc_backup_history from public, anon, authenticated;

-- كل البيانات كـ jsonb: { tables: { name: { columns: [...], rows: [...] } }, sequences: { name: last_value } }
create or replace function cakeshop.cs_backup_data() returns jsonb
language plpgsql set search_path = cakeshop, pg_catalog as $$
declare r record; t jsonb := '{}'::jsonb; s jsonb := '{}'::jsonb; rws jsonb; cols jsonb; v bigint;
begin
  for r in select c.oid, c.relname from pg_class c
           where c.relnamespace = 'cakeshop'::regnamespace and c.relkind = 'r' and c.relname not in ('mc_cache', 'mc_backup_history') order by 1 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from cakeshop.%I x', r.relname) into rws;
    select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) into cols
      from pg_attribute a where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;
    t := t || jsonb_build_object(r.relname, jsonb_build_object('columns', cols, 'rows', rws));
  end loop;
  for r in select c.relname from pg_class c where c.relnamespace = 'cakeshop'::regnamespace and c.relkind = 'S' order by 1 loop
    execute format('select last_value from cakeshop.%I', r.relname) into v;
    s := s || jsonb_build_object(r.relname, v);
  end loop;
  return jsonb_build_object('tables', t, 'sequences', s);
end $$;

-- إنشاء نسخة كاملة: بيرجع نص ملف النسخة (JSON) ويسجلها في mc_backup_history
create or replace function cakeshop.cs_backup(p_actor text) returns text
language plpgsql set search_path = cakeshop, pg_catalog as $$
declare d jsonb; sum text; cnt jsonb; f text;
begin
  d := cakeshop.cs_backup_data();
  sum := encode(sha256(convert_to(d::text, 'UTF8')), 'hex');
  select coalesce(jsonb_object_agg(k, jsonb_array_length(v->'rows')), '{}'::jsonb) into cnt from jsonb_each(d->'tables') e(k, v);
  f := jsonb_build_object('format', 'cake-shop-backup', 'version', 1, 'schema', 'cakeshop', 'created_at', now(),
         'created_by', coalesce(p_actor, ''), 'counts', cnt, 'checksum', sum, 'data', d)::text;
  insert into cakeshop.mc_backup_history (created_by, kind, size_bytes, checksum, counts) values (coalesce(p_actor, ''), 'manual', octet_length(f), sum, cnt);
  return f;
end $$;

-- تطبيق بيانات نسخة على الجداول (بيتنادى من cs_restore بس)
create or replace function cakeshop.cs_restore_apply(d jsonb) returns void
language plpgsql set search_path = cakeshop, pg_catalog as $$
declare k text; v jsonb; cols text; secret text[] := array['ADMIN_KEY', 'CRON_SECRET']; r record; mx bigint;
begin
  perform set_config('session_replication_role', 'replica', true);  -- بدون triggers (مخزون/إشعارات) وبدون ترتيب العلاقات
  for k, v in select * from jsonb_each(d->'tables') loop
    if k in ('mc_cache', 'mc_backup_history') or to_regclass('cakeshop.' || quote_ident(k)) is null then continue; end if;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a
     where a.attrelid = ('cakeshop.' || quote_ident(k))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (v->'columns') ? a.attname::text;
    if k = 'mc_props' then
      delete from cakeshop.mc_props where key <> all (secret);
      insert into cakeshop.mc_props (key, value)
        select x.key, x.value from jsonb_populate_recordset(null::cakeshop.mc_props, v->'rows') x where x.key <> all (secret)
        on conflict do nothing;
      continue;
    end if;
    execute format('delete from cakeshop.%I', k);
    if cols is not null and jsonb_array_length(v->'rows') > 0 then
      execute format('insert into cakeshop.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::cakeshop.%1$I, $1)', k, cols) using v->'rows';
    end if;
  end loop;
  -- العدادات: قيمة النسخة، ومش أقل من أكبر رقم موجود فعلاً
  for k, v in select * from jsonb_each(coalesce(d->'sequences', '{}'::jsonb)) loop
    if to_regclass('cakeshop.' || quote_ident(k)) is not null and jsonb_typeof(v) = 'number' then
      perform setval(('cakeshop.' || quote_ident(k))::regclass, greatest((v #>> '{}')::bigint, 1), true);
    end if;
  end loop;
  for r in select s.oid seq, d2.refobjid tbl, a.attname col from pg_class s
             join pg_depend d2 on d2.objid = s.oid and d2.deptype in ('a', 'i') and d2.refobjsubid > 0
             join pg_attribute a on a.attrelid = d2.refobjid and a.attnum = d2.refobjsubid
            where s.relkind = 'S' and s.relnamespace = 'cakeshop'::regnamespace loop
    execute format('select max(%I)::bigint from %s', r.col, r.tbl::regclass) into mx;
    if mx is not null then perform setval(r.seq, greatest(mx, (select last_value from pg_sequences where schemaname = 'cakeshop' and sequencename = (select relname from pg_class where oid = r.seq))), true); end if;
  end loop;
  if to_regclass('cakeshop.mc_shop_order_no') is not null then
    select max(order_no) into mx from cakeshop.mc_shop_orders;
    if mx is not null then perform setval('cakeshop.mc_shop_order_no', greatest(mx, (select coalesce(last_value, 1) from pg_sequences where schemaname = 'cakeshop' and sequencename = 'mc_shop_order_no')), true); end if;
  end if;
  if to_regclass('cakeshop.mc_shop_session_no') is not null then
    select max(session_no) into mx from cakeshop.mc_shop_table_sessions;
    if mx is not null then perform setval('cakeshop.mc_shop_session_no', greatest(mx, (select coalesce(last_value, 1) from pg_sequences where schemaname = 'cakeshop' and sequencename = 'mc_shop_session_no')), true); end if;
  end if;
  perform set_config('session_replication_role', 'origin', true);
end $$;

-- فحص ملف نسخة واسترجاعه.
--   p_apply = false: فحص فقط (سلامة الملف + تجربة استرجاع كاملة بتترجع) وبيرجع ملخص المحتويات
--   p_apply = true و p_confirm = 'استرجاع': ياخد نسخة من الحالي (pre_restore) وبعدين يسترجع
create or replace function cakeshop.cs_restore(p_file text, p_actor text, p_apply boolean, p_confirm text) returns jsonb
language plpgsql set search_path = cakeshop, pg_catalog as $$
declare f jsonb; d jsonb; k text; v jsonb; n bigint; tabs jsonb := '[]'::jsonb; unknown jsonb := '[]'::jsonb; notin jsonb := '[]'::jsonb;
        dry text := ''; cur jsonb; sum text; cnt jsonb; pre_id bigint;
begin
  begin f := p_file::jsonb; exception when others then raise exception 'الملف تالف أو مش ملف نسخة احتياطية'; end;
  if jsonb_typeof(f) <> 'object' or f->>'format' is distinct from 'cake-shop-backup' then raise exception 'الملف ده مش نسخة احتياطية من Cake Shop'; end if;
  if coalesce((f->>'version')::int, 0) <> 1 then raise exception 'إصدار ملف النسخة غير مدعوم'; end if;
  d := f->'data';
  if d is null or jsonb_typeof(d->'tables') <> 'object' then raise exception 'ملف النسخة ناقص'; end if;
  if encode(sha256(convert_to(d::text, 'UTF8')), 'hex') is distinct from f->>'checksum' then
    raise exception 'ملف النسخة اتعدّل أو اتلف (كود التحقق مش مطابق)، مينفعش يتسترجع';
  end if;
  for k, v in select * from jsonb_each(d->'tables') order by 1 loop
    if jsonb_typeof(v->'rows') <> 'array' or jsonb_typeof(v->'columns') <> 'array' then raise exception 'ملف النسخة ناقص (جدول %)', k; end if;
    if (f->'counts'->>k)::bigint is distinct from jsonb_array_length(v->'rows')::bigint then raise exception 'ملف النسخة ناقص (عدد صفوف % مش مطابق)', k; end if;
    if k in ('mc_cache', 'mc_backup_history') then continue; end if;
    if to_regclass('cakeshop.' || quote_ident(k)) is null then unknown := unknown || to_jsonb(k); continue; end if;
    execute format('select count(*) from cakeshop.%I', k) into n;
    tabs := tabs || jsonb_build_object('table', k, 'file', jsonb_array_length(v->'rows'), 'current', n);
  end loop;
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into notin from pg_class c
   where c.relnamespace = 'cakeshop'::regnamespace and c.relkind = 'r' and c.relname not in ('mc_cache', 'mc_backup_history') and not (d->'tables') ? c.relname::text;

  if not p_apply then
    -- تجربة استرجاع كاملة وبعدين بترجع كل حاجة زي ما كانت
    begin
      perform cakeshop.cs_restore_apply(d);
      raise exception using errcode = 'P0001', message = '__dry_run_ok__';
    exception when others then
      if sqlerrm <> '__dry_run_ok__' then dry := sqlerrm; end if;
    end;
    return jsonb_build_object('ok', dry = '', 'error', dry, 'created_at', f->>'created_at', 'created_by', f->>'created_by',
      'size_bytes', octet_length(p_file), 'tables', tabs, 'unknown_tables', unknown, 'not_in_file', notin);
  end if;

  if p_confirm is distinct from 'استرجاع' then raise exception 'لازم تكتب كلمة «استرجاع» للتأكيد'; end if;
  -- نسخة من البيانات الحالية قبل الاستبدال (بتفضل محفوظة جوه النظام)
  cur := cakeshop.cs_backup_data();
  sum := encode(sha256(convert_to(cur::text, 'UTF8')), 'hex');
  select coalesce(jsonb_object_agg(e.k, jsonb_array_length(e.v->'rows')), '{}'::jsonb) into cnt from jsonb_each(cur->'tables') e(k, v);
  insert into cakeshop.mc_backup_history (created_by, kind, size_bytes, checksum, counts, note, snapshot)
    values (coalesce(p_actor, ''), 'pre_restore', octet_length(cur::text), sum, cnt, 'نسخة تلقائية قبل الاسترجاع', cur) returning id into pre_id;
  -- نحتفظ ببيانات آخر 5 نسخ pre_restore بس
  update cakeshop.mc_backup_history set snapshot = null where kind = 'pre_restore' and snapshot is not null
    and id not in (select id from cakeshop.mc_backup_history where kind = 'pre_restore' and snapshot is not null order by id desc limit 5);
  perform cakeshop.cs_restore_apply(d);
  insert into cakeshop.mc_backup_history (created_by, kind, size_bytes, checksum, counts, note)
    values (coalesce(p_actor, ''), 'restore', octet_length(p_file), f->>'checksum', f->'counts', 'استرجاع نسخة بتاريخ ' || coalesce(to_char((f->>'created_at')::timestamptz at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'), ''));
  return jsonb_build_object('ok', true, 'pre_restore_id', pre_id, 'tables', tabs);
end $$;

revoke all on function cakeshop.cs_backup_data() from public, anon, authenticated;
revoke all on function cakeshop.cs_backup(text) from public, anon, authenticated;
revoke all on function cakeshop.cs_restore_apply(jsonb) from public, anon, authenticated;
revoke all on function cakeshop.cs_restore(text, text, boolean, text) from public, anon, authenticated;
