// 探针：F6 估算值质量标签纠正
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

console.log('=== F6 估算值质量标签 ===');
check('枚举含「估算」', api.SCOPE_COLLECTION.qualityLevels.indexOf('估算') >= 0, JSON.stringify(api.SCOPE_COLLECTION.qualityLevels));
['s3Freight','s3FreightUp','s3FreightDown','s3Capital','s3Waste','s3Travel','s3Commute','lossEF'].forEach(function(k){
  check(k + ' quality=估算', api.libFactor(k).quality === '估算', k + '=' + api.libFactor(k).quality);
});
check('gridEF 仍为区域平均（非估算）', api.FACTOR_LIB.scope2.gridEF.quality === '区域平均');
check('clinkerEF 仍为国家缺省（官方值）', api.FACTOR_LIB.scope1.clinkerEF.quality === '国家缺省');
// 状态徽标：scope3 估算因子 → 「估算因子·待核实」
const c = { name:'估算厂', industry:'钢铁', em:{
  scope3:[{ id:'S3-01', factorRef:'s3Freight', judgment:'纳入', activity:1000,
    factors:{ s3Freight:{ v:0.0001, src:'估算', quality:'估算' } } }]
} };
const st = api.factorStatusOf(c, 'scope3', c.em.scope3[0]);
check('估算因子徽标为「估算因子·待核实」', st.cls === 'info' && st.label.indexOf('估算') >= 0, st.label);
check('估算值不再冒充国家缺省（无「国家默认」标签）', st.label.indexOf('国家') < 0, st.label);
// 行内录入后估算值仍可计算（值不变：1000×0.0001=0.1）
check('估算因子计算不受标签影响', Math.abs(api.l2RowEmit('scope3', c.em.scope3[0]) - 0.1) < 1e-9, api.l2RowEmit('scope3', c.em.scope3[0]));

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
