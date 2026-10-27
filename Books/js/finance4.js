/* ==========================================================
   EVAM Books — finance screens, part 4
   Documents inside Finance (invoices, credit notes, quotes and orders, purchase orders),
   the customer statement, the grouped chart of accounts, and payroll
   (employees, pay runs, commissions, salary slips).
   ========================================================== */

Object.assign(Finance, {
    /* ==========================================================
       DOCUMENTS IN FINANCE
       ========================================================== */
    toAED(doc, amount) {
        const cur = doc.currency || "AED";
        if (cur === "AED") return num(amount);
        const r = num(doc.fx?.rate) || num(doc.rate) || num(LiveFX.rate(cur));
        return r ? round(num(amount) * r, 2) : 0;
    },
    docTotal(d) { return computeTotals({ ...d, paid: 0 }).total; },
    isVendorName(name) {
        const c = Store.data.contacts.find(x => this.sameName(x.name, name));
        return !!c && c.role === "vendor";
    },
    filterBar(kind, { statuses = [], people = [], personLabel = "Customer" } = {}) {
        const p = this.params;
        return `<div class="filters fin-filters">
<label class="search"><span class="search-ic">${icon("search")}</span><input id="sdSearch" type="search" placeholder="Search number, name or reference" value="${esc(p.get("q") || "")}"></label>
${statuses.length ? `<select id="sdStatus" aria-label="Status"><option value="">Any status</option>${statuses.map(s => `<option value="${s}"${s === p.get("status") ? " selected" : ""}>${s === "outstanding" ? "Outstanding" : (STATUS[s] || {}).label || s}</option>`).join("")}</select>` : ""}
${people.length ? `<select id="sdWho" aria-label="${personLabel}"><option value="">Every ${personLabel.toLowerCase()}</option>${people.map(n => `<option value="${esc(n)}"${n === p.get("who") ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>` : ""}
</div>`;
    },
    bindFilterBar(route) {
        const go = () => {
            const q = new URLSearchParams();
            const s = $("#sdSearch")?.value.trim(); if (s) q.set("q", s);
            const st = $("#sdStatus")?.value; if (st) q.set("status", st);
            const w = $("#sdWho")?.value; if (w) q.set("who", w);
            history.replaceState(null, "", `#finance/${route}${q.toString() ? "?" + q : ""}`);
            this.params = q;
            const pos = $("#sdSearch")?.selectionStart;
            const had = document.activeElement && document.activeElement.id === "sdSearch";
            this._page();
            if (had) { const n = $("#sdSearch"); n.focus(); if (pos != null) n.setSelectionRange(pos, pos); }
        };
        $("#sdSearch")?.addEventListener("input", debounce(go, 200));
        $("#sdStatus")?.addEventListener("change", go);
        $("#sdWho")?.addEventListener("change", go);
    },
    bindDocRows() {
        $$("#finMain tr[data-doc]").forEach(tr => {
            const open = () => openSaved(tr.dataset.doc);
            tr.addEventListener("click", e => { if (!e.target.closest("button, a, input, select")) open(); });
            tr.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === tr) open(); });
        });
        $$("#finMain [data-convert]").forEach(b => b.addEventListener("click", async () => { if (await openSaved(b.dataset.id)) convertCurrent(b.dataset.convert); }));
        $$("#finMain [data-new]").forEach(b => b.addEventListener("click", () => startNew(b.dataset.new, true)));
    },
    docTable(cols, rows, empty) {
        if (!rows.length) return this.emptyCard(empty);
        return `<div class="table-card"><table class="dtable fin-table"><thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}">${c.label}</th>`).join("")}</tr></thead>
<tbody>${rows.map(r => `<tr data-doc="${esc(r.id)}" tabindex="0">${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.html(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    },

    pageSalesDocs(kind) {
        const p = this.params;
        const q = (p.get("q") || "").toLowerCase(), st = p.get("status") || "", who = p.get("who") || "";
        const types = kind === "quotes" ? ["quotation", "proforma", "salesOrder"] : [kind];
        const all = Store.data.docs.filter(d => types.includes(d.type));
        // Use saved payment allocations to determine whether an invoice still has a balance.
        const isOutstanding = d => {
            if (d.status === "cancelled") return false;
            const total = this.docTotal(d);
            const allocated = (Server.fin.payment || []).reduce((sum, payment) =>
                sum + (payment.allocations || []).reduce((part, allocation) =>
                    part + (allocation.docId === d.id ? num(allocation.amount) : 0), 0), 0);
            return Math.max(0, round(total - allocated - num(d.credited), decimalsFor(d.currency || "AED"))) > 0;
        };
        const match = d => (!q || [d.number, d.party?.name, d.ref, d.poNumber, d.subject].join(" ").toLowerCase().includes(q))
            && (!st || (kind === "invoice" && st === "outstanding" ? isOutstanding(d) : effectiveStatus(d) === st))
            && (!who || this.sameName(d.party?.name, who));
        const list = all.filter(match).sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.number || "").localeCompare(String(a.number || "")));
        const people = [...new Map(all.filter(d => d.party?.name).map(d => [d.party.name.trim().toLowerCase(), d.party.name.trim()])).values()].sort((a, b) => a.localeCompare(b));
        const canSales = Server.can("sales"), canBuy = Server.can("purchases");
        const main = $("#finMain");
        const aed = v => `<span class="ls-cur">AED</span>${fmt(v)}`;

        if (kind === "invoice") {
            // Online payments are stored separately from invoice documents. Use saved
            // allocations as the source of truth for balances shown on this page.
            const balance = d => {
                if (d.status === "cancelled") return 0;
                const total = this.docTotal(d);
                const allocated = (Server.fin.payment || []).reduce((sum, p) =>
                    sum + (p.allocations || []).reduce((part, a) =>
                        part + (a.docId === d.id ? num(a.amount) : 0), 0), 0);
                return Math.max(0, round(total - allocated - num(d.credited), decimalsFor(d.currency || "AED")));
            };
            const open = all.filter(d => d.status !== "cancelled" && balance(d) > 0);
            const overdue = open.filter(d => effectiveStatus(d) === "overdue");
            const month = this.today().slice(0, 7);
            const received = (Server.fin.payment || []).filter(x => (x.date || "").startsWith(month)).reduce((s, x) => s + num(x.amount) * ((x.currency || "AED") === "AED" ? 1 : num(x.rate) || num(LiveFX.rate(x.currency)) || 0), 0);
            const drafts = all.filter(d => d.status === "draft").length;
            // Credit notes kept as customer credit (no invoice of that customer to reduce)
            const looseCredit = Store.data.docs.filter(c => c.type === "creditNote" && c.status !== "cancelled" && (c.unlinked || !all.some(i => this.sameName(i.number, c.ref) && this.sameName(i.party?.name, c.party?.name) && (i.currency || "AED") === (c.currency || "AED"))))
                .reduce((s, c) => s + this.toAED(c, this.docTotal(c)), 0);
            main.innerHTML = this.head("Invoices", "Every invoice from the document desk, with what has been paid and what is still owed.",
                `${who ? this.link("Customer statement", `#finance/report/customer_statement?contact=${encodeURIComponent(who)}`, "btn-ghost", "file") : ""}${canSales ? this.link("Record payment", "#finance/payment/new", "btn-ghost", "check") + `<button type="button" class="btn btn-primary" data-new="invoice">${icon("plus")}<span>New invoice</span></button>` : ""}`) + `
<div class="ledger-strip fin-kpis">
  <a class="ls" href="#finance/invoices?status=outstanding" aria-label="View ${open.length} outstanding invoices"><div class="ls-label">Outstanding</div><div class="ls-value">${aed(open.reduce((s, d) => s + this.toAED(d, balance(d)), 0))}</div><div class="ls-note">${open.length} unpaid invoice${open.length === 1 ? "" : "s"}${looseCredit > 0.004 ? ` · less AED ${fmt(looseCredit)} customer credit` : ""} · Click to view</div></a>
  <a class="ls ${overdue.length ? "ls-bad" : ""}" href="#finance/invoices?status=overdue" aria-label="View ${overdue.length} overdue invoices"><div class="ls-label">Overdue</div><div class="ls-value">${aed(overdue.reduce((s, d) => s + this.toAED(d, balance(d)), 0))}</div><div class="ls-note">${overdue.length ? `${overdue.length} past the due date` : "Nothing overdue"} · Click to view</div></a>
  <a class="ls" href="#finance/payments"><div class="ls-label">Received this month</div><div class="ls-value">${aed(received)}</div><div class="ls-note">Payments recorded in ${MONTHS_LONG[Number(month.slice(5)) - 1]}</div></a>
  <a class="ls" href="#finance/invoices?status=draft" aria-label="View ${drafts} draft invoices"><div class="ls-label">Drafts</div><div class="ls-value">${drafts}</div><div class="ls-note">${drafts ? "Click to view draft invoices" : "No drafts"}</div></a>
</div>` + this.filterBar(kind, { statuses: ["outstanding", "draft", "sent", "partial", "overdue", "paid", "credited", "cancelled"], people }) +
                this.docTable([
                    { label: "Date", html: d => fmtDate(d.date) },
                    { label: "Number", html: d => `<b>${esc(d.number || "")}</b>` },
                    { label: "Customer", html: d => esc(d.party?.name || "—"), cls: "who" },
                    { label: "Due", html: d => `<span class="${effectiveStatus(d) === "overdue" ? "bad-text" : ""}">${fmtDate(d.due)}</span>` },
                    { label: "Total", num: true, html: d => this.money(this.docTotal(d), d.currency) },
                    { label: "Balance due", num: true, html: d => balance(d) > 0 ? this.money(balance(d), d.currency) : '<span class="muted">0.00</span>' },
                    { label: "Status", html: d => this.pill(effectiveStatus(d)) },
                    { label: "", html: d => balance(d) > 0 && canSales ? `<a class="btn btn-ghost btn-sm" href="#finance/payment/new?invoice=${esc(d.id)}">Record payment</a>` : "" }
                ], list, all.length ? "No invoices match." : "No invoices yet. Create one here or on the document desk — it appears here and in the accounts straight away.");
        } else if (kind === "creditNote") {
            const issued = all.filter(d => !["draft", "cancelled"].includes(d.status));
            main.innerHTML = this.head("Credit notes", "Credit notes you issue to customers — returns, discounts and corrections. They reduce what the customer owes.",
                canSales ? `<button type="button" class="btn btn-primary" data-new="creditNote">${icon("plus")}<span>New credit note</span></button>` : "") + `
<div class="note-box">Credit notes you <b>receive from a supplier</b> are recorded under <a href="#finance/vendor-credits">Purchases → Vendor credits</a>, because they reduce what you owe rather than what you are owed.</div>
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">Issued</div><div class="ls-value">${aed(issued.reduce((s, d) => s + this.toAED(d, this.docTotal(d)), 0))}</div><div class="ls-note">${issued.length} credit note${issued.length === 1 ? "" : "s"}</div></div>
  <div class="ls"><div class="ls-label">Linked to an invoice</div><div class="ls-value">${issued.filter(d => d.ref && Store.data.docs.some(x => x.type === "invoice" && this.sameName(x.number, d.ref))).length}</div><div class="ls-note">Reduce that invoice's balance</div></div>
  <div class="ls"><div class="ls-label">Drafts</div><div class="ls-value">${all.filter(d => d.status === "draft").length}</div><div class="ls-note">Drafts don't post to the accounts</div></div>
</div>` + this.filterBar(kind, { statuses: ["draft", "issued", "refunded", "cancelled"], people }) +
                this.docTable([
                    { label: "Date", html: d => fmtDate(d.date) },
                    { label: "Number", html: d => `<b>${esc(d.number || "")}</b>` },
                    { label: "Customer", html: d => `${esc(d.party?.name || "—")}${this.isVendorName(d.party?.name) ? ' <span class="pill pill-warn" title="This contact is saved as a vendor">Vendor</span>' : ""}`, cls: "who" },
                    { label: "Against invoice", html: d => { const inv = d.ref && Store.data.docs.find(x => x.type === "invoice" && this.sameName(x.number, d.ref)); return inv ? `<a href="#" data-open="${esc(inv.id)}">${esc(inv.number)}</a>` : d.ref ? esc(d.ref) : '<span class="muted">Not linked</span>'; } },
                    { label: "Amount", num: true, html: d => this.money(this.docTotal(d), d.currency) },
                    { label: "Status", html: d => this.pill(d.status) },
                    { label: "", html: d => this.isVendorName(d.party?.name) && canBuy ? `<a class="btn btn-ghost btn-sm" href="#finance/vendor-credit/new?fromDoc=${esc(d.id)}" title="Record it as a credit note received from this vendor">Make vendor credit</a>` : "" }
                ], list, all.length ? "No credit notes match." : "No credit notes yet. Create one from an invoice (More → Create credit note) or here.");
        } else if (kind === "quotes") {
            const live = all.filter(d => ["draft", "sent", "confirmed", "open"].includes(effectiveStatus(d)));
            const won = all.filter(d => ["accepted", "invoiced", "confirmed"].includes(d.status));
            main.innerHTML = this.head("Quotes and orders", "Quotations, proforma invoices and sales orders. Nothing here is in the accounts until it becomes an invoice.",
                canSales ? `<button type="button" class="btn btn-ghost" data-new="salesOrder">${icon("plus")}<span>Sales order</span></button><button type="button" class="btn btn-primary" data-new="quotation">${icon("plus")}<span>New quote</span></button>` : "") + `
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">Open pipeline</div><div class="ls-value">${aed(live.reduce((s, d) => s + this.toAED(d, this.docTotal(d)), 0))}</div><div class="ls-note">${live.length} open quote${live.length === 1 ? "" : "s"} and order${live.length === 1 ? "" : "s"}</div></div>
  <div class="ls"><div class="ls-label">Won</div><div class="ls-value">${aed(won.reduce((s, d) => s + this.toAED(d, this.docTotal(d)), 0))}</div><div class="ls-note">Accepted, confirmed or invoiced</div></div>
  <div class="ls"><div class="ls-label">Expired or declined</div><div class="ls-value">${all.filter(d => ["expired", "declined"].includes(effectiveStatus(d))).length}</div><div class="ls-note">Follow up or archive</div></div>
</div>` + this.filterBar(kind, { statuses: ["draft", "sent", "accepted", "confirmed", "invoiced", "declined", "expired"], people }) +
                this.docTable([
                    { label: "Type", html: d => esc(DOC_TYPES[d.type].label) },
                    { label: "Date", html: d => fmtDate(d.date) },
                    { label: "Number", html: d => `<b>${esc(d.number || "")}</b>` },
                    { label: "Customer", html: d => esc(d.party?.name || "—"), cls: "who" },
                    { label: "Valid until", html: d => d.valid ? fmtDate(d.valid) : '<span class="muted">—</span>' },
                    { label: "Amount", num: true, html: d => this.money(this.docTotal(d), d.currency) },
                    { label: "Status", html: d => this.pill(effectiveStatus(d)) },
                    { label: "", html: d => canSales && !["invoiced", "declined", "cancelled"].includes(d.status) && !Store.data.docs.some(x => x.type === "invoice" && x.sourceId === d.id) ? `<button type="button" class="btn btn-ghost btn-sm" data-convert="invoice" data-id="${esc(d.id)}">Make invoice</button>` : "" }
                ], list, all.length ? "Nothing matches." : "No quotes or orders yet.");
        } else if (kind === "purchaseOrder") {
            const billsFor = d => (Server.fin.bill || []).filter(b => b.poId === d.id);
            const openPO = all.filter(d => !["cancelled", "received"].includes(d.status) && !billsFor(d).length);
            main.innerHTML = this.head("Purchase orders", "Orders you send to suppliers. When the supplier's invoice arrives, turn the order into a bill.",
                canBuy ? `<button type="button" class="btn btn-primary" data-new="purchaseOrder">${icon("plus")}<span>New purchase order</span></button>` : "") + `
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">Open orders</div><div class="ls-value">${aed(openPO.reduce((s, d) => s + this.toAED(d, this.docTotal(d)), 0))}</div><div class="ls-note">${openPO.length} not billed yet</div></div>
  <div class="ls"><div class="ls-label">Billed</div><div class="ls-value">${all.filter(d => billsFor(d).length).length}</div><div class="ls-note">Orders with a bill recorded</div></div>
  <div class="ls"><div class="ls-label">All orders</div><div class="ls-value">${all.length}</div><div class="ls-note">From the document desk</div></div>
</div>` + this.filterBar(kind, { statuses: ["draft", "issued", "confirmed", "received", "cancelled"], people, personLabel: "Vendor" }) +
                this.docTable([
                    { label: "Date", html: d => fmtDate(d.date) },
                    { label: "Number", html: d => `<b>${esc(d.number || "")}</b>` },
                    { label: "Vendor", html: d => esc(d.party?.name || "—"), cls: "who" },
                    { label: "Amount", num: true, html: d => this.money(this.docTotal(d), d.currency) },
                    { label: "Status", html: d => this.pill(d.status) },
                    { label: "Bill", html: d => billsFor(d).map(b => `<a href="#finance/bill/${esc(b.id)}">${esc(b.number || "Bill")}</a>`).join(", ") || '<span class="muted">Not billed</span>' },
                    { label: "", html: d => canBuy && !billsFor(d).length && d.status !== "cancelled" ? `<a class="btn btn-ghost btn-sm" href="#finance/bill/new?po=${esc(d.id)}">Create bill</a>` : "" }
                ], list, all.length ? "No orders match." : "No purchase orders yet.");
        }
        this.bindFilterBar({ invoice: "invoices", creditNote: "credit-notes", quotes: "quotes", purchaseOrder: "purchase-orders" }[kind]);
        this.bindDocRows();
        $$("#finMain [data-open]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); openSaved(a.dataset.open); }));
    },

    /* ==========================================================
       CHART OF ACCOUNTS — grouped the way accountants read it
       ========================================================== */
    SUBTYPE_LABEL: { bank: "Bank", cash: "Cash", receivable: "Receivable", current: "Other current asset", inventory: "Inventory", fixed: "Fixed asset", tax: "Tax", payable: "Payable", longterm: "Long-term liability", equity: "Equity", operating: "Operating", cogs: "Cost of sales", other: "Other" },
    ACCOUNT_GROUPS: [
        ["Assets", "asset", [["Cash and bank", ["bank", "cash"]], ["Receivables", ["receivable"]], ["Other current assets", ["current", "tax", "inventory"]], ["Fixed and intangible assets", ["fixed"]]]],
        ["Liabilities", "liability", [["Current liabilities", ["payable", "current", "tax"]], ["Long-term liabilities", ["longterm"]]]],
        ["Equity", "equity", [["Equity", ["equity"]]]],
        ["Income", "income", [["Operating income", ["operating"]], ["Other income", ["other"]]]],
        ["Expenses", "expense", [["Cost of sales", ["cogs"]], ["Operating expenses", ["operating"]], ["Other expenses", ["other"]]]]
    ],
    async pageAccounts() {
        const main = $("#finMain");
        let balances = {};
        try { const tb = await Server.get(`reports/trial_balance?to=${this.today()}`); tb.rows.forEach(r => { balances[r.id] = r.debit - r.credit; }); } catch { /* balances optional */ }
        if (this.sub !== "accounts") return;
        const showArchived = this.params.get("archived") === "1";
        const ROLE_NOTE = { cash: "Cash in hand", ar: "Control account", ap: "Control account", vat_in: "VAT", vat_out: "VAT", rounding: "Automatic", fx: "Automatic", staff_adv: "Payroll", salaries: "Payroll", commission: "Payroll", salaries_payable: "Payroll" };
        const all = this.accounts().filter(a => showArchived || !a.archived);
        const shown = new Set();
        const sign = t => t === "asset" || t === "expense" ? 1 : -1;
        main.innerHTML = this.head("Chart of accounts", "Every amount in the books is recorded against one of these accounts.", `${this.link(showArchived ? "Hide archived" : "Show archived", showArchived ? "#finance/accounts" : "#finance/accounts?archived=1", "btn-ghost", null)}${Server.can("accounting") ? this.link("New account", "#finance/account/new") : ""}`) +
            this.ACCOUNT_GROUPS.map(([label, type, subs]) => {
                const ofType = all.filter(a => a.type === type);
                const parts = subs.map(([sl, keys], i) => {
                    // anything with an unexpected detail type lands in the last group of its type
                    const list = ofType.filter(a => !shown.has(a.id) && (keys.includes(a.subtype) || (i === subs.length - 1)));
                    list.forEach(a => shown.add(a.id));
                    if (!list.length) return "";
                    const total = list.reduce((s, a) => s + sign(type) * (balances[a.id] || 0), 0);
                    return `<tbody class="coa-group"><tr class="coa-sub"><th colspan="4">${esc(sl)}</th><th class="num">${fmt(total)}</th></tr>${list.map(a => `<tr data-row="${esc(a.id)}" tabindex="0">
<td class="coa-code">${esc(a.code || "")}</td>
<td><b>${esc(a.name)}</b>${a.archived ? ' <span class="pill pill-mute">Archived</span>' : ""}${a.system ? ` <span class="pill pill-neutral" title="Used by the system for automatic postings">${esc(ROLE_NOTE[a.role] || "System")}</span>` : ""}</td>
<td class="muted">${esc(this.SUBTYPE_LABEL[a.subtype] || a.subtype || "")}${a.subtype === "other" ? (type === "expense" ? " expense" : " income") : ""}</td>
<td>${esc(a.currency || "AED")}</td>
<td class="num">${balances[a.id] ? `<a href="#finance/report/general_ledger?account=${a.id}">${fmt(sign(type) * balances[a.id])}</a>` : '<span class="muted">0.00</span>'}</td></tr>`).join("")}</tbody>`;
                }).join("");
                if (!parts) return "";
                const grand = ofType.reduce((s, a) => s + sign(type) * (balances[a.id] || 0), 0);
                return `<h2 class="fin-h2">${label}</h2><div class="table-card"><table class="dtable fin-table coa-table"><thead><tr><th>Code</th><th>Name</th><th>Detail type</th><th>Currency</th><th class="num">Balance (AED)</th></tr></thead>${parts}<tfoot><tr class="coa-total"><td colspan="4">Total ${label.toLowerCase()}</td><td class="num">${fmt(grand)}</td></tr></tfoot></table></div>`;
            }).join("") + `<p class="hint mt">Petty cash sits with the bank accounts under Assets; staff advances are money employees owe back, so they are an asset too. Rounding and exchange differences are “Other expenses”: a credit balance on them means a small gain.</p>`;
        this.bindRows("#finance/account/");
    },

    /* ==========================================================
       CUSTOMER STATEMENT
       ========================================================== */
    renderStatement(d) {
        const s = Store.settings, c = s.company, cu = d.customer || { name: d.contact };
        const B = { current: "Not yet due", d1_30: "1–30 days", d31_60: "31–60 days", d61_90: "61–90 days", d90: "Over 90 days" };
        const logo = s.brand?.logo ? `<img src="${esc(s.brand.logo)}" alt="" class="st-logo">` : "";
        const lines = t => esc(t || "").replace(/\n/g, "<br>");
        const head = `<div class="st-head">
  <div class="st-from">${logo}<div class="st-co">${esc(c.name)}</div><div class="st-small">${[lines(c.address), c.trn ? `TRN ${esc(c.trn)}` : "", [c.email, c.phone].filter(Boolean).map(esc).join(" · ")].filter(Boolean).join("<br>")}</div></div>
  <div class="st-title"><h2>Statement of account</h2><div class="st-small">Statement date <b>${fmtDate(d.to)}</b><br>Period ${fmtDate(d.from)} – ${fmtDate(d.to)}</div></div>
</div>
<div class="st-to"><div class="st-label">To</div><div class="st-cust">${esc(cu.name)}</div><div class="st-small">${[lines(cu.address), cu.trn ? `TRN ${esc(cu.trn)}` : "", esc(cu.email || "")].filter(Boolean).join("<br>")}</div></div>`;
        if (!d.groups.length) return head + `<p class="muted">No transactions with ${esc(d.contact)} up to ${fmtDate(d.to)}.</p>`;
        const groups = d.groups.map(g => {
            const C = g.currency;
            const bank = (s.banks || []).find(b => b.currency === C) || (s.banks || [])[0];
            return `<div class="st-cur">${d.groups.length > 1 ? `<h3 class="rp-h3">${C} account</h3>` : ""}
<div class="st-summary">
  <div><span>Opening balance</span><b>${fmt(g.opening, C)}</b></div>
  <div><span>Invoiced</span><b>${fmt(g.invoiced, C)}</b></div>
  <div><span>Payments and credits</span><b>${fmt(g.received, C)}</b></div>
  <div class="st-due"><span>Balance due</span><b>${C} ${fmt(g.closing, C)}</b></div>
  ${g.overdue > 0 ? `<div class="st-over"><span>of which overdue</span><b>${C} ${fmt(g.overdue, C)}</b></div>` : ""}
</div>
<table class="rp-table st-table"><thead><tr><th>Date</th><th>Transaction</th><th>Due date</th><th class="num">Invoiced</th><th class="num">Paid / credited</th><th class="num">Balance</th></tr></thead><tbody>
<tr class="rp-muted"><td>${fmtDate(d.from)}</td><td>Balance brought forward</td><td></td><td></td><td></td><td class="num">${fmt(g.opening, C)}</td></tr>
${g.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.label)} ${r.number ? this.srcLink(r.kind, r.id, r.number) : ""}${r.reference ? ` <span class="muted">· ${esc(r.reference)}</span>` : ""}</td><td>${r.due ? fmtDate(r.due) : ""}</td><td class="num">${r.debit ? fmt(r.debit, C) : ""}</td><td class="num">${r.credit ? fmt(r.credit, C) : ""}</td><td class="num">${fmt(r.balance, C)}</td></tr>`).join("")}
</tbody><tfoot><tr class="rp-key"><td colspan="3">Balance due on ${fmtDate(d.to)}</td><td class="num">${fmt(g.invoiced, C)}</td><td class="num">${fmt(g.received, C)}</td><td class="num">${C} ${fmt(g.closing, C)}</td></tr></tfoot></table>
<table class="rp-table st-ageing"><thead><tr>${d.buckets.map(b => `<th class="num">${B[b]}</th>`).join("")}<th class="num">Total due</th></tr></thead><tbody><tr>${d.buckets.map(b => `<td class="num">${fmt(g.ageing[b] || 0, C)}</td>`).join("")}<td class="num"><b>${fmt(g.openItems.reduce((s2, i) => s2 + i.balance, 0), C)}</b></td></tr></tbody></table>
${g.openItems.length ? `<h3 class="rp-h3">Unpaid invoices</h3><table class="rp-table rp-dense"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="num">Days overdue</th><th class="num">Invoice total</th><th class="num">Still due</th></tr></thead><tbody>${g.openItems.map(i => `<tr><td>${this.srcLink("doc", i.id, i.number)}</td><td>${fmtDate(i.date)}</td><td>${fmtDate(i.due)}</td><td class="num">${i.daysOverdue ? `<span class="bad-text">${i.daysOverdue}</span>` : ""}</td><td class="num">${fmt(i.total, C)}</td><td class="num">${fmt(i.balance, C)}</td></tr>`).join("")}</tbody></table>` : ""}
${bank && g.closing > 0 ? `<div class="st-pay"><b>How to pay</b><div class="st-small">${(bank.lines || []).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</div></div>` : ""}
</div>`;
        }).join("");
        return head + groups + `<p class="rp-note">Please check this statement and tell us within 15 days if anything differs from your records. Payments received after ${fmtDate(d.to)} are not shown.</p>`;
    },

    /* ==========================================================
       PAYROLL
       ========================================================== */
    EARN_COLS: [["basic", "Basic"], ["housing", "Housing"], ["transport", "Transport"], ["allowance", "Other allow."], ["overtime", "Overtime"], ["commission", "Commission"], ["bonus", "Bonus"], ["compensation", "Other comp."], ["reimbursement", "Reimburse."]],
    DED_COLS: [["advance", "Advance recovery"], ["other", "Other deduction"]],
    EARN_LABEL: { basic: "Basic salary", housing: "Housing allowance", transport: "Transport allowance", allowance: "Other allowance", overtime: "Overtime", commission: "Commission", bonus: "Bonus", compensation: "Compensation", reimbursement: "Expense reimbursement" },
    DED_LABEL: { advance: "Advance recovery", unpaid: "Unpaid leave", other: "Other deduction" },
    employees(all = false) { return (Server.fin.employee || []).filter(e => all || e.status !== "left").sort((a, b) => String(a.name).localeCompare(String(b.name))); },
    monthlyFixed(e) { const p = e.pay || {}; return round(num(p.basic) + num(p.housing) + num(p.transport) + num(p.allowance), 2); },
    async employeeBalances() {
        try { const r = await Server.get(`reports/employee_balances?to=${this.today()}`); const m = new Map(); r.rows.forEach(x => m.set(x.contact.trim().toLowerCase(), x)); return m; }
        catch { return new Map(); }
    },

    async pageEmployees() {
        const main = $("#finMain");
        const showLeft = this.params.get("left") === "1";
        const list = this.employees(showLeft);
        const bal = await this.employeeBalances();
        if (this.sub !== "employees") return;
        const active = this.employees();
        const monthly = active.reduce((s, e) => s + this.monthlyFixed(e), 0);
        const adv = [...bal.values()].reduce((s, x) => s + num(x.advance), 0);
        main.innerHTML = this.head("Employees", "Salary, allowances, commission and bank details for each person on the payroll.",
            `${this.link(showLeft ? "Hide people who left" : "Show people who left", showLeft ? "#finance/employees" : "#finance/employees?left=1", "btn-ghost", null)}${Server.role?.payroll ? this.link("Add employee", "#finance/employee/new") : ""}`) + `
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">On the payroll</div><div class="ls-value">${active.length}</div><div class="ls-note">Active employees</div></div>
  <div class="ls"><div class="ls-label">Monthly fixed pay</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(monthly)}</div><div class="ls-note">Basic and allowances, before commission</div></div>
  <div class="ls"><div class="ls-label">Advances to recover</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(adv)}</div><div class="ls-note">Staff advances not yet deducted</div></div>
</div>` + this.table([
            { label: "No.", html: e => esc(e.code || "") },
            { label: "Name", html: e => `<b>${esc(e.name)}</b><div class="small muted">${esc([e.designation, e.department].filter(Boolean).join(" · "))}</div>`, cls: "who" },
            { label: "Joined", html: e => e.joined ? fmtDate(e.joined) : '<span class="muted">—</span>' },
            { label: "Monthly pay", num: true, html: e => this.money(this.monthlyFixed(e)) },
            { label: "Commission", num: true, html: e => num(e.commissionRate) ? `${fmtPct(e.commissionRate)}` : '<span class="muted">—</span>' },
            { label: "Advance due", num: true, html: e => { const b = bal.get(e.name.trim().toLowerCase()); return b && b.advance ? this.money(b.advance) : '<span class="muted">0.00</span>'; } },
            { label: "Status", html: e => e.status === "left" ? this.pill("mute", "Left") : this.pill("good", "Active") }
        ], list, { empty: "No employees yet. Add the people you pay to run payroll and print salary slips.", onRow: e => e.id });
        this.bindRows("#finance/employee/");
    },

    async formEmployee(id) {
        const editing = id && id !== "new" ? (Server.fin.employee || []).find(e => e.id === id) : null;
        if (id && id !== "new" && !editing) { $("#finMain").innerHTML = `<div class="empty"><h2>Not found</h2></div>`; return; }
        const e = editing ? JSON.parse(JSON.stringify(editing)) : { id: uid("emp"), code: `E${String((Server.fin.employee || []).length + 1).padStart(3, "0")}`, name: "", designation: "", department: "", email: "", phone: "", joined: this.today(), status: "active", pay: { basic: 0, housing: 0, transport: 0, allowance: 0 }, commissionRate: 0, commissionBase: "collected", userId: "", advanceInstallment: 0, bankName: "", iban: "", routingCode: "", personId: "", notes: "" };
        let users = [];
        try { users = (await Server.get("users/directory")).users; } catch { /* optional */ }
        const canEdit = !!Server.role?.payroll;
        const bal = editing ? (await this.employeeBalances()).get(e.name.trim().toLowerCase()) : null;
        const runs = editing ? (Server.fin.payrun || []).filter(r => (r.lines || []).some(l => l.employeeId === e.id)).sort((a, b) => b.period.localeCompare(a.period)) : [];
        const n = (name, label, v, extra = "") => this.field(label, this.input(name, v ?? "", `type="number" step="any" min="0" inputmode="decimal" ${extra}`));
        $("#finMain").innerHTML = this.formShell(editing ? esc(e.name) : "New employee", editing ? `${esc(e.designation || "")}${bal && bal.advance ? ` · Advance to recover: AED ${fmt(bal.advance)}` : ""}` : "", `
<div class="sub-title">Employee</div>
<div class="grid-3">
  ${this.field("Full name", this.input("name", e.name, "required"), { req: true })}
  ${this.field("Employee no.", this.input("code", e.code))}
  ${this.field("Designation", this.input("designation", e.designation))}
  ${this.field("Department", this.input("department", e.department))}
  ${this.field("Email", this.input("email", e.email, 'type="email"'))}
  ${this.field("Phone", this.input("phone", e.phone))}
  ${this.field("Joining date", this.input("joined", e.joined, 'type="date"'))}
  ${this.field("Status", this.select("status", [["active", "Active"], ["left", "Left the company"]], e.status))}
  ${this.field("Leaving date", this.input("left", e.left || "", 'type="date"'))}
</div>
<div class="sub-title mt">Monthly pay (AED)</div>
<div class="grid-3 pay-grid">
  ${n("basic", "Basic salary", e.pay.basic)}
  ${n("housing", "Housing allowance", e.pay.housing)}
  ${n("transport", "Transport allowance", e.pay.transport)}
  ${n("allowance", "Other allowance", e.pay.allowance)}
  <div class="field"><label>Total fixed pay</label><div class="static" id="empGross"></div></div>
  ${n("advanceInstallment", "Advance recovery per month", e.advanceInstallment, 'placeholder="0 = recover in full"')}
</div>
<div class="sub-title mt">Commission</div>
<div class="grid-3">
  ${n("commissionRate", "Commission rate (%)", e.commissionRate, 'max="100"')}
  ${this.field("Based on", this.select("commissionBase", [["collected", "Payments collected in the month"], ["invoiced", "Invoices issued in the month"]], e.commissionBase || "collected"))}
  ${this.field("Their sales are the invoices made by", this.select("userId", [["", "Not linked — enter commission by hand"], ...users.map(u => [u.id, `${u.name} (${u.email})`])], e.userId || ""), { hint: "Commission is worked out on amounts before VAT, in AED." })}
</div>
<div class="sub-title mt">Salary payment (for the bank and WPS)</div>
<div class="grid-3">
  ${this.field("Bank", this.input("bankName", e.bankName))}
  ${this.field("IBAN", this.input("iban", e.iban, 'spellcheck="false" placeholder="AE…"'))}
  ${this.field("Bank routing code", this.input("routingCode", e.routingCode, 'placeholder="9 digits"'))}
  ${this.field("Labour card / person ID", this.input("personId", e.personId, 'placeholder="14 digits for WPS"'))}
  ${this.field("Notes", this.input("notes", e.notes), { cls: "span-2" })}
</div>
${editing ? `<div class="sub-title mt">Pay history</div>${runs.length ? `<ul class="kv-list">${runs.slice(0, 12).map(r => { const l = r.lines.find(x => x.employeeId === e.id); return `<li><a href="#finance/payrun/${r.id}">${esc(r.number || "")} · ${this.periodLabel(r.period)}</a>${this.pill(r.status)}<span class="num">${this.money(l.net)}</span></li>`; }).join("")}</ul>` : '<p class="muted">Not in any pay run yet.</p>'}` : ""}`,
            { canDelete: !!editing && canEdit && !runs.length, extraActions: editing && canEdit ? `<button type="button" class="btn btn-ghost" id="empAdvance">${icon("plus")}<span>Give an advance</span></button>` : "" });
        const f = $("#finForm");
        const gross = () => { $("#empGross").textContent = "AED " + fmt(["basic", "housing", "transport", "allowance"].reduce((s, k) => s + num(f[k].value), 0)); };
        ["basic", "housing", "transport", "allowance"].forEach(k => f[k].addEventListener("input", gross)); gross();
        $("#empAdvance")?.addEventListener("click", () => this.giveAdvance(e));
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't change payroll.");
            if (!d.name.trim()) return this.formError("Enter the employee's name.");
            if (d.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(d.iban.replace(/\s/g, "").toUpperCase())) return this.formError("That IBAN doesn't look right (e.g. AE07 0331 2345 6789 0123 456).");
            const dup = (Server.fin.employee || []).find(x => x.id !== e.id && d.code && this.sameName(x.code, d.code));
            if (dup) return this.formError(`Employee no. ${d.code} is already used by ${dup.name}.`);
            const obj = { ...e, name: d.name.trim(), code: d.code.trim(), designation: d.designation, department: d.department, email: d.email, phone: d.phone, joined: d.joined, left: d.left, status: d.status,
                pay: { basic: num(d.basic), housing: num(d.housing), transport: num(d.transport), allowance: num(d.allowance) }, advanceInstallment: num(d.advanceInstallment),
                commissionRate: num(d.commissionRate), commissionBase: d.commissionBase, userId: d.userId, bankName: d.bankName, iban: d.iban.replace(/\s/g, "").toUpperCase(), routingCode: d.routingCode.trim(), personId: d.personId.trim(), notes: d.notes };
            await this.saveRecord("employee", obj, { back: "#finance/employees", label: "Saved" });
        }, { cancel: "#finance/employees", onDelete: () => this.deleteRecord("employee", e, e.name, "#finance/employees") });
    },

    async giveAdvance(e) {
        const banks = this.bankAccounts().filter(a => (a.currency || "AED") === "AED");
        const r = await openDialog({
            title: `Advance to ${e.name}`,
            body: `<div class="form-grid"><div class="field"><label for="adv1">Amount (AED)</label><input id="adv1" name="amount" type="number" step="any" min="0"></div>
<div class="field"><label for="adv2">Date</label><input id="adv2" name="date" type="date" value="${this.today()}"></div>
<div class="field"><label for="adv3">Paid from</label><select id="adv3" name="accountId">${banks.map(a => `<option value="${a.id}">${esc(this.accountLabel(a))}</option>`).join("")}</select></div>
<div class="field"><label for="adv4">Note</label><input id="adv4" name="memo" placeholder="e.g. Salary advance, school fees"></div></div>
<p class="hint">Recorded as money the employee owes back (Staff advances). It is recovered on their next payslips.</p>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: "Record advance", value: "ok", primary: true }]
        });
        if (r.value !== "ok") return;
        const amt = round(num(r.data.amount), 2);
        if (!(amt > 0)) { toast("Enter the amount of the advance.", "warn"); return; }
        const adv = this.role("staff_adv");
        if (!adv) { toast("The chart of accounts has no Staff advances account.", "bad"); return; }
        try {
            await Server.save("journal", { id: uid("jv"), date: r.data.date, notes: `Advance to ${e.name}${r.data.memo ? " — " + r.data.memo : ""}`, lines: [
                { accountId: adv.id, debit: amt, credit: 0, contactName: e.name, memo: r.data.memo || "Staff advance" },
                { accountId: r.data.accountId, debit: 0, credit: amt, contactName: e.name, memo: r.data.memo || "Staff advance" }] });
            toast(`Advance of AED ${fmt(amt)} recorded.`, "good");
            this._formOpen = false;
            this.formEmployee(e.id);
        } catch (err) { toast(err.message, "bad", 7000); }
    },

    periodLabel(p) { return p ? `${MONTHS_LONG[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : ""; },

    pagePayruns() {
        const runs = (Server.fin.payrun || []).slice().sort((a, b) => (b.period || "").localeCompare(a.period || "") || (b.date || "").localeCompare(a.date || ""));
        const year = this.today().slice(0, 4);
        const ytd = runs.filter(r => r.status !== "draft" && (r.date || "").startsWith(year));
        $("#finMain").innerHTML = this.head("Pay runs and salary slips", "Pay everyone for a month in one go: salaries, allowances, commission and deductions. Approving books the cost; paying clears it from the bank.",
            `${this.link("Payroll summary", `#finance/report/payroll_summary?from=${year}-01-01&to=${this.today()}`, "btn-ghost", "file")}${Server.role?.payroll ? this.link("New pay run", "#finance/payrun/new") : ""}`) + `
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">Payroll cost ${year}</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(ytd.reduce((s, r) => s + num(r.totals?.gross), 0))}</div><div class="ls-note">${ytd.length} approved pay run${ytd.length === 1 ? "" : "s"}</div></div>
  <div class="ls"><div class="ls-label">Approved, not paid</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(runs.filter(r => r.status === "approved").reduce((s, r) => s + num(r.totals?.net), 0))}</div><div class="ls-note">Net pay waiting to go out</div></div>
  <div class="ls"><div class="ls-label">Drafts</div><div class="ls-value">${runs.filter(r => r.status === "draft").length}</div><div class="ls-note">Not in the accounts yet</div></div>
</div>` + this.table([
            { label: "Month", html: r => `<b>${this.periodLabel(r.period)}</b>` },
            { label: "Number", html: r => esc(r.number || "") },
            { label: "Pay date", html: r => fmtDate(r.status === "paid" ? r.payment?.date || r.date : r.date) },
            { label: "Employees", num: true, html: r => String(r.totals?.employees ?? (r.lines || []).length) },
            { label: "Gross pay", num: true, html: r => this.money(r.totals?.gross) },
            { label: "Deductions", num: true, html: r => this.money(r.totals?.deductions) },
            { label: "Net pay", num: true, html: r => `<b>${this.money(r.totals?.net)}</b>` },
            { label: "Status", html: r => this.pill(r.status === "approved" ? "confirmed" : r.status, r.status === "approved" ? "Approved" : r.status === "paid" ? "Paid" : "Draft") }
        ], runs, { empty: "No pay runs yet. Add your employees, then start a pay run for the month.", onRow: r => r.id });
        this.bindRows("#finance/payrun/");
    },

    /* Commission for one employee for a month, from the invoices their user made */
    commissionFor(e, period) {
        if (!e.userId || !num(e.commissionRate)) return null;
        const rate = num(e.commissionRate) / 100;
        const mine = d => d.type === "invoice" && d.status !== "cancelled" && d.created_by === e.userId;
        const netShare = d => { const t = computeTotals({ ...d, paid: 0 }); return t.total ? (t.total - num(t.vatTotal)) / t.total : 1; };
        let base = 0, count = 0;
        if ((e.commissionBase || "collected") === "invoiced") {
            Store.data.docs.filter(d => mine(d) && (d.date || "").startsWith(period)).forEach(d => { const t = computeTotals({ ...d, paid: 0 }); base += this.toAED(d, t.total - num(t.vatTotal)); count++; });
        } else {
            (Server.fin.payment || []).filter(p => (p.date || "").startsWith(period)).forEach(p => (p.allocations || []).forEach(a => {
                const d = Store.getDoc(a.docId);
                if (!d || !mine(d)) return;
                const r = (p.currency || "AED") === "AED" ? 1 : num(p.rate) || num(LiveFX.rate(p.currency)) || 0;
                base += num(a.amount) * r * netShare(d); count++;
            }));
        }
        return { base: round(base, 2), amount: round(base * rate, 2), count, rate: num(e.commissionRate), on: (e.commissionBase || "collected") === "invoiced" ? "invoiced" : "collected" };
    },

    async formPayrun(id) {
        const editing = id && id !== "new" ? (Server.fin.payrun || []).find(r => r.id === id) : null;
        if (id && id !== "new" && !editing) { $("#finMain").innerHTML = `<div class="empty"><h2>Not found</h2></div>`; return; }
        const today = this.today();
        const lastMonth = (() => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1)); return d.toISOString().slice(0, 7); })();
        const taken = new Set((Server.fin.payrun || []).map(r => r.period));
        const period0 = taken.has(lastMonth) ? today.slice(0, 7) : lastMonth;
        const monthEnd = p => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).toISOString().slice(0, 10);
        const bal = await this.employeeBalances();
        if (!this.sub.startsWith("payrun")) return;
        const run = editing ? JSON.parse(JSON.stringify(editing)) : { id: uid("pr"), period: period0, date: monthEnd(period0), status: "draft", notes: "", lines: [] };
        const locked = run.status !== "draft";
        // HR: unpaid leave and absence from HR for the month; the pay-month divisor is an HR setting
        let hrPay = typeof HR !== "undefined" && HR.payrollFigures ? await HR.payrollFigures(run.period) : null;
        if (!this.sub.startsWith("payrun")) return;
        if (!locked && hrPay) run.payDivisor = hrPay.divisor;
        const div = () => num(run.payDivisor) || 30;
        const canEdit = !!Server.role?.payroll;
        // One editable row per employee
        const rowFrom = l => {
            const r = { employeeId: l.employeeId || "", name: l.name, code: l.code || "", designation: l.designation || "", department: l.department || "", iban: l.iban || "", bankName: l.bankName || "", routingCode: l.routingCode || "", personId: l.personId || "", joined: l.joined || "", unpaidDays: num(l.unpaidDays), commissionNote: l.commissionNote || "" };
            this.EARN_COLS.forEach(([k]) => { r[k] = 0; });
            r.advance = 0; r.other = 0; r.unpaid = 0;
            (l.earnings || []).forEach(x => { r[x.type] = round(num(r[x.type]) + num(x.amount), 2); });
            (l.deductions || []).forEach(x => { r[x.type] = round(num(r[x.type]) + num(x.amount), 2); });
            return r;
        };
        const fromEmployee = e => {
            const b = bal.get(e.name.trim().toLowerCase());
            const owe = b ? num(b.advance) : 0;
            const r = rowFrom({ employeeId: e.id, name: e.name, code: e.code, designation: e.designation, department: e.department, iban: e.iban, bankName: e.bankName, routingCode: e.routingCode, personId: e.personId, joined: e.joined,
                earnings: ["basic", "housing", "transport", "allowance"].map(k => ({ type: k, amount: num(e.pay?.[k]) })) });
            r.advance = owe > 0 ? round(num(e.advanceInstallment) > 0 ? Math.min(owe, num(e.advanceInstallment)) : owe, 2) : 0;
            const c = this.commissionFor(e, run.period);
            if (c && c.amount) { r.commission = c.amount; r.commissionNote = `${fmtPct(c.rate)} of AED ${fmt(c.base)} ${c.on}`; }
            const hp = hrPay && hrPay.rows[e.id]; if (hp && hp.days) r.unpaidDays = hp.days;   // HR: unpaid leave + absent days
            return r;
        };
        let rows = run.lines.length ? run.lines.map(rowFrom) : this.employees().filter(e => !e.joined || e.joined <= monthEnd(run.period)).map(fromEmployee);
        const fixed = r => num(r.basic) + num(r.housing) + num(r.transport) + num(r.allowance);
        const calc = r => {
            r.unpaid = r.unpaidDays > 0 ? round(fixed(r) / div() * r.unpaidDays, 2) : 0;   // HR: divisor from HR settings (was 30)
            const gross = round(this.EARN_COLS.reduce((s, [k]) => s + num(r[k]), 0), 2);
            const ded = round(num(r.advance) + num(r.other) + num(r.unpaid), 2);
            return { gross, ded, net: round(gross - ded, 2) };
        };
        const toLines = () => rows.map(r => ({
            employeeId: r.employeeId, name: r.name, code: r.code, designation: r.designation, department: r.department, iban: r.iban, bankName: r.bankName, routingCode: r.routingCode, personId: r.personId, joined: r.joined,
            unpaidDays: num(r.unpaidDays), commissionNote: r.commissionNote,
            earnings: this.EARN_COLS.filter(([k]) => num(r[k])).map(([k]) => ({ type: k, label: this.EARN_LABEL[k], amount: round(num(r[k]), 2) })),
            deductions: [["advance", r.advance], ["unpaid", r.unpaid], ["other", r.other]].filter(([, v]) => num(v)).map(([k, v]) => ({ type: k, label: k === "unpaid" ? `Unpaid leave (${num(r.unpaidDays)} day${num(r.unpaidDays) === 1 ? "" : "s"})` : this.DED_LABEL[k], amount: round(num(v), 2) }))
        }));
        const paidList = (run.payments || []).map(x => `${fmtDate(x.date)} AED ${fmt(x.amount)} from ${esc(this.accountName(x.accountId))}${x.reference ? " · " + esc(x.reference) : ""}`).join("<br>");
        const statusText = run.payments?.length ? `${run.status === "paid" ? "Paid" : "Partly paid"} — ${run.payments.length} payment${run.payments.length === 1 ? "" : "s"}:<br>${paidList}${run.ledgerRefs?.length ? `<br><span class="muted">Already in the ledger as ${esc(run.ledgerRefs.join(", "))}</span>` : ""}` : { draft: "Draft — not in the accounts yet", approved: "Approved — cost booked, waiting to be paid", paid: `Paid on ${fmtDate(run.payment?.date)} from ${esc(this.accountName(run.payment?.accountId))}` }[run.status];
        const ro = locked || !canEdit;
        const cell = (r, i, k) => ro ? `<td class="num">${num(r[k]) ? fmt(r[k]) : '<span class="muted">—</span>'}</td>` : `<td class="num"><input class="pr-in" data-i="${i}" data-k="${k}" type="number" step="any" min="0" value="${num(r[k]) || ""}" placeholder="0" aria-label="${esc(r.name)} ${k}"></td>`;
        const draw = () => {
            const tot = rows.reduce((t, r) => { const c = calc(r); t.gross += c.gross; t.ded += c.ded; t.net += c.net; return t; }, { gross: 0, ded: 0, net: 0 });
            $("#prSheet").innerHTML = rows.length ? `<div class="table-card pr-card"><table class="dtable pr-table"><thead><tr><th class="pr-emp">Employee</th>${this.EARN_COLS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num pr-sep">Gross</th><th class="num">Unpaid days</th>${this.DED_COLS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num pr-net">Net pay</th><th></th></tr></thead>
<tbody>${rows.map((r, i) => { const c = calc(r); return `<tr><td class="pr-emp"><b>${esc(r.name)}</b><div class="small muted">${esc([r.code, r.designation].filter(Boolean).join(" · "))}</div>${r.commissionNote ? `<div class="small muted" title="Commission worked out from their sales">${esc(r.commissionNote)}</div>` : ""}${typeof HR !== "undefined" && !ro ? HR.payNote(hrPay, r.employeeId) : ""}</td>
${this.EARN_COLS.map(([k]) => cell(r, i, k)).join("")}<td class="num pr-sep"><b>${fmt(c.gross)}</b></td>
${ro ? `<td class="num">${num(r.unpaidDays) ? `${num(r.unpaidDays)} <span class="muted small">(${fmt(r.unpaid)})</span>` : '<span class="muted">—</span>'}</td>` : `<td class="num"><input class="pr-in pr-days" data-i="${i}" data-k="unpaidDays" type="number" step="0.5" min="0" max="31" value="${num(r.unpaidDays) || ""}" placeholder="0" aria-label="${esc(r.name)} unpaid days"><div class="small muted">${r.unpaid ? "− " + fmt(r.unpaid) : ""}</div></td>`}
${this.DED_COLS.map(([k]) => cell(r, i, k)).join("")}<td class="num pr-net ${c.net < 0 ? "bad-text" : ""}"><b>${fmt(c.net)}</b></td>
<td class="pr-act">${editing ? `<button type="button" class="icon-btn" data-slip="${i}" title="Salary slip" aria-label="Salary slip for ${esc(r.name)}">${icon("print", 15)}</button>` : ""}${ro ? "" : `<button type="button" class="icon-btn" data-rm="${i}" title="Remove from this pay run" aria-label="Remove ${esc(r.name)}">${icon("x", 14)}</button>`}</td></tr>`; }).join("")}</tbody>
<tfoot><tr class="pr-tot"><td class="pr-emp">${rows.length} employee${rows.length === 1 ? "" : "s"}</td>${this.EARN_COLS.map(([k]) => `<td class="num">${fmt(rows.reduce((s, r) => s + num(r[k]), 0))}</td>`).join("")}<td class="num pr-sep">${fmt(tot.gross)}</td><td class="num">${fmt(rows.reduce((s, r) => s + num(r.unpaid), 0))}</td>${this.DED_COLS.map(([k]) => `<td class="num">${fmt(rows.reduce((s, r) => s + num(r[k]), 0))}</td>`).join("")}<td class="num pr-net">${fmt(tot.net)}</td><td></td></tr></tfoot></table></div>`
                : `<div class="table-card"><div class="empty empty-sm"><p>No employees in this pay run. ${this.employees().length ? "Add them below." : `<a href="#finance/employee/new">Add your employees</a> first.`}</p></div></div>`;
            $("#prTotals").innerHTML = `<div><span>Gross pay</span><b>AED ${fmt(tot.gross)}</b></div><div><span>Deductions</span><b>AED ${fmt(tot.ded)}</b></div><div class="pr-big"><span>Net pay to employees</span><b>AED ${fmt(tot.net)}</b></div>`;
            const missing = this.employees().filter(e => !rows.some(r => r.employeeId === e.id));
            $("#prAdd").innerHTML = !ro && missing.length ? `<select id="prAddSel" aria-label="Add an employee"><option value="">Add an employee…</option>${missing.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select>` : "";
            $$(".pr-in").forEach(inp => inp.addEventListener("input", () => {
                const r = rows[Number(inp.dataset.i)];
                r[inp.dataset.k] = num(inp.value);
                const c = calc(r);
                const tr = inp.closest("tr");
                tr.querySelector(".pr-sep b").textContent = fmt(c.gross);
                tr.querySelector(".pr-net b").textContent = fmt(c.net);
                tr.querySelector(".pr-net").classList.toggle("bad-text", c.net < 0);
                if (inp.dataset.k === "unpaidDays") inp.nextElementSibling.textContent = r.unpaid ? "− " + fmt(r.unpaid) : "";
                clearTimeout(this._prT); this._prT = setTimeout(() => { const keep = document.activeElement; const sel = keep && keep.dataset ? [keep.dataset.i, keep.dataset.k] : null; draw(); if (sel) { const n = $(`.pr-in[data-i="${sel[0]}"][data-k="${sel[1]}"]`); if (n) { n.focus(); const v = n.value; n.value = ""; n.value = v; } } }, 900);
            }));
            $$("[data-rm]").forEach(b => b.addEventListener("click", () => { rows.splice(Number(b.dataset.rm), 1); draw(); }));
            $$("[data-slip]").forEach(b => b.addEventListener("click", () => this.printSlips(run, [toLines()[Number(b.dataset.slip)]])));
            $("#prAddSel")?.addEventListener("change", e => { const emp = this.employees().find(x => x.id === e.target.value); if (emp) { rows.push(fromEmployee(emp)); draw(); } });
        };
        const actions = editing && canEdit ? [
            run.status === "draft" ? `<button type="button" class="btn btn-ghost" id="prApprove">${icon("check")}<span>Approve</span></button>` : "",
            run.status === "approved" ? `<button type="button" class="btn btn-primary" id="prPay">${icon("check")}<span>Record salary payment</span></button><button type="button" class="btn btn-ghost" id="prReopen"><span>Back to draft</span></button>` : "",
            run.status === "paid" ? `<button type="button" class="btn btn-ghost" id="prUnpay"><span>Undo payment</span></button>` : "",
            `<button type="button" class="btn btn-ghost" id="prSlips">${icon("print")}<span>Salary slips</span></button>`,
            `<button type="button" class="btn btn-ghost" id="prWps">${icon("download")}<span>WPS file</span></button>`
        ].join("") : "";
        $("#finMain").innerHTML = this.formShell(editing ? `Pay run ${esc(run.number || "")} · ${this.periodLabel(run.period)}` : "New pay run", editing ? statusText : "Salaries come from each employee's details; commission from their sales; advance recovery from what they owe. Change any figure before approving.", `
<div class="grid-3">
  ${this.field("Month", this.input("period", run.period, `type="month" required${locked ? " disabled" : ""}`), { req: true })}
  ${this.field("Pay date", this.input("date", run.date, `type="date" required${locked ? " disabled" : ""}`), { req: true, hint: "The date the cost is booked." })}
  ${this.field("Notes", this.input("notes", run.notes || "", locked ? "disabled" : ""))}
</div>
<div id="prSheet" class="mt"></div>
<div class="pr-foot"><div id="prAdd"></div><div class="pr-totals" id="prTotals"></div></div>
${locked ? "" : `<p class="hint">Unpaid leave is worked out as fixed pay ÷ ${div()} × days${hrPay ? "; unpaid days are filled in from HR (approved unpaid leave and days absent)" : ""}. Commission is filled in for employees linked to a user, from that user's ${"invoices"}; you can change it.</p>`}`,
            { canDelete: !!editing && canEdit && run.status === "draft", extraActions: actions });
        if (locked) { const sv = $("#finSave"); if (sv) sv.hidden = true; }
        draw();
        const f = $("#finForm");
        f.period.addEventListener("change", async () => {
            run.period = f.period.value;
            if (typeof HR !== "undefined" && HR.payrollFigures && /^\d{4}-\d{2}$/.test(run.period)) { hrPay = await HR.payrollFigures(run.period); if (hrPay) run.payDivisor = hrPay.divisor; }   // HR:
            if (!editing || !run.lines.length) { f.date.value = monthEnd(run.period); rows = this.employees().filter(e => !e.joined || e.joined <= monthEnd(run.period)).map(fromEmployee); draw(); }
            else draw();   // HR: refresh the HR notes
        });
        const save = async (status, extra = {}) => {
            const d = this.readForm(f);
            if (!locked) { run.period = d.period; run.date = d.date; run.notes = d.notes; }
            if (!/^\d{4}-\d{2}$/.test(run.period)) return this.formError("Choose the month.");
            const clash = (Server.fin.payrun || []).find(x => x.id !== run.id && x.period === run.period);
            if (clash && !run._clashOk) {
                const go = await confirmDialog(`There is already a pay run for ${this.periodLabel(run.period)} (${clash.number}). Make another one anyway, for example for commissions or a bonus?`, "Make another", false, "Second pay run");
                if (!go) return null;
                run._clashOk = true;
            }
            const lines = locked ? run.lines : toLines();
            const bad = lines.find(l => calc(rowFrom(l)).net < 0);
            if (bad) return this.formError(`Deductions on ${bad.name}'s payslip are more than the pay.`);
            const obj = { ...run, ...extra, status, lines };
            delete obj._clashOk;
            const saved = await this.saveRecord("payrun", obj, { label: status === "draft" ? "Saved pay run" : status === "approved" ? "Approved pay run" : "Paid pay run" });
            if (saved) { location.hash = `#finance/payrun/${saved.id}`; if (editing) { this._formOpen = false; this.formPayrun(saved.id); } }
            return saved;
        };
        this.bindForm(() => save(run.status === "draft" ? "draft" : run.status), { cancel: "#finance/payruns", onDelete: () => this.deleteRecord("payrun", run, `pay run ${run.number || ""}`, "#finance/payruns") });
        $("#prApprove")?.addEventListener("click", async () => {
            if (!rows.length) return this.formError("Add at least one employee before approving.");
            if (await confirmDialog(`Approve the ${this.periodLabel(run.period)} pay run? It books the salary cost and what each employee is owed in the accounts.`, "Approve", false, "Approve pay run")) save("approved");
        });
        $("#prReopen")?.addEventListener("click", async () => { if (await confirmDialog("Take this pay run back to draft? Its entries are removed from the accounts until you approve it again.", "Back to draft", true, "Back to draft")) save("draft"); });
        $("#prUnpay")?.addEventListener("click", async () => { if (await confirmDialog("Undo the salary payment? The pay run goes back to approved and the bank entry is removed.", "Undo payment", true, "Undo payment")) save("approved"); });
        $("#prPay")?.addEventListener("click", async () => {
            const banks = this.accounts().filter(a => !a.archived && (a.currency || "AED") === "AED" && (a.subtype === "bank" || a.subtype === "cash" || a.role === "director"));
            const r = await openDialog({ title: "Record salary payment", body: `<div class="form-grid"><div class="field"><label for="pp1">Paid on</label><input id="pp1" name="date" type="date" value="${today}"></div><div class="field"><label for="pp2">Paid from</label><select id="pp2" name="accountId">${banks.map(a => `<option value="${a.id}">${esc(this.accountLabel(a))}</option>`).join("")}</select></div></div><p class="hint">AED ${fmt(run.totals?.net)} net pay to ${run.lines.length} employee${run.lines.length === 1 ? "" : "s"}. Each employee's net pay is cleared from “Salaries and wages payable”.</p>`, actions: [{ label: "Cancel", value: "cancel" }, { label: "Record payment", value: "ok", primary: true }] });
            if (r.value !== "ok") return;
            save("paid", { payment: { date: r.data.date, accountId: r.data.accountId } });
        });
        $("#prSlips")?.addEventListener("click", () => this.printSlips(run, run.lines));
        $("#prWps")?.addEventListener("click", () => this.wpsFile(run));
    },

    /* ---------- Salary slips: one A4 page each, on the letterhead ---------- */
    printSlips(run, lines) {
        const s = Store.settings, c = s.company;
        const logo = s.brand?.logo ? `<img src="${esc(s.brand.logo)}" alt="" class="slip-logo">` : "";
        const slip = l => {
            const gross = (l.earnings || []).reduce((t, e) => t + num(e.amount), 0);
            const ded = (l.deductions || []).reduce((t, e) => t + num(e.amount), 0);
            const net = round(gross - ded, 2);
            const rowsE = (l.earnings || []).map(e => `<tr><td>${esc(e.label || this.EARN_LABEL[e.type] || e.type)}</td><td class="num">${fmt(e.amount)}</td></tr>`).join("");
            const rowsD = (l.deductions || []).map(e => `<tr><td>${esc(e.label || this.DED_LABEL[e.type] || e.type)}</td><td class="num">${fmt(e.amount)}</td></tr>`).join("") || `<tr><td class="muted">None</td><td></td></tr>`;
            const mask = v => v && v.length > 8 ? v.slice(0, 4) + " •••• " + v.slice(-4) : v || "";
            return `<section class="slip">
<header class="slip-head"><div>${logo}<div class="slip-co">${esc(c.name)}</div><div class="slip-small">${esc(c.address || "").replace(/\n/g, "<br>")}</div></div>
<div class="slip-title"><h1>Salary slip</h1><div class="slip-small">${this.periodLabel(run.period)}<br>${esc(run.number || "")}</div></div></header>
<table class="slip-meta"><tr><th>Employee</th><td>${esc(l.name)}</td><th>Employee no.</th><td>${esc(l.code || "—")}</td></tr>
<tr><th>Designation</th><td>${esc(l.designation || "—")}</td><th>Department</th><td>${esc(l.department || "—")}</td></tr>
<tr><th>Pay date</th><td>${run.payments?.length ? run.payments.map(x => fmtDate(x.date)).filter((v, i, a) => a.indexOf(v) === i).join(", ") : fmtDate(run.status === "paid" ? run.payment?.date : run.date)}</td><th>Days paid</th><td>${(num(run.payDivisor) || 30) - num(l.unpaidDays)} of ${num(run.payDivisor) || 30}</td></tr>
<tr><th>Bank</th><td>${esc(l.bankName || "—")}</td><th>IBAN</th><td>${esc(mask(l.iban)) || "—"}</td></tr></table>
<div class="slip-cols"><table class="slip-t"><thead><tr><th>Earnings</th><th class="num">AED</th></tr></thead><tbody>${rowsE}</tbody><tfoot><tr><td>Gross pay</td><td class="num">${fmt(gross)}</td></tr></tfoot></table>
<table class="slip-t"><thead><tr><th>Deductions</th><th class="num">AED</th></tr></thead><tbody>${rowsD}</tbody><tfoot><tr><td>Total deductions</td><td class="num">${fmt(ded)}</td></tr></tfoot></table></div>
<div class="slip-net"><div><span>Net pay</span><b>AED ${fmt(net)}</b></div><div class="slip-words">${esc(amountToWords(net, "AED"))}</div></div>
${l.commissionNote ? `<p class="slip-small">Commission: ${esc(l.commissionNote)}.</p>` : ""}
<footer class="slip-sign"><div><span></span>For ${esc(c.name)}</div><div><span></span>Received by ${esc(l.name)}</div></footer>
<p class="slip-small slip-note">This salary slip is confidential. It was generated by EVAM Books${run.status === "draft" ? " from a draft pay run that has not been approved" : ""}.</p>
</section>`;
        };
        $("#printRoot").innerHTML = `<div class="report-print slips">${lines.map(slip).join("")}</div>`;
        document.body.classList.add("printing", "printing-report");
        App._titleBeforePrint = document.title;
        document.title = `Salary slip${lines.length > 1 ? "s" : ""} ${this.periodLabel(run.period)}${lines.length === 1 ? " · " + lines[0].name : ""}`;
        const done = () => { document.body.classList.remove("printing-report"); window.removeEventListener("afterprint", done); };
        window.addEventListener("afterprint", done);
        setTimeout(() => window.print(), 50);
    },

    /* ---------- WPS salary information file (UAE) ---------- */
    async wpsFile(run) {
        const r = await openDialog({
            title: "WPS salary file (SIF)",
            body: `<div class="form-grid"><div class="field"><label for="w1">Employer ID (MOHRE establishment no.)</label><input id="w1" name="employer" value="${esc(Store.settings.finance?.wps?.employer || "")}" placeholder="13 digits"></div>
<div class="field"><label for="w2">Your bank's routing code</label><input id="w2" name="routing" value="${esc(Store.settings.finance?.wps?.routing || "")}" placeholder="9 digits"></div></div>
<p class="hint">Creates the .SIF file your bank or exchange house uploads to the Wages Protection System. Each employee needs a labour card / person ID, IBAN and routing code on their record.</p>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: "Download", value: "ok", primary: true }]
        });
        if (r.value !== "ok") return;
        const emp = String(r.data.employer || "").trim(), rc = String(r.data.routing || "").trim();
        if (!/^\d{13}$/.test(emp)) { toast("Enter the 13-digit employer ID.", "warn"); return; }
        if (!/^\d{9}$/.test(rc)) { toast("Enter your bank's 9-digit routing code.", "warn"); return; }
        const miss = run.lines.filter(l => !/^\d{14}$/.test(String(l.personId || "")) || !l.iban || !/^\d{9}$/.test(String(l.routingCode || "")));
        if (miss.length) { toast(`Add the person ID (14 digits), IBAN and routing code for: ${miss.map(l => l.name).join(", ")}.`, "warn", 9000); return; }
        const [y, m] = run.period.split("-");
        const start = `${run.period}-01`, end = new Date(Date.UTC(Number(y), Number(m), 0)).toISOString().slice(0, 10);
        const fixedTypes = new Set(["basic", "housing", "transport", "allowance"]);
        const edr = run.lines.map(l => {
            const fixed = (l.earnings || []).filter(e => fixedTypes.has(e.type)).reduce((s, e) => s + num(e.amount), 0) - (l.deductions || []).filter(d => d.type !== "advance").reduce((s, d) => s + num(d.amount), 0);
            const variable = num(l.net) - fixed;
            return ["EDR", l.personId, l.routingCode, l.iban, start, end, Math.round(30 - num(l.unpaidDays)), round(Math.max(0, fixed), 2).toFixed(2), round(Math.max(0, variable), 2).toFixed(2), Math.round(num(l.unpaidDays))].join(",");
        });
        const now = new Date();
        const total = run.lines.reduce((s, l) => s + num(l.net), 0);
        const scr = ["SCR", emp, rc, now.toISOString().slice(0, 10), `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`, `${m}${y}`, run.lines.length, round(total, 2).toFixed(2), "AED", run.number || ""].join(",");
        download(`${emp}${now.toISOString().slice(2, 10).replace(/-/g, "")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}.SIF`, [...edr, scr].join("\r\n"), "text/plain");
        const fin = Store.settings.finance = Store.settings.finance || {};
        if (Server.can("settings") && (fin.wps?.employer !== emp || fin.wps?.routing !== rc)) { fin.wps = { employer: emp, routing: rc }; Store.save(); }
        toast("WPS file downloaded.", "good");
    }
});

/* Statement and payroll reports plug into the report screen */
(function () {
    const orig = Finance.renderReport;
    Finance.renderReport = function (name, d) {
        if (name === "customer_statement") return this.renderStatement(d);
        if (name === "payroll_summary") {
            const top = `<div class="rp-top"><div class="rp-co">${esc(Store.settings.company.name)}</div><h2 class="rp-title">Payroll summary</h2><div class="rp-period">${fmtDateLong(d.from)} – ${fmtDateLong(d.to)}</div></div>`;
            return top + (d.rows.length ? `<table class="rp-table"><thead><tr><th>Employee</th><th class="num">Months</th><th class="num">Basic</th><th class="num">Allowances</th><th class="num">Commission & bonus</th><th class="num">Other</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net paid</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.name)}<div class="small muted">${esc(r.designation || "")}</div></td><td class="num">${r.runs}</td><td class="num">${fmt(r.basic)}</td><td class="num">${fmt(r.allowances)}</td><td class="num">${fmt(r.commission)}</td><td class="num">${fmt(r.other)}</td><td class="num">${fmt(r.gross)}</td><td class="num">${fmt(r.deductions)}</td><td class="num"><b>${fmt(r.net)}</b></td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td colspan="2">Total</td><td class="num">${fmt(d.totals.basic)}</td><td class="num">${fmt(d.totals.allowances)}</td><td class="num">${fmt(d.totals.commission)}</td><td class="num">${fmt(d.totals.other)}</td><td class="num">${fmt(d.totals.gross)}</td><td class="num">${fmt(d.totals.deductions)}</td><td class="num">${fmt(d.totals.net)}</td></tr></tfoot></table><p class="rp-note">${esc(d.note)}</p>` : `<p class="muted">No approved pay runs in this period.</p>`);
        }
        if (name === "employee_balances") {
            const top = `<div class="rp-top"><div class="rp-co">${esc(Store.settings.company.name)}</div><h2 class="rp-title">Employee balances</h2><div class="rp-period">As of ${fmtDateLong(d.asOf)}</div></div>`;
            return top + (d.rows.length ? `<table class="rp-table"><thead><tr><th>Employee</th><th class="num">Advance to recover</th><th class="num">Pay not yet paid</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.contact)}</td><td class="num">${fmt(r.advance)}</td><td class="num">${fmt(r.unpaid)}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td><td class="num">${fmt(d.totals.advance)}</td><td class="num">${fmt(d.totals.unpaid)}</td></tr></tfoot></table><p class="rp-note">${esc(d.note)}</p>` : `<p class="muted">No advances or unpaid salaries.</p>`);
        }
        return orig.call(this, name, d);
    };
    Finance.REPORT_LIST.push({ group: "Payroll", items: [["payroll_summary", "Payroll summary", "Pay per employee for a period"], ["employee_balances", "Employee balances", "Advances to recover and pay still owed"]] });
    const receivables = Finance.REPORT_LIST.find(g => g.group === "Receivables");
    const cs = receivables && receivables.items.find(i => i[0] === "customer_statement");
    if (cs) cs[2] = "Everything with one customer and what they still owe — to send them";
})();
