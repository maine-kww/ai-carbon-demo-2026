// 探针：F3 导入校验与批量落库
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

console.log('=== F3 导入校验 ===');
let p = api.parseImportPayload(null);
check('null 输入 → 空结果不抛错', p.customers.length === 0 && p.tasks.length === 0);
p = api.parseImportPayload({ customers: [
  { name: '  好客户  ', industry: '水泥建材', pains: '合规履约压力、出口CBAM门槛', products: ['碳盘查核算'] },
  { name: '', industry: 'x' },
  null,
  { name: 123, industry: 'y' }
], tasks: [
  { name: '任务A', client: '好客户', invest: '80000', cut: '12.5' },
  { name: '缺客户', invest: 0 }
] });
check('缺名客户被跳过', p.skippedC === 2, JSON.stringify({skip:p.skippedC, keep:p.customers.length}));
check('数字名被强制为字符串保留', p.customers.length === 2 && p.customers[1].name === '123', JSON.stringify(p.customers));
check('客户名 trim 并保真', p.customers[0].name === '好客户', p.customers[0].name);
check('痛点字符串转数组', Array.isArray(p.customers[0].pains) && p.customers[0].pains.length === 2, JSON.stringify(p.customers[0].pains));
check('缺客户名任务被跳过', p.skippedT === 1 && p.tasks.length === 1);
check('投资/减排量字符串转数字', p.tasks[0].invest === 80000 && p.tasks[0].cut === 12.5, JSON.stringify(p.tasks[0].invest + ',' + p.tasks[0].cut));

console.log('=== F3 批量落库 ===');
api.state.customers = [];
api.state.tasks = [];
api.state.docHtml = {};
api.tombAdd(['好客户']);
api.applyImport(p);
check('批量导入客户入列', api.state.customers.length === 2, api.state.customers.length);
check('批量导入任务入列', api.state.tasks.length === 1, api.state.tasks.length);
check('导入撤销墓碑（用户主动导入同名）', !api.tombHas('好客户'), api.tombGet().join(','));
check('导入记录带 updatedAt', !!api.state.customers[0].updatedAt && !!api.state.tasks[0].updatedAt);
check('localStorage 已单次落盘', Array.isArray(JSON.parse(api.localStorage.getItem('wb_shuangtan_customers_' + api.DATABASE_ID))) &&
  JSON.parse(api.localStorage.getItem('wb_shuangtan_customers_' + api.DATABASE_ID)).length === 2);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
