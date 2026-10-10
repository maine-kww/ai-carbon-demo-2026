#!/usr/bin/env python3
"""
update_policy_meta.py — 把 scanner 产出的变更清单合并入 policy_meta（dry-run 默认）

用法:
    python update_policy_meta.py --changes tmp\\changes.json
        # 默认 dry-run：只打印将新增/更新哪些记录、schema 校验结果、受影响行业与 skill，不写任何文件。
    python update_policy_meta.py --changes tmp\\changes.json --apply
        # 写库：默认写入本 skill tmp\\policy_meta_updated.json（副本），绝不触碰 _data 真实文件。
    python update_policy_meta.py --changes tmp\\changes.json --meta tmp\\policy_meta_copy.json
        # 指定被合并的基准元数据副本（默认同样读 _data 真实文件，但只读）。
    python update_policy_meta.py --changes tmp\\changes.json --apply --target D:\\...\\policy_meta.json
        # 显式指定写库目标；若目标是 _data 真实文件，必须再加 --into-data-layer 才允许写入（人工已确认的前提下）。

合并规则:
- 新增记录：scanner 只拿到 标题/链接/日期/来源 + 规则推断字段；
  缺省字段按"待人工确认"补齐：数据状态=占位-待核实，文号/发文机关/结构化摘要 标注待人工确认。
- 更新记录：按归一化标题命中现有记录，仅更新 发布日期/原文链接/更新日期，并在结构化摘要前加更新说明。
- 写库前做 schema 校验：13 个必备字段缺一不可，适用行业标签/适用地区标签必须为列表。
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

# policy_meta.json 种子文件字段清单（13 项，与 _data/policy_meta.json 一致）
REQUIRED_FIELDS = [
    "政策名称", "文号", "发文机关", "发布日期", "时效状态",
    "适用行业标签", "适用地区标签", "政策类型", "原文链接",
    "结构化摘要", "数据状态", "来源", "更新日期",
]

SKILL_DIR = pathlib.Path(__file__).resolve().parents[1]
REAL_META = pathlib.Path(__file__).resolve().parents[2] / "_data" / "policy_meta.json"
DEFAULT_TARGET = SKILL_DIR / "tmp" / "policy_meta_updated.json"

# 行业标签 / 政策类型 -> 受影响 skill（与 references/skill-industry-map.md 保持一致，两边同步维护）
INDUSTRY_SKILL_MAP = {
    "发电": ["carbon-trading", "carbon-mrv", "carbon-accounting"],
    "钢铁": ["carbon-accounting", "carbon-trading", "carbon-mrv", "green-factory"],
    "水泥": ["carbon-accounting", "carbon-trading", "carbon-mrv", "green-factory"],
    "铝冶炼": ["carbon-accounting", "carbon-trading", "carbon-mrv", "green-factory"],
    "石化化工": ["carbon-accounting", "carbon-mrv", "green-factory"],
    "造纸": ["carbon-accounting", "carbon-mrv"],
    "航空": ["carbon-trading", "carbon-footprint"],
    "汽车": ["green-factory", "supply-chain-carbon", "carbon-footprint"],
    "锂电池": ["green-factory", "supply-chain-carbon", "carbon-footprint"],
    "光伏": ["green-factory", "supply-chain-carbon", "carbon-footprint"],
    "电子电器": ["green-factory", "supply-chain-carbon"],
    "轻工": ["green-factory", "carbon-accounting"],
    "机械": ["green-factory", "carbon-accounting"],
    "纺织": ["green-factory", "carbon-accounting"],
    "建材": ["green-factory", "carbon-accounting"],
    "有色金属": ["green-factory", "carbon-accounting"],
    "算力设施": ["green-factory", "carbon-footprint"],
    "CCER": ["ccer-development"],
    "通用": ["carbon-accounting", "carbon-mrv", "carbon-footprint"],
}
POLICY_TYPE_SKILL_MAP = {
    "行政法规": ["carbon-policy", "carbon-trading"],
    "部门规章": ["carbon-policy", "carbon-trading", "ccer-development"],
    "工作方案": ["carbon-trading", "carbon-mrv", "carbon-accounting", "carbon-roadmap"],
    "配额方案": ["carbon-trading"],
    "核算指南": ["carbon-accounting", "carbon-mrv"],
    "核查指南": ["carbon-mrv"],
    "国家标准": ["carbon-accounting", "carbon-footprint"],
    "排放因子发布": ["carbon-footprint", "carbon-accounting"],
    "激励政策": ["green-factory"],
    "通知公告": ["carbon-trading", "carbon-policy"],
    "征求意见稿": ["carbon-policy"],
}


def normalize_title(t: str) -> str:
    t = re.sub(r"\s+", "", t or "")
    t = t.replace("（", "(").replace("）", ")")
    t = t.replace("《", "").replace("》", "")
    return t


def build_new_record(chg: str, today: str) -> dict:
    """由 scanner 变更条目构建完整 13 字段新记录；缺省字段标注待人工确认。"""
    inferred_type = chg.get("规则推断_政策类型", "待人工确认")
    summary = chg.get("结构化摘要") or (
        f"【待人工确认】自动检测到的新政策（推断类型：{inferred_type}）。"
        f"LLM 结构化提取环节由人工替代：请打开原文链接，人工补全文号、发文机关、"
        f"条款要点摘要、适用行业与地区的最终标签。检测来源：{chg.get('来源')}。"
    )
    return {
        "政策名称": chg["政策名称"],
        "文号": "待人工确认",
        "发文机关": "待人工确认",
        "发布日期": chg.get("发布日期", "待核实"),
        "时效状态": "现行有效（待核）",
        "适用行业标签": chg.get("规则推断_行业标签", ["待人工确认"]),
        "适用地区标签": [chg.get("规则推断_地区标签", "全国（待核）")],
        "政策类型": inferred_type,
        "原文链接": chg.get("原文链接", "待核实"),
        "结构化摘要": summary,
        "数据状态": "占位-待核实",
        "来源": f"自动扫描检出（{chg.get('来源')}），待人工确认",
        "更新日期": today,
    }


def validate_record(rec: dict) -> list:
    """返回错误列表（空=通过）。"""
    errs = []
    for f in REQUIRED_FIELDS:
        if f not in rec:
            errs.append(f"缺字段: {f}")
    if not isinstance(rec.get("适用行业标签"), list):
        errs.append("适用行业标签 必须是列表")
    if not isinstance(rec.get("适用地区标签"), list):
        errs.append("适用地区标签 必须是列表")
    return errs


def affected_union(changes):
    industries, skills = set(), set()
    for chg in changes:
        for ind in chg.get("规则推断_行业标签", []):
            if ind != "待人工确认":
                industries.add(ind)
                skills.update(INDUSTRY_SKILL_MAP.get(ind, []))
        ptype = chg.get("规则推断_政策类型", "")
        skills.update(POLICY_TYPE_SKILL_MAP.get(ptype, []))
    return sorted(industries), sorted(skills)


def main(argv=None):
    ap = argparse.ArgumentParser(description="合并政策变更入 policy_meta（默认 dry-run）")
    ap.add_argument("--changes", type=pathlib.Path, required=True, help="scanner 产出的 changes.json")
    ap.add_argument("--meta", type=pathlib.Path, default=REAL_META, help="被合并的基准 policy_meta（只读）")
    ap.add_argument("--apply", action="store_true", help="真正写库（默认只 dry-run 打印）")
    ap.add_argument("--target", type=pathlib.Path, default=DEFAULT_TARGET, help="写库目标路径（默认本 skill tmp 副本）")
    ap.add_argument("--into-data-layer", action="store_true",
                    help="当 --target 指向 _data 真实文件时，必须显式加此旗标才允许写入")
    args = ap.parse_args(argv)

    today = dt.date.today().isoformat()
    with open(args.changes, "r", encoding="utf-8") as f:
        changes_doc = json.load(f)
    changes = changes_doc.get("changes", [])

    with open(args.meta, "r", encoding="utf-8") as f:
        meta = json.load(f)
    policies = meta.setdefault("policies", [])
    title_index = {normalize_title(r.get("政策名称", "")): r for r in policies}

    print(f"=== 合并计划（{'APPLY 写库' if args.apply else 'DRY-RUN 仅预览'}） ===")
    print(f"变更来源: {args.changes}（模式 {changes_doc.get('mode')}）")
    print(f"基准元数据(只读): {args.meta}（现有 {len(policies)} 条）\n")

    new_records, update_targets, errors = [], [], []
    for chg in changes:
        if chg["类型"] == "新增":
            rec = build_new_record(chg, today)
            errs = validate_record(rec)
            errors.extend([(rec["政策名称"], e) for e in errs])
            new_records.append(rec)
            print(f"[新增] {rec['政策名称']}")
            print(f"       发布日期={rec['发布日期']} 类型={rec['政策类型']} 行业={rec['适用行业标签']}")
        else:  # 更新
            norm = normalize_title(chg["政策名称"])
            if norm in title_index:
                rec = title_index[norm]
                rec["原文链接"] = chg.get("原文链接", rec.get("原文链接"))
                rec["发布日期"] = chg.get("发布日期", rec.get("发布日期"))
                rec["更新日期"] = today
                rec["结构化摘要"] = str(rec.get("结构化摘要", "")) + f" [扫描更新:{chg.get('说明')}]"
                update_targets.append(rec)
                print(f"[更新] {rec['政策名称']}  -> 发布日期={rec['发布日期']}")
            else:
                print(f"[更新-跳过] {chg['政策名称']}：基准中未命中，按新增处理")
                rec = build_new_record(chg, today)
                new_records.append(rec)

    industries, skills = affected_union(changes)
    print("\n=== 受影响范围 ===")
    print(f"受影响行业标签: {', '.join(industries) if industries else '（全部待人工确认，暂无）'}")
    print(f"受影响 skill:   {', '.join(skills) if skills else '（暂无）'}")

    print("\n=== Schema 校验 ===")
    if errors:
        for name, e in errors:
            print(f"[错误] {name}: {e}")
        print("存在字段错误，APPLY 将被拒绝。")
        return 2
    print(f"{len(new_records)} 条新增记录 + {len(update_targets)} 条更新记录均通过 13 字段 schema 校验。")

    if not args.apply:
        print("\n[DRY-RUN] 未写任何文件。确认无误后加 --apply 执行（默认写入本 skill tmp 副本）。")
        print(f"预览目标: {args.target}")
        return 0

    # ---- APPLY：写库仅作用于副本；指向真实 _data 文件时须显式 --into-data-layer ----
    target = args.target
    if target.resolve() == REAL_META.resolve() and not args.into_data_layer:
        print("\n[拒绝写入] 目标是 _data/policy_meta.json 真实文件。")
        print("本脚本默认只写副本；若人工已完成确认并确需更新数据层，请显式加 --into-data-layer。")
        return 3

    meta["updated_at"] = today
    meta["说明"] = meta.get("说明", "") + " （本副本由 carbon-policy-monitor 合并生成，人工确认后再考虑回灌数据层）"
    policies.extend(new_records)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"\n[APPLY] 已写入: {target}")
    print(f"        新增 {len(new_records)} 条 / 更新 {len(update_targets)} 条 / 合并后总计 {len(policies)} 条。")
    print("注意：这是副本，未改动 _data 真实文件。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
