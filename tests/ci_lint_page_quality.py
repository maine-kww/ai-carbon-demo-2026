#!/usr/bin/env python3# -*- coding: utf-8 -*-
"""
lint_page_quality.py —— 页面质量红线复现版（依据开工指令硬约束 + 说明书 11.1 + 踩坑记录）
覆盖：PQ001(script 开闭相等 / </ 转义) · PQ005(innerHTML 仅经白名单消毒) ·
      PQ105/PQ107(关联库加载态 + 可见 catch) · T13/铁律3(单文件无外链/CDN)
通过打印 MINDX_PAGE_QUALITY_OK；任一不过打印 MINDX_PAGE_QUALITY_FAIL 并非零退出。
用法：python ci_lint_page_quality.py <file.html> [--has-database]
"""
import re, sys

SANITIZE_WHITELIST = ('sanitizeHtml', 'escapeHtml', 'esc', 'encodeURI', 'encodeURIComponent')
CDN_PAT = re.compile(r'cdn\.|unpkg|jsdelivr|bootcdn|staticfile|cdnjs', re.I)

def main():
    if len(sys.argv) < 2:
        print('usage: ci_lint_page_quality.py <file.html> [--has-database]'); return 2
    path = sys.argv[1]
    has_db = '--has-database' in sys.argv[2:]
    html = open(path, encoding='utf-8').read()
    fails = []

    # ---- PQ001: <script> 开闭标签数量相等（防批量替换吞标签的老坑）----
    open_n = len(re.findall(r'<script\b', html))
    close_n = len(re.findall(r'</script>', html))
    if open_n != close_n:
        fails.append('PQ001 <script> 开闭不相等：%d open vs %d close' % (open_n, close_n))
    # script 体内不应出现未转义的 </script（会被当成闭合）
    for m in re.finditer(r'<script\b[^>]*>(.*?)</script>', html, re.S):
        body = m.group(1)
        if re.search(r'</script', body):
            fails.append('PQ001 script 体内出现未转义 </script')

    # ---- PQ005: innerHTML 只能赋「被白名单函数整体包裹」的值 ----
    # 逐个 .innerHTML = 取右值到行尾/分号，校验以白名单函数开头
    for m in re.finditer(r'\.innerHTML\s*=\s*([^;\n]+)', html):
        rhs = m.group(1).strip()
        if not re.match(r'^(%s)\s*\(' % '|'.join(SANITIZE_WHITELIST), rhs):
            line = html[:m.start()].count('\n') + 1
            fails.append('PQ005 第%d行 innerHTML 右值未经白名单消毒：%s' % (line, rhs[:48]))

    # ---- 铁律3 / T13: 单文件无外链、无 CDN ----
    if CDN_PAT.search(html):
        fails.append('T13 检出 CDN 依赖：%s' % CDN_PAT.search(html).group(0))
    for m in re.finditer(r'<link\b[^>]*>', html):
        if 'href="data:' in m.group(0) or "href='data:" in m.group(0):
            continue   # inline favicon (data URI) is not an external link
        fails.append('外链 <link>：%s' % m.group(0)[:60])
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']https?://', html):
        url = m.group(0)
        if 'w3.org' not in url:  # 允许 SVG xmlns 命名空间
            fails.append('外链资源(src/href=http)：%s' % url[:60])

    # ---- PQ105/PQ107: 关联 database 需有加载态文案 + 用户可见 catch ----
    if has_db:
        if not re.search(r'加载中|syncing|正在.*同步|setSync', html):
            fails.append('PQ105 未见加载态文案（加载中/syncing/setSync）')
        # 用户可见 catch：.catch(...) 内或 catch{} 内调用 toast/提示
        vis_catch = False
        for m in re.finditer(r'\.catch\(\s*function\s*\([^)]*\)\s*\{(.*?)\}\s*\)', html, re.S):
            if 'toast' in m.group(1) or '提示' in m.group(1):
                vis_catch = True; break
        if not vis_catch:
            for m in re.finditer(r'catch\s*\([^)]*\)\s*\{(.*?)\}', html, re.S):
                if 'toast' in m.group(1):
                    vis_catch = True; break
        if not vis_catch:
            fails.append('PQ107 未见用户可见 catch（.catch/catch 内未调 toast）')

    if fails:
        print('MINDX_PAGE_QUALITY_FAIL  (%d)' % len(fails))
        for f in fails: print('  - ' + f)
        return 1
    print('MINDX_PAGE_QUALITY_OK  (script %d/%d · innerHTML 全走白名单 · 无外链/CDN%s)'
          % (open_n, close_n, ' · 加载态+catch 具备' if has_db else ''))
    return 0

if __name__ == '__main__':
    sys.exit(main())
