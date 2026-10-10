/* 应用主逻辑：表单 ↔ 来源台账 ↔ 计算 ↔ 报告 ↔ 导出 */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.CarbonSources;
  const E = window.CarbonEngine;

  function readForm() {
    return {
      name: $("c-name").value.trim() || "未命名企业",
      industry: $("c-industry").value,
      caliber: $("c-caliber").value === "ops" ? "运营控制权法" : "股权比例法",
      year: $("c-year").value,
      target_year: Number($("c-target").value) || 2030,
      reduction: Number($("c-reduction").value) || 20,
      output: Number($("c-output").value) || 0,
      energy: Number($("c-energy").value) || 0,
      note: $("c-note").value.trim(),
      gas: Number($("a-gas").value) || 0,
      diesel: Number($("a-diesel").value) || 0,
      elec: Number($("a-elec").value) || 0,
      s3: Number($("a-s3").value) || 0,
      s3_note: $("a-s3-note").value.trim()
    };
  }

  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString("zh-CN", {
      minimumFractionDigits: d == null ? 2 : d,
      maximumFractionDigits: d == null ? 2 : d
    });
  }

  function statusChip(status) {
    return '<span class="chip ' + S.statusChip(status) + '">' + (status || "—") + "</span>";
  }

  /* ---------- 来源台账渲染 ---------- */
  function renderSources() {
    const list = S.load();
    const tbody = $("src-tbody");
    const stats = $("src-stats");
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#6B817A">暂无来源记录。上传 PDF/单据或点击「登记来源」。</td></tr>';
      stats.innerHTML = "";
      return;
    }
    tbody.innerHTML = list
      .map((r) => {
        const v = r.values || {};
        const valParts = [];
        if (v.elec_wan_kwh != null) valParts.push("电 " + fmt(v.elec_wan_kwh, 2) + " 万kWh");
        if (v.gas_wan_nm3 != null) valParts.push("气 " + fmt(v.gas_wan_nm3, 2) + " 万Nm³");
        if (v.diesel_t != null) valParts.push("柴油 " + fmt(v.diesel_t, 1) + " t");
        if (v.s3_wan_t != null) valParts.push("S3 " + fmt(v.s3_wan_t, 2) + " 万t");
        if (v.amount_yuan != null) valParts.push("金额 " + fmt(v.amount_yuan, 0) + " 元");
        if (!valParts.length && r.guess) {
          if (r.guess.elec_kwh) valParts.push("识别 " + r.guess.elec_kwh + " kWh");
          if (r.guess.gas_nm3) valParts.push("识别 " + r.guess.gas_nm3 + " Nm³");
        }
        return (
          "<tr>" +
          "<td>" + (r.scope || "—") + "</td>" +
          "<td>" + (r.source_type || r.file_type || "—") + "</td>" +
          "<td>" + (r.doc_no || r.file_name || "—") + "</td>" +
          "<td>" + (r.date || r.created_at || "—") + "</td>" +
          "<td>" + (valParts.join("；") || r.note || "—") + "</td>" +
          "<td>" + (r.factor_ref || "见核算章") + "</td>" +
          "<td>" + statusChip(r.status) + "</td>" +
          '<td><button class="btn btn-ghost btn-sm" data-use="' + r.id + '">采用</button> ' +
          '<button class="btn btn-ghost btn-sm" data-del="' + r.id + '">删除</button></td>' +
          "</tr>"
        );
      })
      .join("");

    const counts = {};
    list.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    stats.innerHTML = Object.keys(counts)
      .map((k) => statusChip(k + " " + counts[k]))
      .join("");
  }

  function applySourceToForm(rec) {
    const v = rec.values || {};
    const g = rec.guess || {};
    if (v.elec_wan_kwh != null) $("a-elec").value = round(v.elec_wan_kwh, 2);
    else if (g.elec_kwh != null) $("a-elec").value = round(g.elec_kwh / 10000, 2);
    if (v.gas_wan_nm3 != null) $("a-gas").value = round(v.gas_wan_nm3, 2);
    else if (g.gas_nm3 != null) $("a-gas").value = round(g.gas_nm3 / 10000, 2);
    if (v.diesel_t != null) $("a-diesel").value = round(v.diesel_t, 1);
    else if (g.diesel_t != null) $("a-diesel").value = round(g.diesel_t, 1);
    if (v.s3_wan_t != null) $("a-s3").value = round(v.s3_wan_t, 2);
    S.updateSource(rec.id, { status: "可追溯", note: "已采用写入活动数据" });
    renderAll();
  }

  function round(n, d) {
    return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  }

  /* ---------- 计算与报告 ---------- */
  function renderAll() {
    const form = readForm();
    const base = E.computeBaseline(form);
    const skills = E.runSkills(form, base);
    const sources = S.load();

    // KPI
    $("k-total").textContent = fmt(base.total, 2);
    $("k-s1").textContent = fmt(base.s1, 2);
    $("k-s2").textContent = fmt(base.s2, 2);
    $("k-s3").textContent = fmt(base.s3, 2);

    // 因子表
    const rows = [
      {
        item: "天然气（范围一）",
        act: form.gas + " 万 Nm³",
        f: base.factors.gas,
        emit: base.s1_gas
      },
      {
        item: "柴油（范围一）",
        act: form.diesel + " t",
        f: base.factors.diesel,
        emit: base.s1_diesel
      },
      {
        item: "外购电力（范围二）",
        act: form.elec + " 万 kWh",
        f: base.factors.electricity,
        emit: base.s2
      },
      {
        item: "范围三合计",
        act: form.s3 + " 万 tCO₂e（申报）",
        f: { value: "—", unit: "—", source: "企业台账/供应商数据", status: form.s3 ? "估算" : "待补充" },
        emit: base.s3
      }
    ];
    $("factor-tbody").innerHTML = rows
      .map(
        (r) =>
          "<tr><td>" +
          r.item +
          "</td><td class='num'>" +
          r.act +
          "</td><td class='num'>" +
          (r.f && r.f.value != null ? r.f.value : "—") +
          "</td><td>" +
          (r.f && r.f.unit ? r.f.unit : "—") +
          "</td><td class='num'>" +
          fmt(r.emit, 3) +
          "</td><td>" +
          (r.f && r.f.source ? r.f.source : "—") +
          "</td><td>" +
          statusChip(r.f && r.f.status) +
          "</td></tr>"
      )
      .join("");

    // 图
    const max = Math.max(base.total, 0.001);
    $("bar-s1").style.width = (base.s1 / max) * 100 + "%";
    $("bar-s2").style.width = (base.s2 / max) * 100 + "%";
    $("bar-s3").style.width = (base.s3 / max) * 100 + "%";
    $("val-s1").textContent = fmt(base.s1, 2);
    $("val-s2").textContent = fmt(base.s2, 2);
    $("val-s3").textContent = fmt(base.s3, 2);

    const complete = completeness(sources);
    $("bar-complete").style.width = complete + "%";
    $("val-complete").textContent = complete + "%";
    $("complete-legend").innerHTML =
      "已查证/可追溯记录：" +
      sources.filter((s) => s.status === "已查证" || s.status === "可追溯").length +
      " / " +
      Math.max(sources.length, 1) +
      " 条来源。建议：电费单、燃气单、柴油入库单、产量/产值报表、供应商清单。";

    const target = base.total * (1 - form.reduction / 100);
    $("bar-target").style.width = (target / Math.max(base.total, 0.001)) * 100 + "%";
    $("val-base").textContent = fmt(base.total, 2);
    $("val-target").textContent = fmt(target, 2);
    const pathCap = document.querySelector("#charts .chart-box:last-child .cap");
    if (pathCap) pathCap.textContent = "基准年 → 目标年（降幅 " + form.reduction + "%）";

    // 报告标题
    const ty = form.target_year;
    $("r-title").textContent = form.name + " · " + ty + " 双碳规划方案";
    $("r-stamp").textContent = "生成于 " + new Date().toLocaleString("zh-CN");
    $("r-caliber").textContent = form.caliber;
    $("r-complete").textContent = "数据完整度 " + complete + "%";
    $("r-warn").textContent =
      "因子状态 " + (base.factors.electricity && base.factors.electricity.status);

    const cut = base.total - target;
    const years = Math.max(1, ty - Number(form.year));
    $("exec-1").innerHTML =
      "客户基准年（<b>" +
      form.year +
      "</b>）综合排放 <b>" +
      fmt(base.total, 2) +
      "</b> 万 tCO₂e（范围一 <b>" +
      fmt(base.s1, 2) +
      "</b> / 范围二 <b>" +
      fmt(base.s2, 2) +
      "</b> / 范围三 <b>" +
      fmt(base.s3, 2) +
      "</b>），碳排放强度 <b>" +
      fmt(base.intensity, 3) +
      "</b> tCO₂e/万元产值。";
    $("exec-2").innerHTML =
      "目标年 <b>" +
      ty +
      "</b> 降幅 <b>" +
      form.reduction +
      "%</b>，需累计减排约 <b>" +
      fmt(cut, 2) +
      "</b> 万 tCO₂e，年均约 <b>" +
      fmt(cut / years, 2) +
      "</b> 万 tCO₂e。方案强调：<b>数据来源可追溯、因子有出处、状态不造假</b>；缺资料项标注「待补充」，不编造数字。";

    $("e-total").textContent = fmt(base.total, 2);
    $("e-cut").textContent = fmt(cut, 2);
    $("e-int").textContent = fmt(base.intensity, 3);
    $("e-annual").textContent = fmt(cut / years, 2);

    $("scope-text").textContent =
      "组织边界：" +
      form.caliber +
      "。时间边界：" +
      form.year +
      " 完整日历年度。核算覆盖范围一（天然气、柴油）、范围二（外购电力）、范围三（" +
      (form.s3_note || "采购/运输/差旅等合计申报") +
      "）。";

    $("scope-tbody").innerHTML = [
      ["范围一", "天然气、柴油等直接燃烧", base.s1, "燃气结算单、油料采购/入库单"],
      ["范围二", "外购电力", base.s2, "电费结算单、电表读数、绿电凭证"],
      ["范围三", "价值链（采购/物流/差旅等）", base.s3, "采购合同、物流单、问卷/估算模型"]
    ]
      .map(
        (r) =>
          "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td class='num'>" + fmt(r[2], 2) + "</td><td>" + r[3] + "</td></tr>"
      )
      .join("");

    // 来源摘要进报告
    const srcRows = sources.slice(0, 12);
    $("source-tbody").innerHTML = (srcRows.length
      ? srcRows
      : [{ item: "（待收集）", v: "—", doc: "请上传 PDF/单据", type: "—", status: "待补充" }]
    )
      .map((r) => {
        const v = r.values || {};
        let val = "—";
        if (v.elec_wan_kwh != null) val = "电 " + fmt(v.elec_wan_kwh, 2) + " 万kWh";
        if (v.gas_wan_nm3 != null) val = "气 " + fmt(v.gas_wan_nm3, 2) + " 万Nm³";
        if (v.diesel_t != null) val = "柴油 " + fmt(v.diesel_t, 1) + " t";
        return (
          "<tr><td>" +
          (r.scope || "—") +
          "</td><td>" +
          val +
          "</td><td>" +
          (r.doc_no || r.file_name || r.item || "—") +
          "</td><td>" +
          (r.source_type || r.type || "—") +
          "</td><td>" +
          statusChip(r.status) +
          "</td></tr>"
        );
      })
      .join("");

    $("factor-note").innerHTML =
      "因子出处摘要：电力 <b>" +
      (base.factors.electricity && base.factors.electricity.value) +
      " " +
      (base.factors.electricity && base.factors.electricity.unit) +
      "</b>（" +
      (base.factors.electricity && base.factors.electricity.source) +
      " · " +
      (base.factors.electricity && base.factors.electricity.status) +
      "）；天然气与柴油见核算表，状态为估算时须在正式报告中保留标注。";

    $("method-tbody").innerHTML = [
      [
        "天然气",
        form.gas + " 万Nm³ × " + (base.factors.gas && base.factors.gas.value),
        (base.factors.gas && base.factors.gas.unit) || "",
        (base.factors.gas && base.factors.gas.status) || "—"
      ],
      [
        "柴油",
        form.diesel + " t × " + (base.factors.diesel && base.factors.diesel.value),
        (base.factors.diesel && base.factors.diesel.unit) || "",
        (base.factors.diesel && base.factors.diesel.status) || "—"
      ],
      [
        "外购电力",
        form.elec + " 万kWh → MWh × " + (base.factors.electricity && base.factors.electricity.value),
        (base.factors.electricity && base.factors.electricity.unit) || "",
        (base.factors.electricity && base.factors.electricity.status) || "—"
      ],
      ["范围三", "按类别台账合计或估算", "万 tCO₂e", form.s3 ? "估算" : "待补充"]
    ]
      .map(
        (r) =>
          "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + statusChip(r[3]) + "</td></tr>"
      )
      .join("");

    $("roadmap-text").innerHTML =
      "从 <b>" +
      form.year +
      "</b> 到 <b>" +
      ty +
      "</b>，通过「能效管理 → 绿电/PPA → 电气化 → 工艺改造 → 残余排放高质量抵消」组合实现降幅 <b>" +
      form.reduction +
      "%</b>。下列行动须与来源台账、MRV 监测计划绑定，确保减排量可测量、可报告、可核查。";

    $("action-tbody").innerHTML = [
      ["阶段1（0–6月）", "冻结基准年数据台账；补齐电费/燃气/柴油凭证；建立因子出处表", "碳管理组 + 财务/能源", "来源完整度 ≥ 80%"],
      ["阶段2（6–18月）", "能效改造与绿电采购；建立 MRV 监测计划与月度台账", "生产/设备 + 采购", "单位产品能耗下降可核验"],
      ["阶段3（18–目标年）", "工艺电气化与深度减排；探索 CCER/碳信用抵消残余排放", "双碳办 + 对外合作", "目标年清单通过内部交叉复核"]
    ]
      .map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>")
      .join("");

    // Skills
    const html = skills
      .map((s) => {
        const metrics = s.metrics
          .slice(0, 4)
          .map(
            (m) =>
              '<div><span>' +
              m.k +
              "</span><b>" +
              m.v +
              " " +
              (m.u || "") +
              "</b></div>"
          )
          .join("");
        const acts = s.actions.slice(0, 2).map((a) => "<div>→ " + a + "</div>").join("");
        return (
          '<article class="skill-card"><div class="top"><span class="id">' +
          s.id +
          '</span>' +
          statusChip(s.status === "ok" ? "已查证" : s.status === "partial" ? "估算" : s.status === "estimate" ? "估算" : "仅参考") +
          "</div><h5>" +
          s.title +
          '</h5><div class="m">' +
          metrics +
          '</div><div class="n">' +
          s.narrative.slice(0, 90) +
          '…</div><div class="acts">' +
          acts +
          "</div></article>"
        );
      })
      .join("");
    $("skills-grid").innerHTML = html;
    $("skills-grid-2").innerHTML = html;

    renderGovernance(form, base, sources, skills, complete);
    renderDelivery(form, base, sources, complete);

    if (window.CarbonEdit && window.CarbonEdit.applySaved) {
      window.CarbonEdit.applySaved();
    }

    // 附录
    $("appendix-tbody").innerHTML = (sources.length
      ? sources
      : [{ scope: "—", source_type: "—", file_name: "待收集", values: {}, dept: "—", status: "待补充", note: "请上传单据" }]
    )
      .map((r, i) => {
        const v = r.values || {};
        return (
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          (r.scope || "—") +
          "</td><td>" +
          (r.source_type || "—") +
          "</td><td>" +
          (r.doc_no || r.file_name || "—") +
          "</td><td>" +
          (v.elec_wan_kwh != null ? "电" + v.elec_wan_kwh + "万kWh " : "") +
          (v.gas_wan_nm3 != null ? "气" + v.gas_wan_nm3 + "万Nm³ " : "") +
          (v.diesel_t != null ? "柴油" + v.diesel_t + "t" : "") +
          "</td><td>" +
          (r.dept || "—") +
          "</td><td>" +
          statusChip(r.status) +
          "</td><td>" +
          (r.note || "—") +
          "</td></tr>"
        );
      })
      .join("");

    $("appendix-factor-tbody").innerHTML = window.CARBON_DATA.factors
      .map(
        (f) =>
          "<tr><td>" +
          f.item +
          "</td><td class='num'>" +
          f.value +
          "</td><td>" +
          f.unit +
          "</td><td>" +
          f.source +
          "</td><td>" +
          statusChip(f.status) +
          "</td></tr>"
      )
      .join("");
  }

  function completeness(sources) {
    if (!sources.length) return 15;
    let score = 0;
    sources.forEach((s) => {
      if (s.status === "已查证" || s.status === "可追溯") score += 1;
      else if (s.status === "估算" || s.status === "待补充") score += 0.5;
      else score += 0.1;
    });
    return Math.min(100, Math.round((score / sources.length) * 100));
  }

  /** 治理机制：按行业/数据完整度/目标/范围三风险动态生成 */
  function renderGovernance(form, base, sources, skills, complete) {
    const indName = form.industry || "其他";
    const indMeta = (window.CARBON_DATA.industries || []).find((x) => x.name === indName) || {};
    const inMarket = !!indMeta.in_market;
    const isFinance = /银行|保险|基金|金融/.test(indName);
    const isEnergy = /新能源|光伏|风电|储能|氢能|电动车|出行/.test(indName);
    const exportRisk = /制造|钢铁|铝|水泥|化工|出口|纺织|建材/.test(indName) || (indMeta.policy_tags || []).indexOf("CBAM") >= 0;
    const zero2027 = (indMeta.phase || "").indexOf("2027") >= 0;
    const s3Share = base.total ? (base.s3 / base.total) * 100 : 0;
    const ty = form.target_year;
    const weak = complete < 70;

    $("gov-intro").innerHTML =
      "治理机制按 <b>" +
      form.name +
      "</b>（行业 <b>" +
      indName +
      "</b>，" +
      (indMeta.group || "") +
      "，基准年 " +
      form.year +
      "，目标 " +
      ty +
      " 降 " +
      form.reduction +
      "%）动态生成。阶段标签：<b>" +
      (indMeta.phase || "—") +
      "</b>；数据完整度 <b>" +
      complete +
      "%</b>；范围三占比 <b>" +
      s3Share.toFixed(0) +
      "%</b>" +
      (inMarket ? "；<b>配额履约治理必设</b>" : "") +
      (isFinance ? "；<b>金融投融资排放治理</b>" : "") +
      (isEnergy ? "；<b>绿色电力/项目减排量治理</b>" : "") +
      (zero2027 ? "；<b>对齐 2027 零碳工厂培育节奏</b>" : "") +
      "。";

    const cards = [
      {
        t: "组织与职责",
        p: isFinance
          ? "建议由 ESG/风险条线牵头，投行、金市、公司金融、数据科技入列；PCAF 投融资排放数据责任到客户经理。"
          : "建议设「双碳推进办公室」或指定 EHS/能源负责人牵头，财务、生产、采购、IT 数据责任人入列。年产值 " +
            form.output +
            " 亿元规模下，首期可 1 名专职 + 各部门接口人。"
      },
      {
        t: "数据与证据",
        p: weak
          ? "当前来源完整度 " + complete + "%，治理重点是「先补凭证再谈目标」：电费/燃气/柴油/产量台账责任到部门，缺项不得进入对外报告。"
          : "来源完整度 " + complete + "%，可进入月度台账制：活动数据、凭证号、状态三列同步更新。"
      },
      {
        t: "目标与考核",
        p: ty + " 年降幅 " + form.reduction + "% 对应年均减排约 " +
          fmt(base.total * (form.reduction / 100) / Math.max(1, ty - Number(form.year)), 2) +
          " 万 tCO₂e。" +
          (isFinance
            ? "可将组合碳强度与 PCAF 数据质量等级纳入产品考核。"
            : isEnergy
              ? "绿电比例、发电/供能碳强度可纳入经营考核。"
              : "建议将强度指标纳入部门考核，与节能技改立项挂钩。")
      }
    ];
    $("gov-cards").innerHTML = cards
      .map(
        (c) =>
          '<div class="card"><h3>' + c.t + "</h3><p>" + c.p + "</p></div>"
      )
      .join("");

    const rows = [
      [
        "基准年清单冻结与变更登记",
        "本方案第 02/03 章口径与来源台账（完整度 " + complete + "%）",
        "清单冻结单 + 变更留痕（时间/内容/影响/确认人）",
        "变更即走；月度归档",
        "碳管理组 / 双碳办"
      ],
      [
        "排放数据月度采集与复核",
        "范围一 " + fmt(base.s1, 2) + "、范围二 " + fmt(base.s2, 2) + "、范围三 " + fmt(base.s3, 2) + " 万 tCO₂e",
        "监测计划 + 计量台账 + 双人复核",
        "月度",
        "能源/生产 + 财务"
      ],
      [
        "排放因子与政策版本管理（换旧更新）",
        "电力因子 " +
          (base.factors.electricity && base.factors.electricity.value) +
          " " +
          (base.factors.electricity && base.factors.electricity.unit) +
          "（" +
          (base.factors.electricity && base.factors.electricity.status) +
          "）；行业政策按「" +
          indName +
          "」过滤",
        "因子台账 + 政策文号库（现行/被替代/已废止分列）",
        "季度或政策发布后 10 个工作日",
        "碳管理组"
      ],
      [
        s3Share > 25 ? "范围三/供应链数据治理（重点）" : "范围三口径与估算方法",
        "范围三占总量 " + s3Share.toFixed(0) + "%，" + (form.s3_note || "按台账/估算合计"),
        "供应商问卷、采购/物流凭证、估算方法说明书",
        s3Share > 25 ? "半年度专项" : "年度",
        "采购 + 碳管理组"
      ]
    ];
    if (inMarket) {
      rows.push([
        "履约/配额风险管控",
        "行业「" + indName + "」纳入或临近全国碳市场（" + (indMeta.market_year || "") + "）",
        "履约日历、缺口测算、交易授权与限额",
        "履约周期内月度跟踪",
        "双碳办 + 财务"
      ]);
    }
    if (isFinance) {
      rows.push([
        "投融资排放（PCAF）治理",
        "金融范围三类别15 + PCAF 数据质量等级",
        "客户分类、数据等级评分、组合披露模板",
        "季度组合盘点",
        "ESG/风险 + 业务条线"
      ]);
    }
    if (isEnergy) {
      rows.push([
        "绿电/CCER 与减排量资产管理",
        "新能源项目减排量、绿证/PPA 与碳资产",
        "发电量台账、绿证证明、方法学匹配文件",
        "月度发电 + 项目节点",
        "生产运营 + 碳资产"
      ]);
    }
    if (exportRisk) {
      rows.push([
        "出口合规（CBAM/客户碳问卷）",
        "出口链常见要求；隐含碳与产品足迹边界",
        "产品隐含碳台账、CN code 对照、第三方验厂材料",
        "订单触发 / 季度盘点",
        "外贸 + 碳管理组"
      ]);
    }
    if (zero2027) {
      rows.push([
        "零碳工厂培育准备（2027）",
        "工信部联节〔2026〕13号 培育行业清单",
        "绿色工厂自评表、能效与绿电比例证明",
        "半年度自评",
        "工厂/双碳办"
      ]);
    }
    rows.push([
      "报告出门前质量门",
      "第 04–09 章与 17 Skills 结论一致性",
      "交叉复核表、因子状态检查、来源抽检、政策时效核对",
      "每次对外报告前",
      "复核人（非编制人）"
    ]);

    $("gov-tbody").innerHTML = rows
      .map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4] + "</td></tr>")
      .join("");

    $("gov-note").innerHTML =
      "落地要求：治理文件须引用<b>本方案中的实际数字与来源状态</b>。政策引用必须标注文号与时效；出现替代文号时执行「换旧更新」——旧记录标记被替代并停止引用，新记录置为现行有效并附来源链接。";
  }

  /** 交付框架：真实证据链驱动的阶段交付 */
  function renderDelivery(form, base, sources, complete) {
    const ty = form.target_year;
    const y0 = form.year;
    const cut = base.total * (form.reduction / 100);
    const nSrc = sources.length;
    const nVerified = sources.filter((s) => s.status === "已查证" || s.status === "可追溯").length;

    $("del-intro").innerHTML =
      "交付框架按「有输入、有证据、可判定」设计，对应 <b>" +
      form.name +
      "</b> 从 <b>" +
      y0 +
      "</b> 基准到 <b>" +
      ty +
      "</b> 目标年（累计减排约 <b>" +
      fmt(cut, 2) +
      "</b> 万 tCO₂e）。当前来源记录 <b>" +
      nSrc +
      "</b> 条（可追溯 " +
      nVerified +
      " 条），验收标准中的「完整度/抽检」均以台账为准。";

    const t = {
      p1: ty && Number(ty) > Number(y0) ? y0 + " 年 Q1–Q2" : "启动后 0–3 月",
      p2: y0 + " 年 Q3–Q4",
      p3: Number(y0) + 1 + "–" + Math.max(Number(y0) + 2, Number(ty) - 1) + " 年",
      p4: String(ty) + " 年"
    };

    const rows = [
      [
        "阶段1 立项与基线",
        "诊断结论、SOW、项目章程、基准年排放清单、来源台账 v1",
        "活动数据凭证（电费/燃气/柴油/产值）；因子出处表；边界确认单",
        "来源完整度 ≥ 70%；范围一/二合计误差可控；清单经双方书面冻结",
        t.p1
      ],
      [
        "阶段2 调研与 MRV",
        "排放源识别、数据质量评价、监测计划、缺口清单",
        "访谈纪要、计量点照片/台账、校准记录、缺口责任书",
        "每个结论可回指证据；缺数据项 100% 有责任人和时限",
        t.p2
      ],
      [
        "阶段3 方案与投资",
        "减排路径 Roadmap、措施技术经济表、投资与回收、情景分析",
        "本方案第 05 章措施表；设备报价/能耗实测；绿电/技改意向函",
        "措施减排量合计 ≥ 目标缺口；ROI/回收期口径写明假设；与治理机制职责一致",
        t.p3
      ],
      [
        "阶段4 落地与鉴证准备",
        "培训记录、月度执行看板、整改闭环、内部交叉复核包",
        "实施照片/验收单、监测数据、复核底稿、变更留痕",
        "数据完整度 ≥ 90% 或明确「估算」边界；对外报告通过质量门",
        t.p4
      ]
    ];

    $("del-tbody").innerHTML = rows
      .map(
        (r) =>
          "<tr><td><b>" +
          r[0] +
          "</b></td><td>" +
          r[1] +
          "</td><td>" +
          r[2] +
          "</td><td>" +
          r[3] +
          "</td><td>" +
          r[4] +
          "</td></tr>"
      )
      .join("");

    $("del-note").innerHTML =
      "有依有据原则：验收不看「写了多少页」，而看 <b>证据是否落盘</b>（凭证号、台账、确认单）。核算口径、范围、目标年任何变更，重走对应阶段验收并写入变更留痕。正式履约/认证另按主管部门与适用标准执行。";
  }

  /* ---------- 事件 ---------- */
  function bind() {
    const ids = [
      "c-name", "c-industry", "c-caliber", "c-year", "c-target", "c-reduction",
      "c-output", "c-energy", "c-note", "a-gas", "a-diesel", "a-elec", "a-s3", "a-s3-note"
    ];
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", renderAll);
      el.addEventListener("change", renderAll);
    });

    // 上传
    const drop = $("drop");
    const fileInput = $("file-input");
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener("change", () => handleFiles(fileInput.files));

    $("btn-add-source").addEventListener("click", () => {
      const rec = S.addSource({
        scope: $("src-scope").value,
        source_type: $("src-type").value,
        doc_no: $("src-doc").value.trim() || "手工登记",
        dept: $("src-dept").value.trim(),
        status: "待补充",
        values: {},
        note: "手工登记，待附凭证",
        file_name: $("src-doc").value.trim() || "（无文件）",
        date: new Date().toISOString().slice(0, 10)
      });
      $("src-hint").textContent = "已登记：" + rec.doc_no;
      renderAll();
    });

    $("btn-apply-guess").addEventListener("click", () => {
      const list = S.load();
      const rec = list.find((r) => r.guess && (r.guess.elec_kwh || r.guess.gas_nm3 || r.guess.diesel_t));
      if (!rec) {
        $("src-hint").textContent = "没有可采用的识别值，请先上传 PDF 或手工填写。";
        return;
      }
      applySourceToForm(rec);
      $("src-hint").textContent = "已采用来源：" + (rec.doc_no || rec.file_name);
    });

    $("btn-clear-sources").addEventListener("click", () => {
      if (confirm("确认清空全部来源台账？")) {
        S.clearAll();
        renderAll();
      }
    });

    $("src-tbody").addEventListener("click", (e) => {
      const use = e.target.getAttribute("data-use");
      const del = e.target.getAttribute("data-del");
      if (use) {
        const rec = S.load().find((x) => x.id === use);
        if (rec) applySourceToForm(rec);
      }
      if (del) {
        S.removeSource(del);
        renderAll();
      }
    });

    $("btn-word").addEventListener("click", () => window.CarbonExport.exportReportWord(readForm().name));
    $("btn-word-2").addEventListener("click", () => window.CarbonExport.exportReportWord(readForm().name));
    $("btn-pdf").addEventListener("click", () => window.CarbonExport.exportPrint());
    $("btn-pdf-2").addEventListener("click", () => window.CarbonExport.exportPrint());
  }

  function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    $("src-hint").textContent = "识别中…";
    S.importFiles(fileList, $("src-scope").value).then((recs) => {
      const ok = recs.filter((r) => r.guess && (r.guess.elec_kwh || r.guess.gas_nm3)).length;
      $("src-hint").textContent =
        "已收集 " + recs.length + " 个文件，其中 " + ok + " 个提取到候选数值。请在台账中核对状态后「采用」。";
      renderAll();
    });
  }

  // 初始示例来源，保证演示也有溯源表
  function seedIfEmpty() {
    if (S.load().length) return;
    S.addSource({
      scope: "2",
      source_type: "invoice",
      doc_no: "示例-电费结算单",
      file_name: "（示例）电费结算单.pdf",
      dept: "能源管理部",
      status: "可追溯",
      values: { elec_wan_kwh: 6800 },
      note: "示例数据，可删除后上传真实单据",
      date: "2023-12-31"
    });
    S.addSource({
      scope: "1",
      source_type: "invoice",
      doc_no: "示例-燃气结算单",
      file_name: "（示例）天然气结算单.pdf",
      dept: "能源管理部",
      status: "可追溯",
      values: { gas_wan_nm3: 320 },
      note: "示例数据，可删除后上传真实单据",
      date: "2023-12-31"
    });
    S.addSource({
      scope: "1",
      source_type: "ledger",
      doc_no: "示例-柴油入库单",
      file_name: "（示例）柴油采购入库.xlsx",
      dept: "仓储/财务",
      status: "可追溯",
      values: { diesel_t: 860 },
      note: "示例数据，可删除后上传真实单据",
      date: "2023-12-31"
    });
    S.addSource({
      scope: "3",
      source_type: "estimate",
      doc_no: "示例-范围三估算表",
      file_name: "（示例）范围三估算台账.xlsx",
      dept: "碳管理组",
      status: "估算",
      values: { s3_wan_t: 6.2 },
      note: "范围三为估算示例，正式方案须补供应商/物流凭证",
      date: "2023-12-31"
    });
  }

  /** 行业下拉（分组） + 基准年 2019–2099 */
  function fillIndustryYears() {
    const sel = $("c-industry");
    const groups = {};
    (window.CARBON_DATA.industries || []).forEach((ind) => {
      const g = ind.group || "其他";
      if (!groups[g]) groups[g] = [];
      groups[g].push(ind);
    });
    sel.innerHTML = Object.keys(groups)
      .map((g) => {
        const opts = groups[g]
          .map((ind) => '<option value="' + ind.name + '">' + ind.name + "（" + ind.phase + "）</option>")
          .join("");
        return '<optgroup label="' + g + '">' + opts + "</optgroup>";
      })
      .join("");
    sel.value = "机械制造";

    const year = $("c-year");
    let yhtml = "";
    for (let y = 2019; y <= 2099; y++) {
      yhtml += "<option" + (y === 2023 ? " selected" : "") + ">" + y + "</option>";
    }
    year.innerHTML = yhtml;
    year.value = "2023";
  }

  let policyShowAll = false;

  function policiesForIndustry(indName) {
    const ind = (window.CARBON_DATA.industries || []).find((x) => x.name === indName) || {};
    const tags = ind.policy_tags || ["通用"];
    const all = window.CARBON_DATA.policies || [];
    return all.filter((p) => {
      const hit = (p.tags || []).some((t) => tags.indexOf(t) >= 0 || t === "通用");
      if (!policyShowAll) return hit && p.valid !== false && p.status !== "已废止" && p.status !== "被替代";
      return hit;
    }).sort((a, b) => {
      const av = a.valid !== false && a.status === "现行有效" ? 0 : 1;
      const bv = b.valid !== false && b.status === "现行有效" ? 0 : 1;
      return av - bv;
    });
  }

  function renderPolicies() {
    const name = $("c-industry").value;
    const ind = (window.CARBON_DATA.industries || []).find((x) => x.name === name) || {};
    const list = policiesForIndustry(name);

    const profile = $("industry-profile");
    if (profile) {
      profile.innerHTML =
        '<div class="grid g2" style="gap:8px">' +
        "<div><div style='font-size:12px;color:#6B817A'>行业</div><b>" +
        name +
        "</b> · " +
        (ind.group || "—") +
        "</div>" +
        "<div><div style='font-size:12px;color:#6B817A'>碳市场/阶段</div><b>" +
        (ind.phase || "—") +
        "</b> · " +
        (ind.market_year || "—") +
        "</div>" +
        "<div><div style='font-size:12px;color:#6B817A'>核算标准</div><b>" +
        (ind.std || "—") +
        "</b></div>" +
        "<div><div style='font-size:12px;color:#6B817A'>是否涉配额</div><b>" +
        (ind.in_market ? "是（履约）" : "否/以报告或培育为主") +
        "</b></div>" +
        "</div>";
    }

    const tb = $("policy-tbody");
    if (!list.length) {
      tb.innerHTML = "<tr><td colspan='4'>该行业暂无匹配政策（可切换「含历史/废止」查看）</td></tr>";
    } else {
      tb.innerHTML = list
        .map((p) => {
          const ok = p.valid !== false && p.status === "现行有效";
          const chip = ok ? "chip-ok" : p.status === "已废止" ? "chip-err" : "chip-warn";
          return (
            "<tr><td><b>" +
            p.name +
            "</b><div style='font-size:11px;color:#6B817A'>" +
            (p.summary || "") +
            "</div></td><td>" +
            p.no +
            "</td><td><span class='chip " +
            chip +
            "'>" +
            p.status +
            "</span>" +
            (p.replaced_by
              ? "<div style='font-size:10px;margin-top:4px'>由 " + p.replaced_by + " 替代</div>"
              : "") +
            (p.replaces ? "<div style='font-size:10px'>替代 " + p.replaces + "</div>" : "") +
            "</td><td style='font-size:11px'>" +
            p.source +
            (p.link ? "<br><a href='" + p.link + "' target='_blank' rel='noopener'>来源链接</a>" : "") +
            "</td></tr>"
          );
        })
        .join("");
    }

    const note = $("policy-note");
    if (note) {
      const validN = list.filter((p) => p.valid !== false && p.status === "现行有效").length;
      note.innerHTML =
        "行业 <b>" +
        name +
        "</b> 匹配政策 <b>" +
        list.length +
        "</b> 条，其中现行有效 <b>" +
        validN +
        "</b> 条。" +
        "已废止/被替代政策仅供追溯，不得作为当前合规依据；引用时须写文号 + 状态 + 来源链接。" +
        "「换旧更新」：当出现替代文号时，旧记录保留并标记 <b>被替代</b>，新记录插入库并置顶为现行有效。";
    }

    // 同步报告里的政策技能叙事（若存在）
    const policySkill = document.querySelectorAll("#skills-grid .skill-card");
    // 由 renderAll 中 skill 文案再生成，这里仅触发一次渲染
  }

  seedIfEmpty();
  fillIndustryYears();
  bind();
  renderAll();
  renderPolicies();

  const indSel = $("c-industry");
  if (indSel) indSel.addEventListener("change", function () {
    renderPolicies();
    renderAll();
  });
  const ySel = $("c-year");
  if (ySel) ySel.addEventListener("change", renderAll);
  const bOnly = $("btn-policies-only");
  const bAll = $("btn-policies-all");
  if (bOnly) bOnly.addEventListener("click", function () {
    policyShowAll = false;
    renderPolicies();
  });
  if (bAll) bAll.addEventListener("click", function () {
    policyShowAll = true;
    renderPolicies();
  });
})();
