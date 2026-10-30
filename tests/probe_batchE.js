// 探针：批次E 消毒器白名单化（修无空白分隔事件属性绕过）
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
const S = (x) => api.sanitizeHtml(x);

console.log('=== E1 旧绕过向量（无空白分隔事件属性）===');
let c1 = S('<svg/onload=alert(1)>');
check('svg/onload= 无空白写法 → onload 被剥', !/onload/i.test(c1), c1);
check('svg 标签保留（模板需要图标）', /<svg/.test(c1), c1);
c1 = S('<img/src=x/onerror=alert(1)>');
check('img/src=x/onerror= 无空白写法 → 无独立 onerror 属性（值内惰性字符串）', !/\sonerror\s*=/i.test(c1) && !/^onerror/i.test(c1), c1);
check('img 被重建为合法形式', /^<img /.test(c1) || /^<img>/.test(c1), c1);
c1 = S('<img src=x/onerror=alert(1)>');
check('空格+无空白事件写法 → 无独立 onerror 属性', !/\sonerror\s*=/i.test(c1), c1);
c1 = S('<a href="javascript:alert(1)" onclick="x()">z</a>');
check('href javascript: 与 onclick 同剥', !/javascript:/i.test(c1) && !/onclick/i.test(c1) && /<a>z<\/a>/.test(c1), c1);
c1 = S('<a href="java&#x73;cript:alert(1)">x</a>');
check('实体混淆 javascript: 也被剥', !/javascript/i.test(c1), c1);
c1 = S('<a href="data:text/html,<script>alert(1)</script>">x</a>');
check('href data: 被剥', c1.indexOf('data:') < 0 && c1.indexOf('<script') < 0, c1);

console.log('=== E2 危险标签整段删除 ===');
c1 = S('<div>ok</div><script>alert(1)</script><b>keep</b>');
check('script 内容整段删除', c1.indexOf('<script') < 0 && c1.indexOf('alert(1)') < 0 && /<b>keep<\/b>/.test(c1), c1);
c1 = S('<iframe srcdoc="<script>a</script>"></iframe>body');
check('iframe 及其内容删除', c1.indexOf('iframe') < 0 && c1.indexOf('srcdoc') < 0, c1);
c1 = S('<style>body{}</style>x');
check('style 删除', c1.indexOf('<style') < 0 && c1 === 'x', c1);
c1 = S('<form action="http://x">f</form>y');
check('form 删除（含 action）', c1 === 'y', c1);
c1 = S('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>z');
check('svg animate 删除', c1.indexOf('animate') < 0 && c1.indexOf('javascript') < 0, c1);

console.log('=== E3 合法内容与模板结构无损 ===');
c1 = S('<div class="a">ok</div>');
check('class 保留', c1.indexOf('class="a"') >= 0, c1);
c1 = S('<table><thead><tr><th>头</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table>');
check('表格结构保留', c1.indexOf('<table>') >= 0 && c1.indexOf('<td>值</td>') >= 0 && c1.indexOf('</table>') >= 0, c1);
c1 = S('<svg viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="2"><circle cx="26" cy="26" r="20"/></svg>');
check('svg 图标重建保留属性（viewbox 小写化由 HTML5 属性调整表映射回 viewBox）', c1.indexOf('viewbox="0 0 52 52"') >= 0 && c1.indexOf('<circle') >= 0, c1);
c1 = S('<button class="chip" data-v="大型企业（年营收10亿以上）">大型</button>');
check('data-* 中文值往返无损', c1.indexOf('data-v="大型企业（年营收10亿以上）"') >= 0, c1);
c1 = S('<span style="margin-top:6px;color:var(--warn)">提示</span>');
check('style 常规值保留', c1.indexOf('style="margin-top:6px;color:var(--warn)"') >= 0, c1);
c1 = S('<span style="background:url(javascript:alert(1))">x</span>');
check('style url(javascript) 被剥', c1.indexOf('javascript') < 0, c1);
c1 = S('<div title="A &amp; B">文本 &amp; 更多</div>');
check('属性实体往返不双重转义', c1.indexOf('title="A &amp; B"') >= 0, c1);
c1 = S('<input type="checkbox" checked value="1">');
check('布尔属性保留', c1.indexOf('checked') >= 0 && c1.indexOf('value="1"') >= 0, c1);
c1 = S('<!-- 注释 --><marquee>滚动</marquee>尾巴');
check('注释删除+未知标签剥壳', c1.indexOf('<!--') < 0 && c1.indexOf('marquee') < 0 && c1.indexOf('滚动') >= 0 && c1.indexOf('尾巴') >= 0, c1);
c1 = S('<p>正常 <b>加粗</b> 文本</p>');
check('常规段落无损', c1 === '<p>正常 <b>加粗</b> 文本</p>', c1);

console.log('=== E4 无闭合/畸形输入不崩 ===');
try {
  c1 = S('<div><span>x');
  check('未闭合标签不抛错', true, c1);
  c1 = S('<img src="a"');
  check('截断标签不抛错', true, c1);
  c1 = S('纯文本<a href="x" onclick="y()">');
  check('截断带事件标签不抛错且无 on*', !/onclick/i.test(c1), c1);
} catch (e) { check('畸形输入不抛错', false, e.message); }

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
