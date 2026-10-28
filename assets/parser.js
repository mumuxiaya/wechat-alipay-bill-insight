/* bill-insight · 账单解析与归一
 * 纯前端实现：不联网、不上传，全部在浏览器内存中完成。
 * 对外接口：
 *   BillParser.CATEGORIES          分类顺序
 *   BillParser.parseFiles(files)   -> Promise<{wechat, alipay, warnings, sources}>
 *   BillParser.buildBill(raw, ov)  -> window.BILL 同构对象
 */
(function (global) {
  'use strict';

  var CATEGORIES = [
    '餐饮美食', '日用百货', '服饰装扮', '酒店旅游', '交通出行', '生活服务', '文化休闲',
    '运动户外', '家居家装', '美容美发', '医疗健康', '数码电器', '充值缴费', '爱车养车',
    '母婴亲子', '商业服务', '转账往来', '红包往来', '群收款', '其他'
  ];
  var TRANSFER = ['转账往来', '红包往来', '群收款'];

  /* 顺序敏感：越具体的规则越靠前，「其他」放最后兜底 */
  var RULES = [
    ['转账往来', '闲鱼转账'],
    ['医疗健康', '医院|口腔|门诊|药房|大药房|医药|皮肤病|卫生院|诊所|医保|医疗|体检|牙科|中医|康复'],
    ['交通出行', '滴滴|ETC|高速|速停车|停车|公交|巴士|CITYBUS|MTR|交通|交运|一卡通|智行|铁路|航空|机票|单车|出行|打车|轮渡|船票|昆明智慧通|Transmac|顺易通|交管|联合电子|充电服务|HONG KONG-ZHUHAI|香港->珠海|香港→珠海|KOWLOON|MOTOR BUS|乘车|跨境'],
    ['酒店旅游', '酒店|民宿|度假村|旅行社|旅游|景区|门票|冰雪大世界|文旅|旅行|观光|马陵山|纪念品|北陵|游乐园|客栈|宾馆|华住|房仓|差旅|梦都美|琅琊山|松雪|天福观光|阿Q旅行|宋庄'],
    ['美容美发', 'SA SA|莎莎|WATSON|屈臣氏|丝芙兰|雅漾|护肤|化妆品|美容|美发|理发|美甲|造型|洗浴|足浴|SPA'],
    ['文化休闲', '电影|影城|演出|剧院|音乐会|艺术|文创|文具|书店|图书|彩票|教育|培训|学院|考试|CAIE|学员|纷玩岛|FUNTASY|博物馆|展览|KTV|桌游|剧本|游戏|爱奇艺|腾讯视频|优酷|网易云|音乐|读书|游乐|财神殿|Zicket|保密认证|经管之家|数联未来'],
    ['运动户外', '迪卡侬|体育|运动|户外|健身|游泳|网球|球馆|滑雪|瑜伽|骑行|登山|帐篷|渔具|奥体'],
    ['家居家装', '宜得利|宜家|IKEA|家居|家具|家装|建材|五金|灯具|窗帘|床品|厨具|洁具|装饰|收纳|花瓶'],
    ['数码电器', '数码|电器|手机|电脑|耳机|充电宝|公牛充电|数据线|相机|键盘|鼠标|家电|小米|华为|Apple|苹果'],
    ['充值缴费', '中国移动|中国联通|中国电信|话费|流量|宽带|水电费|燃气费|物业费|电费|水费|充值|缴费'],
    ['生活服务', '快递|洗衣|物业|星河智善|维修|打印|照相|照片|相册|摄影|家政|保洁|中介|搬家|驿站|菜鸟|丰巢'],
    ['商业服务', '深度求索|DeepSeek|度友|百度网盘|卓望|商业|咨询|广告|设计|技术服务|网络科技|信息科技|认证|知识产权|财税|法务|办公|生活榜样|科技服务|剪映|即梦|阿里云|订阅|云服务|服务器'],
    ['母婴亲子', '母婴|婴儿|尿不湿|奶粉|童装|玩具|亲子|儿童'],
    ['爱车养车', '加油|洗车|汽车|养车|保养|轮胎|4S|车险'],
    ['服饰装扮', 'BrandyMelville|UNIQLO|优衣库|服饰|服装|衣服|鞋|潮牌|砂之船|奥莱|耐克|Nike|阿迪达斯|adidas|李宁|安踏|森马|内衣|裤|裙'],
    ['日用百货', '山姆|WALMART|沃尔玛|盒马|苏果|七鲜|叮咚|超市|便利|名创优品|MUJI|无印良品|百货|金鹰购|荟品仓|全家|LAWSON|十足|新天地超市|生鲜|蔬菜|水果|农夫山泉|飞牛网|拼多多|京东|小红书|抖音|快团团|1688|淘宝|天猫|荟嵩|YATA|SOGO|MINISO|驿佳商贸|青春农庄|天天鲜果|好一朵茉莉花|王辉鸡毛菜|7-Eleven|7‑Eleven|食品销售|食品百货|优必享'],
    ['餐饮美食', '麦当劳|McDonald|肯德基|KFC|汉堡王|Burger|面馆|拉面|牛肉面|米线|米皮|酸辣粉|拌饭|锅贴|凉皮|肉夹馍|饺子|蒸饺|馄饨|小吃|烧烤|火锅|餐厅|餐吧|餐饮|快餐|饭堂|饭店|食堂|早点|早餐|糕点|糕|饼|茶|喜茶|古茗|霸王茶姬|Bistro|海鲜|海参|膳|菜馆|酒家|食府|美食|味道|人家|扫码付-YY|堂食|葡國餐|葡国餐|黑色经典|luckin|coffee|咖啡|星巴克|瑞幸|MILK TEA|奶茶|餐單|餐单|马迭尔|冰棍|food|gala|美团|饿了么|泉膳|山野板扎|末食|魏斯理|COMIDAS|N ICE ICE|炒浇面|羊肉汤|水盆羊肉|粥|包子|馒头|油炸糕|俺家早点|自助快餐|小厨房|好再来|奶奶的味道|美珍香|顺鑫红肠|桃酥王|兰琪食品|大自然甜栗|卫岗|乳业|烤冷面|有七有喝|雨花台区|栖霞区|官渡|富仔|渝孟爷|陕九品|老新隆|方妈|樊家|虎子|西穆苑|关中里|小曼|国脆|中国兰州|横琴沙县|大三巴|吴城|赵家鸡蛋饼|徐州市鸡蛋饼|王记|徐记']
  ].map(function (x) { return { cat: x[0], re: new RegExp(x[1], 'i') }; });

  /* ---------------- 基础工具 ---------------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[¥￥,\s]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function clean(v) {
    var s = String(v == null ? '' : v).trim();
    if (s === '/' || s === 'nan' || s === 'NaN') return '';
    return s;
  }
  /* 支付方式保留原文（微信账单里常见空值被导出为 /） */
  function payText(v) {
    var s = String(v == null ? '' : v).trim();
    return s === 'nan' || s === 'NaN' ? '' : s;
  }
  /* 统一输出 'YYYY-MM-DD HH:mm' */
  function toTime(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      /* ExcelJS 读日期单元格：UTC 分量即表格里的墙上时间 */
      return v.getUTCFullYear() + '-' + p2(v.getUTCMonth() + 1) + '-' + p2(v.getUTCDate()) +
        ' ' + p2(v.getUTCHours()) + ':' + p2(v.getUTCMinutes());
    }
    var s = String(v == null ? '' : v).trim().replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
    if (!m) return '';
    return m[1] + '-' + p2(+m[2]) + '-' + p2(+m[3]) + ' ' + p2(+m[4]) + ':' + m[5];
  }
  function timeVal(t) {
    if (!t) return 0;
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
  }

  /* ---------------- 分类 ---------------- */
  function classifyText(text) {
    var t = String(text || '');
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(t)) return { cat: RULES[i].cat, src: '词典' };
    }
    return { cat: '其他', src: '默认' };
  }
  function classifyWeChat(rec) {
    var typ = rec.type;
    if (typ === '转账') return { cat: '转账往来', src: '词典' };
    if (typ === '微信红包') return { cat: '红包往来', src: '词典' };
    if (typ === '群收款') return { cat: '群收款', src: '词典' };
    if (typ === '二维码收款') return { cat: '收款码收入', src: '词典' };
    if (typ === '其他') return { cat: '其他收入', src: '词典' };
    return classifyText(rec.mer + ' ' + rec.desc + ' ' + rec.note);
  }

  /* ---------------- 文件识别 ---------------- */
  function headerKind(cells) {
    var set = {};
    cells.forEach(function (c) { set[String(c == null ? '' : c).trim()] = 1; });
    var has = function (k) { return !!set[k]; };
    if (has('交易时间') && has('金额(元)')) return '微信';
    if (has('交易时间') && has('交易分类') && has('交易订单号')) return '支付宝';
    if (has('交易时间') && has('交易对方') && has('收/支')) return '微信';
    return '';
  }

  function isZip(buf) {
    var b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
  }

  function decodeText(buf) {
    var u8 = new Uint8Array(buf);
    var utf8 = new TextDecoder('utf-8').decode(u8);
    if (utf8.indexOf('\uFFFD') < 0) return utf8.replace(/^\uFEFF/, '');
    try { return new TextDecoder('gbk').decode(u8); } catch (e) { return utf8; }
  }

  /* CSV：支持引号包裹，也兼容支付宝「字段尾部夹 tab」的导出怪癖 */
  function splitCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.replace(/\t/g, '').trim(); });
  }

  /* ---------------- 微信 xlsx ---------------- */
  function wechatFromRows(table) {
    var hdr = -1, kind = '';
    for (var i = 0; i < Math.min(table.length, 60); i++) {
      kind = headerKind(table[i] || []);
      if (kind) { hdr = i; break; }
    }
    if (hdr < 0) return null;
    var head = (table[hdr] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
    var idx = {};
    head.forEach(function (h, i) { if (h && idx[h] == null) idx[h] = i; });

    var out = [];
    for (var r = hdr + 1; r < table.length; r++) {
      var row = table[r] || [];
      var t = toTime(row[idx['交易时间']]);
      if (!t) continue;
      var rawDir = String(row[idx['收/支']] == null ? '' : row[idx['收/支']]).trim();
      out.push({
        p: kind,
        time: t,
        type: clean(row[idx['交易类型']]),
        dir: rawDir === '收入' || rawDir === '支出' ? rawDir : '不计收支',
        catRaw: '',
        mer: String(row[idx['交易对方']] == null ? '' : row[idx['交易对方']]).trim(),
        desc: clean(row[idx['商品']]),
        amt: num(row[idx['金额(元)']]),
        pay: payText(row[idx['支付方式']]),
        st: clean(row[idx['当前状态']]),
        oid: clean(row[idx['交易单号']]),
        mid: clean(row[idx['商户单号']]),
        note: clean(row[idx['备注']])
      });
    }
    return { platform: kind, rows: out };
  }

  /* ---------------- 支付宝 csv ---------------- */
  var AZ_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),(.*?),([^,]*),(.*?),(.*?),(收入|支出|不计收支),(-?[\d.]+),(.*?),([^,]*),(.*?),(.*?),(.*?),?$/;

  function alipayFromText(text) {
    var lines = text.split(/\r?\n/);
    var hdr = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*交易时间\s*,/.test(lines[i]) || lines[i].indexOf('交易时间,交易分类') === 0) { hdr = i; break; }
    }
    var out = [];
    if (hdr >= 0) {
      var head = splitCsvLine(lines[hdr]);
      var idx = {};
      head.forEach(function (h, j) { if (h && idx[h] == null) idx[h] = j; });
      for (var r = hdr + 1; r < lines.length; r++) {
        var line = lines[r];
        if (!/^\d{4}-\d{2}-\d{2} /.test(line)) continue;
        var f = splitCsvLine(line);
        if (f.length < 11) continue;
        out.push({
          p: '支付宝',
          time: toTime(f[idx['交易时间']]),
          type: clean(f[idx['交易分类']]),
          dir: f[idx['收/支']] === '收入' || f[idx['收/支']] === '支出' ? f[idx['收/支']] : '不计收支',
          catRaw: clean(f[idx['交易分类']]),
          mer: String(f[idx['交易对方']] == null ? '' : f[idx['交易对方']]).trim(),
          desc: clean(f[idx['商品说明']]),
          amt: num(f[idx['金额']]),
          pay: payText(f[idx['收/付款方式']]),
          st: clean(f[idx['交易状态']]),
          oid: clean(f[idx['交易订单号']]),
          mid: clean(f[idx['商家订单号']]),
          note: clean(f[idx['备注']])
        });
      }
      return { platform: '支付宝', rows: out };
    }
    /* 兜底：无表头的支付宝明细，按固定正则逐行提取 */
    for (var k = 0; k < lines.length; k++) {
      var m = lines[k].match(AZ_RE);
      if (!m) continue;
      out.push({
        p: '支付宝',
        time: toTime(m[1]),
        type: clean(m[2]),
        dir: m[6],
        catRaw: clean(m[2]),
        mer: String(m[3] || '').trim(),
        desc: clean(m[5]),
        amt: num(m[7]),
        pay: payText(m[8]),
        st: clean(m[9]),
        oid: clean(m[10]),
        mid: clean(m[11]),
        note: clean(m[12])
      });
    }
    return out.length ? { platform: '支付宝', rows: out } : null;
  }

  /* 支付宝表格型（部分用户会把 csv 另存为 xlsx） */
  function alipayFromTable(table) {
    var w = wechatFromRows(table);
    if (!w && table.length) {
      for (var i = 0; i < Math.min(table.length, 60); i++) {
        var head = (table[i] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
        if (head.indexOf('交易分类') >= 0 && head.indexOf('金额') >= 0) {
          var idx = {};
          head.forEach(function (h, j) { if (h && idx[h] == null) idx[h] = j; });
          var out = [];
          for (var r = i + 1; r < table.length; r++) {
            var row = table[r] || [];
            var t = toTime(row[idx['交易时间']]);
            if (!t) continue;
            var d = String(row[idx['收/支']] || '').trim();
            out.push({
              p: '支付宝', time: t, type: clean(row[idx['交易分类']]),
              dir: d === '收入' || d === '支出' ? d : '不计收支',
              catRaw: clean(row[idx['交易分类']]),
              mer: String(row[idx['交易对方']] == null ? '' : row[idx['交易对方']]).trim(),
              desc: clean(row[idx['商品说明']]), amt: num(row[idx['金额']]),
              pay: payText(row[idx['收/付款方式']]), st: clean(row[idx['交易状态']]),
              oid: clean(row[idx['交易订单号']]), mid: clean(row[idx['商家订单号']]),
              note: clean(row[idx['备注']])
            });
          }
          return { platform: '支付宝', rows: out };
        }
      }
    }
    return null;
  }

  /* ---------------- 对外：解析文件 ---------------- */
  function parseFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var res = { wechat: [], alipay: [], warnings: [], sources: [], files: [] };

    return list.reduce(function (chain, file) {
      return chain.then(function () {
        return file.arrayBuffer().then(function (buf) {
          if (isZip(buf)) {
            if (!global.ExcelJS) throw new Error('ExcelJS 未加载');
            var wb = new global.ExcelJS.Workbook();
            return wb.xlsx.load(buf).then(function () {
              var got = null;
              wb.worksheets.some(function (ws) {
                var table = [];
                ws.eachRow({ includeEmpty: false }, function (row) {
                  var arr = [];
                  for (var c = 1; c <= Math.max(ws.columnCount, 12); c++) {
                    var v = row.getCell(c).value;
                    if (v && typeof v === 'object' && v.richText) v = v.richText.map(function (x) { return x.text; }).join('');
                    if (v && typeof v === 'object' && v.text) v = v.text;
                    if (v && typeof v === 'object' && v.result != null) v = v.result;
                    arr.push(v);
                  }
                  table.push(arr);
                });
                if (!table.length) return false;
                got = wechatFromRows(table) || alipayFromTable(table);
                return !!got;
              });
              if (!got) { res.warnings.push(file.name + '：没找到可识别的表头'); return; }
              push(got, file);
              return;
            });
          }
          var text = decodeText(buf);
          var hit = null;
          var head = text.split(/\r?\n/).slice(0, 80).join('\n');
          var probe = headerKind(head.split(',').map(function (s) { return s.replace(/\t/g, '').trim(); }));
          if (probe === '微信') {
            var table2 = text.split(/\r?\n/).map(splitCsvLine);
            hit = wechatFromRows(table2);
          } else {
            hit = alipayFromText(text);
          }
          if (!hit) { res.warnings.push(file.name + '：无法识别为微信 / 支付宝账单'); return; }
          push(hit, file);
          return;
        });
      });
    }, Promise.resolve()).then(function () {
      return res;
    });

    function push(hit, file) {
      if (hit.platform === '微信') res.wechat = res.wechat.concat(hit.rows);
      else res.alipay = res.alipay.concat(hit.rows);
      var name = (file && file.name) || '未命名文件';
      res.sources.push({ name: name, platform: hit.platform, n: hit.rows.length });
      res.files.push({
        name: name,
        platform: hit.platform,
        size: (file && file.size) || 0,
        mtime: (file && file.lastModified) || 0,
        rows: hit.rows
      });
    }
  }

  /* ---------------- 退款状态解析（微信） ---------------- */
  function wxStatusRefund(rec) {
    var s = String(rec.st || '');
    if (s.indexOf('全额退款') >= 0) return r2(rec.amt);
    var m = s.match(/已退款[（(]?¥([\d.]+)/);
    return m ? r2(parseFloat(m[1])) : 0;
  }
  function azBase(oid) {
    return String(oid || '').split('_')[0].split('*')[0];
  }

  /* ---------------- 对外：构建账单 ---------------- */
  function buildBill(raw, overrides) {
    raw = raw || {};
    var ov = overrides || {};
    var wx = (raw.wechat || []).slice();
    var az = (raw.alipay || []).slice();

    var detail = [], refunds = [], neutral = [];
    var wxPairs = [];

    /* ---- 微信支出（含退款状态回填） ---- */
    var wxExp = wx.filter(function (r) { return r.dir === '支出' && !/退款/.test(r.type); })
      .map(function (r) {
        return { r: r, statusRefund: wxStatusRefund(r), allocated: 0, refundTime: '', refundIds: '' };
      });

    var wxRef = wx.filter(function (r) { return /退款/.test(r.type); })
      .slice().sort(function (a, b) { return timeVal(a.time) - timeVal(b.time); });

    wxRef.forEach(function (ref) {
      var amt = r2(ref.amt);
      var rt = timeVal(ref.time);
      var cand = wxExp.filter(function (x) {
        return (x.statusRefund - x.allocated) >= amt - 0.005 &&
          timeVal(x.r.time) <= rt + 1440;
      });
      var pool = cand.filter(function (x) { return Math.abs((x.statusRefund - x.allocated) - amt) < 0.005; });
      if (!pool.length) pool = cand.filter(function (x) { return x.r.mer === ref.mer; });
      if (!pool.length) {
        pool = cand.filter(function (x) {
          var ratio = Math.round((x.statusRefund - x.allocated) / amt);
          return ratio >= 1 && Math.abs((x.statusRefund - x.allocated) - amt * ratio) < 0.01;
        });
      }
      if (!pool.length) { wxPairs.push({ ref: ref, target: null }); return; }

      var before = pool.filter(function (x) { return timeVal(x.r.time) <= rt; });
      var use = before.length ? before : pool;
      var best = use[0];
      for (var i = 1; i < use.length; i++) {
        if (timeVal(use[i].r.time) > timeVal(best.r.time)) best = use[i];
      }
      best.allocated = r2(best.allocated + amt);
      if (!best.refundTime || timeVal(ref.time) < timeVal(best.refundTime)) best.refundTime = ref.time;
      best.refundIds = (best.refundIds ? best.refundIds + '；' : '') + ref.oid;
      wxPairs.push({ ref: ref, target: best });
    });

    wxExp.forEach(function (x) {
      var r = x.r;
      var c = classifyWeChat(r);
      var cat = c.cat, src = c.src;
      if (ov[r.mer]) { cat = ov[r.mer]; src = '人工'; }
      var amt = r2(r.amt);
      var refund = r2(Math.min(x.statusRefund, amt));
      var net = r2(amt - refund);
      var rtype = refund <= 0.005 ? '无退款' : (net <= 0.005 ? '全额退款' : '部分退款');
      var isRel = TRANSFER.indexOf(cat) >= 0;
      detail.push({
        t: r.time, m: r.time.slice(0, 7), p: '微信', ot: r.type, dir: '支出', cat: cat,
        cs: src,
        who: isRel ? r.mer : '', mer: r.mer, desc: r.desc, amt: amt, ref: refund, net: net,
        pay: r.pay, st: r.st, oid: r.oid, rids: refund > 0 ? x.refundIds : '',
        rt: refund > 0 ? x.refundTime : '', rtype: rtype, note: r.note
      });
    });

    /* ---- 微信收入 ---- */
    wx.filter(function (r) { return r.dir === '收入' && !/退款/.test(r.type); }).forEach(function (r) {
      var c = classifyWeChat(r);
      var cat = c.cat, src = c.src;
      if (ov[r.mer]) { cat = ov[r.mer]; src = '人工'; }
      var amt = r2(r.amt);
      detail.push({
        t: r.time, m: r.time.slice(0, 7), p: '微信', ot: r.type, dir: '收入', cat: cat, cs: src,
        who: TRANSFER.concat(['收款码收入']).indexOf(cat) >= 0 ? r.mer : '',
        mer: r.mer, desc: r.desc, amt: amt, ref: 0, net: amt, pay: r.pay, st: r.st,
        oid: r.oid, rids: '', rt: '', rtype: '无退款', note: r.note
      });
    });

    /* ---- 支付宝退款索引 ---- */
    var azRef = az.filter(function (r) { return r.desc.indexOf('退款-') === 0 || r.st === '退款成功'; });
    var azOrig = az.filter(function (r) { return !(r.desc.indexOf('退款-') === 0 || r.st === '退款成功'); });
    var azRmap = {}, azRtime = {}, azRids = {};
    azRef.forEach(function (r) {
      var b = azBase(r.oid);
      azRmap[b] = r2((azRmap[b] || 0) + r2(r.amt));
      if (!azRtime[b] || timeVal(r.time) < timeVal(azRtime[b])) azRtime[b] = r.time;
      azRids[b] = azRids[b] ? azRids[b] + '；' + r.oid : r.oid;
    });

    /* ---- 支付宝支出 -- */
    azOrig.filter(function (r) { return r.dir === '支出'; }).forEach(function (r) {
      var amt = r2(r.amt);
      var b = azBase(r.oid);
      var refund = r2(Math.min(azRmap[b] || 0, amt));
      var net = r2(amt - refund);
      var cat = r.catRaw || '其他';
      var src = '平台';
      if (cat === '其他') {
        var c = classifyText(r.mer + ' ' + r.desc);
        cat = c.cat; src = c.src;
      }
      if (ov[r.mer]) { cat = ov[r.mer]; src = '人工'; }
      var rtype = refund <= 0.005 ? '无退款' : (net <= 0.005 ? '全额退款' : '部分退款');
      detail.push({
        t: r.time, m: r.time.slice(0, 7), p: '支付宝', ot: r.type, dir: '支出', cat: cat, cs: src,
        who: cat === '转账往来' ? r.mer : '', mer: r.mer, desc: r.desc, amt: amt,
        ref: refund, net: net, pay: r.pay, st: r.st, oid: r.oid,
        rids: refund > 0 ? (azRids[b] || '') : '',
        rt: refund > 0 ? (azRtime[b] || '') : '', rtype: rtype, note: r.note
      });
    });

    /* ---- 支付宝收入 ---- */
    azOrig.filter(function (r) { return r.dir === '收入'; }).forEach(function (r) {
      var cat;
      if (r.type === '转账红包' || /闲鱼转账|批量付款|转账/.test(r.desc)) cat = '转账往来';
      else if (r.desc.indexOf('收钱码收款') >= 0) cat = '收款码收入';
      else cat = '其他收入';
      var src = '平台';
      if (ov[r.mer]) { cat = ov[r.mer]; src = '人工'; }
      var amt = r2(r.amt);
      detail.push({
        t: r.time, m: r.time.slice(0, 7), p: '支付宝', ot: r.type, dir: '收入', cat: cat, cs: src,
        who: (cat === '转账往来' || cat === '收款码收入') ? r.mer : '',
        mer: r.mer, desc: r.desc, amt: amt, ref: 0, net: amt, pay: r.pay, st: r.st,
        oid: r.oid, rids: '', rt: '', rtype: '无退款', note: r.note
      });
    });

    /* ---- 排序 + 序号 ---- */
    detail.sort(function (a, b) {
      if (a.t !== b.t) return a.t < b.t ? -1 : 1;
      if (a.p !== b.p) return a.p < b.p ? -1 : 1;
      return 0;
    });
    detail.forEach(function (r, i) { r.id = i + 1; });

    /* ---- 退款核对 ---- */
    wxPairs.forEach(function (p) {
      var r = p.ref;
      var mer = r.mer || (String(r.type).replace('-退款', '') + '（转账）');
      var row = {
        p: '微信', t: r.time, mer: mer, amt: r2(r.amt), rid: r.oid,
        ot: '', oamt: 0, ooid: '', ost: '', match: '无原单（跨年）'
      };
      if (p.target) {
        row.ot = p.target.r.time;
        row.oamt = r2(p.target.r.amt);
        row.ooid = p.target.r.oid;
        row.ost = p.target.r.st;
        row.match = '已匹配';
      }
      refunds.push(row);
    });
    azRef.forEach(function (r) {
      var b = azBase(r.oid);
      var o = azOrig.filter(function (x) { return azBase(x.oid) === b; })[0];
      var row = {
        p: '支付宝', t: r.time, mer: r.mer, amt: r2(r.amt), rid: r.oid,
        ot: '', oamt: 0, ooid: '', ost: '', match: '无原单（跨年）'
      };
      if (o) {
        row.ot = o.time; row.oamt = r2(o.amt); row.ooid = o.oid; row.ost = o.st; row.match = '已匹配';
      }
      refunds.push(row);
    });
    refunds.sort(function (a, b) {
      if (a.p !== b.p) return a.p < b.p ? -1 : 1;
      if (a.t !== b.t) return a.t < b.t ? -1 : 1;
      return 0;
    });
    refunds.forEach(function (r) { r.om = (r.ot || r.t).slice(0, 7); });

    /* ---- 不计收支 ---- */
    wx.filter(function (r) { return r.dir === '不计收支'; }).forEach(function (r) {
      neutral.push({
        p: '微信', t: r.time, type: r.type, mer: r.mer, desc: r.desc,
        amt: r2(r.amt), st: r.st, reason: '本人账户之间划转（零钱提现/零钱通存取）'
      });
    });
    az.filter(function (r) {
      return r.dir === '不计收支' && !(r.desc.indexOf('退款-') === 0 || r.st === '退款成功');
    }).forEach(function (r) {
      neutral.push({
        p: '支付宝', t: r.time, type: r.type, mer: r.mer, desc: r.desc, amt: r2(r.amt), st: r.st,
        reason: r.type === '投资理财' ? '余额宝存取/收益，非消费' : '订单关闭，未实际支付'
      });
    });
    neutral.sort(function (a, b) {
      if (a.p !== b.p) return a.p < b.p ? -1 : 1;
      return a.t < b.t ? -1 : (a.t > b.t ? 1 : 0);
    });

    /* ---- 待确认分类（落入「其他」的支出，按商户聚合） ---- */
    var unkMap = {};
    detail.forEach(function (r) {
      if (r.dir !== '支出' || r.cat !== '其他' || r.cs === '人工') return;
      var k = r.mer;
      if (!unkMap[k]) unkMap[k] = { mer: r.mer, n: 0, net: 0, ref: 0, sample: '', pay: '' };
      var u = unkMap[k];
      u.n += 1; u.net += r.net; u.ref += r.ref;
      if (!u.sample && r.desc) u.sample = r.desc;
      if (!u.pay && r.pay) u.pay = r.pay;
    });
    var unknown = Object.keys(unkMap).map(function (k) {
      var u = unkMap[k];
      return { mer: u.mer, n: u.n, net: r2(u.net), ref: r2(u.ref), sample: u.sample, pay: u.pay };
    }).sort(function (a, b) { return b.net - a.net; });

    /* ---- meta ---- */
    var allTimes = detail.map(function (r) { return r.t; })
      .concat(refunds.map(function (r) { return r.t; }))
      .concat(neutral.map(function (r) { return r.t; }))
      .filter(Boolean).sort();
    var first = allTimes[0] || '';
    var last = allTimes[allTimes.length - 1] || '';
    var years = {};
    allTimes.forEach(function (t) { years[t.slice(0, 4)] = 1; });
    var yearList = Object.keys(years).sort();
    var year = yearList.length === 1 ? yearList[0] : (yearList[0] || '') + (yearList.length > 1 ? '-' + yearList[yearList.length - 1] : '');

    return {
      meta: {
        title: (yearList.length === 1 ? yearList[0] + ' 年度消费账单' : '消费账单'),
        year: year,
        period: (first ? first.slice(0, 10) : '') + ' — ' + (last ? last.slice(0, 10) : ''),
        generated: nowStr(),
        source: [wx.length ? '微信支付账单' : '', az.length ? '支付宝交易明细' : ''].filter(Boolean).join(' + '),
        counts: {
          wechat: wx.length,
          alipay: az.length,
          detail: detail.length,
          refunds: refunds.length,
          neutral: neutral.length,
          unknown: unknown.length
        }
      },
      detail: detail,
      refunds: refunds,
      neutral: neutral,
      unknown: unknown
    };
  }

  function nowStr() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  global.BillParser = {
    CATEGORIES: CATEGORIES,
    TRANSFER: TRANSFER,
    RULES: RULES,
    parseFiles: parseFiles,
    buildBill: buildBill,
    classifyText: classifyText,
    _toTime: toTime,
    _splitCsvLine: splitCsvLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
