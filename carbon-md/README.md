# carbon-md — 双碳 Skill 数据驱动体系（v2.0）

面向碳达峰碳中和咨询与落地场景的 **17 个数据驱动 Skill + 四层可进化架构**。  
行业规则、排放因子、政策参数不在 Skill 代码中写死，而是落在可配置、可热更新的数据层。

本目录是 [ai-carbon-demo-2026](../README.md) 的能力内核：根目录 `index.html` 提供咨询台前端，本目录提供可被 Agent / CLI / MCP 调用的 Skill 与数据。

---

## 一、目录结构

```text
carbon-md/
├── README.md                 # 本说明
├── TRANSFORMATION_SPEC.md    # Skill 数据驱动改造规范
├── _acceptance_report.md     # 独立验收报告
├── _data/                    # L1 主数据层（国内口径 + 国际补充因子）
│   ├── industry_rules.json   #   行业规则表
│   ├── policy_meta.json      #   政策元数据表
│   ├── emission_factors.json #   排放因子库（国内 CO2）
│   ├── ghg_factors/          #   国际 CO2e 因子（EPA/eGRID/DEFRA/USEEIO/Ember/EXIOBASE）
│   └── query.py              #   统一查询接口
├── data/                     # 兼容层（分表：policy / industry / factors）
│   └── scripts/query_data.py
├── _runtime/                 # L3 热更新 / 灰度发布 / 回滚
│   ├── registry.py / loader.py / router.py / entry.py
│   └── staging/              # 新版本制品区
└── <17 个 Skill>/            # L2 Skill 层（见下表）
    ├── SKILL.md
    ├── icon.png              # 部分 Skill 附带
    ├── references/           # 方法参考、清单、标准索引
    └── scripts/              # 确定性计算脚本（不算账靠 LLM）
```

**运行路径约定**：脚本内通过 `parents[2]/_data` 定位数据层；CLI 请在 `carbon-md/` 根目录执行。  
文中的 `_data/...`、`data/...` 均相对本目录。

---

## 二、17 个 Skill 一览

| Skill | 面向场景 | 主要产出 |
|-------|----------|----------|
| `carbon-accounting` | 组织温室气体核算与报告 | 清单、排放量、核算报告 |
| `carbon-footprint` | 产品碳足迹 PCF（ISO 14067） | PCF、LCA 边界与报告 |
| `carbon-roadmap` | 碳达峰 / 碳中和路径 | 基线、阶段目标、路线图 |
| `carbon-trading` | 配额履约与碳交易 | 缺口测算、成本与策略 |
| `carbon-policy` | 双碳政策法规解读 | 政策要点、合规清单 |
| `carbon-esg` | ESG 与绿色金融披露 | ESG 报告、绿色认定材料 |
| `supply-chain-carbon` | 供应链范围三 | Scope3 核算与采购策略 |
| `carbon-inclusion` | 碳普惠与碳积分 | 机制设计、减排量核算 |
| `carbon-mrv` | MRV 体系与核查迎检 | 监测计划、核查材料 |
| `carbon-finance` | 碳金融产品对接 | 融资额度测算、风险提示 |
| `carbon-sink` | 林业 / 海洋 / 草地碳汇 | 碳汇量核算、项目文件 |
| `ccer-development` | CCER 项目开发 | 方法学匹配、PDD、减排量 |
| `cbam-compliance` | 欧盟 CBAM 申报 | 适用性判断、隐含碳、申报 |
| `green-factory` | 绿色工厂 / 园区申报 | 自评、差距分析、申报书 |
| `climate-adaptation` | 气候适应与转型金融 | 风险评估、转型融资对接 |
| `carbon-system` | 企业碳管理体系 | 组织、制度、流程与评审 |
| `carbon-policy-monitor` | 政策监控（第 17 个） | 变更清单、数据层联动更新 |

每个 Skill 目录至少包含 `SKILL.md`；含计算的 Skill 另有 `scripts/`，含方法参考的另有 `references/`。

---

## 三、四层架构

| 层 | 目录 | 职责 |
|----|------|------|
| L1 数据层 | `_data/`（主）、`data/`（兼容） | 行业规则、政策元数据、排放因子；状态三级：已查证 / 估算 / 占位-待核实 |
| L2 Skill 层 | 17 个 Skill 目录 | 只写工作流程；参数一律查数据层 |
| L3 运行时 | `_runtime/` | 注册、版本、灰度路由、promote / rollback |
| L4 监控 | `carbon-policy-monitor/` | 白名单扫描 → 人工确认 → 更新数据层 → 标注受影响 Skill |

### 数据层查询（示例）

```bash
# 在 carbon-md/ 目录下
python _data/query.py industry steel
python _data/query.py policy --keyword 配额
python _data/query.py factor --energy electricity --year 2022
python _data/query.py ghg --source ember --fuel electricity
python _data/query.py stats
```

Python 内：

```python
from query import query_industry, query_policy, query_factor, query_ghg
query_industry(行业名称="钢铁")
query_policy(关键词="配额方案", 适用行业="钢铁")
query_factor(能源类型="electricity", 年份=2022, 地区="全国")
query_ghg(源编码="ember", 地区="CN", category="electricity")
```

### 两套因子口径（不可混用）

- **国内官方 CO2**：`query_factor`（如电力 0.5366 tCO2/MWh = 2022），用于国内碳市场、产品标识。
- **国际 CO2e**：`query_ghg`（含 CH4/N2O，AR5 GWP），用于海外工厂、美欧出口对标。

### 热更新（政策变了不停机）

```bash
python _runtime/entry.py manage list
python _runtime/entry.py run <skill> --user <id>   # 一致性哈希灰度
python _runtime/entry.py manage promote <skill>
python _runtime/entry.py manage rollback <skill>
python _runtime/entry.py demo
```

---

## 四、新增行业 / 更新政策（不改 Skill 代码）

1. `_data/industry_rules.json` 追加行业记录（核算标准 / 配额方法 / 间接排放 / 核查要求）；
2. `_data/emission_factors.json` 补该行业因子（带来源与版本）；
3. `_data/policy_meta.json` 补适用政策（文号、时效、适用行业）；
4. 用 `query_*` 抽查；
5. 经 `_runtime` staging → 小流量 → promote。

`carbon-policy-monitor` 负责发现政策变更；自动结果一律标记 `占位-待核实`，人工确认后再转正。

---

## 五、边界说明

- CBAM 属欧盟法规，国内政策表未覆盖时按 Skill 流程标注「数据层未覆盖」，以 `references/` 中欧盟规则为参考。
- LULUCF / 林业碳汇计量因子暂无分库，`carbon-sink` 回退 `references/` 并标注 legacy。
- 数据状态必须透传到输出，禁止把「估算 / 占位」当作「已查证」。

---

## 六、验收

独立验收整体 PASS（A–F），细节见 [`_acceptance_report.md`](_acceptance_report.md)。  
改造规范见 [`TRANSFORMATION_SPEC.md`](TRANSFORMATION_SPEC.md)。
