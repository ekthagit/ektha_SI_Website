/* ==========================================================
   Import old documents
   Reads PDFs and images on this computer:
   - PDFs with real text are read directly (pdf.js)
   - scans and photos are read with OCR (Tesseract.js)
   The text is turned into a document (type, number, dates,
   customer, lines, VAT and totals) and saved straight away.
   Original files are kept in this browser (IndexedDB).
   ========================================================== */

const IMPORT_LIBS = {
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    tessWorker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    tessCore: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    tessLang: "https://tessdata.projectnaptha.com/4.0.0"
};
const IMPORT_MAX_PAGES = 12;

/* ---------- Original files (IndexedDB) ---------- */
const FileStore = {
    _db: null,
    open() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error("This browser cannot store files."));
            const req = indexedDB.open("evamdocs-files", 1);
            req.onupgradeneeded = () => req.result.createObjectStore("files", { keyPath: "id" });
            req.onsuccess = () => { this._db = req.result; resolve(this._db); };
            req.onerror = () => reject(req.error);
        });
    },
    async put(rec) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", "readwrite");
            tx.objectStore("files").put(rec);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },
    async get(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const req = db.transaction("files").objectStore("files").get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },
    async remove(id) {
        try {
            const db = await this.open();
            db.transaction("files", "readwrite").objectStore("files").delete(id);
        } catch (e) { /* nothing stored */ }
    }
};

/* ---------- Library loading ---------- */
const _scripts = {};
function loadScript(src) {
    if (_scripts[src]) return _scripts[src];
    _scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { delete _scripts[src]; reject(new Error("Could not load the reading software. Check the internet connection and try again.")); };
        document.head.appendChild(s);
    });
    return _scripts[src];
}

async function loadPdfJs() {
    await loadScript(IMPORT_LIBS.pdf);
    const lib = window.pdfjsLib;
    if (!lib) throw new Error("The PDF reader did not start.");
    if (!lib.GlobalWorkerOptions.workerSrc) {
        // A worker from another site cannot start directly on a page opened from a folder,
        // so the worker code is fetched and started from a blob. If that fails pdf.js reads on the main thread.
        try {
            const code = await (await fetch(IMPORT_LIBS.pdfWorker)).text();
            lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        } catch (e) {
            lib.GlobalWorkerOptions.workerSrc = IMPORT_LIBS.pdfWorker;
        }
    }
    return lib;
}

let _ocr = null;
async function getOcrWorker(lang, onProgress) {
    if (_ocr && _ocr.lang === lang) { _ocr.onProgress = onProgress; return _ocr.worker; }
    if (_ocr) { try { await _ocr.worker.terminate(); } catch (e) { /* ignore */ } _ocr = null; }
    await loadScript(IMPORT_LIBS.tesseract);
    const holder = { lang, onProgress, worker: null };
    holder.worker = await Tesseract.createWorker(lang, 1, {
        workerPath: IMPORT_LIBS.tessWorker,
        corePath: IMPORT_LIBS.tessCore,
        langPath: IMPORT_LIBS.tessLang,
        logger: m => {
            if (!holder.onProgress) return;
            if (m.status === "recognizing text") holder.onProgress("Reading text", m.progress);
            else if (/loading|initializ/i.test(m.status)) holder.onProgress("Preparing the text reader (first time only)", m.progress);
        }
    });
    _ocr = holder;
    return holder.worker;
}

async function releaseOcr() {
    if (_ocr) { try { await _ocr.worker.terminate(); } catch (e) { /* ignore */ } _ocr = null; }
}

/* ---------- Reading ---------- */
/* A line is { y, page, cells: [{ text, x0, x1 }], text }, x in 0–1 of the page width */

function cellsToLine(cells, y, page) {
    cells.sort((a, b) => a.x0 - b.x0);
    return { y, page, cells, text: cells.map(c => c.text).join("  ") };
}

async function readPdf(file, opts) {
    const lib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await lib.getDocument({ data, isEvalSupported: false }).promise;
    const pages = Math.min(pdf.numPages, IMPORT_MAX_PAGES);
    let lines = [], ocrPages = 0;
    for (let p = 1; p <= pages; p++) {
        opts.progress(`Reading page ${p} of ${pages}`, (p - 1) / pages);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = tc.items.filter(it => typeof it.str === "string")
            .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 8 }));
        // Glyphs drawn without a real text mapping (common for figures in some fonts) come through as
        // private-use characters or empty items with width; such pages are read with OCR instead
        const PUA = /[\uE000-\uF8FF]/g;
        const unmapped = items.reduce((n, it) => n + (it.str.match(PUA) || []).length + (it.str === "" && it.w > 0.5 ? 1 : 0), 0);
        const chars = items.reduce((n, it) => n + it.str.replace(PUA, "").replace(/\s/g, "").length, 0);
        if (chars < 40 || unmapped > Math.max(3, chars * 0.02)) {
            ocrPages++;
            const worker = await getOcrWorker(opts.lang, (m, pr) => opts.progress(`${m}, page ${p} of ${pages}`, (p - 1 + (pr || 0)) / pages));
            const vpx = page.getViewport({ scale: Math.min(3, 2200 / vp.width) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(vpx.width); canvas.height = Math.round(vpx.height);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vpx }).promise;
            const res = await worker.recognize(prepareForOcr(canvas));
            lines = lines.concat(ocrLines(res.data, canvas.width, p));
            opts.confidence.push(res.data.confidence);
        } else {
            lines = lines.concat(groupPdfItems(items, vp.width, p));
        }
    }
    return { lines, method: ocrPages ? "ocr" : "text", pages: pdf.numPages };
}

function groupPdfItems(items, pageW, page) {
    const sorted = items.filter(i => i.str.trim() !== "" || i.w > 0).sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const rows = [];
    for (const it of sorted) {
        const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, it.h) * 0.45));
        if (row) row.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => {
        const its = r.items.sort((a, b) => a.x - b.x);
        const cells = [];
        let cur = null;
        for (const it of its) {
            if (!it.str.trim()) { if (cur) cur.space = true; continue; }
            const gap = cur ? it.x - cur.end : Infinity;
            if (cur && gap < Math.max(4, r.h * 1.1)) {
                cur.text += (cur.space || gap > r.h * 0.18 ? " " : "") + it.str;
                cur.end = Math.max(cur.end, it.x + it.w);
                cur.space = false;
            } else {
                if (cur) cells.push(cur);
                cur = { text: it.str, start: it.x, end: it.x + it.w, space: false };
            }
        }
        if (cur) cells.push(cur);
        return cellsToLine(cells.map(c => ({ text: c.text.replace(/\s+/g, " ").trim(), x0: c.start / pageW, x1: c.end / pageW })).filter(c => c.text), -r.y, page);
    }).filter(l => l.cells.length);
}

/* Make scans easier to read: dark bands (white text on a coloured header) are inverted,
   light tints behind text are cleared, and everything becomes greyscale. */
function prepareForOcr(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { width: w, height: h } = canvas;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; p < lum.length; i += 4, p++) lum[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    // Rows that are mostly dark belong to a coloured band: invert them so the text is dark on light
    const darkRow = new Uint8Array(h);
    for (let y = 0; y < h; y++) {
        let dark = 0;
        for (let x = 0; x < w; x += 2) if (lum[y * w + x] < 110) dark++;
        darkRow[y] = dark > (w / 2) * 0.45 ? 1 : 0;
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = y * w + x;
            let v = darkRow[y] ? 255 - lum[p] : lum[p];
            if (v > 215) v = 255;            // clear tints and paper texture
            const i = p * 4;
            d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function ocrLines(data, width, page) {
    const out = [];
    for (const line of data.lines || []) {
        const words = (line.words || []).filter(w => w.text && w.text.trim());
        if (!words.length) continue;
        const h = Math.max(8, line.bbox.y1 - line.bbox.y0);
        const cells = [];
        let cur = null;
        for (const w of words.sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
            if (cur && w.bbox.x0 - cur.x1 < h * 1.25) { cur.text += " " + w.text; cur.x1 = w.bbox.x1; }
            else { if (cur) cells.push(cur); cur = { text: w.text, x0: w.bbox.x0, x1: w.bbox.x1 }; }
        }
        if (cur) cells.push(cur);
        out.push(cellsToLine(cells.map(c => ({ text: c.text.trim(), x0: c.x0 / width, x1: c.x1 / width })), line.bbox.y0, page));
    }
    return out;
}

async function readImage_(file, opts) {
    const bmp = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This image format cannot be read. Use PDF, JPG or PNG."));
        img.src = URL.createObjectURL(file);
    });
    const scale = Math.min(3, Math.max(1, 2000 / bmp.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.naturalWidth * scale);
    canvas.height = Math.round(bmp.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(bmp.src);
    const worker = await getOcrWorker(opts.lang, opts.progress);
    opts.progress("Reading text", 0);
    const res = await worker.recognize(prepareForOcr(canvas));
    opts.confidence.push(res.data.confidence);
    return { lines: ocrLines(res.data, canvas.width, 1), method: "ocr", pages: 1 };
}

/* ---------- Parsing helpers ---------- */
const CUR_CODES = Object.keys(CURRENCIES);
const CUR_RE = new RegExp(`\\b(${CUR_CODES.join("|")})\\b`, "i");
const SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

/* "AED 1,234.50", "1.234,50", "(250.00)", "5%" → number; anything else → null */
function parseAmount(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;
    let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(CUR_RE, "").replace(/dhs?\.?|د\.إ|[$€£₹]/gi, "").replace(/[()\s]/g, "").replace(/^-|-$/g, "");
    s = s.replace(/%$/, "");
    if (!/^\d[\d.,]*$/.test(s)) return null;
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot && s.length - lastComma - 1 <= 2 && (lastDot !== -1 || /\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s))) {
        s = s.replace(/\./g, "").replace(",", "."); // 1.234,50
    } else {
        s = s.replace(/,/g, "");
    }
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
}
const isPct = s => /%\s*$/.test(String(s).trim());
const isNum = s => parseAmount(s) !== null && !/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(String(s).trim());

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RES = [
    { re: /\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/, f: m => [m[1], m[2], m[3]] },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/.,]*${MON_RE}[\\s\\-\\/.,]*(\\d{2,4})\\b`, "i"), f: m => [m[3], MON[m[2].slice(0, 4).toLowerCase()] || MON[m[2].slice(0, 3).toLowerCase()], m[1]] },
    { re: new RegExp(`\\b${MON_RE}[\\s\\-.]+(\\d{1,2})(?:st|nd|rd|th)?,?[\\s\\-.]+(\\d{4})\\b`, "i"), f: m => [m[3], MON[m[1].slice(0, 4).toLowerCase()] || MON[m[1].slice(0, 3).toLowerCase()], m[2]] },
    { re: /(?<![\d\/])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?![\d\/])/, f: (m, mf) => mf ? [m[3], m[1], m[2]] : [m[3], m[2], m[1]] }
];

/* Finds every date in a string; day-first unless the text shows month-first */
function findDates(s, monthFirst = false) {
    const out = [];
    // Text recognition often reads the letter O in month names as a zero
    let rest = String(s).replace(/\b0ct\b/gi, "Oct").replace(/\bn0v\b/gi, "Nov").replace(/\b0ctober\b/gi, "October").replace(/\bn0vember\b/gi, "November");
    for (let guard = 0; guard < 6; guard++) {
        let best = null;
        for (const d of DATE_RES) {
            const m = d.re.exec(rest);
            if (m && (!best || m.index < best.m.index)) best = { m, d };
        }
        if (!best) break;
        let [y, mo, da] = best.d.f(best.m, monthFirst).map(Number);
        if (y < 100) y += 2000;
        if (mo > 12 && da <= 12) [mo, da] = [da, mo];
        if (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
            out.push({ iso: `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`, index: best.m.index, raw: best.m[0] });
        }
        rest = rest.slice(0, best.m.index) + " ".repeat(best.m[0].length) + rest.slice(best.m.index + best.m[0].length);
    }
    return out.sort((a, b) => a.index - b.index);
}

function detectType(lines) {
    // Only short cells count (titles and labels), so phrases inside sentences such as
    // "on receipt of a purchase order" do not decide the type
    const top = lines.slice(0, 40).map(l => l.cells.filter(c => c.text.length <= 40).map(c => c.text).join("  ").toLowerCase());
    const rules = [
        ["creditNote", /\bcredit\s*note\b|\bcredit\s*memo\b/],
        ["proforma", /\bpro[\s-]?forma\b/],
        ["deliveryNote", /\bdelivery\s*(note|order|challan)\b|\bpacking\s*list\b|\bgoods\s*received\b/],
        ["purchaseOrder", /\bpurchase\s*order\b(?!\s*(no|number|#|ref))|\blocal\s*purchase\s*order\b|^\s*l?po\s*$/],
        ["quotation", /\bquot[a-z]{0,3}on\b|\bquote\b(?!d)|\bestimate\b|\boffer\b(?=\s*(no|number|#|$))|\bprepared\s*for\b/],
        ["invoice", /\b(tax\s*)?invoice\b|\bbill\s*of\s*supply\b|\bcommercial\s*invoice\b/],
        ["resolutionArchive", /\bboard\s*resolution\b|\bresolution\s*of\s*the\s*board\b/]
    ];
    let best = null;
    top.forEach((t, i) => {
        for (const [type, re] of rules) {
            if (re.test(t) && (!best || i < best.i)) best = { type, i };
        }
    });
    if (!best) return "letter";
    return best.type === "resolutionArchive" ? "letter" : best.type;
}

const LABEL = {
    number: /(?:[a-z]?n|(?<![a-z])m)vo[il1]ce\s*\.?\s*n[o0]\b\.?|\bquot[a-z]{0,3}on\s*\.?\s*n[o0]\b\.?|\b(tax\s*invoice|invoice|inv|bill|quotation|quote|qtn|q|estimate|est|proforma|pi|po|p\.o|lpo|purchase\s*order|order|credit\s*note|cn|delivery\s*note|dn|do|document|doc|receipt|ref(?:erence)?|serial)\s*\.?\s*(no|nr|num|number)\b\.?|\b(tax\s*invoice|invoice|inv|quotation|quote|estimate|proforma|po|lpo|order|bill|receipt|credit\s*note|delivery\s*note)\s*#/i,
    date: /\b(invoice|issue|issued|document|doc|order|quotation|po|delivery|credit\s*note)?\s*date\b|\bdated\b/i,
    due: /\b(due|payment\s*due|pay\s*by)\b/i,
    valid: /\b(valid(ity)?\s*(until|till|up\s*to)?|expir(y|es|ation))\b/i,
    party: /^(bill(ed)?\s*to|invoice\s*to|sold\s*to|customer(\s*name|\s*details)?|client|buyer|consignee|prepared\s*for|to|messrs\.?|m\/s\.?|vendor(\s*name|\s*details)?|supplier(\s*name|\s*details)?|deliver(ed)?\s*to|ship\s*to)\b\s*:?/i,
    stop: /\b(ship\s*to|deliver(y|ed)?\s*(to|address)|invoice\s*(no|date|number|#)|date|due|terms|payment|bank|iban|description|qty|quantity|subject|attn|tel|phone|po\s*no|reference)\b/i
};

/* Value written after a label on the same line (next cell or after a colon), or a date when asked */
function labelledValue(lines, re, wantDate = false, monthFirst = false) {
    for (const l of lines.slice(0, 80)) {
        for (let i = 0; i < l.cells.length; i++) {
            const c = l.cells[i];
            const m = re.exec(c.text);
            if (!m) continue;
            const after = c.text.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "").trim();
            const val = after || (l.cells[i + 1] ? l.cells[i + 1].text.trim() : "");
            if (!val) continue;
            if (wantDate) { const d = findDates(val, monthFirst)[0]; if (d) return d.iso; continue; }
            return val.slice(0, 80);
        }
    }
    return "";
}

function cleanNumberToken(s) {
    return String(s || "").replace(/^[:#.\s-]+/, "").replace(/[.,;:]+$/, "").trim();
}

function findNumber(lines, type) {
    const prefer = {
        invoice: /invoice|inv|bill/i, proforma: /proforma|pi/i, quotation: /quot|qtn|quote|offer|estimate|est/i,
        purchaseOrder: /po|p\.o|purchase|order/i, creditNote: /credit|cn/i, deliveryNote: /delivery|dn|do/i
    }[type];
    const cands = [];
    lines.slice(0, 60).forEach((l, li) => {
        l.cells.forEach((c, ci) => {
            const m = LABEL.number.exec(c.text);
            if (!m) return;
            let after = c.text.slice(m.index + m[0].length);
            let token = cleanNumberToken(after.split(/\s+/).find(t => /\d/.test(t)) || "");
            if (!token || !/\d/.test(token)) token = cleanNumberToken((l.cells[ci + 1] || {}).text || "").split(/\s+/)[0];
            if ((!token || !/\d/.test(token)) && lines[li + 1]) {
                const below = lines[li + 1].cells.find(x => Math.abs(x.x0 - c.x0) < 0.08);
                if (below) token = cleanNumberToken(below.text).split(/\s+/)[0];
            }
            if (token && /\d/.test(token) && token.length <= 32 && !/^\d{1,2}[\/.\-]\d{1,2}[\/.\-](\d{2}|\d{4})$/.test(token) && !/^\d{4}-\d{2}-\d{2}$/.test(token)) {
                let score = 1;
                if (prefer && prefer.test(m[0])) score += 3;
                if (/ref|order|po|p\.o/i.test(m[0]) && type !== "purchaseOrder") score -= 1;
                cands.push({ token, score, li });
            }
        });
    });
    cands.sort((a, b) => b.score - a.score || a.li - b.li);
    return cands[0] ? cands[0].token : "";
}

/* OCR often swaps look-alike characters inside numbers: Z→2, I/l→1, O→0, S→5, B→8 */
function fixOcrNumber(token) {
    const parts = token.split(/([\/\-.])/);
    return parts.map((p, i) => {
        if (i === 0 && /^[A-Za-z]+$/.test(p)) return p;              // keep a letter prefix such as INV
        if (!/\d/.test(p) || /^[A-Za-z]{2,}\d*$/.test(p)) return p;
        return p.replace(/[OoQD]/g, "0").replace(/[Il|!]/g, "1").replace(/Z/g, "2").replace(/S/g, "5").replace(/B/g, "8");
    }).join("");
}

function findDatesByLabel(lines, monthFirst) {
    const res = { date: "", due: "", valid: "", any: [] };
    lines.slice(0, 80).forEach((l, li) => {
        l.cells.forEach((c, ci) => {
            const own = findDates(c.text, monthFirst);
            const next = l.cells[ci + 1] ? findDates(l.cells[ci + 1].text, monthFirst) : [];
            const below = lines[li + 1] ? (lines[li + 1].cells.filter(x => Math.abs(x.x0 - c.x0) < 0.08).map(x => findDates(x.text, monthFirst)).flat()) : [];
            own.forEach(d => res.any.push(d.iso));
            const val = (own[0] || next[0] || below[0] || {}).iso;
            if (!val) return;
            if (LABEL.due.test(c.text) && !res.due) res.due = val;
            else if (LABEL.valid.test(c.text) && !res.valid) res.valid = val;
            else if (LABEL.date.test(c.text) && !/due|valid|expir|delivery\s*date/i.test(c.text) && !res.date) res.date = val;
        });
    });
    if (!res.date && res.any.length) res.date = res.any[0];
    return res;
}

function detectMonthFirst(text) {
    // If any slashed date has a "day" above 12 in second place, the document writes month first
    let mf = 0, df = 0;
    (text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g) || []).forEach(d => {
        const [a, b] = d.split(/[\/.\-]/).map(Number);
        if (a > 12 && b <= 12) df++;
        if (b > 12 && a <= 12) mf++;
    });
    return mf > df;
}

function detectCurrency(text, fallback, lines) {
    if (lines) {
        for (const l of lines) {
            if (!/grand\s*total|total\s*(amount\s*)?(due|payable)|amount\s*due|^\s*total\b/i.test(l.text) || /excl|aed\s*equivalent/i.test(l.text)) continue;
            const m = CUR_RE.exec(l.text);
            if (m) return m[1].toUpperCase();
            if (/\bu[s5][dbo0]\b/i.test(l.text)) return "USD";
            if (/\ba[e3][dp]\b/i.test(l.text)) return "AED";
            for (const [sym, code] of Object.entries(SYMBOLS)) if (l.text.includes(sym)) return code;
        }
    }
    const counts = {};
    (text.match(new RegExp(`\\b(${CUR_CODES.join("|")})\\b`, "g")) || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    for (const [sym, code] of Object.entries(SYMBOLS)) {
        const n = text.split(sym).length - 1;
        if (n) counts[code] = (counts[code] || 0) + n;
    }
    const n = (text.match(/\bdhs?\b|د\.إ|dirham/gi) || []).length;
    if (n) counts.AED = (counts.AED || 0) + n;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : fallback;
}

const TRN_RE = /\b(1\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b|\b(1\d{14})\b/;
function trnIn(s) {
    const m = TRN_RE.exec(s);
    return m ? (m[1] || m[2]).replace(/[\s-]/g, "") : "";
}

function findParty(lines, type, ownName, ownTrn) {
    const wantVendor = type === "purchaseOrder";
    const labels = lines.map((l, li) => l.cells.map((c, ci) => ({ li, ci, c, m: LABEL.party.exec(c.text) })).filter(x => x.m)).flat()
        .filter(x => !/ship|deliver/i.test(x.m[0]) || false);
    const order = wantVendor ? /vendor|supplier|to\b|messrs|m\/s/i : /bill|invoice\s*to|sold|customer|client|buyer|prepared|messrs|m\/s|consignee|^to\b/i;
    const pick = labels.find(x => order.test(x.m[0])) || labels[0];
    if (!pick) return null;
    const x0 = pick.c.x0;
    // Follow the label's own column: the next cell to the right (or the next distinct column below) ends it
    const nextCell = lines[pick.li].cells[pick.ci + 1];
    let x1 = nextCell ? nextCell.x0 - 0.01 : 1;
    for (let i = pick.li + 1; i < Math.min(lines.length, pick.li + 6) && x1 === 1; i++) {
        const right = lines[i].cells.find(c => c.x0 > x0 + 0.25);
        if (right) x1 = right.x0 - 0.01;
    }
    const got = [];
    const inline = pick.c.text.slice(pick.m.index + pick.m[0].length).trim();
    if (inline && inline.length > 1) got.push(inline);
    let blanks = 0;
    for (let i = pick.li + 1; i < Math.min(lines.length, pick.li + 9) && got.length < 7; i++) {
        const cells = lines[i].cells.filter(c => c.x0 >= x0 - 0.04 && c.x0 < x1 && c.x0 < x0 + 0.2);
        if (!cells.length) { if (++blanks >= 2) break; continue; }
        blanks = 0;
        const t = cells.map(c => c.text).join(" ").trim();
        if ((t.match(/[a-z0-9]/gi) || []).length < 2) continue;              // rules and smudges read as text
        if (lines[i].cells.filter(c => isNum(c.text)).length >= 3) break;    // reached the item table
        if (/^\d{1,3}[.)]?$/.test((lines[i].cells[0] || {}).text || "") && lines[i].cells.length >= 3) break;
        if (LABEL.party.test(t) && got.length) break;
        if (LABEL.stop.test(t) && !/tel|phone|trn|vat|email|mob/i.test(t) && got.length) break;
        got.push(t);
    }
    const p = { name: "", attn: "", trn: "", address: "", phone: "", email: "" };
    const rest = [];
    got.forEach(t => {
        const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(t);
        const trn = trnIn(t);
        if (trn && trn !== ownTrn) { p.trn = p.trn || trn; return; }
        if (/\b(trn|vat\s*(reg|no|number)|tax\s*reg)/i.test(t)) return;
        if (email) { p.email = p.email || email[0]; if (t.replace(email[0], "").replace(/e-?mail\s*:?/i, "").trim().length < 3) return; }
        const phone = /(?:tel|phone|mob(?:ile)?|ph|t|m)\.?\s*:?\s*(\+?\d[\d\s\-()]{6,}\d)/i.exec(t) || /(\+\d{1,3}[\d\s\-()]{7,}\d)/.exec(t);
        if (phone) { p.phone = p.phone || phone[1].trim(); if (t.replace(phone[0], "").trim().length < 3) return; }
        if (/^(attn|attention|contact)\b/i.test(t)) { p.attn = t.replace(/^(attn|attention|contact)\s*[:.]?\s*/i, ""); return; }
        rest.push(t.replace(/^(name|company)\s*:\s*/i, ""));
    });
    p.name = rest.shift() || "";
    // A legal suffix wrapped onto its own line belongs to the name
    while (rest.length && /^(l\.?l\.?c\.?|fze|fzco|fz-?llc|ltd\.?|limited|co\.?|inc\.?|gmbh|ag|sa|plc|llp|pvt\.?\s*ltd\.?|est\.?|trading)$/i.test(rest[0].trim())) p.name += " " + rest.shift().trim();
    p.address = rest.join("\n");
    if (p.name && ownName && sameCompany(p.name, ownName)) p.toUs = true;
    return p.name ? p : null;
}

function sameCompany(a, b) {
    const n = s => String(s).toLowerCase().replace(/\b(llc|fzco|fze|fz|l\.l\.c|co|ltd|limited|trading|global|general|the)\b/g, "").replace(/[^a-z0-9]/g, "");
    const x = n(a), y = n(b);
    return !!x && !!y && (x.includes(y) || y.includes(x));
}

/* The company at the top of the page, for documents that were sent to us */
function findIssuer(lines, ownName, ownTrn) {
    const first = lines.filter(l => l.page === 1).slice(0, 12);
    const title = /\b(tax\s*invoice|invoice|quotation|quote|estimate|proforma|purchase\s*order|credit\s*note|delivery\s*note)\b/i;
    const p = { name: "", attn: "", trn: "", address: "", phone: "", email: "" };
    const addr = [];
    for (const l of first) {
        const t = l.cells[0].text.trim();
        if (!t || title.test(t) && t.length < 25) continue;
        if (l.cells[0].x0 > 0.45 || findDates(t).length || /^(date|valid|due|quote|invoice|ref)/i.test(t)) continue;
        if (LABEL.party.test(t) || LABEL.number.test(t)) break;
        if (!p.name) { if (!sameCompany(t, ownName)) p.name = t; continue; }
        const trn = trnIn(l.text);
        if (trn && trn !== ownTrn) p.trn = p.trn || trn;
        const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(l.text);
        if (email) p.email = p.email || email[0];
        const phone = /(\+\d{1,3}[\d\s\-()]{7,}\d)/.exec(l.text);
        if (phone) p.phone = p.phone || phone[1].trim();
        const clean = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/, "").replace(/(tel|phone|trn|e-?mail)\s*:?.*$/i, "").replace(/[\s|,·]+$/, "").trim();
        if (clean && clean.length > 3 && !trn && addr.length < 2) addr.push(clean);
    }
    p.address = addr.join("\n");
    return p.name ? p : null;
}

/* ---------- Lines & totals ---------- */
const HEAD_WORDS = {
    no: /^(s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?|#|no\.?|item\s*no\.?|line)$/i,
    desc: /description|particulars|details|item|product|goods|services?|article/i,
    hs: /\bhs\b|hsn|h\.s\.|tariff/i,
    qty: /\bqty\b|quantity|qnty|\bpcs\b|units?$|no\.\s*of/i,
    unit: /^(unit|uom|u\/m)$/i,
    rate: /rate|price|unit\s*cost|unit\s*price|\bcost\b/i,
    disc: /disc/i,
    vatRate: /(vat|tax)\s*(%|rate)|%\s*(vat|tax)|^%$/i,
    vatAmt: /^(vat|tax)(\s*amount|\s*amt)?$|vat\s*amount|tax\s*amount|^vat\s*\(/i,
    amount: /amount|total|value|net|line\s*total/i
};
const TOTAL_LINE = /\b(sub\s*-?\s*total|total|vat|tax|grand|balance|amount\s*(due|payable|paid|received)|discount|freight|shipping|rounding|net\s*payable|in\s*words)\b/i;

function findHeader(lines) {
    for (let i = 0; i < lines.length; i++) {
        const cells = lines[i].cells;
        if (cells.length < 3 || cells.some(c => isNum(c.text) && !/^#$/.test(c.text.trim()))) continue;
        const roles = {};
        let hits = 0;
        cells.forEach((c, ci) => {
            const t = c.text.trim();
            for (const [role, re] of Object.entries(HEAD_WORDS)) {
                if (role === "amount" && (roles.amount !== undefined)) continue;
                if (re.test(t) && roles[role] === undefined) {
                    if (role === "amount" && /vat|tax/i.test(t) && !/incl/i.test(t)) continue;
                    if (role === "rate" && /vat|tax/i.test(t)) continue;
                    roles[role] = ci; hits++; break;
                }
            }
        });
        if (hits >= 3 && hits >= cells.length * 0.5 && (roles.qty !== undefined || roles.rate !== undefined) && (roles.amount !== undefined || roles.rate !== undefined)) {
            const cols = {};
            Object.entries(roles).forEach(([role, ci]) => { const c = cells[ci]; cols[role] = { x0: c.x0, x1: c.x1, mid: (c.x0 + c.x1) / 2 }; });
            return { index: i, cols, inclVat: /incl|inc\./i.test((cells[roles.amount] || {}).text || "") };
        }
    }
    return null;
}

function parseItems(lines, header) {
    const items = [];
    if (!header) return items;
    const roles = Object.entries(header.cols);
    const nearest = (c) => {
        const mid = (c.x0 + c.x1) / 2;
        let best = null, bd = Infinity;
        for (const [role, col] of roles) {
            const overlap = Math.min(c.x1, col.x1 + 0.02) - Math.max(c.x0, col.x0 - 0.02);
            const d = overlap > 0 ? 0 : Math.min(Math.abs(mid - col.mid), Math.abs(c.x1 - col.x1), Math.abs(c.x0 - col.x0));
            if (d < bd) { bd = d; best = role; }
        }
        return bd < 0.12 ? best : null;
    };
    for (let i = header.index + 1; i < lines.length; i++) {
        const l = lines[i];
        if (TOTAL_LINE.test(l.text) && l.cells.some(c => isNum(c.text)) && !l.cells.some(c => nearest(c) === "desc" && c.text.length > 25)) break;
        if (/^(amount\s*in\s*words|terms|bank|note|remarks|payment)/i.test(l.text.trim())) break;
        if (l.page !== lines[header.index].page && findHeader([l])) continue; // repeated header
        const row = { desc: [], nums: {} };
        l.cells.forEach(c => {
            const role = nearest(c);
            const t = c.text.trim();
            if ((role === "desc" || role === "hs" || role === "unit") && !(role !== "desc" && false)) {
                if (role === "unit" && !isNum(t)) row.unit = t;
                else if (role === "hs") row.hs = t;
                else row.desc.push(t);
            } else if (role === "no") {
                if (!/^\d{1,3}\.?$/.test(t)) row.desc.push(t);
            } else if (role && isNum(t)) {
                row.nums[role] = parseAmount(t);
                if (role === "qty") { const u = /[a-z]{1,8}$/i.exec(t.replace(/[\d.,\s]/g, " ").trim()); if (u && !row.unit) row.unit = u[0]; }
            } else if (role === "qty" && /\d/.test(t)) {
                const m = /([\d.,]+)\s*([a-z]{1,8})?/i.exec(t);
                if (m) { row.nums.qty = parseAmount(m[1]); if (m[2]) row.unit = m[2]; }
            } else if (t) {
                row.desc.push(t);
            }
        });
        const hasNums = Object.keys(row.nums).length > 0;
        const text = row.desc.join(" ").trim();
        if (!hasNums) {
            if (text && items.length && !TOTAL_LINE.test(text)) items[items.length - 1].desc += (items[items.length - 1].desc ? "\n" : "") + text;
            continue;
        }
        if (!text && !row.nums.amount && !row.nums.rate) continue;
        items.push({ name: text, desc: "", hs: row.hs || "", unit: row.unit || "", ...row.nums });
    }
    return items;
}

/* For layouts whose header row could not be read (e.g. white text on a dark band):
   find rows that start with a line number and end in amounts, then work out which number is which. */
function parseItemsByPattern(lines) {
    const items = [];
    let expect = 1;
    for (let i = 0; i < lines.length; i++) {
        const cells = lines[i].cells.map(c => c.text.trim()).filter(Boolean);
        if (!cells.length) continue;
        const lead = /^(\d{1,3})[.)]?\s*(.*)$/.exec(cells[0]);
        if (!lead || Number(lead[1]) !== expect) {
            // A text-only line under an item is its description
            if (items.length && !cells.some(isNum) && !TOTAL_LINE.test(lines[i].text) && lines[i].text.length < 160 && i === items[items.length - 1]._line + 1) {
                items[items.length - 1].desc += (items[items.length - 1].desc ? "\n" : "") + cells.join(" ");
                items[items.length - 1]._line = i;
            }
            continue;
        }
        // "500 pcs" in one cell becomes quantity + unit
        const rest = (lead[2] ? [lead[2]] : []).concat(cells.slice(1))
            .flatMap(c => { const m = /^([\d.,]+)\s+([a-z]{1,8}\.?)$/i.exec(c); return m ? [m[1], m[2]] : [c]; });
        const firstNum = rest.findIndex(c => isNum(c) && !/[a-z]{3,}/i.test(c));
        if (firstNum < 1) continue;
        const name = rest.slice(0, firstNum).join(" ");
        // OCR sometimes joins neighbouring columns ("10% 360.00"): split cells made only of numbers and short words
        const tail = rest.slice(firstNum).flatMap(c => {
            const toks = c.split(/\s+/);
            return toks.length > 1 && toks.every(t => isNum(t) || /^[a-z]{1,8}\.?$/i.test(t) || t === "-") ? toks : [c];
        });
        const nums = [], pcts = [];
        let unit = "";
        tail.forEach(c => {
            if (isPct(c) && isNum(c)) pcts.push(parseAmount(c));
            else if (isNum(c)) nums.push(parseAmount(c));
            else if (!unit && /^[a-z]{1,8}\.?$/i.test(c)) unit = c.replace(/\.$/, "");
        });
        if (nums.length < 2) continue;
        const amount = nums[nums.length - 1];
        const others = nums.slice(0, -1);
        const ok = (a, b) => Math.abs(a - b) <= 0.02;
        let found = null, vat = pcts.length ? pcts[pcts.length - 1] : null;
        for (const vTry of (pcts.length ? [...pcts].reverse().concat([0]) : [0])) {
        if (found) break;
        vat = pcts.length ? vTry : null;
        for (let k = 0; k < others.length && !found; k++) {
            for (let m = k + 1; m < others.length && !found; m++) {
                const q = others[k], r = others[m], gross = q * r;
                const rem = others.filter((_, j) => j !== k && j !== m);
                const v = vat != null ? vat / 100 : 0;
                if (ok(gross, amount)) found = { qty: q, rate: r };
                else if (v && ok(gross * (1 + v), amount)) found = { qty: q, rate: r, incl: true };
                for (const d of rem) {
                    if (found) break;
                    if (ok(gross - d, amount)) found = { qty: q, rate: r, disc: d };
                    else if (v && ok((gross - d) * (1 + v), amount)) found = { qty: q, rate: r, disc: d, incl: true };
                }
                for (const d of rem.concat([0])) {
                    if (found) break;
                    for (const va of rem) {
                        if (va === d) continue;
                        if (ok(gross - d + va, amount) && (!v || ok((gross - d) * v, va))) { found = { qty: q, rate: r, disc: d || undefined, incl: true }; break; }
                    }
                }
            }
        }
        }
        if (!found) { found = { qty: others.length >= 2 ? others[0] : 1, rate: others.length >= 2 ? others[1] : amount }; vat = pcts.length ? pcts[pcts.length - 1] : null; }
        items.push({ name, desc: "", unit, hs: "", qty: found.qty, rate: found.rate, disc: found.disc, vatRate: vat, amount: found.incl ? undefined : amount, _line: i });
        expect++;
    }
    return items.map(({ _line, ...it }) => it);
}

function findTotals(lines) {
    const out = {};
    const lastNum = l => {
        for (let i = l.cells.length - 1; i >= 0; i--) {
            const t = l.cells[i].text.trim();
            if (isNum(t) && !isPct(t)) return parseAmount(t);
            const m = /([\d][\d,]*\.\d{2,3})\s*$/.exec(t);
            if (m) return parseAmount(m[1]);
        }
        return null;
    };
    for (const l of lines) {
        const t = l.text.toLowerCase();
        if (/equivalent|converted|exchange\s*rate/.test(t)) break;   // a second set of totals in another currency
        if (/in\s*words|trn|reg(istration)?\s*no|iban|account/.test(t)) continue;
        const v = lastNum(l);
        if (v === null) continue;
        const rateM = /(vat|tax)[^%\d]{0,8}(\d{1,2}(?:\.\d+)?)\s*%/i.exec(l.text) || /(\d{1,2}(?:\.\d+)?)\s*%\s*(vat|tax)/i.exec(l.text);
        if (/sub\s*-?\s*total|total\s*(excl|excluding|before|ex\b|ex\.|w\/o)|taxable\s*(amount|value)|net\s*(amount|total)(?!\s*payable)|total\s*value\s*excl/.test(t)) { if (out.subtotal === undefined) out.subtotal = v; }
        else if (/grand\s*total|total\s*(amount\s*)?(due|payable)|amount\s*(due|payable)|net\s*payable|total\s*(incl|inclusive|including)|total\s*invoice\s*(value|amount)|invoice\s*total|balance\s*due/.test(t)) { if (out.total === undefined) out.total = v; }
        else if (/\b(vat|tax)\b/.test(t) && !/incl|excl|total/.test(t)) { if (out.vat === undefined) { out.vat = v; if (rateM) out.vatRate = parseFloat(rateM[2] || rateM[1]); } }
        else if (/discount/.test(t)) out.discount = Math.abs(v);
        else if (/^\s*(freight|shipping|insurance|handling|delivery\s*charges?|customs(\s*clearance)?|packing(\s*charges?)?|courier|other\s*charges)\b/i.test(l.text) && l.cells.filter(c => isNum(c.text)).length <= 2) {
            out.charges = out.charges || [];
            out.charges.push({ label: l.cells[0].text.replace(/\s*[:(].*$/, "").trim(), amount: v });
        }
        else if (/amount\s*(paid|received)|paid\s*amount|advance\s*(paid|received)/.test(t)) out.paid = v;
        else if (/\btotal\b/.test(t) && out.total === undefined) out.totalLoose = v;
    }
    if (out.total === undefined && out.totalLoose !== undefined) out.total = out.totalLoose;
    return out;
}

/* ---------- Build a document ---------- */
function linesText(lines) { return lines.map(l => l.text).join("\n"); }

function parseToDoc(read, file) {
    const s = Store.settings;
    const lines = read.lines;
    const text = linesText(lines);
    const issues = [];
    const type = detectType(lines);
    const doc = newDoc(type);
    doc.auto = false;
    doc.seq = null;
    doc.status = "imported";
    const stem = file.name.replace(/\.[^.]+$/, "");

    const monthFirst = detectMonthFirst(text);
    const dates = findDatesByLabel(lines, monthFirst);
    if (dates.date) doc.date = dates.date; else issues.push("No document date found; today’s date was used.");

    if (type === "letter") {
        const T = lines.map(l => l.cells.map(c => c.text).join(" ").trim());
        const refLine = T.findIndex(t => /\b(our\s*)?ref(erence)?\s*(no\.?)?\s*[:.#-]/i.test(t));
        const refM = refLine > -1 ? /\bref(?:erence)?\s*(?:no\.?)?\s*[:.#-]\s*([^\s]+)/i.exec(T[refLine]) : null;
        doc.number = refM ? refM[1].replace(/[,;]$/, "") : stem;
        if (!refM) issues.push("No reference number found; the file name was used.");
        const toIdx = T.findIndex(t => /^to\s*[,:]?\s*$/i.test(t) || /^to\s*[,:]\s*\S/i.test(t));
        const subjIdx = T.findIndex(t => /^(subject|sub|re)\s*[:.-]/i.test(t));
        const salIdx = T.findIndex(t => /^(dear\b|sir\b|madam\b|to whom it may concern|gentlemen)/i.test(t));
        const closeIdx = T.findIndex((t, i) => i > Math.max(salIdx, 0) && /^(yours\s+(faithfully|sincerely|truly)|sincerely|best\s+regards|kind\s+regards|regards|thanking\s+you)\b/i.test(t));
        if (toIdx > -1) {
            const first = T[toIdx].replace(/^to\s*[,:]?\s*/i, "");
            const to = first ? [first] : [];
            for (let i = toIdx + 1; i < T.length && to.length < 6; i++) {
                if (i === subjIdx || i === salIdx || !T[i]) break;
                to.push(T[i]);
            }
            doc.letter.to = to.join("\n");
        }
        doc.letter.subject = subjIdx > -1 ? T[subjIdx].replace(/^(subject|sub|re)\s*[:.-]\s*/i, "") : stem;
        const start = salIdx > -1 ? salIdx : (subjIdx > -1 ? subjIdx + 1 : 0);
        const end = closeIdx > -1 ? closeIdx + 1 : T.length;
        // Paragraphs are separated where the vertical gap is clearly larger than the normal line spacing
        const body = lines.slice(start, end);
        const gaps = body.slice(1).map((l, i) => l.page === body[i].page ? l.y - body[i].y : 0).filter(g => g > 0).sort((a, b) => a - b);
        const normal = gaps.length ? gaps[0] : 14;   // the tightest spacing is the normal line height
        const paras = [];
        let cur = [];
        body.forEach((l, i) => {
            const gap = i > 0 && l.page === body[i - 1].page ? l.y - body[i - 1].y : 0;
            const t = l.cells.map(c => c.text).join(" ").trim();
            if (i > 0 && (gap > normal * 1.45 || i === 1 && salIdx > -1)) { if (cur.length) paras.push(cur.join(" ")); cur = []; }
            if (t) cur.push(t);
        });
        if (cur.length) paras.push(cur.join(" "));
        doc.letter.body = paras.map(p => `<p>${esc(p)}</p>`).join("");
        if (closeIdx > -1) {
            const after = T.slice(closeIdx + 1).filter(Boolean).filter(t => !/^(for|on behalf)/i.test(t));
            doc.signature.name = after[0] || "";
            doc.signature.title = after[1] && after[1].length < 40 ? after[1] : "";
            doc.letter.showRight = !!doc.signature.name;
        } else {
            doc.letter.showRight = false;
        }
        doc.signature.show = false;
        doc.title = "";
        return { doc, issues, text };
    }

    doc.number = findNumber(lines, type);
    if (doc.number && read.method === "ocr") {
        doc.number = fixOcrNumber(doc.number);
        const body = doc.number.replace(/^[A-Za-z]{1,6}[-\/ ]?/, "");
        if (/[^A-Za-z0-9\/\-. ]/.test(doc.number) || /\d[A-Za-z]|[A-Za-z]\d/.test(body)) issues.push(`Check the document number “${doc.number}” against the original.`);
    }
    if (!doc.number) { doc.number = stem; issues.push("No document number found; the file name was used."); }
    if (type === "purchaseOrder" && !dates.due) dates.due = labelledValue(lines, /delivery\s*date|required\s*(by|date)|ship\s*date/i, true, monthFirst);
    if (DOC_TYPES[type].due) { if (dates.due) doc.due = dates.due; else { doc.due = ""; if (type === "invoice") issues.push("No due date found."); } }
    if (type === "purchaseOrder") {
        doc.deliveryTerms = labelledValue(lines, /delivery\s*terms|incoterms?|terms\s*of\s*delivery/i) || "";
        doc.paymentTerms = labelledValue(lines, /payment\s*terms|terms\s*of\s*payment/i) || "";
    }
    if (DOC_TYPES[type].valid) doc.valid = dates.valid || "";

    doc.currency = detectCurrency(text, s.defaults.currency, lines);
    const bank = s.banks.find(b => b.currency === doc.currency);
    if (bank) doc.bankId = bank.id;
    doc.showBank = false; // the original's payment details are not ours to restate
    doc.terms = "";
    doc.footer = "";

    let party = findParty(lines, type, s.company.name, s.company.trn);
    if (party && party.toUs) {
        // Addressed to us: this was received, so the other side is the company at the top of the page
        const issuer = findIssuer(lines, s.company.name, s.company.trn);
        if (issuer) issues.push(`This ${DOC_TYPES[type].label.toLowerCase()} is addressed to your company, so it was received from ${issuer.name.replace(/\.$/, "")}. ${issuer.name.replace(/\.$/, "")} is shown as the other party.`);
        party = issuer;
    }
    if (party) {
        delete party.toUs;
        Object.assign(doc.party, party);
        if (!party.address && !party.phone && !party.email) issues.push(`Only the name of ${party.name} was found; add the address if you need it.`);
    }
    else issues.push(`No ${DOC_TYPES[type].noun || "customer"} name found.`);

    const ref = /\b(?:customer\s*)?(?:l?po|p\.o\.|purchase\s*order|your\s*ref(?:erence)?|order\s*ref)\s*(?:ref(?:erence)?\.?|no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i.exec(type === "purchaseOrder" ? "" : text);
    if (ref && ref[1] !== doc.number && /\d/.test(ref[1])) doc.ref = ref[1];

    // Lines and totals
    const totals = findTotals(lines);
    const header = findHeader(lines);
    let items = parseItems(lines, header);
    if (!items.length) items = parseItemsByPattern(lines);
    const dec = decimalsFor(doc.currency);
    const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.051;

    if (totals.vat == null && totals.total != null && totals.subtotal != null && totals.total >= totals.subtotal) totals.vat = round(totals.total - totals.subtotal, dec);
    let vatRate = totals.vatRate;
    if (vatRate == null && totals.vat != null && totals.subtotal) vatRate = round(totals.vat / totals.subtotal * 100, 2);
    if (vatRate != null && Math.abs(vatRate - 5) < 0.06) vatRate = 5;
    if (vatRate == null) vatRate = totals.vat === 0 || (totals.total && totals.subtotal && near(totals.total, totals.subtotal)) ? 0 : (totals.vat ? s.defaults.vat : 0);

    const buildItems = (items) => items.map((it, idx) => {
        let qty = it.qty, rate = it.rate, amount = it.amount;
        const lineVat = it.vatRate != null ? it.vatRate : vatRate;
        if (qty == null && rate != null && amount != null && rate) qty = round(amount / rate, 3);
        if (qty == null) qty = 1;
        if (rate == null && amount != null) rate = round(amount / (qty || 1), 4);
        if (rate == null) rate = 0;
        let disc = it.disc || 0;
        if (amount != null && rate) {
            const gross = qty * rate;
            const inclVat = header && header.inclVat;
            const netAmount = inclVat ? amount / (1 + lineVat / 100) : amount;
            if (!near(gross - disc, netAmount) && !near((gross - disc) * (1 + lineVat / 100), amount)) {
                const impliedQty = netAmount / rate;
                const clean = Math.abs(impliedQty - round(impliedQty, 3)) < 1e-6;
                if (header && header.cols.disc && it.disc == null && amount < gross) disc = round(gross - netAmount, dec);
                else if (clean && impliedQty > 0) qty = round(impliedQty, 3);   // e.g. OCR read 3.5 as 35
                else rate = round(netAmount / (qty || 1), 4);
            }
        }
        const name = it.name.replace(/^\d{1,3}[.)]\s+/, "");
        return newItem({ name: name.slice(0, 200), desc: it.desc || "", hs: it.hs || "", unit: it.unit || "", qty, rate, disc, discType: "amt", vat: lineVat });
    }).filter(it => (it.name || it.rate) && !(num(it.rate) === 0 && /@|www\.|https?:|\+\d{3}|p\.?\s*o\.?\s*box/i.test(it.name)))
      .map((it, k) => ({ ...it, name: it.name.replace(new RegExp(`^${k + 1}[.)]?\\s+`), "") }));

    const chargeList = (totals.charges || []).map(c => ({ label: c.label, amount: c.amount, vat: vatRate }));
    // Score a reading of the lines: the total must match; matching VAT and subtotal as well is better
    const score = (list) => {
        if (!list.length) return -1;
        const c = computeTotals({ ...doc, items: list, discount: { type: "amt", value: 0 }, charges: chargeList });
        let sc = 0;
        if (totals.total != null && near(c.total, totals.total)) sc += 4;
        if (totals.vat != null && near(c.vatTotal, totals.vat)) sc += 2;
        if (totals.subtotal != null && near(c.taxable, totals.subtotal)) sc += 1;
        return sc;
    };
    let built = buildItems(items);
    const best = totals.total != null ? 4 + (totals.vat != null ? 2 : 0) + (totals.subtotal != null ? 1 : 0) : 1;
    if (score(built) < best) {
        // Try reading rows by their arithmetic instead and keep whichever agrees with the totals best
        const alt = buildItems(parseItemsByPattern(lines));
        if (score(alt) > score(built)) built = alt;
    }
    doc.items = built;
    doc.charges = chargeList;
    if (totals.discount && built.length) {
        const sumNet = built.reduce((a, it) => a + num(it.qty) * num(it.rate) - num(it.disc), 0);
        if (totals.subtotal != null && near(sumNet - totals.discount, totals.subtotal)) doc.discount = { type: "amt", value: totals.discount };
    }

    const target = totals.total != null ? totals.total : null;
    let check = computeTotals(doc);
    const matches = target == null ? (totals.subtotal != null ? near(check.taxable, totals.subtotal) : built.length > 0) : near(check.total, target);

    if (!built.length || !matches) {
        // Fall back to summary lines that reproduce the original totals exactly
        const sub = totals.subtotal != null ? totals.subtotal : (target != null && totals.vat != null ? round(target - totals.vat, dec) : target);
        if (sub != null) {
            const keepText = built.map(b => `${b.name}${b.qty ? ` × ${fmtQty(b.qty)}` : ""}`).filter(Boolean).slice(0, 20).join("\n");
            let rate = vatRate;
            if (totals.vat != null && sub) rate = round(totals.vat / sub * 100, 4);
            doc.items = [newItem({ name: built.length ? "Goods and services as per original document" : `Imported from ${stem}`, desc: keepText, qty: 1, rate: sub, vat: rate })];
            doc.discount = { type: "amt", value: 0 };
            doc.charges = [];
            check = computeTotals(doc);
            if (target != null && !near(check.total, target)) {
                doc.charges = [{ label: "Rounding", amount: round(target - check.total, dec), vat: 0 }];
            }
            issues.push(built.length ? "The line items did not add up to the original total, so one summary line was used. The original lines are listed in its description." : "No line items could be read; one summary line carries the original amount.");
        } else {
            issues.push("No total could be read. Check the amounts against the original.");
        }
    }
    if (totals.vat != null && doc.items.length && !issues.some(i => /summary line/.test(i))) {
        const c = computeTotals(doc);
        if (!near(c.vatTotal, totals.vat) && !(totals.total != null && near(c.total, totals.total))) issues.push(`VAT read as ${fmt(totals.vat, doc.currency)} on the original; recalculated as ${fmt(c.vatTotal, doc.currency)}.`);
    }

    // Paid?
    const final = computeTotals(doc);
    if (DOC_TYPES[type].paid) {
        if (totals.paid && totals.paid > 0) doc.paid = Math.min(totals.paid, final.total);
        const zeroBalance = lines.some(l => /balance\s*(due)?|amount\s*due/i.test(l.text) && /\b0(\.0+)?\s*$/.test(l.text.trim()) && final.total > 0);
        if (/^\s*paid\s*$/im.test(text) || zeroBalance) { doc.paid = final.total; doc.status = "paid"; }
    }
    return { doc, issues, text };
}

/* ---------- One file, start to finish ---------- */
async function importFile(file, opts) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = /^image\/(png|jpe?g|webp|bmp|gif)$/i.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
    if (!isPdf && !isImg) throw new Error("Only PDF, JPG, PNG and WebP files can be read.");
    if (file.size > 25 * 1024 * 1024) throw new Error("This file is larger than 25 MB. Split it or reduce its size.");
    opts.confidence = [];
    const read = isPdf ? await readPdf(file, opts) : await readImage_(file, opts);
    if (!read.lines.length) throw new Error("No text could be found in this file.");
    opts.progress("Filling in the details", 0.95);
    const { doc, issues, text } = parseToDoc(read, file);
    const conf = opts.confidence.length ? Math.round(opts.confidence.reduce((a, b) => a + b, 0) / opts.confidence.length) : 100;
    if (read.method === "ocr") {
        if (conf < 70) issues.unshift(`The scan was hard to read (${conf}% confidence). Check every figure against the original.`);
        else if (!issues.length || conf < 93) issues.push(`Read from an image with text recognition (${conf}% confidence). Compare the number, dates and names with the original.`);
    }
    if (read.pages > IMPORT_MAX_PAGES) issues.push(`Only the first ${IMPORT_MAX_PAGES} of ${read.pages} pages were read.`);

    // Same number already in Documents?
    const sameNumber = Store.data.docs.filter(d => d.type === doc.type && d.number.trim().toLowerCase() === doc.number.trim().toLowerCase());
    const tot = DOC_TYPES[doc.type].prices ? computeTotals(doc).total : null;
    const dup = sameNumber.find(d => {
        if (d.party.name && doc.party.name && sameCompany(d.party.name, doc.party.name)) return true;
        if (tot != null && DOC_TYPES[d.type].prices && Math.abs(computeTotals(d).total - tot) < 0.01) return true;
        return DOC_TYPES[doc.type].text && d.date === doc.date;
    });
    if (dup && opts.skipDuplicates) return { skipped: true, doc: dup };
    if (!dup && sameNumber.length) {
        doc.number = `${doc.number} (${sameNumber.length + 1})`;
        issues.push(`Another ${DOC_TYPES[doc.type].label.toLowerCase()} already uses this number with a different ${DOC_TYPES[doc.type].noun || "customer"} or total, so this one was saved as ${doc.number}.`);
    }
    if (dup) { doc.number = `${doc.number} (imported)`; issues.push("This document seems to be in Documents already; this copy was saved as " + doc.number + "."); }

    const fileId = uid("f");
    try { await FileStore.put({ id: fileId, name: file.name, type: file.type, size: file.size, blob: file, text, savedAt: Date.now() }); }
    catch (e) { issues.push("The original file could not be stored in this browser; the extracted details were kept."); }
    doc.import = {
        fileId, fileName: file.name, fileSize: file.size, method: read.method, pages: read.pages, confidence: conf,
        issues, checked: issues.length === 0, importedAt: Date.now(), textPreview: text.slice(0, 1500)
    };
    if (!Store.saveDoc(doc)) throw new Error("Browser storage is full. Export a backup and remove old documents.");

    if (opts.addContacts && doc.party.name && !DOC_TYPES[doc.type].text && !Store.findByName("contacts", doc.party.name)) {
        Store.upsert("contacts", { id: uid("c"), role: doc.type === "purchaseOrder" ? "vendor" : "customer", name: doc.party.name, attn: doc.party.attn, trn: doc.party.trn, address: doc.party.address, phone: doc.party.phone, email: doc.party.email });
    }
    return { doc: Store.getDoc(doc.id), issues };
}

async function openOriginal(doc) {
    if (!doc.import || !doc.import.fileId) return;
    const rec = await FileStore.get(doc.import.fileId).catch(() => null);
    if (!rec) { toast("The original file is not stored in this browser. Original files stay on the computer they were imported on.", "warn", 6000); return; }
    const url = URL.createObjectURL(rec.blob);
    const w = window.open(url, "_blank");
    if (!w) download(rec.name, rec.blob);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function showExtractedText(doc) {
    const rec = doc.import && doc.import.fileId ? await FileStore.get(doc.import.fileId).catch(() => null) : null;
    const text = (rec && rec.text) || (doc.import && doc.import.textPreview) || "";
    openDialog({
        title: "Text read from the original",
        wide: true,
        body: `<p class="dialog-text">${doc.import.method === "ocr" ? `Read with OCR from a scan (${doc.import.confidence}% confidence).` : "Read directly from the PDF."} Use it to check the details that were filled in.</p><pre class="ocr-text">${esc(text) || "No text stored."}</pre>`,
        actions: [{ label: "Close", value: "ok", primary: true }]
    });
}
