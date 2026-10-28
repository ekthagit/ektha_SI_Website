/* ==========================================================
   EVAM Documents — application
   ========================================================== */

const App = {
    doc: null,
    dirty: false,
    zoom: "fit",
    view: "create",
    rte: {},
    settingsTab: "company"
};

/* ---------- Small helpers ---------- */
function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
    const ks = p.split(".");
    let a = o;
    ks.slice(0, -1).forEach(k => { a = a[k] = a[k] || {}; });
    a[ks[ks.length - 1]] = v;
}
const T = () => DOC_TYPES[App.doc.type];

function toast(msg, tone = "", ms = 3200, action = null) {
    const el = document.createElement("div");
    el.className = "toast " + (tone ? "toast-" + tone : "");
    el.setAttribute("role", tone === "bad" ? "alert" : "status");
    el.innerHTML = `<span class="toast-ic" aria-hidden="true">${icon(tone === "good" ? "circleCheck" : tone === "bad" ? "alert" : tone === "warn" ? "alert" : "info", 18)}</span><span>${esc(msg)}</span>`;
    if (action) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = action.label;
        b.addEventListener("click", () => { action.fn(); el.remove(); });
        el.appendChild(b);
    }
    const box = $("#toasts");
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    requestAnimationFrame(() => Motion.toastIn(el));
    setTimeout(() => Motion.toastOut(el, () => el.remove()), ms);
}

/* ---------- Dialogs ---------- */
function openDialog({ title, body = "", actions = [{ label: "OK", value: "ok", primary: true }], wide = false, onOpen }) {
    const dlg = $("#dialog");
    const inner = $("#dialogInner");
    dlg.classList.toggle("dialog-wide", wide);
    inner.innerHTML = `
<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-dialog-close class="icon-btn" aria-label="Close">${icon("x")}</button></div>
<div class="dialog-body">${body}</div>
<div class="dialog-actions">${actions.map(a => `<button type="submit" value="${a.value}" class="btn ${a.primary ? "btn-primary" : a.danger ? "btn-danger" : "btn-ghost"}"${a.primary ? " autofocus" : ""}>${esc(a.label)}</button>`).join("")}</div>`;
    return new Promise(resolve => {
        const onClose = () => {
            dlg.removeEventListener("close", onClose);
            const data = {};
            $$("[name]", inner).forEach(el => { data[el.name] = el.type === "checkbox" ? el.checked : el.value; });
            resolve({ value: dlg.returnValue || "cancel", data });
        };
        dlg.addEventListener("close", onClose);
        $("[data-dialog-close]", inner).addEventListener("click", () => dlg.close("cancel"));
        // Enter in a text field confirms with the main button, never with Cancel
        inner.onkeydown = e => {
            if (e.key !== "Enter" || e.isComposing || e.shiftKey) return;
            const el = e.target;
            if (el.tagName !== "INPUT" || ["checkbox", "radio", "file", "button", "submit"].includes(el.type)) return;
            e.preventDefault();
            const main = $(".dialog-actions .btn-primary", inner) || $(".dialog-actions .btn-danger", inner);
            if (main) main.click();
        };
        dlg.returnValue = "";
        dlg.showModal();
        Motion.pop(dlg);
        if (onOpen) onOpen(inner);
    });
}

async function confirmDialog(message, okLabel = "Continue", danger = false, title = "Please confirm") {
    const r = await openDialog({
        title,
        body: `<p class="dialog-text">${esc(message)}</p>`,
        actions: [{ label: "Cancel", value: "cancel" }, { label: okLabel, value: "ok", primary: !danger, danger }]
    });
    return r.value === "ok";
}

/* ---------- Menus ---------- */
function showMenu(anchor, items, align = "left") {
    const menu = $("#menu");
    menu.innerHTML = items.map((it, i) => it.divider ? `<div class="menu-sep" role="separator"></div>`
        : it.heading ? `<div class="menu-heading">${esc(it.heading)}</div>`
        : `<button type="button" role="menuitem" class="menu-item${it.danger ? " danger" : ""}${it.active ? " active" : ""}" data-i="${i}"${it.disabled ? " disabled" : ""}>
             ${it.icon ? icon(it.icon) : ""}<span class="menu-label">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</span>
           </button>`).join("");
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = align === "right" ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    anchor.setAttribute("aria-expanded", "true");
    const close = () => {
        menu.hidden = true;
        anchor.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", outside, true);
        document.removeEventListener("keydown", keys, true);
    };
    const outside = e => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
    const keys = e => {
        const btns = $$(".menu-item:not([disabled])", menu);
        const i = btns.indexOf(document.activeElement);
        if (e.key === "Escape") { close(); anchor.focus(); e.preventDefault(); }
        else if (e.key === "ArrowDown") { (btns[i + 1] || btns[0]).focus(); e.preventDefault(); }
        else if (e.key === "ArrowUp") { (btns[i - 1] || btns[btns.length - 1]).focus(); e.preventDefault(); }
    };
    setTimeout(() => {
        document.addEventListener("mousedown", outside, true);
        document.addEventListener("keydown", keys, true);
    });
    $$(".menu-item", menu).forEach(b => b.addEventListener("click", () => {
        close();
        items[Number(b.dataset.i)].onClick();
    }));
    const first = $(".menu-item.active, .menu-item:not([disabled])", menu);
    if (first) first.focus();
}

/* ==========================================================
   INIT
   ========================================================== */
async function init() {
    try { Shell.init(); } catch (e) { console.error(e); }
    try { await Server.boot(); }
    catch (e) {
        document.body.innerHTML = `<div class="boot-error"><h1>EVAM Books can't start</h1><p>${esc(e.message)}</p><p><button onclick="location.reload()">Try again</button></p></div>`;
        return;
    }
    initMarks();
    LiveFX.start();

    // Static button labels with icons
    const setBtn = (id, ic, label) => { const b = $("#" + id); if (b) b.innerHTML = `${icon(ic)}<span>${label}</span>`; };
    setBtn("newBtn", "file", "New");
    $("#moreBtn").innerHTML = icon("more", 18);
    setBtn("saveBtn", "save", "Save");
    setBtn("printBtn", "print", "Print / PDF");
    setBtn("fxBtn", "swap", "FX rates");
    setBtn("exportCsvBtn", "download", "Export CSV");
    setBtn("docsNewBtn", "plus", "New document");
    setBtn("docsImportBtn", "upload", "Import");
    setBtn("newContactBtn", "plus", "Add contact");
    setBtn("newProductBtn", "plus", "Add product");
    $("#zoomOut").innerHTML = icon("minus");
    $("#zoomIn").innerHTML = icon("plus");
    $("#fxClose").innerHTML = icon("x");
    $$(".search-ic").forEach(s => { s.innerHTML = icon("search"); });
    $("#unitList").innerHTML = UNITS.map(u => `<option value="${u}">`).join("");

    // Which document to open: ?type=letter (old link), then the autosaved draft, then a fresh invoice
    const params = new URLSearchParams(location.search);
    const wanted = params.get("type");
    const draft = Store.loadDraft();
    if (wanted && DOC_TYPES[wanted]) {
        App.doc = newDoc(wanted);
    } else if (draft) {
        const saved = Store.getDoc(draft.id);
        App.doc = saved && (saved.savedAt || 0) >= (draft.updatedAt || 0) ? upgradeDoc(JSON.parse(JSON.stringify(saved))) : draft;
        App.dirty = !saved || (draft.updatedAt || 0) > (saved.savedAt || 0);
        if (!saved && !draft.savedAt) App.dirty = hasContent(draft);
    } else {
        App.doc = newDoc("invoice");
    }

    bindGlobal();
    refreshLists();
    buildForm();
    renderPreview(true);
    updateDocBar();
    if (Server.online) Finance.mountNav();
    route();
    window.addEventListener("hashchange", route);
    // Changes saved by this session or by colleagues: refresh what is on screen
    Server.on(() => {
        if (App.view === "documents") renderDocsView();
        if (App.view === "contacts") renderContactsView();
        if (App.view === "products") renderProductsView();
        if (App.view === "finance") Finance.refresh();
        if (App.view === "create") { renderPayBox(); updateSaveState(); }
        $("#navDocCount").textContent = Store.data.docs.length || "";
        LiveFX.start();          // picks up a changed live-rate provider or key
    });
    if (Server.online) Finance.mountNav();
    setInterval(updateSaveState, 30000);
}

function hasContent(doc) {
    const r = doc.res || {};
    return !!(doc.party.name || doc.items.some(i => i.name || num(i.rate)) || !htmlIsEmpty(doc.letter.body) || doc.letter.subject
        || (doc.type === "resolution" && (r.subject || (r.resolutions || []).some(x => String(x).trim()) || (r.recitals || []).some(x => String(x).trim()))));
}

/* ---------- Routing ---------- */
function route() {
    const v = (location.hash || "#create").slice(1);
    if (typeof HR !== "undefined" && HR.redirect) { const to = HR.redirect(v); if (to) { location.replace(to); return; } }   // HR: self-service sign-ins stay in their own area
    const ext = Shell.extView(v);
    const view = v.startsWith("finance") ? "finance" : ext ? ext : ["create", "documents", "import", "contacts", "products", "settings"].includes(v) ? v : "create";
    App.view = view;
    document.body.dataset.view = view;
    if (view !== "create" && $("#markBox")) $("#markBox").hidden = true;
    $$(".view").forEach(s => { s.hidden = s.id !== "view-" + view; });
    $$(".mainnav a").forEach(a => {
        const on = a.dataset.view === view;
        a.classList.toggle("on", on);
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (view === "documents") renderDocsView();
    if (view === "import") initImportView();
    if (view === "contacts") renderContactsView();
    if (view === "products") renderProductsView();
    if (view === "settings") renderSettings();
    if (view === "finance") Finance.route(v.slice(8));
    if (ext) Shell.routeExt(ext, v);
    if (view === "create") {
        if (App._settingsChanged) {
            App._settingsChanged = false;
            refreshAutoNumber();
            const top = $("#formPane").scrollTop;
            buildForm();
            $("#formPane").scrollTop = top;
            updateDocBar();
        }
        renderPreview(true);
        fitZoom();
    }
    if (view !== "finance" && !ext) document.title = view === "create" ? `${T().short} ${App.doc.number || ""} · ${APP_TITLE()}` : `${view[0].toUpperCase() + view.slice(1)} · ${APP_TITLE()}`;
    Shell.onRoute(view);
}

/* ---------- Global events ---------- */
function bindGlobal() {
    $("#typePicker").addEventListener("click", e => openTypeMenu(e.currentTarget));
    $("#newBtn").addEventListener("click", () => startNew(App.doc.type));
    $("#moreBtn").addEventListener("click", e => openMoreMenu(e.currentTarget));
    $("#saveBtn").addEventListener("click", () => saveCurrent());
    $("#printBtn").addEventListener("click", printCurrent);
    $("#statusSelect").addEventListener("change", e => {
        App.doc.status = e.target.value;
        syncPayment(App.doc, "status");
        const paidEl = $(`[data-bind="paid"]`);
        if (paidEl) paidEl.value = App.doc.paid || 0;
        changed();
    });

    $("#zoomIn").addEventListener("click", () => setZoom(currentZoom() + 0.1));
    $("#zoomOut").addEventListener("click", () => setZoom(currentZoom() - 0.1));
    $("#zoomLabel").addEventListener("click", () => { App.zoom = "fit"; fitZoom(); });
    new ResizeObserver(() => { if (App.zoom === "fit") fitZoom(); }).observe($("#desk"));

    $$(".seg.mobile-only button").forEach(b => b.addEventListener("click", () => {
        $$(".seg.mobile-only button").forEach(x => x.classList.toggle("on", x === b));
        $(".workspace").dataset.pane = b.dataset.pane;
        if (b.dataset.pane === "preview") { renderPreview(true); fitZoom(); }
    }));

    $("#fxBtn").addEventListener("click", () => FXPanel.open());
    $("#fxClose").addEventListener("click", () => $("#fxDialog").close());

    // Documents view
    $("#docsNewBtn").addEventListener("click", e => openTypeMenu(e.currentTarget, true));
    $("#docsImportBtn").addEventListener("click", () => { location.hash = "#import"; });
    $("#exportCsvBtn").addEventListener("click", exportCSV);
    $("#docSearch").addEventListener("input", debounce(renderDocsTable, 120));
    $("#docTypeFilter").addEventListener("change", renderDocsTable);
    $("#docStatusFilter").addEventListener("change", renderDocsTable);
    $("#newContactBtn").addEventListener("click", () => editContact(null));
    $("#contactSearch").addEventListener("input", debounce(renderContactsView, 120));
    $("#newProductBtn").addEventListener("click", () => editProduct(null));
    $("#productSearch").addEventListener("input", debounce(renderProductsView, 120));

    // Form pane: one delegated handler for every bound field
    const pane = $("#formPane");
    pane.addEventListener("input", onFormInput);
    pane.addEventListener("change", onFormChange);
    pane.addEventListener("click", onFormClick);

    document.addEventListener("keydown", e => {
        const mod = e.ctrlKey || e.metaKey;
        if (App.view !== "create" || $("#dialog").open) return;
        if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveCurrent(); }
        if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); printCurrent(); }
        if (mod && e.key === "Enter" && App.view === "create" && !T().text) { e.preventDefault(); addItem(); }
    });

    // Printing from the browser menu: render the current document so the page is never blank
    window.addEventListener("beforeprint", () => {
        if (!$("#printRoot").innerHTML.trim() && App.view === "create") {
            $("#printRoot").innerHTML = renderDocument(App.doc);
            const s = $("#printRoot .sheet"), live = $("#sheetHolder .sheet");
            if (live) { const sp = measureFrame(live); s.style.setProperty("--head-space", sp.head + "mm"); s.style.setProperty("--foot-space", sp.foot + "mm"); }
            document.body.classList.add("printing");
        }
    });
    // Never lose the last keystrokes when the tab is closed or reloaded
    const flush = () => { if (App.doc && !App._noFlush) Store.saveDraft(App.doc); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("afterprint", () => {
        $("#printRoot").innerHTML = "";
        document.body.classList.remove("printing");
        if (App._titleBeforePrint) { document.title = App._titleBeforePrint; App._titleBeforePrint = null; }
    });
}

/* ==========================================================
   DOCUMENT BAR
   ========================================================== */
function updateDocBar() {
    const t = T();
    $("#typePicker").innerHTML = `<span class="tp-kicker">Document</span><span class="tp-label">${esc(t.label)}</span>${icon("down", 14)}`;
    $("#barNumber").textContent = App.doc.number || "No number";
    const sel = $("#statusSelect");
    const eff = effectiveStatus(App.doc);
    const opts = t.statuses.includes(App.doc.status) ? t.statuses : [App.doc.status, ...t.statuses];
    const derived = s => Server.online && App.doc.type === "invoice" && (s === "paid" || s === "partial");
    sel.innerHTML = opts.map(s => `<option value="${s}"${derived(s) && s !== App.doc.status ? " disabled" : ""}>${STATUS[s].label}${s === App.doc.status && eff !== s ? ` · ${STATUS[eff].label.toLowerCase()}` : ""}${derived(s) && s !== App.doc.status ? " (record a payment)" : ""}</option>`).join("");
    sel.disabled = Server.online && App.doc.type === "invoice" && (App.doc.status === "paid" || App.doc.status === "partial");
    sel.title = sel.disabled ? "Paid and part paid follow the payments recorded against this invoice." : "";
    sel.value = App.doc.status;
    sel.dataset.tone = STATUS[effectiveStatus(App.doc)]?.tone || "neutral";
    updateSaveState();
    if (App.view === "create") document.title = `${t.short} ${App.doc.number || ""} · ${APP_TITLE()}`;
}

function updateSaveState() {
    const el = $("#saveState");
    const saved = Store.getDoc(App.doc.id);
    if (!saved) { el.textContent = hasContent(App.doc) ? "Not saved yet" : "New"; el.dataset.state = "new"; }
    else if (App.dirty) { el.textContent = "Unsaved changes"; el.dataset.state = "dirty"; }
    else { el.textContent = "Saved " + relTime(saved.savedAt); el.dataset.state = "saved"; }
    $("#navDocCount").textContent = Store.data.docs.length ? Store.data.docs.length : "";
}

function openTypeMenu(anchor, fromDocs = false) {
    const savedDoc = !fromDocs && !!Store.getDoc(App.doc.id);
    const items = [{ heading: fromDocs || savedDoc ? "Start a new document" : "Change this draft to" }];
    Object.entries(DOC_TYPES).forEach(([k, t]) => {
        items.push({
            label: t.label,
            hint: TYPE_HINTS[k],
            active: !fromDocs && k === App.doc.type,
            onClick: () => fromDocs ? startNew(k, true) : switchType(k)
        });
    });
    showMenu(anchor, items, fromDocs ? "right" : "left");
}

const TYPE_HINTS = {
    invoice: "Bill a customer, with bank details",
    proforma: "Request advance payment before supply",
    quotation: "Offer prices with a validity date",
    purchaseOrder: "Order goods from a vendor",
    salesOrder: "Confirm a customer's order before invoicing",
    creditNote: "Reduce or refund an invoice",
    deliveryNote: "Goods list without prices, signed on receipt",
    letter: "Letterhead letter, agreement or certificate",
    resolution: "Board meeting or written resolution of the directors"
};

/* Carry the document date across a type change; due and valid dates keep their offsets */
function keepDates(src, next) {
    if (!src.date || src.date === next.date) return;
    const shift = daysBetween(next.date, src.date);
    next.date = src.date;
    if (next.due) next.due = addDays(next.due, shift);
    if (next.valid) next.valid = addDays(next.valid, shift);
    if (next.auto) next.number = formatNumber(next.type, next.seq, next.date);
}

async function switchType(type) {
    if (type === App.doc.type) return;
    const saved = Store.getDoc(App.doc.id);
    if (!saved) {
        const src = App.doc;
        const crossing = !!T().text || !!DOC_TYPES[type].text;
        if (!crossing) {
            // Unsaved draft: keep the customer and items, change the type
            const keep = hasContent(src);
            const next = keep ? convertDoc(src, type) : newDoc(type);
            if (keep) {
                next.ref = src.ref;
                keepDates(src, next);
            }
            loadDoc(next, keep);
            if (keep) toast(`Changed to ${DOC_TYPES[type].label.toLowerCase()}. Customer and items were kept.`);
            return;
        }
        if (hasContent(src)) {
            const from = T(), to = DOC_TYPES[type];
            const msg = to.letter && !from.text ? "A letter has no item table. The customer becomes the letter’s recipient; the items will be dropped."
                : from.letter && !to.text ? "The letter text will be dropped. The recipient becomes the customer."
                : `The content of this ${from.label.toLowerCase()} will not carry over to ${/^[aeiou]/i.test(to.label) ? "an" : "a"} ${to.label.toLowerCase()}.`;
            if (!await confirmDialog(msg, `Change to ${DOC_TYPES[type].label.toLowerCase()}`, false, "Change document type")) return;
        }
        const next = newDoc(type);
        keepDates(src, next);
        if (DOC_TYPES[type].letter && !T().text) {
            next.letter.to = [src.party.attn, src.party.name, src.party.address].filter(s => String(s || "").trim()).join("\n");
        } else if (T().letter && !DOC_TYPES[type].text) {
            const lines = String(src.letter.to || "").split("\n").map(s => s.trim()).filter(Boolean);
            next.party.name = lines[0] || "";
            next.party.address = lines.slice(1).join("\n");
        }
        loadDoc(next, hasContent(next));
        return;
    }
    startNew(type);
}

async function startNew(type, goToCreate = false) {
    if (App.dirty && hasContent(App.doc)) {
        const ok = await confirmDialog("This document has unsaved changes. Start a new one anyway?", "Discard changes", true, "Unsaved changes");
        if (!ok) return;
    }
    loadDoc(newDoc(type), false);
    if (goToCreate) location.hash = "#create";
}

function loadDoc(doc, dirty = false) {
    MarkUI.sel = null;
    App.doc = upgradeDoc(doc);
    App.dirty = dirty;
    refreshAutoNumber();
    buildForm();
    $("#sheetHolder").innerHTML = "";
    renderPreview(true);
    updateDocBar();
    Store.saveDraft(App.doc);
    $("#formPane").scrollTop = 0;
}

async function openSaved(id) {
    const d = Store.getDoc(id);
    if (!d) return false;
    if (App.doc.id !== id && App.dirty && hasContent(App.doc)) {
        const ok = await confirmDialog("The document you are editing has unsaved changes. Open the other one anyway?", "Discard changes", true, "Unsaved changes");
        if (!ok) return false;
    }
    loadDoc(JSON.parse(JSON.stringify(d)), false);
    location.hash = "#create";
    return true;
}

function duplicateCurrent() {
    const src = App.doc;
    const d = JSON.parse(JSON.stringify(src));
    const fresh = newDoc(src.type);
    Object.assign(d, {
        id: fresh.id, number: fresh.number, seq: fresh.seq, auto: true,
        status: fresh.status, date: fresh.date, due: fresh.due, valid: fresh.valid,
        paid: 0, createdAt: null, savedAt: null, updatedAt: Date.now(), sourceId: null, import: null
    });
    d.items.forEach(i => { i.id = uid("i"); });
    loadDoc(d, true);
    toast(`Duplicated as ${d.number}. Save to keep it.`);
}

function openMoreMenu(anchor) {
    const doc = App.doc;
    const conv = CONVERSIONS[doc.type] || [];
    const saved = !!Store.getDoc(doc.id);
    const items = [
        { label: "Duplicate", icon: "copy", hint: "Same content, next number", onClick: duplicateCurrent }
    ];
    if (conv.length) {
        items.push({ heading: `Create from ${doc.number}` });
        conv.forEach(k => items.push({ label: DOC_TYPES[k].label, icon: "swap", hint: "Copies customer, items and currency", onClick: () => convertCurrent(k) }));
    }
    items.push({ divider: true });
    items.push({ label: saved ? "Delete document" : "Discard this draft", icon: "trash", danger: true, onClick: deleteCurrent });
    showMenu(anchor, items, "right");
}

async function deleteCurrent() {
    const doc = App.doc;
    const saved = !!Store.getDoc(doc.id);
    const msg = saved ? `Delete ${doc.number}? This cannot be undone.` : "Discard this draft and start again?";
    if (!await confirmDialog(msg, saved ? "Delete" : "Discard", true, saved ? "Delete document" : "Discard draft")) return;
    if (saved && !(await removeDoc(doc.id))) return;
    loadDoc(newDoc(doc.type), false);
    toast(saved ? `Deleted ${doc.number}.` : "Draft discarded.");
}

async function convertCurrent(type) {
    if (App.dirty && hasContent(App.doc)) {
        const r = await openDialog({
            title: "Save first",
            body: `<p class="dialog-text">${esc(`${App.doc.number} has changes that are not saved. Save them before creating the ${DOC_TYPES[type].label.toLowerCase()}?`)}</p>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: "Don’t save", value: "skip" }, { label: "Save and continue", value: "ok", primary: true }]
        });
        if (r.value === "cancel") return;
        if (r.value === "ok" && !(await saveCurrent())) return;
    }
    const src = App.doc;
    loadDoc(convertDoc(src, type), true);
    toast(`New ${DOC_TYPES[type].label.toLowerCase()} from ${src.number}. Save to keep it.`);
}

/* ==========================================================
   FORM
   ========================================================== */
function fieldHTML(o) {
    const id = "f_" + o.bind.replace(/\./g, "_");
    const attrs = [
        `id="${id}"`, `data-bind="${o.bind}"`,
        o.kind ? `data-kind="${o.kind}"` : "",
        o.placeholder ? `placeholder="${esc(o.placeholder)}"` : "",
        o.list ? `list="${o.list}"` : "",
        o.required ? `aria-required="true"` : "",
        o.attrs || ""
    ].join(" ");
    let control;
    if (o.type === "textarea") control = `<textarea ${attrs} rows="${o.rows || 3}"></textarea>`;
    else if (o.type === "select") control = `<select ${attrs}>${o.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
    else control = `<input ${attrs} type="${o.type || "text"}"${o.type === "number" ? ' step="any" inputmode="decimal"' : ""}>`;
    return `
<div class="field ${o.cls || ""}"${o.if ? ` data-if="${o.if}"` : ""}>
  <label for="${id}">${esc(o.label)}${o.required ? '<span class="req" aria-hidden="true">*</span>' : ""}${o.optional ? '<span class="opt">optional</span>' : ""}</label>
  ${o.addon ? `<div class="addon-wrap">${control}${o.addon}</div>` : control}
  ${o.hint ? `<div class="hint">${o.hint}</div>` : ""}
</div>`;
}

function checkHTML(o) {
    const id = "f_" + o.bind.replace(/\./g, "_");
    return `
<label class="check ${o.cls || ""}"${o.if ? ` data-if="${o.if}"` : ""} for="${id}">
  <input type="checkbox" id="${id}" data-bind="${o.bind}" data-kind="bool">
  <span class="check-box">${icon("check", 12)}</span>
  <span class="check-text">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span>
</label>`;
}

function sectionHTML(id, title, body, opts = {}) {
    return `
<details class="fsec" id="sec-${id}" ${opts.closed ? "" : "open"}>
  <summary><span class="fsec-title">${esc(title)}</span>${opts.aside ? `<span class="fsec-aside" id="aside-${id}">${opts.aside}</span>` : ""}<span class="fsec-chev">${icon("down", 14)}</span></summary>
  <div class="fsec-body">${body}</div>
</details>`;
}

function partyFields(prefix, label, opts = {}) {
    const list = opts.vendor ? "contactList" : "contactList";
    return `
<div class="grid-2">
  ${fieldHTML({ label: opts.nameLabel || "Name", bind: `${prefix}.name`, required: opts.required, list, placeholder: opts.vendor ? "Vendor or supplier name" : "Customer or company name", cls: "span-2", attrs: 'autocomplete="off"' })}
  ${opts.attn !== false ? fieldHTML({ label: "Contact person", bind: `${prefix}.attn`, optional: true }) : ""}
  ${opts.trn !== false ? fieldHTML({ label: "TRN / VAT no.", bind: `${prefix}.trn`, optional: true }) : ""}
  ${fieldHTML({ label: "Address", bind: `${prefix}.address`, type: "textarea", rows: 3, cls: "span-2" })}
  ${fieldHTML({ label: "Phone", bind: `${prefix}.phone`, type: "tel" })}
  ${opts.email !== false ? fieldHTML({ label: "Email", bind: `${prefix}.email`, type: "email", optional: true }) : ""}
</div>`;
}

function buildForm() {
    const doc = App.doc;
    const t = T();
    const pane = $("#formPane");
    App.rte = {};
    let html = "";

    if (t.resolution) {
        html += resolutionFormHTML(doc);
    } else if (t.letter) {
        html += sectionHTML("letter", "Letter", `
<div class="grid-2">
  ${fieldHTML({ label: "Our reference", bind: "number", placeholder: "e.g. EVAM/26/001", addon: autoNumberAddon() })}
  ${fieldHTML({ label: "Date", bind: "date", type: "date" })}
  ${fieldHTML({ label: "To", bind: "letter.to", type: "textarea", rows: 3, cls: "span-2", placeholder: "Recipient name, company and address", optional: true })}
  ${fieldHTML({ label: "Heading", bind: "title", cls: "span-2", optional: true, placeholder: "e.g. No Objection Certificate. Leave blank for a normal letter" })}
  ${fieldHTML({ label: "Subject", bind: "letter.subject", cls: "span-2", optional: true })}
</div>`);
        html += sectionHTML("body", "Text", `<div id="rteLetter"></div>`);
        html += sectionHTML("sign", "Signatures", `
<div class="sub-block">
  ${checkHTML({ bind: "letter.showRight", label: "Our signatory", hint: "Right side of the page" })}
  <div class="grid-2" data-if="letter.showRight">
    ${fieldHTML({ label: "Line above signature", bind: "letter.rightLabel", placeholder: `For ${Store.settings.company.name}`, optional: true, cls: "span-2" })}
    ${fieldHTML({ label: "Name", bind: "signature.name", if: "signature.marks.mode!=stamp", })}
    ${fieldHTML({ label: "Designation", bind: "signature.title", if: "signature.marks.mode!=stamp", })}
    ${checkHTML({ bind: "signature.show", label: "Add signature and stamp", cls: "span-2" })}
    <div class="span-2" data-if="signature.show">${marksControlsHTML()}</div>
  </div>
</div>
<div class="sub-block">
  ${checkHTML({ bind: "letter.showLeft", label: "Second party", hint: "Left side, for agreements signed by both sides" })}
  <div class="grid-2" data-if="letter.showLeft">
    ${fieldHTML({ label: "Line above signature", bind: "letter.leftLabel", placeholder: "For and on behalf of …", optional: true, cls: "span-2" })}
    ${fieldHTML({ label: "Name", bind: "letter.leftName" })}
    ${fieldHTML({ label: "Designation", bind: "letter.leftTitle" })}
  </div>
</div>`);
    } else {
        // --- Details
        const curOpts = Object.entries(CURRENCIES).map(([k, c]) => [k, `${k} · ${c.name}`]);
        const dueChips = (bind) => `<div class="chips chips-tight" data-chips="${bind}">${(bind === "due" && doc.type === "invoice" ? [15, 30, 60, 90] : [7, 15, 30, 60]).map(d => `<button type="button" class="chip" data-days="${d}" title="${d} days after the document date">${bind === "due" && doc.type === "invoice" ? "Net " + d : "+" + d + " days"}</button>`).join("")}</div>`;
        html += sectionHTML("details", "Details", `
<div class="grid-2">
  ${fieldHTML({ label: `${t.short === "PO" ? "PO" : t.short} number`, bind: "number", required: true, addon: autoNumberAddon() })}
  ${fieldHTML({ label: "Heading on document", bind: "title", placeholder: t.title, list: doc.type === "invoice" ? "headingList" : "" })}
  ${fieldHTML({ label: t.dateLabel, bind: "date", type: "date" })}
  ${t.due ? fieldHTML({ label: t.due, bind: "due", type: "date", hint: dueChips("due") }) : ""}
  ${t.valid ? fieldHTML({ label: t.valid, bind: "valid", type: "date", hint: dueChips("valid") }) : ""}
  ${fieldHTML({ label: t.ref, bind: "ref", required: t.refRequired, optional: !t.refRequired, cls: t.due || t.valid ? "" : "" })}
  ${t.prices ? fieldHTML({ label: "Currency", bind: "currency", type: "select", options: curOpts }) : ""}
  ${t.poTerms ? fieldHTML({ label: "Delivery terms", bind: "deliveryTerms", list: "incotermList", placeholder: "e.g. CIF Jebel Ali", optional: true }) : ""}
  ${t.poTerms ? fieldHTML({ label: "Payment terms", bind: "paymentTerms", list: "payTermList", placeholder: "e.g. 30 days from invoice", optional: true }) : ""}
  ${doc.type !== "creditNote" ? fieldHTML({ label: "HS / HSN code", bind: "hsn", optional: true }) : ""}
  ${t.reason ? fieldHTML({ label: "Reason for credit", bind: "reason", type: "textarea", rows: 2, cls: "span-2", placeholder: "e.g. Goods returned, pricing correction" }) : ""}
</div>
<datalist id="headingList"><option value="INVOICE"><option value="TAX INVOICE"><option value="COMMERCIAL INVOICE"></datalist>
<datalist id="incotermList">${["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"].map(v => `<option value="${v}">`).join("")}</datalist>
<datalist id="payTermList">${["100% advance", "50% advance, 50% before shipment", "Against documents (CAD)", "Letter of credit at sight", "30 days from invoice", "60 days from invoice", "On delivery"].map(v => `<option value="${v}">`).join("")}</datalist>`);

        // --- Parties
        let partyBody = partyFields("party", t.party, { required: true, vendor: doc.type === "purchaseOrder" });
        partyBody += `<div class="row-actions"><button type="button" class="link-btn" data-act="saveContact">${icon("user", 14)} Save to contacts</button></div>`;
        if (doc.type === "purchaseOrder") {
            partyBody += `
<div class="sub-block">
  <div class="sub-title">${esc(t.bill)}</div>
  ${checkHTML({ bind: "billTo.useCompany", label: "Use our company details" })}
  <div data-if="!billTo.useCompany">${partyFields("billTo", t.bill, { email: false, attn: false })}</div>
</div>`;
        }
        if (t.ship) {
            partyBody += `
<div class="sub-block">
  <div class="sub-title">${esc(t.ship)}</div>
  ${checkHTML({ bind: "ship.same", label: doc.type === "purchaseOrder" ? "Same as bill to" : `Same as ${t.party.toLowerCase()}` })}
  <div data-if="!ship.same">${partyFields("ship", t.ship, { trn: false, email: false, attn: true })}</div>
</div>`;
        }
        html += sectionHTML("party", doc.type === "purchaseOrder" ? "Vendor & delivery" : `${t.party} & ${t.ship ? t.ship.toLowerCase() : "address"}`.replace(" & address", ""), partyBody);

        // --- Items
        html += sectionHTML("items", "Items", `
<div class="items-list" id="itemsList"></div>
<div class="items-actions">
  <button type="button" class="btn btn-ghost" data-act="addItem">${icon("plus")}<span>Add line</span></button>
  <span class="kbd-hint">or press <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
  <button type="button" class="link-btn push" data-act="columns">${icon("note", 14)} Columns</button>
</div>`, { aside: "&nbsp;" });

        // --- Totals & payment
        if (t.prices) {
            html += sectionHTML("money", t.paid ? "Totals & payment" : "Totals", `
<div class="grid-2">
  ${fieldHTML({ label: "Additional discount", bind: "discount.value", type: "number", kind: "num", addon: `<button type="button" class="addon-toggle" data-act="docDiscType"></button>` })}
  ${t.paid && !Server.online ? fieldHTML({ label: "Amount received", bind: "paid", type: "number", kind: "num", addon: `<button type="button" class="addon-btn" data-act="markPaid">Paid in full</button>` }) : "<div></div>"}
  ${Server.online && (doc.type === "invoice" || doc.type === "creditNote") ? fieldHTML({ label: "Income account", bind: "incomeAccount", type: "select", options: [["", "Default (" + (Finance.accountName(Store.settings.finance?.defaults?.salesAccount) || "Sales") + ")"], ...Finance.accountOptions(a => a.type === "income")] , hint: "Where these sales are recorded in the accounts." }) : ""}
  ${Server.online && (doc.type === "invoice" || doc.type === "creditNote") ? fieldHTML({ label: "VAT treatment", bind: "taxTreatment", type: "select", options: [["standard", "Standard (5% / 0% per line)"], ["zero", "Zero-rated (export)"], ["exempt", "Exempt"], ["outOfScope", "Out of scope"]], hint: "Used for the VAT return." }) : ""}
</div>
${Server.online && t.paid ? `<div class="pay-box" id="payBox"></div>` : ""}
<div class="charges">
  <div class="sub-title">Other charges</div>
  <div id="chargesList"></div>
  <div class="chips">${["Freight", "Insurance", "Handling", "Customs clearance", "Other"].map(c => `<button type="button" class="chip" data-act="addCharge" data-label="${c}">${icon("plus", 12)} ${c}</button>`).join("")}</div>
</div>
<div class="sum-box" id="sumBox"></div>
<div class="sub-block">
  ${checkHTML({ bind: "showBank", label: "Show payment details" })}
  <div data-if="showBank">
    ${fieldHTML({ label: "Bank account", bind: "bankId", type: "select", options: Store.settings.banks.map(b => [b.id, `${b.label}`]), hint: '<span id="bankHint"></span>' })}
  </div>
</div>
<div class="sub-block" data-if="currency!=AED">
  ${Server.online ? `<div class="grid-2">${fieldHTML({ label: "Exchange rate (AED per 1 unit)", bind: "fx.rate", type: "number", kind: "num", hint: 'Used to record this document in AED in the accounts. <span id="fxLive"></span>' })}</div>` : ""}
  ${checkHTML({ bind: "fx.show", label: "Show AED equivalent", hint: "UAE tax invoices in another currency should also state the VAT amount in AED." })}
  <div data-if="fx.show" class="grid-2"${Server.online ? " hidden" : ""}>
    ${fieldHTML({ label: "Exchange rate", bind: "fx.rate", type: "number", kind: "num", addon: '<span class="addon-text" id="fxAddon"></span>', hint: Server.online ? "" : '<span id="fxLive"></span>' })}
  </div>
</div>`, { aside: "&nbsp;" });
        }

        // --- Notes & terms
        html += sectionHTML("terms", "Notes & terms", `
${fieldHTML({ label: "Notes", bind: "notes", type: "textarea", rows: 2, optional: true, placeholder: "Shown above the terms, e.g. shipment details or container numbers" })}
<div class="field">
  <div class="label-row"><label>Terms &amp; conditions</label>
    <span class="label-actions">
      <button type="button" class="link-btn" data-act="resetTerms">Use saved default</button>
      <button type="button" class="link-btn" data-act="saveTerms">Save as default</button>
    </span>
  </div>
  <div id="rteTerms"></div>
</div>
${fieldHTML({ label: "Footer note", bind: "footer", optional: true, placeholder: "Small line printed above the footer" })}
<div class="hint warn-text" id="footerSignHint" hidden>This document is signed or stamped, but the footer note says no signature is required. <button type="button" class="link-btn" data-act="dropNoSigLine">Remove that sentence</button></div>`, { closed: false });

        // --- Signature & look
        html += sectionHTML("look", "Signature & layout", `
<div class="field">
  <label>Layout</label>
  <div class="seg seg-wide" id="layoutSeg">
    ${[["", "Default"], ["classic", "Classic"], ["letterhead", "Letterhead"], ["minimal", "Minimal"]].map(([v, l]) => `<button type="button" data-layout="${v}">${l}</button>`).join("")}
  </div>
  <div class="hint">Default follows Settings → Branding (currently ${esc(cap(Store.settings.brand.layout))}).</div>
</div>
${checkHTML({ bind: "signature.show", label: "Sign this document", hint: "Adds the authorised signatory, signature image and stamp" })}
<div class="grid-2" data-if="signature.show">
  ${fieldHTML({ label: "Signatory name", bind: "signature.name", if: "signature.marks.mode!=stamp", })}
  ${fieldHTML({ label: "Designation", bind: "signature.title", if: "signature.marks.mode!=stamp", })}
  <div class="span-2">${marksControlsHTML()}</div>
</div>
${t.receiver ? checkHTML({ bind: "receiver", label: "Add ‘received by’ box for the customer" }) : ""}`, { closed: true });
    }

    if (doc.import) html = importBannerHTML(doc) + html;
    pane.innerHTML = html;

    // Values
    $$("[data-bind]", pane).forEach(el => {
        const v = getPath(doc, el.dataset.bind);
        if (el.type === "checkbox") el.checked = !!v;
        else el.value = v ?? "";
    });

    // Rich editors
    if (t.resolution) {
        renderResLists();
    } else if (t.letter) {
        App.rte.letter = createRichEditor($("#rteLetter"), {
            full: true, value: doc.letter.body, minHeight: 340, label: "Letter text",
            placeholder: "Dear Sir or Madam,",
            onInput: html => { App.doc.letter.body = html; changed(); }
        });
    } else {
        App.rte.terms = createRichEditor($("#rteTerms"), {
            value: doc.terms, minHeight: 120, label: "Terms and conditions",
            placeholder: "Payment terms, delivery conditions, validity…",
            onInput: html => { App.doc.terms = html; changed(); }
        });
        renderItems();
        if (t.prices) renderCharges();
    }
    applyConditions();
    refreshFooterHint();
    refreshDerived();
}

/* ---------- Board resolution form ---------- */
function resolutionFormHTML(doc) {
    const co = Store.settings.company;
    return sectionHTML("res", "Resolution", `
<div class="grid-2">
  ${fieldHTML({ label: "Resolution no.", bind: "number", required: true, addon: autoNumberAddon() })}
  ${fieldHTML({ label: "Date", bind: "date", type: "date" })}
  ${fieldHTML({ label: "Subject", bind: "res.subject", required: true, cls: "span-2", placeholder: "e.g. Opening of a corporate bank account" })}
  <div class="field span-2">
    <label>How it was passed</label>
    <div class="seg seg-wide" id="resKindSeg">
      <button type="button" data-reskind="meeting">At a board meeting</button>
      <button type="button" data-reskind="written">Written resolution</button>
    </div>
  </div>
  ${fieldHTML({ label: "Time", bind: "res.time", type: "time", optional: true, if: "res.kind!=written" })}
  ${fieldHTML({ label: "Chair", bind: "res.chair", list: "directorList", if: "res.kind!=written" })}
  ${fieldHTML({ label: "Venue", bind: "res.venue", cls: "span-2", if: "res.kind!=written", placeholder: co.address })}
  ${fieldHTML({ label: "Heading on document", bind: "title", cls: "span-2", placeholder: "BOARD RESOLUTION" })}
</div>`) +
    sectionHTML("directors", "Directors", `
<div class="rlist" id="directorsList"></div>
<div class="items-actions">
  <button type="button" class="btn btn-ghost" data-act="addDirector">${icon("plus")}<span>Add director</span></button>
  <button type="button" class="link-btn push" data-act="saveDirectors">${icon("user", 14)} Save as company directors</button>
</div>
${checkHTML({ bind: "res.quorum", label: "Record that a quorum was present", if: "res.kind!=written" })}`, { aside: "&nbsp;" }) +
    sectionHTML("restext", "Background & resolutions", `
<div class="field">
  <label for="resTemplate">Start from a template</label>
  <div class="addon-wrap">
    <select id="resTemplate">${RES_TEMPLATES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join("")}</select>
    <button type="button" class="addon-btn" data-act="applyTemplate">Use template</button>
  </div>
  <div class="hint">Replace the words in [square brackets]. Check the final wording with your corporate service provider before filing.</div>
</div>
<div class="sub-block">
  <div class="sub-title">Background <span class="opt">printed as “Whereas…”</span></div>
  <div class="rlist" id="recitalsList"></div>
  <button type="button" class="btn btn-ghost btn-sm" data-act="addRecital">${icon("plus", 14)}<span>Add background point</span></button>
</div>
<div class="sub-block">
  <div class="sub-title">Resolutions <span class="opt">“Resolved that” is added for you</span></div>
  <div class="rlist" id="resolutionsList"></div>
  <button type="button" class="btn btn-ghost btn-sm" data-act="addResolution">${icon("plus", 14)}<span>Add resolution</span></button>
</div>`) +
    sectionHTML("ressign", "Signing", `
${checkHTML({ bind: "res.close", label: "Close with “There being no other business…”", if: "res.kind!=written" })}
${checkHTML({ bind: "res.certify", label: "Add a certified true copy block", hint: "For banks and authorities that ask for a certified copy" })}
<div class="grid-2" data-if="res.certify">
  ${fieldHTML({ label: "Certified by", bind: "signature.name", if: "signature.marks.mode!=stamp", })}
  ${fieldHTML({ label: "Designation", bind: "signature.title", if: "signature.marks.mode!=stamp", })}
  ${checkHTML({ bind: "signature.show", label: "Add signature image and stamp", cls: "span-2" })}
  <div class="span-2" data-if="signature.show">${marksControlsHTML()}</div>
</div>`) +
    `<datalist id="directorList">${(doc.res.directors || []).map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>`;
}

function renderResLists() {
    const r = App.doc.res;
    const meeting = r.kind !== "written";
    const dl = $("#directorsList");
    if (dl) {
        dl.innerHTML = r.directors.map((d, i) => `
<div class="rrow rrow-dir" data-rl="directors" data-i="${i}">
  <input data-rf="name" value="${esc(d.name)}" placeholder="Full name" aria-label="Director ${i + 1} name">
  <input data-rf="title" value="${esc(d.title)}" placeholder="Designation" aria-label="Director ${i + 1} designation">
  ${meeting ? `<label class="check check-inline"><input type="checkbox" data-rf="present"${d.present ? " checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Present</span></label>` : ""}
  <button type="button" class="icon-btn" data-act="rlRemove" aria-label="Remove director ${i + 1}">${icon("x")}</button>
</div>`).join("") || `<div class="empty-mini">No directors yet.</div>`;
        const aside = $("#aside-directors");
        if (aside) {
            const n = r.directors.filter(d => d.name.trim()).length, p = r.directors.filter(d => d.name.trim() && d.present).length;
            aside.textContent = meeting ? `${p} of ${n} present` : `${n} ${n === 1 ? "director" : "directors"}`;
        }
    }
    const textList = (host, key, label) => {
        const el = $(host);
        if (!el) return;
        el.innerHTML = r[key].map((x, i) => `
<div class="rrow rrow-text" data-rl="${key}" data-i="${i}">
  <span class="line-no">${key === "recitals" ? String.fromCharCode(65 + i) : i + 1}</span>
  <textarea data-rf="text" rows="2" aria-label="${label} ${i + 1}" placeholder="${key === "recitals" ? "the Company wishes to…" : "the Company…"}">${esc(x)}</textarea>
  <span class="rrow-tools">
    <button type="button" class="icon-btn" data-act="rlUp" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up", 14)}</button>
    <button type="button" class="icon-btn" data-act="rlDown" aria-label="Move down"${i === r[key].length - 1 ? " disabled" : ""}>${icon("down", 14)}</button>
    <button type="button" class="icon-btn" data-act="rlRemove" aria-label="Remove">${icon("x")}</button>
  </span>
</div>`).join("") || `<div class="empty-mini">None.</div>`;
        $$("textarea", el).forEach(autoGrow);
    };
    textList("#recitalsList", "recitals", "Background point");
    textList("#resolutionsList", "resolutions", "Resolution");
    $$("#resKindSeg button").forEach(b => b.classList.toggle("on", b.dataset.reskind === r.kind));
}

async function applyResTemplate() {
    const tpl = RES_TEMPLATES.find(t => t.id === $("#resTemplate").value);
    if (!tpl) return;
    const r = App.doc.res;
    const has = r.subject.trim() || r.recitals.some(x => x.trim()) || r.resolutions.some(x => x.trim());
    if (has && !await confirmDialog("Replace the subject, background and resolutions with this template?", "Replace", false, "Use template")) return;
    r.subject = tpl.subject;
    r.recitals = [...tpl.recitals];
    r.resolutions = [...tpl.resolutions];
    const subj = $(`[data-bind="res.subject"]`);
    if (subj) subj.value = r.subject;
    renderResLists();
    changed();
    toast(tpl.id === "blank" ? "Cleared." : `Template added. Fill in the words in [square brackets].`);
}

function importBannerHTML(doc) {
    const im = doc.import;
    const issues = im.checked ? [] : (im.issues || []);
    return `
<div class="import-banner${issues.length ? " has-issues" : ""}">
  <div class="ib-head">
    <span class="ib-icon">${icon(issues.length ? "note" : "check", 16)}</span>
    <div class="ib-title">${issues.length ? `Imported · ${issues.length} ${issues.length === 1 ? "thing" : "things"} to check` : "Imported and checked"}
      <small>${esc(im.fileName)} · ${im.method === "ocr" ? `read from a scan (${im.confidence}% confidence)` : "read from the PDF text"} · ${esc(fmtDate(isoOf(new Date(im.importedAt))))}</small>
    </div>
  </div>
  ${issues.length ? `<ul class="ib-list">${issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
  <div class="ib-actions">
    <button type="button" class="btn btn-ghost btn-sm" data-act="viewOriginal">${icon("eye", 14)}<span>View original</span></button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="viewText">${icon("note", 14)}<span>Text read</span></button>
    ${issues.length ? `<button type="button" class="btn btn-quiet btn-sm push" data-act="markChecked">${icon("check", 14)}<span>Mark as checked</span></button>` : ""}
  </div>
</div>`;
}

/* ==========================================================
   IMPORT VIEW
   ========================================================== */
const ImportQ = { items: [], running: false, bound: false };

function initImportView() {
    if (!ImportQ.bound) {
        ImportQ.bound = true;
        $("#dzArt").innerHTML = icon("upload", 30);
        $$("#view-import .check-box").forEach(b => { b.innerHTML = icon("check", 12); });
        const dz = $("#dropzone"), input = $("#importFiles");
        input.addEventListener("change", () => { addToImport([...input.files]); input.value = ""; });
        dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
        ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
        ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
        dz.addEventListener("drop", e => addToImport([...e.dataTransfer.files]));
        // Dropping files anywhere on the Import page works too
        $("#view-import").addEventListener("dragover", e => e.preventDefault());
        $("#view-import").addEventListener("drop", e => { if (!dz.contains(e.target)) { e.preventDefault(); addToImport([...e.dataTransfer.files]); } });
    }
    renderImportQueue();
}

function addToImport(files) {
    const ok = files.filter(f => /pdf|png|jpe?g|webp|bmp/i.test(f.type) || /\.(pdf|png|jpe?g|webp|bmp)$/i.test(f.name));
    if (ok.length < files.length) toast(`${files.length - ok.length} file${files.length - ok.length === 1 ? " was" : "s were"} skipped: only PDF, JPG, PNG and WebP can be read.`, "warn", 5000);
    ok.forEach(file => ImportQ.items.push({ id: uid("q"), file, state: "waiting", msg: "Waiting", progress: 0 }));
    renderImportQueue();
    runImportQueue();
}

async function runImportQueue() {
    if (ImportQ.running) return;
    ImportQ.running = true;
    const before = ImportQ.items.filter(x => x.state === "done").length;
    const opts = () => ({ lang: $("#importLang").value, addContacts: $("#importContacts").checked, skipDuplicates: $("#importSkipDup").checked });
    let item;
    while ((item = ImportQ.items.find(x => x.state === "waiting"))) {
        item.state = "working"; item.msg = "Opening"; item.progress = 0.02;
        renderImportQueue();
        try {
            const o = opts();
            o.progress = (msg, p) => { item.msg = msg; item.progress = Math.max(0.02, Math.min(1, p || 0)); renderImportRow(item); };
            const res = await importFile(item.file, o);
            item.doc = res.doc;
            item.state = res.skipped ? "skipped" : "done";
            item.issues = res.issues || [];
        } catch (err) {
            console.error(err);
            item.state = "failed";
            item.msg = err && err.message ? err.message : "This file could not be read.";
        }
        renderImportQueue();
    }
    ImportQ.running = false;
    await releaseOcr();
    refreshLists();
    updateSaveState();
    const added = ImportQ.items.filter(x => x.state === "done").length - before;
    if (added > 0) toast(`${added} ${added === 1 ? "document" : "documents"} imported.`, "good");
}

function importSummaryHTML() {
    const it = ImportQ.items;
    const c = s => it.filter(x => x.state === s).length;
    const working = c("waiting") + c("working");
    const checks = it.filter(x => x.state === "done" && x.issues && x.issues.length).length;
    const parts = [];
    if (c("done")) parts.push(`${c("done")} imported`);
    if (checks) parts.push(`${checks} to check`);
    if (c("skipped")) parts.push(`${c("skipped")} already in Documents`);
    if (c("failed")) parts.push(`${c("failed")} could not be read`);
    return `<div class="iq-head">
  <div><b>${working ? `Reading ${it.length - working + 1} of ${it.length}` : "Finished"}</b><span class="muted"> · ${parts.join(" · ") || "starting"}</span></div>
  <div class="iq-head-actions">
    ${!working && c("done") ? `<button type="button" class="btn btn-ghost btn-sm" data-iq="review">Review imported documents</button>` : ""}
    ${!working ? `<button type="button" class="btn btn-ghost btn-sm" data-iq="clear">Clear list</button>` : ""}
  </div>
</div>`;
}

function importRowInner(x) {
    const size = x.file.size > 1048576 ? (x.file.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(x.file.size / 1024)) + " KB";
    let right = "";
    if (x.state === "waiting" || x.state === "working") {
        right = `<div class="iq-msg">${esc(x.msg)}</div><div class="iq-bar"><i style="width:${Math.round((x.progress || 0) * 100)}%"></i></div>`;
    } else if (x.state === "done" || x.state === "skipped") {
        const d = x.doc, t = DOC_TYPES[d.type];
        const tot = t.prices ? computeTotals(d) : null;
        right = `<div class="iq-result">
  <span class="pill ${x.state === "skipped" ? "pill-mute" : x.issues && x.issues.length ? "pill-warn" : "pill-good"}">${x.state === "skipped" ? "Already imported" : x.issues && x.issues.length ? `${x.issues.length} to check` : "Imported"}</span>
  <span class="iq-doc"><b>${esc(t.short)} ${esc(d.number)}</b>${docWho(d) ? ` · ${esc(docWho(d))}` : ""}${tot ? ` · ${esc(d.currency)} ${fmt(tot.total, d.currency)}` : ""}</span>
  <button type="button" class="btn btn-ghost btn-sm" data-iq="open" data-id="${d.id}">Open</button>
</div>`;
    } else {
        right = `<div class="iq-result"><span class="pill pill-bad">Not imported</span><span class="iq-err">${esc(x.msg)}</span><button type="button" class="btn btn-ghost btn-sm" data-iq="retry" data-q="${x.id}">Try again</button></div>`;
    }
    return `<span class="iq-file">${icon("file", 18)}</span><div class="iq-name"><b>${esc(x.file.name)}</b><small>${size}</small></div><div class="iq-right">${right}</div>`;
}

function renderImportRow(x) {
    const row = $(`.iq-row[data-q="${x.id}"]`);
    if (row) row.innerHTML = importRowInner(x); else renderImportQueue();
}

function renderImportQueue() {
    const host = $("#importQueue");
    if (!host) return;
    host.hidden = ImportQ.items.length === 0;
    host.innerHTML = importSummaryHTML() + ImportQ.items.map(x => `<div class="iq-row iq-${x.state}" data-q="${x.id}">${importRowInner(x)}</div>`).join("");
    if (!host.dataset.bound) {
        host.dataset.bound = "1";
        host.addEventListener("click", e => {
            const b = e.target.closest("[data-iq]");
            if (!b) return;
            if (b.dataset.iq === "open") openSaved(b.dataset.id);
            if (b.dataset.iq === "review") { location.hash = "#documents"; setTimeout(() => { $("#docStatusFilter").value = "imported"; renderDocsTable(); }, 0); }
            if (b.dataset.iq === "clear") { ImportQ.items = []; renderImportQueue(); }
            if (b.dataset.iq === "retry") { const x = ImportQ.items.find(i => i.id === b.dataset.q); if (x) { x.state = "waiting"; x.msg = "Waiting"; runImportQueue(); renderImportQueue(); } }
        });
    }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }

function autoNumberAddon() {
    return `<button type="button" class="addon-btn" data-act="nextNumber" title="Use the next number in sequence">${icon("refresh", 14)}</button>`;
}

/* Show/hide blocks: data-if="path", "!path" or "path!=VALUE" */
function applyConditions() {
    $$("[data-if]", $("#formPane")).forEach(el => {
        const c = el.dataset.if;
        let on;
        if (c.includes("!=")) { const [p, v] = c.split("!="); on = String(getPath(App.doc, p)) !== v; }
        else if (c.startsWith("!")) on = !getPath(App.doc, c.slice(1));
        else on = !!getPath(App.doc, c);
        el.hidden = !on;
    });
}

/* Live bits of the form that depend on calculations */
function refreshDerived() {
    const doc = App.doc;
    const t = T();
    if (Server.online) renderPayBox();
    if (t.text) return;
    const totals = computeTotals(doc);
    const cur = doc.currency;
    // line amounts
    $$(".line", $("#itemsList")).forEach((el, i) => {
        const l = totals.lines[i];
        const amt = $(".line-amt", el);
        if (amt && l) amt.textContent = t.prices ? `${cur} ${fmt(l.total, cur)}` : `${fmtQty(l.qty)} ${doc.items[i].unit || ""}`.trim();
    });
    const itemsAside = $("#aside-items");
    if (itemsAside) itemsAside.textContent = `${doc.items.length} ${doc.items.length === 1 ? "line" : "lines"}`;
    const moneyAside = $("#aside-money");
    if (moneyAside) moneyAside.textContent = `${cur} ${fmt(totals.total, cur)}`;

    const sum = $("#sumBox");
    if (sum) {
        const r = (l, v, c = "") => `<div class="sum-row ${c}"><span>${l}</span><span>${v}</span></div>`;
        let h = r("Subtotal", fmt(totals.subtotal, cur));
        if (totals.lineDiscount + totals.docDiscount > 0) h += r("Discounts", "−" + fmt(totals.lineDiscount + totals.docDiscount, cur));
        if (totals.chargesTotal) h += r("Other charges", fmt(totals.chargesTotal, cur));
        h += r("VAT", fmt(totals.vatTotal, cur));
        h += r(`Total (${cur})`, fmt(totals.total, cur), "sum-total");
        const credits = doc.type === "invoice" ? creditsFor(doc) : 0;
        if (credits > 0) h += r("Credit notes issued", "−" + fmt(credits, cur));
        if (t.paid && (totals.paid > 0 || credits > 0)) {
            const owed = Math.max(0, round(totals.balance - credits, totals.dec));
            h += r("Balance due", fmt(owed, cur), owed <= 0 ? "sum-good" : "sum-due");
        }
        if (totals.fx) h += r("Total in AED", fmt(totals.fx.total, "AED"), "sum-fx");
        sum.innerHTML = h;
    }
    const dt = $("[data-act=docDiscType]");
    if (dt) dt.textContent = doc.discount.type === "pct" ? "%" : cur;
    const fxa = $("#fxAddon");
    if (fxa) fxa.textContent = `AED per 1 ${cur}`;
    const bh = $("#bankHint");
    if (bh) {
        const b = bankById(doc.bankId);
        bh.textContent = b && b.currency && b.currency !== cur ? `This account is in ${b.currency}; the document is in ${cur}.` : "";
        bh.className = b && b.currency !== cur ? "warn-text" : "";
    }
    $$("#layoutSeg button").forEach(b => b.classList.toggle("on", b.dataset.layout === (doc.layout || "")));
}

/* ---------- Items ---------- */
function renderItems() {
    const doc = App.doc;
    const t = T();
    const show = doc.columns.show;
    const cur = doc.currency;
    const list = $("#itemsList");
    if (!list) return;
    list.innerHTML = doc.items.map((it, i) => `
<div class="line" data-id="${it.id}">
  <div class="line-top">
    <span class="line-no">${i + 1}</span>
    <input class="line-name" data-f="name" list="productList" placeholder="Item or service" aria-label="Line ${i + 1} item" autocomplete="off" value="${esc(it.name)}">
    <span class="line-amt"></span>
    <button type="button" class="icon-btn" data-act="lineMenu" aria-label="Line ${i + 1} options">${icon("more")}</button>
  </div>
  <textarea class="line-desc" data-f="desc" rows="1" placeholder="Description, specification or notes" aria-label="Line ${i + 1} description">${esc(it.desc)}</textarea>
  <div class="line-grid">
    <label><span>Qty</span><input data-f="qty" type="number" step="any" inputmode="decimal" value="${esc(it.qty)}"></label>
    ${show.unit ? `<label class="w-unit"><span>Unit</span><input data-f="unit" list="unitList" value="${esc(it.unit)}" autocomplete="off"></label>` : ""}
    ${t.prices ? `<label class="w-rate"><span>Rate</span><input data-f="rate" type="number" step="any" inputmode="decimal" value="${esc(it.rate)}"></label>` : ""}
    ${t.prices && show.disc !== false ? `<label class="w-disc"><span>Discount</span><span class="addon-wrap"><input data-f="disc" type="number" step="any" inputmode="decimal" value="${esc(it.disc)}"><button type="button" class="addon-toggle" data-act="discType">${it.discType === "pct" ? "%" : esc(cur)}</button></span></label>` : ""}
    ${t.prices ? `<label><span>VAT %</span><input data-f="vat" type="number" step="any" inputmode="decimal" value="${esc(it.vat)}"></label>` : ""}
    ${show.hs ? `<label><span>HS code</span><input data-f="hs" value="${esc(it.hs)}"></label>` : ""}
  </div>
</div>`).join("") || `<div class="empty-mini">No lines yet.</div>`;
    $$(".line-desc", list).forEach(autoGrow);
    refreshDerived();
}

function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.max(ta.scrollHeight, 30) + "px";
}

function addItem(after = null, data = {}) {
    const it = newItem(data);
    if (after) {
        const i = App.doc.items.findIndex(x => x.id === after);
        App.doc.items.splice(i + 1, 0, it);
    } else App.doc.items.push(it);
    renderItems();
    changed();
    const el = $(`.line[data-id="${it.id}"] .line-name`);
    if (el) { el.focus(); el.closest(".line").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}

function lineMenu(anchor, id) {
    const i = App.doc.items.findIndex(x => x.id === id);
    const it = App.doc.items[i];
    showMenu(anchor, [
        { label: "Move up", icon: "up", disabled: i === 0, onClick: () => moveItem(i, -1) },
        { label: "Move down", icon: "down", disabled: i === App.doc.items.length - 1, onClick: () => moveItem(i, 1) },
        { label: "Duplicate line", icon: "copy", onClick: () => addItem(id, { ...it, id: undefined }) },
        { label: "Save to products", icon: "box", disabled: !it.name.trim(), onClick: () => saveItemAsProduct(it) },
        { divider: true },
        { label: "Remove line", icon: "trash", danger: true, onClick: () => removeItem(id) }
    ], "right");
}

function moveItem(i, d) {
    const a = App.doc.items;
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    renderItems();
    changed();
}

function removeItem(id) {
    const i = App.doc.items.findIndex(x => x.id === id);
    const removed = App.doc.items[i];
    App.doc.items.splice(i, 1);
    renderItems();
    changed();
    toast("Line removed.", "", 5000, { label: "Undo", fn: () => { App.doc.items.splice(i, 0, removed); renderItems(); changed(); } });
}

function saveItemAsProduct(it) {
    const existing = Store.findByName("products", it.name);
    const p = { id: existing ? existing.id : uid("p"), name: it.name.trim(), desc: it.desc, hs: it.hs, unit: it.unit, rate: num(it.rate), vat: num(it.vat), currency: App.doc.currency };
    Store.upsert("products", p);
    refreshLists();
    toast(existing ? `Updated “${p.name}” in products.` : `Saved “${p.name}” to products.`, "good");
}

/* ---------- Other charges ---------- */
function renderCharges() {
    const host = $("#chargesList");
    if (!host) return;
    const cur = App.doc.currency;
    host.innerHTML = App.doc.charges.map((c, i) => `
<div class="charge" data-i="${i}">
  <input data-cf="label" value="${esc(c.label)}" aria-label="Charge name" placeholder="Charge">
  <span class="addon-wrap"><input data-cf="amount" type="number" step="any" inputmode="decimal" value="${esc(c.amount)}" aria-label="Amount"><span class="addon-text">${esc(cur)}</span></span>
  <span class="addon-wrap narrow"><input data-cf="vat" type="number" step="any" inputmode="decimal" value="${esc(c.vat)}" aria-label="VAT percent"><span class="addon-text">VAT %</span></span>
  <button type="button" class="icon-btn" data-act="removeCharge" aria-label="Remove charge">${icon("x")}</button>
</div>`).join("");
}

/* ---------- Form events ---------- */
function onFormInput(e) {
    const el = e.target;
    const doc = App.doc;
    if (el.dataset.markSize) { setMarkSize(el.dataset.markSize, Number(el.value) / 100); return; }
    if (el.dataset.markRot) { setMarkAngle(el.dataset.markRot, Number(el.value)); return; }
    if (el.dataset.bind) {
        const path = el.dataset.bind;
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.dataset.kind === "num") v = el.value === "" ? "" : num(el.value);
        if (path === "paid") { setPath(doc, path, v); syncPayment(doc, "paid"); updateDocBar(); }
        const prev = getPath(doc, path);
        setPath(doc, path, v);
        if (path === "number") doc.auto = false;
        if (path === "date" && v) onDateChange(prev);
        if (path === "currency") onCurrencyChange();
        if (el.type === "checkbox" || path === "currency") applyConditions();
        changed();
        return;
    }
    const line = el.closest(".line");
    if (line && el.dataset.f) {
        const it = doc.items.find(x => x.id === line.dataset.id);
        const f = el.dataset.f;
        it[f] = ["qty", "rate", "disc", "vat"].includes(f) ? (el.value === "" ? "" : num(el.value)) : el.value;
        if (f === "desc") autoGrow(el);
        if ((f === "name" || f === "desc") && el.value.trim()) line.classList.remove("invalid");
        changed();
        return;
    }
    const rrow = el.closest("[data-rl]");
    if (rrow && el.dataset.rf) {
        const list = doc.res[rrow.dataset.rl];
        const i = Number(rrow.dataset.i);
        if (rrow.dataset.rl === "directors") {
            list[i][el.dataset.rf] = el.type === "checkbox" ? el.checked : el.value;
            if (el.dataset.rf === "name") { const dl = $("#directorList"); if (dl) dl.innerHTML = list.map(d => `<option value="${esc(d.name)}">`).join(""); }
            if (el.type === "checkbox") renderResLists();
        } else {
            list[i] = el.value;
            autoGrow(el);
        }
        changed();
        return;
    }
    const charge = el.closest(".charge");
    if (charge && el.dataset.cf) {
        const c = doc.charges[Number(charge.dataset.i)];
        c[el.dataset.cf] = el.dataset.cf === "label" ? el.value : (el.value === "" ? "" : num(el.value));
        changed();
    }
}

function onFormChange(e) {
    const el = e.target;
    // Pick a saved contact by typing or choosing its name
    if (/^(party|ship|billTo)\.name$/.test(el.dataset.bind || "")) {
        const c = Store.findByName("contacts", el.value);
        if (c) fillParty(el.dataset.bind.split(".")[0], c);
    }
    if (el.dataset.f === "name") {
        const p = Store.findByName("products", el.value);
        const line = el.closest(".line");
        if (p && line) {
            const it = App.doc.items.find(x => x.id === line.dataset.id);
            Object.assign(it, { name: p.name, desc: p.desc || it.desc, hs: p.hs || it.hs, unit: p.unit || it.unit, rate: num(p.rate), vat: p.vat === "" || p.vat === undefined ? it.vat : num(p.vat) });
            renderItems();
            changed();
            $(`.line[data-id="${it.id}"] [data-f=qty]`)?.focus();
            if (p.currency && p.currency !== App.doc.currency) toast(`“${p.name}” is priced in ${p.currency}; this document is in ${App.doc.currency}.`, "warn", 5000);
        }
    }
}

function fillParty(prefix, c) {
    const target = App.doc[prefix];
    ["name", "attn", "trn", "address", "phone", "email"].forEach(k => { if (k in target && c[k] !== undefined) target[k] = c[k] || ""; });
    $$(`[data-bind^="${prefix}."]`, $("#formPane")).forEach(el => {
        const v = getPath(App.doc, el.dataset.bind);
        if (el.type !== "checkbox") el.value = v ?? "";
    });
    changed();
    toast(`Filled in from contacts: ${c.name}`);
}

async function onFormClick(e) {
    const b = e.target.closest("[data-act], [data-layout], [data-reskind], .chip[data-days], [data-mark-mode]");
    if (!b) return;
    const doc = App.doc;
    if (b.dataset.markMode) { setMarkMode(b.dataset.markMode); return; }
    if (b.dataset.act === "marksReset") { resetMarks(); return; }
    if (b.dataset.act === "dropNoSigLine") {
        doc.footer = String(doc.footer || "").replace(NO_SIG_RE, "").replace(/\s{2,}/g, " ").trim();
        const f = $(`[data-bind="footer"]`); if (f) f.value = doc.footer;
        changed(); return;
    }
    if (b.dataset.act === "marksDefault") { saveMarksAsDefault(); return; }
    if (b.dataset.act === "marksSelect") { selectMark(b.dataset.kind, true); return; }
    if (b.dataset.days) {
        const target = b.closest("[data-chips]").dataset.chips;
        doc[target] = addDays(doc.date, b.dataset.days);
        const input = $(`[data-bind="${target}"]`);
        if (input) input.value = doc[target];
        changed();
        return;
    }
    if (b.dataset.reskind) {
        doc.res.kind = b.dataset.reskind;
        renderResLists();
        applyConditions();
        changed();
        return;
    }
    if (b.dataset.layout !== undefined && b.closest("#layoutSeg")) {
        doc.layout = b.dataset.layout;
        changed();
        return;
    }
    const line = b.closest(".line");
    switch (b.dataset.act) {
        case "addItem": addItem(); break;
        case "viewOriginal": openOriginal(doc); break;
        case "viewText": showExtractedText(doc); break;
        case "markChecked": {
            doc.import.checked = true;
            changed();
            buildForm();
            toast("Marked as checked. Save to keep it.");
            break;
        }
        case "addDirector": doc.res.directors.push({ name: "", title: "Director", present: true }); renderResLists(); changed(); $$("#directorsList [data-rf=name]").pop()?.focus(); break;
        case "addRecital": doc.res.recitals.push(""); renderResLists(); changed(); $$("#recitalsList textarea").pop()?.focus(); break;
        case "addResolution": doc.res.resolutions.push(""); renderResLists(); changed(); $$("#resolutionsList textarea").pop()?.focus(); break;
        case "rlRemove": case "rlUp": case "rlDown": {
            const row = b.closest("[data-rl]");
            const list = doc.res[row.dataset.rl], i = Number(row.dataset.i);
            if (b.dataset.act === "rlRemove") list.splice(i, 1);
            else { const j = i + (b.dataset.act === "rlUp" ? -1 : 1); if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; }
            renderResLists(); changed();
            break;
        }
        case "applyTemplate": applyResTemplate(); break;
        case "saveDirectors": {
            Store.settings.company.directors = doc.res.directors.filter(d => d.name.trim()).map(d => ({ name: d.name.trim(), title: d.title.trim() }));
            Store.save();
            toast("Saved as your company directors. New resolutions will start with this list.", "good");
            break;
        }
        case "lineMenu": lineMenu(b, line.dataset.id); break;
        case "discType": {
            const it = doc.items.find(x => x.id === line.dataset.id);
            it.discType = it.discType === "pct" ? "amt" : "pct";
            b.textContent = it.discType === "pct" ? "%" : doc.currency;
            changed();
            break;
        }
        case "docDiscType": doc.discount.type = doc.discount.type === "pct" ? "amt" : "pct"; changed(); break;
        case "recordPayment": {
            if (App.dirty || !Store.getDoc(doc.id)) { toast("Save the invoice first.", "warn"); break; }
            Finance.paymentForm({ invoiceId: doc.id });
            break;
        }
        case "openPayment": Finance.paymentForm({ id: b.dataset.id }); break;
        case "markPaid": {
            if (doc.status === "cancelled") { toast("This invoice is cancelled. Change its status first.", "warn"); break; }
            const due = amountDue(doc);
            doc.paid = due;
            doc.status = "paid";
            doc.paidAt = Date.now();
            $(`[data-bind="paid"]`).value = doc.paid;
            updateDocBar();
            changed();
            toast(`Marked as paid: ${doc.currency} ${fmt(due, doc.currency)}`, "good");
            break;
        }
        case "addCharge": {
            doc.charges.push({ label: b.dataset.label === "Other" ? "" : b.dataset.label, amount: 0, vat: Store.settings.defaults.vat });
            renderCharges();
            changed();
            const inputs = $$("#chargesList .charge");
            const last = inputs[inputs.length - 1];
            if (last) $(b.dataset.label === "Other" ? "[data-cf=label]" : "[data-cf=amount]", last).focus();
            break;
        }
        case "removeCharge": {
            doc.charges.splice(Number(b.closest(".charge").dataset.i), 1);
            renderCharges();
            changed();
            break;
        }
        case "nextNumber": {
            const seq = Store.settings.numbering[doc.type].next;
            const saved = Store.getDoc(doc.id);
            if (saved) { toast("Saved documents keep their number. Duplicate it to get a new one.", "warn"); break; }
            doc.seq = seq; doc.auto = true; doc.number = formatNumber(doc.type, seq, doc.date);
            $(`[data-bind="number"]`).value = doc.number;
            changed();
            break;
        }
        case "saveContact": saveContactFromDoc(); break;
        case "columns": editColumns(); break;
        case "resetTerms": {
            const def = Store.settings.defaults.terms[doc.type] || "";
            doc.terms = def;
            App.rte.terms.set(def);
            changed();
            toast("Terms reset to your saved default.");
            break;
        }
        case "saveTerms": {
            Store.settings.defaults.terms[doc.type] = doc.terms;
            Store.save();
            toast(`Saved as the default terms for new ${T().label.toLowerCase()}s.`, "good");
            break;
        }
    }
}

function onDateChange(prev) {
    const doc = App.doc;
    const delta = prev && doc.date ? daysBetween(prev, doc.date) : 0;
    if (delta) {
        ["due", "valid"].forEach(k => {
            if (!doc[k]) return;
            doc[k] = addDays(doc[k], delta);
            const el = $(`[data-bind="${k}"]`);
            if (el) el.value = doc[k];
        });
    }
    // Unsaved automatic numbers follow the date (month and year tokens)
    if (doc.auto && !Store.getDoc(doc.id)) {
        doc.number = formatNumber(doc.type, doc.seq, doc.date);
        const n = $(`[data-bind="number"]`);
        if (n) n.value = doc.number;
    }
}

function onCurrencyChange() {
    const doc = App.doc;
    const b = bankById(doc.bankId);
    if (!b || b.currency !== doc.currency) {
        const match = Store.settings.banks.find(x => x.currency === doc.currency);
        if (match) {
            doc.bankId = match.id;
            const sel = $(`[data-bind="bankId"]`);
            if (sel) sel.value = match.id;
            if (doc.showBank) toast(`Payment account switched to ${match.label}.`);
        }
    }
    // The exchange rate follows the currency: pegged, live or the book rate
    // Never keep the previous currency's rate: use this currency's, or leave it empty to be filled in
    const rate = doc.currency === "AED" ? "" : LiveFX.rate(doc.currency) || "";
    doc.fx.rate = rate;
    $$(`[data-bind="fx.rate"]`).forEach(r => { r.value = rate; });
    if (doc.currency !== "AED" && !rate) toast(`Enter the exchange rate for ${doc.currency} (AED per 1 ${doc.currency}).`, "warn", 6000);
    refreshFxAddon();
    renderItems();
    renderCharges();
}

/* Live rate next to the exchange rate field, with one click to use it */
function refreshFxAddon() {
    const doc = App.doc;
    $$("#fxLive").forEach(el => {
        if (!doc || doc.currency === "AED") { el.innerHTML = ""; return; }
        const live = LiveFX.live(doc.currency);
        if (!live) { el.innerHTML = LiveFX.config().provider === "off" ? "" : `<span class="muted">Live rate: waiting…</span>`; return; }
        const same = Math.abs(num(doc.fx.rate) - live) < 0.0000005;
        el.innerHTML = `<span class="fx-live ${LiveFX.status === "live" ? "on" : ""}">${LiveFX.status === "live" ? "Live" : "Reference"} ${fmtRate(live)}</span>${same ? "" : ` <button type="button" class="link-btn" data-act="useLiveFx">Use it</button>`}`;
    });
}
document.addEventListener("click", e => {
    if (!e.target.closest('[data-act="useLiveFx"]') || !App.doc) return;
    const r = LiveFX.live(App.doc.currency);
    if (!r) return;
    App.doc.fx.rate = r;
    $$(`[data-bind="fx.rate"]`).forEach(i => { i.value = r; });
    changed();
    refreshFxAddon();
});
LiveFX.onChange(() => { if (App.view === "create") refreshFxAddon(); });

/* Called after any edit */
const renderPreviewSoon = debounce(() => requestAnimationFrame(() => renderPreview()), 90);
const saveDraftSoon = debounce(() => Store.saveDraft(App.doc), 400);

/* A signed document should not also say that no signature is required */
const NO_SIG_RE = /[^.]*\bno signature is required\b[^.]*\.?/i;
function refreshFooterHint() {
    const h = $("#footerSignHint");
    if (!h) return;
    const d = App.doc, m = (d.signature.marks && d.signature.marks.mode) || "both";
    const signed = d.signature.show && m !== "none";
    h.hidden = !(signed && NO_SIG_RE.test(String(d.footer || "")));
}

function changed() {
    refreshFooterHint();
    App.dirty = true;
    App.doc.updatedAt = Date.now();
    refreshDerived();
    renderPreviewSoon();
    saveDraftSoon();
    updateDocBarSoon();
}
const updateDocBarSoon = debounce(() => updateDocBar(), 200);

/* ---------- Contacts from the form ---------- */
function saveContactFromDoc() {
    const p = App.doc.party;
    if (!p.name.trim()) { toast("Enter a name first.", "warn"); $(`[data-bind="party.name"]`).focus(); return; }
    const existing = Store.findByName("contacts", p.name);
    const role = App.doc.type === "purchaseOrder" ? "vendor" : "customer";
    const c = {
        id: existing ? existing.id : uid("c"),
        role: existing && existing.role !== role ? "both" : role,
        name: p.name.trim(), attn: p.attn, trn: p.trn, address: p.address, phone: p.phone, email: p.email
    };
    Store.upsert("contacts", c);
    refreshLists();
    toast(existing ? `Updated ${c.name} in contacts.` : `Saved ${c.name} to contacts.`, "good");
}

function refreshLists() {
    $("#contactList").innerHTML = Store.data.contacts.map(c => `<option value="${esc(c.name)}">${esc(c.role === "vendor" ? "Vendor" : c.role === "both" ? "Customer & vendor" : "Customer")}</option>`).join("");
    $("#productList").innerHTML = Store.data.products.map(p => `<option value="${esc(p.name)}">${esc([p.unit, p.rate ? `${p.currency || ""} ${fmt(p.rate, p.currency || "AED")}` : ""].filter(Boolean).join(" · "))}</option>`).join("");
}

/* ---------- Columns dialog ---------- */
async function editColumns() {
    const c = App.doc.columns;
    const t = T();
    const L = c.labels;
    const row = (key, name, ctrl) => `<div class="col-row"><span class="col-name">${name}</span><input name="lbl_${key}" value="${esc(L[key])}" aria-label="${name} heading">${ctrl || "<span></span>"}</div>`;
    const sel = (key, opts, val) => `<select name="show_${key}" aria-label="Show ${key}">${opts.map(([v, l]) => `<option value="${v}"${String(val) === v ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    const onOff = [["true", "Show"], ["false", "Hide"]];
    const body = `
<p class="dialog-text">Rename the column headings printed on this document and choose which optional columns appear.</p>
<div class="col-table">
  <div class="col-row col-head"><span>Column</span><span>Heading</span><span>Show</span></div>
  ${row("item", "Description")}
  ${row("hs", "HS code", sel("hs", [["false", "Hide"], ["auto", "When filled"], ["true", "Show"]], c.show.hs))}
  ${row("qty", "Quantity")}
  ${row("unit", "Unit", sel("unit", onOff, c.show.unit))}
  ${t.prices ? row("rate", "Rate") : ""}
  ${t.prices ? row("disc", "Discount", sel("disc", [["auto", "When used"], ["true", "Always"], ["false", "Never"]], c.show.disc)) : ""}
  ${t.prices ? row("vatRate", "VAT rate", sel("vatRate", onOff, c.show.vatRate)) : ""}
  ${t.prices ? row("vatAmt", "VAT amount", sel("vatAmt", onOff, c.show.vatAmt)) : ""}
  ${t.prices ? row("amount", "Amount") : ""}
</div>`;
    const r = await openDialog({ title: "Columns", body, wide: true, actions: [{ label: "Reset", value: "reset" }, { label: "Cancel", value: "cancel" }, { label: "Apply", value: "ok", primary: true }] });
    if (r.value === "reset") { App.doc.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS)); }
    else if (r.value === "ok") {
        const discounted = App.doc.items.filter(i => num(i.disc) !== 0);
        if (r.data.show_disc === "false" && c.show.disc !== false && discounted.length) {
            const n = discounted.length;
            const go = await confirmDialog(`${n} line${n > 1 ? "s have" : " has"} a discount. Hiding the Discount column removes ${n > 1 ? "those discounts" : "that discount"} so the printed rows add up.`, "Remove discounts and hide", true, "Hide discount column");
            if (!go) return;
            discounted.forEach(i => { i.disc = 0; });
        }
        Object.keys(L).forEach(k => { if (r.data["lbl_" + k] !== undefined) L[k] = r.data["lbl_" + k].trim() || DEFAULT_COLUMNS.labels[k]; });
        Object.keys(c.show).forEach(k => {
            const v = r.data["show_" + k];
            if (v !== undefined) c.show[k] = v === "true" ? true : v === "false" ? false : v;
        });
    } else return;
    renderItems();
    changed();
}

/* ==========================================================
   PREVIEW & ZOOM
   ========================================================== */
/* Update the preview in place: only changed text and attributes are touched,
   so images are not reloaded and typing stays smooth. */
function renderPreview(force = false) {
    if (App.view !== "create" && !force) return;
    const html = renderDocument(App.doc);
    if (html === App._lastHtml && !force) return;
    App._lastHtml = html;
    const holder = $("#sheetHolder");
    if (!holder.firstElementChild) {
        holder.innerHTML = html;
    } else {
        const tpl = document.createElement("template");
        tpl.innerHTML = html;
        morphChildren(holder, tpl.content);
    }
    updateDeskInfo();
    if (MarkUI.sel && !MarkUI.drag) requestAnimationFrame(placeMarkBox);
}

function morphChildren(from, to) {
    const a = from.childNodes, b = to.childNodes;
    for (let i = 0; i < b.length; i++) {
        const nb = b[i], na = a[i];
        if (!na) { from.appendChild(nb.cloneNode(true)); continue; }
        if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { from.replaceChild(nb.cloneNode(true), na); continue; }
        if (na.nodeType !== 1) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; continue; }
        for (const at of Array.from(na.attributes)) if (!nb.hasAttribute(at.name)) na.removeAttribute(at.name);
        for (const at of Array.from(nb.attributes)) if (na.getAttribute(at.name) !== at.value) na.setAttribute(at.name, at.value);
        morphChildren(na, nb);
    }
    while (a.length > b.length) from.removeChild(from.lastChild);
}

/* Estimate printed pages from the content height and the space each page leaves for it */
function updateDeskInfo() {
    const sheet = $("#sheetHolder .sheet");
    const content = sheet && $(".frame-content", sheet);
    if (!content) return;
    const mmPerPx = 210 / sheet.getBoundingClientRect().width;
    const contentMm = content.getBoundingClientRect().height * mmPerPx;
    const head = $(".lh-head", sheet) ? $(".lh-head", sheet).getBoundingClientRect().height * mmPerPx + 6 : 14;
    const footEl = $(".doc-foot, .lh-foot", sheet);
    const foot = footEl ? footEl.getBoundingClientRect().height * mmPerPx + 5 : 12;
    const first = $(".frame-space-head", sheet).getBoundingClientRect().height * mmPerPx;
    const pages = Math.max(1, Math.ceil((contentMm + first - head - 1) / (297 - head - foot)));
    $("#deskInfo").textContent = `A4 · ${pages} ${pages === 1 ? "page" : "pages"} when printed`;
}

function currentZoom() {
    return App.zoom === "fit" ? (App._fit || 1) : App.zoom;
}
function setZoom(z) {
    App.zoom = Math.min(2, Math.max(0.3, Math.round(z * 10) / 10));
    applyZoom(App.zoom);
}
function fitZoom() {
    const desk = $("#deskScroll");
    if (!desk || !desk.clientWidth) return;
    const sheetPx = 210 * 3.7795;
    App._fit = Math.min(1.2, Math.max(0.3, (desk.clientWidth - 48) / sheetPx));
    applyZoom(App._fit);
}
function applyZoom(z) {
    $("#sheetHolder").style.zoom = z;
    requestAnimationFrame(updateDeskInfo);
    $("#zoomLabel").textContent = App.zoom === "fit" ? "Fit" : Math.round(z * 100) + "%";
}

/* ==========================================================
   SAVE & PRINT
   ========================================================== */
function validate(doc, forPrint = false) {
    const t = DOC_TYPES[doc.type];
    const problems = [];
    if (!String(doc.number || "").trim()) problems.push(["number", "Add a document number."]);
    if (!t.text && !doc.party.name.trim()) problems.push(["party.name", `Add the ${t.noun || "customer"} name.`]);
    if (t.resolution) {
        if (!String(doc.res.subject).trim()) problems.push(["res.subject", "Add a subject for the resolution."]);
        if (!doc.res.resolutions.some(x => String(x).trim())) problems.push([null, "Write at least one resolution."]);
        if (!doc.res.directors.some(x => String(x.name).trim())) problems.push([null, "Add at least one director."]);
        if (doc.res.kind === "meeting" && !doc.res.directors.some(x => x.present && String(x.name).trim())) problems.push([null, "Mark at least one director as present at the meeting."]);
    }
    if (t.refRequired && !String(doc.ref).trim()) problems.push(["ref", t.refMsg || `Add the ${t.ref.toLowerCase()}.`]);
    if (t.letter && htmlIsEmpty(doc.letter.body) && !doc.letter.subject.trim()) problems.push(["letter.subject", "Write the letter text or a subject."]);
    if (!t.text) {
        const used = doc.items.filter(lineUsed);
        if (!used.length) problems.push(doc.items[0]
            ? ["line:" + doc.items[0].id, (t.prices ? "Type an item name or a rate in line 1." : "Type an item name in line 1.")]
            : [null, "Add at least one line item."]);
    }
    if (t.prices && doc.items.some(i => num(i.qty) < 0 || num(i.rate) < 0)) {
        const bad = doc.items.find(i => num(i.qty) < 0 || num(i.rate) < 0);
        problems.push(["line:" + bad.id, "Quantities and rates can't be negative. For returns or refunds, use a credit note."]);
    }
    if (Store.numberTaken(doc)) problems.push(["number", `${doc.number} is already used by another ${t.label.toLowerCase()}.`]);
    return problems;
}

/* A line counts once anything meaningful is typed into it; a blank spare line does not */
function lineUsed(it) {
    return !!(String(it.name ?? "").trim() || String(it.desc ?? "").trim() || num(it.rate) !== 0 || String(it.hs ?? "").trim());
}
/* Drop blank spare lines before saving or printing, but always keep at least one line */
function dropBlankLines(doc) {
    if (DOC_TYPES[doc.type].text) return false;
    const kept = doc.items.filter(lineUsed);
    if (!kept.length || kept.length === doc.items.length) return false;
    doc.items = kept;
    return true;
}
/* Lines without a name save fine; just mention it once so it is a choice, not an accident */
function unnamedLinesNote(doc) {
    if (DOC_TYPES[doc.type].text) return "";
    const n = doc.items.map((it, i) => (!String(it.name ?? "").trim() && !String(it.desc ?? "").trim()) ? i + 1 : 0).filter(Boolean);
    if (!n.length) return "";
    return ` Line${n.length > 1 ? "s" : ""} ${n.join(", ")} ha${n.length > 1 ? "ve" : "s"} no description.`;
}
function problemEl(path) {
    if (path.startsWith("line:")) return $(`.line[data-id="${path.slice(5)}"] .line-name`);
    return $(`[data-bind="${path}"]`);
}

function showProblems(problems) {
    $$(".field.invalid, .line.invalid").forEach(f => f.classList.remove("invalid"));
    problems.forEach(([path]) => {
        if (!path) return;
        const el = problemEl(path);
        if (el && path.startsWith("line:")) {
            el.closest(".line").classList.add("invalid");
            const sec = el.closest("details");
            if (sec) sec.open = true;
            return;
        }
        if (el) {
            el.closest(".field")?.classList.add("invalid");
            const sec = el.closest("details");
            if (sec) sec.open = true;
        }
    });
    const first = problems.find(p => p[0]);
    if (first) {
        const el = problemEl(first[0]);
        if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
    toast(problems.map(p => p[1]).join(" "), "bad", 6000);
}

function refreshAutoNumber() {
    const doc = App.doc;
    if (!doc.auto || Store.getDoc(doc.id)) return;
    const n = Store.settings.numbering[doc.type];
    doc.seq = n.next;
    doc.number = formatNumber(doc.type, doc.seq, doc.date);
    while (Store.numberTaken(doc)) { doc.seq++; doc.number = formatNumber(doc.type, doc.seq, doc.date); }
    const el = $(`[data-bind="number"]`);
    if (el) el.value = doc.number;
}

/* A quotation, proforma or sales order that has become an invoice says so */
function markSourceConverted(doc) {
    if (doc.type !== "invoice" || !doc.sourceId) return;
    const src = Store.getDoc(doc.sourceId);
    if (!src) return;
    const next = { quotation: "accepted", proforma: "accepted", salesOrder: "invoiced" }[src.type];
    if (!next || src.status === next || ["cancelled", "declined"].includes(src.status)) return;
    try { Store.saveDoc({ ...JSON.parse(JSON.stringify(src)), status: next }); } catch { /* the invoice is saved either way */ }
}

async function saveCurrent() {
    const doc = App.doc;
    refreshAutoNumber();
    if (dropBlankLines(doc)) { renderItems(); changed(); }
    const problems = validate(doc);
    if (problems.length) { showProblems(problems); return false; }
    $$(".field.invalid, .line.invalid").forEach(f => f.classList.remove("invalid"));
    const wasNew = !Store.getDoc(doc.id);
    const oldNumber = doc.number;
    // A credit note reduces the invoice it names; say so when that invoice can't be found for this customer
    if (doc.type === "creditNote" && doc.status !== "cancelled" && String(doc.ref || "").trim()) {
        const same = s2 => String(s2 || "").trim().toLowerCase();
        const inv = Store.data.docs.find(d => d.type === "invoice" && same(d.number) === same(doc.ref));
        doc.unlinked = false;
        if (!inv || same(inv.party?.name) !== same(doc.party?.name) || (inv.currency || "AED") !== (doc.currency || "AED")) {
            const why = !inv ? `There is no invoice ${doc.ref}.` : same(inv.party?.name) !== same(doc.party?.name) ? `Invoice ${doc.ref} is for ${inv.party?.name}, not ${doc.party?.name || "this customer"}.` : `Invoice ${doc.ref} is in ${inv.currency}, this credit note in ${doc.currency}.`;
            const ok = await confirmDialog(`${why} The credit note will be kept as credit for ${doc.party?.name || "the customer"} (it lowers what they owe overall, not one invoice).`, "Save as customer credit", false, "Invoice not matched");
            if (!ok) return false;
            doc.unlinked = true;     // kept as credit for the customer, not set against that invoice
        }
    }
    if (Server.online) {
        if (App._saving) return false;
        App._saving = true;
        const btn = $("#saveBtn");
        btn.disabled = true;
        try {
            const res = await Server.save("doc", { ...doc, savedAt: Date.now() });
            const savedDoc = res.object;
            // Keep anything typed while the save was on its way
            const typedSince = App.doc !== doc || App.doc.updatedAt > (doc.updatedAt || 0);
            if (!typedSince) App.doc = upgradeDoc(JSON.parse(JSON.stringify(savedDoc)));
            else Object.assign(App.doc, { number: savedDoc.number, seq: savedDoc.seq, status: savedDoc.status, paid: savedDoc.paid, credited: savedDoc.credited, balanceDue: savedDoc.balanceDue });
            App.dirty = typedSince;
        } catch (e) {
            if (e.offline) {
                Store.saveDoc(doc);   // queued: sent when the connection is back
                App.dirty = false;
                toast("You're offline. Saved on this device; it will be sent to EVAM Books when you're back online.", "warn", 7000);
                updateDocBar(); return true;
            }
            if (e.status === 409 && e.data?.current) {
                const r = await openDialog({ title: "Changed by someone else", body: `<p class="dialog-text">${esc(e.message)}</p>`, actions: [{ label: "Cancel", value: "cancel" }, { label: "Load their version", value: "load" }, { label: "Overwrite with mine", value: "mine", danger: true }] });
                if (r.value === "load") { Server.apply(e.data.current); loadDoc(JSON.parse(JSON.stringify(e.data.current)), false); }
                if (r.value === "mine") { Server.versions.set(doc.id, e.data.current.version); App._saving = false; btn.disabled = false; return saveCurrent(); }
            } else toast(e.message, "bad", 8000);
            return false;
        } finally { App._saving = false; btn.disabled = false; }
        Store.saveDraft(App.doc);
        if (wasNew) markSourceConverted(App.doc);
        const numberEl = $(`[data-bind="number"]`);
        if (numberEl) numberEl.value = App.doc.number;
        if (wasNew && App.doc.number !== oldNumber && !doc.auto) toast(`Saved as ${App.doc.number}.`, "warn", 6000);
        else {
            const note = unnamedLinesNote(App.doc);
            toast(`${wasNew ? "Saved" : "Updated"} ${App.doc.number}.${note}`, note ? "warn" : "good", note ? 5000 : undefined);
        }
        buildFormKeepScroll();
        renderPreview();
        updateDocBar();
        return true;
    }
    if (!Store.saveDoc(doc)) return false;
    App.doc = upgradeDoc(JSON.parse(JSON.stringify(Store.getDoc(doc.id))));
    App.dirty = false;
    Store.saveDraft(App.doc);
    if (wasNew) markSourceConverted(App.doc);
    if (App.doc.number !== oldNumber) {
        const n = $(`[data-bind="number"]`);
        if (n) n.value = App.doc.number;
        toast(`Saved as ${App.doc.number} because ${oldNumber} was taken in the meantime.`, "warn", 6000);
    } else {
        const note = unnamedLinesNote(App.doc);
        toast(`${wasNew ? "Saved" : "Updated"} ${App.doc.number}.${note}`, note ? "warn" : "good", note ? 5000 : undefined);
    }
    renderPreview();
    updateDocBar();
    return true;
}

function printCurrent() {
    refreshAutoNumber();
    if (dropBlankLines(App.doc)) { renderItems(); changed(); }
    const problems = validate(App.doc, true).filter(p => !/already used/.test(p[1]));
    if (problems.length) { showProblems(problems); return; }
    printDoc(App.doc);
}

async function preparePrint(doc) {
    // Lay the sheet out off-screen first, measure its real header and footer,
    // and reserve exactly that space on every printed page.
    const holder = document.createElement("div");
    holder.className = "measure";
    holder.innerHTML = renderDocument(doc);
    document.body.appendChild(holder);
    const imgs = $$("img", holder);
    const ready = Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    await Promise.race([Promise.all([ready, fonts]), new Promise(r => setTimeout(r, 2500))]);
    const sheet = holder.firstElementChild;
    const space = measureFrame(sheet);
    sheet.style.setProperty("--head-space", space.head + "mm");
    sheet.style.setProperty("--foot-space", space.foot + "mm");
    const root = $("#printRoot");
    root.innerHTML = "";
    root.appendChild(sheet);
    holder.remove();
    return sheet;
}

function measureFrame(sheet) {
    const mm = px => px * 25.4 / 96 / (parseFloat(getComputedStyle(sheet).zoom) || 1);
    const head = $(".lh-head", sheet);
    const foot = $(".doc-foot, .lh-foot", sheet);
    return {
        head: round(head ? mm(head.getBoundingClientRect().height) + 6 : 14, 1),
        foot: round(foot ? mm(foot.getBoundingClientRect().height) + 5 : 12, 1)
    };
}

async function printDoc(doc) {
    App._titleBeforePrint = document.title;
    document.title = docFilename(doc); // becomes the PDF file name
    document.body.classList.add("printing");
    await preparePrint(doc);
    window.print();
}

/* ==========================================================
   DOCUMENTS VIEW
   ========================================================== */
function renderDocsView() {
    const tf = $("#docTypeFilter");
    if (!tf.options.length) {
        tf.innerHTML = `<option value="">All types</option>` + Object.entries(DOC_TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
        $("#docStatusFilter").innerHTML = `<option value="">Any status</option>` +
            Object.keys(STATUS).map(s => `<option value="${s}">${STATUS[s].label}</option>`).join("");
    }
    renderLedgerStrip();
    renderDocsTable();
}

// Match Finance > Invoices: include issued credit notes linked to this invoice.
function documentsInvoiceBalance(d) {
    if (!d || d.status === "cancelled") return 0;

    const total = computeTotals({ ...d, paid: 0 }).total;
    const credited = Math.max(0, num(d.credited));

    // Credit notes must reference this exact invoice and match its customer/currency.
    // Ignore drafts, cancelled notes, and notes saved as unlinked customer credit.
    const norm = value => String(value ?? "").trim().toLowerCase();
    const linkedCreditTotal = (Store.data.docs || []).reduce((sum, creditNote) => {
        if (creditNote.type !== "creditNote") return sum;
        if (["draft", "cancelled"].includes(String(creditNote.status || "").toLowerCase())) return sum;
        if (creditNote.unlinked) return sum;
        if (norm(creditNote.ref) !== norm(d.number)) return sum;
        if (norm(creditNote.party?.name) !== norm(d.party?.name)) return sum;
        if (String(creditNote.currency || "AED").toUpperCase() !== String(d.currency || "AED").toUpperCase()) return sum;
        return sum + Math.max(0, computeTotals({ ...creditNote, paid: 0 }).total);
    }, 0);

    // Avoid double-deducting credits already reflected in d.credited.
    const creditApplied = Math.max(credited, linkedCreditTotal);

    if (!Server.online) {
        // invoiceBalance already accounts for saved payments/credits locally.
        // Deduct only the linked credit-note amount not already included in credited.
        return Math.max(0, round(
            invoiceBalance(d) - Math.max(0, linkedCreditTotal - credited),
            decimalsFor(d.currency || "AED")
        ));
    }

    const allocated = (Server.fin.payment || []).reduce((sum, payment) =>
        sum + (payment.allocations || []).reduce((part, allocation) =>
            part + (allocation.docId === d.id ? num(allocation.amount) : 0), 0), 0);

    return Math.max(0, round(total - allocated - creditApplied, decimalsFor(d.currency || "AED")));
}

function renderLedgerStrip() {
    const primary = Store.settings.defaults.currency;
    const docs = Store.data.docs;
    const month = todayISO().slice(0, 7);
    const sumBy = (list, fn) => list.reduce((m, d) => { const v = fn(d); if (v) m[d.currency] = (m[d.currency] || 0) + v; return m; }, {});
    const invoices = docs.filter(d => d.type === "invoice");
    // Use the same payment-allocation balance as Finance > Invoices.
    const open = invoices.filter(d => documentsInvoiceBalance(d) > 0);
    const outstanding = sumBy(open, d => documentsInvoiceBalance(d));
    const drafts = open.filter(d => d.status === "draft").length;
    const overdueList = open.filter(d => effectiveStatus(d) === "overdue");
    const overdue = sumBy(overdueList, d => documentsInvoiceBalance(d));
    // Money received this month: payments recorded this month (older records fall back to the invoice date)
    const receivedIn = d => (d.paidAt ? isoOf(new Date(d.paidAt)) : d.date || "").slice(0, 7) === month;
    const receivedList = Server.online ? Server.fin.payment.filter(p => (p.date || "").slice(0, 7) === month) : invoices.filter(d => d.status !== "cancelled" && num(d.paid) > 0 && receivedIn(d));
    const paidMonth = Server.online ? sumBy(receivedList, p => num(p.amount)) : sumBy(receivedList, d => Math.min(num(d.paid), computeTotals({ ...d, paid: 0 }).total));
    const quotes = docs.filter(d => d.type === "quotation" && ["draft", "sent"].includes(d.status) && effectiveStatus(d) !== "expired");
    const quoted = sumBy(quotes, d => computeTotals(d).total);
    const money = (m) => {
        const keys = Object.keys(m);
        if (!keys.length) return `<div class="ls-value"><span class="ls-cur">${primary}</span>${fmt(0, primary)}</div>`;
        const main = m[primary] !== undefined ? primary : keys[0];
        const rest = keys.filter(k => k !== main);
        return `<div class="ls-value"><span class="ls-cur">${main}</span>${fmt(m[main], main)}</div>${rest.length ? `<div class="ls-more">${rest.map(k => `${k} ${fmt(m[k], k)}`).join(" · ")}</div>` : ""}`;
    };
    $("#ledgerStrip").innerHTML = `
<div class="ls"><div class="ls-label">Outstanding</div>${money(outstanding)}<div class="ls-note">${open.length} unpaid ${open.length === 1 ? "invoice" : "invoices"}${drafts ? ` · ${drafts} not yet sent` : ""}</div></div>
<div class="ls ${overdueList.length ? "ls-bad" : ""}"><div class="ls-label">Overdue</div>${money(overdue)}<div class="ls-note">${overdueList.length ? `${overdueList.length} past due date` : "Nothing past due"}</div></div>
<div class="ls"><div class="ls-label">Received this month</div>${money(paidMonth)}<div class="ls-note">${receivedList.length} ${receivedList.length === 1 ? "payment" : "payments"} in ${MONTHS_LONG[new Date().getMonth()]}</div></div>
<div class="ls"><div class="ls-label">Open quotations</div>${money(quoted)}<div class="ls-note">${quotes.length} ${quotes.length === 1 ? "quotation" : "quotations"} not yet accepted</div></div>`;
}

function filteredDocs() {
    const q = $("#docSearch").value.trim().toLowerCase();
    const type = $("#docTypeFilter").value;
    const status = $("#docStatusFilter").value;
    return Store.data.docs.filter(d => {
        if (type && d.type !== type) return false;
        if (status && effectiveStatus(d) !== status) return false;
        if (q) {
            const hay = [d.number, d.party?.name, d.ref, d.letter?.subject, d.title, d.letter?.to, d.res?.subject, d.import?.fileName, d.import?.text?.slice(0, 4000)].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
}

function statusPill(doc) {
    const s = effectiveStatus(doc);
    const st = STATUS[s] || STATUS.draft;
    return `<span class="pill pill-${st.tone}">${st.label}</span>`;
}

function renderDocsTable() {
    const host = $("#docsTable");
    const list = filteredDocs();
    if (!Store.data.docs.length) {
        host.innerHTML = `
<div class="empty">
  <div class="empty-art">${icon("note", 34)}</div>
  <h2>No saved documents yet</h2>
  <p>Create an invoice, quotation or letter and press Save. It will be listed here with its status and balance.</p>
  <p class="muted">Used EVAM Documents on another computer, browser or from a downloaded folder? Documents are kept in each browser separately: there, use <b>Settings → Backup → Export backup</b>, then here <b>Import a backup</b>. Moving from another system? Import your old PDFs.</p>
  <div class="empty-actions"><a class="btn btn-ghost" href="#settings" onclick="App.settingsTab='backup'">${icon("upload")}<span>Import a backup</span></a><a class="btn btn-ghost" href="#import">${icon("upload")}<span>Import old documents</span></a><a class="btn btn-primary" href="#create">${icon("plus")}<span>Create a document</span></a></div>
</div>`;
        return;
    }
    if (!list.length) {
        host.innerHTML = `<div class="empty"><h2>No documents match</h2><p>Clear the search or choose a different type or status.</p></div>`;
        return;
    }
    host.innerHTML = `
<table class="dtable">
  <thead><tr><th>Number</th><th>Type</th><th>Customer / vendor</th><th>Date</th><th>Due / valid</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>
  ${list.map(d => {
        const t = DOC_TYPES[d.type];
        const tot = t.prices ? computeTotals(d) : null;
        const who = docWho(d);
        return `<tr data-id="${d.id}">
      <td><button type="button" class="link-strong" data-open="${d.id}">${esc(d.number)}</button></td>
      <td class="muted">${esc(t.short)}</td>
      <td class="who">${esc(who) || '<span class="muted">—</span>'}</td>
      <td>${fmtDate(d.date)}</td>
      <td>${fmtDate(d.due || d.valid) || '<span class="muted">—</span>'}</td>
      <td class="num">${tot ? `<span class="cur">${d.currency}</span>${fmt(tot.total, d.currency)}` : '<span class="muted">—</span>'}</td>
      <td class="num">${tot && t.paid ? (documentsInvoiceBalance(d) > 0 ? `<span class="cur">${d.currency}</span>${fmt(documentsInvoiceBalance(d), d.currency)}` : '<span class="muted">0.00</span>') : '<span class="muted">—</span>'}</td>
      <td>${statusPill(d)}${d.import && !d.import.checked ? ` <span class="pill pill-warn" title="${esc((d.import.issues || []).join(" "))}">Check</span>` : ""}</td>
      <td class="act"><button type="button" class="icon-btn" data-docmenu="${d.id}" aria-label="Actions for ${esc(d.number)}">${icon("more")}</button></td>
    </tr>`;
    }).join("")}
  </tbody>
</table>`;
    $$("[data-open]", host).forEach(b => b.addEventListener("click", () => openSaved(b.dataset.open)));
    $$("tbody tr", host).forEach(tr => tr.addEventListener("dblclick", () => openSaved(tr.dataset.id)));
    $$("[data-docmenu]", host).forEach(b => b.addEventListener("click", () => docRowMenu(b, b.dataset.docmenu)));
}

function docRowMenu(anchor, id) {
    const d = Store.getDoc(id);
    const t = DOC_TYPES[d.type];
    const items = [
        { label: "Open", icon: "pen", onClick: () => openSaved(id) },
        { label: "Print / PDF", icon: "print", onClick: () => printDoc(upgradeDoc(JSON.parse(JSON.stringify(d)))) },
        { label: "Duplicate", icon: "copy", onClick: async () => { if (await openSaved(id)) duplicateCurrent(); } }
    ];
    (CONVERSIONS[d.type] || []).forEach(k => items.push({ label: `Create ${DOC_TYPES[k].label.toLowerCase()}`, icon: "swap", onClick: async () => { if (await openSaved(id)) convertCurrent(k); } }));
    if (Server.online && t.paid && d.status !== "cancelled" && documentsInvoiceBalance(d) > 0 && Server.can("sales")) items.push({ label: "Record payment", icon: "check", onClick: () => Finance.paymentForm({ invoiceId: d.id }) });
    if (Server.online && d.type === "purchaseOrder" && Server.can("purchases")) items.push({ label: "Create bill", icon: "swap", onClick: () => Finance.billFromPO(d) });
    if (!Server.online && t.paid && !["paid", "cancelled"].includes(d.status) && invoiceBalance(d) > 0) items.push({ label: "Mark as paid", icon: "check", onClick: () => {
        d.paid = amountDue(d); d.status = "paid"; d.paidAt = Date.now(); Store.saveDoc(d);
        if (App.doc.id === id) {
            // Keep any unsaved edits in the editor; only the payment fields change
            App.doc.paid = d.paid; App.doc.status = "paid"; App.doc.paidAt = d.paidAt;
            if (App.dirty) { buildForm(); renderPreview(true); updateDocBar(); Store.saveDraft(App.doc); }
            else loadDoc(JSON.parse(JSON.stringify(d)));
        }
        renderDocsView(); toast(`${d.number} marked as paid.`, "good");
    } });
    if (t.statuses.includes("sent") && (d.status === "draft" || d.status === "imported")) items.push({ label: "Mark as sent", icon: "check", onClick: () => {
        d.status = "sent"; Store.saveDoc(d);
        if (App.doc.id === id) { App.doc.status = "sent"; updateDocBar(); renderPreview(); }
        renderDocsView(); toast(`${d.number} marked as sent.`);
    } });
    items.push({ divider: true }, { label: "Delete", icon: "trash", danger: true, onClick: async () => {
        if (!await confirmDialog(`Delete ${d.number}? This cannot be undone.`, "Delete", true, "Delete document")) return;
        if (!(await removeDoc(id))) return;
        if (App.doc.id === id) loadDoc(newDoc(d.type), false);
        renderDocsView(); updateSaveState(); toast(`Deleted ${d.number}.`);
    } });
    showMenu(anchor, items, "right");
}

function exportCSV() {
    const list = filteredDocs();
    if (!list.length) { toast("There are no documents to export.", "warn"); return; }
    const head = ["Type", "Number", "Date", "Due / valid", "Customer / vendor", "TRN", "Reference", "Currency", "Subtotal", "Discount", "Other charges", "VAT", "Total", "Received", "Balance", "Status"];
    const rows = list.map(d => {
        const t = DOC_TYPES[d.type];
        const tot = t.prices ? computeTotals(d) : null;
        const n = (v) => tot ? round(v, tot.dec).toFixed(tot.dec) : "";
        return [t.label, d.number, d.date, d.due || d.valid, docWho(d), d.party.trn, d.ref, t.prices ? d.currency : "",
            n(tot?.subtotal), n(tot ? tot.lineDiscount + tot.docDiscount : 0), n(tot?.chargesTotal), n(tot?.vatTotal), n(tot?.total), n(tot?.paid), t.paid ? n(invoiceBalance(d)) : "", STATUS[effectiveStatus(d)]?.label || d.status];
    });
    const csv = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    download(`EVAM documents ${todayISO()}.csv`, csv, "text/csv;charset=utf-8");
}

/* ==========================================================
   CONTACTS & PRODUCTS
   ========================================================== */
function renderContactsView() {
    const q = $("#contactSearch").value.trim().toLowerCase();
    const list = Store.data.contacts.filter(c => !q || [c.name, c.trn, c.email, c.phone, c.attn].join(" ").toLowerCase().includes(q));
    const host = $("#contactsTable");
    if (!Store.data.contacts.length) {
        host.innerHTML = `<div class="empty"><div class="empty-art">${icon("user", 34)}</div><h2>No contacts yet</h2><p>Add customers and vendors here, or use “Save to contacts” on any document.</p><button type="button" class="btn btn-primary" id="emptyContact">${icon("plus")}<span>Add contact</span></button></div>`;
        $("#emptyContact").addEventListener("click", () => editContact(null));
        return;
    }
    const roleLabel = { customer: "Customer", vendor: "Vendor", both: "Customer & vendor" };
    host.innerHTML = `
<table class="dtable">
  <thead><tr><th>Name</th><th>Type</th><th>TRN</th><th>Phone</th><th>Email</th><th class="num">Documents</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${list.map(c => {
        const count = Store.data.docs.filter(d => (d.party?.name || "").trim().toLowerCase() === c.name.trim().toLowerCase()).length;
        return `<tr><td><button type="button" class="link-strong" data-edit="${c.id}">${esc(c.name)}</button>${c.attn ? `<div class="muted small">${esc(c.attn)}</div>` : ""}</td>
      <td class="muted">${roleLabel[c.role] || "Customer"}</td><td>${esc(c.trn) || '<span class="muted">—</span>'}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td>
      <td class="num">${count || '<span class="muted">0</span>'}</td>
      <td class="act"><button type="button" class="icon-btn" data-cmenu="${c.id}" aria-label="Actions for ${esc(c.name)}">${icon("more")}</button></td></tr>`;
    }).join("")}</tbody>
</table>`;
    $$("[data-edit]", host).forEach(b => b.addEventListener("click", () => editContact(b.dataset.edit)));
    $$("[data-cmenu]", host).forEach(b => b.addEventListener("click", () => {
        const c = Store.data.contacts.find(x => x.id === b.dataset.cmenu);
        showMenu(b, [
            { label: "Edit", icon: "pen", onClick: () => editContact(c.id) },
            { label: "New invoice", icon: "file", onClick: () => newDocFor(c, "invoice") },
            { label: "New quotation", icon: "file", onClick: () => newDocFor(c, "quotation") },
            { label: "New purchase order", icon: "file", onClick: () => newDocFor(c, "purchaseOrder") },
            { label: "New letter", icon: "file", onClick: () => newDocFor(c, "letter") },
            { divider: true },
            { label: "Delete", icon: "trash", danger: true, onClick: async () => {
                if (!await confirmDialog(`Delete ${c.name} from contacts? Documents already saved are not changed.`, "Delete", true, "Delete contact")) return;
                Store.remove("contacts", c.id); refreshLists(); renderContactsView();
            } }
        ], "right");
    }));
}

async function newDocFor(c, type) {
    if (App.dirty && hasContent(App.doc)) {
        const ok = await confirmDialog("The document you are editing has unsaved changes. Start a new one anyway?", "Discard changes", true, "Unsaved changes");
        if (!ok) return;
    }
    const d = newDoc(type);
    if (type === "letter") d.letter.to = [c.attn, c.name, c.address].filter(Boolean).join("\n");
    else Object.assign(d.party, { name: c.name, attn: c.attn || "", trn: c.trn || "", address: c.address || "", phone: c.phone || "", email: c.email || "" });
    loadDoc(d, false);
    location.hash = "#create";
}

async function editContact(id) {
    const c = id ? Store.data.contacts.find(x => x.id === id) : { id: uid("c"), role: "customer", name: "", attn: "", trn: "", address: "", phone: "", email: "" };
    const f = (name, label, val, type = "text") => `<div class="field"><label for="dc_${name}">${label}</label>${type === "textarea" ? `<textarea id="dc_${name}" name="${name}" rows="3">${esc(val)}</textarea>` : `<input id="dc_${name}" name="${name}" type="${type}" value="${esc(val)}">`}</div>`;
    const r = await openDialog({
        title: id ? "Edit contact" : "Add contact",
        wide: true,
        body: `<div class="grid-2">
  ${f("name", "Name", c.name)}
  <div class="field"><label for="dc_role">Type</label><select id="dc_role" name="role">${[["customer", "Customer"], ["vendor", "Vendor"], ["both", "Customer & vendor"]].map(([v, l]) => `<option value="${v}"${c.role === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
  ${f("attn", "Contact person", c.attn)}
  ${f("trn", "TRN / VAT no.", c.trn)}
  <div class="span-2">${f("address", "Address", c.address, "textarea")}</div>
  ${f("phone", "Phone", c.phone, "tel")}
  ${f("email", "Email", c.email, "email")}
</div>`,
        actions: [{ label: "Cancel", value: "cancel" }, { label: id ? "Save contact" : "Add contact", value: "ok", primary: true }],
        onOpen: el => $("#dc_name", el).focus()
    });
    if (r.value !== "ok") return;
    if (!r.data.name.trim()) { toast("A contact needs a name.", "warn"); return; }
    Store.upsert("contacts", { ...c, ...r.data, name: r.data.name.trim() });
    refreshLists();
    renderContactsView();
    toast(id ? "Contact saved." : "Contact added.", "good");
}

function renderProductsView() {
    const q = $("#productSearch").value.trim().toLowerCase();
    const list = Store.data.products.filter(p => !q || [p.name, p.desc, p.hs].join(" ").toLowerCase().includes(q));
    const host = $("#productsTable");
    if (!Store.data.products.length) {
        host.innerHTML = `<div class="empty"><div class="empty-art">${icon("box", 34)}</div><h2>No products yet</h2><p>Add the goods and services you sell or buy. On any line, type a product’s name to fill in its details.</p><button type="button" class="btn btn-primary" id="emptyProduct">${icon("plus")}<span>Add product</span></button></div>`;
        $("#emptyProduct").addEventListener("click", () => editProduct(null));
        return;
    }
    host.innerHTML = `
<table class="dtable">
  <thead><tr><th>Name</th><th>HS code</th><th>Unit</th><th class="num">Rate</th><th class="num">VAT</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${list.map(p => `<tr><td><button type="button" class="link-strong" data-edit="${p.id}">${esc(p.name)}</button>${p.desc ? `<div class="muted small clamp">${esc(p.desc)}</div>` : ""}</td>
    <td>${esc(p.hs) || '<span class="muted">—</span>'}</td><td>${esc(p.unit) || '<span class="muted">—</span>'}</td>
    <td class="num"><span class="cur">${esc(p.currency || "")}</span>${fmt(num(p.rate), p.currency || "AED")}</td><td class="num">${fmtPct(p.vat)}</td>
    <td class="act"><button type="button" class="icon-btn" data-pdel="${p.id}" aria-label="Delete ${esc(p.name)}">${icon("trash")}</button></td></tr>`).join("")}</tbody>
</table>`;
    $$("[data-edit]", host).forEach(b => b.addEventListener("click", () => editProduct(b.dataset.edit)));
    $$("[data-pdel]", host).forEach(b => b.addEventListener("click", async () => {
        const p = Store.data.products.find(x => x.id === b.dataset.pdel);
        if (!await confirmDialog(`Delete ${p.name} from products?`, "Delete", true, "Delete product")) return;
        Store.remove("products", p.id); refreshLists(); renderProductsView();
    }));
}

async function editProduct(id) {
    const p = id ? Store.data.products.find(x => x.id === id) : { id: uid("p"), name: "", desc: "", hs: "", unit: "pcs", rate: 0, vat: Store.settings.defaults.vat, currency: Store.settings.defaults.currency };
    const f = (name, label, val, type = "text", extra = "") => `<div class="field"><label for="dp_${name}">${label}</label>${type === "textarea" ? `<textarea id="dp_${name}" name="${name}" rows="3">${esc(val)}</textarea>` : `<input id="dp_${name}" name="${name}" type="${type}" value="${esc(val)}" ${extra}>`}</div>`;
    const r = await openDialog({
        title: id ? "Edit product" : "Add product",
        wide: true,
        body: `<div class="grid-2">
  <div class="span-2">${f("name", "Name", p.name)}</div>
  <div class="span-2">${f("desc", "Description", p.desc, "textarea")}</div>
  ${f("hs", "HS code", p.hs)}
  ${f("unit", "Unit", p.unit, "text", 'list="unitList"')}
  ${f("rate", "Rate", p.rate, "number", 'step="any"')}
  <div class="field"><label for="dp_currency">Currency</label><select id="dp_currency" name="currency">${Object.keys(CURRENCIES).map(k => `<option${k === (p.currency || "AED") ? " selected" : ""}>${k}</option>`).join("")}</select></div>
  ${f("vat", "VAT %", p.vat, "number", 'step="any"')}
</div>`,
        actions: [{ label: "Cancel", value: "cancel" }, { label: id ? "Save product" : "Add product", value: "ok", primary: true }],
        onOpen: el => $("#dp_name", el).focus()
    });
    if (r.value !== "ok") return;
    if (!r.data.name.trim()) { toast("A product needs a name.", "warn"); return; }
    Store.upsert("products", { ...p, ...r.data, name: r.data.name.trim(), rate: num(r.data.rate), vat: num(r.data.vat) });
    refreshLists();
    renderProductsView();
    toast(id ? "Product saved." : "Product added.", "good");
}

/* ==========================================================
   SETTINGS
   ========================================================== */
const SETTINGS_TABS = [
    ["company", "Company"], ["branding", "Branding"], ["banks", "Bank accounts"],
    ["numbering", "Numbering"], ["defaults", "Defaults & terms"], ["backup", "Backup"]
];

function renderSettings() {
    $("#settingsNav").innerHTML = SETTINGS_TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === App.settingsTab ? "on" : ""}"${k === App.settingsTab ? ' aria-current="true"' : ""}>${l}</button>`).join("");
    $$("#settingsNav button").forEach(b => b.addEventListener("click", () => { App.settingsTab = b.dataset.tab; renderSettings(); }));
    const body = $("#settingsBody");
    const s = Store.settings;
    App._settingsChanged = true;
    const persist = debounce(() => { Store.save(); renderPreview(true); }, 250);
    const bindInputs = (root, obj) => {
        $$("[data-s]", root).forEach(el => {
            const v = getPath(obj, el.dataset.s);
            if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
            el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
                let val = el.type === "checkbox" ? el.checked : el.value;
                if (el.dataset.kind === "num") val = num(val);
                setPath(obj, el.dataset.s, val);
                persist();
                if (el.dataset.rerender) renderSettings();
            });
        });
    };
    const f = (label, path, o = {}) => `<div class="field ${o.cls || ""}"><label>${label}${o.optional ? '<span class="opt">optional</span>' : ""}</label>${o.type === "textarea" ? `<textarea data-s="${path}" rows="${o.rows || 3}"></textarea>` : o.type === "select" ? `<select data-s="${path}"${o.rerender ? ' data-rerender="1"' : ""}>${o.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>` : `<input data-s="${path}" type="${o.type || "text"}"${o.kind ? ` data-kind="${o.kind}"` : ""}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}${o.type === "number" ? ' step="any"' : ""}>`}${o.hint ? `<div class="hint">${o.hint}</div>` : ""}</div>`;

    switch (App.settingsTab) {
        case "company":
            body.innerHTML = `<div class="panel">
<h2>Company</h2>
<p class="panel-sub">Printed in the header and footer of every document.</p>
<div class="grid-2">
  ${f("Company name", "company.name", { cls: "span-2" })}
  ${f("Address", "company.address", { type: "textarea", cls: "span-2" })}
  ${f("Phone", "company.phone")}
  ${f("Email", "company.email")}
  ${f("Website", "company.website")}
  ${f("TRN", "company.trn", { optional: true, hint: "Your UAE VAT registration number. Needed on tax invoices." })}
  ${f("Trade licence no.", "company.licence", { optional: true })}
  ${f("Licensing authority", "company.authority", { cls: "span-2", optional: true, hint: "Printed on board resolutions." })}
</div>
<h3 class="panel-h3">Directors</h3>
<p class="panel-sub">New board resolutions start with these directors. One per line, as <i>Name, Designation</i>.</p>
<div class="field"><textarea id="directorsText" rows="4" aria-label="Directors"></textarea></div>
</div>`;
            bindInputs(body, s);
            const dt = $("#directorsText");
            dt.value = (s.company.directors || []).map(d => d.title ? `${d.name}, ${d.title}` : d.name).join("\n");
            dt.addEventListener("input", () => {
                s.company.directors = dt.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
                    const i = l.lastIndexOf(",");
                    return i > 0 ? { name: l.slice(0, i).trim(), title: l.slice(i + 1).trim() } : { name: l, title: "Director" };
                });
                persist();
            });
            break;

        case "branding": {
            const swatches = [["#14395E", "EVAM navy"], ["#1F4E79", "Harbour blue"], ["#2F5D50", "Pine"], ["#7A2E2E", "Oxblood"], ["#8A6A2F", "Brass"], ["#2B2F36", "Graphite"]];
            const img = (key, label, def, hint) => {
                const val = s.brand[key];
                return `<div class="asset">
  <div class="asset-thumb ${key === "header" || key === "header1" || key === "footer" || key === "footer1" ? "wide" : ""}"><img src="${esc(val || def)}" alt="" onerror="this.style.visibility='hidden'"></div>
  <div class="asset-info"><div class="asset-label">${label}</div><div class="hint">${val ? "Your upload" : hint}</div>
    <div class="asset-actions">
      <label class="btn btn-ghost btn-sm">${icon("upload", 14)}<span>Upload</span><input type="file" accept="image/*" data-asset="${key}" hidden></label>
      ${val ? `<button type="button" class="btn btn-ghost btn-sm" data-reset="${key}">${key === "stamp" ? "Remove" : "Use original"}</button>` : ""}
    </div>
  </div></div>`;
            };
            body.innerHTML = `<div class="panel">
<h2>Branding</h2>
<p class="panel-sub">Colour, layout and artwork for every document.</p>
<div class="field"><label>Accent colour</label>
  <div class="swatches">${swatches.map(([c, n]) => `<button type="button" class="swatch${s.brand.color.toLowerCase() === c.toLowerCase() ? " on" : ""}" data-color="${c}" style="--sw:${c}" title="${n}" aria-label="${n}"></button>`).join("")}
  <label class="swatch swatch-custom" title="Custom colour"><input type="color" data-s="brand.color" aria-label="Custom colour"></label></div>
</div>
<div class="field"><label>Default layout</label>
  <div class="layout-cards">${[["classic", "Classic", "Logo, title tab and a coloured footer bar"], ["letterhead", "Letterhead", "Your printed letterhead artwork at top and bottom"], ["minimal", "Minimal", "Plain, light rules, no colour blocks"]].map(([v, l, d]) => `
    <button type="button" class="layout-card${s.brand.layout === v ? " on" : ""}" data-layoutdef="${v}"><span class="lc-art lc-${v}"><i></i><i></i><i></i></span><span class="lc-name">${l}</span><span class="lc-desc">${d}</span></button>`).join("")}</div>
</div>
<div class="grid-2">
  ${f("Document font", "brand.font", { type: "select", options: [["plex", "IBM Plex Sans"], ["poppins", "Poppins"], ["serif", "Source Serif"]] })}
  ${f("Letterhead size", "brand.letterhead", { type: "select", options: [["tall", "Tall header"], ["compact", "Compact header"]], rerender: true })}
</div>
<label class="check"><input type="checkbox" data-s="brand.watermark"><span class="check-box">${icon("check", 12)}</span><span class="check-text">Faint logo watermark on letters</span></label>
<h3 class="panel-h3">Artwork</h3>
<div class="assets">
  ${img("logo", "Logo", "logo.svg", "Original EVAM logo")}
  ${img(s.brand.letterhead === "compact" ? "header1" : "header", "Letterhead header", s.brand.letterhead === "compact" ? "images/header1.png" : "images/header.png", "Original artwork")}
  ${img(s.brand.letterhead === "compact" ? "footer1" : "footer", "Letterhead footer", s.brand.letterhead === "compact" ? "images/footer1.png" : "images/footer.png", "Original artwork")}
  ${img("signature", "Signature", "images/signature.png", "Original signature")}
  ${img("stamp", "Company stamp", "", "Optional. A transparent PNG works best.")}
</div>
<p class="panel-sub">To move or resize the signature and stamp, drag them on the document preview, or use the sizes under the signatory in each document. ${s.brand.marks && !marksAreDefault(normMarks(s.brand.marks)) ? `New documents use the position you saved. <button type="button" class="link-btn" id="marksDefaultReset">Use the usual place again</button>` : ""}</p></div>`;
            bindInputs(body, s);
            $("#marksDefaultReset", body)?.addEventListener("click", () => { delete s.brand.marks; Store.save(); renderSettings(); toast("New documents will use the usual position and size.", "good"); });
            $$("[data-color]", body).forEach(b => b.addEventListener("click", () => { s.brand.color = b.dataset.color; Store.save(); renderSettings(); renderPreview(true); }));
            $$("[data-layoutdef]", body).forEach(b => b.addEventListener("click", () => { s.brand.layout = b.dataset.layoutdef; Store.save(); renderSettings(); renderPreview(true); }));
            $$("[data-asset]", body).forEach(inp => inp.addEventListener("change", async () => {
                const file = inp.files[0];
                if (!file) return;
                try {
                    const key = inp.dataset.asset;
                    const url = await readImage(file, key.startsWith("header") || key.startsWith("footer") ? 2480 : 1200);
                    const im = new Image();
                    await new Promise(r => { im.onload = r; im.onerror = r; im.src = url; });
                    s.brand[key] = url;
                    if (im.naturalWidth) s.brand[key + "H"] = round(210 * im.naturalHeight / im.naturalWidth, 2);
                    if (Store.save()) toast("Image updated.", "good");
                    renderSettings(); renderPreview(true);
                } catch (err) { toast(err.message, "bad"); }
            }));
            $$("[data-reset]", body).forEach(b => b.addEventListener("click", () => { s.brand[b.dataset.reset] = ""; Store.save(); renderSettings(); renderPreview(true); }));
            break;
        }

        case "banks":
            body.innerHTML = `<div class="panel">
<h2>Bank accounts</h2>
<p class="panel-sub">Choose one on any invoice. When you change a document’s currency, the first account in that currency is picked.</p>
<div class="banks">${s.banks.map((b, i) => `
  <div class="bank-card" data-i="${i}">
    <div class="grid-2">
      <div class="field"><label>Name in menus</label><input data-b="label" value="${esc(b.label)}"></div>
      <div class="field"><label>Currency</label><select data-b="currency">${Object.keys(CURRENCIES).map(k => `<option${k === b.currency ? " selected" : ""}>${k}</option>`).join("")}</select></div>
      <div class="field span-2"><label>Printed details</label><textarea data-b="lines" rows="${Math.max(3, b.lines.length)}">${esc(b.lines.map(([k, v]) => `${k}: ${v}`).join("\n"))}</textarea><div class="hint">One per line, as <i>Label: value</i>.</div></div>
    </div>
    <button type="button" class="link-btn danger" data-bdel="${i}">${icon("trash", 14)} Remove account</button>
  </div>`).join("")}</div>
<button type="button" class="btn btn-ghost" id="addBank">${icon("plus")}<span>Add bank account</span></button>
</div>`;
            $$(".bank-card", body).forEach(card => {
                const b = s.banks[Number(card.dataset.i)];
                $$("[data-b]", card).forEach(el => el.addEventListener("input", () => {
                    if (el.dataset.b === "lines") {
                        b.lines = el.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
                            const i = l.indexOf(":");
                            return i === -1 ? ["", l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
                        });
                    } else b[el.dataset.b] = el.value;
                    persist();
                }));
            });
            $$("[data-bdel]", body).forEach(btn => btn.addEventListener("click", async () => {
                const b = s.banks[Number(btn.dataset.bdel)];
                if (!await confirmDialog(`Remove ${b.label}? Saved documents that use it will no longer show payment details.`, "Remove", true, "Remove bank account")) return;
                s.banks.splice(Number(btn.dataset.bdel), 1); Store.save(); renderSettings();
            }));
            $("#addBank").addEventListener("click", () => {
                s.banks.push({ id: uid("bank"), label: "New account", currency: s.defaults.currency, lines: [["Account name", s.company.name], ["Bank", ""], ["IBAN", ""], ["BIC / SWIFT", ""]] });
                Store.save(); renderSettings();
            });
            break;

        case "numbering":
            body.innerHTML = `<div class="panel">
<h2>Numbering</h2>
<p class="panel-sub">Each type has its own sequence. The next number is used when you save a new document.</p>
<div class="num-table">
  <div class="num-row num-head"><span>Type</span><span>Format</span><span>Next</span><span>Example</span></div>
  ${Object.entries(DOC_TYPES).map(([k, t]) => `<div class="num-row" data-type="${k}"><span class="num-type">${t.label}</span><input data-s="numbering.${k}.pattern" aria-label="${t.label} format"><input data-s="numbering.${k}.next" data-kind="num" type="number" min="1" aria-label="${t.label} next number"><span class="num-ex" data-ex="${k}"></span></div>`).join("")}
</div>
<div class="hint">Codes you can use: <code>{YYYY}</code> year, <code>{YY}</code> short year, <code>{MM}</code> or <code>{M}</code> month, <code>{DD}</code> day, <code>{SEQ3}</code> sequence padded to 3 digits (<code>{SEQ4}</code>, <code>{SEQ}</code> also work).</div>
</div>`;
            bindInputs(body, s);
            const ex = () => $$("[data-ex]", body).forEach(e => { const k = e.dataset.ex; e.textContent = formatNumber(k, s.numbering[k].next, todayISO()); });
            ex();
            $$("input", body).forEach(i => i.addEventListener("input", ex));
            break;

        case "defaults": {
            const tt = App._termsType || "invoice";
            body.innerHTML = `<div class="panel">
<h2>Defaults</h2>
<p class="panel-sub">Starting values for new documents. You can change them on each document.</p>
<div class="grid-2">
  ${f("Currency", "defaults.currency", { type: "select", options: Object.keys(CURRENCIES).map(k => [k, `${k} · ${CURRENCIES[k].name}`]) })}
  ${f("VAT %", "defaults.vat", { type: "number", kind: "num" })}
  ${f("Invoice due after (days)", "defaults.dueDays", { type: "number", kind: "num" })}
  ${f("Quotation valid for (days)", "defaults.validDays", { type: "number", kind: "num" })}
  ${f("Signatory name", "defaults.signatoryName")}
  ${f("Signatory designation", "defaults.signatoryTitle")}
</div>
<label class="check"><input type="checkbox" data-s="defaults.showSignature"><span class="check-box">${icon("check", 12)}</span><span class="check-text">Sign new trade documents by default<small>Adds signatory, signature image and stamp</small></span></label>
<h3 class="panel-h3">Terms and footer note by document type</h3>
<div class="field"><label for="termsType">Document type</label><select id="termsType">${Object.entries(DOC_TYPES).filter(([, t]) => !t.text).map(([k, t]) => `<option value="${k}"${k === tt ? " selected" : ""}>${t.label}</option>`).join("")}</select></div>
<div class="field"><label>Default terms</label><div id="rteDefaultTerms"></div></div>
${f("Footer note", `defaults.footers.${tt}`)}
</div>`;
            bindInputs(body, s);
            createRichEditor($("#rteDefaultTerms"), { value: s.defaults.terms[tt], minHeight: 140, onInput: html => { s.defaults.terms[tt] = html; persist(); } });
            $("#termsType").addEventListener("change", e => { App._termsType = e.target.value; renderSettings(); });
            break;
        }

        case "backup": {
            const bytes = (localStorage.getItem(STORE_KEY) || "").length;
            body.innerHTML = `<div class="panel">
<h2>Backup</h2>
<p class="panel-sub">Everything is stored in this browser only: ${Store.data.docs.length} documents, ${Store.data.contacts.length} contacts, ${Store.data.products.length} products, about ${Math.max(1, Math.round(bytes / 1024))} KB. Export a backup regularly, and use it to move to another computer.</p>
<div class="backup-actions">
  <button type="button" class="btn btn-primary" id="exportJson">${icon("download")}<span>Export backup</span></button>
  <label class="btn btn-ghost">${icon("upload")}<span>Import backup</span><input type="file" accept="application/json,.json" id="importJson" hidden></label>
</div>
<h3 class="panel-h3">Start over</h3>
<p class="panel-sub">Deletes all documents, contacts, products and settings in this browser. Export a backup first.</p>
<button type="button" class="btn btn-danger" id="wipeAll">${icon("trash")}<span>Delete all data</span></button>
</div>`;
            $("#exportJson").addEventListener("click", () => download(`EVAM documents backup ${todayISO()}.json`, Store.exportJSON(), "application/json"));
            $("#importJson").addEventListener("change", async e => {
                const file = e.target.files[0];
                if (!file) return;
                const r = await openDialog({
                    title: "Import backup",
                    body: `<p class="dialog-text">Add the documents, contacts and products from <b>${esc(file.name)}</b> to what is here, or replace everything with the backup?</p>`,
                    actions: [{ label: "Cancel", value: "cancel" }, { label: "Replace everything", value: "replace", danger: true }, { label: "Add to existing", value: "merge", primary: true }]
                });
                if (r.value === "cancel") return;
                try {
                    Store.importJSON(await file.text(), r.value);
                    App._settingsChanged = true;
                    refreshLists(); renderSettings(); updateSaveState();
                    toast("Backup imported.", "good");
                } catch (err) { toast(err.message || "That file could not be read.", "bad", 6000); }
            });
            $("#wipeAll").addEventListener("click", async () => {
                if (!await confirmDialog("Delete every document, contact, product and setting in this browser? This cannot be undone.", "Delete all data", true, "Delete all data")) return;
                App._noFlush = true;
                localStorage.removeItem(STORE_KEY);
                localStorage.removeItem(DRAFT_KEY);
                location.hash = "#create";
                location.reload();
            });
            break;
        }
    }
}

document.addEventListener("DOMContentLoaded", init);


/* ==========================================================
   SIGNATURE & STAMP PLACEMENT
   Drag the signature or stamp anywhere on the preview, resize it with the
   corner handles or the sliders. Positions are kept per document in mm.
   ========================================================== */
const MarkUI = { sel: null, drag: null };

function marksControlsHTML() {
    const hasStamp = !!Store.settings.brand.stamp;
    const m = App.doc.signature.marks;
    const mode = m.mode || "both";
    const show = kind => mode === "both" || mode === kind;
    const modes = [["both", "Signature + stamp"], ["sig", "Signature only"], ["stamp", "Stamp only"], ["none", "Neither"]];
    const slider = (kind, label) => `
<div class="mark-item" data-mark-for="${kind}"${show(kind) ? "" : " hidden"}>
  <button type="button" class="mark-name" data-act="marksSelect" data-kind="${kind}" title="Select it on the page">${label}</button>
  <div class="mark-row"><span>Size</span>
    <input type="range" min="${MARK_LIMITS.sMin * 100}" max="${MARK_LIMITS.sMax * 100}" step="5" value="${Math.round(m[kind].s * 100)}" data-mark-size="${kind}" aria-label="${label} size">
    <output data-mark-out="${kind}">${Math.round(m[kind].s * 100)}%</output></div>
  <div class="mark-row"><span>Angle</span>
    <input type="range" min="-180" max="180" step="1" value="${m[kind].r || 0}" data-mark-rot="${kind}" aria-label="${label} angle">
    <output data-mark-rout="${kind}">${m[kind].r || 0}°</output></div>
</div>`;
    return `
<div class="marks-box">
  <div class="marks-head"><b>Signature &amp; stamp</b><span class="hint">Drag each one on the preview to place it anywhere, pull a corner to resize, or the round handle to turn it. They move separately.</span></div>
  <div class="seg seg-wrap marks-mode" role="group" aria-label="What to put on the document">${modes.map(([v, l]) => {
        const off = !hasStamp && (v === "both" || v === "stamp");
        return `<button type="button" data-mark-mode="${v}" class="${v === mode ? "on" : ""}" aria-pressed="${v === mode}"${off ? ` disabled title="Add a company stamp in Settings → Branding first"` : ""}>${l}</button>`;
    }).join("")}</div>
  ${slider("sig", "Signature")}
  ${hasStamp ? slider("stamp", "Stamp") : `<div class="hint">No company stamp yet. Add one in Settings → Branding.</div>`}
  <div class="marks-actions">
    <button type="button" class="btn btn-ghost btn-sm" data-act="marksReset">${icon("refresh", 14)}<span>Reset position, size &amp; angle</span></button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="marksDefault">${icon("check", 14)}<span>Use for new documents</span></button>
  </div>
</div>`;
}

function syncMarkControls() {
    const m = App.doc.signature && App.doc.signature.marks;
    if (!m) return;
    $$("[data-mark-size]").forEach(el => { el.value = Math.round(m[el.dataset.markSize].s * 100); });
    $$("[data-mark-out]").forEach(el => { el.textContent = Math.round(m[el.dataset.markOut].s * 100) + "%"; });
    $$("[data-mark-rot]").forEach(el => { el.value = m[el.dataset.markRot].r || 0; });
    $$("[data-mark-rout]").forEach(el => { el.textContent = (m[el.dataset.markRout].r || 0) + "°"; });
}

function markEl(kind) { return $(`#sheetHolder [data-mark="${kind}"]`); }

/* Apply a mark straight to the preview element while dragging, without a full re-render */
function paintMark(kind) {
    const el = markEl(kind);
    if (!el) return;
    const m = App.doc.signature.marks[kind];
    el.style.setProperty("--ms", m.s);
    el.style.transform = markTransform(m);
}

/* Change the size of one item. The other item never moves. `fixed` says which point of
   this item stays put: its centre (sliders, keys) or the corner opposite the dragged handle. */
function resizeMark(kind, s, fixed = { h: "center", v: "center" }, start = null) {
    const el = markEl(kind);
    const m = App.doc.signature.marks[kind];
    const base = start || { m: { ...m }, r: el ? markGeom(el) : null };
    const s1 = normMark({ s }).s;
    if (base.m.r) fixed = { h: "center", v: "center" };   // turned: grow around the centre
    if (base.r && base.m.s) {
        const k = mmPerPx();
        const dw = base.r.width * k * (s1 / base.m.s - 1), dh = base.r.height * k * (s1 / base.m.s - 1);
        // Images are anchored at their bottom edge and at the right (or left) edge, so growth goes up and inward
        const leftAnchored = !!(el && el.closest(".sign-left, .res-cert-body"));
        const hx = fixed.h === "center" ? (leftAnchored ? -dw / 2 : dw / 2) : (fixed.h === "left" ? (leftAnchored ? 0 : dw) : (leftAnchored ? -dw : 0));
        const vy = fixed.v === "center" ? dh / 2 : (fixed.v === "top" ? dh : 0);
        m.x = normMark({ x: base.m.x + hx }).x;
        m.y = normMark({ y: base.m.y + vy }).y;
    }
    m.s = s1;
}

function setMarkMode(mode) {
    App.doc.signature.marks.mode = mode;
    if (MarkUI.sel && !["both", MarkUI.sel].includes(mode)) MarkUI.sel = null;
    $$("[data-mark-mode]").forEach(b => { const on = b.dataset.markMode === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $$("[data-mark-for]").forEach(r => { r.hidden = !(mode === "both" || mode === r.dataset.markFor); });
    applyConditions();
    changed();
    renderPreview(true);
    placeMarkBox();
}

function setMarkAngle(kind, deg) {
    App.doc.signature.marks[kind].r = normMark({ r: deg }).r;
    paintMark(kind);
    syncMarkControls();
    placeMarkBox();
    changed();
}

function setMarkSize(kind, s) {
    resizeMark(kind, s);
    paintMark(kind);
    syncMarkControls();
    placeMarkBox();
    changed();
}

function resetMarks() {
    App.doc.signature.marks = normMarks({ mode: App.doc.signature.marks.mode });
    ["sig", "stamp"].forEach(paintMark);
    syncMarkControls();
    changed();
    requestAnimationFrame(placeMarkBox);
    toast("Signature and stamp are back in their usual place.");
}

function saveMarksAsDefault() {
    Store.settings.brand.marks = JSON.parse(JSON.stringify(App.doc.signature.marks));
    Store.save();
    toast(marksAreDefault(App.doc.signature.marks) ? "New documents will use the usual position and size." : "New documents will use this position and size.", "good");
}

function selectMark(kind, scroll = false) {
    const el = markEl(kind);
    if (!el) { MarkUI.sel = null; placeMarkBox(); if (scroll) toast("Turn on the signature for this document first.", "warn"); return; }
    MarkUI.sel = kind;
    if (scroll) el.scrollIntoView({ block: "center", behavior: "smooth" });
    placeMarkBox();
    setTimeout(placeMarkBox, 350);
}

/* The selection box lives outside the sheet so it never prints */
function markBox() {
    let box = $("#markBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "markBox";
        box.className = "mark-box";
        box.hidden = true;
        box.innerHTML = `<span class="mark-label"></span><span class="mark-rot-stem"></span><span class="mark-rot" data-rotate="1" title="Drag to turn (Shift: 15° steps)"></span>${["nw", "ne", "sw", "se"].map(c => `<span class="mark-h mark-${c}" data-corner="${c}"></span>`).join("")}`;
        $("#deskScroll").appendChild(box);
        box.addEventListener("pointerdown", e => e.target.dataset.rotate ? startMarkRotate(e, MarkUI.sel) : startMarkDrag(e, MarkUI.sel, e.target.dataset.corner || null));
        box.addEventListener("dblclick", e => { if (e.target.dataset.rotate && MarkUI.sel) setMarkAngle(MarkUI.sel, 0); });
    }
    return box;
}

/* Size and centre of an item before turning, in screen pixels */
function markGeom(el) {
    const sheet = $("#sheetHolder .sheet");
    const z = sheet ? sheet.getBoundingClientRect().width / sheet.offsetWidth : 1;
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth * z, h = el.offsetHeight * z;
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, width: w, height: h };
}

function placeMarkBox() {
    const box = markBox();
    const el = MarkUI.sel && markEl(MarkUI.sel);
    if (!el || App.view !== "create") { box.hidden = true; return; }
    const sc = $("#deskScroll"), g = markGeom(el), sr = sc.getBoundingClientRect();
    const m = App.doc.signature.marks[MarkUI.sel];
    box.hidden = false;
    Object.assign(box.style, {
        left: (g.cx - g.width / 2 - sr.left + sc.scrollLeft) + "px", top: (g.cy - g.height / 2 - sr.top + sc.scrollTop) + "px",
        width: g.width + "px", height: g.height + "px", transform: m.r ? `rotate(${m.r}deg)` : ""
    });
    $(".mark-label", box).style.transform = m.r ? `rotate(${-m.r}deg)` : "";
    $(".mark-label", box).textContent = `${MarkUI.sel === "sig" ? "Signature" : "Stamp"} · ${Math.round(m.s * 100)}%${m.r ? ` · ${m.r}°` : ""}`;
}

function mmPerPx() {
    const sheet = $("#sheetHolder .sheet");
    return sheet ? 210 / sheet.getBoundingClientRect().width : 0.26;
}

function startMarkDrag(e, kind, corner) {
    if (!kind || e.button > 0) return;
    const el = markEl(kind);
    if (!el) return;
    e.preventDefault();
    const m = App.doc.signature.marks[kind];
    const r = el.getBoundingClientRect();
    const sheet = $("#sheetHolder .sheet").getBoundingClientRect();
    MarkUI.drag = { kind, corner, x0: e.clientX, y0: e.clientY, m0: { ...m }, r, g: markGeom(el), sheet, k: mmPerPx(), moved: false };
    document.body.classList.add("mark-dragging");
    window.addEventListener("pointermove", onMarkMove);
    window.addEventListener("pointerup", endMarkDrag, { once: true });
    window.addEventListener("pointercancel", endMarkDrag, { once: true });
}

function startMarkRotate(e, kind) {
    const el = kind && markEl(kind);
    if (!el || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = markGeom(el);
    const ang = (x, y) => Math.atan2(y - g.cy, x - g.cx) * 180 / Math.PI;
    const m = App.doc.signature.marks[kind];
    const a0 = ang(e.clientX, e.clientY), r0 = m.r || 0;
    let moved = false;
    document.body.classList.add("mark-dragging");
    const move = ev => {
        let r = r0 + ang(ev.clientX, ev.clientY) - a0;
        r = ((r + 540) % 360) - 180;
        if (ev.shiftKey) r = Math.round(r / 15) * 15;
        else if (Math.abs(r) < 2) r = 0;   // snap back to straight
        m.r = normMark({ r }).r;
        moved = true;
        paintMark(kind); syncMarkControls(); placeMarkBox();
    };
    const end = () => {
        window.removeEventListener("pointermove", move);
        document.body.classList.remove("mark-dragging");
        if (moved) changed();
        placeMarkBox();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
}

function onMarkMove(e) {
    const d = MarkUI.drag;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    const m = App.doc.signature.marks[d.kind];
    if (d.corner) {
        // Resize from the corner, keeping proportions; the far corner stays put visually
        // Work in the item's own (turned) axes
        const a = (d.m0.r || 0) * Math.PI / 180;
        const ux = dx * Math.cos(a) + dy * Math.sin(a), uy = -dx * Math.sin(a) + dy * Math.cos(a);
        const sx = d.corner.includes("e") ? 1 : -1, sy = d.corner.includes("s") ? 1 : -1;
        const f = d.m0.r ? 2 : 1; // turned items grow from the centre, so each side moves half as far
        const grow = Math.max((d.g.width + f * sx * ux) / d.g.width, (d.g.height + f * sy * uy) / d.g.height);
        const fixed = { h: d.corner.includes("e") ? "left" : "right", v: d.corner.includes("s") ? "top" : "bottom" };
        resizeMark(d.kind, d.m0.s * grow, fixed, { m: d.m0, r: d.g });
    } else {
        // Keep the image on the page
        const lo = x => Math.max(d.sheet.left - d.r.left, Math.min(d.sheet.right - d.r.right, x));
        const loY = y => Math.max(d.sheet.top - d.r.top, Math.min(d.sheet.bottom - d.r.bottom, y));
        m.x = normMark({ x: d.m0.x + lo(dx) * d.k }).x;
        m.y = normMark({ y: d.m0.y + loY(dy) * d.k }).y;
    }
    paintMark(d.kind);
    syncMarkControls();
    placeMarkBox();
}

function endMarkDrag() {
    const d = MarkUI.drag;
    MarkUI.drag = null;
    document.body.classList.remove("mark-dragging");
    window.removeEventListener("pointermove", onMarkMove);
    if (d && d.moved) changed();
    placeMarkBox();
}

function initMarks() {
    const holder = $("#sheetHolder");
    holder.addEventListener("pointerdown", e => {
        const el = e.target.closest("[data-mark]");
        if (!el) { if (MarkUI.sel && !e.target.closest("#markBox")) { MarkUI.sel = null; placeMarkBox(); } return; }
        MarkUI.sel = el.dataset.mark;
        // Open the form section with the size sliders so they are at hand
        $$(".marks-box").forEach(b => { const sec = b.closest("details"); if (sec && !sec.open) sec.open = true; });
        placeMarkBox();
        startMarkDrag(e, MarkUI.sel, null);
    });
    holder.addEventListener("dragstart", e => { if (e.target.closest("[data-mark]")) e.preventDefault(); });
    $("#deskScroll").addEventListener("scroll", () => { if (MarkUI.sel) placeMarkBox(); }, { passive: true });
    window.addEventListener("resize", () => { if (MarkUI.sel) placeMarkBox(); });
    document.addEventListener("keydown", e => {
        if (!MarkUI.sel || App.view !== "create" || e.target.closest("input, textarea, select, [contenteditable]")) return;
        const m = App.doc.signature.marks[MarkUI.sel];
        const step = e.shiftKey ? 5 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) { m.x = normMark({ x: m.x + moves[e.key][0] }).x; m.y = normMark({ y: m.y + moves[e.key][1] }).y; }
        else if (e.key === "+" || e.key === "=") resizeMark(MarkUI.sel, m.s + 0.05);
        else if (e.key === "-" || e.key === "_") resizeMark(MarkUI.sel, m.s - 0.05);
        else if (e.key === "[" || e.key === "]" || e.key === "{" || e.key === "}") m.r = normMark({ r: (m.r || 0) + ((e.key === "]" || e.key === "}") ? 1 : -1) * (e.shiftKey ? 15 : 1) }).r;
        else if (e.key === "Escape") { MarkUI.sel = null; placeMarkBox(); return; }
        else return;
        e.preventDefault();
        paintMark(MarkUI.sel); syncMarkControls(); placeMarkBox(); changed();
    });
}


/* ==========================================================
   EVAM BOOKS HOOKS
   ========================================================== */
const APP_TITLE = () => (Server.online ? "EVAM Books" : "EVAM Documents");

function buildFormKeepScroll() {
    const pane = $("#formPane");
    const top = pane.scrollTop;
    buildForm();
    pane.scrollTop = top;
}

/* Delete a document: on the server it can be refused (e.g. payments recorded against it) */
async function removeDoc(id) {
    if (!Server.online) { Store.deleteDoc(id); return true; }
    try { await Server.remove("doc", id); return true; }
    catch (e) { toast(e.message, "bad", 8000); return false; }
}

/* Payments recorded against the open invoice */
function renderPayBox() {
    const box = $("#payBox");
    if (!box) return;
    const doc = App.doc;
    const saved = Store.getDoc(doc.id);
    const pays = Server.fin.payment.filter(p => (p.allocations || []).some(a => a.docId === doc.id));
    const cur = doc.currency;
    const total = computeTotals({ ...doc, paid: 0 }).total;
    const bal = invoiceBalance(doc);
    const rows = pays.map(p => {
        const a = p.allocations.find(x => x.docId === doc.id);
        return `<li><button type="button" class="link-btn" data-act="openPayment" data-id="${p.id}">${esc(p.number || "Payment")}</button><span class="muted">${fmtDate(p.date)} · ${esc(Finance.accountName(p.accountId) || "")}</span><span class="num">${esc(cur)} ${fmt(a.amount, cur)}</span></li>`;
    }).join("");
    const credits = num(doc.credited) ? `<li><span>Credit notes</span><span class="muted"></span><span class="num">${esc(cur)} ${fmt(doc.credited, cur)}</span></li>` : "";
    box.innerHTML = `
<div class="pay-head"><b>Payments</b><span class="pay-bal ${bal > 0 ? "due" : "clear"}">${doc.status === "cancelled" ? "Cancelled" : bal > 0 ? `Balance due ${esc(cur)} ${fmt(bal, cur)}` : total > 0 ? "Fully paid" : ""}</span></div>
${rows || credits ? `<ul class="pay-list">${rows}${credits}</ul>` : `<p class="muted pay-none">No payments recorded yet.</p>`}
${Server.can("sales") && doc.status !== "cancelled" && bal > 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-act="recordPayment"${!saved || App.dirty ? ' disabled title="Save the invoice first"' : ""}>${icon("plus", 14)}<span>Record payment</span></button>${!saved || App.dirty ? '<span class="hint">Save the invoice first.</span>' : ""}` : ""}`;
}

/* Someone else changed the document that is open */
function onRemoteChange(o) {
    if (App.view !== "create" || !App.doc || o.id !== App.doc.id) { if (App.view === "documents") renderDocsView(); return; }
    if (o.deleted) { toast(`${App.doc.number} was deleted by someone else.`, "warn", 8000); return; }
    if (App.dirty) { toast(`${App.doc.number} was changed by someone else. Saving will ask which version to keep.`, "warn", 8000); return; }
    loadDoc(JSON.parse(JSON.stringify(Store.getDoc(o.id) || o)), false);
    toast(`${App.doc.number} was updated by someone else.`, "", 5000);
}

/* After signing in again, or after uploading browser data */
function onSignedIn() {
    refreshLists();
    if (App.doc && !Store.getDoc(App.doc.id) && !hasContent(App.doc)) App.doc = newDoc(App.doc.type);
    buildForm();
    renderPreview(true);
    updateDocBar();
    route();
}
