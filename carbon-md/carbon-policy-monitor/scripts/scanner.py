#!/usr/bin/env python3
"""
scanner.py — 白名单政策来源扫描器（carbon-policy-monitor）

定期扫描白名单来源页面，提取政策链接/标题/发布日期，与
_data/policy_meta.json 现有记录比对，生成变更清单（新增 / 更新）。

用法:
    python scanner.py                          # 在线扫描全部白名单来源
    python scanner.py --offline               # 离线演示模式：只读 fixtures/ 样例页
    python scanner.py --fixtures D:\\path     # 指定离线样例页目录
    python scanner.py --meta D:\\...\\policy_meta.json   # 指定比对基准元数据（默认 _data 真实文件，只读）
    python scanner.py --out tmp\\changes.json            # 变更清单 JSON 输出路径（默认写本 skill tmp\\changes.json）
    python scanner.py --timeout 8              # 单源抓取超时（秒）

行为约定:
- 仅使用标准库；网络不稳定时单源失败不影响其他源，记录 failed_sources 继续。
- 全部来源在线抓取失败时，自动降级到 fixtures 离线演示模式（优雅降级）。
- 比对基准 policy_meta.json 只读取，绝不写入。
- 结构化字段（文号/机关/摘要/行业标签）只做"规则推断"，推断结果一律标注
  "待人工确认"；LLM 环节由人工打开原文链接后人工确认替代。
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# 白名单来源（与 references/whitelist_sources.md 保持一致；增删两边同步修改）
# tier: 权威 / 交易机构 / 行业媒体(次级) / 省级
# fixture: 该源在离线演示模式下使用的样例页文件名（None=离线演示不覆盖该源）
# ---------------------------------------------------------------------------
WHITELIST = [
    {"name": "生态环境部-政策法规",       "url": "https://www.mee.gov.cn/xxgk2018/xxgk/zfxxgk/", "frequency": "每周", "tier": "权威",            "fixture": "mee_list.html"},
    {"name": "生态环境部-通知公告",       "url": "https://www.mee.gov.cn/xxgk2018/xxgk/xxgk01/", "frequency": "每日", "tier": "权威",            "fixture": "mee_list.html"},
    {"name": "中国政府网-政策文件库",     "url": "https://www.gov.cn/zhengce/zhengceku/",       "frequency": "每周", "tier": "权威",            "fixture": "govcn_list.html"},
    {"name": "国家发展改革委-政策发布",   "url": "https://www.ndrc.gov.cn/xxgk/zcfb/",          "frequency": "每周", "tier": "权威",            "fixture": "govcn_list.html"},
    {"name": "工信部-节能与综合利用司",   "url": "https://www.miit.gov.cn/jgsj/jns/",           "frequency": "每周", "tier": "权威",            "fixture": None},
    {"name": "上海环境能源交易所",        "url": "https://www.cneeex.com/",                      "frequency": "每日", "tier": "交易机构",        "fixture": "cneeex_list.html"},
    {"name": "北京绿色交易所",            "url": "https://www.cbeex.com.cn/",                    "frequency": "每周", "tier": "交易机构",        "fixture": None},
    {"name": "中国碳排放交易网",          "url": "http://www.tanpaifang.com/",                   "frequency": "每周", "tier": "行业媒体(次级)", "fixture": None},
    {"name": "贵州省生态环境厅",          "url": "https://sthj.guizhou.gov.cn/",                 "frequency": "每月", "tier": "省级",            "fixture": None},
    {"name": "重庆市生态环境局",          "url": "https://sthjj.cq.gov.cn/",                     "frequency": "每月", "tier": "省级",            "fixture": None},
    {"name": "广东省生态环境厅",          "url": "https://gdee.gd.gov.cn/",                      "frequency": "每月", "tier": "省级",            "fixture": None},
]

SKILL_DIR = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_META = pathlib.Path(__file__).resolve().parents[2] / "_data" / "policy_meta.json"
DEFAULT_FIXTURES = SKILL_DIR / "fixtures"
DEFAULT_OUT = SKILL_DIR / "tmp" / "changes.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")

ANCHOR_RE = re.compile(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.S | re.I)
DATE_RE = re.compile(r'(\d{4})\s*[-/年\.]\s*(\d{1,2})\s*[-/月\.]\s*(\d{1,2})')
TAG_RE = re.compile(r'<[^>]+>')
CHUNK_RE = re.compile(r'</(?:li|tr|div|p)>', re.I)
SKIP_TITLES = {"首页", "更多", "更多>>", "登录", "注册", " English", "无障碍", "关怀版"}

# 政策类标题关键词：用于在线抓取时过滤导航噪音（无日期的导航链接若不含此类词则丢弃）
POLICY_LIKE = ("通知", "办法", "方案", "指南", "条例", "规则", "意见", "公告", "规定",
               "目录", "配额", "碳", "节能", "减排", "低碳", "气候", "零碳", "达峰")


def is_policy_like(title: str, date: str) -> bool:
    """候选条目保留规则：就近有日期，或标题含政策类关键词。"""
    if date and date != "待核实":
        return True
    return any(k in title for k in POLICY_LIKE)


def normalize_title(title: str) -> str:
    """标题归一化：去空白/书名号、统一括号，用于与现有记录比对。"""
    t = TAG_RE.sub("", title)
    t = re.sub(r"\s+", "", t)
    t = t.replace("（", "(").replace("）", ")")
    t = t.replace("，", ",").replace("：", ":")
    t = t.replace("《", "").replace("》", "")
    return t.strip()


def parse_date(text: str):
    m = DATE_RE.search(text or "")
    if not m:
        return None
    y, mo, d = (int(x) for x in m.groups())
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


def strip_anchor_text(raw: str) -> str:
    t = TAG_RE.sub("", raw or "")
    return re.sub(r"\s+", " ", t).strip()


def extract_entries(html: str, base_url: str, source_name: str):
    """把页面按块切分，每块内提取 <a> 标题 + 就近日期。返回候选条目列表。"""
    entries = []
    seen_urls = set()
    for chunk in CHUNK_RE.split(html):
        for href, text in ANCHOR_RE.findall(chunk):
            title = strip_anchor_text(text)
            if len(title) < 6 or title in SKIP_TITLES:
                continue
            if not re.search(r"[一-鿿]", title):
                continue
            url = href.strip()
            if url.startswith("#") or url.startswith("javascript"):
                continue
            # 相对链接补全
            if url.startswith("/"):
                m = re.match(r"(https?://[^/]+)", base_url)
                url = (m.group(1) if m else base_url.rstrip("/")) + url
            elif not url.startswith("http"):
                url = base_url.rstrip("/") + "/" + url.lstrip("/")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            date = parse_date(chunk) or parse_date(html[: max(0, html.find(href) + 200)])
            entries.append({"政策名称": title, "原文链接": url, "发布日期": date or "待核实",
                            "来源": source_name})
    return entries


def fetch(url: str, timeout: int):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    for enc in ("utf-8", "gb18030", "gbk"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# 规则推断（LLM 环节由人工确认替代：这里只给候选，不写死进库）
# ---------------------------------------------------------------------------
INDUSTRY_KEYWORDS = [
    ("发电", ["发电", "电力", "电网"]),
    ("钢铁", ["钢铁", "焦化"]),
    ("水泥", ["水泥"]),
    ("铝冶炼", ["铝冶炼", "电解铝", "有色金属"]),
    ("石化化工", ["石化", "化工", "炼化"]),
    ("造纸", ["造纸"]),
    ("航空", ["航空"]),
    ("汽车", ["汽车"]),
    ("锂电池", ["锂电池", "动力电池"]),
    ("光伏", ["光伏"]),
    ("电子电器", ["电子电器", "电子"]),
    ("纺织", ["纺织"]),
    ("算力设施", ["算力", "数据中心"]),
]
POLICY_TYPE_KEYWORDS = [
    ("配额方案", ["配额", "清缴"]),
    ("核算指南", ["核算", "报告指南"]),
    ("核查指南", ["核查"]),
    ("征求意见稿", ["征求意见", "征求意见稿"]),
    ("工作方案", ["工作方案", "实施方案"]),
    ("部门规章", ["办法", "条例"]),
    ("国家标准", ["GB/T", "国家标准"]),
    ("排放因子发布", ["排放因子", "碳足迹因子"]),
    ("通知公告", ["通知", "公告"]),
]


def infer_tags(title: str):
    industries = [name for name, kws in INDUSTRY_KEYWORDS if any(k in title for k in kws)]
    if not industries:
        industries = ["待人工确认"]
    ptype = "待人工确认"
    for name, kws in POLICY_TYPE_KEYWORDS:
        if any(k in title for k in kws):
            ptype = name
            break
    region = "全国（待核）"
    for key in ("省", "自治区", "北京市", "上海市", "天津市", "重庆市", "广州市", "深圳市"):
        if key in title:
            region = "地方（待核）"
            break
    return industries, ptype, region


# ---------------------------------------------------------------------------
# 与 policy_meta.json 比对
# ---------------------------------------------------------------------------
def load_existing_titles(meta_path: pathlib.Path):
    """读取现有政策元数据，返回 (归一标题 -> 记录) 映射。文件缺失/损坏时返回空表并告警。"""
    mapping = {}
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"[警告] 比对基准文件不存在：{meta_path}（按空库处理，全部判为新增）")
        return mapping
    except Exception as exc:
        print(f"[警告] 比对基准文件读取失败({exc})，按空库处理")
        return mapping
    for rec in data.get("policies", []):
        t = rec.get("政策名称", "")
        mapping[normalize_title(t)] = rec
    return mapping


def compare(entries, existing_map):
    """返回 (changes, known_count)。changes 元素含 类型/政策名称/原文链接/发布日期/来源/规则推断字段。"""
    changes, known = [], 0
    for e in entries:
        norm = normalize_title(e["政策名称"])
        industries, ptype, region = infer_tags(e["政策名称"])
        base = {
            "政策名称": e["政策名称"],
            "原文链接": e["原文链接"],
            "发布日期": e["发布日期"],
            "来源": e["来源"],
            "规则推断_政策类型": ptype,
            "规则推断_行业标签": industries,
            "规则推断_地区标签": region,
            "人工确认状态": "待人工确认（LLM 环节由人工替代：请打开原文链接补全文号/机关/摘要）",
        }
        if norm in existing_map:
            old = existing_map[norm]
            old_date = parse_date(str(old.get("发布日期", "")))
            if old_date and e["发布日期"] != "待核实" and old_date != e["发布日期"]:
                base["类型"] = "更新"
                base["说明"] = f"标题命中现有记录，发布日期由 {old_date} 变为 {e['发布日期']}"
                changes.append(base)
            else:
                known += 1
        else:
            base["类型"] = "新增"
            base["说明"] = "未在 policy_meta.json 中命中同标题记录"
            changes.append(base)
    return changes, known


def scan_source(src, timeout, fixtures_dir, offline):
    """扫描单个来源。返回 (entries, status, error)。offline 模式只读 fixtures。"""
    if offline:
        fname = src.get("fixture")
        if not fname:
            return [], "skip-no-fixture", "离线演示不覆盖该源"
        fpath = fixtures_dir / fname
        if not fpath.exists():
            return [], "failed", f"样例页缺失: {fpath}"
        with open(fpath, "r", encoding="utf-8") as f:
            html = f.read()
        return extract_entries(html, src["url"], src["name"]), "ok", None
    try:
        html = fetch(src["url"], timeout)
        return extract_entries(html, src["url"], src["name"]), "ok", None
    except Exception as exc:  # 网络不稳定：优雅降级
        return [], "failed", f"{type(exc).__name__}: {exc}"


def main(argv=None):
    ap = argparse.ArgumentParser(description="白名单政策来源扫描器")
    ap.add_argument("--offline", action="store_true", help="离线演示模式（只读 fixtures）")
    ap.add_argument("--fixtures", type=pathlib.Path, default=DEFAULT_FIXTURES, help="离线样例页目录")
    ap.add_argument("--meta", type=pathlib.Path, default=DEFAULT_META, help="比对基准 policy_meta.json（只读）")
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT, help="变更清单 JSON 输出路径")
    ap.add_argument("--timeout", type=int, default=8, help="单源抓取超时秒数")
    args = ap.parse_args(argv)

    offline = args.offline
    print(f"=== 政策来源扫描  {dt.datetime.now().isoformat(timespec='seconds')}  模式={'offline-fixtures' if offline else 'online'} ===")
    print(f"比对基准(只读): {args.meta}")

    existing_map = load_existing_titles(args.meta)
    print(f"现有政策元数据 {len(existing_map)} 条。\n")

    def run_all(offline_flag):
        entries_all, reports, fails = [], [], []
        seen_titles = {}
        for src in WHITELIST:
            entries, status, error = scan_source(src, args.timeout, args.fixtures, offline_flag)
            reports.append({"name": src["name"], "url": src["url"], "tier": src["tier"],
                            "frequency": src["frequency"], "status": status,
                            "entries": len(entries), "error": error})
            flag = {"ok": "OK", "failed": "FAIL", "skip-no-fixture": "skip(无样例)"}[status]
            print(f"[{flag}] {src['name']:<28} 候选条目 {len(entries):>2}  {error or ''}")
            if status != "ok":
                fails.append(src["name"])
                continue
            for e in entries:
                if not is_policy_like(e["政策名称"], e["发布日期"]):
                    continue  # 过滤导航/栏目链接噪音
                key = normalize_title(e["政策名称"])
                if key in seen_titles:
                    # 跨来源同标题去重：合并来源名，不重复计数
                    seen_titles[key]["来源"] += " + " + src["name"]
                    continue
                e = dict(e)
                e["来源"] = src["name"]
                seen_titles[key] = e
                entries_all.append(e)
        return entries_all, reports, fails

    all_entries, source_reports, failed = run_all(offline)

    # 在线模式全部失败 → 自动降级离线演示
    if not offline and all_entries == [] and failed:
        print("\n[降级] 在线抓取全部失败，自动切换到 fixtures 离线演示模式。")
        offline = True
        all_entries, source_reports, failed = run_all(offline)

    changes, known = compare(all_entries, existing_map)

    new_items = [c for c in changes if c["类型"] == "新增"]
    upd_items = [c for c in changes if c["类型"] == "更新"]

    print("\n=== 变更清单 ===")
    print(f"候选条目合计 {len(all_entries)}；已存在无变更 {known}；新增 {len(new_items)}；更新 {len(upd_items)}")
    for c in changes:
        print(f"\n[{c['类型']}] {c['政策名称']}")
        print(f"      发布日期: {c['发布日期']}   来源: {c['来源']}")
        print(f"      规则推断: 政策类型={c['规则推断_政策类型']} 行业={','.join(c['规则推断_行业标签'])} 地区={c['规则推断_地区标签']}")
        print(f"      {c['原文链接']}")
        print(f"      -> {c['说明']}；{c['人工确认状态']}")

    out = {
        "scanned_at": dt.datetime.now().isoformat(timespec="seconds"),
        "mode": "offline-fixtures" if offline else "online",
        "meta_read": str(args.meta),
        "whitelist_count": len(WHITELIST),
        "sources": source_reports,
        "failed_sources": failed,
        "existing_count": len(existing_map),
        "known_unchanged": known,
        "changes": changes,
        "change_summary": {"新增": len(new_items), "更新": len(upd_items)},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n变更清单已写入: {args.out}")
    print("下一步: 人工打开原文链接确认字段，然后运行 update_policy_meta.py（默认 dry-run 复核）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
