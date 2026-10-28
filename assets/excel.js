/* bill-insight · Excel 导出（ExcelJS）
 * 生成 7 个工作表：总览 / 统一明细 / 分类汇总 / 退款核对 / 往来明细 / 不计收支 / 待确认分类
 * 净额口径：净额 = 原始金额 − 退款金额；退款不重复计收入。
 */
(function (global) {
  'use strict';

  var FONT = '微软雅黑';
  var C_HEADER = 'FF1F4E78';
  var C_SECTION = 'FFD9E2F3';
  var C_TOTAL = 'FFFFF2CC';
  var C_ALT = 'FFF7F9FC';
  var C_LINE = 'FFBFBFBF';
  var C_TEXT = 'FF333333';
  var MONEY_FMT = '#,##0.00;[Red]-#,##0.00';
  var PCT_FMT = '0.0%';
  var DATE_FMT = 'yyyy-mm-dd hh:mm';
  var INT_FMT = '#,##0';

  function thin() {
    return {
      top: { style: 'thin', color: { argb: C_LINE } },
      left: { style: 'thin', color: { argb: C_LINE } },
      bottom: { style: 'thin', color: { argb: C_LINE } },
      right: { style: 'thin', color: { argb: C_LINE } }
    };
  }
  function font(size, bold, color) {
    return { name: FONT, size: size || 10, bold: !!bold, color: { argb: color || C_TEXT } };
  }
  function fill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
  }
  /* Excel 序列号：UTC 分量即表格墙上时间，避免时区偏移 */
  function serial(v) {
    var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
    if (!m) return null;
    var u = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return 25569 + u / 86400000;
  }
  function put(ws, r, c, value, opt) {
    opt = opt || {};
    var cell = ws.getCell(r, c);
    var isDate = opt.date && value;
    cell.value = isDate ? serial(value) : value;
    cell.font = font(opt.size || 10, opt.bold, opt.color);
    if (opt.fill) cell.fill = fill(opt.fill);
    cell.alignment = {
      vertical: 'middle',
      horizontal: opt.align || 'left',
      wrapText: !!opt.wrap,
      indent: opt.indent || 0
    };
    if (opt.border !== false) cell.border = thin();
    if (isDate) cell.numFmt = DATE_FMT;
    else if (opt.money) cell.numFmt = MONEY_FMT;
    else if (opt.pct) cell.numFmt = PCT_FMT;
    else if (opt.int) cell.numFmt = INT_FMT;
    return cell;
  }
  function title(ws, text, cols, sub) {
    ws.mergeCells(1, 1, 1, cols);
    var t = ws.getCell(1, 1);
    t.value = text;
    t.font = font(20, true, 'FFFFFFFF');
    t.fill = fill(C_HEADER);
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 40;

    if (sub) {
      ws.mergeCells(2, 1, 2, cols);
      var s = ws.getCell(2, 1);
      s.value = sub;
      s.font = font(10, false, 'FF64748B');
      s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(2).height = 22;
    }
  }
  function section(ws, r, text, cols) {
    ws.mergeCells(r, 1, r, cols);
    var c = ws.getCell(r, 1);
    c.value = text;
    c.font = font(11, true, 'FF1F4E78');
    c.fill = fill(C_SECTION);
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(r).height = 22;
  }
  function headRow(ws, r, heads, widths) {
    heads.forEach(function (h, i) {
      put(ws, r, i + 1, h, { bold: true, color: 'FFFFFFFF', fill: C_HEADER, align: 'center' });
    });
    ws.getRow(r).height = 20;
    if (widths) widths.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
  }
  function num(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  /* ---------------- 总览 ---------------- */
  function sheetOverview(wb, bill, Core, sumInfo) {
    var ws = wb.addWorksheet('总览', { views: [{ state: 'frozen', ySplit: 0 }] });
    var m = bill.meta || {};
    title(ws, m.title || '消费账单', 8,
      (m.period || '') + ' · ' + (m.source || '') + ' · 净额口径 · 生成于 ' + (m.generated || ''));
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 16;
    ws.getColumn(8).width = 30;

    var r = 4;
    section(ws, r++, '核心指标', 8);
    headRow(ws, r++, ['指标', '数值', '说明']);
    var k = sumInfo.k;
    var rows = [
      ['净支出（含往来）', k.totalExp, '所有支出净额之和', true],
      ['纯消费（不含往来）', k.pure, '剔除转账 / 红包 / 群收款', true],
      ['往来支出', k.rel, '转账 / 红包 / 群收款净额', true],
      ['净收入', k.totalInc, '所有收入净额之和', true],
      ['退款冲减', k.refund, sumInfo.refundN + ' 笔退款，已并入原单', true],
      ['跨年 / 无原单退款', sumInfo.unmatchedAmt, '未冲减本期消费，单列核对', true],
      ['有效支出笔数', k.validExpCount, '净额 > 0 的支出', false],
      ['原始支出笔数', k.expCount, '含全额退款后净额为 0 的笔数', false],
      ['收入笔数', k.incCount, '', false],
      ['不计收支笔数', bill.neutral.length, '提现 / 零钱通 / 余额宝 / 关闭订单', false],
      ['待确认分类商户', bill.unknown.length, '落入「其他」的支出商户数', false],
      ['原始记录数', (m.counts && (m.counts.wechat + m.counts.alipay)) || 0,
        '微信 ' + ((m.counts && m.counts.wechat) || 0) + ' 条 + 支付宝 ' + ((m.counts && m.counts.alipay) || 0) + ' 条', false]
    ];
    rows.forEach(function (x) {
      put(ws, r, 1, x[0], { bold: true });
      if (x[3]) put(ws, r, 2, x[1], { money: true, align: 'right', bold: true });
      else put(ws, r, 2, x[1], { int: true, align: 'right', bold: true });
      put(ws, r, 3, x[2], { color: 'FF64748B' });
      ws.mergeCells(r, 3, r, 8);
      r++;
    });

    r++;
    section(ws, r++, '分平台汇总', 8);
    headRow(ws, r++, ['平台', '净支出', '纯消费', '净收入', '退款冲减', '支出笔数', '收入笔数', '备注']);
    var plats = ['微信', '支付宝'].filter(function (p) {
      return bill.detail.some(function (x) { return x.p === p; });
    });
    plats.forEach(function (p) {
      var rs = bill.detail.filter(function (x) { return x.p === p; });
      var pk = Core.kpis(rs);
      put(ws, r, 1, p, { bold: true });
      put(ws, r, 2, pk.totalExp, { money: true, align: 'right' });
      put(ws, r, 3, pk.pure, { money: true, align: 'right' });
      put(ws, r, 4, pk.totalInc, { money: true, align: 'right' });
      put(ws, r, 5, pk.refund, { money: true, align: 'right' });
      put(ws, r, 6, pk.expCount, { int: true, align: 'right' });
      put(ws, r, 7, pk.incCount, { int: true, align: 'right' });
      put(ws, r, 8, p === '支付宝' ? '官方支出已含退款，此处按净额重算' : '退款是独立收入行，已回填原单', { color: 'FF64748B' });
      r++;
    });
    put(ws, r, 1, '合计', { bold: true, fill: C_TOTAL });
    [2, 3, 4, 5].forEach(function (c) { put(ws, r, c, ws.getCell(r - 1, c).value + (plats.length > 1 ? ws.getCell(r - 2, c).value : 0), { money: true, align: 'right', bold: true, fill: C_TOTAL }); });
    [6, 7].forEach(function (c) { put(ws, r, c, ws.getCell(r - 1, c).value + (plats.length > 1 ? ws.getCell(r - 2, c).value : 0), { int: true, align: 'right', bold: true, fill: C_TOTAL }); });
    put(ws, r, 8, '', { fill: C_TOTAL });
    r += 2;

    section(ws, r++, '分月汇总', 8);
    headRow(ws, r++, ['月份', '净支出', '净收入', '退款冲减', '支出笔数', '净额占全年']);
    var ms = Core.monthSeries({ months: [], platform: 'all', category: 'all' });
    var totalExp = k.totalExp || 1;
    ms.forEach(function (x, i) {
      put(ws, r, 1, x.m, { bold: true });
      put(ws, r, 2, x.exp, { money: true, align: 'right' });
      put(ws, r, 3, x.inc, { money: true, align: 'right' });
      put(ws, r, 4, x.ref, { money: true, align: 'right' });
      put(ws, r, 5, x.n, { int: true, align: 'right' });
      put(ws, r, 6, x.exp / totalExp, { pct: true, align: 'right' });
      if (i % 2 === 1) for (var c = 1; c <= 6; c++) ws.getCell(r, c).fill = fill(C_ALT);
      r++;
    });
    put(ws, r, 1, '合计', { bold: true, fill: C_TOTAL });
    [2, 3, 4].forEach(function (c) {
      var v = 0;
      for (var i = 0; i < ms.length; i++) v += Number(ws.getCell(r - ms.length + i, c).value) || 0;
      put(ws, r, c, num(v), { money: true, align: 'right', bold: true, fill: C_TOTAL });
    });
    var cnt = 0;
    for (var i2 = 0; i2 < ms.length; i2++) cnt += Number(ws.getCell(r - ms.length + i2, 5).value) || 0;
    put(ws, r, 5, cnt, { int: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 6, 1, { pct: true, align: 'right', bold: true, fill: C_TOTAL });
    r += 2;

    section(ws, r++, '支出分类汇总', 8);
    headRow(ws, r++, ['分类', '净支出', '退款冲减', '笔数', '占净支出']);
    var cats = Core.categorySeries({ months: [], platform: 'all', category: 'all' });
    cats.forEach(function (x, i) {
      put(ws, r, 1, x.cat, { bold: true });
      put(ws, r, 2, x.net, { money: true, align: 'right' });
      put(ws, r, 3, x.ref, { money: true, align: 'right' });
      put(ws, r, 4, x.n, { int: true, align: 'right' });
      put(ws, r, 5, x.net / totalExp, { pct: true, align: 'right' });
      if (i % 2 === 1) for (var c2 = 1; c2 <= 5; c2++) ws.getCell(r, c2).fill = fill(C_ALT);
      r++;
    });
    put(ws, r, 1, '合计', { bold: true, fill: C_TOTAL });
    put(ws, r, 2, k.totalExp, { money: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 3, k.refund, { money: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 4, k.expCount, { int: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 5, 1, { pct: true, align: 'right', bold: true, fill: C_TOTAL });
    r += 2;

    section(ws, r++, '商户 / 交易对方 TOP 15（不含往来）', 8);
    headRow(ws, r++, ['排名', '交易对方', '分类', '净支出', '笔数']);
    Core.topMerchants({ months: [], platform: 'all', category: 'all' }, 15).forEach(function (x, i) {
      put(ws, r, 1, i + 1, { int: true, align: 'center' });
      put(ws, r, 2, x.mer);
      put(ws, r, 3, x.cat, { color: 'FF64748B' });
      put(ws, r, 4, x.net, { money: true, align: 'right' });
      put(ws, r, 5, x.n, { int: true, align: 'right' });
      r++;
    });
    r++;

    section(ws, r++, '往来对象 TOP 15', 8);
    headRow(ws, r++, ['排名', '往来对象', '平台', '转出', '转入', '笔数']);
    Core.topPeople({ months: [], platform: 'all', category: 'all' }, 15).forEach(function (x, i) {
      put(ws, r, 1, i + 1, { int: true, align: 'center' });
      put(ws, r, 2, x.who);
      put(ws, r, 3, x.p, { color: 'FF64748B' });
      put(ws, r, 4, x.out, { money: true, align: 'right' });
      put(ws, r, 5, x.in, { money: true, align: 'right' });
      put(ws, r, 6, x.n, { int: true, align: 'right' });
      r++;
    });
    r++;

    section(ws, r++, '口径说明', 8);
    var notes = [
      '1. 净额口径：每笔消费先记原始金额，再把退款回填到原单，净额 = 原始金额 − 退款金额；退款不再作为收入重复计入。',
      '2. 净支出（含往来）= 所有支出净额之和；纯消费 = 剔除转账、红包、群收款后的消费支出。',
      '3. 跨年退款：对应上一年订单的退款不冲减本期消费，单独列入「退款核对」备查。',
      '4. 平台差异：支付宝官方「支出」已扣退款，微信未扣；两边原始汇总不能直接相加，本表统一按净额重算。',
      '5. 分类：支付宝沿用自带分类；微信无分类，按商户关键词词典识别，未命中的归入「其他」，见「待确认分类」。',
      '6. 不计收支：零钱提现、零钱通 / 余额宝存取、订单关闭等资金搬运不计入消费。'
    ];
    notes.forEach(function (t) {
      ws.mergeCells(r, 1, r, 8);
      put(ws, r, 1, t, { color: 'FF64748B', wrap: true, border: false });
      ws.getRow(r).height = 30;
      r++;
    });
  }

  /* ---------------- 统一明细 ---------------- */
  function sheetDetail(wb, bill) {
    var ws = wb.addWorksheet('统一明细', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    var heads = ['序号', '时间', '月份', '平台', '收支', '分类', '分类来源', '往来对象', '交易对方',
      '商品说明', '原始金额', '退款金额', '净金额', '退款类型', '支付方式', '当前状态',
      '原始类型', '订单号', '关联退款单号', '退款时间', '备注'];
    var widths = [6, 17, 9, 8, 7, 12, 9, 14, 22, 34, 12, 11, 12, 9, 18, 16, 12, 30, 30, 17, 18];
    headRow(ws, 1, heads, widths);
    bill.detail.forEach(function (r, i) {
      var row = i + 2;
      put(ws, row, 1, r.id, { int: true, align: 'center' });
      put(ws, row, 2, r.t, { date: true });
      put(ws, row, 3, r.m, { align: 'center' });
      put(ws, row, 4, r.p, { align: 'center' });
      put(ws, row, 5, r.dir, { align: 'center' });
      put(ws, row, 6, r.cat);
      put(ws, row, 7, r.cs || '');
      put(ws, row, 8, r.who || '');
      put(ws, row, 9, r.mer || '');
      put(ws, row, 10, r.desc || '');
      put(ws, row, 11, r.amt, { money: true, align: 'right' });
      put(ws, row, 12, r.ref, { money: true, align: 'right' });
      put(ws, row, 13, r.net, { money: true, align: 'right', bold: true });
      put(ws, row, 14, r.rtype || '', { align: 'center' });
      put(ws, row, 15, r.pay || '');
      put(ws, row, 16, r.st || '');
      put(ws, row, 17, r.ot || '');
      put(ws, row, 18, r.oid || '');
      put(ws, row, 19, r.rids || '');
      if (r.rt) put(ws, row, 20, r.rt, { date: true });
      else put(ws, row, 20, '');
      put(ws, row, 21, r.note || '');
      if (i % 2 === 1) {
        for (var c = 1; c <= 21; c++) {
          if (!ws.getCell(row, c).fill || ws.getCell(row, c).fill.type !== 'pattern') {
            ws.getCell(row, c).fill = fill(C_ALT);
          }
        }
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  }

  /* ---------------- 分类汇总 ---------------- */
  function sheetCategory(wb, bill, Core) {
    var ws = wb.addWorksheet('分类汇总');
    var ms = Core.monthSeries({ months: [], platform: 'all', category: 'all' });
    var cats = Core.categorySeries({ months: [], platform: 'all', category: 'all' });
    var heads = ['月份'].concat(cats.map(function (x) { return x.cat; })).concat(['合计']);
    var widths = [10].concat(cats.map(function () { return 13; })).concat([13]);
    title(ws, '支出分类 × 月份（净额）', heads.length,
      '单位：元 · 净额 = 原始金额 − 退款金额 · 生成于 ' + ((bill.meta && bill.meta.generated) || ''));
    headRow(ws, 4, heads, widths);

    var r = 5;
    ms.forEach(function (m) {
      put(ws, r, 1, m.m, { bold: true });
      var tot = 0;
      cats.forEach(function (c, i) {
        var v = 0;
        bill.detail.forEach(function (x) {
          if (x.m === m.m && x.dir === '支出' && x.cat === c.cat) v += x.net;
        });
        v = num(v);
        tot += v;
        put(ws, r, i + 2, v || null, { money: true, align: 'right' });
      });
      put(ws, r, heads.length, num(tot), { money: true, align: 'right', bold: true });
      r++;
    });
    put(ws, r, 1, '合计', { bold: true, fill: C_TOTAL });
    for (var c = 2; c <= heads.length; c++) {
      var s = 0;
      for (var i = 5; i < r; i++) s += Number(ws.getCell(i, c).value) || 0;
      put(ws, r, c, num(s), { money: true, align: 'right', bold: true, fill: C_TOTAL });
    }
    r += 2;

    section(ws, r++, '收入分类汇总', heads.length);
    headRow(ws, r++, ['分类', '净收入', '笔数', '占净收入']);
    var incMap = {};
    bill.detail.filter(function (x) { return x.dir === '收入'; }).forEach(function (x) {
      if (!incMap[x.cat]) incMap[x.cat] = { net: 0, n: 0 };
      incMap[x.cat].net += x.net;
      incMap[x.cat].n += 1;
    });
    var totalInc = 0;
    Object.keys(incMap).forEach(function (k) { totalInc += incMap[k].net; });
    Object.keys(incMap).sort(function (a, b) { return incMap[b].net - incMap[a].net; }).forEach(function (k) {
      put(ws, r, 1, k, { bold: true });
      put(ws, r, 2, num(incMap[k].net), { money: true, align: 'right' });
      put(ws, r, 3, incMap[k].n, { int: true, align: 'right' });
      put(ws, r, 4, totalInc > 0 ? incMap[k].net / totalInc : 0, { pct: true, align: 'right' });
      r++;
    });
    put(ws, r, 1, '合计', { bold: true, fill: C_TOTAL });
    put(ws, r, 2, num(totalInc), { money: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 3, bill.detail.filter(function (x) { return x.dir === '收入'; }).length, { int: true, align: 'right', bold: true, fill: C_TOTAL });
    put(ws, r, 4, totalInc > 0 ? 1 : 0, { pct: true, align: 'right', bold: true, fill: C_TOTAL });
  }

  /* ---------------- 退款核对 ---------------- */
  function sheetRefund(wb, bill, Core) {
    var ws = wb.addWorksheet('退款核对', { views: [{ state: 'frozen', ySplit: 1 }] });
    var heads = ['退款时间', '平台', '商户 / 对方', '退款金额', '退款单号', '原单时间', '原单金额',
      '原单订单号', '原单状态', '匹配结果', '分类', '归属月份'];
    var widths = [17, 8, 26, 12, 34, 17, 12, 34, 16, 14, 12, 11];
    headRow(ws, 1, heads, widths);
    var cm = Core.detailCatMap();
    bill.refunds.forEach(function (x, i) {
      var row = i + 2;
      put(ws, row, 1, x.t, { date: true });
      put(ws, row, 2, x.p, { align: 'center' });
      put(ws, row, 3, x.mer);
      put(ws, row, 4, x.amt, { money: true, align: 'right' });
      put(ws, row, 5, x.rid);
      if (x.ot) put(ws, row, 6, x.ot, { date: true });
      else put(ws, row, 6, '—', { align: 'center' });
      put(ws, row, 7, x.oamt || null, { money: true, align: 'right' });
      put(ws, row, 8, x.ooid || '');
      put(ws, row, 9, x.ost || '');
      put(ws, row, 10, x.match, { align: 'center', color: x.match === '已匹配' ? 'FF047857' : 'FFB91C1C', bold: true });
      put(ws, row, 11, cm[x.ooid] || '跨年退款');
      put(ws, row, 12, x.om, { align: 'center' });
      if (i % 2 === 1) for (var c = 1; c <= heads.length; c++) ws.getCell(row, c).fill = fill(C_ALT);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  }

  /* ---------------- 往来明细 ---------------- */
  function sheetTransfer(wb, bill, Core) {
    var ws = wb.addWorksheet('往来明细', { views: [{ state: 'frozen', ySplit: 1 }] });
    var heads = ['时间', '平台', '分类', '往来对象', '原始类型', '原始金额', '退款金额', '净金额',
      '支付方式', '订单号', '备注'];
    var widths = [17, 8, 12, 22, 14, 12, 11, 12, 18, 32, 18];
    headRow(ws, 1, heads, widths);
    var list = bill.detail.filter(function (x) {
      return Core.TRANSFER.indexOf(x.cat) >= 0 || (x.who && x.dir === '收入');
    });
    list.forEach(function (x, i) {
      var row = i + 2;
      put(ws, row, 1, x.t, { date: true });
      put(ws, row, 2, x.p, { align: 'center' });
      put(ws, row, 3, x.cat);
      put(ws, row, 4, x.who || x.mer);
      put(ws, row, 5, x.ot || '');
      put(ws, row, 6, x.amt, { money: true, align: 'right' });
      put(ws, row, 7, x.ref, { money: true, align: 'right' });
      put(ws, row, 8, x.net, { money: true, align: 'right', bold: true });
      put(ws, row, 9, x.pay || '');
      put(ws, row, 10, x.oid || '');
      put(ws, row, 11, x.note || '');
      if (i % 2 === 1) for (var c = 1; c <= heads.length; c++) ws.getCell(row, c).fill = fill(C_ALT);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  }

  /* ---------------- 不计收支 ---------------- */
  function sheetNeutral(wb, bill) {
    var ws = wb.addWorksheet('不计收支', { views: [{ state: 'frozen', ySplit: 1 }] });
    var heads = ['时间', '平台', '原始类型', '交易对方', '商品说明', '金额', '原始状态', '排除原因'];
    var widths = [17, 8, 16, 26, 42, 12, 18, 36];
    headRow(ws, 1, heads, widths);
    bill.neutral.forEach(function (x, i) {
      var row = i + 2;
      put(ws, row, 1, x.t, { date: true });
      put(ws, row, 2, x.p, { align: 'center' });
      put(ws, row, 3, x.type || '');
      put(ws, row, 4, x.mer || '');
      put(ws, row, 5, x.desc || '');
      put(ws, row, 6, x.amt, { money: true, align: 'right' });
      put(ws, row, 7, x.st || '');
      put(ws, row, 8, x.reason || '', { color: 'FF64748B' });
      if (i % 2 === 1) for (var c = 1; c <= heads.length; c++) ws.getCell(row, c).fill = fill(C_ALT);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  }

  /* ---------------- 待确认分类 ---------------- */
  function sheetUnknown(wb, bill, categories) {
    var ws = wb.addWorksheet('待确认分类', { views: [{ state: 'frozen', ySplit: 1 }] });
    var heads = ['商户', '笔数', '净金额', '退款金额', '示例商品', '支付方式', '建议分类'];
    var widths = [34, 8, 12, 12, 44, 20, 16];
    headRow(ws, 1, heads, widths);
    bill.unknown.forEach(function (x, i) {
      var row = i + 2;
      put(ws, row, 1, x.mer, { bold: true });
      put(ws, row, 2, x.n, { int: true, align: 'right' });
      put(ws, row, 3, x.net, { money: true, align: 'right' });
      put(ws, row, 4, x.ref, { money: true, align: 'right' });
      put(ws, row, 5, x.sample || '');
      put(ws, row, 6, x.pay || '');
      var cell = put(ws, row, 7, '', { fill: 'FFFFFBEB' });
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"' + categories.join(',') + '"'],
        showErrorMessage: false
      };
      if (i % 2 === 1) for (var c = 1; c <= heads.length; c++) ws.getCell(row, c).fill = fill(C_ALT);
    });
    var tip = ws.getRow(bill.unknown.length + 3);
    tip.getCell(1).value = '提示：在大屏「待确认分类」里点选即可立即重算；导出的 Excel 仅供存档。';
    tip.getCell(1).font = font(9, false, 'FF94A3B8');
  }

  function build(bill, Core) {
    var wb = new global.ExcelJS.Workbook();
    wb.creator = 'bill-insight';
    wb.created = new Date();

    var k = Core.kpis(bill.detail);
    var rf = bill.refunds;
    var sumInfo = {
      k: k,
      refundN: rf.length,
      matchedN: rf.filter(function (x) { return x.match === '已匹配'; }).length,
      unmatchedAmt: num(rf.filter(function (x) { return x.match !== '已匹配'; }).reduce(function (s, x) { return s + x.amt; }, 0))
    };

    sheetOverview(wb, bill, Core, sumInfo);
    sheetDetail(wb, bill);
    sheetCategory(wb, bill, Core);
    sheetRefund(wb, bill, Core);
    sheetTransfer(wb, bill, Core);
    sheetNeutral(wb, bill);
    sheetUnknown(wb, bill, global.BillParser ? global.BillParser.CATEGORIES : []);
    return wb;
  }

  function fileName(bill) {
    var m = bill.meta || {};
    var year = m.year || '';
    return (year ? year + '年' : '') + '消费账单整合.xlsx';
  }

  function download(bill, Core) {
    var wb = build(bill, Core);
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(bill);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      return fileName(bill);
    });
  }

  global.BillExcel = { build: build, download: download, fileName: fileName };
})(typeof window !== 'undefined' ? window : globalThis);
