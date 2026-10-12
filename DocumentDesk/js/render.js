/* ==========================================================
   Document renderer
   Turns a document + settings into one A4 sheet of HTML.
   The same markup is used for the live preview and for print.
   ========================================================== */

const FONT_STACKS = {
    plex: "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif",
    poppins: "'Poppins', 'Segoe UI', Arial, sans-serif",
    serif: "'Source Serif 4', Georgia, 'Times New Roman', serif"
};

/* Default letterhead art and its height on an A4 page (mm), from the image proportions */
const LETTERHEAD = {
    tall:    { head: "images/header.png",  headH: 42.35, foot: "images/footer.png",  footH: 15.25 },
    compact: { head: "images/header1.png", headH: 29.65, foot: "images/footer1.png", footH: 21.17 }
};

function assetUrls(s) {
    const b = s.brand;
    const set = LETTERHEAD[b.letterhead] || LETTERHEAD.tall;
    const compact = b.letterhead === "compact";
    const head = compact ? b.header1 : b.header;
    const foot = compact ? b.footer1 : b.footer;
    return {
        logo: b.logo || "logo.svg",
        signature: b.signature || "images/signature.png",
        stamp: b.stamp || "",
        head: head || set.head,
        foot: foot || set.foot,
        headH: head ? (compact ? b.header1H : b.headerH) || set.headH : set.headH,
        footH: foot ? (compact ? b.footer1H : b.footerH) || set.footH : set.footH
    };
}

function renderDocument(doc, settings = Store.settings) {
    const t = DOC_TYPES[doc.type];
    const brand = settings.brand;
    const layout = t.text ? "letterhead" : (doc.layout || brand.layout || "classic");
    const a = assetUrls(settings);
    const accent = brand.color || "#14395E";
    const font = FONT_STACKS[brand.font] || FONT_STACKS.plex;

    const headSpace = layout === "letterhead" ? a.headH + 6 : 14;
    const footSpace = layout === "letterhead" ? a.footH + 4 : (layout === "classic" ? 18 : 16);

    const body = t.resolution ? renderResolutionBody(doc, settings, a) : t.letter ? renderLetterBody(doc, settings, a) : renderTradeBody(doc, settings, a, layout);

    const stampWord = doc.status === "paid" && doc.type === "invoice" ? "PAID"
        : doc.status === "cancelled" ? "CANCELLED" : "";

    return `
<article class="sheet layout-${layout} type-${doc.type}" style="--accent:${esc(accent)};--doc-font:${font};--head-space:${headSpace}mm;--foot-space:${footSpace}mm;--lh-head:${a.headH}mm;--lh-foot:${a.footH}mm">
  ${layout === "letterhead" ? `<div class="lh-head"><img src="${esc(a.head)}" alt=""></div>` : ""}
  ${t.text && brand.watermark ? `<div class="watermark"><img src="${esc(a.logo)}" alt=""></div>` : ""}
  ${stampWord && !t.prices ? stampHTML(stampWord) : ""}
  <table class="page-frame" role="presentation">
    <thead><tr><td><div class="frame-space-head"></div></td></tr></thead>
    <tbody><tr><td class="frame-content">${body}</td></tr></tbody>
    <tfoot><tr><td><div class="frame-space-foot"></div></td></tr></tfoot>
  </table>
  ${renderFooter(doc, settings, layout, a)}
</article>`;
}

function stampHTML(word) {
    return `<div class="status-stamp${word === "CANCELLED" ? " is-cancelled" : ""}">${word}</div>`;
}

/* ---------- Header for trade documents ---------- */
function renderTop(doc, s, layout, a) {
    const c = s.company;
    const title = esc(doc.title || DOC_TYPES[doc.type].title);
    if (layout === "letterhead") {
        return `<div class="doc-top doc-top-lh"><h1 class="doc-title">${title}</h1></div>`;
    }
    if (layout === "minimal") {
        return `
<div class="doc-top doc-top-min">
  <div>
    <h1 class="doc-title">${title}</h1>
    <div class="doc-number">${esc(doc.number)}</div>
  </div>
  <div class="min-company">
    <img class="company-logo" src="${esc(a.logo)}" alt="" onerror="this.remove()">
    <div class="company-name">${esc(c.name)}</div>
    <div>${escBr(c.address)}</div>
    ${c.trn ? `<div>TRN ${esc(c.trn)}</div>` : ""}
  </div>
</div>`;
    }
    return `
<div class="doc-top doc-top-classic">
  <div class="brand-block">
    <img class="company-logo" src="${esc(a.logo)}" alt="" onerror="this.remove()">
    <div class="company-name">${esc(c.name)}</div>
    <div class="brand-rule"></div>
    ${c.trn ? `<div class="company-trn">TRN ${esc(c.trn)}</div>` : ""}
  </div>
  <h1 class="doc-title">${title}</h1>
</div>`;
}

function metaRows(doc, s, totals) {
    const t = DOC_TYPES[doc.type];
    const rows = [];
    const label = t.short === "Letter" ? "Reference" : `${t.short === "PO" ? "PO" : t.short} no.`;
    rows.push([label, doc.number]);
    rows.push([t.dateLabel, fmtDate(doc.date)]);
    if (t.due && doc.due) rows.push([t.due, fmtDate(doc.due)]);
    if (t.valid && doc.valid) rows.push([t.valid, fmtDate(doc.valid)]);
    if (doc.ref) rows.push([t.ref, doc.ref]);
    if (t.poTerms && doc.deliveryTerms) rows.push(["Delivery terms", doc.deliveryTerms]);
    if (t.poTerms && doc.paymentTerms) rows.push(["Payment terms", doc.paymentTerms]);
    if (doc.hsn) rows.push(["HS / HSN code", doc.hsn]);
    if (t.prices) rows.push(["Currency", `${doc.currency}`]);
    // In the letterhead layout the TRN has no brand block to sit in, so it moves here
    const layout = doc.layout || s.brand.layout;
    if (s.company.trn && layout === "letterhead") rows.push(["Our TRN", s.company.trn]);
    return rows;
}

function partyBlock(label, p, opts = {}) {
    if (!p) return "";
    const has = [p.name, p.address, p.phone, p.email, p.trn, p.attn].some(v => String(v || "").trim());
    if (!has && !opts.always) return "";
    return `
<div class="party">
  <div class="block-label">${esc(label)}</div>
  ${p.name ? `<div class="party-name">${esc(p.name)}</div>` : `<div class="party-name placeholder">—</div>`}
  ${p.attn ? `<div>Attn: ${esc(p.attn)}</div>` : ""}
  ${p.address ? `<div>${escBr(p.address)}</div>` : ""}
  ${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
  ${p.email ? `<div>${esc(p.email)}</div>` : ""}
  ${p.trn ? `<div class="party-trn">TRN ${esc(p.trn)}</div>` : ""}
</div>`;
}

function renderParties(doc, s) {
    const t = DOC_TYPES[doc.type];
    const blocks = [];
    blocks.push(partyBlock(t.party, doc.party, { always: true }));
    if (doc.type === "purchaseOrder") {
        const c = s.company;
        const bill = doc.billTo.useCompany
            ? { name: c.name, address: c.address, phone: c.phone, trn: c.trn }
            : doc.billTo;
        blocks.push(partyBlock(t.bill, bill));
    }
    // "Same as" hides the second address block; the first block already covers it
    if (t.ship && !doc.ship.same) blocks.push(partyBlock(t.ship, doc.ship));
    return blocks.filter(Boolean).join("");
}

/* ---------- Items table ---------- */
function visibleColumns(doc, totals) {
    const t = DOC_TYPES[doc.type];
    const show = doc.columns.show;
    const anyDisc = totals.discountTotal > 0;
    const anyHs = doc.items.some(i => String(i.hs || "").trim());
    const anyUnit = doc.items.some(i => String(i.unit || "").trim());
    const cols = { no: true, item: true, hs: show.hs === true || (show.hs === "auto" && anyHs), qty: true, unit: show.unit && anyUnit };
    if (t.prices) {
        cols.rate = true;
        cols.disc = show.disc === true || (show.disc === "auto" && anyDisc);
        cols.vatRate = !!show.vatRate;
        cols.vatAmt = !!show.vatAmt;
        cols.amount = true;
    }
    return cols;
}

function renderItemsTable(doc, totals) {
    const t = DOC_TYPES[doc.type];
    const L = doc.columns.labels;
    const cols = visibleColumns(doc, totals);
    const cur = doc.currency;
    const head = `
<tr>
  <th class="c-no">#</th>
  <th class="c-item">${esc(L.item)}</th>
  ${cols.hs ? `<th class="c-hs">${esc(L.hs)}</th>` : ""}
  <th class="c-num c-qty">${esc(L.qty)}</th>
  ${cols.unit ? `<th class="c-unit">${esc(L.unit)}</th>` : ""}
  ${cols.rate ? `<th class="c-num">${esc(L.rate)}</th>` : ""}
  ${cols.disc ? `<th class="c-num">${esc(L.disc)}</th>` : ""}
  ${cols.vatRate ? `<th class="c-num c-vr">${esc(L.vatRate)}</th>` : ""}
  ${cols.vatAmt ? `<th class="c-num">${esc(L.vatAmt)}</th>` : ""}
  ${cols.amount ? `<th class="c-num c-amt">${esc(L.amount)}</th>` : ""}
  ${t.receiver ? `<th class="c-check">Received</th>` : ""}
</tr>`;
    const rows = doc.items.map((it, i) => {
        const l = totals.lines[i];
        const empty = !String(it.name || "").trim() && !String(it.desc || "").trim() && num(it.rate) === 0 && !String(it.hs || "").trim();
        return `
<tr${empty ? ' class="row-empty"' : ""}>
  <td class="c-no">${i + 1}</td>
  <td class="c-item">${String(it.name || "").trim()
      ? `<div class="item-name">${esc(it.name)}</div>${String(it.desc || "").trim() ? `<div class="item-desc">${escBr(it.desc)}</div>` : ""}`
      : String(it.desc || "").trim() ? `<div class="item-name item-name-plain">${escBr(it.desc)}</div>` : `<div class="item-name">&nbsp;</div>`}</td>
  ${cols.hs ? `<td class="c-hs">${esc(it.hs)}</td>` : ""}
  <td class="c-num c-qty">${fmtQty(l.qty)}</td>
  ${cols.unit ? `<td class="c-unit">${esc(it.unit)}</td>` : ""}
  ${cols.rate ? `<td class="c-num">${fmtPrice(l.rate, cur)}</td>` : ""}
  ${cols.disc ? `<td class="c-num">${l.disc ? (l.pct !== null && !l.alloc ? `<span class="disc-pct">${fmtPct(l.pct)}</span> ` : "") + fmt(l.disc, cur) : "–"}</td>` : ""}
  ${cols.vatRate ? `<td class="c-num c-vr">${fmtPct(l.vat)}</td>` : ""}
  ${cols.vatAmt ? `<td class="c-num">${fmt(l.vatAmt, cur)}</td>` : ""}
  ${cols.amount ? `<td class="c-num c-amt">${fmt(l.total, cur)}</td>` : ""}
  ${t.receiver ? `<td class="c-check"><span class="tick-box"></span></td>` : ""}
</tr>`;
    }).join("");
    const foot = !t.prices ? `
<tr class="qty-total"><td></td><td class="c-item">Total quantity</td>${cols.hs ? "<td></td>" : ""}<td class="c-num c-qty">${fmtQty(totals.qtyTotal)}</td>${cols.unit ? "<td></td>" : ""}${t.receiver ? "<td></td>" : ""}</tr>` : "";
    return `<table class="items"><thead>${head}</thead><tbody>${rows}${foot}</tbody></table>`;
}

/* ---------- Totals ---------- */
function renderTotals(doc, totals) {
    const t = DOC_TYPES[doc.type];
    const cur = doc.currency;
    const row = (label, val, cls = "") => `<div class="t-row ${cls}"><span>${label}</span><span class="t-val"><span class="t-cur">${cur}</span>${val}</span></div>`;
    let h = "";
    h += row("Subtotal", fmt(totals.subtotal, cur));
    if (totals.discountTotal > 0) {
        // The additional discount is already spread over the lines, so one discount row matches the Discount column
        const extra = totals.docDiscount > 0 && doc.discount.type === "pct" ? ` (incl. ${fmtPct(doc.discount.value)} additional)` : "";
        h += row("Discount" + extra, "−" + fmt(totals.discountTotal, cur), "t-neg");
    }
    totals.charges.forEach(c => { h += row(esc(c.label), fmt(c.amount, cur)); });
    const showTaxable = totals.vatTotal > 0 && (totals.discountTotal > 0 || totals.charges.length);
    if (showTaxable) h += row("Total excl. VAT", fmt(totals.taxable, cur), "t-sub");
    const vg = totals.vatGroups.filter(g => g.rate > 0);
    if (vg.length === 0) h += row("VAT", fmt(0, cur));
    else vg.forEach(g => { h += row(`VAT ${fmtPct(g.rate)}`, fmt(g.vat, cur)); });
    const totalLabel = doc.type === "creditNote" ? "Total credit" : doc.type === "invoice" ? "Grand total" : "Total";
    h += row(totalLabel, fmt(totals.total, cur), "t-grand");
    if (t.paid && totals.paid > 0) {
        h += row("Amount received", "−" + fmt(totals.paid, cur), "t-neg");
        h += row("Balance due", fmt(totals.balance, cur), "t-balance");
    }
    let fx = "";
    if (totals.fx) {
        fx = `
<div class="fx-box">
  <div class="fx-title">AED equivalent at 1 ${esc(cur)} = ${fmtRate(totals.fx.rate)} AED</div>
  <div class="t-row"><span>Total excl. VAT</span><span class="t-val"><span class="t-cur">AED</span>${fmt(totals.fx.taxable, "AED")}</span></div>
  <div class="t-row"><span>VAT</span><span class="t-val"><span class="t-cur">AED</span>${fmt(totals.fx.vat, "AED")}</span></div>
  <div class="t-row t-strong"><span>Total</span><span class="t-val"><span class="t-cur">AED</span>${fmt(totals.fx.total, "AED")}</span></div>
</div>`;
    }
    return `<div class="totals">${h}${fx}</div>`;
}

function renderBank(doc, s) {
    if (!doc.showBank) return "";
    const b = bankById(doc.bankId);
    if (!b) return "";
    const lines = b.lines.filter(([k, v]) => String(v || "").trim())
        .map(([k, v]) => `<div class="bank-line"><span class="bank-k">${esc(k)}</span><span class="bank-v">${esc(v)}</span></div>`).join("");
    return `<div class="bank"><div class="block-label">Payment details</div>${lines}</div>`;
}

function renderSignature(doc, s, a) {
    const t = DOC_TYPES[doc.type];
    const sig = doc.signature;
    const left = t.receiver && doc.receiver ? `
<div class="sign sign-left">
  <div class="block-label">Received in good condition by</div>
  <div class="sign-field"><span>Name</span></div>
  <div class="sign-field"><span>Signature &amp; stamp</span></div>
  <div class="sign-field"><span>Date</span></div>
</div>` : "<div></div>";
    const right = sig.show ? `
<div class="sign sign-right">
  <div class="sign-for">For ${esc(s.company.name)}</div>
  <div class="sign-art">
    <img class="sign-img" src="${esc(a.signature)}" alt="" onerror="this.remove()">
    ${a.stamp ? `<img class="stamp-img" src="${esc(a.stamp)}" alt="">` : ""}
  </div>
  <div class="sign-line"></div>
  ${sig.name ? `<div class="sign-name">${esc(sig.name)}</div>` : ""}
  ${sig.title ? `<div class="sign-title">${esc(sig.title)}</div>` : `<div class="sign-title">Authorised signatory</div>`}
</div>` : "";
    if (!right && !(t.receiver && doc.receiver)) return "";
    return `<div class="signatures">${left}${right}</div>`;
}

function renderTradeBody(doc, s, a, layout) {
    const t = DOC_TYPES[doc.type];
    const totals = computeTotals(doc);
    const meta = metaRows(doc, s, totals).map(([k, v]) => `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`).join("");

    const notes = !htmlIsEmpty(doc.terms) ? `<div class="terms"><div class="block-label">${doc.type === "invoice" ? "Payment &amp; tax notes" : "Terms &amp; conditions"}</div><div class="rich">${sanitizeHTML(doc.terms)}</div></div>` : "";
    const plainNotes = String(doc.notes || "").trim() ? `<div class="notes"><div class="block-label">Notes</div><div>${escBr(doc.notes)}</div></div>` : "";
    const reason = t.reason && String(doc.reason || "").trim() ? `<div class="notes"><div class="block-label">Reason for credit</div><div>${escBr(doc.reason)}</div></div>` : "";

    const stampWord = doc.status === "paid" && doc.type === "invoice" ? "PAID" : doc.status === "cancelled" ? "CANCELLED" : "";
    const money = t.prices ? `
<div class="money">
  <div class="money-left">
    <div class="words"><div class="block-label">Amount in words</div><div class="words-text">${esc(amountToWords(totals.total, doc.currency))}</div></div>
    ${renderBank(doc, s)}
  </div>
  <div class="money-right">${renderTotals(doc, totals)}${stampWord ? `<div class="stamp-slot">${stampHTML(stampWord)}</div>` : ""}</div>
</div>` : "";

    return `
${renderTop(doc, s, layout, a)}
<div class="head-grid">
  <div class="parties">${renderParties(doc, s)}</div>
  <div class="meta">${meta}</div>
</div>
${renderItemsTable(doc, totals)}
${money}
${reason}
${plainNotes}
${notes}
${renderSignature(doc, s, a)}`;
}

/* ---------- Letters ---------- */
function renderLetterBody(doc, s, a) {
    const L = doc.letter;
    const sig = doc.signature;
    const title = String(doc.title || "").trim();
    const left = L.showLeft ? `
<div class="sign sign-left">
  ${L.leftLabel ? `<div class="sign-for">${esc(L.leftLabel)}</div>` : ""}
  <div class="sign-art"></div>
  <div class="sign-line"></div>
  ${L.leftName ? `<div class="sign-name">${esc(L.leftName)}</div>` : ""}
  ${L.leftTitle ? `<div class="sign-title">${esc(L.leftTitle)}</div>` : ""}
</div>` : "<div></div>";
    const right = L.showRight !== false ? `
<div class="sign sign-right">
  ${L.rightLabel ? `<div class="sign-for">${esc(L.rightLabel)}</div>` : ""}
  <div class="sign-art">
    ${sig.show ? `<img class="sign-img" src="${esc(a.signature)}" alt="" onerror="this.remove()">` : ""}
    ${sig.show && a.stamp ? `<img class="stamp-img" src="${esc(a.stamp)}" alt="">` : ""}
  </div>
  <div class="sign-line"></div>
  ${sig.name ? `<div class="sign-name">${esc(sig.name)}</div>` : ""}
  ${sig.title ? `<div class="sign-title">${esc(sig.title)}</div>` : ""}
</div>` : "";
    return `
<div class="letter">
  <div class="letter-meta">
    <div>${doc.number ? `<span class="meta-k">Ref.</span> ${esc(doc.number)}` : ""}</div>
    <div>${esc(fmtDateLong(doc.date))}</div>
  </div>
  ${L.to ? `<div class="letter-to">${escBr(L.to)}</div>` : ""}
  ${title ? `<h1 class="letter-title">${esc(title)}</h1>` : ""}
  ${L.subject ? `<div class="letter-subject"><span>Subject:</span> ${esc(L.subject)}</div>` : ""}
  <div class="letter-body rich">${sanitizeHTML(L.body) || ""}</div>
  ${(L.showLeft || L.showRight !== false) ? `<div class="signatures">${left}${right}</div>` : ""}
</div>`;
}

/* ---------- Board resolutions ---------- */
/* Turn [placeholders] into highlighted blanks so unfinished wording is obvious on the page */
function resText(s) {
    return escBr(s).replace(/\[([^\]]{1,80})\]/g, '<span class="blank">[$1]</span>');
}

function renderResolutionBody(doc, s, a) {
    const r = doc.res;
    const c = s.company;
    const meeting = r.kind !== "written";
    const dateLong = fmtDateLong(doc.date);
    const timeTxt = r.time ? (() => { const [h, m] = r.time.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`; })() : "";
    const directors = r.directors.filter(d => String(d.name).trim());
    const present = directors.filter(d => d.present);
    const absent = directors.filter(d => !d.present);
    const recitals = r.recitals.filter(x => String(x).trim());
    const resolutions = r.resolutions.filter(x => String(x).trim());
    const signers = meeting ? present : directors;
    const person = d => `${esc(d.name)}${d.title ? `, <span class="muted-ink">${esc(d.title)}</span>` : ""}`;

    const intro = meeting
        ? `Resolution passed at a meeting of the Board of Directors of <b>${esc(c.name)}</b> (the “Company”) held on <b>${esc(dateLong)}</b>${timeTxt ? ` at ${esc(timeTxt)}` : ""}${(r.venue || c.address) ? ` at ${esc(r.venue || c.address)}` : ""}.`
        : `Written resolution of the Board of Directors of <b>${esc(c.name)}</b> (the “Company”), passed on <b>${esc(dateLong)}</b> in accordance with the Company’s articles of association, and having the same effect as if passed at a duly convened meeting of the Board.`;

    const attendance = meeting ? `
<div class="res-attend">
  <div><span class="res-k">Present</span><span>${present.map(person).join("<br>") || "—"}</span></div>
  ${absent.length ? `<div><span class="res-k">Absent</span><span>${absent.map(person).join("<br>")}</span></div>` : ""}
  ${r.chair ? `<div><span class="res-k">Chair</span><span>${esc(r.chair)}</span></div>` : ""}
</div>
${r.quorum ? `<p>The Chair confirmed that a quorum was present and declared the meeting duly constituted.</p>` : ""}` : "";

    const sigs = signers.map(d => `
<div class="res-sign">
  <div class="res-sign-space"></div>
  <div class="sign-line"></div>
  <div class="sign-name">${esc(d.name)}</div>
  <div class="sign-title">${esc(d.title || "Director")}</div>
  <div class="res-date">Date: ____________________</div>
</div>`).join("");

    const sig = doc.signature;
    const certify = r.certify ? `
<div class="res-certify">
  <div class="res-cert-title">Certified true copy</div>
  <div class="res-cert-body">
    <div>For and on behalf of <b>${esc(c.name)}</b></div>
    <div class="sign-art">
      ${sig.show ? `<img class="sign-img" src="${esc(a.signature)}" alt="" onerror="this.remove()">` : ""}
      ${sig.show && a.stamp ? `<img class="stamp-img" src="${esc(a.stamp)}" alt="">` : ""}
    </div>
    <div class="sign-line"></div>
    ${sig.name ? `<div class="sign-name">${esc(sig.name)}</div>` : ""}
    <div class="sign-title">${esc(sig.title || "Director")}</div>
    <div class="res-date">Date: ${esc(fmtDateLong(doc.date))}</div>
  </div>
</div>` : "";

    return `
<div class="res">
  <h1 class="letter-title res-title">${esc(String(doc.title || "").trim() || "BOARD RESOLUTION")}</h1>
  <div class="res-company">
    <div class="res-co-name">${esc(c.name)}</div>
    <div>${[c.licence ? `Licence no. ${esc(c.licence)}` : "", c.authority ? esc(c.authority) : ""].filter(Boolean).join("<i></i>")}</div>
    <div>Registered office: ${esc(c.address)}</div>
  </div>
  <div class="letter-meta"><div><span class="meta-k">Resolution no.</span> ${esc(doc.number)}</div><div>${esc(dateLong)}</div></div>
  ${r.subject ? `<div class="letter-subject"><span>Subject:</span> ${resText(r.subject)}</div>` : ""}
  <p>${intro}</p>
  ${attendance}
  ${recitals.length ? `<div class="res-h">Background</div>${recitals.map(x => `<p class="res-p"><b>WHEREAS</b> ${resText(x)}</p>`).join("")}` : ""}
  ${resolutions.length ? `<div class="res-h">${recitals.length ? "Now, therefore, it is resolved as follows" : "It is resolved as follows"}</div>
  <ol class="res-list">${resolutions.map((x, i) => `<li><b>${i === 0 ? "RESOLVED THAT" : "FURTHER RESOLVED THAT"}</b> ${resText(x)}</li>`).join("")}</ol>` : ""}
  ${meeting && r.close ? `<p>There being no other business, the Chair declared the meeting closed.</p>` : ""}
  ${sigs ? `<div class="res-h">${meeting ? "Signed by the directors present" : "Signed by the directors"}</div><div class="res-signs">${sigs}</div>` : ""}
  ${certify}
</div>`;
}

/* ---------- Footer ---------- */
function renderFooter(doc, s, layout, a) {
    const c = s.company;
    const note = String(doc.footer || "").trim();
    // A "no signature required" note contradicts a signed document, so it is dropped when signing
    const hideNote = doc.signature.show && /signature/i.test(note);
    const noteHtml = note && !hideNote ? `<div class="foot-note">${esc(note)}</div>` : "";
    if (layout === "letterhead") {
        return `<div class="lh-foot">${noteHtml}<img src="${esc(a.foot)}" alt=""></div>`;
    }
    const items = [c.address, c.phone, c.email, c.website].filter(v => String(v || "").trim()).map(v => `<span>${esc(v)}</span>`).join("");
    if (layout === "minimal") {
        return `<div class="doc-foot doc-foot-min">${noteHtml}<div class="foot-line"><span class="foot-name">${esc(c.name)}</span>${items}</div></div>`;
    }
    return `
<div class="doc-foot doc-foot-classic">
  ${noteHtml}
  <div class="foot-bar">
    <div class="foot-name">${esc(c.name)}</div>
    <div class="foot-line">${items}</div>
  </div>
</div>`;
}

/* Name used for the PDF file when printing */
/* Short "who / what" label for lists, exports and file names */
function docWho(doc) {
    if (doc.type === "letter") return doc.letter.subject || doc.title || String(doc.letter.to || "").split("\n")[0] || "";
    if (doc.type === "resolution") return doc.res.subject || "";
    return doc.party.name || "";
}

function docFilename(doc) {
    const t = DOC_TYPES[doc.type];
    const who = docWho(doc);
    return safeFilename(`${t.short} ${doc.number}${who ? " - " + who : ""}`.replace(/\//g, "-"));
}
