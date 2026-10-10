#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scope3_calc.py — 范围3（供应链）排放汇总（数据驱动版）

支持活动数据法与支出法，按类别汇总。

用法:
    python scope3_calc.py input.csv
    python scope3_calc.py input.csv --industry steel --year 2021 --region 全国
        # 数据驱动模式：某行 emission_factor 留空或填 "auto" 时，
        # 自动从 _data 排放因子库按 (行业, 年份, 能源类型(item), 地区) 查询填充，
        # 并在输出中标注因子来源/版本/数据状态。行内已给因子时直接使用（legacy/手动）。
        # 说明：支出法（spend）型因子当前数据层多未收录，未命中时回退行内因子并标注。
    python scope3_calc.py --sample

CSV 字段: category,item,method,amount,unit,emission_factor,ef_unit
  method: activity(活动数据) 或 spend(支出)
  item 同时作为能源类型关键词（如 electricity/coal/电力；支持英文 fuel_type 同义词）
  活动数据法: emission = amount × factor（amount 为活动量，ef_unit 与 amount 单位一致）
  支出法:     emission = amount × factor（amount 为金额，factor 为支出型因子 tCO2e/元）
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


def parse_args(argv):
    """手动解析参数，保持与原脚本兼容：第一个非 -- 参数为输入路径。"""
    path = None
    industry = year = region = None
    sample = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--sample":
            sample = True
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
    return path, sample, industry, year, region


def main():
    path, sample, industry, year, region = parse_args(sys.argv[1:])
    if sample:
        print("category,item,method,amount,unit,emission_factor,ef_unit")
        print("外购商品,钢材,activity,1000,t,1.9,tCO2/t")
        print("上游运输,公路货运,activity,500000,tkm,0.08,tCO2/tkm")
        print("外购商品,电子件,spend,2000000,元,0.00002,tCO2/元")
        return
    if path is None:
        print(__doc__); return

    data_driven = industry is not None or year is not None or region is not None
    total = 0.0
    by_cat = {}
    annotations = []
    legacy = []
    skipped = []
    data_filled = set()
    with open(path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"{'category':<12}{'item':<14}{'method':<10}{'emission(t)':<14}")
    print("-" * 52)
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
                print(f"[警告] 第{idx + 1}行 {msg}；请补充行内 emission_factor 或参考 references/scope3-guide.md")
                continue
        try:
            amount = float(r["amount"])
            ef = float(r["emission_factor"])
        except (TypeError, ValueError, KeyError):
            skipped.append(idx + 1)
            print(f"[警告] 第{idx + 1}行 amount/emission_factor 无效或缺失，已跳过")
            continue
        if data_driven and idx not in data_filled and raw_ef not in ("", "auto"):
            legacy.append(r.get("item", "?"))
        method = r.get("method", "activity")
        em = amount * ef
        total += em
        cat = r.get("category", "?")
        by_cat[cat] = by_cat.get(cat, 0) + em
        print(f"{cat:<12}{r.get('item', '?'):<14}{method:<10}{em:<14.2f}")
    print("-" * 52)
    print(f"范围3 合计: {total:,.2f} tCO2e")
    print("按类别:")
    for cat, em in by_cat.items():
        pct = f"{em/total*100:.1f}%" if total else "n/a"
        print(f"  {cat}: {em:,.2f} tCO2e  ({pct})")
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
    print("注：范围3 多依赖估算，方法/来源/不确定性须在报告中标注。")


if __name__ == "__main__":
    main()
