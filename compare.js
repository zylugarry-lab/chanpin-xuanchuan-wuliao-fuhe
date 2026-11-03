function norm(s) {
  return String(s || "")
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
    .replace(/[—–－−]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[％]/g, "%")
    .replace(/[·・]/g, ".")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]");
}

function cleanLabel(s) {
  let text = String(s || "")
    .replace(/^[\s•·●▪►\-\—–－0-9.%]+/, "")
    .replace(/\s+/g, "")
    .trim();
  text = text.replace(/^[一]{1,2}(?=国|中|上|沪)/, "");
  return text;
}

function extractLabels(line) {
  const bits = String(line || "").match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9]{3,30}/g) || [];
  const labels = [];
  bits.forEach((bit) => {
    const cleaned = cleanLabel(bit);
    if (isLabel(cleaned)) labels.push(cleaned);
  });
  return labels;
}

function isLabel(s) {
  const n = norm(cleanLabel(s));
  if (n.length < 2 || n.length > 24) return false;
  if (/[。！？；]/.test(s)) return false;
  const han = (n.match(/[\u4e00-\u9fff]/g) || []).length;
  return han >= 2;
}

function lcsLen(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[0][0];
}

function sim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return (2 * lcsLen(a, b)) / (a.length + b.length);
}

function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function decodeXml(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function worthReporting(a, b, leftover) {
  const x = norm(cleanLabel(a));
  const y = norm(cleanLabel(b));
  if (!x || !y || x === y) return false;
  const bothBenchmark = x.endsWith("基准") && y.endsWith("基准") && sharedPrefix(x, y) < 2;
  if (leftover) return bothBenchmark || sim(x, y) >= 0.72;
  if (Math.abs(x.length - y.length) <= 2) return true;
  if (x.length <= 8 && y.length <= 8 && sim(x, y) >= 0.5) return true;
  return bothBenchmark;
}

function extractChartGroups(xml) {
  const groups = [];
  const blocks = String(xml || "").match(/<c:tx>[\s\S]*?<\/c:tx>/g) || [];
  const names = [];
  blocks.forEach((block) => {
    const values = [...block.matchAll(/<c:v>([^<]*)<\/c:v>/g)].map((m) => decodeXml(m[1]).trim());
    const name = values.find((value) => /[\u4e00-\u9fff]/.test(value) && !value.includes("!"));
    if (name && !names.includes(name)) names.push(name);
  });
  if (names.length >= 2) groups.push(names);
  return groups;
}

function sentences(text) {
  const seen = new Set();
  const out = [];
  String(text || "").split(/[。\n；]/).forEach((raw) => {
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
  const meaningful =
    [...a].some((ch, idx) => aMarks[idx] && /[\u4e00-\u9fff0-9%]/.test(ch)) ||
    [...b].some((ch, idx) => bMarks[idx] && /[\u4e00-\u9fff0-9%]/.test(ch));
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
  return String(s || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function startsIndex(s) {
  return /^(?:中证|上证|沪深|国证|万得)/.test(norm(s));
}

function verticalJoin(items) {
  const shorts = [];
  const longs = [];
  items.forEach((it) => (norm(it.str).length <= 8 ? shorts : longs).push({ ...it }));
  const sorted = shorts.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set();
  const joined = [];
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const parts = [sorted[i]];
    used.add(i);
    let grew = true;
    while (grew && parts.length < 3) {
      grew = false;
      const host = parts[parts.length - 1];
      for (let j = 0; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const other = sorted[j];
        const dy = other.y - host.y;
        if (dy < 3 || dy > 16) continue;
        if (startsIndex(other.str)) continue;
        if (norm(other.str).length > 4 && /[\u4e00-\u9fff]/.test(other.str)) continue;
        const overlap = Math.min(host.x + host.w, other.x + other.w) - Math.max(host.x, other.x);
        const minW = Math.max(1, Math.min(host.w, other.w));
        if (overlap < minW * 0.35 && Math.abs(other.x - host.x) > 10) continue;
        parts.push(other);
        used.add(j);
        grew = true;
        break;
      }
    }
    parts.sort((a, b) => a.y - b.y);
    const top = parts[0];
    const bottom = parts[parts.length - 1];
    const x0 = Math.min(...parts.map((p) => p.x));
    const x1 = Math.max(...parts.map((p) => p.x + p.w));
    joined.push({ str: parts.map((p) => p.str).join(""), x: x0, y: top.y, w: x1 - x0, page: top.page });
    void bottom;
  }
  return joined.concat(longs);
}

function rowGroups(items, minCount) {
  const labels = items.filter((it) => isLabel(it.str));
  const rows = [];
  labels
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((it) => {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= 8);
      if (!row) {
        row = { y: it.y, items: [] };
        rows.push(row);
      } else {
        row.y = (row.y * row.items.length + it.y) / (row.items.length + 1);
      }
      row.items.push(it);
    });
  const groups = [];
  rows.forEach((row) => {
    const cells = row.items.slice().sort((a, b) => a.x - b.x);
    let cur = [];
    let prev = null;
    const flush = () => {
      if (cur.length >= minCount) groups.push(cur.map((c) => cleanLabel(c.str)));
      cur = [];
    };
    cells.forEach((cell) => {
      if (prev && cell.x - (prev.x + prev.w) > 36) flush();
      cur.push(cell);
      prev = cell;
    });
    flush();
  });
  return groups;
}

function columnGroups(items, minCount) {
  const labels = items.filter((it) => isLabel(it.str) && norm(it.str).length <= 18);
  const cols = [];
  labels
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .forEach((it) => {
      let col = cols.find((c) => Math.abs(c.x - it.x) <= 12);
      if (!col) {
        col = { x: it.x, items: [] };
        cols.push(col);
      } else {
        col.x = (col.x * col.items.length + it.x) / (col.items.length + 1);
      }
      col.items.push(it);
    });
  const groups = [];
  cols.forEach((col) => {
    const cells = col.items.slice().sort((a, b) => a.y - b.y);
    let cur = [];
    let prev = null;
    const flush = () => {
      if (cur.length >= minCount) groups.push(cur.map((c) => cleanLabel(c.str)));
      cur = [];
    };
    cells.forEach((cell) => {
      if (prev && cell.y - prev.y > 22) flush();
      cur.push(cell);
      prev = cell;
    });
    flush();
  });
  return groups;
}

function pdfGroups(items) {
  const byPage = new Map();
  items.forEach((it) => {
    const page = it.page || 1;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(it);
  });
  const groups = [];
  byPage.forEach((list) => {
    const joined = verticalJoin(list);
    groups.push(...rowGroups(joined, 3));
    groups.push(...columnGroups(joined, 3));
  });
  return groups;
}

function lineGroups(lines) {
  const groups = [];
  let cur = [];
  const flush = () => {
    const labels = cur.map(cleanLabel).filter(isLabel);
    for (let i = 0; i < labels.length; i += 3) {
      const slice = labels.slice(i, i + 6);
      if (slice.length >= 3) groups.push(slice);
    }
    cur = [];
  };
  lines.forEach((line) => {
    if (isLabel(line)) cur.push(line);
    else flush();
  });
  flush();
  return groups;
}

function assign(word, pdf) {
  const wn = word.map((s) => norm(cleanLabel(s)));
  const pn = pdf.map((s) => norm(cleanLabel(s)));
  const cands = [];
  for (let i = 0; i < wn.length; i++) {
    for (let j = 0; j < pn.length; j++) {
      const s = sim(wn[i], pn[j]);
      const prefix = sharedPrefix(wn[i], pn[j]);
      if (s >= 0.98 || s >= 0.72 || (prefix >= 2 && s >= 0.5)) cands.push({ i, j, s });
    }
  }
  cands.sort((a, b) => b.s - a.s);
  const usedW = new Set();
  const usedP = new Set();
  const pairs = [];
  cands.forEach((c) => {
    if (usedW.has(c.i) || usedP.has(c.j)) return;
    usedW.add(c.i);
    usedP.add(c.j);
    pairs.push(c);
  });
  const strong = pairs.filter((p) => p.s >= 0.85).length;
  if (word.length >= 3 && strong < 2) return null;
  if (strong < 1) return null;
  if (Math.abs(word.length - pdf.length) > 2) return null;
  const reports = [];
  pairs.forEach((p) => {
    if (wn[p.i] !== pn[p.j] && worthReporting(word[p.i], pdf[p.j], false)) {
      reports.push({ word: word[p.i], pdf: pdf[p.j], s: p.s });
    }
  });
  const leftW = word.filter((_, i) => !usedW.has(i));
  const leftP = pdf.filter((_, i) => !usedP.has(i));
  if (leftW.length === 1 && leftP.length === 1 && worthReporting(leftW[0], leftP[0], true)) {
    reports.push({ word: leftW[0], pdf: leftP[0], s: sim(norm(leftW[0]), norm(leftP[0])) });
  }
  if (!reports.length) return null;
  const score = pairs.reduce((sum, p) => sum + p.s, 0) + strong * 2;
  return { score, reports };
}

function sameGroup(word, pdf) {
  if (Math.abs(word.length - pdf.length) > 1) return false;
  const pn = pdf.map((s) => norm(cleanLabel(s)));
  return word.every((s) => pn.includes(norm(cleanLabel(s))));
}

function groupLabels(group) {
  return Array.isArray(group) ? group : group.labels || [];
}

function labelFindings(wordGroups, groups) {
  const found = [];
  wordGroups.forEach((group) => {
    const labels = groupLabels(group);
    const imageId = Array.isArray(group) ? null : group.imageId;
    let best = null;
    groups.forEach((pdfGroup) => {
      const assigned = assign(labels, pdfGroup);
      if (assigned && (!best || assigned.score > best.score)) best = Object.assign({ pdfLabels: pdfGroup }, assigned);
    });
    if (!best) return;
    best.reports.forEach((row) => {
      if (row.s >= 0.98) return;
      found.push({
        word: row.word,
        pdf: row.pdf,
        s: row.s,
        imageId: imageId == null ? null : imageId,
        pdfHints: best.pdfLabels,
      });
    });
  });
  return found;
}

function clusterText(value) {
  return norm(String(value || "").replace(/^[•·●▪►\s]+/, "").trim());
}

function locateCluster(items, hints, focus) {
  const focusN = clusterText(focus || "");
  if (!focusN) return null;
  const wanted = [];
  []
    .concat(hints || [], [focus])
    .forEach((label) => {
      const text = clusterText(label || "");
      if (text.length >= 2 && !wanted.includes(text)) wanted.push(text);
    });
  const byPage = new Map();
  (items || []).forEach((item) => {
    const page = item.page || 1;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(item);
  });
  let best = null;
  byPage.forEach((list, page) => {
    list.forEach((anchor) => {
      const anchorText = clusterText(anchor.str);
      if (!anchorText || anchorText.length > focusN.length + 6) return;
      if (anchorText !== focusN && !anchorText.includes(focusN) && !focusN.includes(anchorText)) return;
      const near = list.filter((item) => Math.abs(item.x - anchor.x) < 240 && Math.abs(item.y - anchor.y) < 90);
      const matched = near.filter((item) => {
        const text = clusterText(item.str);
        return wanted.some((label) => text && text.length <= label.length + 6 && (text === label || text.includes(label) || label.includes(text)));
      });
      const used = matched.length ? matched : [anchor];
      let covered = 0;
      wanted.forEach((label) => {
        if (used.some((item) => {
          const text = clusterText(item.str);
          return text === label || (text && text.length <= label.length + 6 && (text.includes(label) || label.includes(text)));
        })) covered++;
      });
      let top = Infinity;
      let left = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      used.forEach((item) => {
        const height = item.h || 10;
        top = Math.min(top, item.y - height);
        bottom = Math.max(bottom, item.y + 3);
        left = Math.min(left, item.x);
        right = Math.max(right, item.x + (item.w || 20));
      });
      const area = Math.max(1, right - left) * Math.max(1, bottom - top);
      const score = covered * 1000 + (anchorText === focusN ? 20 : 0) - area / 800;
      if (best && score <= best.score) return;
      const pad = 16;
      best = {
        score,
        page,
        x: Math.max(0, left - pad),
        y: Math.max(0, top - pad),
        w: right - left + pad * 2,
        h: bottom - top + pad * 2,
      };
    });
  });
  if (!best) return null;
  if (best.w < 160) {
    best.x = Math.max(0, best.x - (160 - best.w) / 2);
    best.w = 160;
  }
  if (best.h < 76) {
    best.y = Math.max(0, best.y - (76 - best.h));
    best.h = 76;
  }
  return best;
}

function signedPercents(text) {
  const out = [];
  const re = /(?<![0-9.])(?:[+−－-]\d|\d)(?:\.\d+)?%/g;
  let match;
  const source = String(text || "");
  while ((match = re.exec(source))) {
    out.push({ raw: match[0].replace(/[−－]/g, "-"), index: match.index });
  }
  return out;
}

function snippetAt(text, index, len) {
  const source = String(text || "");
  const lines = source.split("\n");
  let cursor = 0;
  let lineNo = 0;
  for (let i = 0; i < lines.length; i++) {
    const next = cursor + lines[i].length + 1;
    if (index < next) {
      lineNo = i;
      break;
    }
    cursor = next;
  }
  const line = lines[lineNo].trim();
  const rel = index - cursor;
  if (line.length > len + 18) {
    let from = Math.max(0, rel - 24);
    const prev = line.slice(0, from);
    const punct = Math.max(prev.lastIndexOf("，"), prev.lastIndexOf(","), prev.lastIndexOf("；"));
    if (punct >= 0 && from - punct < 18) from = punct + 1;
    return line.slice(from, rel + len + 8).replace(/^[，,、:：]+/, "");
  }
  if (line.length > len + 4) return line;
  const near = lines.slice(Math.max(0, lineNo - 4), lineNo + 4);
  const hint = near.find((item) => item !== lines[lineNo] && /基准|收益|上证|中证|沪深/.test(item) && item.trim().length <= 24);
  return hint ? hint.trim() + " / " + line : line;
}

function signFindings(wordText, pdfText) {
  const word = signedPercents(wordText);
  const pdf = signedPercents(pdfText);
  const wordSet = new Set(word.map((n) => n.raw));
  const pdfSet = new Set(pdf.map((n) => n.raw));
  const rows = [];
  function consider(sideToken, otherSet, otherList, fromPdf) {
    if (otherSet.has(sideToken.raw)) return;
    const unsigned = sideToken.raw.replace(/^[+\-]/, "");
    const flipped = sideToken.raw.startsWith("-") ? unsigned : "-" + unsigned;
    if (!otherSet.has(unsigned) && !otherSet.has(flipped) && !otherSet.has("+" + unsigned)) return;
    const other = otherList.find((n) => n.raw === unsigned || n.raw === flipped || n.raw === "+" + unsigned);
    const wordTok = fromPdf ? other : sideToken;
    const pdfTok = fromPdf ? sideToken : other;
    if (!wordTok || !pdfTok) return;
    rows.push({
      word: snippetAt(wordText, wordTok.index, wordTok.raw.length),
      pdf: snippetAt(pdfText, pdfTok.index, pdfTok.raw.length),
      note: "正负号不一致。稿里是 " + wordTok.raw + "，成品是 " + pdfTok.raw + "。",
      focus: pdfTok.raw,
    });
  }
  pdf.forEach((token) => consider(token, wordSet, word, true));
  word.forEach((token) => consider(token, pdfSet, pdf, false));
  return rows;
}

function compare(word, pdf, ocrGroups) {
  const wordText = word.text || "";
  const pdfText = pdf.text || "";
  const wn = norm(wordText);
  const pn = norm(pdfText);
  const findings = [];
  const seen = new Set();

  function push(kind, wordSide, pdfSide, note, wordHtml, pdfHtml, extra) {
    const key = kind + "|" + norm(wordSide) + "|" + norm(pdfSide);
    if (!norm(wordSide) && !norm(pdfSide)) return;
    if (seen.has(key)) {
      if (extra && extra.imageId != null) {
        const prev = findings.find((row) => norm(row.word) === norm(wordSide) && norm(row.pdf) === norm(pdfSide));
        if (prev && prev.imageId == null) prev.imageId = extra.imageId;
      }
      return;
    }
    seen.add(key);
    findings.push({
      kind,
      word: wordSide,
      pdf: pdfSide,
      note,
      wordHtml: wordHtml || escapeHtml(wordSide),
      pdfHtml: pdfHtml || escapeHtml(pdfSide),
      imageId: extra && extra.imageId != null ? extra.imageId : null,
      pdfHints: (extra && extra.pdfHints) || [],
      focus: (extra && extra.focus) || pdfSide,
    });
  }

  signFindings(wordText, pdfText).forEach((row) => {
    push("正文不一致", row.word, row.pdf, row.note, null, null, { focus: row.focus, pdfHints: [row.focus] });
  });

  const groups = []
    .concat(ocrGroups || [])
    .concat(word.chartGroups || [])
    .concat(lineGroups(word.lines || []));
  const pdfSide = pdfGroups(pdf.items || []);
  const openGroups = groups.filter((group) => !pdfSide.some((pdfGroup) => sameGroup(groupLabels(group), pdfGroup)));
  labelFindings(openGroups, pdfSide).forEach((row) => {
    push(
      "正文不一致",
      row.word,
      row.pdf,
      "图例或表头名称不一致。两边挨在一起的一组名称里，这一项对不上。",
      null,
      null,
      { imageId: row.imageId, pdfHints: row.pdfHints, focus: row.pdf },
    );
  });

  const sentenceFindings = [];
  function pushSentence(kind, wordSide, pdfSide, note, wordHtml, pdfHtml) {
    const key = kind + "|" + norm(wordSide) + "|" + norm(pdfSide);
    if (seen.has(key)) return;
    seen.add(key);
    sentenceFindings.push({
      kind,
      word: wordSide,
      pdf: pdfSide,
      note,
      wordHtml: wordHtml || escapeHtml(wordSide),
      pdfHtml: pdfHtml || escapeHtml(pdfSide),
    });
  }

  sentences(wordText).forEach(({ raw, n }) => {
    if (pn.includes(n)) return;
    const cover = coverage(n, pn);
    if (cover >= 0.93) return;
    const win = locate(n, pn);
    const diff = win ? lcsDiff(n, win.slice(0, n.length + 4)) : null;
    if (diff && diff.changed && diff.meaningful && cover >= 0.55) {
      pushSentence(
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
      pushSentence("稿有成品无", raw, "（成品文字层里没有这句）", "稿里有，成品文字层里对不上。转曲标题可能其实印在版面上。");
    }
  });

  sentences(pdfText).forEach(({ raw, n }) => {
    if (wn.includes(n)) return;
    const han = (n.match(/[\u4e00-\u9fff]/g) || []).length;
    if (han < 4) return;
    const cover = coverage(n, wn);
    if (cover >= 0.9) return;
    if (cover < 0.4) {
      pushSentence("成品多写", "（稿里没有这句）", raw, "成品文字层里有，稿里没有。图注和脚注经常落在这里。");
    }
  });

  const numRe = /[+\-−－]?\d+(?:\.\d+)?%|\d{4}[./年]\d{1,2}(?:[./月]\d{1,2}日?)?|\d{6}/g;
  const wordNums = new Set(wordText.match(numRe) || []);
  const pdfNums = new Set(pdfText.match(numRe) || []);
  const both = [...wordNums].filter((n) => pdfNums.has(n));
  both.sort();

  return {
    findings: findings.concat(sentenceFindings).slice(0, 100),
    matched: both.length ? both.slice(0, 40).join("、") : "没有抽出两边都出现的百分比、日期或六位代码。",
    pdfGroupCount: pdfSide.length,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { compare, pdfGroups, verticalJoin, norm, cleanLabel, extractLabels, extractChartGroups, locateCluster };
}
