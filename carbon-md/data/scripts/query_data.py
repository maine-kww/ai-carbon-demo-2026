#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
双碳数据层统一查询工具
========================
统一查询入口，供所有Skill调用。新增行业/政策/因子只需更新数据文件，无需修改Skill代码。

使用方式：
    python query_data.py <command> [options]

命令列表：
    list-industries                    列出所有行业
    get-industry <industry_name>       查询指定行业的规则详情
    list-policies                      列出所有政策
    search-policy <keyword>            按关键词搜索政策
    get-grid-factor [--year 2023] [--region 全国]   查询电网排放因子
    get-fuel-factor <fuel_type>        查询化石燃料排放因子
    get-process-factor <industry>      查询指定行业的工业过程因子
    list-factors                       列出所有因子类别
    version                            查看数据版本

数据文件位于 ../ 目录下：
    ../industry/industry_rules.json
    ../policy/policy_metadata.json
    ../factors/grid_electricity_factors.json
    ../factors/fossil_fuel_factors.json
    ../factors/industrial_process_factors.json
"""

import json
import os
import sys
import argparse
from pathlib import Path

# 数据文件路径（相对于脚本所在位置）
DATA_DIR = Path(__file__).parent.parent

FILES = {
    "industry": DATA_DIR / "industry" / "industry_rules.json",
    "policy": DATA_DIR / "policy" / "policy_metadata.json",
    "grid_factor": DATA_DIR / "factors" / "grid_electricity_factors.json",
    "fuel_factor": DATA_DIR / "factors" / "fossil_fuel_factors.json",
    "process_factor": DATA_DIR / "factors" / "industrial_process_factors.json",
}


def load_json(filepath: Path) -> dict:
    """加载JSON文件"""
    if not filepath.exists():
        print(f"[ERROR] 数据文件不存在: {filepath}")
        sys.exit(1)
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def cmd_list_industries(args):
    """列出所有行业"""
    data = load_json(FILES["industry"])
    industries = data.get("industries", [])
    
    print(f"共 {len(industries)} 个行业")
    print(f"数据版本: {data.get('_meta', {}).get('version', 'N/A')}")
    print(f"更新时间: {data.get('_meta', {}).get('updated_at', 'N/A')}")
    print("-" * 80)
    
    for idx, ind in enumerate(industries, 1):
        print(f"{idx:2d}. [{ind['industry_code']}] {ind['industry_name']} | 碳市场状态: {ind['carbon_market_status']} | 纳入时间: {ind['纳入全国碳市场时间']}")
    
    return industries


def cmd_get_industry(args):
    """查询指定行业详情"""
    data = load_json(FILES["industry"])
    industries = data.get("industries", [])
    
    target = args.industry_name
    matched = [i for i in industries if target in i["industry_name"] or target in i.get("industry_name_en", "")]
    
    if not matched:
        print(f"[INFO] 未找到匹配行业: {target}")
        print(f"[提示] 可用行业: {', '.join(i['industry_name'] for i in industries)}")
        return None
    
    if len(matched) > 1:
        print(f"[WARN] 找到 {len(matched)} 个匹配行业，返回第一个，请精确匹配")
    
    ind = matched[0]
    print("=" * 60)
    print(f"行业名称: {ind['industry_name']} ({ind['industry_name_en']})")
    print(f"行业代码: {ind['industry_code']}")
    print(f"碳市场状态: {ind['carbon_market_status']}")
    print(f"纳入时间: {ind['纳入全国碳市场时间']}")
    print(f"核算标准: {ind['accounting_standard']}")
    print(f"标准文号: {ind['accounting_standard_code']}")
    print(f"配额分配方法: {ind['quota_allocation_method']}")
    print(f"基准产品: {ind['quota_benchmark_product']}")
    print(f"基准单位: {ind['quota_benchmark_unit']}")
    print(f"CCER抵消比例: {ind['offset_ratio'] * 100}%")
    print(f"核查要求: {'强制第三方核查' if ind['verification']['required'] else '无需'}")
    print(f"排放范围: Scope1={'✓' if ind['scope']['scope1'] else '✗'} Scope2={'✓' if ind['scope']['scope2'] else '✗'} Scope3={'✓' if ind['scope']['scope3'] else '✗'}")
    print(f"主要排放源: {', '.join(ind['emission_sources'])}")
    print(f"核心工序: {', '.join(ind['core_processes'])}")
    print(f"因子来源: {ind['factor_source']}")
    print(f"数据质量要求: {ind['data_quality_requirement']}")
    print(f"相关Skill: {', '.join(ind['related_skills'])}")
    if ind.get("notes"):
        print(f"备注: {ind['notes']}")
    print("=" * 60)
    
    return ind


def cmd_list_policies(args):
    """列出所有政策"""
    data = load_json(FILES["policy"])
    policies = data.get("policies", [])
    
    print(f"共 {len(policies)} 条政策记录")
    print(f"数据版本: {data.get('_meta', {}).get('version', 'N/A')}")
    print("-" * 80)
    
    for idx, p in enumerate(policies, 1):
        status_icon = "✅" if p["status"] == "现行有效" else "⏳"
        print(f"{idx:2d}. [{p['id']}] {p['policy_name']}")
        print(f"    {status_icon} {p['status']} | {p['policy_type']} | {p['document_number']} | 发布: {p['issue_date']}")
    
    return policies


def cmd_search_policy(args):
    """按关键词搜索政策"""
    data = load_json(FILES["policy"])
    policies = data.get("policies", [])
    keyword = args.keyword.lower()
    
    results = []
    for p in policies:
        search_text = " ".join([
            p.get("policy_name", ""),
            p.get("summary", ""),
            p.get("policy_type", ""),
            " ".join(p.get("tags", [])),
            " ".join(p.get("applicable_industries", [])),
        ]).lower()
        if keyword in search_text:
            results.append(p)
    
    print(f"关键词「{args.keyword}」匹配到 {len(results)} 条政策")
    print("-" * 80)
    
    for idx, p in enumerate(results, 1):
        print(f"{idx}. [{p['id']}] {p['policy_name']}")
        print(f"   {p['status']} | {p['issuing_authority']} | {p['issue_date']}")
        print(f"   摘要: {p.get('summary', 'N/A')[:80]}...")
        print(f"   适用行业: {', '.join(p.get('applicable_industries', []))}")
        print(f"   影响Skill: {', '.join(p.get('affects_skills', []))}")
        print()
    
    return results


def cmd_get_grid_factor(args):
    """查询电网排放因子"""
    data = load_json(FILES["grid_factor"])
    factors = data.get("factors", [])
    
    year = args.year
    region = args.region
    
    # 优先精确匹配年份+区域（区域支持模糊匹配）
    exact = [f for f in factors if f["year"] == year and (f["region"] == region or region in f["region"] or f["region"] in region)]
    
    if exact:
        f = exact[0]
        print(f"电网排放因子（{f['year']}年 / {f['region']}）")
        print(f"  排放因子: {f['factor_value']} {f['factor_unit']}")
        print(f"  数据来源: {f['source']}")
        print(f"  状态: {f['status']}")
        if f.get("notes"):
            print(f"  备注: {f['notes']}")
        return f
    
    # 近似匹配：年份近似（区域支持模糊匹配）
    same_region = [f for f in factors if (f["region"] == region or region in f["region"] or f["region"] in region)]
    if same_region:
        # 取最近年份
        same_region.sort(key=lambda x: abs(x["year"] - year), reverse=False)
        f = same_region[0]
        print(f"[提示] 未找到{year}年{region}的精确数据，使用最近年份{f['year']}年的数据：")
        print(f"  排放因子: {f['factor_value']} {f['factor_unit']}")
        print(f"  数据来源: {f['source']}")
        print(f"  状态: {f['status']}")
        return f
    
    # 兜底：全国值
    national = [f for f in factors if f["region"] == "全国"]
    if national:
        national.sort(key=lambda x: abs(x["year"] - year), reverse=False)
        f = national[0]
        print(f"[提示] 使用全国平均值兜底：{f['year']}年")
        print(f"  排放因子: {f['factor_value']} {f['factor_unit']}")
        return f
    
    print("[ERROR] 未找到任何电网排放因子数据")
    return None


def cmd_get_fuel_factor(args):
    """查询化石燃料排放因子"""
    data = load_json(FILES["fuel_factor"])
    factors = data.get("factors", [])
    
    fuel_type = args.fuel_type
    matched = [f for f in factors if fuel_type in f["fuel_type"] or fuel_type in f["fuel_category"]]
    
    if not matched:
        print(f"[INFO] 未找到匹配燃料: {fuel_type}")
        print(f"[提示] 可用燃料类型: {', '.join(set(f['fuel_type'] for f in factors))}")
        return None
    
    print(f"匹配到 {len(matched)} 种燃料因子")
    print("-" * 60)
    
    for f in matched:
        print(f"燃料类别: {f['fuel_category']} - {f['fuel_type']}")
        print(f"  低位发热量: {f['ncv_value']} {f['ncv_unit']}")
        print(f"  单位热值含碳量: {f['carbon_per_heat_value']} {f['carbon_per_heat_unit']}")
        print(f"  碳氧化率: {f['oxidation_rate']}")
        print(f"  CO2排放因子(按质量): {f['ef_co2_mass_value']} {f['ef_co2_mass_unit']}")
        print(f"  CO2排放因子(按标煤): {f['ef_co2_value']} {f['ef_co2_unit']}")
        print(f"  来源: {f['source']}")
        print(f"  适用行业: {', '.join(f['applicable_industries'])}")
        print()
    
    return matched


def cmd_get_process_factor(args):
    """查询工业过程排放因子"""
    data = load_json(FILES["process_factor"])
    industries = data.get("factors_by_industry", [])
    
    industry = args.industry
    matched = [i for i in industries if industry in i["industry"]]
    
    if not matched:
        print(f"[INFO] 未找到匹配行业: {industry}")
        print(f"[提示] 已覆盖行业: {', '.join(i['industry'] for i in industries)}")
        return None
    
    for ind in matched:
        print(f"行业: {ind['industry']}")
        print(f"过程排放源数: {len(ind['process_emissions'])}")
        print("-" * 60)
        
        for f in ind["process_emissions"]:
            print(f"  排放源: {f['source']}")
            print(f"  因子名: {f['factor_name']}")
            print(f"  因子值: {f['ef_value']} {f['ef_unit']}")
            print(f"  依据: {f['basis']}")
            print(f"  来源: {f['source']}")
            print()
    
    # 输出GWP值
    gwp = data.get("gwp_values", {})
    print("GWP参考值（用于非CO2气体折算）:")
    default_ver = gwp.get("china_default", "IPCC AR5")
    print(f"  中国核算体系默认: {default_ver}")
    if "ipcc_ar5" in gwp:
        print(f"  IPCC AR5: CO2=1, CH4={gwp['ipcc_ar5']['CH4']}, N2O={gwp['ipcc_ar5']['N2O']}")
    
    return matched


def cmd_list_factors(args):
    """列出所有因子类别"""
    print("排放因子库结构:")
    print("=" * 60)
    print("1. 电网排放因子 (grid_electricity_factors.json)")
    print("   - 全国和6大区域电网排放因子")
    print("   - 多年度数据，年度更新")
    print()
    print("2. 化石燃料燃烧排放因子 (fossil_fuel_factors.json)")
    data = load_json(FILES["fuel_factor"])
    fuels = data.get("factors", [])
    cats = set(f["fuel_category"] for f in fuels)
    print(f"   - 燃料类别: {', '.join(cats)}")
    print(f"   - 共 {len(fuels)} 种燃料")
    print()
    print("3. 工业过程排放因子 (industrial_process_factors.json)")
    proc = load_json(FILES["process_factor"])
    inds = proc.get("factors_by_industry", [])
    print(f"   - 覆盖行业: {', '.join(i['industry'] for i in inds)}")
    print("   - 含GWP值（AR5 / AR6）")


def cmd_version(args):
    """查看数据版本"""
    print("双碳数据层版本信息")
    print("=" * 40)
    for key, path in FILES.items():
        data = load_json(path)
        meta = data.get("_meta", {})
        print(f"{key}:")
        print(f"  版本: {meta.get('version', 'N/A')}")
        print(f"  更新时间: {meta.get('updated_at', 'N/A')}")
        print(f"  说明: {meta.get('description', 'N/A')[:60]}...")
        print()


def main():
    parser = argparse.ArgumentParser(description="双碳数据层统一查询工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")
    
    # list-industries
    p1 = subparsers.add_parser("list-industries", help="列出所有行业")
    p1.set_defaults(func=cmd_list_industries)
    
    # get-industry
    p2 = subparsers.add_parser("get-industry", help="查询指定行业详情")
    p2.add_argument("industry_name", help="行业名称（支持模糊匹配）")
    p2.set_defaults(func=cmd_get_industry)
    
    # list-policies
    p3 = subparsers.add_parser("list-policies", help="列出所有政策")
    p3.set_defaults(func=cmd_list_policies)
    
    # search-policy
    p4 = subparsers.add_parser("search-policy", help="按关键词搜索政策")
    p4.add_argument("keyword", help="搜索关键词")
    p4.set_defaults(func=cmd_search_policy)
    
    # get-grid-factor
    p5 = subparsers.add_parser("get-grid-factor", help="查询电网排放因子")
    p5.add_argument("--year", type=int, default=2023, help="年份（默认2023）")
    p5.add_argument("--region", default="全国", help="区域（默认全国）")
    p5.set_defaults(func=cmd_get_grid_factor)
    
    # get-fuel-factor
    p6 = subparsers.add_parser("get-fuel-factor", help="查询化石燃料排放因子")
    p6.add_argument("fuel_type", help="燃料类型（支持模糊匹配）")
    p6.set_defaults(func=cmd_get_fuel_factor)
    
    # get-process-factor
    p7 = subparsers.add_parser("get-process-factor", help="查询工业过程排放因子")
    p7.add_argument("industry", help="行业名称")
    p7.set_defaults(func=cmd_get_process_factor)
    
    # list-factors
    p8 = subparsers.add_parser("list-factors", help="列出所有因子类别")
    p8.set_defaults(func=cmd_list_factors)
    
    # version
    p9 = subparsers.add_parser("version", help="查看数据版本")
    p9.set_defaults(func=cmd_version)
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(0)
    
    args.func(args)


if __name__ == "__main__":
    main()
