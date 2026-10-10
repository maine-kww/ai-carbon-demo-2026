# -*- coding: utf-8 -*-
"""
router.py — GrayRouter 灰度路由

职责：
- 按 user_id 的一致性哈希（md5(name|user_id) % 1000）将请求在 canary（新版本）与
  stable（当前版本）之间分流，比例可配置（默认 0.10 = 10%）
- 每条路由决策追加 JSONL 到 _runtime/router.log
- promote / rollback 操作委托 SkillRegistry 完成版本指针切换
"""

import hashlib
import json
import os

from registry import SkillRegistry, RUNTIME_DIR, now

ROUTER_LOG = os.path.join(RUNTIME_DIR, "router.log")


class GrayRouter:
    def __init__(self, registry=None):
        self.reg = registry or SkillRegistry()
        self.log_path = ROUTER_LOG

    def bucket(self, name, user_id):
        h = hashlib.md5(f"{name}|{user_id}".encode("utf-8")).hexdigest()
        return int(h, 16) % 1000  # 0..999

    def route(self, name, user_id, ratio=0.10):
        """返回 {decision, version, bucket, ratio}。无 canary 时一律 stable。"""
        s = self.reg.get(name)
        b = self.bucket(name, user_id)
        threshold = int(round(ratio * 1000))
        if s.get("canary") and b < threshold:
            decision, version = "canary", s["canary"]["version"]
        else:
            decision, version = "stable", s["version"]
        rec = {
            "ts": now(),
            "skill": name,
            "user_id": user_id,
            "bucket": b,
            "threshold": threshold,
            "ratio": ratio,
            "decision": decision,
            "version": version,
        }
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec

    def promote(self, name):
        return self.reg.promote(name)

    def rollback(self, name):
        return self.reg.rollback(name)


if __name__ == "__main__":
    reg = SkillRegistry()
    reg.scan()
    r = GrayRouter(reg)
    for uid in [f"u{i:02d}" for i in range(1, 21)]:
        rec = r.route("carbon-mrv", uid, ratio=0.10)
        print(rec)
