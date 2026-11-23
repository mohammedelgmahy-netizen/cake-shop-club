// CAKE SHOP CLUB — Supabase Edge Function "cakeshop"
// نقطة الدخول الوحيدة للموقع. قاعدة البيانات مغلقة أمام المتصفح، وكل عملية تمر من هنا
// وتخضع لنفس قواعد الأمان والصلاحيات الموجودة في كود النظام.
//
// منصة متعددة المحلات (SaaS): كل محل مشترك ليه خزنة (schema) منفصلة في قاعدة البيانات.
// المحل بيتحدد من ?shop=<code> في رابط الدالة (الموقع بيبعته لوحده من رابط المحل /<code>).
// من غير shop = Cake Shop الأصلي (schema cakeshop) عشان كل الروابط القديمة تفضل شغالة.
// كل طلب بيتنفذ جوه خزنة محل واحد بس، فمستحيل محل يوصل لبيانات محل تاني.
import postgres from 'npm:postgres@3.4.5';
import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { handle } from 'https://cdn.jsdelivr.net/gh/mohammedelgmahy-netizen/cake-shop-club@c2e02466ac146fb3cabe8e6473f779b8812de18a/server/bundle.js';
import { handleShop } from 'https://cdn.jsdelivr.net/gh/mohammedelgmahy-netizen/cake-shop-club@c2e02466ac146fb3cabe8e6473f779b8812de18a/server/shop.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 60 });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_SHOP = 'cakeshop';
const ERR = 'حدث خطأ في الخادم، حاول مرة أخرى';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
};

// ---------------- المحلات ----------------
type Tenant = { id: string; code: string; schema_name: string; shop_name: string; status: string; trial_ends_at: string | null; paid_until: string | null };
const CODE_RE = /^[a-z][a-z0-9]{2,29}$/;
const SCHEMA_RE = /^(cakeshop|t_[a-z0-9]{3,30})$/;
const tenantCache = new Map<string, { t: Tenant | null; at: number }>();

async function getTenant(code: string): Promise<Tenant | null> {
  const hit = tenantCache.get(code);
  if (hit && Date.now() - hit.at < 30000) return hit.t;
  const rows = await sql.unsafe('select id, code, schema_name, shop_name, status, trial_ends_at, paid_until from csplatform.tenants where code = $1', [code]);
  const t = (rows[0] as Tenant) || null;
  if (t && !SCHEMA_RE.test(t.schema_name)) throw new Error('bad tenant schema');
  tenantCache.set(code, { t, at: Date.now() });
  return t;
}

// هل اشتراك المحل شغال؟ (تجربة لسه مخلصتش، أو مدفوع لتاريخ لسه مجاش، أو مفعّل من غير تاريخ انتهاء)
function tenantBlock(t: Tenant): string {
  const now = Date.now();
  if (t.status === 'suspended') return 'حساب المحل ده موقوف حالياً.';
  if (t.paid_until && new Date(t.paid_until).getTime() > now) return '';
  if (t.status === 'trial') return t.trial_ends_at && new Date(t.trial_ends_at).getTime() > now ? '' : 'انتهت الفترة التجريبية للمحل.';
  if (t.status === 'active') return t.paid_until ? 'انتهى اشتراك المحل.' : '';
  return 'حساب المحل غير مفعّل.';
}

// قفل المعاملات في كود النظام كان رقم ثابت لكل الموقع؛ هنا بيبقى لكل محل لوحده عشان المحلات متستناش بعض
const lockFix = (text: string) => text.replace(/pg_advisory_xact_lock\((\d+)\)/g, "pg_advisory_xact_lock(hashtextextended(current_schema() || ':$1', 0))");

// اتصال بقاعدة البيانات محصور في خزنة محل واحد
function tenantDb(schema: string, shopName = '') {
  if (!SCHEMA_RE.test(schema)) throw new Error('bad schema');
  // كود المتجر مكتوب فيه اسم الخزنة الأصلية؛ بيتحول لخزنة المحل الحالي
  const fix = schema === 'cakeshop'
    ? lockFix
    : (t: string) => lockFix(t.replace(/\bcakeshop\./g, schema + '.').replace(/'cakeshop'/g, `'${schema}'`));
  // رسايل العميل الجاهزة في كود المتجر مكتوب فيها اسم Cake Shop؛ في المحلات التانية بتتكتب باسم المحل نفسه
  const brand = (text: string, params: unknown[]) => schema === 'cakeshop' || !/mc_shop_customer_notes/.test(text) ? params
    : params.map((v) => typeof v === 'string' ? v.replace(/Cake Shop Dessert Cafe|Cake Shop/g, shopName || 'المحل') : v);
  const db = {
    transaction: (cb: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<unknown>) =>
      sql.begin(async (tx: any) => {
        await tx.unsafe(`set local search_path to ${schema}`);
        return cb((text, params) => tx.unsafe(fix(text), (params || []) as any[]));
      }),
  };
  const shopSql = {
    unsafe: (text: string, params?: unknown[]) => sql.unsafe(fix(text), brand(text, params || []) as any[]),
    begin: (cb: (tx: any) => Promise<unknown>) =>
      sql.begin(async (tx: any) => {
        await tx.unsafe(`set local search_path to ${schema}`);
        return cb({ unsafe: (text: string, params?: unknown[]) => tx.unsafe(fix(text), brand(text, params || []) as any[]) });
      }),
  };
  return { db, shopSql };
}

// ---------------- الصور ----------------
async function storeImage(dataUrl: string, bucket: string, prefix: string, failMsg: string): Promise<string> {
  const m = String(dataUrl || '').match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!m) throw new Error('الملف يجب أن يكون صورة');
  const bytes = Buffer.from(m[3], 'base64');
  if (bytes.length > 3 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 3 ميجابايت');
  const name = `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${m[2]}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': m[1], 'Cache-Control': 'max-age=31536000' },
    body: bytes,
  });
  if (!r.ok) throw new Error(failMsg);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${name}`;
}

// كل خدمات نظام الولاء لمحل واحد (نفس الكود القديم بالظبط، بس على خزنة المحل)
function services(t: Tenant) {
  const { db, shopSql } = tenantDb(t.schema_name, t.shop_name);
  const pre = t.code === DEFAULT_SHOP ? '' : t.code + '-';
  const uploadImage = (d: string) => storeImage(d, 'cs-offers', pre + 'offer', 'تعذر رفع الصورة. ضع رابط صورة يدوياً.');
  const run = (body: unknown) => handle(body, db, { crypto, Buffer, uploadImage });
  const verifyAdmin = async (token: string) => {
    const out: any = await run({ fn: 'adminApi', args: [token, 'me', {}, ''] });
    const res = out && out.result;
    if (!res || !res.ok) return { ok: false, res: res || { ok: false, error: ERR } };
    return { ok: true, permissions: res.data.user.permissions, role: res.data.user.role || '', name: res.data.user.display_name || res.data.user.username || '' };
  };
  const adminApi = async (token: string, action: string, payload: unknown, rid: string) => {
    const out: any = await run({ fn: 'adminApi', args: [token, action, payload, rid] });
    return (out && out.result) || { ok: false, error: ERR };
  };
  const publicApi = async (action: string, payload: unknown) => {
    const out: any = await run({ fn: 'publicApi', args: [action, payload] });
    return (out && out.result) || { ok: false, error: ERR };
  };
  const shop = (body: unknown) => handleShop(body, {
    sql: shopSql, verifyAdmin, adminApi, publicApi,
    upload: (d: string) => storeImage(d, 'cs-products', pre + 'product', 'تعذر رفع الصورة، حاول مرة أخرى'),
  });
  return { run, shop, verifyAdmin, adminApi, db };
}

// ---------------- المنصة: التسجيل + لوحة صاحب المنصة ----------------
const RESERVED = new Set(['pages', 'signup', 'platform', 'admin', 'index', 'server', 'dist', 'api', 'www', 'app', 'shop', 'static', 'assets', 'cakeshop', 'login', 'register', 'table', 'card']);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const T = (s: unknown, n = 200) => String(s ?? '').trim().slice(0, n);

async function settingsMap(): Promise<Record<string, string>> {
  const rows = await sql.unsafe('select key, value from csplatform.settings');
  const o: Record<string, string> = {};
  rows.forEach((r: any) => { o[r.key] = r.value; });
  return o;
}
function hashPw(pw: string, salt: string) { return crypto.pbkdf2Sync(pw, salt, 120000, 32, 'sha256').toString('hex'); }
function safeEq(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }
async function plog(actor: string, action: string, tenantId: string | null, details: unknown) {
  await sql.unsafe('insert into csplatform.log (actor, action, tenant_id, details) values ($1, $2, $3, $4::jsonb)', [actor, action, tenantId, JSON.stringify(details || {})]);
}

async function makeCode(email: string): Promise<string> {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  base = base.replace(/^[0-9]+/, '');
  if (base.length < 3) base = 'shop' + base;
  base = base.slice(0, 20);
  for (let i = 0; i < 50; i++) {
    const code = i === 0 ? base : base + (i < 10 ? i + 1 : Math.floor(Math.random() * 9000) + 1000);
    if (RESERVED.has(code) || !CODE_RE.test(code)) continue;
    const r = await sql.unsafe('select 1 from csplatform.tenants where code = $1', [code]);
    if (!r.length) return code;
  }
  throw new Error('تعذر إنشاء رابط للمحل، جرّب إيميل تاني');
}

// تسجيل محل جديد: إيميل + اسم المحل + كلمة سر → خزنة جديدة + حساب Owner + فترة تجريبية
async function signup(p: any, ip: string) {
  const shopName = T(p.shop_name, 60), email = T(p.email, 200).toLowerCase(), pw = String(p.password || '');
  const ownerName = T(p.owner_name, 60) || shopName, phone = T(p.phone, 20).replace(/[^0-9+]/g, '');
  const site = T(p.site, 300);
  if (shopName.length < 2) throw new Error('اكتب اسم المحل');
  if (!EMAIL_RE.test(email)) throw new Error('الإيميل مش صحيح');
  if (pw.length < 8) throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
  if (!/^https:\/\/[^\s?#]+\/$/.test(site)) throw new Error('رابط الموقع غير صحيح');
  const st = await settingsMap();
  if (st.signup_open !== 'true') throw new Error('التسجيل مقفول حالياً، تواصل معنا');
  const tries = await sql.unsafe("select count(*)::int n from csplatform.signup_attempts where ip = $1 and created_at > now() - interval '1 hour'", [ip]);
  if (tries[0].n >= 5) throw new Error('محاولات كتير، حاول بعد ساعة');
  await sql.unsafe('insert into csplatform.signup_attempts (ip) values ($1)', [ip]);
  const dup = await sql.unsafe('select 1 from csplatform.tenants where lower(owner_email) = $1', [email]);
  if (dup.length) throw new Error('الإيميل ده مسجل بمحل قبل كده. ادخل من رابط محلك');

  const code = await makeCode(email);
  const schema = 't_' + code;
  const trialDays = Math.max(0, Math.min(90, Number(st.trial_days) || 14));
  const price = Number(st.monthly_price) || 0;
  const rows = await sql.begin(async (tx: any) => {
    const r = await tx.unsafe(
      `insert into csplatform.tenants (code, schema_name, shop_name, owner_name, owner_email, owner_phone, status, trial_ends_at, monthly_price, signup_ip)
       values ($1, $2, $3, $4, $5, $6, 'trial', now() + ($7 || ' days')::interval, $8, $9) returning *`,
      [code, schema, shopName, ownerName, email, phone, String(trialDays), price, ip]);
    await tx.unsafe('select csplatform.provision_schema($1)', [schema]);
    return r;
  });
  const t = rows[0] as Tenant;
  try {
    await setupTenant(t, { shopName, ownerName, email, phone, pw, base: site + code });
  } catch (e) {
    // لو حصل أي خطأ: نشيل المحل الجديد بالكامل (لسه متعمل حالاً ومفيهوش بيانات)
    console.error('signup setup failed', e);
    await sql.unsafe(`drop schema if exists ${schema} cascade`);
    await sql.unsafe('delete from csplatform.tenants where id = $1', [t.id]);
    tenantCache.delete(code);
    throw new Error('تعذر تجهيز المحل، حاول مرة أخرى');
  }
  await plog('signup', 'signup', t.id, { code, email, shop: shopName });
  return { code, url: site + code, admin_url: site + code + '?p=admin', username: email, trial_ends_at: t.trial_ends_at };
}

async function setupTenant(t: Tenant, o: { shopName: string; ownerName: string; email: string; phone: string; pw: string; base: string }) {
  const s = services(t);
  // أول طلب بيجهز النظام (الإعدادات الافتراضية + حساب owner بكلمة سر مؤقتة)
  await s.run({ fn: 'page', args: [{}] });
  const logs: any[] = await s.db.transaction((q) => q("select id, message from mc_log where message like '%كلمة المرور المؤقتة%' order by id desc limit 1")) as any[];
  const m = logs[0] && String(logs[0].message).match(/كلمة المرور المؤقتة:\s*(\S+)/);
  if (!m) throw new Error('no temp password');
  const temp = m[1];
  // نغير كلمة السر بنفس طريقة النظام (نفس التشفير)
  const login: any = await s.adminApi('', 'login', { username: 'owner', password: temp }, '');
  if (!login.ok) throw new Error('owner login failed: ' + login.error);
  const tok = login.data.token;
  const ch: any = await s.adminApi(tok, 'changePassword', { current: temp, next: o.pw }, '');
  if (!ch.ok) throw new Error('change password failed: ' + ch.error);
  await s.adminApi(tok, 'logout', {}, '');
  const phoneIntl = o.phone.replace(/^\+/, '').replace(/^0/, '20');
  await s.db.transaction(async (q) => {
    await q('delete from mc_log where id = $1', [logs[0].id]);
    await q("update mc_adminusers set username = $1, display_name = $2, updated_at = now() where username = 'owner'", [o.email, o.ownerName]);
    await q("update mc_employees set name = $1, phone = $2, updated_at = now() where job_title = 'المالك'", [o.ownerName, o.phone]);
    await q("update mc_branches set phone = $1 where branch_id = 'MAIN'", [o.phone]);
    const set = async (k: string, v: string) => q('update mc_settings set value = $2, updated_at = now(), updated_by = $3 where key = $1', [k, v, 'signup']);
    await set('shop_name', o.shopName);
    await set('shop_name_ar', o.shopName);
    await set('program_name', o.shopName);
    await set('shop_phone', o.phone);
    await set('whatsapp_number', phoneIntl);
    await set('shop_address', '');
    await set('logo_url', '');
    await set('public_base_url', o.base);
    await q("update mc_settings set value = replace(replace(replace(value, 'Cake Shop Dessert Cafe', $1), 'كيك شوب ديزرت كافيه', $1), 'Cake Shop', $1) where value like '%Cake Shop%' or value like '%كيك شوب%'", [o.shopName]);
    return null;
  });
}

// لوحة صاحب المنصة
async function platformAuth(token: string) {
  if (!token) throw new Error('سجّل الدخول');
  const r = await sql.unsafe('select username from csplatform.sessions where token = $1 and expires_at > now()', [String(token)]);
  if (!r.length) throw new Error('انتهت الجلسة، سجّل الدخول تاني');
  return r[0].username as string;
}

async function platform(action: string, p: any, ip: string) {
  if (action === 'signup') return signup(p, ip);
  if (action === 'info') {
    const st = await settingsMap();
    return { platform_name: st.platform_name, signup_open: st.signup_open === 'true', trial_days: Number(st.trial_days) || 14 };
  }
  if (action === 'login') {
    const u = T(p.username, 60).toLowerCase();
    const fails = await sql.unsafe("select count(*)::int n from csplatform.log where action = 'login_failed' and details->>'ip' = $1 and created_at > now() - interval '15 minutes'", [ip]);
    if (fails[0].n >= 5) throw new Error('محاولات كتير، حاول بعد ربع ساعة');
    const r = await sql.unsafe('select * from csplatform.admins where username = $1', [u]);
    if (!r.length || !safeEq(hashPw(String(p.password || ''), r[0].salt), r[0].password_hash)) {
      await plog(u, 'login_failed', null, { ip });
      throw new Error('اسم المستخدم أو كلمة السر غلط');
    }
    const token = crypto.randomBytes(32).toString('hex');
    await sql.unsafe("insert into csplatform.sessions (token, username, expires_at) values ($1, $2, now() + interval '12 hours')", [token, u]);
    await sql.unsafe('delete from csplatform.sessions where expires_at < now()');
    await plog(u, 'login', null, { ip });
    return { token, username: u };
  }
  // من هنا كله محتاج دخول صاحب المنصة
  const who = await platformAuth(p.token);
  if (action === 'logout') { await sql.unsafe('delete from csplatform.sessions where token = $1', [String(p.token)]); return {}; }
  if (action === 'changePassword') {
    const nw = String(p.next || '');
    if (nw.length < 10) throw new Error('كلمة السر الجديدة لازم 10 حروف على الأقل');
    const r = await sql.unsafe('select * from csplatform.admins where username = $1', [who]);
    if (!safeEq(hashPw(String(p.current || ''), r[0].salt), r[0].password_hash)) throw new Error('كلمة السر الحالية غلط');
    const salt = crypto.randomBytes(16).toString('hex');
    await sql.unsafe('update csplatform.admins set password_hash = $2, salt = $3 where username = $1', [who, hashPw(nw, salt), salt]);
    await sql.unsafe('delete from csplatform.sessions where username = $1 and token <> $2', [who, String(p.token)]);
    await plog(who, 'change_password', null, {});
    return {};
  }
  if (action === 'list') {
    const tenants = await sql.unsafe(`select t.*, (select coalesce(sum(amount),0) from csplatform.payments where tenant_id = t.id) as total_paid,
      (select count(*) from csplatform.payments where tenant_id = t.id)::int as payments_count from csplatform.tenants t order by t.created_at desc`);
    // أرقام بسيطة عن كل محل (عدد العملاء والطلبات) من غير ما نعرض أي بيانات عملاء
    const out = [];
    for (const t of tenants as any[]) {
      let customers = 0, orders = 0;
      try {
        const c = await sql.unsafe(`select (select count(*) from ${t.schema_name}.mc_customers)::int c, (select count(*) from ${t.schema_name}.mc_shop_orders)::int o`);
        customers = c[0].c; orders = c[0].o;
      } catch { /* ignore */ }
      out.push({ ...t, signup_ip: undefined, customers, orders, blocked: tenantBlock(t) });
    }
    return { tenants: out, settings: await settingsMap(), me: who };
  }
  if (action === 'payments') {
    return { payments: await sql.unsafe('select * from csplatform.payments where tenant_id = $1 order by created_at desc limit 200', [T(p.tenant_id, 40)]) };
  }
  if (action === 'update') {
    const id = T(p.tenant_id, 40);
    const r = await sql.unsafe('select * from csplatform.tenants where id = $1', [id]);
    if (!r.length) throw new Error('المحل مش موجود');
    const t = r[0];
    const status = ['trial', 'active', 'suspended'].includes(p.status) ? p.status : t.status;
    const trial = p.trial_ends_at !== undefined ? (p.trial_ends_at ? new Date(p.trial_ends_at) : null) : t.trial_ends_at;
    const paid = p.paid_until !== undefined ? (p.paid_until ? new Date(p.paid_until) : null) : t.paid_until;
    const price = p.monthly_price !== undefined ? Math.max(0, Number(p.monthly_price) || 0) : t.monthly_price;
    const notes = p.notes !== undefined ? T(p.notes, 2000) : t.notes;
    await sql.unsafe('update csplatform.tenants set status = $2, trial_ends_at = $3, paid_until = $4, monthly_price = $5, notes = $6, updated_at = now() where id = $1',
      [id, status, trial, paid, price, notes]);
    tenantCache.delete(t.code);
    await plog(who, 'update', id, { status, trial_ends_at: trial, paid_until: paid, monthly_price: price });
    return {};
  }
  if (action === 'pay') {
    // تسجيل دفعة يدوية (فودافون كاش / إنستاباي / كاش) → يمد الاشتراك ويفعّل المحل
    const id = T(p.tenant_id, 40);
    const months = Math.max(1, Math.min(36, Math.floor(Number(p.months) || 1)));
    const amount = Math.max(0, Number(p.amount) || 0);
    const method = ['vodafone_cash', 'instapay', 'cash', 'bank', 'other'].includes(p.method) ? p.method : 'other';
    const res = await sql.begin(async (tx: any) => {
      const r = await tx.unsafe('select * from csplatform.tenants where id = $1 for update', [id]);
      if (!r.length) throw new Error('المحل مش موجود');
      const t = r[0];
      const from = t.paid_until && new Date(t.paid_until).getTime() > Date.now() ? new Date(t.paid_until)
        : (t.status === 'trial' && t.trial_ends_at && new Date(t.trial_ends_at).getTime() > Date.now() ? new Date(t.trial_ends_at) : new Date());
      const until = new Date(from); until.setMonth(until.getMonth() + months);
      await tx.unsafe("update csplatform.tenants set status = 'active', paid_until = $2, updated_at = now() where id = $1", [id, until]);
      await tx.unsafe('insert into csplatform.payments (tenant_id, amount, months, method, reference, note, paid_until_after, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, amount, months, method, T(p.reference, 100), T(p.note, 500), until, who]);
      return { code: t.code, paid_until: until };
    });
    tenantCache.delete(res.code);
    await plog(who, 'pay', id, { amount, months, method });
    return res;
  }
  if (action === 'saveSettings') {
    const allowed = ['trial_days', 'monthly_price', 'signup_open', 'platform_name', 'payment_instructions'];
    for (const k of allowed) if (p[k] !== undefined) await sql.unsafe('insert into csplatform.settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [k, T(p[k], 2000)]);
    await plog(who, 'settings', null, {});
    return { settings: await settingsMap() };
  }
  throw new Error('عملية غير معروفة');
}

// حالة اشتراك المحل لصاحب المحل نفسه (بيظهرله في لوحة التحكم)
async function myPlan(t: Tenant, token: string) {
  const s = services(t);
  const u: any = await s.verifyAdmin(token);
  if (!u.ok) return { ok: false, error: (u.res && u.res.error) || 'سجّل الدخول' };
  const r = await sql.unsafe('select status, trial_ends_at, paid_until, monthly_price from csplatform.tenants where id = $1', [t.id]);
  const st = await settingsMap();
  return { ok: true, data: { ...r[0], code: t.code, blocked: tenantBlock(t), payment_instructions: u.role === 'owner' ? st.payment_instructions : '' } };
}

// ---------------- الطلبات ----------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('CAKE SHOP CLUB API', { headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  // نبضة كل دقيقة من قاعدة البيانات عشان السيرفر يفضل صاحي واتصاله بقاعدة البيانات مفتوح
  if (body?.fn === 'ping') { try { await sql`select 1`; } catch { /* ignore */ } return json({ ok: true }); }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
  try {
    const fn = body?.fn;
    if (fn === 'platform') {
      try { return json({ result: { ok: true, data: await platform(String(body.args?.[0] || ''), body.args?.[1] || {}, ip) } }); }
      catch (e) { return json({ result: { ok: false, error: e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : ERR } }); }
    }
    const code = (new URL(req.url).searchParams.get('shop') || DEFAULT_SHOP).toLowerCase();
    const t = CODE_RE.test(code) ? await getTenant(code) : null;
    if (!t) {
      if (fn === 'page') return json({ result: { page: 'Message', boot: { title: 'المحل غير موجود', message: 'الرابط ده مش تابع لأي محل. اتأكد من الرابط.' }, title: 'المحل غير موجود' } });
      return json({ result: { ok: false, error: 'المحل غير موجود' } });
    }
    const blocked = tenantBlock(t);
    if (fn === 'myPlan') return json({ result: await myPlan(t, String(body.args?.[0] || '')) });
    if (blocked) {
      const msg = blocked + ' لو انت صاحب المحل، تواصل مع إدارة المنصة لتجديد الاشتراك.';
      if (fn === 'page') return json({ result: { page: 'Message', boot: { title: t.shop_name, message: msg }, title: t.shop_name } });
      return json({ result: { ok: false, error: msg } });
    }
    const s = services(t);
    if (fn === 'shop' || fn === 'shopAdmin') {
      const out: any = await s.shop(body);
      // صفحة الترابيزة محتاجة اسم المحل واللوجو عشان تظهر بشكل المحل نفسه
      if (fn === 'shop' && body.args?.[0] === 'tableBoot' && out?.result?.ok && out.result.data) {
        const st: any[] = await s.db.transaction((q) => q("select key, value from mc_settings where key in ('shop_name_ar', 'shop_name', 'logo_url')")) as any[];
        const m: Record<string, string> = {}; st.forEach((r) => { m[r.key] = r.value; });
        out.result.data.shop = { name: m.shop_name_ar || m.shop_name || t.shop_name, logo_url: m.logo_url || '' };
      }
      return json(out);
    }
    if (fn === 'publicApi' && String(body?.args?.[0] || '').startsWith('_')) return json({ result: { ok: false, error: 'عملية غير معروفة' } });
    return json(await s.run(body));
  } catch (e) {
    console.error(e);
    return json({ error: ERR }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
