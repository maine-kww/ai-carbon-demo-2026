// 探针：批次C 基准日与政策状态口径统一
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

console.log('=== C1 核验基准日全站统一为 2026-10-13 ===');
check('源码不含 2026-10-15', html.indexOf('2026-10-15') < 0);
const dateHits = (html.match(/2026-10-13/g) || []).length;
check('源码多处引用 2026-10-13（≥10）', dateHits >= 10, dateHits);

console.log('=== C2 政策状态：程序不再默认赋「现行有效」===');
check('四川条目状态为待核实', String(api.KB_PROVINCE['四川'].status).indexOf('待核实') >= 0, api.KB_PROVINCE['四川'].status);
check('江苏条目状态为待核实', String(api.KB_PROVINCE['江苏'].status).indexOf('待核实') >= 0, api.KB_PROVINCE['江苏'].status);
check('基准年度默认标待核实', String(api.KB_PROVINCE['四川'].baseYear).indexOf('待核实') >= 0, api.KB_PROVINCE['四川'].baseYear);
check('贵州真实文号条目保留现行有效', api.KB_PROVINCE['贵州'].docs.every(d => d.status === '现行有效'),
  JSON.stringify((api.KB_PROVINCE['贵州'].docs || []).map(d => d.status)));
check('国家级政策库 POL 条目仍为现行有效（有文号）', api.KB_POLICY.items.every(p => String(p.status).indexOf('现行有效') >= 0));

console.log('=== C2b 方案书输出 ===');
const c = { name:'口径厂', industry:'水泥建材', province:'贵州', scale:'大型企业', stage:'合规阶段',
  pains:['合规履约压力'], products:['碳盘查核算'], budget:'80-200万', chain:'EHS→总经理',
  em:{ scope1:[], scope2:[], scope3:[] }, date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'x', changeLog:'' };
const doc = api.buildDoc(c);
check('方案书核验基准日 2026-10-13', doc.indexOf('核验基准日 2026-10-13') >= 0);
check('方案书无 2026-10-15', doc.indexOf('2026-10-15') < 0);
check('政策章仍含现行有效（POL 带文号）', doc.indexOf('现行有效') >= 0);
check('属地生效状态按数据输出（贵州 docs 现行有效仍可见）', doc.indexOf('黔党发〔2022〕23 号') >= 0, doc.indexOf('黔党发'));
const c2 = { name:'口径厂2', industry:'钢铁', province:'四川', scale:'中型企业', stage:'数据阶段',
  pains:[], products:[], budget:'', chain:'', em:{ scope1:[], scope2:[], scope3:[] }, date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
const doc2 = api.buildDoc(c2);
check('未核验省份在方案书中显示待核实', doc2.indexOf('待核实（以最新官方发布为准）') >= 0, doc2.slice(doc2.indexOf('生效状态'), doc2.indexOf('生效状态') + 120));

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
