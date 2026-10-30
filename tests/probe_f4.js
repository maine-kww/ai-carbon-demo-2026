// 探针：F4 Scope2 组织法/市场法双口径
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false,
    className: '', checked: false, children: [], style: {},
    classList: { _s:{}, add(c){this._s[c]=1;}, remove(c){delete this._s[c];}, toggle(){}, contains(c){return !!this._s[c];} },
    setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {}, scrollTop: 0, scrollHeight: 0
  };
}
const getEl = (id) => { if (!store[id]) store[id] = mkEl(id); return store[id]; };
const docStub = {
  getElementById: getEl, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createElement: () => mkEl('t'), body: mkEl('body')
};
const lsStub = { _d:{}, getItem(k){return this._d[k]===undefined?null:this._d[k];}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];}, clear(){this._d={};} };
const vm = require('vm');
const sandbox = {
  window: { __SMART_PAGE__: null, print: () => {} },
  document: docStub, localStorage: lsStub,
  confirm: () => false, prompt: () => '', console, setTimeout, clearTimeout,
  Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  navigator: { userAgent: 'node' },
  Date, Math, JSON, RegExp, Error, String, Number, Object, Array, Promise, isNaN, parseInt, parseFloat
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'page.js' });
const api = sandbox;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

console.log('=== F4a calcEngine 双口径 ===');
const D0 = api.normEm({ em:{ clinkerOut:150, coal:24, diesel:100, af:0, limestone:120, altRaw:0, gridBuy:100, whr:0, greenPower:0 } });
const R0 = api.calcEngine(D0);
check('无绿电时 组织法=市场法=450', Math.abs(R0.scope2Loc - 450) < 1e-9 && Math.abs(R0.scope2Mkt - 450) < 1e-9, R0.scope2Loc + ',' + R0.scope2Mkt);
check('无绿电时 scope2Corr 与市场法一致', Math.abs(R0.scope2Corr - R0.scope2Mkt) < 1e-9);
const D1 = api.normEm({ em:{ clinkerOut:150, coal:24, diesel:100, af:0, limestone:120, altRaw:0, gridBuy:100, whr:0, greenPower:2 } });
const R1 = api.calcEngine(D1);
check('有绿电时市场法=组织法−20MWh×0.45', Math.abs(R1.scope2Mkt - (R1.scope2Loc - 9)) < 1e-9, R1.scope2Loc + ',' + R1.scope2Mkt);
check('组织法不扣绿电（450）', Math.abs(R1.scope2Loc - 450) < 1e-9, R1.scope2Loc);
check('市场法扣绿电（441）', Math.abs(R1.scope2Mkt - 441) < 1e-9, R1.scope2Mkt);
check('绿电差额恰好 = 20×0.45', Math.abs((R1.scope2Loc - R1.scope2Mkt) - 9) < 1e-9);

console.log('=== F4b l1l2Check 用市场法口径 ===');
const cL2 = { name:'双口径厂', industry:'水泥建材', province:'四川',
  em:{
    coal:24, af:0, diesel:100, clinkerOut:150, limestone:120, altRaw:0, gridBuy:100, whr:0, greenPower:0,
    scope1:[
      { id:'S1-01', source:'原煤', activity:240000, unit:'t', formula:'fuelByMass', factorRefs:['coalNCV','coalCC','coalOX'], judgment:'纳入',
        factors:{ coalNCV:{v:21,src:'缺省',quality:'国家缺省'}, coalCC:{v:26.18,src:'缺省',quality:'国家缺省'}, coalOX:{v:0.99,src:'缺省',quality:'国家缺省'} } },
      { id:'S1-02', source:'柴油', activity:100, unit:'t', formula:'fuelByEF', factorRefs:['dieselNCV','dieselEF'], judgment:'纳入',
        factors:{ dieselNCV:{v:42.65,src:'指南',quality:'国家缺省'}, dieselEF:{v:74100,src:'指南',quality:'国家缺省'} } },
      { id:'S1-03', source:'工艺', activity:1500000, unit:'t', formula:'process', factorRefs:['clinkerEF'], judgment:'纳入',
        factors:{ clinkerEF:{v:0.535,src:'指南',quality:'国家缺省'} } }
    ],
    scope2:[
      { id:'S2-01', source:'外购电', activity:1000, unit:'MWh', formula:'grid', factorRefs:['gridEF'], judgment:'纳入',
        factors:{ gridEF:{v:0.45,src:'电网因子',quality:'区域平均'} } }
    ],
    scope3:[]
  } };
const ck = api.l1l2Check(cL2);
check('L1/L2 范围2 偏差 <0.001（市场法口径）', ck.dev2 < 0.001, ck.dev2);

console.log('=== F4c 窗口三/第四章双口径展示 ===');
cL2.em.scope2.push({ id:'S2-03', source:'绿电（有凭证）', activity:20, unit:'MWh', formula:'zero', factorRefs:[], judgment:'纳入', factors:{} });
const htmlL2 = api.l2AccountingHtml(cL2);
check('含组织法/位置法行', htmlL2.indexOf('组织法/位置法') >= 0, htmlL2.slice(htmlL2.indexOf('排放汇总'), htmlL2.indexOf('排放汇总') + 300));
check('含市场法行', htmlL2.indexOf('市场法，扣凭证绿电') >= 0);
check('绿电双口径差异说明', htmlL2.indexOf('差异 9 tCO₂e') >= 0, htmlL2.match(/差异 [^<]*/g) ? htmlL2.match(/差异 [^<]*/g)[0] : '无');
const Rself = api.runCalcSelfTest();
check('自检口径不变（修正=市场法 93600）', Rself.fail === 0, 'fail=' + Rself.fail);
check('自检 R.scope2Mkt = 93600', Math.abs(Rself.R.scope2Mkt - 93600) < 5, Rself.R.scope2Mkt);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
