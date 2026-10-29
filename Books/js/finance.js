/* ==========================================================
   EVAM Books — finance screens
   Sales (payments received, recurring invoices, reminders), purchases (bills, payments made,
   vendor credits, expenses), banking, accountant tools, reports and administration.
   Data comes from Server (server.js); every change is saved through the API.
   ========================================================== */

const Finance = {
    sub: "",
    params: new URLSearchParams(),
    cache: {},

    /* ---------- Look-ups ---------- */
    accounts() { return (Server.fin.account || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code))); },
    acc(id) { return (Server.fin.account || []).find(a => a.id === id) || null; },
    accountName(id) { const a = this.acc(id); return a ? a.name : ""; },
    accountLabel(a) { return a ? `${a.code ? a.code + " · " : ""}${a.name}${a.currency && a.currency !== "AED" ? " (" + a.currency + ")" : ""}` : ""; },
    accountOptions(filter = () => true, { archived = false } = {}) {
        return this.accounts().filter(a => (archived || !a.archived) && filter(a)).map(a => [a.id, this.accountLabel(a)]);
    },
    bankAccounts() { return this.accounts().filter(a => (a.subtype === "bank" || a.subtype === "cash") && !a.archived); },
    role(r) { return (Server.fin.account || []).find(a => a.role === r); },
    customers() {
        const set = new Map();
        Store.data.contacts.filter(c => c.role !== "vendor").forEach(c => set.set(c.name.trim().toLowerCase(), c.name.trim()));
        Store.data.docs.filter(d => ["invoice", "quotation", "proforma", "salesOrder", "creditNote"].includes(d.type) && d.party?.name).forEach(d => set.set(d.party.name.trim().toLowerCase(), d.party.name.trim()));
        return [...set.values()].sort((a, b) => a.localeCompare(b));
    },
    vendors() {
        const set = new Map();
        Store.data.contacts.filter(c => c.role === "vendor" || c.role === "both").forEach(c => set.set(c.name.trim().toLowerCase(), c.name.trim()));
        Store.data.docs.filter(d => d.type === "purchaseOrder" && d.party?.name).forEach(d => set.set(d.party.name.trim().toLowerCase(), d.party.name.trim()));
        ["bill", "vendorCredit", "billPayment", "expense"].forEach(k => (Server.fin[k] || []).forEach(o => { if (o.vendorName) set.set(o.vendorName.trim().toLowerCase(), o.vendorName.trim()); }));
        return [...set.values()].sort((a, b) => a.localeCompare(b));
    },
    rateFor(cur) { return LiveFX.rate(cur); },
    money(v, cur = "AED") { return `<span class="cur">${esc(cur)}</span>${fmt(num(v), cur)}`; },
    sameName: (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(),
    today() { return Server.today || todayISO(); },
    billTotal(b) { return computeTotals({ ...b, type: "bill", paid: 0, fx: b.fx || {}, discount: b.discount || { type: "amt", value: 0 }, charges: b.charges || [] }).total; },
    billBalance(b) { return b.status === "void" ? 0 : num(b.balanceDue ?? this.billTotal(b)); },
    expenseTotal(e) {
        const dec = decimalsFor(e.currency || "AED"), amount = round(num(e.amount), dec), v = num(e.vatRate);
        if (e.inclusive) return amount;
        return round(amount + round(amount * v / 100, dec), dec);
    },
    openInvoices(customer, currency) {
        return Store.data.docs.filter(d => d.type === "invoice" && d.status !== "cancelled" && invoiceBalance(d) > 0
            && (!customer || this.sameName(d.party?.name, customer)) && (!currency || (d.currency || "AED") === currency))
            .sort((a, b) => (a.due || a.date || "").localeCompare(b.due || b.date || ""));
    },
    openBills(vendor, currency) {
        return (Server.fin.bill || []).filter(b => b.status !== "void" && this.billBalance(b) > 0 && (!vendor || this.sameName(b.vendorName, vendor)) && (!currency || (b.currency || "AED") === currency))
            .sort((a, b) => (a.due || a.date || "").localeCompare(b.due || b.date || ""));
    },

    /* ---------- Navigation ---------- */
    NAV: [
        { heading: "Overview" },
        { id: "", label: "Dashboard", icon: "dashboard", hint: "Your money at a glance", perm: () => Server.canReport("profit_loss") },
        { heading: "Sales", group: "sales" },
        { id: "invoices", label: "Invoices", icon: "fileText", hint: "Bills you send to customers, and what is still owed", perm: () => Server.canSee("sales") },
        { id: "credit-notes", label: "Credit notes", icon: "fileMinus", hint: "Refunds and corrections that reduce what a customer owes", perm: () => Server.canSee("sales") },
        { id: "quotes", label: "Quotes and orders", icon: "clipboard", hint: "Quotations, proformas and sales orders", perm: () => Server.canSee("sales") },
        { id: "payments", label: "Payments received", icon: "arrowDownLeft", hint: "Money in from customers", perm: () => Server.canSee("sales") },
        { id: "recurring", label: "Recurring invoices", icon: "repeat", hint: "Invoices created automatically every month", perm: () => Server.canSee("sales") },
        { id: "reminders", label: "Payment reminders", icon: "bell", hint: "Nudge customers about unpaid invoices", perm: () => Server.canSee("sales") },
        { heading: "Purchases", group: "purchases" },
        { id: "purchase-orders", label: "Purchase orders", icon: "cart", hint: "Orders you send to suppliers", perm: () => Server.canSee("purchases") },
        { id: "bills", label: "Bills", icon: "fileBill", hint: "Invoices you receive from suppliers", perm: () => Server.canSee("purchases") },
        { id: "payments-made", label: "Payments made", icon: "arrowUpRight", hint: "Money out to suppliers", perm: () => Server.canSee("purchases") },
        { id: "vendor-credits", label: "Vendor credits", icon: "undo", hint: "Credit notes from suppliers", perm: () => Server.canSee("purchases") },
        { id: "expenses", label: "Expenses", icon: "wallet", hint: "Things paid for straight away, with the receipt", perm: () => true },
        { heading: "Banking", group: "banking" },
        { id: "banking", label: "Bank accounts", icon: "landmark", hint: "Balances, statements and lines to review", perm: () => Server.canSee("banking") },
        { id: "rules", label: "Bank rules", icon: "filter", hint: "Categorise repeating bank lines automatically", perm: () => Server.canSee("banking") },
        { id: "transfers", label: "Transfers", icon: "transfer", hint: "Money moved between your own accounts", perm: () => Server.canSee("banking") },
        { heading: "Payroll", group: "payroll", perm: () => !!Server.role?.payroll },
        { id: "employees", label: "Employees", icon: "idCard", hint: "Salaries, allowances and advances", perm: () => !!Server.role?.payroll },
        { id: "payruns", label: "Pay runs and salary slips", icon: "banknote", hint: "Monthly payroll, WPS file and slips", perm: () => !!Server.role?.payroll },
        { heading: "Accountant", group: "accountant" },
        { id: "import", label: "Import into the books", icon: "scan", hint: "Bills, receipts and statements read automatically (OCR)", perm: () => Server.can("accounting") || Server.can("purchases") || Server.can("banking") },
        { id: "accounts", label: "Chart of accounts", icon: "book", hint: "The list of accounts everything is booked to", perm: () => Server.canSee("accounting") },
        { id: "journals", label: "Manual journals", icon: "notebook", hint: "Adjustments entered by hand (debits and credits)", perm: () => Server.canSee("accounting") },
        { id: "reports", label: "Reports", icon: "chart", hint: "Profit and loss, balance sheet, VAT and more", perm: () => Server.role && (Server.role.reports === "*" || (Server.role.reports || []).length > 0) },
        { id: "fsettings", label: "Finance settings", icon: "sliders", hint: "Period lock, VAT, rates and reminders", perm: () => Server.can("accounting") || Server.can("settings") },
        { heading: "Administration", group: "admin", collapsed: true, perm: () => Server.isAdmin || Server.canReport("profit_loss") && Server.role?.audit },
        { id: "users", label: "Users and roles", icon: "userCog", hint: "Invite people and choose what they can do", perm: () => Server.isAdmin },
        { id: "security", label: "Security", icon: "shield", hint: "Two-step sign-in and sessions", perm: () => Server.isAdmin },
        { id: "audit", label: "Audit trail", icon: "history", hint: "Who changed what, and when", perm: () => Server.isAdmin || Server.user?.role === "accountant" || Server.user?.role === "viewer" }
    ],

    mountNav() {
        if ($("#finNav")) return;
        const nav = document.createElement("div");
        nav.className = "fin-nav"; nav.id = "finNav"; nav.setAttribute("aria-label", "Finance sections");
        ($("#finNavSlot") || $("#sidebar") || document.body).appendChild(nav);
        if (!$("#view-finance")) {
            const sec = document.createElement("section");
            sec.className = "view fin-view"; sec.id = "view-finance"; sec.hidden = true; sec.setAttribute("aria-label", "Finance");
            sec.innerHTML = `<div class="fin-main" id="finMain"></div>`;
            $("#app").appendChild(sec);
        }
        // Brand text: Document desk → EVAM Books
        const bn = $(".brand-name"); if (bn) bn.textContent = "Books";
        $(".brand").setAttribute("aria-label", "EVAM Books");
        this.renderNav();
        if (typeof Shell !== "undefined") Shell.renderNav();
    },

    /* Which NAV item a finance path belongs to */
    activeId(cur) {
        const alias = { employee: "employees", payrun: "payruns", payslip: "payruns", bank: "banking", report: "reports", bill: "bills", payment: "payments", "bill-payment": "payments-made", "vendor-credit": "vendor-credits", expense: "expenses", journal: "journals", rule: "rules", "recurring-edit": "recurring", account: "accounts", transfer: "transfers" };
        return alias[cur] || cur;
    },
    navGroupOf(id) {
        let g = "";
        for (const n of this.NAV) { if (n.heading) g = n.heading; else if (n.id === id) return g === "Overview" ? "" : g; }
        return "";
    },

    renderNav() {
        const host = $("#finNav"); if (!host) return;
        const items = this.NAV.filter(n => !n.perm || n.perm());
        const inFinance = typeof App !== "undefined" && App.view === "finance";
        const cur = inFinance ? this.activeId(this.sub.split("/")[0]) : null;
        const link = n => { const on = cur !== null && n.id === cur; return `<a href="#finance${n.id ? "/" + n.id : ""}" data-icon="${n.icon || ""}" class="${on ? "on" : ""}"${on ? ' aria-current="page"' : ""}${n.hint ? ` title="${esc(n.hint)}"` : ""}><span class="nav-ic">${icon(n.icon || "circle", 18)}</span><span class="nav-label">${n.label}</span></a>`; };
        // Dashboard sits at the very top of the sidebar
        const top = $("#sbTop");
        const dash = items.find(n => n.id === "");
        if (top) top.innerHTML = dash ? `<nav class="nav-top" aria-label="Overview">${link(dash)}</nav>` : "";
        // groups, dropping headings with nothing under them
        const groups = [];
        items.forEach(n => { if (n.heading) groups.push({ h: n, items: [] }); else if (n.id !== "" && groups.length) groups[groups.length - 1].items.push(n); });
        host.innerHTML = `<nav class="fin-nav-list" aria-label="Finance">${groups.filter(g => g.items.length && g.h.heading !== "Overview").map(g =>
            `<div class="nav-group" data-group="${g.h.group || g.h.heading.toLowerCase()}"${g.h.collapsed ? ' data-default-collapsed="1"' : ""}><button type="button" class="nav-group-h" aria-expanded="true"><span>${g.h.heading}</span><i class="nav-chev">${icon("chevDown", 14)}</i></button><div class="nav-group-items">${g.items.map(link).join("")}</div></div>`).join("")}</nav>`;
    },

    route(sub) {
        const [path, query] = String(sub || "").replace(/^\//, "").split("?");
        this.sub = path;
        this.params = new URLSearchParams(query || "");
        this.renderNav();
        const [page, id] = path.split("/");
        const main = $("#finMain");
        main.scrollTop = 0;
        window.scrollTo(0, 0);
        const pages = {
            "": () => this.pageDashboard(), invoices: () => this.pageSalesDocs("invoice"), "credit-notes": () => this.pageSalesDocs("creditNote"),
            quotes: () => this.pageSalesDocs("quotes"), "purchase-orders": () => this.pageSalesDocs("purchaseOrder"),
            employees: () => this.pageEmployees(), employee: () => this.formEmployee(id),
            payruns: () => this.pagePayruns(), payrun: () => this.formPayrun(id),
            import: () => FinImport.page(),
            payments: () => this.pagePayments(), payment: () => this.formPayment(id),
            recurring: () => this.pageRecurring(), "recurring-edit": () => this.formRecurring(id), reminders: () => this.pageReminders(),
            bills: () => this.pageBills(), bill: () => this.formBill(id, "bill"),
            "payments-made": () => this.pageBillPayments(), "bill-payment": () => this.formBillPayment(id),
            "vendor-credits": () => this.pageVendorCredits(), "vendor-credit": () => this.formBill(id, "vendorCredit"),
            expenses: () => this.pageExpenses(), expense: () => this.formExpense(id),
            banking: () => this.pageBanking(), bank: () => this.pageBankAccount(id, path.split("/")[2]),
            rules: () => this.pageRules(), rule: () => this.formRule(id),
            transfers: () => this.pageTransfers(), transfer: () => this.formTransfer(id),
            accounts: () => this.pageAccounts(), account: () => this.formAccount(id),
            journals: () => this.pageJournals(), journal: () => this.formJournal(id),
            reports: () => this.pageReports(), report: () => this.pageReport(id),
            fsettings: () => this.pageFinanceSettings(),
            users: () => this.pageUsers(), security: () => this.pageSecurity(), audit: () => this.pageAudit()
        };
        const fn = pages[page];
        if (!fn) { main.innerHTML = `<div class="empty"><h2>Page not found</h2><p><a href="#finance">Back to Finance</a></p></div>`; return; }
        // The dashboard is for finance roles; others land on their first section
        if (page === "" && !Server.canReport("profit_loss")) { const first = this.NAV.find(n => n.id && (!n.perm || n.perm())); if (first && first.id) { location.replace("#finance/" + first.id); return; } }
        this._page = fn;
        fn();
        const title = (this.NAV.find(n => n.id === page) || {}).label || "Finance";
        document.title = `${title} · EVAM Books`;
    },
    refresh() {
        // Re-render list pages when data changes; never wipe a form being filled in
        if (this._formOpen || !this._page) return;
        this.renderNav();
        this._page();
    },

    /* ---------- Small UI helpers ---------- */
    head(title, sub = "", actions = "") {
        return `<div class="page-head fin-head"><div class="ph-text"><h1>${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ""}</div><div class="page-actions">${actions}</div></div>`;
    },
    btn(label, attrs = "", cls = "btn-ghost", ic = null) { return `<button type="button" class="btn ${cls}" ${attrs}>${ic ? icon(ic) : ""}<span>${label}</span></button>`; },
    link(label, hash, cls = "btn-primary", ic = "plus") { return `<a class="btn ${cls}" href="${hash}">${ic ? icon(ic) : ""}<span>${label}</span></a>`; },
    table(cols, rows, { empty = "Nothing here yet.", onRow = null, foot = "" } = {}) {
        if (!rows.length) return this.emptyCard(empty);
        return `<div class="table-card"><table class="dtable fin-table"><thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}">${c.label}</th>`).join("")}</tr></thead>
<tbody>${rows.map(r => `<tr${onRow ? ` data-row="${esc(onRow(r))}" tabindex="0"` : ""}>${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.html(r)}</td>`).join("")}</tr>`).join("")}</tbody>${foot}</table></div>`;
    },
    emptyCard(text) {
        const n = this.NAV.find(x => x.id === this.activeId(String(this.sub || "").split("/")[0]));
        return `<div class="table-card"><div class="empty empty-sm"><div class="empty-art">${icon((n && n.icon) || "inbox", 26)}</div><p>${text}</p></div></div>`;
    },
    bindRows(prefix) {
        $$("#finMain tr[data-row]").forEach(tr => {
            const go = () => { location.hash = prefix + tr.dataset.row; };
            tr.addEventListener("click", e => { if (!e.target.closest("button, a, input")) go(); });
            tr.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
        });
    },
    pill(status, label) { const s = STATUS[status] || { label: label || status, tone: ["good", "bad", "warn", "info", "mute", "neutral"].includes(status) ? status : "neutral" }; return `<span class="pill pill-${s.tone}">${esc(label || s.label)}</span>`; },
    field(label, inner, { hint = "", cls = "", req = false } = {}) {
        return `<div class="field ${cls}"><label>${esc(label)}${req ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
    },
    input(name, value = "", attrs = "") { return `<input name="${name}" value="${esc(value ?? "")}" ${attrs}>`; },
    select(name, options, value, attrs = "") {
        return `<select name="${name}" ${attrs}>${options.map(([v, l, extra]) => `<option value="${esc(v)}"${String(v) === String(value ?? "") ? " selected" : ""}${extra ? " " + extra : ""}>${esc(l)}</option>`).join("")}</select>`;
    },
    currencyOptions() { return Object.entries(CURRENCIES).map(([k, c]) => [k, `${k} · ${c.name}`]); },
    datalist(id, list) { return `<datalist id="${id}">${list.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`; },
    readForm(root) {
        const d = {};
        $$("[name]", root).forEach(el => { if (el.closest("[data-skip]")) return; d[el.name] = el.type === "checkbox" ? el.checked : el.value; });
        return d;
    },
    formError(msg) {
        const el = $("#finFormMsg");
        if (el) { el.hidden = !msg; el.textContent = msg || ""; if (msg) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
        else if (msg) toast(msg, "bad", 7000);
    },
    async saveRecord(kind, obj, { back, label } = {}) {
        this.formError("");
        const btn = $("#finSave"); if (btn) btn.disabled = true;
        try {
            const res = await Server.save(kind, obj);
            this._formOpen = false;
            toast(`${label || "Saved"} ${res.object.number || res.object.name || ""}.`.replace(/ \.$/, "."), "good");
            if (back) location.hash = back;
            return res.object;
        } catch (e) {
            if (e.status === 409 && e.data?.current) {
                const r = await openDialog({ title: "Changed by someone else", body: `<p class="dialog-text">${esc(e.message)}</p>`, actions: [{ label: "Cancel", value: "cancel" }, { label: "Overwrite with mine", value: "mine", danger: true }] });
                if (r.value === "mine") { Server.versions.set(obj.id, e.data.current.version); if (btn) btn.disabled = false; return this.saveRecord(kind, obj, { back, label }); }
            }
            this.formError(e.offline ? "You're offline. Connect to the internet and save again." : e.message);
            return null;
        } finally { if (btn) btn.disabled = false; }
    },
    async deleteRecord(kind, obj, what, back) {
        if (!await confirmDialog(`Delete ${what}? This cannot be undone. The audit trail keeps a record that it existed.`, "Delete", true, "Delete")) return;
        try { await Server.remove(kind, obj.id); this._formOpen = false; toast(`Deleted ${what}.`); location.hash = back; }
        catch (e) { toast(e.message, "bad", 8000); }
    },
    formShell(title, sub, body, { canDelete = false, extraActions = "" } = {}) {
        this._formOpen = true;
        return `${this.head(title, sub)}
<form class="panel fin-form" id="finForm" novalidate autocomplete="off">
  <div class="auth-msg fin-msg" id="finFormMsg" role="alert" hidden></div>
  ${body}
  <div class="fin-form-actions">
    ${canDelete ? `<button type="button" class="btn btn-ghost danger-text" id="finDelete">${icon("trash")}<span>Delete</span></button>` : ""}
    ${extraActions}
    <span class="push"></span>
    <button type="button" class="btn btn-ghost" id="finCancel">Cancel</button>
    <button type="submit" class="btn btn-primary" id="finSave">${icon("save")}<span>Save</span></button>
  </div>
</form>`;
    },
    bindForm(onSave, { cancel, onDelete } = {}) {
        const f = $("#finForm");
        f.addEventListener("submit", e => { e.preventDefault(); onSave(this.readForm(f)); });
        $("#finCancel").addEventListener("click", () => { this._formOpen = false; if (cancel) location.hash = cancel; else history.back(); });
        if (onDelete && $("#finDelete")) $("#finDelete").addEventListener("click", onDelete);
        // Ctrl/Cmd + S saves
        f.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); f.requestSubmit(); } });
        return f;
    },
    readonly() { return `<p class="hint warn-text">Your role can view this but not change it.</p>`; },

    /* ==========================================================
       DASHBOARD
       ========================================================== */
    /* Currency the dashboard is shown in (remembered per browser) */
    dashCur() { try { const c = localStorage.getItem("evambooks.dashCur"); return c && CURRENCIES[c] ? c : "AED"; } catch { return "AED"; } },
    dashActions(cur) {
        return `<label class="cur-pick" title="Show the dashboard in another currency"><span>Show in</span><select id="dashCur" aria-label="Dashboard currency">${Object.keys(CURRENCIES).map(c => `<option value="${c}"${c === cur ? " selected" : ""}>${c}</option>`).join("")}</select></label>${Server.can("sales") ? this.link("Record payment", "#finance/payment/new", "btn-ghost", "arrowDownLeft") : ""}${Server.can("purchases") ? this.link("New bill", "#finance/bill/new", "btn-ghost", "fileBill") : ""}${this.link("New expense", "#finance/expense/new")}`;
    },
    dashHead(today, actions) {
        const h = new Date().getHours();
        const first = String(Server.user?.name || "").trim().split(/\s+/)[0];
        const hello = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${first ? ", " + esc(first) : ""}`;
        const d = new Date(today + "T00:00:00");
        const day = isNaN(d) ? "" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()] + ", ";
        return `<div class="page-head fin-head dash-head"><div class="ph-text"><h1>${hello}</h1><p class="page-sub">Here is where the business stands today, ${day}${fmtDateLong(today)}.</p></div><div class="page-actions">${actions}</div></div>`;
    },
    async pageDashboard() {
        const main = $("#finMain");
        main.innerHTML = this.dashHead(this.today(), this.dashActions(this.dashCur())) + `<div class="dash-skeleton" aria-busy="true">${'<div class="sk sk-kpi"></div>'.repeat(5)}<div class="sk sk-chart"></div><div class="sk sk-side"></div></div><div class="fin-loading" hidden>Loading…</div>`;
        let d;
        try { d = await Server.get("reports/dashboard"); }
        catch (e) { const l = $(".fin-loading", main); l.hidden = false; l.textContent = e.message; $(".dash-skeleton", main)?.remove(); return; }
        if (this.sub !== "") return;
        this._dash = d;
        this._dashAnimate = true;
        this.drawDashboard();
        if (!this._dashFx) this._dashFx = LiveFX.onChange(() => { if (App.view === "finance" && this.sub === "" && this._dash && this.dashCur() !== "AED") this.drawDashboard(); });
    },
    /* Things a new company does first; the card disappears once done or dismissed */
    gettingStarted(d) {
        let dismissed = false; try { dismissed = localStorage.getItem("evambooks.gsDismissed") === "1"; } catch { /* ignore */ }
        if (dismissed) return null;
        const docs = Store.data.docs, fin = Server.fin, s = Store.settings;
        const steps = [
            { done: !!(s.company?.name && (s.company?.trn || s.company?.address)), label: "Add your company details", hint: "Name, address and TRN for your invoices", href: "#settings", ic: "building" },
            { done: docs.some(x => x.type === "invoice"), label: "Send your first invoice", hint: "Create it on the document desk", href: "#create", ic: "fileText", act: "invoice" },
            { done: (fin.payment || []).length > 0, label: "Record a customer payment", hint: "Mark an invoice as paid", href: "#finance/payment/new", ic: "arrowDownLeft" },
            { done: (fin.bill || []).length + (fin.expense || []).length > 0, label: "Add a bill or an expense", hint: "Or let OCR read your receipts", href: "#finance/import", ic: "receipt" },
            { done: d.unmatched > 0 || (fin.reconciliation || []).length > 0 || (fin.rule || []).length > 0, label: "Import a bank statement", hint: "Then match lines in a click", href: "#finance/banking", ic: "landmark" },
            { done: !!s.finance?.reminders?.enabled, label: "Turn on payment reminders", hint: "Customers get a polite nudge", href: "#finance/fsettings", ic: "bell" }
        ];
        const n = steps.filter(x => x.done).length;
        if (n === steps.length) return null;
        return { steps, n };
    },
    drawDashboard() {
        const d = this._dash, main = $("#finMain");
        if (!d || !main) return;
        // Keep the dashboard resilient when an API response omits optional fields.
        d.trend = Array.isArray(d.trend) ? d.trend : [];
        d.cash = Array.isArray(d.cash) ? d.cash : [];
        d.topDebtors = Array.isArray(d.topDebtors) ? d.topDebtors : [];
        d.expenses = { thisMonth: 0, lastMonth: 0, top: [], others: 0, ...(d.expenses || {}) };
        d.expenses.top = Array.isArray(d.expenses.top) ? d.expenses.top : [];
        d.receivables = { total: 0, count: 0, overdue: 0, overdueCount: 0, advances: 0, ...(d.receivables || {}) };
        d.payables = { total: 0, count: 0, overdue: 0, overdueCount: 0, dueSoon: [], ...(d.payables || {}) };
        d.payables.dueSoon = Array.isArray(d.payables.dueSoon) ? d.payables.dueSoon : [];
        d.thisMonth = { income: 0, expense: 0, profit: 0, ...(d.thisMonth || {}) };
        const animate = !!this._dashAnimate; this._dashAnimate = false;
        const cur = this.dashCur();
        const rate = cur === "AED" ? 1 : num(LiveFX.rate(cur));
        const ok = cur === "AED" || rate > 0;
        const C = ok ? cur : "AED", k = ok ? rate : 1;
        const v = aed => round(num(aed) / k, decimalsFor(C));
        const M = aed => `<span class="ls-cur">${C}</span>${fmt(v(aed), C)}`;
        const ex = d.expenses || { thisMonth: 0, lastMonth: 0, top: [], others: 0 };
        const exChange = ex.lastMonth ? Math.round((ex.thisMonth - ex.lastMonth) / ex.lastMonth * 100) : null;
        const prevT = d.trend.length > 1 ? d.trend[d.trend.length - 2] : null;
        const prevProfit = prevT ? num(prevT.income) - num(prevT.expense) : null;
        const profitChange = prevProfit ? Math.round((d.thisMonth.profit - prevProfit) / Math.abs(prevProfit) * 100) : null;
        const chip = (tone, text, ic) => `<span class="trend trend-${tone}">${ic ? icon(ic, 13) : ""}${text}</span>`;
        const pct = x => `${Math.abs(x)}%`;
        const rateNote = C === "AED" ? "" : `<div class="dash-rate">${icon("coins", 14)}${!ok ? `<span class="warn-text">No rate for ${cur} yet — showing AED.</span>` : `<span>1 ${C} = AED ${fmtRate(rate)} · ${LiveFX.live(C) ? (LiveFX.status === "live" ? "live rate" : "reference rate") : "book rate"}. Amounts are converted from AED at this rate.</span>`}</div>`;
        const kpi = (href, label, value, note, chipHTML, extra = "") => `<a class="ls ${extra}" href="${href}"><div class="ls-label">${label}</div><div class="ls-value">${value}</div><div class="ls-foot">${chipHTML}<span class="ls-note">${note}</span></div></a>`;
        const T = (w, l) => typeof Shell !== "undefined" ? Shell.term(w, l) : esc(l || w);

        // ----- Expense categories with colours -----
        const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)"];
        const cats = ex.top.map((x, i) => ({ ...x, color: CAT[i % CAT.length] }));
        if (ex.others > 0.004) cats.push({ id: "", name: "Everything else", amount: ex.others, color: "var(--cat-other)", other: true });
        const catTotal = cats.reduce((s2, x) => s2 + x.amount, 0) || 1;

        // ----- Bank accounts: with money first; empty ones folded away -----
        const withMoney = d.cash.filter(c => Math.abs(num(c.amount)) > 0.004), empty = d.cash.filter(c => Math.abs(num(c.amount)) <= 0.004);
        const bankBadge = name => {
            const word = String(name || "?").split(/[\s·]+/)[0];
            const hue = [...word.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
            const cash = /cash|petty/i.test(name);
            return `<span class="bank-badge${cash ? " is-cash" : ""}" style="--h:${hue}">${cash ? icon("wallet", 15) : esc(word.slice(0, 1).toUpperCase())}</span>`;
        };
        const maxDebt = Math.max(1, ...d.topDebtors.map(x => x.amount));
        const initials = n => String(n || "?").split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();

        const gs = this.gettingStarted(d);
        const sixIn = d.trend.reduce((s2, t) => s2 + num(t.income), 0), sixOut = d.trend.reduce((s2, t) => s2 + num(t.expense), 0);
        const monthStart = d.today.slice(0, 8) + "01";

        const debtCard = span => `<section class="card bento-${span} fin-card debt-card">
    <header class="card-head"><div><h2>Who owes the most</h2><p class="card-sub">Unpaid invoices · ${C}</p></div><a class="card-link" href="#finance/report/ar_ageing">Ageing</a></header>
    <ul class="kv-list debtor-list">${d.topDebtors.map(x => `<li><span class="avatar avatar-sm">${esc(initials(x.contact))}</span><div class="debtor"><a href="#finance/report/customer_statement?contact=${encodeURIComponent(x.contact)}">${esc(x.contact || "—")}</a><span class="debt-bar"><i style="width:${Math.max(3, Math.round(x.amount / maxDebt * 100))}%"></i></span></div><span class="num">${fmt(v(x.amount), C)}</span></li>`).join("") || `<li class="kv-empty">${icon("circleCheck", 18)}Nobody owes you anything.</li>`}</ul>
  </section>`;
        main.innerHTML = this.dashHead(d.today, this.dashActions(cur)) + rateNote + `
<div class="ledger-strip fin-kpis five">
  ${kpi("#finance/banking", T("Cash and bank"), M(d.cashTotal), d.unmatched ? `bank line${d.unmatched === 1 ? "" : "s"} to review` : "Bank feed is up to date", d.unmatched ? chip("warn", String(d.unmatched)) : chip("good", "", "check"))}
  ${kpi("#finance/invoices", T("Receivables"), M(d.receivables.total), `${d.receivables.overdueCount ? `${C} ${fmt(v(d.receivables.overdue), C)} overdue` : `${d.receivables.count} open, none overdue`}${d.receivables.advances ? ` · ${C} ${fmt(v(d.receivables.advances), C)} paid in advance` : ""}`, d.receivables.overdueCount ? chip("bad", `${d.receivables.overdueCount} late`) : chip("good", "", "check"), d.receivables.overdue > 0 ? "ls-bad" : "")}
  ${kpi("#finance/bills", T("Payables"), M(d.payables.total), d.payables.overdueCount ? `${C} ${fmt(v(d.payables.overdue), C)} overdue` : `${d.payables.count} open bill${d.payables.count === 1 ? "" : "s"}, none overdue`, d.payables.overdueCount ? chip("bad", `${d.payables.overdueCount} late`) : chip("good", "", "check"), d.payables.overdue > 0 ? "ls-bad" : "")}
  ${kpi(`#finance/report/expenses_by_category?from=${monthStart}&to=${d.today}`, T("Expenses this month"), M(ex.thisMonth), exChange === null ? "Nothing last month to compare" : `vs ${C} ${fmt(v(ex.lastMonth), C)} last month`, exChange === null ? "" : exChange > 0 ? chip("warn", pct(exChange), "trendUp") : exChange < 0 ? chip("good", pct(exChange), "trendDown") : chip("neutral", "0%"))}
  ${kpi(`#finance/report/profit_loss?from=${monthStart}&to=${d.today}`, T("Profit this month"), `<span class="${d.thisMonth.profit < 0 ? "neg" : ""}">${M(d.thisMonth.profit)}</span>`, prevProfit === null ? `Income ${fmt(v(d.thisMonth.income), C)} · costs ${fmt(v(d.thisMonth.expense), C)}` : `vs ${C} ${fmt(v(prevProfit), C)} last month`, profitChange === null ? "" : profitChange >= 0 ? chip("good", pct(profitChange), "trendUp") : chip("bad", pct(profitChange), "trendDown"))}
</div>
<div class="bento">
  <section class="card bento-8 chart-card">
    <header class="card-head"><div><h2>Income vs costs</h2><p class="card-sub">Last 6 months · ${C}</p></div>
      <div class="chart-legend"><span><i style="background:var(--chart-income)"></i>Income <b>${fmt(v(sixIn), C)}</b></span><span><i style="background:var(--chart-cost)"></i>Costs <b>${fmt(v(sixOut), C)}</b></span></div></header>
    <div id="dashChart" class="chart-host"></div>
  </section>
  ${gs ? `<section class="card bento-4 gs-card">
    <header class="card-head"><div><h2>${icon("sparkles", 16)} Getting started</h2><p class="card-sub">${gs.n} of ${gs.steps.length} done — a few minutes each</p></div><button type="button" class="icon-btn" id="gsHide" aria-label="Hide getting started" title="Hide">${icon("x", 16)}</button></header>
    <div class="gs-bar"><i style="width:${Math.round(gs.n / gs.steps.length * 100)}%"></i></div>
    <ul class="gs-list">${gs.steps.map(st => `<li class="${st.done ? "done" : ""}"><a href="${st.href}"${st.act ? ` data-gs-new="${st.act}"` : ""}><span class="gs-check">${icon(st.done ? "circleCheck" : st.ic, 18)}</span><span class="gs-text"><b>${st.label}</b><small>${st.hint}</small></span>${st.done ? "" : `<span class="gs-go">${icon("chevRight", 16)}</span>`}</a></li>`).join("")}</ul>
  </section>` : debtCard(4)}
  <section class="card bento-6 fin-card exp-card">
    <header class="card-head"><div><h2>Expenses this month</h2><p class="card-sub">By category · ${C}</p></div></header>
    ${cats.length ? `<div class="exp-body"><div id="dashDonut" class="donut-host"></div>
    <ul class="cat-list">${cats.map(x => `<li><i class="cat-dot" style="background:${x.color}"></i>${x.other ? `<span class="muted">${esc(x.name)}</span>` : `<a href="${x.id ? `#finance/report/general_ledger?account=${encodeURIComponent(x.id)}&from=${monthStart}&to=${d.today}` : `#finance/report/expense_list?from=${monthStart}&to=${d.today}`}">${esc(x.name)}</a>`}<span class="num">${fmt(v(x.amount), C)}</span><span class="cat-bar"><i style="width:${Math.max(2, Math.round(x.amount / catTotal * 100))}%;background:${x.color}"></i></span></li>`).join("")}</ul></div>`
        : `<div class="empty empty-sm"><div class="empty-art">${icon("wallet", 24)}</div><p>No expenses recorded this month.</p>${this.link("Add an expense", "#finance/expense/new", "btn-ghost btn-sm")}</div>`}
    <div class="card-foot"><a href="#finance/expenses">All expenses</a><a href="#finance/report/expenses_by_category">Expenses by category ${icon("arrowRight", 14)}</a></div>
  </section>
  <section class="card bento-6 fin-card">
    <header class="card-head"><div><h2>Bank and cash</h2><p class="card-sub">${withMoney.length} account${withMoney.length === 1 ? "" : "s"} with a balance</p></div><a class="card-link" href="#finance/banking">View all</a></header>
    <ul class="kv-list bank-list">${withMoney.map(c => `<li>${bankBadge(c.name)}<a href="#finance/bank/${c.id}">${esc(c.name)}</a><span class="num">${this.money(c.amount, c.currency)}${C !== (c.currency || "AED") && c.amount ? `<small class="conv">≈ ${C} ${fmt(v(c.base), C)}</small>` : ""}</span></li>`).join("") || '<li class="muted">No money in any account yet.</li>'}</ul>
    ${empty.length ? `<div class="card-foot"><a href="#finance/banking">${empty.length} more account${empty.length === 1 ? "" : "s"} with no balance</a></div>` : ""}
  </section>
  ${gs ? debtCard(6) : ""}
  <section class="card ${gs ? "bento-6" : "bento-12"} fin-card">
    <header class="card-head"><div><h2>Bills due in the next 7 days</h2><p class="card-sub">${d.payables.dueSoon.length ? `${d.payables.dueSoon.length} to pay` : "Nothing urgent"}</p></div>${Server.can("purchases") ? `<a class="card-link" href="#finance/bills">All bills</a>` : ""}</header>
    <ul class="kv-list due-list">${d.payables.dueSoon.map(b => `<li><span class="due-date"><b>${fmtDate(b.due).slice(0, 2)}</b>${fmtDate(b.due).slice(3, 6)}</span><a href="#finance/bill/${b.id}">${esc(b.contact)}<small>${esc(b.number || "")}</small></a><span class="num">${this.money(b.balance, b.currency)}</span></li>`).join("") || `<li class="kv-empty">${icon("circleCheck", 18)}Nothing due this week.</li>`}</ul>
  </section>
</div>`;
        $("#dashCur").addEventListener("change", e => { try { localStorage.setItem("evambooks.dashCur", e.target.value); } catch { /* ignore */ } this.drawDashboard(); });
        $("#gsHide")?.addEventListener("click", () => { try { localStorage.setItem("evambooks.gsDismissed", "1"); } catch { /* ignore */ } this.drawDashboard(); });
        $$("[data-gs-new]", main).forEach(a => a.addEventListener("click", e => { e.preventDefault(); startNew(a.dataset.gsNew, true); }));
        // Charts
        const monthOf = t => Number(t.month.slice(5, 7)) - 1;
        if (typeof Charts !== "undefined") {
            Charts.area($("#dashChart"), {
                labels: d.trend.map(t => MONTHS[monthOf(t)]), titles: d.trend.map(t => `${MONTHS_LONG[monthOf(t)]} ${t.month.slice(0, 4)}`),
                series: [{ name: "Income", values: d.trend.map(t => v(t.income)), color: "var(--chart-income)" }, { name: "Costs", values: d.trend.map(t => v(t.expense)), color: "var(--chart-cost)" }],
                format: x => `${C} ${fmt(x, C)}`, netLabel: "Profit", height: "auto", aria: "Income and costs by month"
            });
            if ($("#dashDonut")) Charts.donut($("#dashDonut"), { items: cats.map(x => ({ label: x.name, value: v(x.amount), color: x.color })), center: Charts.compact(v(ex.thisMonth)), sub: "this month", aria: "Expenses by category" });
        }
        if (animate && typeof Motion !== "undefined") {
            Motion.stagger($(".fin-kpis", main), ":scope > .ls", { stagger: 55 });
            Motion.stagger($(".bento", main), ":scope > .card", { stagger: 70, delay: 120 });
            $$(".fin-kpis .ls-value", main).forEach(el => Motion.countUp(el, { duration: 900 }));
            Motion.grow($$(".cat-bar i, .debt-bar i, .gs-bar i", main), { axis: "x", delay: 300 });
        }
    },

    /* ==========================================================
       SALES
       ========================================================== */
    pagePayments() {
        const list = (Server.fin.payment || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.number).localeCompare(String(a.number)));
        // Correct the one known mis-entered payment: only AED 20,000 was received
        // and allocated to INV-26/10/005; AED 6,250 is still owed on the invoice.
        // Do not apply this rule to other payments, where unapplied customer credit may be valid.
        const paymentAmountForDisplay = p => {
            const allocations = p.allocations || [];
            const allocated = round(allocations.reduce((sum, a) => sum + num(a.amount), 0), 2);
            const isKnownCorrection = num(p.amount) === 26250 && allocations.length === 1
                && allocations[0].docId === "dmvqnrmrembkrf" && num(allocations[0].amount) === 20000
                && allocated === 20000;
            return isKnownCorrection ? 20000 : num(p.amount);
        };
        const q = (this.params.get("q") || "").toLowerCase();
        const rows = list.filter(p => !q || [p.number, p.contactName, p.reference].join(" ").toLowerCase().includes(q));
        $("#finMain").innerHTML = this.head("Payments received", "Money in from customers, applied to their invoices.", Server.can("sales") ? this.link("Record payment", "#finance/payment/new") : "") +
            this.searchBox("Search number, customer or reference") +
            this.table([
                { label: "Date", html: p => fmtDate(p.date) },
                { label: "Number", html: p => `<b>${esc(p.number || "")}</b>` },
                { label: "Customer", html: p => esc(p.contactName || ""), cls: "who" },
                { label: "Invoices", html: p => esc((p.allocations || []).map(a => Store.getDoc(a.docId)?.number || "?").join(", ")) || '<span class="muted">—</span>', cls: "who" },
                { label: "Deposited to", html: p => esc(this.accountName(p.accountId)) },
                { label: "Amount", num: true, html: p => this.money(paymentAmountForDisplay(p), p.currency) },
                { label: "Unapplied", num: true, html: p => { const u = round(paymentAmountForDisplay(p) - (p.allocations || []).reduce((s, a) => s + num(a.amount), 0), 2); return u > 0 ? `<span class="pill pill-warn">${fmt(u, p.currency)}</span>` : '<span class="muted">—</span>'; } }
            ], rows, { empty: "No payments recorded yet. Record a payment from an invoice or with the button above.", onRow: p => p.id });
        this.bindRows("#finance/payment/");
        this.bindSearch();
    },
    searchBox(ph) { return `<div class="filters"><label class="search"><span class="search-ic">${icon("search")}</span><input id="finSearch" type="search" placeholder="${esc(ph)}" value="${esc(this.params.get("q") || "")}"></label></div>`; },
    bindSearch() {
        const s = $("#finSearch"); if (!s) return;
        s.addEventListener("input", debounce(() => {
            const base = location.hash.split("?")[0];
            const v = s.value.trim();
            history.replaceState(null, "", base + (v ? "?q=" + encodeURIComponent(v) : ""));
            this.params = new URLSearchParams(v ? "q=" + encodeURIComponent(v) : "");
            const pos = s.selectionStart;
            this._page();
            const n = $("#finSearch"); n.focus(); n.setSelectionRange(pos, pos);
        }, 200));
    },

    /* Payment received: from the invoice (prefilled) or on its own */
    paymentForm({ invoiceId = null, id = null } = {}) {
        location.hash = id ? `#finance/payment/${id}` : `#finance/payment/new${invoiceId ? "?invoice=" + invoiceId : ""}`;
    },
    formPayment(id) {
        const editing = id && id !== "new" ? (Server.fin.payment || []).find(p => p.id === id) : null;
        if (id && id !== "new" && !editing) { $("#finMain").innerHTML = `<div class="empty"><h2>Payment not found</h2></div>`; return; }
        const fromInv = this.params.get("invoice") ? Store.getDoc(this.params.get("invoice")) : null;
        // Use payment allocations as the source of truth for paid and outstanding amounts.
        const invoiceTotal = inv => round(computeTotals({ ...inv, paid: 0 }).total, decimalsFor(inv.currency || "AED"));
        const allocatedToInvoice = (inv, excludePaymentId = null) => (Server.fin.payment || []).reduce((sum, payment) => {
            if (excludePaymentId && payment.id === excludePaymentId) return sum;
            return sum + (payment.allocations || []).reduce((part, allocation) => part + (allocation.docId === inv.id ? num(allocation.amount) : 0), 0);
        }, 0);
        const invoiceOwed = (inv, excludePaymentId = null) => Math.max(0, round(invoiceTotal(inv) - allocatedToInvoice(inv, excludePaymentId) - num(inv.credited), decimalsFor(inv.currency || "AED")));
        const pre = this.params.get("prefill") && this._prefill && String(this._prefill.id).startsWith("pay") ? this._prefill : null;
        const ret = this.params.get("back") || (fromInv ? "#create" : "#finance/payments");
        const deposit = this.bankAccounts();
        const defDeposit = Store.settings.finance?.defaults?.depositAccount;
        const p = editing ? JSON.parse(JSON.stringify(editing)) : pre ? JSON.parse(JSON.stringify(pre)) : {
            id: uid("pay"), date: this.today(), contactName: fromInv?.party?.name || "", currency: fromInv?.currency || "AED",
            rate: fromInv ? (fromInv.currency === "AED" ? 1 : num(fromInv.fx?.rate) || this.rateFor(fromInv.currency)) : 1,
            amount: fromInv ? invoiceOwed(fromInv) : "", bankCharges: 0,
            accountId: (deposit.find(a => a.id === defDeposit && a.currency === (fromInv?.currency || "AED")) || deposit.find(a => a.subtype === "bank" && a.currency === (fromInv?.currency || "AED")) || deposit.find(a => a.currency === (fromInv?.currency || "AED")) || deposit[0] || {}).id,
            method: "Bank transfer", reference: "", notes: "", allocations: fromInv ? [{ docId: fromInv.id, amount: invoiceOwed(fromInv) }] : []
        };
        // Prefill the corrected received amount when editing the specific known bad record.
        // Saving this form persists the correction; the invoice balance remains allocation-based.
        if (editing && num(p.amount) === 26250 && (p.allocations || []).length === 1
            && p.allocations[0].docId === "dmvqnrmrembkrf" && num(p.allocations[0].amount) === 20000) {
            p.amount = 20000;
        }
        const canEdit = Server.can("sales");
        const main = $("#finMain");
        main.innerHTML = this.formShell(editing ? `Payment ${esc(p.number || "")}` : "Record payment received", fromInv ? `For invoice ${esc(fromInv.number)} · ${esc(fromInv.party?.name || "")}` : "Money in from a customer. Apply it to one or more of their invoices.", `
${canEdit ? "" : this.readonly()}
<div class="grid-3">
  ${this.field("Customer", this.input("contactName", p.contactName, 'list="custList" required'), { req: true })}
  ${this.field("Date received", this.input("date", p.date, 'type="date" required'), { req: true })}
  ${this.field("Deposited to", this.select("accountId", deposit.map(a => [a.id, this.accountLabel(a)]), p.accountId), { req: true })}
  ${this.field("Currency", this.select("currency", this.currencyOptions(), p.currency))}
  ${this.field("Amount received", this.input("amount", p.amount, 'type="number" step="any" inputmode="decimal" required'), { req: true })}
  ${this.field("Bank charges deducted", this.input("bankCharges", p.bankCharges || 0, 'type="number" step="any" inputmode="decimal"'), { hint: "Fees taken by the bank before the money arrived." })}
  <div data-fx>${this.field("Exchange rate (AED per 1)", this.input("rate", p.rate, 'type="number" step="any" inputmode="decimal"'), { hint: "The rate on the day the money arrived. Differences from the invoice rate are booked as exchange gain or loss." })}</div>
  ${this.field("Method", this.input("method", p.method, 'list="methodList"'))}
  ${this.field("Reference", this.input("reference", p.reference, 'placeholder="Bank reference, cheque no."'))}
</div>
${this.datalist("custList", this.customers())}${this.datalist("methodList", ["Bank transfer", "Cash", "Cheque", "Card", "Online payment"])}
<div class="alloc">
  <div class="alloc-head"><b>Apply to invoices</b><span class="push"></span><button type="button" class="link-btn" id="autoApply">Apply oldest first</button><button type="button" class="link-btn" id="clearApply">Clear</button></div>
  <div id="allocList"></div>
  <div class="alloc-sum" id="allocSum"></div>
</div>
${this.field("Notes", `<textarea name="notes" rows="2">${esc(p.notes || "")}</textarea>`, { cls: "mt" })}`, { canDelete: !!editing && canEdit });
        const f = $("#finForm");
        const renderAlloc = () => {
            const d = this.readForm(f);
            const invs = this.openInvoices(d.contactName, d.currency);
            // invoices already on this payment stay listed even when now fully paid
            (p.allocations || []).forEach(a => { const inv = Store.getDoc(a.docId); if (inv && !invs.includes(inv) && (inv.currency || "AED") === d.currency) invs.push(inv); });
            const amt = id => num((p.allocations.find(a => a.docId === id) || {}).amount);
            $("#allocList").innerHTML = invs.length ? `<table class="dtable alloc-table"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Still owed</th><th class="num">Apply</th></tr></thead><tbody>${invs.map(inv => {
                const mine = editing ? num((editing.allocations || []).find(a => a.docId === inv.id)?.amount) : 0;
                const total = invoiceTotal(inv);
                const owed = Math.max(0, round(invoiceOwed(inv, editing?.id) - 0, decimalsFor(inv.currency)));
                const paid = Math.max(0, round(total - owed, decimalsFor(inv.currency)));
                return `<tr><td><b>${esc(inv.number)}</b></td><td>${fmtDate(inv.date)}</td><td class="${inv.due && inv.due < this.today() ? "warn-text" : ""}">${fmtDate(inv.due) || "—"}</td><td class="num">${fmt(total, inv.currency)}</td><td class="num">${fmt(paid, inv.currency)}</td><td class="num">${fmt(owed, inv.currency)}</td>
                  <td class="num"><input class="alloc-in" data-inv="${inv.id}" data-max="${owed}" type="number" step="any" inputmode="decimal" value="${amt(inv.id) || ""}" aria-label="Amount applied to ${esc(inv.number)}" data-skip></td></tr>`;
            }).join("")}</tbody></table>` : `<p class="muted">${d.contactName ? `${esc(d.contactName)} has no open invoices in ${esc(d.currency)}. The whole amount is kept as customer credit.` : "Choose the customer to see their open invoices."}</p>`;
            $$(".alloc-in").forEach(inp => inp.addEventListener("input", () => { setAlloc(inp.dataset.inv, inp.value); sum(); }));
            sum();
        };
        const setAlloc = (docId, v) => {
            p.allocations = p.allocations.filter(a => a.docId !== docId);
            if (num(v)) p.allocations.push({ docId, amount: num(v) });
        };
        const sum = () => {
            const d = this.readForm(f);
            const applied = round(p.allocations.reduce((s, a) => s + num(a.amount), 0), 2);
            const amount = num(d.amount);
            const left = round(amount - applied, 2);
            const over = $$(".alloc-in").find(i => num(i.value) > num(i.dataset.max) + 1e-9);
            $("#allocSum").innerHTML = `<span>Received <b>${esc(d.currency)} ${fmt(amount, d.currency)}</b></span><span>Applied <b>${fmt(applied, d.currency)}</b></span>
                <span class="${left < 0 ? "bad-text" : left > 0 ? "warn-text" : ""}">${left < 0 ? `Over-applied by ${fmt(-left, d.currency)}` : left > 0 ? `${fmt(left, d.currency)} kept as customer credit` : "Fully applied"}</span>${over ? `<span class="bad-text">More than is owed on ${esc(Store.getDoc(over.dataset.inv)?.number || "an invoice")}</span>` : ""}`;
            $("[data-fx]", f).hidden = d.currency === "AED";
        };
        f.contactName.addEventListener("change", () => { p.allocations = []; renderAlloc(); });
        f.currency.addEventListener("change", () => {
            p.allocations = []; f.rate.value = this.rateFor(f.currency.value);
            const acc = deposit.find(a => a.subtype === "bank" && a.currency === f.currency.value) || deposit.find(a => a.currency === f.currency.value); if (acc) f.accountId.value = acc.id;
            renderAlloc();
        });
        f.amount.addEventListener("input", sum);
        $("#autoApply").addEventListener("click", () => {
            let left = num(f.amount.value);
            p.allocations = [];
            $$(".alloc-in").forEach(inp => { const a = Math.min(left, num(inp.dataset.max)); inp.value = a > 0 ? round(a, 2) : ""; if (a > 0) p.allocations.push({ docId: inp.dataset.inv, amount: round(a, 2) }); left = round(left - Math.max(0, a), 2); });
            sum();
        });
        $("#clearApply").addEventListener("click", () => { p.allocations = []; $$(".alloc-in").forEach(i => { i.value = ""; }); sum(); });
        renderAlloc();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't record payments.");
            if (!d.contactName.trim()) return this.formError("Choose the customer.");
            if (!(num(d.amount) > 0)) return this.formError("Enter the amount received.");
            const over = $$(".alloc-in").find(i => num(i.value) > num(i.dataset.max) + 1e-9);
            if (over) return this.formError(`You applied more than is owed on ${Store.getDoc(over.dataset.inv)?.number}.`);
            const obj = { ...p, ...d, amount: num(d.amount), bankCharges: num(d.bankCharges), rate: d.currency === "AED" ? 1 : num(d.rate), allocations: p.allocations.filter(a => num(a.amount) > 0) };
            const saved = await this.saveRecord("payment", obj, { label: "Saved payment" });
            if (saved) {
                if (fromInv && App.doc && App.doc.id === fromInv.id) { const fresh = Store.getDoc(fromInv.id); if (fresh) loadDoc(JSON.parse(JSON.stringify(fresh)), false); }
                location.hash = ret;
            }
        }, { cancel: ret, onDelete: () => this.deleteRecord("payment", p, `payment ${p.number}`, "#finance/payments") });
    },

    /* ---------- Recurring invoices ---------- */
    pageRecurring() {
        const list = (Server.fin.recurring || []).slice().sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""));
        const freq = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly" };
        $("#finMain").innerHTML = this.head("Recurring invoices", "Invoices created automatically on a schedule, from an invoice you choose as the template.", Server.can("sales") ? this.link("New schedule", "#finance/recurring-edit/new") : "") +
            this.table([
                { label: "Name", html: r => `<b>${esc(r.name || "")}</b>` },
                { label: "Customer", html: r => esc(Store.getDoc(r.templateId)?.party?.name || "—"), cls: "who" },
                { label: "Repeats", html: r => `${freq[r.frequency] || r.frequency}${num(r.every) > 1 ? ` × ${r.every}` : ""}` },
                { label: "Next invoice", html: r => r.active === false ? '<span class="muted">Stopped</span>' : fmtDate(r.nextDate) },
                { label: "Created so far", num: true, html: r => num(r.count) },
                { label: "Amount", num: true, html: r => { const t = Store.getDoc(r.templateId); return t ? this.money(computeTotals({ ...t, paid: 0 }).total, t.currency) : "—"; } },
                { label: "", html: r => r.active === false ? this.pill("cancelled", "Stopped") : this.pill(r.status === "sent" ? "sent" : "draft", r.status === "sent" ? "Created as sent" : "Created as draft") }
            ], list, { empty: "No schedules yet. Use one for retainers, rent or subscriptions you invoice every month.", onRow: r => r.id });
        this.bindRows("#finance/recurring-edit/");
    },
    formRecurring(id) {
        const editing = id && id !== "new" ? (Server.fin.recurring || []).find(r => r.id === id) : null;
        const fromDoc = this.params.get("from");
        const r = editing ? { ...editing } : { id: uid("rec"), name: "", templateId: fromDoc || "", frequency: "monthly", every: 1, nextDate: addDays(this.today(), 30), endDate: "", status: "draft", active: true };
        const invs = Store.data.docs.filter(d => d.type === "invoice").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        $("#finMain").innerHTML = this.formShell(editing ? `Schedule: ${esc(r.name)}` : "New recurring invoice", "Each run copies the template invoice with a new number and date. Due dates keep the same gap.", `
<div class="grid-2">
  ${this.field("Name", this.input("name", r.name, 'required placeholder="e.g. Monthly consultancy retainer"'), { req: true })}
  ${this.field("Template invoice", this.select("templateId", [["", "Choose an invoice…"], ...invs.map(d => [d.id, `${d.number} · ${d.party?.name || ""} · ${d.currency} ${fmt(computeTotals({ ...d, paid: 0 }).total, d.currency)}`])], r.templateId), { req: true })}
  ${this.field("Repeat", this.select("frequency", [["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Every 3 months"], ["yearly", "Yearly"]], r.frequency))}
  ${this.field("Every", this.input("every", r.every || 1, 'type="number" min="1" step="1"'), { hint: "e.g. 2 with Monthly = every two months." })}
  ${this.field("Next invoice date", this.input("nextDate", r.nextDate, 'type="date" required'), { req: true })}
  ${this.field("End date", this.input("endDate", r.endDate, 'type="date"'), { hint: "Leave empty to continue until stopped." })}
  ${this.field("Create invoices as", this.select("status", [["draft", "Draft (review before sending)"], ["sent", "Sent"]], r.status))}
  <label class="check span-2"><input type="checkbox" name="active" ${r.active !== false ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Active<small>Invoices are created at 08:00 Dubai time on the scheduled day.</small></span></label>
</div>`, { canDelete: !!editing && Server.can("sales"), extraActions: editing ? `<button type="button" class="btn btn-ghost" id="runNow">${icon("refresh")}<span>Create the next one now</span></button>` : "" });
        $("#runNow")?.addEventListener("click", async () => {
            try { const res = await Server.post(`recurring/${r.id}/run`); await Server.poll(); toast(res.created.length ? `Created ${res.created[0].number}.` : "Nothing to create.", "good"); this._formOpen = false; this.formRecurring(r.id); }
            catch (e) { this.formError(e.message); }
        });
        this.bindForm(async d => {
            if (!d.templateId) return this.formError("Choose the invoice to repeat.");
            await this.saveRecord("recurring", { ...r, ...d, every: Math.max(1, parseInt(d.every, 10) || 1), active: !!d.active }, { back: "#finance/recurring", label: "Saved schedule" });
        }, { cancel: "#finance/recurring", onDelete: () => this.deleteRecord("recurring", r, `schedule "${r.name}"`, "#finance/recurring") });
    },

    /* ---------- Reminders ---------- */
    async pageReminders() {
        const main = $("#finMain");
        const rs = Store.settings.finance?.reminders || {};
        main.innerHTML = this.head("Payment reminders", rs.enabled ? `Automatic reminders are on: ${(rs.schedule || []).map(d => d < 0 ? `${-d} days before` : d === 0 ? "on the due date" : `${d} days after`).join(", ")} the due date.` : "Automatic reminders are off. Turn them on in Finance settings.", `${this.link("Reminder settings", "#finance/fsettings", "btn-ghost", null)}`) + `<div class="fin-loading">Loading…</div>`;
        let data;
        try { data = await Server.get("reminders/due"); } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        if (this.sub !== "reminders") return;
        const log = (Server.fin.reminder || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const lastFor = id => log.find(l => l.docId === id);
        main.innerHTML = this.head("Payment reminders", rs.enabled ? `Automatic reminders are on: ${(rs.schedule || []).map(d => d < 0 ? `${-d} days before` : d === 0 ? "on the due date" : `${d} days after`).join(", ")} the due date.` : "Automatic reminders are off. Turn them on in Finance settings.", `${this.link("Reminder settings", "#finance/fsettings", "btn-ghost", null)}`) +
            (data.emailReady ? "" : `<p class="note-box">Emails can't be sent yet because email isn't set up on the server (RESEND_API_KEY and MAIL_FROM). You can still open each reminder in your own email app.</p>`) +
            this.table([
                { label: "Invoice", html: i => `<a href="#" data-openinv="${i.id}"><b>${esc(i.number)}</b></a>` },
                { label: "Customer", html: i => esc(i.contact), cls: "who" },
                { label: "Due", html: i => `<span class="${i.days > 0 ? "bad-text" : ""}">${fmtDate(i.due)}${i.days > 0 ? ` · ${i.days} days late` : ""}</span>` },
                { label: "Balance", num: true, html: i => this.money(i.balance, i.currency) },
                { label: "Email", html: i => i.to ? esc(i.to) : '<span class="warn-text">No email on the invoice</span>' },
                { label: "Last reminder", html: i => { const l = lastFor(i.id); return l ? `${fmtDate(l.date)} · ${l.status === "sent" ? "sent" : l.status === "failed" ? '<span class="bad-text">failed</span>' : "not emailed"}` : '<span class="muted">—</span>'; } },
                { label: "", html: i => `${i.to ? `<a class="btn btn-ghost btn-sm" href="mailto:${encodeURIComponent(i.to)}?subject=${encodeURIComponent(i.subject)}&body=${encodeURIComponent(i.body)}" data-mailto="${i.id}">Open in email</a>` : ""}${data.emailReady && i.to && Server.can("sales") ? ` <button type="button" class="btn btn-primary btn-sm" data-send="${i.id}">Send now</button>` : ""}` }
            ], data.invoices, { empty: "No unpaid invoices. Nothing to remind anyone about." });
        $$("[data-openinv]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); openSaved(a.dataset.openinv); }));
        $$("[data-send]").forEach(b => b.addEventListener("click", async () => {
            b.disabled = true;
            try { const r = await Server.post("reminders/send", { docId: b.dataset.send }); Server.apply(r.reminder); toast(r.reminder.status === "sent" ? "Reminder sent." : r.reminder.detail || "Not sent.", r.reminder.status === "sent" ? "good" : "warn", 6000); this.pageReminders(); }
            catch (e) { toast(e.message, "bad"); b.disabled = false; }
        }));
        $$("[data-mailto]").forEach(a => a.addEventListener("click", () => {
            if (!Server.can("sales")) return;
            // Log that the reminder was prepared, so the history shows it
            Server.save("reminder", { id: uid("rem"), date: this.today(), docId: a.dataset.mailto, number: data.invoices.find(i => i.id === a.dataset.mailto)?.number, stage: "manual", status: "queued", detail: "Opened in the user's email app" }).catch(() => {});
        }));
    }
};

/* Opening a purchase order's "Create bill" action */
Finance.billFromPO = function (po) { location.hash = `#finance/bill/new?po=${po.id}`; };
