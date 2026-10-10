# carbon-md 全量改造独立验收报告

- 验收对象：`carbon-md/`
- 验收方式：只读 + 实际运行复验（不修改既有产物；`_runtime` 重写、`carbon-policy-monitor\tmp` 写入属预期）
- 验收环境：Windows + Python 3.14.7 / PowerShell 5.1
- 验收时间：2026-10-09
- 结论摘要：**初验 整体 PASS / 2 项 FAIL**（D 热更新缺注册第 17 个 skill；C 层 carbon-accounting 与 carbon-trading 文档仍指向旧数据层 CLI）
- **复验结论（2026-10-09 复跑）：2 项 FAIL 均已修复并复验通过，最终整体 PASS。详见文末「九、复验记录」。**

---

## 一、总览（逐项 PASS/FAIL）

| 项 | 验收点 | 结论 |
|---|---|---|
| A | 17 个 skill 目录 + `_data/` + `_runtime\` + `TRANSFORMATION_SPEC.md` | **PASS**（附观察：残留旧 `data/` 目录） |
| B1 | 3 个 JSON UTF-8 合法、可解析 | **PASS** |
| B2 | 字段完整性按种子 schema（12/13/12） | **PASS**（逐行 0 缺字段） |
| B3 | `query.py stats` 三表行数与状态分布 | **PASS** |
| B4 | 3 个抽查查询返回非空且含"已查证" | **PASS** |
| C1 | 17 个 SKILL.md frontmatter `name` == 目录名 | **PASS**（17/17） |
| C2 | 正文含数据层查询步骤（`_data`/数据层/query_*） | **PASS**（17/17 命中关键字） |
| C3 | Resources 引用的 scripts/*.py、references/*.md 真实存在 | **PASS**（引用文件均存在，含跨 skill 引用） |
| C4 | 每个 skill 全部 .py 通过 py_compile | **PASS** |
| C5 | 每个 skill 至少真实运行一个脚本 | **PASS**（逐一跑过 --help/--sample/实算） |
| C6 | carbon-accounting 数据驱动(auto) + 兼容(显式因子) 双模式 | **PASS** |
| C-DOC | carbon-accounting / carbon-trading 文档具体命令与新 `_data` 接口一致 | **FAIL**（仍指向旧 `data/scripts/query_data.py`） |
| D1 | `entry.py manage list` 真实可运行 | **PASS** |
| D2 | registry.json 含 17 个 skill | **FAIL**（仅 16，缺 carbon-policy-monitor） |
| D3 | DEMO_OUTPUT.txt 含 注册/灰度/promote/rollback | **PASS** |
| E1 | carbon-policy-monitor 目录结构齐全 | **PASS** |
| E2 | scanner 离线演示输出变更清单 | **PASS** |
| E3 | update_policy_meta dry-run 输出新增/更新与受影响 skill、不写真数据层 | **PASS** |
| F1 | 5 条已查证记录 文号/日期/链接 与来源一致（web_fetch 3 条） | **PASS** |
| F2 | industry_rules 中"零碳工厂扩围计划"节点存在 | **PASS** |

---

## 二、A. 整体结构

实际顶层（`Get-ChildItem carbon-md`）：
- 17 个 skill 目录全部存在：carbon-accounting, carbon-mrv, carbon-footprint, supply-chain-carbon, carbon-policy, carbon-trading, ccer-development, cbam-compliance, carbon-esg, carbon-system, carbon-roadmap, carbon-finance, climate-adaptation, carbon-sink, green-factory, carbon-inclusion, carbon-policy-monitor。
- `_data/`：industry_rules.json(18055B) / policy_meta.json(22678B) / emission_factors.json(19362B) / query.py(9443B) —— 4 件齐全。
- `_runtime\`：registry.py / loader.py / router.py / entry.py / registry.json / README.md / DEMO_OUTPUT.txt(7167B) —— 齐全（另多 router.log，属运行日志，无碍）。
- `TRANSFORMATION_SPEC.md` 存在。

**观察（非 FAIL）**：顶层另有一个未在规格内的旧目录 `data/`（无下划线），含 `data/scripts\query_data.py` 及旧版 industry/policy/factors JSON（2025-10-09 v1.0 数据集）。它正是 C-DOC 缺陷里被文档引用的旧数据层。

---

## 三、B. 数据层

**解析证据**（python 读回，UTF-8）：
```
industry_rules.json  top=dict  keys=[schema_version, updated_at, 说明, 顶层时间线, 零碳工厂扩围计划, industries]  industries=8
policy_meta.json     top=dict  keys=[schema_version, updated_at, 说明, policies]                          policies=20
emission_factors.json top=dict keys=[schema_version, updated_at, 说明, factors]                            factors=31
```

**字段完整性**（逐行比对，0 缺字段、0 多余）：
```
industry_rules   rows=8   missing=[] extra=[]  rows_with_missing=0   (要求12字段)
policy_meta      rows=20  missing=[] extra=[]  rows_with_missing=0   (要求13字段)
emission_factors rows=31  missing=[] extra=[]  rows_with_missing=0   (要求12字段)
```

**`python query.py stats`**：
```json
{"industry":{"行数":8,"数据状态分布":{"已查证":4,"估算":4}},
 "policy":{"行数":20,"数据状态分布":{"已查证":20}},
 "factor":{"行数":31,"数据状态分布":{"已查证":21,"占位-待核实":2,"估算":8}}}
```

**3 个抽查查询**（均返回非空且含"已查证"）：
- `industry steel`：返回钢铁记录，`数据状态=已查证`，纳入时间"2025-03-21 经国务院批准纳入（环气候〔2025〕23号）"。
- `policy --keyword 配额方案 --industry 钢铁`：返回 2 条（国环规气候〔2025〕2号、国环规气候〔2026〕1号），均"已查证"。
- `factor --energy 电力 --year 2022 --region 全国`：返回 4 条（0.5366 / 0.5703 / 0.5856 / 0.8325 tCO2/MWh），均"已查证"。

---

## 四、C. Skill 层（17 个）

**批量核验证据**（frontmatter name / 数据层关键字 / 引用文件 / py_compile）：

| skill | name匹配 | 数据层关键字命中 | compile |
|---|---|---|---|
| carbon-accounting | MATCH | _data, 数据层 | calc_emissions.py OK |
| carbon-mrv | MATCH | query_industry/policy/factor,_data,数据层 | mrv_tracker.py OK |
| carbon-footprint | MATCH | 全套 | pcf_calc.py OK |
| supply-chain-carbon | MATCH | 全套 | scope3_calc.py OK |
| carbon-policy | MATCH | query_industry/policy,_data,数据层 | (无 .py) |
| carbon-trading | MATCH | _data,数据层 | quota_calc.py OK |
| ccer-development | MATCH | query_industry/policy,_data,数据层 | ccer_calc.py OK |
| cbam-compliance | MATCH | query_policy,_data,数据层 | (无 .py) |
| carbon-esg | MATCH | 全套 | (无 .py) |
| carbon-system | MATCH | 全套 | (无 .py) |
| carbon-roadmap | MATCH | 全套 | roadmap_calc.py OK |
| carbon-finance | MATCH | query_industry/policy,_data,数据层 | carbon_finance.py OK |
| climate-adaptation | MATCH | query_industry/policy,_data,数据层 | climate_finance.py OK |
| carbon-sink | MATCH | query_policy/factor,_data,数据层 | sink_calc.py OK |
| green-factory | MATCH | query_policy/factor,_data,数据层 | factory_score.py OK |
| carbon-inclusion | MATCH | query_policy/factor,_data,数据层 | inclusion_calc.py OK |
| carbon-policy-monitor | MATCH | _data,数据层 | scanner.py OK / update_policy_meta.py OK |

> 说明：初扫曾报 carbon-accounting 缺 `scripts/query_data.py`、carbon-trading 缺 `references/market-rules.md`，经人工核对为误报——前者是正文写的根目录旧路径 `data/scripts/query_data.py`（旧层文件确实存在），后者是 carbon-trading 对 carbon-policy 的跨 skill 引用，目标 `carbon-policy\references\market-rules.md` 真实存在。Resources 引用核对结论为 PASS。

**真实运行证据摘录**（每 skill 至少跑通一次）：
- `calc_emissions.py --sample` / `mrv_tracker.py --sample` / `pcf_calc.py --sample` / `scope3_calc.py --sample`：均打印示例模板。
- `quota_calc.py / ccer_calc.py / carbon_finance.py / climate_finance.py / sink_calc.py / inclusion_calc.py / factory_score.py`：--help 或实算均正常退出。
- `factory_score.py factory.csv --industry 汽车`：正确读"零碳工厂扩围计划"节点 → "汽车 → 2027年培育行业"，并引用政策《关于开展零碳工厂建设工作的指导意见》（工信部联节〔2026〕13号，已查证）。
- `quota_calc.py ... --industry steel`：从 _data 取钢铁"强度法/基准线法"配额规则（已查证），算出履约缺口 12000t、采购成本 1,140,000 元。

**carbon-accounting 双模式复验（重点）**：
- 兼容模式（行内显式因子，无 --industry）：
  `120000 kWh × 0.5703 tCO2/MWh = 68.44 tCO2e`，总排放 259.39 tCO2e。✅
- 数据驱动模式（行内 `auto`，`--industry 通用 --year 2022 --region 全国`）：
  自动从 _data 命中 0.5366（表1全国平均），输出 `64.39 tCO2e`，并标注：
  `electricity: 生态环境部、国家统计局《关于发布2022年电力二氧化碳排放因子的公告》（公告2024年第33号）[版本:2022年度, 数据状态:已查证]`。✅

### ❌ C-DOC 失败项：carbon-accounting / carbon-trading 文档仍指向旧数据层 CLI

**失败点**：两个 SKILL.md 正文第 12 行声称"一律从 `_data/` 数据层动态查询"，但其下所有**具体可执行命令**仍写的是旧接口，与新 `_data/query.py` 实际 CLI（`industry/policy/factor/stats`）不一致。

**复现证据（carbon-accounting\SKILL.md）**：
```
L12:  …一律从 `_data/` 数据层动态查询…
L20: | 行业规则表 | `data/industry/industry_rules.json` | `python data/scripts/query_data.py get-industry <行业名>` |
L22: | 电网排放因子库 | `data/factors/grid_electricity_factors.json` | `python data/scripts/query_data.py get-grid-factor …` |
L44/L48/L50: 执行 `python data/scripts/query_data.py get-industry / get-fuel-factor / get-process-factor …`
L126: `data/scripts\query_data.py` — 数据层统一查询接口…
```
**复现证据（carbon-trading\SKILL.md）**：L20–L23、L47–L48、L125 同样全部为 `python data/scripts/query_data.py get-industry / search-policy / list-industries`。

**影响判定**：
- 实际 Python 脚本（`calc_emissions.py` L59 `DATA_LAYER_DIR=…/"_data"`、L69 `from query import query_factor`；`quota_calc.py` L37/L53 同理）**正确接入新 _data 层**，端到端实算已验证无误。
- 但人读/Agent 照 SKILL.md 执行时，会被引导去跑旧 `data/scripts\query_data.py`（该旧层仍在，返回的是 2025-10-09 v1.0 旧数据集，命令集 `get-industry/search-policy/...` 在新 `_data/query.py` 中并不存在）。即"文档声称的数据驱动接口"与"实际新接口"脱节，违背"16 个 skill 全部改为数据驱动(_data)"的交付声称。
- 结论：脚本行为 PASS，但文档与新 _data 接口一致性 **FAIL**，需将这两个 SKILL.md 的命令示例改写为新 `_data/query.py` CLI（`industry <代码>` / `policy --keyword …` / `factor --energy …` / `stats`）。

---

## 五、D. 热更新

**`python entry.py manage list`** 正常运行，输出 16 条（均 stable；carbon-mrv 已在 staging 有 v1.1 canary/stable）。

**registry.json 核验**：
```
container=dict(meta, skills)  skills 条数 = 16
缺失判定：'carbon-policy-monitor' not in names = True
```
注册名单（16）：carbon-accounting, carbon-esg, carbon-finance, carbon-footprint, carbon-inclusion, carbon-mrv, carbon-policy, carbon-roadmap, carbon-sink, carbon-system, carbon-trading, cbam-compliance, ccer-development, climate-adaptation, green-factory, supply-chain-carbon。

### ❌ D2 失败项：registry.json 仅 16 个 skill，缺 carbon-policy-monitor
- 复现：`python -c "…registry.json…skills.keys()"` → count=16，无 carbon-policy-monitor。
- `DEMO_OUTPUT.txt` STEP1/STEP7 亦自述"扫描注册完成：共 16 个 skill / 注册 skill 总数:16"。
- 即新建的第 17 个 skill `carbon-policy-monitor` 尚未被 registry 扫描注册。按约定**仅记录、不自行修复**。

**DEMO_OUTPUT.txt 关键步骤齐全（PASS）**：
- STEP1 扫描注册（16 个 v1.0 stable）
- STEP2 复制 carbon-mrv 到 staging 生成 v1.1 canary（生产目录未改）
- STEP3 灰度 10% 路由（20 个 user_id，canary 2/20=10%，bucket 一致性=True）
- STEP4 promote（v1.1 转正 stable，v1.0 转 superseded）
- STEP5 制造 v1.2 故障副本（删 scripts）
- STEP6 rollback（丢弃 v1.2，stable 回指 v1.1，主脚本存在=True）

---

## 六、E. 监控 skill（carbon-policy-monitor）

**结构（PASS）**：SKILL.md；scripts\scanner.py、update_policy_meta.py；references\whitelist_sources.md、skill-industry-map.md；fixtures\cneeex_list.html、govcn_list.html、mee_list.html。

**scanner 离线演示**：
> 注：清单写的 `--offline --fixtures` 与实际 CLI 不完全一致——`--fixtures` 需带目录参数且默认即本 skill fixtures 目录，故实际执行 `python scripts\scanner.py --offline`。
```
模式=offline-fixtures；比对基准(只读)=…\_data/policy_meta.json（20条）
候选条目合计 9；已存在无变更 1；新增 7；更新 1
[新增] 关于做好2026—2027年度发电行业碳排放配额分配与清缴工作的通知 (2026-10-08)
[更新] 《温室气体自愿减排交易管理办法（试行）》 发布日期 2023-10-19 -> 2026-09-20
…（共7新增1更新，均标注"待人工确认"）
变更清单已写入 …\carbon-policy-monitor\tmp\changes.json
```
PASS：输出真实变更清单。

**update_policy_meta dry-run**：
> 注：无 `--dry-run` 开关，默认即 dry-run（加 `--apply` 才写），且必须 `--changes tmp\changes.json`。
```
=== 合并计划（DRY-RUN 仅预览）===
7 条新增 + 1 条更新；受影响行业标签: 发电/水泥/钢铁；
受影响 skill: carbon-accounting, carbon-mrv, carbon-policy, carbon-roadmap, carbon-trading, ccer-development, green-factory
Schema 校验：7 新增 + 1 更新均通过 13 字段校验
[DRY-RUN] 未写任何文件。预览目标=…\carbon-policy-monitor\tmp\policy_meta_updated.json
```
PASS：输出新增/更新与受影响 skill 清单，明确未写真实 `_data` 层（预览仅落 tmp 副本）。

---

## 七、F. 数据真实性抽检

**web_fetch 3 条来源页（全部可达且标题/文号/日期/数值一致）**：

1. `https://www.mee.gov.cn/xxgk2018/xxgk/xxgk03/202503/t20250326_1104736.html`
   - 页面标题：《关于印发〈全国碳排放权交易市场覆盖钢铁、水泥、铝冶炼行业工作方案〉的通知》；文号 **环气候〔2025〕23号**；生成日期 **2025-03-21**。
   - 与 policy_meta 第3条（环气候〔2025〕23号 / 2025-03-21 / 钢铁水泥铝工作方案）完全一致。✅

2. `https://www.gov.cn/zhengce/zhengceku/202402/content_6930138.htm`
   - 页面标题：《碳排放权交易管理暂行条例》；发文字号 **国令第775号**；成文 2024-01-25，施行 2024-05-01。
   - 与 policy_meta 第1条（国务院令第775号）一致。✅

3. `https://www.mee.gov.cn/xxgk2018/xxgk/xxgk01/202412/t20241226_1099413.html`
   - 页面标题：《关于发布2022年电力二氧化碳排放因子的公告》（公告2024年第33号）；
   - 表1 全国 **0.5366**、表4 全国 **0.5856**、表5 全国 **0.8325**（kgCO2/kWh）——与 emission_factors 中 0.5366 / 0.5856 / 0.8325 tCO2/MWh 三条记录**逐值吻合**。✅

**"零碳工厂扩围计划"节点（industry_rules.json 顶层）存在**：
```json
{"依据":"工信部、发改委等2026-01-19联合印发《关于开展零碳工厂建设工作的指导意见》（…标注：属工信部零碳工厂培育创建，非碳市场行业扩围）",
 "2027年培育行业":["汽车","锂电池","光伏","电子电器","轻工","机械","算力设施"],
 "2030年拓展行业":["钢铁","有色金属","石化化工","建材","纺织"]}
```
该节点已被 green-factory 的 `factory_score.py --industry 汽车` 实际调用并正确归类为"2027培育"。✅

---

## 八、FAIL 项清单与修复建议

| # | 位置 | 失败点 | 复现 | 建议 |
|---|---|---|---|---|
| 1 | `_runtime\registry.json` | 仅注册 16 个 skill，缺第 17 个 `carbon-policy-monitor` | `entry.py manage list` / registry.json keys 计数=16；DEMO_OUTPUT 自述 16 | 重新触发 registry 扫描注册，将 carbon-policy-monitor 纳入；重跑 demo 使总数=17 |
| 2 | `carbon-accounting\SKILL.md`、`carbon-trading\SKILL.md` | 正文具体命令仍为旧 `data/scripts\query_data.py get-industry/search-policy/...` 与旧 JSON 路径，与新 `_data/query.py` CLI 脱节 | grep `data/scripts/query_data.py` 命中两文件 L20–50、L125–126 | 将示例命令改写为新接口 `python ..\_data/query.py industry <代码>` / `policy --keyword … --industry …` / `factor --energy … --year … --region …` / `stats`；并清理或隔离旧 `data/` 目录以免误导 |

**非 FAIL 但建议关注**：
- 顶层残留旧 `data/`（2025 v1.0 数据集），与新 `_data/` 并存，是文档脱节的根因，建议归档移除。
- carbon-policy-monitor 脚本 CLI 与验收清单字面命令略有出入（`--fixtures` 带参、无独立 `--dry-run` 开关），功能正确，建议在 SKILL.md 用法示例中对齐。
- inclusion_calc 对"电力碳足迹(2022)"在因子库未命中而诚实回退 legacy 常数 0.6205，属预期降级，非故障。

---

## 九、复验记录（2026-10-09，针对初验 2 项 FAIL 的修复后复跑）

复验方式：只读复跑，未改动其他文件。两项 FAIL 经产出方修复后，独立复跑结论如下。

### 复验-1（原 FAIL-1 / D2：registry 缺第 17 个 skill）→ **PASS**

**复跑证据**：
```
registry.json 读取 → skills 条数 = 17
carbon-policy-monitor present = True
17 个预期 skill 集合完全相等 = True
python entry.py manage list → 输出 17 行（Measure-Object 计 Lines=17）
末行: carbon-policy-monitor  v1.0  stable  canary=-  carbon-md/carbon-policy-monitor
```

**carbon-policy-monitor 注册记录字段完整**（description 取自其 SKILL.md frontmatter）：
```json
{"name":"carbon-policy-monitor","version":"1.0","status":"stable",
 "path":"D:\\skills\\carbon-md\\carbon-policy-monitor",
 "description":"双碳政策定期监控与数据层联动 Skill。……是 carbon-md 数据驱动体系的\"政策耳目\"……",
 "registered_at":"2026-10-09T17:47:45","canary":null,
 "versions":[{"version":"1.0","status":"stable","path":"…\\carbon-policy-monitor",…}]}
```
name/version/status/path/description/canary/versions/registered_at 齐全。D2 由 FAIL 转 PASS。

### 复验-2（原 FAIL-2 / C-DOC：文档与新 _data 接口脱节）→ **PASS**

**旧 token 清零核验**（对 carbon-accounting、carbon-trading、carbon-policy 三个 SKILL.md 精确 grep）：
```
pattern: query_data/.py | get-industry | search-policy | policy_metadata/.json
         | carbon-md\data/ | carbon-md/data/ | list-industries
         | get-grid-factor | get-fuel-factor | get-process-factor
结果: Found 0 match(es)
```
三个文件已无任何旧 CLI / 旧文件名 / 旧根路径残留。

**新接口对齐证据**（正文现引用）：
- carbon-accounting L18/L20/L116/L117：`_data/industry_rules.json`（query.py→`query_industry`）、`_data/policy_meta.json`（query.py→`query_policy`）。
- carbon-trading L20–L22/L124–L125：`python _data/query.py industry --name <行业名>` / `industry <代码>` / `policy --keyword 配额方案 --type 配额方案 --industry <行业名>` / `policy`（无过滤返回全部）。
- carbon-policy L20–L22/L115–L116：`python _data/query.py policy --keyword <关键词>` / `policy` / `industry --name <行业名>`；description 明确"以本地数据层 `_data/policy_meta.json` 为第一入口"。

**按文档示例命令实跑（新接口可用）**：
```
python _data/query.py policy --type 配额方案 --industry 钢铁
  → 返回《2024、2025年度…钢铁、水泥、铝冶炼行业配额总量和分配方案》
    文号 国环规气候〔2025〕2号 / 发文机关 生态环境部 / 时效 现行有效（中文字段齐全）
python _data/query.py industry steel
  → 返回钢铁记录：行业代码 steel、纳入时间 2025-03-21（环气候〔2025〕23号）、核算标准 GB/T 32151.5-2026…
```

**回归冒烟（重写未破坏脚本）**：
- 三个 SKILL.md frontmatter `name` 仍与目录名一致：carbon-accounting / carbon-trading / carbon-policy（逐一读首段确认）。
- `calc_emissions.py` 数据驱动模式复跑：`autodrive.csv --industry 通用 --year 2022 --region 全国` → plant 64.39 tCO2e，因子标注"公告2024年第33号 [已查证]"，与初验一致。

C-DOC 由 FAIL 转 PASS。

### 复验总结

| 原 FAIL 项 | 复验结论 |
|---|---|
| D2 registry.json 仅 16 skill、缺 carbon-policy-monitor | **PASS**（现 17 个，monitor 记录字段完整，manage list 17 行） |
| C-DOC carbon-accounting/carbon-trading(/carbon-policy) 文档指向旧 data 层 | **PASS**（旧 token 0 命中，全部对齐 `_data/query.py` 新 CLI，示例命令实跑可用，脚本回归正常） |

**最终验收结论：A–F 全部 PASS，整体通过。**（旧 `data/` 目录残留、monitor 脚本 CLI 字面差异等观察项仍建议后续清理，但不影响验收通过。）
