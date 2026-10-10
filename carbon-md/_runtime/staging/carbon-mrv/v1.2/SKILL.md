---
name: carbon-mrv
description: MRV【灰度 v1.2】：本次发版误删了 scripts 目录。
---

# Carbon MRV  MRV 体系搭建与核查准备

## Overview

按碳市场 MRV（监测-报告-核查）制度要求，为企业搭建排放数据管理体系并做好核查准备。核心产出：监测计划 → 数据收集与质控 → 排放报告 → 核查迎检材料。MRV 是配额清缴（`carbon-trading`）与合规（`carbon-policy`）的数据基础。

本 Skill 为**数据驱动模式**：适用 MRV 制度、核算标准、行业监测/核查要求、排放因子、政策依据一律从 `data/` 数据层动态查询，不在本文件写死具体行业参数（标准编号、因子数值、政策文号、留存年限等）。

## 数据层（MRV 搭建与核查前必读）

适用 MRV 制度、核算标准、行业监测/核查要求、排放因子、政策依据一律从 `data/` 数据层动态查询，**不在本 Skill 中写死具体行业参数**（标准编号、因子数值、政策文号、留存年限等）。

| 内容 | 数据文件 | 统一查询命令 |
|---|---|---|
| 行业规则表（MRV要求、核查要求、数据质量要求） | `data/industry/industry_rules.json` | `python data/scripts/query_data.py get-industry <行业名>` |
| 政策元数据表（MRV相关政策、核算指南） | `data/policy/policy_metadata.json` | `python data/scripts/query_data.py search-policy <关键词>` |
| 电网排放因子库 | `data/factors/grid_electricity_factors.json` | `python data/scripts/query_data.py get-grid-factor --year <年份> --region <区域>` |
| 化石燃料因子库 | `data/factors/fossil_fuel_factors.json` | `python data/scripts/query_data.py get-fuel-factor <燃料类型>` |
| 工业过程因子库 | `data/factors/industrial_process_factors.json` | `python data/scripts/query_data.py get-process-factor <行业名>` |
| 数据版本号 | — | `python data/scripts/query_data.py version` |

> 运行路径：在 `carbon-md/` 根目录下执行上述命令。

数据状态约定：数据层每条记录含 `confidence` 或 `status` 字段，引用时必须透传，不得把估算/占位当已查证输出。
## Workflow

### 1. 确认适用制度、核算对象所在行业与报告期
- 询问或确定：适用 MRV 制度（全国碳市场 / 地方试点 / 自愿减排 CCER）、核算主体所在行业、报告期年份、所在地区、核算边界。
- 若行业不在 `industry_rules.json`：提示"该行业规则未建立/未纳入碳市场"，采用估算口径并在输出中标注。

### 2. 从行业规则表查询行业 MRV 与核查规则（query_industry + query_policy）
- 调用 `query.py` 的 `query_industry(行业名称/行业代码)`，获取该行业：核算标准（GB/T 编号及版本）、排放因子来源、是否覆盖间接排放、核查机构要求与核查时间节点。
- 执行 `python data/scripts/query_data.py search-policy 核查/核算/报告, 适用行业=...)`，获取适用的核算报告指南、核查技术指南、MRV 管理办法等，记录政策依据的**文号、发文机关与发布日期**。
- 读取 `references/mrv-guide.md` 对照通用的监测计划要素与核查准备清单（制度细节以数据层为准）。

### 3. 从排放因子库查询因子（query_factor）
- 按 行业 / 年份 / 能源类型 / 地区 执行 `python data/scripts/query_data.py get-fuel-factor / get-grid-factor / get-process-factor（按因子类别选择）`；多条命中时优先"已查证"记录；传入英文 fuel_type（coal/electricity/gas/heat…）即可命中库内中文能源类型。
- 数据层查不到（或命中记录因子值为空）时，回退 `references/` 中的历史参考值，并在输出明确标注"legacy 回退"。

### 4. 执行台账与折算（scripts/mrv_tracker.py）
- 用 `scripts/mrv_tracker.py` 管理活动数据台账（收集、折算、单位核验）。
- 行内显式给出排放因子 → 直接使用（兼容原行为，标注 legacy/手动）；未给出时用 `--industry / --year / --region` 自动从数据层查询填充。
- 建立数据质量控制（交叉核对、异常识别、文档留存）。

### 5. 输出标注（必做）
- 在监测计划、排放报告与迎检材料中标注：**核算/MRV 标准版本**（来自行业规则表）、**因子来源**（机构 + 年份 + 版本 + 数据状态）、**政策依据的文号、发文机关与日期**（来自政策元数据表）、数据状态（已查证/估算/占位-待核实）。
- 按 `references/mrv-guide.md` 与 `references/quality-checklist.md` 准备核查清单并逐项自检，配合第三方核查机构现场核查、回应发现项并闭环整改。

## 规范
- 监测与报告须符合数据层查询到的适用 MRV 规则，数据真实、准确、完整、可核查；具体留存年限、计量精度、核查时限以制度原文为准。
- 计量仪表校准、数据留存按数据层政策依据执行；不得擅自降低标准。
- 核查发现项须闭环整改；涉及重大数据问题及时说明。

### 质量保证与数据规范
- **数据真实原则**：所有监测与报告数据必须基于真实的计量记录、票据、台账，严禁伪造或篡改。
- **方法合规原则**：核算方法、监测频次、计量精度严格遵循数据层查询到的适用 MRV 指南与技术规范，不随意降低标准。
- **全程可追溯原则**：从原始凭证 → 数据台账 → 计算过程 → 报告结果，链条完整、可逆向核查。
- **质控闭环原则**：建立数据采集、录入、审核、异常处理、缺失补全的质量控制流程，每个环节有责任人。
- **持续改进原则**：每年核查后复盘数据质量薄弱点，针对性改进监测方法与管理流程。
- 完成体系搭建或核查准备后，应使用 `references/quality-checklist.md` 逐项自检，通过后方可提交或迎检。

### 来源与引用规范
- MRV 规则、核算方法、排放因子均需标注来源（主管部门、文件名称、文号、发布年份）；优先引用数据层透传的 `来源/文号/发布日期/数据状态`。
- **实测数据**（有计量记录、发票、化验报告）与**缺省 / 估算数据**严格区分，缺省值必须注明依据与适用条件。
- 引用优先级：生态环境部发布的行业核算与报告指南 > 国家温室气体排放因子数据库 > IPCC 指南 > 行业协会标准 > 学术文献。
- 涉及地方试点与全国碳市场规则差异时，应明确适用范围，不混用不同制度的方法与参数。
- 标准与数据来源的历史清单参见 `references/standards-sources.md`（历史参考，以数据层为准）。

### 边界与免责
- 本 Skill 提供 MRV 体系建设方法论与核查准备指导，不替代第三方核查机构的正式核查工作。
- 本 Skill 不构成法律、合规或投资建议；企业实际报告能否通过核查、是否合规，以主管部门与核查机构结论为准。
- 本 Skill 不对企业提供数据的真实性、准确性负责，数据责任由企业承担。
- MRV 政策与指南可能随碳市场建设动态调整，相关规则以主管部门最新文件（及数据层记录）为准。
- 涉及计量器具校准、CEMS 安装运维等专业工作，应由具备相应资质的机构执行。

## Resources

- `data/scripts\query_data.py` — 数据层统一查询接口（行业规则/政策/排放因子），MRV 搭建与核查前必用。
- `data/industry\industry_rules.json` — 行业规则表（MRV要求、核查要求、数据质量等级）。
- `data/policy\policy_metadata.json` — 政策元数据表（MRV相关政策、核算指南）。
- `data/factors\` — 排放因子库（电网/化石燃料/工业过程 三类）。
- `references/mrv-guide.md` — 监测-报告-核查制度要点、监测计划要素与核查准备清单（历史参考）。
- `references/mrv-guide.md` — 监测-报告-核查制度要点、监测计划要素与核查准备清单（历史参考）。
- `references/quality-checklist.md` — MRV 体系与核查准备质量检查清单，用于交付前自检。
- `references/standards-sources.md` — MRV 领域核心标准、权威数据来源与工具方法学索引（历史参考，以数据层为准）。
- `scripts/mrv_tracker.py` — 活动数据台账管理与单位核验脚本，支持数据层因子自动查询与 legacy 回退标注。

> 计算工具使用本地 Python 环境执行；所有数字须注明数据来源与因子年份，禁止编造活动数据。
