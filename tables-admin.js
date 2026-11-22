/* Cake Shop — نظام الترابيزات في لوحة التحكم:
 *   «الترابيزات» (Tables Management + داشبورد الترابيزات) و«طلبات الترابيزات» (Dine-in Orders).
 *   كل البيانات من السيرفر (shopAdmin: tables, tableSession, tableOrders, ...). بتتحدث كل 15 ثانية وانت فاتح الصفحة. */
(function () {
  var CSS = [
    '.tb-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px}',
    '.tb-kpis div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px}.tb-kpis small{display:block;color:#937189;font-size:12px;font-weight:700}.tb-kpis b{font-size:20px}',
    '.tb-kpis .hot{border-color:#DC2626;background:#FEF2F2}',
    '.tb-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12.5px;margin:0 0 10px}',
    '.tb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}',
    '.tb-t{border:2px solid var(--line);background:#fff;border-radius:16px;padding:12px;text-align:start;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:3px}',
    '.tb-t b{font-size:17px}.tb-t small{color:#6B4F63;font-size:12px}',
    '.tb-t.available{border-color:#16A34A}.tb-t.occupied{border-color:#F97316;background:#FFF7ED}.tb-t.pending{border-color:#2563EB;background:#EFF6FF}.tb-t.attention{border-color:#DC2626;background:#FEF2F2}.tb-t.disabled{opacity:.5}',
    '.tb-st{font-weight:800;font-size:12.5px}',
    '.tb-row{display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fff}',
    '.tb-o{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fff}',
    '.tb-o .h{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
    '.tb-o .it{font-size:13px;color:#4B3A46}',
    '.tb-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.tb-sum div{display:flex;justify-content:space-between;padding:3px 0}.tb-sum .fin{font-weight:800;font-size:16px;border-top:1px solid var(--line);margin-top:4px;padding-top:6px}',
    '.ost.served{background:#CCFBF1;color:#0F766E}',
    '.tb-help{background:#FEF2F2;border:1px solid #FCA5A5;border-radius:12px;padding:8px 10px;margin-bottom:8px;display:flex;gap:8px;align-items:center;justify-content:space-between}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  var ST = { pending: 'New Order – جديد', approved: 'Confirmed – تم التأكيد', preparing: 'Preparing – جاري التجهيز', ready: 'Ready – جاهز', served: 'Served – تم التقديم', completed: 'Completed – مكتمل', cancelled: 'Cancelled – ملغي' };
  var TST = { available: ['🟢', 'Available – متاحة'], occupied: ['🟠', 'Occupied – عليها عميل'], pending: ['🔵', 'Order Pending – طلب مستني التأكيد'], attention: ['🔴', 'Needs Attention – محتاجة متابعة'], disabled: ['⚪', 'معطّلة'] };
  var DATA = null, TIMER = 0, OPEN = null, OF = { st: '', q: '' }, ORDERS = [];

  function sh(action, payload) {
    return api('shopAdmin', SESSION, action, payload || {}).catch(function (e) {
      if (e.code === 'SESSION_EXPIRED' || e.message === 'SESSION_EXPIRED') { SESSION = ''; store('mc_admin_sess', null); showLogin('انتهت الجلسة، سجّل الدخول مرة أخرى'); throw new Error('انتهت الجلسة'); }
      throw e;
    });
  }
  function odt(iso) { var x = new Date(iso); return isNaN(x) ? '' : x.toLocaleString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function stB(s) { return '<span class="ost ' + esc(s) + '">' + esc(ST[s] || s) + '</span>'; }
  function tableUrl(t) { return shopUrl() + '?tb=' + t.qr_key; }
  function live(fn) { clearInterval(TIMER); TIMER = setInterval(function () { if (document.hidden) return; if (CUR !== 'tables' && CUR !== 'tableorders') { clearInterval(TIMER); return; } fn(); }, 15000); }
  function itemsTxt(o) { return (o.items || []).map(function (i) { return esc(i.name) + (i.color ? ' (' + esc(i.color) + ')' : '') + (i.variant ? ' – ' + esc(i.variant) : '') + ' × ' + i.qty; }).join('، '); }

  /* ---------- الترابيزات + الداشبورد ---------- */
  window.viewTables = function (v) {
    sh('tables').then(function (d) { DATA = d; drawTables(v); live(function () { sh('tables').then(function (x) { DATA = x; if (CUR !== 'tables') return; if (!$('#mdl')) drawTables(v); else if (OPEN && $('#tbBox') && !document.activeElement.matches('input,select') && !(window.SCAN && SCAN.stream)) { OPEN = DATA.tables.filter(function (t) { return t.id === OPEN.id; })[0] || OPEN; loadTable(); } }); }); })
      .catch(function (e) { v.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
  };
  function drawTables(v) {
    var k = DATA.kpi, o = k.orders || {};
    var tiles = [['إجمالي الترابيزات', k.total], ['Available – متاحة', k.available], ['Occupied – مشغولة', k.occupied], ['طلبات داخل المحل', o.total],
      ['طلبات جديدة', o['new'], o['new'] > 0], ['قيد التحضير', o.preparing], ['جاهزة', o.ready], ['مبيعات Dine-in النهارده', money(k.sales_today)], ['إجمالي مبيعات Dine-in', money(k.sales_total)], ['محتاجة تدخل موظف', k.attention, k.attention > 0]];
    v.innerHTML = '<div class="card" style="margin-bottom:12px"><div class="row" style="align-items:center;margin-bottom:10px"><h2 style="flex:1;margin:0">🍽️ داشبورد الترابيزات</h2>' +
      '<button class="btn ghost sm" id="tbOrders" type="button" style="flex:0 0 auto">🧾 طلبات الترابيزات</button>' + (can('settings') ? '<button class="btn sm" id="tbAdd" type="button" style="flex:0 0 auto">+ ترابيزة جديدة</button>' : '') + '</div>' +
      '<div class="tb-kpis">' + tiles.map(function (t) { return '<div' + (t[2] ? ' class="hot"' : '') + '><small>' + esc(t[0]) + '</small><b>' + (typeof t[1] === 'number' ? fmtNum(t[1]) : t[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="tb-legend">' + ['available', 'occupied', 'pending', 'attention'].map(function (s) { return '<span>' + TST[s][0] + ' ' + TST[s][1] + '</span>'; }).join('') + '</div>' +
      (DATA.tables.length ? '<div class="tb-grid">' + DATA.tables.map(function (t, i) {
        var s = t.session, x = TST[t.status];
        return '<button type="button" class="tb-t ' + t.status + '" data-t="' + i + '"><b>' + esc(t.name) + '</b><span class="tb-st">' + x[0] + ' ' + esc(x[1]) + '</span>' +
          '<small>🪑 ' + t.seats + ' مقاعد</small>' +
          (s ? '<small>🧾 ' + s.orders + ' طلب · ' + money(s.total) + '</small>' + (s.customer_name ? '<small>💳 ' + esc(s.customer_name) + '</small>' : '') : '') +
          (t.help.length ? '<small style="color:#B91C1C;font-weight:800">🙋 ' + t.help.map(function (h) { return esc(h.label); }).join('، ') + '</small>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="empty">لسه مفيش ترابيزات. ' + (can('settings') ? 'اضغط «+ ترابيزة جديدة».' : '') + '</div>') + '</div>' +
      (can('settings') ? '<div class="card"><h2>⚙️ إدارة الترابيزات (Tables Management)</h2>' + (DATA.tables.map(function (t, i) {
        return '<div class="tb-row"><div><b>' + esc(t.name) + '</b> <span class="small muted">· ' + t.seats + ' مقاعد</span> ' + (t.active ? badge('مفعّلة', 'green') : badge('معطّلة', 'gray')) + '</div>' +
          '<div class="toolbar"><button class="btn ghost sm" type="button" data-qr="' + i + '">🔳 QR</button><button class="btn ghost sm" type="button" data-ed="' + i + '">تعديل</button></div></div>';
      }).join('') || '<div class="empty">مفيش ترابيزات</div>') + '<button class="btn ghost sm" type="button" id="tbHist" style="margin-top:6px">📜 سجل الترابيزات اللي اتقفلت</button></div>'
        : '<div class="card"><button class="btn ghost sm" type="button" id="tbHist">📜 سجل الترابيزات اللي اتقفلت</button></div>');
    $('#tbOrders').onclick = function () { go('tableorders'); };
    if ($('#tbAdd')) $('#tbAdd').onclick = function () { tableForm(null); };
    $('#tbHist').onclick = historyModal;
    $all('[data-t]', v).forEach(function (b) { b.onclick = function () { openTable(DATA.tables[+b.dataset.t]); }; });
    $all('[data-ed]', v).forEach(function (b) { b.onclick = function () { tableForm(DATA.tables[+b.dataset.ed]); }; });
    $all('[data-qr]', v).forEach(function (b) { b.onclick = function () { qrModal(DATA.tables[+b.dataset.qr]); }; });
  }
  function reloadTables() { return sh('tables').then(function (d) { DATA = d; if (CUR === 'tables') drawTables($('#viewIn')); }); }

  function tableForm(t) {
    var isNew = !t; t = t || { name: '', seats: 4, active: true };
    var body = modal(isNew ? 'ترابيزة جديدة' : 'تعديل الترابيزة',
      '<label>رقم أو اسم الترابيزة *</label><input id="tfName" value="' + esc(t.name) + '" maxlength="40" placeholder="مثلاً: ترابيزة 1">' +
      '<label>عدد المقاعد *</label><input id="tfSeats" type="number" min="1" max="100" inputmode="numeric" value="' + esc(t.seats) + '">' +
      '<label class="check"><input type="checkbox" id="tfAct"' + (t.active ? ' checked' : '') + '><span>مفعّلة (العملاء يقدروا يطلبوا منها)</span></label>' +
      '<div id="tfErr"></div><div class="row" style="margin-top:10px"><button class="btn" id="tfSave" type="button">حفظ</button>' +
      (isNew ? '' : '<button class="btn ghost" id="tfDel" type="button" style="flex:0 0 auto;color:#DC2626">حذف</button>') + '</div>');
    $('#tfSave').onclick = function () {
      var btn = this; busy(btn, true);
      sh('saveTable', { id: t.id || '', name: $('#tfName').value, seats: $('#tfSeats').value, active: $('#tfAct').checked })
        .then(function () { closeModal(); toast('تم الحفظ ✓'); return reloadTables(); })
        .catch(function (e) { busy(btn, false); $('#tfErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    };
    if (!isNew) $('#tfDel').onclick = function () {
      var btn = this; if (btn.dataset.ok !== '1') { btn.dataset.ok = '1'; btn.textContent = 'اضغط تاني للتأكيد'; return; }
      busy(btn, true);
      sh('deleteTable', { id: t.id }).then(function () { closeModal(); toast('تم حذف الترابيزة'); return reloadTables(); })
        .catch(function (e) { busy(btn, false); $('#tfErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    };
  }

  function qrCanvas(t) { return mcQRPng(tableUrl(t), { size: 900, title: t.name, sub: 'امسح الكود واطلب من الترابيزة' }); }
  function qrModal(t) {
    var url = tableUrl(t);
    var body = modal('🔳 QR ' + esc(t.name), '<div class="qr-big">' + (window.mcQRSvg ? mcQRSvg(url) : '') + '</div>' +
      '<p class="small muted" style="text-align:center;direction:ltr;word-break:break-all;margin:10px 0">' + esc(url) + '</p>' +
      '<div class="sqr-acts"><button class="btn sm" type="button" id="qDl">⬇️ تحميل</button><button class="btn ghost sm" type="button" id="qPr">🖨️ طباعة</button><button class="btn ghost sm" type="button" id="qCp">📋 نسخ الرابط</button></div>');
    $('#qDl').onclick = function () {
      var a = document.createElement('a'); a.href = qrCanvas(t).toDataURL('image/png'); a.download = 'table-' + t.name.replace(/[^\w؀-ۿ-]+/g, '-') + '-qr.png';
      document.body.appendChild(a); a.click(); a.remove(); toast('تم تحميل QR الترابيزة ✓');
    };
    $('#qPr').onclick = function () {
      var w = window.open('', '_blank'); if (!w) return toast('اسمح بفتح النوافذ علشان تطبع', true);
      w.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>QR ' + esc(t.name) + '</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}img{width:80vmin;max-width:520px}</style></head><body><img src="' + qrCanvas(t).toDataURL('image/png') + '" onload="setTimeout(function(){print()},200)"></body></html>');
      w.document.close();
    };
    $('#qCp').onclick = function () { copyText(url).then(function () { toast('تم نسخ الرابط'); }); };
  }

  /* ---------- تفاصيل الترابيزة: الطلبات، المساعدة، العميل، الحساب ---------- */
  function openTable(t) {
    OPEN = t;
    var body = modal('🍽️ ' + esc(t.name), '<div id="tbBox"><div class="empty"><span class="spinner"></span></div></div>', true);
    loadTable();
  }
  function loadTable() {
    var t = OPEN; if (!t) return;
    var help = t.help || [];
    sh('tableSession', { table_id: t.id }).then(function (d) { drawTable(t, d, help); }).catch(function (e) { $('#tbBox').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
  }
  function helpHtml(list) {
    return (list || []).filter(function (h) { return !h.status || h.status === 'open'; }).map(function (h) {
      return '<div class="tb-help"><span>🙋 <b>' + esc(h.label) + '</b> · ' + esc(odt(h.created_at)) + '</span><button class="btn sm" type="button" data-hd="' + h.id + '" style="flex:0 0 auto">✓ تم</button></div>';
    }).join('');
  }
  function orderCard(o, withTable) {
    return '<div class="tb-o"><div class="h"><b>#' + o.order_no + (withTable ? ' · 🍽️ ' + esc(o.table_name) : '') + '</b>' + stB(o.status) + '</div>' +
      '<div class="small muted">' + esc(odt(o.created_at)) + ' · Order Type: Dine-in / Table Order' + (o.customer_name ? ' · 💳 ' + esc(o.customer_name) : '') + '</div>' +
      '<div class="it">' + itemsTxt(o) + '</div>' +
      (o.notes ? '<div class="small">📝 ' + esc(o.notes) + '</div>' : '') +
      '<div class="small">' + (o.product_discount > 0 ? 'خصم العروض − ' + money(o.product_discount) + ' · ' : '') + (o.birthday_discount > 0 ? '🎂 خصم عيد الميلاد − ' + money(o.birthday_discount) + ' · ' : '') + 'الإجمالي <b>' + money(o.total) + '</b></div>' +
      ((o.next || []).length ? '<div class="tb-acts">' + o.next.map(function (s) { return '<button class="btn ' + (s === 'cancelled' ? 'ghost' : '') + ' sm" type="button" data-os="' + o.id + '|' + s + '"' + (s === 'cancelled' ? ' style="color:#DC2626"' : '') + '>' + esc(ST[s].split(' – ')[1] || ST[s]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function bindStatus(root, after) {
    $all('[data-os]', root).forEach(function (b) {
      b.onclick = function () {
        var x = b.dataset.os.split('|'), reason = '';
        if (x[1] === 'cancelled') { reason = prompt('سبب الإلغاء؟') || ''; if (!reason.trim()) return; }
        busy(b, true);
        sh('setOrderStatus', { id: x[0], status: x[1], reason: reason }).then(function () { toast('تم تحديث الحالة ✓'); after(); }).catch(function (e) { busy(b, false); toast(e.message, true); });
      };
    });
    $all('[data-hd]', root).forEach(function (b) {
      b.onclick = function () { busy(b, true); sh('tableHelpDone', { id: +b.dataset.hd }).then(function () { toast('تم ✓'); after(); }).catch(function (e) { busy(b, false); toast(e.message, true); }); };
    });
  }
  function drawTable(t, d, help) {
    var box = $('#tbBox'); if (!box) return;
    var s = d.session;
    if (!s) {
      box.innerHTML = helpHtml(help) + '<div class="empty">🟢 الترابيزة متاحة، ومفيش جلسة مفتوحة عليها دلوقتي.</div>';
      bindStatus(box, function () { reloadTables().then(function () { OPEN = DATA.tables.filter(function (x) { return x.id === t.id; })[0] || t; loadTable(); }); });
      return;
    }
    var tt = d.totals || {};
    box.innerHTML = helpHtml(d.help) +
      '<div class="small muted" style="margin-bottom:8px">جلسة #' + s.session_no + ' · اتفتحت ' + esc(odt(s.opened_at)) + '</div>' +
      '<div class="card" style="margin-bottom:10px"><b>💳 العميل:</b> ' + (s.customer_id ? esc(s.customer_name) + ' <span class="small muted">(' + esc(s.member_no) + ' · ' + esc(s.customer_phone) + ')</span>'
        : '<span class="muted">مش مربوط بكارت</span><div class="row" style="margin-top:8px"><input id="tbQ" placeholder="رقم الموبايل أو رقم العضوية أو رابط الكارت"><button class="btn ghost sm" id="tbScan" type="button" style="flex:0 0 auto">📷 مسح QR الكارت</button><button class="btn sm" id="tbLink" type="button" style="flex:0 0 auto">ربط</button></div><div id="tbScanBox"></div><div id="tbLErr"></div>') + '</div>' +
      '<h3 style="margin:6px 0">🧾 طلبات الترابيزة (' + d.orders.length + ')</h3>' + (d.orders.map(function (o) { return orderCard(o, false); }).join('') || '<div class="empty">لسه مفيش طلبات</div>') +
      '<div class="card tb-sum" style="margin-top:10px"><h3 style="margin:0 0 6px">💰 الحساب</h3>' +
        '<div><span>إجمالي المنتجات</span><span>' + money(tt.subtotal) + '</span></div>' +
        '<div><span>الخصومات والعروض</span><span>− ' + money(tt.discount) + '</span></div>' +
        '<div class="fin"><span>الإجمالي المطلوب</span><span>' + money(tt.total) + '</span></div>' +
        '<div><span>نقاط العميل المكتسبة</span><span>' + (s.customer_id ? (tt.points === null || tt.points === undefined ? '—' : fmtNum(tt.points) + ' نقطة') : 'العميل مش مربوط بكارت') + '</span></div>' +
        '<label style="margin-top:8px">حالة الدفع</label><select id="tbPay"><option value="unpaid"' + (s.payment_status === 'paid' ? '' : ' selected') + '>غير مدفوع</option><option value="paid"' + (s.payment_status === 'paid' ? ' selected' : '') + '>مدفوع</option></select>' +
        '<div id="tbCErr"></div><button class="btn" id="tbClose" type="button" style="margin-top:10px">✓ قفل الترابيزة وتسجيل الفاتورة</button></div>';
    var after = function () { reloadTables().then(function () { OPEN = DATA.tables.filter(function (x) { return x.id === t.id; })[0] || t; loadTable(); }); };
    bindStatus(box, after);
    var link = function (q) {
      if (!q) return; var b = $('#tbLink'); busy(b, true); $('#tbLErr').innerHTML = '';
      sh('tableLinkCustomer', { session_id: s.id, q: q }).then(function () { toast('تم ربط كارت العميل ✓'); after(); })
        .catch(function (e) { busy(b, false); $('#tbLErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    };
    if ($('#tbLink')) {
      $('#tbLink').onclick = function () { link($('#tbQ').value.trim()); };
      $('#tbScan').onclick = function () { startScan($('#tbScanBox'), function (txt) { $('#tbQ').value = txt; link(txt); }); };
    }
    $('#tbClose').onclick = function () {
      var b = this; if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'اضغط تاني لتأكيد قفل الترابيزة'; return; }
      busy(b, true);
      sh('tableClose', { session_id: s.id, payment_status: $('#tbPay').value }).then(function (r) {
        closeModal(); OPEN = null;
        var inv = r.invoice || {};
        toast('تم قفل ' + t.name + ' ✓ الإجمالي ' + money(r.session.total) + (inv.invoice_no ? ' · فاتورة ' + inv.invoice_no + (inv.points ? ' · ' + inv.points + ' نقطة للعميل' : '') : '') + (inv.ok === false ? ' · ⚠️ الفاتورة متعملتش: ' + inv.error : ''), inv.ok === false);
        return reloadTables();
      }).catch(function (e) { busy(b, false); b.dataset.ok = ''; $('#tbCErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    };
  }

  function historyModal() {
    var body = modal('📜 سجل الترابيزات', '<div id="thBox"><div class="empty"><span class="spinner"></span></div></div>', true);
    sh('tableHistory').then(function (list) {
      $('#thBox').innerHTML = list.length ? '<div class="tblwrap"><table class="tbl"><tr><th>الجلسة</th><th>الترابيزة</th><th>اتقفلت</th><th>الطلبات</th><th>الإجمالي</th><th>الدفع</th><th>العميل</th><th>الفاتورة</th></tr>' + list.map(function (s) {
        return '<tr class="click" data-sid="' + esc(s.id) + '"><td>#' + s.session_no + '</td><td>' + esc(s.table_name) + '</td><td>' + esc(odt(s.closed_at)) + '</td><td>' + s.orders_count + '</td><td>' + money(s.total) + '</td><td>' + (s.payment_status === 'paid' ? badge('مدفوع', 'green') : badge('غير مدفوع', 'gray')) + '</td><td>' + esc(s.customer_name || '—') + '</td><td>' +
          (s.invoice_no ? esc(s.invoice_no) + (s.points_awarded ? ' · ' + s.points_awarded + ' نقطة' : '') : s.invoice_status === 'failed' ? '<button class="btn ghost sm" type="button" data-ri="' + esc(s.id) + '">⚠️ إعادة المحاولة</button>' : '—') + '</td></tr>';
      }).join('') + '</table></div>' : '<div class="empty">لسه مفيش ترابيزات اتقفلت</div>';
      $all('[data-ri]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); busy(b, true); sh('tableRetryInvoice', { session_id: b.dataset.ri }).then(function () { toast('تم ✓'); historyModal(); }).catch(function (er) { busy(b, false); toast(er.message, true); }); }; });
      $all('[data-sid]').forEach(function (tr) { tr.onclick = function () { sessionModal(tr.dataset.sid); }; });
    }).catch(function (e) { $('#thBox').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
  }
  function sessionModal(id) {
    var body = modal('📜 تفاصيل الجلسة', '<div id="tsBox"><div class="empty"><span class="spinner"></span></div></div>', true);
    sh('tableSession', { session_id: id }).then(function (d) {
      var s = d.session, tt = d.totals || {};
      $('#tsBox').innerHTML = '<div class="small muted">جلسة #' + s.session_no + ' · ' + esc(s.table_name) + ' · من ' + esc(odt(s.opened_at)) + ' لـ ' + esc(odt(s.closed_at)) + ' · قفلها ' + esc(s.closed_by) + '</div>' +
        d.orders.map(function (o) { o.next = []; return orderCard(o, false); }).join('') +
        '<div class="card tb-sum"><div><span>إجمالي المنتجات</span><span>' + money(tt.subtotal) + '</span></div><div><span>الخصومات</span><span>− ' + money(tt.discount) + '</span></div><div class="fin"><span>الإجمالي</span><span>' + money(tt.total) + '</span></div>' +
        '<div><span>الدفع</span><span>' + (s.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع') + '</span></div><div><span>العميل</span><span>' + esc(s.customer_name || '—') + '</span></div><div><span>النقاط</span><span>' + fmtNum(s.points_awarded) + '</span></div></div>';
    }).catch(function (e) { $('#tsBox').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
  }

  /* ---------- طلبات الترابيزات (Dine-in Orders) ---------- */
  window.viewTableOrders = function (v) {
    var load = function () { return sh('tableOrders').then(function (l) { ORDERS = l; if (CUR === 'tableorders' && !$('#mdl')) drawOrders(v); }); };
    load().catch(function (e) { v.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    live(load);
  };
  function drawOrders(v) {
    var cnt = {}; ORDERS.forEach(function (o) { cnt[o.status] = (cnt[o.status] || 0) + 1; });
    var list = ORDERS.filter(function (o) { return (!OF.st || o.status === OF.st) && (!OF.q || (String(o.order_no) + ' ' + o.table_name + ' ' + (o.customer_name || '')).toLowerCase().indexOf(OF.q.toLowerCase()) >= 0); });
    var focused = document.activeElement && document.activeElement.id === 'toQ';
    v.innerHTML = '<div class="card"><div class="row" style="align-items:center;margin-bottom:10px"><h2 style="flex:1;margin:0">🧾 Dine-in Orders – طلبات الترابيزات</h2><button class="btn ghost sm" id="toTables" type="button" style="flex:0 0 auto">🍽️ الترابيزات</button></div>' +
      '<div class="so-st"><button type="button" data-st=""' + (OF.st ? '' : ' class="on"') + '>الكل (' + ORDERS.length + ')</button>' +
      ['pending', 'approved', 'preparing', 'ready', 'served', 'completed', 'cancelled'].map(function (s) { return '<button type="button" data-st="' + s + '"' + (OF.st === s ? ' class="on"' : '') + '>' + esc(ST[s]) + ' (' + (cnt[s] || 0) + ')</button>'; }).join('') + '</div>' +
      '<input id="toQ" placeholder="🔍 رقم الطلب أو الترابيزة أو اسم العميل" value="' + esc(OF.q) + '" style="margin-bottom:10px">' +
      '<div id="toList">' + (list.map(function (o) { return orderCard(o, true); }).join('') || '<div class="empty">مفيش طلبات</div>') + '</div></div>';
    $('#toTables').onclick = function () { go('tables'); };
    $all('[data-st]', v).forEach(function (b) { b.onclick = function () { OF.st = b.dataset.st; drawOrders(v); }; });
    var q = $('#toQ'); q.oninput = function () { OF.q = q.value; drawOrders(v); };
    if (focused) { q.focus(); var n = q.value.length; try { q.setSelectionRange(n, n); } catch (e) { } }
    bindStatus($('#toList'), function () { sh('tableOrders').then(function (l) { ORDERS = l; drawOrders(v); }); });
  }
})();
