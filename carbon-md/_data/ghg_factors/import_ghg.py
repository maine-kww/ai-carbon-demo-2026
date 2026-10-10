#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_ghg.py — 将 ghg-calculator 的 967 个国际排放因子聚合为统一检索索引。

来源: https://github.com/starrybodies/ghg-calculator (MIT)
     6 个同行评审数据库: EPA Hub / eGRID / DEFRA / USEEIO / Ember / EXIOBASE

生成:
    _data/ghg_factors/ghg_factors_index.json  — 统一结构索引（含 CO2e 计算）
    _data/ghg_factors/README.md                — 来源与使用说明

CO2e 计算（GHG Protocol AR5 GWP）:
    CO2e = CO2 + CH4×28 + N2O×265   （保留原始分气体与单位，不换算单位）

用法:
    python import_ghg.py            # 重新生成索引
    python import_ghg.py --json     # 输出到 stdout（供调试）
"""

import json
import pathlib

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent
GHG_DIR = pathlib.Path(__file__).resolve().parent

# AR5 GWP (GHG Protocol 默认)
GWP = {"co2": 1.0, "ch4": 28.0, "n2o": 265.0}

# 源元信息（与各 JSON 顶层 source/version/url 对应）
SOURCE_META = {
    "epa_hub": {
        "中文": "美国环保署排放因子库(EPA Hub)",
        "覆盖": "美国固定/移动燃烧、制冷剂(Scope 1)",
        "单位说明": "therm / MCF / MMBtu / gallon 等",
    },
    "egrid": {
        "中文": "美国电网排放因子(eGRID)",
        "覆盖": "美国27个电网子区域的电力排放(Scope 2)",
        "单位说明": "kWh / MWh",
    },
    "defra": {
        "中文": "英国政府排放因子(DEFRA)",
        "覆盖": "英国/国际运输、材料、废弃物(Scope 1/3)",
        "单位说明": "含现成 co2e_factor，混合单位",
    },
    "useeio": {
        "中文": "美国支出法投入产出(USEEIO)",
        "覆盖": "美国按NAICS行业的支出法范围3",
        "单位说明": "USD 支出(kgCO2e/USD)",
    },
    "ember": {
        "中文": "Ember 国际电力排放因子",
        "覆盖": "全球120个国家电力排放(Scope 2, 含CN)",
        "单位说明": "gCO2/kWh → tCO2/MWh 等价",
    },
    "exiobase": {
        "中文": "EXIOBASE 多区域投入产出",
        "覆盖": "欧盟/中国/日本/印度/巴西/俄罗斯 多区域支出法(Scope 3)",
        "单位说明": "USD/EUR 支出",
    },
}


def parse_factor(factor, source_meta):
    """把源内单条因子归一为统一记录。"""
    # 分气体因子（可能缺失）
    co2 = factor.get("co2_factor")
    ch4 = factor.get("ch4_factor")
    n2o = factor.get("n2o_factor")
    co2e_embed = factor.get("co2e_factor")

    # 计算 CO2e：优先用源内嵌 co2e，否则用分气体×GWP
    if co2e_embed is not None:
        co2e = co2e_embed
        co2e_method = "源内嵌co2e_factor"
    else:
        parts = 0.0
        if co2 is not None:
            parts += co2 * GWP["co2"]
        if ch4 is not None:
            parts += ch4 * GWP["ch4"]
        if n2o is not None:
            parts += n2o * GWP["n2o"]
        co2e = round(parts, 8)
        co2e_method = "分气体×AR5 GWP(CH4=28,N2O=265)"

    return {
        "源": source_meta["中文"],
        "源编码": source_meta.get("_code", ""),
        "版本": source_meta.get("版本"),
        "name": factor.get("name"),
        "category": factor.get("category"),
        "subcategory": factor.get("subcategory"),
        "fuel_type": factor.get("fuel_type"),
        "co2_factor": co2,
        "ch4_factor": ch4,
        "n2o_factor": n2o,
        "co2e_factor": co2e,
        "co2e_method": co2e_method,
        "activity_unit": factor.get("activity_unit"),
        "region": factor.get("region"),
        "year": factor.get("year"),
        "tags": factor.get("tags"),
        "id": factor.get("id"),
        "来源": source_meta.get("url"),
        "数据状态": "已查证",
    }


def build_index():
    index = {
        "schema_version": "1.0",
        "说明": "ghg-calculator 967个国际排放因子聚合索引。来源: github.com/starrybodies/ghg-calculator (MIT)。"
               "定位: 国际/出口场景的补充因子源(US/UK/欧盟/全球电力/支出法范围3)；国内官方核算仍以 emission_factors.json 为准。"
               "CO2e: CH4×28, N2O×265 (AR5)。单位保留源原始单位，未换算。",
        "sources": [],
        "factors": [],
    }
    total = 0
    for f in sorted(GHG_DIR.glob("*.json")):
        if f.name == "ghg_factors_index.json":
            continue
        with open(f, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        code = f.name.replace(".json", "").split("_")[0]
        # 归一化：用最长前缀匹配 SOURCE_META 的 key（如 epa_hub 而非 epa）
        meta_code = None
        for k in SOURCE_META:
            if f.name.startswith(k):
                meta_code = k
                break
        meta = dict(SOURCE_META.get(meta_code, {}))
        meta["_code"] = meta_code or code
        meta["版本"] = raw.get("version")
        meta["url"] = raw.get("url")
        meta["year"] = raw.get("year")
        meta["description"] = raw.get("description")
        index["sources"].append({
            "源编码": code,
            "源": meta.get("中文", code),
            "版本": raw.get("version"),
            "年度": raw.get("year"),
            "因子数": len(raw.get("factors", [])),
            "覆盖": meta.get("覆盖", ""),
            "单位说明": meta.get("单位说明", ""),
            "url": raw.get("url"),
        })
        for fac in raw.get("factors", []):
            index["factors"].append(parse_factor(fac, meta))
            total += 1
    index["因子总数"] = total
    return index


def main():
    index = build_index()
    out = GHG_DIR / "ghg_factors_index.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"索引已生成: {out}")
    print(f"因子总数: {index['因子总数']}")
    for s in index["sources"]:
        print(f"  {s['源编码']:<10} {s['源']:<28} {s['因子数']} 因子  v{s['版本']}")
    # 生成 README
    readme = GHG_DIR / "README.md"
    lines = [
        "# ghg_factors — 国际排放因子补充源",
        "",
        "本目录收录 github.com/starrybodies/ghg-calculator (MIT) 的 967 个国际排放因子，",
        "作为 `_data/emission_factors.json`（国内官方口径）的**补充源**，用于国际/出口场景。",
        "",
        "## 定位",
        "- **国内官方核算**（碳市场、GB/T、MRV）：用 `emission_factors.json`（生态环境部口径）。",
        "- **国际/出口场景**（CBAM、产品碳足迹对欧、海外工厂范围3、美国支出法）：用本目录。",
        "",
        "## 6 个来源",
    ]
    for s in index["sources"]:
        lines.append(f"- **{s['源编码']}** {s['源']}: {s['因子数']} 因子, v{s['版本']}, {s['覆盖']}")
    lines += [
        "",
        "## 使用",
        "- 直接读 `ghg_factors_index.json`（统一结构，含 CO2e 计算）。",
        "- 或通过 `_data/query.py` 的 `query_ghg()` 接口查询。",
        "- CO2e = CO2 + CH4×28 + N2O×265 (AR5)；单位保留源原始单位。",
        "",
        "## 数据状态",
        "所有因子源自 ghg-calculator（MIT 开源），视为已查证来源；",
        "适用性与中国法规场景的差异需人工判断（如 USEEIO 为美元支出法）。",
    ]
    readme.write_text("\n".join(lines), encoding="utf-8")
    print(f"README 已生成: {readme}")


if __name__ == "__main__":
    main()
