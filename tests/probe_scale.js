// 探针：企业规模按年营收分档（修复1）
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false,
    className: '', checked: false, children: [], style: {}, _listeners: {},
    classList: { _s:{}, add(c){this._s[c]=1;}, remove(c){delete this._s[c];}, toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;}, contains(c){return !!this._s[c];} },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    hasAttribute(k) { return this[k] !== undefined; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
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
const stepsEl = getEl('steps');
for (let i = 0; i < 7; i++) stepsEl.children.push(mkEl('step-' + i));
const docStub = {
  getElementById: getEl,
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
global.Blob = function(){}; global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
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

console.log('=== 修复1 探针：规模按年营收分档 ===');

// 1. 数值解析
check('「12亿」→ 大型企业', sandbox.scaleFromText('12亿') === '大型企业', sandbox.scaleFromText('12亿'));
check('「10亿」→ 中型企业（1-10含10）', sandbox.scaleFromText('10亿') === '中型企业', sandbox.scaleFromText('10亿'));
check('「5.5亿」→ 中型企业', sandbox.scaleFromText('5.5亿') === '中型企业', sandbox.scaleFromText('5.5亿'));
check('「0.8亿」→ 小微企业', sandbox.scaleFromText('0.8亿') === '小微企业', sandbox.scaleFromText('0.8亿'));
check('「1亿以下」→ 小微企业', sandbox.scaleFromText('1亿以下') === '小微企业', sandbox.scaleFromText('1亿以下'));
check('「1-10亿」→ 中型企业', sandbox.scaleFromText('1-10亿') === '中型企业', sandbox.scaleFromText('1-10亿'));
check('「10亿以上」→ 大型企业', sandbox.scaleFromText('10亿以上') === '大型企业', sandbox.scaleFromText('10亿以上'));
check('「15亿以上」→ 大型企业', sandbox.scaleFromText('15亿以上') === '大型企业', sandbox.scaleFromText('15亿以上'));

// 2. 关键词兜底（保留原能力）
check('「大企业」→ 大型企业', sandbox.scaleFromText('大企业') === '大型企业', sandbox.scaleFromText('大企业'));
check('「小微企业」→ 小微企业', sandbox.scaleFromText('小微企业') === '小微企业', sandbox.scaleFromText('小微企业'));
check('「中型」→ 中型企业', sandbox.scaleFromText('中型') === '中型企业', sandbox.scaleFromText('中型'));
check('无规模信息 → null（不误判）', sandbox.scaleFromText('员工500人') === null, sandbox.scaleFromText('员工500人'));

// 3. chip 文案与取值
const scaleChips = sandbox.chipHtml('SCALE');
check('SCALE chips 含 10亿以上 阈值', scaleChips.indexOf('10亿以上') >= 0, scaleChips);
check('SCALE chips 含 1-10亿 阈值', scaleChips.indexOf('1-10亿') >= 0, scaleChips);
check('SCALE chips 含 1亿以下 阈值', scaleChips.indexOf('1亿以下') >= 0, scaleChips);
check('data-v 保持规范值（大型企业）', scaleChips.indexOf('data-v="大型企业"') >= 0, scaleChips);
check('data-v 保持规范值（中型企业）', scaleChips.indexOf('data-v="中型企业"') >= 0, scaleChips);
check('data-v 保持规范值（小微企业）', scaleChips.indexOf('data-v="小微企业"') >= 0, scaleChips);

// 4. 展示标签
check('scaleBandLabel 大型含阈值', sandbox.scaleBandLabel('大型企业').indexOf('10亿以上') >= 0, sandbox.scaleBandLabel('大型企业'));
check('scaleBandLabel 中型含阈值', sandbox.scaleBandLabel('中型企业').indexOf('1-10亿') >= 0, sandbox.scaleBandLabel('中型企业'));
check('scaleBandLabel 小微含阈值', sandbox.scaleBandLabel('小微企业').indexOf('1亿以下') >= 0, sandbox.scaleBandLabel('小微企业'));
check('scaleBandLabel 未知值透传', sandbox.scaleBandLabel('规上') === '规上', sandbox.scaleBandLabel('规上'));

// 5. 题目提示带分档说明
const q4 = sandbox.QUESTIONS.find(q => q.k === 'scale');
check('QUESTIONS Q4 tip 含分档标准', q4 && q4.tip.indexOf('1亿以下') >= 0 && q4.tip.indexOf('10亿以上') >= 0, q4 && q4.tip);
const q4c = sandbox.QUESTIONS_CORE.find(q => q.k === 'scale');
check('QUESTIONS_CORE Q4 tip 含分档标准', q4c && q4c.tip.indexOf('1亿以下') >= 0, q4c && q4c.tip);
check('题序未变（scale 仍是第4问）', sandbox.QUESTIONS_CORE.map(q => q.k).join(',') === 'name,industry,province,scale,force,pains,chain');

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
