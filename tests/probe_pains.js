// 探针：痛点多选交互（修复2）—— on态不丢 / 计数按钮不崩 / 无逐项刷屏
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

const store = {};
function mkCL() {
  const s = {};
  return { add(c){s[c]=1;}, remove(c){delete s[c];}, toggle(c){s[c]?delete s[c]:s[c]=1;}, contains(c){return !!s[c];} };
}
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false,
    className: '', checked: false, children: [], style: {}, _listeners: {},
    classList: mkCL(),
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    hasAttribute(k) { return this[k] !== undefined; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) {
      this.children.push(c);
      if (c && c.id) store[c.id] = c;   // 模拟真实 DOM：按 id 可检索
      return c;
    },
    removeChild(c) { return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    reset() { this.value = ''; },
    scrollTop: 0, scrollHeight: 0,
    closest() { return null; },
    focus() {}, click() {}
  };
}
const getEl = (id) => { if (!store[id]) store[id] = mkEl(id); return store[id]; };
// 与真实 DOM 一致：btnPainOk 未创建时返回 null（页面逻辑依赖 null 判存在）
const getElementById = (id) => (id === 'btnPainOk' && !store[id]) ? null : getEl(id);
const stepsEl = getEl('steps');
for (let i = 0; i < 7; i++) stepsEl.children.push(mkEl('step-' + i));

// askBox：带真实 chip 集与 chip-row 容器
const PAINS = ['合规履约压力','出口CBAM门槛','能耗成本上升','数据台账缺失','融资与ESG评级','碳资产变现','客户供应链要求'];
function fakeChip(v) {
  const c = mkEl('chip-' + v);
  c.textContent = v;
  c.setAttribute('data-v', v);
  c.closest = function(){ return this; };
  return c;
}
let painChips = [];
const chipRow = mkEl('chip-row');
chipRow.parentNode = {
  appendChild(c) { if (c && c.id) store[c.id] = c; return c; }
};
const askBox = getEl('askBox');
askBox.querySelectorAll = (sel) => (sel === '.chip' ? painChips : []);
askBox.querySelector = (sel) => (sel === '.chip-row' ? chipRow : null);

const docStub = {
  getElementById,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (ev, fn) => { (docStub._l = docStub._l || {})[ev] = fn; },
  createElement: () => mkEl('tmp-' + Math.random().toString(36).slice(2)),
  body: mkEl('body')
};
const lsStub = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; }
};
const vm = require('vm');
const sandbox = {
  window: { __SMART_PAGE__: null, print: () => {} },
  document: docStub,
  localStorage: lsStub,
  confirm: () => false,
  prompt: () => '',
  console, setTimeout, clearTimeout,
  Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  navigator: { userAgent: 'node' },
  Date, Math, JSON, RegExp, Error, String, Number, Object, Array, Promise, isNaN, parseInt, parseFloat
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'page.js' });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function clickChip(v) {
  const c = painChips.find(x => x.getAttribute('data-v') === v);
  sandbox.onChipClick({ target: c });
}

console.log('=== 修复2 探针：痛点多选交互 ===');

// 进入痛点题（第6问 index=5）
sandbox.chat = { log: [], ans: {}, step: 5 };
painChips = PAINS.map(fakeChip);
delete store.btnPainOk;
const logBefore = () => sandbox.chat.log.length;

// 1. 多选不丢视觉选中态（旧 bug：顶部统一清 on）
clickChip(PAINS[0]);
check('点第1项 → _painSel 记录', (sandbox.chat.ans._painSel || []).join() === PAINS[0], sandbox.chat.ans._painSel);
check('点第1项 → chip 获得 on 态', painChips[0].classList.contains('on'));
clickChip(PAINS[1]);
check('点第2项 → 第1项 on 态仍在（旧 bug 回归）', painChips[0].classList.contains('on'), 'on=' + painChips[0].classList.contains('on'));
check('点第2项 → 第2项 on 态', painChips[1].classList.contains('on'));
check('点第2项 → _painSel 两项', sandbox.chat.ans._painSel.length === 2, sandbox.chat.ans._painSel);

// 2. 计数按钮：第二次点击不再抛错（旧 bug：ok undefined TypeError）
let threw = null;
try { clickChip(PAINS[2]); } catch (e) { threw = e; }
check('第3次点击不抛 TypeError（旧 ok bug 回归）', threw === null, threw && threw.message);
check('按钮计数更新为3', store.btnPainOk && store.btnPainOk.textContent === '确认所选(3)', store.btnPainOk && store.btnPainOk.textContent);
check('三个 chip 均为 on 态', painChips[0].classList.contains('on') && painChips[1].classList.contains('on') && painChips[2].classList.contains('on'));

// 3. 上限：第4项被拒绝且不误标 on
try { clickChip(PAINS[3]); } catch (e) { threw = e; }
check('第4项被拒（仍3项）', sandbox.chat.ans._painSel.length === 3, sandbox.chat.ans._painSel);
check('第4项 chip 无 on 态（旧 bug：被拒却高亮）', !painChips[3].classList.contains('on'));
check('前3项 on 态不受影响', painChips[0].classList.contains('on') && painChips[1].classList.contains('on') && painChips[2].classList.contains('on'));

// 4. 取消选择
clickChip(PAINS[1]);
check('取消第2项 → _painSel 剩2', sandbox.chat.ans._painSel.length === 2, sandbox.chat.ans._painSel);
check('取消后第2项 on 态移除', !painChips[1].classList.contains('on'));
check('取消后第1项 on 态保留', painChips[0].classList.contains('on'));
check('按钮计数更新为2', store.btnPainOk.textContent === '确认所选(2)', store.btnPainOk.textContent);

// 5. 聊天记录降噪：过程点击不刷屏，只在确认时汇总
const logAfterToggles = logBefore();
check('逐项点击不产生聊天记录（旧 bug：每点一行）', logAfterToggles === 0, JSON.stringify(sandbox.chat.log));
const stepBeforeConfirm = sandbox.chat.step;
store.btnPainOk._listeners.click[0]();
check('确认后进入下一题', sandbox.chat.step === stepBeforeConfirm + 1, sandbox.chat.step);
check('确认后 pains 落库', Array.isArray(sandbox.chat.ans.pains) && sandbox.chat.ans.pains.length === 2, sandbox.chat.ans.pains);
check('聊天记录仅1行确认汇总', logBefore() === 1 && sandbox.chat.log[0].t.indexOf('已选痛点') === 0, JSON.stringify(sandbox.chat.log));

// 6. 重渲染恢复：_painSel 保留时 renderAsk 恢复 on 态与按钮
sandbox.chat = { log: [], ans: { _painSel: [PAINS[0], PAINS[4]] }, step: 5 };
delete store.btnPainOk;
askBox.innerHTML = '';
painChips = PAINS.map(fakeChip);
sandbox.renderAsk();
check('renderAsk 恢复已选 chip 的 on 态', painChips[0].classList.contains('on') && painChips[4].classList.contains('on'),
  'p0=' + painChips[0].classList.contains('on') + ' p4=' + painChips[4].classList.contains('on'));
check('renderAsk 重建确认按钮且计数正确', store.btnPainOk && store.btnPainOk.textContent === '确认所选(2)', store.btnPainOk && store.btnPainOk.textContent);

// 7. 单选题不受影响：scale chip 点击仍直接推进
sandbox.chat = { log: [], ans: {}, step: 3 };
const sc = fakeChip('大型企业');
sandbox.onChipClick({ target: sc });
check('单选题（规模）点击即推进', sandbox.chat.step === 4 && sandbox.chat.ans.scale === '大型企业', JSON.stringify({step: sandbox.chat.step, scale: sandbox.chat.ans.scale}));

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
