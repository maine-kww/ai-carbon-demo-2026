---
name: cbam-compliance
description: CBAM 碳关税申报与核查应对的专业 Skill。当出口欧盟的企业需要判断产品是否落入 CBAM 适用范围、核算产品隐含碳排放、编制并提交 CBAM 申报、应对欧盟核查或规划 CBAM 合规策略时使用。覆盖 CBAM 覆盖产品、隐含排放核算、申报流程、核查应对与过渡期要求。数据驱动：CBAM 相关政策与国内衔接政策从本地数据层（data/policy\policy_metadata.json）动态查询；CBAM 属欧盟外部法规，数据层暂无对应记录时，按设计流程标注"数据层未覆盖"并以 references 中保留的欧盟官方规则参考为准。
---

# CBAM Compliance  CBAM 碳关税申报与核查应对

## Overview

支持出口欧盟企业应对欧盟碳边境调节机制（CBAM）。核心：判断产品适用性 → 核算隐含碳排放 → 申报 → 核查应对 → 合规策略。CBAM 是出口企业刚需，衔接产品核算（`carbon-footprint`）与排放数据（`carbon-accounting`/`carbon-mrv`）。

本 Skill 为**数据驱动模式**：CBAM 属欧盟外部法规，国内政策元数据表（`data/policy_meta.json`）当前暂无对应记录。Workflow 中先查数据层，**命中则引用其文号/日期/数据状态；未命中则显式标注"数据层未覆盖"，并以 `references/cbam-guide.md` 保留的欧盟官方规则参考为准**，不得把 references 当作数据层已核实结论。

## 数据层（申报前先查）

CBAM 国内衔接政策从 `data/` 数据层查询；CBAM 属欧盟外部法规，数据层未收录欧盟法规。命中则引用其文号/日期/数据状态；未命中则显式标注"数据层未覆盖"，并以 `references/cbam-guide.md` 保留的欧盟官方规则参考为准。

| 内容 | 数据文件 | 统一查询命令 |
|---|---|---|
| 政策元数据表（CBAM法规、国内衔接政策） | `data/policy/policy_metadata.json` | `python data/scripts/query_data.py search-policy CBAM` |
| 行业规则表（出口行业的核算标准） | `data/industry/industry_rules.json` | `python data/scripts/query_data.py get-industry <行业名>` |
| 数据版本号 | — | `python data/scripts/query_data.py version` |

> 运行路径：在 `carbon-md/` 根目录下执行上述命令。

**CBAM 特殊约定**：CBAM 为欧盟立法（Regulation (EU) 2023/956 等），`search-policy CBAM` 命中为空属预期。此时：① 标注"数据层暂无 CBAM 对应记录"；② 欧盟规则以 `references/cbam-guide.md` 及欧盟官方文件为准；③ 若数据层后续录入国内衔接政策，则优先引用并透传其文号与数据状态。
## Workflow

### 1. 先查数据层覆盖情况（search-policy（政策检索命令））
- 调用 `python data/scripts/query_data.py search-policy "CBAM")` 与 `python data/scripts/query_data.py search-policy "碳边境")`，确认国内数据层是否已有 CBAM 衔接政策记录。
- **命中**：引用其文号、发布日期、时效状态、数据状态与原文链接。
- **未命中（预期）**：在输出中显式标注"数据层暂无 CBAM 对应记录，以下欧盟规则为 references 保留参考，非数据层已核实结论"，再进入后续步骤。

### 2. 判断适用性与注册义务
- 确认出口产品是否落入 CBAM 覆盖范围（水泥、钢铁、铝、化肥、电力、氢等，随扩展更新）。
- 确认企业作为"申报人"的注册义务与申报人类型（直接/间接）。

### 3. 核算产品隐含碳排放
- 用 `references/cbam-guide.md` 对照核算边界（直接排放+特定间接排放）与缺省值规则。
- 引用 `carbon-accounting`/`carbon-footprint` 的排放数据与因子（其因子来自各自数据层查询）。

### 4. 编制与提交申报
- 收集生产数据与排放数据，编制 CBAM 申报表。
- 过渡期（报告义务）与正式期（证书购买）规则不同，确认所处阶段。

### 5. 核查应对
- 按 `references/cbam-guide.md` 的核查要点准备数据证据。
- 委托具备资质的核查机构（如需）核验排放数据。

### 6. 合规策略规划（含标注）
- 评估减排与数据质量改进、成本影响与长期策略。
- 输出中标注数据层查询结论（命中/未覆盖）与欧盟规则来源（法规编号/版本/日期）。
- 交付：申报表走 `sheet`，合规说明走 `word`/`lark-doc`。

## 规范
- CBAM 规则、覆盖范围与缺省值随欧盟立法更新，以最新官方文件为准。
- 核算边界与缺省值使用规则严格核对，避免多报/漏报。
- 涉及真实出口申报，建议专业机构（欧盟认可核查机构）介入。

### 质量保证与数据规范
- **规则时效原则**：CBAM 规则处于快速更新中（覆盖范围、缺省值、申报模板等），必须以欧盟最新官方文件为准。
- **边界准确原则**：严格按照 CBAM 规定的核算边界（直接排放 + 特定间接排放）执行，不多算也不少算。
- **实测优先原则**：优先使用企业实测数据，缺省值仅在无法获得实测数据时使用，且需符合 CBAM 规定的使用条件。
- **证据留存原则**：所有活动数据、排放因子、计算过程、支撑文件须完整留存，确保欧盟海关或核查机构可核查。
- **合规先行原则**：过渡期报告义务虽是"报告"而非"缴费"，但不实或遗漏申报可能导致罚款，须严肃对待。
- 完成 CBAM 申报准备或核算后，应使用 `references/quality-checklist.md` 逐项自检，通过后方可提交。

### 来源与引用规范
- CBAM 法规、实施条例、缺省值、指南均引用欧盟官方文件，注明法规编号 / 版本 / 发布日期。
- **实测数据**与**缺省值 / 估算数据**严格区分，缺省值必须注明是 CBAM 官方缺省值还是自行估算。
- 引用优先级：欧盟官方法规（Regulation / Implementing Regulation）> 欧盟委员会官方指南 > EU ETS 核算指南 > IPCC 指南 > 行业协会研究 > 学术文献。
- 产品 CN 编码归类以海关税则为准，编码准确性直接影响适用性判断，应与海关或报关行核实。
- 标准与数据来源的详细清单参见 `references/standards-sources.md`。

### 边界与免责
- 本 Skill 提供 CBAM 合规的方法指导与申报参考，不替代欧盟认可的核查机构与专业法律 / 报关服务。
- 本 Skill 不构成法律、税务或贸易合规建议；企业实际申报是否合规，以欧盟主管机关与海关判定为准。
- 本 Skill 不对企业提供数据的真实性负责，申报责任由申报义务人承担。
- CBAM 立法与实施细则仍在动态调整中（覆盖范围扩展、方法学修订、与 EU ETS 衔接细节），使用时务必核实最新规则。
- 涉及产品归类、原产地认定、海关申报、法律责任等专业问题，建议咨询欧盟当地律师、报关行与合规顾问。

## Resources

- `data/scripts\query_data.py` — 数据层统一查询接口（search-policy CBAM/碳边境），申报前先确认数据层是否覆盖（当前预期为空，标注"数据层未覆盖"）。
- `data/policy\policy_metadata.json` — 政策元数据表（CBAM国内衔接政策）。
- `data/industry\industry_rules.json` — 行业规则表（出口行业的核算标准）。
- `references/cbam-guide.md` — CBAM 覆盖、隐含排放核算、申报与核查要点（数据层暂无对应记录，保留参考）。
- `references/quality-checklist.md` — CBAM 申报与核查应对质量检查清单，用于交付前自检。
- `references/standards-sources.md` — CBAM 领域核心标准、权威数据来源与工具方法学索引。
