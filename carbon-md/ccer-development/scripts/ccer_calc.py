#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ccer_calc.py — CCER 计入期减排量测算（数据驱动版）

减排量 = 基准线排放 − 项目排放 − 泄漏

用法:
    python ccer_calc.py --baseline 10000 --project 6000 --leakage 300
    python ccer_calc.py --annual-baseline 8000 --annual-project 5000 --years 10 --leakage-rate 0.05
    python ccer_calc.py --no-basis   # 关闭数据层管理办法依据查询

数据驱动：运行时自动从 _data 政策元数据表查询《温室气体自愿减排交易管理办法》
（部令第31号）的文号/发布日期/数据状态并作为法律依据标注；数据层不可用时回退
legacy 硬编码依据并标注。注意：计入期年数(--years)依具体备案方法学而定，数据层
暂无方法学参数表，默认 10 年为历史参考值，须按项目适用方法学核对。
"""

import argparse
import pathlib
import sys

# ---------- 数据层接入 ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"

# legacy 回退依据（数据层不可用时使用）
LEGACY_BASIS = {
    "政策名称": "《温室气体自愿减排交易管理办法（试行）》",
    "文号": "生态环境部、市场监管总局令第31号",
    "发布日期": "2023-10-19公布并施行",
    "数据状态": "legacy 回退（数据层不可用，以官方原文为准）",
}


def lookup_ccer_basis():
    """
    从 _data 政策元数据表查询 CCER 管理办法依据。
    返回 (record_dict, note)；数据层不可用返回 (None, note)。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_policy
    except Exception as exc:
        return None, f"数据层不可用({exc})，已 legacy 回退"
    records = query_policy(关键词="自愿减排交易管理办法")
    if not records:
        return None, "数据层未查到 CCER 管理办法记录，已 legacy 回退"
    return records[0], "数据层命中"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--baseline", type=float, help="计入期基准线排放 (tCO2e)")
    p.add_argument("--project", type=float, help="计入期项目排放 (tCO2e)")
    p.add_argument("--leakage", type=float, default=0.0, help="计入期泄漏 (tCO2e)")
    p.add_argument("--annual-baseline", type=float, help="年基准线排放 (tCO2e/a)")
    p.add_argument("--annual-project", type=float, help="年项目排放 (tCO2e/a)")
    p.add_argument("--years", type=int, default=10, help="计入期年数（依方法学，默认10为历史参考值）")
    p.add_argument("--leakage-rate", type=float, default=0.0, help="泄漏占基准线的比例")
    p.add_argument("--no-basis", action="store_true", help="不查询数据层管理办法依据")
    args = p.parse_args()

    if args.baseline is not None and args.project is not None:
        baseline, project = args.baseline, args.project
        leakage = args.leakage
        years = None
    elif args.annual_baseline is not None and args.annual_project is not None:
        baseline = args.annual_baseline * args.years
        project = args.annual_project * args.years
        leakage = baseline * args.leakage_rate
        years = args.years
    else:
        print("需提供 --baseline/--project 或 --annual-baseline/--annual-project")
        return

    reduction = baseline - project - leakage
    print(f"基准线排放: {baseline:,.2f} tCO2e" + (f" (年 {args.annual_baseline:,.2f} × {years}年)" if years else ""))
    print(f"项目排放: {project:,.2f} tCO2e")
    print(f"泄漏: {leakage:,.2f} tCO2e")
    print("-" * 40)
    print(f"计入期减排量: {reduction:,.2f} tCO2e")
    if years:
        print(f"年均减排量: {reduction/years:,.2f} tCO2e/a")

    # ---- 数据层依据标注（必做） ----
    if not args.no_basis:
        rec, note = lookup_ccer_basis()
        basis = rec if rec else LEGACY_BASIS
        print("\n[管理办法依据标注]")
        print(f"  依据: {basis.get('政策名称')}")
        print(f"  文号: {basis.get('文号')}")
        print(f"  发布日期: {basis.get('发布日期')}")
        print(f"  数据状态: {basis.get('数据状态')}")
        if rec:
            print(f"  来源: {rec.get('来源', '?')}")
        print(f"  查询状态: {note}")
        print("  注：计入期年数依项目适用的备案方法学确定；数据层暂无方法学参数表，"
              "本脚本 --years 默认 10 年为历史参考值，须按方法学核对。")

    print("\n注：按方法学公式与输入参数测算，实际以审定/核证结果为准。")


if __name__ == "__main__":
    main()
