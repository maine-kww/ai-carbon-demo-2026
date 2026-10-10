# carbon-md 热更新 / 灰度发布运行时（_runtime）

本目录是一套**生产级热更新架构的单机单 Agent 落地实现**，全部 Python，Windows 实测通过。
硬约束：**只写本目录内**（registry.json、staging/、router.log、DEMO_OUTPUT.txt），
绝不修改生产 skill 目录（`carbon-md/<skill>\`）与 `_data/` 下任何文件。

## 一、组件与生产架构的对应关系

| 生产级概念 | 本目录实现 | 文件 |
|---|---|---|
| 服务注册中心（Service Registry） | **SkillRegistry**：扫描全部 skill 目录、解析 frontmatter(name/description)、维护版本表、版本指针、历史版本 | `registry.py` |
| 动态依赖加载器（Dynamic Loader） | **DynamicLoader**：按版本号从生产目录或 staging 副本把 SKILL.md 全文、scripts/ 路径、Resources 声明的主脚本加载进内存，加载失败抛明确错误 | `loader.py` |
| 灰度发布 / 金丝雀路由（Canary Router） | **GrayRouter**：`md5(skill|user_id) % 1000` 一致性哈希分桶，按可配置比例（默认 10%）把请求分流到 canary 新版本或 stable 旧版本，逐笔记 JSONL 路由日志 | `router.py` |
| 统一流量入口（API Gateway / CLI Entry） | **entry.py**：`run` / `manage list/bump/promote/rollback` / `demo` | `entry.py` |
| 版本制品库（Artifact Repository） | `staging\<skill>\vX.Y\` 目录树（新版本制品） | `staging/` |
| 注册数据持久化 | `registry.json`（UTF-8，含 name/version/status/path/description/registered_at/canary/versions 历史列表） | `registry.json` |
| 路由审计日志 | 逐笔决策（ts/user_id/bucket/threshold/decision/version） | `router.log` |

### 版本状态机

```
基线 v1.0 (stable, 生产目录)
   │  bump_version()  ── 复制生产目录 → staging\<name>\v1.1\（仅副本改 description）
   ▼
canary v1.1 (灰度中，GrayRouter 只放 10% 流量)
   │  promote()       ── 版本指针切到 staging 路径，旧 v1.0 标记 superseded
   ▼
stable v1.1
   │  bump_version()  ── v1.2 canary
   │  rollback()      ── canary 丢弃(标记 rolled-back)，指针不动；或 stable 指针回退上一已发布版本
   ▼
稳定运行 v1.1（生产目录文件自始至终未被改动）
```

## 二、本机单 Agent 环境下"staging 目录模拟新版本"的落地语义

真实微服务体系里，灰度发版 = 构建新镜像 → 部署到 canary 集群 → 网关按比例切流 → 观察指标 → 全量/回滚。
在本机单 Agent、无构建系统、且**不允许动生产 skill 目录**的约束下，本运行时做了如下语义映射：

1. **"新版本制品"= staging 目录副本**。`bump_version()` 用 `shutil.copytree` 把生产 skill 目录完整复制到
   `_runtime\staging\<skill>\vX.Y\`，随后**只在副本上**改写 SKILL.md 的 description 行（用于版本区分）。
   生产目录的 mtime 与内容保持原样——已在 demo 中校验。
2. **"版本指针"= registry.json**。stable/canary 都是指针，指向某份目录（生产 或 staging 副本）。
   promote/rollback 只改指针和状态标记，不删文件、不动生产。回滚即指针切回，秒级完成。
3. **"灰度切流"= 一致性哈希 + 路由决策**。同一 user_id 永远落到同一版本（避免版本漂移），
   比例通过 threshold = ratio×1000 控制；决策写 router.log 供审计。
4. **"执行主脚本"= entry.py run**。按 SKILL.md `## Resources` 段落声明的 `scripts/*.py` 约定定位主脚本，
   子进程真实执行（如 `mrv_tracker.py --sample`）；脚本缺失/超时/非零退出时，打印加载信息与版本决策而不崩溃。

> 语义上，staging 副本即"已部署但只放 10% 流量的 canary 实例"；promote 即"该副本成为新的 stable"。
> 若未来接真实构建流程，只需把 copytree 替换为制品下载/解压即可，Registry/Loader/Router 三个组件不变。

## 三、命令手册

```powershell
cd carbon-md/_runtime

# 扫描注册（首次或新增 skill 后，如 carbon-policy-monitor 建好会自动被扫到）
python registry.py

# 流量入口：按 user_id 路由 → 加载对应版本 → 执行主脚本
python entry.py run carbon-mrv --user u022 --ratio 0.1

# 管理面
python entry.py manage list                 # 查看全部 skill 版本/状态/canary
python entry.py manage bump carbon-mrv      # 发新版本到 staging（自动 v1.1 / v1.2 ...）
python entry.py manage promote carbon-mrv   # canary 转正
python entry.py manage rollback carbon-mrv  # 回滚（丢 canary 或 stable 指针回退）

# 一键演示（重置状态 → 全流程 → 输出落盘 DEMO_OUTPUT.txt）
python entry.py demo
```

## 四、实测验证结论（2026-10-09, Python 3.14.7, Windows）

- 扫描注册 **16 个** skill，全部基线 v1.0/stable；
- carbon-mrv 发 v1.1 canary（staging 副本，description 已区分）；
- 20 个 user_id 路由分流：**canary 2/20=10%（u022/u027），stable 18/20**，重复路由结果一致；
- promote 后 stable=v1.1（指针指向 staging 副本）；
- v1.2 模拟"误删 scripts/"问题 → rollback 丢弃 canary，stable 仍为 v1.1 且主脚本可用；
- 生产 SKILL.md description 原样未改，`_data/` 零写入；
- 全程证据：`DEMO_OUTPUT.txt`（完整日志）、`registry.json`（最终状态）、`router.log`（42 条路由记录）。
