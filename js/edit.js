/* 手动编辑：可编辑页面显示文字，localStorage 保存；可导出/重置 */
(function () {
  const KEY = "carbon_page_edits_v1";
  const $ = (id) => document.getElementById(id);

  function loadEdits() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveEdits(obj) {
    localStorage.setItem(KEY, JSON.stringify(obj));
  }

  /** 为可编辑节点生成稳定 key */
  function keyFor(el) {
    if (el.dataset.editKey) return el.dataset.editKey;
    const parent = el.closest("[id]") || el;
    const pid = parent.id || "root";
    const tag = el.tagName.toLowerCase();
    const idx = Array.prototype.indexOf.call(parent.querySelectorAll(tag), el);
    const k = pid + ">" + tag + ">" + idx;
    el.dataset.editKey = k;
    return k;
  }

  function markEditable() {
    const skip = "#skills-grid,#skills-grid-2,#factor-tbody,#src-tbody,#policy-tbody,#gov-tbody,#del-tbody,#scope-tbody,#source-tbody,#method-tbody,#action-tbody,#appendix-tbody,#appendix-factor-tbody,#live-skills";
    const roots = document.querySelectorAll(
      "#report h3, #report h4, #report > .rsec > p, #report .note, " +
      ".hero h1, .hero .sub, .sec-head h2, .sec-head p, .card h3, .card p, " +
      "#gov-intro, #del-intro, #gov-note, #del-note, #policy-note, #industry-profile, .brand"
    );
    roots.forEach((el) => {
      if (el.classList.contains("no-edit")) return;
      if (el.closest(skip)) return;
      el.classList.add("editable");
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      const k = keyFor(el);
      const saved = loadEdits();
      if (saved[k] != null && el.innerHTML !== saved[k]) {
        el.dataset.defaultHtml = el.dataset.defaultHtml || el.innerHTML;
        el.innerHTML = saved[k];
      } else if (!el.dataset.defaultHtml) {
        el.dataset.defaultHtml = el.innerHTML;
      }
    });
  }

  /** 重算后重新套用已保存修改 */
  function applySaved() {
    const saved = loadEdits();
    if (!Object.keys(saved).length) return;
    document.querySelectorAll("[data-edit-key]").forEach((el) => {
      const k = el.dataset.editKey;
      if (saved[k] != null && el.innerHTML !== saved[k]) {
        if (el.dataset.defaultHtml == null) el.dataset.defaultHtml = el.innerHTML;
        el.innerHTML = saved[k];
      }
    });
    // 新出现的可编辑节点
    markEditable();
  }

  function collectEdits() {
    const saved = loadEdits();
    document.querySelectorAll(".editable").forEach((el) => {
      const k = keyFor(el);
      const cur = el.innerHTML;
      const def = el.dataset.defaultHtml;
      if (def != null && cur !== def) {
        saved[k] = cur;
      } else if (def != null && cur === def && saved[k] != null) {
        delete saved[k];
      }
    });
    saveEdits(saved);
    return Object.keys(saved).length;
  }

  let on = false;

  function setEdit(onFlag) {
    on = onFlag;
    document.body.classList.toggle("edit-mode", on);
    const btn = $("btn-edit");
    if (btn) {
      btn.textContent = on ? "完成编辑" : "手动编辑";
      btn.classList.toggle("btn", on);
      btn.classList.toggle("btn-line", !on);
    }
    if (on) {
      markEditable();
      const bar = ensureBar();
      bar.style.display = "flex";
      const n = Object.keys(loadEdits()).length;
      $("edit-status").textContent = "已进入编辑模式：直接点击文字修改。已有本地修改 " + n + " 处。";
    } else {
      const n = collectEdits();
      document.querySelectorAll(".editable").forEach((el) => {
        el.setAttribute("contenteditable", "false");
      });
      const bar = ensureBar();
      if ($("edit-status")) {
        $("edit-status").textContent = "已保存 " + n + " 处手动修改（存本机浏览器）。导出 Word/PDF 会带上修改。";
      }
    }
  }

  function ensureBar() {
    let bar = $("edit-bar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "edit-bar";
    bar.className = "edit-bar";
    bar.innerHTML =
      '<span id="edit-status">编辑模式</span>' +
      '<button class="btn btn-sm" id="edit-save">保存</button>' +
      '<button class="btn btn-line btn-sm" id="edit-reset">恢复默认文字</button>' +
      '<button class="btn btn-line btn-sm" id="edit-export-json">导出修改 JSON</button>' +
      '<button class="btn btn-line btn-sm" id="edit-close">退出编辑</button>';
    document.body.appendChild(bar);
    bar.querySelector("#edit-save").onclick = function () {
      const n = collectEdits();
      $("edit-status").textContent = "已保存 " + n + " 处修改。";
    };
    bar.querySelector("#edit-reset").onclick = function () {
      if (!confirm("恢复所有手动修改为页面默认文字？")) return;
      localStorage.removeItem(KEY);
      document.querySelectorAll(".editable").forEach((el) => {
        if (el.dataset.defaultHtml != null) el.innerHTML = el.dataset.defaultHtml;
      });
      $("edit-status").textContent = "已恢复默认文字。";
    };
    bar.querySelector("#edit-export-json").onclick = function () {
      collectEdits();
      const blob = new Blob([localStorage.getItem(KEY) || "{}"], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "page-edits.json";
      a.click();
    };
    bar.querySelector("#edit-close").onclick = function () {
      setEdit(false);
    };
    return bar;
  }

  function init() {
    const btn = $("btn-edit");
    if (btn) {
      btn.addEventListener("click", function () {
        setEdit(!on);
      });
    }
    // 若刷新前在编辑，恢复标记
    if (sessionStorage.getItem("carbon_edit_on") === "1") {
      setEdit(true);
    }
    document.addEventListener("visibilitychange", function () {
      sessionStorage.setItem("carbon_edit_on", on ? "1" : "0");
    });
    window.addEventListener("beforeunload", function () {
      if (on) collectEdits();
    });
    // 自动套用已保存修改（即使未开编辑）
    setTimeout(function () {
      const saved = loadEdits();
      if (!Object.keys(saved).length) return;
      markEditable();
      document.querySelectorAll(".editable").forEach((el) => {
        el.setAttribute("contenteditable", "false");
      });
    }, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CarbonEdit = { setEdit, collectEdits, loadEdits, applySaved, markEditable };
})();
