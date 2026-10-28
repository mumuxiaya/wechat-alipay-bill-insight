/* bill-insight · 统计口径层
 * 只做纯函数聚合，不碰 DOM。
 * 数据通过 BillData.setData(bill) 注入，MONTHS / CATS / PLATFORMS 原地更新，
 * 这样 charts.js 里对 Core.MONTHS 的运行时引用始终有效。
 */
(function () {
  'use strict';

  var EMPTY = { meta: {}, detail: [], refunds: [], neutral: [], unknown: [] };
  var B = EMPTY;
  var TRANSFER = ['转账往来', '红包往来', '群收款'];
  var MONTHS = [];
  var CATS = [];
  var PLATFORMS = [];
  var _catMap = null;

  function setData(bill) {
    B = bill || EMPTY;
    var months = Array.from(new Set(B.detail.map(function (r) { return r.m; }))).sort();
    MONTHS.length = 0;
    months.forEach(function (m) { MONTHS.push(m); });

    var cats = Array.from(new Set(B.detail.map(function (r) { return r.cat; })));
    CATS.length = 0;
    cats.forEach(function (c) { CATS.push(c); });

    var plats = [];
    ['微信', '支付宝'].forEach(function (p) {
      if (B.detail.some(function (r) { return r.p === p; })) plats.push(p);
    });
    B.detail.forEach(function (r) { if (plats.indexOf(r.p) < 0) plats.push(r.p); });
    PLATFORMS.length = 0;
    plats.forEach(function (p) { PLATFORMS.push(p); });

    _catMap = null;
  }

  function data() { return B; }

  function sum(arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i]) : arr[i];
    return t;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmtMoney(v) {
    return (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(v) { return (Number(v) || 0).toLocaleString('zh-CN'); }
  function fmtPct(v) { return (Number(v) * 100).toFixed(1) + '%'; }
  function fmtWan(v) {
    var n = Number(v) || 0;
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return fmtMoney(n);
  }
  function fmtAxis(v) {
    var n = Number(v) || 0;
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万';
    return n;
  }
  /* 单年 → 1月；跨年 → 25/12 */
  function monthLabel(m) {
    if (!m) return '';
    var years = {};
    MONTHS.forEach(function (x) { years[x.slice(0, 4)] = 1; });
    if (Object.keys(years).length <= 1) return parseInt(m.slice(5), 10) + '月';
    return m.slice(2, 4) + '/' + m.slice(5);
  }

  function match(r, state, opts) {
    opts = opts || {};
    if (!opts.ignoreMonth && state.months.length && state.months.indexOf(r.m) < 0) return false;
    if (state.platform !== 'all' && r.p !== state.platform) return false;
    if (!opts.ignoreCategory && state.category !== 'all' && r.cat !== state.category) return false;
    return true;
  }
  function rows(state, opts) {
    return B.detail.filter(function (r) { return match(r, state, opts); });
  }

  function kpis(rs) {
    var e = rs.filter(function (r) { return r.dir === '支出'; });
    var i = rs.filter(function (r) { return r.dir === '收入'; });
    var totalExp = r2(sum(e, function (r) { return r.net; }));
    var totalInc = r2(sum(i, function (r) { return r.net; }));
    var refund = r2(sum(e, function (r) { return r.ref; }));
    var rel = r2(sum(e.filter(function (r) { return TRANSFER.indexOf(r.cat) >= 0; }), function (r) { return r.net; }));
    return {
      totalExp: totalExp,
      totalInc: totalInc,
      refund: refund,
      rel: rel,
      pure: r2(totalExp - rel),
      expCount: e.length,
      incCount: i.length,
      validExpCount: e.filter(function (r) { return r.net > 0.005; }).length,
      zeroExpCount: e.filter(function (r) { return r.net <= 0.005; }).length
    };
  }

  function monthSeries(state) {
    var base = rows(state, { ignoreMonth: true });
    var e = base.filter(function (r) { return r.dir === '支出'; });
    var i = base.filter(function (r) { return r.dir === '收入'; });
    return MONTHS.map(function (m) {
      var me = e.filter(function (r) { return r.m === m; });
      var mi = i.filter(function (r) { return r.m === m; });
      return {
        m: m,
        exp: r2(sum(me, function (r) { return r.net; })),
        inc: r2(sum(mi, function (r) { return r.net; })),
        ref: r2(sum(me, function (r) { return r.ref; })),
        n: me.length
      };
    });
  }

  function categorySeries(state) {
    var base = rows(state, { ignoreCategory: true }).filter(function (r) { return r.dir === '支出'; });
    var map = {};
    base.forEach(function (r) {
      if (!map[r.cat]) map[r.cat] = { cat: r.cat, net: 0, ref: 0, n: 0 };
      map[r.cat].net += r.net;
      map[r.cat].ref += r.ref;
      map[r.cat].n += 1;
    });
    return Object.keys(map).map(function (k) {
      return { cat: k, net: r2(map[k].net), ref: r2(map[k].ref), n: map[k].n };
    }).sort(function (a, b) { return b.net - a.net; });
  }

  function platformSeries(state) {
    var base = rows(state);
    return PLATFORMS.map(function (p) {
      var e = base.filter(function (r) { return r.p === p && r.dir === '支出'; });
      var i = base.filter(function (r) { return r.p === p && r.dir === '收入'; });
      return {
        p: p,
        exp: r2(sum(e, function (r) { return r.net; })),
        inc: r2(sum(i, function (r) { return r.net; })),
        ref: r2(sum(e, function (r) { return r.ref; }))
      };
    });
  }

  function topMerchants(state, n) {
    var e = rows(state).filter(function (r) { return r.dir === '支出' && TRANSFER.indexOf(r.cat) < 0; });
    var map = {};
    e.forEach(function (r) {
      if (!map[r.mer]) map[r.mer] = { mer: r.mer, cat: r.cat, net: 0, n: 0 };
      map[r.mer].net += r.net;
      map[r.mer].n += 1;
    });
    return Object.keys(map).map(function (k) {
      return { mer: map[k].mer, cat: map[k].cat, net: r2(map[k].net), n: map[k].n };
    }).filter(function (x) { return x.net > 0.005; }).sort(function (a, b) { return b.net - a.net; }).slice(0, n || 10);
  }

  function topPeople(state, n) {
    var base = rows(state).filter(function (r) { return !!r.who; });
    var map = {};
    base.forEach(function (r) {
      var k = r.who + '|' + r.p;
      if (!map[k]) map[k] = { who: r.who, p: r.p, out: 0, in: 0, n: 0 };
      if (r.dir === '支出') map[k].out += r.net; else map[k].in += r.net;
      map[k].n += 1;
    });
    return Object.keys(map).map(function (k) {
      var x = map[k];
      return { who: x.who, p: x.p, out: r2(x.out), in: r2(x.in), total: r2(x.out + x.in), n: x.n };
    }).filter(function (x) { return x.total > 0.005; }).sort(function (a, b) { return b.total - a.total; }).slice(0, n || 10);
  }

  function detailCatMap() {
    if (_catMap) return _catMap;
    _catMap = {};
    B.detail.forEach(function (r) { _catMap[r.oid] = r.cat; });
    return _catMap;
  }

  function refundRows(state) {
    var cm = detailCatMap();
    return B.refunds.filter(function (r) {
      if (state.platform !== 'all' && r.p !== state.platform) return false;
      if (state.months.length && state.months.indexOf(r.om) < 0) return false;
      if (state.category !== 'all' && (cm[r.ooid] || '跨年退款') !== state.category) return false;
      return true;
    }).map(function (r) {
      var x = Object.assign({}, r);
      x.cat = cm[r.ooid] || '跨年退款';
      return x;
    });
  }

  function refundSummary(state) {
    var rf = refundRows(state);
    var matched = rf.filter(function (r) { return r.match === '已匹配'; });
    var unmatched = rf.filter(function (r) { return r.match !== '已匹配'; });
    return {
      n: rf.length,
      amt: r2(sum(rf, function (r) { return r.amt; })),
      matchedN: matched.length,
      matchedAmt: r2(sum(matched, function (r) { return r.amt; })),
      unmatchedN: unmatched.length,
      unmatchedAmt: r2(sum(unmatched, function (r) { return r.amt; }))
    };
  }

  function neutralRows(state) {
    return B.neutral.filter(function (r) {
      if (state.platform !== 'all' && r.p !== state.platform) return false;
      var m = String(r.t || '').slice(0, 7);
      if (state.months.length && state.months.indexOf(m) < 0) return false;
      return true;
    });
  }

  function insights(state) {
    var ms = monthSeries(state).filter(function (x) { return x.exp > 0; }).sort(function (a, b) { return b.exp - a.exp; });
    var cs = categorySeries(state).filter(function (x) { return x.net > 0; });
    var rc = cs.filter(function (x) { return x.ref > 0; }).sort(function (a, b) { return b.ref - a.ref; });
    var mm = topMerchants(state, 1);
    return {
      month: ms[0] || null,
      cat: cs[0] || null,
      refundCat: rc[0] || null,
      merchant: mm[0] || null
    };
  }

  function unknownSummary() {
    return {
      n: B.unknown.length,
      amt: r2(sum(B.unknown, function (r) { return r.net; }))
    };
  }

  window.BillCore = {
    MONTHS: MONTHS,
    CATS: CATS,
    PLATFORMS: PLATFORMS,
    TRANSFER: TRANSFER,
    setData: setData,
    data: data,
    sum: sum,
    r2: r2,
    fmtMoney: fmtMoney,
    fmtInt: fmtInt,
    fmtPct: fmtPct,
    fmtWan: fmtWan,
    fmtAxis: fmtAxis,
    monthLabel: monthLabel,
    rows: rows,
    kpis: kpis,
    monthSeries: monthSeries,
    categorySeries: categorySeries,
    platformSeries: platformSeries,
    topMerchants: topMerchants,
    topPeople: topPeople,
    detailCatMap: detailCatMap,
    refundRows: refundRows,
    refundSummary: refundSummary,
    neutralRows: neutralRows,
    insights: insights,
    unknownSummary: unknownSummary
  };
})();
