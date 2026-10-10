/* 数据来源收集：PDF/单据/台账 — 识别摘要 + 结构化登记 + 状态标注 */
(function () {
  const LS_KEY = "carbon_sources_v1";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  /** 从 PDF 提取可读文本（尽力而为，未压缩流；失败则返回空） */
  function extractPdfText(arrayBuffer) {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      let latin = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        latin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      // 取 BT ... ET 文本块中的 () 字符串
      const re = /\(([^)]{1,200})\)\s*Tj/g;
      const re2 = /\[(.*?)\]\s*TJ/g;
      let out = [];
      let m;
      while ((m = re.exec(latin))) {
        out.push(m[1]);
      }
      while ((m = re2.exec(latin))) {
        const parts = m[1].match(/\(([^)]*)\)/g) || [];
        out.push(parts.map((p) => p.slice(1, -1)).join(""));
      }
      let text = out.join(" ").replace(/\\\\/g, "\\").replace(/\\([()])/g, "$1");
      text = text.replace(/\s+/g, " ").trim();
      return text.slice(0, 8000);
    } catch (e) {
      return "";
    }
  }

  /** 从文本启发式抽取电量/气量/金额/日期 */
  function guessFields(text, hintType) {
    const t = (text || "").replace(/,/g, "");
    const guess = {
      elec_kwh: null,
      gas_nm3: null,
      diesel_t: null,
      amount_yuan: null,
      date: null,
      doc_no: null
    };
    let m;
    if ((m = t.match(/(?:用电量|电量|售电量)[^\d]{0,12}([\d.]+)\s*(?:kWh|千瓦时|度)/i))) {
      guess.elec_kwh = parseFloat(m[1]);
    }
    if ((m = t.match(/([\d.]+)\s*(?:kWh|千瓦时|度)/i)) && guess.elec_kwh == null) {
      guess.elec_kwh = parseFloat(m[1]);
    }
    if ((m = t.match(/(?:天然气|燃气|用气量)[^\d]{0,12}([\d.]+)\s*(?:Nm3|Nm³|立方米|m3)/i))) {
      guess.gas_nm3 = parseFloat(m[1]);
    }
    if ((m = t.match(/(?:柴油)[^\d]{0,12}([\d.]+)\s*(?:t|吨|kg|公斤)/i))) {
      let v = parseFloat(m[1]);
      if (/kg|公斤/i.test(m[0])) v = v / 1000;
      guess.diesel_t = v;
    }
    if ((m = t.match(/(?:金额|合计|价税合计|总额)[^\d]{0,8}([\d.]+)/i))) {
      guess.amount_yuan = parseFloat(m[1]);
    }
    if ((m = t.match(/(20\d{2})[-\/年.](\d{1,2})[-\/月.](\d{1,2})/))) {
      guess.date = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    }
    if ((m = t.match(/(?:No\.?|号码|单号|凭证号|发票号码)[：:\s]*([A-Za-z0-9\-]{4,32})/i))) {
      guess.doc_no = m[1];
    }
    if (hintType === "invoice" && guess.elec_kwh == null && guess.amount_yuan != null) {
      // 发票常见：电费 = 电量 × 单价，仅作参考
    }
    return guess;
  }

  function statusChip(status) {
    const map = {
      "已查证": "chip-ok",
      "可追溯": "chip-ok",
      "估算": "chip-warn",
      "待补充": "chip-warn",
      "占位-待核实": "chip-warn",
      "缺失": "chip-err",
      "识别中": "chip-info"
    };
    return map[status] || "chip-info";
  }

  function addSource(rec) {
    const list = load();
    rec.id = rec.id || "src-" + Date.now();
    rec.created_at = rec.created_at || new Date().toISOString().slice(0, 19).replace("T", " ");
    list.unshift(rec);
    save(list);
    return rec;
  }

  function updateSource(id, patch) {
    const list = load();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list[i] = Object.assign({}, list[i], patch);
      save(list);
    }
    return list;
  }

  function removeSource(id) {
    save(load().filter((x) => x.id !== id));
  }

  function clearAll() {
    save([]);
  }

  function importFiles(fileList, scope, onProgress) {
    const files = Array.from(fileList || []);
    return Promise.all(
      files.map((file, idx) => {
        return new Promise((resolve) => {
          const type = /pdf$/i.test(file.name) ? "pdf" : /xlsx?|csv$/i.test(file.name) ? "ledger" : /jpe?g|png|webp$/i.test(file.name) ? "invoice" : "manual";
          const reader = new FileReader();
          reader.onload = function () {
            let text = "";
            if (type === "pdf") {
              text = extractPdfText(reader.result);
            }
            const guess = guessFields(text, type);
            const rec = {
              id: "src-" + Date.now() + "-" + idx,
              file_name: file.name,
              file_size: file.size,
              file_type: type,
              scope: scope || "auto",
              source_type: type === "pdf" ? "pdf" : type === "ledger" ? "ledger" : "invoice",
              status: text ? "待补充" : "待补充",
              text_snippet: text.slice(0, 500),
              guess,
              values: {
                elec_wan_kwh: guess.elec_kwh != null ? guess.elec_kwh / 10000 : null,
                gas_wan_nm3: guess.gas_nm3 != null ? guess.gas_nm3 / 10000 : null,
                diesel_t: guess.diesel_t,
                amount_yuan: guess.amount_yuan
              },
              note: text ? "已从 PDF 文本启发式提取，请人工确认后写入活动数据" : "未能自动提取文本，请手工填写数值（扫描件/图片）",
              created_at: new Date().toISOString().slice(0, 19).replace("T", " ")
            };
            if (onProgress) onProgress(rec, idx, files.length);
            resolve(rec);
          };
          reader.onerror = function () {
            resolve({
              id: "src-" + Date.now() + "-" + idx,
              file_name: file.name,
              source_type: "manual",
              scope: scope || "auto",
              status: "缺失",
              note: "文件读取失败",
              values: {},
              created_at: new Date().toISOString().slice(0, 19).replace("T", " ")
            });
          };
          if (type === "pdf") reader.readAsArrayBuffer(file);
          else reader.readAsText(file, "utf-8").catch(() => reader.readAsArrayBuffer(file));
        });
      })
    ).then((recs) => {
      recs.forEach((r) => addSource(r));
      return recs;
    });
  }

  window.CarbonSources = {
    load,
    save,
    addSource,
    updateSource,
    removeSource,
    clearAll,
    importFiles,
    extractPdfText,
    guessFields,
    statusChip
  };
})();
