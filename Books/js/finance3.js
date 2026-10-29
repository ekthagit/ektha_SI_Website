/* EVAM Books — banking, reports, finance settings, administration */
Object.assign(Finance, {

    /* ==========================================================
       BANKING
       ========================================================== */
    async pageBanking() {
        const main = $("#finMain");
        main.innerHTML = this.head("Bank accounts", "Import statements, match them to your records and reconcile.", Server.can("banking") ? `${this.link("New transfer", "#finance/transfer/new", "btn-ghost", "swap")}${this.link("Add bank account", "#finance/account/new?bank=1")}` : "") + `<div class="fin-loading">Loading…</div>`;
        let bals;
        try { bals = (await Server.get("bank/balances")).accounts; } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        if (this.sub !== "banking") return;
        const byId = new Map(bals.map(b => [b.id, b]));
        const list = this.bankAccounts();
        $(".fin-loading", main).outerHTML = `<div class="bank-cards">${list.map(a => {
            const b = byId.get(a.id) || {};
            const diff = b.statementBalance !== null && b.statementBalance !== undefined ? round(b.statementBalance - b.balance, 2) : null;
            return `<a class="bank-card" href="#finance/bank/${a.id}">
  <div class="bc-top"><span class="bc-name">${esc(a.name)}</span><span class="pill pill-neutral">${esc(a.currency || "AED")}</span></div>
  <div class="bc-bal"><span class="ls-cur">${esc(a.currency || "AED")}</span>${fmt(b.balance || 0, a.currency)}</div>
  <div class="bc-note">In the books${a.currency !== "AED" ? ` · AED ${fmt(b.base || 0)}` : ""}</div>
  ${b.statementBalance !== null && b.statementBalance !== undefined ? `<div class="bc-note">Statement ${fmt(b.statementBalance, a.currency)} on ${fmtDate(b.statementDate)}${diff ? ` · <span class="warn-text">differs by ${fmt(diff, a.currency)}</span>` : ""}</div>` : `<div class="bc-note muted">No statement imported yet</div>`}
  ${b.unmatched ? `<div class="bc-todo">${b.unmatched} line${b.unmatched === 1 ? "" : "s"} to review</div>` : ""}
</a>`;
        }).join("")}</div>`;
    },

    async pageBankAccount(id, sub) {
        const a = this.acc(id);
        const main = $("#finMain");
        if (!a) { main.innerHTML = `<div class="empty"><h2>Bank account not found</h2></div>`; return; }
        if (sub === "reconcile") return this.pageReconcile(a);
        const tab = this.params.get("tab") || "new";
        const canEdit = Server.can("banking");
        main.innerHTML = this.head(esc(a.name), `${esc(a.currency || "AED")} account · ${esc(a.code || "")}`, canEdit ? `
            <button type="button" class="btn btn-ghost" id="bkRules">${icon("refresh")}<span>Apply rules</span></button>
            <a class="btn btn-ghost" href="#finance/bank/${a.id}/reconcile">${icon("check")}<span>Reconcile</span></a>
            <button type="button" class="btn btn-primary" id="bkImport">${icon("upload")}<span>Import statement</span></button>` : "") + `
<div class="tabs" role="tablist">${[["new", "For review"], ["matched", "Matched"], ["categorized", "Categorised"], ["excluded", "Excluded"], ["all", "All"]].map(([k, l]) => `<a role="tab" href="#finance/bank/${a.id}?tab=${k}" class="${k === tab ? "on" : ""}" aria-selected="${k === tab}">${l}</a>`).join("")}</div>
<div id="bkList" class="fin-loading">Loading…</div>`;
        $("#bkImport")?.addEventListener("click", () => this.importDialog(a));
        $("#bkRules")?.addEventListener("click", async () => { try { const r = await Server.post(`bank/accounts/${a.id}/rules`); await Server.poll(); toast(`Rules applied: ${r.auto} categorised, ${r.suggested} suggested.`, "good"); this.pageBankAccount(id); } catch (e) { toast(e.message, "bad"); } });
        let txns;
        try { txns = (await Server.get(`bank/accounts/${a.id}/txns?status=${tab}`)).txns; } catch (e) { $("#bkList").textContent = e.message; return; }
        if (!this.sub.startsWith("bank/" + id)) return;
        this._txns = txns;
        const host = $("#bkList");
        host.classList.remove("fin-loading");
        if (!txns.length) {
            host.innerHTML = this.emptyCard(tab === "new" ? "Nothing to review. Import a statement to bring in new bank lines." : "No bank lines here.");
            return;
        }
        host.innerHTML = `<div class="table-card"><table class="dtable fin-table bank-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Money in</th><th class="num">Money out</th><th>${tab === "new" ? "Suggestion" : "In the books"}</th><th></th></tr></thead><tbody>${txns.map(t => `
<tr data-txn="${t.id}">
  <td>${fmtDate(t.date)}</td>
  <td class="who"><div>${esc(t.description || "")}</div>${t.reference ? `<div class="small muted">${esc(t.reference)}</div>` : ""}</td>
  <td class="num">${t.amount > 0 ? fmt(t.amount, a.currency) : ""}</td>
  <td class="num">${t.amount < 0 ? fmt(-t.amount, a.currency) : ""}</td>
  <td>${t.status === "new" ? (t.suggestion ? `<span class="pill pill-info" title="From rule ${esc(t.suggestion.ruleName || "")}">${esc(this.accountName(t.suggestion.accountId))}</span>` : '<span class="muted">—</span>') : t.status === "excluded" ? '<span class="pill pill-mute">Excluded</span>' : `<span class="pill pill-good">${esc(this.linkLabel(t))}</span>${t.reconciliation_id ? ' <span class="pill pill-neutral">Reconciled</span>' : ""}`}</td>
  <td class="act">${canEdit ? (t.status === "new" ? `<button type="button" class="btn btn-quiet btn-sm" data-review="${t.id}">Review</button>` : t.reconciliation_id ? "" : `<button type="button" class="link-btn" data-undo="${t.id}">${t.status === "excluded" ? "Restore" : "Undo"}</button>`) : ""}</td>
</tr>`).join("")}</tbody></table></div>`;
        $$("[data-review]", host).forEach(b => b.addEventListener("click", () => this.reviewTxn(a, txns.find(t => t.id === b.dataset.review), b.closest("tr"))));
        $$("[data-undo]", host).forEach(b => b.addEventListener("click", async () => {
            const t = txns.find(x => x.id === b.dataset.undo);
            try {
                if (t.status === "excluded") await Server.post(`bank/txns/${t.id}/exclude`, { excluded: false });
                else {
                    if (t.link_kind === "bankEntry" && !await confirmDialog("Undo this categorisation? The entry it created in the books is deleted.", "Undo", true, "Undo")) return;
                    await Server.post(`bank/txns/${t.id}/unmatch`);
                }
                await Server.poll();
                this.pageBankAccount(id);
            } catch (e) { toast(e.message, "bad", 6000); }
        }));
    },
    linkLabel(t) {
        const kinds = { payment: "Payment received", billPayment: "Payment made", expense: "Expense", transfer: "Transfer", bankEntry: "Categorised", journal: "Journal" };
        const o = (Server.fin[t.link_kind] || []).find(x => x.id === t.link_id);
        if (t.link_kind === "bankEntry" && o) return this.accountName(o.accountId) || "Categorised";
        return `${kinds[t.link_kind] || t.link_kind}${o?.number ? " " + o.number : ""}`;
    },

    /* Review one bank line: match, categorise, record a payment, transfer or exclude */
    async reviewTxn(a, t, tr) {
        $$(".review-row").forEach(r => r.remove());
        const row = document.createElement("tr");
        row.className = "review-row";
        row.innerHTML = `<td colspan="6"><div class="review fin-loading">Looking for matches…</div></td>`;
        tr.after(row);
        let s;
        try { s = await Server.get(`bank/txns/${t.id}/suggestions`); } catch (e) { $(".review", row).textContent = e.message; return; }
        const box = $(".review", row);
        box.classList.remove("fin-loading");
        const isIn = t.amount > 0;
        const cats = this.accountOptions(x => x.type === "income" || x.type === "expense" || x.type === "equity" || (x.type === "liability" && x.subtype !== "payable") || (x.type === "asset" && !["bank", "cash", "receivable"].includes(x.subtype)));
        const sug = t.suggestion || {};
        const amt = Math.abs(t.amount);
        box.innerHTML = `
<div class="review-tabs" role="tablist">
  <button type="button" data-rt="match" class="${s.matches.length ? "on" : ""}">Match${s.matches.length ? ` (${s.matches.length})` : ""}</button>
  <button type="button" data-rt="cat" class="${s.matches.length ? "" : "on"}">Categorise</button>
  <button type="button" data-rt="pay">${isIn ? "Customer payment" : "Pay a bill"}${s.open.length ? ` (${s.open.length})` : ""}</button>
  <button type="button" data-rt="trf">Transfer</button>
  <button type="button" data-rt="exc">Exclude</button>
</div>
<div class="review-pane" data-pane="match"${s.matches.length ? "" : " hidden"}>
  ${s.matches.length ? `<p class="hint">Records already in the books for ${esc(a.currency)} ${fmt(amt, a.currency)} within 15 days:</p><ul class="match-list">${s.matches.map(m => `<li><span><b>${esc(this.linkLabel({ link_kind: m.kind, link_id: m.id }))}</b> · ${fmtDate(m.date)} · ${esc(m.contact || m.memo || "")}</span><button type="button" class="btn btn-primary btn-sm" data-match="${m.kind}|${m.id}">Match</button></li>`).join("")}</ul>` : `<p class="muted">No record in the books has this amount and date. Categorise it or record the payment instead.</p>`}
</div>
<div class="review-pane" data-pane="cat"${s.matches.length ? " hidden" : ""}>
  <div class="grid-3">
    ${this.field("Category", this.select("cAccount", [["", "Choose…"], ...cats], sug.accountId || ""), { req: true })}
    ${this.field("VAT % included", this.input("cVat", sug.vatRate ?? 0, 'type="number" step="any"'), { hint: "Part of the amount that is VAT, e.g. 5." })}
    ${this.field(isIn ? "Received from" : "Paid to", this.input("cContact", sug.contactName || "", `list="${isIn ? "rvCust" : "rvVend"}"`))}
    ${this.field("Description", this.input("cMemo", sug.memo || t.description || ""), { cls: "span-2" })}
    <label class="check"><input type="checkbox" name="cRule"><span class="check-box">${icon("check", 12)}</span><span class="check-text">Create a rule<small>Categorise lines like this automatically next time.</small></span></label>
  </div>
  ${this.datalist("rvCust", this.customers())}${this.datalist("rvVend", this.vendors())}
  <div class="row-actions"><button type="button" class="btn btn-primary btn-sm" id="doCat">Categorise</button></div>
</div>
<div class="review-pane" data-pane="pay" hidden>
  ${s.open.length ? `<p class="hint">Open ${isIn ? "invoices" : "bills"} for exactly ${esc(a.currency)} ${fmt(amt, a.currency)}:</p><ul class="match-list">${s.open.map(o => `<li><span><b>${esc(o.number)}</b> · ${esc(o.contact)} · due ${fmtDate(o.due)}</span><button type="button" class="btn btn-primary btn-sm" data-pay="${o.id}">Record payment</button></li>`).join("")}</ul>` : `<p class="muted">No open ${isIn ? "invoice" : "bill"} has exactly this amount.</p>`}
  <button type="button" class="btn btn-ghost btn-sm" id="payOther">${isIn ? "Record a payment from a customer…" : "Record a payment to a vendor…"}</button>
</div>
<div class="review-pane" data-pane="trf" hidden><p class="hint">Money moved ${isIn ? "in from" : "out to"} another of your own accounts.</p><button type="button" class="btn btn-primary btn-sm" id="doTrf">Record as transfer…</button></div>
<div class="review-pane" data-pane="exc" hidden><p class="hint">Exclude lines that aren't real transactions, such as duplicates or balance lines. They stay on the list but don't affect the books.</p><button type="button" class="btn btn-ghost btn-sm" id="doExc">Exclude this line</button></div>
<div class="auth-msg" id="rvMsg" hidden></div>`;
        const msg = m => { const el = $("#rvMsg", box); el.hidden = !m; el.textContent = m || ""; };
        $$(".review-tabs button", box).forEach(b => b.addEventListener("click", () => {
            $$(".review-tabs button", box).forEach(x => x.classList.toggle("on", x === b));
            $$(".review-pane", box).forEach(p => { p.hidden = p.dataset.pane !== b.dataset.rt; });
        }));
        const after = async (text) => { await Server.poll(); toast(text, "good"); this.pageBankAccount(a.id); };
        $$("[data-match]", box).forEach(b => b.addEventListener("click", async () => {
            const [kind, id] = b.dataset.match.split("|");
            try { await Server.post(`bank/txns/${t.id}/match`, { kind, id }); await after("Matched."); } catch (e) { msg(e.message); }
        }));
        $("#doCat", box).addEventListener("click", async () => {
            const g = n => $(`[name=${n}]`, box);
            if (!g("cAccount").value) return msg("Choose a category.");
            try {
                await Server.save("bankEntry", { id: uid("be"), date: t.date, bankAccountId: a.id, amount: t.amount, accountId: g("cAccount").value, vatRate: num(g("cVat").value), contactName: g("cContact").value, memo: g("cMemo").value, bankTxnId: t.id });
                const words = String(t.description || "").replace(/[0-9/#:.,-]+/g, " ").trim().split(/\s+/).filter(w => w.length > 1).slice(0, 3).join(" ");
                const exists = (Server.fin.rule || []).some(r => (r.conditions || []).some(c => c.value && c.value.toLowerCase() === words.toLowerCase()));
                if (g("cRule").checked && words && !exists) {
                    await Server.save("rule", { id: uid("rule"), name: words || "New rule", accountId: a.id, direction: isIn ? "in" : "out", match: "all", conditions: [{ field: "description", op: "contains", value: words }], targetAccount: g("cAccount").value, vatRate: num(g("cVat").value), contactName: g("cContact").value, auto: false, priority: 10, active: true });
                    toast(`Rule "${words}" created. Review it in Bank rules.`, "good", 6000);
                }
                await after("Categorised.");
            } catch (e) { msg(e.message); }
        });
        $$("[data-pay]", box).forEach(b => b.addEventListener("click", () => this.payFromTxn(a, t, b.dataset.pay)));
        $("#payOther", box).addEventListener("click", () => this.payFromTxn(a, t, null));
        $("#doTrf", box).addEventListener("click", () => { location.hash = `#finance/transfer/new?txn=${t.id}&account=${a.id}&amount=${t.amount}`; });
        $("#doExc", box).addEventListener("click", async () => { try { await Server.post(`bank/txns/${t.id}/exclude`, { excluded: true }); await after("Excluded."); } catch (e) { msg(e.message); } });
    },
    /* Record a payment straight from a bank line; it is linked to the line when saved */
    payFromTxn(a, t, targetId) {
        const isIn = t.amount > 0;
        const amt = Math.abs(t.amount);
        if (isIn) {
            const inv = targetId ? Store.getDoc(targetId) : null;
            const rate = a.currency === "AED" ? 1 : this.rateFor(a.currency);
            const p = { id: uid("pay"), date: t.date, contactName: inv?.party?.name || "", currency: a.currency || "AED", rate, amount: amt, bankCharges: 0, accountId: a.id, method: "Bank transfer", reference: t.reference || t.description, allocations: inv ? [{ docId: inv.id, amount: Math.min(amt, invoiceBalance(inv)) }] : [], bankTxnId: t.id };
            this._prefill = p;
            location.hash = `#finance/payment/new?prefill=1&back=${encodeURIComponent("#finance/bank/" + a.id)}`;
        } else {
            const bill = targetId ? (Server.fin.bill || []).find(b => b.id === targetId) : null;
            const p = { id: uid("bp"), date: t.date, vendorName: bill?.vendorName || "", currency: a.currency || "AED", rate: a.currency === "AED" ? 1 : this.rateFor(a.currency), amount: amt, bankCharges: 0, accountId: a.id, method: "Bank transfer", reference: t.reference || t.description, allocations: bill ? [{ billId: bill.id, amount: Math.min(amt, this.billBalance(bill)) }] : [], bankTxnId: t.id };
            this._prefill = p;
            location.hash = `#finance/bill-payment/new?prefill=1&back=${encodeURIComponent("#finance/bank/" + a.id)}`;
        }
    },

    /* ---------- Statement import (CSV / Excel) ---------- */
    async importDialog(a) {
        const r = openDialog({
            title: `Import statement into ${a.name}`, wide: true,
            body: `<p class="dialog-text">Download the statement from your bank as CSV or Excel (XLSX), then choose it here. Lines already imported are skipped automatically.</p>
<label class="btn btn-ghost"><span>Choose file…</span><input type="file" id="stmtFile" accept=".csv,.txt,.xlsx,.xls,text/csv" hidden></label> <span id="stmtName" class="muted"></span>
<div id="stmtMap"></div>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: "Import", value: "ok", primary: true }]
        });
        const okBtn = $("#dialog .dialog-actions .btn-primary"); okBtn.disabled = true;
        let parsed = null;
        $("#stmtFile").addEventListener("change", async e => {
            const file = e.target.files[0]; if (!file) return;
            $("#stmtName").textContent = file.name;
            try {
                const rows = /\.xlsx?$/i.test(file.name) ? await this.readXlsx(file) : parseCSV(await file.text());
                parsed = this.mapStatement(rows, a);
                okBtn.disabled = !parsed;
            } catch (err) { $("#stmtMap").innerHTML = `<p class="bad-text">${esc(err.message)}</p>`; }
        });
        const res = await r;
        if (res.value !== "ok" || !parsed) return;
        const out = parsed();
        if (!out.length) { toast("No usable lines found. Check the column choices.", "warn"); return; }
        try {
            const rep = await Server.post(`bank/accounts/${a.id}/import`, { rows: out });
            await Server.poll();
            toast(`Imported ${rep.added} line${rep.added === 1 ? "" : "s"}${rep.duplicates ? `, skipped ${rep.duplicates} already imported` : ""}${rep.invalid ? `, ${rep.invalid} without a date or amount` : ""}${rep.auto ? `. ${rep.auto} categorised by rules` : ""}.`, "good", 8000);
            this.pageBankAccount(a.id);
        } catch (e) { toast(e.message, "bad", 8000); }
    },
    async readXlsx(file) {
        if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the Excel reader. Save the statement as CSV instead.")); document.head.appendChild(s); });
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    },
    /* Lets the user pick which column is which; returns a function producing the rows to send */
    mapStatement(rows, a) {
        rows = rows.filter(r => r.some(c => String(c).trim()));
        if (rows.length < 2) throw new Error("The file has no lines.");
        // The header is the first row with a "date" column
        let h = rows.findIndex(r => r.some(c => /date/i.test(c)));
        if (h < 0) h = 0;
        const head = rows[h].map((c, i) => String(c).trim() || `Column ${i + 1}`);
        const body = rows.slice(h + 1);
        const guess = re => head.findIndex(c => re.test(c));
        const cols = head.map((c, i) => [String(i), c]);
        const none = [["", "—"]];
        const dateCol = guess(/date/i);
        const debit = guess(/debit|withdraw|money out|paid out/i), credit = guess(/credit|deposit|money in|paid in/i);
        const amountCol = guess(/^amount|amount$|transaction amount/i);
        // Description: prefer a real description column over "Transaction date"
        const descCol = [/desc/i, /narr/i, /details|particular/i, /memo|remark/i, /^transaction$|transaction (type|info)/i]
            .map(re => head.findIndex((c, i) => re.test(c) && i !== dateCol)).find(i => i > -1) ?? head.findIndex((c, i) => i !== dateCol && !/amount|debit|credit|balance/i.test(c));
        const refCol = guess(/ref|cheque/i), balCol = guess(/balance/i);
        const sample = body.slice(0, 5).map(r => r[dateCol]).join(" ");
        const fmtGuess = /\b\d{4}-\d{2}-\d{2}/.test(sample) ? "ymd" : /\b(1[3-9]|2\d|3[01])[/.-]\d{1,2}[/.-]\d{2,4}/.test(sample) ? "dmy" : /\b\d{1,2}[/.-](1[3-9]|2\d|3[01])[/.-]\d{2,4}/.test(sample) ? "mdy" : /[A-Za-z]{3}/.test(sample) ? "text" : "dmy";
        $("#stmtMap").innerHTML = `
<div class="grid-3 mt">
  ${this.field("Date column", this.select("mDate", cols, dateCol))}
  ${this.field("Date format", this.select("mFmt", [["dmy", "31/12/2026 (day first)"], ["mdy", "12/31/2026 (month first)"], ["ymd", "2026-12-31"], ["text", "31 Dec 2026"]], fmtGuess))}
  ${this.field("Description column", this.select("mDesc", cols, descCol))}
  ${this.field("Amounts are in", this.select("mMode", [["split", "Two columns: money in / money out"], ["single", "One column (+ in, − out)"]], debit > -1 && credit > -1 ? "split" : "single"))}
  <div data-m="single">${this.field("Amount column", this.select("mAmt", cols, amountCol > -1 ? amountCol : credit))}</div>
  <div data-m="split">${this.field("Money in column", this.select("mIn", cols, credit))}</div>
  <div data-m="split">${this.field("Money out column", this.select("mOut", cols, debit))}</div>
  ${this.field("Reference column", this.select("mRef", [...none, ...cols], refCol > -1 ? refCol : ""))}
  ${this.field("Balance column", this.select("mBal", [...none, ...cols], balCol > -1 ? balCol : ""))}
</div>
<div class="sub-title">Preview</div><div id="stmtPreview" class="stmt-preview"></div>`;
        const g = n => $(`[name=${n}]`, $("#stmtMap")).value;
        const toNum = v => { let s = String(v ?? "").trim(); if (!s) return 0; const neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /\bDR\b/i.test(s); s = s.replace(/[^0-9.,-]/g, ""); if (/,\d{2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, "").replace(",", "."); s = s.replace(/,/g, ""); const n = parseFloat(s); return isFinite(n) ? (neg ? -Math.abs(n) : n) : 0; };
        const toDate = (v, f) => {
            const s = String(v || "").trim();
            if (!s) return "";
            const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            let y, m, d, mm;
            if ((mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) [, y, m, d] = mm;
            else if (f === "text" && (mm = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})/.exec(s))) { d = mm[1]; m = MON[mm[2].toLowerCase()]; y = mm[3]; }
            else if ((mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) { if (f === "mdy") [, m, d, y] = mm; else [, d, m, y] = mm; }
            else return "";
            y = String(y).length === 2 ? "20" + y : y;
            const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            return isNaN(Date.parse(iso)) ? "" : iso;
        };
        const build = () => body.map(r => {
            const amount = g("mMode") === "split" ? round(toNum(r[g("mIn")]) - Math.abs(toNum(r[g("mOut")])), 3) : toNum(r[g("mAmt")]);
            return { date: toDate(r[g("mDate")], g("mFmt")), description: String(r[g("mDesc")] ?? "").trim(), reference: g("mRef") === "" ? "" : String(r[g("mRef")] ?? "").trim(), amount, balance: g("mBal") === "" ? "" : toNum(r[g("mBal")]) };
        }).filter(x => x.date && x.amount);
        const preview = () => {
            $$("[data-m]", $("#stmtMap")).forEach(el => { el.hidden = el.dataset.m !== g("mMode"); });
            const out = build();
            const skipped = body.length - out.length;
            $("#stmtPreview").innerHTML = `<table class="dtable"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>${out.slice(0, 6).map(x => `<tr><td>${fmtDate(x.date)}</td><td class="who">${esc(x.description)}</td><td class="num ${x.amount < 0 ? "bad-text" : "good-text"}">${fmt(x.amount, a.currency)}</td><td class="num">${x.balance === "" ? "" : fmt(x.balance, a.currency)}</td></tr>`).join("")}</tbody></table>
                <p class="hint">${out.length} line${out.length === 1 ? "" : "s"} ready${skipped ? `, ${skipped} without a date or amount will be skipped (e.g. opening balance rows)` : ""}. Money in: ${fmt(out.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0), a.currency)} · money out: ${fmt(-out.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0), a.currency)}.</p>`;
        };
        $$("select", $("#stmtMap")).forEach(s => s.addEventListener("change", preview));
        preview();
        return build;
    },

    /* ---------- Reconciliation ---------- */
    async pageReconcile(a) {
        const main = $("#finMain");
        main.innerHTML = this.head(`Reconcile ${esc(a.name)}`, "Tick the lines that appear on your bank statement. When the cleared balance equals the statement balance, the account is reconciled.") + `<div class="fin-loading">Loading…</div>`;
        let info;
        try { info = await Server.get(`bank/accounts/${a.id}/reconcile`); } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        const cur = a.currency || "AED";
        const opening = info.last ? num(info.last.closingBalance) : null;
        const picked = new Set(info.pending.map(t => t.id));
        main.innerHTML = this.head(`Reconcile ${esc(a.name)}`, info.last ? `Last reconciled to ${fmtDate(info.last.date)} with a balance of ${cur} ${fmt(info.last.closingBalance, cur)}.` : "First reconciliation of this account.", `<a class="btn btn-ghost" href="#finance/bank/${a.id}">Back to the account</a>`) + `
${info.unmatched ? `<p class="note-box">${info.unmatched} bank line${info.unmatched === 1 ? " is" : "s are"} not matched or categorised yet. <a href="#finance/bank/${a.id}">Review ${info.unmatched === 1 ? "it" : "them"}</a> first, or reconcile what is ready.</p>` : ""}
<form class="panel fin-form" id="recForm">
  <div class="grid-3">
    ${this.field("Statement end date", this.input("statementDate", info.pending.reduce((m, t) => (t.date > m ? t.date : m), this.today()), 'type="date"'))}
    ${opening === null ? this.field("Opening balance on the statement", this.input("openingBalance", 0, 'type="number" step="any"'), { hint: "The balance before the first line you reconcile." }) : this.field("Opening balance", `<div class="static">${cur} ${fmt(opening, cur)}</div>`)}
    ${this.field("Closing balance on the statement", this.input("closingBalance", "", 'type="number" step="any" required'))}
  </div>
  <div id="recList"></div>
  <div class="rec-sum" id="recSum"></div>
  <div class="auth-msg" id="finFormMsg" hidden></div>
  <div class="fin-form-actions"><span class="push"></span><button type="submit" class="btn btn-primary" id="recDo" disabled>${icon("check")}<span>Reconcile</span></button></div>
</form>
${info.history.length ? `<h2 class="fin-h2">Previous reconciliations</h2>` + this.table([
            { label: "Statement date", html: r => fmtDate(r.date) },
            { label: "Lines", num: true, html: r => num(r.count) },
            { label: "Closing balance", num: true, html: r => this.money(r.closingBalance, cur) },
            { label: "", html: (r, i) => r.id === info.history[0].id && Server.can("banking") ? `<button type="button" class="link-btn" data-undorec="${r.id}">Undo</button>` : "" }
        ], info.history) : ""}`;
        const f = $("#recForm");
        const draw = () => {
            const end = f.statementDate.value;
            const lines = info.pending.filter(t => t.date <= end);
            $("#recList").innerHTML = lines.length ? `<table class="dtable rec-table"><thead><tr><th><input type="checkbox" id="recAll" aria-label="Tick all" ${lines.every(t => picked.has(t.id)) ? "checked" : ""}></th><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Out</th></tr></thead><tbody>${lines.map(t => `<tr><td><input type="checkbox" data-t="${t.id}" ${picked.has(t.id) ? "checked" : ""} aria-label="Cleared"></td><td>${fmtDate(t.date)}</td><td class="who">${esc(t.description || "")}</td><td class="num">${t.amount > 0 ? fmt(t.amount, cur) : ""}</td><td class="num">${t.amount < 0 ? fmt(-t.amount, cur) : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No matched lines up to this date.</p>`;
            $$("[data-t]").forEach(c => c.addEventListener("change", () => { if (c.checked) picked.add(c.dataset.t); else picked.delete(c.dataset.t); sum(); }));
            $("#recAll")?.addEventListener("change", e => { lines.forEach(t => e.target.checked ? picked.add(t.id) : picked.delete(t.id)); draw(); });
            sum();
        };
        const sum = () => {
            const end = f.statementDate.value;
            const chosen = info.pending.filter(t => t.date <= end && picked.has(t.id));
            const open = opening === null ? num(f.openingBalance.value) : opening;
            const cleared = round(open + chosen.reduce((s, t) => s + t.amount, 0), 2);
            const closing = f.closingBalance.value === "" ? null : round(num(f.closingBalance.value), 2);
            const diff = closing === null ? null : round(closing - cleared, 2);
            $("#recSum").innerHTML = `<span>Opening <b>${fmt(open, cur)}</b></span><span>Cleared ${chosen.length} line${chosen.length === 1 ? "" : "s"} <b>${fmt(cleared - open, cur)}</b></span><span>Cleared balance <b>${fmt(cleared, cur)}</b></span><span>Statement <b>${closing === null ? "—" : fmt(closing, cur)}</b></span><span class="${diff === 0 ? "good-text" : "bad-text"}">${diff === null ? "" : diff === 0 ? "Difference 0.00 ✓" : `Difference ${fmt(diff, cur)}`}</span>`;
            $("#recDo").disabled = !(diff === 0 && chosen.length) || !Server.can("banking");
        };
        f.statementDate.addEventListener("change", draw);
        f.closingBalance.addEventListener("input", sum);
        f.openingBalance?.addEventListener("input", sum);
        draw();
        f.addEventListener("submit", async e => {
            e.preventDefault();
            const end = f.statementDate.value;
            try {
                await Server.post(`bank/accounts/${a.id}/reconcile`, { statementDate: end, openingBalance: f.openingBalance ? num(f.openingBalance.value) : undefined, closingBalance: num(f.closingBalance.value), txnIds: info.pending.filter(t => t.date <= end && picked.has(t.id)).map(t => t.id) });
                await Server.poll();
                toast(`${a.name} reconciled to ${fmtDate(end)}.`, "good");
                this.pageReconcile(a);
            } catch (err) { this.formError(err.message); }
        });
        $$("[data-undorec]").forEach(b => b.addEventListener("click", async () => {
            if (!await confirmDialog("Undo the most recent reconciliation? The lines become unreconciled again.", "Undo", true, "Undo reconciliation")) return;
            try { await Server.post(`bank/reconciliations/${b.dataset.undorec}/undo`); await Server.poll(); this.pageReconcile(a); } catch (e) { toast(e.message, "bad"); }
        }));
    },

    /* ---------- Bank rules ---------- */
    pageRules() {
        const list = (Server.fin.rule || []).slice().sort((a, b) => num(a.priority) - num(b.priority));
        $("#finMain").innerHTML = this.head("Bank rules", "Rules categorise imported bank lines by their description. Automatic rules post straight to the books; the others only suggest.", Server.can("banking") ? this.link("New rule", "#finance/rule/new") : "") +
            this.table([
                { label: "Order", num: true, html: r => num(r.priority) },
                { label: "Name", html: r => `<b>${esc(r.name)}</b>${r.active === false ? ' <span class="pill pill-mute">Off</span>' : ""}` },
                { label: "When", html: r => `${r.direction === "in" ? "Money in" : r.direction === "out" ? "Money out" : "Any line"}${r.accountId ? ` on ${esc(this.accountName(r.accountId))}` : ""} where ${(r.conditions || []).map(c => `${c.field || "description"} ${c.op === "equals" ? "is" : c.op === "starts" ? "starts with" : "contains"} “${esc(c.value)}”`).join(r.match === "any" ? " or " : " and ")}`, cls: "who" },
                { label: "Then", html: r => `${esc(this.accountName(r.targetAccount))}${num(r.vatRate) ? ` · VAT ${num(r.vatRate)}%` : ""}` },
                { label: "Mode", html: r => r.auto ? this.pill("good", "Automatic") : this.pill("info", "Suggest") }
            ], list, { empty: "No rules yet. Create one when you categorise a bank line, or here.", onRow: r => r.id });
        this.bindRows("#finance/rule/");
    },
    formRule(id) {
        const editing = id && id !== "new" ? (Server.fin.rule || []).find(r => r.id === id) : null;
        const r = editing ? JSON.parse(JSON.stringify(editing)) : { id: uid("rule"), name: "", accountId: "", direction: "out", match: "all", conditions: [{ field: "description", op: "contains", value: "" }], amountMin: "", amountMax: "", targetAccount: "", vatRate: 0, contactName: "", memo: "", auto: false, priority: (Server.fin.rule || []).length + 1, active: true };
        const canEdit = Server.can("banking");
        $("#finMain").innerHTML = this.formShell(editing ? `Rule: ${esc(r.name)}` : "New bank rule", "Rules are checked in order; the first that fits a line is used.", `
${canEdit ? "" : this.readonly()}
<div class="grid-3">
  ${this.field("Name", this.input("name", r.name, "required"), { req: true })}
  ${this.field("Bank account", this.select("accountId", [["", "Any bank account"], ...this.bankAccounts().map(a => [a.id, this.accountLabel(a)])], r.accountId))}
  ${this.field("Applies to", this.select("direction", [["out", "Money out"], ["in", "Money in"], ["any", "Both"]], r.direction))}
  ${this.field("Lines must match", this.select("match", [["all", "All conditions"], ["any", "Any condition"]], r.match))}
  ${this.field("Amount from", this.input("amountMin", r.amountMin, 'type="number" step="any"'))}
  ${this.field("Amount to", this.input("amountMax", r.amountMax, 'type="number" step="any"'))}
</div>
<div class="sub-title mt">Conditions</div><div id="ruleConds"></div>
<button type="button" class="btn btn-ghost btn-sm" id="addCond">${icon("plus", 14)}<span>Add condition</span></button>
<div class="sub-title mt">Then categorise as</div>
<div class="grid-3">
  ${this.field("Account", this.select("targetAccount", [["", "Choose…"], ...this.accountOptions(a => !["bank", "cash", "receivable", "payable"].includes(a.subtype))], r.targetAccount), { req: true })}
  ${this.field("VAT % included", this.input("vatRate", r.vatRate, 'type="number" step="any"'))}
  ${this.field("Contact", this.input("contactName", r.contactName, 'list="ruleContacts"'))}
  ${this.field("Description", this.input("memo", r.memo, 'placeholder="Empty = bank description"'))}
  ${this.field("Order", this.input("priority", r.priority, 'type="number" step="1"'))}
  <label class="check"><input type="checkbox" name="auto" ${r.auto ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Categorise automatically<small>Otherwise the rule only suggests, and you confirm.</small></span></label>
  <label class="check"><input type="checkbox" name="active" ${r.active !== false ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Rule is on</span></label>
</div>${this.datalist("ruleContacts", [...this.customers(), ...this.vendors()])}`, { canDelete: !!editing && canEdit });
        const draw = () => {
            $("#ruleConds").innerHTML = r.conditions.map((c, i) => `<div class="cond-row" data-i="${i}">${this.select("cf", [["description", "Description"], ["reference", "Reference"]], c.field, "data-skip")}${this.select("co", [["contains", "contains"], ["equals", "is exactly"], ["starts", "starts with"]], c.op, "data-skip")}<input data-skip class="cv" value="${esc(c.value)}" placeholder="e.g. DEWA" aria-label="Text"><button type="button" class="icon-btn" data-del="${i}" aria-label="Remove">${icon("x")}</button></div>`).join("");
            $$("#ruleConds .cond-row").forEach(row => {
                const c = r.conditions[Number(row.dataset.i)];
                $("[name=cf]", row).addEventListener("change", e => { c.field = e.target.value; });
                $("[name=co]", row).addEventListener("change", e => { c.op = e.target.value; });
                $(".cv", row).addEventListener("input", e => { c.value = e.target.value; });
            });
            $$("#ruleConds [data-del]").forEach(b => b.addEventListener("click", () => { if (r.conditions.length > 1) { r.conditions.splice(Number(b.dataset.del), 1); draw(); } }));
        };
        $("#addCond").addEventListener("click", () => { r.conditions.push({ field: "description", op: "contains", value: "" }); draw(); });
        draw();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't change bank rules.");
            if (!r.conditions.some(c => c.value.trim())) return this.formError("Add at least one condition with some text.");
            if (!d.targetAccount) return this.formError("Choose the account to categorise to.");
            await this.saveRecord("rule", { ...r, ...d, auto: !!d.auto, active: !!d.active, vatRate: num(d.vatRate), priority: num(d.priority), conditions: r.conditions.filter(c => c.value.trim()) }, { back: "#finance/rules", label: "Saved rule" });
        }, { cancel: "#finance/rules", onDelete: () => this.deleteRecord("rule", r, `rule "${r.name}"`, "#finance/rules") });
    },

    /* ==========================================================
       REPORTS
       ========================================================== */
    REPORT_LIST: [
        { group: "Business overview", items: [["profit_loss", "Profit and loss", "Income, costs and profit for a period"], ["balance_sheet", "Balance sheet", "What the business owns and owes on a date"], ["cash_flow", "Cash flow", "Where cash came from and went"]] },
        { group: "Receivables", items: [["ar_ageing", "Receivables ageing", "Unpaid invoices by how late they are"], ["customer_statement", "Customer statement", "Statement of account to send a customer"], ["payments_received", "Payments received", "All money received in a period"], ["sales_by_customer", "Sales by customer", "Net sales per customer"], ["sales_by_item", "Sales by item", "Quantities and amounts per product or service"]] },
        { group: "Payables and expenses", items: [["ap_ageing", "Payables ageing", "Unpaid bills by how late they are"], ["vendor_balances", "Vendor balances", "What you owe each vendor"], ["payments_made", "Payments made", "All payments to vendors"], ["expenses_by_category", "Expenses by category", "Spending per expense account"], ["expense_list", "Expense list", "Every expense recorded"]] },
        { group: "Tax", items: [["vat_return", "VAT return (VAT 201)", "Figures for the FTA VAT return"], ["vat_detail", "VAT detail", "Every transaction behind the VAT return"]] },
        { group: "Accountant", items: [["trial_balance", "Trial balance", "Debit and credit balance of every account"], ["general_ledger", "General ledger", "Every posting by account"], ["journal", "Journal", "Every entry with its debits and credits"]] }
    ],
    pageReports() {
        $("#finMain").innerHTML = this.head("Reports", "All reports are in AED unless they say otherwise, and can be printed or exported to CSV.") +
            this.REPORT_LIST.map(g => {
                const items = g.items.filter(([k]) => Server.canReport(k));
                if (!items.length) return "";
                return `<h2 class="fin-h2">${g.group}</h2><div class="report-grid">${items.map(([k, l, d]) => `<a class="report-card" href="#finance/report/${k}"><b>${l}</b><span>${d}</span></a>`).join("")}</div>`;
            }).join("");
    },
    async pageReport(name) {
        const main = $("#finMain");
        const meta = this.REPORT_LIST.flatMap(g => g.items).find(([k]) => k === name) || [name, name];
        const today = this.today();
        const pointInTime = ["balance_sheet", "trial_balance", "ar_ageing", "ap_ageing", "vendor_balances"].includes(name);
        const p = this.params;
        const fy = Store.settings.finance?.fiscalYearStart || "01-01";
        const yearStart = `${today.slice(0, 4)}-${fy}` <= today ? `${today.slice(0, 4)}-${fy}` : `${Number(today.slice(0, 4)) - 1}-${fy}`;
        const from = p.get("from") || (name.startsWith("vat") ? this.quarterStart(today) : yearStart);
        const to = p.get("to") || today;
        const extra = name === "general_ledger" ? this.field("Account", this.select("account", [["", "All accounts"], ...this.accountOptions(() => true, { archived: true })], p.get("account") || ""))
            : name === "customer_statement" ? this.field("Customer", this.input("contact", p.get("contact") || "", 'list="repCust" required') + this.datalist("repCust", this.customers())) : "";
        const presets = pointInTime ? "" : `<div class="presets">${[["This month", today.slice(0, 8) + "01", today], ["Last month", ...this.lastMonth(today)], ["This quarter", this.quarterStart(today), today], ["This year", yearStart, today]].map(([l, f, t]) => `<button type="button" class="chip" data-from="${f}" data-to="${t}">${l}</button>`).join("")}</div>`;
        main.innerHTML = `<div class="report-head no-print">${this.head(meta[1], meta[2] || "", `<button type="button" class="btn btn-ghost" id="repCsv">${icon("download")}<span>CSV</span></button><button type="button" class="btn btn-ghost" id="repPrint">${icon("print")}<span>Print / PDF</span></button>`)}
<form class="report-filters" id="repForm">
  ${pointInTime ? this.field("As of", this.input("to", to, 'type="date"')) : this.field("From", this.input("from", from, 'type="date"')) + this.field("To", this.input("to", to, 'type="date"'))}
  ${extra}
  <button type="submit" class="btn btn-quiet">Run report</button>
  ${presets}
</form></div>
<div class="report-paper" id="repOut"><div class="fin-loading">Loading…</div></div>`;
        const f = $("#repForm");
        const run = () => {
            const q = new URLSearchParams(Object.entries(this.readForm(f)).filter(([, v]) => v !== ""));
            location.hash = `#finance/report/${name}?${q}`;
        };
        f.addEventListener("submit", e => { e.preventDefault(); run(); });
        $$(".presets .chip", f).forEach(c => c.addEventListener("click", () => { f.from.value = c.dataset.from; f.to.value = c.dataset.to; run(); }));
        $("#repPrint").addEventListener("click", () => this.printReport(meta[1]));
        $("#repCsv").addEventListener("click", () => this.reportCSV(meta[1]));
        if (name === "customer_statement" && !p.get("contact")) { $("#repOut").innerHTML = `<p class="muted">Choose a customer and run the report.</p>`; return; }
        const q = new URLSearchParams({ from, to }); if (p.get("account")) q.set("account", p.get("account")); if (p.get("contact")) q.set("contact", p.get("contact"));
        let d;
        try { d = await Server.get(`reports/${name}?${q}`); } catch (e) { $("#repOut").innerHTML = `<p class="bad-text">${esc(e.message)}</p>`; return; }
        if (!this.sub.startsWith("report/" + name)) return;
        $("#repOut").innerHTML = this.renderReport(name, d);
        $$("#repOut [data-src]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); this.openSource(a.dataset.src, a.dataset.kind); }));
    },
    quarterStart(iso) { const m = Number(iso.slice(5, 7)); return `${iso.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`; },
    lastMonth(iso) { const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 2, 1)); const s = d.toISOString().slice(0, 10); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); return [s, e]; },
    openSource(id, kind) {
        const routes = { payment: "payment", billPayment: "bill-payment", bill: "bill", vendorCredit: "vendor-credit", expense: "expense", journal: "journal", transfer: "transfer" };
        if (kind === "doc") { openSaved(id); return; }
        if (routes[kind]) location.hash = `#finance/${routes[kind]}/${id}`;
        else toast("Open this entry from its bank account.", "", 4000);
    },
    srcLink(kind, id, label) { return `<a href="#" data-src="${esc(id)}" data-kind="${esc(kind)}">${esc(label || "Open")}</a>`; },
    renderReport(name, d) {
        const company = esc(Store.settings.company.name);
        const period = d.asOf ? `As of ${fmtDateLong(d.asOf)}` : `${fmtDateLong(d.from)} – ${fmtDateLong(d.to)}`;
        const top = `<div class="rp-top"><div class="rp-co">${company}</div><h2 class="rp-title">${esc(d.title)}</h2><div class="rp-period">${period}</div></div>`;
        const n = v => (v < 0 ? `<span class="neg">(${fmt(-v)})</span>` : fmt(v));
        const note = d.note ? `<p class="rp-note">${esc(d.note)}</p>` : "";
        if (d.sections && (name === "profit_loss" || name === "balance_sheet")) {
            return top + `<table class="rp-table">${d.sections.map(s => `
${s.rows ? `<tr class="rp-sec"><th colspan="2">${esc(s.label)}</th></tr>${s.rows.map(r => { const rowLabel = esc((r.code ? r.code + " " : "") + (r.name || r.label || r.description || "")); const accountCell = name === "profit_loss" ? rowLabel : (r.id && !String(r.id).endsWith("_calc") ? `<a href="#finance/report/general_ledger?account=${encodeURIComponent(r.id)}&from=${encodeURIComponent(d.from || "")}&to=${encodeURIComponent(d.to || d.asOf || "")}">${rowLabel}</a>` : rowLabel); return `<tr><td class="rp-ind">${accountCell}</td><td class="num">${n(r.amount)}</td></tr>`; }).join("")}<tr class="rp-sub"><td>Total ${esc(s.label.toLowerCase())}</td><td class="num">${n(s.total)}</td></tr>` : `<tr class="rp-key ${s.final ? "rp-final" : ""}"><td>${esc(s.label)}</td><td class="num">${n(s.total)}</td></tr>`}`).join("")}</table>
${name === "balance_sheet" ? `<p class="rp-check ${d.balanced ? "good-text" : "bad-text"}">${d.balanced ? "Assets equal liabilities plus equity." : "The balance sheet does not balance. Check opening balances."}</p>` : ""}`;
        }
        if (name === "cash_flow") {
            return top + `<table class="rp-table"><tr class="rp-key"><td>Cash at the start</td><td class="num">${n(d.opening)}</td></tr>${d.sections.map(s => `<tr class="rp-sec"><th colspan="2">${esc(s.label)}</th></tr>${s.rows.map(r => `<tr><td class="rp-ind">${esc(r.name)}</td><td class="num">${n(r.amount)}</td></tr>`).join("") || '<tr><td class="rp-ind muted">None</td><td></td></tr>'}<tr class="rp-sub"><td>Net cash from ${esc(s.label.toLowerCase())}</td><td class="num">${n(s.total)}</td></tr>`).join("")}<tr class="rp-key"><td>Net change in cash</td><td class="num">${n(d.net)}</td></tr><tr class="rp-key rp-final"><td>Cash at the end</td><td class="num">${n(d.closing)}</td></tr></table><p class="rp-note">Direct method from bank and cash accounts, in AED. Transfers between your own accounts are left out.</p>`;
        }
        if (name === "trial_balance") {
            return top + `<table class="rp-table"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${d.rows.map(r => `<tr><td><a href="#finance/report/general_ledger?account=${r.id}&to=${d.asOf}">${esc(r.code)} ${esc(r.name)}</a></td><td class="num">${r.debit ? fmt(r.debit) : ""}</td><td class="num">${r.credit ? fmt(r.credit) : ""}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td><td class="num">${fmt(d.totals.debit)}</td><td class="num">${fmt(d.totals.credit)}</td></tr></tfoot></table><p class="rp-check ${d.totals.balanced ? "good-text" : "bad-text"}">${d.totals.balanced ? "Debits equal credits." : "Debits and credits differ."}</p>`;
        }
        if (name === "general_ledger") {
            return top + (d.groups.length ? d.groups.map(g => `<h3 class="rp-h3">${esc(g.account.code)} ${esc(g.account.name)}</h3><table class="rp-table rp-dense"><thead><tr><th>Date</th><th>Entry</th><th>Contact / description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody><tr class="rp-muted"><td colspan="5">Opening balance</td><td class="num">${n(g.opening)}</td></tr>${g.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${this.srcLink(r.kind, r.id, r.number || r.kind)}</td><td class="who">${esc([r.contact, r.memo].filter(Boolean).join(" · "))}${r.fcCur ? ` <span class="muted">(${r.fcCur} ${fmt(r.fc, r.fcCur)})</span>` : ""}</td><td class="num">${r.debit ? fmt(r.debit) : ""}</td><td class="num">${r.credit ? fmt(r.credit) : ""}</td><td class="num">${n(r.balance)}</td></tr>`).join("")}<tr class="rp-sub"><td colspan="3">Closing balance</td><td class="num">${fmt(g.debit)}</td><td class="num">${fmt(g.credit)}</td><td class="num">${n(g.closing)}</td></tr></tbody></table>`).join("") : `<p class="muted">No postings in this period.</p>`);
        }
        if (name === "journal") {
            return top + (d.entries.length ? `<table class="rp-table rp-dense"><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${d.entries.map(e => e.lines.map((l, i) => `<tr class="${i === 0 ? "rp-first" : ""}"><td>${i === 0 ? fmtDate(e.date) : ""}</td><td>${i === 0 ? this.srcLink(e.kind, e.id, e.number || e.kind) : ""}</td><td>${esc(l.account)}</td><td class="who">${esc([l.contact, l.memo].filter(Boolean).join(" · "))}</td><td class="num">${l.debit ? fmt(l.debit) : ""}</td><td class="num">${l.credit ? fmt(l.credit) : ""}</td></tr>`).join("")).join("")}</tbody></table>` : `<p class="muted">No entries.</p>`);
        }
        if (name === "ar_ageing" || name === "ap_ageing") {
            const B = { current: "Not yet due", d1_30: "1–30 days", d31_60: "31–60", d61_90: "61–90", d90: "Over 90" };
            return top + `<table class="rp-table"><thead><tr><th>${name === "ar_ageing" ? "Customer" : "Vendor"}</th>${d.buckets.map(b => `<th class="num">${B[b]}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>${d.rows.map(r => `<tr class="rp-group"><td><b>${esc(r.contact || "—")}</b>${name === "ar_ageing" ? ` · <a href="#finance/report/customer_statement?contact=${encodeURIComponent(r.contact)}" class="no-print">statement</a>` : ""}</td>${d.buckets.map(b => `<td class="num">${r[b] ? fmt(r[b]) : ""}</td>`).join("")}<td class="num"><b>${fmt(r.total)}</b></td></tr>${r.items.map(it => `<tr class="rp-detail"><td class="rp-ind">${it.id ? (name === "ar_ageing" ? this.srcLink("doc", it.id, it.number) : this.srcLink("bill", it.id, it.number)) : ""} · due ${fmtDate(it.due)}${it.currency !== "AED" ? ` · ${it.currency} ${fmt(it.balance, it.currency)}` : ""}</td>${d.buckets.map(b => `<td class="num">${it.bucket === b ? fmt(it.balanceBase) : ""}</td>`).join("")}<td></td></tr>`).join("")}`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td>${d.buckets.map(b => `<td class="num">${fmt(d.totals[b])}</td>`).join("")}<td class="num">${fmt(d.totals.total)}</td></tr></tfoot></table>
${d.advances.length ? `<h3 class="rp-h3">${name === "ar_ageing" ? "Customer credits (payments not yet applied)" : "Advances paid to vendors"}</h3><table class="rp-table">${d.advances.map(a => `<tr><td>${esc(a.contact || "—")}</td><td class="num">${fmt(a.amount)}</td></tr>`).join("")}</table>` : ""}${note}`;
        }
        if (name === "customer_statement") {
            const c = Store.settings.company;
            return `<div class="rp-top"><div class="rp-co">${company}</div><div class="rp-addr">${esc(c.address || "")}${c.trn ? ` · TRN ${esc(c.trn)}` : ""}</div><h2 class="rp-title">Statement of account</h2><div class="rp-period">${esc(d.contact)} · ${fmtDateLong(d.from)} – ${fmtDateLong(d.to)}</div></div>` +
                (d.groups.length ? d.groups.map(g => `<table class="rp-table"><thead><tr><th>Date</th><th>Details</th><th class="num">Invoiced</th><th class="num">Paid / credited</th><th class="num">Balance (${g.currency})</th></tr></thead><tbody><tr class="rp-muted"><td>${fmtDate(d.from)}</td><td>Balance brought forward</td><td></td><td></td><td class="num">${fmt(g.opening, g.currency)}</td></tr>${g.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.label)} ${this.srcLink(r.kind, r.id, r.number || "")}</td><td class="num">${r.debit ? fmt(r.debit, g.currency) : ""}</td><td class="num">${r.credit ? fmt(r.credit, g.currency) : ""}</td><td class="num">${fmt(r.balance, g.currency)}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td colspan="2">Balance due</td><td class="num">${fmt(g.invoiced, g.currency)}</td><td class="num">${fmt(g.received, g.currency)}</td><td class="num">${g.currency} ${fmt(g.closing, g.currency)}</td></tr></tfoot></table>`).join("") : `<p class="muted">No transactions with ${esc(d.contact)}.</p>`);
        }
        if (name === "vat_return") {
            const drafts = (d.drafts || []).length ? `<p class="note-box">${d.drafts.length} draft invoice${d.drafts.length === 1 ? " is" : "s are"} included: ${d.drafts.slice(0, 8).map(x => this.srcLink("doc", x.id, x.number)).join(", ")}${d.drafts.length > 8 ? "…" : ""}. Mark them as sent, or cancel them, before filing.</p>` : "";
            return top + drafts + `<table class="rp-table vat-table"><thead><tr><th>Box</th><th>Description</th><th class="num">Amount (AED)</th><th class="num">VAT (AED)</th></tr></thead><tbody>${d.boxes.map(b => `<tr class="${b.strong ? "rp-key" : ""}"><td>${b.box}</td><td>${esc(b.label)}</td><td class="num">${b.amount === undefined ? "" : fmt(b.amount)}</td><td class="num">${b.vat === undefined ? "" : n(b.vat)}</td></tr>`).join("")}</tbody></table>${note}<p class="rp-note no-print"><a href="#finance/report/vat_detail?from=${d.from}&to=${d.to}">See every transaction behind these figures</a></p>`;
        }
        if (name === "vat_detail") {
            return top + (d.rows.length ? `<table class="rp-table rp-dense"><thead><tr><th>Type</th><th>Date</th><th>Entry</th><th>Contact</th><th class="num">Taxable amount</th><th class="num">VAT</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${fmtDate(r.date)}</td><td>${this.srcLink(r.source_kind, r.source_id, r.source_number || r.source_kind)}</td><td class="who">${esc(r.contact || "")}</td><td class="num">${r.tax_base !== null && r.tax_base !== undefined && !/vat/.test(r.tax_code) ? n(r.tax_base) : ""}</td><td class="num">${/vat|rc_/.test(r.tax_code) ? n(Math.abs(r.amount)) : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No VAT transactions in this period.</p>`);
        }
        if (["sales_by_customer", "vendor_balances"].includes(name)) {
            return top + `<table class="rp-table"><thead><tr><th>${name === "vendor_balances" ? "Vendor" : "Customer"}</th>${name === "sales_by_customer" ? '<th class="num">Documents</th>' : ""}<th class="num">Amount (AED)</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.contact)}</td>${name === "sales_by_customer" ? `<td class="num">${r.documents}</td>` : ""}<td class="num">${n(r.amount)}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td>${name === "sales_by_customer" ? "<td></td>" : ""}<td class="num">${n(d.total)}</td></tr></tfoot></table>${note}`;
        }
        if (name === "sales_by_item") {
            return top + `<table class="rp-table"><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Amount (AED)</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${esc(r.item)}</td><td class="num">${fmtQty(r.qty)}</td><td class="num">${n(r.amount)}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td><td></td><td class="num">${n(d.total)}</td></tr></tfoot></table>${note}`;
        }
        if (name === "expenses_by_category") {
            return top + `<table class="rp-table"><thead><tr><th>Account</th><th class="num">Amount (AED)</th></tr></thead><tbody>${d.rows.map(r => `<tr><td><a href="${r.id ? `#finance/report/general_ledger?account=${encodeURIComponent(r.id)}&from=${d.from}&to=${d.to}` : `#finance/report/expense_list?from=${d.from}&to=${d.to}`}">${esc([r.code, r.name].filter(Boolean).join(" "))}</a></td><td class="num">${n(r.amount)}</td></tr>`).join("")}</tbody><tfoot><tr class="rp-key"><td>Total</td><td class="num">${n(d.total)}</td></tr></tfoot></table>${note}`;
        }
        if (["payments_received", "payments_made", "expense_list"].includes(name)) {
            const kind = name === "payments_received" ? "payment" : name === "payments_made" ? "billPayment" : "expense";
            const byCur = {};
            d.rows.forEach(r => { byCur[r.currency] = (byCur[r.currency] || 0) + num(r.amount); });
            return top + `<table class="rp-table"><thead><tr><th>Date</th><th>Number</th><th>${name === "payments_received" ? "Customer" : "Vendor"}</th><th>Account</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${this.srcLink(kind, r.id, r.number)}</td><td class="who">${esc(r.contact)}</td><td>${esc(r.account)}</td><td class="who">${esc(r.reference)}</td><td class="num">${esc(r.currency)} ${fmt(r.amount, r.currency)}</td></tr>`).join("")}</tbody><tfoot>${Object.entries(byCur).map(([c, v]) => `<tr class="rp-key"><td colspan="5">Total ${c}</td><td class="num">${fmt(v, c)}</td></tr>`).join("")}</tfoot></table>`;
        }
        return top + `<pre>${esc(JSON.stringify(d, null, 2))}</pre>`;
    },
    printReport(title) {
        const html = $("#repOut").innerHTML;
        $("#printRoot").innerHTML = `<div class="report-print">${html}</div>`;
        document.body.classList.add("printing", "printing-report");
        App._titleBeforePrint = document.title;
        document.title = `${title} · ${Store.settings.company.name}`;
        const done = () => { document.body.classList.remove("printing-report"); window.removeEventListener("afterprint", done); };
        window.addEventListener("afterprint", done);
        setTimeout(() => window.print(), 50);
    },
    reportCSV(title) {
        const tables = $$("#repOut table");
        if (!tables.length) { toast("Nothing to export.", "warn"); return; }
        const lines = [[title], [($(".rp-period") || {}).textContent || ""], []];
        tables.forEach(t => { $$("tr", t).forEach(tr => lines.push($$("th,td", tr).map(c => c.textContent.replace(/\s+/g, " ").trim()))); lines.push([]); });
        download(`${safeFilename(title)} ${this.today()}.csv`, "﻿" + lines.map(r => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    },

    /* ==========================================================
       FINANCE SETTINGS
       ========================================================== */
    pageFinanceSettings() {
        const s = Store.settings;
        const fin = s.finance || {};
        const canAcc = Server.can("accounting");
        const rem = fin.reminders || {};
        $("#finMain").innerHTML = this.formShell("Finance settings", "How the books are kept. Only accountants, admins and the owner can change these.", `
${canAcc ? "" : this.readonly()}
<div class="sub-title">Period lock</div>
<div class="grid-2">
  ${this.field("Lock the books up to", this.input("lockDate", fin.lockDate || "", 'type="date"'), { hint: "Nobody can add, change or delete invoices, bills, payments, expenses or journals dated on or before this date. Use it after filing a VAT return or closing a year." })}
  ${this.field("Financial year starts", this.select("fiscalYearStart", MONTHS_LONG.map((m, i) => [`${String(i + 1).padStart(2, "0")}-01`, `1 ${m}`]), fin.fiscalYearStart || "01-01"))}
</div>
<div class="sub-title mt">VAT</div>
<div class="grid-2">
  ${this.field("Emirate for VAT return box 1", this.select("emirate", ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"].map(e => [e, e]), fin.emirate || "Dubai"))}
  ${this.field("Company TRN", `<div class="static">${esc(s.company.trn || "Not set — add it in Settings → Company")}</div>`)}
</div>
<div class="sub-title mt">Default accounts</div>
<div class="grid-2">
  ${this.field("Sales of goods", this.select("salesAccount", this.accountOptions(a => a.type === "income"), fin.defaults?.salesAccount))}
  ${this.field("Other charges on invoices (freight…)", this.select("chargesAccount", this.accountOptions(a => a.type === "income"), fin.defaults?.chargesAccount))}
  ${this.field("Purchases on bills", this.select("purchaseAccount", this.accountOptions(a => a.type === "expense" || a.subtype === "inventory"), fin.defaults?.purchaseAccount))}
  ${this.field("Deposit customer payments into", this.select("depositAccount", [["", "Bank account in the invoice currency"], ...this.bankAccounts().map(a => [a.id, this.accountLabel(a)])], fin.defaults?.depositAccount || ""))}
  ${this.field("Bills are due after (days)", this.input("billDueDays", fin.defaults?.billDueDays ?? 30, 'type="number" min="0"'))}
</div>
<div class="sub-title mt">Live exchange rates</div>
<p class="hint">New foreign-currency documents, payments, bills and expenses take the live rate automatically. For prices that stream as they change, connect a WebSocket feed: a free key from twelvedata.com or finnhub.io, or your own feed.</p>
<div class="grid-2">
  ${this.field("Source", this.select("fxProvider", Object.entries(FX_PROVIDERS).map(([k, v]) => [k, v.label]), LiveFX.config().provider))}
  <div class="field" data-fx="key">${`<label>API key</label>${this.input("fxKey", fin.liveFx?.key || "", 'autocomplete="off" spellcheck="false" placeholder="Paste the key"')}<div class="hint">Everyone signed in to EVAM Books can see this key. Use a market-data key only.</div>`}</div>
  <div class="field span-2" data-fx="url"><label>WebSocket URL</label>${this.input("fxUrl", fin.liveFx?.url || "", 'placeholder="wss://…" spellcheck="false"')}<div class="hint">Messages like {"symbol":"EUR/USD","price":1.0842} or {"s":"USD/INR","p":83.1}. EVAM Books subscribes to every currency on connect.</div></div>
  <div class="field span-2"><label>Status</label><div class="static" id="fxState"></div></div>
</div>
<div class="sub-title mt">Book rates to AED</div>
<p class="hint">The fallback when there is no live rate, and the rate for older records without one. The dollar and the other GCC currencies are pegged. <button type="button" class="link-btn" id="fxFill">Fill in today's live rates</button></p>
<div class="rates-grid">${Object.keys(CURRENCIES).filter(c => c !== "AED").map(c => `<label class="rate-in"><span>${c}</span><input name="rate_${c}" type="number" step="any" value="${esc(fin.rates?.[c] ?? "")}" aria-label="${c} rate"></label>`).join("")}</div>
<div class="sub-title mt">Payment reminders</div>
<label class="check"><input type="checkbox" name="remEnabled" ${rem.enabled ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Send reminders automatically<small>Emails go to the email address on each invoice. Needs email set up on the server.</small></span></label>
<div class="grid-2">
  ${this.field("When (days from the due date)", this.input("remSchedule", (rem.schedule || []).join(", "), 'placeholder="-3, 1, 7, 15, 30"'), { hint: "Negative = before the due date. e.g. -3, 1, 7, 15, 30" })}
  ${this.field("Subject", this.input("remSubject", rem.subject || ""))}
  ${this.field("Message", `<textarea name="remBody" rows="7">${esc(rem.body || "")}</textarea>`, { cls: "span-2", hint: "You can use {customer}, {number}, {date}, {due}, {currency}, {balance}, {total}, {when} and {company}." })}
</div>`);
        this.bindForm(async d => {
            if (!canAcc) return this.formError("Your role can't change finance settings.");
            const rates = { ...(fin.rates || {}) };
            Object.keys(CURRENCIES).forEach(c => { if (d["rate_" + c] !== undefined) { const v = num(d["rate_" + c]); if (v > 0) rates[c] = v; else delete rates[c]; } });
            const next = JSON.parse(JSON.stringify(s));
            next.finance = { ...fin, liveFx: { provider: d.fxProvider, key: String(d.fxKey || "").trim(), url: String(d.fxUrl || "").trim() }, lockDate: d.lockDate, fiscalYearStart: d.fiscalYearStart, emirate: d.emirate, rates,
                defaults: { ...(fin.defaults || {}), salesAccount: d.salesAccount, chargesAccount: d.chargesAccount, purchaseAccount: d.purchaseAccount, depositAccount: d.depositAccount, billDueDays: Math.max(0, parseInt(d.billDueDays, 10) || 0) },
                reminders: { ...(fin.reminders || {}), enabled: !!d.remEnabled, schedule: String(d.remSchedule).split(/[,\s]+/).map(Number).filter(x => isFinite(x) && String(x) !== ""), subject: d.remSubject, body: d.remBody } };
            if (d.fxProvider === "custom" && d.fxUrl && !/^wss?:\/\//i.test(String(d.fxUrl).trim())) return this.formError("The live feed URL starts with wss://");
            try { const res = await Server.save("settings", { ...next, id: "settings" }); this._formOpen = false; toast("Finance settings saved.", "good"); LiveFX.restart(); this.pageFinanceSettings(); }
            catch (e) { this.formError(e.message); }
        }, { cancel: "#finance" });
        const ff = $("#finForm");
        const showFx = () => { const p = ff.fxProvider.value; $$("[data-fx]", ff).forEach(el => { el.hidden = !(el.dataset.fx === "key" ? FX_PROVIDERS[p]?.key : FX_PROVIDERS[p]?.url); }); };
        ff.fxProvider.addEventListener("change", showFx); showFx();
        const state = () => { const el = $("#fxState"); if (!el) return; const tone = { live: "good", connecting: "warn", polling: "info", error: "bad", off: "mute" }[LiveFX.status] || "mute"; const n = Object.keys(LiveFX.updated).length; el.innerHTML = `${this.pill(tone, LiveFX.label())} <span class="muted">${esc(LiveFX.detail || (n ? `${n} currencies updated` : ""))}</span>`; };
        state();
        const off = LiveFX.onChange(() => { if (!$("#fxState")) { off(); return; } state(); });
        $("#fxFill").addEventListener("click", () => {
            let n = 0;
            Object.keys(CURRENCIES).forEach(c => { const l = LiveFX.live(c); const inp = ff["rate_" + c]; if (l && inp && !(c in FX_PEGS)) { inp.value = l; n++; } });
            toast(n ? `Filled in ${n} live rates. Save to keep them.` : "No live rates yet. Try again in a moment.", n ? "good" : "warn");
        });
    },

    /* ==========================================================
       ADMINISTRATION
       ========================================================== */
    async pageUsers() {
        const main = $("#finMain");
        main.innerHTML = this.head("Users and roles", "Who can sign in, and what each person can do.", `<button type="button" class="btn btn-primary" id="addUser">${icon("plus")}<span>Add user</span></button>`) + `<div class="fin-loading">Loading…</div>`;
        let d;
        try { d = await Server.get("users"); } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        const roleHelp = {
            owner: "Everything, including users and security.", admin: "Everything, including users and security.", accountant: "All documents and finance, reports and the audit trail. No user management.",
            sales: "Quotes, sales orders, invoices, credit notes, delivery notes, customer payments, letters. Sales reports.", purchases: "Purchase orders, bills, vendor payments and credits, letters. Payables reports.",
            staff: "Only their own expenses.", viewer: "Can see everything, change nothing."
        };
        $(".fin-loading", main).outerHTML = this.table([
            { label: "Name", html: u => `<b>${esc(u.name)}</b>${u.id === Server.user.id ? ' <span class="pill pill-neutral">You</span>' : ""}<div class="small muted">${esc(u.email)}</div>` },
            { label: "Role", html: u => u.role === "owner" || u.id === Server.user.id ? esc(d.roles[u.role]) : `<select data-role="${u.id}" aria-label="Role for ${esc(u.name)}">${Object.entries(d.roles).filter(([k]) => k !== "owner" && (k !== "admin" || Server.user.role === "owner")).map(([k, l]) => `<option value="${k}"${k === u.role ? " selected" : ""}>${l}</option>`).join("")}</select>` },
            { label: "Two-step sign-in", html: u => u.mfa ? this.pill("good", "On") : this.pill("warn", "Off") },
            { label: "Last sign-in", html: u => u.lastLogin ? relTime(u.lastLogin) : '<span class="muted">Never</span>' },
            { label: "Status", html: u => u.disabled ? this.pill("mute", "Switched off") : u.mustChange ? this.pill("info", "Invited") : this.pill("good", "Active") },
            { label: "", html: u => u.role === "owner" && Server.user.role !== "owner" || u.id === Server.user.id ? "" : `<button type="button" class="icon-btn" data-umenu="${u.id}" aria-label="Actions for ${esc(u.name)}">${icon("more")}</button>` }
        ], d.users) + `<div class="panel mt"><h2>Roles</h2><ul class="role-help">${Object.entries(d.roles).map(([k, l]) => `<li><b>${l}</b> — ${roleHelp[k] || ""}</li>`).join("")}</ul></div>`;
        $("#addUser").addEventListener("click", async () => {
            const r = await openDialog({ title: "Add user", body: `<div class="form-grid"><div class="field"><label for="nu1">Name</label><input id="nu1" name="name"></div><div class="field"><label for="nu2">Email</label><input id="nu2" name="email" type="email"></div><div class="field"><label for="nu3">Role</label><select id="nu3" name="role">${Object.entries(d.roles).filter(([k]) => k !== "owner" && (k !== "admin" || Server.user.role === "owner")).map(([k, l]) => `<option value="${k}"${k === "sales" ? " selected" : ""}>${l}</option>`).join("")}</select></div></div><p class="hint">They get a temporary password to change at first sign-in.</p>`, actions: [{ label: "Cancel", value: "cancel" }, { label: "Add user", value: "ok", primary: true }] });
            if (r.value !== "ok") return;
            try { const res = await Server.post("users", r.data); this.showTempPassword(res.user, res.tempPassword); this.pageUsers(); }
            catch (e) { toast(e.message, "bad", 7000); }
        });
        $$("[data-role]").forEach(sel => sel.addEventListener("change", async () => {
            try { await Server.api("PATCH", `users/${sel.dataset.role}`, { role: sel.value }); toast("Role changed. It applies at their next action.", "good"); }
            catch (e) { toast(e.message, "bad"); this.pageUsers(); }
        }));
        $$("[data-umenu]").forEach(b => b.addEventListener("click", () => {
            const u = d.users.find(x => x.id === b.dataset.umenu);
            showMenu(b, [
                { label: "Reset password", icon: "refresh", onClick: async () => { try { const r = await Server.post(`users/${u.id}/reset`, {}); this.showTempPassword(u, r.tempPassword); this.pageUsers(); } catch (e) { toast(e.message, "bad"); } } },
                { label: "Reset password and two-step sign-in", icon: "refresh", disabled: !u.mfa, onClick: async () => { if (!await confirmDialog(`Reset ${u.name}'s password and two-step sign-in? Use this if they lost their phone.`, "Reset", true)) return; try { const r = await Server.post(`users/${u.id}/reset`, { reset2fa: true }); this.showTempPassword(u, r.tempPassword); this.pageUsers(); } catch (e) { toast(e.message, "bad"); } } },
                { divider: true },
                { label: u.disabled ? "Switch on" : "Switch off (can't sign in)", icon: u.disabled ? "check" : "x", danger: !u.disabled, onClick: async () => { try { await Server.api("PATCH", `users/${u.id}`, { disabled: !u.disabled }); this.pageUsers(); } catch (e) { toast(e.message, "bad"); } } },
                { label: "View their activity", icon: "eye", onClick: () => { location.hash = `#finance/audit?user=${u.id}`; } }
            ], "right");
        }));
    },
    showTempPassword(u, pw) {
        openDialog({ title: "Temporary password", body: `<p class="dialog-text">Give ${esc(u.name)} (${esc(u.email)}) this password. It is shown only once. They choose their own at first sign-in.</p><p class="temp-pw"><code>${esc(pw)}</code> <button type="button" class="btn btn-ghost btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(pw)}');this.textContent='Copied'">Copy</button></p><p class="hint">Sign-in page: ${esc(location.href.split("#")[0])}</p>`, actions: [{ label: "Done", value: "ok", primary: true }] });
    },
    async pageSecurity() {
        const main = $("#finMain");
        main.innerHTML = this.head("Security") + `<div class="fin-loading">Loading…</div>`;
        let d;
        try { d = await Server.get("security"); } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        main.innerHTML = this.formShell("Security", "Applies to everyone in the organisation.", `
<label class="check"><input type="checkbox" name="require2fa" ${d.security.require2fa ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Require two-step sign-in for everyone<small>People without it are asked to set it up before they can continue. ${Server.user.mfa ? "" : "<b>Turn it on for your own account first</b> (account menu, top right)."}</small></span></label>
${this.field("Allowed IP addresses", `<textarea name="ipAllow" rows="4" placeholder="One per line, e.g. 94.200.10.25 or 94.200.10.0/24">${esc((d.security.ipAllow || []).join("\n"))}</textarea>`, { cls: "mt", hint: `Leave empty to allow sign-in from anywhere. Your current address is <b>${esc(d.yourIp)}</b>; it must be in the list.` })}
<div class="panel-sub mt">Sessions end after 12 hours without activity and after 14 days at most. Eight wrong passwords or codes lock an account for 15 minutes.</div>`);
        this.bindForm(async v => {
            try { await Server.api("PUT", "security", { require2fa: !!v.require2fa, ipAllow: String(v.ipAllow).split(/[\n,]+/).map(x => x.trim()).filter(Boolean) }); this._formOpen = false; toast("Security settings saved.", "good"); this.pageSecurity(); }
            catch (e) { this.formError(e.message); }
        }, { cancel: "#finance" });
    },
    async pageAudit() {
        const main = $("#finMain");
        const p = this.params;
        main.innerHTML = this.head("Audit trail", "Every sign-in and every change, with who made it and when. Entries can't be edited or deleted.") + `<div class="fin-loading">Loading…</div>`;
        const q = new URLSearchParams({ limit: 200 });
        ["user", "action", "object", "from", "to"].forEach(k => { if (p.get(k)) q.set(k, p.get(k)); });
        let d, users = [];
        try { d = await Server.get(`audit?${q}`); if (Server.isAdmin) users = (await Server.get("users")).users; } catch (e) { $(".fin-loading", main).textContent = e.message; return; }
        const label = a => ({ create: "Created", update: "Changed", delete: "Deleted", login: "Signed in", login_failed: "Failed sign-in", logout: "Signed out", "2fa_on": "Turned on 2-step sign-in", "2fa_off": "Turned off 2-step sign-in", user_add: "Added user", role_change: "Changed role", user_update: "Changed user", password_reset: "Reset password", password_change: "Changed password", import: "Imported", reconcile: "Reconciled", unreconcile: "Undid reconciliation", match: "Matched bank line", unmatch: "Unmatched bank line", exclude: "Excluded bank line", restore: "Restored bank line", security: "Changed security", setup: "Set up organisation", upload: "Uploaded file" }[a] || a);
        const showChanges = c => !c ? "" : Object.entries(c).slice(0, 6).map(([k, v]) => Array.isArray(v) ? `<span class="chg"><b>${esc(k)}</b> ${esc(String(v[0] ?? "—"))} → ${esc(String(v[1] ?? "—"))}</span>` : `<span class="chg"><b>${esc(k)}</b> ${esc(typeof v === "string" ? v : "changed")}</span>`).join("");
        main.innerHTML = this.head("Audit trail", "Every sign-in and every change, with who made it and when. Entries can't be edited or deleted.") + `
<form class="filters" id="audForm">
  ${users.length ? `<select name="user" aria-label="Person"><option value="">Everyone</option>${users.map(u => `<option value="${u.id}"${p.get("user") === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("")}</select>` : ""}
  <select name="action" aria-label="Action"><option value="">All actions</option>${["create", "update", "delete", "login", "login_failed", "role_change", "reconcile", "import", "security"].map(a => `<option value="${a}"${p.get("action") === a ? " selected" : ""}>${label(a)}</option>`).join("")}</select>
  <input type="date" name="from" value="${esc(p.get("from") || "")}" aria-label="From"><input type="date" name="to" value="${esc(p.get("to") || "")}" aria-label="To">
  <button class="btn btn-quiet" type="submit">Filter</button>
</form>` + this.table([
            { label: "When", html: e => `${fmtDate(isoOf(new Date(e.at)))} <span class="muted">${new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>` },
            { label: "Who", html: e => esc(e.user_name || "—") },
            { label: "Action", html: e => `<span class="${e.action === "login_failed" || e.action === "delete" ? "bad-text" : ""}">${esc(label(e.action))}</span>` },
            { label: "What", html: e => `${esc(e.label || "")}<div class="chg-list">${showChanges(e.changes)}</div>`, cls: "who wrap" },
            { label: "IP", html: e => `<span class="muted small">${esc(e.ip || "")}</span>` }
        ], d.entries, { empty: "No entries match." });
        $("#audForm").addEventListener("submit", e => { e.preventDefault(); const v = new URLSearchParams(Object.entries(this.readForm(e.target)).filter(([, x]) => x)); location.hash = "#finance/audit" + (String(v) ? "?" + v : ""); });
    }
});

/* CSV parser that copes with quotes, commas and line breaks inside fields, ; or tab separators */
function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
            else cell += c;
        } else if (c === '"') q = true;
        else if (c === sep) { row.push(cell); cell = ""; }
        else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
        else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
}
