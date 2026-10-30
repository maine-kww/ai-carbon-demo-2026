// 探针：块3 导出层（外链图占位 / PDF 空内容防护 / favicon）
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

console.log('=== 块3a 导出外链图占位化 ===');
let out = api.sanitizeForExport('<p>正文</p><img src="http://evil.example.com/x.png"><img src="data:image/png;base64,AAA">尾部');
check('外链 img 替换为占位', out.indexOf('http://evil.example.com') < 0 && out.indexOf('外部图片未内嵌') >= 0, out);
check('data:image 内联图保留', out.indexOf('data:image/png') >= 0, out);
check('正文与尾部保留', out.indexOf('正文') >= 0 && out.indexOf('尾部') >= 0, out);

console.log('=== 块3b PDF 空内容防护 ===');
getEl('docBody').textContent = '';
getEl('docBody').innerHTML = '';
api.exportPdf();
check('空方案书导出被拦截并提示', getEl('toast').textContent.indexOf('方案书为空') >= 0, getEl('toast').textContent);
getEl('docBody').innerHTML = '<h2>有内容</h2>';
api.exportPdf();
check('有内容时提示打印对话框流程', getEl('toast').textContent.indexOf('另存为 PDF') >= 0, getEl('toast').textContent);
check('printRoot 已渲染内容', getEl('printRoot').innerHTML.indexOf('有内容') >= 0);

console.log('=== 块3c favicon 内联 ===');
check('favicon 为内联 data URI', html.indexOf('rel="icon"') >= 0 && html.indexOf('data:image/svg+xml') >= 0);

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
