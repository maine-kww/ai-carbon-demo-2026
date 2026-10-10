#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mrv_tracker.py — 活动数据台账管理与单位核验（数据驱动版）

输入 CSV，统一单位、折算后给出分项与汇总，供排放报告引用。
支持常用单位折算（kWh→MWh、万Nm3→Nm3）。

用法:
    python mrv_tracker.py data.csv                          # 因子由输入行显式给出（兼容原行为）
    python mrv_tracker.py data.csv --target-unit tCO2e
    python mrv_tracker.py --sample
    python mrv_tracker.py data.csv --industry steel --year 2021 --region 全国
        # 数据驱动模式：提供 行业/年份/地区 后，某行 emission_factor 留空或填 "auto" 时，
        # 自动从 _data 排放因子库按 (行业, 年份, 能源类型(item), 地区) 查询填充，
        # 并在输出中标注因子来源/版本/数据状态。
        # 行内已给出因子时直接使用（legacy/手动口径），保持原 CLI 行为兼容。
        # 数据层查不到（或命中记录因子值为空）且行内无因子时：该行跳过并给出警告。

CSV 字段: period,facility,item,activity_data,unit,emission_factor,ef_unit
    item 同时作为能源类型关键词（如 coal/electricity/gas/heat；支持英文 fuel_type 同义词）。
"""

import csv
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def lookup_factor(industry, year, fuel_type, region):
    """
    从 _data 排放因子库按 (行业, 年份, 能源类型, 地区) 查询因子。
    返回 (ef, ef_unit, annotation)；查不到或命中记录因子值为空时返回 (None, None, reason)。
    多条命中时优先"已查证"记录。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_factor
    except Exception as exc:  # 数据层不可用 -> 回退并标注
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
    target_unit = "tCO2e"
    industry = year = region = None
    sample = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--sample":
            sample = True
        elif a == "--target-unit" and i + 1 < len(argv):
            target_unit = argv[i + 1]; i += 1
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
    return path, target_unit, sample, industry, year, region


def main():
    path, target_unit, sample, industry, year, region = parse_args(sys.argv[1:])
    if sample:
        print("period,facility,item,activity_data,unit,emission_factor,ef_unit")
        print("2025,plant,coal,5000,t,1.9,tCO2/t")
        print("2025,plant,electricity,800000,kWh,0.5703,tCO2/MWh")
        return
    if path is None:
        print(__doc__); return

    data_driven = industry is not None or year is not None or region is not None
    total = 0.0
    by_fac = {}
    annotations = []
    legacy = []
    skipped = []
    data_filled = set()
    with open(path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"{'period':<8}{'facility':<12}{'item':<12}{'emission(' + target_unit + ')':<14}")
    print("-" * 50)
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
                print(f"[警告] 第{idx + 1}行 {msg}；请补充行内 emission_factor 或参考 references/mrv-guide.md")
                continue
        try:
            ef = float(r["emission_factor"])
        except (TypeError, ValueError, KeyError):
            skipped.append(idx + 1)
            print(f"[警告] 第{idx + 1}行 emission_factor 无效或缺失，已跳过")
            continue
        if data_driven and idx not in data_filled and raw_ef not in ("", "auto"):
            legacy.append(r.get("item", "?"))
        ad = normalize(r["activity_data"], r.get("unit"), r.get("ef_unit"))
        em = ad * ef
        total += em
        fac = r.get("facility", "?")
        by_fac[fac] = by_fac.get(fac, 0) + em
        print(f"{r.get('period', '?'):<8}{fac:<12}{r.get('item', '?'):<12}{em:<14.2f}")
    print("-" * 50)
    print(f"合计: {total:,.2f} {target_unit}")
    print("按 facility:")
    for fac, em in by_fac.items():
        print(f"  {fac}: {em:,.2f} {target_unit}")
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
    print("注：台账供排放报告引用，单位与口径须与核算指南一致；因子来源/数据状态以上方标注为准。")


if __name__ == "__main__":
    main()
