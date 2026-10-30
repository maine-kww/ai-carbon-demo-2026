// 探针：块1 数据层（删除闭环 / 因子按客户隔离 / 首开示例 / P0排序 / 任务回退）
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

console.log('=== 块1a 任务状态回退 ===');
check('未开始→进行中', api.nextTaskStat('未开始') === '进行中');
check('进行中→已完成', api.nextTaskStat('进行中') === '已完成');
check('已完成→进行中（可回退）', api.nextTaskStat('已完成') === '进行中');

console.log('=== 块1b 首开播种示例 ===');
api.lsStub = lsStub; api.state.customers = []; api.state.tasks = []; api.tombGet().forEach(n => api.tombRemove(n));
check('空环境播种示例', api.maybeSeedDemo() === true && api.state.customers.length === api.demoCustomers().length,
  api.state.customers.length + ' customers');
api.state.customers = []; api.state.tasks = [];
api.tombAdd(['示例X']);
check('清空过示例（墓碑）不再播种', api.maybeSeedDemo() === false);
api.state.customers = []; api.state.tasks = [];
api.lsStub._d[api.LS_CUST + api.DATABASE_ID] = JSON.stringify([{ name:'自建', industry:'其他' }]);
check('已有本地数据不播种', api.maybeSeedDemo() === false);
api.state.customers = []; api.state.tasks = []; delete api.lsStub._d[api.LS_CUST + api.DATABASE_ID]; api.tombGet().forEach(n => api.tombRemove(n));

console.log('=== 块1c 删除客户（连带任务/文档）===');
api.state.customers = [{ name:'删我', industry:'水泥建材', em:{} }, { name:'留我', industry:'钢铁', em:{} }];
api.state.tasks = [{ name:'删我｜任务', client:'删我' }, { name:'留我｜任务', client:'留我' }];
api.state.docHtml = { '删我': '<p>x</p>', '留我': '<p>y</p>' };
api.state.docVer = { '删我': 1, '留我': 2 };
api.state.docEdited = {}; api.state.docStale = {};
api.state.cur = api.state.customers[0];
api.lsStub._d[api.LS_DOC + '删我'] = JSON.stringify([{ v:1, html:'<p>x</p>' }]);
api.lsStub._d[api.LS_DOC + 'draft_删我'] = '<p>x</p>';
let confirmCalls = 0;
api.confirm = function(){ confirmCalls++; return true; };
api.removeCustomer('删我');
check('客户已删', api.state.customers.length === 1 && api.state.customers[0].name === '留我');
check('连带任务已删', api.state.tasks.length === 1 && api.state.tasks[0].client === '留我');
check('文档内存清理', !api.state.docHtml['删我'] && !api.state.docVer['删我']);
check('文档快照/草稿清理', api.lsStub._d[api.LS_DOC + '删我'] === undefined && api.lsStub._d[api.LS_DOC + 'draft_删我'] === undefined);
check('当前客户回落到剩余客户', api.state.cur && api.state.cur.name === '留我');
api.confirm = function(){ return false; };
const before = api.state.customers.length;
api.removeCustomer('留我');
check('拒绝确认不删除', api.state.customers.length === before);

console.log('=== 块1d 删除任务 ===');
api.state.tasks = [{ name:'T1', client:'留我' }, { name:'T2', client:'留我' }];
api.removeTask('T1', '留我');
check('任务已删', api.state.tasks.length === 1 && api.state.tasks[0].name === 'T2');

console.log('=== 块1e 因子覆盖按客户隔离 ===');
const A = { name:'客户A', industry:'水泥建材', paramOverride: { gridEF: '0.6' }, em:{} };
const B = { name:'客户B', industry:'钢铁', em:{} };
api.PARAM_OVERRIDE = {};
api.state.cur = A;
check('A 客户覆盖生效 gridEF=0.6', api.getFac(api.PARAMS, null, 'gridEF') === 0.6, api.getFac(api.PARAMS, null, 'gridEF'));
const gRow = { id:'S2-01', source:'外购电', activity:1000, unit:'MWh', formula:'grid', factorRefs:['gridEF'], judgment:'纳入',
  factors:{ gridEF:{ v:0.45, src:'缺省', quality:'区域平均' } } };
check('A 客户 L2 行级也用 0.6（600）', Math.abs(api.rowEmit('scope2', gRow) - 600) < 1e-9, api.rowEmit('scope2', gRow));
api.state.cur = B;
check('B 客户不受 A 覆盖影响（0.45）', api.getFac(api.PARAMS, null, 'gridEF') === 0.45, api.getFac(api.PARAMS, null, 'gridEF'));
check('B 客户 L2 行级 450', Math.abs(api.rowEmit('scope2', gRow) - 450) < 1e-9, api.rowEmit('scope2', gRow));
api.state.cur = A;
const DA = api.normEm({ em:{ clinkerOut:150, coal:24, diesel:100, af:0, limestone:100, altRaw:0, gridBuy:100, whr:0, greenPower:0 } });
check('A 客户 calcEngine scope2 = 600（0.6）', Math.abs(api.calcEngine(DA).scope2Mkt - 600) < 1, api.calcEngine(DA).scope2Mkt);
api.state.cur = B;
check('B 客户 calcEngine scope2 = 450（0.45）', Math.abs(api.calcEngine(DA).scope2Mkt - 450) < 1, api.calcEngine(DA).scope2Mkt);
// 客户级覆盖持久化：saveCustomer → 序列化含 paramOverride
api.state.cur = A;
api.localSaveCustomer(A);
const serialized = api.serializeEm(A);
check('客户级覆盖随档案序列化', serialized.indexOf('paramOverride') >= 0 && serialized.indexOf('0.6') >= 0, serialized.slice(0, 120));

console.log('=== 块1f 今日待办 P0 优先 ===');
api.state.tasks = [
  { name:'P1晚', client:'x', prio:'P1', due:'2026-10-30', stat:'进行中' },
  { name:'P0早', client:'x', prio:'P0', due:'2026-10-30', stat:'进行中' },
  { name:'P2超', client:'x', prio:'P2', due:'2026-10-29', stat:'未开始' }
];
const tl = api.todayTasks();
check('P0 排最前', tl.length === 3 && tl[0].name === 'P0早', tl.map(t => t.name).join(','));
check('P1 次之', tl[1].name === 'P1晚', tl.map(t => t.name).join(','));
check('P2 逾期仍在最后（优先级优先于日期）', tl[2].name === 'P2超', tl.map(t => t.name).join(','));

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
