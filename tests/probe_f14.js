// 探针：F14 业务口径（DL-01 报送口径 / 规模加权 / 第四章可复算说明）
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

console.log('=== F14a DL-01 报送口径 ===');
const dl = api.DELIVERABLE_LIB.items.find(it => it.id === 'DL-01');
check('DL-01 deadline 标注重点排放单位口径', String(dl.deadline).indexOf('重点排放单位口径') >= 0, dl.deadline);
check('DL-01 deadline 标注非履约客户不适用', String(dl.deadline).indexOf('不适用此法定时限') >= 0, dl.deadline);

console.log('=== F14b 产品线规模加权 ===');
const base = api.matchProducts('数据阶段', ['能耗成本上升'], '钢铁');
check('无规模时不加规模项（默认行为不变）', base.indexOf('碳履约与交易') < 0, JSON.stringify(base));
const big = api.matchProducts('数据阶段', ['能耗成本上升'], '钢铁', '大型企业');
check('大型企业追加履约与ESG', big.indexOf('碳履约与交易') >= 0 && big.indexOf('ESG/TCFD/CDP') >= 0, JSON.stringify(big));
const small = api.matchProducts('数据阶段', ['能耗成本上升'], '钢铁', '小微企业');
check('小微企业追加双碳规划', small.indexOf('双碳规划') >= 0, JSON.stringify(small));
check('去重生效', api.matchProducts('价值阶段', [], '水泥建材', '大型企业').filter(x => x === '碳履约与交易').length === 1,
  JSON.stringify(api.matchProducts('价值阶段', [], '水泥建材', '大型企业')));

console.log('=== F14c 第四章可复算说明 ===');
const c = { name:'复算厂', industry:'钢铁', province:'河北', stage:'数据阶段',
  pains:[], products:[], budget:'', chain:'', em:{
    scope1:[{ id:'S1-01', source:'焦炉煤气', activity:1000, unit:'万Nm³', formula:'fuelGas', factorRefs:[], judgment:'纳入',
      factors:{ gasNCV:{v:110,src:'化验',quality:'实测'}, gasCC:{v:1.2,src:'化验',quality:'实测'}, gasOX:{v:0.99,src:'化验',quality:'实测'} } }],
    scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
const doc = api.buildDoc(c);
check('第四章注明 L2 底稿可复算', doc.indexOf('L2 排放源级底稿') >= 0 && doc.indexOf('逐行复算') >= 0);
check('第四章行级明细表存在（范围1 排放源）', doc.indexOf('范围1 排放源') >= 0 && doc.indexOf('焦炉煤气') >= 0);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
