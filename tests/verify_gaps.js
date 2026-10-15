// 缺口清单硬验证探针：逐条断言 7 项缺口真实存在（诚实，不编造）
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname, '..', 'shuangtan.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const code=scripts.join('\n;\n');
const store={};function mkEl(id){return{id,innerHTML:'',textContent:'',value:'',disabled:false,className:'',checked:false,children:[],style:{},classList:{_s:{},add(c){this._s[c]=1;},remove(c){delete this._s[c];},toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;},contains(c){return !!this._s[c];}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},addEventListener(){},removeEventListener(){},appendChild(c){this.children.push(c);return c;},removeChild(c){return c;},querySelector(){return null;},querySelectorAll(){return [];},reset(){},closest(){return null;},focus(){},click(){},scrollTop:0,scrollHeight:0};}
const getEl=id=>{if(!store[id])store[id]=mkEl(id);return store[id];};
const docStub={getElementById:getEl,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>mkEl('t'),body:mkEl('body')};
const lsStub={_d:{},getItem(k){return this._d[k]===undefined?null:this._d[k];},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];},clear(){this._d={};}};
const vm=require('vm');const sandbox={window:{__SMART_PAGE__:null,print:()=>{}},document:docStub,localStorage:lsStub,confirm:()=>false,prompt:m=>'t',console:console,setTimeout:setTimeout,clearTimeout:clearTimeout,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>''},navigator:{userAgent:'node'},Date:Date,Math:Math,JSON:JSON,RegExp:RegExp,Error:Error,String:String,Number:Number,Object:Object,Array:Array,Promise:Promise,isNaN:isNaN,parseInt:parseInt,parseFloat:parseFloat};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(code,sandbox,{filename:'page.js'});
const api=sandbox;

let pass=0,fail=0;const log=[];
function ck(name,cond,extra){ if(cond){pass++;log.push('PASS  '+name+(extra?'  ['+extra+']':''));}else{fail++;log.push('FAIL  '+name+(extra?'  -> '+extra:''));} }

const inds=api.KB_INDUSTRY?Object.keys(api.KB_INDUSTRY):[];

function fnBody(name){var sig='function '+name+'(';var start=code.indexOf(sig);if(start<0)return '';var i=code.indexOf('{',start);var depth=0,j=i;for(;j<code.length;j++){if(code[j]==='{')depth++;else if(code[j]==='}'){depth--;if(depth===0)break;}}return code.slice(i+1,j);}

// ===== 缺口 A：行业专属 scope1 因子缺失（16 行业）=====
var dedicatedNonCement=inds.filter(i=>i!=='水泥建材'&&i!=='食品饮料'&&i!=='其他');
var aAllEmpty=true, aCounterexample='';
dedicatedNonCement.forEach(function(ind){
  var c={name:ind,industry:ind,province:'广东',em:{}};api.ensureL2(c);
  (c.em.scope1||[]).forEach(function(r){var fr=Array.isArray(r.factorRefs)?r.factorRefs:[];if(fr.length>0){aAllEmpty=false;aCounterexample=ind+'/'+r.source+'='+JSON.stringify(fr);}});
});
var flScope1Keys=Object.keys(api.FACTOR_LIB.scope1||{});
var nonCementTerms=['steel','钢铁','iron','电子','semi','纺织','textile','化肥','fertil','氢','hydrogen','石化','petro','有色','nonfer','造纸','paper','汽车','auto','装备','equip','物流','logis','房地产','real','民航','aviation','食品','food','电力','power','铝','alum'];
var aOnlyCement = flScope1Keys.every(function(k){return !nonCementTerms.some(function(t){return k.toLowerCase().indexOf(t.toLowerCase())>=0;});});
ck('A1: 14 个专属模板非水泥行业 scope1 factorRefs 全空(缺因子待补)', aAllEmpty, aCounterexample||('共'+dedicatedNonCement.length+'行业'));
ck('A2: FACTOR_LIB.scope1 仅含水泥建材因子(无钢铁/电子等非水泥行业)', aOnlyCement, flScope1Keys.join(','));
ck('A3: 仅水泥建材有本行业 scope1 因子 → 16 行业本行业 scope1 因子缺失', aAllEmpty&&aOnlyCement&&(inds.length-1===16), '非水泥='+(inds.length-1));

// ===== 缺口 B：地方分省电网因子缺失 =====
var fl=api.FACTOR_LIB;
var gridIsSingle = fl.scope2&&fl.scope2.gridEF&&typeof fl.scope2.gridEF.v==='number';
var provWithGrid=0;
var prov=api.KB_PROVINCE||{};
Object.keys(prov).forEach(function(p){var o=prov[p];if(o&&(o.gridEF||(o.factors&&o.factors.gridEF))){provWithGrid++;}});
ck('B1: gridEF 为单一区域值(非分省差异化)', gridIsSingle, 'v='+(fl.scope2&&fl.scope2.gridEF&&fl.scope2.gridEF.v));
ck('B2: KB_PROVINCE 中 0 省含分省电网因子', provWithGrid===0, '含grid省数='+provWithGrid);

// ===== 缺口 C：scope3 因子未填值（8 项仅引用名）=====
var cAllEmpty=true,cEx='';
inds.forEach(function(ind){
  var c={name:ind,industry:ind,province:'广东',em:{}};api.ensureL2(c);
  (c.em.scope3||[]).forEach(function(r){var fr=Array.isArray(r.factorRefs)?r.factorRefs:[];if(fr.length>0){cAllEmpty=false;cEx=ind+'/'+r.source;}});
});
var s3count=Object.keys(fl.scope3||{}).length;
ck('C1: scope3 因子库共 8 项(仅引用名)', s3count===8, 's3='+s3count);
ck('C2: 全 17 行业 L2 scope3 factorRefs 全空(无数值)', cAllEmpty, cEx||'全部空');

// ===== 缺口 D：仅食品饮料/其他 窗口三无专属 L2 模板（回退水泥默认）=====
var fallbackInds=[];
inds.forEach(function(ind){var c={name:ind,industry:ind,province:'广东',em:{}};api.ensureL2(c);if(c._l2TplFallback)fallbackInds.push(ind);});
ck('D1: 回退水泥默认(无专属L2)仅 食品饮料/其他', fallbackInds.length===2&&fallbackInds.indexOf('食品饮料')>=0&&fallbackInds.indexOf('其他')>=0, fallbackInds.join(','));

// ===== 缺口 E：窗口一行业题新字段已采集但窗口二/四暂未消费 =====
var rp=fnBody('renderPlan'), bd=fnBody('buildDoc');
var qKeys=new Set();
var qb=api.KB_Q_BY_INDUSTRY||{};
Object.keys(qb).forEach(function(ind){(qb[ind]||[]).forEach(function(q){if(q&&q.key)qKeys.add(q.key);});});
var consumedKeys=[];
qKeys.forEach(function(k){ if(rp.indexOf(k)>=0||bd.indexOf(k)>=0) consumedKeys.push(k); });
ck('E1: KB_Q_BY_INDUSTRY 含行业题 key(已采集到 c.*)', qKeys.size>0, '行业题key数='+qKeys.size);
ck('E2: 窗口二 renderPlan 与窗口四 buildDoc 均未消费这些行业题新字段', consumedKeys.length===0, consumedKeys.slice(0,5).join(',')||'无消费');

// ===== 缺口 F：配额测算/CBAM实测/LCA/ISO14067库/CDP问卷 均未建 =====
var engNames=['quotaCalc','calcQuota','cbamActualEmission','cbamEmission','lcaQuantify','quantifyLCA','iso14067DB','lcaDB','cdpQuestionnaire','cdpForm','buildCDP','calcAllowance'];
var builtEng=engNames.filter(function(n){return typeof api[n]==='function';});
ck('F1: 配额测算/CBAM实测/LCA/ISO14067库/CDP问卷 等引擎均未定义', builtEng.length===0, builtEng.join(',')||'全部未建');

// ===== 缺口 G：省级政策均以最新官方发布为准承载（仅贵州带真实文号）=====
var prov2=api.KB_PROVINCE||{};
var withDocs=0, placeholderCnt=0, samplePlaceholder='';
Object.keys(prov2).forEach(function(p){var o=prov2[p];if(!o)return;
  if(o.docs&&o.docs.length){withDocs++;}
  if(/以.*为准/.test(o.note||'')){placeholderCnt++;if(!samplePlaceholder)samplePlaceholder=p;}
});
ck('G1: 仅贵州带真实文号(docs 数组)，其余省级政策 note 均为"以X市/省最新文件为准"占位', withDocs===1&&placeholderCnt>=20, '真实文号省='+withDocs+' placeholder省='+placeholderCnt+' 样例='+samplePlaceholder);

console.log(log.join('\n'));
console.log('\n==== 缺口硬验证 ====');
console.log('通过: '+pass+'  失败: '+fail+'  (共 '+ (pass+fail) +' 项)');
process.exit(fail>0?2:0);
