#!/usr/bin/env python3
"""
factory_score.py — 绿色工厂评价指标自评计分（数据驱动版）

按维度输入指标得分，汇总并识别低于达标线的项目。
数据驱动增量（2026-10-09）：传入 --industry 时，自动从 _data 行业规则表顶层
"零碳工厂扩围计划"节点判定该行业处于 2027 培育期 / 2030 拓展期 / 暂未纳入，
并从政策元数据表 query_policy(关键词="零碳工厂") 取工信部联节〔2026〕13号
作为政策依据；数据层不可用时回退为 legacy 提示（不影响原有评分）。

用法:
    python factory_score.py input.csv [--pass 80]
    python factory_score.py input.csv --industry 汽车
    python factory_score.py --sample

CSV 字段: dimension,indicator,max_score,score
  pass 默认 80，低于该值的指标被标记为待补强。
"""

import csv
import pathlib
import sys

# ---------- 数据层接入（数据驱动模式） ----------
DATA_LAYER_DIR = pathlib.Path(__file__).resolve().parents[2] / "_data"


def _import_query():
    try:
        sys.path.insert(0, str(DATA_LAYER_DIR))
        from query import get_meta, query_policy
        return get_meta, query_policy, None
    except Exception as exc:  # 数据层不可用 → legacy 回退
        return None, None, str(exc)


def lookup_zero_carbon_scope(industry):
    """
    从行业规则表顶层"零碳工厂扩围计划"节点判定行业培育归属。
    返回 (tier, node, annotation) ；查不到返回 (None, node_or_None, err)。
    tier ∈ {"2027年培育行业", "2030年拓展行业", "暂未纳入零碳工厂培育清单"}
    """
    get_meta, query_policy, err = _import_query()
    if get_meta is None:
        return None, None, f"数据层不可用({err})，培育范围请以 references 与当年官方通知为准"
    try:
        node = get_meta("industry").get("零碳工厂扩围计划", {})
    except Exception as exc:
        return None, None, f"读取零碳工厂扩围计划节点失败({exc})"
    name = str(industry).strip()
    if name in node.get("2027年培育行业", []):
        tier = "2027年培育行业"
    elif name in node.get("2030年拓展行业", []):
        tier = "2030年拓展行业"
    else:
        tier = "暂未纳入零碳工厂培育清单"
    annotation = (
        f"来源: industry_rules.json 顶层节点 [数据状态: 见节点依据字段]；"
        f"2027培育={node.get('2027年培育行业')}；2030拓展={node.get('2030年拓展行业')}"
    )
    return tier, node, annotation


def lookup_policy_basis():
    """
    从政策元数据表查询零碳工厂指导意见（工信部联节〔2026〕13号）。
    返回 (annotation, records)；数据层不可用返回 (err, [])。
    """
    get_meta, query_policy, err = _import_query()
    if query_policy is None:
        return f"数据层不可用({err})，政策依据请以 references/standards-sources.md 为准", []
    records = query_policy(关键词="零碳工厂")
    if not records:
        return "政策表未命中零碳工厂记录（占位-待核实），政策依据请以 references 为准", []
    lines = []
    for r in records:
        lines.append(
            f"{r.get('政策名称')}（{r.get('文号')}）| {r.get('发文机关')} | "
            f"{r.get('发布日期')} | 时效:{r.get('时效状态')} | 数据状态:{r.get('数据状态')}"
        )
    return "；".join(lines), records


def parse_args(argv):
    path = None
    industry = None
    sample = False
    pass_line = 80.0
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--sample":
            sample = True
        elif a == "--industry" and i + 1 < len(argv):
            industry = argv[i + 1]; i += 1
        elif a == "--pass" and i + 1 < len(argv):
            try:
                pass_line = float(argv[i + 1]); i += 1
            except ValueError:
                pass
        elif a in ("-h", "--help"):
            print(__doc__); sys.exit(0)
        elif path is None:
            path = a
        i += 1
    return path, sample, industry, pass_line


def main():
    args = sys.argv[1:]
    if "--sample" in args:
        print("dimension,indicator,max_score,score")
        print("基础设施,建筑节能,10,8")
        print("管理体系,ISO14001,10,10")
        print("能源投入,单位产品能耗,15,10")
        print("环境排放,温室气体,15,12")
        return
    path, sample, industry, pass_line = parse_args(args)
    if path is None:
        print(__doc__); return

    total_score = 0.0
    total_max = 0.0
    by_dim = {}
    with open(path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print("dimension   indicator         score")
    print("-" * 42)
    for r in rows:
        ms = float(r["max_score"])
        sc = float(r["score"])
        total_score += sc
        total_max += ms
        dim = r.get("dimension", "?")
        by_dim[dim] = by_dim.get(dim, 0) + sc
        ratio = sc / ms * 100 if ms else 0
        flag = " <-- 待补强" if ratio < pass_line else ""
        print(f"{dim:<10}{r['indicator']:<16}{sc:.1f}/{ms:.1f}{flag}")
    print("-" * 42)
    overall = total_score / total_max * 100 if total_max else 0
    print(f"总分: {total_score:.1f}/{total_max:.1f}  (综合得分率 {overall:.1f})")
    print("按维度:")
    for dim, sc in by_dim.items():
        print(f"  {dim}: {sc:.1f}")
    print(f"达标线: 单项 {pass_line:.0f} 分%（低于者需补强）")

    # ---------- 数据驱动：零碳工厂培育范围 + 政策依据 ----------
    if industry:
        print("\n=== 数据层查询（零碳工厂） ===")
        tier, node, ann = lookup_zero_carbon_scope(industry)
        if tier is not None:
            print(f"申报行业: {industry} → {tier}")
            print(f"  {ann}")
        else:
            print(f"[legacy 回退] {ann}")
        policy_ann, _ = lookup_policy_basis()
        print(f"政策依据: {policy_ann}")


if __name__ == "__main__":
    main()
