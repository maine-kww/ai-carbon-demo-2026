#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quota_calc.py — 碳配额履约缺口/盈余与成本收益测算（数据驱动版）

用法:
    python quota_calc.py --emissions 120000 --allocated 100000 --held 5000 --ccer 3000 --price 95
    python quota_calc.py --emissions 120000 --allocated 100000 --held 5000 --price 95 \
        --ccer-limit 0.05 --sell-price 100
    python quota_calc.py --emissions 120000 --allocated 100000 --held 5000 --ccer 3000 \
        --price 95 --industry 钢铁 --year 2025
        # 数据驱动模式：提供 --industry 后，自动从 _data 数据层查询：
        #   - 行业规则表(query_industry)：配额分配方法（强度法/总量法）、数据状态
        #   - 政策元数据表(query_policy 政策类型=配额方案)：CCER 抵消比例上限（如 5%）
        # 显式传入的 --ccer-limit 优先级高于数据层；数据层查不到时回退原默认（不设上限），
        #   并在输出中标注 legacy 回退。

参数:
    --emissions     报告排放量 (tCO2e)
    --allocated     分配配额 (t)
    --held          已持有/结转配额 (t)
    --ccer          CCER 抵消量 (t)，默认 0
    --ccer-limit    CCER 抵消占排放比例上限，默认 None（数据驱动模式下由数据层配额方案确定，
                    查不到则不设上限，与历史行为一致）
    --price         预期采购单价 (元/t)
    --sell-price    预期出售单价 (元/t)，默认等于 --price
    --industry      行业名称或代码（如 钢铁/steel、发电/electricity），触发数据层查询
    --year          履约年度（用于数据层上下文标注）
"""

import argparse
import pathlib
import re
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def lookup_trading_rules(industry, year=None):
    """
    从 _data 数据层查询该行业的配额分配规则与 CCER 抵消比例上限。
    返回 dict:
      allocation_method  配额分配方法（来自行业规则表）
      industry_status    行业规则数据状态
      ccer_limit_pct     CCER 抵消比例（小数，如 0.05），查不到为 None
      policy_refs        命中的配额方案 [(文号, 发布日期, 数据状态)]
      note               数据层可用性说明
    数据层不可用时整体返回 None（由调用方走 legacy 回退）。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_industry, query_policy
    except Exception as exc:  # 数据层不可用 -> 调用方 legacy 回退
        return {"note": f"数据层不可用({exc})，已 legacy 回退"}

    ind_records = query_industry(行业代码=industry) or query_industry(行业名称=industry)
    ind = ind_records[0] if ind_records else None

    allocation_method = ind.get("配额分配方法", "未在行业规则表中查到") if ind else "未在行业规则表中查到"
    industry_status = ind.get("数据状态", "?") if ind else "占位-待核实"

    # 查配额方案政策记录，提取 CCER 抵消比例
    policy_records = query_policy(政策类型="配额方案", 适用行业=industry)
    ccer_limit_pct = None
    policy_refs = []
    for r in policy_records:
        policy_refs.append((r.get("文号", "?"), r.get("发布日期", "?"), r.get("数据状态", "?")))
        m = re.search(r"(?:抵销|抵消)[^。；;]{0,30}?(\d+(?:\.\d+)?)\s*%", str(r.get("结构化摘要", "")))
        if m and ccer_limit_pct is None:
            ccer_limit_pct = float(m.group(1)) / 100.0

    note = "数据层命中" if (ind or policy_records) else "数据层未覆盖该行业/配额方案"
    return {
        "allocation_method": allocation_method,
        "industry_status": industry_status,
        "ccer_limit_pct": ccer_limit_pct,
        "policy_refs": policy_refs,
        "note": note,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--emissions", type=float, required=True)
    p.add_argument("--allocated", type=float, required=True)
    p.add_argument("--held", type=float, default=0.0)
    p.add_argument("--ccer", type=float, default=0.0)
    p.add_argument("--ccer-limit", dest="ccer_limit", type=float, default=None,
                   help="CCER 抵消比例上限(小数)；缺省则由数据层配额方案确定，查不到不设上限")
    p.add_argument("--price", type=float, required=True)
    p.add_argument("--sell-price", type=float, default=None)
    p.add_argument("--industry", type=str, default=None, help="行业名称/代码，触发数据层查询")
    p.add_argument("--year", type=str, default=None, help="履约年度（数据层上下文标注）")
    args = p.parse_args()

    # ---- 数据层优先：确定 CCER 抵消比例上限与配额分配方法 ----
    rules = None
    ccer_limit = args.ccer_limit  # 显式传入优先
    if args.industry:
        rules = lookup_trading_rules(args.industry, args.year)
        if ccer_limit is None:
            if rules and rules.get("ccer_limit_pct") is not None:
                ccer_limit = rules["ccer_limit_pct"]  # 数据层确定
            else:
                ccer_limit = 0.0  # 查不到 -> legacy：不设上限
    if ccer_limit is None:
        ccer_limit = 0.0

    # CCER 抵消量受排放量比例上限约束
    max_ccer = args.emissions * ccer_limit
    ccer_effective = min(args.ccer, max_ccer) if ccer_limit > 0 else args.ccer

    total_quota = args.allocated + args.held + ccer_effective
    gap = args.emissions - total_quota
    sell_price = args.sell_price if args.sell_price is not None else args.price

    print(f"报告排放量: {args.emissions:.2f} tCO2e")
    print(f"分配配额: {args.allocated:.2f} t")
    print(f"已持有/结转配额: {args.held:.2f} t")
    print(f"CCER 抵消(上限 {ccer_limit*100:.0f}%): 申请 {args.ccer:.2f} / 可用 {ccer_effective:.2f} t")
    print(f"可支配配额合计: {total_quota:.2f} t")
    print("-" * 46)
    if gap > 0:
        cost = gap * args.price
        print(f"履约缺口: {gap:.2f} t  (需购入)")
        print(f"预计采购成本: {cost:,.2f} 元  @ {args.price} 元/t")
    else:
        surplus = -gap
        rev = surplus * sell_price
        print(f"配额盈余: {surplus:.2f} t  (可出售)")
        print(f"预计出售收益: {rev:,.2f} 元  @ {sell_price} 元/t")
    print("-" * 46)

    # ---- 数据层标注（必做） ----
    if args.industry and rules:
        print("\n[数据层标注]")
        print(f"  行业: {args.industry}" + (f" (履约年度 {args.year})" if args.year else ""))
        print(f"  配额分配方法: {rules['allocation_method']}  [数据状态: {rules['industry_status']}]")
        if rules.get("policy_refs"):
            print("  配额方案依据:")
            for wenhao, date, status in rules["policy_refs"]:
                print(f"    - {wenhao} | {date} | [数据状态: {status}]")
        if ccer_limit > 0 and args.ccer_limit is None:
            print(f"  CCER 抵消比例 {ccer_limit*100:.0f}% 取自上述配额方案（数据驱动）")
        elif args.ccer_limit is not None:
            print(f"  CCER 抵消比例采用用户显式输入 {ccer_limit*100:.0f}%（优先于数据层）")
        else:
            print("  CCER 抵消比例: 数据层未给出 -> legacy 回退（不设上限，请人工核对当年配额方案）")
        print(f"  数据层状态: {rules['note']}")
    elif args.industry:
        print("\n[数据层标注] 数据层不可用，已 legacy 回退：配额分配方法与 CCER 抵消比例均按输入/默认处理，请人工核对当年配额方案。")

    print("\n注：测算基于输入参数与规则假设，实际以官方核查数据与当年规则为准。")


if __name__ == "__main__":
    main()
