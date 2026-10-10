# -*- coding: utf-8 -*-
"""
registry.py — SkillRegistry 注册中心

职责：
- 扫描 SKILLS_ROOT 下全部标准 skill 目录（含 SKILL.md），解析 frontmatter(name/description)
- 生成并维护 _runtime/registry.json：每个 skill 含 当前版本 / 状态 / 路径 / description /
  注册时间 / 历史版本列表 / 当前 canary 指针
- 支持 list / register(scan) / get / bump_version（发新版到 staging）/ promote / rollback

硬约束：只写 _runtime/ 内（registry.json、staging/），绝不修改生产 skill 目录与 _data/。
"""

import json
import os
import re
import shutil
import datetime

SKILLS_ROOT = r"carbon-md"
RUNTIME_DIR = os.path.join(SKILLS_ROOT, "_runtime")
REGISTRY_JSON = os.path.join(RUNTIME_DIR, "registry.json")
STAGING_DIR = os.path.join(RUNTIME_DIR, "staging")

# 扫描时排除的目录（_runtime 自身、数据目录；carbon-policy-monitor 等后续新建目录会被自动扫描到）
EXCLUDE_DIRS = {"_runtime", "_data"}


def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def parse_frontmatter(text):
    """解析 YAML frontmatter（首个 --- 与下一个 --- 之间）。返回 (frontmatter_dict, body_text)。"""
    m = re.match(r"^\s*---\s*\n(.*?)\n\s*---\s*\n?", text, re.S)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip()
    body = text[m.end():]
    return fm, body


class SkillNotFound(KeyError):
    pass


class SkillRegistry:
    def __init__(self):
        os.makedirs(STAGING_DIR, exist_ok=True)
        if os.path.isfile(REGISTRY_JSON):
            with open(REGISTRY_JSON, "r", encoding="utf-8") as f:
                self.data = json.load(f)
        else:
            self.data = {
                "meta": {
                    "skills_root": SKILLS_ROOT,
                    "runtime_dir": RUNTIME_DIR,
                    "created_at": now(),
                    "updated_at": now(),
                },
                "skills": {},
            }
        self.save()

    # ---------- 持久化 ----------
    def save(self):
        self.data["meta"]["updated_at"] = now()
        with open(REGISTRY_JSON, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    def reset(self):
        """清空运行时状态（仅删 _runtime 内的 registry.json / staging），供 demo 从干净状态重跑。"""
        if os.path.isfile(REGISTRY_JSON):
            os.remove(REGISTRY_JSON)
        if os.path.isdir(STAGING_DIR):
            shutil.rmtree(STAGING_DIR)
        self.__init__()

    # ---------- 扫描 / 注册 ----------
    def scan(self):
        """扫描全部 skill 目录并注册（已存在的只刷新 description，不动版本历史）。返回发现的 skill 名列表。"""
        found = []
        for name in sorted(os.listdir(SKILLS_ROOT)):
            p = os.path.join(SKILLS_ROOT, name)
            if not os.path.isdir(p) or name in EXCLUDE_DIRS:
                continue
            skill_md = os.path.join(p, "SKILL.md")
            if not os.path.isfile(skill_md):
                continue
            with open(skill_md, "r", encoding="utf-8") as f:
                text = f.read()
            fm, _ = parse_frontmatter(text)
            desc = fm.get("description", "")
            found.append(name)
            entry = self.data["skills"].get(name)
            if entry is None:
                self.data["skills"][name] = {
                    "name": name,
                    "version": "1.0",            # 当前稳定版本号
                    "status": "stable",          # stable | canary-active
                    "path": p,                   # 当前 stable 解析路径
                    "description": desc,
                    "registered_at": now(),
                    "canary": None,              # {"version","path","description","created_at"}
                    "versions": [
                        {
                            "version": "1.0",
                            "path": p,
                            "status": "stable",
                            "description": desc,
                            "created_at": now(),
                            "promoted_at": now(),
                        }
                    ],
                }
            else:
                entry["description"] = desc
        self.save()
        return found

    def list(self):
        return list(self.data["skills"].values())

    def get(self, name):
        s = self.data["skills"].get(name)
        if s is None:
            raise SkillNotFound(f"未注册的 skill: {name}（请先 scan 注册）")
        return s

    # ---------- 版本演进 ----------
    def next_version(self, s):
        vers = [float(v["version"]) for v in s["versions"]]
        return f"{max(vers) + 0.1:.1f}"

    def bump_version(self, name, description_override=None):
        """把生产目录复制到 _runtime/staging/<name>/vX.Y/，仅在副本上改 description 生成新版本。
        不触碰生产目录。返回新版本记录。"""
        s = self.get(name)
        v = self.next_version(s)
        dest = os.path.join(STAGING_DIR, name, f"v{v}")
        if os.path.exists(dest):
            shutil.rmtree(dest)
        shutil.copytree(s["path"], dest)  # 生产 → staging 副本
        new_desc = description_override or (s["description"] + f" [canary v{v}]")
        md = os.path.join(dest, "SKILL.md")
        with open(md, "r", encoding="utf-8") as f:
            text = f.read()
        text2 = re.sub(r"(?m)^description:\s*.*$",
                       "description: " + new_desc.replace("\\", "\\\\"), text, count=1)
        with open(md, "w", encoding="utf-8") as f:
            f.write(text2)
        entry = {
            "version": v,
            "path": dest,
            "status": "canary",
            "description": new_desc,
            "created_at": now(),
            "promoted_at": None,
        }
        s["versions"].append(entry)
        s["canary"] = {"version": v, "path": dest, "description": new_desc, "created_at": now()}
        s["status"] = "canary-active"
        self.save()
        return entry

    def promote(self, name):
        """canary 转正：版本指针切到 canary 路径，旧 stable 标记 superseded。"""
        s = self.get(name)
        if not s.get("canary"):
            raise RuntimeError(f"{name} 当前没有 canary 版本可 promote")
        c = s["canary"]
        for v in s["versions"]:
            if v["version"] == c["version"]:
                v["status"] = "stable"
                v["promoted_at"] = now()
            elif v["status"] == "stable":
                v["status"] = "superseded"
        s["version"] = c["version"]
        s["path"] = c["path"]
        s["description"] = c["description"]
        s["canary"] = None
        s["status"] = "stable"
        self.save()
        return s

    def rollback(self, name):
        """回滚：若存在 canary 则丢弃 canary（版本标记 rolled-back，stable 不动）；
        否则把 stable 指针回退到上一个已发布的版本。返回 (动作, 涉及版本)。"""
        s = self.get(name)
        if s.get("canary"):
            c = s["canary"]
            for v in s["versions"]:
                if v["version"] == c["version"]:
                    v["status"] = "rolled-back"
            s["canary"] = None
            s["status"] = "stable"
            self.save()
            return ("canary-discarded", c["version"])
        # stable 指针回退：找当前 stable 之前最近一个已发布(promoted)的版本
        stable_idx = None
        for i, v in enumerate(s["versions"]):
            if v["status"] == "stable":
                stable_idx = i
        prev_idx = None
        for j in range(stable_idx - 1, -1, -1):
            if s["versions"][j].get("promoted_at"):
                prev_idx = j
                break
        if prev_idx is None or stable_idx is None:
            raise RuntimeError(f"{name} 已是基线 v1.0，无可回滚版本")
        cur = s["versions"][stable_idx]
        prev = s["versions"][prev_idx]
        cur["status"] = "rolled-back"
        prev["status"] = "stable"
        s["version"] = prev["version"]
        s["path"] = prev["path"]
        s["description"] = prev["description"]
        self.save()
        return ("stable-pointer-rolled-back", f"{cur['version']} -> {prev['version']}")


if __name__ == "__main__":
    reg = SkillRegistry()
    found = reg.scan()
    print(f"扫描到 {len(found)} 个 skill: {', '.join(found)}")
    for s in reg.list():
        print(f"  - {s['name']:<24} v{s['version']:<4} {s['status']:<14} {s['path']}")
