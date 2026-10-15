# 双碳行业联动单文件系统（shuangtan）

一个**单文件、离线、零外链**的「双碳 / 碳核算」行业联动工作台。一份 `index.html` 即可在浏览器打开运行，覆盖诊断、政策落地、落地台账（L2 排放源级）、方案文档四个窗口，并随企业所处行业自适应联动。

## 核心特性

- **四窗口联动**：
  1. 诊断题库（行业 / 企业差异化问答）
  2. 政策落地（五阶段实施路径，行业补丁驱动）
  3. 落地台账 L2（排放源级 activity · 因子 · 实测/待补状态）
  4. 方案文档（自动生成可交付的方案书 / 缺口清单 / 阶段裁剪 / 成果物清单）
- **行业自适应**：内置 17 个行业知识库（KB_INDUSTRY 等）。非水泥行业不再出现写死的水泥口径（熟料 / 吨熟料碳强度 / 余热自发电×10 / 替代燃料 / 碳酸盐分解等），全部走行业中性表达或行业补丁。
- **诚实不编造**：跨行业专属排放因子、分省电网真实数值、配额分配参数、CBAM 出口实测等，按「缺因子待补 / 占位 / 待官方发布」承载，不在面板编造数值。
- **离线可审计**：所有页面脚本经三道验证门（`node tests/smoke.js` 538 项断言 + 两道 CI lint）守护。

## 目录结构

```
index.html                          # 主交付：单文件离线系统（产品本体）；GitHub Pages 主页
legacy.html                         # 旧 carbon-md 项目入口（保留，非双碳系统）
docs/                                   # 规范与附件（来源 / 参考，非运行时依赖）
  交给WorkBuddy的开工指令.md
  双碳系统改造说明书_给WorkBuddy.md
  附件A_五阶段实施内容库_水泥行业.json
  附件B_窗口一五阶段问答脚本.json
  附件C_行业扩展包_2027同步版.json / .md
tests/                                  # 验证与审计脚本（从仓库根目录运行）
  smoke.js                              # 端到端冒烟测试，538 项断言（见下方）
  ci_lint_page_quality.py               # 页面质量门：script 4/4 · innerHTML 白名单 · 无外链/CDN
  ci_lint_database_sdk_usage.py         # DB SDK 用法门：databaseId 字面量 · addRecord=是 · 防抖
  audit_windows.js                      # 四窗口行业化排查探针（虚拟非水泥企业跑通四窗口）
  audit_cement.js                       # 水泥固定模块自查探针
  verify_gaps.js                        # 7 类缺口硬验证探针
  probe_factorlib.js / probe_factors.js # 因子库 / 因子完整性探针
reports/                                # 生成的核验报告（HTML）
  四窗口行业化排查报告.html
  双碳行业数据内容矩阵与四窗口联动及因子完整性核验.html
  双碳行业框架数据内容矩阵与四窗口联动确认.html
```

## 运行

直接用浏览器打开 `index.html` 即可（无需服务器、无需联网）。

## 验证（三道门，从仓库根目录执行）

```bash
# 门一：端到端冒烟（期望 通过 538 / 失败 0）
node tests/smoke.js

# 门二：页面质量
python tests/ci_lint_page_quality.py index.html --has-database

# 门三：数据库 SDK 用法
python tests/ci_lint_database_sdk_usage.py index.html
```

`tests/` 下的审计 / 验证探针可单独复跑：

```bash
node tests/audit_windows.js     # 虚拟「钢铁 / 其他」企业，确认四窗口无固定水泥板块
node tests/verify_gaps.js       # 7 类行业化缺口硬验证
```

## 交付演进（简述）

- 行业自适应改造历经批次甲 / 乙 / 丙 / 丁：参数与因子面板联动、计算引擎按行业变动、企业现状速览行业化、成熟度判定去水泥字段、附录 C 成果物与 CBAM 章节按行业功能单位、一致性校验 V1–V6 行业门控、五阶段内容库（KB_STAGE_DETAIL）对非水泥行业做中性化清洗。
- 最终状态：四窗口 + 一致性校验 + 成果物清单的水泥硬编码残余清零；仅窗口三 L2 教学自检 `runCalcSelfTest` 保留虚拟水泥用例（测试 fixture，刻意保留）。

## 诚实边界（已知占位，非缺陷）

- 跨行业 scope1 专属因子（燃料 NCV/EF、过程因子）、分省电网真实数值、配额分配参数、CBAM 出口实测：按「待补 / 占位 / 待官方发布」承载，不编造。
- 非水泥客户在窗口一 / 三录入主产品产量（`em.production`）与出口量（`em.cbamExport`）后，成果物即显示真实值。

## 许可

内部交付物。请以最新官方发布为准。
