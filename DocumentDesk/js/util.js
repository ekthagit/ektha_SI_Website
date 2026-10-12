/* ==========================================================
   Utilities: escaping, numbers, money, words, dates, files
   ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/* Escape and keep line breaks (addresses) */
function escBr(v) { return esc(v).replace(/\r?\n/g, "<br>"); }

function uid(prefix = "") {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return isFinite(n) ? n : 0;
}

function decimalsFor(cur) { return (CURRENCIES[cur] || CURRENCIES.AED).dec; }

/* Half-up rounding that survives binary float error (2.5 × 33.33 = 83.33, not 83.32) */
function round(v, dec = 2) {
    const f = Math.pow(10, dec);
    const n = Number((v * f).toFixed(6));
    return (n < 0 ? -Math.round(-n) : Math.round(n)) / f;
}

/* Exchange rates keep their full precision (3.6725, not 3.673) */
function fmtRate(v) {
    return round(num(v), 6).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmt(v, cur = "AED") {
    const dec = decimalsFor(cur);
    return round(v, dec).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/* Quantities: show up to 3 decimals, no trailing zeros */
/* Prices keep extra decimals when they have them (333.333), so quantity × rate checks out on paper */
function fmtPrice(v, cur = "AED") {
    const dec = decimalsFor(cur);
    const n = num(v);
    const extra = Math.abs(n - round(n, dec)) > 1e-9 ? Math.min(4, String(round(n, 4)).split(".")[1]?.length || dec) : dec;
    return round(n, Math.max(dec, extra)).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, extra) });
}

function fmtQty(v) {
    return (round(num(v), 3)).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function fmtPct(v) {
    const n = round(num(v), 2);
    return (Number.isInteger(n) ? n : n.toFixed(2)) + "%";
}

/* ---------- Amount in words ---------- */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function words999(n) {
    let out = [];
    if (n >= 100) { out.push(ONES[Math.floor(n / 100)] + " Hundred"); n %= 100; }
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "")); }
    else if (n > 0) out.push(ONES[n]);
    return out.join(" ");
}

function numberToWords(n, indian = false) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return "Zero";
    const parts = [];
    if (indian) {
        const crore = Math.floor(n / 1e7); n %= 1e7;
        const lakh = Math.floor(n / 1e5); n %= 1e5;
        const thousand = Math.floor(n / 1e3); n %= 1e3;
        if (crore) parts.push(numberToWords(crore, true) + " Crore");
        if (lakh) parts.push(words999(lakh) + " Lakh");
        if (thousand) parts.push(words999(thousand) + " Thousand");
        if (n) parts.push(words999(n));
    } else {
        const scales = [[1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
        for (const [v, name] of scales) {
            if (n >= v) { parts.push(words999(Math.floor(n / v)) + " " + name); n %= v; }
        }
        if (n) parts.push(words999(n));
    }
    return parts.join(" ");
}

function amountToWords(amount, cur = "AED") {
    const info = CURRENCIES[cur] || { major: cur, minor: "", dec: 2 };
    const neg = amount < 0;
    const f = Math.pow(10, info.dec);
    const totalMinor = Math.round(Math.abs(amount) * f);
    const whole = Math.floor(totalMinor / f);
    const minor = totalMinor - whole * f;
    let w = numberToWords(whole, info.indian) + " " + info.major;
    if (minor > 0 && info.minor) w += " and " + numberToWords(minor, info.indian) + " " + info.minor;
    return (neg ? "Minus " : "") + w + " Only";
}

/* ---------- Dates (local, no timezone drift) ---------- */
function todayISO() {
    const d = new Date();
    return isoOf(d);
}
function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s) {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}
function addDays(iso, days) {
    const d = parseISO(iso) || new Date();
    d.setDate(d.getDate() + Number(days || 0));
    return isoOf(d);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/* 09-Oct-2026, the format used by the original generator */
function fmtDate(iso) {
    const d = parseISO(iso);
    if (!d) return "";
    return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
function fmtDateLong(iso) {
    const d = parseISO(iso);
    if (!d) return "";
    return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
function daysBetween(aIso, bIso) {
    const a = parseISO(aIso), b = parseISO(bIso);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
}
function relTime(ts) {
    if (!ts) return "";
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return "just now";
    if (s < 60) return s + " s ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + " h ago";
    return fmtDate(isoOf(new Date(ts)));
}

/* ---------- Rich text sanitising ----------
   Keeps formatting tags from the editor, drops scripts, event handlers and URLs that run code. */
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "FONT", "OL", "UL", "LI",
    "H1", "H2", "H3", "H4", "BLOCKQUOTE", "A", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "SUB", "SUP", "HR"]);
const ALLOWED_ATTRS = new Set(["style", "color", "face", "size", "href", "align", "colspan", "rowspan"]);

function sanitizeHTML(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstChild;
    const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 1) {
                if (!ALLOWED_TAGS.has(child.tagName)) {
                    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(child.tagName)) { child.remove(); continue; }
                    walk(child);
                    child.replaceWith(...Array.from(child.childNodes));
                    continue;
                }
                for (const a of Array.from(child.attributes)) {
                    const name = a.name.toLowerCase();
                    if (!ALLOWED_ATTRS.has(name)) child.removeAttribute(a.name);
                    else if (name === "href" && !/^(https?:|mailto:|tel:)/i.test(a.value.trim())) child.removeAttribute(a.name);
                    else if (name === "style" && /expression|url\(|javascript:/i.test(a.value)) child.removeAttribute(a.name);
                }
                walk(child);
            } else if (child.nodeType === 8) child.remove();
        }
    };
    walk(root);
    return root.innerHTML;
}

function htmlIsEmpty(html) {
    if (!html) return true;
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent.trim() === "" && !d.querySelector("img,hr,table");
}

/* ---------- Files ---------- */
function download(filename, content, type = "application/octet-stream") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function safeFilename(s) {
    return String(s || "document").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}

/* Read an image file, downscale it so it fits in browser storage, return a data URL */
function readImage(file, maxW = 2000) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("No file"));
        if (file.type === "image/svg+xml") {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
            return;
        }
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxW / img.width);
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            resolve(c.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("That file is not an image this browser can read."));
        img.src = URL.createObjectURL(file);
    });
}

function debounce(fn, ms = 150) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
