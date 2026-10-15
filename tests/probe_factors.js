// 运行时探针：逐行业抽取 L2 排放因子收集实况 + 全局因子库，输出 factor_probe.json
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'shuangtan.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

// --- DOM 桩（同 smoke.js）---
const store = {};
function mkEl(id){return{id,innerHTML:'',textContent:'',value:'',disabled:false,className:'',checked:false,children:[],style:{},classList:{_s:{},add(c){this._s[c]=1;},remove(c){delete this._s[c];},toggle(c){this._s[c]?delete this._s[c]:this._s[c]=1;},contains(c){return !!this._s[c];}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},addEventListener(){},removeEventListener(){},appendChild(c){this.children.push(c);return c;},removeChild(c){return c;},querySelector(){return null;},querySelectorAll(){return [];},reset(){},closest(){return null;},focus(){},click(){},scrollTop:0,scrollHeight:0};}
const getEl=id=>{if(!store[id])store[id]=mkEl(id);return store[id];};
const docStub={getElementById:getEl,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>mkEl('t'),body:mkEl('body')};
const lsStub={_d:{},getItem(k){return this._d[k]===undefined?null:this._d[k];},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];},clear(){this._d={};}};
const vm=require('vm');
const sandbox={window:{__SMART_PAGE__:null,print:()=>{}},document:docStub,localStorage:lsStub,confirm:()=>false,prompt:m=>'t',console:console,setTimeout:setTimeout,clearTimeout:clearTimeout,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>''},navigator:{userAgent:'node'},Date:Date,Math:Math,JSON:JSON,RegExp:RegExp,Error:Error,String:String,Number:Number,Object:Object,Array:Array,Promise:Promise,isNaN:isNaN,parseInt:parseInt,parseFloat:parseFloat};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox,{filename:'page.js'});
const api=sandbox;

const inds = api.KB_INDUSTRY ? Object.keys(api.KB_INDUSTRY) : [];
// 运行时 KB_INDUSTRY 含 ext 合并（化肥/氢/民航），用 KB_INDUSTRY 键最全
const industryKeys = inds.slice();

function collectFor(ind){
  const c = { name: ind+'_probe', industry: ind, province:'广东', em:{} };
  api.ensureL2(c);
  const out = { industry: ind, fallback: !!c._l2TplFallback, tplIndustry: c._l2TplIndustry, scope1:[], scope2:[], scope3:[] };
  ['scope1','scope2','scope3'].forEach(function(sc){
    (c.em[sc]||[]).forEach(function(r){
      out[sc].push({
        source: r.source || r.name || '',
        formula: r.formula || '',
        factorRefs: Array.isArray(r.factorRefs) ? r.factorRefs.slice() : (r.factorRefs||''),
        defaultJudgment: r.defaultJudgment || '',
        emit: typeof r.emit==='number'?r.emit:null
      });
    });
  });
  // 行业 ext factors 原样
  const ext = api.KB_INDUSTRY_EXT ? api.KB_INDUSTRY_EXT[ind] : null;
  out.extFactors = ext && ext.factors ? ext.factors : (api.KB_INDUSTRY[ind] && api.KB_INDUSTRY[ind].factors ? api.KB_INDUSTRY[ind].factors : null);
  // 是否声明有专属 L2 范围清单
  out.hasScopeCollection = !!(api.SCOPE_COLLECTION_BY_INDUSTRY && api.SCOPE_COLLECTION_BY_INDUSTRY[ind]);
  return out;
}

const rows = industryKeys.map(collectFor);

// 全局因子库
const fl = api.FACTOR_LIB || {};
let factorKeys = [];
try { factorKeys = Object.keys(fl); } catch(e){}
// FACTOR_LIB 内因子的行业归属（仅水泥建材有实质行业因子；其余为通用 scope2/3/市场）
const factorSummary = {
  total: factorKeys.length,
  keys: factorKeys,
  categories: {}
};
factorKeys.forEach(function(k){
  const v = fl[k]||{};
  const cat = v.category || (k.indexOf('grid')>=0?'scope2':k.indexOf('heat')>=0?'scope2':k.indexOf('s3')>=0?'scope3':'market/scope1');
  factorSummary.categories[cat] = (factorSummary.categories[cat]||0)+1;
});

// 统计每个行业 L2 因子填充情况
function factorFilled(r){
  if (Array.isArray(r.factorRefs)) return r.factorRefs.filter(function(x){return x && x!=='';}).length;
  return 0;
}
rows.forEach(function(r){
  ['scope1','scope2','scope3'].forEach(function(sc){
    let filled=0, empty=0;
    r[sc].forEach(function(src){
      const n = factorFilled(src);
      if (n>0) filled++; else empty++;
    });
    r[sc+'_filled']=filled; r[sc+'_empty']=empty;
  });
  r.totalFilled = r.scope1_filled+r.scope2_filled+r.scope3_filled;
  r.totalEmpty = r.scope1_empty+r.scope2_empty+r.scope3_empty;
});

const result = { generatedAt: new Date().toISOString(), industryCount: industryKeys.length, industries: industryKeys, rows: rows, factorSummary: factorSummary };
fs.writeFileSync(path.join(__dirname,'factor_probe.json'), JSON.stringify(result,null,2),'utf8');
console.log('industries:', industryKeys.length);
console.log('FACTOR_LIB total:', factorSummary.total, 'byCat:', JSON.stringify(factorSummary.categories));
console.log('--- per industry L2 factor fill (filled/empty) ---');
rows.forEach(function(r){
  console.log(r.industry.padEnd(6), 'fallback='+(r.fallback?1:0), 's1',r.scope1_filled+'/'+r.scope1_empty,'s2',r.scope2_filled+'/'+r.scope2_empty,'s3',r.scope3_filled+'/'+r.scope3_empty,'hasScope='+(r.hasScopeCollection?1:0));
});
console.log('written: factor_probe.json');
