/* ==========================================================
   EVAM Books — application shell
   Sidebar (desktop) / drawer (phone), collapsible nav groups, top-bar
   breadcrumbs, the command palette (Ctrl/⌘ + K), light/dark theme,
   beginner tooltips on accounting terms, and small page enhancements.

   For other modules (HR, import …):
     Shell.registerNavGroup({ id, label, icon, order, items: [{ href, label, icon, hint, perm, match }] })
         Adds a group to the sidebar. perm() hides an item; match(hash) marks it active.
     Shell.registerView(prefix, render)
         Routes "#<prefix>…" to <section class="view" id="view-<prefix>"> and calls render(sub).
     Shell.registerCommand({ label, hint, icon, group, keywords, perm, run })
         Adds an entry to the command palette.
     Shell.term("Receivables")          → glossary tooltip markup for a term
     Shell.setTheme("dark" | "light")
     Shell.renderNav()                  → redraw sidebar groups (after permissions change)
   ========================================================== */
const Shell = (() => {
    const LS_GROUPS = "evambooks.navGroups", LS_THEME = "evambooks.theme";
    const groups = [];     // extension groups (HR …)
    const views = {};      // extension views
    const commands = [];   // extension commands
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const mobile = () => window.matchMedia("(max-width: 1024px)").matches;
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
    };

    /* ---------- Glossary: plain-language explanations for beginners ---------- */
    const GLOSSARY = {
        "Receivables": "Money your customers still owe you for invoices you have sent.",
        "Payables": "Money you still owe suppliers for bills you have received.",
        "Outstanding": "Everything not yet paid, whether or not it is due.",
        "Overdue": "Unpaid after the due date. These are the ones to chase first.",
        "Cash and bank": "What is in your bank and cash accounts according to the books.",
        "Profit this month": "Income minus costs for this calendar month, before tax.",
        "Expenses this month": "Everything booked as a cost this month: bills, expenses and bank charges.",
        "Unapplied": "Money received that is not yet matched to an invoice. It stays as customer credit.",
        "Balance due": "What is still to be paid on this document.",
        "Balance": "What is still to be paid.",
        "Debit": "Left side of an entry. Increases assets and expenses.",
        "Credit": "Right side of an entry. Increases income, liabilities and equity.",
        "Reconcile": "Check that the books agree with the bank statement, line by line.",
        "Open pipeline": "Quotes and orders that could still turn into invoices.",
        "Received this month": "Payments from customers recorded this calendar month.",
        "Drafts": "Saved but not sent. Drafts can still be changed freely.",
        "Vendor credits": "Credit notes a supplier gave you. They reduce what you owe them.",
        "VAT": "UAE value added tax, normally 5%.",
        "Accrued": "Earned or owed but not yet paid."
    };
    const term = (word, label) => GLOSSARY[word] ? `<span class="term" tabindex="0" data-tip="${esc(GLOSSARY[word])}">${esc(label || word)}</span>` : esc(label || word);

    /* ---------- Theme ---------- */
    function theme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
    function setTheme(t) {
        document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
        try { localStorage.setItem(LS_THEME, t === "dark" ? "dark" : "light"); } catch { /* ignore */ }
        paintThemeBtn();
        // charts read colours from CSS variables at draw time
        if (typeof Finance !== "undefined" && App.view === "finance" && Finance.sub === "" && Finance._dash) Finance.drawDashboard();
    }
    function paintThemeBtn() {
        const b = $("#themeBtn"); if (!b) return;
        const dark = theme() === "dark";
        b.innerHTML = icon(dark ? "sun" : "moon", 18);
        b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
        b.title = dark ? "Light theme" : "Dark theme";
    }

    /* ---------- Sidebar ---------- */
    function groupState() { return store.get(LS_GROUPS, {}); }
    function applyGroups() {
        const st = groupState();
        $$(".sidebar .nav-group").forEach(g => {
            const id = g.dataset.group;
            const hasActive = !!$("a.on", g);
            const collapsed = hasActive ? false : st[id] !== undefined ? !!st[id] : !!g.dataset.defaultCollapsed;
            g.classList.toggle("collapsed", collapsed);
            const h = $(".nav-group-h", g); if (h) h.setAttribute("aria-expanded", String(!collapsed));
        });
    }
    function paintStaticNav() {
        $$(".sidebar a[data-ic]").forEach(a => { if (!$(".nav-ic", a)) a.insertAdjacentHTML("afterbegin", `<span class="nav-ic">${icon(a.dataset.ic, 18)}</span>`); });
        $$(".sidebar .nav-chev:empty").forEach(c => { c.innerHTML = icon("chevDown", 14); });
    }
    function renderExtNav() {
        const host = $("#extNav"); if (!host) return;
        const h = location.hash || "#create";
        host.innerHTML = groups.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(g => {
            const items = g.items.filter(it => !it.perm || safe(it.perm));
            if (!items.length || (g.perm && !safe(g.perm))) return "";
            return `<div class="nav-group" data-group="${esc(g.id)}"${g.collapsed ? " data-default-collapsed=\"1\"" : ""}>
<button type="button" class="nav-group-h" aria-expanded="true"><span>${esc(g.label)}</span><i class="nav-chev">${icon("chevDown", 14)}</i></button>
<div class="nav-group-items">${items.map(it => { const on = it.match ? safe(() => it.match(h)) : h === it.href || h.startsWith(it.href + "/") || h.startsWith(it.href + "?"); return `<a href="${esc(it.href)}" class="${on ? "on" : ""}"${on ? ' aria-current="page"' : ""}${it.hint ? ` title="${esc(it.hint)}"` : ""}><span class="nav-ic">${icon(it.icon || "circle", 18)}</span><span class="nav-label">${esc(it.label)}</span>${it.badge ? `<span class="nav-count">${esc(safe(it.badge) || "")}</span>` : ""}</a>`; }).join("")}</div></div>`;
        }).join("");
    }
    function safe(fn) { try { return typeof fn === "function" ? fn() : fn; } catch { return false; } }
    function renderNav() {
        if (typeof Finance !== "undefined" && $("#finNav") && Server.online) Finance.renderNav();
        renderExtNav();
        paintStaticNav();
        applyGroups();
        crumbs();
    }
    function openDrawer(open) {
        document.body.classList.toggle("sb-open", open);
        $("#sbScrim").hidden = !open;
        $("#sbOpen")?.setAttribute("aria-expanded", String(open));
        if (open) {
            if (typeof Motion !== "undefined") Motion.slideIn($("#sidebar"), { from: "left" });
            setTimeout(() => ($(".sidebar a.on") || $(".sidebar a"))?.focus({ preventScroll: true }), 60);
        }
    }

    /* ---------- Breadcrumbs ---------- */
    function crumbs() {
        const el = $("#crumbs"); if (!el) return;
        const a = $(".sidebar a.on");
        let group = "", page = "";
        if (a) {
            page = ($(".nav-label", a) || a).textContent.trim();
            const g = a.closest(".nav-group");
            group = g ? ($(".nav-group-h span", g)?.textContent || "").trim() : "";
            if (a.closest(".sb-top")) group = "";
        } else if (App.view === "finance") { group = "Finance"; page = (document.title.split(" · ")[0] || ""); }
        el.innerHTML = `${group ? `<span class="crumb-group">${esc(group)}</span><span class="crumb-sep">${icon("chevRight", 14)}</span>` : ""}<span class="crumb-page">${esc(page)}</span>`;
    }

    /* ---------- Routing hooks (called from app.js route()) ---------- */
    function extView(hash) {
        const key = Object.keys(views).find(k => hash === k || hash.startsWith(k + "/") || hash.startsWith(k + "?"));
        return key || null;
    }
    function routeExt(key, hash) {
        let sec = $("#view-" + key);
        if (!sec) { sec = document.createElement("section"); sec.className = "view page-view"; sec.id = "view-" + key; sec.hidden = true; $("#app").appendChild(sec); }
        sec.hidden = false;
        try { views[key](hash.slice(key.length).replace(/^\//, ""), sec); } catch (e) { console.error(e); }
    }
    let lastHash = null;
    function onRoute(view) {
        const h = location.hash || "#create";
        if (view !== "finance" && typeof Finance !== "undefined" && $("#finNav") && Server.online) Finance.renderNav();
        renderExtNav();
        paintStaticNav();
        applyGroups();
        crumbs();
        if (mobile()) openDrawer(false);
        const base = h.split("?")[0];
        if (base !== lastHash) {
            lastHash = base;
            const sec = view === "finance" ? $("#finMain") : view === "create" ? null : $("#view-" + view);
            if (sec && typeof Motion !== "undefined") Motion.stagger(sec, ":scope > *", { stagger: 40, y: 8 });
        }
        // keep the active nav item in view
        const on = $(".sidebar a.on");
        if (on && !mobile()) { const sc = $("#sbScroll"); const r = on.getBoundingClientRect(), s = sc.getBoundingClientRect(); if (r.top < s.top || r.bottom > s.bottom) on.scrollIntoView({ block: "nearest" }); }
    }

    /* ---------- Command palette ---------- */
    const P = { open: false, items: [], sel: 0 };
    function baseCommands() {
        const on = typeof Server !== "undefined" && Server.online;
        const can = a => !on || Server.can(a);
        const go = h => () => { location.hash = h; };
        const list = [
            { group: "Create", label: "New invoice", icon: "filePlus", keywords: "bill customer sell", run: () => startNew("invoice", true) },
            { group: "Create", label: "New quotation", icon: "clipboard", keywords: "quote estimate proposal", run: () => startNew("quotation", true) },
            { group: "Create", label: "New purchase order", icon: "cart", keywords: "po supplier order", run: () => startNew("purchaseOrder", true) },
            { group: "Create", label: "New letter", icon: "fileText", keywords: "letter document", run: () => startNew("letter", true) },
            { group: "Create", label: "New bill", hint: "A supplier's invoice to pay", icon: "fileBill", keywords: "supplier vendor purchase", perm: () => on && can("purchases"), run: go("#finance/bill/new") },
            { group: "Create", label: "New expense", hint: "Something you paid for straight away", icon: "wallet", keywords: "receipt spend cost", perm: () => on, run: go("#finance/expense/new") },
            { group: "Create", label: "Record payment received", hint: "Money in from a customer", icon: "arrowDownLeft", keywords: "receive customer paid", perm: () => on && can("sales"), run: go("#finance/payment/new") },
            { group: "Create", label: "Pay a bill", hint: "Money out to a supplier", icon: "arrowUpRight", keywords: "payment made vendor", perm: () => on && can("purchases"), run: go("#finance/bill-payment/new") },
            { group: "Create", label: "Import documents into the books", hint: "Bills, receipts, statements — read automatically", icon: "scan", keywords: "ocr scan upload pdf", perm: () => on && (Server.can("accounting") || Server.can("purchases") || Server.can("banking")), run: go("#finance/import") },
            { group: "Create", label: "Import a bank statement", icon: "landmark", keywords: "bank csv statement", perm: () => on && Server.canSee("banking"), run: go("#finance/banking") },
            { group: "Create", label: "New journal entry", icon: "notebook", keywords: "manual journal adjustment", perm: () => on && can("accounting"), run: go("#finance/journal/new") },
            { group: "Create", label: "Add contact", icon: "users", keywords: "customer vendor client", run: () => { location.hash = "#contacts"; setTimeout(() => editContact(null), 60); } },
            { group: "Create", label: "Add product or service", icon: "package", keywords: "item price", run: () => { location.hash = "#products"; setTimeout(() => editProduct(null), 60); } },
            { group: "Tools", label: "Exchange rates", icon: "coins", keywords: "fx currency rate", run: () => FXPanel.open() },
            { group: "Tools", label: theme() === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: theme() === "dark" ? "sun" : "moon", keywords: "theme dark light mode appearance", run: () => setTheme(theme() === "dark" ? "light" : "dark") }
        ];
        return list.concat(commands).filter(c => !c.perm || safe(c.perm));
    }
    function pageCommands() {
        const seen = new Set(), out = [];
        $$(".sidebar a[href^='#']").forEach(a => {
            const href = a.getAttribute("href"), label = ($(".nav-label", a) || a).textContent.trim();
            if (!label || seen.has(href)) return; seen.add(href);
            const g = a.closest(".nav-group");
            out.push({ group: "Go to", label, hint: g ? $(".nav-group-h span", g)?.textContent : "", icon: a.dataset.ic || a.dataset.icon || "arrowRight", iconHTML: $(".nav-ic", a)?.innerHTML, keywords: a.title || "", run: () => { location.hash = href; } });
        });
        if (typeof Finance !== "undefined" && Server.online && Finance.REPORT_LIST) {
            Finance.REPORT_LIST.forEach(g => g.items.forEach(([k, l, d]) => { if (Server.canReport(k)) out.push({ group: "Reports", label: l, hint: d, icon: "chart", keywords: g.group, run: () => { location.hash = "#finance/report/" + k; } }); }));
        }
        return out;
    }
    function dataCommands(q) {
        if (q.length < 2) return [];
        const out = [];
        const docs = (Store.data.docs || []).filter(d => [d.number, d.party?.name, d.ref, d.letter?.subject].join(" ").toLowerCase().includes(q)).slice(0, 6);
        docs.forEach(d => out.push({ group: "Documents", label: `${d.number || "No number"} · ${d.party?.name || d.letter?.subject || ""}`, hint: `${DOC_TYPES[d.type]?.label || ""}${d.date ? " · " + fmtDate(d.date) : ""}`, icon: "fileText", run: () => openSaved(d.id) }));
        (Store.data.contacts || []).filter(c => (c.name || "").toLowerCase().includes(q)).slice(0, 4).forEach(c => out.push({ group: "Contacts", label: c.name, hint: c.email || c.phone || "", icon: "users", run: () => { location.hash = "#contacts"; setTimeout(() => editContact(c.id), 60); } }));
        return out;
    }
    function score(item, q) {
        if (!q) return 1;
        const hay = (item.label + " " + (item.keywords || "") + " " + (item.hint || "")).toLowerCase();
        const label = item.label.toLowerCase();
        if (label.startsWith(q)) return 100;
        if (label.includes(q)) return 80;
        if (hay.includes(q)) return 50;
        // subsequence
        let i = 0; for (const ch of label) { if (ch === q[i]) i++; if (i === q.length) return 20; }
        const words = q.split(/\s+/).filter(Boolean);
        return words.length > 1 && words.every(w => hay.includes(w)) ? 30 : 0;
    }
    function paletteHTML() {
        return `<div class="cmdk-box">
  <div class="cmdk-input">${icon("search", 18)}<input id="cmdkInput" type="text" autocomplete="off" spellcheck="false" placeholder="Search pages, actions, invoices, contacts…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="cmdkList"><kbd>Esc</kbd></div>
  <div class="cmdk-list" id="cmdkList" role="listbox"></div>
  <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span><span class="push"></span><span>${isMac ? "⌘" : "Ctrl"} K anywhere</span></div>
</div>`;
    }
    function renderPalette() {
        const q = ($("#cmdkInput").value || "").trim().toLowerCase();
        const all = [...baseCommands(), ...pageCommands()];
        let items = all.map(it => ({ it, s: score(it, q) })).filter(x => x.s > 0);
        if (q) items.sort((a, b) => b.s - a.s);
        items = items.map(x => x.it);
        if (!q) items = items.filter(it => it.group !== "Reports").slice(0, 40);
        items = items.concat(dataCommands(q));
        // group in a stable order
        const order = ["Create", "Go to", "Documents", "Contacts", "Reports", "Tools"];
        const grouped = order.map(g => [g, items.filter(i => i.group === g)]).filter(([, l]) => l.length);
        P.items = grouped.flatMap(([, l]) => l);
        P.sel = Math.min(P.sel, Math.max(0, P.items.length - 1));
        let n = -1;
        $("#cmdkList").innerHTML = P.items.length ? grouped.map(([g, l]) => `<div class="cmdk-group" role="presentation">${q && g === "Go to" ? "Pages" : g === "Create" && !q ? "Quick actions" : g}</div>${l.map(it => { n++; return `<div class="cmdk-item${n === P.sel ? " on" : ""}" role="option" id="cmdk-${n}" data-i="${n}" aria-selected="${n === P.sel}"><span class="cmdk-ic">${it.iconHTML || icon(it.icon || "arrowRight", 18)}</span><span class="cmdk-label">${esc(it.label)}</span>${it.hint ? `<span class="cmdk-hint">${esc(it.hint)}</span>` : ""}<span class="cmdk-go">${icon("enter", 14)}</span></div>`; }).join("")}`).join("")
            : `<div class="cmdk-empty">${icon("search", 22)}<b>Nothing found for “${esc(q)}”</b><span>Try an invoice number, a customer, or a page like “bills”.</span></div>`;
        $("#cmdkInput").setAttribute("aria-activedescendant", P.items.length ? "cmdk-" + P.sel : "");
    }
    function moveSel(d) {
        if (!P.items.length) return;
        P.sel = (P.sel + d + P.items.length) % P.items.length;
        $$("#cmdkList .cmdk-item").forEach(el => { const on = Number(el.dataset.i) === P.sel; el.classList.toggle("on", on); el.setAttribute("aria-selected", on); if (on) el.scrollIntoView({ block: "nearest" }); });
        $("#cmdkInput").setAttribute("aria-activedescendant", "cmdk-" + P.sel);
    }
    function runSel(i = P.sel) {
        const it = P.items[i]; if (!it) return;
        closePalette();
        setTimeout(() => { try { it.run(); } catch (e) { console.error(e); } }, 10);
    }
    function openPalette() {
        let d = $("#cmdk");
        if (!d) {
            d = document.createElement("dialog");
            d.id = "cmdk"; d.className = "cmdk"; d.setAttribute("aria-label", "Command palette");
            d.innerHTML = paletteHTML();
            document.body.appendChild(d);
            const inp = $("#cmdkInput", d);
            inp.addEventListener("input", () => { P.sel = 0; renderPalette(); });
            inp.addEventListener("keydown", e => {
                if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
                else if (e.key === "Enter") { e.preventDefault(); runSel(); }
            });
            $("#cmdkList", d).addEventListener("click", e => { const it = e.target.closest(".cmdk-item"); if (it) runSel(Number(it.dataset.i)); });
            $("#cmdkList", d).addEventListener("mousemove", e => { const it = e.target.closest(".cmdk-item"); if (it && Number(it.dataset.i) !== P.sel) { P.sel = Number(it.dataset.i); $$("#cmdkList .cmdk-item").forEach(x => x.classList.toggle("on", x === it)); } });
            d.addEventListener("click", e => { if (e.target === d) closePalette(); });
            d.addEventListener("close", () => { P.open = false; });
        }
        if (d.open) return;
        $("#cmdkInput", d).value = "";
        P.sel = 0;
        renderPalette();
        d.showModal();
        P.open = true;
        if (typeof Motion !== "undefined") Motion.pop($(".cmdk-box", d));
        $("#cmdkInput", d).focus();
    }
    function closePalette() { const d = $("#cmdk"); if (d && d.open) d.close(); }

    /* ---------- Tooltips ---------- */
    let tipEl = null, tipFor = null;
    function showTip(t) {
        const text = t.dataset.tip; if (!text) return;
        if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tooltip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
        tipEl.textContent = text; tipEl.hidden = false; tipFor = t;
        const r = t.getBoundingClientRect();
        const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
        let left = r.left + r.width / 2 - w / 2; left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        let top = r.top - h - 8; if (top < 8) top = r.bottom + 8;
        tipEl.style.left = left + "px"; tipEl.style.top = top + "px";
        tipEl.classList.add("in");
    }
    function hideTip() { if (tipEl) { tipEl.classList.remove("in"); tipEl.hidden = true; } tipFor = null; }

    /* ---------- Page enhancements (run after any render) ---------- */
    function enhance(root = document) {
        // glossary tips on KPI labels and table headings
        $$(".ls-label:not([data-tip]), .dtable th:not([data-tip])", root).forEach(el => {
            const t = el.textContent.trim();
            if (GLOSSARY[t] && !el.querySelector(".term")) { el.dataset.tip = GLOSSARY[t]; el.classList.add("has-tip"); }
            else el.dataset.tip = "";
        });
        // empty tables: offer the page's main action right there
        $$("#finMain .table-card .empty:not([data-cta])", root).forEach(e => {
            e.dataset.cta = "1";
            if (!$(".empty-art", e)) e.insertAdjacentHTML("afterbegin", `<div class="empty-art">${icon(emptyIcon(), 26)}</div>`);
            const main = $("#finMain .page-actions .btn-primary");
            if (main && !/match|find/i.test(e.textContent)) {
                const b = document.createElement("button");
                b.type = "button"; b.className = "btn btn-primary btn-sm empty-cta";
                b.innerHTML = main.innerHTML;
                b.addEventListener("click", () => main.click());
                const wrap = document.createElement("div"); wrap.className = "empty-actions"; wrap.appendChild(b);
                e.appendChild(wrap);
            }
        });
    }
    function emptyIcon() {
        const a = $(".sidebar a.on .nav-ic svg");
        const page = (typeof Finance !== "undefined" && Finance.sub || "").split("/")[0];
        const n = typeof Finance !== "undefined" && Finance.NAV ? Finance.NAV.find(x => x.id === page) : null;
        return n && n.icon ? n.icon : a ? "inbox" : "inbox";
    }

    /* ---------- User menu: add the theme switch ---------- */
    function patchUserMenu() {
        if (typeof Auth === "undefined" || Auth._shellPatched) return;
        Auth._shellPatched = true;
        const orig = Auth.openUserMenu.bind(Auth);
        Auth.openUserMenu = function (anchor) {
            const sm = window.showMenu;
            window.showMenu = (a, items, align) => {
                const dark = theme() === "dark";
                const extra = [{ label: dark ? "Light theme" : "Dark theme", icon: dark ? "sun" : "moon", hint: "Easier on the eyes at night", onClick: () => setTheme(dark ? "light" : "dark") },
                    { label: "Search and shortcuts", icon: "command", hint: `${isMac ? "⌘" : "Ctrl"} K`, onClick: () => openPalette() }];
                const at = items.findIndex(i => i.divider);
                const out = items.slice();
                out.splice(at < 0 ? out.length : at, 0, { divider: true }, ...extra);
                return sm(a, out, align);
            };
            try { orig(anchor); } finally { window.showMenu = sm; }
        };
    }

    /* ---------- Init ---------- */
    function init() {
        $("#sbOpen").innerHTML = icon("menu", 20);
        $("#sbClose").innerHTML = icon("x", 18);
        $(".cmdk-trigger .cmdk-ic").innerHTML = icon("search", 16);
        $("#cmdkKbd").textContent = isMac ? "⌘K" : "Ctrl K";
        paintThemeBtn();
        paintStaticNav();
        applyGroups();
        $("#themeBtn").addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark"));
        $("#cmdkBtn").addEventListener("click", openPalette);
        $("#sbOpen").addEventListener("click", () => openDrawer(!document.body.classList.contains("sb-open")));
        $("#sbClose").addEventListener("click", () => openDrawer(false));
        $("#sbScrim").addEventListener("click", () => openDrawer(false));
        $("#sidebar").addEventListener("click", e => {
            const h = e.target.closest(".nav-group-h");
            if (h) {
                const g = h.closest(".nav-group");
                const collapsed = !g.classList.contains("collapsed");
                g.classList.toggle("collapsed", collapsed);
                h.setAttribute("aria-expanded", String(!collapsed));
                const st = groupState(); st[g.dataset.group] = collapsed; store.set(LS_GROUPS, st);
                return;
            }
            if (e.target.closest("a[href]") && mobile()) openDrawer(false);
        });
        document.addEventListener("keydown", e => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (P.open) closePalette(); else openPalette(); }
            else if (e.key === "Escape" && document.body.classList.contains("sb-open")) openDrawer(false);
        });
        // tooltips
        document.addEventListener("mouseover", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t && t.dataset.tip) { if (t !== tipFor) showTip(t); } else if (tipFor) hideTip(); });
        document.addEventListener("focusin", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t && t.dataset.tip) showTip(t); });
        document.addEventListener("focusout", hideTip);
        window.addEventListener("scroll", hideTip, true);
        // enhancements after renders
        let pend = false;
        new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; enhance(); }); }).observe($("#app"), { childList: true, subtree: true });
        window.addEventListener("resize", debounce(() => { if (!mobile()) openDrawer(false); }, 150));
        patchUserMenu();
    }

    return {
        init, onRoute, renderNav, crumbs, openPalette, closePalette, setTheme, theme, term, GLOSSARY, enhance,
        extView, routeExt,
        registerNavGroup(g) { const i = groups.findIndex(x => x.id === g.id); if (i >= 0) groups[i] = g; else groups.push(g); if ($("#extNav")) { renderExtNav(); paintStaticNav(); applyGroups(); } },
        registerView(prefix, render) { views[prefix.replace(/^#/, "")] = render; },
        registerCommand(c) { commands.push(c); },
        get navGroups() { return groups; }
    };
})();
window.Shell = Shell;

/* ----------------------------------------------------------
   HR navigation, ready for the HR module.
   Shown only once an `HR` object exists. The HR module can call
   Shell.registerNavGroup() again with its own items/permissions,
   or set HR.canManage() / HR.isStaff() to control what shows.
   ---------------------------------------------------------- */
(() => {
    const hasHR = () => typeof HR !== "undefined";
    const manager = () => hasHR() && (typeof HR.canManage !== "function" || HR.canManage());
    const staff = () => hasHR() && (typeof HR.isStaff !== "function" || HR.isStaff());
    const exact = h => x => x === h || x.startsWith(h + "?");
    Shell.registerNavGroup({ id: "hr", label: "HR", order: 10, items: [
        { href: "#hr", label: "Dashboard", icon: "dashboard", perm: manager, match: exact("#hr") },
        { href: "#hr/employees", label: "Employees", icon: "idCard", perm: manager, hint: "Everyone on the team, their contracts and documents" },
        { href: "#hr/attendance", label: "Attendance", icon: "clock", perm: manager, hint: "Who clocked in, late arrivals and overtime" },
        { href: "#hr/leave", label: "Leave requests", icon: "plane", perm: manager, hint: "Approve or decline time off" },
        { href: "#hr/calendar", label: "Team calendar", icon: "calendarDays", perm: manager },
        { href: "#hr/holidays", label: "Holidays", icon: "flag", perm: manager, hint: "Public holidays and company closures" },
        { href: "#hr/report", label: "Monthly report", icon: "fileChart", perm: manager }
    ] });
    Shell.registerNavGroup({ id: "me", label: "My workspace", order: 11, items: [
        { href: "#hr/me", label: "My day", icon: "sunrise", perm: () => staff() && !manager(), match: exact("#hr/me") },
        { href: "#hr/my-attendance", label: "My attendance", icon: "calendarCheck", perm: () => staff() && !manager() },
        { href: "#hr/my-leave", label: "My leave", icon: "plane", perm: () => staff() && !manager() },
        { href: "#hr/my-payslips", label: "My payslips", icon: "banknote", perm: () => staff() && !manager() },
        { href: "#hr/holidays", label: "Holidays", icon: "flag", perm: () => staff() && !manager() }
    ] });
})();
