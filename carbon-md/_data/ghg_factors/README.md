# ghg_factors — 国际排放因子补充源

本目录收录 github.com/starrybodies/ghg-calculator (MIT) 的 967 个国际排放因子，
作为 `_data/emission_factors.json`（国内官方口径）的**补充源**，用于国际/出口场景。

## 定位
- **国内官方核算**（碳市场、GB/T、MRV）：用 `emission_factors.json`（生态环境部口径）。
- **国际/出口场景**（CBAM、产品碳足迹对欧、海外工厂范围3、美国支出法）：用本目录。

## 6 个来源
- **defra** 英国政府排放因子(DEFRA): 117 因子, v2025, 英国/国际运输、材料、废弃物(Scope 1/3)
- **egrid** 美国电网排放因子(eGRID): 122 因子, v2024, 美国27个电网子区域的电力排放(Scope 2)
- **ember** Ember 国际电力排放因子: 120 因子, v2024, 全球120个国家电力排放(Scope 2, 含CN)
- **epa** 美国环保署排放因子库(EPA Hub): 113 因子, v2025, 美国固定/移动燃烧、制冷剂(Scope 1)
- **exiobase** EXIOBASE 多区域投入产出: 231 因子, v3.8, 欧盟/中国/日本/印度/巴西/俄罗斯 多区域支出法(Scope 3)
- **useeio** 美国支出法投入产出(USEEIO): 264 因子, v1.3, 美国按NAICS行业的支出法范围3

## 使用
- 直接读 `ghg_factors_index.json`（统一结构，含 CO2e 计算）。
- 或通过 `_data/query.py` 的 `query_ghg()` 接口查询。
- CO2e = CO2 + CH4×28 + N2O×265 (AR5)；单位保留源原始单位。

## 数据状态
所有因子源自 ghg-calculator（MIT 开源），视为已查证来源；
适用性与中国法规场景的差异需人工判断（如 USEEIO 为美元支出法）。