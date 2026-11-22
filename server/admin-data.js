/**
 * Cake Shop — تقرير المبيعات على مستوى الصنف، لوحة المؤشرات، تصدير Excel، والنسخ الاحتياطي.
 *   itemSales, dashPro           → صلاحية «لوحة المؤشرات» (dashboard)
 *   exportData, backup*          → صاحب المحل (owner) بس
 * التصدير والنسخ بيقروا البيانات بس، ومفيش أي تعديل على البيانات الأصلية.
 * الاسترجاع بيتم من خلال cakeshop.cs_restore (server/backup.sql): فحص + تجربة كاملة، وبعدين تنفيذ بعد التأكيد.
 */

export const ADMIN_DATA_ACTIONS = ['itemSales', 'dashPro', 'exportData', 'backupInfo', 'backupCreate', 'backupCheck', 'backupRestore', 'backupSnapshot'];
const TZ = 'Africa/Cairo';
const T = (s) => String(s === undefined || s === null ? '' : s).trim();
const N = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(N(n) * 100) / 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// كل سطر صنف في كل فاتورة: طلبات الأونلاين والترابيزات (من الأصناف المحفوظة في الطلب) + الفواتير اليدوية (بدون أصناف)
async function itemRows(sql) {
  const rows = await sql.unsafe(`
    with o as (
      select o.*, s.session_no, s.invoice_no s_inv,
        coalesce(nullif(o.invoice_no, ''), nullif(s.invoice_no, ''),
          case when o.delivery = 'dinein' then 'TB-' || coalesce(s.session_no::text, o.order_no::text) else 'ON-' || o.order_no end) inv,
        case when jsonb_typeof(o.items) = 'array' and jsonb_array_length(o.items) > 0 then o.items
             else jsonb_build_array(jsonb_build_object('name', o.product_name, 'code', o.product_code, 'qty', o.qty, 'unit_price', o.unit_price,
                    'old_price', 0, 'line_subtotal', o.subtotal, 'line_discount', o.product_discount, 'line_total', o.subtotal - o.product_discount, 'product_id', o.product_id)) end its
      from cakeshop.mc_shop_orders o left join cakeshop.mc_shop_table_sessions s on s.id = o.session_id
    )
    select 'o' src, o.id::text as oid, o.order_no, o.inv invoice_no, o.created_at, to_char(o.created_at at time zone '${TZ}', 'YYYY-MM-DD') as day,
      coalesce(nullif(o.customer_name, ''), cu.name, '') customer_name, coalesce(o.member_no, '') member_no, coalesce(o.customer_id, '') customer_id,
      o.delivery, o.status, coalesce(o.table_name, '') table_name, coalesce(t.status, '') inv_status,
      i.ord line_no, coalesce(i.it->>'name', '') item_name, coalesce(nullif(i.it->>'code', ''), p.code, '') item_code,
      coalesce(nullif(i.it->>'variant', ''), '') variant, coalesce(nullif(i.it->>'color', ''), '') flavor,
      coalesce(c.name, '') category, coalesce(p.category_id::text, '') category_id, coalesce(i.it->>'product_id', '') product_id,
      coalesce((i.it->>'qty')::numeric, 0)::float8 qty,
      coalesce(nullif((i.it->>'old_price')::numeric, 0), (i.it->>'unit_price')::numeric, 0)::float8 unit_price,
      coalesce((i.it->>'line_subtotal')::numeric, 0)::float8 total,
      coalesce((i.it->>'line_discount')::numeric, 0)::float8 line_disc,
      coalesce((i.it->>'line_total')::numeric, 0)::float8 line_total,
      (coalesce(o.promo_discount, 0) + coalesce(o.birthday_discount, 0))::float8 order_disc,
      sum(coalesce((i.it->>'line_total')::numeric, 0)) over (partition by o.id)::float8 items_total
    from o cross join lateral jsonb_array_elements(o.its) with ordinality i(it, ord)
    left join cakeshop.mc_shop_products p on p.id::text = i.it->>'product_id'
    left join cakeshop.mc_shop_categories c on c.id = p.category_id
    left join cakeshop.mc_customers cu on cu.customer_id = o.customer_id
    left join lateral (select tt.status from cakeshop.mc_transactions tt where tt.invoice_no = o.inv order by (tt.status = 'valid') desc, tt._seq desc limit 1) t on true
    union all
    select 'm', t.txn_id, null, t.invoice_no, t.created_at, to_char(t.created_at at time zone '${TZ}', 'YYYY-MM-DD'),
      coalesce(cu.name, ''), coalesce(t.member_no, ''), coalesce(t.customer_id, ''), 'store', case when t.status = 'void' then 'void' else 'completed' end, '', t.status,
      1, 'فاتورة يدوية' || case when coalesce(t.category, '') <> '' then ' – ' || t.category else '' end, '', '', '', coalesce(t.category, ''), '', '',
      0, coalesce(t.amount, 0), coalesce(t.amount, 0), coalesce(t.discount_amount, 0), coalesce(t.amount, 0) - coalesce(t.discount_amount, 0), 0, 0
    from cakeshop.mc_transactions t left join cakeshop.mc_customers cu on cu.customer_id = t.customer_id
    where not exists (select 1 from cakeshop.mc_shop_orders o2 where o2.invoice_no = t.invoice_no and o2.invoice_no <> '')
      and not exists (select 1 from cakeshop.mc_shop_table_sessions s2 where s2.invoice_no = t.invoice_no and s2.invoice_no <> '')
      and t.invoice_no !~ '^(ON|TB)-[0-9]+$'
    order by 5 desc, 3 desc nulls last, 14`);
  return rows.map((x) => {
    // الخصم على الصنف = خصم الصنف نفسه + نصيبه من خصومات الفاتورة (كود خصم / عيد ميلاد) بنسبة قيمته
    let disc = N(x.line_disc);
    if (x.src === 'o' && N(x.order_disc) > 0 && N(x.items_total) > 0) disc += N(x.order_disc) * N(x.line_total) / N(x.items_total);
    disc = r2(disc);
    // الفاتورة الملغية تتحسب «ملغية» حتى لو الطلب مكتمل
    const status = x.src === 'o' && x.inv_status === 'void' ? 'void' : x.status;
    return {
      invoice_no: x.invoice_no, order_no: x.order_no === null ? '' : Number(x.order_no), created_at: x.created_at, day: x.day,
      customer_name: x.customer_name, member_no: x.member_no, customer_id: x.customer_id,
      type: x.delivery === 'dinein' ? 'dinein' : x.delivery === 'delivery' ? 'delivery' : x.delivery === 'store' ? 'store' : 'pickup',
      status, table_name: x.table_name, item_name: x.item_name, item_code: x.item_code, flavor: x.flavor, variant: x.variant,
      category: x.category, product_id: x.product_id, manual: x.src === 'm',
      qty: N(x.qty), unit_price: r2(x.unit_price), total: r2(x.total), discount: disc, net: r2(N(x.total) - disc),
    };
  });
}

function cairoDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date()); }

async function dashPro(sql) {
  const all = await itemRows(sql);
  const sold = all.filter((r) => r.status === 'completed');
  const today = cairoDay(), month = today.slice(0, 8) + '01';
  const t30 = new Date(Date.now() - 29 * 86400000), from30 = cairoDay(t30);
  const agg = (rows) => {
    const inv = new Set(rows.map((r) => r.invoice_no));
    const gross = r2(rows.reduce((s, r) => s + r.total, 0)), disc = r2(rows.reduce((s, r) => s + r.discount, 0));
    return { gross, discount: disc, net: r2(gross - disc), invoices: inv.size, qty: rows.reduce((s, r) => s + r.qty, 0), avg: inv.size ? r2((gross - disc) / inv.size) : 0 };
  };
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const k = cairoDay(new Date(Date.now() - i * 86400000));
    const a = agg(sold.filter((r) => r.day === k));
    days.push({ day: k, net: a.net, invoices: a.invoices });
  }
  // أداء الأصناف في آخر 30 يوم (المكتمل بس، من غير الفواتير اليدوية لأنها من غير أصناف)
  const prodMap = {};
  sold.filter((r) => !r.manual && r.day >= from30).forEach((r) => {
    const k = r.product_id || r.item_name;
    const p = prodMap[k] || (prodMap[k] = { key: k, name: r.item_name, code: r.item_code, qty: 0, net: 0 });
    p.qty += r.qty; p.net = r2(p.net + r.net);
  });
  const prods = Object.keys(prodMap).map((k) => prodMap[k]);
  const catalog = await sql.unsafe(`select p.id::text id, p.name, coalesce(p.code, '') code from cakeshop.mc_shop_products p
    left join cakeshop.mc_shop_categories c on c.id = p.category_id where not p.hidden and coalesce(c.hidden, false) = false`);
  const slow = catalog.map((p) => ({ key: p.id, name: p.name, code: p.code, qty: prodMap[p.id] ? prodMap[p.id].qty : 0, net: prodMap[p.id] ? prodMap[p.id].net : 0 }))
    .sort((a, b) => a.qty - b.qty || a.net - b.net || a.name.localeCompare(b.name, 'ar')).slice(0, 5);
  const [o] = await sql.unsafe(`select
      count(*) filter (where status = 'pending')::int new_,
      count(*) filter (where status in ('approved','preparing','ready','shipped','served'))::int progress,
      count(*) filter (where status = 'completed')::int completed,
      count(*) filter (where status in ('cancelled','rejected'))::int cancelled
    from cakeshop.mc_shop_orders`);
  const [c] = await sql.unsafe(`select count(*)::int total,
      count(*) filter (where created_at >= now() - interval '30 days')::int new30,
      (select coalesce(sum(points), 0) from cakeshop.mc_pointsledger where type in ('EARN', 'ADJUST_ADD', 'REVERSAL'))::float8 points_given
    from cakeshop.mc_customers`);
  const top = await sql.unsafe(`select t.customer_id, coalesce(cu.name, '') name, coalesce(cu.member_no, '') member_no, count(*)::int count,
      coalesce(sum(t.net_amount), 0)::float8 total
    from cakeshop.mc_transactions t join cakeshop.mc_customers cu on cu.customer_id = t.customer_id
    where t.status = 'valid' and t.created_at >= now() - interval '30 days'
    group by 1, 2, 3 order by count(*) desc, sum(t.net_amount) desc limit 5`);
  return {
    today, month_start: month, from30,
    today_sales: agg(sold.filter((r) => r.day === today)),
    month_sales: agg(sold.filter((r) => r.day >= month)),
    days,
    top_qty: prods.slice().sort((a, b) => b.qty - a.qty || b.net - a.net).slice(0, 5),
    top_net: prods.slice().sort((a, b) => b.net - a.net || b.qty - a.qty).slice(0, 5),
    slow,
    orders: { new: o.new_, progress: o.progress, completed: o.completed, cancelled: o.cancelled },
    customers: { total: c.total, new30: c.new30, points_given: N(c.points_given), top },
  };
}

// ---------- التصدير ----------
const SECRET_COL = /(^|_)(hash|salt|token|secret|password|pin)(_|$)/i;
const NUM_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const EXPORT_SETS = [
  ['invoices', 'الفواتير', 'mc_transactions', 'created_at'],
  ['sales_details', 'تفاصيل المبيعات', null, 'created_at'],
  ['orders', 'الطلبات', 'mc_shop_orders', 'created_at'],
  ['products', 'المنتجات', 'mc_shop_products', null],
  ['categories', 'الأقسام', 'mc_shop_categories', null],
  ['stock', 'المخزون', 'mc_shop_stock', null],
  ['stock_moves', 'حركة المخزون', 'mc_shop_stock_moves', 'created_at'],
  ['customers', 'العملاء', 'mc_customers', null],
  ['points', 'حركة النقاط', 'mc_pointsledger', 'created_at'],
  ['redemptions', 'المكافآت المستبدلة', 'mc_redemptions', 'created_at'],
  ['offers', 'العروض', 'mc_offers', null],
  ['promos', 'أكواد الخصم', 'mc_shop_promos', null],
  ['birthday', 'عروض أعياد الميلاد', 'mc_birthdayrewards', 'created_at'],
  ['tables', 'الترابيزات', 'mc_shop_tables', null],
  ['sessions', 'جلسات الترابيزات', 'mc_shop_table_sessions', 'opened_at'],
  ['table_help', 'نداءات الترابيزات', 'mc_shop_table_help', 'created_at'],
  ['tiers', 'المستويات', 'mc_tiers', null],
  ['branches', 'الفروع', 'mc_branches', null],
  ['employees', 'الموظفين', 'mc_employees', null],
  ['users', 'مستخدمي الإدارة', 'mc_adminusers', null],
  ['settings', 'الإعدادات', 'mc_settings', null],
  ['shop_settings', 'إعدادات المتجر', 'mc_shop_settings', null],
  ['addresses', 'عناوين العملاء', 'mc_shop_addresses', null],
  ['notifications', 'الإشعارات', 'mc_shop_notifications', 'created_at'],
  ['customer_notes', 'رسائل العملاء', 'mc_shop_customer_notes', 'created_at'],
  ['wa_consent', 'موافقات واتساب', 'mc_whatsappconsent', null],
  ['wa_log', 'سجل واتساب', 'mc_whatsapplog', 'created_at'],
  ['activity', 'سجل العمليات', 'mc_activitylogs', 'created_at'],
];
const fmtTs = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return d;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};
async function exportData(sql, p) {
  const want = Array.isArray(p.sets) ? p.sets.map(T) : [];
  const from = DAY.test(T(p.from)) ? T(p.from) : '', to = DAY.test(T(p.to)) ? T(p.to) : '';
  const sets = EXPORT_SETS.filter((s) => want.indexOf(s[0]) >= 0);
  if (!sets.length) throw new Error('اختار البيانات اللي عايز تصدّرها');
  const out = [];
  for (const [id, title, table, dcol] of sets) {
    if (id === 'sales_details') {
      let rows = await itemRows(sql);
      if (from) rows = rows.filter((r) => r.day >= from);
      if (to) rows = rows.filter((r) => r.day <= to);
      out.push({ id, title, rows: rows.map((r) => Object.assign({}, r, { created_at: fmtTs(r.created_at) })) });
      continue;
    }
    const exists = await sql.unsafe('select to_regclass($1) r', ['cakeshop.' + table]);
    if (!exists[0].r) continue;
    const cond = [], args = [];
    if (dcol && from) { args.push(from); cond.push(`(${dcol} at time zone '${TZ}')::date >= $${args.length}::date`); }
    if (dcol && to) { args.push(to); cond.push(`(${dcol} at time zone '${TZ}')::date <= $${args.length}::date`); }
    const res = await sql.unsafe(`select * from cakeshop.${table}${cond.length ? ' where ' + cond.join(' and ') : ''}${dcol ? ` order by ${dcol}` : ''}`, args);
    const cols = (res.columns || []).filter((c) => !SECRET_COL.test(c.name));
    const rows = Array.from(res).map((row) => {
      const o = {};
      cols.forEach((c) => {
        let v = row[c.name];
        if (v instanceof Date) v = fmtTs(v);
        else if (v !== null && v !== undefined && NUM_OIDS.has(c.type) && typeof v === 'string') v = Number(v);
        else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
        o[c.name] = v === null || v === undefined ? '' : v;
      });
      return o;
    });
    out.push({ id, title, columns: cols.map((c) => c.name), rows });
  }
  return { sheets: out, from, to, at: fmtTs(new Date()) };
}

// ---------- النسخ الاحتياطي ----------
async function backupInfo(sql) {
  const rows = await sql.unsafe(`select id, created_at, created_by, kind, size_bytes, checksum, counts, note, snapshot is not null has_snapshot
    from cakeshop.mc_backup_history order by id desc limit 50`);
  const [cur] = await sql.unsafe(`select count(*)::int tables, coalesce(sum(n_live_tup), 0)::bigint rows from pg_stat_user_tables where schemaname = 'cakeshop'`);
  return {
    history: rows.map((r) => ({ id: Number(r.id), created_at: r.created_at, created_by: r.created_by, kind: r.kind, size_bytes: Number(r.size_bytes), note: r.note,
      rows: Object.values(r.counts || {}).reduce((s, n) => s + N(n), 0), has_snapshot: r.has_snapshot })),
    last_manual: (rows.find((r) => r.kind === 'manual') || {}).created_at || null,
  };
}

export async function adminData(ctx, user, action, p) {
  const { sql } = ctx;
  const perms = user.permissions || [];
  if (action === 'itemSales' || action === 'dashPro') {
    if (perms.indexOf('dashboard') < 0) throw new Error('ليس لديك صلاحية: لوحة المؤشرات والتقارير');
    if (action === 'itemSales') return { rows: await itemRows(sql) };
    return dashPro(sql);
  }
  if (user.role !== 'owner') throw new Error('التصدير والنسخ الاحتياطي لصاحب المحل بس');
  const actor = user.name || 'صاحب المحل';
  if (action === 'exportData') return exportData(sql, p);
  if (action === 'backupInfo') return backupInfo(sql);
  if (action === 'backupCreate') {
    const [r] = await sql.unsafe('select cakeshop.cs_backup($1) f', [actor]);
    return { file: r.f, name: 'cake-shop-backup-' + fmtTs(new Date()).replace(/[: ]/g, '-') + '.json' };
  }
  if (action === 'backupSnapshot') {
    const id = Number(p.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('النسخة غير موجودة');
    const [r] = await sql.unsafe(`select jsonb_build_object('format', 'cake-shop-backup', 'version', 1, 'schema', 'cakeshop', 'created_at', b.created_at,
        'created_by', b.created_by, 'counts', b.counts, 'checksum', encode(sha256(convert_to(b.snapshot::text, 'UTF8')), 'hex'), 'data', b.snapshot)::text f, b.created_at
      from cakeshop.mc_backup_history b where b.id = $1 and b.snapshot is not null`, [id]);
    if (!r) throw new Error('النسخة دي مش محفوظة');
    return { file: r.f, name: 'cake-shop-before-restore-' + fmtTs(r.created_at).replace(/[: ]/g, '-') + '.json' };
  }
  if (action === 'backupCheck' || action === 'backupRestore') {
    const file = typeof p.file === 'string' ? p.file : '';
    if (!file) throw new Error('اختار ملف النسخة الاحتياطية');
    if (file.length > 60 * 1024 * 1024) throw new Error('الملف كبير جداً');
    const apply = action === 'backupRestore';
    if (apply && T(p.confirm) !== 'استرجاع') throw new Error('لازم تكتب كلمة «استرجاع» للتأكيد');
    try {
      const [r] = await sql.unsafe('select cakeshop.cs_restore($1, $2, $3, $4) r', [file, actor, apply, apply ? 'استرجاع' : '']);
      return typeof r.r === 'string' ? JSON.parse(r.r) : r.r;
    } catch (e) {
      const m = String((e && e.message) || '');
      if (/[؀-ۿ]/.test(m)) throw new Error(m);
      console.error(e);
      throw new Error('تعذر فحص/استرجاع الملف: ' + m.slice(0, 200));
    }
  }
  throw new Error('طلب غير معروف');
}
