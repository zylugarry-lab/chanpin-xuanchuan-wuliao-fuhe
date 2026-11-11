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
let imageUrls = [];

wordInput.addEventListener("change", () => {
  wordName.textContent = wordInput.files[0] ? wordInput.files[0].name : "选择 .docx";
  document.querySelector("#word-drop").classList.toggle("ready", !!wordInput.files[0]);
  if (wordInput.files[0] && !nameInput.value) {
    nameInput.value = wordInput.files[0].name.replace(/\.docx$/i, "").slice(0, 40);
  }
  syncRun();
});
pdfInput.addEventListener("change", () => {
  pdfName.textContent = pdfInput.files[0] ? pdfInput.files[0].name : "选择 PDF、PNG、JPG";
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
    const finished = pdfInput.files[0];
    const [word, pdf] = await Promise.all([
      readDocx(wordInput.files[0]),
      isImageFile(finished) ? readImageFile(finished) : readPdf(finished),
    ]);
    const scan = pdf.text.replace(/\s/g, "").length < 40;
    let ocrGroups = [];
    if (word.images.length || scan) {
      try {
        const worker = await createOcrWorker();
        try {
          if (word.images.length) {
            const ocr = await ocrImages(worker, word.images, (message) => {
              statusEl.textContent = message;
            });
            ocrGroups = ocr.groups;
            word.ocrText = ocr.text;
            word.ocrLines = ocr.lines;
          }
          if (pdf.image) {
            const ocr = await ocrImageElement(worker, pdf.image, (message) => {
              statusEl.textContent = message;
            });
            pdf.ocrText = ocr.text;
            pdf.ocrLines = ocr.lines;
          } else if (scan) {
            const ocr = await ocrPdfPages(worker, pdf.doc, (message) => {
              statusEl.textContent = message;
            });
            pdf.ocrText = ocr.text;
            pdf.ocrLines = ocr.lines;
            pdf.pageCanvases = ocr.pages;
          }
        } finally {
          await worker.terminate();
        }
      } catch (err) {
        warnEl.hidden = false;
        warnEl.textContent = "图片这次没有识别成文字。表格和正文仍按文字层对照。";
      }
    }
    if (pdf.image || scan) {
      warnEl.hidden = false;
      const kind = pdf.image ? "图片" : "整页图片的 PDF";
      warnEl.textContent = pdf.ocrText
        ? `这份成品是${kind}，已按版面识别。列出少字、多出来的短句，以及同一行费率对不上的地方。识别看错的字请对着原页确认。`
        : "版面没有识别出文字。";
    }
    const result = compare(word, pdf, ocrGroups);
    imageUrls.forEach((url) => URL.revokeObjectURL(url));
    imageUrls = word.images.map((bytes) => URL.createObjectURL(new Blob([bytes])));
    findings = result.findings;
    findings.forEach((row) => {
      if (row.imageId != null && imageUrls[row.imageId]) row.wordImage = imageUrls[row.imageId];
    });
    statusEl.textContent = "正在截取成品上对应的位置…";
    if (pdf.image) await attachImageShots(pdf.image, pdf.ocrLines || [], findings);
    else if (pdf.pageCanvases) await attachCanvasShots(pdf.pageCanvases, pdf.ocrLines || [], findings);
    else await attachPdfShots(pdf.doc, pdf.items, findings);
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
  xml = acceptTrackChanges(xml);
  const lines = [];
  xml.split("</w:p>").forEach((chunk) => {
    const texts = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1]));
    const text = texts.join("").replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
  });
  for (const diagram of zip.file(/^word\/diagrams\/data\d+\.xml$/) || []) {
    const diagramXml = await diagram.async("string");
    const labels = [...diagramXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map((match) => decodeXml(match[1]).replace(/\s+/g, "").trim())
      .filter(Boolean);
    labels.forEach((label) => lines.push(label));
  }
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const rels = relsFile ? await relsFile.async("string") : "";
  const keptIds = new Set([...xml.matchAll(/r:id="(rId\d+)"/g)].map((match) => match[1]));
  const keptCharts = new Set();
  [...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].forEach((match) => {
    if (!keptIds.has(match[1])) return;
    const target = match[2].replace(/^\//, "");
    if (/charts\/chart\d+\.xml$/.test(target)) keptCharts.add("word/" + target.replace(/^word\//, ""));
  });
  const chartGroups = [];
  const seenCharts = new Set();
  for (const chart of zip.file(/^word\/charts\/chart\d+\.xml$/) || []) {
    if (keptCharts.size && !keptCharts.has(chart.name)) continue;
    const chartXml = await chart.async("string");
    extractChartGroups(chartXml).forEach((group) => {
      const key = group.join("\n");
      if (seenCharts.has(key)) return;
      seenCharts.add(key);
      chartGroups.push(group);
    });
  }
  const images = [];
  let hasPortrait = false;
  for (const media of zip.file(/^word\/media\/.+\.(png|jpe?g)$/i) || []) {
    const bytes = await media.async("uint8array");
    const size = imageSize(bytes);
    if (size && size.h >= 320 && size.h > size.w * 1.05 && bytes.byteLength > 30000) hasPortrait = true;
    if (bytes.byteLength >= 20000) images.push(bytes);
  }
  return { text: lines.join("\n"), lines, chartGroups, images, hasPortrait };
}

function imageSize(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length > 24 && u[0] === 0x89 && u[1] === 0x50) {
    return {
      w: u[16] * 16777216 + u[17] * 65536 + u[18] * 256 + u[19],
      h: u[20] * 16777216 + u[21] * 65536 + u[22] * 256 + u[23],
    };
  }
  if (u[0] === 0xff && u[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u.length) {
      if (u[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = u[i + 1];
      const len = u[i + 2] * 256 + u[i + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { h: u[i + 5] * 256 + u[i + 6], w: u[i + 7] * 256 + u[i + 8] };
      }
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const items = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    content.items.forEach((item) => {
      if (!item.str || !item.str.trim()) return;
      items.push({
        str: item.str.trim(),
        x: item.transform[4],
        y: viewport.height - item.transform[5],
        w: item.width || Math.max(8, item.str.length * 6),
        h: item.height || 8,
        page: i,
      });
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    });
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return { text: pages.join("\n"), items, doc: pdf };
}

function createOcrWorker() {
  if (typeof Tesseract === "undefined") throw new Error("识别组件没有加载");
  return Tesseract.createWorker("chi_sim", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
  });
}

async function ocrImages(worker, images, onStatus) {
  const groups = [];
  const texts = [];
  const lines = [];
  for (let i = 0; i < images.length; i++) {
    onStatus(`正在识别稿里的图片（${i + 1}/${images.length}）…`);
    const { data } = await worker.recognize(new Blob([images[i]]));
    const labels = [];
    (data.lines || []).forEach((line) => {
      if (line.confidence < 45) return;
      const text = (line.text || "").trim();
      if (!text) return;
      texts.push(text);
      lines.push({ text, imageId: i });
      extractLabels(text).forEach((label) => {
        if (!labels.includes(label)) labels.push(label);
      });
    });
    if (labels.length >= 2) groups.push({ labels: labels.slice(0, 12), imageId: i });
  }
  return { groups, text: texts.join("\n"), lines };
}

function isImageFile(file) {
  return /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
}

async function readImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("这张图片没有打开"));
    img.src = url;
  });
  return { text: "", items: [], image, imageUrl: url };
}

function takeOcrLines(data, mapBox) {
  const texts = [];
  const lines = [];
  (data.lines || []).forEach((line) => {
    if (line.confidence < 45) return;
    const text = (line.text || "").replace(/\s+/g, "").trim();
    if (!text) return;
    const box = line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
    texts.push(text);
    lines.push({ text, ...mapBox(box) });
  });
  return { texts, lines };
}

async function ocrCanvasBands(worker, canvas, onStatus, label, mapLine) {
  const bandH = 1400;
  const overlap = 80;
  const texts = [];
  const lines = [];
  const step = bandH - overlap;
  const bands = Math.max(1, Math.ceil((canvas.height - overlap) / step));
  for (let i = 0; i < bands; i++) {
    const y = i * step;
    if (y >= canvas.height) break;
    const h = Math.min(bandH, canvas.height - y);
    onStatus(`${label}（${i + 1}/${bands}）…`);
    let target = canvas;
    if (canvas.height > bandH) {
      target = document.createElement("canvas");
      target.width = canvas.width;
      target.height = h;
      target.getContext("2d").drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    }
    const { data } = await worker.recognize(target);
    const got = takeOcrLines(data, (box) => mapLine(box, y));
    texts.push(...got.texts);
    lines.push(...got.lines);
  }
  return { text: texts.join("\n"), lines };
}

async function ocrImageElement(worker, image, onStatus) {
  const maxW = 1400;
  const scale = Math.min(1, maxW / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(image.width * scale));
  canvas.height = Math.max(1, Math.ceil(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return ocrCanvasBands(worker, canvas, onStatus, "正在识别图片", (box, y) => ({
    x: box.x0 / scale,
    y: (y + box.y0) / scale,
    w: Math.max(8, (box.x1 - box.x0) / scale),
    h: Math.max(8, (box.y1 - box.y0) / scale),
  }));
}

async function ocrPdfPages(worker, pdfDoc, onStatus) {
  const texts = [];
  const lines = [];
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1.4, 1600 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    pages.push(canvas);
    const ocr = await ocrCanvasBands(worker, canvas, onStatus, `正在识别成品版面，第 ${i} 页`, (box, y) => ({
      page: i - 1,
      x: box.x0,
      y: y + box.y0,
      w: Math.max(8, box.x1 - box.x0),
      h: Math.max(8, box.y1 - box.y0),
    }));
    texts.push(ocr.text);
    lines.push(...ocr.lines);
  }
  return { text: texts.join("\n"), lines, pages };
}

function showShot(note) {
  return /^(图例|正负号|短标题|标点|数字|这几个字在稿的图片|这句前面|这里少了|句末|成品单独写出|同一句)/.test(note || "");
}

function locateOcrLine(lines, focus) {
  const probe = String(focus || "").replace(/\s+/g, "").slice(0, 10);
  if (probe.length < 4) return null;
  return lines.find((line) => line.text.includes(probe)) || null;
}

function cropSource(source, box) {
  const padX = 28;
  const padY = 16;
  const sx = Math.max(0, Math.floor(box.x - padX));
  const sy = Math.max(0, Math.floor(box.y - padY));
  const sw = Math.min(source.width - sx, Math.ceil(box.w + padX * 2));
  const sh = Math.min(source.height - sy, Math.ceil(box.h + padY * 2));
  if (sw < 8 || sh < 8) return "";
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/jpeg", 0.86);
}

async function attachImageShots(image, lines, rows) {
  rows.forEach((row) => {
    if (!showShot(row.note)) return;
    const hit = locateOcrLine(lines, row.focus);
    if (!hit) return;
    const url = cropSource(image, hit);
    if (url) row.pdfImage = url;
  });
}

async function attachCanvasShots(canvases, lines, rows) {
  rows.forEach((row) => {
    if (!showShot(row.note)) return;
    const hit = locateOcrLine(lines, row.focus);
    const canvas = hit && canvases[hit.page];
    if (!canvas) return;
    const url = cropSource(canvas, hit);
    if (url) row.pdfImage = url;
  });
}

async function attachPdfShots(pdfDoc, items, rows) {
  const cache = new Map();
  for (const row of rows) {
    if (!row.focus || !showShot(row.note)) continue;
    const box = locateCluster(items, row.pdfHints, row.focus);
    if (!box) continue;
    const url = await cropPdf(pdfDoc, cache, box);
    if (url) row.pdfImage = url;
  }
}

async function cropPdf(pdfDoc, cache, box) {
  let entry = cache.get(box.page);
  if (!entry) {
    const page = await pdfDoc.getPage(box.page);
    const scale = 2.2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    entry = { canvas, scale };
    cache.set(box.page, entry);
  }
  const scale = entry.scale;
  const sx = Math.max(0, Math.floor(box.x * scale));
  const sy = Math.max(0, Math.floor(box.y * scale));
  const sw = Math.min(entry.canvas.width - sx, Math.ceil(box.w * scale));
  const sh = Math.min(entry.canvas.height - sy, Math.ceil(box.h * scale));
  if (sw < 8 || sh < 8) return "";
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d").drawImage(entry.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/jpeg", 0.86);
}

function shotHtml(url, caption) {
  if (!url) return "";
  return `<figure class="shot"><img src="${url}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function render() {
  const kinds = ["全部", "正文不一致", "图片不一致", "成品多写", "稿有成品无"];
  const counts = {
    正文不一致: findings.filter((f) => f.kind === "正文不一致").length,
    图片不一致: findings.filter((f) => f.kind === "图片不一致").length,
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
  const cls = { 正文不一致: "body", 图片不一致: "picture", 成品多写: "extra", 稿有成品无: "missing" };
  rowsEl.innerHTML = view
    .map(
      (f) => `<tr class="${cls[f.kind] || ""}">
        <td>${escapeHtml(f.kind)}</td>
        <td>${f.wordHtml}${shotHtml(f.wordImage, "稿里的这张图")}</td>
        <td>${f.pdfHtml}${shotHtml(f.pdfImage, "成品上的位置")}</td>
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

const lightbox = document.querySelector("#lightbox");
document.addEventListener("click", (event) => {
  const thumb = event.target.closest(".shot img");
  if (thumb) {
    lightbox.hidden = false;
    lightbox.innerHTML = `<img src="${thumb.src}" alt="">`;
    return;
  }
  if (!lightbox.hidden) lightbox.hidden = true;
});
