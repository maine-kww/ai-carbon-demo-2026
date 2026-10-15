#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lint_database_sdk_usage.py —— Database SDK 用法红线复现版（依据说明书 11.1 + 踩坑记录）
覆盖：DSDK002(databaseId 必须字面量或 DATABASE_ID 变量) · DSDK008(含 addRecord 须有
      localStorage 缓存 + removeItem + 300ms 防抖 + 跳过敏感字段)
通过打印 MINDX_DBSDK_LINT_OK；任一不过打印 MINDX_DBSDK_LINT_FAIL 并非零退出。
用法：python ci_lint_database_sdk_usage.py <file.html>
"""
import re, sys

def main():
    if len(sys.argv) < 2:
        print('usage: ci_lint_database_sdk_usage.py <file.html>'); return 2
    path = sys.argv[1]
    html = open(path, encoding='utf-8').read()
    fails = []

    # 收集已定义的 DATABASE_ID 变量名
    defined_ids = set(re.findall(r'var\s+(DATABASE_ID\w*)\s*=', html))

    # ---- DSDK002: databaseId 必须是字符串字面量或已定义的 DATABASE_ID(_x) 变量 ----
    for m in re.finditer(r'databaseId\s*:\s*([^,\n}\)]+)', html):
        val = m.group(1).strip()
        if re.match(r'^["\'].*["\']$', val):        # 字符串字面量
            continue
        if val in defined_ids:                       # DATABASE_ID 变量
            continue
        line = html[:m.start()].count('\n') + 1
        fails.append('DSDK002 第%d行 databaseId 非字面量/未定义变量：%s' % (line, val))

    has_addrecord = 'addRecord' in html

    # ---- DSDK008: 含 addRecord 的页面必须保留 localStorage 缓存 + removeItem 清理 ----
    if has_addrecord:
        if 'localStorage' not in html:
            fails.append('DSDK008 含 addRecord 但无 localStorage 缓存')
        if not re.search(r'localStorage\.removeItem|\.removeItem\(', html):
            fails.append('DSDK008 未见 removeItem 清理')
        # 300ms 防抖（与本机表单缓存一致）
        if not re.search(r'setTimeout\([^,]+,\s*300\b', html):
            fails.append('DSDK008 未见 300ms 防抖')
        # 跳过敏感字段：password/secret/token/key 不应被直接写入业务序列化
        # （宽松校验：若存在敏感字段名直传 addRecord/updateRecord 则报）
        for m in re.finditer(r'(password|secret|token)\s*:', html, re.I):
            seg = html[m.start():m.start()+120]
            if 'addRecord' in seg or 'updateRecord' in seg:
                fails.append('DSDK008 敏感字段可能直写数据库：%s' % m.group(0))
                break

    if fails:
        print('MINDX_DBSDK_LINT_FAIL  (%d)' % len(fails))
        for f in fails: print('  - ' + f)
        return 1
    print('MINDX_DBSDK_LINT_OK  (databaseId 全字面量/DATABASE_ID · addRecord=%s · '
          'localStorage+removeItem+300ms防抖 具备)' % ('是' if has_addrecord else '否'))
    return 0

if __name__ == '__main__':
    sys.exit(main())
