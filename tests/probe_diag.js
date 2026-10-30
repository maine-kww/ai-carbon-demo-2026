// 探针：诊断结论价值修复（修复3）—— Q5 多选解锁评分 / 结构化结论 / 降噪
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
    appendChild(c) { this.children.push(c); if (c && c.id) store[c.id] = c; return c; },
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
// 多选确认按钮未创建时返回 null（与真实 DOM 一致）
const getElementById = (id) => ((id === 'btnPainOk' || id === 'btnForceOk') && !store[id]) ? null : getEl(id);
const stepsEl = getEl('steps');
for (let i = 0; i < 7; i++) stepsEl.children.push(mkEl('step-' + i));

function fakeChip(attr, v) {
  const c = mkEl('chip-' + v);
  c.textContent = v;
  c.setAttribute(attr, v);
  c.closest = function(){ return this; };
  return c;
}
let curChips = [];
const chipRow = mkEl('chip-row');
chipRow.parentNode = { appendChild(c) { if (c && c.id) store[c.id] = c; return c; } };
const askBox = getEl('askBox');
askBox.querySelectorAll = (sel) => (sel === '.chip' ? curChips : []);
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
function clickMv(v) {
  const c = curChips.find(x => x.getAttribute('data-mv') === v);
  sandbox.onChipClick({ target: c });
}

console.log('=== 修复3 探针A：judgeStageDetail 评分 ===');
check('空答案 → 合规 0分', (() => { const d = sandbox.judgeStageDetail({}); return d.stage === '合规阶段' && d.score === 0; })());
check('仅 forceCompliance → 1分 合规', (() => { const d = sandbox.judgeStageDetail({forceCompliance:true}); return d.stage === '合规阶段' && d.score === 1; })());
check('hasData → 2分 数据阶段', (() => { const d = sandbox.judgeStageDetail({hasData:true}); return d.stage === '数据阶段' && d.score === 2; })());
check('hasData+hasTarget → 4分 战略阶段', (() => { const d = sandbox.judgeStageDetail({hasData:true,hasTarget:true}); return d.stage === '战略阶段' && d.score === 4; })());
check('四要素全 → 8分 价值阶段', (() => { const d = sandbox.judgeStageDetail({forceCompliance:true,hasData:true,hasTarget:true,wantsValue:true}); return d.stage === '价值阶段' && d.score === 8; })());
check('评分依据逐项列出', sandbox.judgeStageDetail({hasData:true,wantsValue:true}).reasons.length === 2,
  JSON.stringify(sandbox.judgeStageDetail({hasData:true,wantsValue:true}).reasons));
check('judgeStage 兼容签名不变', sandbox.judgeStage({hasData:true}) === '数据阶段' && sandbox.judgeStage({}) === '合规阶段');

console.log('=== 修复3 探针B：Q5 成熟度多选（旧 bug：单击即跳题→评分锁死≤3）===');
sandbox.chat = { log: [], ans: {}, step: 4 };
delete store.btnForceOk;
const forceDef = sandbox.QUESTIONS[4].chips;
curChips = forceDef.map(p => fakeChip('data-mv', p[0]));
sandbox.renderAsk();   // 正常入口：chips 已由 renderAsk 逻辑无关，直接构造即可

clickMv('hasData');
check('点第1项不跳题（旧 bug：answer 即 step++）', sandbox.chat.step === 4, sandbox.chat.step);
check('_forceSel 记录第1项', (sandbox.chat.ans._forceSel || []).join() === 'hasData', sandbox.chat.ans._forceSel);
check('第1项 chip 高亮', curChips.find(c => c.getAttribute('data-mv') === 'hasData').classList.contains('on'));
clickMv('wantsValue');
check('点第2项仍不跳题', sandbox.chat.step === 4, sandbox.chat.step);
check('_forceSel 两项', sandbox.chat.ans._forceSel.length === 2, sandbox.chat.ans._forceSel);
check('确认按钮计数2', store.btnForceOk && store.btnForceOk.textContent === '确认所选(2)', store.btnForceOk && store.btnForceOk.textContent);

// 「以上都没有」互斥
clickMv('none');
check('none 互斥：只剩 none', sandbox.chat.ans._forceSel.join() === 'none', sandbox.chat.ans._forceSel);
check('none chip 高亮', curChips.find(c => c.getAttribute('data-mv') === 'none').classList.contains('on'));
check('此前选中项高亮被清除', !curChips.find(c => c.getAttribute('data-mv') === 'hasData').classList.contains('on'));
clickMv('hasData');
check('再选有效项排除 none', sandbox.chat.ans._forceSel.join() === 'hasData', sandbox.chat.ans._forceSel);
check('none chip 高亮移除', !curChips.find(c => c.getAttribute('data-mv') === 'none').classList.contains('on'));

clickMv('wantsValue');
check('凑齐两项后仍未跳题', sandbox.chat.step === 4);
const logBefore = sandbox.chat.log.length;
check('逐项点击不产生聊天记录（降噪）', logBefore === 0, JSON.stringify(sandbox.chat.log));
store.btnForceOk._listeners.click[0]();
check('确认后进入下一题', sandbox.chat.step === 5, sandbox.chat.step);
check('确认后四标志写入', sandbox.chat.ans.hasData === true && sandbox.chat.ans.wantsValue === true &&
  sandbox.chat.ans.forceCompliance === false && sandbox.chat.ans.hasTarget === false,
  JSON.stringify({fc: sandbox.chat.ans.forceCompliance, hd: sandbox.chat.ans.hasData, ht: sandbox.chat.ans.hasTarget, wv: sandbox.chat.ans.wantsValue}));
check('聊天记录仅1行确认汇总且含标签', sandbox.chat.log.length === 1 && sandbox.chat.log[0].t.indexOf('已选成熟度项') === 0,
  JSON.stringify(sandbox.chat.log));
check('无「已记录。」噪音', sandbox.chat.log.every(m => m.t !== '已记录。'));
check('该组合评分应为5分/价值阶段（旧逻辑最高3分）', (() => { const d = sandbox.judgeStageDetail(sandbox.chat.ans); return d.score === 5 && d.stage === '价值阶段'; })(),
  JSON.stringify(sandbox.judgeStageDetail(sandbox.chat.ans)));

// 重复作答清残留
sandbox.chat.log = [];
sandbox.chat.ans = { forceCompliance: true, hasData: true, hasTarget: true, wantsValue: true, _forceSel: ['none'] };
sandbox.chat.step = 4;
curChips = forceDef.map(p => fakeChip('data-mv', p[0]));
delete store.btnForceOk;
clickMv('none');
store.btnForceOk._listeners.click[0]();
check('选「以上都没有」后四标志全清', !sandbox.chat.ans.forceCompliance && !sandbox.chat.ans.hasData &&
  !sandbox.chat.ans.hasTarget && !sandbox.chat.ans.wantsValue,
  JSON.stringify({fc: sandbox.chat.ans.forceCompliance, hd: sandbox.chat.ans.hasData}));
check('none 路径聊天记录1行', sandbox.chat.log.length === 1 && sandbox.chat.log[0].t === '以上都没有', JSON.stringify(sandbox.chat.log));

console.log('=== 修复3 探针C：结构化诊断结论 ===');
sandbox.chat = {
  log: [],
  ans: {
    name: '验证企业', industry: '水泥建材', province: '四川', scale: '大型企业',
    forceCompliance: true, hasData: true, hasTarget: true, wantsValue: true,
    pains: ['出口CBAM门槛', '能耗成本上升'], budget: '80-200万', chain: 'EHS总监→总经理'
  },
  step: 7
};
sandbox.finishDiagnosis();
const lastBot = sandbox.chat.log.filter(m => m.r === 'bot').pop();
check('结论含【诊断结论】标题', lastBot.t.indexOf('【诊断结论】') >= 0);
check('结论含评分与满分', /评分 8\/8/.test(lastBot.t), lastBot.t.slice(0, 80));
check('结论含逐项评分依据', lastBot.t.indexOf('评分依据') >= 0 && lastBot.t.indexOf('+3') >= 0);
check('结论含企业画像（含规模分档）', lastBot.t.indexOf('企业画像') >= 0 && lastBot.t.indexOf('10亿以上') >= 0, lastBot.t.slice(0, 200));
check('结论含痛点→动作映射（CBAM动作）', lastBot.t.indexOf('ISO 14067') >= 0);
check('结论含痛点→动作映射（能耗动作）', lastBot.t.indexOf('节能量诊断') >= 0);
check('结论含推荐产品线', lastBot.t.indexOf('推荐产品线') >= 0);
check('结论含下一步行动', lastBot.t.indexOf('下一步') >= 0 && lastBot.t.indexOf('生成五阶段任务') >= 0);
check('无缺口时不出现补录行', lastBot.t.indexOf('补录') < 0);
check('客户档案 conclusion 含评分依据', sandbox.state.cur && sandbox.state.cur.conclusion.indexOf('评分8/8') >= 0,
  sandbox.state.cur && sandbox.state.cur.conclusion);
check('客户档案 stage=价值阶段', sandbox.state.cur.stage === '价值阶段', sandbox.state.cur.stage);

// 缺口提示：预算待评估 + 无痛点
sandbox.chat = {
  log: [],
  ans: { name: '缺口中', industry: '钢铁', province: '江苏', scale: null, pains: [], budget: '待评估', chain: '' },
  step: 7
};
sandbox.finishDiagnosis();
const lastBot2 = sandbox.chat.log.filter(m => m.r === 'bot').pop();
check('缺痛点时提示重新诊断', lastBot2.t.indexOf('未选择痛点') >= 0);
check('缺口清单列出规模/预算/决策链', lastBot2.t.indexOf('补录') >= 0 &&
  lastBot2.t.indexOf('企业规模') >= 0 && lastBot2.t.indexOf('预算区间') >= 0 && lastBot2.t.indexOf('决策链') >= 0,
  lastBot2.t.slice(-200));
check('无评分命中时注明按合规起步', lastBot2.t.indexOf('四要素均未命中') >= 0);

console.log('=== 修复3 探针D：第7问预算档写入 budget（旧 bug：写进 chain）===');
sandbox.chat = { log: [], ans: { name: '预算厂', industry: '水泥建材', province: '四川', scale: '大型企业',
  forceCompliance: true, pains: ['合规履约压力'], chain: '' }, step: 6 };
const budgetDef = sandbox.QUESTIONS[6].chips;
check('第7问 chips=BUDGET', budgetDef === 'BUDGET', budgetDef);
curChips = ['30万以下','30-80万','80-200万','200万以上','待评估'].map(v => fakeChip('data-v', v));
sandbox.onChipClick({ target: curChips.find(c => c.getAttribute('data-v') === '80-200万') });
check('预算档写入 budget', sandbox.chat.ans.budget === '80-200万', sandbox.chat.ans.budget);
check('chain 不被预算污染', !sandbox.chat.ans.chain || sandbox.chat.ans.chain === '', JSON.stringify(sandbox.chat.ans.chain));
check('答完第7问 step=7', sandbox.chat.step === 7, sandbox.chat.step);
sandbox.finishDiagnosis();
const lastBot3 = sandbox.chat.log.filter(m => m.r === 'bot').pop();
check('结论画像含预算 80-200万', lastBot3.t.indexOf('预算 80-200万') >= 0, lastBot3.t.slice(0, 300));
check('补录清单只列决策链、不列预算', lastBot3.t.indexOf('决策链') >= 0 && lastBot3.t.indexOf('预算区间') < 0,
  lastBot3.t.slice(-150));

// 文本输入路径：决策链里带预算
sandbox.chat = { log: [], ans: { name: '文本预算厂', industry: '钢铁', province: '江苏', scale: '中型企业',
  forceCompliance: true, pains: [], budget: null, chain: '' }, step: 6 };
sandbox.chat.step = 6;
getEl('chatText').value = '预算120万，EHS总监→总经理';
sandbox.onSend();
check('文本路径 budget 解析为120万', sandbox.chat.ans.budget === '120万', sandbox.chat.ans.budget);
check('文本路径 chain 完整保留', sandbox.chat.ans.chain.indexOf('EHS总监') >= 0, sandbox.chat.ans.chain);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
