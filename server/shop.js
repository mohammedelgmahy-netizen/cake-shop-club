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

const PRODUCT_COLS = 'id, code, category_id, name, description, price, old_price, available, hidden, images, specs, colors, variants, created_at, updated_at, track_stock, low_stock_at, points_mode, general_offers_mode, special_offers_mode';
// المتاح لكل اختيار (النكهة|الحجم) للمنتجات اللي عليها تتبع مخزون: المتاح = الفعلي − المحجوز
const STOCK_AVAIL = `case when p.track_stock then (select coalesce(json_object_agg(s.key, greatest(s.physical - s.reserved, 0)), '{}'::json) from cakeshop.mc_shop_stock s where s.product_id = p.id) end as stock`;
const STOCK_FULL = `(select coalesce(json_agg(json_build_object('key', s.key, 'physical', s.physical, 'reserved', s.reserved, 'available', greatest(s.physical - s.reserved, 0)) order by s.key), '[]'::json) from cakeshop.mc_shop_stock s where s.product_id = p.id) as stock`;
export const stockKey = (color, variant) => T(color) + '|' + T(variant);
const CATEGORY_COLS = 'id, name, icon, image, sort, hidden, points_enabled, general_offers, special_offers';
// إعداد المنتج ليه الأولوية: نعم / لا، و«حسب القسم» ياخد إعداد القسم
export const ruleOf = (mode, catVal) => (mode === 'yes' ? true : mode === 'no' ? false : catVal !== false);
const RULE_COLS = `coalesce((select k.points_enabled from cakeshop.mc_shop_categories k where k.id = p.category_id), true) as c_points,
  coalesce((select k.general_offers from cakeshop.mc_shop_categories k where k.id = p.category_id), true) as c_gen,
  coalesce((select k.special_offers from cakeshop.mc_shop_categories k where k.id = p.category_id), true) as c_spec`;
function applyRules(pr) {
  pr.points = ruleOf(pr.points_mode, pr.c_points);
  pr.general_offers = ruleOf(pr.general_offers_mode, pr.c_gen);
  pr.special_offers = ruleOf(pr.special_offers_mode, pr.c_spec);
  // المنتج مش مسموح له بالعروض الخاصة: يتباع بسعره الأصلي من غير خصم المنتج
  if (!pr.special_offers && Number(pr.old_price) > Number(pr.price)) { pr.price = Number(pr.old_price); pr.old_price = 0; }
  delete pr.c_points; delete pr.c_gen; delete pr.c_spec;
  return pr;
}

async function catalog(sql) {
  const [r] = await sql.unsafe(`select json_build_object(
    'categories', (select coalesce(json_agg(c order by c.sort, c.created_at), '[]') from (select ${CATEGORY_COLS}, created_at from cakeshop.mc_shop_categories where not hidden) c),
    'products', (select coalesce(json_agg(p order by p.created_at desc), '[]') from (
      select ${PRODUCT_COLS}, ${STOCK_AVAIL}, ${RULE_COLS} from cakeshop.mc_shop_products p
      where not p.hidden and (p.category_id is null or p.category_id in (select id from cakeshop.mc_shop_categories where not hidden))) p)
  ) as data`);
  const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  (d.products || []).forEach(applyRules);
  return d;
}


/* ---------------- السلة وإتمام الشراء والطلبات ----------------
 * الأسعار والخصومات بتتحسب هنا في السيرفر من المنتجات وأكواد الخصم الحقيقية،
 * ومفيش أي سعر جاي من التطبيق بيتصدّق. */
export const ORDER_STATUS = ['pending', 'approved', 'preparing', 'ready', 'shipped', 'served', 'completed', 'rejected', 'cancelled'];
/* مسار الحالات الصارم: الحالات اللي ينفع الطلب ينتقل لها من حالته الحالية بس، ومفيش رجوع لورا.
 *   توصيل: قيد المراجعة → تم القبول → جاري التجهيز → جاهز → تم الشحن → تم إتمام الطلب
 *   استلام من الفرع: نفس المسار من غير «تم الشحن» (جاهز → تم إتمام الطلب)
 *   الرفض: من «قيد المراجعة» بس. الإلغاء: أي وقت قبل الإتمام، وبسبب مكتوب.
 *   الحالات النهائية: تم إتمام الطلب / مرفوض / ملغي. صاحب المحل بس يقدر يعمل تصحيح استثنائي بسبب مكتوب. */
export function nextStatuses(status, delivery) {
  if (delivery === 'dinein') return DINE_NEXT[status] || []; // طلبات الترابيزات: جديد → تم التأكيد → جاري التجهيز → جاهز → تم التقديم → مكتمل
  switch (status) {
    case 'pending': return ['approved', 'rejected', 'cancelled'];
    case 'approved': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return delivery === 'delivery' ? ['shipped', 'cancelled'] : ['completed', 'cancelled'];
    case 'shipped': return delivery === 'delivery' ? ['completed', 'cancelled'] : ['completed', 'cancelled'];
    default: return [];
  }
}
const ST_AR = { pending: 'قيد المراجعة', approved: 'تم القبول', preparing: 'جاري التجهيز', ready: 'جاهز', shipped: 'تم الشحن', served: 'تم التقديم', completed: 'تم إتمام الطلب', rejected: 'مرفوض', cancelled: 'ملغي' };
const ORDER_COLS = `o.id, o.order_no, o.customer_id, o.customer_name, o.customer_phone, o.member_no, o.product_id, o.product_name, o.product_code,
  o.color, o.variant, o.qty, o.unit_price, o.total, o.notes, o.status, o.reject_reason, o.history, o.created_at, o.updated_at,
  o.items, o.subtotal, o.product_discount, o.promo_code, o.promo_discount, o.shipping, o.method, o.delivery, o.address, o.admin_notes, o.branch_id, o.branch_name, o.stock_state, o.birthday_discount,
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
async function quote(q, customer, p, lockPromo, bday) {
  const items = cleanItems(p.items);
  const ids = [...new Set(items.map((i) => i.product_id))];
  const prods = await q.unsafe(`select p.id, p.name, p.code, p.price, p.old_price, p.available, p.hidden, p.colors, p.variants, p.category_id, p.track_stock, ${STOCK_AVAIL}, p.points_mode, p.general_offers_mode, p.special_offers_mode, ${RULE_COLS},
      coalesce(p.images->0->>'t', p.images->0->>'u', '') as image,
      (p.category_id is null or exists (select 1 from cakeshop.mc_shop_categories k where k.id = p.category_id and not k.hidden)) as cat_ok
    from cakeshop.mc_shop_products p where p.id = any($1::uuid[])`, [ids]);
  const byId = new Map(prods.map((r) => [r.id, applyRules(r)]));
  const lines = items.map((it) => {
    const pr = byId.get(it.product_id);
    const line = { product_id: it.product_id, name: pr ? pr.name : '', code: pr ? pr.code || '' : '', image: pr ? pr.image : '', category_id: pr ? pr.category_id : null,
      color: it.color, variant: it.variant, qty: it.qty, unit_price: 0, old_price: 0, line_subtotal: 0, line_discount: 0, line_total: 0, error: '' };
    if (pr) { line.points = pr.points; line.general_offers = pr.general_offers; line.special_offers = pr.special_offers; }
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
      // كود عام = عرض عام (للمنتجات المسموح لها بالعروض العامة)، كود لمنتجات أو أقسام معينة = عرض خاص (للمسموح لها بالعروض الخاصة)
      let elig = good.filter((l) => (scoped ? l.special_offers : l.general_offers) && (!scoped || pids.indexOf(l.product_id) >= 0 || (l.category_id && cids.indexOf(l.category_id) >= 0)));
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
          elig.forEach((l) => { l._promo = base > 0 ? d * l.line_total / base : 0; });
          promo.kind = pr.kind; promo.value = Number(pr.value);
        }
      }
    }
  }
  const promo_discount = promo && promo.ok ? promo.discount : 0;
  // عرض عيد الميلاد: بيتطبق تلقائياً لو العرض فعال والعميل مستحق ولسه مستخدمهوش في دورة عيد الميلاد دي
  let birthday = null, birthday_discount = 0;
  if (bday) {
    birthday = { type: bday.type, value: Number(bday.value) || 0, offer_text: bday.offer_text, end: bday.end, status: bday.status, discount: 0 };
    // عرض عيد الميلاد عرض عام: بيتحسب على المنتجات المسموح لها بالعروض العامة بس
    const bl = good.filter((l) => l.general_offers);
    const base = Math.max(0, bl.reduce((s, l) => s + l.line_total - (l._promo || 0), 0));
    if (bday.status === 'available' && base > 0 && (bday.type === 'percent' || bday.type === 'fixed')) {
      let d = bday.type === 'percent' ? base * Number(bday.value) / 100 : Number(bday.value);
      if (bday.type === 'percent' && Number(bday.max) > 0) d = Math.min(d, Number(bday.max));
      birthday_discount = birthday.discount = money2(Math.min(d, base));
      bl.forEach((l) => { l._bday = birthday_discount * (l.line_total - (l._promo || 0)) / base; });
    }
  }
  const set = await shopSettings(q);
  const delivery = p.delivery === 'delivery' ? 'delivery' : 'pickup';
  const shipping = delivery === 'delivery' && set.delivery_enabled ? money2(set.delivery_fee) : 0;
  const total = money2(Math.max(0, items_total - promo_discount - birthday_discount) + shipping);
  // المبلغ اللي بيتحسب عليه نقاط الولاء: المنتجات المسموح لها بالنقاط بس، بعد الخصومات
  const points_amount = money2(Math.max(0, good.filter((l) => l.points).reduce((s, l) => s + l.line_total - (l._promo || 0) - (l._bday || 0), 0)));
  lines.forEach((l) => { delete l._promo; delete l._bday; });
  const brs = await branches(q);
  return {
    branches: brs, saved_address: await savedAddress(q, customer.customer_id),
    lines, subtotal, product_discount, items_total, promo, promo_discount, birthday, birthday_discount, delivery, shipping, total, points_amount,
    delivery_enabled: set.delivery_enabled, delivery_fee: set.delivery_fee,
    customer: { name: customer.name, phone: customer.phone, member_no: customer.member_no },
  };
}

async function checkout(sql, c, p, ctx) {
  const bday = await birthdayOffer(ctx, p.token);
  const method = p.method === 'cart' ? 'cart' : 'buy_now';
  const delivery = p.delivery === 'delivery' ? 'delivery' : 'pickup';
  const address = T(p.address).slice(0, 500);
  const notes = T(p.notes).slice(0, 500);
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('cakeshop.actor', $1, true)", ['العميل: ' + c.name]);
    const [cnt] = await tx.unsafe("select count(*)::int n from cakeshop.mc_shop_orders where customer_id = $1 and created_at > now() - interval '1 day'", [c.customer_id]);
    if (cnt.n >= 20) throw new Error('وصلت للحد الأقصى للطلبات النهارده. كلم المحل لو محتاج حاجة.');
    const qt = await quote(tx, c, p, true, bday);
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
      unit_price: l.unit_price, old_price: l.old_price, line_subtotal: l.line_subtotal, line_discount: l.line_discount, line_total: l.line_total, points: !!l.points }));
    const first = items[0];
    const qtySum = items.reduce((s, i) => s + i.qty, 0);
    const title = first.name + (items.length > 1 ? ' + ' + (items.length - 1) + ' منتج تاني' : '');
    const hist = JSON.stringify([{ s: 'pending', at: new Date().toISOString(), by: 'customer' }]);
    const [o] = await tx.unsafe(`insert into cakeshop.mc_shop_orders (order_no, customer_id, customer_name, customer_phone, member_no, product_id, product_name, product_code,
        color, variant, qty, unit_price, total, notes, status, history, items, subtotal, product_discount, promo_id, promo_code, promo_discount, shipping, method, delivery, address,
        branch_id, branch_name, birthday_discount, points_amount)
      values (nextval('cakeshop.mc_shop_order_no'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14::text::jsonb, $15::text::jsonb,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28) returning id, order_no`,
      [c.customer_id, c.name, c.phone, c.member_no, first.product_id, title, first.code || '', first.color, first.variant, qtySum, first.unit_price, qt.total, notes, hist,
        JSON.stringify(items), qt.subtotal, qt.product_discount, qt.promo && qt.promo.ok ? qt.promo.id : null, qt.promo && qt.promo.ok ? qt.promo.code : '',
        qt.promo_discount, qt.shipping, method, delivery, delivery === 'delivery' ? address : '', branch ? branch.id : '', branch ? branch.name : '', qt.birthday_discount, qt.points_amount]);
    return { id: o.id, order_no: Number(o.order_no), total: qt.total, birthday_discount: qt.birthday_discount };
  }).then(async (r) => {
    // تسجيل إن العميل استخدم عرض عيد الميلاد (مرة واحدة في دورة عيد الميلاد)
    if (r.birthday_discount > 0 && ctx && ctx.publicApi) {
      try { await ctx.publicApi('_bdayUse', { token: p.token, invoice_no: invoiceForOrder(r.order_no), discount: r.birthday_discount }); } catch (e) { console.error(e); }
    }
    return r;
  });
}
async function birthdayOffer(ctx, token) {
  if (!ctx || !ctx.publicApi) return null;
  try { const r = await ctx.publicApi('_bdayOffer', { token: T(token) }); return r && r.ok ? r.data : null; } catch (e) { return null; }
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

async function customerShop(sql, action, p, ctx) {
  const c = await customerByToken(sql, p.token);
  if (action === 'myOrders') {
    const rows = await sql.unsafe(`select ${ORDER_COLS} from cakeshop.mc_shop_orders o where o.customer_id = $1 and o.delivery <> 'dinein' order by o.created_at desc limit 200`, [c.customer_id]);
    return withImages(sql, rows);
  }
  if (action === 'quote') return quote(sql, c, p, false, await birthdayOffer(ctx, p.token));
  if (action === 'myBirthday') return { offer: await birthdayOffer(ctx, p.token) };
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
  if (action === 'checkout') return checkout(sql, c, p, ctx);
  if (action === 'order') { // النسخة القديمة من الصفحة (منتج واحد)
    return checkout(sql, c, { token: p.token, items: [{ product_id: p.product_id, color: p.color, variant: p.variant, qty: p.qty }], notes: p.notes, method: 'buy_now' }, ctx);
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
      from cakeshop.mc_shop_orders where customer_id = $1 and delivery <> 'dinein'),
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
    points: Number(o.points_awarded || 0), invoiced: !!o.invoice_no, birthday_discount: Number(o.birthday_discount || 0),
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
    returning order_no, customer_id, customer_name, total, shipping, points_amount`, [id]);
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
      const pay = { customer_id: o.customer_id, invoice_no: invNo, amount, category: '' };
      if (o.points_amount !== null && o.points_amount !== undefined) pay.points_amount = money2(Math.min(Number(o.points_amount), amount));
      const r = await ctx.adminApi(token, 'checkout', pay, 'ord-' + id + '-' + Date.now());
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
     from cakeshop.mc_shop_orders where delivery <> 'dinein')) as data`);
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
      if (['tableBoot', 'tableStatus', 'tableQuote', 'tableOrder', 'tableHelp'].indexOf(args[0]) >= 0) return ok(await tableCustomer(sql, args[0], args[1] && typeof args[1] === 'object' ? args[1] : {}, ctx));
      if (['order', 'quote', 'mySummary', 'myNotes', 'readNotes', 'myBirthday', 'saveAddress', 'checkout', 'myOrders', 'cancelOrder'].indexOf(args[0]) >= 0) return ok(await customerShop(sql, args[0], args[1] && typeof args[1] === 'object' ? args[1] : {}, ctx));
      return bad('طلب غير معروف');
    }
    // ---------- الإدارة ----------
    const [token, action] = [args[0], args[1]];
    const p = args[2] && typeof args[2] === 'object' ? args[2] : {};
    const user = await ctx.verifyAdmin(token);
    if (!user.ok) return { result: user.res };
    const perms = user.permissions || [];
    // الترابيزات وطلباتها: لموظف الكاشير (المبيعات) وصاحب المحل. إضافة وتعديل الترابيزات: صلاحية الإعدادات
    if (TABLE_STAFF_ACTIONS.indexOf(action) >= 0) {
      if (perms.indexOf('sales') < 0 && perms.indexOf('settings') < 0) return bad('ليس لديك صلاحية: الترابيزات');
      return ok(await tablesAdmin(ctx, token, user, action, p));
    }
    if (REPORT_ACTIONS.indexOf(action) >= 0) {
      if (perms.indexOf('dashboard') < 0) return bad('ليس لديك صلاحية: التقارير');
      return ok(await reportsAdmin(sql, user, action, p));
    }
    if (OWNER_DATA_ACTIONS.indexOf(action) >= 0) {
      if (user.role !== 'owner') return bad('تصدير البيانات والنسخ الاحتياطي لصاحب المحل بس');
      return ok(await ownerData(sql, user, action, p));
    }
    if (TABLE_OWNER_ACTIONS.indexOf(action) >= 0) {
      if (perms.indexOf('settings') < 0) return bad('ليس لديك صلاحية: إدارة الترابيزات');
      return ok(await tablesAdmin(ctx, token, user, action, p));
    }
    if (perms.indexOf('settings') < 0) {
      // موظف المبيعات يقدر يغيّر حالة طلبات الترابيزات بس
      const dine = action === 'setOrderStatus' && UUID.test(T(p.id)) && perms.indexOf('sales') >= 0
        && (await sql.unsafe("select 1 from cakeshop.mc_shop_orders where id = $1 and delivery = 'dinein'", [T(p.id)])).length;
      if (!dine) return bad('ليس لديك صلاحية: إدارة المنتجات');
    }

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
        from cakeshop.mc_shop_orders o where o.delivery <> 'dinein' order by o.created_at desc limit 2000`);
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
        const cur = await tx.unsafe('select status, delivery, customer_id, order_no from cakeshop.mc_shop_orders where id = $1 for update', [T(p.id)]);
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
        // إشعار للعميل في كارته بحالة طلبه (الإتمام بيتبعت مع النقاط بعد الفاتورة)
        const dine = cur[0].delivery === 'dinein';
        const NOTE = dine ? { approved: ['✅ طلبك #N اتأكد', 'المحل استلم طلبك من الترابيزة.'], preparing: ['👩‍🍳 بنجهز طلبك #N', 'طلبك دلوقتي في المطبخ 🍰'],
          ready: ['🍰 طلبك #N جاهز', 'هيوصلك على الترابيزة حالاً.'], served: ['🍽️ طلبك #N اتقدّم', 'بالهنا والشفا 🍰'], cancelled: ['🚫 طلبك #N اتلغى', reason] }[st] : { approved: ['✅ طلبك #N اتقبل', 'المحل وافق على طلبك وهيبدأ يجهزه.'], preparing: ['👩‍🍳 بنجهز طلبك #N', 'طلبك دلوقتي في المطبخ 🍰'],
          ready: [cur[0].delivery === 'delivery' ? '📦 طلبك #N جاهز' : '🏪 طلبك #N جاهز للاستلام', cur[0].delivery === 'delivery' ? 'هيخرج للتوصيل قريب.' : 'تقدر تعدّي تستلمه من الفرع.'],
          shipped: ['🚚 طلبك #N خرج للتوصيل', 'المندوب في الطريق ليك.'], rejected: ['❌ طلبك #N اترفض', reason], cancelled: ['🚫 طلبك #N اتلغى', reason] }[st];
        if (NOTE && cur[0].customer_id) await tx.unsafe(`insert into cakeshop.mc_shop_customer_notes (customer_id, title, body, ref_type, ref_id, dedupe_key)
          values ($1, $2, $3, 'order', $4, $5) on conflict (dedupe_key) do nothing`,
          [cur[0].customer_id, NOTE[0].replace('#N', '#' + cur[0].order_no), NOTE[1] || '', T(p.id), 'order-st:' + T(p.id) + ':' + st + ':' + Date.now()]);
        return { from, dine };
      });
      // الطلب اتقفل «تم إتمام الطلب» → فاتورة مبيعات تلقائية + نقاط العميل (مرة واحدة بس)
      let invoice = null;
      if (st === 'completed' && !res.dine) invoice = await invoiceOrder(ctx, token, T(p.id)); // طلبات الترابيزات فاتورتها مع قفل حساب الترابيزة
      return ok({ done: true, from: res.from, invoice });
    }

    if (action === 'retryInvoice') {
      if (!UUID.test(T(p.id))) return bad('الطلب غير موجود');
      const r = await sql.unsafe('select status, delivery from cakeshop.mc_shop_orders where id = $1', [T(p.id)]);
      if (!r.length) return bad('الطلب غير موجود');
      if (r[0].delivery === 'dinein') return bad('فاتورة طلبات الترابيزة بتتعمل مع قفل حساب الترابيزة');
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
        const r = await sql.unsafe('update cakeshop.mc_shop_categories set name=$1, icon=$2, image=$3, hidden=$4, points_enabled=coalesce($6, points_enabled), general_offers=coalesce($7, general_offers), special_offers=coalesce($8, special_offers), updated_at=now() where id=$5 returning id', [name, icon, image, !!p.hidden, T(p.id), ...['points_enabled', 'general_offers', 'special_offers'].map((k) => (typeof p[k] === 'boolean' ? p[k] : null))]);
        if (!r.length) return bad('القسم غير موجود');
        return ok({ id: r[0].id });
      }
      const r = await sql.unsafe(`insert into cakeshop.mc_shop_categories (name, icon, image, hidden, sort, points_enabled, general_offers, special_offers)
        values ($1, $2, $3, $4, (select coalesce(max(sort), 0) + 1 from cakeshop.mc_shop_categories), $5, $6, $7) returning id`, [name, icon, image, !!p.hidden, p.points_enabled !== false, p.general_offers !== false, p.special_offers !== false]);
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
      const mode = (x) => (x === 'yes' || x === 'no' ? x : 'inherit');
      const rules = [mode(p.points_mode), mode(p.general_offers_mode), mode(p.special_offers_mode)];
      const low = Math.floor(num(p.low_stock_at === undefined ? 3 : p.low_stock_at, 'حد التنبيه للمخزون المنخفض'));
      if (low > 100000) return bad('حد التنبيه للمخزون المنخفض كبير جداً');
      const levels = cleanStock(p.stock, v);
      if (p.id && !UUID.test(T(p.id))) return bad('المنتج غير موجود');
      const id = await sql.begin(async (tx) => {
        let r;
        if (p.id) {
          r = await tx.unsafe(`update cakeshop.mc_shop_products set name=$1, category_id=$2, description=$3, price=$4, old_price=$5,
            available=$6, hidden=$7, images=$8::text::jsonb, specs=$9::text::jsonb, colors=$10::text::jsonb, variants=$11::text::jsonb, code=$12, track_stock=$13, low_stock_at=$14,
            points_mode=$16, general_offers_mode=$17, special_offers_mode=$18, updated_at=now()
            where id=$15 returning id`, [...vals, v.code, track, low, T(p.id), ...rules]);
          if (!r.length) throw new Error('المنتج غير موجود');
        } else {
          r = await tx.unsafe(`insert into cakeshop.mc_shop_products (name, category_id, description, price, old_price, available, hidden, images, specs, colors, variants, code, track_stock, low_stock_at, points_mode, general_offers_mode, special_offers_mode)
            values ($1,$2,$3,$4,$5,$6,$7,$8::text::jsonb,$9::text::jsonb,$10::text::jsonb,$11::text::jsonb,$12,$13,$14,$15,$16,$17) returning id`, [...vals, v.code, track, low, ...rules]);
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

/* ======================================================================
 * نظام الترابيزات (Dine-in & Table Ordering)
 *   العميل بيمسح QR الترابيزة (رابط فيه ?tb=<qr_key>) → منيو المحل والسلة → الطلب بيتسجل في نفس جدول الطلبات
 *   بنوع delivery = 'dinein' ومربوط بالترابيزة وجلستها. الأسعار والعروض والنقاط من نفس نظام المحل (quote).
 *   الجلسة بتتفتح مع أول طلب وبتفضل مفتوحة لحد ما الموظف يقفل الحساب، وبعدها الترابيزة ترجع متاحة.
 *   فاتورة الجلسة في برنامج الولاء (لو العميل مسجل) رقمها TB-<رقم الجلسة>، ونقاطها من المبلغ المسموح بالنقاط بس.
 * ====================================================================== */
export const DINE_NEXT = { pending: ['approved', 'cancelled'], approved: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['served', 'cancelled'], served: ['completed'] };
export const invoiceForSession = (no) => 'TB-' + no;
const HELP_KINDS = { help: 'طلب مساعدة', bill: 'طلب الحساب', order: 'استفسار عن الطلب' };
const SESSION_COLS = `s.id, s.session_no, s.table_id, s.table_name, s.status, s.customer_id, s.customer_name, s.customer_phone, s.member_no, s.opened_at, s.closed_at, s.closed_by,
  s.payment_status, s.orders_count, s.subtotal, s.discount, s.total, s.points_amount, s.invoice_no, s.invoice_status, s.invoice_error, s.points_awarded`;
const TABLE_KEY = /^[0-9a-f]{32}$/;
const fixSession = (s) => s && Object.assign({}, s, { session_no: Number(s.session_no), subtotal: Number(s.subtotal), discount: Number(s.discount), total: Number(s.total),
  points_amount: Number(s.points_amount), points_awarded: Number(s.points_awarded), orders_count: Number(s.orders_count) });

async function tableByKey(q, key) {
  const k = T(key).toLowerCase();
  if (!TABLE_KEY.test(k)) throw new Error('كود الترابيزة غير صحيح. امسح الـ QR اللي على الترابيزة تاني.');
  const r = await q.unsafe('select id, name, seats, active from cakeshop.mc_shop_tables where qr_key = $1', [k]);
  if (!r.length) throw new Error('الترابيزة دي مش موجودة. امسح الـ QR اللي على الترابيزة تاني.');
  if (!r[0].active) throw new Error('الترابيزة دي مش متاحة للطلب دلوقتي. كلّم حد من فريق المحل.');
  return r[0];
}
async function optCustomer(sql, token) {
  const t = T(token);
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const r = await sql.unsafe("select customer_id, name, phone, member_no, access_token from cakeshop.mc_customers where access_token = $1 and status = 'active'", [t]);
  return r[0] || null;
}
async function sessionCustomer(q, s) {
  if (!s || !s.customer_id) return null;
  const r = await q.unsafe("select customer_id, name, phone, member_no, access_token from cakeshop.mc_customers where customer_id = $1 and status = 'active'", [s.customer_id]);
  return r[0] || null;
}
async function sessionOrders(sql, sessionId) {
  const rows = await sql.unsafe(`select ${ORDER_COLS}, o.table_name, o.session_id, o.points_amount from cakeshop.mc_shop_orders o where o.session_id = $1 order by o.created_at`, [sessionId]);
  const list = await withImages(sql, rows);
  return list.map((o, i) => Object.assign(o, { table_name: rows[i].table_name, points_amount: rows[i].points_amount === null ? null : Number(rows[i].points_amount) }));
}
async function activeOffers(sql) { // العروض الحالية (العروض المتاحة لكل العملاء)
  return sql.unsafe(`select offer_id, title, description, image_url, end_date from cakeshop.mc_offers
    where active is true and coalesce(target_type, 'all') = 'all'
      and (start_date is null or start_date::date <= (now() at time zone 'Africa/Cairo')::date)
      and (end_date is null or end_date::date >= (now() at time zone 'Africa/Cairo')::date)
    order by created_at desc limit 20`);
}
async function openSessionOf(q, tableId) {
  const r = await q.unsafe(`select ${SESSION_COLS} from cakeshop.mc_shop_table_sessions s where s.table_id = $1 and s.status = 'open'`, [tableId]);
  return r[0] || null;
}

// ---------- العميل (من QR الترابيزة) ----------
async function tableCustomer(sql, action, p, ctx) {
  const tb = await tableByKey(sql, p.key);
  const me = await optCustomer(sql, p.token);
  if (action === 'tableBoot' || action === 'tableStatus') {
    const s = await openSessionOf(sql, tb.id);
    const out = { table: { name: tb.name, seats: tb.seats }, session: s ? { session_no: Number(s.session_no), customer_name: s.customer_name, opened_at: s.opened_at } : null,
      orders: s ? await sessionOrders(sql, s.id) : [], me: me ? { name: me.name, member_no: me.member_no } : null,
      help: (await sql.unsafe("select id, kind, created_at from cakeshop.mc_shop_table_help where table_id = $1 and status = 'open' order by id", [tb.id])).map((h) => ({ id: Number(h.id), kind: h.kind, label: HELP_KINDS[h.kind] || h.kind, created_at: h.created_at })) };
    out.orders = out.orders.map((o) => { delete o.history; return o; });
    if (action === 'tableBoot') { out.catalog = await catalog(sql); out.offers = await activeOffers(sql); }
    return out;
  }
  if (action === 'tableQuote') {
    const s = await openSessionOf(sql, tb.id);
    const c = (await sessionCustomer(sql, s)) || me;
    const qt = await quote(sql, c || { customer_id: '', name: '', phone: '', member_no: '' }, { items: p.items, delivery: 'pickup' }, false, c ? await birthdayOffer(ctx, c.access_token) : null);
    return Object.assign(qt, { shipping: 0, delivery: 'dinein', branches: [], saved_address: '', customer: c ? { name: c.name, member_no: c.member_no } : null });
  }
  if (action === 'tableOrder') {
    const notes = T(p.notes).slice(0, 500);
    let custToken = '';
    const r = await sql.begin(async (tx) => {
      await tx.unsafe("select set_config('cakeshop.actor', $1, true)", ['ترابيزة ' + tb.name]);
      await tx.unsafe('select id from cakeshop.mc_shop_tables where id = $1 for update', [tb.id]); // طلب واحد في نفس الوقت لنفس الترابيزة
      let s = await openSessionOf(tx, tb.id);
      if (!s) {
        const ins = await tx.unsafe(`insert into cakeshop.mc_shop_table_sessions (table_id, table_name, customer_id, customer_name, customer_phone, member_no)
          values ($1, $2, $3, $4, $5, $6) returning id`, [tb.id, tb.name, me ? me.customer_id : '', me ? me.name : '', me ? me.phone : '', me ? me.member_no : '']);
        s = await openSessionOf(tx, tb.id);
        if (!s || s.id !== ins[0].id) throw new Error('حاول تاني');
      } else if (!s.customer_id && me) {
        await tx.unsafe('update cakeshop.mc_shop_table_sessions set customer_id = $2, customer_name = $3, customer_phone = $4, member_no = $5 where id = $1', [s.id, me.customer_id, me.name, me.phone, me.member_no]);
        await tx.unsafe("update cakeshop.mc_shop_orders set customer_id = $2, customer_name = $3, customer_phone = $4, member_no = $5 where session_id = $1 and customer_id = ''", [s.id, me.customer_id, me.name, me.phone, me.member_no]);
        s = await openSessionOf(tx, tb.id);
      }
      const c = await sessionCustomer(tx, s);
      custToken = c ? c.access_token : '';
      const qt = await quote(tx, c || { customer_id: '', name: '', phone: '', member_no: '' }, { items: p.items, delivery: 'pickup' }, false, c ? await birthdayOffer(ctx, c.access_token) : null);
      const badLine = qt.lines.find((l) => l.error);
      if (badLine) { const e = new Error((badLine.name ? badLine.name + ': ' : '') + badLine.error); e.quote = qt; throw e; }
      const total = money2(qt.total - qt.shipping);
      if (p.expect_total !== undefined && p.expect_total !== null && money2(p.expect_total) !== total) throw new Error('الأسعار اتغيرت. راجع الإجمالي الجديد وأكد تاني.');
      const items = qt.lines.map((l) => ({ product_id: l.product_id, name: l.name, code: l.code, color: l.color, variant: l.variant, qty: l.qty,
        unit_price: l.unit_price, old_price: l.old_price, line_subtotal: l.line_subtotal, line_discount: l.line_discount, line_total: l.line_total, points: !!l.points }));
      const first = items[0];
      const title = first.name + (items.length > 1 ? ' + ' + (items.length - 1) + ' منتج تاني' : '');
      const hist = JSON.stringify([{ s: 'pending', at: new Date().toISOString(), by: 'ترابيزة ' + tb.name }]);
      const [o] = await tx.unsafe(`insert into cakeshop.mc_shop_orders (order_no, customer_id, customer_name, customer_phone, member_no, product_id, product_name, product_code,
          color, variant, qty, unit_price, total, notes, status, history, items, subtotal, product_discount, promo_discount, shipping, method, delivery,
          birthday_discount, points_amount, table_id, table_name, session_id)
        values (nextval('cakeshop.mc_shop_order_no'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14::text::jsonb, $15::text::jsonb,
          $16, $17, 0, 0, 'table', 'dinein', $18, $19, $20, $21, $22) returning id, order_no`,
        [c ? c.customer_id : '', c ? c.name : '', c ? c.phone : '', c ? c.member_no : '', first.product_id, title, first.code || '', first.color, first.variant,
          items.reduce((a, i) => a + i.qty, 0), first.unit_price, total, notes, hist, JSON.stringify(items), qt.subtotal, qt.product_discount,
          qt.birthday_discount, qt.points_amount, tb.id, tb.name, s.id]);
      await tx.unsafe('update cakeshop.mc_shop_table_sessions set orders_count = orders_count + 1 where id = $1', [s.id]);
      return { id: o.id, order_no: Number(o.order_no), total, birthday_discount: qt.birthday_discount };
    });
    if (r.birthday_discount > 0 && custToken && ctx && ctx.publicApi) {
      try { await ctx.publicApi('_bdayUse', { token: custToken, invoice_no: invoiceForOrder(r.order_no), discount: r.birthday_discount }); } catch (e) { console.error(e); }
    }
    return r;
  }
  if (action === 'tableHelp') {
    const kind = HELP_KINDS[T(p.kind)] ? T(p.kind) : 'help';
    const s = await openSessionOf(sql, tb.id);
    const ex = await sql.unsafe("select id from cakeshop.mc_shop_table_help where table_id = $1 and kind = $2 and status = 'open'", [tb.id, kind]);
    if (!ex.length) {
      const [h] = await sql.unsafe('insert into cakeshop.mc_shop_table_help (table_id, table_name, session_id, kind) values ($1, $2, $3, $4) returning id', [tb.id, tb.name, s ? s.id : null, kind]);
      await sql.unsafe(`insert into cakeshop.mc_shop_notifications (kind, title, body, ref_type, ref_id, dedupe_key)
        values ('table_help', $1, $2, 'table', $3, $4) on conflict (dedupe_key) do nothing`,
        ['🔴 ' + tb.name + ': ' + HELP_KINDS[kind], 'الترابيزة محتاجة حد من فريق المحل', tb.id, 'help:' + h.id]);
    }
    return { done: true };
  }
  throw new Error('طلب غير معروف');
}

// ---------- الإدارة ----------
async function tablesOverview(sql) {
  const [r] = await sql.unsafe(`select json_build_object(
    'tables', (select coalesce(json_agg(x order by x.sort, x.created_at), '[]') from (
      select t.id, t.name, t.seats, t.active, t.qr_key, t.sort, t.created_at,
        (select row_to_json(s) from (select s.id, s.session_no, s.opened_at, s.customer_name, s.member_no, s.payment_status,
           (select count(*) from cakeshop.mc_shop_orders o where o.session_id = s.id and o.status <> 'cancelled') as orders,
           (select count(*) from cakeshop.mc_shop_orders o where o.session_id = s.id and o.status = 'pending') as pending,
           (select count(*) from cakeshop.mc_shop_orders o where o.session_id = s.id and o.status in ('approved','preparing','ready')) as active,
           (select coalesce(sum(o.total), 0) from cakeshop.mc_shop_orders o where o.session_id = s.id and o.status <> 'cancelled') as total
          from cakeshop.mc_shop_table_sessions s where s.table_id = t.id and s.status = 'open') s) as session,
        (select coalesce(json_agg(json_build_object('id', h.id, 'kind', h.kind, 'created_at', h.created_at) order by h.id), '[]')
           from cakeshop.mc_shop_table_help h where h.table_id = t.id and h.status = 'open') as help
      from cakeshop.mc_shop_tables t) x),
    'orders', (select json_build_object(
       'total', count(*) filter (where status not in ('completed','cancelled','rejected')),
       'new', count(*) filter (where status = 'pending'),
       'preparing', count(*) filter (where status in ('approved','preparing')),
       'ready', count(*) filter (where status = 'ready'))
      from cakeshop.mc_shop_orders where delivery = 'dinein'),
    'sales_today', (select coalesce(sum(total), 0) from cakeshop.mc_shop_table_sessions
      where status = 'closed' and (closed_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date),
    'sales_total', (select coalesce(sum(total), 0) from cakeshop.mc_shop_table_sessions where status = 'closed'),
    'base_url', (select value from cakeshop.mc_settings where key = 'public_base_url')
  ) as data`);
  const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  d.tables.forEach((t) => {
    t.help = (t.help || []).map((h) => Object.assign(h, { label: HELP_KINDS[h.kind] || h.kind }));
    const s = t.session;
    t.status = !t.active ? 'disabled' : t.help.length ? 'attention' : s && Number(s.pending) > 0 ? 'pending' : s ? 'occupied' : 'available';
    if (s) ['session_no', 'orders', 'pending', 'active', 'total'].forEach((k) => { s[k] = Number(s[k]); });
  });
  const act = d.tables.filter((t) => t.active);
  d.kpi = { total: d.tables.length, available: act.filter((t) => t.status === 'available').length, occupied: act.filter((t) => t.session).length,
    attention: act.filter((t) => t.status === 'attention').length, orders: d.orders, sales_today: Number(d.sales_today), sales_total: Number(d.sales_total) };
  return d;
}
async function sessionTotals(ctx, token, s, orders) {
  const live = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  const t = { orders_count: live.length, subtotal: money2(live.reduce((a, o) => a + Number(o.subtotal || 0), 0)),
    discount: money2(live.reduce((a, o) => a + Number(o.product_discount || 0) + Number(o.promo_discount || 0) + Number(o.birthday_discount || 0), 0)),
    total: money2(live.reduce((a, o) => a + Number(o.total || 0), 0)),
    points_amount: money2(live.reduce((a, o) => a + (o.points_amount === null || o.points_amount === undefined ? Number(o.total || 0) : Number(o.points_amount)), 0)), points: null };
  t.points_amount = Math.min(t.points_amount, t.total);
  if (s.customer_id && t.total > 0 && s.status === 'open') { // النقاط المتوقعة من نفس قواعد برنامج الولاء
    try {
      const q = await ctx.adminApi(token, 'quote', { customer_id: s.customer_id, amount: t.total, points_amount: t.points_amount, category: '' }, '');
      if (q && q.ok) t.points = Number(q.data.points_earned || 0);
    } catch (e) { /* ignore */ }
  }
  return t;
}
async function sessionDetails(ctx, token, sessionId) {
  const { sql } = ctx;
  const r = await sql.unsafe(`select ${SESSION_COLS} from cakeshop.mc_shop_table_sessions s where s.id = $1`, [sessionId]);
  if (!r.length) throw new Error('الجلسة غير موجودة');
  const s = fixSession(r[0]);
  const orders = (await sessionOrders(sql, s.id)).map((o) => Object.assign(o, { next: DINE_NEXT[o.status] || [] }));
  const help = (await sql.unsafe('select id, kind, status, created_at, done_at, done_by from cakeshop.mc_shop_table_help where session_id = $1 or (table_id = $2 and status = \'open\') order by id', [s.id, s.table_id]))
    .map((h) => Object.assign(h, { id: Number(h.id), label: HELP_KINDS[h.kind] || h.kind }));
  return { session: s, orders, help, totals: s.status === 'open' ? await sessionTotals(ctx, token, s, orders) : { orders_count: s.orders_count, subtotal: s.subtotal, discount: s.discount, total: s.total, points_amount: s.points_amount, points: s.points_awarded } };
}
async function invoiceSession(ctx, token, id, user) {
  const { sql } = ctx;
  const cl = await sql.unsafe(`update cakeshop.mc_shop_table_sessions set invoice_status = 'working', invoice_error = ''
    where id = $1 and status = 'closed' and invoice_no = '' and invoice_status in ('none', 'failed') and total > 0
    returning session_no, customer_id, total, discount, subtotal, points_amount, table_name, closed_by`, [id]);
  if (!cl.length) return { ok: true, skipped: true };
  const s = cl[0], invNo = invoiceForSession(Number(s.session_no));
  try {
    if (!s.customer_id) { // عميل مش مسجل: الفاتورة بتتسجل في المبيعات من غير عميل ومن غير نقاط
      const ex = await sql.unsafe("select 1 from cakeshop.mc_transactions where invoice_no = $1 and customer_id = '' and status <> 'void' limit 1", [invNo]);
      if (!ex.length) {
        await sql.unsafe(`insert into cakeshop.mc_transactions (txn_id, invoice_key, invoice_no, customer_id, member_no, amount, discount_amount, net_amount, category,
            eligible_amount, points_earned, employee_name, branch_id, status, created_at)
          select 'T-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), coalesce(b.branch_id, '') || '|' || $1, $1, '', '', $2, 0, $2, '', 0, 0, $3, coalesce(b.branch_id, ''), 'valid', now()
          from (select 1) x left join lateral (select branch_id from cakeshop.mc_branches where active is true order by name limit 1) b on true`,
          [invNo, money2(s.total), (user && user.name) || s.closed_by || '']);
      }
      await sql.unsafe("update cakeshop.mc_shop_table_sessions set invoice_status = 'done', invoice_no = $2, points_awarded = 0 where id = $1", [id, invNo]);
      return { ok: true, invoice_no: invNo, points: 0 };
    }
    const ex = await sql.unsafe("select txn_id, points_earned from cakeshop.mc_transactions where invoice_no = $1 and customer_id = $2 and status <> 'void' limit 1", [invNo, s.customer_id]);
    let points;
    if (ex.length) points = Number(ex[0].points_earned || 0);
    else {
      const r = await ctx.adminApi(token, 'checkout', { customer_id: s.customer_id, invoice_no: invNo, amount: money2(s.total), points_amount: money2(Math.min(Number(s.points_amount), Number(s.total))), category: '' }, 'tb-' + id + '-' + Date.now());
      if (!r || !r.ok) throw new Error((r && r.error) || 'تعذر إنشاء الفاتورة');
      points = Number((r.data.quote && r.data.quote.points_earned) || 0);
      await sql.unsafe("update cakeshop.mc_pointsledger set reason = $3 where customer_id = $1 and ref_id = $2 and type = 'EARN'",
        [s.customer_id, r.data.txn_id, 'Dine-in Reward – ' + s.table_name + ' #' + s.session_no]);
    }
    await sql.unsafe("update cakeshop.mc_shop_table_sessions set invoice_status = 'done', invoice_no = $2, points_awarded = $3 where id = $1", [id, invNo, points]);
    if (points > 0) await sql.unsafe(`insert into cakeshop.mc_shop_customer_notes (customer_id, title, body, ref_type, ref_id, dedupe_key)
      values ($1, $2, $3, 'table', $4, $5) on conflict (dedupe_key) do nothing`,
      [s.customer_id, '🎉 كسبت ' + points + ' نقطة!', 'اتضافلك ' + points + ' نقطة على طلبك من ' + s.table_name + '. بالهنا والشفا 🍰', id, 'tb-done:' + id]);
    return { ok: true, invoice_no: invNo, points };
  } catch (e) {
    const msg = e && /[؀-ۿ]/.test(String(e.message)) ? e.message : 'حدث خطأ أثناء إنشاء الفاتورة';
    await sql.unsafe("update cakeshop.mc_shop_table_sessions set invoice_status = 'failed', invoice_error = $2 where id = $1", [id, msg.slice(0, 300)]);
    return { ok: false, error: msg };
  }
}
async function linkSessionCustomer(sql, sessionId, c) {
  await sql.unsafe("update cakeshop.mc_shop_table_sessions set customer_id = $2, customer_name = $3, customer_phone = $4, member_no = $5 where id = $1 and status = 'open'", [sessionId, c.customer_id, c.name, c.phone, c.member_no]);
  await sql.unsafe('update cakeshop.mc_shop_orders set customer_id = $2, customer_name = $3, customer_phone = $4, member_no = $5 where session_id = $1', [sessionId, c.customer_id, c.name, c.phone, c.member_no]);
}

export const TABLE_STAFF_ACTIONS = ['tables', 'tableSession', 'tableOrders', 'tableHelpDone', 'tableLinkCustomer', 'tableClose', 'tableRetryInvoice', 'tableHistory'];
export const TABLE_OWNER_ACTIONS = ['saveTable', 'deleteTable'];
async function tablesAdmin(ctx, token, user, action, p) {
  const { sql } = ctx;
  if (action === 'tables') return tablesOverview(sql);
  if (action === 'saveTable') {
    const name = T(p.name).slice(0, 40);
    if (!name) throw new Error('اكتب رقم أو اسم الترابيزة');
    const seats = Math.floor(Number(p.seats));
    if (!(seats >= 1 && seats <= 100)) throw new Error('عدد المقاعد لازم يكون من 1 لـ 100');
    const dup = await sql.unsafe('select 1 from cakeshop.mc_shop_tables where lower(name) = lower($1) and id::text <> $2', [name, T(p.id)]);
    if (dup.length) throw new Error('فيه ترابيزة بنفس الاسم');
    if (p.id) {
      if (!UUID.test(T(p.id))) throw new Error('الترابيزة غير موجودة');
      const r = await sql.unsafe('update cakeshop.mc_shop_tables set name = $2, seats = $3, active = $4, updated_at = now() where id = $1 returning id', [T(p.id), name, seats, p.active !== false]);
      if (!r.length) throw new Error('الترابيزة غير موجودة');
      await sql.unsafe("update cakeshop.mc_shop_table_sessions set table_name = $2 where table_id = $1 and status = 'open'", [T(p.id), name]);
      return { id: r[0].id };
    }
    const r = await sql.unsafe('insert into cakeshop.mc_shop_tables (name, seats, active, sort) values ($1, $2, $3, (select coalesce(max(sort), 0) + 1 from cakeshop.mc_shop_tables)) returning id', [name, seats, p.active !== false]);
    return { id: r[0].id };
  }
  if (action === 'deleteTable') {
    if (!UUID.test(T(p.id))) throw new Error('الترابيزة غير موجودة');
    const [c] = await sql.unsafe('select count(*)::int n from cakeshop.mc_shop_table_sessions where table_id = $1', [T(p.id)]);
    if (c.n > 0) throw new Error('الترابيزة دي عليها طلبات قديمة محفوظة في السجل، فمينفعش تتمسح. عطّلها بدل المسح.');
    await sql.unsafe('delete from cakeshop.mc_shop_tables where id = $1', [T(p.id)]);
    return { done: true };
  }
  if (action === 'tableSession') {
    let sid = T(p.session_id);
    if (!sid && UUID.test(T(p.table_id))) { const s = await openSessionOf(sql, T(p.table_id)); sid = s ? s.id : ''; }
    if (!UUID.test(sid)) return { session: null };
    return sessionDetails(ctx, token, sid);
  }
  if (action === 'tableOrders') {
    const rows = await sql.unsafe(`select ${ORDER_COLS}, o.table_name, o.session_id, o.points_amount from cakeshop.mc_shop_orders o where o.delivery = 'dinein' order by o.created_at desc limit 500`);
    const list = await withImages(sql, rows);
    return list.map((o, i) => Object.assign(o, { table_name: rows[i].table_name, session_id: rows[i].session_id, customer_name: rows[i].customer_name, member_no: rows[i].member_no,
      history: Array.isArray(rows[i].history) ? rows[i].history : [], next: DINE_NEXT[rows[i].status] || [], can_override: user.role === 'owner' }));
  }
  if (action === 'tableHistory') {
    const rows = await sql.unsafe(`select ${SESSION_COLS} from cakeshop.mc_shop_table_sessions s where s.status = 'closed' order by s.closed_at desc limit 300`);
    return rows.map(fixSession);
  }
  if (action === 'tableHelpDone') {
    const id = Number(p.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('الطلب غير موجود');
    await sql.unsafe("update cakeshop.mc_shop_table_help set status = 'done', done_at = now(), done_by = $2 where id = $1 and status = 'open'", [id, user.name || '']);
    await sql.unsafe("update cakeshop.mc_shop_notifications set read_at = coalesce(read_at, now()), read_by = case when read_at is null then $2 else read_by end where dedupe_key = $1", ['help:' + id, user.name || '']);
    return { done: true };
  }
  if (action === 'tableLinkCustomer') {
    if (!UUID.test(T(p.session_id))) throw new Error('الجلسة غير موجودة');
    const lk = await ctx.adminApi(token, 'lookup', { q: T(p.q) }, '');
    if (!lk || !lk.ok) throw new Error((lk && lk.error) || 'لم يتم العثور على العميل');
    const c = lk.data.customer;
    const s = await sql.unsafe("select id from cakeshop.mc_shop_table_sessions where id = $1 and status = 'open'", [T(p.session_id)]);
    if (!s.length) throw new Error('الجلسة دي اتقفلت');
    await linkSessionCustomer(sql, T(p.session_id), { customer_id: c.customer_id, name: c.name || '', phone: c.phone || '', member_no: c.member_no || '' });
    return sessionDetails(ctx, token, T(p.session_id));
  }
  if (action === 'tableClose') {
    const sid = T(p.session_id);
    if (!UUID.test(sid)) throw new Error('الجلسة غير موجودة');
    const pay = p.payment_status === 'paid' ? 'paid' : 'unpaid';
    await sql.begin(async (tx) => {
      await tx.unsafe("select set_config('cakeshop.actor', $1, true)", [user.name || 'الإدارة']);
      const r = await tx.unsafe("select id, status from cakeshop.mc_shop_table_sessions where id = $1 for update", [sid]);
      if (!r.length) throw new Error('الجلسة غير موجودة');
      if (r[0].status !== 'open') throw new Error('الترابيزة دي اتقفلت قبل كده');
      const open = await tx.unsafe("select order_no, status from cakeshop.mc_shop_orders where session_id = $1 and status in ('pending','approved','preparing','ready') order by order_no", [sid]);
      if (open.length) throw new Error('فيه طلبات لسه ما اتقدمتش (' + open.map((o) => '#' + o.order_no + ' ' + (ST_AR[o.status] || o.status)).join('، ') + '). قدّمها أو الغيها الأول.');
      // الطلبات اللي اتقدمت تتقفل «مكتمل» (والمخزون بيتخصم تلقائياً)
      const at = new Date().toISOString();
      await tx.unsafe(`update cakeshop.mc_shop_orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now(),
        history = history || $2::text::jsonb where session_id = $1 and status = 'served'`, [sid, JSON.stringify([{ s: 'completed', at, by: user.name || '', from: 'served' }])]);
      const t = (await tx.unsafe(`select count(*) filter (where status <> 'cancelled')::int n, coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0) sub,
          coalesce(sum(product_discount + promo_discount + birthday_discount) filter (where status <> 'cancelled'), 0) disc,
          coalesce(sum(total) filter (where status <> 'cancelled'), 0) tot, coalesce(sum(coalesce(points_amount, total)) filter (where status <> 'cancelled'), 0) pts
        from cakeshop.mc_shop_orders where session_id = $1`, [sid]))[0];
      await tx.unsafe(`update cakeshop.mc_shop_table_sessions set status = 'closed', closed_at = now(), closed_by = $2, payment_status = $3,
        orders_count = $4, subtotal = $5, discount = $6, total = $7, points_amount = least($8::numeric, $7::numeric) where id = $1`,
        [sid, user.name || '', pay, t.n, t.sub, t.disc, t.tot, t.pts]);
      await tx.unsafe("update cakeshop.mc_shop_table_help set status = 'done', done_at = now(), done_by = $2 where session_id = $1 and status = 'open'", [sid, user.name || '']);
    });
    const inv = await invoiceSession(ctx, token, sid, user);
    const d = await sessionDetails(ctx, token, sid);
    d.invoice = inv;
    return d;
  }
  if (action === 'tableRetryInvoice') {
    const sid = T(p.session_id);
    if (!UUID.test(sid)) throw new Error('الجلسة غير موجودة');
    const inv = await invoiceSession(ctx, token, sid, user);
    if (!inv.ok) throw new Error(inv.error);
    return sessionDetails(ctx, token, sid);
  }
  throw new Error('طلب غير معروف');
}

// ======================= التقارير التفصيلية، الداشبورد، التصدير، النسخ الاحتياطي =======================
// REPORT_ACTIONS: لصلاحية «لوحة المؤشرات». OWNER_DATA_ACTIONS: لصاحب المحل بس.
export const REPORT_ACTIONS = ['salesItems', 'dashShop'];
export const OWNER_DATA_ACTIONS = ['exportData', 'backupInfo', 'backupCreate', 'backupRestore', 'wipeData'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = 'Africa/Cairo';
const OPEN_ST = ['pending', 'approved', 'preparing', 'ready', 'shipped', 'served'];
const invStatusOf = (st) => (st === 'completed' ? 'completed' : st === 'cancelled' || st === 'rejected' ? 'cancelled' : 'open');
const fmtTs = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
};
function dayRange(col, from, to, params) {
  let w = '';
  if (DAY_RE.test(T(from))) { params.push(T(from)); w += ` and (${col} at time zone '${TZ}')::date >= $${params.length}::date`; }
  if (DAY_RE.test(T(to))) { params.push(T(to)); w += ` and (${col} at time zone '${TZ}')::date <= $${params.length}::date`; }
  return w;
}
const jarr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? (() => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; } })() : []);

// كل صنف في كل فاتورة في سطر مستقل (طلبات أونلاين + ترابيزات + فواتير الكاشير اللي مالهاش أصناف)
async function salesLines(sql, from, to) {
  const p1 = [];
  const orders = await sql.unsafe(`select o.id, o.order_no, o.customer_id, o.customer_name, o.member_no, o.items, o.promo_discount, o.birthday_discount,
      o.status, o.delivery, o.invoice_no, o.session_id, s.session_no, s.invoice_no as s_invoice, s.customer_id as s_cid, s.customer_name as s_cname, s.member_no as s_member,
      coalesce(s.closed_at, o.completed_at, o.created_at) as inv_at
    from cakeshop.mc_shop_orders o left join cakeshop.mc_shop_table_sessions s on s.id = o.session_id
    where true ${dayRange('coalesce(s.closed_at, o.completed_at, o.created_at)', from, to, p1)}`, p1);
  const prods = await sql.unsafe(`select p.id::text as id, p.code, c.name as cat from cakeshop.mc_shop_products p left join cakeshop.mc_shop_categories c on c.id = p.category_id`);
  const pm = new Map(prods.map((x) => [x.id, x]));
  const voidInv = new Set((await sql.unsafe(`select invoice_no from cakeshop.mc_transactions t where (invoice_no like 'ON-%' or invoice_no like 'TB-%') and status = 'void'
      and not exists (select 1 from cakeshop.mc_transactions t2 where t2.invoice_no = t.invoice_no and t2.status <> 'void')`)).map((r) => r.invoice_no));
  const lines = [];
  for (const o of orders) {
    const dine = o.delivery === 'dinein';
    const inv = dine ? (o.s_invoice || (o.session_no ? invoiceForSession(o.session_no) : '#' + o.order_no)) : (o.invoice_no || invoiceForOrder(o.order_no));
    let status = invStatusOf(o.status);
    if (status === 'completed' && voidInv.has(inv)) status = 'void';
    const items = jarr(o.items);
    const extra = money2(Number(o.promo_discount || 0) + Number(o.birthday_discount || 0));
    const base = items.reduce((s, it) => s + Number(it.line_total || 0), 0);
    let left = extra;
    items.forEach((it, i) => {
      const qty = Number(it.qty || 0), total = money2(Number(it.line_subtotal || 0) || Number(it.unit_price || 0) * qty);
      let share = 0;
      if (extra > 0 && base > 0) { share = i === items.length - 1 ? left : money2(extra * Number(it.line_total || 0) / base); left = money2(left - share); }
      const disc = money2(Number(it.line_discount || 0) + share);
      const pr = pm.get(String(it.product_id || '')) || {};
      lines.push({
        invoice_no: inv, order_no: o.order_no, created_at: o.inv_at,
        customer_id: o.customer_id || o.s_cid || '', customer_name: o.customer_name || o.s_cname || '', member_no: o.member_no || o.s_member || '',
        item_name: T(it.name) + (it.variant ? ' – ' + T(it.variant) : '') + (it.color ? ' – ' + T(it.color) : ''), item_code: T(it.code) || T(pr.code), category: pr.cat || '',
        qty, unit_price: qty ? money2(total / qty) : 0, total, discount: disc, net: money2(total - disc),
        type: dine ? 'dinein' : o.delivery === 'delivery' ? 'delivery' : 'pickup', status,
      });
    });
  }
  const p2 = [];
  const tx = await sql.unsafe(`select t.invoice_no, t.customer_id, t.member_no, t.amount, t.discount_amount, t.net_amount, t.status, t.created_at, c.name
    from cakeshop.mc_transactions t left join cakeshop.mc_customers c on c.customer_id = t.customer_id and t.customer_id <> ''
    where t.invoice_no not like 'ON-%' and t.invoice_no not like 'TB-%' ${dayRange('t.created_at', from, to, p2)}`, p2);
  for (const t of tx) {
    lines.push({
      invoice_no: t.invoice_no, order_no: null, created_at: t.created_at, customer_id: t.customer_id || '', customer_name: t.name || '', member_no: t.member_no || '',
      item_name: 'فاتورة كاشير (من غير أصناف)', item_code: '', category: '', qty: 0, unit_price: 0,
      total: money2(t.amount), discount: money2(t.discount_amount), net: money2(t.net_amount),
      type: 'store', status: t.status === 'void' ? 'void' : 'completed',
    });
  }
  lines.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || String(a.invoice_no).localeCompare(String(b.invoice_no)));
  return lines;
}

async function dashShop(sql) {
  const [m] = await sql.unsafe(`select to_char((now() at time zone '${TZ}')::date, 'YYYY-MM-DD') as today, to_char(date_trunc('month', now() at time zone '${TZ}'), 'YYYY-MM-DD') as month_start`);
  const lines = (await salesLines(sql, m.month_start, m.today)).filter((l) => l.status === 'completed');
  const [s] = await sql.unsafe(`select
      coalesce(sum(amount) filter (where (created_at at time zone '${TZ}')::date = $1::date), 0) as today_sales,
      count(*) filter (where (created_at at time zone '${TZ}')::date = $1::date) as today_count,
      coalesce(sum(amount), 0) as month_sales, coalesce(sum(net_amount), 0) as month_net, coalesce(sum(discount_amount), 0) as month_disc, count(*) as month_count
    from cakeshop.mc_transactions where status <> 'void' and (created_at at time zone '${TZ}')::date between $2::date and $1::date`, [m.today, m.month_start]);
  const days = await sql.unsafe(`select to_char((created_at at time zone '${TZ}')::date, 'YYYY-MM-DD') as day, sum(amount) as sales, count(*) as count
    from cakeshop.mc_transactions where status <> 'void' and (created_at at time zone '${TZ}')::date between $2::date and $1::date group by 1 order by 1`, [m.today, m.month_start]);
  const [o] = await sql.unsafe(`select
      count(*) filter (where status = 'pending') as new_orders,
      count(*) filter (where status = any($2::text[]) and status <> 'pending') as in_progress,
      count(*) filter (where status = 'completed' and (coalesce(completed_at, updated_at) at time zone '${TZ}')::date >= $1::date) as completed,
      count(*) filter (where status in ('cancelled', 'rejected') and (updated_at at time zone '${TZ}')::date >= $1::date) as cancelled,
      count(*) filter (where status = 'pending' and delivery = 'dinein') as new_dine,
      count(*) filter (where status = any($2::text[]) and status <> 'pending' and delivery = 'dinein') as prog_dine
    from cakeshop.mc_shop_orders`, [m.month_start, OPEN_ST]);
  const agg = new Map();
  lines.filter((l) => l.type !== 'store').forEach((l) => {
    const k = l.item_name;
    const a = agg.get(k) || { name: k, code: l.item_code, qty: 0, sales: 0 };
    a.qty += l.qty; a.sales = money2(a.sales + l.net); agg.set(k, a);
  });
  const sold = [...agg.values()];
  const prods = await sql.unsafe(`select name, code from cakeshop.mc_shop_products where hidden is not true and available is not false`);
  const soldByBase = new Map();
  sold.forEach((x) => { const b = x.name.split(' – ')[0]; soldByBase.set(b, (soldByBase.get(b) || 0) + x.qty); });
  const slow = prods.map((p) => ({ name: p.name, code: p.code || '', qty: soldByBase.get(p.name) || 0 })).sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name)).slice(0, 5);
  return {
    today: m.today, month_start: m.month_start,
    sales: { today: money2(s.today_sales), today_count: Number(s.today_count), month: money2(s.month_sales), month_count: Number(s.month_count),
      month_net: money2(s.month_net), month_disc: money2(s.month_disc), avg: Number(s.month_count) ? money2(s.month_sales / Number(s.month_count)) : 0 },
    days: days.map((d) => ({ day: d.day, sales: money2(d.sales), count: Number(d.count) })),
    orders: { new_orders: Number(o.new_orders), in_progress: Number(o.in_progress), completed: Number(o.completed), cancelled: Number(o.cancelled), new_dine: Number(o.new_dine), prog_dine: Number(o.prog_dine) },
    top_qty: sold.slice().sort((a, b) => b.qty - a.qty).slice(0, 5),
    top_sales: sold.slice().sort((a, b) => b.sales - a.sales).slice(0, 5),
    slow,
  };
}

async function reportsAdmin(sql, user, action, p) {
  if (action === 'salesItems') return salesLines(sql, p.from, p.to);
  if (action === 'dashShop') return dashShop(sql);
  throw new Error('طلب غير معروف');
}

// ---------- التصدير لـ Excel: كل نوع بيانات في Sheet، والفترة بتتطبق على البيانات اللي ليها تاريخ ----------
const TYPE_LBL = { dinein: 'Dine-in', delivery: 'Delivery', pickup: 'Pickup', store: 'Cashier' };
const INV_ST = { completed: 'Completed', open: 'Open', cancelled: 'Cancelled', 'void': 'Void' };
const EXPORT_SETS = {
  sales: { name: 'Sales & Invoices', dated: true, cols: [['Invoice Number', 'invoice_no', 's'], ['Invoice Date', 'created_at', 'd'], ['Customer Name', 'cname'], ['Member No', 'member_no', 's'], ['Amount', 'amount', 'n'], ['Discount', 'discount_amount', 'n'], ['Net Amount', 'net_amount', 'n'], ['Points Earned', 'points_earned', 'n'], ['Employee', 'employee_name'], ['Branch', 'branch_id', 's'], ['Status', 'status'], ['Void Reason', 'void_reason'], ['Transaction ID', 'txn_id', 's']],
    q: (w) => `select t.*, c.name as cname from cakeshop.mc_transactions t left join cakeshop.mc_customers c on c.customer_id = t.customer_id and t.customer_id <> '' where true ${w('t.created_at')} order by t.created_at` },
  details: { name: 'Sales Details', dated: true, lines: true, cols: [['Invoice Number', 'invoice_no', 's'], ['Invoice Date', 'created_at', 'd'], ['Customer Name', 'customer_name'], ['Item Code', 'item_code', 's'], ['Item Name', 'item_name'], ['Category', 'category'], ['Quantity', 'qty', 'n'], ['Unit Price', 'unit_price', 'n'], ['Total Item Value', 'total', 'n'], ['Discount', 'discount', 'n'], ['Net Amount', 'net', 'n'], ['Order Type', 'type_l'], ['Invoice Status', 'status_l']] },
  products: { name: 'Products', cols: [['Item Code', 'code', 's'], ['Item Name', 'name'], ['Category', 'cat'], ['Price', 'price', 'n'], ['Old Price', 'old_price', 'n'], ['Available', 'available', 'b'], ['Hidden', 'hidden', 'b'], ['Track Stock', 'track_stock', 'b'], ['Stock', 'stock', 'n'], ['Points', 'points_mode'], ['General Offers', 'general_offers_mode'], ['Special Offers', 'special_offers_mode'], ['Description', 'description'], ['Product ID', 'id', 's'], ['Created At', 'created_at', 'd']],
    q: () => `select p.*, c.name as cat, (select sum(s.physical) from cakeshop.mc_shop_stock s where s.product_id = p.id) as stock from cakeshop.mc_shop_products p left join cakeshop.mc_shop_categories c on c.id = p.category_id order by c.sort, p.name` },
  categories: { name: 'Product Categories', cols: [['Category', 'name'], ['Icon', 'icon'], ['Sort', 'sort', 'n'], ['Hidden', 'hidden', 'b'], ['Points Enabled', 'points_enabled', 'b'], ['General Offers', 'general_offers', 'b'], ['Special Offers', 'special_offers', 'b'], ['Products Count', 'n', 'n'], ['Category ID', 'id', 's']],
    q: () => `select c.*, (select count(*) from cakeshop.mc_shop_products p where p.category_id = c.id) as n from cakeshop.mc_shop_categories c order by c.sort, c.name` },
  customers: { name: 'Customers', cols: [['Member No', 'member_no', 's'], ['Name', 'name'], ['Phone', 'phone', 's'], ['Status', 'status'], ['Tier', 'tier'], ['Birthdate', 'birthdate', 's'], ['Branch', 'branch_id', 's'], ['WhatsApp Opt-in', 'wa_opt_in', 'b'], ['Points Balance', 'points_balance', 'n'], ['Lifetime Points', 'lifetime_points', 'n'], ['Total Spent', 'total_spent', 'n'], ['Purchases', 'purchases_count', 'n'], ['Last Purchase', 'last_purchase_at', 'd'], ['Registered At', 'created_at', 'd'], ['Notes', 'notes'], ['Customer ID', 'customer_id', 's']],
    q: () => `select * from cakeshop.mc_customers order by created_at` },
  ledger: { name: 'Loyalty Points', dated: true, cols: [['Date', 'created_at', 'd'], ['Member No', 'member_no', 's'], ['Customer Name', 'cname'], ['Type', 'type'], ['Points', 'points', 'n'], ['Balance After', 'balance_after', 'n'], ['Invoice Number', 'invoice_no', 's'], ['Reason', 'reason'], ['Expires At', 'expires_at', 'd'], ['Employee', 'employee_name'], ['Entry ID', 'entry_id', 's']],
    q: (w) => `select l.*, c.name as cname, c.member_no from cakeshop.mc_pointsledger l left join cakeshop.mc_customers c on c.customer_id = l.customer_id where true ${w('l.created_at')} order by l.created_at` },
  redemptions: { name: 'Loyalty Redemptions', dated: true, cols: [['Date', 'created_at', 'd'], ['Invoice Number', 'invoice_no', 's'], ['Member No', 'member_no', 's'], ['Customer Name', 'cname'], ['Points Used', 'points_used', 'n'], ['Discount %', 'discount_percent', 'n'], ['Invoice Amount', 'invoice_amount', 'n'], ['Discount', 'discount_amount', 'n'], ['Employee', 'employee_name'], ['Status', 'status'], ['Redemption ID', 'redemption_id', 's']],
    q: (w) => `select r.*, c.name as cname, c.member_no from cakeshop.mc_redemptions r left join cakeshop.mc_customers c on c.customer_id = r.customer_id where true ${w('r.created_at')} order by r.created_at` },
  offers: { name: 'Offers', cols: [['Title', 'title'], ['Description', 'description'], ['Type', 'offer_type'], ['Start', 'start_date', 'd'], ['End', 'end_date', 'd'], ['Target', 'target_type'], ['Target Value', 'target_value', 's'], ['Active', 'active', 'b'], ['Created By', 'created_by'], ['Offer ID', 'offer_id', 's']],
    q: () => `select * from cakeshop.mc_offers order by created_at` },
  promos: { name: 'Discount Codes', cols: [['Code', 'code', 's'], ['Kind', 'kind'], ['Value', 'value', 'n'], ['Min Order', 'min_order', 'n'], ['Max Discount', 'max_discount', 'n'], ['Starts On', 'starts_on', 's'], ['Ends On', 'ends_on', 's'], ['Max Uses', 'max_uses', 'n'], ['Per Customer', 'per_customer', 'n'], ['Active', 'active', 'b'], ['Stackable', 'stackable', 'b'], ['Uses', 'uses', 'n']],
    q: () => `select pr.*, to_char(pr.starts_on, 'YYYY-MM-DD') as starts_on, to_char(pr.ends_on, 'YYYY-MM-DD') as ends_on, (select count(*) from cakeshop.mc_shop_orders o where o.promo_id = pr.id and o.status not in ('cancelled','rejected')) as uses from cakeshop.mc_shop_promos pr order by pr.created_at` },
  birthday: { name: 'Birthday Rewards', dated: true, cols: [['Created At', 'created_at', 'd'], ['Member No', 'member_no', 's'], ['Customer Name', 'cname'], ['Occasion', 'occasion'], ['Start', 'start_date', 's'], ['End', 'end_date', 's'], ['Reward Type', 'reward_type'], ['Value', 'value', 'n'], ['Status', 'status'], ['Invoice Number', 'invoice_no', 's'], ['Discount', 'discount_amount', 'n'], ['Used At', 'used_at', 'd']],
    q: (w) => `select b.*, c.name as cname from cakeshop.mc_birthdayrewards b left join cakeshop.mc_customers c on c.customer_id = b.customer_id where true ${w('b.created_at')} order by b.created_at` },
  orders: { name: 'Orders', dated: true, cols: [['Order No', 'order_no', 's'], ['Date', 'created_at', 'd'], ['Customer Name', 'customer_name'], ['Phone', 'customer_phone', 's'], ['Member No', 'member_no', 's'], ['Order Type', 'type_l'], ['Table', 'table_name'], ['Items', 'items_txt'], ['Subtotal', 'subtotal', 'n'], ['Product Discount', 'product_discount', 'n'], ['Promo Code', 'promo_code', 's'], ['Promo Discount', 'promo_discount', 'n'], ['Birthday Discount', 'birthday_discount', 'n'], ['Delivery Fee', 'shipping', 'n'], ['Total', 'total', 'n'], ['Status', 'status'], ['Branch', 'branch_name'], ['Address', 'address'], ['Notes', 'notes'], ['Invoice Number', 'invoice_no', 's'], ['Completed At', 'completed_at', 'd']],
    q: (w) => `select * from cakeshop.mc_shop_orders where true ${w('created_at')} order by order_no` },
  tables: { name: 'Tables', cols: [['Table', 'name'], ['Seats', 'seats', 'n'], ['Active', 'active', 'b'], ['Sort', 'sort', 'n'], ['QR Key', 'qr_key', 's'], ['Table ID', 'id', 's']],
    q: () => `select * from cakeshop.mc_shop_tables order by sort, name` },
  sessions: { name: 'Dine-in Sessions', dated: true, cols: [['Session No', 'session_no', 's'], ['Table', 'table_name'], ['Opened At', 'opened_at', 'd'], ['Closed At', 'closed_at', 'd'], ['Status', 'status'], ['Customer Name', 'customer_name'], ['Member No', 'member_no', 's'], ['Orders', 'orders_count', 'n'], ['Subtotal', 'subtotal', 'n'], ['Discount', 'discount', 'n'], ['Total', 'total', 'n'], ['Payment Status', 'payment_status'], ['Invoice Number', 'invoice_no', 's'], ['Invoice Status', 'invoice_status'], ['Points Awarded', 'points_awarded', 'n'], ['Closed By', 'closed_by']],
    q: (w) => `select * from cakeshop.mc_shop_table_sessions where true ${w('opened_at')} order by session_no` },
  branches: { name: 'Branches', cols: [['Branch ID', 'branch_id', 's'], ['Name', 'name'], ['Address', 'address'], ['Phone', 'phone', 's'], ['Active', 'active', 'b']], q: () => `select * from cakeshop.mc_branches order by name` },
  employees: { name: 'Employees', cols: [['Employee ID', 'employee_id', 's'], ['Name', 'name'], ['Phone', 'phone', 's'], ['Job Title', 'job_title'], ['Branch', 'branch_id', 's'], ['Active', 'active', 'b']], q: () => `select * from cakeshop.mc_employees order by name` },
  tiers: { name: 'Tiers', cols: [['Tier', 'name_ar'], ['Tier (EN)', 'name_en'], ['Min Lifetime Points', 'min_lifetime_points', 'n'], ['Active', 'active', 'b']], q: () => `select * from cakeshop.mc_tiers order by sort` },
};
export const EXPORT_KEYS = Object.keys(EXPORT_SETS);

async function exportData(sql, p) {
  const keys = (Array.isArray(p.sets) ? p.sets : []).filter((k) => EXPORT_SETS[k]);
  if (!keys.length) throw new Error('اختار البيانات اللي عايز تصدّرها');
  const out = [];
  for (const k of keys) {
    const def = EXPORT_SETS[k];
    let rows;
    if (def.lines) rows = await salesLines(sql, p.from, p.to);
    else {
      const params = [];
      const w = (col) => (def.dated ? dayRange(col, p.from, p.to, params) : '');
      rows = await sql.unsafe(def.q(w), params);
    }
    const data = rows.map((r) => {
      if (k === 'details') { r.type_l = TYPE_LBL[r.type] || r.type; r.status_l = INV_ST[r.status] || r.status; }
      if (k === 'orders') { r.type_l = TYPE_LBL[r.delivery] || r.delivery; r.items_txt = jarr(r.items).map((i) => T(i.name) + (i.variant ? ' – ' + T(i.variant) : '') + ' × ' + i.qty).join(' | '); }
      return def.cols.map(([, key, t]) => {
        const v = r[key];
        if (t === 'd') return fmtTs(v);
        if (t === 'n') return v === null || v === undefined || v === '' ? null : Number(v);
        if (t === 'b') return v === true ? 'Yes' : v === false ? 'No' : '';
        return v === null || v === undefined ? '' : String(v);
      });
    });
    out.push({ key: k, name: def.name, cols: def.cols.map(([l]) => l), types: def.cols.map(([, , t]) => t || 's'), rows: data });
  }
  return { sheets: out, from: T(p.from), to: T(p.to) };
}

// ---------- النسخ الاحتياطي الكامل: كل جداول cakeshop (ما عدا جلسات الدخول المؤقتة وسجل النسخ نفسه) ----------
const BACKUP_SKIP = ['mc_cache', 'mc_backups'];
async function backupTables(q) {
  const rows = await q.unsafe(`select table_name from information_schema.tables where table_schema = 'cakeshop' and table_type = 'BASE TABLE' order by table_name`);
  return rows.map((r) => r.table_name).filter((t) => BACKUP_SKIP.indexOf(t) < 0 && /^[a-z0-9_]+$/.test(t));
}
async function tableCols(q, t) {
  return q.unsafe(`select column_name, column_default, is_identity, is_generated from information_schema.columns where table_schema = 'cakeshop' and table_name = $1 order by ordinal_position`, [t]);
}
// بصمة الملف بترتيب ثابت للمفاتيح، عشان تفضل مطابقة مهما كان البرنامج اللي فتح الملف وحفظه
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v));
async function sha256(str) {
  const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function backupCreate(sql, user, p) {
  const note = T(p.note).slice(0, 200);
  const tables = {};
  const counts = {};
  for (const t of await backupTables(sql)) {
    const cols = (await tableCols(sql, t)).filter((c) => c.is_generated !== 'ALWAYS').map((c) => c.column_name);
    const [r] = await sql.unsafe(`select coalesce(json_agg(x), '[]')::text as j from cakeshop."${t}" x`);
    const rows = JSON.parse(r.j);
    tables[t] = { columns: cols, rows };
    counts[t] = rows.length;
  }
  const body = JSON.stringify(tables);
  const checksum = await sha256(canon(tables));
  const [m] = await sql.unsafe(`insert into cakeshop.mc_backups (kind, created_by, note, size_bytes, tables_count, rows_count, checksum)
    values ('backup', $1, $2, $3, $4, $5, $6) returning id, created_at`,
    [user.name || '', note, body.length, Object.keys(tables).length, Object.values(counts).reduce((a, b) => a + b, 0), checksum]);
  return { format: 'cakeshop-backup', version: 1, backup_id: Number(m.id), created_at: m.created_at, created_by: user.name || '', note, counts, checksum, tables };
}

async function backupInfo(sql) {
  return sql.unsafe(`select id, kind, created_at, created_by, note, size_bytes, tables_count, rows_count, checksum from cakeshop.mc_backups order by id desc limit 50`);
}

// استرجاع: بيتأكد من سلامة الملف (الـ checksum والجداول والأعمدة)، وبعدين يستبدل البيانات كلها جوه transaction واحدة.
// dry_run = تجربة كاملة جوه transaction وبعدين بترجع زي ما كانت (للتأكد إن الملف هيترجع فعلاً قبل التنفيذ).
async function backupRestore(sql, user, p) {
  const b = p.backup;
  if (!b || b.format !== 'cakeshop-backup' || !b.tables || typeof b.tables !== 'object') throw new Error('الملف ده مش نسخة احتياطية من Cake Shop');
  const sum = await sha256(canon(b.tables));
  if (sum !== b.checksum) throw new Error('الملف متغيّر أو ناقص (الـ checksum مش مطابق). مش هينفع يترجع.');
  if (!p.dry_run && T(p.confirm) !== 'استرجاع') throw new Error('اكتب كلمة «استرجاع» للتأكيد');
  const ROLLBACK = '__dry_run__';
  const result = { tables: {}, skipped: [] };
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local session_replication_role = replica');
      const live = await backupTables(tx);
      for (const t of Object.keys(b.tables)) {
        if (live.indexOf(t) < 0) { result.skipped.push(t); continue; }
        const src = b.tables[t];
        if (!src || !Array.isArray(src.rows) || !Array.isArray(src.columns)) throw new Error('جدول ' + t + ' في الملف ناقص');
        const cur = (await tableCols(tx, t)).filter((c) => c.is_generated !== 'ALWAYS');
        const names = cur.map((c) => c.column_name).filter((c) => src.columns.indexOf(c) >= 0);
        await tx.unsafe(`delete from cakeshop."${t}"`);
        if (src.rows.length && names.length) {
          const cl = names.map((c) => '"' + c.replace(/"/g, '') + '"').join(', ');
          for (let i = 0; i < src.rows.length; i += 500) {
            await tx.unsafe(`insert into cakeshop."${t}" (${cl}) overriding system value select ${cl} from json_populate_recordset(null::cakeshop."${t}", ($1::text)::json)`, [JSON.stringify(src.rows.slice(i, i + 500))]);
          }
        }
        for (const c of cur) {
          if (!(c.is_identity === 'YES' || /^nextval\(/.test(c.column_default || ''))) continue;
          await tx.unsafe(`select setval(pg_get_serial_sequence('cakeshop."${t}"', $1), greatest(coalesce((select max("${c.column_name.replace(/"/g, '')}") from cakeshop."${t}"), 0), 1), (select count(*) > 0 from cakeshop."${t}"))`, [c.column_name]);
        }
        const [n] = await tx.unsafe(`select count(*)::int as n from cakeshop."${t}"`);
        result.tables[t] = n.n;
      }
      if (p.dry_run) throw new Error(ROLLBACK);
      await tx.unsafe(`insert into cakeshop.mc_backups (kind, created_by, note, size_bytes, tables_count, rows_count, checksum)
        values ('restore', $1, $2, 0, $3, $4, $5)`, [user.name || '', 'استرجاع نسخة ' + fmtTs(b.created_at), Object.keys(result.tables).length, Object.values(result.tables).reduce((a, c) => a + c, 0), b.checksum]);
    });
  } catch (e) {
    if (e && e.message === ROLLBACK) return { dry_run: true, ok: true, ...result };
    throw e;
  }
  return { dry_run: false, ok: true, ...result };
}

// ---------- مسح البيانات الموجودة (صاحب المحل): المنتجات والأقسام والترابيزات والعروض والإعدادات والموظفين مش بتتمسح أبداً ----------
const WIPE_SETS = {
  orders: { label: 'الطلبات (أونلاين وترابيزات)', sql: [
    'delete from cakeshop.mc_shop_orders', 'delete from cakeshop.mc_shop_table_help', 'delete from cakeshop.mc_shop_table_sessions',
    'delete from cakeshop.mc_shop_notifications', 'update cakeshop.mc_shop_stock set reserved = 0, updated_at = now() where reserved <> 0'] },
  sales: { label: 'المبيعات والفواتير', sql: [
    'delete from cakeshop.mc_transactions', 'delete from cakeshop.mc_redemptions',
    'update cakeshop.mc_customers set total_spent = 0, purchases_count = 0, last_purchase_at = null'] },
  points: { label: 'نقاط العملاء', sql: [
    'delete from cakeshop.mc_pointsledger', "update cakeshop.mc_customers set points_balance = 0, lifetime_points = 0, tier = coalesce((select tier_id from cakeshop.mc_tiers where active is not false order by min_lifetime_points limit 1), '')"] },
  customers: { label: 'العملاء', sql: [
    'delete from cakeshop.mc_pointsledger', 'delete from cakeshop.mc_birthdayrewards', 'delete from cakeshop.mc_whatsappconsent', 'delete from cakeshop.mc_whatsapplog',
    'delete from cakeshop.mc_shop_addresses', 'delete from cakeshop.mc_shop_customer_notes', 'delete from cakeshop.mc_customers'] },
  activity: { label: 'سجل العمليات', sql: ['delete from cakeshop.mc_activitylogs'] },
};
async function wipeData(sql, user, p) {
  const sets = (Array.isArray(p.sets) ? p.sets : []).filter((k) => WIPE_SETS[k]);
  if (!sets.length) throw new Error('اختار البيانات اللي عايز تمسحها');
  if (T(p.confirm) !== 'مسح') throw new Error('اكتب كلمة «مسح» للتأكيد');
  await sql.begin(async (tx) => {
    for (const k of ['orders', 'sales', 'points', 'customers', 'activity']) {
      if (sets.indexOf(k) < 0) continue;
      for (const q of WIPE_SETS[k].sql) await tx.unsafe(q);
    }
    await tx.unsafe(`insert into cakeshop.mc_backups (kind, created_by, note) values ('wipe', $1, $2)`,
      [user.name || '', 'مسح: ' + sets.map((k) => WIPE_SETS[k].label).join('، ')]);
  });
  return { done: true, sets };
}

async function ownerData(sql, user, action, p) {
  if (action === 'exportData') return exportData(sql, p);
  if (action === 'backupInfo') return backupInfo(sql);
  if (action === 'backupCreate') return backupCreate(sql, user, p);
  if (action === 'backupRestore') return backupRestore(sql, user, p);
  if (action === 'wipeData') return wipeData(sql, user, p);
  throw new Error('طلب غير معروف');
}
