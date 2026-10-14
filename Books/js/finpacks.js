/* Finance → Import documents: whole accounting packs.
   Ledger-and-journal packs (every voucher), salary slips, salary ledgers, commission ledgers,
   and financial statements (checked against the books). Extends FinImport in finimport.js. */
"use strict";

const PACK_KINDS = {
    pack: { label: "Accounting pack (journal vouchers)", short: "Journals pack" },
    payslips: { label: "Salary slips", short: "Salary slips" },
    salaryLedger: { label: "Salary ledger (one employee)", short: "Salary ledger" },
    commissionLedger: { label: "Commission ledger (payees)", short: "Commission ledger" },
    statements: { label: "Financial statements (check against the books)", short: "Statements" }
};
Object.assign(FI_KINDS, PACK_KINDS);

const PK = {
    MONTHS: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 },
    CUR: /\b(AED|USD|EUR|GBP|CHF|INR|SAR|QAR|OMR|KWD|BHD)\b/,
    isDash: t => /^[–—\-]+$/.test(String(t || "").trim()),
    amt(t) { const s = String(t || "").trim(); if (!s || PK.isDash(s)) return null; const neg = /^\(.*\)$/.test(s) || /^-/.test(s); const v = parseAmount(s.replace(/[()]/g, "")); return v === null ? null : (neg ? -Math.abs(v) : v); },
    monthISO(text) {
        const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})\b/i.exec(String(text || ""));
        if (m) return `${m[2]}-${String(PK.MONTHS[m[1].toLowerCase()]).padStart(2, "0")}`;
        const n = /\b(\d{4})-(0[1-9]|1[0-2])\b/.exec(String(text || ""));
        return n ? `${n[1]}-${n[2]}` : "";
    },
    monthEnd(p) { const [y, m] = p.split("-").map(Number); return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; },
    monthLabel(p) { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); },
    /* Page headers and footers: text that repeats on three pages or more */
    repeated(lines) {
        const seen = new Map();
        const byPage = new Map();
        for (const l of lines) { const a = byPage.get(l.page) || []; a.push(l); byPage.set(l.page, a); }
        for (const [, L] of byPage) for (const l of [...L.slice(0, 3), ...L.slice(-3)]) { const k = PK.norm(l.text); if (!k) continue; const s = seen.get(k) || new Set(); s.add(l.page); seen.set(k, s); }
        return new Set([...seen].filter(([, s]) => s.size >= 3).map(([k]) => k));
    },
    money: t => /^\(?-?[\d,]*\d\.\d{2}\)?$/.test(String(t || "").trim()),
    medianH(lines) { const hs = lines.map(l => l.h || 0).filter(Boolean).sort((a, b) => a - b); return hs.length ? hs[Math.floor(hs.length / 2)] : 0.012; },
    norm: t => String(t || "").replace(/\bpage\s*\d+(\s*(of|\/)\s*\d+)?/gi, "").replace(/\s+/g, " ").trim().toLowerCase(),
    lineAmounts(l, from = 0.55) { return l.cells.filter(c => c.x0 >= from).map(c => ({ c, v: PK.amt(c.text), dash: PK.isDash(c.text) })).filter(x => x.v !== null || x.dash); },
    /* Which of our bank accounts a piece of text names (bank name + currency) */
    bankFromText(text, cur) {
        const t = String(text || "").toLowerCase();
        const banks = Finance.bankAccounts().filter(a => a.subtype === "bank");
        const nameOf = a => { const b = (Store.settings.banks || []).find(x => x.id === a.bankId) || {}; return [a.name, a.label, b.name, b.label].join(" ").toLowerCase(); };
        const c = cur || (PK.CUR.exec(String(text || "").toUpperCase()) || [])[1] || "AED";
        const words = ["wio", "mashreq", "emirates nbd", "enbd", "adcb", "fab", "rakbank", "cbd", "dib", "adib", "hsbc", "citi", "standard chartered"].filter(w => t.includes(w));
        const hits = banks.filter(a => words.some(w => nameOf(a).includes(w)));
        return hits.find(a => (a.currency || "AED") === c) || (words.length ? hits[0] : null) || null;
    },
    accountTypeFromCode(code) {
        const n = parseInt(String(code || "").slice(0, 1), 10);
        return { 1: ["asset", "current"], 2: ["liability", "current"], 3: ["equity", "equity"], 4: ["income", "operating"], 5: ["expense", "cogs"], 6: ["expense", "operating"], 7: ["expense", "operating"], 8: ["expense", "other"], 9: ["income", "other"] }[n] || ["expense", "operating"];
    },
    /* An account named in a pack → one of ours (structural ones by role, banks by name, the rest by name) or a new one */
    resolveAccount(code, name) {
        const s = String(name || "").trim();
        const low = s.toLowerCase();
        const accs = (Server.fin.account || []).filter(a => !a.archived);
        const byRole = r => accs.find(a => a.role === r) || null;
        if (/\bbank\b|\bwio\b|mashreq|enbd|adcb|rakbank/.test(low) && !/charge|fee|loan|clearing|transfer|suspense|interest/.test(low)) { const b = PK.bankFromText(s); if (b) return { account: b }; return { account: null, bank: true }; }
        const roles = [
            [/petty\s*cash|cash\s*(in\s*)?hand/, "cash"], [/receivable|debtor/, "ar"], [/accounts?\s*payable|trade\s*creditor/, "ap"],
            [/output\s*vat|vat\s*payable/, "vat_out"], [/input\s*vat|vat\s*recoverable/, "vat_in"], [/salar(y|ies)\s*payable|wages\s*payable/, "salaries_payable"],
            [/^salar(y|ies)\b|wages/, "salaries"], [/^commission/, "commission"], [/bank\s*(charges?|fees?|subscription)/, "bank_fees"], [/foreign\s*exchange|forex|\bfx\b|exchange\s*(gain|loss)/, "fx"],
            [/retained/, "retained"], [/opening\s*balance\s*equity/, "opening"], [/staff\s*advance|salary\s*advance/, "staff_adv"], [/^inventory|^stock/, "inventory"], [/customer\s*advance/, "cust_adv"], [/advances?\s*to\s*(vendor|supplier)/, "vendor_adv"]
        ];
        for (const [re, role] of roles) if (re.test(low)) { const a = byRole(role); if (a) return { account: a }; }
        const nn = t => String(t).toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
        const exact = accs.find(a => nn(a.name) === nn(s)) || (code && accs.find(a => String(a.code) === String(code) && nn(a.name).split(" ")[0] === nn(s).split(" ")[0]));
        if (exact) return { account: exact };
        const [type, subtype] = PK.accountTypeFromCode(code);
        // An account an earlier import created from a shorter description of the same thing ("Director hand loan")
        const sig = nn(s).split(" ").filter(w => w.length > 3 && !["account", "payable", "receivable"].includes(w));
        const prior = accs.find(a => /created by the document import/i.test(a.description || "") && a.type === type && sig.filter(w => nn(a.name).split(" ").includes(w)).length >= 2);
        if (prior) return { account: prior };
        // Keep the pack's code when free, otherwise the next free number in the same range
        let newCode = "";
        if (code && /^\d{3,6}$/.test(code)) { let n = Number(code); const taken = new Set((Server.fin.account || []).map(a => String(a.code))); while (taken.has(String(n)) && n < Number(code) + 99) n++; if (!taken.has(String(n))) newCode = String(n); }
        return { account: null, create: { id: uid("acc_"), code: newCode, name: s.slice(0, 80), type, subtype, currency: "AED", archived: false, description: "Created by the document import" } };
    },
    contactOf(name, narration) {
        const m = / [—–-] ([A-Z][A-Za-z.'&,]+(?: [A-Z][A-Za-z.'&,]+){0,5})\s*$/.exec(String(name || "").replace(/\(.*?\)/g, "").trim());
        if (m) return m[1].replace(/,$/, "");
        const n = /(?:\bto|\bfrom|[—–])\s+([A-Z][\w.'&]+(?: [A-Z(][\w.'&)]+){0,5})\s*(?:[—–·]|$)/.exec(String(narration || ""));
        return n ? n[1].replace(/\s*\(.*$/, "").trim() : "";
    }
};

Object.assign(FinImport, {
    /* ---------- Which pack is this? ---------- */
    detectPack(lines, text) {
        const low = text.toLowerCase();
        const T = lines.map(l => l.text);
        const voucherHead = T.some(t => /\bvoucher\b/i.test(t) && /\bdate\b/i.test(t) && /\bdebit\b/i.test(t) && /\bcredit\b/i.test(t));
        const vouchers = lines.filter(l => l.cells.length >= 2 && l.cells[0].x0 < 0.14 && /^[A-Z]{1,5}[-\/]?\d{2,6}[A-Z0-9\/-]*$/.test(l.cells[0].text.trim()) && findDates(l.cells[1].text, this._mf).length).length;
        if (voucherHead && vouchers >= 2) return "pack";
        if (/\b(salary|pay)\s*slip|payslip|salary\s*statement/.test(low) && /employee\s*name|employee\b/.test(low) && /net\s*(salary|pay)/.test(low) && !/salary\s*ledger/.test(low)) return "payslips";
        if (/salary\s*ledger|salary\s*account/.test(low) && /(monthly\s*salary\s*schedule|payment\s*register|salary\s*payable)/.test(low)) return "salaryLedger";
        if (/commission\s*ledger/.test(low) && /payee/.test(low)) return "commissionLedger";
        if (/financial\s*statements?|income\s*statement|statement\s*of\s*(financial\s*position|comprehensive\s*income)/.test(low) && /balance\s*sheet|financial\s*position/.test(low) && /total\s*(revenue|income)/.test(low)) return "statements";
        return null;
    },

    /* ---------- Journal pack: every voucher, plus the pack's own trial balance to check against ---------- */
    extractPack(it) {
        const lines = it.read.lines;
        const skip = PK.repeated(lines);
        const head = lines.find(l => /\bvoucher\b/i.test(l.text) && /\bdebit\b/i.test(l.text) && /\bcredit\b/i.test(l.text));
        const xD = head ? (c => c ? (c.x0 + c.x1) / 2 : 0.78)(head.cells.find(c => /debit/i.test(c.text))) : 0.78;
        const xC = head ? (c => c ? (c.x0 + c.x1) / 2 : 0.9)(head.cells.find(c => /credit/i.test(c.text))) : 0.9;
        const xNarr = head ? (c => c ? c.x0 : 0.26)(head.cells.find(c => /account|narration|particular/i.test(c.text))) : 0.26;
        const start = head ? lines.indexOf(head) : 0;
        const vouchers = [];
        let cur = null, pendingNarr = [];
        const isVoucherStart = l => l.cells.length >= 2 && l.cells[0].x0 < xNarr - 0.05 && /^[A-Z]{1,5}[-\/]?\d{2,6}[A-Z0-9\/-]*$/.test(l.cells[0].text.trim()) && findDates(l.cells[1].text, this._mf).length > 0;
        for (const l of lines.slice(start + 1)) {
            const txt = l.text.trim();
            if (!txt || skip.has(PK.norm(txt))) continue;
            if (/\bvoucher\b/i.test(txt) && /\bdebit\b/i.test(txt) && /\bcredit\b/i.test(txt)) continue;         // repeated column header
            if (/^\s*(journal\s*totals?|grand\s*total|totals?)\b/i.test(txt) || /^\s*\d{0,2}\s*(general\s*ledger|ledger\s*by\s*account|trial\s*balance|balance\s*sheet)\b/i.test(txt)) { if (vouchers.length) break; continue; }
            if (isVoucherStart(l)) {
                const d = findDates(l.cells[1].text, this._mf)[0].iso;
                const narr = l.cells.slice(2).map(c => c.text).join(" ").trim();
                cur = { ref: l.cells[0].text.trim(), date: d, narration: [...(narr ? [] : pendingNarr), narr].filter(Boolean).join(" "), lines: [], closed: false };
                if (!narr && pendingNarr.length) cur.narration = pendingNarr.join(" ");
                pendingNarr = [];
                vouchers.push(cur);
                continue;
            }
            const amts = PK.lineAmounts(l, Math.min(xD, xC) - 0.12);
            const vals = amts.filter(a => a.v !== null);
            if (!vals.length) {
                // Narration continued, or the narration of the next voucher written above its number
                const t = l.cells.filter(c => c.x0 >= xNarr - 0.04).map(c => c.text).join(" ").trim();
                if (!t) continue;
                if (cur && !cur.lines.length) cur.narration = [cur.narration, t].filter(Boolean).join(" ");
                else pendingNarr.push(t);
                continue;
            }
            if (!cur) continue;
            let debit = 0, credit = 0;
            for (const a of vals) { const mid = (a.c.x0 + a.c.x1) / 2; if (Math.abs(mid - xD) <= Math.abs(mid - xC)) debit = Math.abs(a.v); else credit = Math.abs(a.v); }
            if (vals.length === 1 && amts.length === 1) { const mid = (vals[0].c.x0 + vals[0].c.x1) / 2; if (Math.abs(mid - xD) < Math.abs(mid - xC)) { debit = Math.abs(vals[0].v); credit = 0; } else { credit = Math.abs(vals[0].v); debit = 0; } }
            const textCells = l.cells.filter(c => !amts.some(a => a.c === c));
            let name = textCells.map(c => c.text).join(" ").replace(/\s+/g, " ").trim();
            const code = (/^(\d{3,6})\s+/.exec(name) || [])[1] || "";
            if (code) name = name.slice(code.length).trim();
            // (USD 2,700.00) is the foreign amount; any other bracket is a note
            let fcCurrency = "", fcAmount = null, note = "";
            name = name.replace(/\(\s*(AED|USD|EUR|GBP|CHF|INR|SAR|QAR|OMR|KWD|BHD)\s*([\d,]+(?:\.\d+)?)\s*\)/i, (m, c, a) => { fcCurrency = c.toUpperCase(); fcAmount = parseAmount(a); return ""; }).replace(/\s+/g, " ").trim();
            // A trailing remark such as "(Conversion spread)" belongs to the line, not the account name
            const rem = /\s*\(([^()]{3,})\)\s*$/.exec(name);
            if (rem && !/^(AED|USD|EUR|GBP|CHF|INR|SAR)$/i.test(rem[1].trim()) && !/^(gain|loss|net|gross|after set-off)$/i.test(rem[1].trim())) { note = rem[1]; name = name.slice(0, rem.index).trim(); }
            if (!name) continue;
            cur.lines.push({ code, name, debit: round(debit, 2), credit: round(credit, 2), fcCurrency: fcCurrency !== "AED" ? fcCurrency : "", fcAmount: fcCurrency !== "AED" ? fcAmount : null, note });
            pendingNarr = [];
        }
        // The pack's trial balance (Code / Account / Debit / Credit), to check the vouchers against
        const tbHead = lines.find(l => /^\s*code\b/i.test(l.cells[0]?.text || "") && /debit/i.test(l.text) && /credit/i.test(l.text));
        const tb = [];
        if (tbHead) {
            const tD = (c => c ? (c.x0 + c.x1) / 2 : 0.78)(tbHead.cells.find(c => /debit/i.test(c.text))), tC = (c => c ? (c.x0 + c.x1) / 2 : 0.9)(tbHead.cells.find(c => /credit/i.test(c.text)));
            for (const l of lines.slice(lines.indexOf(tbHead) + 1)) {
                if (/^\s*totals?\b/i.test(l.text)) break;
                if (!/^\d{3,6}$/.test((l.cells[0] || {}).text.trim())) { if (l.cells[0]?.x0 < 0.12 && /^\d/.test(l.text) === false && tb.length) break; continue; }
                const amts = PK.lineAmounts(l, Math.min(tD, tC) - 0.12);
                let d = 0, c = 0;
                for (const a of amts.filter(a => a.v !== null)) { const mid = (a.c.x0 + a.c.x1) / 2; if (Math.abs(mid - tD) < Math.abs(mid - tC)) d = a.v; else c = a.v; }
                tb.push({ code: l.cells[0].text.trim(), name: l.cells.filter(c => c !== l.cells[0] && !amts.some(a => a.c === c)).map(c => c.text).join(" ").trim(), debit: round(d, 2), credit: round(c, 2) });
            }
        }
        // Accounts used, each mapped to ours or marked for creation
        const names = new Map();
        const keyOf = l => l.code ? "#" + l.code : l.name.toLowerCase();
        for (const v of vouchers) for (const l of v.lines) { const k = keyOf(l); if (!names.has(k)) names.set(k, { key: k, code: l.code, name: l.name, lines: 0 }); const a = names.get(k); a.lines++; if (l.name.length < a.name.length) a.name = l.name; }
        for (const r of tb) { const k = "#" + r.code; if (names.has(k) && r.name && r.name.length <= names.get(k).name.length + 4) names.get(k).name = r.name; }
        const accounts = [...names.values()].map(a => { const r = PK.resolveAccount(a.code, a.name); return { ...a, accountId: r.account?.id || "", create: r.create || null, bank: !!r.bank }; });
        const accIdOf = l => accounts.find(a => a.key === keyOf(l));
        for (const v of vouchers) { v.debit = round(v.lines.reduce((s, l) => s + l.debit, 0), 2); v.credit = round(v.lines.reduce((s, l) => s + l.credit, 0), 2); v.balanced = Math.abs(v.debit - v.credit) < 0.011; }
        const unbalanced = vouchers.filter(v => !v.balanced || v.lines.length < 2);
        const period = { from: vouchers.length ? vouchers.map(v => v.date).sort()[0] : "", to: vouchers.length ? vouchers.map(v => v.date).sort().slice(-1)[0] : "" };
        // Check: the vouchers add up to the pack's trial balance
        let tbCheck = null;
        if (tb.length) {
            const sums = new Map();
            for (const v of vouchers) for (const l of v.lines) { const k = l.code || l.name.toLowerCase(); sums.set(k, round((sums.get(k) || 0) + l.debit - l.credit, 2)); }
            const diffs = tb.filter(r => Math.abs((sums.get(r.code) || 0) - (r.debit - r.credit)) > 0.011).map(r => `${r.code} ${r.name}: vouchers ${fmt(sums.get(r.code) || 0)} vs trial balance ${fmt(r.debit - r.credit)}`);
            tbCheck = { ok: !diffs.length, diffs, total: round(tb.reduce((s, r) => s + r.debit, 0), 2) };
        }
        it.data = { vouchers, accounts, tb, tbCheck, period, total: round(vouchers.reduce((s, v) => s + v.debit, 0), 2), accIdOf, count: vouchers.length };
        if (!vouchers.length) it.issues.push("No journal vouchers found.");
        if (unbalanced.length) it.issues.push(`${unbalanced.length} voucher${unbalanced.length === 1 ? " doesn't" : "s don't"} balance (${unbalanced.slice(0, 4).map(v => v.ref).join(", ")}${unbalanced.length > 4 ? "…" : ""}).`);
        const toCreate = accounts.filter(a => a.create).length, toChoose = accounts.filter(a => !a.accountId && !a.create).length;
        if (toCreate) it.issues.push(`✓ ${toCreate} account${toCreate === 1 ? "" : "s"} from the pack will be added to your chart of accounts.`);
        if (toChoose) it.issues.push(`${toChoose} bank account${toChoose === 1 ? "" : "s"} to choose.`);
        if (tbCheck && tbCheck.ok) it.issues.push(`✓ The ${vouchers.length} vouchers agree with the pack's trial balance (${fmt(tbCheck.total)}).`);
        else if (tbCheck) it.issues.push(`The vouchers differ from the pack's trial balance: ${tbCheck.diffs.slice(0, 3).join("; ")}.`);
        const already = vouchers.filter(v => this.journalByRef(v.ref, v.date)).length;
        if (already) it.issues.push(`${already} voucher${already === 1 ? " is" : "s are"} already in the books and will be left out.`);
    },
    journalByRef(ref, date) { return (Server.fin.journal || []).find(j => j.reference && j.reference.toUpperCase() === String(ref).toUpperCase() && (!date || j.date === date)); },

    /* ---------- Salary slips: one per page ---------- */
    extractPayslips(it) {
        const lines = it.read.lines;
        const pages = [...new Set(lines.map(l => l.page))];
        const slips = [];
        const label = (L, re) => { for (const l of L) for (let i = 0; i < l.cells.length; i++) { const c = l.cells[i]; if (re.test(c.text)) { if (/^[A-Z\s]{8,}$/.test(c.text.trim()) && c.text.trim().split(/\s+/).length > 1) continue; const after = c.text.replace(re, "").replace(/^[\s:.\-]+/, "").trim(); const v = after || (l.cells[i + 1] ? l.cells[i + 1].text.trim() : ""); if (v && !/^(designation|date of joining|days paid|payment mode|employer)\b/i.test(v)) return v; } } return ""; };
        for (const p of pages) {
            const L = lines.filter(l => l.page === p);
            const text = L.map(l => l.text).join("\n");
            if (!/net\s*(salary|pay)/i.test(text)) continue;
            const s = this.parsePayslip(L, text, label);
            if (s) slips.push(s);
        }
        this.finishSlips(it, slips);
    },
    parsePayslip(L, text, label) {
        const name = label(L, /^employee(\s*name)?\b/i) || "";
        const designation = label(L, /^(designation|position|job\s*title)\b/i);
        const joined = (d => d ? d.iso : "")(findDates(label(L, /^(date\s*of\s*joining|joining\s*date|joined)\b/i), false)[0]);
        const period = PK.monthISO(label(L, /^pay\s*period\b/i)) || PK.monthISO((/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.exec(text) || [])[0]) || "";
        const earnings = [], deductions = [];
        const hdr = L.findIndex(l => l.cells.length >= 2 && l.cells.some(c => /^earnings?\b/i.test(c.text.trim())) && l.cells.some(c => /^(deductions?|aed|amount)\b/i.test(c.text.trim())));
        const xDed = hdr > -1 ? (c => c ? c.x0 : 0.5)(L[hdr].cells.find(c => /^deduction/i.test(c.text.trim()))) : 0.5;
        const typeE = t => /basic/i.test(t) ? "basic" : /accommodation|housing|rent/i.test(t) ? "housing" : /transport|conveyance/i.test(t) ? "transport" : /overtime/i.test(t) ? "overtime" : /commission/i.test(t) ? "commission" : /bonus/i.test(t) ? "bonus" : /reimburse/i.test(t) ? "reimbursement" : "allowance";
        const typeD = t => /advance|loan/i.test(t) ? "advance" : /unpaid|absen|leave\s*without/i.test(t) ? "unpaid" : "other";
        let net = null, gross = null, totalDed = 0;
        for (const l of L.slice(hdr > -1 ? hdr + 1 : 0)) {
            if (/net\s*(salary|pay)/i.test(l.text)) { const v = PK.amt((l.text.match(/[\d,]+\.\d{2}/g) || []).slice(-1)[0]); if (v !== null) net = v; break; }
            // Left half: earnings; right half: deductions. Each is "label  amount"
            const cells = l.cells;
            const groups = [cells.filter(c => c.x0 < xDed - 0.02), cells.filter(c => c.x0 >= xDed - 0.02)];
            groups.forEach((g, side) => {
                if (g.length < 2) return;
                const lab = g.slice(0, -1).map(c => c.text).join(" ").trim(), v = PK.amt(g[g.length - 1].text);
                if (v === null || !lab) return;
                if (/^gross/i.test(lab)) { if (side === 0) gross = v; return; }
                if (/^total\s*deduction/i.test(lab)) { totalDed = v; return; }
                if (side === 0) { if (v) earnings.push({ type: typeE(lab), label: lab.slice(0, 80), amount: round(v, 2) }); }
                else if (v) deductions.push({ type: typeD(lab), label: lab.slice(0, 80), amount: round(v, 2) });
            });
        }
        const payments = this.parsePayments(L);
        const settledM = /settled\s*(for\s*this\s*month)?\s*[:\-]?\s*([\d,]+\.\d{2})/i.exec(text), outM = /outstanding\s*(for\s*this\s*month)?\s*[:\-]?\s*([\d,]+\.\d{2})/i.exec(text);
        if (!name || !period || net === null) return null;
        return { name, designation, joined, period, earnings, deductions, gross: gross ?? round(earnings.reduce((s, e) => s + e.amount, 0), 2), net, payments, settled: settledM ? parseAmount(settledM[2]) : round(payments.reduce((s, x) => s + x.amount, 0), 2), outstanding: outM ? parseAmount(outM[2]) : null };
    },
    /* Payment rows in a slip or register: a dated line with an amount; the words around it say where it came from */
    parsePayments(L) {
        const h = L.findIndex(l => /payment\s*(status|register|history)|payments?\s*made/i.test(l.text));
        if (h < 0) return [];
        const body = L.slice(h + 1);
        const out = [];
        const used = new Set();
        const plain = n => n && !this.lineDate(n) && !n.cells.some(c => PK.money(c.text) && Math.abs(PK.amt(c.text)) >= 1) && !/^date\b/i.test(n.cells[0]?.text || "") && !/settled|outstanding|^\s*total/i.test(n.text);
        for (let i = 0; i < body.length; i++) {
            const l = body[i];
            if (/settled\s*for|outstanding|total\s*settled|^\s*total\b|months?\s*settled\s*$/i.test(l.text) && !this.lineDate(l)) { if (out.length) break; else continue; }
            const date = this.lineDate(l);
            const nums = l.cells.filter(c => PK.money(c.text)).map(c => PK.amt(c.text)).filter(v => v !== null && Math.abs(v) >= 1);
            if (date && nums.length) {
                const around = [];
                if (plain(body[i - 1]) && !used.has(i - 1)) { around.push(body[i - 1].text); used.add(i - 1); }
                if (plain(body[i + 1])) { around.push(body[i + 1].text); used.add(i + 1); }
                const words = [l.cells.filter(c => !this.isDateText(c.text) && PK.amt(c.text) === null).map(c => c.text).join(" "), ...around].join(" · ").replace(/\s+/g, " ");
                const jv = (/\b(JV[-\s]?\d{2,6}|voucher\s+([A-Z]{1,5}[-\/]?\d{2,6}))\b/i.exec(words) || [])[0] || "";
                const ref = (/\b(0\d{2}[A-Z]{3,4}\d{6,}[A-Z0-9]*|[A-Z]{2,5}\d{8,})\b/.exec(words) || [])[0] || "";
                out.push({ date, amount: round(Math.abs(nums[nums.length - 1]), 2), from: words.slice(0, 160), voucher: jv.replace(/^voucher\s+/i, "").replace(/\s/g, "").toUpperCase(), reference: ref, nonCash: /non-?cash|set-?off|journal\s*entry/i.test(words) });
            }
        }
        return out;
    },
    finishSlips(it, slips) {
        slips.sort((a, b) => a.period.localeCompare(b.period));
        const employees = [...new Set(slips.map(s => s.name))];
        const paidFrom = {}, nonCash = [];
        for (const s of slips) for (const p of s.payments) {
            const acc = this.paidFromAccount(p);
            const key = acc ? Finance.accountLabel(Finance.acc(acc)) : p.from.replace(/\b[0-9A-Z]{10,}\b/g, "").replace(/\bAE\d{2}[…\d]*\b/g, "").replace(/\bJV[-\s]?\d+\b/gi, "").replace(/\b(voucher|journal\s*entry|reference)\b/gi, "").replace(/[·–—()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Unknown";
            p.fromKey = key;
            if (!(key in paidFrom)) paidFrom[key] = acc;
            if (p.nonCash && !nonCash.includes(key)) nonCash.push(key);
        }
        it.data = { slips, employees, paidFrom, nonCash, total: round(slips.reduce((s, x) => s + x.gross, 0), 2), count: slips.length, period: { from: slips[0]?.period || "", to: slips[slips.length - 1]?.period || "" } };
        if (!slips.length) { it.issues.push("No salary slips could be read."); return; }
        for (const s of slips) if (Math.abs(round(s.gross - s.deductions.reduce((a, d) => a + d.amount, 0), 2) - s.net) > 0.011) it.issues.push(`${PK.monthLabel(s.period)}: earnings less deductions don't give the net salary shown.`);
        const dup = slips.filter(s => this.payrunFor(s.name, s.period));
        if (dup.length) it.issues.push(`${dup.length} month${dup.length === 1 ? " is" : "s are"} already in payroll and will be left out.`);
        const newEmp = employees.filter(n => !this.employeeByName(n));
        if (newEmp.length) it.issues.push(`✓ ${newEmp.join(", ")} will be added to Employees.`);
        const unknown = Object.entries(paidFrom).filter(([k, a]) => !a && !nonCash.includes(k)).map(([k]) => k);
        if (unknown.length) it.issues.push(`Choose the account for: ${unknown.map(u => `“${u.slice(0, 50)}”`).join(", ")}.`);
        const nc = nonCash.filter(k => !paidFrom[k]);
        if (nc.length) it.issues.push(`✓ Non-cash settlement (${nc.map(u => `“${u.slice(0, 40)}”`).join(", ")}): the matching account is used, or created if the books don't have it yet.`);
    },
    paidFromAccount(p) {
        if (p.nonCash) {
            const accs = (Server.fin.account || []).filter(a => !a.archived && a.type !== "income" && a.type !== "expense");
            const words = p.from.toLowerCase().replace(/\(.*?\)/g, " ").split(/[^a-z]+/).filter(w => w.length > 3 && !["from", "paid", "voucher", "journal", "entry", "settlement", "cash"].includes(w));
            const hit = accs.map(a => ({ a, n: words.filter(w => a.name.toLowerCase().includes(w)).length })).filter(x => x.n >= 2).sort((x, y) => y.n - x.n)[0];
            return hit ? hit.a.id : "";
        }
        const b = PK.bankFromText(p.from);
        if (b) return b.id;
        if (/cash/i.test(p.from) && !/non-?cash/i.test(p.from)) return (Finance.role("cash") || {}).id || "";
        return "";
    },
    employeeByName(name) { return (Server.fin.employee || []).find(e => Finance.sameName(e.name, name)); },
    payrunFor(name, period) { return (Server.fin.payrun || []).find(r => r.period === period && (r.lines || []).some(l => Finance.sameName(l.name, name))); },

    /* ---------- Salary ledger: terms, structure, monthly schedule and payment register → the same slips ---------- */
    extractSalaryLedger(it) {
        const lines = it.read.lines;
        const text = it.text;
        const label = (re) => { for (const l of lines.slice(0, 60)) for (let i = 0; i < l.cells.length; i++) { const c = l.cells[i]; if (re.test(c.text)) { const after = c.text.replace(re, "").replace(/^[\s:.\-]+/, "").trim(); const v = after || (l.cells[i + 1] ? l.cells[i + 1].text.trim() : ""); if (v) return v; } } return ""; };
        let name = label(/^employee(\s*name)?\b/i);
        if (!name) { const m = /salary\s*ledger\s*(?:and\s*account)?\s*[—–-]\s*([A-Z][\w.' ]+?)\s*(?:·|—|–|\n|$)/i.exec(text); name = m ? m[1].trim() : ""; }
        const designation = label(/^(designation|position)\b/i);
        const joined = (d => d ? d.iso : "")(findDates(label(/^(date\s*of\s*joining|joining\s*date|joined)\b/i), false)[0]);
        // Salary structure: component, monthly amount
        const structure = [];
        const sh = lines.findIndex(l => /component/i.test(l.text) && /monthly/i.test(l.text));
        if (sh > -1) for (const l of lines.slice(sh + 1, sh + 12)) { if (/^gross/i.test(l.text)) break; const v = PK.amt((l.cells[1] || {}).text); if (v !== null && l.cells.length >= 2) structure.push({ label: l.cells[0].text.trim(), amount: round(v, 2) }); }
        const typeE = t => /basic/i.test(t) ? "basic" : /accommodation|housing|rent/i.test(t) ? "housing" : /transport|conveyance/i.test(t) ? "transport" : "allowance";
        // Monthly schedule: Month, Basic, Allow., Gross, Ded., Net, Settled, Settled on, Outstanding
        const mh = lines.findIndex(l => /^month\b/i.test(l.cells[0]?.text || "") && /gross/i.test(l.text) && /net/i.test(l.text));
        const months = [];
        if (mh > -1) {
            const cols = lines[mh].cells.map(c => ({ x: (c.x0 + c.x1) / 2, k: /basic/i.test(c.text) ? "basic" : /allow/i.test(c.text) ? "allow" : /gross/i.test(c.text) ? "gross" : /ded/i.test(c.text) ? "ded" : /^net/i.test(c.text) ? "net" : /settled\s*on/i.test(c.text) ? "on" : /settled/i.test(c.text) ? "settled" : /outstanding|balance/i.test(c.text) ? "out" : "" }));
            for (const l of lines.slice(mh + 1)) {
                const per = PK.monthISO(l.cells[0]?.text || "");
                if (!per) { if (/^total/i.test(l.text)) break; continue; }
                const row = { period: per };
                for (const c of l.cells.slice(1)) { const col = cols.filter(x => x.k).sort((a, b) => Math.abs(a.x - (c.x0 + c.x1) / 2) - Math.abs(b.x - (c.x0 + c.x1) / 2))[0]; if (!col) continue; if (col.k === "on") row.on = c.text; else { const v = PK.amt(c.text); row[col.k] = v === null ? 0 : v; } }
                months.push(row);
            }
        }
        // Payment register: Date, JV, Paid from, Paid to, Reference, AED, Months settled
        const ph = lines.findIndex(l => /^date\b/i.test(l.cells[0]?.text || "") && /paid\s*from/i.test(l.text) && /(aed|amount)/i.test(l.text) && /months?\s*settled|allocation/i.test(l.text));
        const register = [];
        if (ph > -1) {
            const xAmt = (c => c ? (c.x0 + c.x1) / 2 : 0.7)(lines[ph].cells.find(c => /^(aed|amount)$/i.test(c.text.trim())));
            const xAlloc = (c => c ? c.x0 : 0.74)(lines[ph].cells.find(c => /months?\s*settled|allocation/i.test(c.text)));
            let cur = null;
            for (const l of lines.slice(ph + 1)) {
                if (/^\s*total\b/i.test(l.text) && !this.lineDate(l)) break;
                if (/^\s*\d+\s+[A-Z]/.test(l.text) && !this.lineDate(l) && cur) break;      // next section heading
                const date = this.lineDate(l);
                if (date) {
                    const amtCell = l.cells.filter(c => c.x0 < xAlloc - 0.02 && PK.amt(c.text) !== null && Math.abs(PK.amt(c.text)) >= 1).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - xAmt) - Math.abs((b.x0 + b.x1) / 2 - xAmt))[0];
                    if (!amtCell) continue;
                    const words = l.cells.filter(c => c !== amtCell && c.x0 < xAlloc - 0.02 && !this.isDateText(c.text)).map(c => c.text).join(" ");
                    cur = { date, amount: round(Math.abs(PK.amt(amtCell.text)), 2), from: words, voucher: ((/\b[A-Z]{1,5}[-\/]?\d{2,6}\b/.exec(words) || [])[0] || "").toUpperCase(), reference: (/\b(0\d{2}[A-Z]{3,4}\d{6,}[A-Z0-9]*|[A-Z]{2,5}\d{8,})\b/.exec(words) || [])[0] || "", nonCash: /non-?cash|set-?off|journal\s*entry/i.test(words), alloc: [] };
                    register.push(cur);
                }
                if (cur) {
                    for (const c of l.cells.filter(c => c.x0 >= xAlloc - 0.02)) { const m = /^(.+?)\s*:\s*([\d,]+\.\d{2})$/.exec(c.text.trim()); const per = m ? PK.monthISO(m[1]) : ""; if (per) cur.alloc.push({ period: per, amount: parseAmount(m[2]) }); }
                    if (!date) cur.from += " " + l.cells.filter(c => c.x0 < xAlloc - 0.02).map(c => c.text).join(" ");
                }
            }
        }
        // Build one slip per month
        const slips = months.map(m => {
            const gross = m.gross || (m.basic || 0) + (m.allow || 0);
            let earnings;
            if (structure.length && Math.abs(structure.reduce((s, x) => s + x.amount, 0) - gross) < 0.011) earnings = structure.map(x => ({ type: typeE(x.label), label: x.label.slice(0, 80), amount: x.amount }));
            else earnings = [{ type: "basic", label: "Basic salary", amount: round(m.basic || gross, 2) }, ...(m.allow ? [{ type: "allowance", label: "Allowances", amount: round(m.allow, 2) }] : [])];
            const deductions = m.ded ? [{ type: "other", label: "Deductions", amount: round(m.ded, 2) }] : [];
            const payments = register.filter(r => r.alloc.some(a => a.period === m.period)).map(r => { const a = r.alloc.find(a => a.period === m.period); return { date: r.date, amount: round(a.amount, 2), from: r.from.replace(/\s+/g, " ").trim(), voucher: r.voucher, reference: r.reference, nonCash: r.nonCash }; });
            return { name, designation, joined, period: m.period, earnings, deductions, gross: round(gross, 2), net: round(m.net || gross - (m.ded || 0), 2), payments, settled: round(m.settled || 0, 2), outstanding: m.out === undefined ? null : round(m.out, 2) };
        });
        if (!name) it.issues.push("No employee name found.");
        this.finishSlips(it, slips);
        it.data.register = register;
        const unalloc = register.filter(r => !r.alloc.length);
        if (unalloc.length) it.issues.push(`${unalloc.length} payment${unalloc.length === 1 ? "" : "s"} in the register say no month; they were left out.`);
    },

    /* ---------- Commission ledger: every bank line per payee ---------- */
    extractCommissionLedger(it) {
        const lines = it.read.lines;
        const skip = PK.repeated(lines);
        const rows = [];
        const med = PK.medianH(lines);
        let payee = "", inLedgers = false, headCols = null, ctx = [];
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i], txt = l.text.trim();
            if (!txt || skip.has(PK.norm(txt))) continue;
            if (/^\s*\d{0,2}\s*(payee\s*ledgers?|ledger\s*by\s*payee|payments\s*by\s*payee)\b/i.test(txt) && (l.h || 0) > med * 1.3) { inLedgers = true; continue; }
            if (inLedgers && /^\s*\d{1,2}\s+[A-Z][a-z]/.test(txt) && !this.lineDate(l) && rows.length) break;         // next numbered section
            if (!inLedgers) continue;
            if (/^date\b/i.test(l.cells[0]?.text || "") && /\b(aed|amount)\b/i.test(txt)) {
                headCols = { amt: (c => c ? (c.x0 + c.x1) / 2 : 0.8)(l.cells.filter(c => /^(aed|amount)$/i.test(c.text.trim())).slice(-1)[0]), run: (c => c ? (c.x0 + c.x1) / 2 : null)(l.cells.find(c => /running|balance|cumulative/i.test(c.text))), orig: (c => c ? (c.x0 + c.x1) / 2 : null)(l.cells.find(c => /original|foreign/i.test(c.text))) };
                continue;
            }
            const date = this.lineDate(l);
            if (!date) {
                // A payee heading: a name on its own line, no amounts
                const noAmt = !l.cells.some(c => PK.amt(c.text) !== null && Math.abs(PK.amt(c.text)) >= 1);
                if (noAmt && l.cells.length === 1 && l.cells[0].x0 < 0.2 && /^[A-Z][\w.'’…\- ]{2,60}$/.test(txt) && !/^(total|date|paid|running)/i.test(txt)) { payee = txt.replace(/…$/, "").trim(); ctx = []; continue; }
                if (/^\s*total/i.test(txt)) { ctx = []; continue; }
                ctx.push(l.cells.filter(c => PK.amt(c.text) === null || Math.abs(PK.amt(c.text)) < 1).map(c => c.text).join(" "));
                if (rows.length && ctx.length && lines[i - 1] && this.lineDate(lines[i - 1])) rows[rows.length - 1].note = (rows[rows.length - 1].note + " " + ctx[ctx.length - 1]).trim();
                continue;
            }
            if (!headCols || !payee) continue;
            const amts = l.cells.map(c => ({ c, v: PK.amt(c.text), mid: (c.x0 + c.x1) / 2 })).filter(x => x.v !== null && !this.isDateText(x.c.text));
            if (!amts.length) continue;
            const aed = amts.filter(x => headCols.run === null || Math.abs(x.mid - headCols.amt) < Math.abs(x.mid - headCols.run)).sort((a, b) => Math.abs(a.mid - headCols.amt) - Math.abs(b.mid - headCols.amt))[0];
            if (!aed) continue;
            const words = l.cells.filter(c => !amts.some(a => a.c === c) && !this.isDateText(c.text)).map(c => c.text).join(" ");
            const fx = /\b(USD|EUR|GBP|CHF|INR|SAR)\s*([\d,]+\.\d{2})\b/i.exec(l.text);
            rows.push({ payee, date, amount: round(aed.v, 2), fcCurrency: fx ? fx[1].toUpperCase() : "", fcAmount: fx ? parseAmount(fx[2]) : null, voucher: ((/\b(JV[-\s]?\d{2,6})\b/i.exec(words) || [])[1] || "").replace(/\s/g, "").toUpperCase(), reference: (/\b(0\d{2}[A-Z]{3,4}\d{6,}[A-Z0-9]*)\b/.exec(l.text) || [])[1] || "", from: words.replace(/\s+/g, " ").trim(), note: ctx.slice(-1).join(" ") });
            ctx = [];
        }
        // Reversed and re-sent: a negative line cancels its positive twin
        for (const r of rows.filter(r => r.amount < 0)) { const twin = rows.find(t => t !== r && t.payee === r.payee && Math.abs(t.amount + r.amount) < 0.011 && !t.cancelled && t.amount > 0); if (twin) { twin.cancelled = true; r.cancelled = true; } }
        const live = rows.filter(r => !r.cancelled);
        const payees = [...new Set(live.map(r => r.payee))];
        const paidFrom = {};
        for (const r of live) {
            const txt = (r.from + " " + r.note).replace(/\b[0-9A-Z]{10,}\b/g, "").replace(/\bJV[-\s]?\d+\b/gi, "").replace(/[–—·]/g, " ").replace(/\s+/g, " ").trim();
            const b = PK.bankFromText(txt, r.fcCurrency || undefined);
            const k = b ? Finance.accountLabel(b) : (txt || "Unknown account");
            r.fromKey = k;
            if (!(k in paidFrom)) paidFrom[k] = b ? b.id : "";
        }
        const account = Finance.role("commission") || (Server.fin.account || []).find(a => /commission/i.test(a.name) && a.type === "expense");
        it.data = { rows, payees, paidFrom, account: account?.id || "", total: round(live.reduce((s, r) => s + r.amount, 0), 2), count: live.length, period: { from: live.map(r => r.date).sort()[0] || "", to: live.map(r => r.date).sort().slice(-1)[0] || "" } };
        if (!rows.length) it.issues.push("No commission payments found.");
        const already = live.filter(r => r.voucher && this.journalByRef(r.voucher)).length;
        if (already) it.issues.push(`${already} payment${already === 1 ? " is" : "s are"} already in the ledger (journal pack) and will be left out.`);
        const unknown = Object.entries(paidFrom).filter(([, a]) => !a).map(([k]) => k);
        if (unknown.length) it.issues.push(`Choose the bank account for: ${unknown.map(u => `“${u.slice(0, 40)}”`).join(", ")}.`);
        const totalLine = /total\s*commission\s*(paid)?\s*[^\d]{0,40}([\d,]+\.\d{2})/i.exec(it.text);
        if (totalLine && Math.abs(parseAmount(totalLine[2]) - it.data.total) > 0.011) it.issues.push(`The payee lines add up to ${fmt(it.data.total)}, but the ledger says ${fmt(parseAmount(totalLine[2]))}.`);
        else if (totalLine) it.issues.push(`✓ The ${live.length} payments agree with the ledger total (${fmt(it.data.total)}).`);
    },

    /* ---------- Financial statements: figures to compare with the books ---------- */
    extractStatements(it) {
        const text = it.text, lines = it.read.lines;
        const pm = /for\s*the\s*(period|year)\s*(?:from\s*)?(.{6,24}?)\s*(?:to|–|-)\s*(.{6,24}?)(?:\n|\.|·)/i.exec(text);
        const ds = pm ? [findDates(pm[2])[0], findDates(pm[3])[0]] : [];
        const asOf = (/(?:as\s*at|period\s*ended|year\s*ended)\s*(.{6,24})/i.exec(text) || [])[1];
        const to = ds[1]?.iso || (asOf ? findDates(asOf)[0]?.iso : "") || "";
        const from = ds[0]?.iso || "";
        const sectionOf = l => l.text.trim();
        const figures = []; let section = "";
        const med = PK.medianH(lines);
        for (const l of lines) {
            const t = sectionOf(l);
            if ((l.h || 0) <= med * 1.3 && /^\s*\d{1,2}\s+[A-Z]/.test(t) && l.cells.length <= 2 && !PK.amt((l.cells[1] || {}).text)) continue;     // table of contents
            if (/^\s*\d{0,2}\s*(income\s*statement|profit\s*(and|&)\s*loss|statement\s*of\s*comprehensive\s*income)\b/i.test(t)) { section = "pl"; continue; }
            if (/^\s*\d{0,2}\s*(balance\s*sheet|statement\s*of\s*financial\s*position)\b/i.test(t)) { section = "bs"; continue; }
            if (/^\s*\d{0,2}\s*(statement\s*of\s*cash|cash\s*flow|changes\s*in\s*equity|taxable|notes?\s*to)/i.test(t)) { section = ""; continue; }
            if (!section) continue;
            const last = l.cells[l.cells.length - 1];
            const v = l.cells.length >= 2 ? PK.amt(last.text) : null;
            if (v === null || last.x0 < 0.5) continue;
            const name = l.cells.slice(0, -1).filter(c => !/^\d{1,2}$/.test(c.text.trim())).map(c => c.text).join(" ").replace(/\s+/g, " ").trim();
            if (!name || /^(note|aed)$/i.test(name)) continue;
            figures.push({ section, name, amount: round(v, 2), key: name.toLowerCase() });
        }
        const pick = re => figures.find(f => re.test(f.key));
        const keys = {
            revenue: pick(/^total\s*(revenue|income|sales)/), cogs: pick(/^total\s*cost\s*of\s*(sales|goods)/), gross: pick(/^gross\s*profit/), opex: pick(/^total\s*(operating\s*)?expenses/),
            net: pick(/^(net\s*)?(profit|loss)\s*(for|before|after)|^net\s*(profit|income|loss)/), cash: pick(/^(cash\s*(at|and)\s*bank|total\s*cash|cash\s*and\s*cash)/), assets: pick(/^total\s*assets/), liabilities: pick(/^total\s*liabilities/), equity: pick(/^total\s*equity/)
        };
        it.data = { from, to, figures, keys, total: keys.revenue?.amount || 0, count: figures.length, accounts: figures.filter(f => f.section === "pl" && !/^(total|gross|net|operating\s*profit)/.test(f.key)) };
        if (!to) it.issues.push("No period end date found.");
        if (!figures.length) it.issues.push("No figures found.");
        it.issues.push("✓ Statements are checked against the books, not posted: import the journals or opening balances first.");
    },

    /* ---------- Review ---------- */
    packBody(it, { inp, opt, allAcc, banks }) {
        const d = it.data || {}, k = it.kind, i = it.id;
        const bankOpts = banks.map(a => [a.id, Finance.accountLabel(a)]);
        if (k === "pack") {
            const vs = d.vouchers || [];
            const rows = d.accounts.map((a, n) => `<tr><td>${esc([a.code, a.name].filter(Boolean).join(" "))}<div class="small muted">${a.lines} line${a.lines === 1 ? "" : "s"}</div></td><td>${a.create ? `<span class="pill pill-info">New ${esc(a.create.type)} account</span>` : `<select data-pack-acc="${n}" data-id="${i}" class="${a.accountId ? "" : "need"}"><option value="">Choose…</option>${opt(a.bank ? bankOpts : allAcc, a.accountId)}</select>`}</td></tr>`).join("");
            return `<div class="fi-fields"><span class="fi-note"><b>${vs.length}</b> vouchers · ${fmtDate(d.period.from)} – ${fmtDate(d.period.to)} · Dr ${fmt(d.total)}${d.tbCheck ? d.tbCheck.ok ? ` · <span class="good-text">agrees with the pack's trial balance</span>` : ` · <span class="bad-text">differs from the pack's trial balance</span>` : ""}</span></div>
<details class="fi-details"><summary>Accounts (${d.accounts.length}) — ${d.accounts.filter(a => a.create).length} new, ${d.accounts.filter(a => !a.accountId && !a.create).length} to choose</summary><table class="fi-lines"><tbody>${rows}</tbody></table></details>
<details class="fi-details"><summary>Vouchers</summary><table class="fi-lines"><tbody>${vs.slice(0, 400).map(v => `<tr class="${v.balanced ? "" : "bad-row"}"><td><b>${esc(v.ref)}</b> ${fmtDate(v.date)}</td><td>${esc(v.narration.slice(0, 120))}</td><td class="num">${fmt(v.debit)}</td><td>${this.journalByRef(v.ref, v.date) ? Finance.pill("mute", "In the books") : v.balanced ? "" : Finance.pill("bad", "Unbalanced")}</td></tr>`).join("")}</tbody></table></details>`;
        }
        if (k === "payslips" || k === "salaryLedger") {
            const from = Object.entries(d.paidFrom || {});
            return `<div class="fi-fields"><span class="fi-note"><b>${d.slips.length}</b> month${d.slips.length === 1 ? "" : "s"} · ${d.employees.map(esc).join(", ")} · ${d.period.from ? PK.monthLabel(d.period.from) : ""} – ${d.period.to ? PK.monthLabel(d.period.to) : ""} · gross ${fmt(d.total)} · paid ${fmt(d.slips.reduce((s, x) => s + x.payments.reduce((a, p) => a + p.amount, 0), 0))}</span></div>
${from.length ? `<table class="fi-lines"><tbody>${from.map(([key, acc]) => `<tr><td>Paid from “${esc(key.slice(0, 70))}”</td><td><select data-pack-from="${esc(key)}" data-id="${i}" class="${acc ? "" : "need"}"><option value="">Choose account…</option>${opt(allAcc, acc)}</select></td></tr>`).join("")}</tbody></table>` : ""}
<details class="fi-details"><summary>Months</summary><table class="fi-lines"><tbody>${d.slips.map(s => `<tr><td><b>${PK.monthLabel(s.period)}</b> ${esc(s.name)}</td><td>${s.earnings.map(e => `${esc(e.label)} ${fmt(e.amount)}`).join(" · ")}${s.deductions.length ? ` · less ${s.deductions.map(e => `${esc(e.label)} ${fmt(e.amount)}`).join(", ")}` : ""}</td><td class="num">${fmt(s.net)}</td><td>${this.payrunFor(s.name, s.period) ? Finance.pill("mute", "In payroll") : s.outstanding ? Finance.pill("warn", `${fmt(s.outstanding)} owed`) : Finance.pill("good", "Settled")}</td></tr>`).join("")}</tbody></table></details>`;
        }
        if (k === "commissionLedger") {
            const from = Object.entries(d.paidFrom || {});
            const live = d.rows.filter(r => !r.cancelled);
            return `<div class="fi-fields"><label class="fi-wide">Expense account<select data-f="account" data-id="${i}" class="${d.account ? "" : "need"}"><option value="">Choose…</option>${opt(allAcc, d.account)}</select></label><span class="fi-note"><b>${live.length}</b> payments to ${d.payees.length} payee${d.payees.length === 1 ? "" : "s"} · ${fmtDate(d.period.from)} – ${fmtDate(d.period.to)} · ${fmt(d.total)}</span></div>
${from.length ? `<table class="fi-lines"><tbody>${from.map(([key, acc]) => `<tr><td>Paid from “${esc(key.slice(0, 60))}”</td><td><select data-pack-from="${esc(key)}" data-id="${i}" class="${acc ? "" : "need"}"><option value="">Choose bank account…</option>${opt(bankOpts, acc)}</select></td></tr>`).join("")}</tbody></table>` : ""}
<details class="fi-details"><summary>Payments</summary><table class="fi-lines"><tbody>${d.rows.map(r => `<tr class="${r.cancelled ? "muted" : ""}"><td>${fmtDate(r.date)} <b>${esc(r.payee)}</b></td><td>${esc(r.voucher)} ${esc(r.reference)}${r.fcCurrency ? ` · ${r.fcCurrency} ${fmt(r.fcAmount)}` : ""}</td><td class="num">${fmt(r.amount)}</td><td>${r.cancelled ? Finance.pill("mute", "Reversed") : r.voucher && this.journalByRef(r.voucher) ? Finance.pill("mute", "In the ledger") : ""}</td></tr>`).join("")}</tbody></table></details>`;
        }
        if (k === "statements") {
            const K = d.keys || {};
            return `<div class="fi-fields"><label>From${inp("from", d.from, 'type="date"')}</label><label>To${inp("to", d.to, 'type="date"')}</label><span class="fi-note">${["revenue", "cogs", "gross", "opex", "net", "cash", "assets", "liabilities", "equity"].filter(x => K[x]).map(x => `${esc(K[x].name)} ${fmt(K[x].amount)}`).join(" · ")}</span></div>`;
        }
        return "";
    },
    packProblems(it) {
        const d = it.data || {}, k = it.kind, p = [];
        if (k === "pack") { if (!d.vouchers?.length) p.push("vouchers"); if ((d.accounts || []).some(a => !a.accountId && !a.create)) p.push("bank accounts"); if ((d.vouchers || []).some(v => !v.balanced)) p.push("unbalanced vouchers"); }
        else if (k === "payslips" || k === "salaryLedger") { if (!d.slips?.length) p.push("slips"); if (Object.entries(d.paidFrom || {}).some(([k, a]) => !a && !(d.nonCash || []).includes(k))) p.push("paid from"); if (!(d.employees || []).length || d.employees.some(e => !e)) p.push("employee"); }
        else if (k === "commissionLedger") { if (!d.rows?.length) p.push("payments"); if (!d.account) p.push("expense account"); if (Object.values(d.paidFrom || {}).some(a => !a)) p.push("bank account"); }
        else if (k === "statements") { if (!d.to) p.push("period"); }
        return p;
    },
    bindPack() {
        const find = id => this.items.find(i => i.id === id);
        $$("#fiList [data-pack-acc]").forEach(s => s.addEventListener("change", () => { const it = find(s.dataset.id); it.data.accounts[Number(s.dataset.packAcc)].accountId = s.value; this.draw(); }));
        $$("#fiList [data-pack-from]").forEach(s => s.addEventListener("change", () => { const it = find(s.dataset.id); it.data.paidFrom[s.dataset.packFrom] = s.value; this.draw(); }));
    },
    /* Packs post in a fixed order: the journal pack first (it carries the ledger), then payroll records (which defer to vouchers already posted), then ledgers that cite them, then checks */
    packOrder(it) { return { pack: 0, journal: 1, tb: 1, payslips: 2, salaryLedger: 3, commissionLedger: 5, statements: 9 }[it.kind] ?? 4; },

    /* ---------- Into the books ---------- */
    async ensureAccounts(list) {
        for (const a of list) {
            if (a.accountId || !a.create) continue;
            const existing = (Server.fin.account || []).find(x => !x.archived && x.name.toLowerCase() === a.create.name.toLowerCase());
            if (existing) { a.accountId = existing.id; continue; }
            const res = await Server.save("account", a.create);
            a.accountId = res.object.id;
        }
    },
    async ensureEmployee(slip) {
        let e = this.employeeByName(slip.name);
        if (e) return e;
        const pay = { basic: 0, housing: 0, transport: 0, allowance: 0 };
        for (const x of slip.earnings) if (pay[x.type] !== undefined) pay[x.type] = round(pay[x.type] + x.amount, 2); else if (["allowance", "overtime", "reimbursement"].includes(x.type) === false) pay.allowance = round(pay.allowance + 0, 2);
        const code = `E${String((Server.fin.employee || []).length + 1).padStart(3, "0")}`;
        const res = await Server.save("employee", { id: uid("emp"), code, name: slip.name, designation: slip.designation || "", department: "", email: "", phone: "", joined: slip.joined || PK.monthEnd(slip.period).slice(0, 8) + "01", status: "active", pay, commissionRate: 0, commissionBase: "collected", userId: "", advanceInstallment: 0, bankName: "", iban: "", routingCode: "", personId: "", notes: "Added by the document import" });
        return res.object;
    },
    /* Is this voucher a salary accrual or salary payment that a pay run already records? */
    payrunCovers(v, accIdOf) {
        const ids = v.lines.map(l => accIdOf(l)?.accountId || "");
        const roleOf = id => ((Server.fin.account || []).find(a => a.id === id) || {}).role;
        const roles = ids.map(roleOf);
        const runs = Server.fin.payrun || [];
        const byRef = runs.find(r => (r.payments || []).some(p => p.reference && p.reference.toUpperCase() === v.ref.toUpperCase()) || (r.ledgerRefs || []).some(x => x.toUpperCase() === v.ref.toUpperCase()));
        if (byRef) return byRef;
        const accrual = roles.length === 2 && roles.includes("salaries") && roles.includes("salaries_payable");
        if (accrual) {
            const amt = v.debit, period = v.date.slice(0, 7);
            const who = v.lines.map(l => PK.contactOf(l.name, v.narration)).find(Boolean) || PK.contactOf("", v.narration);
            return runs.find(r => r.period === period && r.status !== "draft" && (r.lines || []).some(l => Math.abs(l.gross - amt) < 0.011 && (!who || Finance.sameName(l.name, who)))) || null;
        }
        const payment = roles.includes("salaries_payable") && v.lines.length === 2 && v.lines.find(l => roleOf(accIdOf(l)?.accountId) === "salaries_payable")?.debit > 0;
        if (payment) return runs.find(r => (r.payments || []).some(p => p.date === v.date && Math.abs(p.amount - v.debit) < 0.011)) || (runs.filter(r => r.payments?.length).find(r => { const same = runs.flatMap(x => x.payments || []).filter(p => p.date === v.date); return Math.abs(same.reduce((s, p) => s + p.amount, 0) - v.debit) < 0.011; })) || null;
        return null;
    },
    async postPack(it) {
        const d = it.data;
        await this.ensureAccounts(d.accounts);
        const accIdOf = l => d.accounts.find(a => a.key === (l.code ? "#" + l.code : l.name.toLowerCase()));
        let posted = 0, skipped = 0, covered = 0, failed = [];
        for (const v of d.vouchers) {
            if (this.journalByRef(v.ref, v.date)) { skipped++; continue; }
            const run = this.payrunCovers(v, accIdOf);
            if (run) {
                covered++;
                // The pack dates the accrual (e.g. 28 Sep, the period end); keep the pay run on the same date so the ledger agrees
                if (run.date !== v.date && v.lines.length === 2 && v.date.slice(0, 7) === run.period && !(run.ledgerRefs || []).length) { try { await Server.save("payrun", { ...run, date: v.date, ledgerRefs: undefined }); } catch { /* keep the month-end date */ } }
                continue;
            }
            const lines = v.lines.map(l => { const a = accIdOf(l); return { accountId: a.accountId, debit: l.debit, credit: l.credit, memo: [l.name, l.note].filter(Boolean).join(" · ").slice(0, 120), contactName: PK.contactOf(l.name, v.narration), ...(l.fcCurrency && l.fcAmount ? { fcAmount: l.fcAmount, fcCurrency: l.fcCurrency } : {}) }; });
            try { await Server.save("journal", { id: uid("jv"), date: v.date, reference: v.ref, notes: v.narration.slice(0, 200) || `Voucher ${v.ref}`, lines }); posted++; }
            catch (e) { failed.push(`${v.ref}: ${e.message}`); }
        }
        if (failed.length) it.issues.unshift(`${failed.length} voucher${failed.length === 1 ? "" : "s"} could not be posted: ${failed.slice(0, 3).join("; ")}`);
        return `${posted} voucher${posted === 1 ? "" : "s"} posted${skipped ? ` · ${skipped} already in the books` : ""}${covered ? ` · ${covered} recorded by payroll` : ""}${failed.length ? ` · ${failed.length} failed` : ""}${d.tbCheck?.ok ? " · agrees with the pack's trial balance" : ""}`;
    },
    async postSlips(it) {
        const d = it.data;
        let runs = 0, skipped = 0, refs = 0;
        const notes = [];
        for (const s of d.slips) {
            if (this.payrunFor(s.name, s.period)) { skipped++; continue; }
            const emp = await this.ensureEmployee(s);
            // Vouchers cited on the slip that are already in the ledger: the pay run is then a record only
            const cited = [...new Set(s.payments.map(p => p.voucher).filter(Boolean))];
            const inLedger = cited.filter(r => this.journalByRef(r));
            const accrualInLedger = (Server.fin.journal || []).find(j => j.date.slice(0, 7) === s.period && (j.lines || []).length === 2 && j.lines.every(l => ["salaries", "salaries_payable"].includes((Finance.acc(l.accountId) || {}).role)) && Math.abs(num(j.lines[0].debit || j.lines[1].debit) - s.gross) < 0.011 && (!j.notes || !/[A-Z][a-z]+ [A-Z]/.test(j.notes) || j.notes.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])));
            const ledgerRefs = accrualInLedger ? [...new Set([accrualInLedger.reference || accrualInLedger.number, ...inLedger])] : [];
            if (ledgerRefs.length) refs++;
            for (const p of s.payments) {
                if (d.paidFrom[p.fromKey]) continue;
                d.paidFrom[p.fromKey] = this.paidFromAccount(p);                   // accounts may have been created by a pack posted just before
                if (!d.paidFrom[p.fromKey] && p.nonCash) {
                    const nm = p.from.replace(/\b(non-?cash|set-?off|journal\s*entry|voucher|JV[-\s]?\d+|settlement|·)\b/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ") || "Set-off account";
                    const res = await Server.save("account", { id: uid("acc_"), code: "", name: nm.slice(0, 80), type: "liability", subtype: "current", currency: "AED", archived: false, description: "Created by the document import (non-cash salary settlement)" });
                    d.paidFrom[p.fromKey] = res.object.id;
                }
                if (!d.paidFrom[p.fromKey]) throw new Error(`Choose the account for “${p.fromKey.slice(0, 50)}”.`);
            }
            const payments = s.payments.map(p => ({ date: p.date, accountId: d.paidFrom[p.fromKey], amount: p.amount, reference: p.voucher || p.reference || "", employeeId: emp.id, name: s.name }));
            const net = round(s.gross - s.deductions.reduce((a, x) => a + x.amount, 0), 2);
            const paidTotal = round(payments.reduce((a, p) => a + p.amount, 0), 2);
            const run = {
                id: uid("pr"), period: s.period, date: PK.monthEnd(s.period), status: paidTotal >= net - 0.011 ? "paid" : "approved",
                lines: [{ employeeId: emp.id, name: s.name, code: emp.code, designation: s.designation || emp.designation, department: emp.department, iban: emp.iban, bankName: emp.bankName, routingCode: emp.routingCode, personId: emp.personId, joined: emp.joined, unpaidDays: 0, earnings: s.earnings, deductions: s.deductions }],
                payments, notes: `Imported from ${it.name}`, ...(ledgerRefs.length ? { ledgerRefs } : {})
            };
            try { await Server.save("payrun", run); runs++; }
            catch (e) { notes.push(`${PK.monthLabel(s.period)}: ${e.message}`); }
        }
        if (notes.length) it.issues.unshift(notes.slice(0, 3).join("; "));
        return `${runs} pay run${runs === 1 ? "" : "s"} for ${d.employees.join(", ")}${skipped ? ` · ${skipped} already in payroll` : ""}${refs ? ` · ${refs} already in the ledger (records only)` : ""}${notes.length ? ` · ${notes.length} failed` : ""}`;
    },
    async postCommission(it) {
        const d = it.data;
        let posted = 0, skipped = 0;
        const fails = [];
        for (const r of d.rows.filter(r => !r.cancelled)) {
            if (r.voucher && this.journalByRef(r.voucher)) { skipped++; continue; }
            const dup = (Server.fin.expense || []).find(e => e.date === r.date && Math.abs(num(e.amount) * (num(e.rate) || 1) - r.amount) < 0.02 && Finance.sameName(e.vendorName, r.payee));
            if (dup) { skipped++; continue; }
            const acc = Finance.acc(d.paidFrom[r.fromKey]);
            const foreign = acc && (acc.currency || "AED") !== "AED" && r.fcCurrency === acc.currency && r.fcAmount;
            try {
                await Server.save("expense", { id: uid("exp"), date: r.date, accountId: d.account, paidThrough: acc.id, amount: foreign ? r.fcAmount : r.amount, vatRate: 0, inclusive: true, currency: foreign ? acc.currency : "AED", rate: foreign ? round(r.amount / r.fcAmount, 6) : 1, vendorName: r.payee, description: `Commission${r.note ? " · " + r.note.slice(0, 100) : ""}`, reference: [r.voucher, r.reference].filter(Boolean).join(" "), attachments: [] });
                posted++;
            } catch (e) { fails.push(`${r.payee} ${fmtDate(r.date)}: ${e.message}`); }
        }
        if (fails.length) it.issues.unshift(fails.slice(0, 3).join("; "));
        return `${posted} commission payment${posted === 1 ? "" : "s"} recorded${skipped ? ` · ${skipped} already in the books` : ""}${fails.length ? ` · ${fails.length} failed` : ""}`;
    },
    async checkStatements(it) {
        const d = it.data, K = d.keys;
        const from = d.from || `${d.to.slice(0, 4)}-01-01`;
        const pl = await Server.get(`reports/profit_loss?from=${from}&to=${d.to}`);
        const bs = await Server.get(`reports/balance_sheet?to=${d.to}`);
        const sec = (r, re) => (r.sections || []).find(s => re.test(s.label)) || {};
        const books = {
            revenue: round(num(sec(pl, /operating income/i).total) + num(sec(pl, /other income/i).total), 2), cogs: num(sec(pl, /cost of goods/i).total), gross: num(sec(pl, /gross profit/i).total),
            opex: round(num(sec(pl, /operating expenses/i).total) + num(sec(pl, /other expenses/i).total), 2), net: num(pl.net),
            cash: round((sec(bs, /^assets/i).rows || []).filter(r => ["bank", "cash"].includes(r.subtype)).reduce((s, r) => s + num(r.amount), 0), 2),
            assets: num(sec(bs, /^assets/i).total), liabilities: num(sec(bs, /^liabilities$/i).total), equity: num(sec(bs, /^equity/i).total)
        };
        const label = { revenue: "Revenue", cogs: "Cost of sales", gross: "Gross profit", opex: "Expenses", net: "Net profit", cash: "Cash at bank", assets: "Total assets", liabilities: "Total liabilities", equity: "Total equity" };
        const out = [], diffs = [];
        for (const k of Object.keys(label)) {
            if (!K[k]) continue;
            const want = Math.abs(K[k].amount), got = Math.abs(books[k]);
            if (Math.abs(want - got) < 0.011) out.push(`${label[k]} ${fmt(got)} ✓`);
            else diffs.push(`${label[k]}: statements ${fmt(want)}, books ${fmt(got)}`);
        }
        const empty = !books.revenue && !books.opex && !books.assets;
        it.issues = [];
        if (empty || (K.revenue && Math.abs(K.revenue.amount) > 0 && !books.revenue)) { it.issues.push("The books don't have this period's figures yet. Import the journal pack (or opening balances and bank statements) first, then run this check again."); throw new Error("Nothing in the books for this period to compare with."); }
        if (diffs.length) { it.issues.push(...diffs); it.result = `Checked: ${out.length} figure${out.length === 1 ? "" : "s"} agree, ${diffs.length} differ`; }
        return diffs.length ? `Checked: ${out.length} agree · ${diffs.length} differ — ${diffs.slice(0, 2).join("; ")}` : `Checked against the books: ${out.join(", ")}`;
    },
    async postPackKind(it) {
        const k = it.kind;
        if (k === "pack") return this.postPack(it);
        if (k === "payslips" || k === "salaryLedger") return this.postSlips(it);
        if (k === "commissionLedger") return this.postCommission(it);
        if (k === "statements") return this.checkStatements(it);
        throw new Error("Choose what this document is.");
    }
});
