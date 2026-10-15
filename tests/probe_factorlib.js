// 聚焦探针：FACTOR_LIB 嵌套结构 + 行业 ext.factors 文案 + 省级电网因子
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname, '..', 'shuangtan.html'),'utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');
const store={};function mkEl(id){return{id,innerHTML:'',textContent:'',value:'',disabled:false,className:'',checked:false,children:[],style:{},classList:{_s:{},add(c){this._s[c]=1;},remove(c){delete this._s[c];},toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;},contains(c){return !!this._s[c];}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},addEventListener(){},removeEventListener(){},appendChild(c){this.children.push(c);return c;},removeChild(c){return c;},querySelector(){return null;},querySelectorAll(){return [];},reset(){},closest(){return null;},focus(){},click(){},scrollTop:0,scrollHeight:0};}
const getEl=id=>{if(!store[id])store[id]=mkEl(id);return store[id];};
const docStub={getElementById:getEl,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>mkEl('t'),body:mkEl('body')};
const lsStub={_d:{},getItem(k){return this._d[k]===undefined?null:this._d[k];},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];},clear(){this._d={};}};
const vm=require('vm');const sandbox={window:{__SMART_PAGE__:null,print:()=>{}},document:docStub,localStorage:lsStub,confirm:()=>false,prompt:m=>'t',console:console,setTimeout:setTimeout,clearTimeout:clearTimeout,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>''},navigator:{userAgent:'node'},Date:Date,Math:Math,JSON:JSON,RegExp:RegExp,Error:Error,String:String,Number:Number,Object:Object,Array:Array,Promise:Promise,isNaN:isNaN,parseInt:parseInt,parseFloat:parseFloat};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(code,sandbox,{filename:'page.js'});
const api=sandbox;

// 1) FACTOR_LIB 嵌套
const fl=api.FACTOR_LIB||{};
const nested={};
let grandTotal=0;
Object.keys(fl).forEach(function(cat){
  const v=fl[cat];
  if(v && typeof v==='object' && !Array.isArray(v)){
    const keys=Object.keys(v); grandTotal+=keys.length;
    nested[cat]={count:keys.length, samples:keys.slice(0,6)};
  } else { grandTotal++; nested[cat]={count:1, samples:[typeof v]}; }
});
console.log('FACTOR_LIB 嵌套:', JSON.stringify(nested,null,1));
console.log('FACTOR_LIB 因子总数(嵌套):', grandTotal);

// 2) 行业 ext.factors 文案（抽样 钢铁/电子半导体/纺织/石化化工/化肥/氢/民航）
['钢铁','电子半导体','纺织','石化化工','化肥','氢','民航','水泥建材'].forEach(function(ind){
  const ext=api.KB_INDUSTRY_EXT?api.KB_INDUSTRY_EXT[ind]:null;
  const f=ext&&ext.factors?ext.factors:(api.KB_INDUSTRY[ind]&&api.KB_INDUSTRY[ind].factors?api.KB_INDUSTRY[ind].factors:null);
  let txt='(无)';
  if(f){ try{ txt=typeof f==='string'?f:JSON.stringify(f); }catch(e){ txt=String(f); } }
  console.log('--- '+ind+' factors ---');
  console.log(txt.slice(0,400));
});

// 3) 省级电网因子 / gridEF 是否分省
console.log('--- gridEF raw ---');
try{ console.log(JSON.stringify(fl.scope2?fl.scope2.gridEF:fl.gridEF,null,1).slice(0,500)); }catch(e){ console.log('n/a'); }
// KB_PROVINCE 中是否含 gridEF 分省
const prov=api.KB_PROVINCE||{};
let provWithGrid=0, provSample=null;
Object.keys(prov).forEach(function(p){ const o=prov[p]; if(o&&(o.gridEF||o.factors&&o.factors.gridEF)){ provWithGrid++; if(!provSample)provSample=p+'='+JSON.stringify(o.gridEF||o.factors.gridEF).slice(0,120); } });
console.log('KB_PROVINCE 含 gridEF 省数:', provWithGrid, 'sample:', provSample);

// 4) enrichIndustryScope 对非水泥 scope1 的 defaultJudgment 文案抽样
const c={name:'x',industry:'钢铁',province:'河北',em:{}};
api.ensureL2(c);
console.log('--- 钢铁 scope1 行 defaultJudgment 抽样 ---');
(c.em.scope1||[]).slice(0,3).forEach(function(r){ console.log(r.source,'| formula='+r.formula,'| factorRefs='+JSON.stringify(r.factorRefs),'| dj='+r.defaultJudgment); });
