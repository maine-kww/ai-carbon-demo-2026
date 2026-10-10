# Skill 层数据驱动改造规范（TRANSFORMATION_SPEC）

> 版本 1.0 | 2026-10-09 | 适用：carbon-md 下全部 16 个 skill 的数据驱动改造
> 配套范例：`carbon-accounting/`（已按本规范完成改造，改造时先读该 skill 的 SKILL.md 作为模板）

## 1. 目标

把"行业"和"政策"从写死在 Skill 里的硬编码，变成可配置、可热更新的数据层：

- **改造前**：SKILL.md 里写死"按照 GB/T 32150 计算钢铁行业碳排放，使用 2023 年电力因子"。
- **改造后**：SKILL.md 只写工作流程，具体参数（核算标准、排放因子、配额方法、政策依据）从 `_data/` 数据层查询。

效果：新增行业/政策/因子变更时，只需更新数据层（或由 carbon-policy-monitor 自动更新），**不需要改任何 Skill 代码**。

## 2. 数据层路径与接口

| 内容 | 路径 |
|---|---|
| 数据目录 | `_data/` |
| 行业规则表 | `_data/industry_rules.json` |
| 政策元数据表 | `_data/policy_meta.json` |
| 排放因子库 | `_data/emission_factors.json` |
| 统一查询接口 | `_data/query.py` |

Skill 脚本内引用方式（在 skill 的 `scripts/` 下，目录层级为 `skills/scripts/`）：

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "_data"))
from query import query_industry, query_policy, query_factor, get_meta
```

查询函数签名与匹配规则以 `_data/query.py` 的 docstring 为准（CLI 也可直接运行验证）。

**数据状态约定**：每条记录含 `数据状态` 字段，取值 ∈ {已查证, 估算, 占位-待核实}，并带 `来源`/`来源链接`/`更新日期`。Skill 输出中引用数据层内容时，必须透传数据状态与来源标注，不得把"占位/估算"当成"已查证"输出。

## 3. SKILL.md 工作流改造模板

SKILL.md 保留 frontmatter（`name` 不得改动，`description` 可在原语义上扩展说明数据驱动能力），正文 Workflow 按以下骨架改写：

```markdown
## Workflow

### 1. 确认核算/服务对象所在行业与报告期
（询问或确定：行业、年份、地区、核算边界）

### 2. 从行业规则表查询行业规则
调用 query.py 的 query_industry()，获取：核算标准（GB/T 编号及版本）、
排放因子来源、配额分配方法、是否覆盖间接排放、核查机构要求。
若行业不在表中：提示该行业未纳入/未建规则，输出时标注"估算/待核"。

### 3. 从排放因子库查询因子
调用 query.py 的 query_factor()，按 行业/年份/能源类型/地区 查询；
查不到时回退到 references 中的历史参考值并明确标注"legacy 回退"。

### 4. 执行脚本处理（scripts/xxx.py）
传入上一步查询到的标准/因子/参数，执行原有脚本逻辑。

### 5. 输出标注
在输出中标注：核算标准版本、因子来源（机构+年份）、政策依据的文号与日期、
数据状态（已查证/估算/占位-待核实）。
```

**具体 skill 的可选步骤**：碳交易类 skill 把"配额分配规则"改为查行业规则表+政策元数据表；政策类 skill 直接以 `query_policy()` 为主要检索入口；绿色工厂/碳普惠等专项 skill 查对应的行业规则与政策记录。

## 4. 脚本改造规则（增量，禁止重写删档）

1. **保留**每个 skill 已有的 `scripts/*.py` 与 `references/*.md`，在其上做增量改造。
2. 脚本中与数据层相关的硬编码（排放因子、基准值、配额规则、政策文号等）改为：**优先从数据层查询；查询失败时回退原硬编码常量，并在输出中标注 legacy fallback**。
3. 不相关逻辑一律不动；原有 CLI 行为保持兼容（新增参数只增不删）。
4. 文件读写一律 UTF-8（JSON 用 `ensure_ascii=False` + `encoding="utf-8"`）。
5. references 中被数据层取代的写死参数，保留原文件并在相关段落顶部加一行：`> 历史参考，以 _data 数据层为准（2026-10-09）`，不得删除。

## 4b. 能源类型词汇映射（数据层约定，2026-10-09）

数据层 `emission_factors.json` 的 `能源类型` 字段使用中文（如"电力-全国平均""原煤""天然气"），而 skill 输入常用英文 fuel_type（electricity/coal/gas/heat...）。`_data/query.py` 内置 `ENERGY_SYNONYMS` 同义词映射，脚本查库时直接传英文 fuel_type 即可命中（已在范例 calc_emissions.py 验证）。若你的 skill 用到数据层未覆盖的能源词汇，可向 `_data/query.py` 的 `ENERGY_SYNONYMS` 补充条目（这是唯一允许的数据层增量改动），改动后须自测。

## 5. 硬约束

- `name` 字段不得改动；`description` 只可扩展，不可收缩语义。
- 不得删除、重命名、移动任何既有 `scripts/*.py` 与 `references/*.md`。
- 不得改动 `_data/`、`_runtime/`、其他 skill 目录；各改造小组之间范围互斥。
- 所有改动必须是**真实的文件修改**，改造完成后**必须运行脚本验证**（python 实际执行），把运行输出写进交付报告，禁止只改文档不跑代码。

## 6. 改造验收清单（每 skill 一条）

- [ ] SKILL.md Workflow 含"确认行业 → 查行业规则表 → 查排放因子库 → 执行脚本 → 输出标注"五步（或与该 skill 语义等价的数据层查询步骤）
- [ ] SKILL.md 中不再写死行业标准编号/排放因子数值/配额规则等参数（历史值已迁移到 references 并加注）
- [ ] 脚本可运行：`python scripts/xxx.py` 实测通过（记录输出），数据层读取失败时有 legacy 回退
- [ ] references/*.md 全部保留，被取代参数已加"以数据层为准"标注
- [ ] frontmatter name 未变，description 未收缩
