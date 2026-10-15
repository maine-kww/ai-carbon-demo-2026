// 四窗口跑通 + 固定水泥板块排查：虚拟非水泥企业，渲染四窗口并扫描输出
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'shuangtan.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

// ---- 最小 DOM 桩（同 smoke.js）----
const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false,
    className: '', checked: false, children: [], style: {}, _listeners: {},
    classList: { _s:{}, add(c){this._s[c]=1;}, remove(c){delete this._s[c];}, toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;}, contains(c){return !!this._s[c];} },
    setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {}, appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; }, querySelector() { return null; }, querySelectorAll() { return []; },
    reset() { this.value = ''; }, scrollTop: 0, scrollHeight: 0, closest() { return null; }, focus() {}, click() {}
  };
}
const getEl = (id) => { if (!store[id]) store[id] = mkEl(id); return store[id]; };
const stepsEl = getEl('steps'); for (let i = 0; i < 7; i++) stepsEl.children.push(mkEl('step-' + i));
const docStub = { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [], addEventListener: (ev, fn) => {}, createElement: () => mkEl('tmp'), body: mkEl('body') };
const lsStub = { _d:{}, getItem(k){return this._d[k]===undefined?null:this._d[k];}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];}, clear(){this._d={};} };
const sandbox = {
  window: { __SMART_PAGE__: null, print: () => {} }, document: docStub, localStorage: lsStub,
  confirm: () => false, prompt: (m) => '测试备注', console, setTimeout, clearTimeout,
  Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  navigator: { userAgent: 'node' },
  Date, Math, JSON, RegExp, Error, String, Number, Object, Array, Promise, isNaN, parseInt, parseFloat
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox;

// ---- 构造虚拟企业 ----
function mkSteel() {
  var c = {
    name: '唐山宏远钢铁集团', industry: '钢铁', province: '河北', city: '唐山', creditCode: '91130200TEST0001',
    scale: '大型', isETS: '是', etsYear: '2022', isCBAM: '是', stage: '合规阶段',
    em: { scope1: [], scope2: [], scope3: [] },
    production: 1500,        // 主产品产量（万吨钢）
    cbamExport: 120,         // 出口量（万吨）
    pains: ['碳成本上升'], dataAvail: {}, docVer: {}
  };
  api.ensureL2(c);
  // 填入活动数据（行业适配模板，因子源留空 → 诚实“待补因子”）
  if (c.em.scope1[0]) c.em.scope1[0].activity = 320;
  if (c.em.scope2[0]) c.em.scope2[0].activity = 120000;
  if (c.em.scope3 && c.em.scope3.length) { var r3 = c.em.scope3.find(function(r){return r.factorRef;}); if (r3){ r3.judgment = '纳入'; r3.activity = 1500; } }
  return c;
}
function mkOther() {
  var c = { name: '示例食品公司', industry: '其他', province: '广东', city: '广州', creditCode: '91440100TEST0002',
    scale: '中型', isETS: '否', isCBAM: '否', stage: '诊断阶段', em: { scope1: [], scope2: [], scope3: [] }, docVer: {} };
  return c;
}

// ---- 渲染并抓取各窗口 HTML ----
function renderAll(c, tag) {
  api.state.cur = c; api.state.customers = [c]; api.state.tasks = [];
  api.refreshAll();
  api.renderCollector(); api.renderAsk(); api.renderToday(); api.renderChat(); api.renderL2();
  var doc = api.buildDoc(c); api.state.docHtml = api.state.docHtml || {}; api.state.docHtml[c.name] = doc; api.renderDoc();
  var boxes = ['collectBox','askBox','todayBox','chatLog','planBox','paramsBox','calcBox','l2Box','l2Sum','l2Check','l2gs_scope1','l2gs_scope2','l2gs_scope3','docBody'];
  var out = {};
  boxes.forEach(function(b){ out[b] = (store[b] && store[b].innerHTML) || ''; });
  out.__buildDoc = doc;
  // 附录C 成果物取值
  out.__dlv = {};
  ['主产品产量（本行业主产品）','单位嵌入排放（直接+间接）','出口量（按本行业功能单位）','主产品外销记录'].forEach(function(f){
    try { out.__dlv[f] = api.dlvFieldVal(c, api.calcEngine(api.normEm(c)), c.em, f); } catch(e){ out.__dlv[f] = 'ERR:'+e.message; }
  });
  return out;
}

var steel = mkSteel(), other = mkOther();
var rs = renderAll(steel, '钢铁'), ro = renderAll(other, '其他');

// ---- 拒绝清单：非水泥行业绝不应出现的固定水泥文案 ----
var DENY = ['熟料','吨熟料','余热自发电','替代燃料','熟料产量','水泥产量','熟料外销','tCO₂/t熟料','tCO₂/吨熟料','水泥行业'];
function scanWindow(name, html) {
  var hits = [];
  DENY.forEach(function(kw){
    var idx = html.indexOf(kw);
    if (idx >= 0) {
      var ctx = html.substring(Math.max(0, idx-30), idx+ kw.length + 30).replace(/\s+/g,' ');
      hits.push({ kw: kw, ctx: ctx });
    }
  });
  return hits;
}
function report(tag, captured) {
  console.log('\n========== ' + tag + ' ==========');
  var windows = { '窗口一·诊断题库(collectBox)':'collectBox','窗口一·问答(askBox)':'askBox','窗口二·政策落地(planBox)':'planBox',
    '窗口三·参数面板(paramsBox)':'paramsBox','窗口三·计算引擎(calcBox)':'calcBox','窗口三·L2采集(l2Box)':'l2Box',
    '窗口四·方案书(docBody)':'docBody','附录C·成果物取值':'__dlv' };
  Object.keys(windows).forEach(function(wn){
    var key = windows[wn];
    if (key === '__dlv') {
      Object.keys(captured.__dlv).forEach(function(f){ if (DENY.some(function(k){return (captured.__dlv[f]||'').indexOf(k)>=0;})) console.log('  ['+wn+'] 字段「'+f+'」= '+captured.__dlv[f]); });
      return;
    }
    var html = captured[key] || '';
    var hits = scanWindow(wn, html);
    if (hits.length) { console.log('  ['+wn+'] 命中固定水泥文案 ' + hits.length + ' 处:'); hits.forEach(function(h){ console.log('      ·「'+h.kw+'」…'+h.ctx+'…'); }); }
    else console.log('  ['+wn+'] 干净（无拒绝清单命中） len=' + html.length);
  });
  // buildDoc 整体再扫一次
  var bd = captured.__buildDoc || '';
  var bdh = scanWindow('窗口四·buildDoc全文', bd);
  if (bdh.length) { console.log('  [buildDoc全文] 命中 ' + bdh.length + ' 处:'); bdh.forEach(function(h){ console.log('      ·「'+h.kw+'」…'+h.ctx+'…'); }); }
  else console.log('  [buildDoc全文] 干净 len=' + bd.length);
}
report('虚拟企业·钢铁（河北·ETS·CBAM）', rs);
report('虚拟企业·其他（广东·无数据）', ro);

// 汇总
var totalSteel = 0, totalOther = 0;
function countCaptured(cap){ var n=0; ['collectBox','askBox','planBox','paramsBox','calcBox','l2Box','docBody','__buildDoc'].forEach(function(k){ scanWindow(k, cap[k]||'').forEach(function(){n++;}); }); Object.keys(cap.__dlv||{}).forEach(function(f){ if (DENY.some(function(k){return (cap.__dlv[f]||'').indexOf(k)>=0;})) n++; }); return n; }
totalSteel = countCaptured(rs); totalOther = countCaptured(ro);
console.log('\n==== 结论 ====');
console.log('钢铁企业 固定水泥文案命中: ' + totalSteel + ' 处');
console.log('其他企业 固定水泥文案命中: ' + totalOther + ' 处');
process.exit(0);
