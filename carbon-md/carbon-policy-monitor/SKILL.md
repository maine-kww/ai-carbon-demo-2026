---
name: carbon-policy-monitor
description: 双碳政策定期监控与数据层联动 Skill。当需要定期扫描白名单来源网站（生态环境部/中国政府网/发改委/工信部/全国碳市场交易机构/省级生态环境主管部门）、检测新政策发布或旧政策更新、与 _data/policy_meta.json 比对生成变更清单、合并更新政策元数据并标记受影响行业与受影响 skill 时使用。本 skill 是 carbon-md 数据驱动体系的"政策耳目"：负责发现变化、驱动数据层更新、并提示哪些下游 skill（carbon-accounting/carbon-trading/carbon-mrv/green-factory 等）需要重新引用最新政策版本。
---

# Carbon Policy Monitor 双碳政策监控与数据层联动

## Overview

定期扫描固定白名单来源，检测"新政策发布 / 旧政策更新"，与 `_data/policy_meta.json` 比对生成变更清单，经人工确认后合并入数据层，并输出受影响行业与受影响 skill 清单，驱动数据层与 Skill 层联动更新。

**落地方式（重要）**：自动结构化提取采用"**规则提取 + 人工确认**"模式——scanner 只做链接/标题/日期提取与关键字规则推断（政策类型/行业标签候选），**LLM 结构化提取环节由人工操作替代**：人工打开原文链接，在 dry-run 复核后人工补全文号、发文机关、条款摘要等字段，再写库。所有自动检出记录默认 `数据状态=占位-待核实`。

## Workflow

### 1. 加载白名单来源
- 读取 `references/whitelist_sources.md`（11 个来源：国家级权威 5、交易机构 2、行业媒体次级 1、省级 3）。
- 监控频率：通知公告类栏目每日；政策法规/政策库每周；省级栏目每月。

### 2. 扫描检测（自动）
- 运行 `python scripts/scanner.py`（在线模式）：逐源抓取列表页，正则提取 `<a>` 标题与就近发布日期，相对链接补全为绝对 URL。
- 容错约定：单源失败只记录 `failed_sources` 不中断；**全部在线失败自动降级到 `fixtures/` 离线演示模式**。
- 离线/演示：`python scripts/scanner.py --offline`（使用 `fixtures/` 内置 3 组样例页）。

### 3. 与 policy_meta.json 比对生成变更清单（自动）
- scanner 以 `_data/policy_meta.json` 为只读基准，按归一化标题比对：
  - 未命中 → **新增**；
  - 标题命中且发布日期变化 → **更新**；
  - 标题命中且日期一致 → 已存在无变更（不进清单）。
- 输出 `tmp/changes.json`（含每条变更的 类型/标题/链接/日期/来源/规则推断的政策类型与行业标签），并打印可读变更清单。

### 4. 人工确认关键变更（人工环节，替代 LLM 提取）
- 逐条打开变更清单中的原文链接，人工确认：文号、发文机关、发布/施行日期、时效状态、适用行业、适用地区、条款要点摘要。
- 征求意见稿、行业媒体（tanpaifang.com）次级线索：只登记、**不升级为"已查证"**，须回查权威原文。

### 5. 合并写库（默认 dry-run，人工确认后 --apply）
- 复核预览：`python scripts/update_policy_meta.py --changes tmp\changes.json`（默认 dry-run，只打印计划与 schema 校验，不写文件）。
- 写库：`python scripts/update_policy_meta.py --changes tmp\changes.json --apply`。
  - **写库仅作用于副本**：默认写入本 skill `tmp/policy_meta_updated.json`，绝不直接改动 `_data/policy_meta.json`（该文件正由数据构建流程维护）。
  - 若确需回灌数据层，须人工确认后显式 `--apply --target _data/policy_meta.json --into-data-layer`。
- 写库前自动做 13 字段 schema 校验（政策名称/文号/发文机关/发布日期/时效状态/适用行业标签/适用地区标签/政策类型/原文链接/结构化摘要/数据状态/来源/更新日期），校验不过拒绝写入。

### 6. 标记受影响行业与受影响 Skill（自动）
- `update_policy_meta.py` 依据 `references/skill-industry-map.md`（脚本内嵌同份映射），输出：
  - 受影响行业标签并集（如 发电/钢铁/水泥）；
  - 受影响 skill 并集（如 carbon-trading/carbon-mrv/carbon-accounting/green-factory）。
- 含义提示：这些 skill 的 SKILL.md 代码无需改动（参数已数据化），但下次被调用时，其结论依据的政策版本已更新，须重新引用最新文号与日期。

### 7. 通知人工确认
- 交付物：变更清单（新增/更新分列）+ 受影响行业与 skill 清单 + 待人工确认字段列表。
- 报告默认打印；重要变更（行政法规、配额方案、行业扩围类）须人工复核原文后方可写库。

## 质量与安全约定

- **只读基准**：scanner 对 `policy_meta.json` 永远只读；写库默认落副本。测试一律使用本 skill `tmp/` 与 `fixtures/`，不得修改其他 skill 目录或 `_data/` 下任何文件。
- **数据状态透传**：自动检出记录一律 `占位-待核实`；人工回查权威原文后才可升级 `已查证`。
- **UTF-8**：所有脚本读写显式 UTF-8（JSON `ensure_ascii=False`）。
- **优雅降级**：网络不稳定/全部失败时自动进入 `--offline --fixtures` 演示，不报错退出。

## Resources

- `references/whitelist_sources.md` — 白名单来源清单（11 个真实 URL：站点/栏目/频率/备注/可达性记录）。
- `references/skill-industry-map.md` — 行业标签与政策类型 → 受影响 skill 映射表与联动规则。
- `scripts/scanner.py` — 扫描器（在线/`--offline --fixtures` 离线演示；输出 changes.json）。
- `scripts/update_policy_meta.py` — 合并器（默认 dry-run；`--apply` 写副本；schema 校验；输出受影响行业/skill）。
- `fixtures/` — 3 组离线演示样例页（生态环境部/中国政府网/上海环交所列表页）。
