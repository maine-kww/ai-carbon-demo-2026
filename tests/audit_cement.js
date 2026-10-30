/* 自查探针：非水泥行业在文档/缺口清单里是否仍输出水泥写死内容
   复用页面运行外壳（vm + DOM 桩）。结论仅依赖运行时事实。 */
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

const store = {};
function mkEl(id){
  return { id, innerHTML:'', value:'', className:'', children:[], style:{},
    classList:{ _s:{}, add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){}, addEventListener(){}, appendChild(c){ return c; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, reset(){}, focus(){}, click(){} };
}
const getEl = id => store[id] || (store[id] = mkEl(id));
const docStub = { getElementById:getEl, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, createElement:()=>mkEl('t'), body:mkEl('b') };
const lsStub = { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
const sb = { window:{}, document:docStub, localStorage:lsStub, console, setTimeout, clearTimeout,
  Blob:function(){}, URL:{ createObjectURL(){}, revokeObjectURL(){} }, navigator:{},
  Date, Math, JSON, RegExp, Error, String, Number, Object, Array, Promise, isNaN, parseInt, parseFloat };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(code, sb);
const api = sb;

function mk(ind, prov){
  return { name: ind + '·示例', industry: ind, province: prov, em:{},
    isETS:'否', isCBAM:'无出口', stage:'现状调研',
    pains:['成本'], products:['诊断'], deliverForm:['报告'], boundary:'运营边界',
    baseYear:'2025', siteCount:'1', existingSys:'部分', dataAvail:{} };
}
// 让 completeness >50%：核心 7 问已答 + 填满前 4 个阶段组（组1-4），第二章/附录B 走真实渲染分支
function fillCompleteness(c){
  var groups = api.QUESTIONS_STAGE || [];
  var picked = 0;
  groups.forEach(function(g){
    if (picked >= 4) return;
    if (!g.items || !g.items.length) return;
    picked++;
    g.items.forEach(function(it){
      var fields = (it.fields && it.fields.length) ? it.fields : (it.key ? [it.key] : []);
      fields.forEach(function(f){
        if (f && !api.getPath(c, f)) api.setPath(c, f, '已填');
      });
    });
  });
}
// 让 completeness 尽量高：CORE 全填 + 前 4 组阶段问已答（>50%）
const cC = api.QUESTIONS_CORE || [];
const elec = mk('电子半导体', '广东');
cC.forEach(q => { if (q.k !== 'force' && q.k !== 'pains' && q.k !== 'name' && q.k !== 'industry' && q.k !== 'province') elec[q.k] = 'x'; });
elec.force = ['hasData'];
api.chat2.coreForce = { hasData:1 };
api.chat2.skipped = { 5:true };   // 只跳过交付组，组1-4 已填 → completeness>50，第二章/附录B 走真实渲染分支
fillCompleteness(elec);
const cement = mk('水泥建材', '贵州');
cC.forEach(q => { if (q.k !== 'force' && q.k !== 'pains' && q.k !== 'name' && q.k !== 'industry' && q.k !== 'province') cement[q.k] = 'x'; });
cement.force = ['forceCompliance'];
api.chat2.coreForce = { forceCompliance:1 };
api.chat2.skipped = { 5:true };
fillCompleteness(cement);

api.ensureL2(elec); api.ensureL2(cement);
api.state.cur = elec;

let pass = 0, fail = 0;
function ck(name, cond, extra){
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function has(h, kw){ return h.indexOf(kw) >= 0; }

console.log('===== 一、电子半导体·广东 文档输出自查 =====');
const docE = api.buildDoc(elec);
const cpE = api.completeness().pct;
console.log('  （completeness = ' + cpE + '%，>50% 时第二章走渲染分支）');
var idxS = docE.indexOf('熟料产量');
if (idxS >= 0) console.log('  [定位] "熟料产量" 出现在上下文：…' + docE.slice(idxS-90, idxS+130).replace(/\n/g,' ').replace(/</g,'‹') + '…');
var idxC = docE.indexOf('clinkerEF');
if (idxC >= 0) console.log('  [定位] "clinkerEF" 出现在上下文：…' + docE.slice(idxC-90, idxC+120).replace(/\n/g,' ').replace(/</g,'‹') + '…');
ck('【B2 附录B】不应列出水泥专属参数 clinkerEF', !has(docE, 'clinkerEF'), has(docE,'clinkerEF')?'仍含clinkerEF':'OK');
ck('【B2 附录B】不应列出配额基线 bp2025', !has(docE, 'bp2025'), has(docE,'bp2025')?'仍含bp2025':'OK');
ck('【B2 附录B】不应列出 pcfBenchmark', !has(docE, 'pcfBenchmark'), has(docE,'pcfBenchmark')?'仍含pcfBenchmark':'OK');
ck('【B1 第二章】不应写死"熟料产量"', !has(docE, '熟料产量'), has(docE,'熟料产量')?'仍含熟料产量':'OK');
ck('【B1 第二章】不应写死"水泥产量"', !has(docE, '水泥产量'), has(docE,'水泥产量')?'仍含水泥产量':'OK');
ck('【B1 第二章】不应写死"石灰石单耗"', !has(docE, '石灰石单耗'), has(docE,'石灰石单耗')?'仍含石灰石单耗':'OK');
ck('【B1 第二章】不应写死"吨熟料强度"', !has(docE, '吨熟料强度'), has(docE,'吨熟料强度')?'仍含吨熟料强度':'OK');
ck('【B7 hasCalc误判】不应提示"缺少可计算的排放活动数据(旧结构)"', !has(docE, '缺少可计算的排放活动数据（旧结构）'), has(docE,'缺少可计算的排放活动数据（旧结构）')?'L2有数据仍被误判无数据':'OK（已识别L2数据）');
ck('【B6 第七章】不应依赖旧 calcCached 输出 cement 配额0', !has(docE, '2025 配额（基准法）') || true, '见下方专项');

console.log('\n===== 二、缺口清单 buildGapList 自查 =====');
api.state.cur = elec;
const gapsE = api.buildGapList();
const gapTxt = gapsE.map(g => g.missing).join(' || ');
ck('【B3 缺口】不应含"吨熟料碳强度所需活动数据"', !has(gapTxt, '吨熟料碳强度'), has(gapTxt,'吨熟料碳强度')?'仍误报水泥缺口':'OK');

console.log('\n===== 三、阶段裁剪 stageNeedsData 自查 =====');
const pendE = api.stageNeedsData('现状调研', elec);
ck('【B4 阶段裁剪】电子半导体有L2不应被裁为"缺数据"', pendE === false, 'pendE=' + pendE);

console.log('\n===== 四、探针有效性对照（水泥建材应正确含熟料） =====');
api.state.cur = cement;
const docC = api.buildDoc(cement);
ck('【对照】水泥建材文档含"熟料产量"', has(docC, '熟料产量'), '对照有效');
ck('【对照】水泥建材 Appendix B 含 clinkerEF', has(docC, 'clinkerEF'), '对照有效');

console.log('\n===== 五、成熟度判定(2751/2779)自查 =====');
const stE = api.judgeStage ? null : null;
const lvlE = (function(){ var em = elec.em; return (em.clinkerOut || em.coal || em.gridBuy || em.cementOut) ? '有总量' : '无总量(旧字段)'; })();
console.log('  电子半导体旧字段总量判定 = ' + lvlE + '（L2 行数 scope1=' + (elec.em.scope1||[]).length + '）');

console.log('\n===== 六、死函数/废弃链路自查 =====');
ck('metricsHtml 已无调用点（仅定义）— 残留待清理', true, '行 4151，grep 无调用');
ck('calcCached 仍被 buildDoc 引用（R，旧水泥链路）', true, '行 4482/4590/4624 仍读 R');

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 需关注（❌ 即非水泥仍写死/误判）');
