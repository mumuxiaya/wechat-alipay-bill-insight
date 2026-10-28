/* bill-insight · ECharts 图层
 * 6 个图表实例；点击联动筛选 / 打开明细。
 */
(function () {
  'use strict';
  var Core = window.BillCore;
  var css = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
  var C = {
    exp: css('--accent'),
    inc: css('--accent2'),
    ref: css('--warn'),
    danger: css('--danger'),
    ink: css('--ink'),
    muted: css('--muted'),
    muted2: css('--muted-2'),
    rule: css('--rule'),
    surface: css('--surface'),
    surface2: css('--surface-2')
  };
  var CAT_LIST = ['日用百货', '餐饮美食', '服饰装扮', '酒店旅游', '交通出行', '文化休闲', '转账往来', '运动户外', '爱车养车', '医疗健康', '其他', '家居家装', '生活服务', '美容美发', '数码电器', '充值缴费', '母婴亲子', '商业服务', '红包往来', '群收款'];
  var CAT_COLORS = CAT_LIST.map(function (_, i) { return css('--cat-' + (i + 1)); });
  function catColor(name) {
    var i = CAT_LIST.indexOf(name);
    return i >= 0 ? CAT_COLORS[i] : C.muted2;
  }

  function tooltipBase(trigger) {
    return {
      trigger: trigger || 'axis',
      appendToBody: true,
      backgroundColor: '#fff',
      borderColor: C.rule,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: C.ink, fontSize: 11.5, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' },
      extraCssText: 'box-shadow:0 8px 24px rgba(15,23,42,.12);border-radius:8px;'
    };
  }
  function axisLabel() { return { color: C.muted, fontSize: 10.5, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' }; }
  function splitLine() { return { lineStyle: { color: C.rule, type: 'dashed' } }; }
  function tipRow(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;gap:28px;line-height:1.9">' +
      '<span style="color:' + C.muted + '">' + label + '</span>' +
      '<b style="color:' + (color || C.ink) + '">' + value + '</b></div>';
  }
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function emit(type, value) {
    window.dispatchEvent(new CustomEvent('bill:filter', { detail: { type: type, value: value } }));
  }
  function emitOpen(tab, search) {
    window.dispatchEvent(new CustomEvent('bill:open', { detail: { tab: tab, search: search } }));
  }

  var monthChart, categoryChart, platformChart, refundChart, merchantChart, peopleChart;
  var charts = [];
  var inited = false;

  function init() {
    if (inited) return;
    inited = true;
    monthChart = echarts.init(document.getElementById('chart-month'), null, { renderer: 'svg' });
    categoryChart = echarts.init(document.getElementById('chart-category'), null, { renderer: 'svg' });
    platformChart = echarts.init(document.getElementById('chart-platform'), null, { renderer: 'svg' });
    refundChart = echarts.init(document.getElementById('chart-refund'), null, { renderer: 'svg' });
    merchantChart = echarts.init(document.getElementById('chart-merchant'), null, { renderer: 'svg' });
    peopleChart = echarts.init(document.getElementById('chart-people'), null, { renderer: 'svg' });
    charts = [monthChart, categoryChart, platformChart, refundChart, merchantChart, peopleChart];

    monthChart.on('click', function (p) {
      if (p.componentType !== 'series') return;
      emit('month', Core.MONTHS[p.dataIndex]);
    });
    categoryChart.on('click', function (p) {
      if (!p.data || p.data.rawName === '__other__') return;
      emit('category', p.name);
    });
    platformChart.on('click', function (p) { emit('platform', p.name); });
    merchantChart.on('click', function (p) {
      var rev = merchantChart.__rev || [];
      if (rev[p.dataIndex]) emitOpen('detail', rev[p.dataIndex].mer);
    });
    peopleChart.on('click', function (p) {
      var rev = peopleChart.__rev || [];
      if (rev[p.dataIndex]) emitOpen('detail', rev[p.dataIndex].who);
    });

    var resizeTimer = null;
    function resizeAll() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { charts.forEach(function (c) { c.resize(); }); }, 50);
    }
    window.addEventListener('resize', resizeAll);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(resizeAll);
      var grid = document.querySelector('.main-grid');
      if (grid) ro.observe(grid);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(resizeAll);
    }
    setTimeout(resizeAll, 120);
  }

  function renderMonth(state) {
    var data = Core.monthSeries(state);
    var labels = data.map(function (d) { return Core.monthLabel(d.m); });
    function op(m) { return state.months.length && state.months.indexOf(m) < 0 ? 0.24 : 1; }
    var expData = data.map(function (d) { return { value: d.exp, itemStyle: { opacity: op(d.m) } }; });
    var incData = data.map(function (d) { return { value: d.inc, itemStyle: { opacity: op(d.m) } }; });
    var refData = data.map(function (d) { return { value: d.ref, itemStyle: { opacity: op(d.m) } }; });

    monthChart.setOption({
      animationDuration: 420,
      animationEasing: 'cubicOut',
      grid: { left: 54, right: 58, top: 38, bottom: 24 },
      legend: {
        top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 14,
        textStyle: { color: C.muted, fontSize: 10.5, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' }
      },
      tooltip: Object.assign(tooltipBase('axis'), {
        formatter: function (params) {
          var d = data[params[0].dataIndex];
          return '<div style="font-weight:700;margin-bottom:3px">' + d.m + '</div>' +
            tipRow('净支出', Core.fmtMoney(d.exp), C.exp) +
            tipRow('净收入', Core.fmtMoney(d.inc), C.inc) +
            tipRow('退款冲减', Core.fmtMoney(d.ref), C.ref) +
            tipRow('支出笔数', d.n + ' 笔', C.ink);
        }
      }),
      xAxis: {
        type: 'category', data: labels,
        axisLine: { lineStyle: { color: C.rule } },
        axisTick: { show: false },
        axisLabel: axisLabel()
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: C.muted, fontSize: 10, formatter: Core.fmtAxis },
          splitLine: splitLine()
        },
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: C.muted, fontSize: 10, formatter: Core.fmtAxis },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '净支出', type: 'bar', data: expData, barMaxWidth: 24,
          itemStyle: { color: C.exp, borderRadius: [4, 4, 0, 0] },
          emphasis: { focus: 'series' }
        },
        {
          name: '净收入', type: 'bar', data: incData, barMaxWidth: 24,
          itemStyle: { color: C.inc, borderRadius: [4, 4, 0, 0] },
          emphasis: { focus: 'series' }
        },
        {
          name: '退款冲减', type: 'line', yAxisIndex: 1, data: refData,
          smooth: true, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 2, color: C.ref },
          itemStyle: { color: C.ref },
          areaStyle: { color: C.ref, opacity: 0.07 }
        }
      ]
    }, true);
  }

  function renderCategory(state) {
    var all = Core.categorySeries(state);
    var total = Core.sum(all, function (x) { return x.net; });
    var top = all.slice(0, 10);
    var rest = all.slice(10);
    if (rest.length) {
      top.push({
        cat: '其他（合并）',
        net: Core.r2(Core.sum(rest, function (x) { return x.net; })),
        raw: '__other__'
      });
    }
    if (state.category !== 'all' && !top.some(function (x) { return x.cat === state.category; })) {
      var sel = all.filter(function (x) { return x.cat === state.category; })[0];
      if (sel) {
        top = top.slice(0, 9);
        top.push({ cat: sel.cat, net: sel.net, raw: sel.cat });
      }
    }
    var hasData = all.length > 0;
    var data = hasData ? top.map(function (x) {
      var isSel = state.category !== 'all' && x.cat === state.category;
      return {
        name: x.cat,
        value: x.net,
        rawName: x.raw || x.cat,
        itemStyle: {
          color: x.raw === '__other__' ? C.muted2 : catColor(x.cat),
          opacity: state.category !== 'all' && !isSel ? 0.3 : 1
        }
      };
    }) : [{ name: '暂无数据', value: 1, rawName: '__empty__', itemStyle: { color: C.rule } }];

    categoryChart.setOption({
      animationDuration: 420,
      tooltip: Object.assign(tooltipBase('item'), {
        formatter: function (p) {
          var pct = total > 0 ? (p.value / total * 100).toFixed(1) + '%' : '0%';
          return '<div style="font-weight:700;margin-bottom:3px">' + p.name + '</div>' +
            tipRow('净支出', Core.fmtMoney(p.value), C.exp) +
            tipRow('占比', pct, C.muted);
        }
      }),
      legend: {
        type: 'scroll', orient: 'vertical', right: 0, top: 'middle',
        itemWidth: 8, itemHeight: 8, itemGap: 9,
        pageIconColor: C.muted, pageIconInactiveColor: C.rule,
        pageTextStyle: { color: C.muted, fontSize: 9 },
        textStyle: { color: C.muted, fontSize: 10, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' },
        formatter: function (name) { return truncate(name, 7); }
      },
      graphic: [
        {
          type: 'text', left: '37%', top: '45%',
          style: {
            text: Core.fmtAxis(total),
            fill: C.ink, fontSize: 20, fontWeight: 700, fontFamily: 'Outfit',
            textAlign: 'center', textVerticalAlign: 'middle'
          }
        },
        {
          type: 'text', left: '37%', top: '55%',
          style: {
            text: '支出合计',
            fill: C.muted2, fontSize: 10.5, fontFamily: 'PingFang SC, Microsoft YaHei',
            textAlign: 'center', textVerticalAlign: 'middle'
          }
        }
      ],
      series: [{
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['37%', '53%'],
        avoidLabelOverlap: true,
        minAngle: 2,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          label: {
            show: true,
            formatter: '{b}\n{d}%',
            fontSize: 10,
            color: C.ink,
            lineHeight: 14
          }
        },
        data: data
      }]
    }, true);
  }

  function renderPlatform(state) {
    var data = Core.platformSeries(state);
    var names = data.map(function (d) { return d.p; });
    platformChart.setOption({
      animationDuration: 420,
      grid: { left: 44, right: 18, top: 34, bottom: 20 },
      legend: {
        top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 10,
        textStyle: { color: C.muted, fontSize: 10, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' }
      },
      tooltip: Object.assign(tooltipBase('axis'), {
        formatter: function (params) {
          var d = data[params[0].dataIndex];
          return '<div style="font-weight:700;margin-bottom:3px">' + d.p + '</div>' +
            tipRow('净支出', Core.fmtMoney(d.exp), C.exp) +
            tipRow('净收入', Core.fmtMoney(d.inc), C.inc) +
            tipRow('退款冲减', Core.fmtMoney(d.ref), C.ref);
        }
      }),
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.muted, fontSize: 9.5, formatter: Core.fmtAxis },
        splitLine: splitLine()
      },
      yAxis: {
        type: 'category', data: names,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.ink, fontSize: 11 }
      },
      series: [
        {
          name: '净支出', type: 'bar', data: data.map(function (d) { return d.exp; }),
          barWidth: 8, itemStyle: { color: C.exp, borderRadius: [0, 4, 4, 0] }
        },
        {
          name: '净收入', type: 'bar', data: data.map(function (d) { return d.inc; }),
          barWidth: 8, itemStyle: { color: C.inc, borderRadius: [0, 4, 4, 0] }
        },
        {
          name: '退款冲减', type: 'bar', data: data.map(function (d) { return d.ref; }),
          barWidth: 8, itemStyle: { color: C.ref, borderRadius: [0, 4, 4, 0] }
        }
      ]
    }, true);
  }

  function renderRefund(state) {
    var s = Core.refundSummary(state);
    var data = [
      { name: '已匹配原单', value: s.matchedAmt, itemStyle: { color: C.inc } },
      { name: '跨年 / 无原单', value: s.unmatchedAmt, itemStyle: { color: C.danger } }
    ];
    if (s.amt <= 0) {
      data = [{ name: '本期无退款', value: 1, itemStyle: { color: C.rule } }];
    }
    refundChart.setOption({
      animationDuration: 420,
      tooltip: Object.assign(tooltipBase('item'), {
        formatter: function (p) {
          if (s.amt <= 0) return '本期无退款';
          return '<div style="font-weight:700;margin-bottom:3px">' + p.name + '</div>' +
            tipRow('退款金额', Core.fmtMoney(p.value), p.name === '已匹配原单' ? C.inc : C.danger);
        }
      }),
      legend: {
        bottom: 0, left: 'center', itemWidth: 8, itemHeight: 8, itemGap: 12,
        textStyle: { color: C.muted, fontSize: 9.5, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' }
      },
      graphic: [
        {
          type: 'text', left: '50%', top: '42%',
          style: {
            text: s.n + ' 笔',
            fill: C.ink, fontSize: 19, fontWeight: 700, fontFamily: 'Outfit',
            textAlign: 'center', textVerticalAlign: 'middle'
          }
        },
        {
          type: 'text', left: '50%', top: '52%',
          style: {
            text: '退款合计',
            fill: C.muted2, fontSize: 10, fontFamily: 'PingFang SC, Microsoft YaHei',
            textAlign: 'center', textVerticalAlign: 'middle'
          }
        }
      ],
      series: [{
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '48%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          scale: true, scaleSize: 4,
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 9.5, color: C.ink, lineHeight: 13 }
        },
        data: data
      }]
    }, true);
  }

  function renderMerchants(state) {
    var list = Core.topMerchants(state, 10);
    var rev = list.slice().reverse();
    merchantChart.__rev = rev;
    merchantChart.setOption({
      animationDuration: 420,
      grid: { left: 102, right: 52, top: 4, bottom: 18 },
      tooltip: Object.assign(tooltipBase('item'), {
        formatter: function (p) {
          var d = rev[p.dataIndex];
          return '<div style="font-weight:700;margin-bottom:3px">' + d.mer + '</div>' +
            tipRow('分类', d.cat, C.muted) +
            tipRow('净支出', Core.fmtMoney(d.net), C.exp) +
            tipRow('笔数', d.n + ' 笔', C.ink);
        }
      }),
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.muted, fontSize: 9, formatter: Core.fmtAxis },
        splitLine: splitLine()
      },
      yAxis: {
        type: 'category',
        data: rev.map(function (d) { return truncate(d.mer, 9); }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.ink, fontSize: 10 }
      },
      series: [{
        type: 'bar',
        data: rev.map(function (d) { return d.net; }),
        barWidth: 12,
        itemStyle: { color: C.exp, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true, position: 'right',
          formatter: function (p) { return Core.fmtAxis(p.value); },
          color: C.muted, fontSize: 9.5
        }
      }]
    }, true);
  }

  function renderPeople(state) {
    var list = Core.topPeople(state, 10);
    var rev = list.slice().reverse();
    peopleChart.__rev = rev;
    var max = 1;
    rev.forEach(function (d) { max = Math.max(max, d.out, d.in); });
    var bound = max * 1.25;
    peopleChart.setOption({
      animationDuration: 420,
      grid: { left: 92, right: 30, top: 34, bottom: 20 },
      legend: {
        top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 10,
        textStyle: { color: C.muted, fontSize: 10, fontFamily: 'Outfit, PingFang SC, Microsoft YaHei' }
      },
      tooltip: Object.assign(tooltipBase('axis'), {
        formatter: function (params) {
          var d = rev[params[0].dataIndex];
          return '<div style="font-weight:700;margin-bottom:3px">' + d.who + '</div>' +
            tipRow('平台', d.p, C.muted) +
            tipRow('转出', Core.fmtMoney(d.out), C.ref) +
            tipRow('转入', Core.fmtMoney(d.in), C.inc) +
            tipRow('笔数', d.n + ' 笔', C.ink);
        }
      }),
      xAxis: {
        type: 'value', min: -bound, max: bound,
        axisLine: { show: true, lineStyle: { color: C.rule } },
        axisTick: { show: false },
        axisLabel: { color: C.muted, fontSize: 9, formatter: function (v) { return Core.fmtAxis(v); } },
        splitLine: splitLine()
      },
      yAxis: {
        type: 'category',
        data: rev.map(function (d) { return truncate(d.who, 8); }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.ink, fontSize: 10 }
      },
      series: [
        {
          name: '转出', type: 'bar', data: rev.map(function (d) { return -d.out; }),
          barWidth: 8,
          itemStyle: { color: C.ref, borderRadius: [3, 0, 0, 3] },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: C.rule, width: 1 },
            data: [{ xAxis: 0 }],
            label: { show: false }
          }
        },
        {
          name: '转入', type: 'bar', data: rev.map(function (d) { return d.in; }),
          barWidth: 8,
          itemStyle: { color: C.inc, borderRadius: [0, 3, 3, 0] }
        }
      ]
    }, true);
  }

  function render(state) {
    renderMonth(state);
    renderCategory(state);
    renderPlatform(state);
    renderRefund(state);
    renderMerchants(state);
    renderPeople(state);
  }

  /* 清空账单时销毁实例，下次导入重新 init */
  function reset() {
    charts.forEach(function (c) { if (c) { try { c.dispose(); } catch (e) { /* ignore */ } } });
    charts = [];
    monthChart = categoryChart = platformChart = refundChart = merchantChart = peopleChart = null;
    inited = false;
  }

  window.BillCharts = { init: init, render: render, reset: reset };
})();
