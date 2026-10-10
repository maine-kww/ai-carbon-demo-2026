# 行业标签 / 政策类型 → 受影响 Skill 映射表（skill-industry-map）

> 用途：`update_policy_meta.py` 合并政策变更后，据此清单标记"受影响行业"与"受影响 skill"，
> 驱动数据层与 Skill 层的联动更新提示。脚本内 `INDUSTRY_SKILL_MAP` / `POLICY_TYPE_SKILL_MAP` 是本表的机器可读副本，两边必须同步维护。

## 一、行业标签 → 相关 Skill

| 行业标签 | 受影响 skill | 说明 |
|---|---|---|
| 发电 | carbon-trading, carbon-mrv, carbon-accounting | 全国碳市场首批控排行业，配额/核查/核算全链条 |
| 钢铁 | carbon-accounting, carbon-trading, carbon-mrv, green-factory | 2025 年扩围行业，核算+配额+核查+绿色制造 |
| 水泥 | carbon-accounting, carbon-trading, carbon-mrv, green-factory | 2025 年扩围行业，同上 |
| 铝冶炼 | carbon-accounting, carbon-trading, carbon-mrv, green-factory | 2025 年扩围行业（有色金属） |
| 石化化工 | carbon-accounting, carbon-mrv, green-factory | 流程工业核算+未来扩围候选 |
| 造纸 | carbon-accounting, carbon-mrv | 扩围候选行业 |
| 航空 | carbon-trading, carbon-footprint | 2025 年纳入行业 |
| 汽车 | green-factory, supply-chain-carbon, carbon-footprint | 零碳工厂首批行业+供应链碳足迹 |
| 锂电池 | green-factory, supply-chain-carbon, carbon-footprint | 零碳工厂首批行业 |
| 光伏 | green-factory, supply-chain-carbon, carbon-footprint | 零碳工厂首批行业 |
| 电子电器 | green-factory, supply-chain-carbon | 零碳工厂首批行业 |
| 轻工 | green-factory, carbon-accounting | 零碳工厂扩围行业 |
| 机械 | green-factory, carbon-accounting | 零碳工厂扩围行业 |
| 纺织 | green-factory, carbon-accounting | 零碳工厂扩围行业 |
| 建材 | green-factory, carbon-accounting | 零碳工厂扩围行业（含水泥） |
| 有色金属 | green-factory, carbon-accounting | 零碳工厂扩围行业 |
| 算力设施 | green-factory, carbon-footprint | 零碳工厂新行业 |
| CCER（自愿减排） | ccer-development | 自愿减排项目/方法学 |
| 通用（跨行业） | carbon-accounting, carbon-mrv, carbon-footprint | 通则类国标/电力因子等通用文件 |

## 二、政策类型 → 相关 Skill

| 政策类型 | 受影响 skill | 说明 |
|---|---|---|
| 行政法规（如《碳排放权交易管理暂行条例》） | carbon-policy, carbon-trading | 制度顶层 |
| 部门规章（管理办法/试行办法） | carbon-policy, carbon-trading, ccer-development | 含 CCER 办法 |
| 工作方案（扩围/实施方案） | carbon-trading, carbon-mrv, carbon-accounting, carbon-roadmap | 行业扩围、达峰路线图 |
| 配额方案（年度分配） | carbon-trading | 直接改变履约测算 |
| 核算指南（行业） | carbon-accounting, carbon-mrv | 改变核算边界/因子取法 |
| 核查指南（技术规范） | carbon-mrv | 改变核查要求 |
| 国家标准（GB/T） | carbon-accounting, carbon-footprint | 通则/产品碳足迹国标 |
| 排放因子发布（电力碳足迹因子等） | carbon-footprint, carbon-accounting | 因子库参数更新 |
| 激励政策（零碳工厂培育等） | green-factory | 绿色制造/工厂评级 |
| 通知公告（例行） | carbon-trading, carbon-policy | 履约/交易例行安排 |
| 征求意见稿 | carbon-policy | 仅作趋势预警，**不得**作为合规依据，不升级数据状态 |

## 三、联动规则

1. scanner 检出变更 → update 合并时同时输出"受影响行业"并集与"受影响 skill"并集。
2. 受影响 skill 的 SKILL.md 本身**不需改动**（数据驱动改造后，参数都从 `_data/` 查询）；
   但应提示人工：这些 skill 下次被调用时，其结论所依据的政策版本已更新，需重新引用最新文号/日期。
3. `征求意见稿`、行业媒体次级来源检出的线索，一律只进入"待人工确认"队列，不直接升级为"已查证"。
