/* Cake Shop Dessert Cafe — «تصفح منتجاتنا» (صفحة العميل)
 * البيانات حقيقية من الخادم (fn: 'shop' → catalog). أي تعديل من الإدارة يظهر أول ما العميل يفتح القسم أو يرجع للصفحة.
 * التنقل: #shop  |  #shop/c/<قسم>  |  #shop/p/<منتج>  |  #shop/cart  |  #shop/checkout(/now)  |  #shop/orders(/<طلب>)  (زرار الرجوع في الموبايل شغال)
 * الأسعار والخصومات بتتحسب في السيرفر (quote/checkout)، والسلة محفوظة على موبايل العميل. */
(function () {
  'use strict';
  var CSS = [
    '.shop-entry{display:flex;align-items:center;gap:14px;width:100%;margin:14px 0;padding:16px;border-radius:18px;border:1px solid rgba(94,224,219,.35);cursor:pointer;text-align:start;font:inherit;color:#fff;',
    'background:radial-gradient(120% 160% at 0% 0%,rgba(236,91,156,.45),transparent 60%),linear-gradient(135deg,#12434A,#3A1438);box-shadow:0 18px 40px -20px rgba(94,224,219,.6)}',
    '.shop-entry .se-ic{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;font-size:28px;background:rgba(255,255,255,.1);flex:0 0 auto}',
    '.shop-entry b{display:block;font-size:18px;font-weight:800}.shop-entry small{color:#FBCFE3;font-size:12.5px}.shop-entry .se-go{margin-inline-start:auto;font-size:22px;color:var(--brand)}',
    '#shopView{max-width:560px;margin:0 auto;padding:0 0 40px;min-height:100vh}',
    '.sh-top{position:sticky;top:0;z-index:30;padding:12px 14px 10px;background:rgba(23,11,20,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}',
    '.sh-bar{display:flex;align-items:center;gap:10px}',
    '.sh-back{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);font-size:20px;display:grid;place-items:center;cursor:pointer;flex:0 0 auto}',
    '.sh-title{font-size:18px;font-weight:800;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sh-search{position:relative;margin-top:10px}.sh-search input{padding-inline-start:40px;border-radius:14px;background:var(--surface)}',
    '.sh-search i{position:absolute;inset-inline-start:13px;top:50%;transform:translateY(-50%);font-style:normal;opacity:.6}',
    '.sh-search .clr{position:absolute;inset-inline-end:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--muted);font-size:20px;cursor:pointer}',
    '.sh-cats{display:flex;gap:10px;overflow-x:auto;padding:14px 14px 4px;scrollbar-width:none;scroll-snap-type:x proximity}.sh-cats::-webkit-scrollbar{display:none}',
    '.sh-cat{flex:0 0 auto;width:84px;scroll-snap-align:start;border:1px solid var(--line);border-radius:16px;padding:10px 6px 8px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer;text-align:center;transition:.15s}',
    '.sh-cat .ci{width:46px;height:46px;margin:0 auto 6px;border-radius:13px;display:grid;place-items:center;font-size:24px;background:linear-gradient(135deg,rgba(94,224,219,.18),rgba(236,91,156,.22));overflow:hidden}',
    '.sh-cat .ci img{width:100%;height:100%;object-fit:cover}',
    '.sh-cat span{display:block;font-size:12px;font-weight:700;line-height:1.3;min-height:31px}',
    '.sh-cat.on{border-color:var(--brand);background:linear-gradient(180deg,rgba(94,224,219,.16),rgba(236,91,156,.12));box-shadow:0 0 0 2px rgba(94,224,219,.25)}',
    '.sh-tools{display:flex;align-items:center;gap:10px;padding:10px 14px}',
    '.sh-tools .cnt{flex:1;color:var(--muted);font-size:13px;font-weight:600}',
    '.sh-tools select{width:auto;padding:8px 12px;border-radius:11px;font-size:13.5px;background:var(--surface)}',
    '.sh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:4px 14px}',
    '@media(min-width:520px){.sh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '.pc{position:relative;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--surface);border:1px solid var(--line);cursor:pointer;color:var(--text);text-decoration:none;transition:transform .15s}',
    '.pc:active{transform:scale(.98)}',
    '.pc .im{position:relative;aspect-ratio:1;background:#fff;display:grid;place-items:center;overflow:hidden}',
    '.pc .im img{width:100%;height:100%;object-fit:contain;padding:8px}',
    '.pc .im .noimg,.pd-gal .noimg{font-size:44px;opacity:.35;color:#211020}',
    '.pc .off{position:absolute;top:8px;inset-inline-start:8px;background:linear-gradient(135deg,#F43F5E,#E11D48);color:#fff;font-family:Inter,Cairo,sans-serif;font-weight:800;font-size:12px;padding:3px 9px;border-radius:999px;direction:ltr}',
    '.pc .bd-b{position:absolute;bottom:8px;inset-inline-end:8px;background:linear-gradient(135deg,#EC4899,#A855F7);color:#fff;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px}',
    '.bday-bn{margin:12px 14px 0;padding:12px 14px;border-radius:16px;background:linear-gradient(135deg,rgba(236,72,153,.16),rgba(168,85,247,.16));border:1px solid rgba(236,72,153,.35);display:flex;gap:10px;align-items:center}.bday-bn .ic{font-size:28px}.bday-bn b{display:block;font-size:14px}.bday-bn span{display:block;font-size:13px;margin-top:2px}.bday-bn small{display:block;font-size:12px;opacity:.8;margin-top:3px}',
    '.pd-bday{display:inline-block;margin:8px 0 0;background:linear-gradient(135deg,#EC4899,#A855F7);color:#fff;font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px}',
    '.pc .na{position:absolute;inset:auto 0 0 0;background:rgba(36,16,32,.82);color:#FECACA;font-size:12px;font-weight:800;text-align:center;padding:4px}',
    '.pc .bd{padding:10px 11px 12px;display:flex;flex-direction:column;gap:4px;flex:1}',
    '.pc .nm{font-size:13.5px;font-weight:700;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:39px}',
    '.pr{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;margin-top:auto}',
    '.pr b{font-family:Inter,Cairo,sans-serif;font-size:16px;font-weight:800;color:var(--brand)}',
    '.pr s{color:var(--muted);font-size:12.5px;font-family:Inter,Cairo,sans-serif}',
    '.av{font-size:11.5px;font-weight:700}.av.y{color:var(--ok)}.av.n{color:var(--bad)}',
    '.sh-empty{text-align:center;color:var(--muted);padding:40px 20px;font-size:14px}.sh-empty div{font-size:44px;margin-bottom:6px}',
    '.sk{background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:shsk 1.2s infinite;border-radius:18px}',
    '@keyframes shsk{to{background-position:-200% 0}}',
    /* صفحة المنتج */
    '.pd-gal{position:relative;background:#fff;aspect-ratio:1;overflow:hidden}',
    '.pd-track{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;direction:ltr}.pd-track::-webkit-scrollbar{display:none}',
    '.pd-track img{flex:0 0 100%;width:100%;height:100%;object-fit:contain;scroll-snap-align:center;padding:14px;cursor:zoom-in}',
    '.pd-dots{position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px;direction:ltr}',
    '.pd-dots i{width:7px;height:7px;border-radius:99px;background:rgba(33,16,32,.25);transition:.2s}.pd-dots i.on{width:20px;background:#211020}',
    '.pd-zoomhint{position:absolute;top:10px;inset-inline-end:10px;background:rgba(33,16,32,.7);color:#fff;border-radius:999px;padding:3px 10px;font-size:11.5px;pointer-events:none}',
    '.pd-thumbs{display:flex;gap:8px;overflow-x:auto;padding:10px 14px 0;scrollbar-width:none;direction:ltr}.pd-thumbs::-webkit-scrollbar{display:none}',
    '.pd-thumbs button{flex:0 0 auto;width:58px;height:58px;border-radius:12px;border:2px solid transparent;background:#fff;padding:3px;cursor:pointer}',
    '.pd-thumbs button.on{border-color:var(--brand)}.pd-thumbs img{width:100%;height:100%;object-fit:contain}',
    '.pd-body{padding:14px}',
    '.pd-cat{display:inline-block;font-size:12px;font-weight:700;color:var(--brand);background:rgba(94,224,219,.12);border-radius:999px;padding:2px 10px;cursor:pointer;border:0;font-family:inherit}',
    '.pd-name{font-size:21px;font-weight:800;line-height:1.4;margin:8px 0 6px}',
    '.pd-price{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin:6px 0 10px}',
    '.pd-price b{font-family:Inter,Cairo,sans-serif;font-size:26px;font-weight:800;color:var(--brand)}',
    '.pd-price s{color:var(--muted);font-size:16px;font-family:Inter,Cairo,sans-serif}',
    '.pd-price .sv{font-size:12.5px;font-weight:800;color:#FDA4AF;background:rgba(244,63,94,.14);border-radius:999px;padding:3px 10px}',
    '.pd-av{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:13.5px;border-radius:999px;padding:4px 12px}',
    '.pd-av.y{background:rgba(52,211,153,.13);color:var(--ok)}.pd-av.n{background:rgba(248,113,113,.13);color:var(--bad)}',
    '.pd-sec{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px}',
    '.pd-sec h3{font-size:15px;margin:0 0 10px}',
    '.pd-desc{white-space:pre-line;font-size:14.5px;line-height:1.85;color:#DCE3F5}',
    '.pd-sw{display:flex;flex-wrap:wrap;gap:8px}',
    'button.sw{font:inherit;color:inherit;cursor:pointer}.pd-sw .sw.on{border-color:var(--brand);box-shadow:0 0 0 2px rgba(94,224,219,.35)}',
    '.pd-sw .sw img{width:22px;height:22px;border-radius:50%;object-fit:cover;flex:0 0 auto}',
    '.pd-av.l{color:#F5C451}',
    '.cnote{position:relative;background:linear-gradient(135deg,rgba(236,91,156,.18),rgba(94,224,219,.12));border:1px solid rgba(236,91,156,.45);border-radius:16px;padding:12px 14px 12px 40px;margin:-4px 0 14px}',
    '.cnote b{display:block;font-size:15px}.cnote span{display:block;font-size:13px;margin-top:3px;line-height:1.6}.cnote small{color:var(--muted);font-size:11.5px}',
    '.cn-bell{position:relative;width:38px;height:34px;padding:0!important;display:grid;place-items:center;font-size:17px}',
    '.cn-bell i{position:absolute;top:-6px;left:-6px;min-width:19px;height:19px;border-radius:999px;background:#EC5B9C;color:#fff;font-style:normal;font-size:11px;font-weight:800;display:grid;place-items:center;padding:0 5px;font-family:Inter,sans-serif;box-shadow:0 0 0 2px var(--bg,#170B14)}',
    '.cn-bell i.z{display:none}.cn-bell.ring{animation:cnr 1s ease 2}@keyframes cnr{0%,100%{transform:rotate(0)}25%{transform:rotate(14deg)}75%{transform:rotate(-14deg)}}',
    '.cnl{display:flex;flex-direction:column;gap:8px}.cni{display:flex;gap:10px;border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.03);text-align:right}',
    '.cni.un{border-color:rgba(236,91,156,.55);background:linear-gradient(135deg,rgba(236,91,156,.16),rgba(94,224,219,.07))}',
    '.cni .ic{flex:0 0 auto;font-size:22px;line-height:1.2}.cni .t{flex:1;min-width:0}.cni b{display:block;font-size:14.5px}.cni span{display:block;font-size:13px;line-height:1.6;margin-top:2px}.cni small{display:block;color:var(--muted);font-size:11px;margin-top:3px}',
    '.cni .dot{flex:0 0 8px;width:8px;height:8px;border-radius:50%;background:#EC5B9C;margin-top:6px}',
    '.cnote .x{position:absolute;top:8px;left:8px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:inherit;font-size:16px;cursor:pointer}',
    '.pd-sw span{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 10px;font-size:13px;font-weight:700;background:rgba(255,255,255,.03)}',
    '.pd-sw i{width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.35);flex:0 0 auto}',
    '.pd-specs{width:100%;border-collapse:collapse;font-size:13.5px}',
    '.pd-specs td{padding:9px 6px;border-bottom:1px dashed var(--line);vertical-align:top}.pd-specs tr:last-child td{border-bottom:0}',
    '.pd-specs td:first-child{color:var(--muted);font-weight:700;width:40%}',
    '.pd-rel{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.pd-rel::-webkit-scrollbar{display:none}',
    '.pd-rel .pc{flex:0 0 46%;max-width:200px}',
    /* عرض الصورة بالكامل مع التكبير */
    '.zv{position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column}',
    '.zv-top{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;color:#fff;font-family:Inter,Cairo,sans-serif;direction:ltr}',
    '.zv-top button{width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:24px;cursor:pointer}',
    '.zv-stage{flex:1;overflow:hidden;position:relative;touch-action:none}',
    '.zv-stage img{position:absolute;left:50%;top:50%;max-width:100%;max-height:100%;transform-origin:center center;user-select:none;-webkit-user-drag:none}',
    '.zv-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:22px;cursor:pointer;z-index:2}',
    '.zv-hint{color:rgba(255,255,255,.6);text-align:center;font-size:12px;padding:8px}',
    'img.ld:not(.ok){background:linear-gradient(90deg,#EEF1F6,#F8FAFC,#EEF1F6);background-size:200% 100%;animation:shsk 1.2s infinite}',
    '.imgfail{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;color:#94A3B8;font-size:34px;background:#F1F5F9}',
    '.imgfail small{font-size:11.5px;font-weight:700;font-family:Cairo,sans-serif}',
    '.pd-track .imgfail{flex:0 0 100%;scroll-snap-align:center}',
    '.pd-buy{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(23,11,20,.95);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid var(--line)}',
    '.pd-buy .in{max-width:532px;margin:0 auto;display:flex;align-items:center;gap:12px}',
    '.pd-buy .pp{flex:0 0 auto;font-family:Inter,Cairo,sans-serif;font-weight:800;font-size:18px;color:var(--brand)}',
    '.order-btn{flex:1;border:0;border-radius:14px;padding:14px 16px;font:inherit;font-weight:800;font-size:17px;cursor:pointer;color:#150912;background:linear-gradient(135deg,#5EE0DB,#34D399);box-shadow:0 12px 30px -12px rgba(52,211,153,.8)}',
    '.order-btn:disabled{background:#334155;color:#94A3B8;box-shadow:none;cursor:not-allowed}',
    '.sh-pad{height:90px}',
    '.sh-myo{flex:0 0 auto;border:1px solid rgba(94,224,219,.4);background:rgba(94,224,219,.1);color:var(--brand);border-radius:12px;padding:8px 12px;font:inherit;font-weight:800;font-size:13px;cursor:pointer}',
    '.myo-entry{display:flex;align-items:center;gap:10px;width:100%;margin:-4px 0 14px;padding:12px 16px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;font-weight:800;font-size:15px;cursor:pointer;text-align:start}',
    '.myo-entry .se-go{margin-inline-start:auto;color:var(--brand);font-size:20px}',
    '.osum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:-6px 0 14px}.osum div{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer}',
    '.osum b{display:block;font-size:20px;font-family:Inter,Cairo,sans-serif}.osum small{color:var(--muted);font-size:11.5px;font-weight:700}.osum .w{grid-column:span 3}.osum .w b{font-size:17px}',
    '.ol h3.sec{margin:14px 2px 2px;font-size:15px}.oc.store{cursor:default}.oc .tg{display:inline-block;font-size:11px;font-weight:800;border-radius:6px;padding:0 6px;background:rgba(94,224,219,.14);color:var(--brand);margin-inline-start:4px}',
    '.osh{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}',
    '.osh .bx{width:100%;max-width:560px;max-height:92vh;overflow:auto;background:var(--bg2);border-radius:22px 22px 0 0;border:1px solid var(--line);padding:16px 16px calc(16px + env(safe-area-inset-bottom));animation:oshup .2s ease-out}',
    '@keyframes oshup{from{transform:translateY(40px);opacity:.5}}',
    '.osh .hd{display:flex;gap:12px;align-items:center;margin-bottom:6px}',
    '.osh .hd .t{width:64px;height:64px;border-radius:12px;background:#fff;flex:0 0 auto;overflow:hidden;display:grid;place-items:center;font-size:28px}',
    '.osh .hd .t img{width:100%;height:100%;object-fit:contain}',
    '.osh .hd b{display:block;font-size:15px;line-height:1.4}.osh .x{margin-inline-start:auto;flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:22px;cursor:pointer}',
    '.osh h4{margin:14px 0 8px;font-size:14px}',
    '.ochips{display:flex;flex-wrap:wrap;gap:8px}',
    '.ochips button{display:inline-flex;align-items:center;gap:7px;border:1.5px solid var(--line);background:rgba(255,255,255,.03);color:var(--text);border-radius:999px;padding:7px 14px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer}',
    '.ochips button.on{border-color:var(--brand);background:rgba(94,224,219,.14);color:#fff}',
    '.ochips i{width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.4)}',
    '.oqty{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:14px;overflow:hidden;direction:ltr}',
    '.oqty button{width:46px;height:44px;border:0;background:rgba(255,255,255,.05);color:var(--text);font-size:22px;cursor:pointer}',
    '.oqty span{min-width:54px;text-align:center;font-family:Inter,sans-serif;font-weight:800;font-size:18px}',
    '.ototal{display:flex;justify-content:space-between;align-items:center;margin:16px 0 12px;padding:12px 14px;border-radius:14px;background:rgba(94,224,219,.08);border:1px solid rgba(94,224,219,.25);font-weight:800}',
    '.ototal b{font-family:Inter,Cairo,sans-serif;font-size:22px;color:var(--brand)}',
    '.odone{text-align:center;padding:10px 4px}.odone .ic{font-size:54px}.odone .no{font-family:Inter,sans-serif;font-size:26px;font-weight:800;color:var(--brand);margin:6px 0}',
    '.ol{display:flex;flex-direction:column;gap:10px;padding:14px}',
    '.oc{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:16px;padding:10px;background:var(--surface);cursor:pointer;color:var(--text);text-decoration:none}',
    '.oc .t{width:62px;height:62px;border-radius:12px;background:#fff;flex:0 0 auto;overflow:hidden;display:grid;place-items:center;font-size:26px}',
    '.oc .t img{width:100%;height:100%;object-fit:contain}',
    '.oc .m{flex:1;min-width:0}.oc .m b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.oc .m small{display:block;color:var(--muted);font-size:12px}',
    '.ost{display:inline-block;font-size:11.5px;font-weight:800;padding:2px 10px;border-radius:999px;white-space:nowrap}',
    '.ost.pending{background:rgba(251,191,36,.15);color:#FBBF24}.ost.approved{background:rgba(94,224,219,.15);color:#5EE0DB}.ost.preparing{background:rgba(236,91,156,.18);color:#C4B5FD}',
    '.ost.ready{background:rgba(52,211,153,.15);color:#34D399}.ost.completed{background:rgba(52,211,153,.25);color:#A7F3D0}.ost.rejected{background:rgba(248,113,113,.15);color:#F87171}.ost.cancelled{background:rgba(148,163,184,.15);color:#94A3B8}',
    '.od-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line);font-size:14px}.od-row:last-child{border-bottom:0}.od-row span:first-child{color:var(--muted);font-weight:700;flex:0 0 auto}.od-row span:last-child{text-align:left;unicode-bidi:plaintext}',
    '.otl{list-style:none;margin:0;padding:0}.otl li{position:relative;padding:0 22px 14px 0;font-size:13.5px}.otl li::before{content:"";position:absolute;right:4px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--brand)}',
    '.otl li::after{content:"";position:absolute;right:8px;top:18px;bottom:0;width:2px;background:var(--line)}.otl li:last-child::after{display:none}.otl small{display:block;color:var(--muted);font-size:12px}',
    /* السلة وإتمام الشراء */
    '.ost.shipped{background:rgba(59,130,246,.18);color:#93C5FD}',
    '.sh-cart{position:relative;flex:0 0 auto;width:42px;height:40px;border-radius:12px;border:1px solid rgba(94,224,219,.4);background:rgba(94,224,219,.1);color:var(--text);font-size:19px;cursor:pointer;display:grid;place-items:center}',
    '.sh-cart .cart-n{position:absolute;top:-7px;inset-inline-start:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#F43F5E;color:#fff;font:800 11.5px/20px Inter,Cairo,sans-serif;text-align:center}',
    '.sh-cart .cart-n:empty{display:none}',
    '.pd-buy .in.two .order-btn{font-size:15.5px;padding:14px 10px}',
    '.cart-btn{flex:1;border:1.5px solid var(--brand);border-radius:14px;padding:13px 10px;font:inherit;font-weight:800;font-size:15.5px;cursor:pointer;color:var(--brand);background:rgba(94,224,219,.08)}',
    '.sh-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:99995;display:flex;align-items:center;gap:12px;max-width:92vw;padding:11px 14px 11px 16px;border-radius:14px;background:#0F2A1F;border:1px solid rgba(52,211,153,.5);color:#D1FAE5;font-weight:800;font-size:14px;box-shadow:0 14px 40px -10px rgba(0,0,0,.7);animation:oshup .2s ease-out}',
    '.sh-toast button{border:0;border-radius:10px;padding:7px 12px;background:#34D399;color:#062612;font:inherit;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap}',
    '.cl{display:flex;flex-direction:column;gap:10px;padding:14px 14px 0}',
    '.ci2{display:flex;gap:12px;border:1px solid var(--line);border-radius:16px;padding:10px;background:var(--surface)}',
    '.ci2.bad{border-color:rgba(248,113,113,.5)}',
    '.ci2 .t{width:72px;height:72px;border-radius:12px;background:#fff;flex:0 0 auto;overflow:hidden;display:grid;place-items:center;font-size:28px;cursor:pointer}',
    '.ci2 .t img{width:100%;height:100%;object-fit:contain}',
    '.ci2 .m{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.ci2 .m b{font-size:14px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.ci2 .m small{color:var(--muted);font-size:12px}',
    '.ci2 .pr b{font-size:14.5px}',
    '.ci2 .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}',
    '.ci2 .oqty button{width:36px;height:34px;font-size:18px}.ci2 .oqty span{min-width:36px;font-size:15px}',
    '.ci2 .lt{font-family:Inter,Cairo,sans-serif;font-weight:800;font-size:14.5px;color:var(--brand)}',
    '.ci2 .del{border:0;background:transparent;color:#F87171;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer;padding:4px 0}',
    '.ci2 .le{color:#F87171;font-weight:800;font-size:12.5px}',
    '.pbox{display:flex;gap:8px}.pbox input{flex:1;min-width:0;text-transform:uppercase;direction:ltr;text-align:left;font-family:Inter,Cairo,sans-serif}',
    '.pbox button{flex:0 0 auto;border:0;border-radius:12px;padding:0 18px;background:var(--brand);color:#150912;font:inherit;font-weight:800;cursor:pointer}',
    '.pbox button:disabled{opacity:.6}',
    '.pmsg{margin-top:8px;font-size:13px;font-weight:800}.pmsg.ok{color:#34D399}.pmsg.no{color:#F87171}',
    '.pchip{display:flex;align-items:center;gap:10px;border:1px dashed rgba(52,211,153,.6);background:rgba(52,211,153,.08);border-radius:12px;padding:10px 12px}',
    '.pchip b{font-family:Inter,sans-serif;direction:ltr}.pchip span{flex:1;color:#A7F3D0;font-size:13px;font-weight:700}.pchip button{border:0;background:transparent;color:var(--muted);font-size:20px;cursor:pointer}',
    '.sum .od-row b{font-family:Inter,Cairo,sans-serif}.sum .dc span:last-child{color:#34D399;font-weight:800}',
    '.sum .fin{border-top:1px solid var(--line);border-bottom:0;margin-top:4px;padding-top:12px;font-size:16px}.sum .fin span:first-child{color:var(--text)}.sum .fin b{font-size:21px;color:var(--brand)}',
    '.co-opts{display:flex;gap:8px;flex-wrap:wrap}.co-opts button{flex:1 1 140px;border:1.5px solid var(--line);background:rgba(255,255,255,.03);color:var(--text);border-radius:14px;padding:12px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;text-align:start}',
    '.co-opts button.on{border-color:var(--brand);background:rgba(94,224,219,.12)}.co-opts small{display:block;color:var(--muted);font-weight:600;font-size:12px;margin-top:2px}',
    '.co-chk{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;cursor:pointer;margin:0}.co-chk input{width:20px;height:20px;margin:0;flex:0 0 auto}',
    '.co-it{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)}.co-it:last-child{border-bottom:0}',
    '.co-it .t{width:48px;height:48px;border-radius:10px;background:#fff;flex:0 0 auto;overflow:hidden;display:grid;place-items:center;font-size:22px}.co-it .t img{width:100%;height:100%;object-fit:contain}',
    '.co-it .m{flex:1;min-width:0;font-size:13px}.co-it .m b{display:block;font-size:13.5px;line-height:1.4}.co-it .m small{color:var(--muted)}',
    '.co-it .lt{font-family:Inter,Cairo,sans-serif;font-weight:800;font-size:14px;white-space:nowrap}',
    '.co-foot{padding:14px}'
  ].join('\n');

  var CACHE_KEY = 'mc_shop_cache';
  var DATA = null, LOADING = null, ERR = '';
  var ST = { cat: '', q: '', sort: 'new' };
  var app = document.getElementById('app');
  if (!app || !window.__mcPost) return;

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cur() { try { return (window.D && D.settings && D.settings.currency) || 'ج.م'; } catch (e) { return 'ج.م'; } }
  function money(n) { return Number(n || 0).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }) + ' ' + esc(cur()); }
  function pct(p) { return p.old_price > p.price && p.old_price > 0 ? Math.round((1 - p.price / p.old_price) * 100) : 0; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim(); }
  function catById(id) { return ((DATA && DATA.categories) || []).filter(function (c) { return c.id === id; })[0]; }
  function prodById(id) { return ((DATA && DATA.products) || []).filter(function (p) { return p.id === id; })[0]; }
  function thumb(p, color) {
    var im = colorImg(p, color); if (im) return im.t || im.u;
    return p.images && p.images[0] ? p.images[0].t || p.images[0].u : '';
  }
  // صورة النكهة (بتتحدد من الإدارة لكل نكهة)
  function colorImg(p, color) {
    if (!color) return null;
    var c = (p.colors || []).filter(function (x) { return x.n === color; })[0];
    if (!c || !c.i) return null;
    return (p.images || []).filter(function (im) { return im.u === c.i; })[0] || null;
  }
  function colorIdx(p, c) { var k = -1; (p.images || []).forEach(function (im, i) { if (k < 0 && c && c.i && im.u === c.i) k = i; }); return k; }
  // متوفر / كمية قليلة (حد التنبيه من الإدارة)
  function lowStock(p) {
    if (!p.track_stock || !p.available || !p.stock) return false;
    var lim = Number(p.low_stock_at === undefined || p.low_stock_at === null ? 3 : p.low_stock_at), tot = 0;
    Object.keys(p.stock).forEach(function (k) { tot += Math.max(0, Number(p.stock[k]) || 0); });
    return tot > 0 && tot <= lim;
  }
  // لو قايمة اتخزنت كنص (نسخ قديمة) نرجعها قايمة
  function arr(v) { if (Array.isArray(v)) return v; if (typeof v === 'string') { try { var x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; } } return []; }
  function fixData(d) {
    if (d && d.products) d.products.forEach(function (p) {
      ['images', 'specs', 'colors', 'variants'].forEach(function (k) { p[k] = arr(p[k]); });
      // المنتجات اللي عليها تتبع مخزون: لو كل الكميات خلصت يبان «غير متوفر»
      if (p.track_stock) { var st = p.stock && typeof p.stock === 'object' ? p.stock : {}; p.stock = st; if (!Object.keys(st).some(function (k) { return Number(st[k]) > 0; })) p.available = false; }
    });
    return d;
  }
  function stockOf(p, c, v) { return p.track_stock ? Number((p.stock || {})[String(c || '') + '|' + String(v || '')] || 0) : Infinity; }
  // أقصى كمية متاحة لاختيار ناقص (مثلاً النكهة بس): أكبر متاح في كل الاحتمالات اللي تكمّله
  function stockMax(p, c, v) {
    if (!p.track_stock) return Infinity;
    var cs = (p.colors || []).length ? (c ? [c] : p.colors.map(function (x) { return x.n; })) : [''];
    var vs = (p.variants || []).length ? (v ? [v] : p.variants) : [''];
    var m = 0; cs.forEach(function (a) { vs.forEach(function (b) { m = Math.max(m, stockOf(p, a, b)); }); }); return m;
  }
  // صورة: شكل تحميل لحد ما توصل، ولو فشلت تظهر صورة بديلة بدل مربع فاضي
  function img(src, alt, extra) { return '<img class="ld" src="' + esc(src) + '" alt="' + esc(alt || '') + '"' + (extra || '') + ' onload="this.classList.add(\'ok\')" onerror="__shopImgErr(this)">'; }
  window.__shopImgErr = function (el) { var f = document.createElement('span'); f.className = 'imgfail'; f.innerHTML = '📷<small>الصورة مش متاحة</small>'; if (el.dataset.i) f.dataset.i = el.dataset.i; el.replaceWith(f); };
  function token() { return window.TOKEN || (window.BOOT && BOOT.token) || ''; }
  var ST_AR = { pending: 'قيد المراجعة', approved: 'تم قبول الطلب', preparing: 'جاري التجهيز', ready: 'جاهز للاستلام', shipped: 'خرج للتوصيل', completed: 'تم إتمام الطلب', rejected: 'مرفوض', cancelled: 'ملغي' };
  function stBadge(s) { return '<span class="ost ' + esc(s) + '">' + esc(ST_AR[s] || s) + '</span>'; }
  function dt(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function rpc(args) {
    return window.__mcPost(JSON.stringify({ fn: 'shop', args: args })).then(function (j) {
      var r = j && j.result;
      if (!r || !r.ok) { var e = new Error((r && r.error) || (j && j.error) || 'حصل خطأ، حاول تاني'); e.srv = true; throw e; }
      return r.data;
    }).catch(function (e) { if (e && e.srv) throw e; throw new Error('تعذر الاتصال بالخادم، تأكد من الإنترنت'); });
  }
  function catIcon(c) { return c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy">' : esc(c.icon || '🛍️'); }

  /* ---------- البيانات ---------- */
  try { var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached && cached.products) DATA = fixData(cached); } catch (e) { }
  function load() {
    if (LOADING) return LOADING;
    LOADING = window.__mcPost(JSON.stringify({ fn: 'shop', args: ['catalog'] })).then(function (j) {
      var r = j && j.result;
      if (!r || !r.ok) throw new Error((r && r.error) || (j && j.error) || 'تعذر تحميل المنتجات');
      DATA = fixData(r.data); ERR = '';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(DATA)); } catch (e) { }
    }).catch(function (e) {
      ERR = e && e.message && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذر الاتصال بالخادم، تأكد من الإنترنت';
    }).then(function () { LOADING = null; if (isShop()) route(); });
    return LOADING;
  }

  /* ---------- زرار الدخول في صفحة الكارت ---------- */
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var view = document.createElement('div'); view.id = 'shopView'; view.className = 'hidden'; view.dir = 'rtl';
  document.body.insertBefore(view, app.nextSibling);
  function placeEntry() {
    if (document.getElementById('shopEntry')) return;
    var anchor = document.getElementById('stats');
    if (!anchor) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'shopEntry'; b.className = 'shop-entry'; b.dir = 'rtl';
    b.innerHTML = '<span class="se-ic">🛍️</span><span><b>تصفح منتجاتنا</b><small>تورت، دونتس، كب كيك وحلويات أكتر بالأسعار</small></span><span class="se-go">‹</span>';
    b.onclick = function () { nav('#shop'); };
    anchor.parentNode.insertBefore(b, anchor);
    var o = document.createElement('button');
    o.type = 'button'; o.id = 'myOrdersEntry'; o.className = 'myo-entry'; o.dir = 'rtl';
    o.innerHTML = '<span>📦</span><span>طلباتي</span><span class="se-go">‹</span>';
    o.onclick = function () { nav('#shop/orders'); };
    anchor.parentNode.insertBefore(o, anchor);
    var sm = document.createElement('div'); sm.id = 'ordSummary'; sm.className = 'osum'; sm.dir = 'rtl';
    anchor.parentNode.insertBefore(sm, anchor);
    drawSummary(); loadSummary();
  }
  /* ---------- إشعارات العميل (النقاط اللي اتضافت على طلباته) ---------- */
  /* ---------- إشعارات العميل: جرس فوق بعدد غير المقروء (الطلبات + النقاط + العروض) ---------- */
  var NOTES = [], OFSEEN = null;
  function seenOffers() { if (OFSEEN) return OFSEEN; try { OFSEEN = JSON.parse(localStorage.getItem('cs_seen_offers') || '[]'); } catch (e) { OFSEEN = []; } return OFSEEN; }
  function offerItems() {
    var D = window.BOOT && BOOT.card; var list = (D && D.offers) || [];
    return list.map(function (o) { return { offer: o, unread: seenOffers().indexOf(o.offer_id) < 0 }; });
  }
  function bell() {
    var b = document.getElementById('cnBell'); if (b) return b;
    var bar = document.querySelector('.brandbar > div:last-child'); if (!bar || !token()) return null;
    b = document.createElement('button'); b.type = 'button'; b.id = 'cnBell'; b.className = 'chip-btn cn-bell'; b.setAttribute('aria-label', 'الإشعارات');
    b.innerHTML = '🔔<i class="z">0</i>'; b.onclick = openNotes; bar.insertBefore(b, bar.firstChild); return b;
  }
  function paintBell() {
    var b = bell(); if (!b) return;
    var n = NOTES.filter(function (x) { return !x.read_at; }).length + offerItems().filter(function (x) { return x.unread; }).length, i = b.querySelector('i');
    var was = Number(i.textContent) || 0; i.textContent = n > 9 ? '9+' : n; i.className = n ? '' : 'z';
    if (n > was) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
  }
  function loadNotes() {
    if (!token()) return;
    bell(); paintBell();
    rpc(['myNotes', { token: token() }]).then(function (r) { NOTES = r.notes || []; paintBell(); }).catch(function () { });
  }
  function ago(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function openNotes() {
    var offers = offerItems();
    var items = NOTES.map(function (n) { return { ic: /طلب|order/i.test(n.ref_type) ? (/نقط/.test(n.title) ? '⭐' : '📦') : '🔔', t: n.title, b: n.body, at: n.created_at, un: !n.read_at, go: n.ref_type === 'order' && n.ref_id ? '#shop/orders/' + n.ref_id : '' }; })
      .concat(offers.map(function (x) { return { ic: '🎁', t: 'عرض: ' + x.offer.title, b: x.offer.end_date ? 'متاح لحد ' + String(x.offer.end_date).slice(0, 10) : '', at: x.offer.start_date, un: x.unread, offer: x.offer.offer_id }; }))
      .sort(function (a, b) { return (b.un - a.un) || String(b.at || '').localeCompare(String(a.at || '')); });
    var o = document.createElement('div'); o.className = 'osh'; o.dir = 'rtl';
    o.innerHTML = '<div class="bx"><div class="hd" style="align-items:center"><div style="flex:1"><b>🔔 الإشعارات</b></div><button type="button" class="x" data-x>×</button></div>' +
      (items.length ? '<div class="cnl">' + items.map(function (x, k) { return '<div class="cni' + (x.un ? ' un' : '') + '" data-k="' + k + '"' + (x.go || x.offer ? ' style="cursor:pointer"' : '') + '><span class="ic">' + x.ic + '</span><div class="t"><b>' + esc(x.t) + '</b>' + (x.b ? '<span>' + esc(x.b) + '</span>' : '') + (x.at ? '<small>' + esc(ago(x.at)) + '</small>' : '') + '</div>' + (x.un ? '<span class="dot"></span>' : '') + '</div>'; }).join('') + '</div>'
        : '<div class="sh-empty" style="padding:30px 0"><div>🔕</div>مفيش إشعارات لسه</div>') + '</div>';
    document.body.appendChild(o);
    function close() { o.remove(); }
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    o.querySelector('[data-x]').onclick = close;
    Array.prototype.forEach.call(o.querySelectorAll('[data-k]'), function (el) {
      el.onclick = function () {
        var x = items[+el.dataset.k]; close();
        if (x.go) nav(x.go);
        else if (x.offer) { var f = document.getElementById('offer-' + x.offer); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.click(); } }
      };
    });
    // فتح القائمة = كله اتقرا
    if (NOTES.some(function (n) { return !n.read_at; })) { NOTES.forEach(function (n) { n.read_at = n.read_at || new Date().toISOString(); }); rpc(['readNotes', { token: token() }]).catch(function () { }); }
    var seen = seenOffers(); offers.forEach(function (x) { if (seen.indexOf(x.offer.offer_id) < 0) seen.push(x.offer.offer_id); });
    try { localStorage.setItem('cs_seen_offers', JSON.stringify(seen.slice(-200))); } catch (e) { }
    paintBell();
  }
  setInterval(function () { if (!document.hidden && token()) loadNotes(); }, 60000);

  /* ---------- ملخص طلبات العميل: الأونلاين + مشتريات المحل (من قاعدة البيانات) ---------- */
  var SUM = null;
  function loadSummary() {
    if (!token()) return Promise.resolve(null);
    loadNotes();
    return rpc(['mySummary', { token: token() }]).then(function (r) { SUM = r; drawSummary(); if (/^#shop\/orders$/.test(location.hash) && ORDERS) fillOrders(); return r; }).catch(function () { return null; });
  }
  function drawSummary() {
    var el = document.getElementById('ordSummary'); if (!el) return;
    if (!SUM) { el.innerHTML = ''; return; }
    el.innerHTML = '<div><b>' + SUM.total_orders + '</b><small>إجمالي الطلبات</small></div><div><b>' + SUM.active_orders + '</b><small>طلبات جارية</small></div>' +
      '<div><b>' + SUM.completed_orders + '</b><small>طلبات مكتملة</small></div><div><b>' + SUM.cancelled_orders + '</b><small>ملغية / مرفوضة</small></div>' +
      '<div style="grid-column:span 2"><b>' + money(SUM.total_value) + '</b><small>إجمالي قيمة مشترياتك</small></div>';
    Array.prototype.forEach.call(el.children, function (d) { d.onclick = function () { nav('#shop/orders'); }; });
  }
  placeEntry();

  /* ---------- التنقل ---------- */
  function isShop() { return /^#shop/.test(location.hash); }
  var PUSHES = 0;
  function nav(h) { if (location.hash !== h) { history.pushState({ shopIn: true }, '', location.pathname + location.search + h); PUSHES++; } route(); }
  function back() {
    if (PUSHES > 0) return history.back();
    // فتح مباشر على رابط داخل المتجر: نرجع للمستوى اللي فوقه من غير ما نخرج من الموقع
    var up = location.hash === '#shop/checkout' ? '#shop/cart' : /^#shop\/(cart|checkout)/.test(location.hash) ? '#shop' : /^#shop\/orders\/./.test(location.hash) ? '#shop/orders' : /^#shop\/orders/.test(location.hash) ? '' : /^#shop\/p\//.test(location.hash) ? (catById((prodById(location.hash.slice(8)) || {}).category_id) ? '#shop/c/' + prodById(location.hash.slice(8)).category_id : '#shop') : /^#shop\/c\//.test(location.hash) ? '#shop' : '';
    history.replaceState(up ? { shopIn: true } : null, '', location.pathname + location.search + up); route();
  }
  window.addEventListener('popstate', function () { if (PUSHES > 0) PUSHES--; route(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && isShop()) load(); });

  var lastHash = '', savedScroll = {};
  function route() {
    var h = location.hash;
    if (!isShop()) {
      Array.prototype.forEach.call(document.querySelectorAll('.osh,.zv'), function (x) { x.remove(); });
      view.classList.add('hidden'); app.classList.remove('hidden'); if (lastHash) loadSummary(); lastHash = '';
      return;
    }
    if (lastHash !== h) Array.prototype.forEach.call(document.querySelectorAll('.osh,.zv'), function (x) { x.remove(); }); // التنقل يقفل شاشة الطلب/الصورة المفتوحة
    if (lastHash && lastHash !== h) savedScroll[lastHash] = window.scrollY;
    app.classList.add('hidden'); view.classList.remove('hidden');
    var m = h.match(/^#shop\/p\/([\w-]+)/), c = h.match(/^#shop\/c\/([\w-]+)/);
    var entering = !lastHash, first = lastHash !== h; lastHash = h;
    var om = h.match(/^#shop\/orders(?:\/([\w-]+))?/);
    if (om) { if (om[1]) renderOrder(om[1]); else renderOrders(); if (first) window.scrollTo(0, 0); return; }
    if (h === '#shop/cart') { if (first) { renderCart(); window.scrollTo(0, 0); } return; }
    if (/^#shop\/checkout/.test(h)) { if (first) { renderCheckout(h === '#shop/checkout/now' ? 'now' : 'cart'); window.scrollTo(0, 0); } return; }
    if (entering && DATA) load(); // كل مرة العميل يفتح المتجر نجيب آخر تعديلات الإدارة
    if (!DATA && !ERR) { renderSkeleton(); if (!LOADING) load(); return; }
    if (!DATA && ERR) return renderError();
    if (m) renderProduct(m[1]);
    else { ST.cat = c ? c[1] : ''; renderList(); }
    if (first) window.scrollTo(0, savedScroll[h] || 0);
  }

  function topBar(title, withSearch, noCart) {
    return '<div class="sh-top"><div class="sh-bar"><button type="button" class="sh-back" id="shBack" aria-label="رجوع">→</button><div class="sh-title">' + title + '</div>' +
      (withSearch ? '<button type="button" class="sh-myo" id="shMyo">📦 طلباتي</button>' : '') +
      (noCart ? '' : '<button type="button" class="sh-cart" id="shCart" aria-label="سلة التسوق">🛒<span class="cart-n">' + (cartCount() || '') + '</span></button>') + '</div>' +
      (withSearch ? '<div class="sh-search"><i>🔍</i><input id="shQ" type="search" placeholder="ابحث باسم المنتج…" value="' + esc(ST.q) + '" autocomplete="off"><button type="button" class="clr' + (ST.q ? '' : ' hidden') + '" id="shClr" aria-label="مسح">×</button></div>' : '') + '</div>';
  }
  function bindBack() {
    document.getElementById('shBack').onclick = back;
    var m = document.getElementById('shMyo'); if (m) m.onclick = function () { nav('#shop/orders'); };
    var c = document.getElementById('shCart'); if (c) c.onclick = function () { nav('#shop/cart'); };
  }

  function renderSkeleton() {
    var sk = ''; for (var i = 0; i < 6; i++) sk += '<div class="sk" style="aspect-ratio:.72"></div>';
    view.innerHTML = topBar('تصفح منتجاتنا', false) + '<div class="sh-cats">' + [1, 2, 3, 4, 5].map(function () { return '<div class="sk" style="flex:0 0 84px;height:96px"></div>'; }).join('') + '</div><div class="sh-grid" style="margin-top:14px">' + sk + '</div>';
    bindBack();
  }
  function renderError() {
    view.innerHTML = topBar('تصفح منتجاتنا', false) + '<div class="sh-empty"><div>⚠️</div>' + esc(ERR) + '<br><br><button class="btn sm" type="button" id="shRetry">إعادة المحاولة</button></div>';
    bindBack(); document.getElementById('shRetry').onclick = function () { ERR = ''; renderSkeleton(); load(); };
  }

  /* ---------- عرض عيد الميلاد ---------- */
  var BDAY = null, BDAYL = false;
  function loadBday() {
    if (BDAYL || !token()) return; BDAYL = true;
    rpc(['myBirthday', { token: token() }]).then(function (d) {
      BDAY = d && d.offer && d.offer.status === 'available' ? d.offer : null;
      if (BDAY && isShop()) route();
    }).catch(function () { BDAYL = false; });
  }
  function bdayDiscType() { return BDAY && (BDAY.type === 'percent' || BDAY.type === 'fixed') && Number(BDAY.value) > 0; }
  function bdayVal() { return BDAY.type === 'percent' ? Number(BDAY.value) + '%' : money(BDAY.value); }
  function bdayBanner() {
    if (!BDAY) return '';
    return '<div class="bday-bn"><div class="ic">🎂</div><div><b>عرض عيد ميلادك</b><span>' + esc(BDAY.offer_text || (bdayDiscType() ? 'خصم ' + bdayVal() + ' على طلبك' : '')) + '</span>' +
      (BDAY.end ? '<small>العرض ساري حتى ' + esc(BDAY.end) + '</small>' : '') + '</div></div>';
  }
  function card(p) {
    var off = pct(p), t = thumb(p);
    return '<a class="pc" href="#shop/p/' + esc(p.id) + '" data-pid="' + esc(p.id) + '"><div class="im">' +
      (t ? img(t, p.name, ' loading="lazy"') : '<span class="noimg">📦</span>') +
      (off ? '<span class="off">-' + off + '%</span>' : '') + (p.available ? (bdayDiscType() && p.general_offers !== false ? '<span class="bd-b">🎂 ' + bdayVal() + '</span>' : '') : '<span class="na">غير متوفر حالياً</span>') + '</div>' +
      '<div class="bd"><div class="nm">' + esc(p.name) + '</div><div class="pr"><b>' + money(p.price) + '</b>' + (off ? '<s>' + money(p.old_price) + '</s>' : '') + '</div>' +
      '<div class="av ' + (p.available ? 'y">● متوفر' : 'n">● غير متوفر') + '</div></div></a>';
  }
  function bindCards(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-pid]'), function (a) {
      a.onclick = function (e) { e.preventDefault(); nav('#shop/p/' + a.dataset.pid); };
    });
  }

  function filtered() {
    var q = norm(ST.q), list = DATA.products.filter(function (p) {
      if (ST.cat && p.category_id !== ST.cat) return false;
      return !q || norm(p.name).indexOf(q) >= 0;
    });
    if (ST.sort === 'asc') list.sort(function (a, b) { return a.price - b.price; });
    else if (ST.sort === 'desc') list.sort(function (a, b) { return b.price - a.price; });
    else list.sort(function (a, b) { return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0; });
    return list;
  }

  function renderList() {
    if (ST.cat && !catById(ST.cat)) ST.cat = '';
    var cats = DATA.categories, c = catById(ST.cat);
    var counts = {}; DATA.products.forEach(function (p) { counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
    var focused = document.activeElement && document.activeElement.id === 'shQ';
    loadBday();
    view.innerHTML = topBar(c ? esc(c.name) : 'تصفح منتجاتنا', true) +
      bdayBanner() + '<div class="sh-cats" id="shCats"><button type="button" class="sh-cat' + (ST.cat ? '' : ' on') + '" data-cat=""><div class="ci">🏬</div><span>الكل</span></button>' +
      cats.map(function (k) { return '<button type="button" class="sh-cat' + (k.id === ST.cat ? ' on' : '') + '" data-cat="' + esc(k.id) + '"><div class="ci">' + catIcon(k) + '</div><span>' + esc(k.name) + '</span></button>'; }).join('') + '</div>' +
      '<div class="sh-tools"><div class="cnt" id="shCnt"></div><select id="shSort" aria-label="الترتيب">' +
      [['new', 'الأحدث'], ['asc', 'السعر: من الأقل للأعلى'], ['desc', 'السعر: من الأعلى للأقل']].map(function (o) { return '<option value="' + o[0] + '"' + (ST.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div><div class="sh-grid" id="shGrid"></div>';
    bindBack();
    var catsEl = document.getElementById('shCats');
    Array.prototype.forEach.call(catsEl.querySelectorAll('[data-cat]'), function (b) {
      b.onclick = function () { history.replaceState({ shopIn: true }, '', location.pathname + location.search + (b.dataset.cat ? '#shop/c/' + b.dataset.cat : '#shop')); lastHash = location.hash; ST.cat = b.dataset.cat; renderList(); };
    });
    var on = catsEl.querySelector('.on'); if (on && on.scrollIntoView && ST.cat) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    var qEl = document.getElementById('shQ');
    qEl.oninput = function () { ST.q = qEl.value; document.getElementById('shClr').classList.toggle('hidden', !ST.q); fillGrid(); };
    document.getElementById('shClr').onclick = function () { ST.q = ''; qEl.value = ''; this.classList.add('hidden'); fillGrid(); qEl.focus(); };
    document.getElementById('shSort').onchange = function () { ST.sort = this.value; fillGrid(); };
    if (focused) { qEl.focus(); var n = qEl.value.length; try { qEl.setSelectionRange(n, n); } catch (e) { } }
    fillGrid();
  }
  function fillGrid() {
    var list = filtered(), g = document.getElementById('shGrid');
    document.getElementById('shCnt').textContent = list.length + ' منتج';
    if (!list.length) {
      g.outerHTML = '<div class="sh-grid" id="shGrid"></div><div class="sh-empty" id="shNone"><div>' + (ST.q ? '🔍' : '📦') + '</div>' +
        (ST.q ? 'مفيش منتج بالاسم ده' : DATA.products.length ? 'مفيش منتجات في القسم ده دلوقتي' : 'المنتجات هتنزل هنا قريب') + '</div>';
      return;
    }
    var none = document.getElementById('shNone'); if (none) none.remove();
    g.innerHTML = list.map(card).join(''); bindCards(g);
  }

  function renderProduct(id) {
    var p = prodById(id);
    if (!p) {
      view.innerHTML = topBar('تصفح منتجاتنا', false) + '<div class="sh-empty"><div>📦</div>المنتج ده مش متاح دلوقتي</div>';
      return bindBack();
    }
    var c = catById(p.category_id), off = pct(p), imgs = p.images || [];
    loadBday();
    var rel = DATA.products.filter(function (x) { return x.id !== p.id && x.category_id === p.category_id; }).slice(0, 10);
    view.innerHTML = topBar(esc(p.name), false) +
      '<div class="pd-gal">' + (imgs.length ? '<div class="pd-track" id="pdTrack">' + imgs.map(function (im, i) { return img(im.u, p.name, ' data-i="' + i + '"' + (i ? ' loading="lazy"' : '')); }).join('') + '</div>' +
        '<span class="pd-zoomhint">🔍 اضغط للتكبير</span>' + (imgs.length > 1 ? '<div class="pd-dots" id="pdDots">' + imgs.map(function (x, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div>' : '')
        : '<div style="height:100%;display:grid;place-items:center"><span class="noimg">📦</span></div>') + '</div>' +
      (imgs.length > 1 ? '<div class="pd-thumbs" id="pdThumbs">' + imgs.map(function (im, i) { return '<button type="button" data-i="' + i + '"' + (i ? '' : ' class="on"') + '>' + img(im.t || im.u, '') + '</button>'; }).join('') + '</div>' : '') +
      '<div class="pd-body">' + (c ? '<button type="button" class="pd-cat" id="pdCat">' + (c.image ? '' : esc(c.icon || '') + ' ') + esc(c.name) + '</button>' : '') +
      '<h1 class="pd-name">' + esc(p.name) + '</h1>' +
      '<div class="pd-price"><b>' + money(p.price) + '</b>' + (off ? '<s>' + money(p.old_price) + '</s><span class="sv">خصم ' + off + '% · وفّر ' + money(p.old_price - p.price) + '</span>' : '') + '</div>' +
      (bdayDiscType() && p.available && p.general_offers !== false ? '<span class="pd-bday">🎂 خصم عيد ميلادك ' + bdayVal() + ' يتطبق عند إتمام الطلب' + (BDAY.end ? ' · ساري حتى ' + esc(BDAY.end) : '') + '</span><br>' : '') +
      '<span class="pd-av ' + (!p.available ? 'n">✕ غير متوفر حالياً' : lowStock(p) ? 'l">⚡ باقي كمية قليلة' : 'y">✓ متوفر') + '</span>' +
      (p.colors && p.colors.length ? '<div class="pd-sec"><h3>النكهات المتاحة</h3><div class="pd-sw" id="pdSw">' + p.colors.map(function (k, i) { var ci = colorImg(p, k.n); return '<button type="button" class="sw" data-sw="' + i + '">' + (ci ? img(ci.t || ci.u, '') : k.c ? '<i style="background:' + esc(k.c) + '"></i>' : '') + esc(k.n) + '</button>'; }).join('') + '</div></div>' : '') +
      (p.variants && p.variants.length ? '<div class="pd-sec"><h3>الأحجام المتاحة</h3><div class="pd-sw">' + p.variants.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div></div>' : '') +
      (p.description ? '<div class="pd-sec"><h3>الوصف</h3><div class="pd-desc">' + esc(p.description) + '</div></div>' : '') +
      (p.specs && p.specs.length ? '<div class="pd-sec"><h3>التفاصيل</h3><table class="pd-specs">' + p.specs.map(function (s) { return '<tr><td dir="auto">' + esc(s[0]) + '</td><td dir="auto">' + esc(s[1]) + '</td></tr>'; }).join('') + '</table></div>' : '') +
      (rel.length ? '<div class="pd-sec" style="background:transparent;border:0;padding:0"><h3>منتجات مشابهة</h3><div class="pd-rel" id="pdRel">' + rel.map(card).join('') + '</div></div>' : '') +
      '</div><div class="sh-pad"></div>' +
      '<div class="pd-buy"><div class="in two">' + (p.available
        ? '<button type="button" class="cart-btn" id="addCart">🛒 أضف إلى السلة</button><button type="button" class="order-btn" id="buyNow">⚡ اشترِ الآن</button>'
        : '<button type="button" class="order-btn" disabled>غير متوفر حالياً</button>') + '</div></div>';
    bindBack();
    if (p.available) {
      document.getElementById('addCart').onclick = function () { optionSheet(p, 'cart'); };
      document.getElementById('buyNow').onclick = function () { optionSheet(p, 'buy'); };
    }
    if (c) document.getElementById('pdCat').onclick = function () { nav('#shop/c/' + c.id); };
    var rl = document.getElementById('pdRel'); if (rl) bindCards(rl);
    var track = document.getElementById('pdTrack');
    if (!track) return;
    var dots = document.getElementById('pdDots'), th = document.getElementById('pdThumbs');
    var idx = function () { return Math.round(track.scrollLeft / track.clientWidth); };
    track.addEventListener('scroll', function () {
      var i = idx();
      if (dots) Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === i ? 'on' : ''; });
      if (th) Array.prototype.forEach.call(th.children, function (d, k) { d.className = k === i ? 'on' : ''; });
    }, { passive: true });
    if (th) Array.prototype.forEach.call(th.children, function (b) { b.onclick = function () { track.scrollTo({ left: Number(b.dataset.i) * track.clientWidth, behavior: 'smooth' }); }; });
    // الضغط على النكهة بيغير الصورة لصورة النكهة دي
    var sw = document.getElementById('pdSw');
    if (sw) Array.prototype.forEach.call(sw.children, function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(sw.children, function (x) { x.classList.toggle('on', x === b); });
        var k = colorIdx(p, p.colors[+b.dataset.sw]); if (k >= 0) track.scrollTo({ left: k * track.clientWidth, behavior: 'smooth' });
      };
    });
    Array.prototype.forEach.call(track.querySelectorAll('img'), function (im) { im.onclick = function () { zoom(imgs, Number(im.dataset.i)); }; });
  }


  /* ---------- سلة التسوق (محفوظة على موبايل العميل) ---------- */
  var MEMCART = [], PROMO = '', BUY = null, WITH_CART = false;
  function cartKey() { return 'mc_cart_' + String(token()).slice(0, 16); }
  function cartGet() {
    try { var c = JSON.parse(localStorage.getItem(cartKey()) || '[]'); if (Array.isArray(c)) MEMCART = c; } catch (e) { }
    return MEMCART.filter(function (x) { return x && x.product_id && x.qty > 0; }).map(function (x) { return { product_id: x.product_id, color: x.color || '', variant: x.variant || '', qty: x.qty }; });
  }
  function cartSet(c) {
    MEMCART = c;
    try { localStorage.setItem(cartKey(), JSON.stringify(c)); } catch (e) { }
    Array.prototype.forEach.call(document.querySelectorAll('.cart-n'), function (n) { n.textContent = cartCount() || ''; });
  }
  function cartCount() { return cartGet().reduce(function (s, x) { return s + Number(x.qty || 0); }, 0); }
  function sameLine(a, b) { return a.product_id === b.product_id && (a.color || '') === (b.color || '') && (a.variant || '') === (b.variant || ''); }
  function cartAdd(it) {
    var c = cartGet(), ex = c.filter(function (x) { return sameLine(x, it); })[0];
    if (ex) ex.qty = Math.min(50, ex.qty + it.qty); else c.push(it);
    cartSet(c);
  }
  function toast(msg, btn, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('.sh-toast'), function (x) { x.remove(); });
    var t = document.createElement('div'); t.className = 'sh-toast'; t.dir = 'rtl';
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (btn ? '<button type="button">' + esc(btn) + '</button>' : '');
    document.body.appendChild(t);
    if (btn) t.querySelector('button').onclick = function () { t.remove(); fn(); };
    setTimeout(function () { t.remove(); }, 3500);
  }

  /* اختيار اللون/النوع/الكمية قبل «أضف إلى السلة» أو «اشترِ الآن» */
  function optionSheet(p, mode) {
    var colors = p.colors || [], vars = p.variants || [];
    var S = { color: colors.length === 1 ? colors[0].n : '', variant: vars.length === 1 ? vars[0] : '', qty: 1 };
    var o = document.createElement('div'); o.className = 'osh'; o.dir = 'rtl';
    document.body.appendChild(o);
    function close() { o.remove(); }
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    function draw() {
      var t = thumb(p, S.color);
      o.innerHTML = '<div class="bx"><div class="hd"><div class="t">' + (t ? img(t, '') : '📦') + '</div><div><b>' + esc(p.name) + '</b><span class="small muted">' + money(p.price) + ' للقطعة</span></div><button type="button" class="x" data-x>×</button></div>' +
        (colors.length ? '<h4>اختار النكهة</h4><div class="ochips">' + colors.map(function (c, i) { var out = stockMax(p, c.n, S.variant) <= 0; return '<button type="button" data-c="' + i + '"' + (S.color === c.n ? ' class="on"' : '') + (out ? ' style="opacity:.45;text-decoration:line-through"' : '') + '>' + (c.c ? '<i style="background:' + esc(c.c) + '"></i>' : '') + esc(c.n) + (out ? ' <small>(خلصت)</small>' : '') + '</button>'; }).join('') + '</div>' : '') +
        (vars.length ? '<h4>اختار الحجم</h4><div class="ochips">' + vars.map(function (v, i) { var out = stockMax(p, S.color, v) <= 0; return '<button type="button" data-v="' + i + '"' + (S.variant === v ? ' class="on"' : '') + (out ? ' style="opacity:.45;text-decoration:line-through"' : '') + '>' + esc(v) + (out ? ' <small>(خلص)</small>' : '') + '</button>'; }).join('') + '</div>' : '') +
        (p.track_stock && (!colors.length || S.color) && (!vars.length || S.variant) ? '<div class="small" style="margin-top:8px;font-weight:700;color:' + (stockOf(p, S.color, S.variant) > 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (stockOf(p, S.color, S.variant) > 0 ? 'المتاح: ' + stockOf(p, S.color, S.variant) : 'الاختيار ده خلص') + '</div>' : '') +
        '<h4>الكمية</h4><div class="oqty"><button type="button" data-q="-1" aria-label="أقل">−</button><span id="oQty">' + S.qty + '</span><button type="button" data-q="1" aria-label="أكتر">+</button></div>' +
        '<div class="ototal"><span>الإجمالي</span><b id="oTot">' + money(p.price * S.qty) + '</b></div>' +
        '<div id="oErr"></div><button type="button" class="order-btn" id="oSend" style="width:100%">' + (mode === 'cart' ? '🛒 أضف إلى السلة' : '⚡ اشترِ الآن') + '</button></div>';
      o.querySelector('[data-x]').onclick = close;
      Array.prototype.forEach.call(o.querySelectorAll('[data-c]'), function (b) { b.onclick = function () { S.color = colors[+b.dataset.c].n; draw(); }; });
      Array.prototype.forEach.call(o.querySelectorAll('[data-v]'), function (b) { b.onclick = function () { S.variant = vars[+b.dataset.v]; draw(); }; });
      Array.prototype.forEach.call(o.querySelectorAll('[data-q]'), function (b) {
        b.onclick = function () { S.qty = Math.min(50, Math.max(1, S.qty + Number(b.dataset.q))); var mx = stockMax(p, S.color, S.variant); if (mx > 0 && S.qty > mx) { S.qty = mx; err('الكمية المتاحة ' + mx + ' بس'); } o.querySelector('#oQty').textContent = S.qty; o.querySelector('#oTot').innerHTML = money(p.price * S.qty); };
      });
      o.querySelector('#oSend').onclick = go;
    }
    function err(m) { o.querySelector('#oErr').innerHTML = '<div class="err">' + esc(m) + '</div>'; }
    function go() {
      if (colors.length && !S.color) return err('اختار النكهة الأول');
      if (vars.length && !S.variant) return err('اختار الحجم الأول');
      var av = stockOf(p, S.color, S.variant);
      if (av <= 0) return err('الاختيار ده خلص، اختار حاجة تانية');
      if (S.qty > av) return err('الكمية المتاحة ' + av + ' بس');
      var it = { product_id: p.id, color: S.color, variant: S.variant, qty: S.qty };
      close();
      if (mode === 'cart') { cartAdd(it); toast('✓ تمت إضافة المنتج للسلة', 'عرض السلة', function () { nav('#shop/cart'); }); }
      else { BUY = it; WITH_CART = false; nav('#shop/checkout/now'); }
    }
    draw();
  }

  /* ---------- حساب الأسعار من السيرفر ---------- */
  var QSEQ = 0;
  function quote(items, extra) {
    var my = ++QSEQ;
    return rpc(['quote', Object.assign({ token: token(), items: items, promo: PROMO }, extra || {})]).then(function (q) {
      if (my !== QSEQ) throw { stale: true };
      if (PROMO && q.promo && !q.promo.ok) PROMO = '';
      return q;
    });
  }
  function sumHtml(q, withShip) {
    var row = function (k, v, cls) { return '<div class="od-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span>' + v + '</span></div>'; };
    var disc = q.product_discount + q.promo_discount + (q.birthday_discount || 0);
    return '<div class="pd-sec sum" style="margin:0">' +
      row('إجمالي المنتجات', '<b>' + money(q.subtotal) + '</b>') +
      (q.product_discount > 0 ? row('خصم المنتجات', '− ' + money(q.product_discount), 'dc') : '') +
      (q.promo_discount > 0 ? row('كود الخصم (' + esc(q.promo.code) + ')', '− ' + money(q.promo_discount), 'dc') : '') +
      (q.birthday_discount > 0 ? row('🎂 خصم عيد الميلاد', '− ' + money(q.birthday_discount), 'dc') : '') +
      (disc > 0 ? row('إجمالي الخصومات', '− ' + money(disc), 'dc') : '') +
      (withShip && q.delivery === 'delivery' ? row('مصاريف التوصيل', q.shipping > 0 ? money(q.shipping) : 'مجاناً') : '') +
      row('الإجمالي النهائي', '<b>' + money(q.total) + '</b>', 'fin') + '</div>';
  }
  // خانة كود الخصم (في السلة وإتمام الشراء)
  function promoHtml(q, msg) {
    var applied = q && q.promo && q.promo.ok;
    return '<div class="pd-sec" style="margin:0"><h3>🏷️ كود الخصم</h3>' +
      (applied ? '<div class="pchip"><b>' + esc(q.promo.code) + '</b><span>وفّرت ' + money(q.promo.discount) + '</span><button type="button" id="pRm" aria-label="شيل الكود">×</button></div>'
        : '<div class="pbox"><input id="pIn" placeholder="اكتب الكود هنا" autocomplete="off" autocapitalize="characters" maxlength="30"><button type="button" id="pGo">تطبيق</button></div>') +
      (msg ? '<div class="pmsg ' + (msg.ok ? 'ok' : 'no') + '">' + (msg.ok ? '✓ ' : '✕ ') + esc(msg.text) + '</div>' : '') + '</div>';
  }
  function bindPromo(root, redo) {
    var rm = root.querySelector('#pRm'); if (rm) rm.onclick = function () { PROMO = ''; redo(null); };
    var go = root.querySelector('#pGo'), inp = root.querySelector('#pIn');
    if (!go) return;
    inp.onkeydown = function (e) { if (e.key === 'Enter') go.click(); };
    go.onclick = function () {
      var c = inp.value.trim(); if (!c) { inp.focus(); return; }
      go.disabled = true; PROMO = c; redo(c);
    };
  }
  function lineImg(l) { return l.image ? img(l.image, '') : '📦'; }
  function promoMsg(q, tried) { return tried && q.promo ? { ok: q.promo.ok, text: q.promo.message } : null; }

  /* ---------- شاشة سلة التسوق ---------- */
  function renderCart() {
    var c = cartGet();
    if (!c.length) {
      view.innerHTML = topBar('🛒 سلة التسوق', false, true) + '<div class="sh-empty"><div>🛒</div>السلة فاضية.<br>ادخل «تصفح منتجاتنا» وضيف اللي يعجبك.<br><br><button type="button" class="btn sm" id="cGo">تصفح منتجاتنا</button></div>';
      bindBack(); document.getElementById('cGo').onclick = function () { nav('#shop'); }; return;
    }
    view.innerHTML = topBar('🛒 سلة التسوق', false, true) + '<div id="cBody"><div class="cl"><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div></div></div>';
    bindBack();
    var Q = null, timer = 0;
    function refresh(tried) {
      var items = cartGet();
      if (!items.length) return renderCart();
      quote(items).then(function (q) { Q = q; draw(promoMsg(q, tried)); }).catch(function (e) {
        if (e && e.stale) return;
        var b = document.getElementById('cBody'); if (b) b.innerHTML = '<div class="sh-empty"><div>⚠️</div>' + esc(e.message) + '<br><br><button type="button" class="btn sm" id="cRetry">إعادة المحاولة</button></div>';
        var r = document.getElementById('cRetry'); if (r) r.onclick = function () { refresh(); };
      });
    }
    function draw(msg) {
      var b = document.getElementById('cBody'); if (!b || location.hash !== '#shop/cart') return;
      var bad = Q.lines.some(function (l) { return l.error; });
      b.innerHTML = '<div class="cl">' + Q.lines.map(function (l, i) {
        return '<div class="ci2' + (l.error ? ' bad' : '') + '"><div class="t" data-p="' + esc(l.product_id) + '">' + lineImg(l) + '</div><div class="m">' +
          '<b>' + esc(l.name || 'منتج مش متاح') + '</b>' + (l.code ? '<small>كود: <span dir="ltr">' + esc(l.code) + '</span></small>' : '') +
          ((l.color || l.variant) ? '<small>' + esc([l.color, l.variant].filter(Boolean).join(' · ')) + '</small>' : '') +
          (l.unit_price ? '<div class="pr"><b>' + money(l.unit_price) + '</b>' + (l.old_price ? '<s>' + money(l.old_price) + '</s>' : '') + '</div>' : '') +
          (l.error ? '<span class="le">⚠️ ' + esc(l.error) + '</span>' : '') +
          '<div class="row">' + (l.error ? '<span></span>' : '<div class="oqty"><button type="button" data-dq="' + i + '" data-d="-1" aria-label="أقل">−</button><span>' + l.qty + '</span><button type="button" data-dq="' + i + '" data-d="1" aria-label="أكتر">+</button></div>') +
          (l.error ? '' : '<span class="lt">' + money(l.line_total) + '</span>') + '</div>' +
          '<button type="button" class="del" data-del="' + i + '">🗑 حذف من السلة</button></div></div>';
      }).join('') + '</div><div class="ol">' + promoHtml(Q, msg) + sumHtml(Q, false) + '</div>' +
        '<div class="co-foot" style="padding-top:0">' + (bad ? '<div class="err">احذف المنتجات اللي مش متاحة علشان تكمل</div>' : '') +
        '<button type="button" class="order-btn" id="cGo" style="width:100%"' + (bad ? ' disabled' : '') + '>إتمام الشراء · ' + money(Q.total) + '</button></div>';
      Array.prototype.forEach.call(b.querySelectorAll('[data-p]'), function (t) { t.onclick = function () { if (prodById(t.dataset.p)) nav('#shop/p/' + t.dataset.p); }; });
      Array.prototype.forEach.call(b.querySelectorAll('[data-dq]'), function (btn) {
        btn.onclick = function () {
          var l = Q.lines[+btn.dataset.dq], items = cartGet(), it = items.filter(function (x) { return sameLine(x, l); })[0]; if (!it) return;
          var n = Math.min(50, Math.max(1, it.qty + Number(btn.dataset.d))); if (n === it.qty) return;
          it.qty = n; l.qty = n; cartSet(items); btn.parentNode.querySelector('span').textContent = n;
          clearTimeout(timer); timer = setTimeout(function () { refresh(); }, 250);
        };
      });
      Array.prototype.forEach.call(b.querySelectorAll('[data-del]'), function (btn) {
        btn.onclick = function () { var l = Q.lines[+btn.dataset.del]; cartSet(cartGet().filter(function (x) { return !sameLine(x, l); })); refresh(); };
      });
      bindPromo(b, function (tried) { refresh(tried); });
      var go = document.getElementById('cGo'); if (go && !bad) go.onclick = function () { nav('#shop/checkout'); };
    }
    refresh();
  }

  /* ---------- إتمام الشراء ---------- */
  function renderCheckout(mode) {
    if (mode === 'now' && !BUY) { history.replaceState({ shopIn: true }, '', location.pathname + location.search + '#shop/cart'); lastHash = location.hash; return renderCart(); }
    var CO = { delivery: 'pickup', address: '', notes: '', branch: '', editAddr: false };
    // التوصيل: العنوان المسجل في حساب العميل (أو يضيفه/يعدله ويتحفظ في حسابه)
    function addrBlock() {
      if (Q.saved_address && !CO.editAddr) return '<div class="pchip" style="margin-top:12px;border-color:rgba(94,224,219,.5);background:rgba(94,224,219,.06)"><span style="color:var(--text);white-space:pre-line">📍 ' + esc(Q.saved_address) + '</span></div>' +
        '<button type="button" class="btn ghost sm" id="coAddrEd" style="margin-top:8px">✏️ تعديل العنوان</button>';
      return (Q.saved_address ? '' : '<div class="small" style="margin-top:12px;color:#FBBF24;font-weight:700">مفيش عنوان مسجل في حسابك. أضف عنوانك علشان التوصيل.</div>') +
        '<label style="margin-top:10px">عنوان التوصيل *</label><textarea id="coAddr" rows="2" maxlength="500" placeholder="المنطقة، الشارع، رقم العمارة، علامة مميزة">' + esc(CO.address || Q.saved_address) + '</textarea>' +
        '<div id="coAddrErr"></div><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn sm" id="coAddrSave">حفظ العنوان</button>' +
        (Q.saved_address ? '<button type="button" class="btn ghost sm" id="coAddrNo">إلغاء</button>' : '') + '</div>';
    }
    // الاستلام: الفرع (ولو فيه أكتر من فرع العميل يختار)
    function branchBlock() {
      var brs = Q.branches || [];
      if (!brs.length) return '<div class="err" style="margin-top:10px">مفيش فرع متاح للاستلام حالياً</div>';
      if (brs.length === 1) { CO.branch = brs[0].id; return '<div style="margin-top:12px;font-weight:700">🏪 ' + esc(brs[0].name) + '</div>' + (brs[0].address ? '<div class="small muted">' + esc(brs[0].address) + '</div>' : '') + (brs[0].phone ? '<div class="small muted" dir="ltr" style="text-align:right">' + esc(brs[0].phone) + '</div>' : ''); }
      return '<h4 style="margin:12px 0 8px;font-size:14px">اختار الفرع</h4><div class="co-opts">' + brs.map(function (br) {
        return '<button type="button" data-br="' + esc(br.id) + '"' + (CO.branch === br.id ? ' class="on"' : '') + '>🏪 ' + esc(br.name) + (br.address ? '<small>' + esc(br.address) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function items() { return mode === 'now' ? [BUY].concat(WITH_CART ? cartGet() : []) : cartGet(); }
    if (!items().length) { history.replaceState({ shopIn: true }, '', location.pathname + location.search + '#shop/cart'); lastHash = location.hash; return renderCart(); }
    view.innerHTML = topBar('إتمام الشراء', false, true) + '<div id="coBody"><div class="ol"><div class="sk" style="height:120px"></div><div class="sk" style="height:180px"></div></div></div>';
    bindBack();
    var Q = null;
    function keep() { var a = document.getElementById('coAddr'), n = document.getElementById('coNotes'); if (a) CO.address = a.value; if (n) CO.notes = n.value; }
    function refresh(tried) {
      keep();
      quote(items(), { delivery: CO.delivery }).then(function (q) { Q = q; if (!q.delivery_enabled) CO.delivery = 'pickup'; draw(promoMsg(q, tried)); }).catch(function (e) {
        if (e && e.stale) return;
        var b = document.getElementById('coBody'); if (b) b.innerHTML = '<div class="sh-empty"><div>⚠️</div>' + esc(e.message) + '<br><br><button type="button" class="btn sm" id="coRetry">إعادة المحاولة</button></div>';
        var r = document.getElementById('coRetry'); if (r) r.onclick = function () { refresh(); };
      });
    }
    function draw(msg, errText) {
      var b = document.getElementById('coBody'); if (!b || !/^#shop\/checkout/.test(location.hash)) return;
      var bad = Q.lines.some(function (l) { return l.error; }), extra = mode === 'now' ? cartGet().length : 0;
      var row = function (k, v) { return '<div class="od-row"><span>' + k + '</span><span>' + v + '</span></div>'; };
      b.innerHTML = '<div class="ol">' +
        '<div class="pd-sec" style="margin:0"><h3>👤 بياناتك</h3>' + row('الاسم', esc(Q.customer.name)) + row('رقم الهاتف', '<span dir="ltr">' + esc(Q.customer.phone) + '</span>') + (Q.customer.member_no ? row('رقم العضوية', esc(Q.customer.member_no)) : '') + '</div>' +
        '<div class="pd-sec" style="margin:0"><h3>📍 طريقة استلام الطلب</h3><div class="co-opts">' +
          (Q.delivery_enabled ? '<button type="button" data-dl="delivery"' + (CO.delivery === 'delivery' ? ' class="on"' : '') + '>🚚 التوصيل إلى عنواني<small>' + (Q.delivery_fee > 0 ? 'رسوم التوصيل ' + money(Q.delivery_fee) : 'من غير رسوم توصيل') + '</small></button>'
            : '<button type="button" disabled style="opacity:.5;cursor:not-allowed">🚚 التوصيل إلى عنواني<small>التوصيل مش متاح حالياً</small></button>') +
          '<button type="button" data-dl="pickup"' + (CO.delivery === 'pickup' ? ' class="on"' : '') + '>🏪 الاستلام من الفرع<small>من غير رسوم توصيل</small></button></div>' +
          (CO.delivery === 'delivery' ? addrBlock() : branchBlock()) + '</div>' +
        '<div class="pd-sec" style="margin:0"><h3>🛍️ المنتجات (' + Q.lines.reduce(function (s, l) { return s + l.qty; }, 0) + ')</h3>' + Q.lines.map(function (l) {
          return '<div class="co-it"><div class="t">' + lineImg(l) + '</div><div class="m"><b>' + esc(l.name || 'منتج مش متاح') + '</b>' +
            '<small>' + esc([l.code, l.color, l.variant].filter(Boolean).join(' · ')) + '</small>' +
            (l.error ? '<div class="le" style="color:#F87171;font-weight:800">⚠️ ' + esc(l.error) + '</div>' : '<small>' + l.qty + ' × ' + money(l.unit_price) + (l.old_price ? ' <s>' + money(l.old_price) + '</s>' : '') + '</small>') +
            '</div>' + (l.error ? '' : '<span class="lt">' + money(l.line_total) + '</span>') + '</div>';
        }).join('') +
        (mode === 'now' && extra ? '<label class="co-chk" style="margin-top:10px"><input type="checkbox" id="coWith"' + (WITH_CART ? ' checked' : '') + '> ضيف منتجات السلة (' + extra + ') للطلب ده كمان</label>' : '') + '</div>' +
        promoHtml(Q, msg) + sumHtml(Q, true) +
        '<div class="pd-sec" style="margin:0"><h3>📝 ملاحظات (اختياري)</h3><textarea id="coNotes" rows="2" maxlength="500" placeholder="مثلاً: هعدي أستلمه بكرة الضهر">' + esc(CO.notes) + '</textarea></div>' +
        '</div><div class="co-foot" style="padding-top:0"><div id="coErr">' + (errText ? '<div class="err">' + esc(errText) + '</div>' : '') + '</div>' +
        (bad ? '<div class="err">فيه منتج مش متاح. ارجع للسلة واحذفه علشان تكمل.</div>' : '') +
        '<button type="button" class="order-btn" id="coSend" style="width:100%"' + (bad ? ' disabled' : '') + '>تأكيد الطلب · ' + money(Q.total) + '</button>' +
        '<p class="small muted" style="text-align:center;margin:10px 0 0">الطلب بيتراجع من المحل، وتقدر تتابعه من «طلباتي»</p></div>';
      Array.prototype.forEach.call(b.querySelectorAll('[data-dl]'), function (x) { x.onclick = function () { if (CO.delivery === x.dataset.dl) return; CO.delivery = x.dataset.dl; refresh(); }; });
      Array.prototype.forEach.call(b.querySelectorAll('[data-br]'), function (x) { x.onclick = function () { keep(); CO.branch = x.dataset.br; draw(null); }; });
      var ae = document.getElementById('coAddrEd'); if (ae) ae.onclick = function () { keep(); CO.editAddr = true; CO.address = Q.saved_address; draw(null); };
      var an = document.getElementById('coAddrNo'); if (an) an.onclick = function () { keep(); CO.editAddr = false; CO.address = ''; draw(null); };
      var as = document.getElementById('coAddrSave'); if (as) as.onclick = function () {
        keep(); as.disabled = true;
        rpc(['saveAddress', { token: token(), address: CO.address }]).then(function (r) { Q.saved_address = r.address; CO.editAddr = false; CO.address = ''; draw(null); })
          .catch(function (e) { as.disabled = false; document.getElementById('coAddrErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
      };
      var w = document.getElementById('coWith'); if (w) w.onchange = function () { WITH_CART = w.checked; refresh(); };
      bindPromo(b, function (tried) { refresh(tried); });
      if (!bad) document.getElementById('coSend').onclick = send;
    }
    function send() {
      keep();
      var errBox = document.getElementById('coErr');
      if (CO.delivery === 'delivery' && (CO.editAddr || !Q.saved_address)) { errBox.innerHTML = '<div class="err">احفظ عنوان التوصيل الأول</div>'; var ad = document.getElementById('coAddr'); if (ad) ad.focus(); return; }
      if (CO.delivery === 'pickup' && (Q.branches || []).length > 1 && !CO.branch) { errBox.innerHTML = '<div class="err">اختار الفرع اللي هتستلم منه</div>'; return; }
      var btn = document.getElementById('coSend'); btn.disabled = true; btn.textContent = 'جاري إرسال الطلب…';
      var usedCart = mode === 'cart' || WITH_CART, its = items();
      rpc(['checkout', { token: token(), items: its, promo: PROMO, delivery: CO.delivery, address: CO.delivery === 'delivery' ? Q.saved_address : '', branch_id: CO.branch, notes: CO.notes, method: mode === 'cart' ? 'cart' : 'buy_now', expect_total: Q.total }]).then(function (r) {
        if (usedCart) cartSet([]);
        BUY = null; WITH_CART = false; PROMO = ''; ORDERS = null;
        history.replaceState({ shopIn: true }, '', location.pathname + location.search + '#shop/orders/' + r.id); lastHash = location.hash; loadSummary();
        renderOrder(r.id);
        var o = document.createElement('div'); o.className = 'osh'; o.dir = 'rtl';
        o.innerHTML = '<div class="bx"><div class="odone"><div class="ic">✅</div><h2 style="margin:6px 0">تم إرسال طلبك</h2><div class="small muted">رقم الطلب</div><div class="no">#' + r.order_no + '</div>' +
          '<div class="small muted" style="margin-bottom:6px">الإجمالي ' + money(r.total) + '</div>' +
          '<div class="small muted" style="margin-bottom:14px">الطلب قيد المراجعة من المحل. هتلاقي حالته في «طلباتي».</div>' +
          '<button type="button" class="order-btn" id="oOk" style="width:100%">تمام</button><div style="height:8px"></div><button type="button" class="btn ghost" id="oShop">كمل تسوق</button></div></div>';
        document.body.appendChild(o);
        o.querySelector('#oOk').onclick = function () { o.remove(); };
        o.querySelector('#oShop').onclick = function () { o.remove(); nav('#shop'); };
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'تأكيد الطلب · ' + money(Q.total);
        errBox.innerHTML = '<div class="err">' + esc(e.message) + '</div>';
        if (/اتغيرت|مش متاح|غير متوفر|اختار|مبقاش|مبقتش|الكمية|خلص|الكود|كود|التوصيل/.test(e.message)) {
          if (/الكود|كود/.test(e.message)) PROMO = '';
          var m = e.message;
          keep();
          quote(items(), { delivery: CO.delivery }).then(function (q) { Q = q; draw(null, m); }).catch(function () { });
          load();
        }
      });
    }
    refresh();
  }

  /* ---------- طلباتي ---------- */
  var ORDERS = null;
  function loadOrders() {
    return rpc(['myOrders', { token: token() }]).then(function (r) { ORDERS = r; return r; });
  }
  function orderCard(x) {
    var inv = x.invoiced || (SUM && SUM.invoices && SUM.invoices['ON-' + x.order_no]);
    var prods = (x.items && x.items.length ? x.items : [{ name: x.product_name, qty: x.qty }]).map(function (i) { return i.qty + '× ' + i.name; }).join('، ');
    return '<a class="oc" href="#shop/orders/' + esc(x.id) + '" data-oid="' + esc(x.id) + '"><div class="t">' + (x.image ? img(x.image, '') : '📦') + '</div>' +
      '<div class="m"><b>طلب أونلاين #' + x.order_no + (inv ? '<span class="tg">🧾 اتعمله فاتورة</span>' : '') + '</b><small>' + esc(dt(x.created_at)) + ' · ' + (x.delivery === 'delivery' ? '🚚 توصيل' : '🏪 استلام من الفرع') + '</small><small>' + esc(prods) + '</small><small>الإجمالي ' + money(x.total) + (x.points ? ' · ⭐ +' + x.points + ' نقطة' : '') + '</small>' + (x.promo_code ? '<small style="color:#34D399">🏷️ ' + esc(x.promo_code) + ' · وفّرت ' + money(x.promo_discount) + '</small>' : '') + '</div>' + stBadge(x.status) + '</a>';
  }
  function renderOrders() {
    view.innerHTML = topBar('📦 طلباتي', false) + '<div class="ol" id="olist">' + (ORDERS ? '' : '<div class="sk" style="height:84px"></div><div class="sk" style="height:84px"></div>') + '</div>';
    bindBack();
    if (ORDERS) fillOrders();
    loadSummary();
    loadOrders().then(function () { if (/^#shop\/orders$/.test(location.hash)) fillOrders(); }).catch(function (e) {
      var l = document.getElementById('olist'); if (l && !ORDERS) l.innerHTML = '<div class="sh-empty"><div>⚠️</div>' + esc(e.message) + '</div>';
    });
  }
  function fillOrders() {
    var l = document.getElementById('olist'); if (!l) return;
    if (!ORDERS.length && !(SUM && SUM.store && SUM.store.length)) { l.innerHTML = '<div class="sh-empty"><div>📦</div>لسه ما طلبتش حاجة.<br>ادخل «تصفح منتجاتنا» واختار اللي يعجبك.<br><br><button type="button" class="btn sm" id="oGoShop">تصفح منتجاتنا</button></div>'; document.getElementById('oGoShop').onclick = function () { nav('#shop'); }; return; }
    var store = SUM && SUM.store ? SUM.store : [];
    l.innerHTML = (SUM ? '<div class="osum" id="olSum"></div>' : '') +
      '<h3 class="sec">🛍️ طلباتي الأونلاين (' + ORDERS.length + ')</h3>' + (ORDERS.length ? ORDERS.map(orderCard).join('') : '<div class="small muted" style="padding:6px 2px">مفيش طلبات أونلاين لسه.</div>') +
      (store.length ? '<h3 class="sec">🧁 مشترياتي من المحل (' + store.length + ')</h3>' + store.map(function (t) {
        return '<div class="oc store"><div class="t">🧾</div><div class="m"><b>فاتورة ' + esc(t.invoice_no) + '</b><small>' + esc(dt(t.created_at)) + ' · شراء من المحل</small><small>' + money(t.amount) + (t.points ? ' · +' + t.points + ' نقطة' : '') + '</small></div><span class="ost completed">تم</span></div>';
      }).join('') : '');
    var ls = document.getElementById('olSum'); if (ls) { var tmp = document.getElementById('ordSummary'); ls.innerHTML = tmp ? tmp.innerHTML : ''; }
    Array.prototype.forEach.call(l.querySelectorAll('[data-oid]'), function (a) { a.onclick = function (e) { e.preventDefault(); nav('#shop/orders/' + a.dataset.oid); }; });
  }
  function renderOrder(id) {
    var x = (ORDERS || []).filter(function (o) { return o.id === id; })[0];
    if (!x) {
      view.innerHTML = topBar('تفاصيل الطلب', false) + '<div class="ol"><div class="sk" style="height:240px"></div></div>'; bindBack();
      return loadOrders().then(function () { if (location.hash === '#shop/orders/' + id) { if ((ORDERS || []).some(function (o) { return o.id === id; })) renderOrder(id); else { view.innerHTML = topBar('تفاصيل الطلب', false) + '<div class="sh-empty"><div>📦</div>الطلب ده مش موجود</div>'; bindBack(); } } })
        .catch(function (e) { view.innerHTML = topBar('تفاصيل الطلب', false) + '<div class="sh-empty"><div>⚠️</div>' + esc(e.message) + '</div>'; bindBack(); });
    }
    var row = function (k, v) { return '<div class="od-row"><span>' + k + '</span><span>' + v + '</span></div>'; };
    var its = x.items && x.items.length ? x.items : [{ name: x.product_name, code: x.product_code, color: x.color, variant: x.variant, qty: x.qty, unit_price: x.unit_price, old_price: 0, line_total: x.total, image: x.image }];
    var disc = (x.product_discount || 0) + (x.promo_discount || 0) + (Number(x.birthday_discount) || 0);
    view.innerHTML = topBar('طلب #' + x.order_no, false) + '<div class="ol">' +
      '<div class="pd-sec" style="margin:0"><div class="od-row"><span>الحالة</span><span>' + stBadge(x.status) + '</span></div>' +
      ((x.status === 'rejected' || x.status === 'cancelled') && x.reject_reason ? row(x.status === 'rejected' ? 'سبب الرفض' : 'سبب الإلغاء', '<b style="color:#F87171">' + esc(x.reject_reason) + '</b>') : '') +
      row('رقم الطلب', '#' + x.order_no) + row('تاريخ الطلب', esc(dt(x.created_at))) +
      row('طريقة الاستلام', x.delivery === 'delivery' ? '🚚 التوصيل إلى عنواني' : '🏪 الاستلام من الفرع') + (x.delivery !== 'delivery' && x.branch_name ? row('الفرع', esc(x.branch_name)) : '') + (x.delivery === 'delivery' && x.address ? row('العنوان', esc(x.address)) : '') + '</div>' +
      '<div class="pd-sec" style="margin:0"><h3>🛍️ المنتجات</h3>' + its.map(function (l) {
        return '<div class="co-it"><div class="t">' + (l.image ? img(l.image, '') : '📦') + '</div><div class="m"><b>' + esc(l.name) + '</b>' +
          '<small>' + esc([l.code, l.color, l.variant].filter(Boolean).join(' · ')) + '</small><small>' + l.qty + ' × ' + money(l.unit_price) + (l.old_price ? ' <s>' + money(l.old_price) + '</s>' : '') + '</small></div>' +
          '<span class="lt">' + money(l.line_total) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="pd-sec sum" style="margin:0">' + row('إجمالي المنتجات', money(x.subtotal || x.total)) +
      (x.product_discount > 0 ? '<div class="od-row dc"><span>خصم المنتجات</span><span>− ' + money(x.product_discount) + '</span></div>' : '') +
      (x.promo_code ? '<div class="od-row dc"><span>كود الخصم (' + esc(x.promo_code) + ')</span><span>− ' + money(x.promo_discount) + '</span></div>' : '') +
      (Number(x.birthday_discount) > 0 ? '<div class="od-row dc"><span>🎂 خصم عيد الميلاد</span><span>− ' + money(x.birthday_discount) + '</span></div>' : '') +
      (disc > 0 ? '<div class="od-row dc"><span>إجمالي الخصومات</span><span>− ' + money(disc) + '</span></div>' : '') +
      (x.delivery === 'delivery' ? row('مصاريف التوصيل', x.shipping > 0 ? money(x.shipping) : 'مجاناً') : '') +
      '<div class="od-row fin"><span>الإجمالي النهائي</span><span><b>' + money(x.total) + '</b></span></div>' +
      (x.notes ? row('ملاحظاتك', esc(x.notes)) : '') + '</div>' +
      '<div class="pd-sec" style="margin:0"><h3>متابعة الطلب</h3><ul class="otl">' + (x.history || []).map(function (h) { return '<li>' + esc(ST_AR[h.s] || h.s) + '<small>' + esc(dt(h.at)) + '</small></li>'; }).join('') + '</ul></div>' +
      (x.status === 'pending' ? '<div id="ocErr"></div><button type="button" class="btn ghost" id="oCancel" style="color:#F87171">إلغاء الطلب</button>' : '') +
      '</div>';
    bindBack();
    var cb = document.getElementById('oCancel');
    if (cb) cb.onclick = function () {
      if (cb.dataset.sure !== '1') { cb.dataset.sure = '1'; cb.textContent = 'متأكد؟ اضغط تاني لإلغاء الطلب'; return; }
      cb.disabled = true;
      rpc(['cancelOrder', { token: token(), id: x.id }]).then(function () { loadSummary(); return loadOrders(); }).then(function () { renderOrder(x.id); })
        .catch(function (e) { document.getElementById('ocErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; cb.disabled = false; loadOrders().then(function () { renderOrder(x.id); }); });
    };
  }

  /* ---------- عرض الصور بالكامل: تكبير بإصبعين أو ضغطتين، وسحب للتنقل ---------- */
  function zoom(imgs, start) {
    var i = start, s = 1, x = 0, y = 0;
    var o = document.createElement('div'); o.className = 'zv';
    o.innerHTML = '<div class="zv-top"><span id="zvN"></span><button type="button" id="zvX" aria-label="إغلاق">×</button></div><div class="zv-stage" id="zvS"><img id="zvI" alt=""></div>' +
      (imgs.length > 1 ? '' : '') + '<div class="zv-hint">ضغطتين أو إصبعين للتكبير</div>';
    document.body.appendChild(o);
    var stage = o.querySelector('#zvS'), img = o.querySelector('#zvI');
    if (imgs.length > 1) {
      stage.insertAdjacentHTML('beforeend', '<button type="button" class="zv-nav" style="left:10px" id="zvP">‹</button><button type="button" class="zv-nav" style="right:10px" id="zvF">›</button>');
      o.querySelector('#zvP').onclick = function () { show(i - 1); };
      o.querySelector('#zvF').onclick = function () { show(i + 1); };
    }
    function apply() { img.style.transform = 'translate(-50%,-50%) translate(' + x + 'px,' + y + 'px) scale(' + s + ')'; }
    function show(k) { i = (k + imgs.length) % imgs.length; s = 1; x = 0; y = 0; img.src = imgs[i].u; o.querySelector('#zvN').textContent = imgs.length > 1 ? (i + 1) + ' / ' + imgs.length : ''; apply(); }
    function close() { document.removeEventListener('keydown', key); o.remove(); }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key);
    o.querySelector('#zvX').onclick = close;
    var pts = {}, d0 = 0, s0 = 1, last = null, lastTap = 0, moved = false, sx = 0;
    function dist() { var a = Object.keys(pts).map(function (k) { return pts[k]; }); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      stage.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = false; sx = e.clientX;
      if (Object.keys(pts).length === 2) { d0 = dist(); s0 = s; }
      last = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 2) { s = Math.min(5, Math.max(1, s0 * dist() / d0)); if (s === 1) { x = 0; y = 0; } moved = true; apply(); return; }
      if (s > 1) { x += e.clientX - last.x; y += e.clientY - last.y; apply(); }
      if (Math.abs(e.clientX - sx) > 8) moved = true;
      last = { x: e.clientX, y: e.clientY };
    });
    function up(e) {
      if (!pts[e.pointerId]) return;
      var n = Object.keys(pts).length; delete pts[e.pointerId];
      if (n === 1 && s === 1 && imgs.length > 1 && Math.abs(e.clientX - sx) > 50) return show(i + (e.clientX < sx ? 1 : -1));
      if (n === 1 && !moved) {
        var now = Date.now();
        if (now - lastTap < 320) { if (s > 1) { s = 1; x = 0; y = 0; } else { var r = stage.getBoundingClientRect(); s = 2.5; x = -(e.clientX - r.left - r.width / 2) * 1.5; y = -(e.clientY - r.top - r.height / 2) * 1.5; } apply(); lastTap = 0; }
        else lastTap = now;
      }
      if (Object.keys(pts).length === 1) { var k = Object.keys(pts)[0]; last = pts[k]; }
    }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); s = Math.min(5, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 0.87))); if (s === 1) { x = 0; y = 0; } apply(); }, { passive: false });
    show(i);
  }

  load();
  if (isShop()) route();
  // زرار ⟳ في الكارت يحدّث المنتجات كمان
  var rb = document.getElementById('refreshBtn'); if (rb) rb.addEventListener('click', function () { load(); });
  // لو صفحة الكارت اترسمت تاني نتأكد إن زرار المنتجات لسه موجود
  new MutationObserver(placeEntry).observe(app, { childList: true });
})();
