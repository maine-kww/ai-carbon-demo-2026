---
name: carbon-footprint
description: 产品碳足迹核算的专业 Skill。当用户需要按 ISO 14067 / PAS 2050 计算某产品的碳足迹（PCF）、界定产品生命周期系统边界（摇篮到大门/摇篮到坟墓）、收集物料与工艺活动数据、选择背景数据库（Ecoinvent/中国本地数据库）并输出产品碳足迹报告时使用。覆盖生命周期评估（LCA）基本流程、功能单位与分配、产品碳标签认证准备。数据驱动：适用核算标准与版本、行业规则、能源/过程排放因子、GWP 版本与政策依据均从本地数据层（data）动态查询，支持行业扩围与因子年度更新而无需修改本 Skill 代码。
---

# Carbon Footprint 产品碳足迹核算（ISO 14067）

## Overview

按 ISO 14067（产品碳足迹量化）与生命周期评估（LCA）方法，量化某产品全生命周期（或规定边界）的温室气体排放，输出单位产品的碳足迹与可核查报告。核心公式：**PCF = Σ(各生命周期阶段活动数据 × 对应排放因子) ÷ 功能单位产出量**。

本 Skill 为**数据驱动模式**：核算标准版本、行业规则、能源/过程排放因子、GWP 版本、政策依据一律从 `data/` 数据层动态查询，不在本文件写死具体因子数值或标准年份。

## 数据层（核算前必读）

所有行业规则、排放因子、政策依据均从 `data/` 数据层动态查询，**不在本 Skill 中写死任何具体因子数值或标准年份**。新增行业只需在数据层追加记录，无需修改本 Skill 代码。

| 内容 | 数据文件 | 统一查询命令 |
|---|---|---|
| 行业规则表（产品所在行业的核算标准） | `data/industry/industry_rules.json` | `python data/scripts/query_data.py get-industry <行业名>` |
| 电网排放因子库 | `data/factors/grid_electricity_factors.json` | `python data/scripts/query_data.py get-grid-factor --year <年份> --region <区域>` |
| 化石燃料因子库 | `data/factors/fossil_fuel_factors.json` | `python data/scripts/query_data.py get-fuel-factor <燃料类型>` |
| 工业过程因子库 | `data/factors/industrial_process_factors.json` | `python data/scripts/query_data.py get-process-factor <行业名>` |
| 政策元数据表 | `data/policy/policy_metadata.json` | `python data/scripts/query_data.py search-policy <关键词>` |
| 数据版本号 | — | `python data/scripts/query_data.py version` |

> 运行路径：在 `carbon-md/` 根目录下执行上述命令。

数据状态约定：数据层每条记录含 `confidence` 或 `status` 字段，引用时必须透传，不得把估算/占位当已查证输出。

## Workflow

### 1. 定义目标、范围与产品所属行业
- 确认核算对象（产品）、功能单位（如 1 kg 产品、1 件商品）、系统边界（摇篮到大门 / 摇篮到坟墓）、报告期年份、生产地区。
- 识别生命周期阶段：原材料获取 → 生产制造 → 运输 → 使用 → 废弃/回收。
- 确定产品所属行业；先执行 `python data/scripts/query_data.py list-industries` 查看已覆盖行业；若行业不在数据层中：提示"该行业规则暂未纳入数据层"，采用估算口径并在输出中标注。

### 2. 从行业规则表查询行业规则（get-industry + search-policy）
- 执行 `python data/scripts/query_data.py get-industry <行业名>`，获取该行业适用的核算标准（GB/T 编号及版本）、排放因子来源、是否覆盖间接排放、行业指南要求。
- 执行 `python data/scripts/query_data.py search-policy 产品碳足迹/核算, 适用行业=...)`，获取行业产品碳足迹核算/标识认证的技术规范，记录政策依据文号、发文机关与日期。
- 区分初级数据（企业实测/计量）与次级数据（背景数据库），并注明。

### 3. 从排放因子库查询因子
- 按 行业 / 年份 / 能源类型（item）/ 地区 根据因子类别选择相应命令（get-fuel-factor / get-grid-factor / get-process-factor）；多条命中优先"已查证"；英文 fuel_type（electricity/coal/gas/heat…）直接命中中文能源类型。
- 数据层查不到（或命中记录因子值为空）时，回退 `references/footprint-guide.md` 及背景数据库历史值，并在输出标注"legacy 回退"。
- 多产品共用过程时做分配（按质量/经济价值），分配方法在报告中说明。

### 4. 计算碳足迹（scripts/pcf_calc.py）
- 使用 `scripts/pcf_calc.py` 按功能单位折算，输出各阶段分项与总 PCF（kgCO2e/功能单位）。
- 行内显式给出排放因子 → 直接使用（兼容原行为，标注 legacy/手动）；未给出时用 `--industry / --year / --region` 自动从数据层查询填充。
- 非 CO₂ 气体按 GWP 折算（GWP 版本在报告中注明，不混用）。

### 5. 输出报告与标注（必做）
- 按 `references/footprint-guide.md` 组织报告：目标与范围、LCI、分配说明、结果、不确定性。
- 在输出中标注：**核算标准版本**、**因子来源**（机构 + 年份 + 版本 + 数据状态）、**政策依据的文号和日期**、数据状态（已查证/估算/占位-待核实）。
- 交付：报告走 `word`/`lark-doc`，清单表走 `sheet`，阶段贡献可视化配合 `doubao-visualization`。

## 规范
- 功能单位与系统边界必须明确并前后一致；次级数据注明来源与年份（以数据层透传信息为准）。
- 产品碳足迹认证需按数据层查询到的认证技术规范补充第三方评审。
- 不编造活动数据；估算项显式标注。

### 质量保证与数据规范
- **边界一致性原则**：功能单位、系统边界、时间边界在全核算过程中保持一致，中途变更需记录原因与影响。
- **数据分层原则**：优先使用实测初级数据（计量、票据、台账），次级数据（背景数据库）明确标注来源、版本与年份。
- **方法透明原则**：分配方法、取舍规则、GWP 版本、计算公式全部公开可追溯，支持第三方复核。
- **因子时效原则**：排放因子优先选用与核算对象区域匹配、年份最新的数据；中国场景优先使用本地因子（以数据层"已查证"记录为准）。
- **不确定性管理**：关键参数（贡献前 80%）的不确定性需做定性或半定量说明，避免"精确错误"。
- 完成核算后，应使用 `references/quality-checklist.md` 逐项自检，通过后方可输出报告。

### 来源与引用规范
- 所有活动数据、排放因子、换算系数均需标注来源（机构、文件、版本、年份）；优先引用数据层透传的 `来源/版本/数据状态`。
- **事实**（有权威来源的数据）与**假设/估算**（无直接来源的推算值）严格区分，估算值以"【估算】"或"【假设】"前缀标注。
- 引用优先级：官方标准（ISO/国标）> 政府主管部门发布的指南与因子 > 权威机构报告（WRI/WBCSD/IPCC）> 行业协会指南 > 学术文献 > 其他来源。
- 同一参数存在多源差异时，应说明选取理由，优先选择与核算对象区域、行业、时间最匹配的来源。
- 标准与数据来源的历史清单参见 `references/standards-sources.md`（历史参考，以数据层为准）。

### 边界与免责
- 本 Skill 不替代具备资质的第三方核查机构，核算结果用于内部管理或初步评估，不构成正式认证结论。
- 本 Skill 不提供法律、财务、投资决策建议，不就数据真实性承担责任。
- 本 Skill 不处理涉密数据、未公开商业数据的合法性问题，数据提供方应对数据授权与合规负责。
- 次级数据（背景数据库）存在版本更新和区域差异，核算结果可能随数据迭代而变化。
- 若用于产品碳足迹标识、碳标签认证、跨境披露（如 CBAM）等正式场景，须由具备资质的机构进行核查或认证。

## Resources

- `data/scripts\query_data.py` — 数据层统一查询接口（行业规则/政策/排放因子），核算前必用。
- `data/industry\industry_rules.json` — 行业规则表（产品所在行业的核算标准）。
- `data/policy\policy_metadata.json` — 政策元数据表（产品碳足迹认证政策依据）。
- `data/factors\` — 排放因子库（电网/化石燃料/工业过程 三类）。
- `references/footprint-guide.md` — ISO 14067 核算要点、LCA 步骤、边界与分配、数据库选择（历史参考）。
- `references/quality-checklist.md` — 产品碳足迹核算质量检查清单，用于交付前自检。
- `references/standards-sources.md` — 产品碳足迹领域核心标准、权威数据来源与工具方法学索引（历史参考，以数据层为准）。
- `scripts/pcf_calc.py` — 按功能单位计算产品碳足迹（分阶段汇总），支持数据层因子自动查询与 legacy 回退标注。

> 计算工具使用本地 Python 环境执行；所有数字须注明数据来源与因子年份，禁止编造活动数据。
