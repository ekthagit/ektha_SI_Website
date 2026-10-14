/* ==========================================================
   Store: settings, documents, contacts, products.
   Saved in this browser's localStorage. Use Settings → Backup
   to move data between browsers or computers.
   ========================================================== */

const STORE_KEY = "evamdocs.v2";
const DRAFT_KEY = "evamdocs.v2.draft";
/* Drafts in EVAM Books are kept apart from the browser-only copy */
const draftKey = () => (typeof Server !== "undefined" && Server.online && Server.user ? `evambooks.draft.${Server.user.id}` : DRAFT_KEY);

const Store = {
    data: null,

    load() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { raw = null; }
        this.data = this.normalise(raw || {});
        this.migrateLegacy();
        return this.data;
    },

    normalise(raw) {
        const d = {
            version: APP_VERSION,
            settings: deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), raw.settings || {}),
            docs: Array.isArray(raw.docs) ? raw.docs : [],
            contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
            products: Array.isArray(raw.products) ? raw.products : [],
            migrated: raw.migrated || false
        };
        // banks are a list; keep the saved list as-is when present
        if (raw.settings && Array.isArray(raw.settings.banks)) d.settings.banks = raw.settings.banks;
        for (const t of Object.keys(DOC_TYPES)) {
            if (!d.settings.numbering[t]) d.settings.numbering[t] = { ...DEFAULT_NUMBERING[t] };
            if (d.settings.defaults.terms[t] === undefined) d.settings.defaults.terms[t] = DEFAULT_TERMS[t] || "";
            if (d.settings.defaults.footers[t] === undefined) d.settings.defaults.footers[t] = DOC_TYPES[t].footer;
        }
        d.docs = d.docs.map(doc => upgradeDoc(doc));
        return d;
    },

    /* The first version kept only an invoice counter in localStorage */
    migrateLegacy() {
        if (this.data.migrated) return;
        try {
            const old = parseInt(localStorage.getItem("invoiceCounter") || "0", 10);
            if (old > 1) this.data.settings.numbering.invoice.next = Math.max(this.data.settings.numbering.invoice.next, old);
        } catch (e) { /* ignore */ }
        this.data.migrated = true;
        this.save();
    },

    save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
            return true;
        } catch (e) {
            console.error(e);
            toast("Browser storage is full. Remove uploaded images in Settings or export a backup and clear old documents.", "bad", 8000);
            return false;
        }
    },

    get settings() { return this.data ? this.data.settings : DEFAULT_SETTINGS; },

    /* ---------- Documents ---------- */
    getDoc(id) { return this.data.docs.find(d => d.id === id); },

    saveDoc(doc) {
        const now = Date.now();
        const existing = this.data.docs.findIndex(d => d.id === doc.id);
        if (existing === -1) {
            // First save: claim the next number if it was generated automatically
            if (doc.auto) {
                const n = this.settings.numbering[doc.type];
                doc.seq = n.next;
                doc.number = formatNumber(doc.type, doc.seq, doc.date);
                while (this.numberTaken(doc)) { doc.seq++; doc.number = formatNumber(doc.type, doc.seq, doc.date); }
                n.next = doc.seq + 1;
            }
            doc.createdAt = doc.createdAt || now;
        }
        doc.updatedAt = now;
        doc.savedAt = now;
        const copy = JSON.parse(JSON.stringify(doc));
        if (existing === -1) this.data.docs.unshift(copy); else this.data.docs[existing] = copy;
        return this.save();
    },

    deleteDoc(id) {
        const d = this.getDoc(id);
        if (d && d.import && d.import.fileId && typeof FileStore !== "undefined") FileStore.remove(d.import.fileId);
        this.data.docs = this.data.docs.filter(d => d.id !== id);
        this.save();
    },

    numberTaken(doc) {
        return this.data.docs.some(d => d.id !== doc.id && d.type === doc.type && d.number.trim().toLowerCase() === doc.number.trim().toLowerCase());
    },

    /* ---------- Contacts & products ---------- */
    upsert(listName, item) {
        const list = this.data[listName];
        const i = list.findIndex(x => x.id === item.id);
        if (i === -1) list.push(item); else list[i] = item;
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        this.save();
    },
    remove(listName, id) {
        this.data[listName] = this.data[listName].filter(x => x.id !== id);
        this.save();
    },
    findByName(listName, name) {
        const n = (name || "").trim().toLowerCase();
        if (!n) return null;
        return this.data[listName].find(x => (x.name || "").trim().toLowerCase() === n) || null;
    },

    /* ---------- Draft autosave ---------- */
    saveDraft(doc) {
        try { localStorage.setItem(draftKey(), JSON.stringify(doc)); } catch (e) { /* storage full: ignore draft */ }
    },
    loadDraft() {
        try { const d = JSON.parse(localStorage.getItem(draftKey()) || "null"); return d ? upgradeDoc(d) : null; } catch (e) { return null; }
    },

    /* ---------- Backup ---------- */
    exportJSON() {
        return JSON.stringify({ ...this.data, exportedAt: new Date().toISOString(), app: "EVAM Documents" }, null, 2);
    },
    importJSON(text, mode = "replace") {
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== "object" || !raw.settings) throw new Error("This file is not an EVAM Documents backup.");
        const incoming = this.normalise(raw);
        if (mode === "merge") {
            const mergeList = (a, b) => { const ids = new Set(a.map(x => x.id)); return a.concat(b.filter(x => !ids.has(x.id))); };
            this.data.docs = mergeList(this.data.docs, incoming.docs);
            this.data.contacts = mergeList(this.data.contacts, incoming.contacts);
            this.data.products = mergeList(this.data.products, incoming.products);
            for (const t of Object.keys(DOC_TYPES)) {
                const mine = this.data.settings.numbering[t], theirs = incoming.settings.numbering[t];
                if (mine && theirs) mine.next = Math.max(num(mine.next), num(theirs.next));
            }
        } else {
            incoming.migrated = true;
            this.data = incoming;
        }
        this.save();
    }
};

function deepMerge(target, src) {
    for (const k of Object.keys(src || {})) {
        const v = src[k];
        if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
            deepMerge(target[k], v);
        } else if (v !== undefined) {
            target[k] = v;
        }
    }
    return target;
}

/* ---------- Numbering ---------- */
function formatNumber(type, seq, dateIso) {
    const n = Store.settings.numbering[type] || DEFAULT_NUMBERING[type];
    const d = parseISO(dateIso) || new Date();
    return n.pattern
        .replace(/\{YYYY\}/g, d.getFullYear())
        .replace(/\{YY\}/g, String(d.getFullYear()).slice(-2))
        .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, "0"))
        .replace(/\{M\}/g, d.getMonth() + 1)
        .replace(/\{DD\}/g, String(d.getDate()).padStart(2, "0"))
        .replace(/\{SEQ(\d)?\}/g, (_, p) => String(seq).padStart(Number(p || 1), "0"));
}

/* Where the signature and stamp sit and how big they are: offsets in mm from their
   usual place under "For <company>", and a size factor (1 = normal) */
const MARK_LIMITS = { x: 200, y: 280, sMin: 0.4, sMax: 3 };
function normMark(m) {
    m = m || {};
    const c = (v, lo, hi, d) => { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    return {
        x: round(c(m.x, -MARK_LIMITS.x, MARK_LIMITS.x, 0), 1),
        y: round(c(m.y, -MARK_LIMITS.y, MARK_LIMITS.y, 0), 1),
        s: round(c(m.s, MARK_LIMITS.sMin, MARK_LIMITS.sMax, 1), 2),
        r: Math.round(c(m.r, -180, 180, 0))
    };
}
const MARK_MODES = ["both", "sig", "stamp", "none"];
function normMarks(m) {
    m = m || {};
    return { mode: MARK_MODES.includes(m.mode) ? m.mode : "both", sig: normMark(m.sig), stamp: normMark(m.stamp) };
}
function marksAreDefault(m) {
    return m.mode === "both" && ["sig", "stamp"].every(k => m[k].x === 0 && m[k].y === 0 && m[k].s === 1 && !m[k].r);
}

/* ---------- New documents ---------- */
function newItem(over = {}) {
    const { id, ...rest } = over;
    return { name: "", desc: "", hs: "", unit: "", qty: 1, rate: 0, disc: 0, discType: "amt", vat: Store.settings.defaults.vat, ...rest, id: uid("i") };
}

function newDoc(type = "invoice") {
    const s = Store.settings;
    const t = DOC_TYPES[type];
    const date = todayISO();
    const seq = s.numbering[type].next;
    const cur = s.defaults.currency;
    const bank = s.banks.find(b => b.currency === cur) || s.banks[0];
    return upgradeDoc({
        id: uid("d"),
        type,
        title: t.title,
        number: formatNumber(type, seq, date),
        seq, auto: true,
        status: t.statuses[0],
        date,
        due: t.due ? addDays(date, type === "invoice" ? s.defaults.dueDays : 14) : "",
        valid: t.valid ? addDays(date, s.defaults.validDays) : "",
        ref: "",
        currency: cur,
        bankId: bank ? bank.id : "",
        showBank: !!t.bank,
        items: t.text ? [] : [newItem()],
        terms: s.defaults.terms[type] || "",
        footer: s.defaults.footers[type] ?? t.footer,
        signature: { show: type === "letter" ? true : s.defaults.showSignature, name: s.defaults.signatoryName, title: s.defaults.signatoryTitle },
        fx: { show: false, rate: cur === "USD" ? 3.6725 : "" },
        createdAt: null, updatedAt: Date.now(), savedAt: null
    });
}

/* Fill any missing fields so older or imported documents always render */
function upgradeDoc(doc) {
    const t = DOC_TYPES[doc.type] || DOC_TYPES.invoice;
    doc.type = DOC_TYPES[doc.type] ? doc.type : "invoice";
    doc.party = { name: "", attn: "", trn: "", address: "", phone: "", email: "", ...(doc.party || {}) };
    doc.ship = { same: true, name: "", address: "", phone: "", ...(doc.ship || {}) };
    doc.billTo = { useCompany: true, name: "", trn: "", address: "", phone: "", ...(doc.billTo || {}) };
    doc.items = Array.isArray(doc.items) ? doc.items.map(i => ({ discType: "amt", unit: "", desc: "", hs: "", ...i, id: i.id || uid("i") })) : [];
    doc.discount = { type: "amt", value: 0, ...(doc.discount || {}) };
    doc.charges = Array.isArray(doc.charges) ? doc.charges : [];
    doc.paid = num(doc.paid);
    doc.fx = { show: false, rate: "", ...(doc.fx || {}) };
    doc.columns = deepMerge(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)), doc.columns || {});
    doc.signature = { show: false, name: "", title: "", ...(doc.signature || {}) };
    if ((doc.type === "invoice" || doc.type === "creditNote") && !doc.taxTreatment) doc.taxTreatment = "standard";
    doc.signature.marks = normMarks(doc.signature.marks || (Store.settings && Store.settings.brand && Store.settings.brand.marks));
    doc.letter = { to: "", subject: "", body: "", showLeft: false, leftName: "", leftTitle: "", leftLabel: "", showRight: true, rightLabel: "", ...(doc.letter || {}) };
    const co = (Store.data && Store.settings.company) || DEFAULT_COMPANY;
    doc.res = {
        kind: "meeting", subject: "", time: "", venue: co.address || "", chair: (co.directors && co.directors[0] && co.directors[0].name) || "",
        directors: (co.directors || []).map(x => ({ name: x.name, title: x.title, present: true })),
        quorum: true, recitals: [""], resolutions: [""], close: true,
        certify: false, ...(doc.res || {})
    };
    if (!Array.isArray(doc.res.directors)) doc.res.directors = [];
    if (!Array.isArray(doc.res.recitals)) doc.res.recitals = [];
    if (!Array.isArray(doc.res.resolutions)) doc.res.resolutions = [];
    doc.import = doc.import || null;
    doc.layout = doc.layout || "";
    for (const k of ["title", "number", "status", "date", "due", "valid", "ref", "hsn", "deliveryTerms", "paymentTerms", "reason", "notes", "terms", "footer", "bankId"]) {
        if (doc[k] === undefined || doc[k] === null) doc[k] = "";
    }
    if (!doc.status) doc.status = t.statuses[0];
    if (doc.showBank === undefined) doc.showBank = !!t.bank;
    if (doc.receiver === undefined) doc.receiver = true;
    return doc;
}

/* ---------- Calculations ---------- */
function computeTotals(doc) {
    const cur = doc.currency;
    const dec = decimalsFor(cur);
    const r = v => round(v, dec);
    const unit = Math.pow(10, -dec);

    // 1. Each line before the additional discount
    const lines = doc.items.map(it => {
        const qty = num(it.qty), rate = num(it.rate), d = num(it.disc), vat = num(it.vat);
        const gross = r(qty * rate);
        const own = it.discType === "pct" ? r(gross * Math.min(Math.max(d, 0), 100) / 100) : Math.min(Math.max(d, 0), gross);
        return { qty, rate, gross, ownDisc: own, alloc: 0, vat, pct: it.discType === "pct" ? d : null };
    });
    const subtotal = r(lines.reduce((s, l) => s + l.gross, 0));
    const lineDiscount = r(lines.reduce((s, l) => s + l.ownDisc, 0));
    const netItems = r(subtotal - lineDiscount);

    // 2. Spread the additional discount over the lines so every row adds up and VAT reconciles
    const dv = num(doc.discount.value);
    const docDiscount = doc.discount.type === "pct" ? r(netItems * Math.min(Math.max(dv, 0), 100) / 100) : r(Math.min(Math.max(dv, 0), netItems));
    if (docDiscount > 0 && netItems > 0) {
        let left = docDiscount, biggest = -1;
        lines.forEach((l, i) => {
            const net = l.gross - l.ownDisc;
            l.alloc = r(docDiscount * net / netItems);
            left = r(left - l.alloc);
            if (biggest === -1 || net > lines[biggest].gross - lines[biggest].ownDisc) biggest = i;
        });
        if (Math.abs(left) >= unit / 2 && biggest > -1) lines[biggest].alloc = r(lines[biggest].alloc + left);
    }
    lines.forEach(l => {
        l.disc = r(l.ownDisc + l.alloc);
        l.net = r(l.gross - l.disc);
        l.vatAmt = r(l.net * l.vat / 100);
        l.total = r(l.net + l.vatAmt);
    });

    // 3. Other charges, then VAT grouped by rate from the rounded line amounts
    const charges = doc.charges.map(c => {
        const amount = r(num(c.amount)), vat = num(c.vat);
        return { label: c.label || "Other charges", amount, vat, vatAmt: r(amount * vat / 100) };
    });
    const groups = {};
    const add = (rate, taxable, vat) => {
        const k = String(rate);
        groups[k] = groups[k] || { rate, taxable: 0, vat: 0 };
        groups[k].taxable += taxable; groups[k].vat += vat;
    };
    lines.forEach(l => add(l.vat, l.net, l.vatAmt));
    charges.forEach(c => add(c.vat, c.amount, c.vatAmt));
    const vatGroups = Object.values(groups)
        .map(g => ({ rate: g.rate, taxable: r(g.taxable), vat: r(g.vat) }))
        .filter(g => g.taxable !== 0 || g.rate !== 0)
        .sort((a, b) => b.rate - a.rate);

    const chargesTotal = r(charges.reduce((s, c) => s + c.amount, 0));
    const discountTotal = r(lineDiscount + docDiscount);
    const taxable = r(subtotal - discountTotal + chargesTotal);
    const vatTotal = r(vatGroups.reduce((s, g) => s + g.vat, 0));
    const total = r(taxable + vatTotal);
    const paid = (DOC_TYPES[doc.type] || {}).paid ? r(num(doc.paid)) : 0;
    const balance = r(total - paid);
    const rate = num(doc.fx.rate);
    const fx = doc.fx.show && cur !== "AED" && rate > 0
        ? { rate, vat: round(vatTotal * rate, 2), total: round(total * rate, 2), taxable: round(taxable * rate, 2) }
        : null;
    const qtyTotal = lines.reduce((s, l) => s + l.qty, 0);

    return { lines, subtotal, lineDiscount, netItems, docDiscount, discountTotal, charges, chargesTotal, taxable, vatGroups, vatTotal, total, paid, balance, fx, qtyTotal, dec };
}

/* ---------- Money owed ----------
   An invoice is open until it is marked paid or cancelled. Drafts count: a saved invoice
   is money the business expects. Issued credit notes that name the invoice reduce what is owed. */
const CLOSED_INVOICE = ["paid", "cancelled"];

function creditsFor(inv) {
    if (typeof Server !== "undefined" && Server.online) return num(inv.credited);
    if (!Store.data) return 0;
    const n = String(inv.number || "").trim().toLowerCase();
    if (!n) return 0;
    return Store.data.docs
        .filter(c => c.type === "creditNote" && !["draft", "cancelled"].includes(c.status) && c.currency === inv.currency && String(c.ref || "").trim().toLowerCase() === n)
        .reduce((sum, c) => sum + computeTotals(c).total, 0);
}

/* What is still owed on an invoice after payments received and credit notes */
function invoiceBalance(inv) {
    if (inv.type !== "invoice" || CLOSED_INVOICE.includes(inv.status)) return 0;
    if (typeof Server !== "undefined" && Server.online) {
        // Payments and credit notes are recorded on the server
        const t = computeTotals({ ...inv, paid: 0 });
        return Math.max(0, round(t.total - num(inv.paid) - num(inv.credited), t.dec));
    }
    const t = computeTotals(inv);
    return Math.max(0, round(t.balance - creditsFor(inv), t.dec));
}

/* Status shown in lists: overdue, credited and expired are worked out from dates and balances */
function effectiveStatus(doc) {
    const today = todayISO();
    if (doc.type === "invoice" && !CLOSED_INVOICE.includes(doc.status)) {
        const owed = invoiceBalance(doc);
        if (owed <= 0 && computeTotals(doc).total > 0 && creditsFor(doc) > 0) return "credited";
        // No due date means due on the invoice date (the same rule as the reports)
        if (owed > 0 && (doc.due || doc.date) && (doc.due || doc.date) < today) return "overdue";
    }
    if ((doc.type === "quotation" || doc.type === "proforma") && ["draft", "sent"].includes(doc.status) && doc.valid && doc.valid < today) return "expired";
    return doc.status;
}

/* What the customer has to pay in full: invoice total less issued credit notes */
function amountDue(doc) {
    const t = computeTotals({ ...doc, paid: 0 });
    return Math.max(0, round(t.total - creditsFor(doc), t.dec));
}

/* Keep "amount received" and the status in step, and remember when money came in */
function syncPayment(doc, changedField) {
    if (doc.type !== "invoice" || (typeof Server !== "undefined" && Server.online)) return;
    const total = amountDue(doc);
    if (changedField === "status") {
        if (doc.status === "paid" && num(doc.paid) < total) { doc.paid = total; doc.paidAt = Date.now(); }
        if (["draft", "sent"].includes(doc.status) && num(doc.paid) >= total && total > 0) doc.paid = 0;
    } else if (changedField === "paid") {
        const p = num(doc.paid);
        if (p > 0) doc.paidAt = Date.now();
        if (CLOSED_INVOICE.includes(doc.status) && doc.status === "cancelled") return;
        if (p >= total && total > 0) doc.status = "paid";
        else if (p > 0) doc.status = "partial";
        else if (["paid", "partial"].includes(doc.status)) doc.status = "sent";
    }
}

/* Turn one document into another (quotation → invoice, invoice → delivery note…) */
function convertDoc(src, toType) {
    const d = newDoc(toType);
    const keep = ["currency", "bankId", "party", "ship", "items", "discount", "charges", "fx", "columns", "hsn", "notes"];
    keep.forEach(k => { d[k] = JSON.parse(JSON.stringify(src[k])); });
    d.items.forEach(i => { i.id = uid("i"); });
    d.ref = src.number;
    d.sourceId = src.id;
    if (toType === "creditNote") d.reason = "";
    return upgradeDoc(d);
}

function bankById(id) {
    return Store.settings.banks.find(b => b.id === id) || null;
}
