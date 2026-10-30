// 探针：块2 文档层（草稿恢复/版本号/档案编辑/重诊留痕）
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

console.log('=== 块2a 刷新后草稿恢复 ===');
const c = { name:'草稿厂', industry:'水泥建材', province:'四川', stage:'数据阶段',
  pains:[], products:[], budget:'', chain:'', em:{ scope1:[], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
api.state.cur = c;
api.state.docHtml = {}; api.state.docVer = {}; api.state.docLoadedFor = null;
lsStub._d['wb_shuangtan_doc_draft_草稿厂'] = '<h2>人工编辑的草稿</h2><p>未生成过方案书但已编辑</p>';
api.renderDoc();
check('草稿从 localStorage 恢复', getEl('docBody').innerHTML.indexOf('人工编辑的草稿') >= 0, getEl('docBody').innerHTML.slice(0, 80));
check('草稿写回内存 docHtml', api.state.docHtml['草稿厂'] && api.state.docHtml['草稿厂'].indexOf('人工编辑的草稿') >= 0);
// 无草稿时仍回退占位
api.state.docLoadedFor = null; delete lsStub._d['wb_shuangtan_doc_draft_草稿厂']; api.state.docHtml = {};
api.renderDoc();
check('无草稿时显示生成占位', getEl('docBody').innerHTML.indexOf('生成/重建') >= 0);

console.log('=== 块2b 版本号刷新恢复 ===');
lsStub._d['wb_shuangtan_doc_草稿厂'] = JSON.stringify([{ v:1, html:'x' }, { v:3, html:'y' }, { v:2, html:'z' }]);
api.state.docVer = {}; api.state.docLoadedFor = null;
api.renderDoc();
check('docVer 从快照恢复为最大版本 3', api.state.docVer['草稿厂'] === 3, api.state.docVer['草稿厂']);

console.log('=== 块2c 客户档案编辑表单 ===');
api.state.cur = { name:'编辑厂', industry:'钢铁', province:'河北', scale:'中型企业', budget:'80-200万',
  pains:['能耗成本上升'], chain:'EHS→总', em:{ scope1:[], scope2:[], scope3:[] },
  date:'2026-10-13', verifyDate:'2026-10-13', conclusion:'', changeLog:'' };
getEl('clientEditBox').style.display = 'block';
api.renderClientEdit(api.state.cur);
check('行业下拉填充且选中', getEl('ceIndustry').value === '钢铁', getEl('ceIndustry').value);
check('省份下拉选中', getEl('ceProvince').value === '河北', getEl('ceProvince').value);
check('规模/预算回显', getEl('ceScale').value === '中型企业' && getEl('ceBudget').value === '80-200万');
check('痛点回显', getEl('cePains').value === '能耗成本上升', getEl('cePains').value);
// 改值保存
getEl('ceIndustry').value = '有色金属';
getEl('ceProvince').value = '广东';
getEl('ceScale').value = '大型企业';
getEl('ceBudget').value = '200万以上';
getEl('cePains').value = '出口CBAM门槛, 碳资产变现';
getEl('ceChain').value = '外贸副总→总经理';
api.saveClientEdit();
const e = api.state.cur;
check('行业更新', e.industry === '有色金属');
check('省份更新', e.province === '广东');
check('规模更新', e.scale === '大型企业');
check('预算更新', e.budget === '200万以上');
check('痛点解析为数组(限3)', Array.isArray(e.pains) && e.pains.length === 2 && e.pains[1] === '碳资产变现', JSON.stringify(e.pains));
check('决策链更新', e.chain === '外贸副总→总经理');
check('编辑区收起', getEl('clientEditBox').style.display === 'none');

console.log('=== 块2d 重新诊断留痕 ===');
api.state.customers = [];
api.chat.ans = { name:'留痕厂', industry:'水泥建材', province:'四川', scale:'大型企业',
  forceCompliance:true, hasData:true, pains:['合规履约压力'], budget:'80-200万', chain:'x' };
api.chat.step = api.QUESTIONS.length;
api.finishDiagnosis();
const first = api.state.customers[0];
check('首次诊断写入 changeLog', String(first.changeLog).indexOf('诊断完成') >= 0, first.changeLog);
api.chat.ans.scale = '中型企业';
api.finishDiagnosis();
const second = api.state.customers[0];
check('重诊留痕追加（含重新诊断标注）', String(second.changeLog).indexOf('重新诊断') >= 0 && String(second.changeLog).indexOf('诊断完成') >= 0, second.changeLog);
check('重诊后档案唯一（同名覆盖）', api.state.customers.length === 1, api.state.customers.length);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
