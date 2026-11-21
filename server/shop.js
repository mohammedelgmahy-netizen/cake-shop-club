/**
 * Cake Shop Dessert Cafe — «تصفح منتجاتنا»: أقسام ومنتجات المحل.
 * الجداول: cakeshop.mc_shop_categories و cakeshop.mc_shop_products (server/shop.sql).
 *   fn 'shop'      → للعميل: catalog (الأقسام والمنتجات الظاهرة فقط)، quote (حساب السلة)، saveAddress، checkout، myOrders، cancelOrder
 *   fn 'shopAdmin' → للإدارة (صلاحية «الإعدادات»): list, saveCategory, orderCategories, deleteCategory,
 *                    saveProduct, setProduct, deleteProduct, upload, orders, setOrderStatus, saveOrderNotes,
 *                    promos, savePromo, setPromo, shopSettings, saveShopSettings
 * الرد بنفس شكل باقي النظام: { result: { ok, data } } أو { result: { ok: false, error } }
 */

const T = (s) => String(s === undefined || s === null ? '' : s).trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMG_URL = /^https:\/\/[^\s"'<>]+$/;
const ok = (data) => ({ result: { ok: true, data } });
const bad = (error) => ({ result: { ok: false, error } });

function num(v, name) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, ''));
  if (!isFinite(n) || n < 0 || n > 100000000) throw new Error(name + ' غير صحيح');
  return Math.round(n * 100) / 100;
}

function cleanImages(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const im of list.slice(0, 12)) {
    const u = T(im && im.u), t = T(im && im.t) || u;
    if (!IMG_URL.test(u) || !IMG_URL.test(t)) throw new Error('رابط صورة غير صحيح');
    out.push({ u, t });
  }
  return out;
}

function cleanProduct(p) {
  const name = T(p.name);
  if (!name) throw new Error('اكتب اسم المنتج');
  if (name.length > 150) throw new Error('اسم المنتج طويل جداً');
  const price = num(p.price, 'السعر');
  const old = num(p.old_price, 'السعر قبل الخصم');
  if (old && old <= price) throw new Error('السعر قبل الخصم لازم يكون أكبر من سعر البيع');
  const specs = (Array.isArray(p.specs) ? p.specs : []).slice(0, 60)
    .map((s) => [T(s && s[0]).slice(0, 80), T(s && s[1]).slice(0, 300)]).filter((s) => s[0] || s[1]);
  const colors = (Array.isArray(p.colors) ? p.colors : []).slice(0, 30)
    .map((c) => ({ n: T(c && c.n).slice(0, 40), c: /^#[0-9a-f]{6}$/i.test(T(c && c.c)) ? T(c.c) : '', i: IMG_URL.test(T(c && c.i)) ? T(c.i) : '' })).filter((c) => c.n);
  const variants = (Array.isArray(p.variants) ? p.variants : []).slice(0, 30).map((v) => T(v).slice(0, 60)).filter(Boolean);
  const code = T(p.code).slice(0, 40);
  return {
    name, code,
    category_id: UUID.test(T(p.category_id)) ? T(p.category_id) : null,
    description: T(p.description).slice(0, 8000),
    price, old_price: old,
    available: p.available !== false,
    hidden: !!p.hidden,
    images: cleanImages(p.images),
    specs, colors, variants,
  };
}

// كميات المخزون الجاية من فورم المنتج: لكل اختيار (النكهة|الحجم) الموجود فعلاً في المنتج
function cleanStock(list, v) {
  const colors = v.colors.map((c) => c.n), variants = v.variants;
  const valid = new Set();
  (colors.length ? colors : ['']).forEach((c) => (variants.length ? variants : ['']).forEach((x) => valid.add(stockKey(c, x))));
  const out = [];
  for (const it of (Array.isArray(list) ? list : []).slice(0, 1000)) {
    const key = String(it && it.key || '');
    if (!valid.has(key)) continue;
    const n = Number(it.physical);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new Error('الكمية لازم تكون رقم صحيح 0 أو أكتر');
    out.push({ key, physical: n });
  }
  return out;
}

const PRODUCT_COLS = 'id, code, category_id, name, description, price, old_price, available, hidden, images, specs, colors, variants, created_at, updated_at, track_stock, low_stock_at';
// المتاح لكل اختيار (النكهة|الحجم) للمنتجات اللي عليها تتبع مخزون: المتاح = الفعلي − المحجوز
const STOCK_AVAIL = `case when p.track_stock then (select coalesce(json_object_agg(s.key, greatest(s.physical - s.reserved, 0)), '{}'::json) from cakeshop.mc_shop_stock s where s.product_id = p.id) end as stock`;
const STOCK_FULL = `(select coalesce(json_agg(json_build_object('key', s.key, 'physical', s.physical, 'reserved', s.reserved, 'available', greatest(s.physical - s.reserved, 0)) order by s.key), '[]'::json) from cakeshop.mc_shop_stock s where s.product_id = p.id) as stock`;
export const stockKey = (color, variant) => T(color) + '|' + T(variant);
const CATEGORY_COLS = 'id, name, icon, image, sort, hidden';

async function catalog(sql) {
  const [r] = await sql.unsafe(`select json_build_object(
    'categories', (select coalesce(json_agg(c order by c.sort, c.created_at), '[]') from (select ${CATEGORY_COLS}, created_at from cakeshop.mc_shop_categories where not hidden) c),
    'products', (select coalesce(json_agg(p order by p.created_at desc), '[]') from (
      select ${PRODUCT_COLS}, ${STOCK_AVAIL} from cakeshop.mc_shop_products p
      where not p.hidden and (p.category_id is null or p.category_id in (select id from cakeshop.mc_shop_categories where not hidden))) p)
  ) as data`);
  return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
}


/* ---------------- السلة وإتمام الشراء والطلبات ----------------
 * الأسعار والخصومات بتتحسب هنا في السيرفر من المنتجات وأكواد الخصم الحقيقية،
 * ومفيش أي سعر جاي من التطبيق بيتصدّق. */
export const ORDER_STATUS = ['pending', 'approved', 'preparing', 'ready', 'shipped', 'completed', 'rejected', 'cancelled'];
/* مسار الحالات الصارم: الحالات اللي ينفع الطلب ينتقل لها من حالته الحالية بس، ومفيش رجوع لورا.
 *   توصيل: قيد المراجعة → تم القبول → جاري التجهيز → جاهز → تم الشحن → تم إتمام الطلب
 *   استلام من الفرع: نفس المسار من غير «تم الشحن» (جاهز → تم إتمام الطلب)
 *   الرفض: من «قيد المراجعة» بس. الإلغاء: أي وقت قبل الإتمام، وبسبب مكتوب.
 *   الحالات النهائية: تم إتمام الطلب / مرفوض / ملغي. صاحب المحل بس يقدر يعمل تصحيح استثنائي بسبب مكتوب. */
export function nextStatuses(status, delivery) {
  switch (status) {
    case 'pending': return ['approved', 'rejected', 'cancelled'];
    case 'approved': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return delivery === 'delivery' ? ['shipped', 'cancelled'] : ['completed', 'cancelled'];
    case 'shipped': return delivery === 'delivery' ? ['completed', 'cancelled'] : ['completed', 'cancelled'];
    default: return [];
  }
}
const ST_AR = { pending: 'قيد المراجعة', approved: 'تم القبول', preparing: 'جاري التجهيز', ready: 'جاهز', shipped: 'تم الشحن', completed: 'تم إتمام الطلب', rejected: 'مرفوض', cancelled: 'ملغي' };
const ORDER_COLS = `o.id, o.order_no, o.customer_id, o.customer_name, o.customer_phone, o.member_no, o.product_id, o.product_name, o.product_code,
  o.color, o.variant, o.qty, o.unit_price, o.total, o.notes, o.status, o.reject_reason, o.history, o.created_at, o.updated_at,
  o.items, o.subtotal, o.product_discount, o.promo_code, o.promo_discount, o.shipping, o.method, o.delivery, o.address, o.admin_notes, o.branch_id, o.branch_name, o.stock_state,
  o.invoice_no, o.invoice_status, o.invoice_error, o.invoice_at, o.points_awarded, o.completed_at`;
const money2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const PROMO_CODE = /^[A-Za-z0-9_-]{3,30}$/;

async function customerByToken(sql, token) {
  const t = T(token);
  if (!/^[a-f0-9]{64}$/.test(t)) throw new Error('افتح الكارت بتاعك الأول علشان تقدر تطلب');
  const r = await sql.unsafe('select customer_id, name, phone, member_no, status from cakeshop.mc_customers where access_token = $1', [t]);
  if (!r.length) throw new Error('افتح الكارت بتاعك الأول علشان تقدر تطلب');
  if (r[0].status !== 'active') throw new Error('عضويتك موقوفة حالياً. تواصل مع المحل.');
  return r[0];
}

async function branches(q) {
  const r = await q.unsafe("select branch_id, name, address, phone from cakeshop.mc_branches where active is true order by name");
  return r.map((b) => ({ id: b.branch_id, name: b.name, address: b.address || '', phone: b.phone || '' }));
}
async function savedAddress(q, customerId) {
  const r = await q.unsafe('select address from cakeshop.mc_shop_addresses where customer_id = $1', [customerId]);
  return r.length ? r[0].address : '';
}

async function shopSettings(sql) {
  const r = await sql.unsafe('select delivery_enabled, delivery_fee from cakeshop.mc_shop_settings where id = 1');
  return r.length ? { delivery_enabled: !!r[0].delivery_enabled, delivery_fee: Number(r[0].delivery_fee) } : { delivery_enabled: false, delivery_fee: 0 };
}

// تنضيف المنتجات اللي جاية من السلة: نفس المنتج بنفس اللون والنوع يتجمع في سطر واحد
function cleanItems(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('السلة فاضية');
  const map = new Map();
  for (const it of list.slice(0, 60)) {
    const pid = T(it && it.product_id);
    if (!UUID.test(pid)) continue;
    const color = T(it.color).slice(0, 40), variant = T(it.variant).slice(0, 60);
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1)) continue;
    const k = pid + '|' + color + '|' + variant;
    const prev = map.get(k);
    if (prev) prev.qty += qty; else map.set(k, { product_id: pid, color, variant, qty });
  }
  const out = [...map.values()];
  if (!out.length) throw new Error('السلة فاضية');
  if (out.length > 30) throw new Error('أقصى عدد منتجات في الطلب الواحد 30');
  for (const it of out) if (it.qty > 50) throw new Error('أقصى كمية من المنتج الواحد 50');
  return out;
}

function promoStatusMsg(pr, today) {
  if (!pr || !pr.active) return 'كود الخصم غير صحيح';
  if (pr.starts_on && String(pr.starts_on) > today) return 'كود الخصم غير صحيح';
  if (pr.ends_on && String(pr.ends_on) < today) return 'كود الخصم انتهت صلاحيته';
  return '';
}
const dateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/**
 * حساب الطلب: المنتجات بأسعارها الحالية + خصومات المنتجات + كود الخصم + الشحن.
 * q = sql أو transaction. lockPromo = نقفل صف الكود وقت تأكيد الطلب علشان عدد مرات الاستخدام يتحسب صح.
 */
async function quote(q, customer, p, lockPromo) {
  const items = cleanItems(p.items);
  const ids = [...new Set(items.map((i) => i.product_id))];
  const prods = await q.unsafe(`select p.id, p.name, p.code, p.price, p.old_price, p.available, p.hidden, p.colors, p.variants, p.category_id, p.track_stock, ${STOCK_AVAIL},
      coalesce(p.images->0->>'t', p.images->0->>'u', '') as image,
      (p.category_id is null or exists (select 1 from cakeshop.mc_shop_categories k where k.id = p.category_id and not k.hidden)) as cat_ok
    from cakeshop.mc_shop_products p where p.id = any($1::uuid[])`, [ids]);
  const byId = new Map(prods.map((r) => [r.id, r]));
  const lines = items.map((it) => {
    const pr = byId.get(it.product_id);
    const line = { product_id: it.product_id, name: pr ? pr.name : '', code: pr ? pr.code || '' : '', image: pr ? pr.image : '', category_id: pr ? pr.category_id : null,
      color: it.color, variant: it.variant, qty: it.qty, unit_price: 0, old_price: 0, line_subtotal: 0, line_discount: 0, line_total: 0, error: '' };
    if (!pr || pr.hidden || !pr.cat_ok) { line.error = 'المنتج ده مش متاح دلوقتي'; return line; }
    if (!pr.available) line.error = 'غير متوفر حالياً';
    const colors = (Array.isArray(pr.colors) ? pr.colors : []).map((x) => x && x.n);
    const variants = Array.isArray(pr.variants) ? pr.variants : [];
    if (!line.error && colors.length && colors.indexOf(it.color) < 0) line.error = 'اختار النكهة';
    if (!line.error && !colors.length && it.color) line.error = 'النكهة دي مبقتش متاحة';
    if (!line.error && variants.length && variants.indexOf(it.variant) < 0) line.error = 'اختار الحجم';
    if (!line.error && !variants.length && it.variant) line.error = 'الحجم ده مبقاش متاح';
    if (!line.error && pr.track_stock) { // فحص مبدئي للعرض بس، والحجز الفعلي بيتم في قاعدة البيانات وقت تأكيد الطلب
      const st = pr.stock && typeof pr.stock === 'object' ? pr.stock : {};
      const av = Number(st[stockKey(it.color, it.variant)] || 0);
      line.stock_available = av;
      if (av <= 0) line.error = 'خلصت الكمية';
      else if (it.qty > av) line.error = 'الكمية المتاحة ' + av + ' بس';
    }
    const price = Number(pr.price), old = Number(pr.old_price) > price ? Number(pr.old_price) : 0;
    line.unit_price = price; line.old_price = old;
    line.line_total = money2(price * it.qty);
    line.line_subtotal = money2((old || price) * it.qty);
    line.line_discount = money2(line.line_subtotal - line.line_total);
    return line;
  });
  const good = lines.filter((l) => !l.error);
  const subtotal = money2(good.reduce((s, l) => s + l.line_subtotal, 0));
  const product_discount = money2(good.reduce((s, l) => s + l.line_discount, 0));
  const items_total = money2(good.reduce((s, l) => s + l.line_total, 0));

  // كود الخصم
  let promo = null;
  const code = T(p.promo);
  if (code) {
    promo = { code, ok: false, discount: 0, message: '' };
    const today = (await q.unsafe("select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD') d"))[0].d;
    const rows = PROMO_CODE.test(code)
      ? await q.unsafe(`select * from cakeshop.mc_shop_promos where lower(code) = lower($1)${lockPromo ? ' for update' : ''}`, [code]) : [];
    const pr = rows[0];
    const st = promoStatusMsg(pr && Object.assign({}, pr, { starts_on: dateStr(pr.starts_on), ends_on: dateStr(pr.ends_on) }), today);
    if (st) promo.message = st;
    else {
      promo.code = pr.code; promo.id = pr.id;
      const [u] = await q.unsafe(`select count(*)::int n, count(*) filter (where customer_id = $2)::int mine from cakeshop.mc_shop_orders
        where promo_id = $1 and status not in ('rejected','cancelled')`, [pr.id, customer.customer_id]);
      const pids = Array.isArray(pr.product_ids) ? pr.product_ids : [], cids = Array.isArray(pr.category_ids) ? pr.category_ids : [];
      const scoped = pids.length || cids.length;
      let elig = good.filter((l) => !scoped || pids.indexOf(l.product_id) >= 0 || (l.category_id && cids.indexOf(l.category_id) >= 0));
      if ((pr.max_uses > 0 && u.n >= pr.max_uses) || (pr.per_customer > 0 && u.mine >= pr.per_customer)) promo.message = 'تم الوصول إلى الحد الأقصى لاستخدام هذا الكود';
      else if (!elig.length) promo.message = 'هذا الكود غير متاح على المنتجات الموجودة في سلتك';
      else {
        if (!pr.stackable) elig = elig.filter((l) => !(l.line_discount > 0));
        const base = money2(elig.reduce((s, l) => s + l.line_total, 0));
        if (!elig.length) promo.message = 'لا يمكن استخدام هذا الكود مع خصم آخر';
        else if (Number(pr.min_order) > 0 && base < Number(pr.min_order)) promo.message = 'الكود ده محتاج طلب بقيمة ' + Number(pr.min_order) + ' على الأقل';
        else {
          let d = pr.kind === 'percent' ? base * Number(pr.value) / 100 : Number(pr.value);
          if (pr.kind === 'percent' && Number(pr.max_discount) > 0) d = Math.min(d, Number(pr.max_discount));
          d = money2(Math.min(d, base));
          promo.ok = true; promo.discount = d; promo.message = 'تم تطبيق كود الخصم بنجاح';
          promo.kind = pr.kind; promo.value = Number(pr.value);
        }
      }
    }
  }
  const promo_discount = promo && promo.ok ? promo.discount : 0;
  const set = await shopSettings(q);
  const delivery = p.delivery === 'delivery' ? 'delivery' : 'pickup';
  const shipping = delivery === 'delivery' && set.delivery_enabled ? money2(set.delivery_fee) : 0;
  const total = money2(Math.max(0, items_total - promo_discount) + shipping);
  const brs = await branches(q);
  return {
    branches: brs, saved_address: await savedAddress(q, customer.customer_id),
    lines, subtotal, product_discount, items_total, promo, promo_discount, delivery, shipping, total,
    delivery_enabled: set.delivery_enabled, delivery_fee: set.delivery_fee,
    customer: { name: customer.name, phone: customer.phone, member_no: customer.member_no },
  };
}

async function checkout(sql, c, p) {
  const method = p.method === 'cart' ? 'cart' : 'buy_now';
  const delivery = p.delivery === 'delivery' ? 'delivery' : 'pickup';
  const address = T(p.address).slice(0, 500);
  const notes = T(p.notes).slice(0, 500);
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('cakeshop.actor', $1, true)", ['العميل: ' + c.name]);
    const [cnt] = await tx.unsafe("select count(*)::int n from cakeshop.mc_shop_orders where customer_id = $1 and created_at > now() - interval '1 day'", [c.customer_id]);
    if (cnt.n >= 20) throw new Error('وصلت للحد الأقصى للطلبات النهارده. كلم المحل لو محتاج حاجة.');
    const qt = await quote(tx, c, p, true);
    const badLine = qt.lines.find((l) => l.error);
    if (badLine) throw new Error((badLine.name ? '«' + badLine.name + '»: ' : '') + badLine.error);
    if (qt.promo && !qt.promo.ok) throw new Error(qt.promo.message);
    if (delivery === 'delivery' && !qt.delivery_enabled) throw new Error('التوصيل مش متاح حالياً، اختار الاستلام من الفرع');
    if (delivery === 'delivery' && address.length < 5) throw new Error('أضف عنوان التوصيل الأول');
    let branch = null;
    if (delivery === 'pickup') {
      branch = qt.branches.find((b) => b.id === T(p.branch_id)) || (qt.branches.length === 1 ? qt.branches[0] : null);
      if (!branch) throw new Error(qt.branches.length ? 'اختار الفرع اللي هتستلم منه' : 'مفيش فرع متاح للاستلام حالياً. كلم المحل.');
    }
    if (p.expect_total !== undefined && p.expect_total !== null && money2(p.expect_total) !== qt.total) {
      const e = new Error('الأسعار اتغيرت. راجع الإجمالي الجديد وأكد تاني.'); e.quote = qt; throw e;
    }
    const items = qt.lines.map((l) => ({ product_id: l.product_id, name: l.name, code: l.code, color: l.color, variant: l.variant, qty: l.qty,
      unit_price: l.unit_price, old_price: l.old_price, line_subtotal: l.line_subtotal, line_discount: l.line_discount, line_total: l.line_total }));
    const first = items[0];
    const qtySum = items.reduce((s, i) => s + i.qty, 0);
    const title = first.name + (items.length > 1 ? ' + ' + (items.length - 1) + ' منتج تاني' : '');
    const hist = JSON.stringify([{ s: 'pending', at: new Date().toISOString(), by: 'customer' }]);
    const [o] = await tx.unsafe(`insert into cakeshop.mc_shop_orders (order_no, customer_id, customer_name, customer_phone, member_no, product_id, product_name, product_code,
        color, variant, qty, unit_price, total, notes, status, history, items, subtotal, product_discount, promo_id, promo_code, promo_discount, shipping, method, delivery, address,
        branch_id, branch_name)
      values (nextval('cakeshop.mc_shop_order_no'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14::text::jsonb, $15::text::jsonb,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) returning id, order_no`,
      [c.customer_id, c.name, c.phone, c.member_no, first.product_id, title, first.code || '', first.color, first.variant, qtySum, first.unit_price, qt.total, notes, hist,
        JSON.stringify(items), qt.subtotal, qt.product_discount, qt.promo && qt.promo.ok ? qt.promo.id : null, qt.promo && qt.promo.ok ? qt.promo.code : '',
        qt.promo_discount, qt.shipping, method, delivery, delivery === 'delivery' ? address : '', branch ? branch.id : '', branch ? branch.name : '']);
    return { id: o.id, order_no: Number(o.order_no), total: qt.total };
  });
}

async function withImages(sql, rows) {
  const ids = new Set();
  rows.forEach((o) => (Array.isArray(o.items) ? o.items : []).forEach((i) => { if (i && UUID.test(String(i.product_id || ''))) ids.add(i.product_id); }));
  const map = new Map();
  if (ids.size) {
    const r = await sql.unsafe("select id, coalesce(images->0->>'t', images->0->>'u', '') im from cakeshop.mc_shop_products where id = any($1::uuid[])", [[...ids]]);
    r.forEach((x) => map.set(x.id, x.im));
  }
  return rows.map((o) => publicOrder(o, map));
}

async function customerShop(sql, action, p) {
  const c = await customerByToken(sql, p.token);
  if (action === 'myOrders') {
    const rows = await sql.unsafe(`select ${ORDER_COLS} from cakeshop.mc_shop_orders o where o.customer_id = $1 order by o.created_at desc limit 200`, [c.customer_id]);
    return withImages(sql, rows);
  }
  if (action === 'quote') return quote(sql, c, p, false);
  if (action === 'mySummary') return customerSummary(sql, c);
  if (action === 'myNotes') { // إشعارات العميل (النقاط اللي اتضافت على طلباته ...)
    const rows = await sql.unsafe(`select id, title, body, ref_type, ref_id, created_at, read_at from cakeshop.mc_shop_customer_notes
      where customer_id = $1 order by created_at desc limit 30`, [c.customer_id]);
    return { notes: rows.map((n) => Object.assign({}, n, { id: Number(n.id) })), unread: rows.filter((n) => !n.read_at).length };
  }
  if (action === 'readNotes') {
    await sql.unsafe('update cakeshop.mc_shop_customer_notes set read_at = now() where customer_id = $1 and read_at is null', [c.customer_id]);
    return { done: true };
  }
  if (action === 'saveAddress') { // عنوان التوصيل المحفوظ في حساب العميل
    const a = T(p.address).slice(0, 500);
    if (a.length < 5) throw new Error('اكتب العنوان بالتفصيل');
    await sql.unsafe(`insert into cakeshop.mc_shop_addresses (customer_id, address, updated_at) values ($1, $2, now())
      on conflict (customer_id) do update set address = excluded.address, updated_at = now()`, [c.customer_id, a]);
    return { address: a };
  }
  if (action === 'checkout') return checkout(sql, c, p);
  if (action === 'order') { // النسخة القديمة من الصفحة (منتج واحد)
    return checkout(sql, c, { items: [{ product_id: p.product_id, color: p.color, variant: p.variant, qty: p.qty }], notes: p.notes, method: 'buy_now' });
  }
  if (action === 'cancelOrder') {
    if (!UUID.test(T(p.id))) throw new Error('الطلب غير موجود');
    const r = await sql.begin(async (tx) => {
      await tx.unsafe("select set_config('cakeshop.actor', $1, true)", ['العميل: ' + c.name]);
      return tx.unsafe(`update cakeshop.mc_shop_orders set status = 'cancelled', updated_at = now(),
        history = history || $3::text::jsonb
      where id = $1 and customer_id = $2 and status = 'pending' returning id`,
      [T(p.id), c.customer_id, JSON.stringify([{ s: 'cancelled', at: new Date().toISOString(), by: 'customer' }])]);
    });
    if (!r.length) throw new Error('الطلب ده مينفعش يتلغي، المحل بدأ فيه بالفعل. كلم المحل.');
    return { done: true };
  }
  throw new Error('طلب غير معروف');
}

/* ---------------- ملخص طلبات العميل (أونلاين + المحل) ----------------
 * الطلبات الأونلاين مربوطة بالعميل بـ customer_id بتاعه. فاتورة المحل اللي اتسجلت لطلب أونلاين رقمها ON-<رقم الطلب>
 * وبتتحسب مع الطلب نفسه مش كطلب جديد، فالطلب ميتعدش مرتين. */
export const invoiceForOrder = (orderNo) => 'ON-' + orderNo;
async function customerSummary(sql, c) {
  const [r] = await sql.unsafe(`with o as (
      select id, order_no, status, total, shipping, delivery, branch_name, created_at, items, product_name, qty
      from cakeshop.mc_shop_orders where customer_id = $1),
    t as (
      select txn_id, invoice_no, net_amount, amount, points_earned, created_at,
        exists (select 1 from o where 'ON-' || o.order_no = t0.invoice_no) as linked
      from cakeshop.mc_transactions t0 where customer_id = $1 and status <> 'void')
    select json_build_object(
      'online_total', (select count(*) from o),
      'online_active', (select count(*) from o where status in ('pending','approved','preparing','ready','shipped')),
      'online_completed', (select count(*) from o where status = 'completed'),
      'online_cancelled', (select count(*) from o where status in ('cancelled','rejected')),
      'online_value', (select coalesce(sum(total), 0) from o where status = 'completed'),
      'store_count', (select count(*) from t where not linked),
      'store_value', (select coalesce(sum(net_amount), 0) from t where not linked),
      'store', (select coalesce(json_agg(json_build_object('invoice_no', invoice_no, 'amount', net_amount, 'points', points_earned, 'created_at', created_at) order by created_at desc), '[]') from (select * from t where not linked order by created_at desc limit 100) x),
      'invoices', (select coalesce(json_object_agg(invoice_no, true), '{}') from t where linked)
    ) as data`, [c.customer_id]);
  const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  const n = (k) => Number(d[k] || 0);
  return {
    // إجمالي الطلبات = كل الطلبات الأونلاين (الملغية والمرفوضة بتظهر في السجل بس مش في الإجمالي) + مشتريات المحل اللي مش مربوطة بطلب أونلاين
    total_orders: n('online_total') - n('online_cancelled') + n('store_count'),
    active_orders: n('online_active'),
    completed_orders: n('online_completed') + n('store_count'),
    cancelled_orders: n('online_cancelled'),
    total_value: money2(n('online_value') + n('store_value')),
    online_orders: n('online_total'), store_orders: n('store_count'),
    store: (d.store || []).map((x) => ({ invoice_no: x.invoice_no, amount: Number(x.amount), points: Number(x.points), created_at: x.created_at })),
    invoices: d.invoices || {},
  };
}

function publicOrder(o, imgs) {
  const items = (Array.isArray(o.items) ? o.items : []).map((i) => ({
    product_id: i.product_id, name: i.name, code: i.code || '', color: i.color || '', variant: i.variant || '', qty: Number(i.qty),
    unit_price: Number(i.unit_price), old_price: Number(i.old_price || 0), line_subtotal: Number(i.line_subtotal || 0),
    line_discount: Number(i.line_discount || 0), line_total: Number(i.line_total || 0), image: (imgs && imgs.get(i.product_id)) || '',
  }));
  return {
    id: o.id, order_no: Number(o.order_no), product_id: o.product_id, product_name: o.product_name, product_code: o.product_code,
    color: o.color, variant: o.variant, qty: o.qty, unit_price: Number(o.unit_price), total: Number(o.total), notes: o.notes,
    items, subtotal: Number(o.subtotal), product_discount: Number(o.product_discount), promo_code: o.promo_code || '', promo_discount: Number(o.promo_discount),
    shipping: Number(o.shipping), method: o.method, delivery: o.delivery, address: o.address || '', branch_name: o.branch_name || '',
    status: o.status, reject_reason: o.reject_reason, image: items[0] ? items[0].image : '', created_at: o.created_at, updated_at: o.updated_at,
    history: (Array.isArray(o.history) ? o.history : []).map((h) => ({ s: h.s, at: h.at })),
    points: Number(o.points_awarded || 0), invoiced: !!o.invoice_no,
  };
}

/* ---------------- أكواد الخصم (الإدارة) ---------------- */
function cleanPromo(p) {
  const code = T(p.code).toUpperCase();
  if (!PROMO_CODE.test(code)) throw new Error('الكود لازم يكون من 3 لـ 30 حرف إنجليزي أو رقم (من غير مسافات)');
  const kind = p.kind === 'fixed' ? 'fixed' : 'percent';
  const value = num(p.value, 'قيمة الخصم');
  if (!(value > 0)) throw new Error('اكتب قيمة الخصم');
  if (kind === 'percent' && value > 100) throw new Error('النسبة لازم تكون من 1 لـ 100');
  const d = (v, n) => { const s = T(v); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(n + ' غير صحيح'); return s; };
  const starts_on = d(p.starts_on, 'تاريخ البداية'), ends_on = d(p.ends_on, 'تاريخ النهاية');
  if (starts_on && ends_on && ends_on < starts_on) throw new Error('تاريخ النهاية لازم يكون بعد تاريخ البداية');
  const int = (v, n) => { const x = num(v, n); if (x !== Math.floor(x)) throw new Error(n + ' لازم يكون رقم صحيح'); return Math.min(x, 1000000); };
  return {
    code, kind, value,
    min_order: num(p.min_order, 'الحد الأدنى للطلب'),
    max_discount: kind === 'percent' ? num(p.max_discount, 'أقصى خصم') : 0,
    starts_on, ends_on,
    max_uses: int(p.max_uses, 'عدد مرات الاستخدام'),
    per_customer: int(p.per_customer, 'عدد مرات الاستخدام لكل عميل'),
    active: p.active !== false,
    product_ids: (Array.isArray(p.product_ids) ? p.product_ids : []).map(T).filter((x) => UUID.test(x)).slice(0, 500),
    category_ids: (Array.isArray(p.category_ids) ? p.category_ids : []).map(T).filter((x) => UUID.test(x)).slice(0, 100),
    stackable: p.stackable !== false,
  };
}


/* ---------------- فاتورة الطلب الأونلاين ونقاط العميل ----------------
 * لما الطلب يبقى «تم إتمام الطلب»: فاتورة مبيعات واحدة بس في نظام المبيعات بتاع برنامج الولاء (رقمها ON-<رقم الطلب>)
 * بنفس قواعد النقاط اللي في الإعدادات. النقاط بتتضاف بعد الفاتورة بس، ومرة واحدة.
 * لو فشلت: الطلب بيتعلّم «فشلت الفاتورة» + إشعار للإدارة، وينفع تعيد المحاولة من تفاصيل الطلب. */
async function invoiceOrder(ctx, token, id) {
  const { sql } = ctx;
  // حجز المحاولة: محاولة واحدة بس في نفس الوقت، ومفيش فاتورة تانية لو اتعملت قبل كده
  const cl = await sql.unsafe(`update cakeshop.mc_shop_orders set invoice_status = 'working', invoice_error = ''
    where id = $1 and status = 'completed' and invoice_status in ('none', 'failed') and invoice_no = ''
    returning order_no, customer_id, customer_name, total, shipping`, [id]);
  if (!cl.length) {
    const r = await sql.unsafe('select invoice_status, invoice_no, points_awarded from cakeshop.mc_shop_orders where id = $1', [id]);
    if (r.length && r[0].invoice_no) return { ok: true, already: true, invoice_no: r[0].invoice_no, points: Number(r[0].points_awarded) };
    return { ok: false, error: r.length && r[0].invoice_status === 'working' ? 'الفاتورة بتتعمل دلوقتي، استنى ثواني' : 'الطلب مش جاهز للفاتورة' };
  }
  const o = cl[0], orderNo = Number(o.order_no), invNo = invoiceForOrder(orderNo);
  const amount = money2(Number(o.total) - Number(o.shipping || 0));
  const fail = async (msg) => {
    await sql.unsafe("update cakeshop.mc_shop_orders set invoice_status = 'failed', invoice_error = $2 where id = $1", [id, msg.slice(0, 300)]);
    await sql.unsafe(`insert into cakeshop.mc_shop_notifications (kind, title, body, ref_type, ref_id, dedupe_key)
      values ('invoice_failed', $1, $2, 'order', $3, $4) on conflict (dedupe_key) do nothing`,
      ['⚠️ فاتورة الطلب #' + orderNo + ' متعملتش', msg.slice(0, 300) + ' — افتح الطلب واضغط «إعادة المحاولة»', id, 'invfail:' + id + ':' + Date.now()]);
    return { ok: false, error: msg };
  };
  try {
    // لو الفاتورة اتسجلت قبل كده من الكاشير بنفس الرقم: نربطها بالطلب من غير ما نكررها
    const ex = await sql.unsafe("select txn_id, points_earned from cakeshop.mc_transactions where invoice_no = $1 and customer_id = $2 and status <> 'void' limit 1", [invNo, o.customer_id]);
    let points = 0, balance = null;
    if (ex.length) {
      points = Number(ex[0].points_earned || 0);
    } else {
      if (!(amount > 0)) return await fail('قيمة الطلب صفر، مفيش فاتورة تتعمل');
      const r = await ctx.adminApi(token, 'checkout', { customer_id: o.customer_id, invoice_no: invNo, amount, category: '' }, 'ord-' + id + '-' + Date.now());
      if (!r || !r.ok) return await fail((r && r.error) || 'تعذر إنشاء الفاتورة');
      points = Number((r.data.quote && r.data.quote.points_earned) || 0);
      balance = Number(r.data.balance);
      await sql.unsafe("update cakeshop.mc_pointsledger set reason = $3 where customer_id = $1 and ref_id = $2 and type = 'EARN'",
        [o.customer_id, r.data.txn_id, 'Online Purchase Reward – Order #' + orderNo]);
    }
    if (balance === null) {
      const b = await sql.unsafe('select points_balance from cakeshop.mc_customers where customer_id = $1', [o.customer_id]);
      balance = b.length ? Number(b[0].points_balance || 0) : 0;
    }
    await sql.unsafe(`update cakeshop.mc_shop_orders set invoice_status = 'done', invoice_no = $2, invoice_error = '', invoice_at = now(), points_awarded = $3 where id = $1`, [id, invNo, points]);
    await sql.unsafe(`update cakeshop.mc_shop_notifications set read_at = coalesce(read_at, now()), read_by = case when read_at is null then 'النظام' else read_by end
      where kind = 'invoice_failed' and ref_id = $1`, [id]);
    await sql.unsafe(`insert into cakeshop.mc_shop_customer_notes (customer_id, title, body, ref_type, ref_id, dedupe_key)
      values ($1, $2, $3, 'order', $4, $5) on conflict (dedupe_key) do nothing`,
      [o.customer_id, points > 0 ? '🎉 كسبت ' + points + ' نقطة!' : '🍩 طلبك #' + orderNo + ' تم بنجاح',
        points > 0 ? 'طلبك #' + orderNo + ' تم بنجاح، واتضافلك ' + points + ' نقطة في كارت Cake Shop. رصيدك دلوقتي ' + balance + ' نقطة. بالهنا والشفا 🍰'
          : 'شكراً إنك اخترت Cake Shop Dessert Cafe. رصيد نقاطك دلوقتي ' + balance + ' نقطة. بالهنا والشفا 🍰',
        id, 'order-done:' + id]);
    return { ok: true, invoice_no: invNo, points, balance };
  } catch (e) {
    console.error(e);
    return await fail(e && /[؀-ۿ]/.test(String(e.message)) ? e.message : 'حدث خطأ أثناء إنشاء الفاتورة');
  }
}

/* إشعارات الإدارة + ملخص الطلبات. تذكير عيد الميلاد (قبلها بيوم) بيتعمل هنا مرة واحدة لكل عيد ميلاد (dedupe_key). */
async function adminNotifications(sql) {
  await sql.unsafe(`insert into cakeshop.mc_shop_notifications (kind, title, body, ref_type, ref_id, dedupe_key)
    select 'birthday', '🎂 بكرة عيد ميلاد ' || c.name, 'عضوية ' || c.member_no || ' · ' || c.phone || ' — جهّزله تهنئة أو عرض عيد الميلاد',
      'customer', c.customer_id, 'bday:' || c.customer_id || ':' || to_char(d.tmr, 'YYYY')
    from cakeshop.mc_customers c, (select ((now() at time zone 'Africa/Cairo')::date + 1) tmr) d
    where c.status = 'active' and c.birthdate ~ '^\\d{4}-\\d{2}-\\d{2}' and substr(c.birthdate, 6, 5) = to_char(d.tmr, 'MM-DD')
    on conflict (dedupe_key) do nothing`);
  const [r] = await sql.unsafe(`select json_build_object(
    'items', (select coalesce(json_agg(n order by n.created_at desc), '[]') from (select id, kind, title, body, ref_type, ref_id, created_at, read_at, read_by
       from cakeshop.mc_shop_notifications order by created_at desc limit 60) n),
    'unread', (select count(*) from cakeshop.mc_shop_notifications where read_at is null),
    'summary', (select json_build_object(
       'new', (select count(*) from cakeshop.mc_shop_notifications where kind = 'new_order' and read_at is null),
       'pending', count(*) filter (where status = 'pending'),
       'approved', count(*) filter (where status = 'approved'),
       'preparing', count(*) filter (where status = 'preparing'),
       'ready', count(*) filter (where status = 'ready'),
       'shipped', count(*) filter (where status = 'shipped'),
       'completed', count(*) filter (where status = 'completed'),
       'completed_today', count(*) filter (where status = 'completed' and (completed_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date),
       'awaiting_invoice', count(*) filter (where status = 'completed' and invoice_status <> 'done'),
       'invoice_failed', count(*) filter (where status = 'completed' and invoice_status = 'failed'))
     from cakeshop.mc_shop_orders)) as data`);
  const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  d.items = d.items.map((n) => Object.assign(n, { id: Number(n.id) }));
  return d;
}

/**
 * ctx: { sql, verifyAdmin: async (token) => user|throws, upload: async (dataUrl) => url }
 */
export async function handleShop(body, ctx) {
  const fn = body && body.fn;
  const args = Array.isArray(body && body.args) ? body.args : [];
  const { sql } = ctx;
  try {
    if (fn === 'shop') {
      if (args[0] === 'catalog') return ok(await catalog(sql));
      if (['order', 'quote', 'mySummary', 'myNotes', 'readNotes', 'saveAddress', 'checkout', 'myOrders', 'cancelOrder'].indexOf(args[0]) >= 0) return ok(await customerShop(sql, args[0], args[1] && typeof args[1] === 'object' ? args[1] : {}));
      return bad('طلب غير معروف');
    }
    // ---------- الإدارة ----------
    const [token, action] = [args[0], args[1]];
    const p = args[2] && typeof args[2] === 'object' ? args[2] : {};
    const user = await ctx.verifyAdmin(token);
    if (!user.ok) return { result: user.res };
    if ((user.permissions || []).indexOf('settings') < 0) return bad('ليس لديك صلاحية: إدارة المنتجات');

    if (action === 'list') {
      const [r] = await sql.unsafe(`select json_build_object(
        'categories', (select coalesce(json_agg(c order by c.sort, c.created_at), '[]') from cakeshop.mc_shop_categories c),
        'products', (select coalesce(json_agg(p order by p.created_at desc), '[]') from (select ${PRODUCT_COLS}, ${STOCK_FULL} from cakeshop.mc_shop_products p) p)
      ) as data`);
      return ok(typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
    }


    if (action === 'orders') {
      const rows = await sql.unsafe(`select ${ORDER_COLS.replace('o.invoice_no,', `coalesce(nullif(o.invoice_no, ''),
          (select t.invoice_no from cakeshop.mc_transactions t where t.customer_id = o.customer_id and t.invoice_no = 'ON-' || o.order_no and t.status <> 'void' limit 1), '') as invoice_no,`)}
        from cakeshop.mc_shop_orders o order by o.created_at desc limit 2000`);
      const list = await withImages(sql, rows);
      return ok(list.map((o, i) => Object.assign(o, {
        customer_id: rows[i].customer_id, customer_name: rows[i].customer_name, customer_phone: rows[i].customer_phone, member_no: rows[i].member_no,
        admin_notes: rows[i].admin_notes || '', invoice_no: rows[i].invoice_no || '', stock_state: rows[i].stock_state || 'none', history: Array.isArray(rows[i].history) ? rows[i].history : [],
        invoice_status: rows[i].invoice_no ? 'done' : (rows[i].invoice_status || 'none'), invoice_error: rows[i].invoice_error || '', invoice_at: rows[i].invoice_at, points_awarded: Number(rows[i].points_awarded || 0),
        completed_at: rows[i].completed_at, next: nextStatuses(rows[i].status, rows[i].delivery), can_override: user.role === 'owner',
      })));
    }

    if (action === 'setOrderStatus') {
      if (!UUID.test(T(p.id))) return bad('الطلب غير موجود');
      const st = T(p.status);
      if (ORDER_STATUS.indexOf(st) < 0) return bad('حالة غير معروفة');
      const reason = T(p.reason).slice(0, 300);
      const override = !!p.override;
      if (override && user.role !== 'owner') return bad('التصحيح الاستثنائي لصاحب المحل بس');
      if (override && reason.length < 5) return bad('اكتب سبب التصحيح الاستثنائي (هيتسجل في سجل الطلب)');
      if (st === 'rejected' && !reason) return bad('اكتب سبب الرفض علشان يظهر للعميل');
      if (st === 'cancelled' && !reason) return bad('اكتب سبب الإلغاء علشان يظهر للعميل');
      // تغيير الحالة بيحجز/يفك/يخصم المخزون تلقائياً من قاعدة البيانات (Trigger) في نفس العملية
      const res = await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('cakeshop.actor', $1, true)", [user.name || 'الإدارة']);
        const cur = await tx.unsafe('select status, delivery from cakeshop.mc_shop_orders where id = $1 for update', [T(p.id)]);
        if (!cur.length) throw new Error('الطلب غير موجود');
        const from = cur[0].status;
        if (from === st) throw new Error('الطلب بالفعل في الحالة دي');
        if (!override && nextStatuses(from, cur[0].delivery).indexOf(st) < 0) {
          const nx = nextStatuses(from, cur[0].delivery).map((x) => '«' + ST_AR[x] + '»');
          throw new Error('مينفعش الطلب يتنقل من «' + ST_AR[from] + '» لـ«' + ST_AR[st] + '». ' + (nx.length ? 'المتاح: ' + nx.join(' أو ') : 'دي حالة نهائية') + '.');
        }
        const entry = { s: st, at: new Date().toISOString(), by: user.name || '', from };
        if (reason) entry.reason = reason;
        if (override) entry.override = true;
        await tx.unsafe(`update cakeshop.mc_shop_orders set status = $2,
          reject_reason = case when $2 in ('rejected','cancelled') then $3 else reject_reason end,
          completed_at = case when $2 = 'completed' then coalesce(completed_at, now()) else completed_at end,
          updated_at = now(), history = history || $4::text::jsonb where id = $1`, [T(p.id), st, reason, JSON.stringify([entry])]);
        return { from };
      });
      // الطلب اتقفل «تم إتمام الطلب» → فاتورة مبيعات تلقائية + نقاط العميل (مرة واحدة بس)
      let invoice = null;
      if (st === 'completed') invoice = await invoiceOrder(ctx, token, T(p.id));
      return ok({ done: true, from: res.from, invoice });
    }

    if (action === 'retryInvoice') {
      if (!UUID.test(T(p.id))) return bad('الطلب غير موجود');
      const r = await sql.unsafe('select status from cakeshop.mc_shop_orders where id = $1', [T(p.id)]);
      if (!r.length) return bad('الطلب غير موجود');
      if (r[0].status !== 'completed') return bad('الفاتورة بتتعمل لما الطلب يبقى «تم إتمام الطلب»');
      const inv = await invoiceOrder(ctx, token, T(p.id));
      if (!inv.ok) return bad(inv.error);
      return ok(inv);
    }

    if (action === 'notifications') return ok(await adminNotifications(sql));

    if (action === 'readNotifications') {
      const ids = (Array.isArray(p.ids) ? p.ids : []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
      if (p.all) await sql.unsafe('update cakeshop.mc_shop_notifications set read_at = now(), read_by = $1 where read_at is null', [user.name || '']);
      else if (ids.length) await sql.unsafe('update cakeshop.mc_shop_notifications set read_at = now(), read_by = $2 where id = any($1::bigint[]) and read_at is null', [ids, user.name || '']);
      return ok({ done: true });
    }

    if (action === 'saveOrderNotes') {
      if (!UUID.test(T(p.id))) return bad('الطلب غير موجود');
      const r = await sql.unsafe('update cakeshop.mc_shop_orders set admin_notes = $2, updated_at = now() where id = $1 returning id', [T(p.id), T(p.notes).slice(0, 1000)]);
      if (!r.length) return bad('الطلب غير موجود');
      return ok({ done: true });
    }

    if (action === 'promos') {
      const rows = await sql.unsafe(`select pr.id, pr.code, pr.kind, pr.value, pr.min_order, pr.max_discount,
          to_char(pr.starts_on, 'YYYY-MM-DD') starts_on, to_char(pr.ends_on, 'YYYY-MM-DD') ends_on, pr.max_uses, pr.per_customer, pr.active,
          pr.product_ids, pr.category_ids, pr.stackable, pr.created_at,
          to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD') today,
          (select count(*)::int from cakeshop.mc_shop_orders o where o.promo_id = pr.id and o.status not in ('rejected','cancelled')) uses,
          (select coalesce(sum(o.promo_discount), 0) from cakeshop.mc_shop_orders o where o.promo_id = pr.id and o.status not in ('rejected','cancelled')) total_discount
        from cakeshop.mc_shop_promos pr order by pr.created_at desc`);
      return ok(rows.map((r) => Object.assign({}, r, { value: Number(r.value), min_order: Number(r.min_order), max_discount: Number(r.max_discount), total_discount: Number(r.total_discount) })));
    }

    if (action === 'savePromo') {
      const v = cleanPromo(p);
      const dup = await sql.unsafe('select 1 from cakeshop.mc_shop_promos where lower(code) = lower($1) and id::text <> $2', [v.code, T(p.id)]);
      if (dup.length) return bad('فيه كود خصم تاني بنفس الاسم');
      const vals = [v.code, v.kind, v.value, v.min_order, v.max_discount, v.starts_on, v.ends_on, v.max_uses, v.per_customer, v.active,
        JSON.stringify(v.product_ids), JSON.stringify(v.category_ids), v.stackable];
      if (p.id) {
        if (!UUID.test(T(p.id))) return bad('الكود غير موجود');
        const r = await sql.unsafe(`update cakeshop.mc_shop_promos set code=$1, kind=$2, value=$3, min_order=$4, max_discount=$5, starts_on=$6::date, ends_on=$7::date,
          max_uses=$8, per_customer=$9, active=$10, product_ids=$11::text::jsonb, category_ids=$12::text::jsonb, stackable=$13, updated_at=now() where id=$14 returning id`, [...vals, T(p.id)]);
        if (!r.length) return bad('الكود غير موجود');
        return ok({ id: r[0].id });
      }
      const r = await sql.unsafe(`insert into cakeshop.mc_shop_promos (code, kind, value, min_order, max_discount, starts_on, ends_on, max_uses, per_customer, active, product_ids, category_ids, stackable)
        values ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,$11::text::jsonb,$12::text::jsonb,$13) returning id`, vals);
      return ok({ id: r[0].id });
    }

    if (action === 'setPromo') {
      if (!UUID.test(T(p.id))) return bad('الكود غير موجود');
      const r = await sql.unsafe('update cakeshop.mc_shop_promos set active=$1, updated_at=now() where id=$2 returning id', [!!p.active, T(p.id)]);
      if (!r.length) return bad('الكود غير موجود');
      return ok({ done: true });
    }

    if (action === 'shopSettings') return ok(await shopSettings(sql));

    if (action === 'saveShopSettings') {
      const fee = num(p.delivery_fee, 'مصاريف التوصيل');
      await sql.unsafe(`insert into cakeshop.mc_shop_settings (id, delivery_enabled, delivery_fee, updated_at) values (1, $1, $2, now())
        on conflict (id) do update set delivery_enabled = excluded.delivery_enabled, delivery_fee = excluded.delivery_fee, updated_at = now()`, [!!p.delivery_enabled, fee]);
      return ok(await shopSettings(sql));
    }

    if (action === 'saveCategory') {
      const name = T(p.name);
      if (!name) return bad('اكتب اسم القسم');
      if (name.length > 60) return bad('اسم القسم طويل جداً');
      const icon = T(p.icon).slice(0, 16);
      const image = T(p.image);
      if (image && !IMG_URL.test(image)) return bad('رابط صورة غير صحيح');
      const dup = await sql.unsafe('select id from cakeshop.mc_shop_categories where lower(name) = lower($1) and id::text <> $2', [name, T(p.id)]);
      if (dup.length) return bad('فيه قسم بنفس الاسم');
      if (p.id) {
        if (!UUID.test(T(p.id))) return bad('القسم غير موجود');
        const r = await sql.unsafe('update cakeshop.mc_shop_categories set name=$1, icon=$2, image=$3, hidden=$4, updated_at=now() where id=$5 returning id', [name, icon, image, !!p.hidden, T(p.id)]);
        if (!r.length) return bad('القسم غير موجود');
        return ok({ id: r[0].id });
      }
      const r = await sql.unsafe(`insert into cakeshop.mc_shop_categories (name, icon, image, hidden, sort)
        values ($1, $2, $3, $4, (select coalesce(max(sort), 0) + 1 from cakeshop.mc_shop_categories)) returning id`, [name, icon, image, !!p.hidden]);
      return ok({ id: r[0].id });
    }

    if (action === 'orderCategories') {
      const ids = (Array.isArray(p.ids) ? p.ids : []).map(T).filter((x) => UUID.test(x));
      await sql.begin(async (tx) => {
        for (let i = 0; i < ids.length; i++) await tx.unsafe('update cakeshop.mc_shop_categories set sort=$1 where id=$2', [i + 1, ids[i]]);
      });
      return ok({ done: true });
    }

    if (action === 'deleteCategory') {
      if (!UUID.test(T(p.id))) return bad('القسم غير موجود');
      const [c] = await sql.unsafe('select count(*)::int n from cakeshop.mc_shop_products where category_id=$1', [T(p.id)]);
      if (c.n > 0) return bad('القسم فيه ' + c.n + ' منتج. انقلهم لقسم تاني أو اخفي القسم بدل المسح');
      await sql.unsafe('delete from cakeshop.mc_shop_categories where id=$1', [T(p.id)]);
      return ok({ done: true });
    }

    if (action === 'saveProduct') {
      const v = cleanProduct(p);
      if (v.code) {
        const d = await sql.unsafe('select 1 from cakeshop.mc_shop_products where lower(code) = lower($1) and id::text <> $2', [v.code, T(p.id)]);
        if (d.length) return bad('فيه منتج تاني بنفس الكود');
      }
      if (v.category_id) {
        const c = await sql.unsafe('select 1 from cakeshop.mc_shop_categories where id=$1', [v.category_id]);
        if (!c.length) return bad('القسم غير موجود');
      }
      const vals = [v.name, v.category_id, v.description, v.price, v.old_price, v.available, v.hidden,
        JSON.stringify(v.images), JSON.stringify(v.specs), JSON.stringify(v.colors), JSON.stringify(v.variants)];
      const track = !!p.track_stock;
      const low = Math.floor(num(p.low_stock_at === undefined ? 3 : p.low_stock_at, 'حد التنبيه للمخزون المنخفض'));
      if (low > 100000) return bad('حد التنبيه للمخزون المنخفض كبير جداً');
      const levels = cleanStock(p.stock, v);
      if (p.id && !UUID.test(T(p.id))) return bad('المنتج غير موجود');
      const id = await sql.begin(async (tx) => {
        let r;
        if (p.id) {
          r = await tx.unsafe(`update cakeshop.mc_shop_products set name=$1, category_id=$2, description=$3, price=$4, old_price=$5,
            available=$6, hidden=$7, images=$8::text::jsonb, specs=$9::text::jsonb, colors=$10::text::jsonb, variants=$11::text::jsonb, code=$12, track_stock=$13, low_stock_at=$14, updated_at=now()
            where id=$15 returning id`, [...vals, v.code, track, low, T(p.id)]);
          if (!r.length) throw new Error('المنتج غير موجود');
        } else {
          r = await tx.unsafe(`insert into cakeshop.mc_shop_products (name, category_id, description, price, old_price, available, hidden, images, specs, colors, variants, code, track_stock, low_stock_at)
            values ($1,$2,$3,$4,$5,$6,$7,$8::text::jsonb,$9::text::jsonb,$10::text::jsonb,$11::text::jsonb,$12,$13,$14) returning id`, [...vals, v.code, track, low]);
        }
        // الكميات الفعلية (جرد/إضافة بضاعة): كل تغيير بيتسجل في سجل حركات المخزون
        if (track) for (const l of levels) {
          await tx.unsafe('select cakeshop.stock_set_physical($1::uuid, $2, $3::int, $4, $5)', [r[0].id, l.key, l.physical, user.name || 'الإدارة', T(p.stock_note).slice(0, 200)]);
        }
        return r[0].id;
      });
      return ok({ id });
    }

    if (action === 'stockMoves') { // سجل حركات المخزون (لمنتج واحد أو للكل)
      const pid = T(p.product_id);
      if (pid && !UUID.test(pid)) return bad('المنتج غير موجود');
      const rows = await sql.unsafe(`select id, product_id, product_name, key, kind, d_physical, d_reserved, physical_after, reserved_after, order_no, note, by_name, created_at
        from cakeshop.mc_shop_stock_moves where ($1 = '' or product_id::text = $1) order by id desc limit 500`, [pid]);
      return ok(rows.map((m) => Object.assign({}, m, { id: Number(m.id), order_no: m.order_no ? Number(m.order_no) : null })));
    }

    if (action === 'setProduct') {
      // تغيير سريع من القائمة: متوفر / ظاهر
      if (!UUID.test(T(p.id))) return bad('المنتج غير موجود');
      const field = p.field === 'available' ? 'available' : p.field === 'hidden' ? 'hidden' : '';
      if (!field) return bad('طلب غير معروف');
      const r = await sql.unsafe(`update cakeshop.mc_shop_products set ${field}=$1, updated_at=now() where id=$2 returning id`, [!!p.value, T(p.id)]);
      if (!r.length) return bad('المنتج غير موجود');
      return ok({ done: true });
    }

    if (action === 'deleteProduct') {
      if (!UUID.test(T(p.id))) return bad('المنتج غير موجود');
      await sql.unsafe('delete from cakeshop.mc_shop_products where id=$1', [T(p.id)]);
      return ok({ done: true });
    }

    if (action === 'upload') {
      return ok({ url: await ctx.upload(p.dataUrl) });
    }
    return bad('طلب غير معروف');
  } catch (e) {
    if (e && e.userMessage) return bad(e.userMessage);
    if (e && typeof e.message === 'string' && /[؀-ۿ]/.test(e.message)) return bad(e.message);
    console.error(e);
    return bad('حدث خطأ في الخادم، حاول مرة أخرى');
  }
}
