/* Cake Shop — في لوحة التحكم:
 *   • تقرير المبيعات بالأصناف (كل صنف في كل فاتورة) بفلاتر وملخص وترتيب
 *   • لوحة المؤشرات الجديدة (Sales / Products / Orders / Customers)
 *   • Export Data to Excel (XLSX) — لصاحب المحل بس
 *   • Backup & Restore — لصاحب المحل بس
 * البيانات من السيرفر (shopAdmin: itemSales, dashPro, exportData, backupInfo, backupCreate, backupCheck, backupRestore, backupSnapshot). */
(function () {
  var CSS = [
    '.rx-sec{margin:18px 0 8px;display:flex;align-items:center;gap:8px}.rx-sec h2{margin:0;font-size:17px}.rx-sec small{color:var(--muted);font-weight:700}',
    '.rx-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}',
    '.rx-k{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 14px;box-shadow:var(--shadow);text-align:start;font:inherit;color:inherit;position:relative}',
    '.rx-k.go{cursor:pointer}.rx-k.go:hover,.rx-k.go:active{border-color:#1BA8A2}',
    '.rx-k span{display:block;font-size:12.5px;color:var(--muted);font-weight:700}',
    '.rx-k b{display:block;font-family:Inter,sans-serif;font-size:22px;font-weight:800;margin-top:2px;line-height:1.2}',
    '.rx-k small{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}',
    '.rx-k.hero{grid-column:span 2;background:linear-gradient(135deg,#0F766E,#1BA8A2);color:#fff;border:0}.rx-k.hero span,.rx-k.hero small{color:rgba(255,255,255,.85)}.rx-k.hero b{font-size:30px}',
    '.rx-k.hero2{grid-column:span 2;background:linear-gradient(135deg,#9D174D,#D63F86);color:#fff;border:0}.rx-k.hero2 span,.rx-k.hero2 small{color:rgba(255,255,255,.85)}.rx-k.hero2 b{font-size:30px}',
    '@media(max-width:520px){.rx-k.hero,.rx-k.hero2{grid-column:span 2}.rx-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rx-k b{font-size:19px}.rx-k.hero b,.rx-k.hero2 b{font-size:24px}}',
    '.rx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}',
    '.rx-chart{position:relative}.rx-chart svg{display:block;width:100%;height:auto;overflow:visible}',
    '.rx-tip{position:absolute;pointer-events:none;background:#1F0E1C;color:#fff;font-size:12px;padding:6px 9px;border-radius:8px;white-space:nowrap;transform:translate(-50%,-110%);display:none;z-index:2}',
    '.rx-hb{display:flex;flex-direction:column;gap:8px}',
    '.rx-hb button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;align-items:center;background:none;border:0;padding:4px 2px;font:inherit;color:inherit;text-align:start;cursor:pointer;border-radius:8px}',
    '.rx-hb button:hover{background:#F8FAFC}',
    '.rx-hb .n{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rx-hb .v{font-family:Inter,sans-serif;font-size:12.5px;font-weight:800}',
    '.rx-hb .t{grid-column:1/3;height:10px;background:#EEF2F7;border-radius:4px;overflow:hidden}.rx-hb .t i{display:block;height:100%;background:#1BA8A2;border-radius:4px}',
    '.rx-st{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}@media(max-width:620px){.rx-st{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.rx-st .rx-k{border-top:4px solid var(--c)}.rx-st .rx-k b{color:var(--c)}',
    '.rx-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px 10px;margin-top:8px}',
    '.rx-filters label{margin:0 0 2px;font-size:12.5px}',
    '.rx-tbl td,.rx-tbl th{white-space:nowrap}.rx-tbl td.num{font-family:Inter,sans-serif;text-align:end}',
    '.rx-warn{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.7}',
    '.rx-note{background:#FFFBEB;border:1px solid #FCD34D;color:#92400E;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.7}',
    '.rx-okb{background:#F0FDF4;border:1px solid #86EFAC;color:#166534;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.7}',
    '.rx-sets{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px;margin:8px 0}',
    '.rx-sets label{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:0;background:#fff;font-size:13.5px;cursor:pointer}',
    '.rx-big{font-size:16px;padding:14px 18px}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function sh(action, payload) {
    return api('shopAdmin', SESSION, action, payload || {}).catch(function (e) {
      if (e.code === 'SESSION_EXPIRED' || e.message === 'SESSION_EXPIRED') { SESSION = ''; store('mc_admin_sess', null); showLogin('انتهت الجلسة، سجّل الدخول مرة أخرى'); throw new Error('انتهت الجلسة'); }
      throw e;
    });
  }
  function isOwner() { return !!(ME && ME.role === 'owner'); }
  window.mcIsOwner = isOwner;
  function errBox(v, e) { v.innerHTML = '<div class="err">' + esc(e && e.message || e) + '</div>'; }
  function today() { return dayKey(new Date()); }
  function size(n) { n = Number(n) || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }

  /* ================= Excel (XLSX) ================= */
  var xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxP) xlsxP = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'vendor/xlsx-0.18.5.full.min.js';
      s.onload = function () { window.XLSX ? ok(window.XLSX) : no(new Error('تعذر تحميل أداة Excel')); };
      s.onerror = function () { xlsxP = null; no(new Error('تعذر تحميل أداة Excel، تأكد من الإنترنت')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  function sheetName(n, used) {
    var s = String(n || 'Sheet').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31), b = s, i = 2;
    while (used[s]) { s = b.slice(0, 28) + ' ' + i++; }
    used[s] = 1; return s;
  }
  // sheets: [{ name, headers: [..], rows: [[..]] }] — النصوص بتفضل نص (الأكواد وأرقام الفواتير ما بتتغيرش)، والأرقام أرقام
  function writeXlsx(sheets, file) {
    return loadXLSX().then(function (X) {
      var wb = X.utils.book_new(), used = {};
      sheets.forEach(function (sh0) {
        var aoa = [sh0.headers].concat(sh0.rows.map(function (r) { return r.map(function (v) { return v === null || v === undefined ? '' : (typeof v === 'number' || typeof v === 'boolean' ? v : String(v)); }); }));
        var ws = X.utils.aoa_to_sheet(aoa);
        var nc = sh0.headers.length, nr = aoa.length;
        if (nc) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(nr - 1, 0), c: nc - 1 } }) };
        ws['!cols'] = sh0.headers.map(function (h, c) {
          var w = String(h).length;
          for (var r = 1; r < Math.min(nr, 300); r++) { var x = aoa[r][c]; w = Math.max(w, String(x === undefined ? '' : x).length); }
          return { wch: Math.min(Math.max(w + 2, 8), 50) };
        });
        X.utils.book_append_sheet(wb, ws, sheetName(sh0.name, used));
      });
      wb.Workbook = { Views: [{ RTL: true }] };
      X.writeFile(wb, file, { compression: true });
    });
  }
  window.mcWriteXlsx = writeXlsx;
  // زر «تنزيل Excel» في باقي التقارير (dataTable) — XLSX بدل CSV
  window.mcExportTable = function (cols, rows, file) {
    var headers = cols.map(function (c) { return c.l; });
    var data = rows.map(function (row) {
      return cols.map(function (c) {
        var v = row[c.k];
        if (c.date) return v ? fmtDate(v, 'ar', 1) : '';
        if (c.map) return cellVal(c, row);
        if ((c.num || c.money || c.pct) && v !== '' && v !== null && v !== undefined && isFinite(Number(v))) return Number(v);
        return v;
      });
    });
    return writeXlsx([{ name: 'Report', headers: headers, rows: data }], 'cake-shop-' + file + '-' + today() + '.xlsx');
  };

  /* ================= تقرير المبيعات بالأصناف ================= */
  var TYPE_L = { dinein: 'صالة (Dine-in)', delivery: 'توصيل (Delivery)', pickup: 'استلام (Pickup)', store: 'فاتورة يدوية' };
  var STAT_L = { pending: 'قيد المراجعة', approved: 'تم القبول', preparing: 'جاري التجهيز', ready: 'جاهز', shipped: 'خرج للتوصيل', served: 'تم التقديم', completed: 'مكتملة', rejected: 'مرفوض', cancelled: 'ملغي', 'void': 'فاتورة ملغية' };
  var ITEM_COLS = [
    { k: 'invoice_no', l: 'رقم الفاتورة', h: 'Invoice Number' }, { k: 'created_at', l: 'التاريخ', h: 'Invoice Date', date: 1 }, { k: 'customer_name', l: 'العميل', h: 'Customer Name' },
    { k: 'item_code', l: 'كود الصنف', h: 'Item Code' }, { k: 'item_name', l: 'الصنف', h: 'Item Name' }, { k: 'category', l: 'القسم', h: 'Category' },
    { k: 'qty', l: 'الكمية', h: 'Quantity', num: 1 }, { k: 'unit_price', l: 'سعر الوحدة', h: 'Unit Price', num: 1 }, { k: 'total', l: 'الإجمالي', h: 'Total Item Value', num: 1 },
    { k: 'discount', l: 'الخصم', h: 'Discount', num: 1 }, { k: 'net', l: 'الصافي', h: 'Net Amount', num: 1 },
    { k: 'type', l: 'نوع الطلب', h: 'Order Type', map: TYPE_L }, { k: 'status', l: 'الحالة', h: 'Status', map: STAT_L }
  ];
  var IS = { rows: null };
  function itemSummary(rows) {
    var inv = {}, items = {}, g = 0, ds = 0, q = 0;
    rows.forEach(function (r) { inv[r.invoice_no] = 1; if (!r.manual) items[r.product_id || r.item_name] = 1; g += r.total; ds += r.discount; q += r.qty; });
    g = Math.round(g * 100) / 100; ds = Math.round(ds * 100) / 100;
    return { gross: g, invoices: Object.keys(inv).length, qty: q, items: Object.keys(items).length, discount: ds, net: Math.round((g - ds) * 100) / 100 };
  }
  function viewItemSales(v) {
    var o = GO_OPT || {};
    var f = { range: o.range || 'month', from: '', to: '', inv: '', item: o.item || '', code: '', cust: '', cat: '', type: '', status: o.status !== undefined ? o.status : 'completed', sort: 'date_desc', limit: 300 };
    if (o.from || o.to) { f.range = ''; f.from = o.from || ''; f.to = o.to || ''; } else { var x0 = rangeDates(f.range); f.from = x0.from; f.to = x0.to; }
    v.innerHTML = '<div class="card"><h2>🧾 تقرير المبيعات بالأصناف</h2><p class="small muted" style="margin-top:-4px">كل صنف في كل فاتورة في سطر لوحده. الملخص بيتحدث مع الفلاتر.</p>' +
      '<div class="rep-ranges" id="isR">' + REP_RANGES.map(function (x) { return '<button type="button" class="chip" data-r="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="rx-filters">' +
      '<div><label>من (From)</label><input type="date" id="isFrom"></div><div><label>إلى (To)</label><input type="date" id="isTo"></div>' +
      '<div><label>رقم الفاتورة</label><input id="isInv" style="direction:ltr" autocomplete="off"></div>' +
      '<div><label>اسم الصنف</label><input id="isItem" autocomplete="off"></div>' +
      '<div><label>كود الصنف</label><input id="isCode" style="direction:ltr" autocomplete="off"></div>' +
      '<div><label>اسم العميل</label><input id="isCust" autocomplete="off"></div>' +
      '<div><label>القسم (Category)</label><select id="isCat"><option value="">الكل</option></select></div>' +
      '<div><label>نوع الطلب</label><select id="isType"><option value="">الكل</option><option value="dinein">صالة (Dine-in)</option><option value="delivery">توصيل (Delivery)</option><option value="pickup">استلام (Pickup)</option><option value="store">فاتورة يدوية</option></select></div>' +
      '<div><label>حالة الفاتورة</label><select id="isSt"><option value="completed">مكتملة (المبيعات)</option><option value="">الكل</option>' +
        ['pending', 'approved', 'preparing', 'ready', 'shipped', 'served', 'cancelled', 'rejected', 'void'].map(function (k) { return '<option value="' + k + '">' + STAT_L[k] + '</option>'; }).join('') + '</select></div>' +
      '<div><label>ترتيب حسب</label><select id="isSort"><option value="date_desc">التاريخ (الأحدث)</option><option value="date_asc">التاريخ (الأقدم)</option><option value="qty">الكمية (الأكبر)</option><option value="net">قيمة المبيعات (الأكبر)</option><option value="item">الصنف (أ ← ي)</option></select></div>' +
      '</div></div><div id="isSum" style="margin-top:12px"></div><div id="isBox" style="margin-top:12px"></div>';
    var mark = function () { $all('#isR .chip').forEach(function (b) { b.classList.toggle('on', b.dataset.r === f.range); }); $('#isFrom').value = f.from; $('#isTo').value = f.to; };
    $('#isItem').value = f.item; $('#isSt').value = f.status;
    var filtered = function () {
      var low = function (s) { return String(s || '').toLowerCase(); };
      var rows = (IS.rows || []).filter(function (r) {
        if (f.from && r.day < f.from) return false;
        if (f.to && r.day > f.to) return false;
        if (f.inv && low(r.invoice_no).indexOf(low(f.inv)) < 0 && String(r.order_no).indexOf(f.inv) < 0) return false;
        if (f.item && low(r.item_name).indexOf(low(f.item)) < 0) return false;
        if (f.code && low(r.item_code).indexOf(low(f.code)) < 0) return false;
        if (f.cust && low(r.customer_name).indexOf(low(f.cust)) < 0 && String(r.member_no).indexOf(f.cust) < 0) return false;
        if (f.cat && r.category !== f.cat) return false;
        if (f.type && r.type !== f.type) return false;
        if (f.status && r.status !== f.status) return false;
        return true;
      });
      var by = {
        date_desc: function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); },
        date_asc: function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); },
        qty: function (a, b) { return b.qty - a.qty; }, net: function (a, b) { return b.net - a.net; },
        item: function (a, b) { return String(a.item_name).localeCompare(String(b.item_name), 'ar'); }
      }[f.sort];
      return rows.slice().sort(by);
    };
    var cell = function (c, r) {
      var val = r[c.k];
      if (c.date) return val ? d(val, 1) : '—';
      if (c.num) return c.k === 'qty' ? (r.manual ? '—' : fmtNum(val)) : fmtNum(val);
      if (c.map) return esc(c.map[val] || val || '');
      if (c.k === 'customer_name') return esc(val || 'زائر') + (r.member_no ? ' <span class="small muted">' + esc(r.member_no) + '</span>' : '');
      if (c.k === 'item_name') return esc(val) + (r.flavor || r.variant ? ' <span class="small muted">' + esc([r.flavor, r.variant].filter(Boolean).join(' / ')) + '</span>' : '');
      if (c.k === 'invoice_no' || c.k === 'item_code') return '<span style="direction:ltr;display:inline-block">' + esc(val || '—') + '</span>';
      return esc(val || '');
    };
    var render = function () {
      var rows = filtered(), s = itemSummary(rows);
      $('#isSum').innerHTML = '<div class="rx-kpis">' + [
        ['إجمالي المبيعات', money(s.gross)], ['عدد الفواتير', fmtNum(s.invoices)], ['إجمالي الكميات المباعة', fmtNum(s.qty)],
        ['عدد الأصناف المختلفة', fmtNum(s.items)], ['إجمالي الخصومات', money(s.discount)], ['صافي المبيعات', money(s.net)]
      ].map(function (k, i) { return '<div class="rx-k' + (i === 5 ? ' hero' : '') + '"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>';
      var shown = rows.slice(0, f.limit);
      $('#isBox').innerHTML = '<div class="card"><div class="toolbar" style="justify-content:space-between"><span class="small muted">عدد السطور: ' + fmtNum(rows.length) + '</span>' +
        (isOwner() ? '<button class="btn ghost sm" id="isXls" type="button">⬇️ تنزيل Excel</button>' : '') + '</div>' +
        (rows.length ? '<div class="tblwrap"><table class="tbl rx-tbl"><tr>' + ITEM_COLS.map(function (c) { return '<th>' + esc(c.l) + '</th>'; }).join('') + '</tr>' +
          shown.map(function (r) { return '<tr' + (r.customer_id ? ' class="click" data-cid="' + esc(r.customer_id) + '"' : '') + '>' + ITEM_COLS.map(function (c) { return '<td' + (c.num ? ' class="num"' : '') + '>' + cell(c, r) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '<tr class="tot"><td><b>الإجمالي</b></td><td></td><td></td><td></td><td></td><td></td><td class="num"><b>' + fmtNum(s.qty) + '</b></td><td></td><td class="num"><b>' + fmtNum(s.gross) + '</b></td><td class="num"><b>' + fmtNum(s.discount) + '</b></td><td class="num"><b>' + fmtNum(s.net) + '</b></td><td></td><td></td></tr>' +
          '</table></div>' + (rows.length > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="btn ghost sm" id="isMore" type="button">عرض المزيد (' + fmtNum(rows.length - shown.length) + ')</button></div>' : '')
          : '<div class="empty">لا توجد مبيعات بالفلاتر دي</div>') + '</div>';
      $all('#isBox [data-cid]').forEach(function (tr) { tr.onclick = function () { if (can('customers_view')) openCustomer(tr.dataset.cid); }; });
      if ($('#isMore')) $('#isMore').onclick = function () { f.limit += 500; render(); };
      if ($('#isXls')) $('#isXls').onclick = function () {
        var b = this; busy(b, true);
        writeXlsx([{ name: 'Sales Details', headers: ['Invoice Number', 'Invoice Date', 'Customer Name', 'Member No', 'Item Code', 'Item Name', 'Flavor', 'Size', 'Category', 'Quantity', 'Unit Price', 'Total Item Value', 'Discount', 'Net Amount', 'Order Type', 'Status'],
          rows: rows.map(function (r) { return [r.invoice_no, r.created_at ? fmtDate(r.created_at, 'ar', 1) : '', r.customer_name, r.member_no, r.item_code, r.item_name, r.flavor, r.variant, r.category, r.manual ? '' : r.qty, r.unit_price, r.total, r.discount, r.net, TYPE_L[r.type] || r.type, STAT_L[r.status] || r.status]; }) },
          { name: 'Summary', headers: ['البند', 'القيمة'], rows: [['الفترة', (f.from || 'البداية') + ' → ' + (f.to || 'النهارده')], ['إجمالي المبيعات', s.gross], ['عدد الفواتير', s.invoices], ['إجمالي الكميات المباعة', s.qty], ['عدد الأصناف المختلفة', s.items], ['إجمالي الخصومات', s.discount], ['صافي المبيعات', s.net]] }],
          'cake-shop-sales-items-' + today() + '.xlsx').then(function () { toast('تم تنزيل الملف ✓'); }).catch(function (e) { toast(e.message, true); }).then(function () { busy(b, false); });
      };
    };
    var bind = function () {
      $all('#isR .chip').forEach(function (b) { b.onclick = function () { f.range = b.dataset.r; var x = rangeDates(f.range); f.from = x.from; f.to = x.to; f.limit = 300; mark(); render(); }; });
      var onDate = function () { var a = $('#isFrom').value, b = $('#isTo').value; if (a && b && a > b) return toast('تاريخ البداية بعد تاريخ النهاية', true); f.range = ''; f.from = a; f.to = b; f.limit = 300; mark(); render(); };
      $('#isFrom').onchange = onDate; $('#isTo').onchange = onDate;
      var tm; [['isInv', 'inv'], ['isItem', 'item'], ['isCode', 'code'], ['isCust', 'cust']].forEach(function (p) { $('#' + p[0]).addEventListener('input', function () { clearTimeout(tm); var el = this; tm = setTimeout(function () { f[p[1]] = el.value.trim(); f.limit = 300; render(); }, 200); }); });
      [['isCat', 'cat'], ['isType', 'type'], ['isSt', 'status'], ['isSort', 'sort']].forEach(function (p) { $('#' + p[0]).onchange = function () { f[p[1]] = this.value; f.limit = 300; render(); }; });
    };
    mark(); bind(); loading($('#isBox'));
    sh('itemSales').then(function (r) {
      IS.rows = (r.rows || []).map(function (x) { ['qty', 'unit_price', 'total', 'discount', 'net'].forEach(function (k) { x[k] = Number(x[k]) || 0; }); return x; });
      $('#isCat').innerHTML = '<option value="">الكل</option>' + uniq(IS.rows.map(function (x) { return x.category; })).map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
      render();
    }).catch(function (e) { errBox($('#isBox'), e); });
  }
  // تسجيل التقرير في قائمة التقارير (بعد تقرير الفواتير)
  if (window.REPORTS && !REPORTS.some(function (x) { return x.id === 'items'; })) {
    var at = REPORTS.map(function (x) { return x.id; }).indexOf('sales');
    REPORTS.splice(at + 1, 0, { id: 'items', t: 'تقرير المبيعات بالأصناف', ic: '🧁', d: 'كل صنف في كل فاتورة: الكود، الكمية، السعر، الخصم، الصافي. بفلاتر وملخص', perm: 'dashboard', custom: viewItemSales });
  }

  /* ================= لوحة المؤشرات ================= */
  function pageAllowed(pg) { var x = PAGES.filter(function (q) { return q[0] === pg; })[0]; return !!(x && pageOk(x)); }
  function goItems(opt) { var o = { report: 'items', back: ['dashboard', 'لوحة المؤشرات'] }; Object.keys(opt || {}).forEach(function (k) { o[k] = opt[k]; }); go('reports', o); }
  function barChart(days) {
    var W = 420, H = 190, pl = 4, pr = 4, pt = 12, pb = 24, n = days.length;
    var max = Math.max.apply(null, days.map(function (x) { return x.net; }).concat([0]));
    if (!max) return '<div class="empty">لا توجد مبيعات مكتملة في آخر 30 يوم</div>';
    var nice = function (m) { var p = Math.pow(10, Math.floor(Math.log10(m))), s = m / p; return (s <= 1 ? 1 : s <= 2 ? 2 : s <= 5 ? 5 : 10) * p; };
    var top = nice(max), cw = (W - pl - pr) / n, bw = Math.max(cw - 2, 2), ih = H - pt - pb;
    var g = '';
    [0, 0.5, 1].forEach(function (t) { var y = pt + ih - ih * t; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#E5E7EB" stroke-width="1"/>' + (t ? '<text x="' + (W - pr) + '" y="' + (y - 3) + '" font-size="10" fill="#94A3B8" text-anchor="end">' + fmtNum(top * t) + '</text>' : ''); });
    days.forEach(function (x, i) {
      // RTL: أحدث يوم على الشمال
      var xi = W - pr - (i + 1) * cw + 1, h = x.net ? Math.max(ih * x.net / top, 2) : 0, y = pt + ih - h;
      if (h) g += '<path d="M' + xi + ' ' + (pt + ih) + 'V' + (y + 4) + 'q0 -4 4 -4h' + Math.max(bw - 8, 0) + 'q4 0 4 4V' + (pt + ih) + 'Z" fill="#1BA8A2"/>';
      g += '<rect class="hit" data-i="' + i + '" x="' + (xi - 1) + '" y="' + pt + '" width="' + cw + '" height="' + (ih + pb) + '" fill="transparent" style="cursor:pointer"/>';
      if (i === 0 || i === n - 1 || i % 7 === 0) g += '<text x="' + (xi + bw / 2) + '" y="' + (H - 8) + '" font-size="10" fill="#64748B" text-anchor="middle">' + esc(x.day.slice(8, 10) + '/' + x.day.slice(5, 7)) + '</text>';
    });
    return '<div class="rx-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="صافي المبيعات اليومية آخر 30 يوم">' + g + '</svg><div class="rx-tip" id="rxTip"></div></div>';
  }
  function hbars(list, val, fmt, empty) {
    var max = Math.max.apply(null, list.map(val).concat([0]));
    if (!list.length) return '<div class="empty">' + empty + '</div>';
    return '<div class="rx-hb">' + list.map(function (p, i) {
      var w = max ? Math.max(Math.round(val(p) / max * 100), val(p) ? 3 : 0) : 0;
      return '<button type="button" data-pi="' + i + '"><span class="n">' + esc(p.name) + (p.code ? ' <span class="small muted">' + esc(p.code) + '</span>' : '') + '</span><span class="v">' + fmt(val(p)) + '</span><span class="t"><i style="width:' + w + '%"></i></span></button>';
    }).join('') + '</div>';
  }
  function viewDashPro(v) {
    sh('dashPro').then(function (s) {
      var ms = s.month_sales, ts = s.today_sales, canRep = pageAllowed('reports');
      var k = function (cls, label, val, sub, act) { return '<div class="rx-k' + (cls ? ' ' + cls : '') + (act && canRep ? ' go" role="button" tabindex="0" data-act="' + act : '') + '"><span>' + label + '</span><b>' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
      var html = '';
      html += '<div class="rx-sec"><h2>💰 المبيعات (Sales Overview)</h2><small>المبيعات المكتملة</small></div>' +
        '<div class="rx-kpis">' +
        k('hero', 'مبيعات النهارده', money(ts.net), fmtNum(ts.invoices) + ' فاتورة', 'today') +
        k('hero2', 'مبيعات الشهر', money(ms.net), 'من ' + esc(fmtDate(s.month_start + 'T12:00:00', 'ar')), 'month') +
        k('', 'عدد الفواتير (الشهر)', fmtNum(ms.invoices), '', 'month') +
        k('', 'متوسط قيمة الفاتورة', money(ms.avg), 'الشهر ده', 'month') +
        k('', 'صافي المبيعات بعد الخصومات', money(ms.net), 'قبل الخصم ' + money(ms.gross) + ' · خصومات ' + money(ms.discount), 'month') +
        '</div>' +
        '<div class="card" style="margin-top:12px"><h2>صافي المبيعات اليومية — آخر 30 يوم</h2>' + barChart(s.days.slice().reverse()) + '<p class="small muted" style="margin:6px 2px 0">اضغط على أي يوم لفتح تفاصيله</p></div>';
      html += '<div class="rx-sec"><h2>🧁 أداء الأصناف (Products Performance)</h2><small>آخر 30 يوم</small></div><div class="rx-grid">' +
        '<div class="card"><h2>الأكثر مبيعاً بالكمية (Top Selling)</h2>' + hbars(s.top_qty, function (p) { return p.qty; }, fmtNum, 'لا توجد مبيعات بعد') + '</div>' +
        '<div class="card"><h2>الأكثر تحقيقاً للمبيعات</h2>' + hbars(s.top_net, function (p) { return p.net; }, money, 'لا توجد مبيعات بعد') + '</div>' +
        '<div class="card"><h2>الأصناف الأقل حركة</h2>' + hbars(s.slow, function (p) { return p.qty; }, function (n) { return n ? fmtNum(n) + ' قطعة' : 'ما اتباعش'; }, 'لا توجد أصناف') + '</div></div>';
      var canOrders = pageAllowed('shoporders');
      var stt = function (c, label, n, sub) { return '<div class="rx-k' + (canOrders ? ' go" role="button" tabindex="0" data-orders="1' : '') + '" style="--c:' + c + '"><span>' + label + '</span><b>' + fmtNum(n) + '</b><small>' + sub + '</small></div>'; };
      html += '<div class="rx-sec"><h2>📦 الطلبات (Orders Overview)</h2><small>أونلاين + ترابيزات</small></div><div class="rx-st">' +
        stt('#2563EB', '🆕 طلبات جديدة', s.orders['new'], 'مستنية المراجعة') + stt('#D97706', '⏳ قيد التنفيذ', s.orders.progress, 'اتقبلت ولسه ما خلصتش') +
        stt('#16A34A', '✅ مكتملة', s.orders.completed, 'كل الوقت') + stt('#DC2626', '✖️ ملغاة', s.orders.cancelled, 'ملغي أو مرفوض') + '</div>';
      var c = s.customers, canC = pageAllowed('customers'), canL = pageAllowed('ledger');
      html += '<div class="rx-sec"><h2>👥 العملاء (Customers Overview)</h2></div><div class="rx-grid"><div class="rx-kpis" style="align-content:start">' +
        '<div class="rx-k' + (canC ? ' go" role="button" tabindex="0" data-cust="all' : '') + '"><span>عدد العملاء</span><b>' + fmtNum(c.total) + '</b></div>' +
        '<div class="rx-k' + (canC ? ' go" role="button" tabindex="0" data-cust="new' : '') + '"><span>العملاء الجدد</span><b>' + fmtNum(c.new30) + '</b><small>آخر 30 يوم</small></div>' +
        '<div class="rx-k' + (canL ? ' go" role="button" tabindex="0" data-ledger="1' : '') + '" style="grid-column:1/-1"><span>إجمالي نقاط الولاء الممنوحة</span><b>' + fmtNum(c.points_given) + '</b><small>نقاط الشراء والإضافات (بعد إلغاء الفواتير)</small></div></div>' +
        '<div class="card"><h2>أكثر العملاء نشاطاً (آخر 30 يوم)</h2>' + (c.top.length ? '<div class="tblwrap"><table class="tbl"><tr><th>العميل</th><th>فواتير</th><th>المشتريات</th></tr>' +
          c.top.map(function (r) { return '<tr class="click" data-cid="' + esc(r.customer_id) + '"><td>' + esc(r.name) + ' <span class="muted small">' + esc(r.member_no) + '</span></td><td>' + fmtNum(r.count) + '</td><td>' + money(r.total) + '</td></tr>'; }).join('') + '</table></div>' : '<div class="empty">لا توجد مشتريات في آخر 30 يوم</div>') + '</div></div>';
      html += '<div style="margin-top:18px">' + shopQrCard() + '</div>';
      v.innerHTML = html;
      bindShopQr(v);
      var back = ['dashboard', 'لوحة المؤشرات'];
      var act = function (el, fn) { el.onclick = fn; el.onkeydown = function (e) { if (e.key === 'Enter') fn(); }; };
      $all('[data-act]', v).forEach(function (el) { act(el, function () { goItems(el.dataset.act === 'today' ? { range: 'today', label: 'مبيعات النهارده' } : { range: 'month', label: 'مبيعات الشهر' }); }); });
      $all('[data-orders]', v).forEach(function (el) { act(el, function () { go('shoporders', { back: back }); }); });
      $all('[data-cust]', v).forEach(function (el) { act(el, function () { go('customers', { filter: el.dataset.cust, back: back }); }); });
      $all('[data-ledger]', v).forEach(function (el) { act(el, function () { go('ledger', { back: back }); }); });
      $all('[data-cid]', v).forEach(function (tr) { tr.onclick = function () { if (can('customers_view')) openCustomer(tr.dataset.cid); }; });
      var lists = [s.top_qty, s.top_net, s.slow];
      $all('.rx-grid .card', v).slice(0, 3).forEach(function (card, li) {
        $all('[data-pi]', card).forEach(function (b) { b.onclick = function () { if (!canRep) return; var p = lists[li][Number(b.dataset.pi)]; goItems({ from: s.from30, to: s.today, item: p.name, label: p.name }); }; });
      });
      // تفاعل الرسم: tooltip + فتح اليوم
      var days = s.days.slice().reverse(), tip = $('#rxTip', v);
      $all('.rx-chart .hit', v).forEach(function (r) {
        var show = function () {
          var x = days[Number(r.dataset.i)], box = r.ownerSVGElement.getBoundingClientRect(), rb = r.getBoundingClientRect();
          tip.innerHTML = esc(fmtDate(x.day + 'T12:00:00', 'ar')) + '<br><b>' + money(x.net) + '</b> · ' + fmtNum(x.invoices) + ' فاتورة';
          tip.style.left = (rb.left - box.left + rb.width / 2) + 'px'; tip.style.top = '30px'; tip.style.display = 'block';
        };
        r.addEventListener('mouseenter', show); r.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
        r.addEventListener('click', function () { var x = days[Number(r.dataset.i)]; if (canRep) goItems({ from: x.day, to: x.day, label: fmtDate(x.day + 'T12:00:00', 'ar') }); });
      });
    }).catch(function (e) { errBox(v, e); });
  }
  window.viewDashPro = viewDashPro;

  /* ================= Export Data to Excel ================= */
  var SETS = [
    ['invoices', 'الفواتير (Sales & Invoices)', 1], ['sales_details', 'تفاصيل المبيعات بالأصناف', 1], ['orders', 'الطلبات (Orders)', 1],
    ['products', 'المنتجات (Products)'], ['categories', 'الأقسام (Categories)'], ['stock', 'المخزون'], ['stock_moves', 'حركة المخزون', 1],
    ['customers', 'العملاء (Customers)'], ['points', 'حركة نقاط الولاء', 1], ['redemptions', 'المكافآت المستبدلة', 1],
    ['offers', 'العروض (Offers)'], ['promos', 'أكواد الخصم (Discounts)'], ['birthday', 'عروض أعياد الميلاد', 1],
    ['tables', 'الترابيزات (Tables)'], ['sessions', 'جلسات الترابيزات والدفع (Dine-in)', 1], ['table_help', 'نداءات الترابيزات', 1],
    ['tiers', 'المستويات'], ['branches', 'الفروع'], ['employees', 'الموظفين'], ['users', 'مستخدمي الإدارة (بدون كلمات السر)'],
    ['settings', 'الإعدادات'], ['shop_settings', 'إعدادات المتجر'], ['addresses', 'عناوين العملاء'], ['notifications', 'الإشعارات', 1],
    ['customer_notes', 'رسائل العملاء', 1], ['wa_consent', 'موافقات واتساب'], ['wa_log', 'سجل واتساب', 1], ['activity', 'سجل العمليات', 1]
  ];
  var COL_L = {
    invoice_no: 'رقم الفاتورة', invoice_key: 'مفتاح الفاتورة', order_no: 'رقم الطلب', session_no: 'رقم الجلسة', created_at: 'التاريخ', updated_at: 'آخر تعديل',
    customer_id: 'كود العميل', customer_name: 'العميل', customer_phone: 'موبايل العميل', member_no: 'رقم العضوية', name: 'الاسم', phone: 'الموبايل',
    amount: 'القيمة', discount_amount: 'الخصم', net_amount: 'الصافي', category: 'القسم', status: 'الحالة', points: 'النقاط', points_earned: 'نقاط مكتسبة',
    employee_name: 'الموظف', branch_id: 'الفرع', code: 'الكود', price: 'السعر', old_price: 'السعر قبل الخصم', qty: 'الكمية', unit_price: 'سعر الوحدة',
    total: 'الإجمالي', subtotal: 'قبل الخصم', items: 'الأصناف', delivery: 'نوع الطلب', table_name: 'الترابيزة', payment_status: 'حالة الدفع',
    item_name: 'الصنف', item_code: 'كود الصنف', discount: 'الخصم', net: 'الصافي', type: 'النوع', points_balance: 'رصيد النقاط', total_spent: 'إجمالي المشتريات',
    opened_at: 'وقت الفتح', closed_at: 'وقت القفل', title: 'العنوان', description: 'الوصف', active: 'مفعل', reason: 'السبب', balance_after: 'الرصيد بعد'
  };
  function viewExport(v) {
    if (!isOwner()) { v.innerHTML = '<div class="err">الصفحة دي لصاحب المحل بس</div>'; return; }
    v.innerHTML = '<div class="card"><h2>📤 Export Data to Excel</h2><p class="small muted" style="margin-top:-4px">تصدير بيانات النظام لملف Excel (XLSX). كل نوع بيانات في Sheet لوحده، بعناوين واضحة وفلاتر جاهزة. التصدير بيقرا البيانات بس ومش بيغيّر أي حاجة.</p>' +
      '<div class="toolbar"><button type="button" class="chip on" id="exAll">✔️ كل بيانات النظام</button><button type="button" class="chip" id="exNone">إلغاء التحديد</button></div>' +
      '<div class="rx-sets">' + SETS.map(function (s) { return '<label><input type="checkbox" data-set="' + s[0] + '" checked><span>' + esc(s[1]) + '</span></label>'; }).join('') + '</div>' +
      '<div class="row"><div><label>من (اختياري)</label><input type="date" id="exFrom"></div><div><label>إلى (اختياري)</label><input type="date" id="exTo"></div></div>' +
      '<p class="small muted">الفترة بتتطبق على البيانات اللي ليها تاريخ (الفواتير، الطلبات، الحركات…). من غير فترة = كل البيانات.</p>' +
      '<div class="rx-note">ملف Excel للتحليل بس، ومش بديل عن النسخة الاحتياطية الكاملة. للحماية استخدم «Backup & Restore».</div>' +
      '<div style="height:12px"></div><button class="btn rx-big" id="exGo" type="button">📥 Export Data to Excel</button><div id="exMsg" style="margin-top:10px"></div></div>';
    var sync = function () { var all = $all('[data-set]').every(function (c) { return c.checked; }); $('#exAll').classList.toggle('on', all); };
    $('#exAll').onclick = function () { $all('[data-set]').forEach(function (c) { c.checked = true; }); sync(); };
    $('#exNone').onclick = function () { $all('[data-set]').forEach(function (c) { c.checked = false; }); sync(); };
    $all('[data-set]').forEach(function (c) { c.onchange = sync; });
    $('#exGo').onclick = function () {
      var sets = $all('[data-set]').filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.set; });
      var from = $('#exFrom').value, to = $('#exTo').value;
      if (!sets.length) return toast('اختار البيانات اللي عايز تصدّرها', true);
      if (from && to && from > to) return toast('تاريخ البداية بعد تاريخ النهاية', true);
      var b = $('#exGo'); busy(b, true); $('#exMsg').innerHTML = '';
      sh('exportData', { sets: sets, from: from, to: to }).then(function (r) {
        var sheets = r.sheets.map(function (s) {
          if (s.id === 'sales_details') return { name: s.title, headers: ['Invoice Number', 'Invoice Date', 'Customer Name', 'Member No', 'Item Code', 'Item Name', 'Flavor', 'Size', 'Category', 'Quantity', 'Unit Price', 'Total Item Value', 'Discount', 'Net Amount', 'Order Type', 'Status'],
            rows: s.rows.map(function (x) { return [x.invoice_no, x.created_at, x.customer_name, x.member_no, x.item_code, x.item_name, x.flavor, x.variant, x.category, x.manual ? '' : x.qty, x.unit_price, x.total, x.discount, x.net, TYPE_L[x.type] || x.type, STAT_L[x.status] || x.status]; }) };
          return { name: s.title, headers: s.columns.map(function (c) { return COL_L[c] ? COL_L[c] + ' (' + c + ')' : c; }), rows: s.rows.map(function (x) { return s.columns.map(function (c) { return x[c]; }); }) };
        });
        var nm = 'cake-shop-' + (sets.length === SETS.length ? 'all-data' : sets.length === 1 ? sets[0] : 'data') + (from || to ? '-' + (from || 'start') + '_' + (to || 'today') : '') + '-' + today() + '.xlsx';
        return writeXlsx(sheets, nm).then(function () {
          $('#exMsg').innerHTML = '<div class="rx-okb">تم تنزيل الملف ✓ (' + fmtNum(sheets.length) + ' Sheet · ' + fmtNum(sheets.reduce(function (a, s) { return a + s.rows.length; }, 0)) + ' سطر)</div>';
        });
      }).catch(function (e) { $('#exMsg').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }).then(function () { busy(b, false); });
    };
  }
  window.viewExport = viewExport;

  /* ================= Backup & Restore ================= */
  var TBL_AR = {
    mc_customers: 'العملاء', mc_transactions: 'الفواتير', mc_pointsledger: 'حركة النقاط', mc_redemptions: 'المكافآت المستبدلة', mc_offers: 'العروض', mc_settings: 'الإعدادات',
    mc_adminusers: 'مستخدمي الإدارة', mc_employees: 'الموظفين', mc_whatsappconsent: 'موافقات واتساب', mc_whatsapplog: 'سجل واتساب', mc_activitylogs: 'سجل العمليات',
    mc_tiers: 'المستويات', mc_branches: 'الفروع', mc_birthdayrewards: 'عروض أعياد الميلاد', mc_props: 'بيانات النظام', mc_log: 'سجل الأخطاء',
    mc_shop_categories: 'الأقسام', mc_shop_products: 'المنتجات', mc_shop_orders: 'الطلبات', mc_shop_promos: 'أكواد الخصم', mc_shop_settings: 'إعدادات المتجر',
    mc_shop_addresses: 'عناوين العملاء', mc_shop_stock: 'المخزون', mc_shop_stock_moves: 'حركة المخزون', mc_shop_notifications: 'الإشعارات',
    mc_shop_customer_notes: 'رسائل العملاء', mc_shop_tables: 'الترابيزات', mc_shop_table_sessions: 'جلسات الترابيزات', mc_shop_table_help: 'نداءات الترابيزات', mc_backups: 'سجل نسخ قديم'
  };
  var KIND_AR = { manual: '💾 نسخة يدوية', pre_restore: '🛟 نسخة تلقائية قبل الاسترجاع', restore: '♻️ استرجاع' };
  function download(text, name) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function viewBackup(v) {
    if (!isOwner()) { v.innerHTML = '<div class="err">الصفحة دي لصاحب المحل بس</div>'; return; }
    v.innerHTML = '<div class="card"><h2>🛡️ Backup &amp; Restore</h2><p class="small muted" style="margin-top:-4px">نسخة احتياطية كاملة لكل بيانات النظام: العملاء، المنتجات والأقسام، الطلبات، الفواتير، النقاط، العروض وأكواد الخصم، الإعدادات، الترابيزات والمخزون.</p>' +
      '<div class="rx-kpis" id="bkInfo"><div class="rx-k"><span>آخر نسخة احتياطية</span><b>…</b></div></div>' +
      '<div style="height:12px"></div><button class="btn rx-big" id="bkGo" type="button">💾 Create Full Backup</button>' +
      '<p class="small muted" style="margin-top:8px">الملف بيتنزل على جهازك (JSON) وفيه كود تحقق بيكشف لو الملف اتعدّل أو اتلف. اعمل نسخة قبل أي تحديث كبير. احتفظ بالملف في مكان آمن لأن فيه بيانات العملاء.</p><div id="bkMsg"></div></div>' +
      '<div class="card" style="margin-top:12px"><h2>♻️ Restore — استرجاع نسخة</h2>' +
      '<div class="rx-warn">⚠️ الاسترجاع بيستبدل كل البيانات الحالية ببيانات النسخة. مفيش استرجاع تلقائي أبداً: لازم تختار الملف، تراجع محتوياته، وتأكد مرتين. وقبل التنفيذ النظام بيحفظ نسخة من البيانات الحالية تقدر تنزلها من السجل تحت.</div>' +
      '<label style="margin-top:10px">اختار ملف النسخة الاحتياطية</label><input type="file" id="rsFile" accept=".json,application/json"><div id="rsBox" style="margin-top:10px"></div></div>' +
      '<div class="card" style="margin-top:12px"><h2>📜 سجل النسخ الاحتياطية</h2><div id="bkHist"></div></div>';
    var loadInfo = function () {
      sh('backupInfo').then(function (r) {
        var last = r.history.filter(function (h) { return h.kind === 'manual'; })[0];
        $('#bkInfo').innerHTML = '<div class="rx-k hero"><span>آخر نسخة احتياطية</span><b>' + (last ? d(last.created_at, 1) : 'لسه مفيش') + '</b>' + (last ? '<small>بواسطة ' + esc(last.created_by) + '</small>' : '') + '</div>' +
          '<div class="rx-k"><span>حجم آخر نسخة</span><b>' + (last ? size(last.size_bytes) : '—') + '</b>' + (last ? '<small>' + fmtNum(last.rows) + ' سجل</small>' : '') + '</div>';
        $('#bkHist').innerHTML = r.history.length ? '<div class="tblwrap"><table class="tbl"><tr><th>التاريخ</th><th>النوع</th><th>بواسطة</th><th>الحجم</th><th>السجلات</th><th></th></tr>' + r.history.map(function (h) {
          return '<tr><td>' + d(h.created_at, 1) + '</td><td>' + esc(KIND_AR[h.kind] || h.kind) + (h.note && h.kind === 'restore' ? '<div class="small muted">' + esc(h.note) + '</div>' : '') + '</td><td>' + esc(h.created_by) + '</td><td>' + size(h.size_bytes) + '</td><td>' + fmtNum(h.rows) + '</td><td>' +
            (h.has_snapshot ? '<button class="btn ghost sm" type="button" data-snap="' + h.id + '">⬇️ تنزيل</button>' : '') + '</td></tr>';
        }).join('') + '</table></div><p class="small muted">النسخ اليدوية بتتنزل على جهازك وقت إنشائها. نسخ «قبل الاسترجاع» محفوظة جوه النظام (آخر 5) وتقدر تنزلها من هنا.</p>' : '<div class="empty">لسه مفيش نسخ</div>';
        $all('[data-snap]').forEach(function (b) { b.onclick = function () { busy(b, true); sh('backupSnapshot', { id: Number(b.dataset.snap) }).then(function (x) { download(x.file, x.name); toast('تم تنزيل النسخة ✓'); }).catch(function (e) { toast(e.message, true); }).then(function () { busy(b, false); }); }; });
      }).catch(function (e) { errBox($('#bkHist'), e); });
    };
    $('#bkGo').onclick = function () {
      var b = $('#bkGo'); busy(b, true); $('#bkMsg').innerHTML = '';
      sh('backupCreate').then(function (r) {
        download(r.file, r.name);
        $('#bkMsg').innerHTML = '<div class="rx-okb">تم إنشاء النسخة وتنزيلها ✓<br>' + esc(r.name) + ' · ' + size(new Blob([r.file]).size) + '</div>';
        loadInfo();
      }).catch(function (e) { $('#bkMsg').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }).then(function () { busy(b, false); });
    };
    var FILE = '';
    $('#rsFile').onchange = function () {
      var fl = this.files && this.files[0], box = $('#rsBox'); FILE = '';
      if (!fl) { box.innerHTML = ''; return; }
      if (fl.size > 60 * 1024 * 1024) { box.innerHTML = '<div class="err">الملف كبير جداً</div>'; return; }
      loading(box);
      var rd = new FileReader();
      rd.onerror = function () { box.innerHTML = '<div class="err">تعذر قراءة الملف</div>'; };
      rd.onload = function () {
        var text = String(rd.result || '');
        sh('backupCheck', { file: text }).then(function (r) {
          var tabs = (r.tables || []).filter(function (t) { return t.table !== 'mc_backups'; });
          var fileRows = tabs.reduce(function (a, t) { return a + Number(t.file); }, 0), curRows = tabs.reduce(function (a, t) { return a + Number(t.current); }, 0);
          var html = '<div class="' + (r.ok ? 'rx-okb' : 'err') + '">' + (r.ok ? '✅ الملف سليم وكود التحقق مطابق، واتجرّب الاسترجاع بيه بنجاح (التجربة اترجعت ومفيش حاجة اتغيرت).' : '❌ الملف مينفعش يتسترجع: ' + esc(r.error)) + '</div>' +
            '<div class="rx-kpis" style="margin-top:10px"><div class="rx-k"><span>تاريخ النسخة</span><b style="font-size:16px">' + d(r.created_at, 1) + '</b><small>بواسطة ' + esc(r.created_by || '—') + '</small></div>' +
            '<div class="rx-k"><span>حجم الملف</span><b>' + size(r.size_bytes) + '</b></div><div class="rx-k"><span>سجلات في الملف</span><b>' + fmtNum(fileRows) + '</b><small>الحالي: ' + fmtNum(curRows) + '</small></div></div>' +
            '<h3 style="margin:14px 0 6px">محتويات النسخة</h3><div class="tblwrap"><table class="tbl"><tr><th>البيانات</th><th>في الملف</th><th>الموجود دلوقتي</th></tr>' +
            tabs.map(function (t) { return '<tr><td>' + esc(TBL_AR[t.table] || t.table) + '</td><td>' + fmtNum(t.file) + '</td><td>' + fmtNum(t.current) + (Number(t.current) > Number(t.file) ? ' <span class="badge red">هيقل</span>' : '') + '</td></tr>'; }).join('') + '</table></div>' +
            ((r.not_in_file || []).length ? '<div class="rx-note" style="margin-top:8px">بيانات مش موجودة في الملف (هتفضل زي ما هي): ' + r.not_in_file.map(function (x) { return esc(TBL_AR[x] || x); }).join('، ') + '</div>' : '') +
            ((r.unknown_tables || []).length ? '<div class="rx-note" style="margin-top:8px">بيانات في الملف مش موجودة في النظام الحالي (هتتجاهل): ' + r.unknown_tables.map(esc).join('، ') + '</div>' : '');
          if (r.ok) {
            FILE = text;
            html += '<div class="rx-warn" style="margin-top:12px">⚠️ تحذير: الاسترجاع هيمسح البيانات الحالية ويحط مكانها بيانات النسخة اللي بتاريخ ' + d(r.created_at, 1) + '. أي بيانات اتسجلت بعد التاريخ ده هتختفي (بس هتتحفظ في نسخة تلقائية قبل الاسترجاع).</div>' +
              '<label class="check" style="margin-top:10px"><input type="checkbox" id="rsAck"><span>فاهم إن البيانات الحالية هتتستبدل</span></label>' +
              '<label>للتأكيد اكتب كلمة: <b>استرجاع</b></label><input id="rsWord" autocomplete="off">' +
              '<div style="height:10px"></div><button class="btn" id="rsGo" type="button" disabled style="background:#B91C1C;color:#fff">♻️ استرجاع النسخة</button><div id="rsMsg" style="margin-top:10px"></div>';
          }
          box.innerHTML = html;
          if (!r.ok) return;
          var chk = function () { $('#rsGo').disabled = !($('#rsAck').checked && $('#rsWord').value.trim() === 'استرجاع'); };
          $('#rsAck').onchange = chk; $('#rsWord').oninput = chk;
          $('#rsGo').onclick = function () {
            var body = modal('تأكيد أخير', '<p>هتسترجع النسخة اللي بتاريخ <b>' + d(r.created_at, 1) + '</b> وتستبدل كل البيانات الحالية. متأكد؟</p><div class="toolbar"><button class="btn" id="rsYes" type="button" style="background:#B91C1C;color:#fff">أيوه، استرجع</button><button class="btn ghost" id="rsNo" type="button">لأ، رجوع</button></div>');
            $('#rsNo').onclick = closeModal;
            $('#rsYes').onclick = function () {
              closeModal();
              var b = $('#rsGo'); busy(b, true);
              window.__mcTimeout = 180000;
              sh('backupRestore', { file: FILE, confirm: $('#rsWord').value.trim() }).then(function () {
                FILE = ''; $('#rsFile').value = '';
                box.innerHTML = '<div class="rx-okb">✅ تم استرجاع النسخة بنجاح. البيانات الحالية اللي كانت قبل الاسترجاع محفوظة في السجل تحت.</div>';
                toast('تم الاسترجاع ✓'); loadInfo();
              }).catch(function (e) { $('#rsMsg').innerHTML = '<div class="err">' + esc(e.message) + '<br>البيانات الحالية ما اتغيرتش.</div>'; busy(b, false); })
                .then(function () { window.__mcTimeout = 0; });
            };
          };
        }).catch(function (e) { box.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
      };
      rd.readAsText(fl);
    };
    loadInfo();
  }
  window.viewBackup = viewBackup;
})();
