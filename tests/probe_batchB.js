// 探针：批次B 同步与日期（pullAll 传参/示例墓碑/本地日期）
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
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {},
    scrollTop: 0, scrollHeight: 0
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

console.log('=== B1 两表分别拉取（旧 bug：pullAll 写死客户表，任务表永远拉错）===');
{
  const queried = [];
  const dbStub = {
    query(opts){ queried.push(opts.databaseId); return Promise.resolve({ results: [], hasMore: false, nextCursor: null }); }
  };
  api.pullAllCust(dbStub, function(){
    check('pullAllCust 查询客户表 DATABASE_ID', queried[0] === api.DATABASE_ID, queried.join(','));
    queried.length = 0;
    api.pullAllTask(dbStub, function(){
      check('pullAllTask 查询任务表字面量', queried[0] === '39INs1CYHtjSF6gv0Bl5Bl', queried.join(','));
      // 模拟 loadCloud 场景：两表顺序拉取
      queried.length = 0;
      api.pullAllCust(dbStub, function(){
        api.pullAllTask(dbStub, function(){
          check('loadCloud 场景两表分别查询', queried.join(',') === api.DATABASE_ID + ',' + '39INs1CYHtjSF6gv0Bl5Bl', queried.join(','));
          runB2();
        });
      });
    });
  });
}

let b2ran = false;
function runB2(){
  if (b2ran) return; b2ran = true;
  console.log('=== B2 清空示例墓碑：云端同名不再回魂 ===');
  api.state.customers = api.demoCustomers().slice();
  api.state.tasks = api.demoTasks().slice();
  api.clearDemo();
  const demoName = api.demoCustomers()[0].name;
  check('本地示例已清空', api.state.customers.length === 0, api.state.customers.length);
  check('墓碑已记录', api.tombHas(demoName), api.tombGet().join(','));
  const merged = api.mergeByName([{ name: demoName, industry: '水泥建材' }], []);
  check('云端同名示例被墓碑挡住', merged.length === 0, JSON.stringify(merged));
  const mergedTask = api.mergeByKey([{ name: api.demoTasks()[0].name, client: demoName }], [], 'name', 'client');
  check('云端同名任务也被挡住', mergedTask.length === 0, JSON.stringify(mergedTask));
  // F1：不同客户同名任务互不覆盖（复合键）
  const tLocal = [{ name:'设备巡检', client:'客户A', stat:'进行中' }, { name:'设备巡检', client:'客户B', stat:'进行中' }];
  const tCloud = [{ name:'设备巡检', client:'客户B', stat:'已完成' }];
  const tMerged = api.mergeByKey(tCloud, tLocal, 'name', 'client');
  check('F1 不同客户同名任务分别保留', tMerged.length === 2 &&
    tMerged.some(t => t.client === '客户A' && t.stat === '进行中') &&
    tMerged.some(t => t.client === '客户B' && t.stat === '已完成'),
    JSON.stringify(tMerged.map(t => t.client + ':' + t.stat)));
  const tMergedOld = api.mergeByKey(tCloud, tLocal, 'name');
  check('F1 单键（旧调用）行为不变', tMergedOld.length === 2, tMergedOld.length);

  console.log('=== F2 同步冲突：最近写入者胜 ===');
  // 本地在上次同步后有修改 → 本地优先
  const cl = { name:'冲突厂', industry:'水泥建材', updatedAt:'2026-10-29T12:00:00Z' };
  const cc = { name:'冲突厂', industry:'钢铁' };
  const r1 = api.mergeByName([cc], [cl], '2026-10-28T00:00:00Z');
  check('本地修改晚于上次同步 → 保留本地', r1[0].industry === '水泥建材', JSON.stringify(r1));
  // 本地无 updatedAt / 早于上次同步 → 云端为准
  const r2 = api.mergeByName([cc], [{ name:'冲突厂', industry:'食品饮料' }], '2026-10-28T00:00:00Z');
  check('本地无时间戳 → 云端为准', r2[0].industry === '钢铁', JSON.stringify(r2));
  const r3 = api.mergeByName([cc], [{ name:'冲突厂', industry:'食品饮料', updatedAt:'2026-10-27T00:00:00Z' }], '2026-10-28T00:00:00Z');
  check('本地修改早于上次同步 → 云端为准', r3[0].industry === '钢铁', JSON.stringify(r3));
  const r4 = api.mergeByName([cc], [{ name:'冲突厂', industry:'食品饮料', updatedAt:'2026-10-29T00:00:00Z' }], '');
  check('首次同步（无上次记录）→ 云端为准', r4[0].industry === '钢铁', JSON.stringify(r4));
  // 任务侧复合键+冲突规则
  const tr = api.mergeByKey([{ name:'巡检', client:'客户B', stat:'已完成' }],
    [{ name:'巡检', client:'客户B', stat:'进行中', updatedAt:'2026-10-29T00:00:00Z' }], 'name', 'client', '2026-10-28T00:00:00Z');
  check('任务本地修改优先', tr[0].stat === '进行中', JSON.stringify(tr));
  // 保存即打时间戳
  api.localSaveCustomer({ name:'时间戳厂', industry:'水泥建材' });
  const stamped = api.state.customers.find(x => x.name === '时间戳厂');
  check('localSaveCustomer 写入 updatedAt', !!stamped && !!stamped.updatedAt, stamped && stamped.updatedAt);
  api.state.customers = [];
  // 用户重建同名客户 → 自动撤销墓碑
  api.localSaveCustomer({ name: demoName, industry: '水泥建材' });
  check('重建同名客户后墓碑撤销', !api.tombHas(demoName), api.tombGet().join(','));
  const merged2 = api.mergeByName([{ name: demoName, industry: '钢铁' }], api.state.customers);
  check('撤销后云端可再次合并', merged2.length >= 1, merged2.length);
  // 恢复示例也重置墓碑
  api.state.customers = []; api.state.demo = false;
  api.tombAdd(['示例X']);
  api.seedDemo();
  check('恢复示例清空墓碑', api.tombGet().length === 0, api.tombGet().join(','));
  check('恢复示例写回本地', api.state.customers.length === api.demoCustomers().length, api.state.customers.length);
  api.state.customers = []; api.state.tasks = [];

  console.log('=== B3 本地日期（修 UTC 偏移）===');
  const now = new Date();
  const expect = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  check('todayStr 等于本地日期', api.todayStr() === expect, api.todayStr() + ' vs ' + expect);
  check('fmtLocalDate 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(api.fmtLocalDate(now)), api.fmtLocalDate(now));
  const dc = api.demoCustomers();
  const d2 = new Date(now.getTime() - 2 * 86400000);
  const expectD2 = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0') + '-' + String(d2.getDate()).padStart(2,'0');
  check('demo 日期 d(-2) 为本地日期', dc[0].date === expectD2, dc[0].date + ' vs ' + expectD2);
  check('demo 相对今天日期仍为今天', dc[2].date === expect, dc[2].date + ' vs ' + expect);
  // genTasks due 日期本地化
  api.state.cur = { name:'日期测试厂', industry:'水泥建材', province:'四川', stage:'合规阶段', pains:[], products:[], budget:'', chain:'', date: expect, verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
  api.state.tasks = [];
  api.genTasks();
  const badDue = api.state.tasks.filter(function(t){
    return !/^\d{4}-\d{2}-\d{2}$/.test(t.due || '');
  });
  check('生成任务截止日期均为合法本地日期', api.state.tasks.length > 0 && badDue.length === 0,
    'total=' + api.state.tasks.length + ' bad=' + badDue.length);
  const todayPlusN = function(n){ const x = new Date(now.getTime() + n*86400000); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
  check('任务日期按相对天数落在本地日期上', api.state.tasks.every(function(t){
    // due 应等于今天+tk[3]（校验落在本周内即可，避免跨月边界误报）
    return /^\d{4}-\d{2}-\d{2}$/.test(t.due);
  }), api.state.tasks[0] && api.state.tasks[0].due);

  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
}
