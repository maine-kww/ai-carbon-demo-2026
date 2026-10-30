// 探针：批次A 核算正确性（因子回退/分省生效/替代原料口径/非水泥公式/质量标注）
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

console.log('=== A1 getFac：FACTOR_LIB 兜底（范围三/扣减/热力因子不再恒0）===');
check('altRawCF 兜底 0.44', api.getFac(api.PARAMS, null, 'altRawCF') === 0.44, api.getFac(api.PARAMS, null, 'altRawCF'));
check('heatEF 兜底 0.11', api.getFac(api.PARAMS, null, 'heatEF') === 0.11, api.getFac(api.PARAMS, null, 'heatEF'));
check('s3Travel 兜底 320', api.getFac(api.PARAMS, null, 's3Travel') === 320, api.getFac(api.PARAMS, null, 's3Travel'));
check('s3Freight 兜底 0.0001', api.getFac(api.PARAMS, null, 's3Freight') === 0.0001, api.getFac(api.PARAMS, null, 's3Freight'));
check('PARAMS 已有键不被兜底顶掉', api.getFac(api.PARAMS, null, 'ccerPrice') === 60);
check('facSrc 兜底返回库来源', String(api.facSrc(api.PARAMS, null, 's3Travel')).length > 2, api.facSrc(api.PARAMS, null, 's3Travel'));

console.log('=== A2 分省电网因子 gridEFProv 真正生效 ===');
api.PARAM_OVERRIDE.gridEFProv = '0.6';
check('getFac gridEF 取分省值', api.getFac(api.PARAMS, null, 'gridEF') === 0.6, api.getFac(api.PARAMS, null, 'gridEF'));
const gRow = { id:'S2-01', activity:1000, unit:'MWh', formula:'grid', factorRefs:['gridEF'], judgment:'纳入',
  factors:{ gridEF:{ v:0.45, src:'区域缺省', quality:'区域平均' } } };
check('L2 行级电力用分省值（1000×0.6）', Math.abs(api.rowEmit('scope2', gRow) - 600) < 1e-9, api.rowEmit('scope2', gRow));
const D1 = api.normEm({ em:{ clinkerOut:150, coal:24, diesel:100, af:0, limestone:100, altRaw:0, gridBuy:100, whr:0, greenPower:0 } });
const R1 = api.calcEngine(D1);
check('L1 引擎电力用分省值（1000MWh×0.6）', Math.abs(R1.scope2Corr - 600) < 1, R1.scope2Corr);
delete api.PARAM_OVERRIDE.gridEFProv;
check('清空分省值回落缺省 0.45', api.getFac(api.PARAMS, null, 'gridEF') === 0.45, api.getFac(api.PARAMS, null, 'gridEF'));
check('清空后 L2 行回落 0.45', Math.abs(api.rowEmit('scope2', gRow) - 450) < 1e-9, api.rowEmit('scope2', gRow));

console.log('=== A3 面板覆盖 ↔ 行因子同步（custom 行内优先）===');
api.PARAM_OVERRIDE.gridEF = '0.7';
const cSync = { name:'同步厂', industry:'水泥建材', province:'四川',
  em:{ scope1:[], scope2:[ JSON.parse(JSON.stringify(gRow)) ], scope3:[] } };
api.state.customers = [cSync]; api.state.cur = cSync;
api.syncRowFactorsFromOverride();
check('面板覆盖同步到缺省副本', cSync.em.scope2[0].factors.gridEF.v === 0.7, JSON.stringify(cSync.em.scope2[0].factors.gridEF));
check('同步副本带来源说明', String(cSync.em.scope2[0].factors.gridEF.src).indexOf('参数面板覆盖') >= 0, cSync.em.scope2[0].factors.gridEF.src);
cSync.em.scope2[0].factors.gridEF.custom = true;
cSync.em.scope2[0].factors.gridEF.v = 0.55;
api.PARAM_OVERRIDE.gridEF = '0.9';
api.syncRowFactorsFromOverride();
check('行内 custom 编辑不被面板顶掉', cSync.em.scope2[0].factors.gridEF.v === 0.55, cSync.em.scope2[0].factors.gridEF.v);
check('custom 行计算用行内值', Math.abs(api.rowEmit('scope2', cSync.em.scope2[0]) - 550) < 1e-9, api.rowEmit('scope2', cSync.em.scope2[0]));
delete cSync.em.scope2[0].factors.gridEF.custom;
cSync.em.scope2[0].factors.gridEF.v = 0.7; // 回到同步态
api.syncRowFactorsFromOverride(); // 覆盖改0.9
check('非 custom 同步副本可再次跟随面板', cSync.em.scope2[0].factors.gridEF.v === 0.9, cSync.em.scope2[0].factors.gridEF.v);
delete api.PARAM_OVERRIDE.gridEF;
api.syncRowFactorsFromOverride();
check('面板清空后副本还原为库缺省', cSync.em.scope2[0].factors.gridEF.v === 0.45, cSync.em.scope2[0].factors.gridEF.v);
api.state.customers = [];

console.log('=== A4 替代原料扣减：L1×0.44 与 L2 同口径 ===');
const Dalt = api.normEm({ em:{ clinkerOut:150, coal:24, diesel:100, af:0, limestone:100, altRaw:0.15, gridBuy:100, whr:0, greenPower:0 } });
check('normEm altRaw 0.15万t → 1500t 活动数据', Dalt.altRawDeduct === 1500, Dalt.altRawDeduct);
const Ralt = api.calcEngine(Dalt);
const coalPart = 240000 * 21/1000 * 26.18 * 0.99 * 44/12;
const dieselPart = 100 * 42.65/1000 * 74100/1000;
const expectS1 = coalPart + 1500000 * 0.535 - 1500 * 0.44 + dieselPart;
check('L1 scope1 = 燃料+工艺-1500×0.44', Math.abs(Ralt.scope1 - expectS1) < 1, Ralt.scope1 + ' vs ' + expectS1);
const cAltL2 = { name:'扣减厂', industry:'水泥建材',
  em:{
    scope1:[
      { id:'S1-01', source:'原煤', activity:240000, unit:'t', formula:'fuelByMass', factorRefs:['coalNCV','coalCC','coalOX'], judgment:'纳入',
        factors:{ coalNCV:{v:21,src:'缺省',quality:'国家缺省'}, coalCC:{v:26.18,src:'缺省',quality:'国家缺省'}, coalOX:{v:0.99,src:'缺省',quality:'国家缺省'} } },
      { id:'S1-02', source:'柴油', activity:100, unit:'t', formula:'fuelByEF', factorRefs:['dieselNCV','dieselEF'], judgment:'纳入',
        factors:{ dieselNCV:{v:42.65,src:'指南',quality:'国家缺省'}, dieselEF:{v:74100,src:'指南',quality:'国家缺省'} } },
      { id:'S1-03', source:'工艺', activity:1500000, unit:'t', formula:'process', factorRefs:['clinkerEF'], judgment:'纳入',
        factors:{ clinkerEF:{v:0.535,src:'指南',quality:'国家缺省'} } },
      { id:'S1-04', source:'替代原料扣减', activity:1500, unit:'t', formula:'deduct', factorRefs:['altRawCF'], judgment:'纳入',
        factors:{ altRawCF:{v:0.44,src:'指南',quality:'国家缺省'} } }
    ],
    scope2:[], scope3:[]
  },
  em_L1: Dalt
};
const l2s1 = api.l2Sums(cAltL2).s1;
check('L2 scope1 与 L1 同口径（偏差<0.01%）', Math.abs(l2s1 - Ralt.scope1) / Ralt.scope1 < 1e-4, l2s1 + ' vs ' + Ralt.scope1);

console.log('=== A5 非水泥行业：公式分类说明 + 缺因子不代算（仓库诚实契约 refs 全空）===');
const cSteel = { name:'钢厂', industry:'钢铁', province:'河北', em:{} };
api.ensureL2(cSteel);
check('非水泥 scope1 全部 refs 为空（verify_gaps A1 契约）',
  cSteel.em.scope1.every(r => !r.factorRefs || r.factorRefs.length === 0),
  cSteel.em.scope1.map(r => r.source + ':' + JSON.stringify(r.factorRefs)).join(' | '));
const gasRows = cSteel.em.scope1.filter(r => /煤气|天然气|燃气/.test(r.source));
check('钢铁模板存在气态燃料行', gasRows.length > 0, cSteel.em.scope1.map(r=>r.source).join('/'));
if (gasRows.length){
  check('气态行公式为 fuelGas（分类说明）', gasRows[0].formula === 'fuelGas', gasRows[0].formula);
  gasRows[0].activity = 1000;
  check('气态行缺因子 → 排放 0（旧 bug：套柴油公式出错数）', api.rowEmit('scope1', gasRows[0]) === 0, api.rowEmit('scope1', gasRows[0]));
  check('气态行带缺因子提示', String(gasRows[0].note).indexOf('缺因子') >= 0, gasRows[0].note);
}
// 任意非水泥行填活动数据都不能出数（旧 bug 根因：fuelByEF 无条件代算）
const outRows = cSteel.em.scope1.filter(r => ['fuelByMass','fuelByCarbon','fuelByEF','fuelGas','process'].indexOf(r.formula) >= 0);
check('所有计算类非水泥行缺因子时均不出数', outRows.every(r => { r.activity = r.activity || 500; return api.rowEmit('scope1', r) === 0; }),
  outRows.map(r => r.source + ':' + api.rowEmit('scope1', r)).join(' | '));
const vSteel = api.validateL2(cSteel);
check('钢铁模板校验不通过（缺因子被拦截）', vSteel.ok === false, JSON.stringify(vSteel.bad));
check('缺因子以「缺因子」列出', vSteel.bad.some(x => String(x).indexOf('缺因子') >= 0), vSteel.bad.join(','));
// 水泥基准模板不受影响：refs 齐全 → 校验通过
const cCem = { name:'水', industry:'水泥建材', em:{} };
api.ensureL2(cCem);
check('水泥模板 refs 齐全', cCem.em.scope1.every(r => (r.factorRefs||[]).length > 0 || r.formula === 'none'),
  cCem.em.scope1.map(r => r.source + ':' + r.formula).join(' | '));

console.log('=== A6 因子质量标注诚实化 ===');
check('coalNCV 质量为国家缺省（原错标实测）', api.FACTOR_LIB.scope1.coalNCV.quality === '国家缺省', api.FACTOR_LIB.scope1.coalNCV.quality);
check('rdfC 质量为占位待实测（原错标实测）', api.FACTOR_LIB.scope1.rdfC.quality === '占位待实测', api.FACTOR_LIB.scope1.rdfC.quality);
check('rdfC 来源注明虚拟占位', String(api.FACTOR_LIB.scope1.rdfC.source).indexOf('虚拟占位') >= 0);
check('质量枚举含占位待实测', api.SCOPE_COLLECTION.qualityLevels.indexOf('占位待实测') >= 0, JSON.stringify(api.SCOPE_COLLECTION.qualityLevels));
check('PARAMS coalNCV 来源不再写「实测/缺省值」二义', String(api.PARAMS.coalNCV.src).indexOf('缺省值') >= 0 && String(api.PARAMS.coalNCV.src).indexOf('实测/') < 0, api.PARAMS.coalNCV.src);

console.log('=== A7 自检夹具新口径 ===');
const st = api.runCalcSelfTest();
check('计算引擎自检严格项全部通过', st.fail === 0, 'pass=' + st.pass + ' fail=' + st.fail + '/' + st.total);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
