#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
climate_finance.py — 可持续挂钩金融目标测算（数据驱动版）

输入挂钩 KPI（如碳强度）当前值与目标值、融资规模与调整机制，测算目标与潜在成本影响。

用法:
    python climate_finance.py --principal 100000000 --intensity-base 5.0 --intensity-target 3.5 \
        --rate 4.0 --step 0.05

数据驱动模式（新增参数，只增不删，原用法完全兼容）:
    python climate_finance.py --principal 100000000 --intensity-base 5.0 --intensity-target 3.5 \
        --rate 4.0 --policy-keyword 转型金融 --industry 钢铁
        # 自动从 _data 政策元数据表查询转型金融/气候适应相关政策：
        #   命中   -> 列出政策名称、文号、发布日期、数据状态作为对接依据；
        #   未命中 -> 明确标注"数据层未覆盖"，转型金融产品条件以 references/adaptation-guide.md
        #            及金融机构最新产品条款为准（保留原 references，不编造政策）。
"""

import argparse
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def policy_basis(keyword, industry=None):
    """查询转型金融/气候适应相关政策；未命中时返回'数据层未覆盖'提示。"""
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_policy
    except Exception as exc:  # noqa: BLE001
        return f"[legacy] 数据层不可用({exc})；转型金融产品条件以 references/adaptation-guide.md 及金融机构最新条款为准。"

    recs = query_policy(关键词=keyword)
    if industry:
        recs += query_policy(适用行业=industry)
    # 去重
    seen, dedup = set(), []
    for r in recs:
        k = (r.get("政策名称"), r.get("文号"))
        if k not in seen:
            seen.add(k); dedup.append(r)

    lines = ["", f"数据层政策查询（关键词='{keyword}'" + (f"，行业='{industry}'" if industry else "") + "）:"]
    if not dedup:
        lines.append("  - 未命中：数据层当前未收录转型金融/气候适应/可持续挂钩类专项政策。")
        lines.append("  - [数据层未覆盖] 保留原 references/adaptation-guide.md 作为产品条件与方法参考；")
        lines.append("    实际对接以金融机构最新产品条款与监管要求为准，不据此编造政策文号。")
        return "\n".join(lines)
    for p in dedup:
        lines.append(f"  - {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}，{p.get('政策类型')}）[数据状态: {p.get('数据状态')}]")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--principal", type=float, required=True, help="融资规模 元")
    p.add_argument("--intensity-base", type=float, required=True, help="基准年碳强度 tCO2e/产值单位")
    p.add_argument("--intensity-target", type=float, required=True, help="目标年碳强度 tCO2e/产值单位")
    p.add_argument("--rate", type=float, required=True, help="基础利率（百分数）")
    p.add_argument("--step", type=float, default=0.05, help="每档利率调整步长（百分数）")
    p.add_argument("--policy-keyword", default=None, help="可选：转型金融/气候适应政策关键词；提供后查询 _data 政策表")
    p.add_argument("--industry", default=None, help="可选：行业名称/代码，附加查询该行业政策")
    args = p.parse_args()

    reduction_rate = (args.intensity_base - args.intensity_target) / args.intensity_base * 100
    rate_down = args.rate - args.step
    rate_up = args.rate + args.step
    interest_base = args.principal * args.rate / 100
    interest_down = args.principal * rate_down / 100
    interest_up = args.principal * rate_up / 100

    print("融资规模: {:,.0f} 元".format(args.principal))
    print("碳强度: 基准 {:} → 目标 {:} tCO2e/单位".format(args.intensity_base, args.intensity_target))
    print("目标降幅: {:.1f}".format(reduction_rate))
    print("-" * 42)
    print("基础利率: {:.2f} (年利息 {:,.0f} 元)".format(args.rate, interest_base))
    print("达标下调: {:.2f} (年利息 {:,.0f} 元)".format(rate_down, interest_down))
    print("未达标上调: {:.2f} (年利息 {:,.0f} 元)".format(rate_up, interest_up))
    print("注：挂钩目标、调整档位与验证要求以金融机构产品条款为准，测算仅供参考。")

    if args.policy_keyword is not None or args.industry:
        kw = args.policy_keyword if args.policy_keyword is not None else "转型金融"
        print(policy_basis(kw, args.industry))


if __name__ == "__main__":
    main()
