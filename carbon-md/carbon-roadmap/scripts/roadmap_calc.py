#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
roadmap_calc.py — 企业减排路径测算（数据驱动版）

输入基线排放与各减排措施参数，输出分措施减排量、累计减排与残余排放。

用法:
    python roadmap_calc.py --baseline 100000 --target-year 2050 \
        --measures '能效:10%:2000:5' '绿电:0:30000:8' 'CCUS:0:5000:12'
    --measures 格式: '措施名:基线减排比例%:年减排量t:启动后第几年'  (比例与年减排量二选一，另一填0)

    python roadmap_calc.py --measures '能效:10%:0:1' --baseline 100000

数据驱动模式（新增参数，只增不删，原用法完全兼容）:
    python roadmap_calc.py --baseline 100000 --industry 钢铁 \
        --measures '能效:10%:0:1'
        # 提供 --行业 后，自动从 _data 数据层查询：
        #   query_industry()  -> 行业核算标准、纳入碳市场时间、配额方法；
        #   query_policy()    -> 适用的配额方案 / 激励政策（含零碳工厂培育行业清单）文号与日期。
        # 并在测算结果后输出"数据层政策/规则标注"，透传数据状态。
        # 数据层不可用时：本测算逻辑不依赖数据层，照常输出，并提示 legacy 模式。
"""

import argparse
import pathlib
import re
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def annotate_from_data(industry, region=None):
    """
    从 _data 数据层查询行业规则与适用政策，输出政策/规则标注块。
    数据层不可用或未命中时不抛异常，返回字符串提示（legacy 回退/未覆盖）。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_industry, query_policy
    except Exception as exc:  # noqa: BLE001
        return f"[legacy] 数据层不可用({exc})，未附加行业规则/政策标注；行业口径请参考 references/roadmap-guide.md。"

    lines = ["", "数据层政策/规则标注（路线图对齐依据）:"]
    ind_records = query_industry(行业代码=industry) or query_industry(行业名称=industry)
    if not ind_records:
        lines.append(f"  - 行业'{industry}'不在行业规则表（industry_rules.json）：可能未纳入碳市场/未建规则，路线图按通用口径（GB/T 32150）设计，并标注为估算/待核。")
    else:
        r = ind_records[0]
        lines.append(f"  - 行业：{r.get('行业名称', industry)}  [数据状态: {r.get('数据状态', '?')}]")
        lines.append(f"    核算标准: {r.get('核算标准', '未注明')}")
        lines.append(f"    纳入碳市场时间: {r.get('纳入碳市场时间', '未注明')}")
        lines.append(f"    配额分配方法: {r.get('配额分配方法', '未注明')}")

    # 政策时间表：配额方案 + 激励政策（含零碳工厂培育行业清单）
    pol_records = query_policy(适用行业=industry)
    quota = [p for p in pol_records if "配额" in (p.get("政策类型") or "")]
    incentive = [p for p in pol_records if "激励" in (p.get("政策类型") or "")]
    if not (quota or incentive):
        lines.append(f"  - 政策表未命中行业'{industry}'的配额方案/激励政策：数据层未覆盖该行业专属政策，时间表以国家 3060 目标与 references/roadmap-guide.md 为参考（待核）。")
    for p in quota:
        lines.append(f"  - [配额方案] {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}）[数据状态: {p.get('数据状态')}]")
    for p in incentive:
        lines.append(f"  - [激励政策] {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}）[数据状态: {p.get('数据状态')}]")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--baseline", type=float, required=True, help="基准年排放 (tCO2e)")
    p.add_argument("--target-year", type=int, default=2050, help="目标年")
    p.add_argument("--base-year", type=int, default=2025, help="基准年")
    p.add_argument("--measures", nargs="+", required=True, help="措施，格式 '名:比例或%%:年减排量:启动年'")
    p.add_argument("--industry", default=None, help="可选：行业名称/代码；提供后从 _data 查询行业规则与政策时间表（数据驱动）")
    p.add_argument("--region", default=None, help="可选：地区（用于后续地区政策匹配）")
    args = p.parse_args()

    baseline = args.baseline
    total_reduction = 0.0
    rows = []
    for m in args.measures:
        parts = m.split(":")
        name = parts[0]
        ratio_raw = parts[1]
        annual = float(parts[2])
        start = int(parts[3])
        if ratio_raw.endswith("%"):
            ratio = float(ratio_raw.strip("%")) / 100
            red = baseline * ratio
        else:
            ratio = float(ratio_raw)
            red = annual
        total_reduction += red
        rows.append((name, ratio, red, start))

    residual = baseline - total_reduction
    span = args.target_year - args.base_year
    print(f"基准年: {args.base_year}   目标年: {args.target_year}")
    print(f"基线排放: {baseline:,.0f} tCO2e")
    print(f"{'措施':<16}{'基线占比':<10}{'年减排(t)':<14}{'启动年'}")
    print("-" * 50)
    for name, ratio, red, start in rows:
        print(f"{name:<16}{ratio*100:<9.1f}{red:<14,.0f}{start}")
    print("-" * 50)
    print(f"合计减排量: {total_reduction:,.0f} tCO2e  (占基线 {total_reduction/baseline*100:.1f}%)")
    print(f"残余排放: {max(residual,0):,.0f} tCO2e")
    if residual > 0:
        print(f"按 {span} 年匀速减排，年均需减排 {residual/span:,.0f} tCO2e 或靠抵消/碳汇覆盖。")
    else:
        print("已实现净零（排放全部被减排措施覆盖）。")

    if args.industry:
        print(annotate_from_data(args.industry, args.region))

if __name__ == "__main__":
    main()
