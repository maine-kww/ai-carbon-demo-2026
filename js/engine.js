/* 双碳计算引擎 + 17 Skills — 纯前端，可离线双击运行 */
(function () {
  const D = window.CARBON_DATA;

  function pickFactor(item, year) {
    const rows = D.factors.filter((f) => f.item.includes(item) || f.energy.includes(item));
    if (!rows.length) return null;
    // 优先匹配年份 + 已查证
    let exact = rows.filter((f) => f.year === String(year));
    if (!exact.length) {
      exact = rows.filter((f) => f.year === "—");
    }
    if (!exact.length) exact = rows;
    exact = exact.slice().sort((a, b) => {
      const sa = (a.status === "已查证" ? 0 : 10) + (a.item.includes("碳足迹") ? 5 : 0);
      const sb = (b.status === "已查证" ? 0 : 10) + (b.item.includes("碳足迹") ? 5 : 0);
      return sa - sb;
    });
    return exact[0];
  }

  function toWanTco2(amount, factor) {
    if (!factor || factor.value == null) return { tco2: 0, used: factor };
    const u = String(factor.unit || "").toLowerCase().replace(/\s/g, "");
    const v = factor.value;
    let t = 0;
    if (u.includes("tco2/mwh") || u.includes("tco2e/mwh")) {
      t = (amount * 10000 / 1000) * v;
    } else if (u.includes("kgco2/kwh") || u.includes("kgco2e/kwh")) {
      t = (amount * 10000 * v) / 1000;
    } else if (u.includes("tco2/万") || u.includes("tco2/wan")) {
      t = amount * v;
    } else if (u.includes("kgco2/m3") || u.includes("kg/m3")) {
      t = (amount * 10000 * v) / 1000;
    } else if (u.includes("tco2/t") || u.includes("t/t")) {
      t = amount * v;
    } else if (u.includes("kgco2/t")) {
      t = (amount * v) / 1000;
    } else {
      // 启发式
      t = amount * v;
    }
    return { tco2: t / 10000, used: factor };
  }

  function computeBaseline(form) {
    const year = form.year || "2023";
    const elecF = pickFactor("外购电力", year) || pickFactor("电力", year);
    const gasF = pickFactor("天然气", year);
    const dieselF = pickFactor("柴油", year);

    const s2raw = toWanTco2(Number(form.elec) || 0, elecF);
    const gasRaw = toWanTco2(Number(form.gas) || 0, gasF);
    const dieselRaw = toWanTco2(Number(form.diesel) || 0, dieselF);
    const s1 = gasRaw.tco2 + dieselRaw.tco2;
    const s2 = s2raw.tco2;
    const s3 = Number(form.s3) || 0;
    const total = s1 + s2 + s3;
    const output = Number(form.output) || 0;
    const intensity = output > 0 ? total / output : 0;

    return {
      s1: round(s1, 4),
      s1_gas: round(gasRaw.tco2, 4),
      s1_diesel: round(dieselRaw.tco2, 4),
      s2: round(s2, 4),
      s3: round(s3, 4),
      total: round(total, 4),
      intensity: round(intensity, 4),
      factors: {
        electricity: elecF,
        gas: gasF,
        diesel: dieselF
      }
    };
  }

  function round(n, d) {
    const p = Math.pow(10, d || 2);
    return Math.round(n * p) / p;
  }

  function skill(id, title, metrics, narrative, evidence, actions, status) {
    return {
      id,
      title,
      metrics,
      narrative,
      evidence: evidence || [],
      actions: actions || [],
      status: status || "ok"
    };
  }

  function ev(source, status, note) {
    return { source, status, note: note || "" };
  }

  function runSkills(form, base) {
    const year = form.year || "2023";
    const target = Number(form.target_year) || 2030;
    const pct = Number(form.reduction) || 20;
    const cut = base.total * (pct / 100);
    const years = Math.max(1, target - Number(year || 2023));
    const annual = cut / years;
    const indList = (D.industries || []).filter((i) => i.name === form.industry);
    const ind = indList[0] || (D.industries || []).find((i) => i.name === "其他") || {
      name: form.industry,
      in_market: false,
      std: "适用国标",
      phase: "通用",
      policy_tags: ["通用"]
    };
    const share3 = base.total ? (base.s3 / base.total) * 100 : 0;

    const tags = ind.policy_tags || ["通用"];
    const matchedPolicies = (D.policies || []).filter((p) =>
      (p.tags || []).some((t) => tags.indexOf(t) >= 0 || t === "通用")
    );
    const validPolicies = matchedPolicies.filter((p) => p.valid !== false && p.status === "现行有效");
    const oldPolicies = matchedPolicies.filter((p) => p.valid === false || p.status === "已废止" || p.status === "被替代");

    return [
      skill(
        "carbon-accounting",
        "组织温室气体核算",
        [
          { k: "范围一", v: base.s1.toFixed(2), u: "万 tCO₂e" },
          { k: "范围二", v: base.s2.toFixed(2), u: "万 tCO₂e" },
          { k: "范围三", v: base.s3.toFixed(2), u: "万 tCO₂e" },
          { k: "综合", v: base.total.toFixed(2), u: "万 tCO₂e" },
          { k: "强度", v: base.intensity.toFixed(3), u: "tCO₂e/万元" }
        ],
        `按 ${year} 年活动数据 × 数据层因子核算。范围二采用电力官方 CO2 口径；范围三为申报估算，须在来源台账中标注方法。`,
        [
          ev("电力因子 " + (base.factors.electricity && base.factors.electricity.value), (base.factors.electricity && base.factors.electricity.status) || "—", (base.factors.electricity && base.factors.electricity.unit) || ""),
          ev("活动数据（企业填报）", "企业收集", "须附结算单/台账")
        ],
        ["补齐逐月计量读数", "建立因子台账（来源/年份）"]
      ),
      skill(
        "carbon-footprint",
        "产品碳足迹 PCF",
        [{ k: "万元产值足迹", v: base.intensity.toFixed(3), u: "tCO₂e/万元" }],
        "组织碳强度可作早期对标；正式 PCF 须按 ISO 14067 界定功能单位与生命周期边界，并单独收集 BOM/工艺数据。",
        [ev("ISO 14067", "方法学", "须补产品级数据")],
        ["选定功能单位", "收集单位产品能耗"],
        "partial"
      ),
      skill(
        "carbon-roadmap",
        "碳达峰/中和路径",
        [
          { k: "目标年", v: String(target), u: "" },
          { k: "降幅", v: pct.toFixed(0), u: "%" },
          { k: "目标排放", v: (base.total * (1 - pct / 100)).toFixed(2), u: "万 tCO₂e" },
          { k: "年均减排", v: annual.toFixed(2), u: "万 tCO₂e" }
        ],
        `以 ${year} 为基准，${target} 年降幅 ${pct}%。优先：能效 → 绿电 → 电气化 → 工艺改造 → 碳信用抵消残余。`,
        [ev("双碳目标政策", "方法学", "与行业扩围节点对齐")],
        ["冻结基准年台账", "措施技术经济排序"]
      ),
      skill(
        "carbon-trading",
        "配额履约与碳交易",
        [
          { k: "行业", v: form.industry || "—", u: "" },
          { k: "阶段", v: (ind && ind.phase) || "—", u: "" },
          { k: "是否控排", v: ind && ind.in_market ? "是（履约）" : "否/报告或培育", u: "" },
          { k: "示意履约压力", v: (base.total * (pct / 100) * 0.35).toFixed(2), u: "万 tCO₂e" }
        ],
        ind && ind.in_market
          ? "该行业已纳入全国碳市场（" + (ind.market_year || "") + "），配额以主管部门方案为准。"
          : "行业阶段：" + ((ind && ind.phase) || "—") + "。未进入配额清缴前，侧重报告质量、碳资产与自愿减排。",
        [
          ev("行业规则", "已查证", (ind && ind.std) || ""),
          ev("配额/扩围政策", validPolicies.length ? "现行有效" : "占位-待核实", validPolicies[0] ? validPolicies[0].no : "")
        ],
        ["确认履约边界", "建立买卖策略"]
      ),
      skill(
        "carbon-policy",
        "双碳政策法规解读",
        [
          { k: "匹配政策", v: String(validPolicies.length), u: "条(现行)" },
          { k: "历史/废止", v: String(oldPolicies.length), u: "条(仅追溯)" },
          { k: "行业", v: form.industry || "—", u: "" }
        ],
        "按行业标签识别适用政策；现行有效作依据，被替代/已废止标注后排除。引用格式：名称 + 文号 + 状态 + 来源。",
        validPolicies.slice(0, 4).map((p) => ev(p.name, p.status, p.no + " / " + p.source)),
        ["按政策节点倒排计划", "建立文号台账与换旧更新"]
      ),
      skill(
        "carbon-esg",
        "ESG 与绿色金融披露",
        [
          { k: "可披露排放", v: base.total.toFixed(2), u: "万 tCO₂e" },
          { k: "强度", v: base.intensity.toFixed(3), u: "tCO₂e/万元" }
        ],
        "披露需覆盖治理/战略/风险/指标四支柱；数字须与核算底稿交叉核对。",
        [ev("GRI 305 / ISSB", "披露框架", "")],
        ["补监督机制与目标进展"]
      ),
      skill(
        "supply-chain-carbon",
        "供应链范围三",
        [
          { k: "范围三占比", v: share3.toFixed(1), u: "%" },
          { k: "范围三排放", v: base.s3.toFixed(2), u: "万 tCO₂e" }
        ],
        "范围三须按采购/运输/差旅等类别拆分，并标注支出法或平均数据法。",
        [ev("GHG Protocol Scope3", "方法学", "")],
        ["供应商数据问卷", "绿色采购门槛"],
        "partial"
      ),
      skill(
        "carbon-inclusion",
        "碳普惠与碳积分",
        [{ k: "适合场景", v: "通勤/节电/绿电", u: "" }],
        "适合员工与小微行为激励；减排因子挂钩电力排放因子。",
        [ev("地方碳普惠规则", "占位-待核实", "")],
        ["试点积分账户"],
        "partial"
      ),
      skill(
        "carbon-mrv",
        "MRV 体系与核查",
        [
          { k: "关键数据", v: "电/气/油/产量", u: "" },
          { k: "证据完整度", v: "见来源台账", u: "" }
        ],
        "监测计划固定计量点、频次与责任；核查看的是可追溯证据链。",
        [ev("ISO 14064-3 / MRV 指南", "方法学", "")],
        ["发布监测计划", "计量校准记录"]
      ),
      skill(
        "carbon-finance",
        "碳金融产品对接",
        [
          { k: "示意减排资产", v: (cut * 80).toFixed(0), u: "万元（按80元/t估算）" }
        ],
        "碳价为示意估算，正式估值须替换为交易所或机构报价。",
        [ev("市场碳价", "估算", "数据层未收实时行情")],
        ["权属证明", "对接银行产品"],
        "estimate"
      ),
      skill(
        "carbon-sink",
        "碳汇项目开发",
        [{ k: "适用性", v: "视场地资源", u: "" }],
        "林业/海洋/草地碳汇需方法学与额外性论证。",
        [ev("碳汇方法学", "占位-待核实", "LULUCF 因子待补")],
        ["评估自有场地"],
        "partial"
      ),
      skill(
        "ccer-development",
        "CCER 自愿减排项目",
        [{ k: "路径", v: "方法学→PDD→核证", u: "" }],
        "按生态环境部备案方法学开发，编制项目设计文件与监测计划。",
        [ev("自愿减排管理办法", "已查证", "")],
        ["筛选可开发场景"]
      ),
      skill(
        "cbam-compliance",
        "欧盟 CBAM 申报",
        [
          { k: "出口关注", v: ["机械制造", "钢铁", "铝冶炼", "水泥"].includes(form.industry) ? "是" : "视出口而定", u: "" }
        ],
        "CBAM 属欧盟法规；须核算隐含碳并保存设施级数据与碳价抵扣证明。",
        [ev("EU CBAM 规则", "数据层未覆盖", "以欧盟官方为准")],
        ["产品 CN code 核对"],
        "info"
      ),
      skill(
        "green-factory",
        "绿色工厂/园区申报",
        [{ k: "自评维度", v: "设施/体系/能源/产品/排放", u: "" }],
        "按评价指标体系打分自评；零碳工厂培育与碳市场扩围不是同一事项。",
        [ev("工信部联节〔2026〕13号", "已查证", "")],
        ["指标自评"]
      ),
      skill(
        "climate-adaptation",
        "气候适应与转型金融",
        [{ k: "关注点", v: "物理+转型风险", u: "" }],
        "评估极端天气与政策市场转型风险，对接转型金融工具。",
        [ev("TCFD/ISSB", "方法学", "")],
        ["气候风险筛查"],
        "partial"
      ),
      skill(
        "carbon-system",
        "企业碳管理体系",
        [
          { k: "治理建议", v: "双碳办+考核", u: "" },
          { k: "行业标准", v: (ind && ind.std) || "按适用标准", u: "" },
          { k: "行业阶段", v: (ind && ind.phase) || "—", u: "" }
        ],
        "体系是目标、职责、流程与评审的组织载体；行业阶段（履约/报告/培育）决定制度强度。",
        [ev("行业核算标准", "已查证", ind ? ind.std : "")],
        ["发布碳管理手册"]
      ),
      skill(
        "carbon-policy-monitor",
        "政策监控与数据更新",
        [
          { k: "数据层", v: "本地快照", u: "" },
          { k: "因子条数", v: String((D.factors || []).length), u: "" }
        ],
        "生产环境应定期扫描白名单政策源，人工确认后更新因子库。",
        [ev("_data 快照", "已查证", D.meta.updated_at)],
        ["配置政策扫描"]
      )
    ];
  }

  window.CarbonEngine = {
    pickFactor,
    computeBaseline,
    runSkills,
    round
  };
})();
