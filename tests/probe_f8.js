// 探针：F8 CBAM/配额参数报告口径警示
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

const c = { name:'F8厂', industry:'水泥建材', province:'四川', isETS:'是，已纳入', isCBAM:'有出口',
  pains:['合规履约压力'], products:['碳盘查核算'], budget:'80-200万', chain:'x',
  em:{ clinkerOut:150, coal:24, diesel:120, af:0, limestone:120, altRaw:0, gridBuy:250, whr:4.2, greenPower:0,
    cbamExportClinker:0.8, cbamDirect:0.88, cbamIndirect:0.08,
    s3:[{id:'S3-01',e:120}], scope1:[], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
const doc = api.buildDoc(c);
check('配额章节注明参数为咨询参考值', doc.indexOf('咨询参考参数，正式测算以最新官方配额分配方案为准') >= 0);
check('CBAM 章节注明碳价汇率为参考值', doc.indexOf('咨询参考值，正式申报以欧盟最新官方行情为准') >= 0);
check('CBAM 抵扣比例保守口径说明保留', doc.indexOf('保守口径') >= 0);
// 非水泥/无旧结构的履约客户 → 配额章节第二分支
const c2 = { name:'F8钢', industry:'钢铁', province:'河北', isETS:'是，已纳入', isCBAM:'否',
  pains:[], products:[], budget:'', chain:'',
  em:{ scope1:[{ id:'S1-01', source:'焦炉煤气', activity:1000, unit:'万Nm³', formula:'fuelGas', factorRefs:[], judgment:'纳入',
    factors:{ gasNCV:{v:110,src:'化验',quality:'实测'}, gasCC:{v:1.2,src:'化验',quality:'实测'}, gasOX:{v:0.99,src:'化验',quality:'实测'} } }], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
const doc2 = api.buildDoc(c2);
check('配额章节未纳管分支同样注明', doc2.indexOf('配额与抵销参数均为咨询参考值') >= 0, doc2.indexOf('配额与抵销参数') >= 0 ? 'found' : 'missing');

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
