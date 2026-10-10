# -*- coding: utf-8 -*-
"""
loader.py — DynamicLoader 动态加载器

职责：运行时按版本加载 skill 进内存结构：
- stable：从 registry 当前指针路径加载（生产目录）
- canary：从 _runtime/staging/<name>/vX.Y/ 加载（灰度版本）
- 指定 version：从该版本记录的 path 加载（用于验证 / 回滚检查）
加载失败抛 SkillLoadError，错误信息明确指出缺失了什么。
"""

import glob
import os
import re

from registry import SkillRegistry, parse_frontmatter, now


class SkillLoadError(Exception):
    pass


class DynamicLoader:
    def __init__(self, registry=None):
        self.reg = registry or SkillRegistry()

    def _resolve(self, name, version=None):
        """根据 registry 状态与指定版本，解析 (path, version_str, description, source)。"""
        s = self.reg.get(name)
        if version is not None:
            version = str(version)
            cand = [v for v in s["versions"] if v["version"] == version]
            if not cand:
                raise SkillLoadError(
                    f"{name} 不存在版本 v{version}；历史版本: {[v['version'] for v in s['versions']]}")
            v = cand[0]
            return v["path"], v["version"], v["description"], f"version={v['version']}"
        if s.get("canary"):
            c = s["canary"]
            return c["path"], c["version"], c["description"], "canary"
        return s["path"], s["version"], s["description"], "stable"

    def load(self, name, version=None):
        try:
            path, ver, desc, source = self._resolve(name, version)
        except SkillLoadError:
            raise
        except KeyError as e:
            raise SkillLoadError(str(e))

        md = os.path.join(path, "SKILL.md")
        if not os.path.isdir(path):
            raise SkillLoadError(f"加载失败：skill 目录不存在 {path}（版本 {ver} 可能已被清理）")
        if not os.path.isfile(md):
            raise SkillLoadError(f"加载失败：{path} 缺少 SKILL.md")

        try:
            with open(md, "r", encoding="utf-8") as f:
                text = f.read()
        except UnicodeDecodeError as e:
            raise SkillLoadError(f"加载失败：{md} 不是合法 UTF-8：{e}")

        fm, body = parse_frontmatter(text)
        if "name" not in fm:
            raise SkillLoadError(f"加载失败：{md} frontmatter 缺少 name 字段")

        scripts_dir = os.path.join(path, "scripts")
        scripts = sorted(glob.glob(os.path.join(scripts_dir, "*.py"))) \
            if os.path.isdir(scripts_dir) else []
        # Resources 段落里声明的 scripts/*.py（执行主脚本的约定来源）
        declared = []
        for m in sorted(set(re.findall(r"`(scripts/[\w\-.]+\.py)`", body))):
            full = os.path.join(path, m.replace("/", os.sep))
            declared.append({"declared": m, "resolved": full, "exists": os.path.isfile(full)})

        return {
            "name": name,
            "version": ver,
            "source": source,            # stable | canary | version=...
            "path": path,
            "description": desc,
            "frontmatter": fm,
            "skill_md": text,            # SKILL.md 全文
            "scripts_dir": scripts_dir,
            "entry_scripts": scripts,    # scripts/ 下真实存在的 py
            "declared_scripts": declared,
            "loaded_at": now(),
        }

    def entry_script(self, loaded):
        """按约定挑主脚本：优先 Resources 声明且文件存在的，其次 scripts/ 下第一个 .py。"""
        for d in loaded["declared_scripts"]:
            if d["exists"]:
                return d["resolved"]
        return loaded["entry_scripts"][0] if loaded["entry_scripts"] else None


if __name__ == "__main__":
    import sys
    reg = SkillRegistry()
    reg.scan()
    ld = DynamicLoader(reg)
    name = sys.argv[1] if len(sys.argv) > 1 else "carbon-mrv"
    info = ld.load(name)
    print(f"loaded {info['name']} v{info['version']} [{info['source']}]")
    print(f"  path: {info['path']}")
    print(f"  scripts: {info['entry_scripts']}")
    print(f"  entry: {ld.entry_script(info)}")
