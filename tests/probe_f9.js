// 探针：F9 联动事件接线
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

console.log('=== F9 事件触发点接线 ===');
['stageChanged','acceptanceChanged','taskChanged','gapChanged'].forEach(function(n){
  check('源码含 fire(\'' + n + '\') 触发点', code.indexOf("fire('" + n + "')") >= 0);
  check('EVENTS.' + n + ' 有真实副作用(markDocStale)', String(api.EVENTS[n]).indexOf('markDocStale') >= 0);
});
check('LINKAGE_MAP 承诺文案与实现一致（不静默覆盖）', html.indexOf('不静默清空') >= 0 && html.indexOf('确认后才覆盖') >= 0);

console.log('=== F9 事件副作用实际生效 ===');
const c = { name:'联动厂', industry:'水泥建材', province:'四川', stage:'合规阶段',
  pains:[], products:[], budget:'', chain:'', em:{ scope1:[], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
api.state.cur = c;
api.state.docHtml = { '联动厂': '<p>方案书</p>' };
api.state.docStale = {};
api.fire('taskChanged');
check('fire(taskChanged) → 方案书过期标记', api.state.docStale['联动厂'] === true, JSON.stringify(api.state.docStale));
api.state.docStale = {};
api.fire('acceptanceChanged');
check('fire(acceptanceChanged) → 过期标记', api.state.docStale['联动厂'] === true);
api.state.docStale = {};
api.fire('stageChanged');
check('fire(stageChanged) → 过期标记', api.state.docStale['联动厂'] === true);
api.state.docStale = {};
api.fire('gapChanged');
check('fire(gapChanged) → 过期标记', api.state.docStale['联动厂'] === true);
check('过期横幅已写入页脚', getEl('docFoot').innerHTML.indexOf('过期') >= 0, getEl('docFoot').innerHTML.slice(0, 100));

console.log('=== F9 真实链路：genTasks 触发 taskChanged 不抛错 ===');
api.state.docStale = {};
api.state.tasks = [];
api.genTasks();
check('genTasks 正常生成并触发联动（无异常）', api.state.tasks.length > 0, api.state.tasks.length);
check('genTasks 后方案书过期标记', api.state.docStale['联动厂'] === true);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
