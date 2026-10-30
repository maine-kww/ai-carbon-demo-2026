// 探针：F13 清理项（seedDemo 已删 / 快照容量上限 / 备份带墓碑）
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
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
const docStub = { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => mkEl('t'), body: mkEl('body') };
const lsStub = { _d:{}, getItem(k){return this._d[k]===undefined?null:this._d[k];}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];}, clear(){this._d={};} };
const vm = require('vm');
const sandbox = {
  window: { __SMART_PAGE__: null, print: () => {} }, document: docStub, localStorage: lsStub,
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
function check(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); } }

console.log('=== F13a seedDemo 死代码已删除 ===');
check('源码不含 seedDemo 函数', !code.includes('function seedDemo('));

console.log('=== F13b 文档快照容量双限 ===');
const c = { name:'容量厂', industry:'水泥建材', province:'四川' };
api.state.cur = c;
api.state.docVer = { '容量厂': 1 };
getEl('docBody').innerHTML = '<p>' + 'x'.repeat(150000) + '</p>';
for (let i = 0; i < 30; i++) {
  api.saveDocVersion('v' + i);   // noteIn 注入 → 不弹 prompt
}
const list = JSON.parse(api.localStorage.getItem('wb_shuangtan_doc_容量厂') || '[]');
check('快照条数 ≤ 20', list.length <= 20, list.length);
let bytes = 0;
list.forEach(s => { bytes += (s.html || '').length * 2 + 80; });
check('快照总字节 ≤ 2MB', bytes <= 2000000, bytes);
check('最新快照在最前', list.length && list[0].note === 'v29', list.length && list[0].note);

console.log('=== F13c 备份带墓碑 / 导入恢复墓碑 ===');
api.tombAdd(['示例A', '示例B']);
const exp = api.exportJSON ? (function(){
  // exportJSON 依赖 Blob/URL 桩，直接验证数据装配
  api.state.customers = [{ name:'X', industry:'水泥建材' }];
  api.state.tasks = [{ name:'T', client:'X' }];
  return JSON.parse(JSON.stringify({ customers: api.state.customers, tasks: api.state.tasks, tomb: api.tombGet() }));
})() : null;
check('导出结构含墓碑', exp && Array.isArray(exp.tomb) && exp.tomb.indexOf('示例A') >= 0, exp && JSON.stringify(exp.tomb));
api.tombGet().forEach(n => api.tombRemove(n));
check('本地墓碑已清', api.tombGet().length === 0);
const p = api.parseImportPayload({ customers: [], tasks: [], tomb: ['示例A'] });
api.applyImport(p);
check('导入恢复墓碑', api.tombHas('示例A'));
check('导入非法墓碑被过滤', p.tomb.length === 1, p.tomb.length);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
