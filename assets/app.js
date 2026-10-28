/* bill-insight · 交互层
 * 上传驱动：文件 → parser → core → charts / drawer / excel
 */
(function () {
  'use strict';

  var Parser = window.BillParser;
  var Core = window.BillCore;
  var Charts = window.BillCharts;

  var LS_KEY = 'bill-insight:overrides';

  var state = { months: [], platform: 'all', category: 'all' };
  var drawerState = {
    open: false,
    tab: 'detail',
    search: '',
    page: 1,
    pageSize: 50,
    sortKey: 't',
    sortDir: 'desc',
    expanded: null
  };

  var library = [];    // 已导入文件 [{name,platform,rows,n,first,last,year,sig,at}]
  var bill = null;     // buildBill 结果
  var overrides = loadOverrides();
  var chartsReady = false;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escAttr(v) { return esc(v).replace(/`/g, '&#96;'); }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var firstRender = true;

  /* ---------------- overrides 持久化 ---------------- */
  function loadOverrides() {
    try {
      var s = window.localStorage.getItem(LS_KEY);
      var o = s ? JSON.parse(s) : null;
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function saveOverrides() {
    try {
      if (Object.keys(overrides).length) window.localStorage.setItem(LS_KEY, JSON.stringify(overrides));
      else window.localStorage.removeItem(LS_KEY);
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ---------------- KPI 数字动效 ---------------- */
  function animateNumber(el, to, decimals, immediate) {
    var from = parseFloat(el.dataset.value || '0');
    el.dataset.value = to;
    if (immediate || reduceMotion) {
      el.textContent = decimals ? Core.fmtMoney(to) : Core.fmtInt(Math.round(to));
      return;
    }
    var start = performance.now();
    var dur = 520;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var v = from + (to - from) * eased;
      el.textContent = decimals ? Core.fmtMoney(v) : Core.fmtInt(Math.round(v));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- 筛选器 ---------------- */
  function buildFilters() {
    var wrap = $('month-chips');
    wrap.innerHTML = '';
    var allBtn = document.createElement('button');
    allBtn.className = 'chip-btn';
    allBtn.dataset.month = '';
    allBtn.textContent = '全部';
    wrap.appendChild(allBtn);
    Core.MONTHS.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'chip-btn';
      b.dataset.month = m;
      b.textContent = Core.monthLabel(m);
      wrap.appendChild(b);
    });

    var seg = $('platform-seg');
    seg.innerHTML = '';
    ['all'].concat(Core.PLATFORMS).forEach(function (p) {
      var b = document.createElement('button');
      b.dataset.platform = p;
      b.textContent = p === 'all' ? '全部' : p;
      seg.appendChild(b);
    });
    $('platform-group').style.display = Core.PLATFORMS.length > 1 ? '' : 'none';

    var sel = $('category-select');
    sel.innerHTML = '<option value="all">全部分类</option>';
    Core.categorySeries({ months: [], platform: 'all', category: 'all' }).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.cat;
      o.textContent = c.cat;
      sel.appendChild(o);
    });
  }

  function bindFilters() {
    $('month-chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip-btn');
      if (!b || !bill) return;
      if (!b.dataset.month) state.months = [];
      else toggleMonth(b.dataset.month);
      refresh();
    });

    $('platform-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !bill) return;
      var p = b.dataset.platform;
      state.platform = (state.platform === p && p !== 'all') ? 'all' : p;
      refresh();
    });

    $('category-select').addEventListener('change', function () {
      if (!bill) return;
      state.category = this.value;
      refresh();
    });

    $('reset-filters').addEventListener('click', function () {
      if (!bill) return;
      state.months = [];
      state.platform = 'all';
      state.category = 'all';
      refresh();
    });
  }

  function toggleMonth(m) {
    var i = state.months.indexOf(m);
    if (i >= 0) state.months.splice(i, 1);
    else state.months.push(m);
    state.months.sort();
    if (state.months.length === Core.MONTHS.length) state.months = [];
  }

  function syncUI() {
    document.querySelectorAll('#month-chips .chip-btn').forEach(function (b) {
      var m = b.dataset.month;
      var active = m === '' ? state.months.length === 0 : state.months.indexOf(m) >= 0;
      b.classList.toggle('active', active);
    });
    document.querySelectorAll('#platform-seg button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.platform === state.platform);
    });
    $('category-select').value = state.category;

    var ms = state.months.length
      ? (state.months.length <= 2
        ? state.months.map(Core.monthLabel).join('、')
        : state.months.length + ' 个月份')
      : '全部月份';
    var ps = state.platform === 'all' ? '全部平台' : state.platform;
    var cs = state.category === 'all' ? '全部分类' : state.category;
    $('filter-summary').textContent = ms + ' · ' + ps + ' · ' + cs;
  }

  /* ---------------- 顶部 / 洞察 ---------------- */
  function updateHeader() {
    var m = bill.meta || {};
    var c = m.counts || {};
    $('brand-title').textContent = m.title || '消费账单';
    $('brand-sub').innerHTML = '<b>' + esc(m.source || '账单') + '</b>' +
      (m.period ? ' · ' + esc(m.period) : '') + ' · 净额口径';
    document.title = (m.title || '消费账单') + ' · 微信 / 支付宝账单统计';

    var parts = [];
    if (c.wechat) parts.push('微信 ' + Core.fmtInt(c.wechat));
    if (c.alipay) parts.push('支付宝 ' + Core.fmtInt(c.alipay));
    $('chip-source').textContent = parts.length ? parts.join(' + ') + ' 条' : '--';
    $('chip-updated').textContent = m.generated ? '更新于 ' + m.generated.slice(0, 10) : '--';

    $('platform-panel-sub').textContent = Core.PLATFORMS.length > 1
      ? Core.PLATFORMS.join(' vs ')
      : '仅 ' + (Core.PLATFORMS[0] || '单一平台');
  }

  function updateCounts() {
    var c = (bill.meta || {}).counts || {};
    $('tab-count-detail').textContent = c.detail || 0;
    $('tab-count-refunds').textContent = c.refunds || 0;
    $('tab-count-neutral').textContent = c.neutral || 0;
    $('tab-count-unknown').textContent = c.unknown || 0;
  }

  function updateInsights(k) {
    var ins = Core.insights(state);
    if (ins.month) {
      $('insight-month-value').textContent = Core.monthLabel(ins.month.m);
      $('insight-month-sub').textContent = Core.fmtMoney(ins.month.exp) + ' 元';
    } else {
      $('insight-month-value').textContent = '--';
      $('insight-month-sub').textContent = '暂无数据';
    }
    if (ins.cat) {
      var pct = k.totalExp > 0 ? ins.cat.net / k.totalExp : 0;
      $('insight-cat-value').textContent = ins.cat.cat;
      $('insight-cat-sub').textContent = Core.fmtMoney(ins.cat.net) + ' 元 · ' + Core.fmtPct(pct);
    } else {
      $('insight-cat-value').textContent = '--';
      $('insight-cat-sub').textContent = '暂无数据';
    }
    if (ins.refundCat) {
      $('insight-refund-value').textContent = ins.refundCat.cat;
      $('insight-refund-sub').textContent = '退款 ' + Core.fmtMoney(ins.refundCat.ref) + ' 元';
    } else {
      $('insight-refund-value').textContent = '--';
      $('insight-refund-sub').textContent = '暂无退款';
    }
    var u = Core.unknownSummary();
    $('insight-unknown-value').textContent = u.n + ' 个';
    $('insight-unknown-sub').textContent = Core.fmtMoney(u.amt) + ' 元 · 暂归其他';
  }

  function refresh() {
    if (!bill) return;
    var rs = Core.rows(state);
    var k = Core.kpis(rs);
    var rf = Core.refundSummary(state);

    animateNumber($('kpi-exp'), k.totalExp, 2, firstRender);
    animateNumber($('kpi-pure'), k.pure, 2, firstRender);
    animateNumber($('kpi-inc'), k.totalInc, 2, firstRender);
    animateNumber($('kpi-ref'), k.refund, 2, firstRender);
    animateNumber($('kpi-rel'), k.rel, 2, firstRender);
    animateNumber($('kpi-count'), k.validExpCount, 0, firstRender);

    $('kpi-exp-sub').textContent = k.expCount + ' 笔支出 · 净额为 0 的 ' + k.zeroExpCount + ' 笔';
    $('kpi-pure-sub').textContent = '剔除转账 / 红包 / 群收款';
    $('kpi-inc-sub').textContent = k.incCount + ' 笔收入';
    $('kpi-ref-sub').textContent = rf.n + ' 笔退款 · 已匹配 ' + rf.matchedN + ' 笔';
    $('kpi-count-sub').textContent = '原始支出 ' + k.expCount + ' 笔';

    $('refund-matched').textContent = rf.matchedN;
    $('refund-unmatched').textContent = rf.unmatchedN;

    updateInsights(k);
    syncUI();
    Charts.render(state);
    firstRender = false;
  }

  /* ---------------- 数据装载 ---------------- */
  /* 把已导入文件合并成 parser 需要的原始池 */
  function poolOf() {
    var out = { wechat: [], alipay: [] };
    library.forEach(function (f) {
      if (f.platform === '微信') out.wechat = out.wechat.concat(f.rows);
      else out.alipay = out.alipay.concat(f.rows);
    });
    return out;
  }

  /* 单个文件 → 元信息（时间范围 / 内容指纹），用于去重与覆盖判断 */
  function entryOf(f) {
    var rows = f.rows || [];
    var times = rows.map(function (r) { return r.time; }).filter(Boolean).sort();
    var first = times[0] || '';
    var last = times[times.length - 1] || '';
    var sum = rows.reduce(function (s, r) { return s + (Number(r.amt) || 0); }, 0);
    return {
      name: f.name,
      platform: f.platform,
      rows: rows,
      n: rows.length,
      first: first,
      last: last,
      year: first.slice(0, 4),
      sig: f.platform + '|' + rows.length + '|' + first + '|' + last + '|' + sum.toFixed(2),
      at: Date.now()
    };
  }

  /* 收下本次解析结果：内容重复→跳过；日期范围被新文件覆盖→替换；其余→追加 */
  function absorb(parsed) {
    var out = { added: [], replaced: [], skipped: [] };
    (parsed || []).forEach(function (f) {
      var e = entryOf(f);

      var dup = library.some(function (x) { return x.platform === e.platform && x.sig === e.sig; });
      if (dup) { out.skipped.push(e.name + '（与已导入的账单内容相同）'); return; }

      var covered = [];
      library.forEach(function (x, i) {
        if (x.platform === e.platform && x.first >= e.first && x.last <= e.last) covered.push(i);
      });
      if (covered.length) {
        covered.forEach(function (i) { out.replaced.push(library[i].name); });
        library = library.filter(function (x, i) { return covered.indexOf(i) < 0; });
        library.push(e);
        out.added.push(e);
        return;
      }

      var inner = library.some(function (x) {
        return x.platform === e.platform && e.first >= x.first && e.last <= x.last;
      });
      if (inner) { out.skipped.push(e.name + '（日期范围已被已导入的账单覆盖）'); return; }

      library.push(e);
      out.added.push(e);
    });
    return out;
  }

  function applyData(keepFilters) {
    if (!library.length) return;
    bill = Parser.buildBill(poolOf(), overrides);
    Core.setData(bill);

    if (!keepFilters) {
      state.months = [];
      state.platform = 'all';
      state.category = 'all';
    }
    if (state.platform !== 'all' && Core.PLATFORMS.indexOf(state.platform) < 0) state.platform = 'all';
    if (state.category !== 'all' && Core.CATS.indexOf(state.category) < 0) state.category = 'all';
    state.months = state.months.filter(function (m) { return Core.MONTHS.indexOf(m) >= 0; });

    buildFilters();
    updateHeader();
    updateCounts();
    if (!chartsReady) { Charts.init(); chartsReady = true; }
    refresh();
    if (drawerState.open) renderDrawer();
  }

  /* ---------------- 清空 / 重置 ---------------- */
  function clearUI() {
    ['kpi-exp', 'kpi-pure', 'kpi-inc', 'kpi-ref', 'kpi-rel'].forEach(function (id) {
      var el = $(id);
      el.dataset.value = '0';
      el.textContent = '0.00';
    });
    var cnt = $('kpi-count');
    cnt.dataset.value = '0';
    cnt.textContent = '0';

    $('kpi-exp-sub').textContent = '等待数据';
    $('kpi-pure-sub').textContent = '剔除转账 / 红包 / 群收款';
    $('kpi-inc-sub').textContent = '等待数据';
    $('kpi-ref-sub').textContent = '等待数据';
    $('kpi-count-sub').textContent = '等待数据';

    $('brand-title').textContent = '微信 / 支付宝消费账单统计系统';
    $('brand-sub').textContent = '上传微信 / 支付宝账单后自动生成';
    document.title = '微信 / 支付宝消费账单统计系统';
    $('chip-source').textContent = '--';
    $('chip-updated').textContent = '--';

    $('month-chips').innerHTML = '';
    $('platform-seg').innerHTML = '';
    $('platform-group').style.display = 'none';
    $('category-select').innerHTML = '<option value="all">全部分类</option>';
    $('filter-summary').textContent = '全部月份 · 全部平台 · 全部分类';
    $('platform-panel-sub').textContent = '微信 vs 支付宝';

    ['tab-count-detail', 'tab-count-refunds', 'tab-count-neutral', 'tab-count-unknown'].forEach(function (id) {
      $(id).textContent = '0';
    });
    $('refund-matched').textContent = '--';
    $('refund-unmatched').textContent = '--';

    ['month', 'cat', 'refund', 'unknown'].forEach(function (k) {
      $('insight-' + k + '-value').textContent = '--';
      $('insight-' + k + '-sub').textContent = '--';
    });

    var bar = $('filebar');
    if (bar) bar.hidden = true;
    var list = $('file-list');
    if (list) list.innerHTML = '';
    var fc = $('file-count');
    if (fc) fc.textContent = '0';
  }

  function clearBill(force) {
    if (!library.length && !bill) { $('welcome').classList.remove('hide'); return; }
    if (!force && !window.confirm('清空当前账单并重新导入？（本机已保存的商户分类会保留）')) return;

    library = [];
    bill = null;
    state.months = [];
    state.platform = 'all';
    state.category = 'all';
    firstRender = true;
    if (drawerState.open) closeDrawer();
    if ($('modal').classList.contains('open')) closeModal();
    Core.setData(null);
    Charts.reset();
    chartsReady = false;
    clearUI();
    setStatus('');
    $('welcome').classList.remove('hide');
    showToast('已清空账单，可重新导入', 'ok');
  }

  /* ---------------- 已导入文件列表 ---------------- */
  function refreshFiles() {
    var bar = $('filebar');
    var list = $('file-list');
    if (!bar || !list) return;

    bar.hidden = !library.length;
    $('file-count').textContent = String(library.length);
    list.innerHTML = library.map(function (f, i) {
      var range = f.first ? f.first.slice(0, 10) + ' — ' + f.last.slice(0, 10) : '';
      var meta = (range ? range + ' · ' : '') + f.n + ' 条';
      return '<span class="file-item" title="' + escAttr(f.name) + '">' +
        '<span class="file-dot ' + (f.platform === '微信' ? 'wx' : 'az') + '"></span>' +
        '<span class="file-name">' + esc(f.name) + '</span>' +
        '<span class="file-meta">' + esc(meta) + '</span>' +
        '<button class="file-del" data-i="' + i + '" aria-label="移除这个文件" title="移除这个文件">×</button>' +
        '</span>';
    }).join('');
  }

  function removeFile(i) {
    if (!(i >= 0 && i < library.length)) return;
    var gone = library[i].name;
    library = library.filter(function (x, k) { return k !== i; });

    if (!library.length) {
      clearBill(true);
      showToast('已移除「' + gone + '」，账单已清空', 'ok');
      return;
    }
    refreshFiles();
    applyData(true);
    showToast('已移除「' + gone + '」并重算', 'ok');
  }

  /* ---------------- 上传 ---------------- */
  function setStatus(msg) {
    var el = $('welcome-status');
    if (el) el.textContent = msg || '';
  }
  function hideWelcome() {
    $('welcome').classList.add('hide');
  }

  function handleFiles(files) {
    if (busy || !files || !files.length || !Parser) return;
    busy = true;
    setStatus('正在解析 ' + files.length + ' 个文件…');
    $('welcome').classList.add('busy');

    var task;
    try {
      task = Parser.parseFiles(files);
    } catch (err) {
      busy = false;
      $('welcome').classList.remove('busy');
      console.error(err);
      setStatus('解析失败：' + (err && err.message ? err.message : err));
      showToast('解析失败：' + (err && err.message ? err.message : err), 'err');
      return;
    }

    task.then(function (res) {
      busy = false;
      $('welcome').classList.remove('busy');
      var warn = res.warnings || [];
      if (warn.length) console.warn('[bill-insight]', warn);

      if (!res.wechat.length && !res.alipay.length) {
        var tip = warn[0] || '未识别到账单内容，请确认文件由微信 / 支付宝官方导出';
        setStatus(tip);
        showToast('未识别：' + tip, 'warn');
        return;
      }

      setStatus('');
      var out = absorb(res.files || []);
      hideWelcome();
      refreshFiles();

      var note = [];
      if (out.added.length) note.push('新增 ' + out.added.length + ' 个');
      if (out.replaced.length) note.push('替换 ' + out.replaced.length + ' 个旧文件');
      if (out.skipped.length) note.push('跳过 ' + out.skipped.length + ' 个重复文件');

      var changed = out.added.length > 0;
      if (!changed) {
        showToast('这些文件之前已经导入过了，数据没有变化', 'warn');
      } else {
        showToast('已导入：' + note.join(' · '), 'ok');
        applyData(false);
        window.scrollTo(0, 0);
      }

      if (out.skipped.length) {
        setTimeout(function () { showToast('跳过重复：' + out.skipped[0], 'warn'); }, 3000);
      } else if (warn.length) {
        setTimeout(function () { showToast('有 ' + warn.length + ' 个文件未识别：' + warn[0], 'warn'); }, 3000);
      }
    }, function (err) {
      busy = false;
      $('welcome').classList.remove('busy');
      console.error(err);
      setStatus('解析失败：' + (err && err.message ? err.message : err));
      showToast('解析失败：' + (err && err.message ? err.message : err), 'err');
    });
  }

  function initUpload() {
    var dz = $('dropzone');
    var input = $('file-input');

    dz.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      handleFiles(input.files);
      input.value = '';
    });
    $('import-bill').addEventListener('click', function () { input.click(); });
    $('clear-bill').addEventListener('click', function () { clearBill(false); });

    $('file-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.file-del');
      if (!btn) return;
      removeFile(Number(btn.dataset.i));
    });

    document.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!dz.classList.contains('hide')) dz.classList.add('over');
    });
    document.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget) dz.classList.remove('over');
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  /* ---------------- Drawer ---------------- */
  var TAB_LABEL = { detail: '消费明细', refunds: '退款核对', neutral: '不计收支', unknown: '待确认分类' };

  function defaultSort(tab) {
    return tab === 'unknown' ? 'net' : 't';
  }

  function openDrawer(tab, search) {
    if (!bill) { showToast('请先导入账单', 'warn'); return; }
    drawerState.open = true;
    drawerState.tab = tab || 'detail';
    drawerState.search = search || '';
    drawerState.page = 1;
    drawerState.expanded = null;
    drawerState.sortKey = defaultSort(drawerState.tab);
    drawerState.sortDir = 'desc';
    $('drawer-search').value = drawerState.search;
    $('drawer').classList.add('open');
    $('drawer-backdrop').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    syncTabs();
    renderDrawer();
  }

  function closeDrawer() {
    drawerState.open = false;
    $('drawer').classList.remove('open');
    $('drawer-backdrop').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
  }

  function syncTabs() {
    document.querySelectorAll('.drawer-tabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === drawerState.tab);
    });
    $('drawer-note').classList.toggle('show', drawerState.tab === 'unknown');
  }

  function baseRows(tab) {
    if (tab === 'detail') return Core.rows(state);
    if (tab === 'refunds') return Core.refundRows(state);
    if (tab === 'neutral') return Core.neutralRows(state);
    return (bill.unknown || []).slice();
  }

  function processRows() {
    var rows = baseRows(drawerState.tab);
    var q = drawerState.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (r) {
        return Object.keys(r).some(function (k) {
          return String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    var key = drawerState.sortKey;
    var dir = drawerState.sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      va = String(va == null ? '' : va);
      vb = String(vb == null ? '' : vb);
      return va.localeCompare(vb, 'zh-CN') * dir;
    });
  }

  function platBadge(p) {
    return '<span class="badge ' + (p === '微信' ? 'wechat' : 'alipay') + '">' + esc(p) + '</span>';
  }
  function dirBadge(d) {
    return '<span class="badge ' + (d === '收入' ? 'inc' : 'exp') + '">' + esc(d) + '</span>';
  }
  function refundBadge(t) {
    if (!t || t === '无退款') return '<span class="badge none">无退款</span>';
    if (t === '全额退款') return '<span class="badge full">全额退款</span>';
    return '<span class="badge part">部分退款</span>';
  }
  function matchBadge(m) {
    return '<span class="badge ' + (m === '已匹配' ? 'match' : 'unmatch') + '">' + esc(m) + '</span>';
  }
  function money(v, cls) {
    return '<span class="' + (cls || '') + '">' + Core.fmtMoney(v) + '</span>';
  }

  function colWidths(tab) {
    if (tab === 'detail') return ['130px', '70px', '60px', '90px', '150px', 'auto', '90px', '80px', '90px', '170px'];
    if (tab === 'refunds') return ['140px', '70px', '190px', '100px', '140px', '100px', '100px', '110px'];
    if (tab === 'neutral') return ['140px', '70px', '120px', '160px', 'auto', '100px', '220px'];
    return ['200px', '60px', '95px', '90px', 'auto', '120px', '150px'];
  }

  function assignOptions(mer) {
    var cur = overrides[mer] || '';
    var html = '<option value="">— 选择分类 —</option>';
    (Parser.CATEGORIES || []).forEach(function (c) {
      html += '<option value="' + escAttr(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    return html;
  }

  function columnsFor(tab) {
    if (tab === 'detail') {
      return [
        { key: 't', label: '时间', sort: true, render: function (r) { return esc(r.t); } },
        { key: 'p', label: '平台', render: function (r) { return platBadge(r.p); } },
        { key: 'dir', label: '收支', render: function (r) { return dirBadge(r.dir); } },
        { key: 'cat', label: '分类', sort: true, render: function (r) { return esc(r.cat); } },
        { key: 'mer', label: '商户 / 对方', render: function (r) { return esc(r.who || r.mer); } },
        { key: 'desc', label: '商品说明', render: function (r) { return '<span class="cell-desc" title="' + escAttr(r.desc) + '">' + esc(r.desc) + '</span>'; } },
        { key: 'amt', label: '原始金额', cls: 'num', sort: true, render: function (r) { return Core.fmtMoney(r.amt); } },
        { key: 'ref', label: '退款', cls: 'num', sort: true, render: function (r) { return money(r.ref, r.ref > 0 ? 'ref' : 'muted'); } },
        { key: 'net', label: '净额', cls: 'num', sort: true, render: function (r) { return money(r.net, 'net ' + (r.dir === '收入' ? 'inc' : '')); } },
        { key: 'st', label: '状态', render: function (r) { return esc(r.st) + ' ' + refundBadge(r.rtype); } }
      ];
    }
    if (tab === 'refunds') {
      return [
        { key: 't', label: '退款时间', sort: true, render: function (r) { return esc(r.t); } },
        { key: 'p', label: '平台', render: function (r) { return platBadge(r.p); } },
        { key: 'mer', label: '商户 / 对方', render: function (r) { return esc(r.mer); } },
        { key: 'amt', label: '退款金额', cls: 'num', sort: true, render: function (r) { return money(r.amt, 'ref'); } },
        { key: 'ot', label: '原单时间', render: function (r) { return esc(r.ot || '—'); } },
        { key: 'oamt', label: '原单金额', cls: 'num', sort: true, render: function (r) { return r.oamt ? Core.fmtMoney(r.oamt) : '—'; } },
        { key: 'cat', label: '分类', render: function (r) { return esc(r.cat); } },
        { key: 'match', label: '匹配结果', sort: true, render: function (r) { return matchBadge(r.match); } }
      ];
    }
    if (tab === 'neutral') {
      return [
        { key: 't', label: '时间', sort: true, render: function (r) { return esc(r.t); } },
        { key: 'p', label: '平台', render: function (r) { return platBadge(r.p); } },
        { key: 'type', label: '原始类型', render: function (r) { return esc(r.type); } },
        { key: 'mer', label: '交易对方', render: function (r) { return esc(r.mer); } },
        { key: 'desc', label: '商品说明', render: function (r) { return '<span class="cell-desc" title="' + escAttr(r.desc) + '">' + esc(r.desc) + '</span>'; } },
        { key: 'amt', label: '金额', cls: 'num', sort: true, render: function (r) { return Core.fmtMoney(r.amt); } },
        { key: 'reason', label: '排除原因', render: function (r) { return esc(r.reason); } }
      ];
    }
    return [
      { key: 'mer', label: '商户', sort: true, render: function (r) { return esc(r.mer); } },
      { key: 'n', label: '笔数', cls: 'num', sort: true, render: function (r) { return Core.fmtInt(r.n); } },
      { key: 'net', label: '净金额', cls: 'num', sort: true, render: function (r) { return money(r.net, 'net'); } },
      { key: 'ref', label: '退款金额', cls: 'num', sort: true, render: function (r) { return money(r.ref, r.ref > 0 ? 'ref' : 'muted'); } },
      { key: 'sample', label: '示例商品', render: function (r) { return '<span class="cell-desc" title="' + escAttr(r.sample) + '">' + esc(r.sample) + '</span>'; } },
      { key: 'pay', label: '支付方式', render: function (r) { return esc(r.pay); } },
      { key: 'assign', label: '建议分类', render: function (r) { return '<select class="assign-select" data-mer="' + escAttr(r.mer) + '">' + assignOptions(r.mer) + '</select>'; } }
    ];
  }

  function expandRow(tab, r) {
    if (tab === 'detail') {
      return '<tr class="detail-row"><td colspan="10"><div class="detail-grid">' +
        '<div>订单号<b>' + esc(r.oid || '—') + '</b></div>' +
        '<div>关联退款单号<b>' + esc(r.rids || '—') + '</b></div>' +
        '<div>退款时间<b>' + esc(r.rt || '—') + '</b></div>' +
        '<div>原始类型<b>' + esc(r.ot || '—') + '</b></div>' +
        '<div>支付方式<b>' + esc(r.pay || '—') + '</b></div>' +
        '<div>退款类型<b>' + esc(r.rtype || '—') + '</b></div>' +
        '<div>原始状态<b>' + esc(r.st || '—') + '</b></div>' +
        '<div>备注<b>' + esc(r.note || '—') + '</b></div>' +
        '<div>平台<b>' + esc(r.p) + '</b></div>' +
        '</div></td></tr>';
    }
    if (tab === 'refunds') {
      return '<tr class="detail-row"><td colspan="8"><div class="detail-grid">' +
        '<div>退款单号<b>' + esc(r.rid || '—') + '</b></div>' +
        '<div>原单订单号<b>' + esc(r.ooid || '—') + '</b></div>' +
        '<div>原单状态<b>' + esc(r.ost || '—') + '</b></div>' +
        '<div>分类<b>' + esc(r.cat || '—') + '</b></div>' +
        '<div>匹配结果<b>' + esc(r.match) + '</b></div>' +
        '<div>平台<b>' + esc(r.p) + '</b></div>' +
        '</div></td></tr>';
    }
    return '';
  }

  function rowHtml(tab, r, cols) {
    var rid = tab === 'detail' ? r.id : (tab === 'refunds' ? r.rid : null);
    var cells = cols.map(function (c) {
      return '<td class="' + (c.cls || '') + '">' + c.render(r) + '</td>';
    }).join('');
    var tr = '<tr class="main-row" ' + (rid != null ? 'data-id="' + escAttr(rid) + '"' : '') + '>' + cells + '</tr>';
    if (rid != null && String(drawerState.expanded) === String(rid)) tr += expandRow(tab, r);
    return tr;
  }

  function sortMark(key) {
    if (drawerState.sortKey !== key) return '';
    return drawerState.sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function updateNote() {
    var n = Object.keys(overrides).length;
    $('drawer-note-text').textContent =
      '这些商户暂归「其他」。在右侧选择分类会立即重算，并保存在本机浏览器（已保存 ' + n + ' 条）。';
    $('clear-overrides').disabled = n === 0;
  }

  function renderDrawer() {
    if (!bill) return;
    var tab = drawerState.tab;
    var data = processRows();
    var total = data.length;
    var pages = Math.max(1, Math.ceil(total / drawerState.pageSize));
    drawerState.page = Math.min(Math.max(1, drawerState.page), pages);
    var start = (drawerState.page - 1) * drawerState.pageSize;
    var slice = data.slice(start, start + drawerState.pageSize);
    var cols = columnsFor(tab);

    $('data-colgroup').innerHTML = colWidths(tab).map(function (w) {
      return '<col style="width:' + w + '">';
    }).join('');

    $('data-thead').innerHTML = '<tr>' + cols.map(function (c) {
      return '<th class="' + (c.cls || '') + (c.sort ? ' sortable' : '') + '" data-key="' + c.key + '">' + c.label + sortMark(c.key) + '</th>';
    }).join('') + '</tr>';

    if (!slice.length) {
      $('data-tbody').innerHTML = '<tr><td colspan="' + cols.length + '"><div class="empty">没有匹配的记录</div></td></tr>';
    } else {
      $('data-tbody').innerHTML = slice.map(function (r) { return rowHtml(tab, r, cols); }).join('');
    }

    $('drawer-count').textContent = total + ' 条';
    $('page-info').textContent = '第 ' + drawerState.page + ' / ' + pages + ' 页 · 共 ' + total + ' 条';
    $('prev-page').disabled = drawerState.page <= 1;
    $('next-page').disabled = drawerState.page >= pages;

    var sub = '';
    if (tab === 'detail') {
      sub = '共 ' + total + ' 条消费记录 · 已应用大屏筛选 · 点击行展开退款信息';
    } else if (tab === 'refunds') {
      var matched = data.filter(function (r) { return r.match === '已匹配'; }).length;
      sub = '共 ' + total + ' 笔退款 · 已匹配 ' + matched + ' 笔 · 点击行展开原单信息';
    } else if (tab === 'neutral') {
      sub = '共 ' + total + ' 笔不计收支 · 已剔除，不进入消费统计';
    } else {
      sub = '共 ' + total + ' 个商户 · 暂归「其他」，可在本表直接指定分类';
    }
    $('drawer-sub').textContent = sub;
    updateNote();
    syncTabs();
  }

  function initDrawer() {
    $('open-detail').addEventListener('click', function () { openDrawer('detail', ''); });
    $('close-drawer').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);

    document.querySelectorAll('.drawer-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!bill) return;
        drawerState.tab = b.dataset.tab;
        drawerState.page = 1;
        drawerState.expanded = null;
        drawerState.search = '';
        drawerState.sortKey = defaultSort(drawerState.tab);
        drawerState.sortDir = 'desc';
        $('drawer-search').value = '';
        syncTabs();
        renderDrawer();
      });
    });

    var searchTimer = null;
    $('drawer-search').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        drawerState.search = v;
        drawerState.page = 1;
        drawerState.expanded = null;
        renderDrawer();
      }, 140);
    });
    $('clear-search').addEventListener('click', function () {
      $('drawer-search').value = '';
      drawerState.search = '';
      drawerState.page = 1;
      drawerState.expanded = null;
      renderDrawer();
    });

    $('data-thead').addEventListener('click', function (e) {
      var th = e.target.closest('th.sortable');
      if (!th) return;
      var key = th.dataset.key;
      if (drawerState.sortKey === key) {
        drawerState.sortDir = drawerState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        drawerState.sortKey = key;
        drawerState.sortDir = 'desc';
      }
      renderDrawer();
    });

    $('data-tbody').addEventListener('click', function (e) {
      if (e.target.closest('select')) return;
      var tr = e.target.closest('tr.main-row');
      if (!tr || !tr.dataset.id) return;
      var id = tr.dataset.id;
      drawerState.expanded = String(drawerState.expanded) === String(id) ? null : id;
      renderDrawer();
    });

    $('data-tbody').addEventListener('change', function (e) {
      var sel = e.target.closest('select.assign-select');
      if (!sel) return;
      var mer = sel.dataset.mer;
      var cat = sel.value;
      if (cat) overrides[mer] = cat;
      else delete overrides[mer];
      saveOverrides();
      applyData(true);
      showToast(cat ? '已归类到「' + cat + '」并重算' : '已取消该商户的归类', 'ok');
    });

    $('clear-overrides').addEventListener('click', function () {
      var n = Object.keys(overrides).length;
      if (!n) return;
      if (!window.confirm('清空已保存的 ' + n + ' 条商户分类？')) return;
      overrides = {};
      saveOverrides();
      applyData(true);
      showToast('已清空分类记忆', 'ok');
    });

    $('prev-page').addEventListener('click', function () {
      if (drawerState.page > 1) {
        drawerState.page -= 1;
        drawerState.expanded = null;
        renderDrawer();
      }
    });
    $('next-page').addEventListener('click', function () {
      drawerState.page += 1;
      drawerState.expanded = null;
      renderDrawer();
    });

    $('export-csv').addEventListener('click', exportCSV);
  }

  function exportCSV() {
    if (!bill) return;
    var tab = drawerState.tab;
    var data = processRows();
    var cols;
    if (tab === 'detail') {
      cols = [
        ['时间', 't'], ['平台', 'p'], ['收支', 'dir'], ['分类', 'cat'], ['往来对象', 'who'],
        ['交易对方', 'mer'], ['商品说明', 'desc'], ['原始金额', 'amt'], ['退款金额', 'ref'],
        ['净金额', 'net'], ['支付方式', 'pay'], ['原始状态', 'st'], ['订单号', 'oid'],
        ['关联退款单号', 'rids'], ['退款时间', 'rt'], ['退款类型', 'rtype'], ['备注', 'note']
      ];
    } else if (tab === 'refunds') {
      cols = [
        ['退款时间', 't'], ['平台', 'p'], ['商户/对方', 'mer'], ['退款金额', 'amt'],
        ['退款单号', 'rid'], ['原单时间', 'ot'], ['原单金额', 'oamt'], ['原单订单号', 'ooid'],
        ['原单状态', 'ost'], ['匹配结果', 'match'], ['分类', 'cat']
      ];
    } else if (tab === 'neutral') {
      cols = [
        ['时间', 't'], ['平台', 'p'], ['原始类型', 'type'], ['交易对方', 'mer'],
        ['商品说明', 'desc'], ['金额', 'amt'], ['原始状态', 'st'], ['排除原因', 'reason']
      ];
    } else {
      cols = [
        ['商户', 'mer'], ['笔数', 'n'], ['净金额', 'net'], ['退款金额', 'ref'],
        ['示例商品', 'sample'], ['支付方式', 'pay'], ['建议分类', 'assign']
      ];
    }
    function cell(v) {
      var s = String(v == null ? '' : v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var lines = [cols.map(function (c) { return c[0]; }).join(',')];
    data.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = c[1] === 'assign' ? (overrides[r.mer] || '') : r[c[1]];
        if (typeof v === 'number') return v;
        return cell(v);
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = TAB_LABEL[tab] + '_' + ((bill.meta || {}).year || '账单') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast('已导出 ' + TAB_LABEL[tab] + ' CSV', 'ok');
  }

  /* ---------------- Excel ---------------- */
  function downloadExcel() {
    if (!bill) { showToast('请先导入账单', 'warn'); return; }
    if (!window.BillExcel) { showToast('Excel 组件未加载', 'err'); return; }
    var btn = $('download-excel');
    btn.disabled = true;
    btn.textContent = '生成中…';
    window.BillExcel.download(bill, Core).then(function (name) {
      showToast('已下载 ' + name, 'ok');
    }).catch(function (err) {
      console.error(err);
      showToast('导出失败：' + (err && err.message ? err.message : err), 'err');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = '下载整理表格';
    });
  }

  /* ---------------- Modal / toast ---------------- */
  function renderMethod() {
    if (!bill) return;
    var m = bill.meta || {};
    var k = Core.kpis(bill.detail);
    var rf = Core.refundSummary({ months: [], platform: 'all', category: 'all' });
    var neutral = bill.neutral || [];
    var neutralAmt = Core.r2(Core.sum(neutral, function (x) { return x.amt; }));
    var unknown = Core.unknownSummary();

    var srcParts = [];
    if ((m.counts || {}).wechat) srcParts.push('微信支付账单（' + m.counts.wechat + ' 条）');
    if ((m.counts || {}).alipay) srcParts.push('支付宝交易明细（' + m.counts.alipay + ' 条）');

    var html = '';
    html += '<p>本次数据来自 ' + esc(srcParts.join(' 与 ')) + '，统计区间 ' + esc(m.period || '—') + '。</p>';
    html += '<h3>净额口径</h3><p>每笔消费先记录原始金额，再把退款金额回填到原单：<b>净额 = 原始金额 − 退款金额</b>。退款单不再作为收入重复计入。例如消费 1,400 元、退款 980 元，最终只保留一笔净支出 420 元。</p>';
    html += '<h3>净支出 / 纯消费</h3><ul>' +
      '<li><b>净支出（含往来）</b>：所有支出净额之和，共 ' + Core.fmtMoney(k.totalExp) + ' 元。</li>' +
      '<li><b>纯消费（不含往来）</b>：剔除转账、红包、群收款后的消费支出，共 ' + Core.fmtMoney(k.pure) + ' 元。</li>' +
      '<li><b>往来支出</b>：转账、红包、群收款支出，共 ' + Core.fmtMoney(k.rel) + ' 元。</li>' +
      '<li><b>净收入</b>：收入净额之和，共 ' + Core.fmtMoney(k.totalInc) + ' 元。</li>' +
      '</ul>';
    html += '<h3>退款处理</h3><p>共 ' + rf.n + ' 笔退款，已匹配原单 ' + rf.matchedN + ' 笔，冲减金额 ' + Core.fmtMoney(rf.matchedAmt) + ' 元。' +
      (rf.unmatchedN
        ? '另有 ' + rf.unmatchedN + ' 笔、共 ' + Core.fmtMoney(rf.unmatchedAmt) + ' 元未匹配到本期订单（多为跨年退款），不冲减本期消费，单独列入「退款核对」。'
        : '本期退款均已匹配到原单。') + '</p>';
    html += '<h3>不计收支</h3><p>共 ' + neutral.length + ' 笔、' + Core.fmtMoney(neutralAmt) + ' 元（提现、余额宝 / 零钱通存取、关闭订单等）已剔除，不进入消费统计。</p>';
    html += '<h3>分类说明</h3><p>支付宝沿用账单自带分类；微信没有分类，按商户关键词自动识别，全部为本地规则计算，不调用任何大模型。' +
      (unknown.n
        ? '当前仍有 ' + unknown.n + ' 个商户未能识别，暂归「其他」，共 ' + Core.fmtMoney(unknown.amt) + ' 元，可在「待确认分类」里点选修正。'
        : '所有商户均已识别出分类。') + '</p>';
    html += '<h3>平台差异</h3><p>支付宝官方「支出」合计本身已扣退款，微信没有扣。因此本页统一按净额重算，不能把两边原始汇总直接相加。</p>';
    html += '<h3>隐私</h3><p>所有解析与统计均在本机浏览器内完成，文件不上传、不发起任何网络请求，也不写入磁盘。</p>';

    $('modal-body').innerHTML = html;
  }

  function openModal() {
    if (!bill) { showToast('请先导入账单', 'warn'); return; }
    renderMethod();
    $('modal').classList.add('open');
    $('modal-backdrop').classList.add('open');
    $('modal').setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    $('modal').classList.remove('open');
    $('modal-backdrop').classList.remove('open');
    $('modal').setAttribute('aria-hidden', 'true');
  }
  var toastTimer = null;
  function showToast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.remove('ok', 'warn', 'err');
    if (type) el.classList.add(type);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function initModal() {
    $('open-method').addEventListener('click', openModal);
    $('close-modal').addEventListener('click', closeModal);
    $('modal-backdrop').addEventListener('click', closeModal);
  }

  function initEvents() {
    window.addEventListener('bill:filter', function (e) {
      if (!bill) return;
      var d = e.detail || {};
      if (d.type === 'month') {
        toggleMonth(d.value);
        refresh();
      } else if (d.type === 'category') {
        state.category = state.category === d.value ? 'all' : d.value;
        refresh();
      } else if (d.type === 'platform') {
        if (Core.PLATFORMS.length <= 1) return;
        state.platform = state.platform === d.value ? 'all' : d.value;
        refresh();
      }
    });
    window.addEventListener('bill:open', function (e) {
      var d = e.detail || {};
      openDrawer(d.tab || 'detail', d.search || '');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('modal').classList.contains('open')) closeModal();
      else if (drawerState.open) closeDrawer();
    });
    $('download-excel').addEventListener('click', downloadExcel);
  }

  function init() {
    bindFilters();
    initDrawer();
    initModal();
    initEvents();
    initUpload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
