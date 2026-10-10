#!/usr/bin/env python3
"""
sink_calc.py — 碳汇量核算（数据驱动版）

碳汇量 = 项目碳库增量 − 基准线碳库增量 − 项目排放 − 泄漏
支持直接传 CO2 当量值，或传碳质量(kg)按 44/12 折算（物理常量）。

数据驱动增量（2026-10-09）：传入 --policy 时，从 _data 政策元数据表
query_policy(关键词="自愿减排") 查询《温室气体自愿减排交易管理办法（试行）》
（生态环境部、市场监管总局令第31号）作为 CCER 制度依据并透传数据状态；
数据层不可用时回退为 legacy 提示（不影响碳汇量计算）。

用法:
    python sink_calc.py --project-co2 5000 --baseline-co2 800 --emissions 300 --leakage 100
    python sink_calc.py --project-c 1363 --baseline-c 218 --emissions 300 --leakage 100
    python sink_calc.py --project-co2 5000 --baseline-co2 800 --policy
"""

import argparse
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def lookup_ccer_policy():
    """
    从政策元数据表查询 CCER 管理办法（部令第31号）。
    返回多行标注字符串；数据层不可用返回 legacy 提示。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_policy
    except Exception as exc:
        return f"[legacy 回退] 数据层不可用({exc})；CCER 制度依据请以 references/standards-sources.md 为准"
    records = query_policy(关键词="自愿减排")
    if not records:
        records = query_policy(关键词="CCER")
    if not records:
        return "[占位-待核实] 政策表未命中 CCER 记录；请以生态环境部原文为准"
    lines = []
    for r in records:
        lines.append(
            f"{r.get('政策名称')}（{r.get('文号')}）| {r.get('发文机关')} | "
            f"{r.get('发布日期')} | 时效:{r.get('时效状态')} | 数据状态:{r.get('数据状态')}"
        )
    return "；".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--project-co2", type=float, help="项目碳库增量 CO2 当量 (tCO2e)")
    p.add_argument("--baseline-co2", type=float, help="基准线碳库增量 CO2 当量 (tCO2e)")
    p.add_argument("--project-c", type=float, help="项目碳库增量碳质量 (tC)")
    p.add_argument("--baseline-c", type=float, help="基准线碳库增量碳质量 (tC)")
    p.add_argument("--emissions", type=float, default=0.0, help="项目排放 (tCO2e)")
    p.add_argument("--leakage", type=float, default=0.0, help="泄漏 (tCO2e)")
    p.add_argument("--policy", action="store_true", help="查询并打印 CCER 制度依据（数据层）")
    args = p.parse_args()

    # --policy 可单独使用（无需计算输入），便于快速核验政策依据
    if args.policy:
        print("=== 数据层查询（CCER 制度依据） ===")
        print(lookup_ccer_policy())

    if args.project_co2 is not None and args.baseline_co2 is not None:
        proj, base = args.project_co2, args.baseline_co2
        unit = "tCO2e"
    elif args.project_c is not None and args.baseline_c is not None:
        proj = args.project_c * 44 / 12
        base = args.baseline_c * 44 / 12
        unit = "tCO2e (由 tC×44/12 折算)"
    else:
        if not args.policy:
            print("需提供 --project-co2/--baseline-co2 或 --project-c/--baseline-c（或加 --policy 仅查政策）")
        return

    sink = proj - base - args.emissions - args.leakage
    print(f"项目碳库增量: {proj:,.2f} {unit}")
    print(f"基准线碳库增量: {base:,.2f} {unit}")
    print(f"项目排放: {args.emissions:,.2f} tCO2e")
    print(f"泄漏: {args.leakage:,.2f} tCO2e")
    print("-" * 42)
    print(f"碳汇量: {sink:,.2f} tCO2e")
    if sink < 0:
        print("注意：碳汇量为负，检查输入或边界设定。")
    print("注：碳汇计量参数（BEF/根冠比/含碳率/土壤碳密度）数据层暂无 LULUCF 分库，"
          "为 references 历史参考(legacy 回退)，应以项目实测与最新方法学为准。")


if __name__ == "__main__":
    main()
