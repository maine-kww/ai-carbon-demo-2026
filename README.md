# AI Carbon Demo 2026

**双碳 AI 咨询落地**：用 AI 推动双碳咨询服务落地。  
根目录 `index.html` 是 V1.0 前端原型（本地双击即可打开）：售前诊断 → 公司情况填报 → 双碳方案生成 → 五阶段交付框架 → 证据链与变更留痕。

## 仓库结构

| 路径 | 说明 |
|------|------|
| [`index.html`](index.html) | 双碳方案落地系统 · 资深双碳管理咨询顾问控制台（前端原型） |
| [`carbon-md/`](carbon-md/) | **17 个双碳 Skill + 数据层 + 热更新运行时**（能力内核） |

## carbon-md 能力摘要

数据驱动 Skill 体系 v2.0：行业规则 / 排放因子 / 政策元数据集中在 `_data/`，Skill 只写流程，参数动态查询。

| 类别 | Skill |
|------|--------|
| 核算与足迹 | `carbon-accounting` `carbon-footprint` `supply-chain-carbon` |
| 目标与路径 | `carbon-roadmap` `carbon-system` `climate-adaptation` |
| 市场与金融 | `carbon-trading` `carbon-finance` `ccer-development` `carbon-sink` `carbon-inclusion` |
| 合规与披露 | `carbon-policy` `carbon-esg` `carbon-mrv` `cbam-compliance` `green-factory` |
| 知识保鲜 | `carbon-policy-monitor` |

完整说明、查询接口与热更新命令见 [`carbon-md/README.md`](carbon-md/README.md)。

## 本地预览

```bash
# 仅前端
start index.html

# Skill 数据层自检（在 carbon-md/ 下）
cd carbon-md
python _data/query.py stats
python _runtime/entry.py manage list
```

## 项目进展

- ✅ V1.0 前端原型（`index.html`，含 GHG / ISO / CCER 框架）
- ✅ 17 个双碳 Skill 数据驱动化（`carbon-md/`，含验收报告）
- ⏭ 下一阶段：招募 5 位行业专家验证业务逻辑并收集真实反馈
