// 探针：F5 行业缺因子录入入口闭环
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
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
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

console.log('=== F5 行业缺因子录入入口 ===');
const cSteel = { name:'钢厂F5', industry:'钢铁', province:'河北', em:{} };
api.ensureL2(cSteel);
const gasRow = cSteel.em.scope1.find(r => r.formula === 'fuelGas');
const procRow = cSteel.em.scope1.find(r => r.formula === 'process');
const coalRow = cSteel.em.scope1.find(r => r.formula === 'fuelByMass');
check('钢铁模板有 fuelGas / process / fuelByMass 行', !!gasRow && !!procRow && !!coalRow,
  cSteel.em.scope1.map(r => r.formula).join(','));

// 渲染层：缺因子行给出手动补因子区
let rowHtml = api.l2RenderRow(cSteel, 'scope1', gasRow);
check('气态行渲染含手动补入区', rowHtml.indexOf('手动补入') >= 0 && rowHtml.indexOf('gasNCV') >= 0, rowHtml.slice(0, 200));
rowHtml = api.l2RenderRow(cSteel, 'scope1', procRow);
check('过程行渲染含 processEF 手动输入', rowHtml.indexOf('processEF') >= 0, rowHtml.slice(0, 200));
const zeroRow = { id:'S2-03', source:'绿电', unit:'MWh', formula:'zero', judgment:'纳入', factorRefs:[], factors:{} };
rowHtml = api.l2RenderRow(cSteel, 'scope2', zeroRow);
check('zero 行（绿电）不出现手动补因子区', rowHtml.indexOf('手动补入') < 0);

// 未补因子：0 且校验拦截
gasRow.activity = 1000;
check('未补因子时气态行排放 0', api.l2RowEmit('scope1', gasRow) === 0, api.l2RowEmit('scope1', gasRow));
check('未补因子时校验仍报缺因子', api.validateL2(cSteel).bad.some(x => String(x).indexOf('缺因子') >= 0));

// 补因子（走 l2SetField 语义：取值+来源+质量，custom 标记）
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fv', 'gasNCV', '110');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fsrc', 'gasNCV', '焦炉煤气化验报告2026-05');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fq', 'gasNCV', '实测');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fv', 'gasCC', '1.2');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fsrc', 'gasCC', '化验报告2026-05');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fq', 'gasCC', '实测');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fv', 'gasOX', '0.99');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fsrc', 'gasOX', '化验报告2026-05');
api.l2SetField(cSteel, 'scope1', gasRow.id, 'fq', 'gasOX', '实测');
const expectE = 1000 * 110/1000 * 1.2 * 0.99 * 44/12;
check('补因子后可计算（a×NCV/1000×CC×OX×44/12）', Math.abs(api.l2RowEmit('scope1', gasRow) - expectE) < 1e-6,
  api.l2RowEmit('scope1', gasRow) + ' vs ' + expectE);
const vAfter = api.validateL2(cSteel);
check('补因子后该行不再报缺因子', !vAfter.bad.some(x => String(x).indexOf(gasRow.id) >= 0), vAfter.bad.join(','));
const st = api.factorStatusOf(cSteel, 'scope1', gasRow);
check('状态徽标变为已手动补因子', st.label === '已手动补因子', st.label);

// process 行：补 processEF 后按行内因子计算（不套水泥熟料因子）
api.l2SetField(cSteel, 'scope1', procRow.id, 'fv', 'processEF', '0.8');
api.l2SetField(cSteel, 'scope1', procRow.id, 'fsrc', 'processEF', '行业核算指南2026');
api.l2SetField(cSteel, 'scope1', procRow.id, 'fq', 'processEF', '国家缺省');
procRow.activity = 500;
check('过程行用 processEF 计算', Math.abs(api.l2RowEmit('scope1', procRow) - 500*0.8) < 1e-6, api.l2RowEmit('scope1', procRow));
check('过程行补因子后不再报缺因子', !api.validateL2(cSteel).bad.some(x => String(x).indexOf(procRow.id) >= 0));

// 水泥模板不受影响：refs 齐全且校验通过
const cCem = { name:'水泥F5', industry:'水泥建材', em:{} };
api.ensureL2(cCem);
check('水泥模板无手动补因子区', !api.l2RenderRow(cCem, 'scope1', cCem.em.scope1[0]).indexOf('手动补入') >= 0);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
