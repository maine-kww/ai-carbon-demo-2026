#!/usr/bin/env python3
"""
inclusion_calc.py — 碳普惠单场景减排量与积分换算（数据驱动版）

减排量 = 行为量 × 单位减排因子；积分 = 减排量(kgCO2e) × 积分系数

数据驱动增量（2026-10-09）：节电场景 --scenario electricity 时，若未显式给
--factor，自动从 _data 排放因子库 query_factor(能源类型="电力碳足迹", 年份=)
查询全国电力平均碳足迹因子（kgCO2e/kWh，如 2023=0.6205 / 2024=0.5777），
并透传来源与数据状态；数据层查不到时回退 legacy 常数(0.6205)并标注。
显式传 --factor 仍优先使用（兼容原行为）。

用法:
    python inclusion_calc.py --behavior 100 --unit km --factor 0.08 --points-per-kg 10
    python inclusion_calc.py --scenario electricity --saving-kwh 100 --year 2024
    python inclusion_calc.py --scenario electricity --saving-kwh 100 --year 2024 --points-per-kg 10
    python inclusion_calc.py --sample
"""

import argparse
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"
# legacy 回退常数（2023 年全国电力平均碳足迹因子，占位）
LEGACY_ELEC_FACTOR = 0.6205


def lookup_electricity_factor(year):
    """
    从因子库查询全国电力平均碳足迹因子（kgCO2e/kWh）。
    返回 (factor, annotation, is_legacy)；查不到返回 (LEGACY_ELEC_FACTOR, 提示, True)。
    """
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import query_factor
    except Exception as exc:
        return LEGACY_ELEC_FACTOR, f"数据层不可用({exc})，回退 legacy 常数", True
    records = query_factor(能源类型="电力碳足迹", 年份=year)
    verified = [r for r in records if r.get("数据状态") == "已查证" and r.get("因子值") is not None]
    chosen = verified[0] if verified else (records[0] if records and records[0].get("因子值") is not None else None)
    if chosen is None:
        return LEGACY_ELEC_FACTOR, f"因子库未命中电力碳足迹(年份={year})，回退 legacy 常数 {LEGACY_ELEC_FACTOR}", True
    ann = (
        f"{chosen.get('来源', '未注明来源')} [年份:{chosen.get('年份')}, "
        f"版本:{chosen.get('版本', '?')}, 数据状态:{chosen.get('数据状态', '?')}]"
    )
    return float(chosen["因子值"]), ann, False


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--behavior", type=float, help="行为量")
    p.add_argument("--unit", type=str, default="单位", help="行为量单位")
    p.add_argument("--factor", type=float, help="单位减排因子 kgCO2e/单位（显式给则优先使用）")
    p.add_argument("--points-per-kg", type=float, default=10.0, help="每 kgCO2e 积分")
    p.add_argument("--scenario", type=str, default=None, help="场景，如 electricity（节电）")
    p.add_argument("--saving-kwh", type=float, help="节电场景：节省电量(kWh)")
    p.add_argument("--year", type=str, default="2024", help="节电场景：电力碳足迹因子年份")
    args = p.parse_args()

    if args.scenario == "electricity":
        if args.saving_kwh is None:
            print("节电场景请提供 --saving-kwh <度>")
            return
        behavior = args.saving_kwh
        unit = "kWh"
        factor = args.factor
        factor_ann = None
        is_legacy = False
        if factor is None:
            factor, factor_ann, is_legacy = lookup_electricity_factor(args.year)
    else:
        behavior = args.behavior
        unit = args.unit
        factor = args.factor
        factor_ann = None
        is_legacy = False

    if behavior is None or factor is None:
        print("示例: python inclusion_calc.py --behavior 100 --unit km --factor 0.08 --points-per-kg 10")
        print("节电: python inclusion_calc.py --scenario electricity --saving-kwh 100 --year 2024")
        print("绿色出行: 骑行 100 km × 0.08 kgCO2e/km = 8 kgCO2e = 80 积分")
        return

    reduction = behavior * factor  # kgCO2e
    points = reduction * args.points_per_kg
    print("行为量: {:,.2f} {}".format(behavior, unit))
    print("单位减排因子: {:} kgCO2e/{:}".format(factor, unit))
    if factor_ann:
        tag = "（legacy 回退）" if is_legacy else "（数据层）"
        print("因子来源{}: {}".format(tag, factor_ann))
    print("-" * 40)
    print("减排量: {:,.2f} kgCO2e  =  {:,.4f} tCO2e".format(reduction, reduction / 1000))
    print("积分: {:,.2f} 积分  (系数 {:} 积分/kgCO2e)".format(points, args.points_per_kg))
    print("注：出行/消费等非节电行为因子数据层暂无对应记录，为 references 历史参考(legacy 回退)，"
          "应以地方已备案碳普惠方法学为准；防刷上限未计入。")


if __name__ == "__main__":
    main()
