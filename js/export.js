/* 导出 Word / PDF（打印） — 纯前端 */
(function () {
  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  /** 生成 Word（.doc，HTML MIME，Word/WPS 可直接打开） */
  function exportWord(title, bodyHtml) {
    const html =
      "<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>" + title + "</title>" +
      "<style>" +
      "body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;font-size:12pt;line-height:1.6;color:#143029}" +
      "h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:18pt}" +
      "table{border-collapse:collapse;width:100%;margin:8pt 0}" +
      "th,td{border:1px solid #999;padding:6pt 8pt;font-size:10.5pt;vertical-align:top}" +
      "th{background:#14614C;color:#fff}" +
      ".meta{color:#555;font-size:10pt}.tag{display:inline-block;padding:1pt 6pt;border:1px solid #888;font-size:9pt}" +
      "</style></head><body>" + bodyHtml + "</body></html>";
    const blob = new Blob(["﻿" + html], { type: "application/msword;charset=utf-8" });
    downloadBlob(blob, title.replace(/[\\/:*?"<>|]/g, "_") + ".doc");
  }

  function exportPrint() {
    window.print();
  }

  /** 把当前报告区转成 Word HTML（克隆精简） */
  function exportReportWord(companyName) {
    const report = document.getElementById("report");
    if (!report) return;
    const clone = report.cloneNode(true);
    clone.querySelectorAll("button, .no-print, script").forEach((n) => n.remove());
    const title = (companyName || "双碳") + "·双碳规划方案";
    const meta =
      "<p class='meta'>导出时间：" +
      new Date().toLocaleString("zh-CN") +
      " · 由双碳方案落地系统生成 · 因子与来源以正文标注为准</p>";
    exportWord(title, meta + clone.innerHTML);
  }

  window.CarbonExport = {
    exportWord,
    exportPrint,
    exportReportWord
  };
})();
