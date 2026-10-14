/* EVAM Books — purchases, expenses, accountant tools */
Object.assign(Finance, {

    /* ==========================================================
       BILLS AND VENDOR CREDITS
       ========================================================== */
    billStatus(b) {
        if (b.status === "void") return "cancelled";
        const bal = this.billBalance(b);
        if (bal <= 0) return "paid";
        if (b.due && b.due < this.today()) return "overdue";
        return num(b.paid) + num(b.credited) > 0 ? "partial" : "open";
    },
    pageBills() {
        const q = (this.params.get("q") || "").toLowerCase();
        const st = this.params.get("status") || "";
        const list = (Server.fin.bill || []).filter(b => (!q || [b.number, b.vendorName, b.reference].join(" ").toLowerCase().includes(q)) && (!st || this.billStatus(b) === st))
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const open = (Server.fin.bill || []).filter(b => this.billBalance(b) > 0);
        const overdue = open.filter(b => this.billStatus(b) === "overdue");
        const sumAED = l => l.reduce((s, b) => s + this.billBalance(b) * (b.currency === "AED" ? 1 : num(b.rate) || 1), 0);
        $("#finMain").innerHTML = this.head("Bills", "Invoices you receive from vendors. Record them here, then pay them.", Server.can("purchases") ? this.link("New bill", "#finance/bill/new") : "") + `
<div class="ledger-strip fin-kpis three">
  <div class="ls"><div class="ls-label">Unpaid</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(sumAED(open))}</div><div class="ls-note">${open.length} bill${open.length === 1 ? "" : "s"}</div></div>
  <div class="ls ${overdue.length ? "ls-bad" : ""}"><div class="ls-label">Overdue</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(sumAED(overdue))}</div><div class="ls-note">${overdue.length ? `${overdue.length} past due date` : "Nothing overdue"}</div></div>
  <div class="ls"><div class="ls-label">Due in 7 days</div><div class="ls-value"><span class="ls-cur">AED</span>${fmt(sumAED(open.filter(b => b.due >= this.today() && b.due <= addDays(this.today(), 7))))}</div><div class="ls-note">Plan payments ahead</div></div>
</div>
<div class="filters"><label class="search"><span class="search-ic">${icon("search")}</span><input id="finSearch" type="search" placeholder="Search bill number, vendor or reference" value="${esc(this.params.get("q") || "")}"></label>
<select id="billStatus" aria-label="Status"><option value="">Any status</option>${["open", "partial", "overdue", "paid", "cancelled"].map(s => `<option value="${s}"${s === st ? " selected" : ""}>${(STATUS[s] || {}).label || s}</option>`).join("")}</select></div>` +
            this.table([
                { label: "Bill date", html: b => fmtDate(b.date) },
                { label: "Bill no.", html: b => `<b>${esc(b.number || "")}</b>` },
                { label: "Vendor", html: b => esc(b.vendorName), cls: "who" },
                { label: "Due", html: b => `<span class="${this.billStatus(b) === "overdue" ? "bad-text" : ""}">${fmtDate(b.due)}</span>` },
                { label: "Total", num: true, html: b => this.money(this.billTotal(b), b.currency) },
                { label: "Balance", num: true, html: b => this.billBalance(b) > 0 ? this.money(this.billBalance(b), b.currency) : '<span class="muted">0.00</span>' },
                { label: "Status", html: b => this.pill(this.billStatus(b)) },
                { label: "", html: b => this.billBalance(b) > 0 && Server.can("purchases") ? `<a class="btn btn-ghost btn-sm" href="#finance/bill-payment/new?bill=${b.id}">Pay</a>` : "" }
            ], list, { empty: "No bills yet. Record vendor invoices here to track what you owe and when it's due.", onRow: b => b.id });
        this.bindRows("#finance/bill/");
        this.bindSearch();
        $("#billStatus").addEventListener("change", e => { location.hash = "#finance/bills" + (e.target.value ? "?status=" + e.target.value : ""); });
    },
    pageVendorCredits() {
        const list = (Server.fin.vendorCredit || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        $("#finMain").innerHTML = this.head("Vendor credits", "Credit notes from vendors for returns, discounts or overpayments.", Server.can("purchases") ? this.link("New vendor credit", "#finance/vendor-credit/new") : "") +
            this.table([
                { label: "Date", html: v => fmtDate(v.date) },
                { label: "Number", html: v => `<b>${esc(v.number || "")}</b>` },
                { label: "Vendor", html: v => esc(v.vendorName), cls: "who" },
                { label: "Applied to bill", html: v => esc((Server.fin.bill || []).find(b => b.id === v.billId)?.number || "") || '<span class="muted">Not applied</span>' },
                { label: "Amount", num: true, html: v => this.money(this.billTotal(v), v.currency) }
            ], list, { empty: "No vendor credits.", onRow: v => v.id });
        this.bindRows("#finance/vendor-credit/");
    },

    /* One form for bills and vendor credits: vendor, dates, currency and lines with an account each */
    formBill(id, kind) {
        const coll = Server.fin[kind] || [];
        const editing = id && id !== "new" ? coll.find(b => b.id === id) : null;
        if (id && id !== "new" && !editing) { $("#finMain").innerHTML = `<div class="empty"><h2>Not found</h2></div>`; return; }
        // From a purchase order, or a credit note document that was really received from a vendor
        const po = this.params.get("po") || this.params.get("fromDoc") ? Store.getDoc(this.params.get("po") || this.params.get("fromDoc")) : null;
        const isBill = kind === "bill";
        const defAcc = Store.settings.finance?.defaults?.purchaseAccount || "acc_5000";
        const lineFrom = it => ({ id: uid("l"), name: it.name || "", desc: it.desc || "", qty: it.qty ?? 1, rate: it.rate ?? 0, vat: it.vat ?? Store.settings.defaults.vat, account: it.account || defAcc, disc: 0, discType: "amt" });
        const b = editing ? JSON.parse(JSON.stringify(editing)) : {
            id: uid(isBill ? "bill" : "vc"), number: po && po.type !== "purchaseOrder" ? po.number || "" : "", vendorName: po?.party?.name || "", date: this.today(), due: "", currency: po?.currency || "AED",
            rate: po ? (po.currency === "AED" ? 1 : num(po.fx?.rate) || this.rateFor(po.currency)) : 1,
            reference: po ? (po.type === "purchaseOrder" ? po.number : po.ref || "") : "", poId: po?.type === "purchaseOrder" ? po.id : "", sourceDocId: po && po.type !== "purchaseOrder" ? po.id : "", items: po ? po.items.map(lineFrom) : [lineFrom({})], charges: [], discount: { type: "amt", value: 0 },
            reverseCharge: false, notes: "", attachments: [], status: isBill ? "open" : "open", billId: this.params.get("bill") || ""
        };
        if (po && po.charges) po.charges.forEach(c => b.items.push(lineFrom({ name: c.label, rate: c.amount, vat: c.vat })));
        if (po && num(po.discount?.value)) b.discount = { ...po.discount };
        const canEdit = Server.can("purchases");
        const expAccounts = this.accountOptions(a => a.type === "expense" || (a.type === "asset" && ["inventory", "fixed", "current"].includes(a.subtype)));
        const title = editing ? `${isBill ? "Bill" : "Vendor credit"} ${esc(b.number || "")}` : isBill ? (po ? `Bill from purchase order ${esc(po.number)}` : "New bill") : "New vendor credit";
        $("#finMain").innerHTML = this.formShell(title, isBill ? "Record what the vendor charged. Each line goes to the account you choose." : "A credit from a vendor reduces what you owe them.", `
${canEdit ? "" : this.readonly()}
${editing && isBill && this.billBalance(b) < this.billTotal(b) ? `<p class="note-box">${esc(b.currency)} ${fmt(num(b.paid), b.currency)} paid${num(b.credited) ? `, ${fmt(num(b.credited), b.currency)} credited` : ""}. Balance ${fmt(this.billBalance(b), b.currency)}.</p>` : ""}
<div class="grid-3">
  ${this.field("Vendor", this.input("vendorName", b.vendorName, 'list="vendList" required'), { req: true })}
  ${this.field(isBill ? "Vendor's bill number" : "Credit note number", this.input("number", b.number, isBill ? 'placeholder="As printed on their invoice"' : 'placeholder="Leave empty to number automatically"'))}
  ${this.field(isBill ? "Bill date" : "Date", this.input("date", b.date, 'type="date" required'), { req: true })}
  ${isBill ? this.field("Due date", this.input("due", b.due, 'type="date"'), { hint: `Empty = ${Store.settings.finance?.defaults?.billDueDays || 30} days after the bill date.` }) : this.field("Apply to bill", this.select("billId", [["", "Keep as credit (apply later)"], ...(Server.fin.bill || []).filter(x => x.status !== "void").map(x => [x.id, `${x.number} · ${x.vendorName} · ${x.currency} ${fmt(this.billBalance(x), x.currency)} owed`])], b.billId))}
  ${isBill ? "" : this.field("Amount to apply to the bill", this.input("appliedAmount", b.appliedAmount ?? "", 'type="number" step="any" inputmode="decimal" placeholder="As much as the bill still owes"'), { hint: "The rest stays as credit with the vendor." })}
  ${this.field("Currency", this.select("currency", this.currencyOptions(), b.currency))}
  <div data-fx>${this.field("Exchange rate (AED per 1)", this.input("rate", b.rate, 'type="number" step="any" inputmode="decimal"'))}</div>
  ${this.field("Reference", this.input("reference", b.reference, 'placeholder="PO number or other reference"'))}
  ${isBill ? `<label class="check"><input type="checkbox" name="reverseCharge" ${b.reverseCharge ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Reverse charge<small>Services or goods from abroad where you account for the 5% VAT.</small></span></label>` : ""}
</div>
${this.datalist("vendList", this.vendors())}
<div class="sub-title mt">Lines</div>
<div class="bill-lines" id="billLines"></div>
<button type="button" class="btn btn-ghost btn-sm" id="addLine">${icon("plus", 14)}<span>Add line</span></button>
<div class="sum-box bill-sum" id="billSum"></div>
${this.field("Notes", `<textarea name="notes" rows="2">${esc(b.notes || "")}</textarea>`, { cls: "mt" })}
<div class="attach" id="attachBox"></div>`, { canDelete: !!editing && canEdit, extraActions: editing && isBill && this.billBalance(b) > 0 && canEdit ? `<a class="btn btn-ghost" href="#finance/bill-payment/new?bill=${b.id}">${icon("check")}<span>Pay this bill</span></a>` : "" });
        const f = $("#finForm");
        const renderLines = () => {
            $("#billLines").innerHTML = `<div class="bl-head"><span>Description</span><span>Account</span><span class="num">Qty</span><span class="num">Rate</span><span class="num">VAT %</span><span class="num">Amount</span><span></span></div>` + b.items.map((it, i) => `
<div class="bl-row" data-i="${i}">
  <input data-k="name" value="${esc(it.name || it.desc || "")}" placeholder="What was bought" aria-label="Line ${i + 1} description" data-skip>
  <select data-k="account" aria-label="Line ${i + 1} account" data-skip>${expAccounts.map(([v, l]) => `<option value="${v}"${v === it.account ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
  <input data-k="qty" type="number" step="any" class="num" value="${esc(it.qty)}" aria-label="Quantity" data-skip>
  <input data-k="rate" type="number" step="any" class="num" value="${esc(it.rate)}" aria-label="Rate" data-skip>
  <input data-k="vat" type="number" step="any" class="num" value="${esc(it.vat)}" aria-label="VAT percent" data-skip>
  <span class="num bl-amt"></span>
  <button type="button" class="icon-btn" data-del="${i}" aria-label="Remove line ${i + 1}">${icon("x")}</button>
</div>`).join("");
            $$("#billLines .bl-row").forEach(row => {
                $$("[data-k]", row).forEach(el => el.addEventListener("input", () => {
                    const it = b.items[Number(row.dataset.i)];
                    it[el.dataset.k] = ["qty", "rate", "vat"].includes(el.dataset.k) ? el.value : el.value;
                    if (el.dataset.k === "name") it.desc = "";
                    totals();
                }));
            });
            $$("#billLines [data-del]").forEach(x => x.addEventListener("click", () => { if (b.items.length > 1) { b.items.splice(Number(x.dataset.del), 1); renderLines(); } }));
            totals();
        };
        const totals = () => {
            const d = this.readForm(f);
            const t = computeTotals({ ...b, currency: d.currency, type: "bill", paid: 0, fx: {}, items: b.items });
            $$("#billLines .bl-row").forEach((row, i) => { $(".bl-amt", row).textContent = fmt(t.lines[i]?.total || 0, d.currency); });
            const rc = d.reverseCharge ? round(t.taxable * 0.05, t.dec) : 0;
            $("#billSum").innerHTML = `<div class="sum-row"><span>Subtotal</span><span>${fmt(t.taxable, d.currency)}</span></div>
              <div class="sum-row"><span>VAT</span><span>${fmt(t.vatTotal, d.currency)}</span></div>
              ${rc ? `<div class="sum-row muted"><span>Reverse charge VAT (5%, due and recoverable)</span><span>${fmt(rc, d.currency)}</span></div>` : ""}
              <div class="sum-row sum-total"><span>Total</span><span>${esc(d.currency)} ${fmt(t.total, d.currency)}</span></div>
              ${d.currency !== "AED" && num(d.rate) ? `<div class="sum-row muted"><span>In AED</span><span>${fmt(t.total * num(d.rate))}</span></div>` : ""}`;
            $("[data-fx]", f).hidden = d.currency === "AED";
        };
        $("#addLine").addEventListener("click", () => { b.items.push(lineFrom({ account: b.items[b.items.length - 1]?.account })); renderLines(); $$("#billLines .bl-row input")[$$("#billLines .bl-row").length * 4 - 4]?.focus(); });
        f.currency.addEventListener("change", () => { f.rate.value = this.rateFor(f.currency.value); totals(); });
        f.rate && f.rate.addEventListener("input", totals);
        f.reverseCharge && f.reverseCharge.addEventListener("change", totals);
        this.renderAttachments($("#attachBox"), b, canEdit);
        renderLines();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't change bills.");
            if (!d.vendorName.trim()) return this.formError("Choose the vendor.");
            const items = b.items.filter(it => String(it.name || "").trim() || num(it.rate));
            if (!items.length) return this.formError("Add at least one line with an amount.");
            if (d.currency !== "AED" && !(num(d.rate) > 0)) return this.formError(`Enter the exchange rate for ${d.currency}.`);
            const obj = { ...b, ...d, items: items.map(it => ({ ...it, qty: num(it.qty), rate: num(it.rate), vat: num(it.vat) })), rate: d.currency === "AED" ? 1 : num(d.rate), reverseCharge: !!d.reverseCharge };
            if (!isBill) {
                delete obj.due;
                if (obj.billId) {
                    const bill = (Server.fin.bill || []).find(x => x.id === obj.billId);
                    const total = computeTotals({ ...obj, type: "bill", paid: 0, fx: {} }).total;
                    const mine = editing && editing.billId === obj.billId ? num(editing.appliedAmount ?? total) : 0;
                    const room = bill ? round(this.billBalance(bill) + mine, 2) : total;
                    obj.appliedAmount = d.appliedAmount === "" ? Math.min(total, room) : num(d.appliedAmount);
                    if (obj.appliedAmount > room + 0.001) return this.formError(`Only ${fmt(room, obj.currency)} is still owed on that bill.`);
                } else obj.appliedAmount = "";
            }
            const saved = await this.saveRecord(kind, obj, { label: isBill ? "Saved bill" : "Saved vendor credit" });
            if (saved) {
                if (po && isBill && po.type === "purchaseOrder" && po.status !== "received") { const p2 = { ...po, status: "received" }; Store.saveDoc(p2); }
                // A credit note document that was really received from a vendor now lives here: take it out of sales so it counts once
                if (po && !isBill && !editing && po.type === "creditNote" && po.status !== "cancelled") {
                    try { Store.saveDoc({ ...po, status: "cancelled", notes: [po.notes, `Recorded as vendor credit ${saved.number || ""}.`].filter(Boolean).join("\n") }); toast(`Credit note ${po.number} was moved to Vendor credits and cancelled on the sales side, so it is only counted once.`, "good", 7000); } catch { /* the vendor credit is saved either way */ }
                }
                location.hash = isBill ? "#finance/bills" : "#finance/vendor-credits";
            }
        }, { cancel: isBill ? "#finance/bills" : "#finance/vendor-credits", onDelete: () => this.deleteRecord(kind, b, `${isBill ? "bill" : "vendor credit"} ${b.number || ""}`, isBill ? "#finance/bills" : "#finance/vendor-credits") });
        if (editing && isBill && b.status !== "void" && canEdit) {
            const v = document.createElement("button"); v.type = "button"; v.className = "btn btn-ghost"; v.innerHTML = `<span>Void bill</span>`;
            v.addEventListener("click", async () => { if (!await confirmDialog("Void this bill? It stays on file but no longer counts as owed.", "Void bill", true, "Void")) return; await this.saveRecord("bill", { ...b, status: "void" }, { back: "#finance/bills", label: "Voided bill" }); });
            $(".fin-form-actions .push").before(v);
        }
    },

    /* Receipts and attachments stored in R2 */
    renderAttachments(box, obj, canEdit, single = false) {
        obj.attachments = obj.attachments || [];
        const draw = () => {
            box.innerHTML = `<div class="sub-title">${single ? "Receipt" : "Attachments"}</div>
<div class="attach-list">${obj.attachments.map((a, i) => `<span class="attach-chip"><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("file", 14)} ${esc(a.name)}</a>${canEdit ? `<button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove ${esc(a.name)}">${icon("x", 12)}</button>` : ""}</span>`).join("") || '<span class="muted">None</span>'}</div>
${canEdit ? `<label class="btn btn-ghost btn-sm">${icon("upload", 14)}<span>${single ? "Attach receipt" : "Attach file"}</span><input type="file" accept="image/*,application/pdf" hidden data-skip></label><span class="hint">PDF or photo, up to 10 MB.</span>` : ""}`;
            $$("[data-rm]", box).forEach(b => b.addEventListener("click", () => { obj.attachments.splice(Number(b.dataset.rm), 1); draw(); }));
            const inp = $("input[type=file]", box);
            inp && inp.addEventListener("change", async () => {
                const file = inp.files[0]; if (!file) return;
                const lbl = inp.closest("label"); lbl.classList.add("busy");
                try { const r = await Server.upload(file); obj.attachments.push({ key: r.key, url: r.url, name: r.name, type: r.type, size: r.size }); draw(); toast("File attached. Save to keep it.", "good"); }
                catch (e) { toast(e.message, "bad", 6000); lbl.classList.remove("busy"); }
            });
        };
        draw();
    },

    /* ---------- Payments made ---------- */
    pageBillPayments() {
        const list = (Server.fin.billPayment || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        $("#finMain").innerHTML = this.head("Payments made", "Money paid to vendors against their bills.", Server.can("purchases") ? this.link("Record payment", "#finance/bill-payment/new") : "") +
            this.table([
                { label: "Date", html: p => fmtDate(p.date) },
                { label: "Number", html: p => `<b>${esc(p.number || "")}</b>` },
                { label: "Vendor", html: p => esc(p.vendorName), cls: "who" },
                { label: "Bills", html: p => esc((p.allocations || []).map(a => (Server.fin.bill || []).find(b => b.id === a.billId)?.number || "?").join(", ")) || '<span class="muted">Advance</span>', cls: "who" },
                { label: "Paid from", html: p => esc(this.accountName(p.accountId)) },
                { label: "Amount", num: true, html: p => this.money(p.amount, p.currency) }
            ], list, { empty: "No payments made yet.", onRow: p => p.id });
        this.bindRows("#finance/bill-payment/");
    },
    formBillPayment(id) {
        const editing = id && id !== "new" ? (Server.fin.billPayment || []).find(p => p.id === id) : null;
        const fromBill = this.params.get("bill") ? (Server.fin.bill || []).find(b => b.id === this.params.get("bill")) : null;
        const banks = this.accounts().filter(a => !a.archived && (a.subtype === "bank" || a.subtype === "cash" || a.role === "director"));
        const cur = fromBill?.currency || "AED";
        const pre = this.params.get("prefill") && this._prefill && String(this._prefill.id).startsWith("bp") ? this._prefill : null;
        const back = this.params.get("back");
        const p = editing ? JSON.parse(JSON.stringify(editing)) : pre ? JSON.parse(JSON.stringify(pre)) : {
            id: uid("bp"), date: this.today(), vendorName: fromBill?.vendorName || "", currency: cur, rate: fromBill ? (cur === "AED" ? 1 : num(fromBill.rate) || this.rateFor(cur)) : 1,
            amount: fromBill ? this.billBalance(fromBill) : "", bankCharges: 0, accountId: (banks.find(a => a.currency === cur && a.subtype === "bank") || banks[0] || {}).id,
            method: "Bank transfer", reference: "", notes: "", allocations: fromBill ? [{ billId: fromBill.id, amount: this.billBalance(fromBill) }] : []
        };
        const canEdit = Server.can("purchases");
        $("#finMain").innerHTML = this.formShell(editing ? `Payment ${esc(p.number || "")}` : "Record payment made", fromBill ? `For bill ${esc(fromBill.number)} · ${esc(fromBill.vendorName)}` : "Money paid to a vendor. Apply it to their bills; anything left is an advance.", `
${canEdit ? "" : this.readonly()}
<div class="grid-3">
  ${this.field("Vendor", this.input("vendorName", p.vendorName, 'list="vendList" required'), { req: true })}
  ${this.field("Date paid", this.input("date", p.date, 'type="date" required'), { req: true })}
  ${this.field("Paid from", this.select("accountId", banks.map(a => [a.id, this.accountLabel(a)]), p.accountId), { hint: "Choose “Due to director” if the director paid personally." })}
  ${this.field("Currency", this.select("currency", this.currencyOptions(), p.currency))}
  ${this.field("Amount paid", this.input("amount", p.amount, 'type="number" step="any" inputmode="decimal" required'), { req: true })}
  ${this.field("Bank charges", this.input("bankCharges", p.bankCharges || 0, 'type="number" step="any" inputmode="decimal"'), { hint: "Fees your bank charged on top." })}
  <div data-fx>${this.field("Exchange rate (AED per 1)", this.input("rate", p.rate, 'type="number" step="any"'))}</div>
  ${this.field("Method", this.input("method", p.method, 'list="methodList"'))}
  ${this.field("Reference", this.input("reference", p.reference))}
</div>
${this.datalist("vendList", this.vendors())}${this.datalist("methodList", ["Bank transfer", "Cash", "Cheque", "Card"])}
<div class="alloc"><div class="alloc-head"><b>Apply to bills</b><span class="push"></span><button type="button" class="link-btn" id="autoApply">Apply oldest first</button></div><div id="allocList"></div><div class="alloc-sum" id="allocSum"></div></div>
${this.field("Notes", `<textarea name="notes" rows="2">${esc(p.notes || "")}</textarea>`, { cls: "mt" })}`, { canDelete: !!editing && canEdit });
        const f = $("#finForm");
        const render = () => {
            const d = this.readForm(f);
            const bills = this.openBills(d.vendorName, d.currency);
            (p.allocations || []).forEach(a => { const bl = (Server.fin.bill || []).find(x => x.id === a.billId); if (bl && !bills.includes(bl) && bl.currency === d.currency) bills.push(bl); });
            $("#allocList").innerHTML = bills.length ? `<table class="dtable alloc-table"><thead><tr><th>Bill</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Owed</th><th class="num">Pay</th></tr></thead><tbody>${bills.map(bl => {
                const mine = editing ? num((editing.allocations || []).find(a => a.billId === bl.id)?.amount) : 0;
                const owed = round(this.billBalance(bl) + mine, 2);
                const cur = num((p.allocations.find(a => a.billId === bl.id) || {}).amount);
                return `<tr><td><b>${esc(bl.number)}</b></td><td>${fmtDate(bl.date)}</td><td>${fmtDate(bl.due)}</td><td class="num">${fmt(this.billTotal(bl), bl.currency)}</td><td class="num">${fmt(owed, bl.currency)}</td><td class="num"><input class="alloc-in" data-bill="${bl.id}" data-max="${owed}" type="number" step="any" value="${cur || ""}" data-skip aria-label="Amount for ${esc(bl.number)}"></td></tr>`;
            }).join("")}</tbody></table>` : `<p class="muted">${d.vendorName ? `No open bills from ${esc(d.vendorName)} in ${esc(d.currency)}. The payment is recorded as an advance.` : "Choose the vendor to see their open bills."}</p>`;
            $$(".alloc-in").forEach(inp => inp.addEventListener("input", () => { p.allocations = p.allocations.filter(a => a.billId !== inp.dataset.bill); if (num(inp.value)) p.allocations.push({ billId: inp.dataset.bill, amount: num(inp.value) }); sum(); }));
            sum();
        };
        const sum = () => {
            const d = this.readForm(f);
            const applied = round(p.allocations.reduce((s, a) => s + num(a.amount), 0), 2), left = round(num(d.amount) - applied, 2);
            $("#allocSum").innerHTML = `<span>Paid <b>${esc(d.currency)} ${fmt(num(d.amount), d.currency)}</b></span><span>Applied <b>${fmt(applied, d.currency)}</b></span><span class="${left < 0 ? "bad-text" : left > 0 ? "warn-text" : ""}">${left < 0 ? `Over-applied by ${fmt(-left, d.currency)}` : left > 0 ? `${fmt(left, d.currency)} recorded as an advance` : "Fully applied"}</span>`;
            $("[data-fx]", f).hidden = d.currency === "AED";
        };
        f.vendorName.addEventListener("change", () => { p.allocations = []; render(); });
        f.currency.addEventListener("change", () => { p.allocations = []; f.rate.value = this.rateFor(f.currency.value); const a = banks.find(x => x.currency === f.currency.value && x.subtype === "bank"); if (a) f.accountId.value = a.id; render(); });
        f.amount.addEventListener("input", sum);
        $("#autoApply").addEventListener("click", () => { let left = num(f.amount.value); p.allocations = []; $$(".alloc-in").forEach(inp => { const a = Math.min(left, num(inp.dataset.max)); inp.value = a > 0 ? round(a, 2) : ""; if (a > 0) p.allocations.push({ billId: inp.dataset.bill, amount: round(a, 2) }); left = round(left - Math.max(0, a), 2); }); sum(); });
        render();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't record payments to vendors.");
            if (!d.vendorName.trim()) return this.formError("Choose the vendor.");
            if (!(num(d.amount) > 0)) return this.formError("Enter the amount paid.");
            const over = $$(".alloc-in").find(i => num(i.value) > num(i.dataset.max) + 1e-9);
            if (over) return this.formError("You applied more than is owed on one of the bills.");
            await this.saveRecord("billPayment", { ...p, ...d, amount: num(d.amount), bankCharges: num(d.bankCharges), rate: d.currency === "AED" ? 1 : num(d.rate), allocations: p.allocations.filter(a => num(a.amount) > 0) }, { back: back || (fromBill ? "#finance/bills" : "#finance/payments-made"), label: "Saved payment" });
        }, { cancel: back || (fromBill ? "#finance/bills" : "#finance/payments-made"), onDelete: () => this.deleteRecord("billPayment", p, `payment ${p.number}`, "#finance/payments-made") });
    },

    /* ==========================================================
       EXPENSES
       ========================================================== */
    pageExpenses() {
        const mine = !Server.can("purchases") && !Server.canSee("purchases");
        const list = (Server.fin.expense || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const q = (this.params.get("q") || "").toLowerCase();
        const rows = list.filter(e => !q || [e.number, e.vendorName, e.description, this.accountName(e.accountId)].join(" ").toLowerCase().includes(q));
        const month = this.today().slice(0, 7);
        const monthTotal = list.filter(e => (e.date || "").startsWith(month)).reduce((s, e) => s + this.expenseTotal(e) * (e.currency === "AED" ? 1 : num(e.rate) || 1), 0);
        $("#finMain").innerHTML = this.head(mine ? "My expenses" : "Expenses", mine ? "Expenses you paid for the business. Attach the receipt so they can be reimbursed." : `Day-to-day spending with receipts. AED ${fmt(monthTotal)} this month.`, this.link("New expense", "#finance/expense/new")) +
            this.searchBox("Search vendor, category or description") +
            this.table([
                { label: "Date", html: e => fmtDate(e.date) },
                { label: "Category", html: e => esc(this.accountName(e.accountId)) },
                { label: "Vendor / description", html: e => `${esc(e.vendorName || "")}${e.description ? `<div class="small muted">${esc(e.description)}</div>` : ""}`, cls: "who" },
                { label: "Paid through", html: e => esc(this.accountName(e.paidThrough)) },
                { label: "Receipt", html: e => (e.attachments || []).length ? `<a href="${esc(e.attachments[0].url)}" target="_blank" rel="noopener" title="${esc(e.attachments[0].name)}">${icon("file", 14)}</a>` : '<span class="muted">—</span>' },
                { label: "Amount", num: true, html: e => this.money(this.expenseTotal(e), e.currency) }
            ], rows, { empty: "No expenses yet. Snap a photo of a receipt and record it here.", onRow: e => e.id });
        this.bindRows("#finance/expense/");
        this.bindSearch();
    },
    formExpense(id) {
        const editing = id && id !== "new" ? (Server.fin.expense || []).find(e => e.id === id) : null;
        const canEdit = !editing || Server.can("purchases") || Server.can("accounting") || editing.created_by === Server.user.id;
        const staffOnly = !Server.can("accounting") && !Server.can("banking");
        const paid = this.accounts().filter(a => !a.archived && (staffOnly ? (a.subtype === "cash" || a.role === "director") : (a.subtype === "bank" || a.subtype === "cash" || a.role === "director" || a.role === "ap" || (a.type === "liability" && a.subtype === "current") || a.name.toLowerCase().includes("staff"))));
        const e = editing ? JSON.parse(JSON.stringify(editing)) : {
            id: uid("exp"), date: this.today(), accountId: "acc_6190", amount: "", vatRate: Store.settings.defaults.vat, inclusive: true, currency: "AED", rate: 1,
            paidThrough: staffOnly ? (this.role("director") || {}).id : (this.role("cash") || paid[0] || {}).id, vendorName: "", description: "", reference: "", attachments: []
        };
        $("#finMain").innerHTML = this.formShell(editing ? `Expense ${esc(e.number || "")}` : "New expense", "Record a business expense. Amounts include VAT unless you untick the box.", `
${canEdit ? "" : this.readonly()}
<div class="grid-3">
  ${this.field("Date", this.input("date", e.date, 'type="date" required'), { req: true })}
  ${this.field("Category", this.select("accountId", this.accountOptions(a => a.type === "expense" || (a.type === "asset" && a.subtype === "fixed")), e.accountId), { req: true })}
  ${this.field("Paid through", this.select("paidThrough", paid.map(a => [a.id, this.accountLabel(a)]), e.paidThrough), { hint: staffOnly ? "Choose “Due to director” or ask your accountant if you paid personally." : "" })}
  ${this.field("Amount", this.input("amount", e.amount, 'type="number" step="any" inputmode="decimal" required'), { req: true })}
  ${this.field("VAT %", this.input("vatRate", e.vatRate, 'type="number" step="any"'), { hint: "0 if the receipt shows no VAT or the vendor isn't VAT-registered." })}
  <label class="check"><input type="checkbox" name="inclusive" ${e.inclusive ? "checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Amount includes VAT</span></label>
  ${this.field("Currency", this.select("currency", this.currencyOptions(), e.currency))}
  <div data-fx>${this.field("Exchange rate (AED per 1)", this.input("rate", e.rate, 'type="number" step="any"'))}</div>
  ${this.field("Vendor", this.input("vendorName", e.vendorName, 'list="vendList"'))}
  ${this.field("Description", this.input("description", e.description, 'placeholder="e.g. Taxi to client meeting"'), { cls: "span-2" })}
  ${this.field("Receipt or reference no.", this.input("reference", e.reference))}
</div>
${this.datalist("vendList", this.vendors())}
<div class="sum-box exp-sum" id="expSum"></div>
<div class="attach" id="attachBox"></div>`, { canDelete: !!editing && canEdit });
        const f = $("#finForm");
        const calc = () => {
            const d = this.readForm(f);
            const dec = decimalsFor(d.currency), amt = round(num(d.amount), dec), v = num(d.vatRate);
            const net = d.inclusive ? round(amt / (1 + v / 100), dec) : amt, vat = d.inclusive ? round(amt - net, dec) : round(amt * v / 100, dec);
            $("#expSum").innerHTML = `<div class="sum-row"><span>Before VAT</span><span>${fmt(net, d.currency)}</span></div><div class="sum-row"><span>VAT (recoverable)</span><span>${fmt(vat, d.currency)}</span></div><div class="sum-row sum-total"><span>Total paid</span><span>${esc(d.currency)} ${fmt(net + vat, d.currency)}</span></div>`;
            $("[data-fx]", f).hidden = d.currency === "AED";
        };
        $$("input, select", f).forEach(x => x.addEventListener("input", calc));
        f.currency.addEventListener("change", () => { f.rate.value = this.rateFor(f.currency.value); calc(); });
        this.renderAttachments($("#attachBox"), e, canEdit, true);
        calc();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("You can only change your own expenses.");
            if (!(num(d.amount) > 0)) return this.formError("Enter the amount.");
            if (d.currency !== "AED" && !(num(d.rate) > 0)) return this.formError(`Enter the exchange rate for ${d.currency}.`);
            await this.saveRecord("expense", { ...e, ...d, amount: num(d.amount), vatRate: num(d.vatRate), inclusive: !!d.inclusive, rate: d.currency === "AED" ? 1 : num(d.rate) }, { back: "#finance/expenses", label: "Saved expense" });
        }, { cancel: "#finance/expenses", onDelete: () => this.deleteRecord("expense", e, `expense ${e.number}`, "#finance/expenses") });
    },

    /* ==========================================================
       ACCOUNTANT
       ========================================================== */
    async pageAccounts() {
        const main = $("#finMain");
        const types = [["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"], ["income", "Income"], ["expense", "Expenses"]];
        let balances = {};
        try { const tb = await Server.get(`reports/trial_balance?to=${this.today()}`); tb.rows.forEach(r => { balances[r.id] = r.debit - r.credit; }); } catch { /* balances optional */ }
        if (this.sub !== "accounts") return;
        const showArchived = this.params.get("archived") === "1";
        main.innerHTML = this.head("Chart of accounts", "Every amount in the books is recorded against one of these accounts.", `${this.link(showArchived ? "Hide archived" : "Show archived", showArchived ? "#finance/accounts" : "#finance/accounts?archived=1", "btn-ghost", null)}${Server.can("accounting") ? this.link("New account", "#finance/account/new") : ""}`) +
            types.map(([t, label]) => {
                const list = this.accounts().filter(a => a.type === t && (showArchived || !a.archived));
                return `<h2 class="fin-h2">${label}</h2>` + this.table([
                    { label: "Code", html: a => esc(a.code || "") },
                    { label: "Name", html: a => `<b>${esc(a.name)}</b>${a.archived ? ' <span class="pill pill-mute">Archived</span>' : ""}${a.system ? ' <span class="pill pill-neutral" title="Used by the system for automatic postings">System</span>' : ""}` },
                    { label: "Type", html: a => esc(a.subtype || "") },
                    { label: "Currency", html: a => esc(a.currency || "AED") },
                    { label: "Balance (AED)", num: true, html: a => { const v = balances[a.id] || 0; const n = t === "asset" || t === "expense" ? v : -v; return v ? `<a href="#finance/report/general_ledger?account=${a.id}">${fmt(n)}</a>` : '<span class="muted">0.00</span>'; } }
                ], list, { onRow: a => a.id });
            }).join("");
        this.bindRows("#finance/account/");
    },
    formAccount(id) {
        const editing = id && id !== "new" ? this.acc(id) : null;
        const a = editing ? { ...editing } : this.params.get("bank") ? { id: uid("acc_"), code: "", name: "", type: "asset", subtype: "bank", currency: "AED", archived: false, description: "" } : { id: uid("acc_"), code: "", name: "", type: "expense", subtype: "operating", currency: "AED", archived: false, description: "" };
        const subs = { asset: [["bank", "Bank"], ["cash", "Cash"], ["receivable", "Receivable"], ["current", "Other current asset"], ["inventory", "Inventory"], ["fixed", "Fixed asset"], ["tax", "Tax"]], liability: [["payable", "Payable"], ["current", "Other current liability"], ["tax", "Tax"], ["longterm", "Long-term liability"]], equity: [["equity", "Equity"]], income: [["operating", "Operating income"], ["other", "Other income"]], expense: [["operating", "Operating expense"], ["cogs", "Cost of goods sold"], ["other", "Other expense"]] };
        const canEdit = Server.can("accounting");
        $("#finMain").innerHTML = this.formShell(editing ? esc(a.name) : "New account", editing?.system ? "This account is used for automatic postings. You can rename it but not change its type." : "", `
${canEdit ? "" : this.readonly()}
<div class="grid-2">
  ${this.field("Code", this.input("code", a.code, 'placeholder="e.g. 6200"'))}
  ${this.field("Name", this.input("name", a.name, "required"), { req: true })}
  ${this.field("Type", this.select("type", [["asset", "Asset"], ["liability", "Liability"], ["equity", "Equity"], ["income", "Income"], ["expense", "Expense"]], a.type, editing?.system ? "disabled" : ""))}
  ${this.field("Detail type", `<select name="subtype" id="accSub"${editing?.system ? " disabled" : ""}></select>`)}
  ${this.field("Currency", this.select("currency", this.currencyOptions(), a.currency, editing ? "disabled" : ""), { hint: editing ? "The currency can't change once the account exists." : "Foreign-currency bank accounts keep their balance in that currency." })}
  ${this.field("Description", this.input("description", a.description || ""))}
  <label class="check span-2"><input type="checkbox" name="archived" ${a.archived ? "checked" : ""}${editing?.system ? " disabled" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Archived<small>Hidden from lists; past transactions stay.</small></span></label>
</div>`, { canDelete: !!editing && !editing.system && canEdit });
        const f = $("#finForm");
        const fill = () => { $("#accSub").innerHTML = (subs[f.type.value] || []).map(([v, l]) => `<option value="${v}"${v === a.subtype ? " selected" : ""}>${l}</option>`).join(""); };
        f.type.addEventListener("change", fill); fill();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't change the chart of accounts.");
            const obj = { ...a, ...d, archived: !!d.archived };
            if (editing?.system) { obj.type = a.type; obj.subtype = a.subtype; obj.archived = false; }
            if (editing) obj.currency = a.currency;
            await this.saveRecord("account", obj, { back: "#finance/accounts", label: "Saved account" });
        }, { cancel: "#finance/accounts", onDelete: () => this.deleteRecord("account", a, `account ${a.name}`, "#finance/accounts") });
    },

    pageJournals() {
        const list = (Server.fin.journal || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        $("#finMain").innerHTML = this.head("Manual journals", "Adjustments made directly in the ledger: opening balances, accruals, depreciation, corrections.", Server.can("accounting") ? this.link("New journal", "#finance/journal/new") : "") +
            this.table([
                { label: "Date", html: j => fmtDate(j.date) },
                { label: "Number", html: j => `<b>${esc(j.number || "")}</b>` },
                { label: "Notes", html: j => esc(j.notes || ""), cls: "who" },
                { label: "Amount", num: true, html: j => fmt((j.lines || []).reduce((s, l) => s + num(l.debit), 0)) }
            ], list, { empty: "No manual journals.", onRow: j => j.id });
        this.bindRows("#finance/journal/");
    },
    formJournal(id) {
        const editing = id && id !== "new" ? (Server.fin.journal || []).find(j => j.id === id) : null;
        const j = editing ? JSON.parse(JSON.stringify(editing)) : { id: uid("jv"), date: this.today(), notes: "", lines: [{ accountId: "", debit: "", credit: "", memo: "", contactName: "" }, { accountId: "", debit: "", credit: "", memo: "", contactName: "" }] };
        const canEdit = Server.can("accounting");
        const opts = [["", "Choose account…"], ...this.accountOptions(() => true)];
        $("#finMain").innerHTML = this.formShell(editing ? `Journal ${esc(j.number || "")}` : "New manual journal", "Debits must equal credits. Amounts are in AED.", `
${canEdit ? "" : this.readonly()}
<div class="grid-2">
  ${this.field("Date", this.input("date", j.date, 'type="date" required'), { req: true })}
  ${this.field("Notes", this.input("notes", j.notes, 'placeholder="What this journal is for"'))}
</div>
<div class="jv-lines" id="jvLines"></div>
<button type="button" class="btn btn-ghost btn-sm" id="jvAdd">${icon("plus", 14)}<span>Add line</span></button>
<div class="alloc-sum" id="jvSum"></div>`, { canDelete: !!editing && canEdit });
        const draw = () => {
            $("#jvLines").innerHTML = `<div class="jv-head"><span>Account</span><span>Description</span><span>Contact</span><span class="num">Debit</span><span class="num">Credit</span><span></span></div>` + j.lines.map((l, i) => `
<div class="jv-row" data-i="${i}">
  <select data-k="accountId" data-skip aria-label="Line ${i + 1} account">${opts.map(([v, lab]) => `<option value="${v}"${v === l.accountId ? " selected" : ""}>${esc(lab)}</option>`).join("")}</select>
  <input data-k="memo" data-skip value="${esc(l.memo || "")}" aria-label="Description">
  <input data-k="contactName" data-skip value="${esc(l.contactName || "")}" list="jvContacts" aria-label="Contact">
  <input data-k="debit" data-skip class="num" type="number" step="any" value="${esc(l.debit)}" aria-label="Debit">
  <input data-k="credit" data-skip class="num" type="number" step="any" value="${esc(l.credit)}" aria-label="Credit">
  <button type="button" class="icon-btn" data-del="${i}" aria-label="Remove line">${icon("x")}</button>
</div>`).join("") + this.datalist("jvContacts", [...this.customers(), ...this.vendors()]);
            $$(".jv-row").forEach(row => $$("[data-k]", row).forEach(el => el.addEventListener("input", () => {
                const l = j.lines[Number(row.dataset.i)];
                l[el.dataset.k] = el.value;
                if (el.dataset.k === "debit" && num(el.value)) { l.credit = ""; $("[data-k=credit]", row).value = ""; }
                if (el.dataset.k === "credit" && num(el.value)) { l.debit = ""; $("[data-k=debit]", row).value = ""; }
                sum();
            })));
            $$("#jvLines [data-del]").forEach(b => b.addEventListener("click", () => { if (j.lines.length > 2) { j.lines.splice(Number(b.dataset.del), 1); draw(); } }));
            sum();
        };
        const sum = () => {
            const d = round(j.lines.reduce((s, l) => s + num(l.debit), 0), 2), c = round(j.lines.reduce((s, l) => s + num(l.credit), 0), 2);
            $("#jvSum").innerHTML = `<span>Debits <b>${fmt(d)}</b></span><span>Credits <b>${fmt(c)}</b></span><span class="${d === c && d > 0 ? "good-text" : "bad-text"}">${d === c ? (d > 0 ? "Balanced" : "") : `Out by ${fmt(Math.abs(d - c))}`}</span>`;
        };
        $("#jvAdd").addEventListener("click", () => { j.lines.push({ accountId: "", debit: "", credit: "", memo: "", contactName: "" }); draw(); });
        draw();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't post journals.");
            const lines = j.lines.filter(l => l.accountId && (num(l.debit) || num(l.credit))).map(l => ({ ...l, debit: num(l.debit), credit: num(l.credit) }));
            const dr = round(lines.reduce((s, l) => s + l.debit, 0), 2), cr = round(lines.reduce((s, l) => s + l.credit, 0), 2);
            if (lines.length < 2) return this.formError("A journal needs at least two lines with an account and an amount.");
            if (dr !== cr) return this.formError(`Debits (${fmt(dr)}) and credits (${fmt(cr)}) must be equal.`);
            await this.saveRecord("journal", { ...j, ...d, lines }, { back: "#finance/journals", label: "Saved journal" });
        }, { cancel: "#finance/journals", onDelete: () => this.deleteRecord("journal", j, `journal ${j.number}`, "#finance/journals") });
    },

    pageTransfers() {
        const list = (Server.fin.transfer || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        $("#finMain").innerHTML = this.head("Transfers", "Money moved between your own bank and cash accounts, including currency conversions.", Server.can("banking") ? this.link("New transfer", "#finance/transfer/new") : "") +
            this.table([
                { label: "Date", html: t => fmtDate(t.date) },
                { label: "Number", html: t => `<b>${esc(t.number || "")}</b>` },
                { label: "From", html: t => `${esc(this.accountName(t.fromAccount))} <span class="muted">${fmt(num(t.fromAmount), this.acc(t.fromAccount)?.currency)}</span>` },
                { label: "To", html: t => `${esc(this.accountName(t.toAccount))} <span class="muted">${fmt(num(t.toAmount) || num(t.fromAmount), this.acc(t.toAccount)?.currency)}</span>` },
                { label: "Notes", html: t => esc(t.memo || ""), cls: "who" }
            ], list, { empty: "No transfers.", onRow: t => t.id });
        this.bindRows("#finance/transfer/");
    },
    formTransfer(id) {
        const editing = id && id !== "new" ? (Server.fin.transfer || []).find(t => t.id === id) : null;
        const banks = this.bankAccounts();
        const t = editing ? { ...editing } : { id: uid("trf"), date: this.today(), fromAccount: banks[0]?.id, toAccount: banks[1]?.id, fromAmount: "", toAmount: "", rateFrom: "", rateTo: "", fee: 0, memo: "", bankTxnId: this.params.get("txn") || "" };
        if (!editing && this.params.get("amount")) { const a = num(this.params.get("amount")); if (a < 0) { t.fromAccount = this.params.get("account"); t.fromAmount = -a; } else { t.toAccount = this.params.get("account"); t.toAmount = a; t.fromAmount = a; } }
        const canEdit = Server.can("banking");
        $("#finMain").innerHTML = this.formShell(editing ? `Transfer ${esc(t.number || "")}` : "New transfer", "Moving money between your own accounts. For a currency conversion, enter both amounts; the difference from the booked rate is recorded as exchange gain or loss.", `
${canEdit ? "" : this.readonly()}
<div class="grid-2">
  ${this.field("Date", this.input("date", t.date, 'type="date" required'))}
  ${this.field("Notes", this.input("memo", t.memo))}
  ${this.field("From account", this.select("fromAccount", banks.map(a => [a.id, this.accountLabel(a)]), t.fromAccount))}
  ${this.field("Amount sent", this.input("fromAmount", t.fromAmount, 'type="number" step="any" required'))}
  ${this.field("To account", this.select("toAccount", banks.map(a => [a.id, this.accountLabel(a)]), t.toAccount))}
  <div data-conv>${this.field("Amount received", this.input("toAmount", t.toAmount, 'type="number" step="any"'))}</div>
  <div data-ratefrom>${this.field("Rate of the sending currency (AED per 1)", this.input("rateFrom", t.rateFrom, 'type="number" step="any"'))}</div>
  <div data-rateto>${this.field("Rate of the receiving currency (AED per 1)", this.input("rateTo", t.rateTo, 'type="number" step="any"'))}</div>
  ${this.field("Transfer fee", this.input("fee", t.fee, 'type="number" step="any"'), { hint: "Charged by the sending bank, in its currency." })}
</div>`, { canDelete: !!editing && canEdit });
        const f = $("#finForm");
        const sync = () => {
            const fc = this.acc(f.fromAccount.value)?.currency || "AED", tc = this.acc(f.toAccount.value)?.currency || "AED";
            $("[data-conv]", f).hidden = fc === tc;
            $("[data-ratefrom]", f).hidden = fc === "AED";
            $("[data-rateto]", f).hidden = tc === "AED";
            if (fc !== "AED" && !f.rateFrom.value) f.rateFrom.value = this.rateFor(fc);
            if (tc !== "AED" && !f.rateTo.value) f.rateTo.value = this.rateFor(tc);
        };
        f.fromAccount.addEventListener("change", sync); f.toAccount.addEventListener("change", sync); sync();
        this.bindForm(async d => {
            if (!canEdit) return this.formError("Your role can't record transfers.");
            if (d.fromAccount === d.toAccount) return this.formError("Choose two different accounts.");
            const fc = this.acc(d.fromAccount)?.currency, tc = this.acc(d.toAccount)?.currency;
            const obj = { ...t, ...d, fromAmount: num(d.fromAmount), toAmount: fc === tc ? num(d.fromAmount) : num(d.toAmount), rateFrom: num(d.rateFrom), rateTo: num(d.rateTo), fee: num(d.fee) };
            const saved = await this.saveRecord("transfer", obj, { label: "Saved transfer" });
            if (saved) location.hash = t.bankTxnId ? `#finance/bank/${this.params.get("account") || d.fromAccount}` : "#finance/transfers";
        }, { cancel: "#finance/transfers", onDelete: () => this.deleteRecord("transfer", t, `transfer ${t.number}`, "#finance/transfers") });
    }
});
