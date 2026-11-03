pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const wordInput = document.querySelector("#word-file");
const pdfInput = document.querySelector("#pdf-file");
const wordName = document.querySelector("#word-name");
const pdfName = document.querySelector("#pdf-name");
const runBtn = document.querySelector("#run");
const exportBtn = document.querySelector("#export");
const statusEl = document.querySelector("#status");
const warnEl = document.querySelector("#warn");
const resultsEl = document.querySelector("#results");
const rowsEl = document.querySelector("#rows");
const statsEl = document.querySelector("#stats");
const filtersEl = document.querySelector("#filters");
const matchedEl = document.querySelector("#matched");
const nameInput = document.querySelector("#material-name");

let findings = [];
let matchedText = "";
let filter = "全部";

wordInput.addEventListener("change", () => {
  wordName.textContent = wordInput.files[0] ? wordInput.files[0].name : "选择 .docx";
  document.querySelector("#word-drop").classList.toggle("ready", !!wordInput.files[0]);
  if (wordInput.files[0] && !nameInput.value) {
    nameInput.value = wordInput.files[0].name.replace(/\.docx$/i, "").slice(0, 40);
  }
  syncRun();
});
pdfInput.addEventListener("change", () => {
  pdfName.textContent = pdfInput.files[0] ? pdfInput.files[0].name : "选择 .pdf";
  document.querySelector("#pdf-drop").classList.toggle("ready", !!pdfInput.files[0]);
  syncRun();
});
function syncRun() {
  runBtn.disabled = !(wordInput.files[0] && pdfInput.files[0]);
}

runBtn.addEventListener("click", async () => {
  runBtn.disabled = true;
  statusEl.textContent = "正在抽取文字…";
  warnEl.hidden = true;
  try {
    const [wordText, pdfText] = await Promise.all([
      readDocx(wordInput.files[0]),
      readPdf(pdfInput.files[0]),
    ]);
    if (pdfText.replace(/\s/g, "").length < 40) {
      warnEl.hidden = false;
      warnEl.textContent =
        "这份 PDF 几乎没有可选中的文字，多半是扫描件或整页图片。网页只能对文字层，这种文件对出来会是空的或不可靠。";
    }
    const result = compare(wordText, pdfText);
    findings = result.findings;
    matchedText = result.matched;
    filter = "全部";
    render();
    resultsEl.hidden = false;
    exportBtn.hidden = findings.length === 0 && !matchedText;
    statusEl.textContent = findings.length
      ? `对照完成，${findings.length} 条需要看。`
      : "没有发现文字层上的差异。";
  } catch (err) {
    statusEl.textContent = "对照没有完成：" + (err && err.message ? err.message : err);
  } finally {
    syncRun();
  }
});

exportBtn.addEventListener("click", () => {
  const header = ["物料", "类别", "Word 稿", "PDF 成品", "说明", "复核意见"];
  const material = nameInput.value.trim() || "未命名物料";
  const lines = [header.join(",")];
  findings.forEach((row) => {
    lines.push(
      [material, row.kind, row.word, row.pdf, row.note, ""]
        .map(csv)
        .join(","),
    );
  });
  if (matchedText) {
    lines.push([material, "已对齐", matchedText, matchedText, "两边都有这些数字或代码", ""].map(csv).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (material || "物料复核") + "-对照.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

function csv(value) {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

async function readDocx(file) {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const fileXml = zip.file("word/document.xml");
  if (!fileXml) throw new Error("这不是可读取的 docx");
  let xml = await fileXml.async("string");
  xml = xml.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  const parts = [];
  xml.split("</w:p>").forEach((chunk) => {
    const texts = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1]));
    const text = texts.join("").replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  });
  return parts.join("\n");
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    content.items.forEach((item) => {
      if (!item.str) return;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    });
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function norm(s) {
  return s
    .replace(/\s+/g, "")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[；]/g, ";")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[、]/g, ",")
    .replace(/[—–－]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[％]/g, "%")
    .replace(/[·・]/g, ".")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]");
}

function sentences(text) {
  const seen = new Set();
  const out = [];
  text.split(/[。\n；]/).forEach((raw) => {
    const clean = raw.trim().replace(/^[|\s]+|[|\s]+$/g, "");
    const n = norm(clean);
    if (n.length < 10 || seen.has(n)) return;
    const han = (n.match(/[\u4e00-\u9fff]/g) || []).length;
    if (han < 4 && !/\d/.test(n)) return;
    seen.add(n);
    out.push({ raw: clean, n });
  });
  return out;
}

function coverage(nc, full) {
  if (full.includes(nc)) return 1;
  if (nc.length < 8) return 0;
  let hit = 0;
  const total = nc.length - 7;
  for (let i = 0; i < total; i++) {
    if (full.includes(nc.slice(i, i + 8))) hit++;
  }
  return hit / total;
}

function locate(nc, full) {
  let best = null;
  const width = Math.min(10, nc.length);
  for (let i = 0; i + width <= nc.length; i++) {
    const j = full.indexOf(nc.slice(i, i + width));
    if (j >= 0) {
      best = { i, j, len: width };
      break;
    }
  }
  if (!best) return "";
  const start = Math.max(0, best.j - best.i);
  return full.slice(start, start + nc.length + 8);
}

function lcsDiff(a, b) {
  const m = a.length;
  const n = b.length;
  if (m > 180 || n > 200) return null;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const aMarks = Array(m).fill(false);
  const bMarks = Array(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      aMarks[i] = true;
      i++;
    } else {
      bMarks[j] = true;
      j++;
    }
  }
  while (i < m) aMarks[i++] = true;
  while (j < n) bMarks[j++] = true;
  const changed = aMarks.some(Boolean) || bMarks.some(Boolean);
  const meaningful = [...a].some((ch, idx) => aMarks[idx] && /[\u4e00-\u9fff0-9%]/.test(ch))
    || [...b].some((ch, idx) => bMarks[idx] && /[\u4e00-\u9fff0-9%]/.test(ch));
  return { changed, meaningful, aMarks, bMarks };
}

function paint(text, marks) {
  let html = "";
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] && !open) {
      html += "<mark>";
      open = true;
    } else if (!marks[i] && open) {
      html += "</mark>";
      open = false;
    }
    html += escapeHtml(text[i]);
  }
  if (open) html += "</mark>";
  return html;
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function compare(wordText, pdfText) {
  const wn = norm(wordText);
  const pn = norm(pdfText);
  const findings = [];
  const seen = new Set();

  function push(kind, word, pdf, note, wordHtml, pdfHtml) {
    const key = kind + "|" + norm(word) + "|" + norm(pdf);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, word, pdf, note, wordHtml: wordHtml || escapeHtml(word), pdfHtml: pdfHtml || escapeHtml(pdf) });
  }

  sentences(wordText).forEach(({ raw, n }) => {
    if (pn.includes(n)) return;
    const cover = coverage(n, pn);
    if (cover >= 0.93) return;
    const win = locate(n, pn);
    const diff = win ? lcsDiff(n, win.slice(0, n.length + 4)) : null;
    if (diff && diff.changed && diff.meaningful && cover >= 0.55) {
      push(
        "正文不一致",
        raw,
        win,
        "同一句里有字不一样，标出的是不同的地方。",
        paint(n, diff.aMarks),
        paint(win.slice(0, diff.bMarks.length), diff.bMarks),
      );
      return;
    }
    if (cover < 0.45) {
      push("稿有成品无", raw, "（成品文字层里没有这句）", "稿里有，成品文字层里对不上。转曲标题可能其实印在版面上。");
    }
  });

  sentences(pdfText).forEach(({ raw, n }) => {
    if (wn.includes(n)) return;
    const han = (n.match(/[\u4e00-\u9fff]/g) || []).length;
    if (han < 4) return;
    const cover = coverage(n, wn);
    if (cover >= 0.9) return;
    if (cover < 0.4) {
      push("成品多写", "（稿里没有这句）", raw, "成品文字层里有，稿里没有。图注和脚注经常落在这里。");
    }
  });

  const numRe = /\d+(?:\.\d+)?%|\d{4}[./年]\d{1,2}(?:[./月]\d{1,2}日?)?|\d{6}/g;
  const wordNums = new Set(wordText.match(numRe) || []);
  const pdfNums = new Set(pdfText.match(numRe) || []);
  const both = [...wordNums].filter((n) => pdfNums.has(n));
  both.sort();
  return {
    findings: findings.slice(0, 80),
    matched: both.length ? both.slice(0, 40).join("、") : "没有抽出两边都出现的百分比、日期或六位代码。",
  };
}

function render() {
  const kinds = ["全部", "正文不一致", "成品多写", "稿有成品无"];
  const counts = {
    正文不一致: findings.filter((f) => f.kind === "正文不一致").length,
    成品多写: findings.filter((f) => f.kind === "成品多写").length,
    稿有成品无: findings.filter((f) => f.kind === "稿有成品无").length,
  };
  statsEl.innerHTML = Object.entries(counts)
    .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`)
    .join("");
  filtersEl.innerHTML = kinds
    .map((k) => `<button type="button" data-k="${k}" class="${k === filter ? "on" : ""}">${k}</button>`)
    .join("");
  filtersEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.k;
      render();
    });
  });
  const view = findings.filter((f) => filter === "全部" || f.kind === filter);
  const cls = { 正文不一致: "body", 成品多写: "extra", 稿有成品无: "missing" };
  rowsEl.innerHTML = view
    .map(
      (f) => `<tr class="${cls[f.kind] || ""}">
        <td>${escapeHtml(f.kind)}</td>
        <td>${f.wordHtml}</td>
        <td>${f.pdfHtml}</td>
        <td>${escapeHtml(f.note)}</td>
        <td><select><option value="">待确认</option><option>按稿修改</option><option>按成品保留</option><option>不是问题</option></select></td>
      </tr>`,
    )
    .join("");
  if (!view.length) {
    rowsEl.innerHTML = `<tr><td colspan="5">这一类里没有条目。</td></tr>`;
  }
  matchedEl.textContent = matchedText;
}
