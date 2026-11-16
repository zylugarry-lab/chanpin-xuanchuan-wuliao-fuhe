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
const wordFiles = [];
const pdfFiles = [];

wordInput.addEventListener("change", () => {
  addFiles([...wordInput.files]);
  wordInput.value = "";
});
pdfInput.addEventListener("change", () => {
  addFiles([...pdfInput.files]);
  pdfInput.value = "";
});
bindDrop(document.querySelector("#word-drop"));
bindDrop(document.querySelector("#pdf-drop"));
document.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  if (event.target.closest(".drop")) return;
  if (![...event.dataTransfer.types].includes("Files")) return;
  event.preventDefault();
  addFiles([...event.dataTransfer.files]);
});
document.querySelector("#word-list").addEventListener("click", (event) => removeFile(event, wordFiles));
document.querySelector("#pdf-list").addEventListener("click", (event) => removeFile(event, pdfFiles));

function bindDrop(zone) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragging");
    addFiles([...event.dataTransfer.files]);
  });
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function addFiles(list) {
  const skipped = [];
  list.forEach((file) => {
    const bucket = /\.docx$/i.test(file.name) ? wordFiles : /\.(pdf|png|jpe?g)$/i.test(file.name) ? pdfFiles : null;
    if (!bucket) {
      skipped.push(file.name);
      return;
    }
    if (bucket.some((item) => fileKey(item) === fileKey(file))) return;
    bucket.push(file);
  });
  if (wordFiles.length === 1 && !nameInput.value) {
    nameInput.value = wordFiles[0].name.replace(/\.docx$/i, "").slice(0, 40);
  }
  renderPicked();
  syncRun();
  if (skipped.length) statusEl.textContent = `这几份没有收：${skipped.join("、")}。请用 docx、PDF、PNG 或 JPG。`;
}

function removeFile(event, bucket) {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  bucket.splice(Number(button.dataset.remove), 1);
  renderPicked();
  syncRun();
}

function renderPicked() {
  wordName.textContent = wordFiles.length ? `已选 ${wordFiles.length} 份 Word` : "选择或拖入 .docx";
  pdfName.textContent = pdfFiles.length ? `已选 ${pdfFiles.length} 份成品` : "选择或拖入 PDF、PNG、JPG";
  document.querySelector("#word-drop").classList.toggle("ready", wordFiles.length > 0);
  document.querySelector("#pdf-drop").classList.toggle("ready", pdfFiles.length > 0);
  paintList("#word-list", wordFiles);
  paintList("#pdf-list", pdfFiles);
}

function paintList(id, files) {
  document.querySelector(id).innerHTML = files
    .map((file, index) => `<li><span>${escapeHtml(file.name)}</span><button type="button" data-remove="${index}">移除</button></li>`)
    .join("");
}

function syncRun() {
  runBtn.disabled = !(wordFiles.length && pdfFiles.length);
}

function fileStem(name) {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[【】\[\]（）()\s._\-—]/g, "")
    .toLowerCase();
}

function nameScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;
  let best = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = i + 3; j <= left.length; j += 1) {
      const part = left.slice(i, j);
      if (right.includes(part)) best = Math.max(best, part.length);
    }
  }
  return best / Math.max(left.length, right.length);
}

function pairMaterials(words, finished) {
  if (words.length === 1) {
    return { pairs: finished.map((pdf) => ({ word: words[0], pdf })), leftoverWords: [], leftoverPdfs: [] };
  }
  if (finished.length === 1) {
    return { pairs: words.map((word) => ({ word, pdf: finished[0] })), leftoverWords: [], leftoverPdfs: [] };
  }
  const used = new Set();
  const pairs = [];
  const leftoverWords = [];
  words.forEach((word) => {
    let best = -1;
    let bestScore = 0;
    finished.forEach((pdf, index) => {
      if (used.has(index)) return;
      const score = nameScore(fileStem(word.name), fileStem(pdf.name));
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0 && bestScore >= 0.34) {
      used.add(best);
      pairs.push({ word, pdf: finished[best] });
    } else leftoverWords.push(word);
  });
  const leftoverPdfs = finished.filter((_, index) => !used.has(index));
  const count = Math.min(leftoverWords.length, leftoverPdfs.length);
  for (let i = 0; i < count; i += 1) pairs.push({ word: leftoverWords[i], pdf: leftoverPdfs[i] });
  return {
    pairs,
    leftoverWords: leftoverWords.slice(count),
    leftoverPdfs: leftoverPdfs.slice(count),
  };
}

function pairTitle(pair, total) {
  if (total === 1 && nameInput.value.trim()) return nameInput.value.trim();
  const word = pair.word.name.replace(/\.docx$/i, "");
  const pdf = pair.pdf.name.replace(/\.(pdf|png|jpe?g)$/i, "");
  const wordStem = fileStem(word);
  const pdfStem = fileStem(pdf);
  if (wordStem && (wordStem === pdfStem || wordStem.includes(pdfStem) || pdfStem.includes(wordStem))) return word.slice(0, 40);
  return `${word.slice(0, 24)} × ${pdf.slice(0, 24)}`;
}

runBtn.addEventListener("click", async () => {
  const planned = pairMaterials(wordFiles, pdfFiles);
  if (!planned.pairs.length) {
    statusEl.textContent = "请同时放入 Word 稿和成品。";
    return;
  }
  runBtn.disabled = true;
  warnEl.hidden = true;
  imageUrls.forEach((url) => URL.revokeObjectURL(url));
  imageUrls = [];
  findings = [];
  const matchedParts = [];
  const warnings = [];
  if (planned.leftoverWords.length || planned.leftoverPdfs.length) {
    const names = [...planned.leftoverWords, ...planned.leftoverPdfs].map((file) => file.name);
    warnings.push(`这几份没有配上对照：${names.join("、")}。`);
  }
  let worker = null;
  try {
    for (let index = 0; index < planned.pairs.length; index += 1) {
      const pair = planned.pairs[index];
      const title = pairTitle(pair, planned.pairs.length);
      statusEl.textContent = `正在对照 ${index + 1}/${planned.pairs.length}：${title}`;
      try {
        const one = await comparePair(pair.word, pair.pdf, title, async () => {
          if (!worker) worker = createOcrWorker();
          return worker;
        });
        one.findings.forEach((row) => {
          row.material = title;
        });
        findings.push(...one.findings);
        if (one.matched) matchedParts.push(planned.pairs.length > 1 ? `${title}：${one.matched}` : one.matched);
        if (one.warning) warnings.push(planned.pairs.length > 1 ? `${title}：${one.warning}` : one.warning);
      } catch (err) {
        warnings.push(`${title}：${err && err.message ? err.message : err}`);
      }
    }
    matchedText = matchedParts.join("\n");
    filter = "全部";
    render();
    resultsEl.hidden = false;
    exportBtn.hidden = findings.length === 0 && !matchedText;
    if (warnings.length) {
      warnEl.hidden = false;
      warnEl.textContent = warnings.join(" ");
    }
    statusEl.textContent = findings.length
      ? `对照完成，${planned.pairs.length} 份物料，${findings.length} 条需要看。`
      : `对照完成，${planned.pairs.length} 份物料都没有发现文字层上的差异。`;
  } catch (err) {
    statusEl.textContent = "对照没有完成：" + (err && err.message ? err.message : err);
  } finally {
    if (worker) {
      try {
        const ready = await worker;
        await ready.terminate();
      } catch (err) {}
    }
    syncRun();
  }
});

async function comparePair(wordFile, pdfFile, title, ensureWorker) {
  const finished = pdfFile;
  const [word, pdf] = await Promise.all([
    readDocx(wordFile),
    isImageFile(finished) ? readImageFile(finished) : readPdf(finished),
  ]);
  const scan = pdf.text.replace(/\s/g, "").length < 40;
  let ocrGroups = [];
  let warning = "";
  if (word.images.length || scan) {
    try {
      const worker = await ensureWorker();
      if (word.images.length) {
        const ocr = await ocrImages(worker, word.images, (message) => {
          statusEl.textContent = `${title}：${message}`;
        });
        ocrGroups = ocr.groups;
        word.ocrText = ocr.text;
        word.ocrLines = ocr.lines;
      }
      if (pdf.image) {
        const ocr = await ocrImageElement(worker, pdf.image, (message) => {
          statusEl.textContent = `${title}：${message}`;
        });
        pdf.ocrText = ocr.text;
        pdf.ocrLines = ocr.lines;
      } else if (scan) {
        const ocr = await ocrPdfPages(worker, pdf.doc, (message) => {
          statusEl.textContent = `${title}：${message}`;
        });
        pdf.ocrText = ocr.text;
        pdf.ocrLines = ocr.lines;
        pdf.pageCanvases = ocr.pages;
      }
    } catch (err) {
      warning = "图片这次没有识别成文字。表格和正文仍按文字层对照。";
    }
  }
  if (pdf.image || scan) {
    const kind = pdf.image ? "图片" : "整页图片的 PDF";
    warning = pdf.ocrText
      ? `这份成品是${kind}，已按版面识别。列出少字、多出来的短句，以及同一行费率对不上的地方。识别看错的字请对着原页确认。`
      : warning || "版面没有识别出文字。";
  }
  const result = compare(word, pdf, ocrGroups);
  const urls = word.images.map((bytes) => URL.createObjectURL(new Blob([bytes])));
  imageUrls.push(...urls);
  result.findings.forEach((row) => {
    if (row.imageId != null && urls[row.imageId]) row.wordImage = urls[row.imageId];
  });
  statusEl.textContent = `${title}：正在截取成品上对应的位置…`;
  if (pdf.image) await attachImageShots(pdf.image, pdf.ocrLines || [], result.findings);
  else if (pdf.pageCanvases) await attachCanvasShots(pdf.pageCanvases, pdf.ocrLines || [], result.findings);
  else await attachPdfShots(pdf.doc, pdf.items, result.findings);
  if (pdf.imageUrl) URL.revokeObjectURL(pdf.imageUrl);
  return { findings: result.findings, matched: result.matched, warning };
}

exportBtn.addEventListener("click", () => {
  const header = ["物料", "类别", "Word 稿", "PDF 成品", "说明", "复核意见"];
  const lines = [header.join(",")];
  findings.forEach((row) => {
    lines.push(
      [row.material || nameInput.value.trim() || "未命名物料", row.kind, row.word, row.pdf, row.note, ""]
        .map(csv)
        .join(","),
    );
  });
  if (matchedText) {
    const material = nameInput.value.trim() || "未命名物料";
    lines.push([material, "已对齐", matchedText, matchedText, "两边都有这些数字或代码", ""].map(csv).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const downloadName = findings.length > 1 && new Set(findings.map((row) => row.material)).size > 1
    ? "物料复核-多份对照"
    : (findings[0]?.material || nameInput.value.trim() || "物料复核");
  a.download = downloadName + "-对照.csv";
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
    const portrait = size && size.h >= 320 && size.h > size.w * 1.05 && bytes.byteLength > 30000;
    if (portrait) hasPortrait = true;
    if (bytes.byteLength >= 20000 && !portrait) images.push(bytes);
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
  }).then(async (worker) => {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    return worker;
  });
}

async function ocrImages(worker, images, onStatus) {
  const groups = [];
  const texts = [];
  const lines = [];
  for (let i = 0; i < images.length; i++) {
    onStatus(`正在识别稿里的图片（${i + 1}/${images.length}）…`);
    const { data } = await worker.recognize(await shrinkForOcr(images[i]));
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

function mostlyBlank(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const stepX = Math.max(1, Math.floor(canvas.width / 36));
  const stepY = Math.max(1, Math.floor(canvas.height / 20));
  let ink = 0;
  let seen = 0;
  for (let y = 0; y < canvas.height; y += stepY) {
    for (let x = 0; x < canvas.width; x += stepX) {
      const i = (y * canvas.width + x) * 4;
      if (data[i] + data[i + 1] + data[i + 2] < 700) ink += 1;
      seen += 1;
    }
  }
  return seen > 0 && ink / seen < 0.012;
}

async function shrinkForOcr(bytes) {
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("稿里的图片没有打开"));
      img.src = url;
    });
    const maxW = 1000;
    const scale = Math.min(1, maxW / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(image.width * scale));
    canvas.height = Math.max(1, Math.ceil(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ocrCanvasBands(worker, canvas, onStatus, label, mapLine) {
  const bandH = 900;
  const overlap = 40;
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
    if (mostlyBlank(target)) continue;
    const { data } = await worker.recognize(target);
    const got = takeOcrLines(data, (box) => mapLine(box, y));
    texts.push(...got.texts);
    lines.push(...got.lines);
  }
  return { text: texts.join("\n"), lines };
}

async function ocrImageElement(worker, image, onStatus) {
  const maxW = 1000;
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
    const viewport = page.getViewport({ scale: Math.min(1.05, 1100 / base.width) });
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
  const materials = new Set(findings.map((row) => row.material).filter(Boolean));
  let lastMaterial = "";
  rowsEl.innerHTML = view
    .map((f) => {
      const group = materials.size > 1 && f.material !== lastMaterial
        ? `<tr class="group"><td colspan="5">${escapeHtml(f.material)}</td></tr>`
        : "";
      lastMaterial = f.material;
      return `${group}<tr class="${cls[f.kind] || ""}">
        <td>${escapeHtml(f.kind)}</td>
        <td>${f.wordHtml}${shotHtml(f.wordImage, "稿里的这张图")}</td>
        <td>${f.pdfHtml}${shotHtml(f.pdfImage, "成品上的位置")}</td>
        <td>${escapeHtml(f.note)}</td>
        <td><select><option value="">待确认</option><option>按稿修改</option><option>按成品保留</option><option>不是问题</option></select></td>
      </tr>`;
    })
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
