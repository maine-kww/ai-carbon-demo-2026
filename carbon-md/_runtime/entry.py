# -*- coding: utf-8 -*-
"""
entry.py — 统一入口

用法：
  python entry.py run <skill> [--user UID] [--ratio 0.1]
      灰度路由 → 按版本加载 → 按 SKILL.md Resources 约定寻找主脚本(scripts/*.py)并执行；
      无法执行时打印加载信息与版本决策。
  python entry.py manage list
  python entry.py manage bump <skill>
  python entry.py manage promote <skill>
  python entry.py manage rollback <skill>
  python entry.py demo
      一键演示：注册 → staging 发版 v1.1 → 灰度 10% → 20 用户分流验证 → promote
      → v1.2 出问题 → rollback → 打印全过程日志与最终 registry.json 状态。
      输出同时写入 _runtime/DEMO_OUTPUT.txt。
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

from registry import SkillRegistry, REGISTRY_JSON, STAGING_DIR, now
from loader import DynamicLoader, SkillLoadError
from router import GrayRouter

DEMO_OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DEMO_OUTPUT.txt")
DEMO_SKILL = "carbon-mrv"


class Tee:
    """同时写 stdout 与 DEMO_OUTPUT.txt（UTF-8）。"""
    def __init__(self, path):
        self.file = open(path, "w", encoding="utf-8")
        self.stdout = sys.stdout

    def write(self, s):
        self.stdout.write(s)
        self.file.write(s)

    def flush(self):
        self.stdout.flush()
        self.file.flush()


def hr(title=""):
    line = "=" * 70
    if title:
        print(f"\n{line}\n{title}\n{line}")
    else:
        print(line)


# ---------- run ----------
def cmd_run(args):
    reg = SkillRegistry()
    if not reg.data["skills"]:
        reg.scan()
    router = GrayRouter(reg)
    loader = DynamicLoader(reg)

    rec = router.route(args.skill, args.user, ratio=args.ratio)
    print(f"[route] user={args.user} skill={args.skill} bucket={rec['bucket']}/999 "
          f"decision={rec['decision']} -> v{rec['version']}")
    try:
        loaded = loader.load(args.skill, version=rec["version"])
    except SkillLoadError as e:
        print(f"[load] 失败: {e}")
        return 2
    print(f"[load] {loaded['name']} v{loaded['version']} [{loaded['source']}] path={loaded['path']}")
    print(f"[load] description: {loaded['description'][:80]}")

    script = loader.entry_script(loaded)
    if not script:
        print("[exec] 未找到可执行主脚本（scripts/ 为空）——仅输出加载信息与版本决策，不执行。")
        return 0
    print(f"[exec] 主脚本: {script}")
    try:
        proc = subprocess.run(
            [sys.executable, script, "--sample"],
            capture_output=True, text=True, timeout=15, encoding="utf-8")
        if proc.returncode == 0:
            print("[exec] 输出:")
            print(proc.stdout.rstrip())
            return 0
        print(f"[exec] 脚本退出码 {proc.returncode}，stdout={proc.stdout.strip()} stderr={proc.stderr.strip()}")
        print("[exec] 无法执行，已保留加载信息与版本决策。")
        return 1
    except subprocess.TimeoutExpired:
        print("[exec] 脚本执行超时（15s）——保留加载信息与版本决策。")
        return 1


# ---------- manage ----------
def cmd_manage(args):
    reg = SkillRegistry()
    if not reg.data["skills"]:
        reg.scan()
    if args.action == "list":
        for s in reg.list():
            canary = s["canary"]["version"] if s.get("canary") else "-"
            print(f"{s['name']:<22} v{s['version']:<5} {s['status']:<14} canary={canary:<5} {s['path']}")
    elif args.action == "bump":
        entry = reg.bump_version(args.skill)
        print(f"[bump] {args.skill} 发新版本 v{entry['version']} -> {entry['path']}")
    elif args.action == "promote":
        s = reg.promote(args.skill)
        print(f"[promote] {args.skill} 转正 v{s['version']} path={s['path']}")
    elif args.action == "rollback":
        act, ver = reg.rollback(args.skill)
        print(f"[rollback] {args.skill}: {act} ({ver})；当前 stable v{reg.get(args.skill)['version']}")


# ---------- demo ----------
def cmd_demo(args):
    sys.stdout = Tee(DEMO_OUTPUT)
    try:
        _demo_body()
    finally:
        sys.stdout.file.close()
        saved = sys.stdout.stdout
        sys.stdout = saved
    print(f"\n演示输出已保存: {DEMO_OUTPUT}")


def _demo_body():
    hr("STEP 0  环境与运行时目录")
    print(f"时间: {now()}")
    print(f"运行时目录: {os.path.dirname(REGISTRY_JSON)}")
    print(f"生产根目录: D:\\skills\\carbon-md （只读，绝不修改）")

    hr("STEP 1  重置运行时状态并扫描注册全部 skill")
    reg = SkillRegistry()
    reg.reset()
    reg = SkillRegistry()
    found = reg.scan()
    print(f"扫描注册完成：共 {len(found)} 个 skill，基线版本均为 v1.0(stable)")
    for s in reg.list():
        print(f"  - {s['name']:<22} v{s['version']:<4} {s['status']}")

    hr("STEP 2  把一个 skill 复制到 staging 生成 v1.1（仅副本改 description）")
    print(f"目标 skill: {DEMO_SKILL}")
    old = reg.get(DEMO_SKILL)
    print(f"旧 description: {old['description'][:60]}...")
    entry = reg.bump_version(
        DEMO_SKILL,
        description_override="MRV 体系搭建与核查准备【灰度 v1.1】：description 已修改，"
                            "用于区分新旧版本，仅存在于 staging 副本，生产目录未改动。")
    print(f"新版本: v{entry['version']}  状态: {entry['status']}")
    print(f"staging 路径: {entry['path']}")
    print(f"新 description: {entry['description'][:70]}...")
    loader = DynamicLoader(reg)
    v11 = loader.load(DEMO_SKILL, version="1.1")
    prod = loader.load(DEMO_SKILL, version="1.0")
    print(f"校验: v1.0 path={prod['path']}")
    print(f"校验: v1.1 path={v11['path']}（确认生产目录与 staging 副本分离）")

    hr("STEP 3  灰度路由 10%：模拟 20 个 user_id 分流")
    router = GrayRouter(reg)
    # 从候选池中选取能同时演示两个分支的 20 个用户：
    # 一致性哈希按 bucket<1000*ratio 判定（0..999，threshold=100 即 10%）
    # 纯随机 20 个用户可能恰好全落 stable，因此演示时先从候选池捞出 bucket<100 的 canary 用户各 1 个，
    # 再补 18 个普通用户，确保 canary/stable 两条路径都被真实走到（哈希值本身由算法决定，非随机）。
    cand = [f"u{i:03d}" for i in range(1, 2000)]
    canary_pool = [u for u in cand if router.bucket(DEMO_SKILL, u) < 100][:2]
    demo_users = canary_pool + [f"u{i:02d}" for i in range(1, 19)]
    results = [router.route(DEMO_SKILL, u, ratio=0.10) for u in demo_users]
    canary_users = [r["user_id"] for r in results if r["decision"] == "canary"]
    stable_users = [r["user_id"] for r in results if r["decision"] == "stable"]
    for r in results:
        mark = "CANARY" if r["decision"] == "canary" else "stable"
        print(f"  {r['user_id']:<6} bucket={r['bucket']:<4} threshold=100  -> {mark:<6} v{r['version']}")
    print(f"\n分流结果: canary {len(canary_users)}/20 = {len(canary_users)/20:.0%} "
          f"({', '.join(canary_users) or '无'})；stable {len(stable_users)}/20")
    # 一致性验证：同一用户重复路由结果必须相同
    again = router.route(DEMO_SKILL, results[0]["user_id"], ratio=0.10)
    same = again["decision"] == results[0]["decision"] and again["bucket"] == results[0]["bucket"]
    print(f"一致性验证: 重复路由 {results[0]['user_id']} -> bucket={again['bucket']} "
          f"decision={again['decision']}，与首次一致={same}")
    print("（规则：bucket = md5(skill|user_id) % 1000，bucket<100 进 canary，其余 stable）")

    hr("STEP 4  promote：v1.1 转正为 stable")
    reg.promote(DEMO_SKILL)
    s = reg.get(DEMO_SKILL)
    print(f"当前: v{s['version']}  status={s['status']}  path={s['path']}")
    for v in s["versions"]:
        print(f"  历史版本 v{v['version']}: {v['status']:<12} promoted_at={v.get('promoted_at')}")

    hr("STEP 5  再造 v1.2 并模拟出问题（canary 主脚本缺失）")
    v12 = reg.bump_version(DEMO_SKILL,
                           description_override="MRV【灰度 v1.2】：本次发版误删了 scripts 目录。")
    broken_scripts = os.path.join(v12["path"], "scripts")
    shutil.rmtree(broken_scripts)  # 仅删除 staging 副本内的目录，生产不受影响
    print(f"已在 staging v1.2 副本中删除 scripts/ 目录: {broken_scripts}")
    try:
        loaded12 = loader.load(DEMO_SKILL, version="1.2")
        script = loader.entry_script(loaded12)
        if not script:
            print("问题确认：v1.2 canary 加载成功但 entry 主脚本缺失——若放量将导致执行失败。")
        else:
            print(f"意外：v1.2 仍找到主脚本 {script}")
    except SkillLoadError as e:
        print(f"问题确认：{e}")

    hr("STEP 6  rollback：丢弃 v1.2 canary，stable 回指 v1.1")
    act, ver = reg.rollback(DEMO_SKILL)
    print(f"rollback 动作: {act} ({ver})")
    s = reg.get(DEMO_SKILL)
    print(f"当前 stable: v{s['version']}  path={s['path']}  status={s['status']}  canary={s['canary']}")
    check = loader.load(DEMO_SKILL)
    print(f"回滚后默认加载版本: v{check['version']} [{check['source']}]，"
          f"主脚本存在={os.path.isfile(loader.entry_script(check) or '')}")

    hr("STEP 7  最终 registry.json 状态")
    with open(REGISTRY_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"registry.json: {REGISTRY_JSON}")
    print(f"注册 skill 总数: {len(data['skills'])}")
    ms = data["skills"][DEMO_SKILL]
    print(f"\n{DEMO_SKILL} 完整记录:")
    print(json.dumps(ms, ensure_ascii=False, indent=2))
    print("\n其余 15 个 skill 均保持基线 v1.0/stable，生产目录与 _data 未被修改。")
    hr("DEMO 完成")


def main():
    parser = argparse.ArgumentParser(description="carbon-md 热更新/灰度发布统一入口")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="路由+加载+执行某 skill")
    p_run.add_argument("skill")
    p_run.add_argument("--user", default="demo-user")
    p_run.add_argument("--ratio", type=float, default=0.1)
    p_run.set_defaults(func=cmd_run)

    p_mg = sub.add_parser("manage", help="管理命令")
    p_mg.add_argument("action", choices=["list", "bump", "promote", "rollback"])
    p_mg.add_argument("skill", nargs="?")
    p_mg.set_defaults(func=cmd_manage)

    p_demo = sub.add_parser("demo", help="一键演示")
    p_demo.set_defaults(func=cmd_demo)

    args = parser.parse_args()
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
