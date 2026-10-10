# calc_emissions.py 输入数据 schema

## CSV 格式

第一行为表头，字段（可省略可选字段）：

| 字段 | 必填 | 说明 |
|---|---|---|
| scope | 是 | 排放范围：1 / 2 / 3 |
| facility | 是 | 排放设施/来源标识 |
| fuel_type | 是 | 能源/排放类型（coal、gas、electricity、heat...） |
| activity_data | 是 | 活动数据数值 |
| unit | 是 | 活动数据单位（t、Nm3、kWh、MWh、GJ、万Nm3...） |
| emission_factor | 是 | 排放因子数值 |
| ef_unit | 是 | 排放因子单位（tCO2/t、tCO2/MWh、tCO2/GJ...） |
| recovery | 否 | 回收/扣除量（tCO2），默认 0 |
| gwp | 否 | 非 CO2 气体的 GWP 折算，默认 1 |

## JSON 格式

```json
[
  {"scope":1,"facility":"boiler-1","fuel_type":"coal","activity_data":100.5,"unit":"t","emission_factor":1.9,"ef_unit":"tCO2/t","recovery":0},
  {"scope":2,"facility":"plant","fuel_type":"electricity","activity_data":120,"unit":"MWh","emission_factor":0.5703,"ef_unit":"tCO2/MWh","recovery":0}
]
```

## 单位折算规则（脚本内置）

- kWh → MWh：除以 1000
- 万Nm3 → Nm3：乘以 10000
- t 燃料按因子单位直接相乘

## 输出

脚本输出：每行分项排放（tCO2e）、按 scope 汇总、按 facility 汇总、总排放量。保留 2 位小数。

## 数据驱动模式（可选，2026-10-09 新增）

提供 `--industry <行业> --year <年份> --region <地区>` 后，某行 `emission_factor` 留空或填 `auto` 时，脚本自动从 `_data/emission_factors.json`（`_data/query.py` 的 `query_factor`）按 (行业, 年份, 能源类型, 地区) 查询因子并填充，输出末尾附"因子来源标注"（来源/版本/数据状态）。

- 行内显式给出 `emission_factor` → 直接使用（兼容原行为，不做查询）。
- 数据层查不到且行内无因子 → 该行跳过并警告，提示参考 `references/emission-factors.md`（legacy 回退）。
- 不传三个参数 → 完全保持原行为。

示例（auto 模式）：

```csv
scope,facility,fuel_type,activity_data,unit,emission_factor,ef_unit,recovery
1,boiler-1,coal,100.5,t,,,0
2,plant,electricity,120000,kWh,auto,,0
```

```bash
python scripts/calc_emissions.py input.csv --industry steel --year 2024 --region 全国
```
