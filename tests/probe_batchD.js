// 探针：批次D 文档保护（重建确认+自动快照）与数据变更过期提示
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
    addEventListener(ev, fn){ (this._l = this._l || {})[ev] = (this._l[ev] || []).concat(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll(sel){ return sel === 'h2' ? [] : []; },
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
  confirm: () => false, prompt: () => '测试备注', console, setTimeout, clearTimeout,
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

const c = { name:'文档D厂', industry:'水泥建材', province:'四川', scale:'大型企业', stage:'合规阶段',
  pains:['合规履约压力'], products:['碳盘查核算'], budget:'80-200万', chain:'EHS→总经理',
  em:{ scope1:[], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'x', changeLog:'' };

console.log('=== D1 生成/重建保护人工编辑 ===');
api.state.cur = c;
api.state.docHtml = {}; api.state.docEdited = {}; api.state.docVer = {}; api.state.docStale = {}; api.state.docLoadedFor = null;
let confirmCalls = 0, confirmResult = true;
api.confirm = function(){ confirmCalls++; return confirmResult; };
api.genDoc();
check('首次生成不弹确认', confirmCalls === 0 && (api.state.docVer[c.name] || 0) === 1, 'calls=' + confirmCalls + ' v=' + api.state.docVer[c.name]);
check('生成写入 docBody', getEl('docBody').innerHTML.length > 2000, getEl('docBody').innerHTML.length);

// 人工编辑后拒绝重建 → 内容保留
api.state.docEdited[c.name] = true;
const beforeHtml = getEl('docBody').innerHTML;
const beforeV = api.state.docVer[c.name];
confirmResult = false;
api.genDoc();
check('拒绝重建时弹出确认', confirmCalls === 1, confirmCalls);
check('拒绝重建 → 文档未被覆盖', getEl('docBody').innerHTML === beforeHtml && api.state.docVer[c.name] === beforeV);

// 人工编辑后同意重建 → 自动快照 + 覆盖 + 标记清除
confirmResult = true;
const editedHtml = beforeHtml + '<p>人工追加内容</p>';
getEl('docBody').innerHTML = editedHtml;
api.state.docHtml[c.name] = editedHtml;
api.genDoc();
check('同意重建时自动保存快照', (function(){
  const list = JSON.parse(api.localStorage.getItem('wb_shuangtan_doc_' + c.name) || '[]');
  return list.length >= 1 && list.some(s => s.note === '重建前自动快照' && String(s.html).indexOf('人工追加内容') >= 0);
})(), api.localStorage.getItem('wb_shuangtan_doc_' + c.name));
check('重建后人工编辑标记清除', api.state.docEdited[c.name] === false);
check('重建后版本号递增', api.state.docVer[c.name] === beforeV + 1, api.state.docVer[c.name]);
check('重建内容为新生成（无人工残留）', getEl('docBody').innerHTML.indexOf('人工追加内容') < 0);

console.log('=== D2 数据变更 → 方案书过期提示 ===');
check('刚重建后无过期提示', getEl('docFoot').innerHTML.indexOf('过期') < 0, getEl('docFoot').innerHTML.slice(0, 80));
api.saveCustomer(c);
check('客户数据变更 → 过期提示出现', getEl('docFoot').innerHTML.indexOf('过期') >= 0, getEl('docFoot').innerHTML.slice(0, 120));
api.state.docStale[c.name] = false;
api.localSaveTask({ name:'新任务', client:c.name, stage:'现状调研', dept:'EHS环保部', prio:'P1', stat:'未开始', due:'2026-10-20', invest:0, cut:0, deliver:'x', remark:'' });
check('任务变更 → 过期提示出现', getEl('docFoot').innerHTML.indexOf('过期') >= 0, getEl('docFoot').innerHTML.slice(0, 120));
api.genDoc();
check('重建后过期提示清除', getEl('docFoot').innerHTML.indexOf('过期') < 0, getEl('docFoot').innerHTML.slice(0, 80));

console.log('=== D2b 人工编辑自动暂存打标 ===');
api.bindDocAutosave();
const boxL = getEl('docBody');
if (boxL._l && boxL._l.input && boxL._l.input.length){
  boxL._l.input[0]();   // 触发 debounce
  setTimeout(function(){
    check('自动暂存后 docEdited=true', api.state.docEdited[c.name] === true, api.state.docEdited[c.name]);
    console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
    process.exit(fail ? 1 : 0);
  }, 700);
} else {
  check('docBody 已挂 input 自动暂存', false, 'no listener');
  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
}
