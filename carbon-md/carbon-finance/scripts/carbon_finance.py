#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
carbon_finance.py — 碳金融测算（质押融资额度 / 碳资产价值）（数据驱动版）

用法:
    python carbon_finance.py --amount 50000 --price 95 --pledge-rate 0.6
    python carbon_finance.py --amount 50000 --price 95 --pledge-rate 0.6 --ccer 2000 --ccer-price 80
    python carbon_finance.py --amount 50000 --price 95 --industry 钢铁
        # 数据驱动模式（新增 --industry，只增不删）：自动从 _data 政策元数据表查询
        #   适用于该行业的"配额方案 / 激励政策 / CCER 规章"，作为融资合规与政策依据标注，
        #   并透传文号、发布日期与数据状态。数据层不可用时按原测算运行（legacy）。

参数:
    --amount        碳资产数量 (t)
    --price         碳价 (元/t)
    --pledge-rate   质押率 (默认 0.6，为审慎经验缺省值，非数据层数值；
                    实际质押率以具体金融机构/交易所最新规定为准)
    --ccer          CCER 数量 (t)，可选
    --ccer-price    CCER 价格 (元/t)，可选
    --industry      可选：行业名称/代码，触发政策依据数据层查询
"""

import argparse
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def policy_basis(industry):
    """从 _data 政策表查询该行业适用的配额方案/激励政策/CCER 规章，返回标注字符串。"""
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_policy
    except Exception as exc:  # noqa: BLE001
        return f"[legacy] 数据层不可用({exc})，未附加政策依据；产品规则以金融机构/交易所最新规定为准。"

    lines = ["", "数据层政策依据（碳金融合规参考）:"]
    recs = query_policy(适用行业=industry)
    quota = [p for p in recs if "配额" in (p.get("政策类型") or "")]
    incentive = [p for p in recs if "激励" in (p.get("政策类型") or "")]
    ccer = query_policy(关键词="CCER")
    if not (quota or incentive):
        lines.append(f"  - 政策表未命中行业'{industry}'的配额方案/激励政策：数据层未覆盖该行业专属碳金融政策，配额/CCER 规则以全国通用规章为准（待核）。")
    for p in quota:
        lines.append(f"  - [配额方案] {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}）[数据状态: {p.get('数据状态')}]")
    for p in incentive:
        lines.append(f"  - [激励政策] {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}）[数据状态: {p.get('数据状态')}]")
    for p in ccer:
        lines.append(f"  - [CCER 规章] {p.get('政策名称')}（{p.get('文号')}，{p.get('发布日期')}）[数据状态: {p.get('数据状态')}]")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--amount", type=float, required=True, help="碳资产数量 t")
    p.add_argument("--price", type=float, required=True, help="碳价 元/t")
    p.add_argument("--pledge-rate", type=float, default=0.6, help="质押率（默认0.6，审慎经验缺省，实际以机构规定为准）")
    p.add_argument("--ccer", type=float, default=0.0, help="CCER 数量 t")
    p.add_argument("--ccer-price", type=float, default=None, help="CCER 价格 元/t")
    p.add_argument("--industry", default=None, help="可选：行业名称/代码，触发政策依据数据层查询")
    args = p.parse_args()

    quota_value = args.amount * args.price
    ccer_value = args.ccer * (args.ccer_price if args.ccer_price is not None else args.price)
    total_value = quota_value + ccer_value
    loan = total_value * args.pledge_rate

    print("配额: {:,.0f} t x {:} 元/t = {:,.2f} 元".format(args.amount, args.price, quota_value))
    if args.ccer > 0:
        print("CCER: {:,.0f} t x {:} 元/t = {:,.2f} 元".format(args.ccer, args.ccer_price or args.price, ccer_value))
    print("-" * 40)
    print("碳资产总价值: {:,.2f} 元".format(total_value))
    print("质押率: {:.0f}（审慎经验缺省值，非数据层数值）".format(args.pledge_rate * 100))
    print("预计质押融资额度: {:,.2f} 元".format(loan))
    print("注：质押率与额度以具体金融机构/交易所最新规定为准，测算仅供参考。")

    if args.industry:
        print(policy_basis(args.industry))


if __name__ == "__main__":
    main()
