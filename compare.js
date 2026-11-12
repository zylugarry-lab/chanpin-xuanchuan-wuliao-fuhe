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

function acceptTrackChanges(xml) {
  let text = String(xml || "");
  text = text.replace(/<w:del\b[^>]*\/>/g, "");
  let prev;
  do {
    prev = text;
    text = text.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  } while (text !== prev);
  return text;
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
  if (m > 260 || n > 280) return null;
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
  const meaningfulChar = /[\u4e00-\u9fff0-9%.,;:，。；：、✖×xX]/;
  const meaningful =
    [...a].some((ch, idx) => aMarks[idx] && meaningfulChar.test(ch)) ||
    [...b].some((ch, idx) => bMarks[idx] && meaningfulChar.test(ch));
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

function strictText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[：]/g, ":");
}

function markedCount(text, marks) {
  let count = 0;
  const meaningfulChar = /[\u4e00-\u9fff0-9%.,;:，。；：、✖×xX]/;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] && meaningfulChar.test(text[i])) count++;
  }
  return count;
}

function punctBare(value) {
  return norm(value).replace(/[,.:;]/g, "");
}

function punctuationAfterOwnHeading(sentence, marks, pdfText) {
  const content = /[\u4e00-\u9fff0-9%✖×xX]/;
  let first = -1;
  for (let i = 0; i < sentence.length; i++) {
    if (!marks[i]) continue;
    if (content.test(sentence[i])) return false;
    if (first < 0) first = i;
  }
  if (first < 0 || first > 12) return false;
  const prefix = sentence.slice(0, first);
  if (prefix.length < 2) return false;
  return String(pdfText).split(/\n/).some((line) => {
    const folded = norm(line);
    return folded === prefix || folded === prefix.replace(/[.:;]$/, "");
  });
}

function headingSplitOnly(sentence, pdfText, pdfNorm) {
  const cut = sentence.search(/[,.:;]/);
  if (cut < 2 || cut > 12) return false;
  const prefix = sentence.slice(0, cut);
  const rest = punctBare(sentence.slice(cut + 1));
  if (rest.length < 8 || !pdfNorm.includes(rest.slice(0, Math.min(12, rest.length)))) return false;
  return String(pdfText).split(/\n/).some((line) => norm(line) === prefix);
}

function yearMonthOnly(text) {
  const folded = norm(text);
  const match = folded.match(/(\d{4})(?:年|\.)(\d{1,2})月?/);
  if (!match) return "";
  const after = folded.slice(match.index + match[0].length);
  if (/^\d/.test(after)) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function sameYearMonthAlreadyInWord(pdfSentence, wordText) {
  const key = yearMonthOnly(pdfSentence);
  if (!key) return false;
  const [year, month] = key.split("-");
  const forms = [`${year}.${Number(month)}`, `${year}.${month}`, `${year}年${Number(month)}月`];
  const foldedWord = norm(wordText);
  if (!forms.some((form) => foldedWord.includes(norm(form)))) return false;
  const rest = norm(pdfSentence).replace(/(\d{4})(?:年|\.)(\d{1,2})月?/g, "").replace(/[^一-鿿]/g, "");
  const wordHan = foldedWord.replace(/[^一-鿿]/g, "");
  return rest.length >= 4 && wordHan.includes(rest);
}

function bestWindow(n, full) {
  const width = Math.min(8, n.length);
  let best = null;
  for (let i = 0; i + width <= n.length; i += 4) {
    const probe = n.slice(i, i + width);
    let from = 0;
    let j = -1;
    while ((j = full.indexOf(probe, from)) >= 0) {
      const start = Math.max(0, j - i);
      const win = full.slice(start, start + n.length + 6);
      const diff = lcsDiff(n, win);
      if (diff && !diff.changed) return { diff, right: win, markCount: 0, same: 1 };
      if (diff && diff.meaningful) {
        const markCount = markedCount(n, diff.aMarks);
        const same = n.length ? (n.length - markCount) / n.length : 0;
        if (!best || markCount < best.markCount) best = { diff, right: win, markCount, same };
      }
      from = j + width;
      if (from >= full.length) break;
    }
  }
  return best;
}

function edgeLabelOnly(n, marks, full) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < n.length; i++) {
    if (marks[i] && /[\u4e00-\u9fff]/.test(n[i])) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return false;
  const atStart = first <= 8 && last < 10;
  const atEnd = first >= n.length - 10;
  if (!atStart && !atEnd) return false;
  const interior = atStart ? n.slice(last + 1) : n.slice(0, first);
  const moved = atStart ? n.slice(0, last + 1) : n.slice(first);
  return interior.length >= 8 && full.includes(interior) && full.includes(moved);
}

function dateKey(text) {
  const m = norm(text).match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function blobHasDate(blob, key) {
  if (!key) return false;
  const [year, month, day] = key.split("-");
  const forms = [
    `${year}年${Number(month)}月${Number(day)}`,
    `${year}/${month}/${day}`,
    `${year}/${Number(month)}/${Number(day)}`,
    `${year}.${month}.${day}`,
    `${year}.${Number(month)}.${Number(day)}`,
    `${year}-${month}-${day}`,
  ];
  const folded = norm(blob);
  return forms.some((form) => folded.includes(norm(form)));
}

function parseTier(text) {
  const t = String(text || "").replace(/\s+/g, "").replace(/＜/g, "<").replace(/＞/g, ">");
  let match = t.match(/(\d+)[天日]≤?N[<≤](\d+)[天日]/);
  if (match) return { lo: Number(match[1]), hi: Number(match[2]), unit: t.includes("天") ? "天" : "日", raw: t };
  match = t.match(/N[<≤](\d+)[天日]/);
  if (match) return { lo: 0, hi: Number(match[1]), unit: t.includes("天") ? "天" : "日", raw: t };
  match = t.match(/N[>≥](\d+)[天日]/);
  if (match) return { lo: Number(match[1]), hi: 99999, unit: t.includes("天") ? "天" : "日", raw: t };
  return null;
}

function tierKey(tier) {
  return tier.lo + "-" + tier.hi;
}

function percentList(text) {
  return String(text || "").match(/\d+(?:\.\d+)?%/g) || [];
}

function holdingTiers(wordLines, positioned) {
  const wordTiers = [];
  const lines = wordLines || [];
  for (let i = 0; i < lines.length; i++) {
    const tier = parseTier(lines[i]);
    if (!tier) continue;
    const rates = percentList(lines[i]);
    for (let j = i + 1; j < lines.length; j++) {
      const next = String(lines[j] || "").trim();
      if (!next || parseTier(next)) break;
      if (!/^\d+(?:\.\d+)?%$/.test(next.replace(/\s+/g, ""))) break;
      rates.push(next.replace(/\s+/g, ""));
    }
    wordTiers.push({ tier, rates });
  }
  const pdfTiers = [];
  (positioned || []).forEach((item, index) => {
    const text = item.str || item.text || "";
    const tier = parseTier(text);
    if (!tier) return;
    const rates = percentList(text);
    const y = Number(item.y);
    const x = Number(item.x);
    if (Number.isFinite(y) && Number.isFinite(x)) {
      positioned.forEach((other) => {
        const otherText = String(other.str || other.text || "").replace(/\s+/g, "");
        if (!/^\d+(?:\.\d+)?%$/.test(otherText)) return;
        if (!Number.isFinite(Number(other.y)) || !Number.isFinite(Number(other.x))) return;
        if (Math.abs(Number(other.y) - y) > Math.max(14, Number(item.h) || 12)) return;
        if (Number(other.x) <= x) return;
        rates.push(otherText);
      });
    }
    pdfTiers.push({ tier, rates, index });
  });
  return { wordTiers, pdfTiers };
}

function shortLabelsFromLines(lines) {
  const out = [];
  const seen = new Set();
  (lines || []).forEach((line) => {
    const text = cleanLabel(line);
    const n = norm(text);
    if (!isLabel(text) || n.length < 2 || n.length > 16 || seen.has(n)) return;
    seen.add(n);
    out.push(text);
  });
  return out;
}

function shortLabelsFromItems(items) {
  const byPage = new Map();
  (items || []).forEach((item) => {
    const page = item.page || 1;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(item);
  });
  const out = [];
  const seen = new Set();
  byPage.forEach((list) => {
    verticalJoin(list).forEach((item) => {
      const text = cleanLabel(item.str);
      const n = norm(text);
      if (!isLabel(text) || n.length < 2 || n.length > 16 || seen.has(n)) return;
      const isolated = !list.some((other) => {
        const sameSpot = Math.abs(other.y - item.y) < 1 && Math.abs(other.x - item.x) < 1 && norm(other.str) === n;
        if (sameSpot) return false;
        return Math.abs(other.y - item.y) < 18 && Math.abs(other.x - item.x) < 70;
      });
      seen.add(n);
      out.push({ text, isolated });
    });
  });
  return out;
}

function onlyInsideLongerWord(blob, label) {
  const n = norm(label);
  if (!n || !blob.includes(n)) return false;
  let index = 0;
  let inside = false;
  let alone = false;
  while ((index = blob.indexOf(n, index)) >= 0) {
    const next = blob[index + n.length] || "";
    if (/[\u4e00-\u9fff]/.test(next)) inside = true;
    else alone = true;
    index += n.length;
  }
  return inside && !alone;
}

function ocrFold(value) {
  return norm(value).replace(/[〈]/g, "(").replace(/[〉]/g, ")");
}

function alignFold(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[（(〈]/g, "(")
    .replace(/[）)〉]/g, ")");
}

function hanSlots(folded) {
  const hanChars = [];
  const gaps = [];
  let buf = "";
  for (const ch of folded) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      gaps.push(buf);
      hanChars.push(ch);
      buf = "";
    } else buf += ch;
  }
  gaps.push(buf);
  return { hans: hanChars.join(""), gaps, hanChars };
}

function gapMatter(gap) {
  return gap.replace(/[()]/g, "");
}

function rebuild(slots, from, to) {
  let text = "";
  for (let i = from; i < to; i++) text += slots.gaps[i] + slots.hanChars[i];
  text += slots.gaps[to] || "";
  return text;
}

function pictureEdits(entries, pdfBlob, allowHan) {
  const pdfSlots = hanSlots(alignFold(pdfBlob));
  if (pdfSlots.hans.length < 8) return [];
  const lines = [];
  (entries || []).forEach((entry) => {
    const text = String(entry.text || "").replace(/\s+/g, "").trim();
    if (text.length >= 8) lines.push({ text, imageId: entry.imageId });
  });
  const chunks = [];
  for (let i = 0; i < lines.length; i++) {
    chunks.push(lines[i]);
    const next = lines[i + 1];
    if (next && next.imageId === lines[i].imageId && lines[i].text.length + next.text.length <= 90) {
      chunks.push({ text: lines[i].text + next.text, imageId: lines[i].imageId });
    }
    lines[i].text.split(/(?<=[，。；])/).forEach((part) => {
      if (part.length >= 8) chunks.push({ text: part, imageId: lines[i].imageId });
    });
    for (let start = 0; start < lines[i].text.length; start += 8) {
      const part = lines[i].text.slice(start, start + 18);
      if (part.length >= 8) chunks.push({ text: part, imageId: lines[i].imageId });
    }
  }
  chunks.sort((a, b) => b.text.length - a.text.length);
  const rows = [];
  chunks.forEach((chunk) => {
    const wordSlots = hanSlots(alignFold(chunk.text));
    if (wordSlots.hans.length < 6 || wordSlots.hans.length > 80) return;
    if (rows.some((row) => row.word.includes(chunk.text))) return;
    let at = pdfSlots.hans.indexOf(wordSlots.hans);
    let wordWindow = "";
    let pdfWindow = "";
    let hanDiff = false;
    let otherDiff = false;
    if (at >= 0) {
      let best = null;
      while (at >= 0) {
        const diffs = [];
        for (let i = 0; i <= wordSlots.hans.length; i++) {
          const wg = gapMatter(wordSlots.gaps[i]);
          const pg = gapMatter(pdfSlots.gaps[at + i] || "");
          if (i === 0 || (i === wordSlots.hans.length && !wg)) continue;
          if (wg === pg) continue;
          if (i === wordSlots.hans.length && pg.startsWith(wg)) continue;
          diffs.push(i);
        }
        if (!diffs.length) {
          best = null;
          break;
        }
        if (!best || diffs.length < best.diffs.length) best = { at, diffs };
        at = pdfSlots.hans.indexOf(wordSlots.hans, at + 1);
      }
      if (!best) return;
      otherDiff = true;
      const diffs = best.diffs;
      at = best.at;
      const center = Math.min(diffs[0], wordSlots.hans.length - 1);
      const from = Math.max(0, center - 6);
      const to = Math.min(wordSlots.hans.length, center + 7);
      let pdfTo = at + to;
      if (diffs.includes(wordSlots.hans.length)) pdfTo = Math.min(pdfSlots.hans.length, pdfTo + 2);
      wordWindow = rebuild(wordSlots, from, to);
      pdfWindow = rebuild(
        { hanChars: pdfSlots.hanChars, gaps: pdfSlots.gaps },
        at + from,
        pdfTo,
      );
      if (pdfTo > at + to) hanDiff = true;
    } else if (allowHan) {
      let anchorAt = -1;
      const anchor = wordSlots.hans.slice(0, Math.min(6, wordSlots.hans.length));
      anchorAt = pdfSlots.hans.indexOf(anchor);
      if (anchorAt < 0) {
        const mid = wordSlots.hans.slice(4, 10);
        anchorAt = mid.length >= 4 ? pdfSlots.hans.indexOf(mid) - 4 : -1;
      }
      if (anchorAt < 0) return;
      const from = Math.max(0, anchorAt - 1);
      const to = Math.min(pdfSlots.hans.length, anchorAt + wordSlots.hans.length + 3);
      const pdfWin = {
        hans: pdfSlots.hans.slice(from, to),
        hanChars: pdfSlots.hanChars.slice(from, to),
        gaps: pdfSlots.gaps.slice(from, to + 1),
      };
      const diff = lcsDiff(wordSlots.hans, pdfWin.hans);
      if (!diff || !diff.meaningful) return;
      const hanMarks = markedCount(wordSlots.hans, diff.aMarks) + markedCount(pdfWin.hans, diff.bMarks);
      if (hanMarks < 1 || hanMarks > 2) return;
      hanDiff = true;
      wordWindow = rebuild(wordSlots, 0, wordSlots.hans.length);
      pdfWindow = rebuild(pdfWin, 0, pdfWin.hanChars.length);
    } else return;
    if (!wordWindow || !pdfWindow || alignFold(wordWindow) === alignFold(pdfWindow)) return;
    if (rows.some((row) => row.word.includes(wordWindow) || wordWindow.includes(row.word))) return;
    const nums = (value) => (String(value).match(/\d+/g) || []).join(",");
    const puncts = (value) => (ocrFold(value).match(/[,.;]/g) || []).join("");
    const digit = nums(wordWindow) !== nums(pdfWindow);
    const punct = puncts(wordWindow) !== puncts(pdfWindow);
    let note = "标点不一致。";
    if (hanDiff) note = "标点或个别字不一致。";
    else if (digit && punct) note = "标点或数字不一致。";
    else if (digit) note = "数字不一致。";
    else if (!punct && !otherDiff) return;
    rows.push({
      word: wordWindow.slice(0, 90),
      pdf: pdfWindow.slice(0, 90),
      note,
      imageId: chunk.imageId,
      focus: pdfWindow.slice(0, 12),
    });
  });
  return rows;
}

function compare(word, pdf, ocrGroups) {
  const wordText = word.text || "";
  const pdfText = pdf.text || "";
  const ocrText = word.ocrText || "";
  const pdfOcr = pdf.ocrText || "";
  const scan = norm(pdfText).length < 40 && norm(pdfOcr).length >= 40;
  const wn = norm(wordText);
  const pn = norm(pdfText);
  const wnWithOcr = norm(wordText + "\n" + ocrText);
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

  const wordShort = shortLabelsFromLines([].concat(word.lines || [], ocrText.split("\n")));
  const pdfShort = shortLabelsFromItems(pdf.items || []);
  wordShort.forEach((label) => {
    const n = norm(label);
    if (pn.includes(n)) return;
    let best = null;
    pdfShort.forEach((item) => {
      const score = sim(n, norm(item.text));
      if (!best || score > best.score) best = { text: item.text, score };
    });
    if (!best || best.score < 0.8 || best.score >= 0.98 || Math.abs(norm(best.text).length - n.length) > 4) return;
    const left = n.length >= norm(best.text).length ? n : norm(best.text);
    const right = n.length >= norm(best.text).length ? norm(best.text) : n;
    const rest = left.includes(right) ? left.replace(right, "") : left;
    if (!/[\u4e00-\u9fff0-9]/.test(rest)) return;
    push(
      "正文不一致",
      label,
      best.text,
      "短标题不一致。稿和成品各自单独写着这几个字，其中有改动。",
      null,
      null,
      { focus: best.text, pdfHints: [best.text] },
    );
  });
  pdfShort.forEach((item) => {
    const n = norm(item.text);
    if (n.length < 2 || n.length > 4 || !item.isolated) return;
    if (wordShort.some((label) => norm(label) === n)) return;
    if (!onlyInsideLongerWord(wnWithOcr, item.text)) return;
    push(
      "成品多写",
      "（稿里这几个字只出现在更长的词里）",
      item.text,
      "成品单独写出了这个短标签。",
      null,
      null,
      { focus: item.text, pdfHints: [item.text] },
    );
  });
  (ocrGroups || []).forEach((group) => {
    if (scan) return;
    const labels = groupLabels(group);
    labels.forEach((label) => {
      const n = norm(label);
      if (n.length < 4 || pn.includes(n)) return;
      let hit = 0;
      const total = n.length - 3;
      for (let i = 0; i < total; i++) {
        if (pn.includes(n.slice(i, i + 4))) hit++;
      }
      if (total > 0 && hit / total >= 0.34) return;
      push(
        "图片不一致",
        label,
        "（成品文字层里没有这几个字）",
        "这几个字在稿的图片上，成品文字层里没有。",
        null,
        null,
        { imageId: group.imageId, focus: label, pdfHints: [label] },
      );
    });
  });

  const pdfStrict = strictText(pdfText);
  sentences(wordText).forEach(({ raw, n }) => {
    if (!pn.includes(n)) return;
    if (pdfStrict.includes(strictText(raw))) return;
    push("正文不一致", raw, "（同一句里标点不同）", "标点不一致。字对得上，句号、逗号或分号对不上。");
  });

  const pdfLines = String(pdfText).replace(/[ \t\u3000]+/g, "");
  const wordLines = String(wordText).replace(/[ \t\u3000]+/g, "");
  const ownLine = (extra) => (word.lines || []).some((line) => norm(line) === norm(extra));
  wordText.split(/[。\n；]/).forEach((raw) => {
    const probe = raw.replace(/[ \t\u3000]+/g, "").trim();
    if (probe.length < 6 || probe.length > 40) return;
    const atWord = wordLines.indexOf(probe);
    if (atWord < 0) return;
    const follow = wordLines.slice(atWord + probe.length, atWord + probe.length + 4);
    if (follow.length < 2) return;
    let from = 0;
    let index = -1;
    let bare = false;
    let extraHit = "";
    while ((index = pdfLines.indexOf(probe, from)) >= 0) {
      const gotFollow = pdfLines.slice(index + probe.length, index + probe.length + follow.length);
      if (gotFollow !== follow) {
        from = index + probe.length;
        continue;
      }
      const lineStart = pdfLines.lastIndexOf("\n", index - 1) + 1;
      let start = index;
      while (start > lineStart && index - start < 4 && /[\u4e00-\u9fff]/.test(pdfLines[start - 1])) start--;
      const extra = pdfLines.slice(start, index);
      const prev = start === lineStart ? "\n" : pdfLines[start - 1];
      const boundary = start === lineStart || /[。.;；,，:：、（(]/.test(prev);
      const wordPrefix = wordLines.slice(Math.max(0, atWord - extra.length), atWord);
      if (!extra || !boundary || ownLine(extra) || wordPrefix === extra) bare = true;
      else if (!extraHit) extraHit = extra;
      from = index + probe.length;
    }
    if (bare || !extraHit) return;
    push(
      "正文不一致",
      probe.slice(0, 40),
      extraHit + probe.slice(0, 24),
      "这句前面多了「" + extraHit + "」。",
      null,
      null,
      { focus: extraHit, pdfHints: [extraHit] },
    );
  });

  wordText.split("\n").forEach((line) => {
    const matched = line.trim().match(/(.{8,18})([。；])\s*$/);
    if (!matched) return;
    const tail = matched[1].replace(/[ \t\u3000]+/g, "");
    const punct = matched[2];
    const expected = punct === "。" ? /[。.]/ : /[；;]/;
    const hits = [];
    pdfText.split("\n").forEach((pdfLine) => {
      const text = pdfLine.replace(/[ \t\u3000]+/g, "");
      const at = text.lastIndexOf(tail);
      if (at < 0) return;
      if (text.slice(at + tail.length + 1).replace(/\s/g, "")) return;
      hits.push(text[at + tail.length] || "");
    });
    if (!hits.length || hits.some((ch) => expected.test(ch))) return;
    const other = hits.find((ch) => /[。.;；]/.test(ch));
    if (!other) return;
    push(
      "正文不一致",
      tail.slice(-8) + punct,
      tail.slice(-8) + other,
      "句末标点不一致。",
      null,
      null,
      { focus: tail.slice(-6), pdfHints: [tail.slice(-6)] },
    );
  });

  const ending = /([^。；\n]{6,80})([。；])/g;
  let endingMatch;
  while ((endingMatch = ending.exec(wordText))) {
    const clause = strictText(endingMatch[1]).slice(-12);
    const punct = endingMatch[2];
    if (clause.length < 6) continue;
    const at = pdfStrict.indexOf(clause);
    if (at < 0) continue;
    const next = pdfStrict[at + clause.length] || "";
    const expected = punct === "。" ? /[。.]/ : /[；;]/;
    if (expected.test(next)) continue;
    const after = strictText(wordText.slice(endingMatch.index + endingMatch[0].length)).slice(0, 4);
    const swapped = /[。.;；]/.test(next) && after && pdfStrict.startsWith(after, at + clause.length + 1);
    const omitted = /[\u4e00-\u9fff]/.test(next) && after && pdfStrict.startsWith(after, at + clause.length);
    if (!swapped && !omitted) continue;
    push(
      "正文不一致",
      clause.slice(-8) + punct,
      clause.slice(-8) + (next || after),
      omitted ? "这里少了句末的" + punct + "。" : "句末标点不一致。",
      null,
      null,
      { focus: clause.slice(-6), pdfHints: [clause.slice(-6)] },
    );
  }

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

  const pairedPdf = new Set();
  const pdfSentenceList = scan ? [] : sentences(pdfText);
  sentences(wordText).forEach((item) => {
    let raw = item.raw;
    let n = item.n;
    if (/^[nu][\u4e00-\u9fff]/.test(n) && pn.includes(n.slice(1, 5))) {
      raw = String(raw).replace(/^\s*[nu]/, "");
      n = n.slice(1);
    }
    if (pn.includes(n)) return;
    if (headingSplitOnly(n, pdfText, pn)) return;
    const bare = punctBare(n);
    const pair = pdfSentenceList.find((item) => punctBare(item.n) === bare && item.n !== n);
    if (pair && bare.length >= 8) {
      pairedPdf.add(pair.n);
      pushSentence("正文不一致", raw, pair.raw, "标点不一致。字对得上，冒号、逗号或分号对不上。");
      return;
    }
    const cover = coverage(n, pn);
    const best = bestWindow(n, pn);
    if (best && best.markCount === 0) return;
    if (best && best.same >= 0.82 && best.markCount >= 1 && best.markCount <= 12) {
      if (edgeLabelOnly(n, best.diff.aMarks, pn)) return;
      if (punctuationAfterOwnHeading(n, best.diff.aMarks, pdfText)) return;
      pushSentence(
        "正文不一致",
        raw,
        best.right,
        "同一句里有字不一样，标出的是不同的地方。",
        paint(n, best.diff.aMarks),
        paint(best.right.slice(0, best.diff.bMarks.length), best.diff.bMarks),
      );
      return;
    }
    if (cover < 0.45) {
      if (scan) return;
      const core = n.replace(/[-—–_=|·•]/g, "");
      if (core.length >= 2 && pn.includes(core)) return;
      const logo = raw.replace(/\s/g, "").replace(/公司LOGO|固收品牌LOGO|指享增强LOGO|品牌LOGO|广告|\|/g, "");
      if (logo.length === 0) return;
      if (blobHasDate(pdfText + "\n" + pdfOcr, dateKey(raw))) return;
      if (/[附配]照片/.test(raw)) {
        const core = n.replace(/[（(]?[附配]照片[)）]?/g, "");
        if (core.length < 4 || pn.includes(core)) return;
      }
      pushSentence("稿有成品无", raw, "（成品文字层里没有这句）", "稿里有，成品文字层里对不上。转曲标题可能其实印在版面上。");
    }
  });

  pdfSentenceList.forEach(({ raw, n }) => {
    if (pairedPdf.has(n) || wnWithOcr.includes(n) || wnWithOcr.includes(punctBare(n))) return;
    const han = (n.match(/[\u4e00-\u9fff]/g) || []).length;
    if (han < 4) return;
    const cover = coverage(n, wnWithOcr);
    if (cover >= 0.9) return;
    if (cover < 0.4) {
      const already = findings.some((item) => {
        const other = norm(item.pdf);
        return other.length >= 6 && (other.includes(n) || n.includes(other));
      });
      if (already) return;
      if (sameYearMonthAlreadyInWord(n, wordText)) return;
      const ocrLabels = (ocrText.match(/[\u4e00-\u9fff]{4,}/g) || []).map((label) => norm(label));
      const shared = ocrLabels.filter((label) => n.includes(label)).length;
      if (shared >= 2) return;
      pushSentence("成品多写", "（稿里没有这句）", raw, "成品文字层里有，稿里没有。图注和脚注经常落在这里。");
    }
  });

  if (scan && norm(pdfOcr).length >= 40) {
    const on = norm(pdfOcr);
    const reported = [];
    let scanRows = 0;
    const pieces = [];
    sentences(wordText).forEach(({ raw, n }) => {
      if (n.length <= 90) {
        pieces.push({ raw, n });
        return;
      }
      for (let i = 0; i < n.length; i += 40) {
        const part = n.slice(i, i + 80);
        if (part.length >= 12) pieces.push({ raw: part, n: part });
      }
    });
    pieces.forEach(({ raw, n }) => {
      if (scanRows >= 40) return;
      if (on.includes(n)) return;
      const cover = coverage(n, on);
      if (cover < 0.2) return;
      const width = Math.min(8, n.length);
      let best = null;
      for (let i = 0; i + width <= n.length; i += 4) {
        const probe = n.slice(i, i + width);
        let from = 0;
        let j = -1;
        while ((j = on.indexOf(probe, from)) >= 0) {
          const start = Math.max(0, j - i);
          const win = on.slice(start, start + n.length + 6);
          const diff = lcsDiff(n, win);
          if (diff && diff.changed && diff.meaningful) {
            const markCount = diff.aMarks.filter(Boolean).length;
            const same = (n.length - markCount) / n.length;
            if (same >= 0.82 && (!best || markCount < best.markCount)) {
              best = { diff, right: win, markCount, same };
            }
          }
          from = j + width;
          if (from >= on.length) break;
        }
      }
      if (!best) return;
      if (cover < 0.55 && (best.same < 0.88 || best.markCount > 4)) return;
      const diff = best.diff;
      const right = best.right;
      const hanDigit = /[\u4e00-\u9fff0-9]/;
      let marks = 0;
      let anchor = "";
      for (let i = 0; i < n.length; i++) {
        if (diff.aMarks[i] && hanDigit.test(n[i])) marks++;
        if (!diff.aMarks[i] && /[\u4e00-\u9fff]/.test(n[i])) {
          anchor += n[i];
          if (anchor.length > 8) anchor = anchor.slice(-8);
        } else if (anchor.length >= 4 && diff.aMarks[i]) {
          break;
        } else if (diff.aMarks[i]) anchor = "";
      }
      if (marks < 1 || marks > 8) return;
      if (edgeLabelOnly(n, diff.aMarks, on)) return;
      if (anchor.length < 4) anchor = n.slice(0, 8);
      if (reported.some((item) => item.includes(anchor) || anchor.includes(item))) return;
      reported.push(anchor);
      scanRows++;
      push(
        "正文不一致",
        raw.slice(0, 90),
        right.slice(0, 90),
        "同一句里有字不一样。",
        paint(n, diff.aMarks),
        paint(right.slice(0, diff.bMarks.length), diff.bMarks),
        { focus: anchor, pdfHints: [anchor] },
      );
    });
  }

  const picturePdf = scan ? pdfOcr : pdfText;
  const imageEntries = word.ocrLines && word.ocrLines.length
    ? word.ocrLines
    : ocrText.split("\n").map((text) => ({ text, imageId: null }));
  if (norm(picturePdf).length >= 40) {
    pictureEdits(imageEntries, picturePdf, scan).forEach((row) => {
      push(row.imageId == null ? "正文不一致" : "图片不一致", row.word, row.pdf, row.note, null, null, {
        imageId: row.imageId,
        focus: row.focus,
        pdfHints: [row.focus],
      });
    });
    if (scan) {
      pictureEdits(
        (word.lines || []).map((text) => ({ text, imageId: null })),
        pdfOcr,
        false,
      ).forEach((row) => {
        push("正文不一致", row.word, row.pdf, row.note, null, null, {
          focus: row.focus,
          pdfHints: [row.focus],
        });
      });
    }
  }

  if (/配照片|附照片/.test(wordText) && word.hasPortrait === false) {
    push(
      "成品多写",
      "稿写了「配照片」或「附照片」，稿里没有人像。",
      "请看成品上是否多了人物照片。",
      "稿里的「配照片」是制作说明。成品通常直接放照片，标题里不再写这几个字。",
    );
  }

  if (scan && Array.isArray(pdf.ocrLines)) {
    let extraLines = 0;
    const blob = norm(wordText + "\n" + ocrText);
    pdf.ocrLines.forEach((line) => {
      if (extraLines >= 8) return;
      const text = String(line.text || "").replace(/\s+/g, "");
      const hans = text.match(/[\u4e00-\u9fff]/g) || [];
      const rest = text.replace(/[\u4e00-\u9fff，。、]/g, "");
      if (hans.length < 6 || hans.length > 12 || rest.length > 1) return;
      const n = norm(text);
      if (!n || blob.includes(n)) return;
      extraLines++;
      push("成品多写", "（稿里没有这句）", text, "成品版面上有这句短句，稿里没有。请对着原页确认。", null, null, {
        focus: text,
        pdfHints: [text],
      });
    });
  }

  const positioned = (pdf.items && pdf.items.length ? pdf.items : pdf.ocrLines) || [];
  const tiers = holdingTiers(word.lines || [], positioned);
  const wordByKey = new Map();
  tiers.wordTiers.forEach((item) => wordByKey.set(tierKey(item.tier), item));
  const pdfByKey = new Map();
  tiers.pdfTiers.forEach((item) => {
    if (!pdfByKey.has(tierKey(item.tier))) pdfByKey.set(tierKey(item.tier), item);
  });
  let unitNoted = false;
  wordByKey.forEach((item, key) => {
    const other = pdfByKey.get(key);
    if (!other) return;
    if (!unitNoted && item.tier.unit !== other.tier.unit) {
      unitNoted = true;
      push(
        "正文不一致",
        item.tier.raw,
        other.tier.raw,
        "持有期限的单位不一致。同一组天数，一边写「天」，一边写「日」。",
      );
    }
    const leftRates = item.rates.join("、");
    const rightRates = other.rates.join("、");
    if (leftRates && rightRates && leftRates !== rightRates) {
      push(
        "正文不一致",
        item.tier.raw + " " + leftRates,
        other.tier.raw + " " + rightRates,
        "同一持有期限旁边的费率不一致。请核对是不是换了一档。",
      );
    }
  });

  const otherLines = scan
    ? (pdf.ocrLines || []).map((line) => line.text)
    : String(pdfText || "").split("\n");
  (word.lines || []).forEach((line) => {
    const folded = norm(line).replace(/＜/g, "<").replace(/＞/g, ">");
    if (folded.length < 4 || folded.length > 32 || !/\d/.test(folded)) return;
    if (norm(pdfText + "\n" + pdfOcr).includes(folded)) return;
    if (parseTier(line)) return;
    let best = null;
    otherLines.forEach((raw) => {
      const other = norm(raw).replace(/＜/g, "<").replace(/＞/g, ">");
      if (!other || Math.abs(other.length - folded.length) > 3) return;
      let prefix = 0;
      const limit = Math.min(folded.length, other.length);
      while (prefix < limit && folded[prefix] === other[prefix]) prefix++;
      if (prefix < 4 || prefix < limit - 2) return;
      const diff = lcsDiff(folded, other);
      if (!diff || !diff.meaningful) return;
      const marks = markedCount(folded, diff.aMarks) + markedCount(other, diff.bMarks);
      if (marks < 1 || marks > 3) return;
      if (!best || marks < best.marks) best = { raw: String(raw).trim(), marks };
    });
    if (!best || norm(line) === norm(best.raw)) return;
    if (norm(wordText).includes(norm(best.raw))) return;
    push("正文不一致", String(line).trim(), best.raw, "这几个字几乎一样，少了或多了个别字。");
  });

  const otherBlob = norm(pdfText + "\n" + pdfOcr);
  const wordBlob = norm(wordText + "\n" + ocrText);
  const otherShort = [];
  otherLines.forEach((raw) => {
    const text = String(raw || "").trim();
    const n = norm(text);
    if (n.length < 2 || n.length > 12 || wordBlob.includes(n)) return;
    otherShort.push(text);
  });
  (word.lines || []).forEach((line) => {
    const left = String(line || "").trim();
    const a = norm(left);
    if (a.length < 2 || a.length > 12 || otherBlob.includes(a) || dateKey(a)) return;
    let best = null;
    otherShort.forEach((raw) => {
      const b = norm(raw);
      let prefix = 0;
      while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
      if (prefix < 2) return;
      if (Math.abs(a.length - b.length) > 3) return;
      const diff = lcsDiff(a, b);
      if (!diff || !diff.meaningful) return;
      const marks = markedCount(a, diff.aMarks) + markedCount(b, diff.bMarks);
      if (marks < 1 || marks > 4) return;
      if (!best || prefix > best.prefix) best = { raw, prefix };
    });
    if (!best) return;
    push("正文不一致", left, best.raw, "这几个字对不上。请核对是不是指数、产品或名称写错。");
  });

  (word.lines || []).forEach((line) => {
    const left = String(line || "").trim();
    const wrapped = left.match(/^[（(](.{4,})[）)]$/);
    if (!wrapped) return;
    const inner = wrapped[1].trim();
    const hit = otherLines.find((raw) => norm(raw) === norm(inner));
    if (!hit) return;
    push("正文不一致", left, String(hit).trim(), "字是一样的。稿在这句外面多了一对括号。");
  });

  const numRe = /[+\-−－]?\d+(?:\.\d+)?%|\d{4}[./年]\d{1,2}(?:[./月]\d{1,2}日?)?|\d{6}/g;
  const wordNums = new Set(wordText.match(numRe) || []);
  const pdfNums = new Set((pdfText + (scan ? "\n" + pdfOcr : "")).match(numRe) || []);
  const both = [...wordNums].filter((n) => pdfNums.has(n));
  both.sort();

  const merged = findings.concat(sentenceFindings).filter((item, index, all) => {
    if (item.kind !== "成品多写") return true;
    const extra = norm(item.pdf);
    if (extra.length < 6) return true;
    return !all.some((other, otherIndex) => {
      if (otherIndex === index || other.kind === "成品多写") return false;
      const shown = norm(other.pdf);
      return shown.length >= 6 && (shown.includes(extra) || extra.includes(shown));
    });
  });

  return {
    findings: merged.slice(0, 100),
    matched: both.length ? both.slice(0, 40).join("、") : "没有抽出两边都出现的百分比、日期或六位代码。",
    pdfGroupCount: pdfSide.length,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    compare,
    pdfGroups,
    verticalJoin,
    norm,
    cleanLabel,
    extractLabels,
    extractChartGroups,
    locateCluster,
    acceptTrackChanges,
    pictureEdits,
  };
}
