/* ==========================================================
   Finance → Import documents (OCR)
   Drop in old bills, receipts, sales invoices, credit notes, bank statements,
   journal vouchers, ledgers and trial balances — hundreds at once. Each file is
   read in parallel (text PDFs directly, scans and photos with a pool of OCR
   workers), recognised, turned into the right record and checked by you before
   it goes into the books. The dashboard and reports update as soon as you import.
   ========================================================== */

const FI_KINDS = {
    bill: { label: "Bill (supplier invoice)", short: "Bill" },
    vendorCredit: { label: "Vendor credit (credit note received)", short: "Vendor credit" },
    expense: { label: "Expense / receipt", short: "Expense" },
    invoice: { label: "Sales invoice (ours)", short: "Sales invoice" },
    creditNote: { label: "Credit note (ours)", short: "Credit note" },
    bank: { label: "Bank statement", short: "Bank statement" },
    journal: { label: "Journal voucher", short: "Journal" },
    tb: { label: "Trial balance (opening balances)", short: "Trial balance" },
    ledger: { label: "Ledger (closing balance)", short: "Ledger" },
    doc: { label: "Other document (keep in Documents)", short: "Document" },
    skip: { label: "Don't import", short: "Skip" }
};

const FinImport = {
    items: [],
    running: false,
    ocr: null,
    stats: null,

    /* ---------- Page ---------- */
    page() {
        const main = $("#finMain");
        main.innerHTML = Finance.head("Import documents", "Bring past bills, receipts, invoices, credit notes, bank statements, journals, ledgers and trial balances into the books. Files are read on this computer — hundreds at once — and nothing is posted until you check it.",
            `<button type="button" class="btn btn-ghost" id="fiClear"${this.items.length ? "" : " hidden"}>${icon("x")}<span>Clear list</span></button><label class="btn btn-primary" id="fiPick">${icon("upload")}<span>Choose files</span><input type="file" id="fiInput" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.csv,.xlsx,.xls,application/pdf,image/*" hidden></label>`) + `
<div class="fi-drop" id="fiDrop" tabindex="0" role="button" aria-label="Drop files here or choose files">
  <div class="fi-drop-ic">${icon("upload", 26)}</div>
  <div><b>Drop files here</b> — PDFs, scans, photos, CSV or Excel. Up to 500 at a time.</div>
  <div class="hint">Text PDFs are read instantly; scans and photos use text recognition, ${this.workerCount()} at a time on this computer.</div>
</div>
<div id="fiProgress"></div>
<div id="fiList"></div>`;
        const input = $("#fiInput");
        input.addEventListener("change", () => { this.add([...input.files]); input.value = ""; });
        const drop = $("#fiDrop");
        drop.addEventListener("click", () => input.click());
        drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
        ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
        ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
        drop.addEventListener("drop", e => this.add([...(e.dataTransfer?.files || [])]));
        $("#fiClear").addEventListener("click", () => { if (this.running) return toast("Wait for reading to finish.", "warn"); this.items = []; this.page(); });
        this.draw();
    },
    workerCount() { return Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)); },
    alive() { return App.view === "finance" && Finance.sub === "import" && $("#fiList"); },

    add(files) {
        files = files.filter(f => f && f.size);
        if (!files.length) return;
        if (this.items.length + files.length > 500) { toast("Import up to 500 files at a time.", "warn"); files = files.slice(0, Math.max(0, 500 - this.items.length)); }
        for (const f of files) this.items.push({ id: uid("fi"), file: f, name: f.name, size: f.size, status: "queued", progress: 0, kind: null, data: null, issues: [], include: true });
        $("#fiClear") && ($("#fiClear").hidden = false);
        this.draw();
        this.run();
    },

    /* ---------- Reading, in parallel ---------- */
    async run() {
        if (this.running) return;
        this.running = true;
        const t0 = performance.now();
        const FILES = Math.max(6, this.workerCount() * 2);      // files in flight
        const pageSlots = new Semaphore(this.workerCount() * 2); // OCR pages held in memory at once
        const next = () => this.items.find(i => i.status === "queued");
        const one = async () => {
            for (let it = next(); it; it = next()) {
                it.status = "reading"; this.drawSoon();
                try {
                    const read = await this.read(it, pageSlots);
                    it.method = read.method; it.pages = read.pages; it.conf = read.conf;
                    it.text = read.lines.map(l => l.text).join("\n");
                    if (!read.lines.length) throw new Error("No text found in this file.");
                    this.understand(it, read);
                    it.status = "ready";
                } catch (e) {
                    console.warn(it.name, e);
                    it.status = "error"; it.error = e.message || String(e); it.include = false;
                }
                it.progress = 1;
                this.drawSoon();
            }
        };
        await Promise.all(Array.from({ length: FILES }, one));
        this.running = false;
        const secs = (performance.now() - t0) / 1000;
        this.stats = { files: this.items.length, secs };
        this.draw();
    },

    async read(it, pageSlots) {
        const f = it.file;
        const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        const isImg = /^image\//i.test(f.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name);
        const isCsv = /\.csv$/i.test(f.name) || f.type === "text/csv";
        const isXls = /\.xlsx?$/i.test(f.name);
        if (f.size > 30 * 1024 * 1024) throw new Error("Larger than 30 MB. Split the file.");
        if (isCsv) return { lines: this.tableToLines(this.parseCSV(await f.text())), method: "text", pages: 1, conf: 100 };
        if (isXls) {
            if (!window.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
            const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
            const rows = wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }));
            return { lines: this.tableToLines(rows), method: "text", pages: wb.SheetNames.length, conf: 100 };
        }
        if (isImg) {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("This image can't be read. Use PDF, JPG or PNG.")); i.src = URL.createObjectURL(f); });
            await pageSlots.take();
            try {
                const scale = Math.min(3, Math.max(1, 2000 / img.naturalWidth));
                const c = document.createElement("canvas");
                c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
                const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(img.src);
                it.status = "ocr"; this.drawSoon();
                const res = await this.ocrPage(c);
                return { lines: ocrLines(res.data, c.width, 1), method: "ocr", pages: 1, conf: Math.round(res.data.confidence) };
            } finally { pageSlots.give(); }
        }
        if (!isPdf) throw new Error("Use PDF, JPG, PNG, CSV or Excel files.");
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
        const pages = Math.min(pdf.numPages, 30);
        const confs = [];
        let lines = [], ocr = 0;
        const PUA = /[-]/g;
        for (let p = 1; p <= pages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            const tc = await page.getTextContent();
            const items = tc.items.filter(x => typeof x.str === "string").map(x => ({ str: x.str, x: x.transform[4], y: x.transform[5], w: x.width, h: Math.abs(x.transform[3]) || x.height || 8 }));
            const unmapped = items.reduce((n, x) => n + (x.str.match(PUA) || []).length, 0);
            const chars = items.reduce((n, x) => n + x.str.replace(PUA, "").replace(/\s/g, "").length, 0);
            if (chars < 40 || unmapped > Math.max(3, chars * 0.02)) {
                ocr++;
                await pageSlots.take();
                try {
                    it.status = "ocr"; this.drawSoon();
                    const vpx = page.getViewport({ scale: Math.min(3, 2200 / vp.width) });
                    const c = document.createElement("canvas");
                    c.width = Math.round(vpx.width); c.height = Math.round(vpx.height);
                    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
                    await page.render({ canvasContext: ctx, viewport: vpx }).promise;
                    const res = await this.ocrPage(c);
                    confs.push(res.data.confidence);
                    lines = lines.concat(ocrLines(res.data, c.width, p));
                    c.width = c.height = 0;
                } finally { pageSlots.give(); }
            } else lines = lines.concat(groupPdfItems(items, vp.width, p));
            it.progress = p / pages; this.drawSoon();
        }
        try { pdf.destroy(); } catch { /* ignore */ }
        return { lines, method: ocr ? "ocr" : "text", pages: pdf.numPages, conf: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 100 };
    },

    /* Read a page; if it reads poorly, try again with a stronger clean-up and keep the better result */
    async ocrPage(canvas) {
        const copy = document.createElement("canvas");
        copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext("2d").drawImage(canvas, 0, 0);
        const first = await this.recognize(prepareForOcr(canvas));
        if (first.data.confidence >= 80) return first;
        const second = await this.recognize(prepareForOcr(copy, true));
        return second.data.confidence > first.data.confidence + 2 ? second : first;
    },
    /* A pool of OCR workers shared by every file */
    async recognize(canvas) {
        if (!this.ocr) {
            this.ocr = (async () => {
                await loadScript(IMPORT_LIBS.tesseract);
                const scheduler = Tesseract.createScheduler();
                const n = this.workerCount();
                const opts = { workerPath: IMPORT_LIBS.tessWorker, corePath: IMPORT_LIBS.tessCore, langPath: IMPORT_LIBS.tessLang };
                // Start one worker first (it downloads the language data), then the rest in parallel from the cache
                scheduler.addWorker(await Tesseract.createWorker("eng", 1, opts));
                const rest = await Promise.allSettled(Array.from({ length: n - 1 }, () => Tesseract.createWorker("eng", 1, opts)));
                rest.forEach(r => { if (r.status === "fulfilled") scheduler.addWorker(r.value); });
                return scheduler;
            })().catch(e => { this.ocr = null; throw new Error("Couldn't start text recognition. Check the internet connection (it is downloaded the first time)."); });
        }
        const s = await this.ocr;
        return s.addJob("recognize", canvas);
    },

    parseCSV(text) {
        const rows = []; let row = [], cell = "", q = false;
        const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
            else if (ch === '"') q = true;
            else if (ch === sep) { row.push(cell); cell = ""; }
            else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
            else cell += ch;
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(r => r.some(c => String(c).trim()));
    },
    tableToLines(rows) {
        const n = Math.max(1, ...rows.map(r => r.length));
        return rows.map((r, i) => {
            const cells = r.map((v, j) => ({ text: (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "")).replace(/\s+/g, " ").trim(), x0: j / n, x1: (j + 0.9) / n })).filter(c => c.text);
            return cells.length ? cellsToLine(cells, i * 10, 1) : null;
        }).filter(Boolean);
    },

    /* ---------- What is this document, and what does it say? ---------- */
    understand(it, read) {
        const lines = read.lines, text = it.text, low = text.toLowerCase();
        const own = Store.settings.company || {};
        const monthFirst = detectMonthFirst(text);
        it.monthFirst = monthFirst; this._mf = monthFirst;
        const top = lines.slice(0, 30).map(l => l.text).join("\n").toLowerCase();
        const dated = lines.filter(l => this.lineDate(l)).filter(l => l.cells.some(c => isNum(c.text) && !this.isDateText(c.text)));
        const bankHead = lines.some(l => /date/i.test(l.text) && /(debit|withdraw|paid\s*out|money\s*out|amount)/i.test(l.text) && /(credit|deposit|paid\s*in|money\s*in|balance)/i.test(l.text));
        let kind = typeof PACK_KINDS !== "undefined" ? this.detectPack(lines, text) : null;
        if (kind) { /* a whole accounting pack */ }
        else if (/trial\s*balance/.test(top)) kind = "tb";
        else if (/journal\s*(voucher|entry|entries)|\bj\.?v\.?\s*(no|#|number)|^\s*journal\b/m.test(top)) kind = "journal";
        else if (/\bledger\b/.test(top) && !/bank|iban/.test(top) && dated.length >= 1) kind = "ledger";
        else if ((/\bbank\b|\biban\b|account\s*(statement|no|number)|statement\s*of\s*account|e-?statement|statement\s*period|mashreq|emirates\s*nbd|\bwio\b|adcb|\bfab\b|rakbank/.test(top) || bankHead) && (/(opening|closing|available|brought\s*forward|carried\s*forward|running|ledger)\s*balance|\bbalance\b/.test(low)) && dated.length >= 3 && !/\b(invoice|bill)\s*(no|number|#)/.test(top)) kind = "bank";
        else {
            const t = detectType(lines);
            // Ours if our name (or TRN) comes before the "bill to" block; theirs if it only appears as the customer
            const T = lines.slice(0, 40).map(l => l.text);
            const toIdx = T.findIndex(t => /\b(b[il1|]{1,3}(ed)?\s*to|invoice(d)?\s*to|sold\s*to|customer|to\s*:|^to\b|buyer|client)\b/i.test(t));
            const isOwn = t => (own.name && t.split(/\s{2,}|\||\/|,/).some(part => sameCompany(part, own.name) && part.length < own.name.length + 25)) || (own.trn && String(own.trn).replace(/\D/g, "").length > 8 && t.replace(/\D/g, "").includes(String(own.trn).replace(/\D/g, "")));
            const ownIdx = T.findIndex(isOwn);
            const weIssued = ownIdx > -1 && (toIdx === -1 ? ownIdx <= 2 : ownIdx < toIdx);
            const toUs = lines.some(l => isOwn(l.text));
            // A till slip or e-receipt: paid on the spot, usually not addressed to the company
            const receiptish = /\b(receipt|cash\s*memo|thank\s*you|visit\s*again|change\s*due|cashier|terminal|pos\b|visa|mastercard|amex|card\s*(no|number|ending)|paid\s*(by|with)|payment\s*method|trip\s*(fare|receipt))\b|\*{3,}\s*\d{4}|•{2,}\s*\d{4}/i.test(low);
            // Paid on the spot by card or cash, with nothing left to pay: an expense, even when addressed to us
            const tender = this.tenderOf(lines);
            const owing = /\b(due\s*date|payment\s*due|pay\s*by|balance\s*(due|payable|outstanding)|amount\s*(due|payable)|bank\s*details|iban)\b/i.test(low);
            if (t === "invoice") kind = weIssued ? "invoice" : ((!toUs && receiptish) || (tender && !owing) ? "expense" : "bill");
            else if (t === "creditNote") kind = weIssued ? "creditNote" : "vendorCredit";
            else if (receiptish || /\bpaid\b/.test(top)) kind = toUs && /\b(invoice|bill)\s*(no|#|number)/i.test(low) ? "bill" : "expense";
            else if (["purchaseOrder", "quotation", "proforma", "deliveryNote"].includes(t)) kind = "doc";
            else kind = findTotals(lines).total ? (toUs ? "bill" : "expense") : "doc";
        }
        it.kind = kind;
        it.detected = kind;
        it.read = read;
        this.extract(it);
    },
    /* How a receipt was paid: "card", "cash" or "" */
    tenderOf(lines) {
        const T = lines.map(l => l.text);
        if (T.some(t => /\b(visa|master\s*card|mastercard|amex|american\s*express|debit\s*card|credit\s*card|apple\s*pay|google\s*pay|card\s*(no|number|ending)|paid\s*(by|with|via)\s*card)\b|\*{3,}\s*\d{4}|•{2,}\s*\d{4}/i.test(t))) return "card";
        if (T.some(t => /^\s*(cash|cash\s*paid|cash\s*tendered|paid\s*(in|by)\s*cash)\b[\s:]*(aed|dhs?)?\s*\d/i.test(t) || /\bpaid\s*(in|by)\s*cash\b|\bcash\s*(sale|memo|receipt)\b/i.test(t))) return "cash";
        return "";
    },
    /* Who sent it: the most prominent company-looking name at the top that isn't us or a heading */
    findSender(lines) {
        const own = Store.settings.company || {};
        const TITLE = /^(tax\s*invoice|invoice|commercial\s*invoice|bill|receipt|payment\s*receipt|credit\s*note|debit\s*note|statement|quotation|purchase\s*order|delivery\s*note|cash\s*memo|simplified\s*tax\s*invoice|فاتورة.*)$/i;
        const LBL = /subtotal|#|^(items?|description|qty|quantity|amount|rate|price|particulars|s\.?\s*no)$|\b(bill(ed)?\s*to|ship\s*to|invoice(d)?\s*to|sold\s*to|to\s*:|customer|date|due|terms|no\.?|number|#|trn|vat\s*no|tax\s*reg|phone|tel|fax|email|e-mail|www\.|http|po\s*box|p\.o\.|iban|account|balance|amount|total|page)\b/i;
        const SUFFIX = /\b(llc|l\.l\.c|fze|fzco|fz-?llc|fz\s*llc|ltd|limited|inc|plc|pjsc|psc|llp|gmbh|sa|ag|co\.|company|est\.?|establishment|trading|services|solutions|associates|group|enterprises|international|industries|corporation|corp)\b/i;
        const page1 = lines.filter(l => l.page === 1);
        // Only the header area: stop at the first table heading or line with an amount
        let cut = page1.findIndex((l, i) => i > 0 && (/\b(description|particulars|qty|quantity|item\s*&|activity|narration)\b/i.test(l.text) || /\d[\d,]*\.\d{2}\b/.test(l.text) && !/trn|vat\s*no|reg/i.test(l.text)));
        if (cut < 0) cut = 22;
        const first = page1.slice(0, Math.min(cut, 22));
        const toLine = first.findIndex(l => /\b(bill(ed)?\s*to|invoice(d)?\s*to|sold\s*to|customer|^to\b|to\s*:)/i.test(l.text));
        const maxH = Math.max(0.001, ...first.map(l => l.h || 0));
        let best = null;
        first.forEach((l, li) => {
            if (toLine > -1 && li > toLine && li <= toLine + 3) return;          // the customer block
            l.cells.forEach(c => {
                // "Sold by: Amazon.ae (Amazon General Trading LLC)" → "Amazon.ae"
                let t = c.text.replace(/\s+/g, " ").trim().replace(/^(sold\s*by|seller|vendor|supplier|from|merchant|issued\s*by)\s*:\s*/i, "");
                if (t !== c.text.replace(/\s+/g, " ").trim()) t = t.replace(/\s*\(.*\)\s*$/, "");
                t = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9).]+$/g, "").replace(/\s+\.$/, "");
                if (t.length < 2 || t.length > 70 || !/[a-z]{2}/i.test(t) || TITLE.test(t) || LBL.test(t) || findDates(t).length || /\d{4,}/.test(t)) return;
                if (own.name && sameCompany(t, own.name)) return;
                if (/^(thank|thanks|dear|hello|hi|your|we |our |please)/i.test(t)) return;
                // OCR noise: mostly letters, a real word, no table pipes
                if (/[|\\]/.test(t) || (t.match(/[a-z]/gi) || []).length < t.replace(/\s/g, "").length * 0.7 || !/[a-z]{3,}/i.test(t) && t.length > 3) return;
                let score = 0;
                if (SUFFIX.test(t)) score += 3;
                score += (l.h || 0) / maxH * 3;                                    // the biggest text is usually the name
                score += Math.max(0, 2 - li * 0.15);
                if (/^[A-Z0-9 &.,'()-]+$/.test(t) && t.length > 4) score += 0.5;
                // An address line (a city name alone is not: "Dubai Electricity & Water Authority")
                const CITY = /\b(dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|uae|u\.a\.e|united arab emirates|switzerland|india|usa|uk)\b/gi;
                const city = new RegExp(CITY.source, "i").test(t);
                const nonCity = t.replace(CITY, " ").replace(/[^a-z]+/gi, " ").trim();
                if (/\b(road|rd|street|st\.|blvd|avenue|ave|rue|building|bldg|floor|office\s*\d|tower|industrial|po\s*box|p\.o\.|pickup|drop-?off)\b/i.test(t) || city && (/,|\d/.test(t) || nonCity.length < 3) || /,/.test(t) && /\b(city|area|park|village|bay|square)\b/i.test(t)) score -= 3;
                // A heading such as "Trip receipt" or "Tax Invoice / Electricity and Water Bill"
                if (/\b(invoice|receipt|bill|statement|summary|order|quotation|voucher|memo)\b/i.test(t) && !SUFFIX.test(t)) score -= 4;
                if (!best || score > best.score) best = { t, score };
            });
        });
        return best && best.score > 1 ? best.t : "";
    },
    lineDate(l) { const first = l.cells.slice(0, 2).map(c => c.text).join(" "); return findDates(first, this._mf).length ? findDates(first, this._mf)[0].iso : null; },
    isDateText(s) { return /^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}$/.test(String(s).trim()) || findDates(s).some(d => d.raw.length >= String(s).trim().length - 1); },

    extract(it) {
        const lines = it.read.lines, file = it.file, kind = it.kind;
        it.issues = [];
        this._mf = it.monthFirst;
        if (it.method === "ocr" && it.conf < 75) it.issues.push(`Hard to read (${it.conf}% confidence) — check the figures.`);
        if (["bill", "vendorCredit", "invoice", "creditNote", "expense", "doc"].includes(kind)) {
            const { doc, issues } = parseToDoc(it.read, file);
            it.issues.push(...issues.filter(i => !/today.s date was used/.test(i) || kind !== "doc").slice(0, 4));
            const tot = computeTotals({ ...doc, paid: 0 });
            const found = findTotals(lines);
            const own = Store.settings.company || {};
            const sender = this.findSender(lines);
            const issuer = sender ? null : findIssuer(lines, own.name, own.trn);
            const vendor = sender || (issuer && issuer.name) || (doc.party?.name && !sameCompany(doc.party.name, own.name) ? doc.party.name : "") || "";
            // Receipts often only say what was paid
            const total = found.total ?? (kind === "expense" ? (found.paid ?? found.balanceDue) : undefined) ?? tot.total;
            let vat = found.vat ?? tot.vatTotal ?? 0;
            // VAT only mentioned as included: take it from its own line, never from a total line
            if (found.vat === undefined && /incl/i.test(it.text)) {
                for (const l of lines) {
                    if (/total|taxable|trn|tax\s*(reg|invoice|no\b)/i.test(l.text)) continue;
                    const m = /(?:vat|tax)[^\d\n]{0,30}?(\d[\d,]*[.,:]\d{2})\s*$/i.exec(l.text);
                    if (m) { const v = parseAmount(m[1]); if (v && v < num(total)) { vat = v; break; } }
                }
            }
            // A scan that lost its decimal points (47250 for 472.50): pick the reading where VAT and total agree
            let totalV = num(total), vatV = num(vat);
            if (it.method === "ocr" && totalV) {
                const opts = [];
                for (const ft of [1, 0.01]) for (const fv of [1, 0.01]) {
                    const T = totalV * ft, V = vatV * fv, net = T - V;
                    const ok = V === 0 || [5, 10, 15].some(r => Math.abs(V - net * r / 100) <= Math.max(0.05, T * 0.002));
                    if (ok && net > 0) opts.push({ T, V, cost: (ft !== 1) + (fv !== 1) });
                }
                // No amount anywhere on the page has decimals: they were all lost, so the readings are in cents
                const ends = lines.map(l => (l.cells[l.cells.length - 1] || {}).text || "").filter(t => /^\D{0,4}[\d,. ]{3,}$/.test(t.trim()) && !findDates(t).length);
                if (ends.length >= 2 && !ends.some(t => /[.,]\d{2}\s*$/.test(t.trim()))) opts.forEach(o => { o.cost += (o.T === totalV) ? 3 : 0; });
                opts.sort((a, b) => a.cost - b.cost);
                if (opts.length && !(opts[0].cost === 0)) { totalV = round(opts[0].T, 2); vatV = round(opts[0].V, 2); it.issues.push("Some amounts on the scan had no decimal point; they were read as " + fmt(totalV) + " total, " + fmt(vatV) + " VAT. Check them."); }
            }
            // Paid on the original: trust it only when it fits the total (and the balance due, when shown)
            let paid = 0;
            if (kind !== "expense") {
                const T = totalV, B = found.balanceDue;
                if (B !== undefined && B >= 0 && B <= T + 0.01) paid = round(T - B, 2);
                else if (found.paid !== undefined && found.paid > 0 && found.paid <= T + 0.01) paid = num(found.paid);
                else if (doc.status === "paid") paid = T;
                if (found.paid !== undefined && Math.abs(num(found.paid) - paid) > 0.02 && B !== undefined) it.issues.push(`The amount paid and the balance due on the original don't agree; ${fmt(paid)} was taken as paid. Check it.`);
            }
            it.doc = doc;
            const stem = file.name.replace(/\.[^.]+$/, "");
            let number = doc.number && doc.number !== stem && doc.type !== "letter" ? doc.number : "";
            if (!number) number = findNumber(lines, kind === "creditNote" || kind === "vendorCredit" ? "creditNote" : "invoice") || "";
            const noDate = issues.some(i => /today.s date was used/.test(i));
            it.data = {
                date: doc.date, due: doc.due || "", number,
                contact: kind === "invoice" || kind === "creditNote" ? (doc.party?.name || "") : vendor,
                currency: doc.type === "letter" ? detectCurrency(it.text, "AED", lines) : (doc.currency || "AED"), total: round(totalV, 2), vat: round(vatV, 2), paid: round(num(paid), 2),
                description: (doc.items || []).map(i => i.name).filter(Boolean).slice(0, 2).join(", ").slice(0, 120),
                account: this.guessCategory(lines, kind, doc, vendor)
            };
            // Paid by card: from the bank account (in the receipt's currency when there is one); cash: petty cash
            if (kind === "expense") {
                const banks = Finance.bankAccounts().filter(a => a.subtype === "bank");
                const card = this.tenderOf(lines) === "card";
                const bank = banks.find(a => (a.currency || "AED") === it.data.currency) || banks.find(a => (a.currency || "AED") === "AED") || banks[0];
                it.data.paidThrough = ((card && bank) || Finance.role("cash") || Finance.bankAccounts()[0] || {}).id;
            }
            // The date the original was paid, when it says so
            const paidOn = labelledValue(lines, /\b(date\s*paid|payment\s*date|paid\s*on|date\s*of\s*payment)\b/i, true, it.monthFirst);
            if (paidOn && paid > 0) it.data.paidDate = paidOn;
            if (noDate) { it.data.date = ""; it.issues = it.issues.filter(i => !/today.s date was used/.test(i)); it.issues.push("No date found on the document; enter it."); }
            if (!it.data.total) it.issues.push("No total found.");
            if (["bill", "vendorCredit"].includes(kind) && !it.data.number) it.issues.push("No document number found.");
            this.checkDuplicate(it);
            return;
        }
        if (typeof PACK_KINDS !== "undefined" && PACK_KINDS[kind]) {
            if (kind === "pack") return this.extractPack(it);
            if (kind === "payslips") return this.extractPayslips(it);
            if (kind === "salaryLedger") return this.extractSalaryLedger(it);
            if (kind === "commissionLedger") return this.extractCommissionLedger(it);
            if (kind === "statements") return this.extractStatements(it);
        }
        if (kind === "bank") return this.extractBank(it);
        if (kind === "journal" || kind === "tb" || kind === "ledger") return this.extractAccounts(it);
    },

    guessCategory(lines, kind, doc = null, vendor = "") {
        if (kind === "invoice" || kind === "creditNote") return "";
        // What was bought counts most, then the vendor, then the rest of the page (without our own name and address)
        const own = Store.settings.company || {};
        const ownBits = [own.name, ...(String(own.address || "").split(/\n|,/))].map(x => String(x || "").trim().toLowerCase()).filter(x => x.length > 3);
        const page = lines.map(l => l.text).filter(t => !ownBits.some(o => t.toLowerCase().includes(o)) && !/\b(iban|bank|account|trn|tel|phone|email|www)\b/i.test(t)).join(" ");
        const sources = [[(doc?.items || []).map(i => `${i.name || ""} ${i.desc || ""}`).join(" "), 3], [vendor, 2], [page, 1]].map(([t, w]) => [String(t || "").toLowerCase(), w]);
        const by = [
            [/\b(rent|lease|flexi\s*desk|office\s*space|tenancy|ejari)\b/, "6000"], [/\b(salary|salaries|payroll|wages)\b/, "6010"],
            [/\b(dewa|sewa|addc|fewa|electricity|water\s*bill|utility|utilities|chiller|empower)\b/, "6020"],
            [/\b(etisalat|telecom\w*|internet|mobile|broadband|landline|phone\s*bill|postpaid|prepaid)\b/, "6030"],
            [/\b(du|sim)\b/, "6030", 2],                                                          // short words: only from the vendor or the items
            [/\b(goods|components?|movements?|materials?|stock|inventory|merchandise|spare\s*parts|raw|watch(es)?|wholesale|resale|units?\s*for\s*sale)\b/, "5000", 2],
            [/\b(flight|air\s*ticket|airline|airways|emirates\s*airline|flydubai|hotel|taxi|careem|uber|travel|trip|visa\s*fee|fuel|petrol|diesel|litres?|adnoc|enoc|eppco|salik|parking|rta)\b/, "6040"],
            [/\b(restaurant|cafe|caf[ée]|coffee|latte|meal|dinner|lunch|breakfast|food|starbucks|muffin|catering)\b/, "6050"],
            [/\b(stationery|stationers|office\s*supplies|printer|toner|paper|stapler|folders?|files|sticky\s*notes|pens?|chair|desk|furniture|mouse|keyboard|hub|usb|cables?|monitor|laptop|computer\s*accessor(y|ies)|headset|webcam)\b/, "6060"],
            [/\b(software|subscription|saas|licen[cs]e\s*fee|microsoft|adobe|zoom|aws|cloud|hosting|domain|email|backup|users?)\b/, "6070"],
            [/\b(legal|lawyer|advocate|attorney|notary|agreement|contract\s*review|trademark|audit|auditor|accounting|bookkeeping|consult(ant|ing|ancy))\b/, "6080"],
            [/\b(bank\s*charges?|bank\s*fee|commission\s*charge)\b/, "6090"],
            [/\b(advert|advertising|ads|marketing|campaign|social\s*media|seo|google\s*ads|meta\s*ads|linkedin|instagram|facebook|content|branding|printing\s*of\s*flyers)\b/, "6100"],
            [/\b(licen[cs]e\s*renewal|trade\s*licen[cs]e|freezone|free\s*zone\s*authority|government|immigration|ministry|mohre|establishment\s*card|emirates\s*id)\b/, "6110"],
            [/\b(insurance|premium|policy)\b/, "6120"], [/\b(repairs?|maintenance|servicing|ac\s*service|plumbing|cleaning|replac(e|ed|ement)|motherboard|labou?r\s*charges?)\b/, "6130"],
            [/\b(courier|shipping|shipments?|aramex|dhl|fedex|ups|express\s*delivery)\b/, "6140"], [/\b(freight|customs|duty|clearing|clearance)\b/, "5100"]
        ];
        const score = new Map();
        for (const [text, w] of sources) for (const [re, code, minW] of by) { if (minW && w < minW) continue; const m = text.match(new RegExp(re.source, "g")); if (m) score.set(code, (score.get(code) || 0) + w * m.length); }
        const ranked = [...score].sort((a, b) => b[1] - a[1]);
        for (const [code] of ranked) { const a = (Server.fin.account || []).find(x => x.code === code && !x.archived); if (a) return a.id; }
        const def = kind === "expense" ? "acc_6190" : (Store.settings.finance?.defaults?.purchaseAccount || "acc_5000");
        return (Server.fin.account || []).some(a => a.id === def) ? def : ((Server.fin.account || []).find(a => a.type === "expense") || {}).id;
    },

    checkDuplicate(it) {
        const d = it.data;
        let dup = null;
        if (it.kind === "bill" || it.kind === "vendorCredit") dup = (Server.fin[it.kind] || []).find(b => d.number && Finance.sameName(b.number, d.number) && sameCompany(b.vendorName || "", d.contact || ""));
        else if (it.kind === "invoice" || it.kind === "creditNote") dup = Store.data.docs.find(x => x.type === it.kind && d.number && Finance.sameName(x.number, d.number));
        else if (it.kind === "expense") dup = (Server.fin.expense || []).find(e => e.date === d.date && Math.abs(num(e.amount) - d.total) < 0.01 && (!d.contact || sameCompany(e.vendorName || "", d.contact)));
        // the same document twice in this batch
        const twin = this.items.find(o => o !== it && o.kind === it.kind && o.data && o.status === "ready" && o.data.number && o.data.number === d.number && o.data.total === d.total && o.data.contact === d.contact);
        if (dup) { it.duplicate = true; it.include = false; it.issues.unshift("Already in the books — left out."); }
        else if (twin) { it.duplicate = true; it.include = false; it.issues.unshift(`Same as ${twin.name} — left out.`); }
    },

    /* Bank statement: date, description, money in / out, balance */
    extractBank(it) {
        const lines = it.read.lines;
        const head = lines.find(l => /date/i.test(l.text) && /(debit|withdraw|paid\s*out|dr\b|amount)/i.test(l.text) && /(credit|deposit|paid\s*in|cr\b|balance)/i.test(l.text));
        const col = re => { const c = head && head.cells.find(x => re.test(x.text)); return c ? (c.x0 + c.x1) / 2 : null; };
        const xDebit = col(/debit|withdraw|paid\s*out|^dr$/i), xCredit = col(/credit|deposit|paid\s*in|^cr$/i), xBal = col(/balance/i), xAmt = col(/^amount/i);
        const rows = [];
        let prevBal = null, opening = null, closing = null;
        const balLine = lines.find(l => /opening\s*balance|balance\s*(b\/f|brought\s*forward)|previous\s*balance/i.test(l.text));
        if (balLine) { const m = balLine.text.match(/-?\d[\d,]*\.\d{2}/g); if (m) prevBal = opening = parseAmount(m[m.length - 1]); }
        const startIdx = head ? lines.indexOf(head) + 1 : 0;
        // A description that wraps onto lines of its own: it belongs to the row next to it
        let pending = [], lastRow = null;
        const flush = () => { if (pending.length && pending.length <= 2 && lastRow) { lastRow.description = (lastRow.description === "Bank line" ? "" : lastRow.description + " ") + pending.join(" "); lastRow.description = lastRow.description.slice(0, 200); } pending = []; };
        for (const l of lines.slice(startIdx)) {
            if (/opening\s*balance|brought\s*forward|closing\s*balance|carried\s*forward|total/i.test(l.text)) {
                flush(); lastRow = null;
                if (/closing|carried/i.test(l.text)) { const m = l.text.match(/-?\d[\d,]*\.\d{2}/g); if (m) closing = parseAmount(m[m.length - 1]); }
                continue;
            }
            let date = this.lineDate(l);
            // A garbled date on a scan (05-Oc1-2026): keep the day and year, take the month from the rows around it
            if (!date && it.method === "ocr") {
                const m = /^(\d{1,2})[-\/. ]\S{1,4}[-\/. ](\d{4})$/.exec((l.cells[0] || {}).text || "");
                if (m && rows.length) date = `${m[2]}-${rows[rows.length - 1].date.slice(5, 7)}-${String(m[1]).padStart(2, "0")}`;
                if (date && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) date = null;
            }
            if (!date) {
                const words = l.text.replace(/\s+/g, " ").trim();
                if (rows.length || pending.length || lastRow === null) { if (words && !/[\d,]+\.\d{2}\s*$/.test(words) && !/^page\s*\d|statement|continued/i.test(words) && words.length < 120) pending.push(words); }
                continue;
            }
            const ocrFix = t => {
                if (it.method !== "ocr") return t;
                t = t.replace(/(\d)\s+(\d{2})(?!\d)/g, "$1.$2");                                                         // 116.795 20 → 116.795.20
                return /^[+-]?\d{3,9}$/.test(t.replace(/\s/g, "")) ? t.replace(/\s/g, "").replace(/(\d{2})$/, ".$1") : t;   // a dropped decimal point
            };
            const nums = l.cells.flatMap(c => {
                // OCR may merge the last columns into one cell: split it into its amounts
                const parts = it.method === "ocr" ? (c.text.match(/[+-]?\d[\d,.]*\d/g) || []).filter(t => t.length >= 3 && !/^\d{1,2}[\/.-]\d{1,2}/.test(t)) : [c.text];
                if (parts.length > 1) { const wdt = (c.x1 - c.x0) / parts.length; return parts.map((t, i) => ({ c: { text: ocrFix(t), x0: c.x0 + i * wdt, x1: c.x0 + (i + 1) * wdt }, v: parseAmount(ocrFix(t)) })); }
                const t = ocrFix(c.text);
                return [{ c: { ...c, text: t, orig: c }, v: this.isDateText(c.text) ? null : parseAmount(t) }];
            }).filter(x => x.v !== null && /[.,]\d{2}\b|^\d{1,3}(,\d{3})+$/.test(x.c.text.replace(/\s/g, "")));
            // The description, without the dates written in the same cell
            const stripDates = t => { let out = t; for (const d of findDates(t, this._mf)) out = out.replace(d.raw, " "); return out; };
            const desc = l.cells.filter(c => !nums.some(n => n.c === c || n.c.orig === c) && !/^[+-]?[\d,.\s]+$/.test(c.text)).map(c => stripDates(c.text)).join(" ").replace(/\s+/g, " ").trim();
            if (!nums.length) continue;
            const near = (n, x) => x !== null && Math.abs((n.c.x0 + n.c.x1) / 2 - x) < 0.08;
            let amount = null, bal = null;
            if (head && (xDebit !== null || xCredit !== null || xAmt !== null)) {
                for (const n of nums) {
                    if (xBal !== null && near(n, xBal)) bal = n.v;
                    else if (xDebit !== null && near(n, xDebit)) amount = -Math.abs(n.v);
                    else if (xCredit !== null && near(n, xCredit)) amount = Math.abs(n.v);
                    else if (xAmt !== null && near(n, xAmt)) amount = n.v;
                }
            }
            if (amount === null) {
                // No column layout: the last figure is the balance; the change in balance gives the sign
                if (nums.length >= 2) { bal = nums[nums.length - 1].v; const a = Math.abs(nums[nums.length - 2].v); amount = prevBal !== null ? (bal >= prevBal ? a : -a) : (/(cr|credit|deposit|inward|received|salary)/i.test(desc) ? a : -a); }
                else { const v = nums[0].v; amount = /\bcr\b|credit|deposit|inward|received/i.test(l.text) ? Math.abs(v) : v < 0 ? v : -Math.abs(v); }
            }
            if (bal !== null && prevBal !== null && Math.abs(Math.abs(bal - prevBal) - Math.abs(amount)) < 0.011) amount = bal - prevBal >= 0 ? Math.abs(amount) : -Math.abs(amount);
            if (bal !== null) prevBal = bal;
            if (!amount) continue;
            // Wrapped text before this row goes with it when it has none of its own; otherwise with the row before
            let full = desc;
            if (pending.length) { if (!desc) { full = pending.join(" "); pending = []; } else flush(); }
            const row = { date, description: full.slice(0, 200) || "Bank line", reference: "", amount: round(amount, 2) };
            rows.push(row); lastRow = row;
        }
        flush();
        for (const row of rows) {
            const ref = /\b(ref|txn|fts?|tt)\s*(?:no\.?)?\s*[:#]?\s*([A-Z]{0,4}\d[A-Z0-9-]{4,})/i.exec(row.description) || /\b((?:INV|BILL|PO)[-\/]?[A-Z0-9-]*\d[A-Z0-9\/-]*)/i.exec(row.description);
            if (ref) row.reference = ref[2] || ref[1];
        }
        if (closing === null && prevBal !== null) closing = prevBal;
        // The balance says what moved: a line whose sign was misread is the one whose flip makes it add up
        if (opening !== null && closing !== null && rows.length) {
            const want = round(closing - opening, 2), got = round(rows.reduce((s2, r) => s2 + r.amount, 0), 2);
            if (Math.abs(want - got) > 0.02) { const r = rows.find(x => Math.abs(Math.abs(want - got) / 2 - Math.abs(x.amount)) < 0.011 && Math.sign(got - want) === Math.sign(x.amount)); if (r) r.amount = -r.amount; }
        }
        // Which of our bank accounts?
        const text = it.text.replace(/\s/g, "").toUpperCase();
        const banks = Finance.bankAccounts();
        let acc = null;
        for (const b of Store.settings.banks || []) {
            const iban = ((b.lines || []).find(l => /iban/i.test(l[0])) || [])[1];
            const accNo = ((b.lines || []).find(l => /account\s*(no|number)/i.test(l[0])) || [])[1];
            if ((iban && text.includes(iban.replace(/\s/g, "").toUpperCase())) || (accNo && accNo.replace(/\s/g, "").length > 5 && text.includes(accNo.replace(/\s/g, "").toUpperCase()))) { acc = banks.find(a => a.bankId === b.id); if (acc) break; }
        }
        const cur = detectCurrency(it.text, "AED", lines);
        // Otherwise by the bank's name (and the statement's currency); never a guess at another bank
        const BANKS = ["mashreq", "emirates nbd", "enbd", "wio", "adcb", "abu dhabi commercial", "first abu dhabi", "fab", "rakbank", "rak bank", "commercial bank of dubai", "cbd", "dubai islamic", "dib", "adib", "abu dhabi islamic", "hsbc", "citi", "standard chartered", "emirates islamic", "ajman bank", "sharjah islamic", "liv", "zand", "ruya", "mbank", "nbf", "uab", "invest bank", "arab bank", "barclays", "ubs", "hdfc", "icici", "sbi"];
        const head12 = lines.slice(0, 15).map(l => l.text).join(" ").toLowerCase();
        const named = BANKS.filter(n => new RegExp(`\\b${n}\\b`).test(head12));
        if (!acc && named.length) {
            const nameOf = a => { const b = (Store.settings.banks || []).find(x => x.id === a.bankId) || {}; return [a.name, a.label, b.name, b.label, ...(b.lines || []).map(l => l.join(" "))].join(" ").toLowerCase(); };
            const hits = banks.filter(a => a.subtype === "bank" && named.some(n => new RegExp(`\\b${n}\\b`).test(nameOf(a))));
            acc = hits.find(a => (a.currency || "AED") === cur) || hits[0] || null;
        }
        if (!acc && !named.length) acc = banks.find(a => a.subtype === "bank" && (a.currency || "AED") === cur) || banks.find(a => a.subtype === "bank");
        it.data = { accountId: acc?.id || "", rows, opening, closing, currency: cur, date: rows.length ? rows[rows.length - 1].date : todayISO(), total: round(rows.reduce((s, r) => s + r.amount, 0), 2) };
        if (!rows.length) it.issues.push("No bank lines found.");
        if (!acc) it.issues.push("Choose which bank account this statement is for.");
        if (opening !== null && closing !== null && rows.length && Math.abs(opening + it.data.total - closing) > 0.02) it.issues.push(`The lines add up to ${fmt(it.data.total)}, but the balance moved by ${fmt(closing - opening)}. Some lines may be missing.`);
    },

    /* Journals, trial balances and ledgers: account names with debits and credits */
    matchAccount(name) {
        const s = String(name || "").trim();
        if (!s) return null;
        const accs = (Server.fin.account || []).filter(a => !a.archived);
        const code = /^(\d{3,6})\b/.exec(s);
        if (code) { const a = accs.find(x => x.code === code[1]); if (a) return a; }
        const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(a\/c|ac|account|accounts|the|and|of|to|for|expense|expenses|exp)\b/g, " ").split(/\s+/).filter(Boolean);
        const words = norm(s.replace(/^\d+\s*/, ""));
        const syn = [
            [/petty\s*cash|cash\s*(in\s*)?hand|^cash$/i, "cash"], [/debtor|receivable/i, "ar"], [/creditor|payable(?!.*(vat|salar))/i, "ap"], [/output\s*vat|vat\s*payable|vat\s*output/i, "vat_out"], [/input\s*vat|vat\s*(recoverable|receivable|input)/i, "vat_in"],
            [/staff\s*advance|employee\s*advance|salary\s*advance/i, "staff_adv"], [/salar(y|ies)\s*payable|wages\s*payable/i, "salaries_payable"], [/retained/i, "retained"], [/opening\s*balance/i, "opening"],
            [/director|shareholder.*(loan|current)/i, "director"], [/exchange|forex|fx\s*(gain|loss)/i, "fx"], [/rounding/i, "rounding"], [/bank\s*charge/i, "bank_fees"]
        ];
        for (const [re, role] of syn) if (re.test(s)) { const a = accs.find(x => x.role === role); if (a) return a; }
        // a bank: match by the bank's name or currency
        if (/bank|wio|mashreq|enbd|emirates\s*nbd|adcb|fab|rakbank|cbd|hsbc|citi/i.test(s)) {
            const cur = (s.match(/\b(AED|USD|EUR|GBP|CHF|INR|SAR)\b/i) || [])[1];
            const banks = accs.filter(a => a.subtype === "bank");
            const hit = banks.find(a => words.some(w => w.length > 2 && a.name.toLowerCase().includes(w)) && (!cur || (a.currency || "AED") === cur.toUpperCase()));
            if (hit) return hit;
        }
        let best = null, bestScore = 0;
        for (const a of accs) {
            const aw = norm(a.name);
            if (!aw.length || !words.length) continue;
            const inter = words.filter(w => aw.some(x => x === w || (w.length > 4 && x.startsWith(w.slice(0, 5))))).length;
            const score = inter / Math.max(words.length, aw.length);
            if (score > bestScore) { bestScore = score; best = a; }
        }
        return bestScore >= 0.5 ? best : null;
    },
    extractAccounts(it) {
        const lines = it.read.lines, kind = it.kind;
        const head = lines.find(l => /debit|\bdr\b/i.test(l.text) && /credit|\bcr\b/i.test(l.text));
        const colX = re => { const c = head && head.cells.find(x => re.test(x.text)); return c ? (c.x0 + c.x1) / 2 : null; };
        const xD = colX(/debit|^dr\.?$/i), xC = colX(/credit|^cr\.?$/i);
        const dates = findDates(lines.slice(0, 15).map(l => l.text).join(" "), this._mf);
        const asOf = (() => { const m = lines.slice(0, 15).map(l => l.text).join(" ").match(/(as\s*(at|of|on)|ending|period\s*end(ed)?|to)\s*:?\s*(.{6,24})/i); const d = m ? findDates(m[4], this._mf)[0] : null; return d ? d.iso : dates.length ? dates[dates.length - 1].iso : todayISO(); })();
        const out = [];
        const startIdx = head ? lines.indexOf(head) + 1 : 0;
        let entries = [], ledgerAccount = null, closing = null;
        if (kind === "ledger") {
            const t = lines.slice(0, 12).map(l => l.text).join("\n");
            const m = /(?:ledger|account)\s*(?:name)?\s*[:\-–]\s*(.+)/i.exec(t) || /^(.+?)\s+ledger\b/im.exec(t);
            ledgerAccount = m ? m[1].trim().slice(0, 80) : "";
        }
        for (const l of lines.slice(startIdx)) {
            if (/^\s*(total|grand\s*total|difference)/i.test(l.text)) continue;
            const nums = l.cells.map(c => ({ c, v: this.isDateText(c.text) ? null : parseAmount(c.text) })).filter(x => x.v !== null && !/^\d{3,6}$/.test(x.c.text.trim()) || (x.v !== null && /[.,]/.test(x.c.text)));
            const amounts = nums.filter(x => /[.,]\d{1,2}$|^\d{1,3}(,\d{3})+/.test(x.c.text.trim()) || Math.abs(x.v) >= 1);
            if (!amounts.length) continue;
            const textCells = l.cells.filter(c => !amounts.some(a => a.c === c));
            const words = textCells.filter(c => !findDates(c.text, this._mf).length);
            // The account is the first text column; anything after it is the narration
            const name = (kind === "ledger" ? words.map(c => c.text).join(" ") : (words[0] || {}).text || "").replace(/\s+/g, " ").trim();
            const narration = kind === "ledger" ? "" : words.slice(1).map(c => c.text).join(" ").trim();
            if (!name || /^(date|particulars|account(\s*name)?|accounts|description|narration|account\s*head|ledger)\s*:?$/i.test(name)) continue;
            let debit = 0, credit = 0;
            const near = (a, x) => x !== null && Math.abs((a.c.x0 + a.c.x1) / 2 - x) < 0.09;
            if (xD !== null || xC !== null) {
                for (const a of amounts) { if (near(a, xD)) debit = Math.abs(a.v); else if (near(a, xC)) credit = Math.abs(a.v); }
                if (!debit && !credit && amounts.length) { const a = amounts[0]; if (xD !== null && xC !== null) { if (Math.abs((a.c.x0 + a.c.x1) / 2 - xD) < Math.abs((a.c.x0 + a.c.x1) / 2 - xC)) debit = Math.abs(a.v); else credit = Math.abs(a.v); } }
            } else {
                const v = amounts[0].v;
                if (/\bcr\b|credit/i.test(l.text) || v < 0) credit = Math.abs(v); else debit = Math.abs(v);
            }
            if (kind === "ledger") {
                const date = this.lineDate(l);
                if (/closing\s*balance|balance\s*c\/d|carried\s*forward/i.test(l.text)) { closing = { debit, credit, date }; continue; }
                if (date && (debit || credit)) entries.push({ date, memo: name.slice(0, 120), debit: round(debit, 2), credit: round(credit, 2) });
                continue;
            }
            if (!debit && !credit) continue;
            const acc = this.matchAccount(name);
            out.push({ accountText: name.slice(0, 80), memo: narration.slice(0, 120), accountId: acc?.id || "", debit: round(debit, 2), credit: round(credit, 2) });
        }
        const sum = k => round(out.reduce((s, x) => s + x[k], 0), 2);
        if (kind === "ledger") {
            const acc = this.matchAccount(ledgerAccount);
            const d = round(entries.reduce((s, e) => s + e.debit - e.credit, 0), 2);
            const bal = closing ? round(closing.credit - closing.debit, 2) : d;     // the balance c/d sits on the opposite side
            it.data = { date: closing?.date || (entries.length ? entries[entries.length - 1].date : asOf), accountText: ledgerAccount || "", accountId: acc?.id || "", entries, balance: bal, total: Math.abs(bal), contra: (Finance.role("opening") || {}).id };
            if (!acc) it.issues.push("Choose which account this ledger is for.");
            if (!entries.length) it.issues.push("No entries found.");
            return;
        }
        const ref = /\b(?:j\.?v\.?|journal|voucher|ref(?:erence)?)\s*(?:no\.?|number|#)?\s*[:#]?\s*((?=[\w\/-]*\d)[A-Z0-9][\w\/-]{1,20})/i.exec(lines.slice(0, 12).map(l => l.text).join(" "));
        const narr = /(?:narration|being|description|memo)\s*[:\-]\s*(.+)/i.exec(it.text);
        it.data = { date: kind === "tb" ? asOf : (dates[0]?.iso || todayISO()), number: ref ? ref[1] : "", notes: kind === "tb" ? `Opening balances as at ${fmtDate(asOf)} (imported trial balance)` : (narr ? narr[1].trim().slice(0, 160) : `Imported journal ${it.name}`), lines: out, total: Math.max(sum("debit"), sum("credit")), debit: sum("debit"), credit: sum("credit") };
        if (out.length < 2) it.issues.push("Fewer than two lines found.");
        const unmatched = out.filter(x => !x.accountId).length;
        if (unmatched) it.issues.push(`${unmatched} account${unmatched === 1 ? "" : "s"} to choose.`);
        if (kind === "journal" && Math.abs(it.data.debit - it.data.credit) > 0.005) it.issues.push(`Debits and credits differ by ${fmt(Math.abs(it.data.debit - it.data.credit))}.`);
        if (kind === "tb" && Math.abs(it.data.debit - it.data.credit) > 0.005) it.issues.push(`Debits and credits differ by ${fmt(Math.abs(it.data.debit - it.data.credit))}; the difference goes to Opening balance equity.`);
    },

    /* ---------- What still needs the person's attention ---------- */
    problems(it) {
        const d = it.data || {}, k = it.kind, p = [];
        if (k === "skip") return p;
        if (typeof PACK_KINDS !== "undefined" && PACK_KINDS[k]) return this.packProblems(it);
        if (k === "bank") { if (!d.accountId) p.push("bank account"); if (!d.rows?.length) p.push("no lines"); return p; }
        if (k === "journal" || k === "tb") { if (d.lines?.some(l => !l.accountId)) p.push("accounts"); if (k === "journal" && Math.abs(d.debit - d.credit) > 0.005) p.push("doesn't balance"); if ((d.lines || []).length < (k === "tb" ? 1 : 2)) p.push("lines"); return p; }
        if (k === "ledger") { if (!d.accountId) p.push("account"); if (!d.contra) p.push("other side"); if (!d.balance) p.push("zero balance"); return p; }
        if (k === "doc") return p;
        if (!d.date) p.push("date");
        if (!(num(d.total) > 0)) p.push("amount");
        if (!String(d.contact || "").trim()) p.push(k === "invoice" || k === "creditNote" ? "customer" : "vendor");
        if ((k === "bill" || k === "vendorCredit") && !String(d.number || "").trim()) p.push("number");
        if (["bill", "vendorCredit", "expense"].includes(k) && !d.account) p.push("category");
        if (k === "expense" && !d.paidThrough) p.push("paid through");
        if (d.currency !== "AED" && !num(LiveFX.rate(d.currency))) p.push("exchange rate");
        return p;
    },

    /* ---------- List ---------- */
    drawSoon() { if (this._raf) return; this._raf = setTimeout(() => { this._raf = null; this.draw(); }, 120); },
    draw() {
        if (!this.alive()) return;
        const its = this.items;
        const done = its.filter(i => ["ready", "error", "imported"].includes(i.status)).length;
        const reading = its.filter(i => ["reading", "ocr"].includes(i.status)).length;
        const pct = its.length ? Math.round((its.filter(i => ["ready", "error", "imported"].includes(i.status)).length + its.filter(i => ["reading", "ocr"].includes(i.status)).reduce((s, i) => s + (i.progress || 0) * 0.9, 0)) / its.length * 100) : 0;
        $("#fiProgress").innerHTML = its.length ? `<div class="fi-prog"><div class="fi-bar"><i style="width:${pct}%"></i></div><div class="fi-prog-text">${this.running ? `Reading ${done} of ${its.length} · ${reading} in progress${its.some(i => i.status === "ocr") ? " · text recognition running" : ""}` : `${its.length} file${its.length === 1 ? "" : "s"} read${this.stats ? ` in ${this.stats.secs < 60 ? this.stats.secs.toFixed(1) + " s" : Math.round(this.stats.secs / 60) + " min"}` : ""}`}</div></div>` : "";
        if (!its.length) { $("#fiList").innerHTML = ""; return; }
        const ready = its.filter(i => i.status === "ready" && i.include && i.kind !== "skip");
        const blocked = ready.filter(i => this.problems(i).length);
        const counts = {};
        its.filter(i => i.status === "ready").forEach(i => { counts[i.kind] = (counts[i.kind] || 0) + 1; });
        const banks = Finance.bankAccounts();
        const catOpts = Finance.accountOptions(a => a.type === "expense" || (a.type === "asset" && ["fixed", "inventory", "current"].includes(a.subtype)));
        const paidOpts = Finance.accounts().filter(a => !a.archived && (a.subtype === "bank" || a.subtype === "cash" || a.role === "director"));
        const allAcc = Finance.accountOptions();
        const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
        const body = it => {
            const d = it.data || {}, k = it.kind, i = it.id;
            const inp = (f, v, extra = "") => `<input data-f="${f}" data-id="${i}" value="${esc(v ?? "")}" ${extra}>`;
            if (it.status === "error") return `<span class="bad-text">${esc(it.error)}</span>`;
            if (it.status !== "ready" && it.status !== "imported") return `<span class="muted">${it.status === "ocr" ? "Recognising text…" : it.status === "reading" ? "Reading…" : "Waiting"}</span>`;
            if (it.status === "imported") return `<span class="good-text">${esc(it.result || "Imported")}</span>`;
            if (k === "skip") return '<span class="muted">Left out</span>';
            if (typeof PACK_KINDS !== "undefined" && PACK_KINDS[k]) return this.packBody(it, { inp, opt, allAcc, banks });
            if (k === "doc") return `<span class="muted">Saved to Documents as ${esc(DOC_TYPES[it.doc?.type]?.label || "a document")} ${esc(it.doc?.number || "")}, not in the accounts.</span>`;
            if (k === "bank") return `<div class="fi-fields"><label class="fi-wide">Bank account<select data-f="accountId" data-id="${i}"><option value="">Choose…</option>${opt(banks.map(a => [a.id, Finance.accountLabel(a)]), d.accountId)}</select></label><span class="fi-note">${d.rows.length} line${d.rows.length === 1 ? "" : "s"}, ${fmtDate(d.rows[0]?.date)} – ${fmtDate(d.rows[d.rows.length - 1]?.date)} · in ${fmt(d.rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0))} · out ${fmt(-d.rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0))}</span></div>`;
            if (k === "journal" || k === "tb") return `<div class="fi-fields"><label>Date${inp("date", d.date, 'type="date"')}</label>${k === "journal" ? `<label>Ref.${inp("number", d.number)}</label>` : ""}<span class="fi-note">${d.lines.length} lines · Dr ${fmt(d.debit)} · Cr ${fmt(d.credit)}</span></div>
<table class="fi-lines"><tbody>${d.lines.map((l, n) => `<tr><td>${esc(l.accountText)}</td><td><select data-line="${n}" data-id="${i}" class="${l.accountId ? "" : "need"}"><option value="">Choose account…</option>${opt(allAcc, l.accountId)}</select></td><td class="num">${l.debit ? fmt(l.debit) : ""}</td><td class="num">${l.credit ? fmt(l.credit) : ""}</td></tr>`).join("")}</tbody></table>`;
            if (k === "ledger") return `<div class="fi-fields"><label>Ledger of<select data-f="accountId" data-id="${i}" class="${d.accountId ? "" : "need"}"><option value="">Choose account…</option>${opt(allAcc, d.accountId)}</select></label><label>Balance on${inp("date", d.date, 'type="date"')}</label><label>Other side<select data-f="contra" data-id="${i}">${opt(allAcc, d.contra)}</select></label><span class="fi-note">“${esc(d.accountText || "")}” · ${d.entries.length} entries · balance ${fmt(Math.abs(d.balance))} ${d.balance >= 0 ? "Dr" : "Cr"}</span></div>`;
            const cur = `<select data-f="currency" data-id="${i}">${Object.keys(CURRENCIES).map(c => `<option${c === d.currency ? " selected" : ""}>${c}</option>`).join("")}</select>`;
            return `<div class="fi-fields">
<label>Date${inp("date", d.date, 'type="date"')}</label>
${k !== "expense" ? `<label>No.${inp("number", d.number)}</label>` : ""}
<label class="fi-wide">${k === "invoice" || k === "creditNote" ? "Customer" : "Vendor"}${inp("contact", d.contact)}</label>
<label>Total${`<span class="fi-amt">${cur}${inp("total", d.total, 'type="number" step="any"')}</span>`}</label>
<label>VAT${inp("vat", d.vat, 'type="number" step="any"')}</label>
${k === "bill" || k === "invoice" ? `<label title="Already paid on the original — recorded as a payment">Paid${inp("paid", d.paid || "", 'type="number" step="any" placeholder="0"')}</label>` : ""}
${["bill", "vendorCredit", "expense"].includes(k) ? `<label class="fi-wide">Category<select data-f="account" data-id="${i}">${opt(catOpts, d.account)}</select></label>` : ""}
${k === "expense" ? `<label>Paid through<select data-f="paidThrough" data-id="${i}">${opt(paidOpts.map(a => [a.id, Finance.accountLabel(a)]), d.paidThrough)}</select></label>` : ""}
</div>`;
        };
        $("#fiList").innerHTML = `
<div class="fi-summary">${Object.entries(counts).map(([k, n]) => `<span class="chip">${esc(FI_KINDS[k]?.short || k)} · ${n}</span>`).join("")}${its.some(i => i.status === "error") ? `<span class="chip chip-bad">Couldn't read · ${its.filter(i => i.status === "error").length}</span>` : ""}</div>
<div class="table-card fi-card"><table class="dtable fi-table"><thead><tr><th class="fi-check"><input type="checkbox" id="fiAll" aria-label="Select all" ${ready.length && ready.length === its.filter(i => i.status === "ready" && i.kind !== "skip").length ? "checked" : ""}></th><th>File</th><th>Read as</th><th>Details</th><th class="num">Amount</th><th>Check</th></tr></thead>
<tbody>${its.map(it => {
            const p = it.status === "ready" ? this.problems(it) : [];
            const amt = it.data && it.status !== "error" ? (it.kind === "bank" ? `${it.data.rows.length} lines` : it.data.count ? `${it.data.count} ${it.kind === "pack" ? "vouchers" : it.kind === "statements" ? "figures" : it.kind === "commissionLedger" ? "payments" : "months"}` : it.data.total ? fmt(it.data.total, it.data.currency || "AED") : "") : "";
            return `<tr class="fi-row ${it.status}" data-id="${it.id}">
<td class="fi-check">${it.status === "ready" ? `<input type="checkbox" data-inc="${it.id}" ${it.include && it.kind !== "skip" ? "checked" : ""} aria-label="Import ${esc(it.name)}">` : ""}</td>
<td class="fi-file"><b title="${esc(it.name)}">${esc(it.name)}</b><div class="small muted">${it.method === "ocr" ? `Scan, read at ${it.conf}%` : it.method ? "Digital file" : ""}${it.pages > 1 ? ` · ${it.pages} pages` : ""}${it.status === "ready" || it.status === "imported" ? ` · <button type="button" class="link-btn" data-text="${it.id}">View text</button>` : ""}</div>${["reading", "ocr"].includes(it.status) ? `<div class="fi-mini"><i style="width:${Math.round((it.progress || 0.05) * 100)}%"></i></div>` : ""}</td>
<td>${it.status === "ready" ? `<select data-kind="${it.id}" aria-label="Read as">${Object.entries(FI_KINDS).map(([k, v]) => `<option value="${k}"${k === it.kind ? " selected" : ""}>${v.short}</option>`).join("")}</select>` : it.status === "imported" ? esc(FI_KINDS[it.kind]?.short || "") : ""}</td>
<td class="fi-body">${body(it)}${it.issues?.length && it.status === "ready" ? `<div class="fi-issues">${it.issues.map(x => `<span class="${/^✓/.test(x) ? "fi-ok" : ""}">${esc(x)}</span>`).join("")}</div>` : ""}</td>
<td class="num">${amt}</td>
<td>${it.status === "imported" ? Finance.pill("good", "Imported") : it.status === "error" ? Finance.pill("bad", "Error") : it.status !== "ready" ? Finance.pill("neutral", "…") : it.duplicate && !it.include ? Finance.pill("mute", "Duplicate") : it.kind === "skip" || !it.include ? Finance.pill("mute", "Left out") : p.length ? `<span class="pill pill-warn" title="Missing: ${esc(p.join(", "))}">Check ${esc(p[0])}</span>` : Finance.pill("good", "Ready")}</td></tr>`;
        }).join("")}</tbody></table></div>
<div class="fi-actions"><span class="muted">${ready.length} selected${blocked.length ? ` · ${blocked.length} need${blocked.length === 1 ? "s" : ""} a detail before importing` : ""}</span><span class="push"></span><button type="button" class="btn btn-primary" id="fiGo" ${!ready.length || this.running || this.posting ? "disabled" : ""}>${icon("check")}<span>Import ${ready.length - blocked.length || ""} into the books</span></button></div>`;
        this.bind();
    },
    bind() {
        const find = id => this.items.find(i => i.id === id);
        $$("#fiList [data-inc]").forEach(c => c.addEventListener("change", () => { find(c.dataset.inc).include = c.checked; this.draw(); }));
        $("#fiAll")?.addEventListener("change", e => { this.items.filter(i => i.status === "ready" && i.kind !== "skip").forEach(i => { i.include = e.target.checked; }); this.draw(); });
        $$("#fiList [data-kind]").forEach(s => s.addEventListener("change", () => {
            const it = find(s.dataset.kind);
            it.kind = s.value; it.duplicate = false; it.include = s.value !== "skip";
            if (s.value !== "skip") { try { this.extract(it); } catch (e) { it.issues = [e.message]; } }
            this.draw();
        }));
        $$("#fiList [data-f]").forEach(inp => inp.addEventListener("change", () => {
            const it = find(inp.dataset.id);
            const f = inp.dataset.f;
            it.data[f] = inp.type === "number" ? num(inp.value) : inp.value;
            this.draw();
        }));
        $$("#fiList [data-line]").forEach(s => s.addEventListener("change", () => { const it = find(s.dataset.id); it.data.lines[Number(s.dataset.line)].accountId = s.value; this.draw(); }));
        $$("#fiList [data-text]").forEach(b => b.addEventListener("click", () => {
            const it = find(b.dataset.text);
            openDialog({ title: it.name, wide: true, body: `<pre class="fi-text">${esc(it.text || "")}</pre>`, actions: [{ label: "Close", value: "ok", primary: true }] });
        }));
        $("#fiGo")?.addEventListener("click", () => this.importAll());
        if (this.bindPack) this.bindPack();
    },

    /* ---------- Into the books ---------- */
    async importAll() {
        const todo = this.items.filter(i => i.status === "ready" && i.include && i.kind !== "skip" && !this.problems(i).length);
        if (!todo.length) return;
        this.posting = true; this.draw();
        let ok = 0, failed = 0;
        // Whole packs go one at a time, in order (payroll before journals, ledgers after), so each can see what the last one posted
        const order = it => (this.packOrder ? this.packOrder(it) : 4);
        const packs = todo.filter(i => typeof PACK_KINDS !== "undefined" && PACK_KINDS[i.kind]).sort((a, b) => order(a) - order(b));
        const q = todo.filter(i => !packs.includes(i));
        const run = async it => {
            try { it.result = await this.post(it); it.status = "imported"; ok++; }
            catch (e) { it.issues = [e.message, ...(it.issues || [])]; failed++; }
            this.drawSoon();
        };
        for (const it of packs.filter(i => order(i) < 4)) await run(it);
        const worker = async () => { for (let it = q.shift(); it; it = q.shift()) await run(it); };
        await Promise.all(Array.from({ length: 4 }, worker));
        for (const it of packs.filter(i => order(i) >= 4)) await run(it);
        this.posting = false;
        try { await Server.poll(); } catch { /* the next poll catches up */ }
        this.draw();
        toast(`${ok} imported${failed ? `, ${failed} need${failed === 1 ? "s" : ""} attention` : ""}. The dashboard and reports are up to date.`, failed ? "warn" : "good", 7000);
    },
    rateOf(cur) { return cur === "AED" ? 1 : num(LiveFX.rate(cur)); },
    /* The original shows money already paid: record it so the bill / invoice isn't shown as owed */
    async recordPaid(kind, target, amount, d) {
        const cur = target.currency || "AED";
        const banks = Finance.bankAccounts();
        const acc = (d.paidFrom && banks.find(a => a.id === d.paidFrom)) || banks.find(a => a.subtype === "bank" && (a.currency || "AED") === cur);
        if (!acc) return ` · paid ${fmt(amount, cur)} not recorded (no ${cur} bank account)`;
        const p = { id: uid(kind === "payment" ? "pay" : "bp"), date: d.paidDate || d.date, currency: cur, rate: this.rateOf(cur), amount: round(amount, decimalsFor(cur)), accountId: acc.id, method: "Bank transfer", reference: "Paid before import" };
        if (kind === "payment") Object.assign(p, { contactName: target.party?.name || d.contact, allocations: [{ docId: target.id, amount: p.amount }] });
        else Object.assign(p, { vendorName: target.vendorName, bankCharges: 0, allocations: [{ billId: target.id, amount: p.amount }] });
        try { const r = await Server.save(kind, p); return ` · paid ${fmt(amount, cur)} recorded (${r.object.number})`; }
        catch (e) { return ` · paid ${fmt(amount, cur)} NOT recorded: ${e.message}`; }
    },
    async post(it) {
        const d = it.data, k = it.kind;
        const note = `Imported from ${it.name}`;
        if (typeof PACK_KINDS !== "undefined" && PACK_KINDS[k]) return this.postPackKind(it);
        if (k === "bill" || k === "vendorCredit") {
            const vat = num(d.vat), total = num(d.total);
            const net = round(total - vat, 2);
            const rate = net > 0 && vat > 0 ? Math.round(vat / net * 100 * 100) / 100 : 0;
            const vatRate = Math.abs(rate - 5) < 0.6 ? 5 : rate;
            // Keep the original lines when they add up to the total; otherwise one line with the total
            const src = it.doc && (it.doc.items || []).filter(i => num(i.qty) && num(i.rate));
            const asLines = src && src.length ? src.map(i => ({ id: uid("l"), name: i.name || "", desc: i.desc || "", qty: num(i.qty), rate: num(i.rate), vat: num(i.vat), account: d.account, disc: num(i.disc), discType: i.discType || "amt" })) : null;
            const fits = asLines && Math.abs(computeTotals({ type: "bill", items: asLines, charges: [], discount: { type: "amt", value: 0 }, currency: d.currency, fx: {} }).total - total) < 0.02;
            const items = fits ? asLines : [{ id: uid("l"), name: d.description || (k === "bill" ? "As per supplier invoice" : "As per credit note"), desc: (src || []).map(i => i.name).filter(Boolean).slice(0, 12).join("\n"), qty: 1, rate: net, vat: vatRate, account: d.account, disc: 0, discType: "amt" }];
            // A vendor credit that names one of this vendor's open bills settles that bill
            let link = {};
            if (k === "vendorCredit") {
                const flat = it.text.replace(/\s+/g, "").toUpperCase();
                const bill = (Server.fin.bill || []).filter(b => b.status !== "void" && Finance.billBalance(b) > 0 && (b.currency || "AED") === d.currency && sameCompany(b.vendorName || "", d.contact || "") && b.number && String(b.number).replace(/\s+/g, "").length >= 3 && Finance.sameName(b.number, d.number) === false && flat.includes(String(b.number).replace(/\s+/g, "").toUpperCase()))
                    .sort((a, b) => String(b.number).length - String(a.number).length)[0];
                if (bill) link = { billId: bill.id, appliedAmount: round(Math.min(total, Finance.billBalance(bill)), 2) };
            }
            const res = await Server.save(k, { id: uid(k === "bill" ? "bill" : "vc"), ...link, number: d.number, vendorName: d.contact, date: d.date, due: k === "bill" ? (d.due && d.due >= d.date ? d.due : "") : undefined, currency: d.currency, rate: this.rateOf(d.currency),
                reference: "", items, charges: [], discount: { type: "amt", value: 0 }, notes: note, status: "open", attachments: [] });
            let extra = "";
            if (k === "bill" && num(d.paid) > 0) extra = await this.recordPaid("billPayment", res.object, Math.min(num(d.paid), total), d);
            if (link.billId) extra += ` · applied to bill ${(Server.fin.bill || []).find(b => b.id === link.billId)?.number || ""}`;
            return `${FI_KINDS[k].short} ${res.object.number}${extra}`;
        }
        if (k === "expense") {
            const total = num(d.total), vat = num(d.vat), net = total - vat;
            const vatRate = vat > 0 && net > 0 ? (Math.abs(vat / net * 100 - 5) < 0.6 ? 5 : Math.round(vat / net * 10000) / 100) : 0;
            const res = await Server.save("expense", { id: uid("exp"), date: d.date, accountId: d.account, paidThrough: d.paidThrough, amount: total, vatRate, inclusive: true, currency: d.currency, rate: this.rateOf(d.currency), vendorName: d.contact, description: d.description || note, reference: d.number || "", attachments: [] });
            return `Expense ${res.object.number}`;
        }
        if (k === "invoice" || k === "creditNote" || k === "doc") {
            const doc = JSON.parse(JSON.stringify(it.doc));
            doc.id = uid("d");
            if (k !== "doc") {
                doc.type = k; doc.date = d.date; doc.number = d.number || doc.number; doc.currency = d.currency;
                doc.party = { ...(doc.party || {}), name: d.contact };
                if (doc.currency !== "AED") doc.fx = { ...(doc.fx || {}), rate: num(doc.fx?.rate) || this.rateOf(doc.currency) };
                // keep the original figures when the lines didn't add up to the total
                const t = computeTotals({ ...doc, paid: 0 });
                if (Math.abs(t.total - num(d.total)) > 0.02) {
                    const vat = num(d.vat), net = round(num(d.total) - vat, 2);
                    doc.items = [{ id: uid("i"), name: d.description || "As per original document", desc: "", qty: 1, unit: "", rate: net, vat: net > 0 && vat > 0 ? (Math.abs(vat / net * 100 - 5) < 0.6 ? 5 : Math.round(vat / net * 10000) / 100) : 0, disc: 0, discType: "amt" }];
                    doc.charges = []; doc.discount = { type: "amt", value: 0 };
                }
            }
            doc.status = k === "invoice" ? (doc.status === "paid" ? "sent" : "sent") : k === "creditNote" ? "issued" : (DOC_TYPES[doc.type].statuses || ["draft"])[0];
            doc.auto = false;
            doc.import = { fileName: it.name, method: it.method, confidence: it.conf, importedAt: Date.now(), issues: it.issues, checked: true };
            if (Store.data.docs.some(x => x.type === doc.type && Finance.sameName(x.number, doc.number))) doc.number = `${doc.number} (imported)`;
            const saved = await Server.save("doc", doc);
            let extra = "";
            if (k === "invoice" && num(d.paid) > 0) extra = await this.recordPaid("payment", saved.object, Math.min(num(d.paid), num(d.total)), d);
            return `${DOC_TYPES[doc.type].label} ${saved.object.number}${extra}`;
        }
        if (k === "bank") {
            const r = await Server.post(`bank/accounts/${d.accountId}/import`, { rows: d.rows });
            return `${r.added ?? d.rows.length} bank line${(r.added ?? d.rows.length) === 1 ? "" : "s"} to review${r.duplicates ? ` (${r.duplicates} already there)` : ""}`;
        }
        if (k === "journal" || k === "tb") {
            const lines = d.lines.filter(l => l.debit || l.credit).map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo || l.accountText }));
            const diff = round(lines.reduce((s, l) => s + num(l.debit) - num(l.credit), 0), 2);
            if (k === "tb" && diff) { const ob = Finance.role("opening"); lines.push({ accountId: ob.id, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo: "Difference in the imported trial balance" }); }
            const res = await Server.save("journal", { id: uid("jv"), date: d.date, reference: d.number || "", notes: d.notes, lines });
            return `Journal ${res.object.number}`;
        }
        if (k === "ledger") {
            const b = num(d.balance);
            const res = await Server.save("journal", { id: uid("jv"), date: d.date, notes: `Balance of ${d.accountText || Finance.accountName(d.accountId)} brought in from ${it.name}`, lines: [
                { accountId: d.accountId, debit: b > 0 ? b : 0, credit: b < 0 ? -b : 0, memo: "Imported ledger balance" },
                { accountId: d.contra, debit: b < 0 ? -b : 0, credit: b > 0 ? b : 0, memo: "Imported ledger balance" }] });
            return `Journal ${res.object.number}`;
        }
        throw new Error("Choose what this document is.");
    }
};

/* A tiny counting semaphore */
class Semaphore {
    constructor(n) { this.n = n; this.q = []; }
    take() { if (this.n > 0) { this.n--; return Promise.resolve(); } return new Promise(r => this.q.push(r)); }
    give() { const r = this.q.shift(); if (r) r(); else this.n++; }
}
