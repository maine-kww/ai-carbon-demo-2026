#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pcf_calc.py — 产品碳足迹（PCF）分阶段计算（数据驱动版）

按生命周期阶段，将活动数据 × 排放因子，再按功能单位产出折算为 kgCO2e/功能单位。

用法:
    python pcf_calc.py input.csv [--functional-unit "1 kg"] [--output 1000]
    python pcf_calc.py input.csv --industry 铝冶炼 --year 2021 --region 全国
        # 数据驱动模式：某行 emission_factor 留空或填 "auto" 时，
        # 自动从 _data 排放因子库按 (行业, 年份, 能源类型(item), 地区) 查询填充，
        # 并在输出中标注因子来源/版本/数据状态。行内已给因子时直接使用（legacy/手动）。
    python pcf_calc.py --sample

CSV 字段: stage,item,activity_data,unit,emission_factor,ef_unit,gwp
    item 同时作为能源类型关键词（如 electricity/coal/电力；支持英文 fuel_type 同义词）。
--output 功能单位产出量（如 1000 kg），缺省 1（则结果即总排放不作折算）
"""

import csv
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def lookup_factor(industry, year, fuel_type, region):
    """从 _data 排放因子库按 (行业, 年份, 能源类型, 地区) 查询因子。
    返回 (ef, ef_unit, annotation)；查不到或命中记录因子值为空时返回 (None, None, reason)。"""
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_factor
    except Exception as exc:
        return None, None, f"数据层不可用({exc})"
    records = query_factor(行业=industry, 年份=year, 能源类型=fuel_type, 地区=region)
    verified = [r for r in records if r.get("数据状态") == "已查证"]
    chosen = verified[0] if verified else (records[0] if records else None)
    if chosen is None or chosen.get("因子值") is None:
        return None, None, None
    annotation = (
        f"{chosen.get('来源', '未注明来源')} "
        f"[版本: {chosen.get('版本', '?')}, 数据状态: {chosen.get('数据状态', '?')}]"
    )
    return float(chosen["因子值"]), chosen.get("单位"), annotation


def normalize(ad, unit, ef_unit):
    v = float(ad)
    u = str(unit).strip().lower().replace(" ", "")
    eu = str(ef_unit).strip().lower().replace(" ", "")
    if u == "kwh" and "/mwh" in eu:
        v = v / 1000.0
    elif u in ("万nm3", "万立方米") and "/nm3" in eu and "万nm3" not in eu:
        v = v * 10000.0
    return v


def parse_args(argv):
    """手动解析参数，保持与原脚本兼容：第一个非 -- 参数为输入路径。"""
    path = None
    fu = "功能单位"
    output = 1.0
    industry = year = region = None
    sample = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--sample":
            sample = True
        elif a == "--functional-unit" and i + 1 < len(argv):
            fu = argv[i + 1]; i += 1
        elif a == "--output" and i + 1 < len(argv):
            output = float(argv[i + 1]); i += 1
        elif a == "--industry" and i + 1 < len(argv):
            industry = argv[i + 1]; i += 1
        elif a == "--year" and i + 1 < len(argv):
            year = argv[i + 1]; i += 1
        elif a == "--region" and i + 1 < len(argv):
            region = argv[i + 1]; i += 1
        elif a in ("-h", "--help"):
            print(__doc__); sys.exit(0)
        elif path is None:
            path = a
        i += 1
    return path, fu, output, sample, industry, year, region


def main():
    path, fu, output, sample, industry, year, region = parse_args(sys.argv[1:])
    if sample:
        print("stage,item,activity_data,unit,emission_factor,ef_unit,gwp")
        print("原材料,铝锭,2.0,t,1.8,tCO2/t,1")
        print("生产,电力,500,kWh,0.5703,tCO2/MWh,1")
        return
    if path is None:
        print(__doc__); return

    data_driven = industry is not None or year is not None or region is not None
    total = 0.0
    stages = {}
    annotations = []
    legacy = []
    skipped = []
    data_filled = set()
    print(f"功能单位: {fu}   产出量: {output}")
    with open(path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"{'stage':<12}{'item':<14}{'emission(kgCO2e)':<18}")
    for idx, r in enumerate(rows):
        raw_ef = str(r.get("emission_factor") or "").strip()
        if data_driven and (raw_ef == "" or raw_ef.lower() == "auto"):
            ef, ef_unit, ann = lookup_factor(industry, year, r.get("item"), region)
            if ef is not None:
                r["emission_factor"], r["ef_unit"] = ef, ef_unit
                annotations.append(f"{r.get('item')}: {ann}")
                data_filled.add(idx)
            else:
                skipped.append(idx + 1)
                msg = "数据层未查到可用因子"
                if ann:
                    msg += f"（{ann}）"
                print(f"[警告] 第{idx + 1}行 {msg}；请补充行内 emission_factor 或参考 references/footprint-guide.md")
                continue
        try:
            ef = float(r["emission_factor"])
        except (TypeError, ValueError, KeyError):
            skipped.append(idx + 1)
            print(f"[警告] 第{idx + 1}行 emission_factor 无效或缺失，已跳过")
            continue
        if data_driven and idx not in data_filled and raw_ef not in ("", "auto"):
            legacy.append(r.get("item", "?"))
        gwp = float(r.get("gwp", 1))
        ad = normalize(r["activity_data"], r.get("unit"), r.get("ef_unit"))
        em = ad * ef * gwp
        total += em
        st = r.get("stage", "?")
        stages[st] = stages.get(st, 0) + em
        print(f"{st:<12}{r.get('item', '?'):<14}{em*1000:<18.2f}")
    pcf = total / output if output else total
    print("-" * 46)
    print(f"总排放: {total:.4f} tCO2e  =  {total*1000:.2f} kgCO2e")
    print(f"PCF: {pcf:.4f} tCO2e/{fu}  =  {pcf*1000:.2f} kgCO2e/{fu}")
    print("\n分阶段贡献:")
    for st, em in stages.items():
        print(f"  {st}: {em*1000:.2f} kgCO2e  ({em/total*100:.1f}%)" if total else f"  {st}: {em*1000:.2f} kgCO2e")
    if annotations:
        print("\n因子来源标注（数据层）:")
        for a in annotations:
            print(f"  - {a}")
    if legacy:
        print(f"\n[legacy 回退] 以下行采用行内显式因子（非数据层）: {', '.join(legacy)}")
    if data_driven:
        print(f"\n数据层查询上下文: 行业={industry}, 年份={year}, 地区={region}")
    if skipped:
        print(f"[警告] {len(skipped)} 行未参与计算（数据层未查到因子或因子无效）")


if __name__ == "__main__":
    main()
