#!/usr/bin/env python3
"""
calc_emissions.py — 碳排放自动核算脚本（数据驱动版）

读取 CSV 或 JSON 活动数据，按 排放量 = 活动数据 × 排放因子 × GWP − 回收量 计算，
输出分项、按 scope 汇总、按 facility 汇总与总排放量。

用法:
    python calc_emissions.py input.csv         # 因子由输入行显式给出（兼容原行为）
    python calc_emissions.py input.json
    python calc_emissions.py --sample          # 打印示例数据
    python calc_emissions.py input.csv --industry steel --year 2024 --region 全国
        # 数据驱动模式：提供 行业/年份/地区 后，某行 emission_factor 留空或填 "auto" 时，
        # 自动从 _data 排放因子库按 (行业, 年份, 能源类型, 地区) 查询填充，
        # 并在输出中标注因子来源/版本/数据状态。
        # 数据层查不到且行内无因子时：该行跳过并给出警告（提示 legacy 参考 references/emission-factors.md）。

输入字段见 references/data-schema.md。
"""

import csv
import json
import pathlib
import sys

# 单位折算系数（目标为因子单位）。activity_data 单位 -> 乘系数转成因子单位
UNIT_TO_BASE = {
    "kwh": 1, "mwh": 1, "t": 1, "nm3": 1, "gj": 1, "万nm3": 10000,
}

def normalize(activity_data, unit, ef_unit):
    u = str(unit).strip().lower().replace(" ", "")
    eu = str(ef_unit).strip().lower().replace(" ", "")
    v = float(activity_data)
    if u == "kwh" and "/mwh" in eu:
        v = v / 1000.0
    elif u in ("万nm3", "万立方米", "万方") and "/nm3" in eu and "万nm3" not in eu:
        v = v * 10000.0
    return v


def compute(row, ef, ef_unit):
    ad = normalize(row.get("activity_data"), row.get("unit"), ef_unit)
    gwp = float(row.get("gwp", 1))
    recovery = float(row.get("recovery", 0))
    emissions = ad * ef * gwp - recovery
    return max(emissions, 0.0), ad, ef, gwp, recovery


def load_rows(path):
    if path.lower().endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(path, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"

def lookup_factor(industry, year, fuel_type, region):
    """
    从 _data 排放因子库按 (行业, 年份, 能源类型, 地区) 查询因子。
    返回 (ef, ef_unit, annotation) ；查不到返回 (None, None, None)。
    多条命中时优先"已查证"记录。
    """
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
            print(__doc__)
            sys.exit(0)
        elif path is None:
            path = a
        i += 1
    return path, sample, industry, year, region


def main():
    path, sample, industry, year, region = parse_args(sys.argv[1:])
    if path is None and not sample:
        print(__doc__)
        return
    if sample:
        print("scope,facility,fuel_type,activity_data,unit,emission_factor,ef_unit,recovery")
        print("1,boiler-1,coal,100.5,t,1.9,tCO2/t,0")
        print("2,plant,electricity,120000,kWh,0.5703,tCO2/MWh,0")
        return

    rows = load_rows(path)
    data_driven = industry is not None or year is not None or region is not None
    total = 0.0
    by_scope = {}
    by_facility = {}
    annotations = []
    skipped = []
    print(f"{'scope':<6}{'facility':<16}{'emissions(tCO2e)':<18}")
    print("-" * 46)
    for idx, r in enumerate(rows):
        raw_ef = str(r.get("emission_factor") or "").strip()
        need_lookup = data_driven and (raw_ef == "" or raw_ef.lower() == "auto")
        if need_lookup:
            ef, ef_unit, ann = lookup_factor(industry, year, r.get("fuel_type"), region)
            if ef is not None:
                r["emission_factor"], r["ef_unit"] = ef, ef_unit
                annotations.append(f"{r.get('fuel_type')}: {ann}")
            else:
                skipped.append(idx + 1)
                msg = f"第{idx + 1}行未查到数据层因子"
                if ann:
                    msg += f"（{ann}）"
                print(f"[警告] {msg}；请补充行内 emission_factor 或参考 references/emission-factors.md")
                continue
        try:
            ef_row = float(r.get("emission_factor"))
        except (TypeError, ValueError):
            skipped.append(idx + 1)
            print(f"[警告] 第{idx + 1}行 emission_factor 无效，已跳过")
            continue
        em, ad, ef, gwp, rec = compute(r, ef_row, r.get("ef_unit"))
        scope = r.get("scope", "?")
        fac = r.get("facility", "?")
        total += em
        by_scope[scope] = by_scope.get(scope, 0) + em
        by_facility[fac] = by_facility.get(fac, 0) + em
        print(f"{scope:<6}{fac:<16}{em:<18.2f}")
    print("-" * 46)
    print(f"总排放量: {total:.2f} tCO2e")
    print("\n按 scope 汇总:")
    for k in sorted(by_scope, key=str):
        print(f"  范围 {k}: {by_scope[k]:.2f} tCO2e")
    print("\n按 facility 汇总:")
    for k in sorted(by_facility, key=str):
        print(f"  {k}: {by_facility[k]:.2f} tCO2e")
    if annotations:
        print("\n因子来源标注（数据层）:")
        for a in annotations:
            print(f"  - {a}")
    if data_driven:
        print(f"\n数据层查询上下文: 行业={industry}, 年份={year}, 地区={region}")
    if skipped:
        print(f"\n[警告] {len(skipped)} 行未参与计算（数据层未查到因子或因子无效）")


if __name__ == "__main__":
    main()
