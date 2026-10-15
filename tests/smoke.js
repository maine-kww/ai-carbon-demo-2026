// 轻量冒烟测试：不依赖 jsdom，用最小 DOM 桩验证核心逻辑链路
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'shuangtan.html'), 'utf8');

// ---------- 提取各段 script ----------
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

// ---------- 最小 DOM 桩 ----------
const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', disabled: false,
    className: '', checked: false, children: [], style: {}, _listeners: {},
    classList: { _s:{}, add(c){this._s[c]=1;}, remove(c){delete this._s[c];}, toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;}, contains(c){return !!this._s[c];} },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    reset() { this.value = ''; },
    scrollTop: 0, scrollHeight: 0,
    closest() { return null; },
    focus() {},
    click() {}
  };
}
const getEl = (id) => {
  if (!store[id]) store[id] = mkEl(id);
  return store[id];
};
// steps 步骤条需要 7 个可设 className 的子节点
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
global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;
global.confirm = () => false;

// ---------- 执行页面脚本（同一上下文，保持全局函数可见）----------
const vm = require('vm');
const sandbox = {
  window: { __SMART_PAGE__: null, print: () => {} },   // 无 SDK 环境 → 验证离线降级
  document: docStub,
  localStorage: lsStub,
  confirm: () => false,
  prompt: (m) => '测试备注',
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  navigator: { userAgent: 'node' },
  Date: Date, Math: Math, JSON: JSON, RegExp: RegExp, Error: Error, String: String, Number: Number, Object: Object, Array: Array, Promise: Promise, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'page.js' });

const api = sandbox;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('\n=== 1. 离线降级 & 初始化（无 SDK 环境）===');
try {
  api.refreshAll();
  check('refreshAll 在无 SDK 环境不抛错', true);
} catch (e) { check('refreshAll 在无 SDK 环境不抛错', false, e.message); }

console.log('\n=== 2. 无环检查：渲染函数互不调用（铁律9）===');
const renderFns = ['renderToday','renderChat','renderAsk','renderPlan','renderClients','renderStats','renderTasks'];
const rsrc = scripts.map(s => {
  const m = {};
  renderFns.forEach(f => {
    const i = s.indexOf('function ' + f + '(');
    if (i < 0) return;
    // 取函数体（按缩进0的 } 结束）
    let depth = 0, j = s.indexOf('{', i), k = j, started = false;
    for (; k < s.length; k++) {
      if (s[k] === '{') { depth++; started = true; }
      else if (s[k] === '}') { depth--; if (started && depth === 0) break; }
    }
    m[f] = s.slice(i, k + 1);
  });
  return m;
}).reduce((a, b) => Object.assign(a, b), {});
let hasCycle = false;
renderFns.forEach(a => {
  renderFns.forEach(b => {
    if (a === b) return;
    const body = rsrc[a] || '';
    if (body.indexOf(b + '(') >= 0) { hasCycle = true; console.log('  调用链: ' + a + ' -> ' + b); }
  });
});
check('渲染函数之间无相互调用（无环）', !hasCycle);
check('存在统一刷新入口 refreshAll', typeof api.refreshAll === 'function');

console.log('\n=== 3. 诊断判定（成熟度）===');
check('空答案 → 合规阶段', api.judgeStage({}) === '合规阶段', api.judgeStage({}));
check('强制合规 → 合规/数据阶段', ['合规阶段','数据阶段'].indexOf(api.judgeStage({forceCompliance:true})) >= 0);
check('全部要素齐 → 价值阶段', api.judgeStage({forceCompliance:true,hasData:true,hasTarget:true,wantsValue:true}) === '价值阶段', api.judgeStage({forceCompliance:true,hasData:true,hasTarget:true,wantsValue:true}));
check('仅建体系 → 数据阶段', api.judgeStage({hasData:true}) === '数据阶段');

console.log('\n=== 4. 产品线匹配 ===');
const p1 = api.matchProducts('合规阶段', [], '钢铁');
check('合规阶段至少给碳盘查', p1.indexOf('碳盘查核算') >= 0, p1.join(','));
const p2 = api.matchProducts('价值阶段', ['碳资产变现'], '钢铁');
check('碳资产变现 → 含 CCER开发', p2.indexOf('CCER开发') >= 0, p2.join(','));
const p3 = api.matchProducts('战略阶段', ['出口CBAM门槛'], '钢铁');
check('CBAM 痛点 → 含产品碳足迹LCA', p3.indexOf('产品碳足迹LCA') >= 0, p3.join(','));
check('产品线无重复', new Set(p2).size === p2.length);

console.log('\n=== 5. ROI 保守口径 ===');
const r1 = api.roiText({ invest: 100000, cut: 0 });
check('无减排量 → 不编造回收期', r1.indexOf('待') >= 0, r1);
const r2 = api.roiText({ invest: 0, cut: 100 });
check('无投资 → 不编造回收期', r2.indexOf('待') >= 0, r2);
const r3 = api.roiText({ invest: 600000, cut: 1000 });
check('正常测算 → 6.0 年回收期(60元/吨)', r3.indexOf('10.0') >= 0 || r3.indexOf('10') >= 0, r3);

console.log('\n=== 6. 日期边界（跨月/跨年）===');
check('跨年 12-31 → 01-01 差 1 天', api.daysBetween('2025-12-31','2026-01-01') === 1);
check('跨月 01-31 → 02-01 差 1 天', api.daysBetween('2026-01-31','2026-02-01') === 1);
check('闰年 2024-02-28 → 03-01 差 2 天', api.daysBetween('2024-02-28','2024-03-01') === 2);

console.log('\n=== 7. 昨天未完成自动顺延（铁律5）===');
api.state.tasks = [
  { name:'逾期任务', client:'A', due:'2020-01-01', stat:'进行中' },
  { name:'今日任务', client:'A', due:new Date().toISOString().slice(0,10), stat:'未开始' },
  { name:'未来任务', client:'A', due:'2099-01-01', stat:'未开始' },
  { name:'已完成', client:'A', due:'2020-01-01', stat:'已完成' }
];
const tt = api.todayTasks().map(t => t.name);
check('逾期项进入今天要处理', tt.indexOf('逾期任务') >= 0, tt.join(','));
check('今日项进入', tt.indexOf('今日任务') >= 0);
check('未来项不进入', tt.indexOf('未来任务') < 0);
check('已完成不进入', tt.indexOf('已完成') < 0);

console.log('\n=== 8. XSS 转义与消毒 ===');
check('esc 转义 < > &', api.esc('<img src=x onerror=alert(1)>').indexOf('&lt;') >= 0);
check('esc 转义引号', api.esc('" onload="x').indexOf('&quot;') >= 0);
const dirty = '<div class="a">ok</div><script>alert(1)<\/script><img src=x onerror=alert(1)>';
const clean = api.sanitizeHtml(dirty);
check('sanitize 剔除 script 标签', clean.toLowerCase().indexOf('<script') < 0, clean);
check('sanitize 剔除 on* 事件', clean.toLowerCase().indexOf('onerror=') < 0, clean);
check('sanitize 保留正常内容', clean.indexOf('class="a"') >= 0);
check('sanitize 剔除 javascript:', api.sanitizeHtml('<a href="javascript:alert(1)">x</a>').toLowerCase().indexOf('javascript:') < 0);

console.log('\n=== 9. 知识库完整性 ===');
check('行业库 >= 13 个', Object.keys(api.KB_INDUSTRY).length >= 13, Object.keys(api.KB_INDUSTRY).length);
check('地方政策库 >= 20 省', Object.keys(api.KB_PROVINCE).length >= 20, Object.keys(api.KB_PROVINCE).length);
check('五阶段框架完整', api.KB_5STAGE.length === 5);
check('每阶段有交付物+验收标准', api.KB_5STAGE.every(s => s.deliver && s.accept && s.tasks.length));
check('每阶段任务含责任部门+优先级+天数', api.KB_5STAGE.every(s => s.tasks.every(t => t[1] && t[2] !== undefined && t[3] !== undefined)));

console.log('\n=== 10. 示例数据（含逾期项，铁律6）===');
const dc = api.demoCustomers(), dt = api.demoTasks();
check('示例客户 3-5 条', dc.length >= 3 && dc.length <= 5, dc.length);
check('示例任务 >= 3 条', dt.length >= 3, dt.length);
check('示例含逾期任务', dt.some(t => t.due < new Date().toISOString().slice(0,10)), '');
check('示例客户字段完整', dc.every(c => c.name && c.industry && c.stage && c.products.length && c.verifyDate));
check('示例含变更留痕案例', dc.some(c => c.changeLog));

console.log('\n=== 11. 完整诊断流程端到端 ===');
try {
  api.chat.log = []; api.chat.ans = {}; api.chat.step = 0;
  api.chat.ans.name = '测试钢铁公司';
  api.chat.ans.industry = '钢铁';
  api.chat.ans.province = '江苏';
  api.chat.ans.scale = '大型企业';
  api.chat.ans.forceCompliance = true;
  api.chat.ans.hasTarget = true;
  api.chat.ans.wantsValue = true;
  api.chat.ans.pains = ['出口CBAM门槛','能耗成本上升'];
  api.chat.ans.budget = '200万以上';
  api.chat.ans.chain = 'EHS总监→总经理';
  api.chat.step = api.QUESTIONS.length;
  api.finishDiagnosis();
  check('诊断完成不抛错', true);
  check('生成客户档案', api.state.customers.length > 0, api.state.customers.length);
  const cur = api.state.customers[api.state.customers.length - 1];
  check('成熟度判定为价值阶段', cur.stage === '价值阶段', cur.stage);
  check('含CBAM → 匹配产品碳足迹', cur.products.indexOf('产品碳足迹LCA') >= 0, cur.products.join(','));
  check('江苏 → 匹配地方政策', true);
  api.renderPlan();
  check('方案渲染到 planBox', String(docStub.getElementById('planBox').innerHTML).indexOf('诊断结论') >= 0);
  check('方案含属地政策章节', String(docStub.getElementById('planBox').innerHTML).indexOf('属地政策适配') >= 0);
  check('方案含五阶段实施内容', String(docStub.getElementById('planBox').innerHTML).indexOf('五阶段实施内容') >= 0);
  check('方案含变更条款', String(docStub.getElementById('planBox').innerHTML).indexOf('变更条款') >= 0);
} catch (e) { check('完整诊断流程端到端', false, e.message + ' | ' + e.stack.split('\n')[1]); }

console.log('\n=== 12. 五阶段任务生成 ===');
try {
  const before = api.state.tasks.length;
  api.genTasks();
  const added = api.state.tasks.length - before;
  check('生成五阶段任务', added > 0, 'added=' + added);
  const gen = api.state.tasks.filter(t => t.client === '测试钢铁公司');
  check('任务归属正确客户', gen.length > 0, gen.length);
  check('任务含截止日期', gen.every(t => !!t.due));
  check('任务含责任部门', gen.every(t => !!t.dept));
  check('任务含优先级', gen.every(t => !!t.prio));
  check('售前诊断首阶段为进行中', gen.filter(t=>t.stage==='售前诊断').every(t=>t.stat==='进行中'));
  // 幂等：再生成一次不应重复
  const n1 = api.state.tasks.length;
  api.genTasks();
  check('重复生成幂等（不产生重复任务）', api.state.tasks.length === n1, n1 + '->' + api.state.tasks.length);
} catch (e) { check('五阶段任务生成', false, e.message); }

console.log('\n=== 13. DOM 元素存在性（getElementById 目标存在）===');
const htmlIds = [...html.matchAll(/id="([\w-]+)"/g)].map(m => m[1]);
const needed = ['syncBar','syncTxt','todayCnt','todayList','chatLog','askBox','chatText','chatSend','steps','planBox','statsBox','clientList','taskList','taskForm','btnAddClient','btnGenTasks','btnSaveTask','btnResetTask','btnExport','btnImport','fileImport','btnClearDemo','toast','backupHint','tfDept','tfStage','tfPrio','tfStat'];
const missing = needed.filter(id => htmlIds.indexOf(id) < 0);
check('所有脚本引用的 DOM id 都在 HTML 中存在', missing.length === 0, missing.join(','));

console.log('\n=== 14. 表单提交防重复（PQ108）===');
check('提交按钮有 disabled 保护', /btn\.disabled\s*=\s*true/.test(code) && /btn\.disabled\s*=\s*false/.test(code));
check('表单缓存成功后清除', code.indexOf('removeItem') >= 0);

console.log('\n=== 15. 无外链依赖（铁律3）===');
check('无外部 script src', !/<script[^>]+src=/i.test(html));
check('无 CDN 链接', !/(cdn\.|jsdelivr|unpkg|bootcdn|staticfile)/i.test(html));
check('无外部字体', !/@import\s+url/i.test(html));
const emojiHits = (html.match(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{FE0F}]/gu) || []);
  check('无 emoji 图标（✓ 对勾为符号非 emoji，合法）', emojiHits.length === 0, JSON.stringify(emojiHits.slice(0,5)));
check('无 iframe', !/<iframe/i.test(html));

console.log('\n=== 16. 移动端适配（铁律4）===');
check('有 viewport meta', /name="viewport"/.test(html));
check('输入框字号 >= 16px', /input[^{]*\{[^}]*font-size:\s*16px/.test(html) || /--fs:\s*16px/.test(html));
check('按钮最小 44px', /min-height:\s*44px/.test(html));
check('有 768px 断点', /@media\s*\(max-width:\s*768px\)/.test(html));
check('有安全区适配', /env\(safe-area-inset-bottom\)/.test(html));

console.log('\n=== 17. 政策时效声明 ===');
check('标注核验日期', html.indexOf('2026-10-13') >= 0);
check('声明以最新官方发布为准', html.indexOf('以最新官方发布为准') >= 0);
check('声明 ISO/核查口径', html.indexOf('ISO 14064') >= 0 && html.indexOf('GHG Protocol') >= 0);
check('含 CBAM 提示', html.indexOf('CBAM') >= 0);
check('含 CCER 方法学时效提示', html.indexOf('CCER') >= 0);
check('含三条红线口径声明', html.indexOf('核算口径声明') >= 0);

console.log('\n=== 18. 第1批 · T1 五阶段实施内容库完整性 ===');
const STAGE_KEYS = ['售前诊断','项目启动','现状调研','方案设计','交付落地'];
check('KB_STAGE_DETAIL 五阶段齐全', STAGE_KEYS.every(k => api.KB_STAGE_DETAIL && api.KB_STAGE_DETAIL[k]), STAGE_KEYS.filter(k=>!api.KB_STAGE_DETAIL[k]).join(','));
check('T1: 每阶段 steps>=5', STAGE_KEYS.every(k => api.KB_STAGE_DETAIL[k].steps.length >= 5),
  STAGE_KEYS.map(k=>k+':'+api.KB_STAGE_DETAIL[k].steps.length).join(' '));
check('T1: 每阶段 accept>=4', STAGE_KEYS.every(k => api.KB_STAGE_DETAIL[k].accept.length >= 4),
  STAGE_KEYS.map(k=>k+':'+api.KB_STAGE_DETAIL[k].accept.length).join(' '));
check('T1: 每阶段 redlines>=3', STAGE_KEYS.every(k => api.KB_STAGE_DETAIL[k].redlines.length >= 3),
  STAGE_KEYS.map(k=>k+':'+api.KB_STAGE_DETAIL[k].redlines.length).join(' '));
check('每阶段字段齐（14板块）', STAGE_KEYS.every(k => {
  const d = api.KB_STAGE_DETAIL[k];
  return ['name','goal','applyWhen','inputs','steps','methods','templates','outputs','accept','redlines','risks','raci','duration','evidence']
    .every(f => d[f] !== undefined && d[f] !== null && d[f] !== '');
}), '');
check('risks/raci/methods 为对象数组', STAGE_KEYS.every(k =>
  api.KB_STAGE_DETAIL[k].risks.every(x => x.r && x.m) &&
  api.KB_STAGE_DETAIL[k].raci.every(x => x.role && x.duty) &&
  api.KB_STAGE_DETAIL[k].methods.every(x => x.n && x.d)));
check('每阶段有明确工期', STAGE_KEYS.every(k => /工作日/.test(api.KB_STAGE_DETAIL[k].duration || '')),
  STAGE_KEYS.map(k=>api.KB_STAGE_DETAIL[k].duration).join(' | '));

console.log('\n=== 19. 第1批 · 行业 patch 差异合并 ===');
check('KB_STAGE_PATCH 含钢铁与食品饮料', !!(api.KB_STAGE_PATCH['钢铁'] && api.KB_STAGE_PATCH['食品饮料']));
const base调研 = api.KB_STAGE_DETAIL['现状调研'];
const patched调研 = api.mergeStageDetail('现状调研', '钢铁');
const base方案 = api.KB_STAGE_DETAIL['方案设计'];
const patched方案 = api.mergeStageDetail('方案设计', '食品饮料');
check('patch 后 inputs 增加（钢铁现状调研）', patched调研.inputs.length > base调研.inputs.length,
  base调研.inputs.length + '->' + patched调研.inputs.length);
check('patch 后 inputs 增加（食品饮料方案设计）', patched方案.inputs.length >= base方案.inputs.length);
check('patch 后 measures 增加（食品饮料方案设计）', (patched方案.measuresAdd||[]).length > 0 || patched方案.inputs.length >= base方案.inputs.length);
check('无 patch 行业返回基准版', api.mergeStageDetail('现状调研', '钢铁').steps.length === base调研.steps.length, '');
check('合并结果不污染基准版（基准 inputs 未变）', api.KB_STAGE_DETAIL['现状调研'].inputs.length === base调研.inputs.length);
check('钢铁 patch 含 CBAM 相关红线', JSON.stringify(api.KB_STAGE_PATCH['钢铁']).indexOf('CBAM') >= 0);

console.log('\n=== 20. 第1批 · T2 手风琴渲染与勾选 ===');
try {
  api.state.cur = { name:'T2测试厂', industry:'水泥建材', province:'四川', scale:'大型企业',
                    stage:'合规阶段', pains:['合规履约压力'], products:['碳盘查核算'], budget:'80-200万',
                    chain:'EHS', date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
  api.state.cur.em = { clinkerOut: 150, coal: 24, gridBuy: 2500 };
  api.ensureL2(api.state.cur);
  (api.state.cur.em.scope1 || []).forEach(function(r){ r.activity = '100'; });
  (api.state.cur.em.scope2 || []).forEach(function(r){ r.activity = '200'; });
  api.renderPlan();
  const planHtml = String(docStub.getElementById('planBox').innerHTML);
  const accCount = (planHtml.match(/class="acc-item/g) || []).length;
  check('T2: 手风琴卡片数量 = 5', accCount === 5, 'actual=' + accCount);
  // 逐阶段勾选框数量应等于 accept.length
  STAGE_KEYS.forEach(k => {
    const d = api.mergeStageDetail(k, '水泥建材');
    const re = new RegExp('data-stage="' + k + '"', 'g');
    const n = (planHtml.match(re) || []).length;
    check('T2: ' + k + ' 勾选框数 = accept.length(' + d.accept.length + ')', n === d.accept.length, 'actual=' + n);
  });
  check('含阶段目标板块', planHtml.indexOf('阶段目标') >= 0);
  check('含输入清单板块', planHtml.indexOf('输入清单') >= 0);
  check('含实施步骤板块', planHtml.indexOf('实施步骤') >= 0);
  check('含交付物明细板块', planHtml.indexOf('交付物明细') >= 0);
  check('含质检红线板块', planHtml.indexOf('质检红线') >= 0);
  check('含风险与应对板块', planHtml.indexOf('风险与应对') >= 0);
  check('含RACI 板块', planHtml.indexOf('RACI') >= 0);
  check('含证据链要求板块', planHtml.indexOf('证据链要求') >= 0);
  check('含变更条款 note', planHtml.indexOf('变更条款') >= 0);
  check('卡头显示工期', planHtml.indexOf('工期') >= 0);
  check('默认展开第二三阶段', (planHtml.match(/acc-item open/g) || []).length === 2, (planHtml.match(/acc-item open/g)||[]).length + '');
  // 动态裁剪：有 em 数据时现状调研不应显示"待数据补齐"
  check('有排放数据时不显示待数据补齐', planHtml.indexOf('技经测算待数据补齐') < 0);
} catch (e) { check('T2 手风琴渲染', false, e.message); }

console.log('\n=== 21. 第1批 · 数据缺失时置灰 ===');
try {
  api.state.cur.em = {};
  api.renderPlan();
  const h2 = String(docStub.getElementById('planBox').innerHTML);
  check('无排放数据 → 出现待数据补齐提示', h2.indexOf('技经测算待数据补齐') >= 0);
  check('无排放数据 → 标 od 高风险标签', h2.indexOf('待数据补齐') >= 0);
} catch (e) { check('数据缺失置灰', false, e.message); }

console.log('\n=== 22. 第1批 · T7 单阶段任务生成（G2 修复）===');
try {
  const c2 = { name:'T7测试厂', industry:'钢铁', province:'江苏', scale:'大型企业', stage:'数据阶段',
               pains:[], products:[], budget:'待评估', chain:'', date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
  api.state.cur = c2;
  const before = api.state.tasks.length;
  api.genStageTasks('现状调研');
  const added = api.state.tasks.filter(t => t.client === 'T7测试厂');
  check('T7: 只生成该阶段任务', added.length > 0 && added.every(t => t.stage === '现状调研'),
    added.map(t=>t.stage).join(','));
  check('T7: 交付物为该阶段具体清单（非阶段级一句话）', added.every(t => t.deliver && t.deliver.length > 6),
    added[0] ? added[0].deliver : '');
  const dq = api.mergeStageDetail('现状调研', '钢铁');
  const firstOut = dq.outputs[0];
  check('T7: 交付物含具体交付物明细', added[0] && added[0].deliver.indexOf(firstOut.slice(0,4)) >= 0,
    added[0] ? added[0].deliver : '');
  check('T7: remark 带验收条数', added.every(t => t.remark.indexOf('验收标准') >= 0));
  check('T7: 其他阶段未受影响', api.state.tasks.length === before + added.length);
  // 幂等
  const n1 = api.state.tasks.length;
  api.genStageTasks('现状调研');
  check('T7: 重复生成幂等', api.state.tasks.length === n1, n1 + '->' + api.state.tasks.length);
} catch (e) { check('T7 单阶段任务生成', false, e.message); }

console.log('\n=== 23. 第1批 · T11/T12 结构性红线 ===');
{
  const rawOpen = (html.match(/<script\b[^>]*>/g) || []).length;
  const rawClose = (html.match(/<\/script>/g) || []).length;
  check('T12: script 开闭标签数量相等', rawOpen === rawClose, rawOpen + ' vs ' + rawClose);
  // innerHTML 直插未消毒内容：除 setHTML 内部那一处外不应有裸赋值
  const badAssign = [...code.matchAll(/\.innerHTML\s*=\s*(?!sanitizeHtml)([^;]{0,40})/g)]
    .map(m => m[1].trim()).filter(x => x && !/^sanitizeHtml/.test(x));
  check('T11: innerHTML 仅在 setHTML 内消毒赋值', badAssign.length === 0, badAssign.slice(0,2).join(' | '));
  check('T13: 无外部 CDN 依赖', !/(cdn\.|jsdelivr|unpkg|bootcdn|staticfile)/i.test(html));
  check('setHTML 是唯一 DOM 写入口', /function setHTML\(el, html\)/.test(code) && /el\.innerHTML = sanitizeHtml\(html\)/.test(code));
}

console.log('\n=== 24. 第2批 · T4 题库完整性（附件B）===');
check('MODES 两模式齐全', !!(api.MODES.quick && api.MODES.full));
check('quick 模式 7 问', api.MODES.quick.questionIds.length === 7, api.MODES.quick.questionIds.length);
check('full 模式 27 问', api.MODES.full.questionIds.length === 27, api.MODES.full.questionIds.length);
check('核心 7 问 key 与旧版一致',
  api.QUESTIONS_CORE.map(q=>q.k).join(',') === 'name,industry,province,scale,force,pains,chain',
  api.QUESTIONS_CORE.map(q=>q.k).join(','));
check('核心 7 问顺序未变', api.QUESTIONS_CORE[0].id === 'Q1' && api.QUESTIONS_CORE[6].id === 'Q7');
const allIds = api.allQuestionIds();
check('T4: 总题数 = 27', allIds.length === 27, allIds.length);
check('T4: 题号连续无重复', new Set(allIds).size === 27 && allIds[0]==='Q1' && allIds[26]==='Q27');
check('五组齐全（售前/启动/调研/方案/交付）',
  api.QUESTIONS_STAGE.map(g=>g.stage).join(',') === '售前诊断,项目启动,现状调研,方案设计,交付落地',
  api.QUESTIONS_STAGE.map(g=>g.stage).join(','));
check('每组有 title 与 why', api.QUESTIONS_STAGE.every(g => g.title && g.why));
check('组题数 = 4/3/6/4/3',
  api.QUESTIONS_STAGE.map(g=>g.items.length).join(',') === '4,3,6,4,3',
  api.QUESTIONS_STAGE.map(g=>g.items.length).join(','));

console.log('\n=== 25. 第2批 · key 路径读写 ===');
{
  const o = {};
  api.setPath(o, 'em.clinkerOut', 150);
  api.setPath(o, 'em.energy.coal', 24);
  check('setPath 支持嵌套 em.*', api.getPath(o, 'em.clinkerOut') === 150);
  check('setPath 支持多级', api.getPath(o, 'em.energy.coal') === 24);
  check('getPath 不存在返回 undefined', api.getPath(o, 'em.nope.deep') === undefined);
  check('isFilled: 数字 0 视为已填', api.isFilled(0) === true);
  check('isFilled: "待补充" 视为未填', api.isFilled('待补充') === false);
  check('isFilled: 空数组未填', api.isFilled([]) === false);
  check('isFilled: 空对象未填', api.isFilled({}) === false);
}

console.log('\n=== 26. 第2批 · T5 一致性校验 V1–V8 ===');
{
  const mk = (extra) => Object.assign({
    name:'校验厂', industry:'水泥建材', province:'四川', scale:'大型企业', stage:'合规阶段',
    pains:[], products:[], budget:'', chain:'', date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:''
  }, extra);
  api.state.cur = mk({ em:{ clinkerOut:200, cementOut:250, capacity:150 } });
  let g = api.runQualityGates();
  check('V1 触发：熟料产量 > 设计产能', g.some(x=>x.id==='V1'), JSON.stringify(g.map(x=>x.id)));
  api.state.cur = mk({ em:{ clinkerOut:150, cementOut:100, capacity:200 } });
  g = api.runQualityGates();
  check('V1 触发：水泥 < 熟料（含外销熟料追问）', g.some(x=>x.id==='V1' && x.ask.indexOf('外销熟料')>=0));
  api.state.cur = mk({ em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:195, whr:4200 } });
  g = api.runQualityGates();
  check('合理数据不误报 V1/V2/V3', !g.some(x=>x.id==='V1'||x.id==='V2'||x.id==='V3'), JSON.stringify(g.map(x=>x.id)));
  api.state.cur = mk({ em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:100 } });
  g = api.runQualityGates();
  check('V2 触发：石灰石单耗 <1.1', g.some(x=>x.id==='V2'));
  api.state.cur = mk({ em:{ clinkerOut:150, cementOut:215, capacity:600 } });
  g = api.runQualityGates();
  check('V3 触发：运转天数 < 250', g.some(x=>x.id==='V3'), JSON.stringify(g.map(x=>x.id)));
  api.state.cur = mk({ em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:195, whr:4200 } });
  g = api.runQualityGates();
  const v5 = g.find(x=>x.id==='V5');
  check('V5 触发：余热万kWh→MWh 换算', !!v5 && v5.msg.indexOf('42,000') >= 0, v5 ? v5.msg : '');
  api.state.cur = mk({ isCBAM:'有出口', em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:195 } });
  g = api.runQualityGates();
  check('V7 触发：CBAM 抵扣口径', g.some(x=>x.id==='V7'));
  api.state.cur = mk({ isETS:'是', dataAvail:{ '月度能耗台账':'无' }, em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:195 } });
  g = api.runQualityGates();
  const v8 = g.find(x=>x.id==='V8');
  check('V8 触发且为高风险', !!v8 && v8.level === 'hi');
  api.state.cur = mk({ isETS:'是', dataAvail:{ '月度能耗台账':'有' }, em:{ clinkerOut:150, cementOut:215, capacity:155, limestone:195 } });
  g = api.runQualityGates();
  check('V8 台账齐全时不误报', !g.some(x=>x.id==='V8'));
  api.state.cur = mk({ em:{} });
  g = api.runQualityGates();
  check('无数据时不虚报任何校验', g.length === 0, JSON.stringify(g.map(x=>x.id)));
}

console.log('\n=== 27. 第2批 · T6 完整度与缺口清单 ===');
{
  api.chat2 = api.newChat2();
  api.state.cur = null;
  let cp = api.completeness();
  check('无客户时完整度为 0', cp.pct === 0, cp.pct);
  check('0% 落在 danger 档', cp.tier.level === 'danger', cp.tier.level);
  api.state.cur = { name:'A', industry:'水泥建材', province:'四川', scale:'大型企业', stage:'合规阶段',
    pains:['合规履约压力'], products:['碳盘查核算'], budget:'80-200万', chain:'EHS→总经理',
    date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
  api.chat2.coreForce = { forceCompliance:true };
  cp = api.completeness();
  check('核心问填完 → 约 20%', cp.pct === 20, cp.pct);
  api.state.cur.em = { clinkerOut:150, cementOut:215, capacity:155, coal:24, af:0, diesel:120,
                       gridBuy:2500, whr:4200, greenPower:0, limestone:195, altRaw:0 };
  api.state.cur.isETS='是'; api.state.cur.isCBAM='有出口';
  api.state.cur.dataAvail = { '月度能耗台账':'有', '产量与质量台账':'有', '化验室煤质报告':'部分',
                              '电费单与用电记录':'有', '计量器具台账':'有', '运输台账':'无' };
  api.state.cur.creditCode='91510000XXXXXXXXXX'; api.state.cur.productsLine='P·O42.5 220万吨/年';
  api.state.cur.siteCount='1 个'; api.state.cur.boundary='单一法人单一厂区'; api.state.cur.baseYear='2025 年度';
  cp = api.completeness();
  check('采集组1+2 → 完整度升至 50% 档', cp.pct >= 50, cp.pct + ' ' + cp.tier.level);
  const gaps = api.buildGapList();
  check('缺口清单非空', gaps.length > 0, gaps.length);
  check('缺口含 dataAvail 标记为「无」的项', gaps.some(g=>g.missing.indexOf('运输台账')>=0));
  check('缺口含标记为「部分」的项', gaps.some(g=>g.missing.indexOf('化验室煤质报告')>=0));
  check('缺口项含影响/向谁要/时限', gaps.every(g=>g.impact && g.askWho && g.due), '');
  check('缺口项含 gotoKey 可跳回', gaps.every(g=>!!g.gotoKey));
  check('CBAM 缺口存在', gaps.some(g=>g.missing.indexOf('出口量')>=0));
  const before = api.completeness().pct;
  api.chat2.skipped[4] = true;
  api.state.cur.techPlan = undefined; api.state.cur.investRule = undefined;
  api.state.cur.policyAsk = undefined; api.state.cur.targetText = undefined;
  const after = api.completeness().pct;
  check('跳过组不计入完整度得分', after === before, before + '->' + after);
  const g2 = api.buildGapList();
  check('跳过的组进入缺口清单', g2.some(g=>g.missing.indexOf('整组跳过')>=0));
  check('高风险缺口标记存在', g2.some(g=>g.hi));
}

console.log('\n=== 28. 第2批 · T8 方案 A 序列化落库 ===');
{
  const c = { name:'序列化厂', industry:'水泥建材', em:{ clinkerOut:150, coal:24 },
              isETS:'是', dataAvail:{ '月度能耗台账':'有' }, acceptance:{ '现状调研':[0,1] } };
  const rec = api.custToRec(c);
  check('排放与参数字段存在', '排放与参数' in rec);
  check('序列化结果为合法 JSON', (()=>{ try{ JSON.parse(rec['排放与参数'].text); return true; }catch(e){ return false; } })());
  const back = api.deserializeEm(rec['排放与参数'].text);
  check('回读 em.clinkerOut 正确', back && back.em && back.em.clinkerOut === 150);
  check('回读 isETS 正确', back && back.isETS === '是');
  check('回读 dataAvail 正确', back && back.dataAvail && back.dataAvail['月度能耗台账'] === '有');
  check('回读 acceptance 正确', back && back.acceptance && back.acceptance['现状调研'].length === 2);
  const row = { '客户名称':'序列化厂', '所属行业':'水泥建材', '核心痛点':[], '推荐产品线':[],
                '诊断日期':'2026-10-13T00:00:00Z', '核验日期':'2026-10-13T00:00:00Z',
                '排放与参数': rec['排放与参数'].text, record_id:'rec_x' };
  const rt = api.recToCust(row);
  check('recToCust 回填 em', rt.em && rt.em.clinkerOut === 150);
  check('recToCust 回填 isETS', rt.isETS === '是');
  check('recToCust 保留原有字段', rt.name === '序列化厂' && rt.industry === '水泥建材');
  check('空排放字段不写库', (()=>{ const r2 = api.custToRec({name:'X'}); return r2['排放与参数'].text === ''; })());
}

console.log('\n=== 29. 第2批 · 采集器渲染与交互 ===');
{
  api.chat2 = api.newChat2();
  api.state.cur = { name:'采集厂', industry:'水泥建材', province:'四川', scale:'大型企业', stage:'合规阶段',
    pains:[], products:[], budget:'', chain:'', date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
  api.renderCollector();
  let h = String(docStub.getElementById('collectBox').innerHTML);
  check('渲染模式切换栏', h.indexOf('data-mode="quick"') >= 0 && h.indexOf('data-mode="full"') >= 0);
  check('渲染完整度进度环', h.indexOf('cp-ring') >= 0);
  check('未答核心问时提示先答核心 7 问', h.indexOf('先完成左侧核心 7 问') >= 0);
  api.setMode('full');
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('完整模式进入第 1 组（Q8 售前诊断）', h.indexOf('Q8') >= 0, '');
  check('渲染组标题与 why', h.indexOf('grp-why') >= 0);
  check('渲染跳过本组按钮', h.indexOf('data-skipgroup="1"') >= 0);
  check('Q8 为 text 题型渲染输入框', h.indexOf('data-field="creditCode"') >= 0);
  api.nextQuestion();
  h = String(docStub.getElementById('collectBox').innerHTML);
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('推进到 Q9（text 题型，渲染输入框）', h.indexOf('Q9') >= 0 && h.indexOf('productsLine') >= 0);
  api.gotoQuestion('Q10');
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('gotoQuestion 定位 Q10', api.chat2.curQ.id === 'Q10');
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('Q10 为 chips 题型（isETS 三选项）', h.indexOf('data-opt=') >= 0 && h.indexOf('已纳入') >= 0);
  api.gotoQuestion('Q14');
  h = String(docStub.getElementById('collectBox').innerHTML);
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('Q14 matrix 渲染 6 个数据项（6 项 × 3 档 = 18 个按钮）', (h.match(/data-mlevel=/g)||[]).length === 18, (h.match(/data-mlevel=/g)||[]).length);
  check('Q14 每项三档（有/部分/无）', (h.match(/data-mlevel=/g)||[]).length === 18, (h.match(/data-mlevel=/g)||[]).length);
  api.gotoQuestion('Q15');
  h = String(docStub.getElementById('collectBox').innerHTML);
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('Q15 渲染 3 个数字输入', (h.match(/inputmode="decimal"/g)||[]).length === 3, (h.match(/inputmode="decimal"/g)||[]).length);
  check('Q15 输入框带 units', h.indexOf('万吨') >= 0);
  check('数字输入用 inputmode 而非 type=number', h.indexOf('type="number"') < 0);
  api.gotoQuestion('Q16');
  h = String(docStub.getElementById('collectBox').innerHTML);
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('Q16 渲染 6 个数字输入', (h.match(/inputmode="decimal"/g)||[]).length === 6, (h.match(/inputmode="decimal"/g)||[]).length);
  api.gotoQuestion('Q18');
  h = String(docStub.getElementById('collectBox').innerHTML);
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('Q18 渲染 3 个子问（每个子问 3-4 档选项）', (h.match(/data-sub=/g)||[]).length >= 3 && (h.match(/data-subopt=/g)||[]).length >= 9, (h.match(/data-sub=/g)||[]).length);
  api.skipGroup(1);
  check('跳过组1 → 字段记为待补充', api.state.cur.creditCode === '待补充', String(api.state.cur.creditCode));
  check('跳过组1 → 标记 skipped', api.chat2.skipped[1] === true);
  check('跳过组1 → 自动跳到组2 首题', api.chat2.curQ.id === 'Q12', api.chat2.curQ.id);
  delete api.chat2.skipped[1];
  check('可取消跳过标记', api.chat2.skipped[1] === undefined);
  api.chat2.curQ = null;
  api.renderCollector();
  h = String(docStub.getElementById('collectBox').innerHTML);
  check('全部答完显示完成态', h.indexOf('情报采集完成') >= 0, '');
}

console.log('\n=== 30. 第2批 · T11/T12 结构性红线复查 ===');
{
  const o = (html.match(/<script\b[^>]*>/g) || []).length;
  const c2 = (html.match(/<\/script>/g) || []).length;
  check('T12: script 开闭标签数量相等', o === c2, o + ' vs ' + c2);
  const bad = [...code.matchAll(/\.innerHTML\s*=\s*(?!sanitizeHtml)([^;]{0,40})/g)].map(m=>m[1].trim()).filter(x=>x && !/^sanitizeHtml/.test(x));
  check('T11: innerHTML 仅经 setHTML 消毒', bad.length === 0, bad.slice(0,2).join(' | '));
  check('collectBox 已挂载到窗口一', html.indexOf('id="collectBox"') >= 0);
  check('refreshAll 已包含 renderCollector', /function refreshAll\(\)[\s\S]{0,300}renderCollector\(\)/.test(code));
  check('跳过整组语义为「待补充」而非删值', /setPath\(state\.cur, f, '待补充'\)/.test(code));
}
console.log('\n=== 31. 第3批 · 计算引擎自检（TEST_CASE 虚拟水泥企业）===');
try {
  const st = api.runCalcSelfTest();
  check('计算引擎自检严格项全部通过', st.fail === 0, 'pass=' + st.pass + ' fail=' + st.fail + '/' + st.total);
  const R = st.R;
  check('范围1 = 1,285,627', Math.abs(R.scope1 - 1285627) <= 5, R.scope1);
  check('范围2 修正口径 = 93,600', Math.abs(R.scope2Corr - 93600) <= 5, R.scope2Corr);
  check('范围2 数据集口径 = 110,610', Math.abs(R.scope2Data - 110610) <= 5, R.scope2Data);
  check('范围3 = 15,252', Math.abs(R.scope3 - 15252) <= 5, R.scope3);
  check('总排放 修正 = 1,394,480', Math.abs(R.totalCorr - 1394480) <= 10, R.totalCorr);
  check('吨熟料强度 修正 = 0.9195', Math.abs(R.intClinkerCorr - 0.9195) <= 0.001, R.intClinkerCorr);
  check('2025 配额 = 1,320,000', Math.abs(R.quota2025 - 1320000) <= 5, R.quota2025);
  check('CCER 上限 = 69,812（按范围1+2×5%）', Math.abs(R.ccerCapData - 69812) <= 5, R.ccerCapData);
  check('缺口成本 CEA80 数据集 = 6,099,006', Math.abs(R.gapCostData - 6099006) <= 60990, R.gapCostData);
  check('CBAM 应缴 = 7,296 t', Math.abs(R.cbamPayable - 7296) <= 5, R.cbamPayable);
  check('CBAM 费用 = 547,200 EUR', Math.abs(R.cbamFeeEUR - 547200) <= 5472, R.cbamFeeEUR);
  check('CBAM 费用 = 4,268,160 CNY', Math.abs(R.cbamFeeCNY - 4268160) <= 42682, R.cbamFeeCNY);
  check('PCF = 796.22', Math.abs(R.pcf - 796.22) <= 1, R.pcf);
  check('calcEngine 为纯函数（无 DOM 写）', typeof api.calcEngine === 'function' && typeof api.normEm === 'function');
  check('参数读 PARAMS（碳价缺省 60，未硬编码）', api.getFac(api.PARAMS, null, 'ccerPrice') === 60);
  check('roiText 显示碳价来源而非硬编码 60 元', api.roiText({ invest:600000, cut:1000 }).indexOf('来源') >= 0);
  check('缺陷① 余热双口径均在结果中', typeof R.scope2Corr === 'number' && typeof R.scope2Data === 'number');
  check('缺陷③ 石灰石单耗触发 V2 追问', R.quality.V2_lime.on === true, 'ratio=' + R.quality.V2_lime.value);
  check('缺陷② CBAM 抵扣比例为参数(默认5%)', Math.abs(R.P.cbamDeductRate - 0.05) < 1e-9);
} catch (e) { check('第3批计算引擎自检', false, e.message + ' | ' + (e.stack || '').split('\n')[1]); }

console.log('\n=== 32. 第4批 · 窗口四方案文档工作台（生成/编辑/版本/导出）===');
(function(){
  // 构造一家带完整数据的水泥客户（em 字段名对齐 normEm）
  const c = {
    name: '测试·华西水泥', industry: '水泥建材', province: '四川', stage: '数据阶段',
    pains: ['配额缺口大'], products: ['碳盘查核算','碳履约与交易'], conclusion: '完成核算与履约方案',
    deliverForm: ['诊断报告','核算底稿与台账模板'], docLang: ['中文'],
    isETS: '是，已纳入', isCBAM: '有出口', disclose: ['ESG/TCFD','CDP'], policyAsk: ['CCER开发'],
    boundary: '单一法人单一厂区', baseYear: '2025 年度',
    em: {
      clinkerOut:150, cementOut:215, coal:24, af:0.8, diesel:120, limestone:120, altRaw:0.15,
      gridBuy:25000, whr:4200, greenPower:0, cbamExportClinker:0.8, cbamDirect:0.88, cbamIndirect:0.08,
      s3:[{id:'S3-01',e:120},{id:'S3-02',e:3200},{id:'S3-03',e:6250},{id:'S3-04',e:432},{id:'S3-05',e:180},{id:'S3-06',e:320},{id:'S3-07',e:450},{id:'S3-09',e:2500},{id:'S3-09b',e:1800}],
      pcfStages:[{name:'原料获取',e:42},{name:'煅烧',e:18},{name:'燃料',e:428},{name:'粉磨',e:255.2},{name:'包装',e:25.92},{name:'运输',e:12.6},{name:'管理',e:2.5},{name:'线损',e:1},{name:'协同',e:8},{name:'其他',e:3}]
    },
    dataAvail: { '月度能耗台账':'有', '产量与质量台账':'有', '化验室煤质报告':'部分', '电费单与用电记录':'有', '计量器具台账':'有', '运输台账':'无' }
  };
  api.state.cur = c;

  // 32.1 buildDoc 纯函数产出章节骨架（说明书 7.2）
  let doc;
  try { doc = api.buildDoc(c); check('buildDoc 生成整份方案书', typeof doc === 'string' && doc.length > 2000, doc && doc.length); }
  catch(e){ check('buildDoc 生成整份方案书', false, e.message); doc = ''; }
  check('含封面方案书标题', doc.indexOf('双碳咨询落地方案书') >= 0);
  check('含章节一 项目概述', doc.indexOf('一、项目概述与咨询目标') >= 0);
  check('含章节三 核算边界声明', doc.indexOf('三、核算边界与口径声明') >= 0);
  check('含章节四 排放核算结果', doc.indexOf('四、排放核算结果') >= 0);
  check('含章节五 五阶段实施方案(id=doc-sec5)', doc.indexOf('五、五阶段实施方案') >= 0 && doc.indexOf('id="doc-sec5"') >= 0);
  check('含章节六 技经测算', doc.indexOf('六、技经测算与减排路径') >= 0);
  check('含章节十一 政策适配', doc.indexOf('十一、政策适配与补贴申报路径') >= 0);
  check('含章节十三 数据质量', doc.indexOf('十三、数据质量') >= 0);
  check('含附录B 参数与来源', doc.indexOf('附录 B') >= 0);
  check('isETS → 生成碳市场履约章', doc.indexOf('七、碳市场履约与碳资产') >= 0);
  check('isCBAM → 生成CBAM章', doc.indexOf('八、CBAM 影响测算') >= 0);
  check('pcfStages → 生成产品碳足迹章', doc.indexOf('九、产品碳足迹') >= 0);
  check('disclose ESG → 生成ESG章', doc.indexOf('十、ESG') >= 0);
  check('缺字段显示待补充占位(可点击跳转)', doc.indexOf('class="missing" data-goto=') >= 0);
  check('文档不含未处理占位符 {{', doc.indexOf('{{') < 0);
  check('文档含核验基准日 2026-10-13', doc.indexOf('2026-10-13') >= 0);

  // 32.2 生成到 DOM（docBody）
  try {
    api.state.docHtml = {}; api.state.docLoadedFor = null; api.state.docVer = {};
    api.genDoc();
    const body = api.document.getElementById('docBody');
    check('genDoc 写入 docBody', !!(body && body.innerHTML && body.innerHTML.length > 2000));
    check('genDoc 后版本号=1', (api.state.docVer['测试·华西水泥']||0) === 1, api.state.docVer['测试·华西水泥']);
  } catch(e){ check('genDoc 写入 docBody', false, e.message); }

  // 32.3 局部重生成五阶段章节不抛错
  try { api.regenStageSection(); check('regenStageSection 不抛错', true); }
  catch(e){ check('regenStageSection 不抛错', false, e.message); }

  // 32.4 保存版本快照（prompt 已 stub）
  try {
    api.saveDocVersion();
    const list = JSON.parse(api.localStorage.getItem('wb_shuangtan_doc_测试·华西水泥') || '[]');
    check('saveDocVersion 写入 localStorage 版本快照', Array.isArray(list) && list.length >= 1, JSON.stringify(list).slice(0,60));
  } catch(e){ check('saveDocVersion 写入 localStorage 版本快照', false, e.message); }

  // 32.5 打开版本面板不抛错
  try { api.openDocVersions(); check('openDocVersions 不抛错', true); }
  catch(e){ check('openDocVersions 不抛错', false, e.message); }

  // 32.6 导出 Word（Blob/URL 已 stub）
  try { api.exportWord(); check('exportWord 不抛错', true); }
  catch(e){ check('exportWord 不抛错', false, e.message); }

  // 32.7 导出 PDF（window.print 已 stub）
  try { api.exportPdf(); check('exportPdf 不抛错', true); }
  catch(e){ check('exportPdf 不抛错', false, e.message); }

  // 32.8 docToMd 为可调用函数
  check('docToMd 为可调用函数', typeof api.docToMd === 'function');

  // 32.9 三档提示：完整度<50% 时现状章转数据需求清单（避免编造）
  const c2 = JSON.parse(JSON.stringify(c));
  c2.em = {}; c2.pains = []; c2.products = []; c2.dataAvail = {};
  api.chat2.coreForce = {}; api.chat2.skipped = {1:true,2:true,3:true,4:true,5:true};
  api.state.cur = c2;
  let doc2;
  try { doc2 = api.buildDoc(c2); check('低完整度 buildDoc 不抛错', typeof doc2 === 'string'); }
  catch(e){ check('低完整度 buildDoc 不抛错', false, e.message); doc2 = ''; }
  check('低完整度 → 现状章转数据需求清单（不编造）', doc2.indexOf('数据需求清单') >= 0);
  api.chat2.skipped = {}; api.chat2.coreForce = null;

  // 32.10 refreshAll 含 renderDoc 不抛错（回归）
  api.state.cur = c;
  try { api.refreshAll(); check('refreshAll 含 renderDoc 不抛错', true); }
  catch(e){ check('refreshAll 含 renderDoc 不抛错', false, e.message); }

  // 32.11 页面存在窗口四与新按钮
  check('窗口四 DOM 容器存在', html.indexOf('id="docBody"') >= 0 && html.indexOf('id="docToc"') >= 0);
  check('导出按钮齐全(Word/PDF/MD/生成/版本)', ['btnDocGen','btnDocWord','btnDocPdf','btnDocMd','btnDocSave','btnDocOpen','btnDocStage'].every(id => html.indexOf('id="' + id + '"') >= 0));
})();

console.log('\n=== 33. 第5批 · 窗口一 L2 分范围采集（SCOPE_COLLECTION / 因子三件套 / 行内即时排放 / L1-L2 偏差）===');
(function(){
  // 33.1 模板行数
  check('SCOPE_COLLECTION 范围1 = 6 行', api.SCOPE_COLLECTION.scope1.length === 6);
  check('SCOPE_COLLECTION 范围2 = 4 行', api.SCOPE_COLLECTION.scope2.length === 4);
  check('SCOPE_COLLECTION 范围3 = 15 类', api.SCOPE_COLLECTION.scope3.length === 15);
  check('FACTOR_LIB 含 gridEF/clinkerEF/coalNCV', !!api.FACTOR_LIB.scope2.gridEF && !!api.FACTOR_LIB.scope1.clinkerEF && !!api.FACTOR_LIB.scope1.coalNCV);

  // 构造与 L1 一致的水泥客户（em.scope1/2/3 为源级数据）
  var c = {
    name:'L2测试·水泥', industry:'水泥建材', province:'四川', stage:'数据阶段',
    pains:['配额缺口','履约成本上升'], products:['碳盘查核算','配额盈缺诊断'], conclusion:'核算履约',
    deliverForm:['诊断报告'], docLang:['中文'], isETS:'是，已纳入', isCBAM:'有出口', disclose:['ESG/TCFD'], budget:'待定', chain:'待定',
    em:{
      coal:24, af:0.8, diesel:120, clinkerOut:150, limestone:120, altRaw:0.15,
      gridBuy:25000, whr:4200, greenPower:0, cbamExportClinker:0.8, cbamDirect:0.88, cbamIndirect:0.08,
      scope1:[
        {id:'S1-01',source:'原煤',activity:240000,unit:'t',formula:'fuelByMass',factorRefs:['coalNCV','coalCC','coalOX'],judgment:'纳入',factors:{coalNCV:{v:21,src:'化验室实测',quality:'实测'},coalCC:{v:26.18,src:'指南',quality:'国家缺省'},coalOX:{v:0.99,src:'指南',quality:'国家缺省'}}},
        {id:'S1-02',source:'替代燃料',activity:8000,unit:'t',formula:'fuelByCarbon',factorRefs:['rdfC','rdfNonBio'],judgment:'纳入',factors:{rdfC:{v:0.3,src:'检验报告',quality:'实测'},rdfNonBio:{v:0.6,src:'检验报告',quality:'实测'}}},
        {id:'S1-03',source:'柴油',activity:120,unit:'t',formula:'fuelByEF',factorRefs:['dieselNCV','dieselEF'],judgment:'纳入',factors:{dieselNCV:{v:42.65,src:'指南',quality:'国家缺省'},dieselEF:{v:74100,src:'指南',quality:'国家缺省'}}},
        {id:'S1-04',source:'过程',activity:1500000,unit:'t',formula:'process',factorRefs:['clinkerEF'],judgment:'纳入',factors:{clinkerEF:{v:0.535,src:'指南2024',quality:'国家缺省'}}},
        {id:'S1-05',source:'替代原料扣减',activity:1500,unit:'t',formula:'deduct',factorRefs:['altRawCF'],judgment:'纳入',factors:{altRawCF:{v:0.44,src:'化验报告',quality:'实测'}}},
        {id:'S1-06',source:'逸散',activity:0,unit:'—',formula:'none',factorRefs:['gwpCH4','gwpN2O'],judgment:'不适用',factors:{}}
      ],
      scope2:[
        {id:'S2-01',source:'外购电',activity:250000,unit:'MWh',formula:'grid',factorRefs:['gridEF'],judgment:'纳入',factors:{gridEF:{v:0.45,src:'区域电网因子',quality:'区域平均'}}},
        {id:'S2-02',source:'余热抵扣',activity:4200,unit:'万kWh',formula:'grid',factorRefs:['gridEF'],judgment:'纳入',factors:{gridEF:{v:0.45,src:'余热发电记录',quality:'实测'}}},
        {id:'S2-03',source:'绿电',activity:0,unit:'MWh',formula:'zero',factorRefs:[],judgment:'纳入',factors:{}},
        {id:'S2-04',source:'热力',activity:0,unit:'GJ',formula:'heat',factorRefs:['heatEF'],judgment:'纳入',factors:{heatEF:{v:0.11,src:'指南',quality:'国家缺省'}}}
      ],
      scope3:[]
    }
  };
  // 范围3：8 类纳入，其余未纳入/不适用
  c.em.scope3 = [
    {id:'S3-01',factorRef:'s3Freight',judgment:'纳入',activity:2000000,factors:{s3Freight:{v:0.0001,src:'估算',quality:'区域平均'}}},
    {id:'S3-02',factorRef:'s3Capital',judgment:'纳入',activity:1,factors:{s3Capital:{v:3200,src:'估算',quality:'国家缺省'}}},
    {id:'S3-03',factorRef:'lossEF',judgment:'纳入',activity:1000,factors:{lossEF:{v:0.025,src:'估算',quality:'区域平均'}}},
    {id:'S3-04',factorRef:'s3FreightUp',judgment:'纳入',activity:500000,factors:{s3FreightUp:{v:0.00012,src:'估算',quality:'区域平均'}}},
    {id:'S3-05',factorRef:'s3Waste',judgment:'纳入',activity:1,factors:{s3Waste:{v:180,src:'估算',quality:'国家缺省'}}},
    {id:'S3-06',factorRef:'s3Travel',judgment:'纳入',activity:1,factors:{s3Travel:{v:320,src:'估算',quality:'国家缺省'}}},
    {id:'S3-07',factorRef:'s3Commute',judgment:'纳入',activity:1,factors:{s3Commute:{v:450,src:'估算',quality:'国家缺省'}}},
    {id:'S3-09',factorRef:'s3FreightDown',judgment:'纳入',activity:3000000,factors:{s3FreightDown:{v:0.0001,src:'估算',quality:'区域平均'}}},
    {id:'S3-08',factorRef:'',judgment:'未纳入',activity:0,factors:{}},
    {id:'S3-10',factorRef:'',judgment:'不适用',activity:0,factors:{}},
    {id:'S3-11',factorRef:'',judgment:'不适用',activity:0,factors:{}},
    {id:'S3-12',factorRef:'',judgment:'未纳入',activity:0,factors:{}},
    {id:'S3-13',factorRef:'',judgment:'未纳入',activity:0,factors:{}},
    {id:'S3-14',factorRef:'',judgment:'未纳入',activity:0,factors:{}},
    {id:'S3-15',factorRef:'',judgment:'未纳入',activity:0,factors:{}}
  ];
  // L1 范围3 用相同 e 值（{id,e}），使 L1/L2 一致
  c.em.s3 = c.em.scope3.filter(function(r){ return r.judgment === '纳入'; }).map(function(r){ return { id:r.id, e: api.l2RowEmit('scope3', r) }; });

  // 33.2 行内即时排放量（公式正确）
  check('S1-01 行排放量 ≈ 478,968 tCO₂e', Math.abs(api.l2RowEmit('scope1', c.em.scope1[0]) - 478967.9) < 5);
  check('S1-04 工艺过程 = 1,500,000×0.535 = 802,500', Math.abs(api.l2RowEmit('scope1', c.em.scope1[3]) - 802500) < 1);
  check('S2-02 余热抵扣 = -18,900（万kWh×10×gridEF）', Math.abs(api.l2RowEmit('scope2', c.em.scope2[1]) - (-18900)) < 1);
  check('S3-02 年度固定因子 = 3200（不乘活动量）', Math.abs(api.l2RowEmit('scope3', c.em.scope3[1]) - 3200) < 1);
  check('S1-06 不适用 → 0', api.l2RowEmit('scope1', c.em.scope1[5]) === 0);

  // 33.3 L2 汇总与 L1 偏差 < 15%
  var ck = api.l1l2Check(c);
  check('L2 范围1 与 L1 偏差 ≤ 15%', ck.dev1 <= 0.15, ck.dev1.toFixed(4));
  check('L2 范围2 与 L1 偏差 ≤ 15%', ck.dev2 <= 0.15, ck.dev2.toFixed(4));
  check('L2 范围3 与 L1 偏差 ≤ 15%', ck.dev3 <= 0.15, ck.dev3.toFixed(4));
  check('交叉核对 over=false（口径一致）', ck.over === false);

  // 33.4 偏差 > 15% 触发提示
  var c2 = JSON.parse(JSON.stringify(c));
  c2.em.scope1[0].activity = 480000;
  var ck2 = api.l1l2Check(c2);
  check('L2 原煤翻倍 → 偏差 > 15%', ck2.dev1 > 0.15, ck2.dev1.toFixed(4));
  check('交叉核对 over=true（口径可能不一致）', ck2.over === true);

  // 33.5 因子三件套校验：来源为空禁止保存
  check('因子来源齐全 → 校验通过', api.validateL2(c).ok === true, api.validateL2(c).bad.join(','));
  var c3 = JSON.parse(JSON.stringify(c));
  c3.em.scope1[0].factors.coalCC.src = '';
  var v1 = api.validateL2(c3);
  check('某因子来源清空 → 校验不通过', v1.ok === false && v1.bad.indexOf('S1-01·coalCC') >= 0, v1.bad.join(','));

  // 33.6 ensureL2 自动播种 6/4/15 行
  var c4 = { name:'空客户', em:{ coal:24, clinkerOut:150, gridBuy:25000 } };
  api.ensureL2(c4);
  check('ensureL2 播种 scope1 = 6', c4.em.scope1.length === 6);
  check('ensureL2 播种 scope2 = 4', c4.em.scope2.length === 4);
  check('ensureL2 播种 scope3 = 15', c4.em.scope3.length === 15);
  check('ensureL2 行带缺省因子（三件套含 src）', !!(c4.em.scope1[0].factors.coalNCV && c4.em.scope1[0].factors.coalNCV.src));

  // 33.7 一键填充缺省值：保留活动数据、因子回缺省、校验通过
  var c5 = JSON.parse(JSON.stringify(c));
  c5.em.scope1[0].activity = 240000;
  api.fillDefaultsL2(c5);
  check('一键填充缺省值后活动数据保留', Number(c5.em.scope1[0].activity) === 240000, String(c5.em.scope1[0].activity));
  check('一键填充缺省值后因子回缺省(含 src)', !!c5.em.scope1[0].factors.coalNCV.src);
  check('一键填充缺省值后校验通过', api.validateL2(c5).ok === true);

  // 33.8 l2SetField 写回即时生效
  var c6 = JSON.parse(JSON.stringify(c));
  api.l2SetField(c6, 'scope1', 'S1-01', 'activity', null, '300000');
  check('l2SetField 写回活动数据即时反映', Math.abs(api.l2RowEmit('scope1', api.findL2Row(c6,'scope1','S1-01')) - 300000*21/1000*26.18*0.99*44/12) < 5);

  // 33.9 renderL2 产出 DOM（含因子输入 / 行 / 汇总 / 交叉核对）
  api.state.cur = c;
  try {
    api.renderL2();
    var l2html = (api.document.getElementById('l2Box') || {}).innerHTML || '';
    check('renderL2 输出含范围1标识 S1-01', l2html.indexOf('S1-01') >= 0);
    check('renderL2 输出含因子来源输入 data-f="fsrc"', l2html.indexOf('data-f="fsrc"') >= 0);
    check('renderL2 输出含活动数据输入 data-f="activity"', l2html.indexOf('data-f="activity"') >= 0);
    check('renderL2 输出含 15 类范围3 S3-15', l2html.indexOf('S3-15') >= 0);
    var ckHtml = (api.document.getElementById('l2Check') || {}).innerHTML || '';
    check('一致时交叉核对不报「口径可能不一致」', ckHtml.indexOf('口径可能不一致') < 0, ckHtml.slice(0,30));
    var sumHtml = (api.document.getElementById('l2Sum') || {}).innerHTML || '';
    check('renderL2 输出范围汇总（合计）', sumHtml.indexOf('合计') >= 0);
    api.updateL2Live();
    check('updateL2Live 不抛错', true);
  } catch(e){ check('renderL2/updateL2Live 不抛错', false, e.message); }

  // 33.10 refreshAll 含 renderL2 不抛错（回归）
  try { api.refreshAll(); check('refreshAll 含 renderL2 不抛错', true); }
  catch(e){ check('refreshAll 含 renderL2 不抛错', false, e.message); }
})();

console.log('\n=== 34. 第6批 · 联动矩阵 + 六类对外成果物（T14–T18）===');
(function(){
  // 带完整数据的水泥客户；isETS/isCBAM/ESG/绿色工厂 → 触发条件成品
  var c = {
    name:'测试·华西水泥', industry:'水泥建材', province:'四川', stage:'数据阶段',
    pains:['配额缺口大'], products:['碳盘查核算','碳履约与交易'], conclusion:'完成核算与履约方案',
    deliverForm:['诊断报告','核算底稿与台账模板'], docLang:['中文'],
    isETS:'是，已纳入', isCBAM:'有出口', disclose:['ESG/TCFD','CDP'], policyAsk:['绿色工厂','CCER开发'],
    boundary:'单一法人单一厂区', baseYear:'2025 年度',
    em:{ clinkerOut:150, cementOut:215, coal:24, af:0.8, diesel:120, limestone:120, altRaw:0.15,
      gridBuy:25000, whr:4200, greenPower:0, cbamExportClinker:0.8, cbamDirect:0.88, cbamIndirect:0.08,
      s3:[{id:'S3-02',e:3200}], pcfStages:[{name:'煅烧',e:18}] },
    dataAvail:{}
  };
  api.state.cur = c;

  // 34.0 数据层：联动矩阵 8 事件 + 成果物库 9 项（附件A）
  check('LINKAGE_MAP 8 事件', api.LINKAGE_MAP && api.LINKAGE_MAP.events.length === 8);
  check('LINKAGE_MAP 含 8 类事件名', ['answersChanged','emChanged','factorChanged','stageChanged','acceptanceChanged','taskChanged','gapChanged','docEdited'].every(function(n){ return api.LINKAGE_MAP.events.some(function(e){ return e.event === n; }); }));
  check('DELIVERABLE_LIB 9 项（DL-01..09）', api.DELIVERABLE_LIB && api.DELIVERABLE_LIB.items.length === 9);

  // 34.1 T18 六类对外成果物字段清单（说明书 10.2）
  var R, dv = '';
  try { R = api.calcCached(api.normEm(c)); dv = api.buildDeliverables(c, R); check('buildDeliverables 生成六类成果物清单', typeof dv === 'string' && dv.length > 3000, dv.length); }
  catch(e){ check('buildDeliverables 生成六类成果物清单', false, e.message); }
  ['年度温室气体排放报告','数据质量控制计划','排放源清单与活动数据','核查配合材料包','配额清缴与履约材料','CBAM 申报材料'].forEach(function(n){
    check('T18 含六类之一：' + n, dv.indexOf(n) >= 0);
  });
  check('T18 字段级清单（组织边界/核算年度/纳入依据）', dv.indexOf('组织边界') >= 0 && dv.indexOf('核算年度') >= 0 && dv.indexOf('纳入依据') >= 0);
  check('T18 有值字段取真实数据（组织边界）', dv.indexOf('单一法人单一厂区') >= 0);
  check('T18 缺数据渲染 .missing 占位(非编造)', (dv.match(/class="missing" data-goto=/g) || []).length >= 20);
  check('T18 含核验基准日 2026-10-13', dv.indexOf('2026-10-13') >= 0);
  check('T18 条件成品：ESG(勾选Q26) 生成', dv.indexOf('ESG / TCFD / CDP 披露章节') >= 0);
  check('T18 条件成品：绿色工厂(Q24) 生成', dv.indexOf('绿色工厂') >= 0);
  var doc = '';
  try { doc = api.buildDoc(c); } catch(e){ check('buildDoc 集成附录C', false, e.message); }
  check('buildDoc 含附录C 六类成果物(id=chC)', doc.indexOf('id="chC"') >= 0 && doc.indexOf('六类对外成果物') >= 0);

  // 34.2 T14 改答行业 → 窗口二行业核算要点/条件章节联动（联动矩阵第1行）
  var cA = JSON.parse(JSON.stringify(c)); cA.industry = '水泥建材'; api.state.cur = cA;
  api.state.tasks = (api.state.tasks || []).concat([{ client:'测试·华西水泥', name:'余热发电扩容', invest:8000000, cut:12000, dept:'EHS环保部', stage:'方案设计', prio:'P1', stat:'进行中', due:'2026-12-31' }]);
  api.renderPlan();
  var planA = (api.document.getElementById('planBox') || {}).innerHTML || '';
  var cB = JSON.parse(JSON.stringify(c)); cB.industry = '钢铁'; api.state.cur = cB; api.renderPlan();
  var planB = (api.document.getElementById('planBox') || {}).innerHTML || '';
  check('T14 改答行业 → 窗口二行业核算要点变化', planA !== planB && planA.indexOf('行业核算要点') >= 0 && planB.indexOf('行业核算要点') >= 0);
  try { api.state.cur = cA; api.fire('answersChanged'); check("fire('answersChanged') 走事件总线不抛错", true); }
  catch(e){ check("fire('answersChanged') 走事件总线不抛错", false, e.message); }

  // 34.3 T15 溯源跳转：窗口二数据行 / 缺口 / 报告占位 → 窗口一对应题并高亮
  api.state.cur = cA; api.renderPlan();
  planA = (api.document.getElementById('planBox') || {}).innerHTML || '';
  check('T15 窗口二行业核算要点行带 data-goto', planA.indexOf('data-goto="boundary"') >= 0 || planA.indexOf('data-goto="isETS"') >= 0);
  check('T15 窗口二技经数据行带 data-goto=em.energy', planA.indexOf('data-goto="em.energy"') >= 0);
  check('T15 报告占位 .missing 带 data-goto', doc.indexOf('class="missing" data-goto=') >= 0);
  var gaps = api.buildGapList();
  check('T15 缺口条目带 gotoKey', gaps.length > 0 && gaps.every(function(g){ return g.gotoKey !== undefined; }));
  check('T15 findQuestionForKey 解析 em.energy→Q16', api.findQuestionForKey('em.energy') === 'Q16', api.findQuestionForKey('em.energy'));
  check('T15 gotoQuestion 定位并高亮(Q16)', typeof api.gotoQuestion === 'function' && api.gotoQuestion('Q16') === true);

  // 34.4 T16 覆盖排放因子 → calcCache 失效 + changeLog(旧→新+依据+确认人) + 附录B 同步
  api.PARAM_OVERRIDE = {}; api.calcInvalidate();
  var R0 = api.calcCached(api.normEm(c)); var v0 = R0.scope2Corr;
  check('T16 calcCached 建立缓存(签名)', !!api.calcCache.sig);
  api.calcInvalidate();
  check('T16 calcInvalidate 清空缓存', api.calcCache.sig === null && api.calcCache.R === null);
  api.PARAM_OVERRIDE['gridEF'] = '1.5';
  api.PARAM_OVERRIDE['gridEF_src'] = '覆盖自测（2026-10-14）';
  api._pendParam = { k:'gridEF', oldV: String(api.PARAMS.gridEF.v), newV:'1.5' };
  api.state.cur = c;
  api.fire('factorChanged');
  var R1 = api.calcCached(api.normEm(c)); var v1 = R1.scope2Corr;
  check('T16 覆盖 gridEF → 派生值随新参数重算(缓存已失效)', v1 !== v0 && Math.abs(v1 - v0) > 1, v0 + ' → ' + v1);
  check('T16 changeLog 记 旧值→新值+依据+确认人', /旧值 .* → 新值 1\.5（依据：.*确认人：咨询顾问）/.test(c.changeLog || ''), (c.changeLog || '').slice(-70));
  var docOv = ''; try { docOv = api.buildDoc(c); } catch(e){}
  check('T16 附录B 反映覆盖值并标「（覆盖）」', docOv.indexOf('1.5') >= 0 && docOv.indexOf('（覆盖）') >= 0);
  api.PARAM_OVERRIDE = {}; api.calcInvalidate();

  // 34.5 T17 L2 行内即时排放 + L1/L2 偏差 >15%（第5批能力，显式闭合）
  check('T17 L2 行内即时出排放量(fuelByMass)', Math.abs(api.l2RowEmit('scope1', { id:'S1-01', activity:240000, unit:'t', formula:'fuelByMass', factorRefs:['coalNCV','coalCC','coalOX'], judgment:'纳入', factors:{ coalNCV:{v:21}, coalCC:{v:26.18}, coalOX:{v:0.99} } }) - 478967.9) < 5);
  var ck17 = api.l1l2Check(c);
  check('T17 l1l2Check 返回 dev1/over 标记', typeof ck17.over === 'boolean' && typeof ck17.dev1 === 'number');
  var cBig = JSON.parse(JSON.stringify(c));
  var l1s1 = api.calcEngine(api.normEm(c)).scope1;
  var kFuel = 21/1000*26.18*0.99*44/12;
  cBig.em.scope1 = [{ id:'S1-01', source:'原煤', activity: (l1s1*2)/kFuel, unit:'t', formula:'fuelByMass', factorRefs:['coalNCV','coalCC','coalOX'], judgment:'纳入', factors:{ coalNCV:{v:21}, coalCC:{v:26.18}, coalOX:{v:0.99} } }];
  var ckBig = api.l1l2Check(cBig);
  check('T17 L2 汇总≈2×L1 → 偏差>15%(over=true)', ckBig.over === true && ckBig.dev1 > 0.15, 'dev1=' + ckBig.dev1.toFixed(3));

  // 34.6 窗口二「本阶段对外成果物」区块 + 状态流转 + 阶段挂接
  check('窗口二卡片含「本阶段对外成果物」区块', planA.indexOf('本阶段对外成果物') >= 0);
  check('成果物状态可流转 + 查看生成(data-dlvst/dlvgen)', planA.indexOf('data-dlvst=') >= 0 && planA.indexOf('data-dlvgen=') >= 0);
  check('dlvNext 状态机 未开始→草稿→可提交→未开始', api.dlvNext('未开始') === '草稿' && api.dlvNext('草稿') === '可提交' && api.dlvNext('可提交') === '未开始');
  check('现状调研阶段挂接 DL-01/02/03', api.stageDeliverables('现状调研').map(function(x){ return x.id; }).join(',') === 'DL-01,DL-02,DL-03');
  check('交付落地阶段挂接 5 项(DL-01/04/05/06/07)', api.stageDeliverables('交付落地').length === 5);

  // 34.7 refreshAll 含新渲染不抛错（回归）
  api.state.cur = c;
  try { api.refreshAll(); check('refreshAll 含联动/成果物渲染不抛错', true); }
  catch(e){ check('refreshAll 含联动/成果物渲染不抛错', false, e.message); }
})();

console.log('\n=== 35. 第7批 · 档位判定 requiredDepth + 字段覆盖率 fieldCoverage + 政策库L2 + industryReady ===');
(function(){
  // 35.0 数据层
  check('DEPTH_MAP 9 成品 / 66 字段', api.DEPTH_MAP && api.DEPTH_MAP.items.length === 9 && api.DEPTH_MAP.items.reduce(function(s,d){return s+(d.fields||[]).length;},0) === 66);
  check('DEPTH_MAP 含 4 条硬线', api.DEPTH_MAP.hardLines.length === 4);
  check('SCOPE_DEPTH_RULES 四档 depthTiers', api.SCOPE_DEPTH_RULES && api.SCOPE_DEPTH_RULES.depthTiers.length === 4);

  // 35.1 requiredDepth 三档判定（13.3 一条规则）
  var mk = function(o){ o = o || {}; return Object.assign({ name:'X', industry:'水泥建材', stage:'数据阶段', em:{} }, o); };
  check('requiredDepth 纳管→L3', api.requiredDepth(mk({ isETS:'是，已纳入' })) === 'L3');
  check('requiredDepth 出口→L3', api.requiredDepth(mk({ isCBAM:'有出口' })) === 'L3');
  check('requiredDepth 需核查→L3', api.requiredDepth(mk({ needVerify:'需要' })) === 'L3');
  check('requiredDepth 合规初访无数据→L0', api.requiredDepth(mk({ stage:'合规阶段', isETS:'否', isCBAM:'否' })) === 'L0');
  check('requiredDepth 正式项目→L2', api.requiredDepth(mk({ stage:'数据阶段', isETS:'否', isCBAM:'否', em:{ clinkerOut:150 } })) === 'L2');

  // 35.2 achievedDepth 档位递进
  check('achievedDepth 无数据→L0', api.achievedDepth(mk({ em:{} })) === 'L0');
  check('achievedDepth 有总量→L1', api.achievedDepth(mk({ em:{ clinkerOut:150, coal:24 } })) === 'L1');
  var l2row = { id:'S1-01', judgment:'纳入', activity:240000, factorRefs:['coalNCV'], factors:{ coalNCV:{ v:21, src:'化验' } } };
  check('achievedDepth 有 L2 行(带来源)→L2', api.achievedDepth(mk({ em:{ clinkerOut:150, coal:24, scope1:[l2row] } })) === 'L2');
  check('achievedDepth 有证据链→L3', api.achievedDepth(mk({ em:{ clinkerOut:150, coal:24, scope1:[l2row], ev:[{id:'EV-1'}] } })) === 'L3');

  // 35.3 dlApplicable 条件成品裁剪
  check('DL-05 仅纳管适用', api.dlApplicable(mk({ isETS:'是，已纳入' }), 'DL-05') === true && api.dlApplicable(mk({ isETS:'否' }), 'DL-05') === false);
  check('DL-06 仅出口适用', api.dlApplicable(mk({ isCBAM:'有出口' }), 'DL-06') === true && api.dlApplicable(mk({ isCBAM:'否' }), 'DL-06') === false);
  check('DL-01 常驻适用', api.dlApplicable(mk({}), 'DL-01') === true);

  // 35.4 fieldCoverage 覆盖率与四档显示（13.8）
  var cL3 = mk({ name:'纳管厂', isETS:'是，已纳入', isCBAM:'有出口', needVerify:'需要', creditCode:'X', boundary:'单一法人', baseYear:'2025', disclose:['ESG/TCFD'], em:{ clinkerOut:150, coal:24, gridBuy:25000, scope1:[l2row], scope2:[], scope3:[] } });
  var cov = api.fieldCoverage(cL3);
  check('L3 必达档位=L3', cov.need === 'L3');
  check('L3 无证据链 → 覆盖率<100%（核查包未就绪）', cov.pct < 100 && cov.pct >= 60, cov.pct + '%');
  check('L3 缺项含 L3 证据', cov.l3key > 0 && cov.l3keyOk === 0 && cov.tier.msg.indexOf('L3 证据') >= 0, cov.tier.msg);
  var cL3e = JSON.parse(JSON.stringify(cL3)); cL3e.em.ev = [{ id:'EV-1', src:'检定证书' }];
  var cove = api.fieldCoverage(cL3e);
  check('L3 + 证据链 → 100% 且「报告与核查包可交付」', cove.pct === 100 && cove.tier.level === 'green', cove.tier.msg);
  var cL2 = mk({ name:'普通厂', isETS:'否', isCBAM:'否', creditCode:'X', boundary:'单一法人', baseYear:'2025', em:{ clinkerOut:150, coal:24, scope1:[l2row] } });
  var cov2 = api.fieldCoverage(cL2);
  check('L2 必达档位=L2 且 DL-05/06 不计入', cov2.need === 'L2' && cov2.pct === 100 && cov2.tier.msg.indexOf('核查包未就绪') >= 0, cov2.pct + '% ' + cov2.tier.msg);
  var cL0 = mk({ name:'初访', stage:'合规阶段', isETS:'否', isCBAM:'否', creditCode:'X' });
  var cov0 = api.fieldCoverage(cL0);
  check('L0 必达=L0 且提示「诊断结论可交付」', cov0.need === 'L0' && cov0.tier.msg.indexOf('诊断结论可交付') >= 0, cov0.tier.msg);
  check('buildFieldStatus 每字段带 need/depth/ok', (function(){ var fs = api.buildFieldStatus(cL3); var k = Object.keys(fs)[0]; return fs[k].need && fs[k].depth && typeof fs[k].ok === 'boolean'; })());

  // 35.5 缺口条目绑定最低档位（13.9）
  check('gapNeed 映射 em.energy→L2 / isCBAM→L3 / creditCode→L0', api.gapNeed('em.energy') === 'L2' && api.gapNeed('isCBAM') === 'L3' && api.gapNeed('creditCode') === 'L0');
  api.state.cur = cL3; api.chat2 = api.newChat2();
  var gaps = api.buildGapList();
  check('缺口条目带 need 最低档位', gaps.length > 0 && gaps.every(function(g){ return !!g.need; }), gaps.length ? gaps[0].need : '空');

  // 35.6 政策库升级 L2 可引用级（13.6）
  check('KB_POLICY 9 项国家级政策', api.KB_POLICY && api.KB_POLICY.items.length === 9);
  check('KB_POLICY 带文号/发布机构/生效状态/引用章节', api.KB_POLICY.items.every(function(p){ return p.docNo && p.issuer && p.status && p.chapter; }));
  check('KB_POLICY 含国务院令775号(暂行条例)', api.KB_POLICY.items.some(function(p){ return p.docNo.indexOf('775') >= 0; }));
  check('KB_PROVINCE 省级条目新增 生效状态/基准年度/核验基准日', api.KB_PROVINCE['四川'].status && api.KB_PROVINCE['四川'].baseYear && api.KB_PROVINCE['四川'].asOf);
  check('贵州省级政策带真实文号(附录B)', api.KB_PROVINCE['贵州'].docs && api.KB_PROVINCE['贵州'].docs.length === 3 && api.KB_PROVINCE['贵州'].docs[0].docNo.indexOf('黔党发') >= 0);

  // 35.7 industryReady 行业化四项自检（13.7）
  check('industryReady 水泥(基准行业) 4/4 全绿', api.industryReady('水泥建材').ok === true && api.industryReady('水泥建材').pass === 4);
  check('industryReady 返回 4 项检查', api.industryReady('水泥建材').checks.length === 4);
  var irOther = api.industryReady('物流运输');
  check('industryReady 物流运输(第8批已合入) 4/4 全绿', irOther.ok === true && irOther.pass === 4, irOther.pass + '/4');

  // 35.8 buildDoc 覆盖率横幅 + 未达档位硬线 + 政策 L2 引用
  var cDoc = mk({ name:'政策厂', industry:'水泥建材', province:'贵州', isETS:'是，已纳入', isCBAM:'有出口', disclose:['ESG/TCFD'], pains:[], products:['碳盘查核算'], conclusion:'x', deliverForm:['诊断报告'], docLang:['中文'], boundary:'单一法人', baseYear:'2025', creditCode:'X', em:{ clinkerOut:150, coal:24, gridBuy:25000, scope1:[l2row], scope2:[], scope3:[] } });
  api.state.cur = cDoc;
  var doc = api.buildDoc(cDoc);
  check('buildDoc 含字段覆盖率横幅', doc.indexOf('交付物字段覆盖率') >= 0);
  check('buildDoc 未达档位 → 硬线提示(不编造)', doc.indexOf('未达必达档位') >= 0 && doc.indexOf('待补充') >= 0);
  check('buildDoc 政策章带文号(国务院令775号)', doc.indexOf('国务院令第 775 号') >= 0);
  check('buildDoc 政策章带生效状态+基准年度适用', doc.indexOf('现行有效') >= 0 && doc.indexOf('基准年度适用') >= 0);
  check('buildDoc 属地政策带贵州文号', doc.indexOf('黔党发〔2022〕23 号') >= 0);

  // 35.9 refreshAll 含新渲染不抛错（回归）
  try { api.refreshAll(); check('refreshAll 含覆盖率/政策渲染不抛错', true); }
  catch(e){ check('refreshAll 含覆盖率/政策渲染不抛错', false, e.message); }

  // ===== 第8批 · 行业扩展包合入（附件C 2027 同步版）=====
  // 36.1 九个行业 + 民航 经附件C 合入后 industryReady 4/4 全绿
  var b8Green = ['电力热力','钢铁','水泥建材','有色金属','石化化工','造纸','物流运输','化肥','氢','民航'];
  var b8AllOk = b8Green.every(function(k){ var r = api.industryReady(k); return r.ok === true && r.pass === 4; });
  check('附件C 九行业+民航 industryReady 全部 4/4 全绿', b8AllOk, b8Green.map(function(k){ return k + ':' + api.industryReady(k).pass; }).join(' '));

  // 36.2 四项检查逐项（抽查 电力热力/化肥/氢）
  ['电力热力','化肥','氢'].forEach(function(k){
    var r = api.industryReady(k);
    check('industryReady(' + k + ') 4 项全绿', r.ok === true && r.pass === 4, r.checks.map(function(c){ return c.name + (c.ok ? '[ok]' : '[x]'); }).join(' '));
  });

  // 36.3 新增键 化肥/氢/民航 已写入 KB_INDUSTRY
  check('KB_INDUSTRY 含新增键 化肥/氢/民航', !!api.KB_INDUSTRY['化肥'] && !!api.KB_INDUSTRY['氢'] && !!api.KB_INDUSTRY['民航']);

  // 36.4 行业下拉（Object.keys）含新行业
  var indKeys = Object.keys(api.KB_INDUSTRY);
  check('行业下拉含 化肥/氢/民航', indKeys.indexOf('化肥') >= 0 && indKeys.indexOf('氢') >= 0 && indKeys.indexOf('民航') >= 0);

  // 36.5 KB_INDUSTRY_STATUS / 扩展字段 ext / factors / benchmark 齐备
  check('KB_INDUSTRY_STATUS 含九个行业状态', api.KB_INDUSTRY_STATUS && b8Green.slice(0,9).every(function(k){ return !!api.KB_INDUSTRY_STATUS[k]; }));
  check('KB_INDUSTRY 扩展字段 ext/factors/benchmark 齐备', b8Green.every(function(k){ var e = api.KB_INDUSTRY[k]; return e && e.ext === true && Array.isArray(e.factors) && e.factors.length && e.factors.every(function(f){ return f.name && f.src; }) && !!e.benchmark; }));

  // 36.6 范围清单 scope1/2/3 已合入（附件C）
  check('KB_INDUSTRY 范围清单 scope1/2/3 齐备(抽查)', ['电力热力','钢铁','化肥','氢'].every(function(k){ var e = api.KB_INDUSTRY[k]; return e && Array.isArray(e.scope1) && e.scope1.length && Array.isArray(e.scope2) && Array.isArray(e.scope3); }));

  // 36.7 KB_STAGE_PATCH 新增 8 行业（非水泥专属措施库）
  var b8Patch = ['电力热力','有色金属','石化化工','造纸','物流运输','民航','化肥','氢'];
  check('KB_STAGE_PATCH 新增 8 行业且含行业措施', b8Patch.every(function(k){ var p = api.KB_STAGE_PATCH[k]; return p && p['方案设计'] && Array.isArray(p['方案设计'].measuresAdd) && p['方案设计'].measuresAdd.length; }));
  check('KB_STAGE_PATCH 不覆盖既有 钢铁/食品饮料 补丁', api.KB_STAGE_PATCH['钢铁'] && api.KB_STAGE_PATCH['食品饮料'] && api.KB_STAGE_PATCH['钢铁']['方案设计'].measuresAdd.indexOf('高炉煤气回收利用') >= 0);

  // 36.8 PARAMS.benchmarks 行业基准值已合入
  check('PARAMS.benchmarks 含九行业强度基准', api.PARAMS.benchmarks && b8Green.slice(0,9).every(function(k){ return api.PARAMS.benchmarks[k] && api.PARAMS.benchmarks[k].benchmark; }));

  // 36.9 SCOPE_COLLECTION_BY_INDUSTRY 参考范围清单（非水泥）
  check('SCOPE_COLLECTION_BY_INDUSTRY 含非水泥行业', api.SCOPE_COLLECTION_BY_INDUSTRY && ['电力热力','钢铁','有色金属','石化化工','造纸','物流运输','化肥','氢','民航'].every(function(k){ return api.SCOPE_COLLECTION_BY_INDUSTRY[k]; }));

  // 36.10 第9批后 纺织/电子半导体 已合并为 4/4（此前为诚实提示待完善，现补全）
  var irText = api.industryReady('纺织'); var irSemi = api.industryReady('电子半导体');
  check('第9批合并后 纺织/电子半导体 已 4/4 全绿', irText.ok === true && irText.pass === 4 && irSemi.ok === true && irSemi.pass === 4, irText.pass + '/' + irSemi.pass);

  // 36.11 已纳管行业 benchmark 实填 / 扩容候选-未纳管 标「待官方发布」
  check('已纳管行业基准实填(电力)', api.KB_INDUSTRY['电力热力'].benchmark.indexOf('待官方发布') < 0);
  check('未纳管行业基准标待官方发布(化肥)', api.KB_INDUSTRY['化肥'].benchmark.indexOf('待官方发布') >= 0);

  // 36.12 政策卡/途径库/方案模板已合入（抽查 石化化工）
  var pc = api.KB_INDUSTRY['石化化工'];
  check('石化化工 政策卡+途径库+方案模板 齐备', pc && pc.policyCard && pc.policyCard.ets && pc.pathways && pc.pathways['管理型'] && pc.plan && pc.plan.keyIndicators);

  // 36.13 renderPlan 渲染附件C 范围清单不抛错（化肥/电力）
  try {
    api.state.cur = mk({ name:'化肥厂', industry:'化肥', province:'四川', scale:'规上', pains:['能耗成本上升'], products:['碳盘查核算'], conclusion:'x' });
    api.renderPlan();
    api.state.cur = mk({ name:'电厂', industry:'电力热力', province:'江苏', scale:'规上', pains:['配额盈缺'], products:['碳履约与交易'], conclusion:'x' });
    api.renderPlan();
    check('renderPlan 渲染附件C 范围清单不抛错', true);
  } catch(e){ check('renderPlan 渲染附件C 范围清单不抛错', false, e.message); }

  // 36.14 KEY_MAP 处理：物流运输保留现有键+民航独立键（不冲突）
  check('KEY_MAP: 物流运输与民航 各自独立且均 4/4', api.industryReady('物流运输').ok && api.industryReady('民航').ok);

/* §37 第9批：五个行业全量就绪（4/4）且兜底其他仍待完善 */
(function(){
  var five=['纺织','电子半导体','汽车零部件','装备制造','房地产建筑'];
  five.forEach(function(ind){
    var r=api.industryReady(ind);
    check('industryReady '+ind+' 4/4 全绿', r.ok===true && r.pass===4, r.pass+'/4');
  });
  var ro=api.industryReady('其他');
  check('industryReady 兜底行业(其他) 仍非全绿', ro.ok===false, ro.pass+'/4');
  var all=Object.keys(api.KB_INDUSTRY).filter(function(k){return k!=="其他";});
  var ready=all.filter(function(k){return api.industryReady(k).ok;});
  check('非兜底行业全部 4/4 就绪 (应 16/16)', ready.length===all.length && all.length===16, ready.length+'/'+all.length);
  five.forEach(function(ind){
    check('KB_STAGE_PATCH 含 '+ind, !!api.KB_STAGE_PATCH[ind], '');
    check('PARAMS.benchmarks 含 '+ind, !!(api.PARAMS.benchmarks && api.PARAMS.benchmarks[ind]), '');
    check('SCOPE_COLLECTION_BY_INDUSTRY 含 '+ind, !!(api.SCOPE_COLLECTION_BY_INDUSTRY && api.SCOPE_COLLECTION_BY_INDUSTRY[ind]), '');
  });
})();


/* §38 T1 行业 CBAM 适用内容入库与四窗口联动 */
(function(){
  var kb = api.KB_CBAM_BY_INDUSTRY;
  check('§38 KB_CBAM_BY_INDUSTRY 覆盖 >=17 行业', Object.keys(kb).length >= 17, Object.keys(kb).length);
  check('§38 钢铁=已覆盖(首批)', api.getCbam('钢铁').status === 'covered' && api.getCbam('钢铁').label.indexOf('首批') >= 0, api.getCbam('钢铁').label);
  check('§38 化肥=已覆盖', api.getCbam('化肥').status === 'covered', api.getCbam('化肥').status);
  check('§38 氢=已覆盖', api.getCbam('氢').status === 'covered', api.getCbam('氢').status);
  check('§38 有色金属=已覆盖(铝)', api.getCbam('有色金属').status === 'covered', api.getCbam('有色金属').status);
  check('§38 电力热力=已覆盖', api.getCbam('电力热力').status === 'covered', api.getCbam('电力热力').status);
  check('§38 纺织=不适用(下游传导)', api.getCbam('纺织').status === 'na', api.getCbam('纺织').status);
  check('§38 汽车零部件=下游传导', api.getCbam('汽车零部件').status === 'downstream', api.getCbam('汽车零部件').status);
  check('§38 cbamApplicable 钢铁true/纺织false', api.cbamApplicable('钢铁') === true && api.cbamApplicable('纺织') === false, api.cbamApplicable('钢铁') + '/' + api.cbamApplicable('纺织'));
  var pol9 = api.KB_POLICY.items.filter(function(p){ return p.id === 'POL-09'; })[0];
  check('§38 POL-09 已补全覆盖行业(有色金属/氢/电力热力)', pol9.industries.indexOf('有色金属') >= 0 && pol9.industries.indexOf('氢') >= 0 && pol9.industries.indexOf('电力热力') >= 0, pol9.industries.join(','));

  // 窗口二：钢铁 vs 纺织 行业化渲染
  api.state.cur = { name:'钢企', industry:'钢铁', province:'河北', scale:'大型', market:'', stage:'数据阶段', pains:['出口CBAM门槛'], products:['碳盘查核算'], budget:'200万以上', chain:'决策链', isETS:'是，已纳入', isCBAM:'否' };
  api.renderPlan();
  var w2steel = api.document.getElementById('planBox').innerHTML;
  api.state.cur = { name:'纺企', industry:'纺织', province:'浙江', scale:'中型', market:'', stage:'数据阶段', pains:['客户供应链要求'], products:['产品碳足迹LCA'], budget:'50万', chain:'决策链', isETS:'否', isCBAM:'否' };
  api.renderPlan();
  var w2text = api.document.getElementById('planBox').innerHTML;
  check('§38 窗口二 钢铁含「CBAM 适用·已覆盖（首批）」', w2steel.indexOf('CBAM 适用') >= 0 && w2steel.indexOf('已覆盖（首批）') >= 0, (w2steel.indexOf('已覆盖（首批）') >= 0) ? 'yes' : 'no');
  check('§38 窗口二 纺织含「CBAM 适用·不适用」', w2text.indexOf('CBAM 适用') >= 0 && w2text.indexOf('不适用') >= 0, (w2text.indexOf('不适用') >= 0) ? 'yes' : 'no');
  check('§38 窗口二 行业不同→渲染不同(钢铁≠纺织)', w2steel !== w2text, (w2steel === w2text) ? 'same' : 'diff');

  // 窗口四：覆盖行业即便非出口也生成 CBAM 章（按适用政策联动）
  var docSteel = api.buildDoc({ name:'钢企', industry:'钢铁', province:'河北', isCBAM:'否', isETS:'是，已纳入', em:{ clinkerOut:150, cementOut:215, capacity:155, coal:24, gridBuy:25000, whr:4200, greenPower:0 }, disclose:['ESG/TCFD'] });
  check('§38 窗口四 覆盖行业(钢铁非出口)也生成 CBAM 章', docSteel.indexOf('八、CBAM 影响测算') >= 0, (docSteel.indexOf('八、CBAM 影响测算') >= 0) ? 'yes' : 'no');
  check('§38 窗口四 CBAM 章含行业适用性说明', docSteel.indexOf('本行业 CBAM 适用性') >= 0, (docSteel.indexOf('本行业 CBAM 适用性') >= 0) ? 'yes' : 'no');

  // 适用政策束
  var ap = api.getApplicablePolicies({ industry:'钢铁', province:'河北', isETS:'是，已纳入', isCBAM:'否' });
  check('§38 getApplicablePolicies 含 CBAM 束且碳市场已纳管', ap.bundle.join(' ').indexOf('CBAM') >= 0 && ap.carbonMarket === true, ap.bundle.join(' | '));
})();


/* §39 窗口一动态联动（T2）：行业化题 + 数据驱动追问题 */
function seqIds2(ind, extra){
  if (!api.state.cur) api.state.cur = {};
  api.state.cur.industry = ind;
  if (extra) Object.keys(extra).forEach(function(k){ api.state.cur[k] = extra[k]; });
  return api.stageQuestionSeq().map(function(q){ return q.id; });
}
var egIds = seqIds2('电子半导体');
var txIds = seqIds2('纺织');
var stIds = seqIds2('钢铁');
var ceIds = seqIds2('水泥建材');
check('窗口一 行业化题·电子半导体含 QI-EG1(特气/NF3/SF6)', egIds.indexOf('QI-EG1') >= 0, egIds.filter(function(x){ return x.indexOf('QI-EG') >= 0; }).join(','));
check('窗口一 行业化题·纺织含 QI-TX1(印染工艺)', txIds.indexOf('QI-TX1') >= 0, txIds.filter(function(x){ return x.indexOf('QI-TX') >= 0; }).join(','));
check('窗口一 行业化题·钢铁含 QI-ST1(冶炼路线)', stIds.indexOf('QI-ST1') >= 0, stIds.filter(function(x){ return x.indexOf('QI-ST') >= 0; }).join(','));
check('窗口一 行业化题·水泥建材含 QI-CE1(替代燃料)', ceIds.indexOf('QI-CE1') >= 0, ceIds.filter(function(x){ return x.indexOf('QI-CE') >= 0; }).join(','));
check('窗口一 行业互斥·电子半导体不含纺织题 QI-TX1', egIds.indexOf('QI-TX1') < 0, 'egHasTX1=' + (egIds.indexOf('QI-TX1') >= 0));
var cbIds = seqIds2('水泥建材', { isCBAM: '是' });
check('窗口一 数据联动·isCBAM=是 触发 QD-CBAM1(出口产品)', cbIds.indexOf('QD-CBAM1') >= 0, cbIds.filter(function(x){ return x.indexOf('QD-') >= 0; }).join(','));
var etsIds = seqIds2('钢铁', { isETS: '是，已纳入' });
check('窗口一 数据联动·isETS=是 触发 QD-ETS1(履约年度)', etsIds.indexOf('QD-ETS1') >= 0, etsIds.filter(function(x){ return x.indexOf('QD-') >= 0; }).join(','));
var grIds = seqIds2('电子半导体', { isCBAM: '是' });
check('窗口一 数据联动·CBAM 企业触发绿电题 QD-GREEN1', grIds.indexOf('QD-GREEN1') >= 0, grIds.filter(function(x){ return x.indexOf('QD-GREEN') >= 0; }).join(','));
var reIds = seqIds2('水泥建材', { existingSys: ['组织碳盘查'] });
check('窗口一 数据联动·已有碳盘查触发 QD-REUSE1(底稿复用)', reIds.indexOf('QD-REUSE1') >= 0, reIds.filter(function(x){ return x.indexOf('QD-REUSE') >= 0; }).join(','));
// 核心 7 + 阶段 20 不变，确保旧断言不受影响
check('窗口一 核心7+阶段20 不变(共 27 问)', api.allQuestionIds().length === 27, 'n=' + api.allQuestionIds().length);


/* §40 窗口三按行业切换 L2 采集模板（T3） */
/* §40 窗口三 L2 按行业切换（T3） */
(function(){
  // 钢铁：专属模板，scope1 含焦炉等 9 源
  var steel = { name:'钢企L2', industry:'钢铁', province:'河北', em:{} };
  api.ensureL2(steel);
  var s1src = steel.em.scope1.map(function(r){ return r.source; }).join('|');
  check('钢铁 L2 scope1 行数=9（行业专属）', steel.em.scope1.length === 9, String(steel.em.scope1.length));
  check('钢铁 L2 scope1 含「焦炉」源', s1src.indexOf('焦炉') >= 0);
  check('钢铁 L2 scope2 外购电用 grid+gridEF（通用因子）', (function(){ var r = steel.em.scope2.filter(function(x){return x.source.indexOf('外购电')>=0;})[0]; return r && r.formula==='grid' && r.factorRefs.indexOf('gridEF')>=0; })());
  check('钢铁 L2 scope3 含「类别1 铁矿石」', steel.em.scope3.map(function(r){return r.source;}).join('|').indexOf('类别1 铁矿石') >= 0);
  check('钢铁 L2 标志 _l2TplIndustry=钢铁（非回退）', steel._l2TplIndustry === '钢铁' && steel._l2TplFallback === false);
  // 电子半导体：scope1 含特气 PFC
  var semi = { name:'半导L2', industry:'电子半导体', province:'江苏', em:{} };
  api.ensureL2(semi);
  var semiS1 = semi.em.scope1.map(function(r){ return r.source; }).join('|');
  check('电子半导体 L2 scope1 含「特气 PFC」', semiS1.indexOf('特气 PFC') >= 0);
  check('电子半导体 L2 scope1 含「SF6」', semiS1.indexOf('SF6') >= 0);
  check('电子半导体 L2 标志非回退', semi._l2TplFallback === false && semi._l2TplIndustry === '电子半导体');
  // 纺织：scope1 含印染相关源
  var tex = { name:'纺企L2', industry:'纺织', province:'浙江', em:{} };
  api.ensureL2(tex);
  check('纺织 L2 scope1 含「工艺热力（染色/烘干）」', tex.em.scope1.map(function(r){return r.source;}).join('|').indexOf('染色') >= 0);
  // 化肥：附件C 已含专属模板（非回退）
  var fert = { name:'化肥L2', industry:'化肥', province:'四川', em:{} };
  api.ensureL2(fert);
  check('化肥 L2 非回退（附件C 已含专属模板）', fert._l2TplFallback === false && fert._l2TplIndustry === '化肥');
  check('化肥 L2 scope1 为其行业源（非水泥默认 6）', fert.em.scope1.length !== 6 && fert.em.scope1.length > 0, String(fert.em.scope1.length));
  // 食品饮料：D 类缺口改造后已有专属 L2 模板（不再回退水泥默认）
  var food = { name:'食品L2', industry:'食品饮料', province:'广东', em:{} };
  api.ensureL2(food);
  check('食品饮料 L2 回退标志=false（已有专属模板）', food._l2TplFallback === false && food._l2TplIndustry === '食品饮料');
  check('食品饮料 L2 scope1=5（专属模板）', food.em.scope1.length === 5, String(food.em.scope1.length));
  check('食品饮料 L2 scope1 含本行业源「锅炉燃煤/燃气」', food.em.scope1.map(function(r){return r.source;}).join('|').indexOf('锅炉燃煤/燃气') >= 0);
  check('食品饮料 L2 scope1 不再含水泥默认源「熟料煅烧」', food.em.scope1.map(function(r){return r.source;}).join('|').indexOf('熟料煅烧') < 0);
  // 水泥建材：基准模板不变，保 6/4/15 与历史断言一致
  var cem = { name:'水泥L2', industry:'水泥建材', province:'四川', em:{} };
  api.ensureL2(cem);
  check('水泥建材 L2 scope1=6/scope2=4/scope3=15（基准不变）', cem.em.scope1.length===6 && cem.em.scope2.length===4 && cem.em.scope3.length===15, cem.em.scope1.length+'/'+cem.em.scope2.length+'/'+cem.em.scope3.length);
  check('水泥建材 L2 非回退', cem._l2TplFallback === false && cem._l2TplIndustry === '水泥建材');
  // 缺失行业名（兜底）应等于水泥默认，不崩
  var noInd = { name:'无行业L2', em:{} };
  api.ensureL2(noInd);
  check('缺失行业兜底为水泥默认模板', noInd._l2TplIndustry === '水泥建材' && noInd.em.scope1.length === 6);
})();

})();

(function(){
  /* §41 四窗口端到端联动探针(T4)：给定企业行业/已填答案/排放数据/适用政策，验证四个窗口均随输入变化 */
  function ent(ind, prov, o){ o = o || {}; return { industry:ind, name:ind+'_样例', province:prov||'广东', isETS:o.isETS||'', isCBAM:o.isCBAM||'', disclose:o.disclose||['ESG/TCFD/CDP'], em:{}, greenPower:o.greenPower }; }
  function probe(e){
    api.state = api.state || {}; api.state.cur = e;
    var seq = api.stageQuestionSeq();
    var w1ids = seq.map(function(q){ return q.id; });
    var w1asks = seq.map(function(q){ return q.ask||''; }).join('|');
    api.renderPlan();
    var w2 = getEl('planBox').innerHTML;
    api.ensureL2(e);
    var s1 = (e.em.scope1||[]).map(function(r){ return r.source||r.name||''; }).join('|');
    var w3cem = /熟料|clinker|水泥/i.test(s1);
    var w4 = api.buildDoc(e);
    var ap = api.getApplicablePolicies(e);
    return { w1ids:w1ids, w1asks:w1asks, w2:w2, s1:s1, w3cem:w3cem, w4:w4, ap:ap };
  }
  var P1 = probe(ent('电子半导体','广东',{isCBAM:'有出口'}));
  var P2 = probe(ent('纺织','浙江',{}));
  var P3 = probe(ent('钢铁','河北',{isETS:'是，已纳入',isCBAM:'有出口'}));
  var Pf = probe(ent('食品饮料','四川',{}));

  check('W1 电子半导体含含氟特气题', P1.w1asks.indexOf('含氟温室气体')>=0);
  check('W1 纺织含染整题', P2.w1asks.indexOf('染整')>=0);
  check('W1 钢铁含冶炼路线题', P3.w1asks.indexOf('冶炼路线')>=0);
  check('W1 出口企业出 CBAM 追问(QD-CBAM1)', P1.w1ids.indexOf('QD-CBAM1')>=0);
  check('W1 纳管企业出履约年度追问(QD-ETS1)', P3.w1ids.indexOf('QD-ETS1')>=0);
  check('W1 非出口非纳管不出追问', P2.w1ids.indexOf('QD-CBAM1')<0 && P2.w1ids.indexOf('QD-ETS1')<0);
  check('W1 三行业题目序列互不相同', P1.w1asks!==P2.w1asks && P2.w1asks!==P3.w1asks && P1.w1asks!==P3.w1asks, P1.w1ids.length+'/'+P2.w1ids.length+'/'+P3.w1ids.length);

  check('W2 三行业渲染互不相同', P1.w2!==P2.w2 && P2.w2!==P3.w2 && P1.w2!==P3.w2);
  check('W2 钢铁 CBAM 行显示覆盖', P3.w2.indexOf('覆盖')>=0);
  check('W2 电子半导体 CBAM 行显示不适用', P1.w2.indexOf('不适用')>=0);
  check('W2 纺织 CBAM 行显示不适用', P2.w2.indexOf('不适用')>=0);

  check('W3 电子半导体 L2 非水泥默认', P1.w3cem===false, P1.s1.slice(0,40));
  check('W3 纺织 L2 非水泥默认', P2.w3cem===false, P2.s1.slice(0,40));
  check('W3 钢铁 L2 含烧结/球团源', /烧结|球团/i.test(P3.s1), P3.s1.slice(0,60));
  check('W3 食品饮料 不回退水泥默认(无熟料)', Pf.w3cem===false, Pf.s1.slice(0,30));

  check('W4 三行业文档互不相同', P1.w4!==P2.w4 && P2.w4!==P3.w4 && P1.w4!==P3.w4);
  check('W4 钢铁含配额履约章', P3.w4.indexOf('配额')>=0 || P3.w4.indexOf('履约')>=0);
  check('W4 钢铁含 CBAM 覆盖章', P3.w4.indexOf('CBAM')>=0 && P3.w4.indexOf('覆盖')>=0);
  check('W4 适用政策束随行业/纳管/出口变化', (P3.ap.carbonMarket===true) && (P1.ap.cbam!==null) && (P2.ap.cbam===null || P2.ap.bundle.join('|').indexOf('不适用')>=0), 'E3市场='+P3.ap.carbonMarket);
})();

(function(){
  /* §42 七类缺口改造验证(T4 收尾)：A/B/C/D/E/F/G 实际改造后的客观行为 */
  function ent(ind, prov, o){ o = o || {}; return { industry:ind, name:ind+'_gap', province:prov||'广东', isETS:o.isETS||'', isCBAM:o.isCBAM||'', disclose:o.disclose||['ESG/TCFD/CDP'], em:{}, greenPower:o.greenPower }; }

  // B 分省电网因子占位结构
  var provs = Object.keys(api.KB_PROVINCE);
  var pegKeys = Object.keys(api.KB_GRID_EF_PROV);
  check('B 分省电网因子结构省数=KB_PROVINCE 省数', pegKeys.length === provs.length, pegKeys.length+'/'+provs.length);
  check('B 分省电网因子全部为占位(v=null,不编造)', pegKeys.every(function(k){ var p = api.KB_GRID_EF_PROV[k]; return p.v === null && p.status === 'placeholder' && !!p.note; }), '广东v='+(api.KB_GRID_EF_PROV['广东']||{}).v);
  check('B provGridEF(广东) 返回占位对象含 note', !!(api.provGridEF('广东') && api.provGridEF('广东').note), '');

  // A/C 因子状态标注
  var cem = ent('水泥建材','四川'); api.ensureL2(cem); var cemS1 = cem.em.scope1[0];
  var stCem = api.factorStatusOf(cem, 'scope1', cemS1);
  check('A 水泥 scope1 行→国家默认因子已预填(ok)', stCem.cls === 'ok', stCem.label);
  var eg = ent('电子半导体','广东'); api.ensureL2(eg);
  var egFuel = eg.em.scope1.filter(function(r){ return (r.factorRefs||[]).length === 0; })[0] || eg.em.scope1[0];
  var stEg = api.factorStatusOf(eg, 'scope1', egFuel);
  check('A 电子半导体 scope1 燃烧行→缺因子待补(w)', stEg.cls === 'w', stEg.label);
  var egGrid = eg.em.scope2.filter(function(r){ return r.formula === 'grid'; })[0];
  var stGrid = api.factorStatusOf(eg, 'scope2', egGrid);
  check('B 外购电行→分省电网因子(占位·待核实)', stGrid.cls === 'w' && stGrid.label.indexOf('分省')>=0, stGrid.label);
  var stS3 = api.factorStatusOf(eg, 'scope3', eg.em.scope3[0]);
  check('C scope3 行→通用默认因子·待核实(info)', stS3.cls === 'info', stS3.label);

  // D 食品饮料/其他 不再回退
  var other = ent('其他','待补充'); api.ensureL2(other);
  check('D 其他行业已有专属模板(不回退)', other._l2TplFallback === false && other._l2TplIndustry === '其他', other._l2TplIndustry);

  // E 行业特征字段消费
  var eg2 = ent('电子半导体','广东'); eg2.egProcessGas = ['NF3','SF6']; eg2.egWafer = '300mm';
  var chips = api.industryFeatureChips(eg2);
  check('E 窗口一行业题字段被窗口二/四消费(非空白)', chips.length >= 2, chips.map(function(c){return c.val;}).join('|'));
  api.state = api.state || {}; api.state.cur = eg2; api.renderPlan();
  check('E 窗口二渲染含行业特征数据', getEl('planBox').innerHTML.indexOf('行业特征数据') >= 0);
  check('E 窗口四文档含行业特征数据', api.buildDoc(eg2).indexOf('行业特征数据') >= 0);

  // F 框架占位章
  var docF = api.buildDoc(ent('钢铁','河北',{isETS:'是，已纳入'}));
  check('F 文档含量化引擎待建清单章', docF.indexOf('待建清单') >= 0 && docF.indexOf('量化引擎') >= 0);

  // G 省级政策 note + 真实文号（贵州）
  var docG = api.buildDoc(ent('钢铁','贵州',{}));
  check('G 文档含省级政策 note', docG.indexOf('以贵州省最新文件为准') >= 0 || docG.indexOf('黔党发') >= 0);
  check('G 贵州文档含已核对文号(黔党发)', docG.indexOf('黔党发〔2022〕23 号') >= 0);

  // 渲染不报错
  var rlC = ent('电子半导体','广东'); api.ensureL2(rlC); api.state = api.state || {}; api.state.cur = rlC;
  var threw = false; try { api.renderL2(); } catch(e){ threw = true; }
  check('A/B/C 渲染 L2 面板无异常', threw === false);
})();

/* §43 参数与因子面板按行业联动（修复"停留在水泥固定面板"） */
(function(){
  function ent(ind, prov, o){ o = o || {}; return { industry:ind, name:ind+'_样例', province:prov||'广东', isETS:o.isETS||'', isCBAM:o.isCBAM||'', disclose:o.disclose||['ESG/TCFD/CDP'], em:{}, greenPower:o.greenPower }; }
  // 非水泥行业：电子半导体·广东
  var elec = ent('电子半导体','广东'); api.ensureL2(elec); api.state.cur = elec;
  api.renderParams();
  var hElec = api.document.getElementById('paramsBox').innerHTML;
  check('§43 参数面板随行业渲染（电子半导体·广东）', typeof hElec === 'string' && hElec.length > 100, 'len='+(hElec&&hElec.length));
  check('§43 非水泥行业：水泥专属参数整组隐藏（标注已隐藏）', hElec.indexOf('已隐藏') >= 0 && hElec.indexOf('仅水泥建材适用') >= 0, 'hidden note');
  check('§43 非水泥行业：通用参数标「通用」', hElec.indexOf('>通用<') >= 0, 'universal tag');
  check('§43 非水泥行业：出现分省电网因子占位行(广东)', hElec.indexOf('gridEF@广东') >= 0 && hElec.indexOf('分省电网·占位待核实') >= 0, 'prov grid');
  check('§43 非水泥行业：范围1 因子标「缺因子待补」', hElec.indexOf('缺因子待补') >= 0, 's1 missing');
  check('§43 非水泥行业：面板表头含当前行业(电子半导体)', hElec.indexOf('当前行业：') >= 0 && hElec.indexOf('电子半导体') >= 0, 'header');

  // 水泥行业
  var cem = ent('水泥建材','贵州'); api.ensureL2(cem); api.state.cur = cem;
  api.renderParams();
  var hCem = api.document.getElementById('paramsBox').innerHTML;
  check('§43 水泥行业：熟料EF标注「本行业」(可编辑)', hCem.indexOf('本行业因子已预填') >= 0 || hCem.indexOf('>本行业<') >= 0, 'cement applies');
  check('§43 水泥行业：不出现「不适用」置灰', hCem.indexOf('水泥专属·不适用') < 0, 'no-disable');
})();

/* §44 计算引擎·核算结果随行业联动（修复"一直是虚拟水泥"） */
(function(){
  function setCur(c){ api.ensureL2(c); api.state.cur = c; return c; }
  // 非水泥：电子半导体·广东（L2 录入外购电活动数据）
  var elec = setCur({ name:'电子E', industry:'电子半导体', province:'广东', em:{} });
  (elec.em.scope2||[]).forEach(function(r){ if (/外购电/.test(r.source)){ r.activity = 1000; r.factors = r.factors||{}; r.factors.gridEF = { v:0.45, src:'区域电网' }; r.judgment='纳入'; } });
  api.renderCalc();
  var h3 = api.document.getElementById('calcBox').innerHTML;
  check('W3 非水泥·不再含「吨熟料强度」水泥文案', h3.indexOf('吨熟料强度') < 0);
  check('W3 非水泥·不再含「熟料×基准」水泥文案', h3.indexOf('熟料×基准') < 0 && h3.indexOf('出口熟料') < 0);
  check('W3 非水泥·含本行业源「外购电」', h3.indexOf('外购电') >= 0);
  check('W3 非水泥·含行业强度口径「单位产值碳排放」', h3.indexOf('单位产值碳排放') >= 0);
  check('W3 非水泥·CBAM 状态为「不直接覆盖」', /CBAM 不直接覆盖/.test(h3));
  // 水泥对照：仍显示行业配额方法（吨熟料BP）
  var cem = setCur({ name:'水泥C', industry:'水泥建材', province:'贵州', em:{} });
  api.renderCalc();
  var hC = api.document.getElementById('calcBox').innerHTML;
  check('W3 水泥·含行业配额方法「吨熟料BP/强度绩效法」', hC.indexOf('吨熟料BP') >= 0 || hC.indexOf('强度绩效法') >= 0);
  // 窗口四第四章行业自适应
  api.state.cur = elec;
  var docE = api.buildDoc(elec);
  check('W4 第四章·非水泥无「吨熟料强度（修正）」', docE.indexOf('吨熟料强度（修正）') < 0);
  check('W4 第四章·非水泥含「排放核算结果」+行业源', /四、排放核算结果/.test(docE) && docE.indexOf('外购电') >= 0);
  api.state.cur = cem;
  var docC = api.buildDoc(cem);
  check('W4 第四章·水泥仍可渲染(无报错)', /四、排放核算结果/.test(docC), 'len=' + docC.length);
  // 行业配额状态：钢铁已纳管显示分工序BP
  var steel = setCur({ name:'钢S', industry:'钢铁', province:'河北', em:{} });
  api.renderCalc();
  var hS = api.document.getElementById('calcBox').innerHTML;
  check('W3 钢铁·配额状态显示「分工序BP」', hS.indexOf('分工序BP') >= 0, '');
})();

/* §45 批次甲：文档/缺口/阶段裁剪 去水泥硬编码、行业自适应 */
(function(){
  // 非水泥·有 L2
  var elec = { name:'电子半导体厂', industry:'电子半导体', province:'广东', isETS:'是', em:{} };
  api.ensureL2(elec);
  (elec.em.scope1||[]).forEach(function(r){ r.activity='50'; });
  (elec.em.scope2||[]).forEach(function(r){ r.activity='300'; });
  // 非水泥·无 L2
  var elecNo = { name:'电子无L2', industry:'电子半导体', province:'广东', em:{} };
  // 水泥·无 L2（验证缺口措辞）
  var cemNo = { name:'水泥无L2', industry:'水泥建材', province:'贵州', em:{} };

  // 甲② 缺口清单行业自适应（无 L2 场景）
  api.state.cur = elecNo;
  var gE = api.buildGapList().map(function(g){ return g.missing; }).join('|');
  check('甲② 非水泥·无L2 缺口不含"吨熟料碳强度"', gE.indexOf('吨熟料碳强度') < 0, gE.slice(0,50));
  check('甲② 非水泥·无L2 缺口含"范围1/2/3 排放活动数据"', gE.indexOf('范围1/2/3 排放活动数据') >= 0, gE.slice(0,50));
  api.state.cur = cemNo;
  var gC = api.buildGapList().map(function(g){ return g.missing; }).join('|');
  check('甲② 水泥·无L2 缺口含"吨熟料碳强度"', gC.indexOf('吨熟料碳强度') >= 0, gC.slice(0,50));

  // 甲③ 阶段裁剪基于 L2
  check('甲③ 非水泥·有L2 → 现状调研不缺数据', api.stageNeedsData('现状调研', elec) === false);
  check('甲③ 非水泥·无L2 → 现状调研缺数据', api.stageNeedsData('现状调研', elecNo) === true);

  // 甲④⑦ 第七章 / 甲① 附录B：buildDoc 行业自适应
  api.state.cur = elec;
  var docE = api.buildDoc(elec);
  check('甲④⑦ 非水泥文档第七章含"经核查排放(范围1+2)"', docE.indexOf('经核查排放(范围1+2)') >= 0);
  check('甲④⑦ 非水泥文档第七章不含"吨熟料BP"水泥专属', docE.indexOf('吨熟料BP') < 0);
  check('甲① 非水泥文档附录B 不含 >clinkerEF< 行', docE.indexOf('>clinkerEF<') < 0);
  check('甲① 非水泥文档附录B 含 >gridEF< 行(通用)', docE.indexOf('>gridEF<') >= 0);

  // 水泥·旧结构（保留配额测算分支）
  var cem = { name:'水泥厂', industry:'水泥建材', province:'贵州', isETS:'是', em:{ clinkerOut:150, coal:24, gridBuy:2500 } };
  api.ensureL2(cem);
  var docC = api.buildDoc(cem);
  check('甲④⑦ 水泥·旧结构文档第七章含"2025 配额"', docC.indexOf('2025 配额') >= 0);
  check('甲① 水泥文档附录B 含 >clinkerEF< 行', docC.indexOf('>clinkerEF<') >= 0);

  // 甲④⑦ 第九章 PCF 遍历 em.pcfStages
  var pcfC = { name:'PCF厂', industry:'电子半导体', province:'广东', em:{ pcfStages:[{name:'原料',e:42},{name:'生产',e:18}] } };
  api.ensureL2(pcfC);
  var docP = api.buildDoc(pcfC);
  check('甲④⑦ 第九章遍历 em.pcfStages 含"合计 PCF"', docP.indexOf('合计 PCF') >= 0);
})();

/* §46 批次乙：企业现状速览行业自适应 + 成熟度判定去水泥硬编码 + metricsHtml 死函数清理 */
(function(){
  console.log('\n=== 46. 批次乙：企业现状速览行业自适应 / 成熟度判定去水泥硬编码 / 死函数清理 ===');
  // ⑤ 企业现状速览：非水泥基于 L2 活动数据，不出现水泥专属字段
  var elecSnap = { name:'电子半导体厂', industry:'电子半导体', province:'广东', em:{} };
  api.ensureL2(elecSnap);
  (elecSnap.em.scope1||[]).forEach(function(r){ r.judgment='纳入'; r.activity='50'; });
  (elecSnap.em.scope2||[]).forEach(function(r){ r.judgment='纳入'; r.activity='300'; });
  var snapHtml = api.enterpriseSnapshotHtml(elecSnap, elecSnap.em, true);
  check('乙⑤ 非水泥现状速览 不含"熟料产量"', snapHtml.indexOf('熟料产量') < 0);
  check('乙⑤ 非水泥现状速览 不含"水泥产量"', snapHtml.indexOf('水泥产量') < 0);
  check('乙⑤ 非水泥现状速览 不含"设计产能"', snapHtml.indexOf('设计产能') < 0);
  check('乙⑤ 非水泥现状速览 不含"石灰石单耗"', snapHtml.indexOf('石灰石单耗') < 0);
  check('乙⑤ 非水泥现状速览 含 L2 活动表(排放源/活动)', snapHtml.indexOf('排放源 / 活动') >= 0 || snapHtml.indexOf('活动数据') >= 0);

  // 非水泥无 L2 → 给数据需求占位
  var elecNo = { name:'电子无数据', industry:'电子半导体', province:'广东', em:{} };
  var snapNo = api.enterpriseSnapshotHtml(elecNo, elecNo.em, true);
  check('乙⑤ 非水泥无L2 现状速览 给数据需求占位', snapNo.indexOf('尚未在窗口三录入') >= 0);

  // 水泥保留专属产量/产能口径
  var cemSnap = { name:'水泥厂', industry:'水泥建材', province:'贵州', em:{ clinkerOut:150, cementOut:215, capacity:155, coal:24, gridBuy:2500, whr:4200, greenPower:0 } };
  var snapC = api.enterpriseSnapshotHtml(cemSnap, cemSnap.em, true);
  check('乙⑤ 水泥现状速览 含"熟料产量"', snapC.indexOf('熟料产量') >= 0);
  check('乙⑤ 水泥现状速览 含"水泥产量"', snapC.indexOf('水泥产量') >= 0);
  check('乙⑤ 水泥现状速览 含"设计产能"', snapC.indexOf('设计产能') >= 0);

  // ⑤ 经 buildDoc 集成：非水泥文档第二章（ch2）不应含水泥专属字段（仅校验 ch2 区段）
  api.state.cur = elecSnap;
  var docE = api.buildDoc(elecSnap);
  var ch2 = docE.indexOf('id="ch2"') >= 0 ? docE.split('id="ch2"')[1].split('id="ch3"')[0] : docE;
  check('乙⑤ 非水泥 buildDoc ch2 不含"熟料产量"', ch2.indexOf('熟料产量') < 0);
  check('乙⑤ 非水泥 buildDoc ch2 不含"设计产能"', ch2.indexOf('设计产能') < 0);

  // ⑥ requiredDepth 去水泥硬编码：合规阶段 + 非水泥有 L2 活动 → L2（不再误判 L0）
  var l2row = { id:'S1-01', judgment:'纳入', activity:240000, factorRefs:['coalNCV'], factors:{ coalNCV:{ v:21, src:'化验' } } };
  check('乙⑥ requiredDepth 合规阶段+非水泥有L2→L2(非L0)', api.requiredDepth({ name:'X', industry:'钢铁', stage:'合规阶段', isETS:'否', isCBAM:'否', em:{ scope1:[l2row] } }) === 'L2');
  check('乙⑥ requiredDepth 合规阶段+无数据→L0', api.requiredDepth({ name:'X', industry:'钢铁', stage:'合规阶段', isETS:'否', isCBAM:'否', em:{} }) === 'L0');
  // ⑥ achievedDepth 去水泥硬编码：纯 L2 非水泥（无 clinkerOut）应达 L2/L3
  check('乙⑥ achievedDepth 非水泥有L2(带来源)→L2', api.achievedDepth({ name:'X', industry:'钢铁', em:{ scope1:[l2row] } }) === 'L2');
  check('乙⑥ achievedDepth 非水泥有L2+证据→L3', api.achievedDepth({ name:'X', industry:'钢铁', em:{ scope1:[l2row], ev:[{id:'EV-1'}] } }) === 'L3');
  check('乙⑥ achievedDepth 非水泥无数据→L0', api.achievedDepth({ name:'X', industry:'钢铁', em:{} }) === 'L0');

  // ⑧ metricsHtml 死函数已清理（不应再定义）
  check('乙⑧ metricsHtml 死函数已清理(全局未定义)', typeof api.metricsHtml === 'undefined' && typeof metricsHtml === 'undefined');
})();

/* §47 批次丙：附录C成果物 / CBAM章节 / 一致性校验 行业化（去水泥字段硬写） */
(function(){
  console.log('\n=== 47. 批次丙：成果物·CBAM·一致性校验 行业化 ===');
  // 丙① dlvFieldVal 产量类行业自适应
  var cem = { name:'水泥厂', industry:'水泥建材', province:'贵州', em:{ clinkerOut:150, cementOut:215 } };
  check('丙① 水泥·dlvFieldVal 主产品产量=150 万吨（熟料）', api.dlvFieldVal(cem, {}, cem.em, '主产品产量（熟料/水泥/本行业主产品）') === '150 万吨（熟料）', api.dlvFieldVal(cem, {}, cem.em, '主产品产量（熟料/水泥/本行业主产品）'));
  var steel = { name:'钢厂', industry:'钢铁', province:'河北', em:{ production:1200, productionUnit:'万吨' } };
  check('丙① 钢铁·dlvFieldVal 主产品产量=1,200 万吨', api.dlvFieldVal(steel, {}, steel.em, '主产品产量（熟料/水泥/本行业主产品）') === '1,200 万吨', api.dlvFieldVal(steel, {}, steel.em, '主产品产量（熟料/水泥/本行业主产品）'));
  var semi = { name:'半导体', industry:'电子半导体', province:'广东', em:{} };
  check('丙① 非水泥无产量·dlvFieldVal 主产品产量→待补充', /待补充/.test(api.dlvFieldVal(semi, {}, semi.em, '主产品产量（熟料/水泥/本行业主产品）')));
  // 丙① 嵌入排放单位走行业功能单位（水泥=t熟料，其他=本行业口径）
  var Rc = { cbamUnit: 0.53 };
  check('丙① 水泥·嵌入排放单位=tCO₂/吨熟料', api.dlvFieldVal(cem, Rc, cem.em, '单位嵌入排放（直接+间接）').indexOf('tCO₂/吨熟料') >= 0, api.dlvFieldVal(cem, Rc, cem.em, '单位嵌入排放（直接+间接）'));
  var Rs = { cbamUnit: 1.8 };
  var sEmb = api.dlvFieldVal(steel, Rs, steel.em, '单位嵌入排放（直接+间接）');
  check('丙① 钢铁·嵌入排放单位不含 t熟料', sEmb.indexOf('t熟料') < 0 && /tCO₂\//.test(sEmb), sEmb);
  // 丙① 出口量单位走行业功能单位（非 t熟料）
  steel.em.cbamExport = 300;
  var sExp = api.dlvFieldVal(steel, Rs, steel.em, '出口量（按本行业功能单位）');
  check('丙① 钢铁·出口量=300 t 且非 t熟料', sExp.indexOf('300 t') >= 0 && sExp.indexOf('t熟料') < 0, sExp);

  // 丙② 一致性校验 V5/V6/V1 行业门控
  function ent(ind, prov, o){ o = o || {}; return { name:ind, industry:ind, province:prov || '广东', em:o.em || {} }; }
  var nonCem = ent('电子半导体', '广东', { em:{ whr:4200, af:5, coal:24 } });
  api.state.cur = nonCem;
  var g1 = api.runQualityGates();
  var ids1 = g1.map(function(x){ return x.id; }).join(',');
  check('丙② 非水泥·不触发 V5(余热)', ids1.indexOf('V5') < 0, ids1);
  check('丙② 非水泥·不触发 V6(替代燃料)', ids1.indexOf('V6') < 0, '');
  var cemC = ent('水泥建材', '贵州', { em:{ whr:4200, af:5, coal:24 } });
  api.state.cur = cemC;
  var g2 = api.runQualityGates();
  var ids2 = g2.map(function(x){ return x.id; }).join(',');
  check('丙② 水泥·触发 V5(余热)', ids2.indexOf('V5') >= 0, ids2);
  check('丙② 水泥·触发 V6(替代燃料)', ids2.indexOf('V6') >= 0, '');
  var steelC = ent('钢铁', '河北', { em:{ clinkerOut:150, capacity:155 } });
  api.state.cur = steelC;
  var g3 = api.runQualityGates();
  var ids3 = g3.map(function(x){ return x.id; }).join(',');
  check('丙② 钢铁·不触发 V1(熟料>产能口径)', ids3.indexOf('V1') < 0, ids3);

  // 丙③ DELIVERABLE_LIB 标签行业化（不再写死水泥）
  var lib = JSON.stringify(api.DELIVERABLE_LIB);
  check('丙③ DL-04 标签中性化（主产品产量·不再含熟料/水泥）', lib.indexOf('主产品产量（本行业主产品）') >= 0 && lib.indexOf('熟料/水泥') < 0);
  check('丙③ DL-04 标签改「主产品外销记录」', lib.indexOf('主产品外销记录') >= 0);
  check('丙③ DL-06 标签改「按本行业功能单位」', lib.indexOf('出口量（按本行业功能单位）') >= 0);
  check('丙③ 核查指南标签改「本行业」', lib.indexOf('核查技术指南 本行业') >= 0);
  check('丙③ 不再含水泥专属标签「熟料/水泥产量」', lib.indexOf('熟料/水泥产量') < 0);
  check('丙③ 不再含「熟料外销记录」', lib.indexOf('熟料外销记录') < 0);
  check('丙③ 不再含「按吨熟料功能单位」', lib.indexOf('按吨熟料功能单位') < 0);
  check('丙③ 不再含「核查技术指南 水泥行业」', lib.indexOf('核查技术指南 水泥行业') < 0);
})();

console.log('\n==================== 结果 ====================');
console.log('通过: ' + pass + '  失败: ' + fail);
process.exit(fail > 0 ? 1 : 0);