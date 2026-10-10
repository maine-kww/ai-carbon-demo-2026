#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
query.py — _data 数据层统一查询接口（Skill 层唯一数据入口）

数据目录:  D:\\skills\\carbon-md\\_data\\
数据文件:  industry_rules.json / policy_meta.json / emission_factors.json

Skill 脚本内引用方式（在 skill 的 scripts/ 下）:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "_data"))
    from query import query_industry, query_policy, query_factor, get_meta

函数:
    query_industry(行业代码=None, 行业名称=None)          -> list[dict]  行业规则记录
    query_policy(关键词=None, 政策类型=None, 时效状态=None,
                 适用行业=None, 适用地区=None)           -> list[dict]  政策元数据记录
    query_factor(行业=None, 年份=None, 能源类型=None,
                 地区=None, 版本=None)                    -> list[dict]  排放因子记录(国内官方)
    query_ghg(能源类型=None, 源编码=None, 地区=None,
              年份=None, fuel_type=None, category=None)   -> list[dict]  国际排放因子(ghg-calculator)
    get_meta(表名)                                        -> dict        整表原始结构（含说明/版本）
    query_stats()                                         -> dict        三表统计（行数、状态分布）

匹配规则:
    行业: 精确匹配 行业代码，或模糊匹配 行业名称
    政策: 关键词在 政策名称/文号/结构化摘要/行业标签 中做包含匹配
    因子(国内): 能源类型/地区 做包含匹配；年份精确匹配（None 表示不限）；行业先精确再退回"通用"
    因子(国际 query_ghg): 能源类型匹配中文名/英文name/fuel_type；源编码(epa_hub/egrid/defra/useeio/ember/exiobase)精确；地区/年份 包含匹配

CLI 用法:
    python query.py industry steel
    python query.py policy --keyword 扩围 --type 工作方案
    python query.py factor --energy 电力 --year 2022 --region 全国
    python query.py ghg --fuel electricity --region CN
    python query.py ghg --source ember --fuel electricity
    python query.py ghg --fuel diesel --source epa_hub
    python query.py stats
"""

import json
import sys
import pathlib

DATA_DIR = pathlib.Path(__file__).resolve().parent
_FILES = {
    "industry": "industry_rules.json",
    "policy": "policy_meta.json",
    "factor": "emission_factors.json",
}
_CACHE = {}


def _load(table):
    if table not in _CACHE:
        path = DATA_DIR / _FILES[table]
        with open(path, "r", encoding="utf-8") as f:
            _CACHE[table] = json.load(f)
    return _CACHE[table]


def _contain(value, needle):
    if value is None:
        return False
    if isinstance(value, (list, tuple)):
        return any(_contain(v, needle) for v in value)
    return needle.lower() in str(value).lower()


# 能源类型同义词归一化：数据层因子库用中文能源类型（如"电力-全国平均"），
# skill 输入常用英文 fuel_type（如 electricity/coal/gas）。查询时按同义词展开匹配。
ENERGY_SYNONYMS = {
    "electricity": ["电力", "电"],
    "power": ["电力", "电"],
    "coal": ["原煤", "煤炭", "煤"],
    "rawcoal": ["原煤"],
    "washedcoal": ["洗精煤", "精煤"],
    "gas": ["天然气"],
    "naturalgas": ["天然气"],
    "gasoline": ["汽油"],
    "petrol": ["汽油"],
    "diesel": ["柴油"],
    "fueloil": ["燃料油"],
    "lpg": ["液化石油气"],
    "coke": ["焦炭"],
    "heat": ["热力", "供热"],
    "steam": ["热力", "蒸汽"],
    "热力": ["热力"],
    "电力": ["电力", "电"],
    "电": ["电力", "电"],
}


def _energy_needles(keyword):
    """把用户传入的能源类型关键词展开为可匹配的同义词列表。"""
    key = str(keyword).strip().lower().replace(" ", "")
    return ENERGY_SYNONYMS.get(key, [str(keyword)])


def get_meta(表名):
    """返回整表原始结构（dict）。表名: industry / policy / factor"""
    return _load(表名)


def query_industry(行业代码=None, 行业名称=None):
    """按 行业代码(精确) 或 行业名称(包含) 查询行业规则记录。"""
    records = _load("industry").get("industries", [])
    result = []
    for r in records:
        if 行业代码 and r.get("行业代码", "").strip().lower() == str(行业代码).strip().lower():
            result.append(r)
        elif 行业名称 and _contain(r.get("行业名称"), 行业名称):
            result.append(r)
    # 去重（同一记录可能同时命中代码与名称）
    seen, dedup = set(), []
    for r in result:
        key = (r.get("行业代码"), r.get("行业名称"))
        if key not in seen:
            seen.add(key)
            dedup.append(r)
    return dedup


def query_policy(关键词=None, 政策类型=None, 时效状态=None, 适用行业=None, 适用地区=None):
    """按条件查询政策元数据记录，多个条件同时生效（AND）。"""
    records = _load("policy").get("policies", [])
    result = []
    for r in records:
        if 关键词 and not (
            _contain(r.get("政策名称"), 关键词)
            or _contain(r.get("文号"), 关键词)
            or _contain(r.get("结构化摘要"), 关键词)
            or _contain(r.get("适用行业标签"), 关键词)
        ):
            continue
        if 政策类型 and 政策类型 not in r.get("政策类型", ""):
            continue
        if 时效状态 and 时效状态 not in r.get("时效状态", ""):
            continue
        if 适用行业 and not _contain(r.get("适用行业标签"), 适用行业):
            continue
        if 适用地区 and not _contain(r.get("适用地区标签"), 适用地区):
            continue
        result.append(r)
    return result


def query_factor(行业=None, 年份=None, 能源类型=None, 地区=None, 版本=None):
    """
    按条件查询排放因子记录。
    行业: 优先匹配记录中的行业字段，其次退回"通用"；行业为 None 时不限制。
    年份: 精确匹配字符串/数字；为 None 时不限制。
    能源类型/地区: 包含匹配。
    """
    records = _load("factor").get("factors", [])
    matched = []
    for r in records:
        if 年份 is not None and str(r.get("年份", "") or "") != str(年份):
            continue
        if 能源类型:
            needles = _energy_needles(能源类型)
            if not any(_contain(r.get("能源类型"), n) for n in needles):
                continue
        if 地区 and not _contain(r.get("地区"), 地区):
            continue
        if 版本 and 版本 not in r.get("版本", ""):
            continue
        if 行业 is None:
            matched.append(r)
        else:
            rec_industry = r.get("行业")
            if 行业 == rec_industry or rec_industry == "通用":
                matched.append(r)
    # 排序：行业精确匹配优先于"通用"回退
    if 行业 is not None:
        matched.sort(key=lambda r: 0 if r.get("行业") == 行业 else 1)
    return matched


def query_ghg(能源类型=None, 源编码=None, 地区=None, 年份=None, fuel_type=None, category=None):
    """
    查询国际排放因子（ghg-calculator，967 条）。
    源编码: epa_hub / egrid / defra / useeio / ember / exiobase（精确）
    能源类型: 匹配中文名/英文 name/fuel_type（包含匹配，同义词归一化）
    地区: 包含匹配（如 CN / US / GB 或地区名）
    年份: 精确匹配（None 表示不限）
    fuel_type / category: 精确或包含匹配
    """
    idx_path = DATA_DIR / "ghg_factors" / "ghg_factors_index.json"
    if not idx_path.exists():
        return []
    if "ghg" not in _CACHE:
        with open(idx_path, "r", encoding="utf-8") as f:
            _CACHE["ghg"] = json.load(f)
    records = _CACHE["ghg"].get("factors", [])
    result = []
    for r in records:
        if 源编码 and r.get("源编码", "").strip().lower() != str(源编码).strip().lower():
            continue
        if 地区 and not _contain(r.get("region"), 地区) and not _contain(r.get("name"), 地区):
            continue
        if 年份 is not None and str(r.get("year", "") or "") != str(年份):
            continue
        if fuel_type and not (_contain(r.get("fuel_type"), fuel_type) or _contain(r.get("name"), fuel_type)):
            continue
        if category and not _contain(r.get("category"), category):
            continue
        if 能源类型:
            needles = _energy_needles(能源类型)
            hit = any(
                _contain(r.get("name"), n)
                or _contain(r.get("fuel_type"), n)
                or _contain(r.get("源"), n)
                for n in needles
            )
            if not hit:
                continue
        result.append(r)
    return result


def query_stats():
    """数据层统计：国内三表 + 国际因子库。"""
    stats = {}
    for table, key in (("industry", "industries"), ("policy", "policies"), ("factor", "factors")):
        records = _load(table).get(key, [])
        status = {}
        for r in records:
            s = r.get("数据状态", "未知")
            status[s] = status.get(s, 0) + 1
        stats[table] = {"行数": len(records), "数据状态分布": status}
    # 国际因子库
    idx_path = DATA_DIR / "ghg_factors" / "ghg_factors_index.json"
    ghg_total = 0
    if idx_path.exists():
        with open(idx_path, "r", encoding="utf-8") as f:
            ghg_total = len(json.load(f).get("factors", []))
    stats["ghg_factors(国际)"] = {"行数": ghg_total, "数据状态分布": {"已查证(ghg-calculator MIT源)": ghg_total}}
    return stats


def _cli(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    cmd = argv[0]
    if cmd == "industry":
        code = None
        name = None
        rest = argv[1:]
        if rest and not rest[0].startswith("--"):
            code = rest[0]
        for i, a in enumerate(rest):
            if a == "--name" and i + 1 < len(rest):
                name = rest[i + 1]
        for r in query_industry(行业代码=code, 行业名称=name):
            print(json.dumps(r, ensure_ascii=False, indent=2))
    elif cmd == "policy":
        kw = typ = status = ind = region = None
        rest = argv[1:]
        for i, a in enumerate(rest):
            if a in ("--keyword", "--type", "--status", "--industry", "--region") and i + 1 < len(rest):
                val = rest[i + 1]
                if a == "--keyword":
                    kw = val
                elif a == "--type":
                    typ = val
                elif a == "--status":
                    status = val
                elif a == "--industry":
                    ind = val
                elif a == "--region":
                    region = val
        for r in query_policy(关键词=kw, 政策类型=typ, 时效状态=status, 适用行业=ind, 适用地区=region):
            print(json.dumps(r, ensure_ascii=False, indent=2))
    elif cmd == "factor":
        industry = year = energy = region = version = None
        rest = argv[1:]
        for i, a in enumerate(rest):
            if a in ("--industry", "--year", "--energy", "--region", "--version") and i + 1 < len(rest):
                val = rest[i + 1]
                if a == "--industry":
                    industry = val
                elif a == "--year":
                    year = val
                elif a == "--energy":
                    energy = val
                elif a == "--region":
                    region = val
                elif a == "--version":
                    version = val
        for r in query_factor(行业=industry, 年份=year, 能源类型=energy, 地区=region, 版本=version):
            print(json.dumps(r, ensure_ascii=False, indent=2))
    elif cmd == "ghg":
        energy = source = region = year = ft = cat = None
        rest = argv[1:]
        for i, a in enumerate(rest):
            if a in ("--energy", "--source", "--region", "--year", "--fuel", "--category") and i + 1 < len(rest):
                val = rest[i + 1]
                if a == "--energy":
                    energy = val
                elif a == "--source":
                    source = val
                elif a == "--region":
                    region = val
                elif a == "--year":
                    year = val
                elif a == "--fuel":
                    ft = val
                elif a == "--category":
                    cat = val
        for r in query_ghg(能源类型=energy, 源编码=source, 地区=region, 年份=year, fuel_type=ft, category=cat):
            print(json.dumps(r, ensure_ascii=False, indent=2))
    elif cmd == "stats":
        print(json.dumps(query_stats(), ensure_ascii=False, indent=2))
    else:
        print(f"未知命令: {cmd}", file=sys.stderr)
        print(__doc__)


if __name__ == "__main__":
    _cli(sys.argv[1:])
