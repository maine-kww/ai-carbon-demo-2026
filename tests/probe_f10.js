// 探针：F10 快速↔完整诊断衔接（核心答案不丢、续接不重开）
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

console.log('=== F10 核心 7 问完成后切完整诊断 ===');
api.chat = { log:[], ans:{ name:'衔接厂', industry:'水泥建材', province:'四川', scale:'大型企业',
  forceCompliance:true, hasData:true, pains:['合规履约压力'], chain:'', budget:'80-200万' }, step:7 };
api.chat2 = api.newChat2 ? api.newChat2() : api.chat2;
api.chat2.mode = 'quick'; api.chat2.curQ = null; api.chat2.qIndex = 0;
api.setMode('full');
check('切完整模式成功', api.chat2.mode === 'full', api.chat2.mode);
check('完整问从 Q8 起续接（不重开 7 问）', !!api.chat2.curQ, JSON.stringify(api.chat2.curQ && api.chat2.curQ.id));
check('核心答案完整保留', api.chat.ans.industry === '水泥建材' && api.chat.ans.pains.length === 1 && api.chat.step === 7,
  JSON.stringify(api.chat.ans));
const curQid = api.chat2.curQ.id;
api.nextQuestion();
check('答完一题继续推进且答案仍在', !!api.chat2.curQ && api.chat.ans.industry === '水泥建材' && api.chat.step === 7,
  JSON.stringify(api.chat2.curQ && api.chat2.curQ.id));
// 切回快速：curQ 清空、核心答案仍在
api.setMode('quick');
check('切回快速不丢核心答案', api.chat.ans.industry === '水泥建材' && api.chat.step === 7);
check('快速模式结束完整采集队列', api.chat2.curQ === null || api.chat2.curQ === undefined, JSON.stringify(api.chat2.curQ));
// 完整答完某题后保存进客户档案
api.state.cur = { name:'衔接厂', industry:'水泥建材', province:'四川', scale:'大型企业', stage:'数据阶段',
  pains:['合规履约压力'], products:[], budget:'80-200万', chain:'', em:{},
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
api.setMode('full');
const q2 = api.chat2.curQ;
if (q2 && q2.q && q2.q.key){
  api.setPath(api.state.cur, q2.q.key, '已填测试值');
  api.nextQuestion();
  check('完整问答案写入客户档案', api.state.cur[q2.q.key] === '已填测试值' || (api.state.cur.em && api.state.cur.em[q2.q.key] === '已填测试值'),
    JSON.stringify(api.state.cur[q2.q.key]));
}

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
