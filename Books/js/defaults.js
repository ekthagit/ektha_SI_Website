/* ==========================================================
   EVAM Documents — defaults
   Everything here is only the starting point. Company details,
   bank accounts, numbering and terms are editable in Settings
   and saved in the browser.
   ========================================================== */

const APP_VERSION = "3.1";

/* ---------- Currencies (words + decimals) ---------- */
const CURRENCIES = {
    AED: { name: "UAE Dirham",      major: "Dirhams",       minor: "Fils",      dec: 2 },
    USD: { name: "US Dollar",       major: "US Dollars",    minor: "Cents",     dec: 2 },
    EUR: { name: "Euro",            major: "Euros",         minor: "Cents",     dec: 2 },
    GBP: { name: "Pound Sterling",  major: "Pounds",        minor: "Pence",     dec: 2 },
    CHF: { name: "Swiss Franc",     major: "Swiss Francs",  minor: "Centimes",  dec: 2 },
    INR: { name: "Indian Rupee",    major: "Rupees",        minor: "Paise",     dec: 2, indian: true },
    SAR: { name: "Saudi Riyal",     major: "Saudi Riyals",  minor: "Halalas",   dec: 2 },
    QAR: { name: "Qatari Riyal",    major: "Qatari Riyals", minor: "Dirhams",   dec: 2 },
    OMR: { name: "Omani Rial",      major: "Omani Rials",   minor: "Baisa",     dec: 3 },
    KWD: { name: "Kuwaiti Dinar",   major: "Kuwaiti Dinars",minor: "Fils",      dec: 3 },
    BHD: { name: "Bahraini Dinar",  major: "Bahraini Dinars",minor: "Fils",     dec: 3 },
    CNY: { name: "Chinese Yuan",    major: "Yuan",          minor: "Fen",       dec: 2 }
};

/* ---------- Document types ----------
   party      : label of the main counterparty block
   dates      : which date fields the type uses
   prices     : whether the item table carries prices
   bank       : whether payment details are shown by default
   paid       : whether "amount received" applies
   statuses   : allowed statuses, first one is the default
*/
const DOC_TYPES = {
    invoice: {
        label: "Invoice", title: "INVOICE", short: "Invoice", noun: "customer",
        party: "Bill to", ship: "Ship to",
        dateLabel: "Invoice date", due: "Due date", ref: "Customer PO / reference",
        prices: true, bank: true, paid: true,
        statuses: ["draft", "sent", "partial", "paid", "cancelled"],
        footer: "This is a computer-generated invoice and no signature is required."
    },
    proforma: {
        label: "Proforma invoice", title: "PROFORMA INVOICE", short: "Proforma", noun: "customer",
        party: "Bill to", ship: "Ship to",
        dateLabel: "Date", valid: "Valid until", ref: "Reference",
        prices: true, bank: true, paid: false,
        statuses: ["draft", "sent", "accepted", "expired", "cancelled"],
        footer: "This proforma invoice is not a tax invoice. A tax invoice will be issued on supply."
    },
    quotation: {
        label: "Quotation", title: "QUOTATION", short: "Quotation", noun: "customer",
        party: "Prepared for", ship: "Deliver to",
        dateLabel: "Date", valid: "Valid until", ref: "Enquiry reference",
        prices: true, bank: false, paid: false,
        statuses: ["draft", "sent", "accepted", "declined", "expired"],
        footer: "Prices are valid until the date shown and subject to availability."
    },
    purchaseOrder: {
        label: "Purchase order", title: "PURCHASE ORDER", short: "PO", noun: "vendor",
        party: "Vendor", ship: "Deliver to", bill: "Bill to",
        dateLabel: "PO date", due: "Delivery date", ref: "Vendor quotation ref.",
        prices: true, bank: false, paid: false, poTerms: true,
        statuses: ["draft", "sent", "confirmed", "received", "cancelled"],
        footer: "This is a computer-generated purchase order and no signature is required."
    },
    salesOrder: {
        label: "Sales order", title: "SALES ORDER", short: "Sales order", noun: "customer",
        party: "Customer", ship: "Deliver to",
        dateLabel: "Order date", due: "Expected delivery", ref: "Customer PO no.",
        prices: true, bank: false, paid: false,
        statuses: ["draft", "confirmed", "invoiced", "cancelled"],
        footer: "Thank you for your order. Goods remain our property until paid in full."
    },
    creditNote: {
        label: "Credit note", title: "CREDIT NOTE", short: "Credit note", noun: "customer",
        party: "Credit to", ship: null,
        dateLabel: "Date", ref: "Against invoice no.", refRequired: true, refMsg: "Add the number of the invoice this credit note is against.",
        prices: true, bank: false, paid: false, reason: true,
        statuses: ["draft", "issued", "refunded", "cancelled"],
        footer: "This credit note reduces the amount payable on the invoice referenced above."
    },
    deliveryNote: {
        label: "Delivery note", title: "DELIVERY NOTE", short: "Delivery note", noun: "customer",
        party: "Customer", ship: "Delivered to",
        dateLabel: "Delivery date", ref: "Invoice / PO reference",
        prices: false, bank: false, paid: false, receiver: true,
        statuses: ["draft", "dispatched", "delivered"],
        footer: "Please check goods on receipt. Report shortages or damage within 48 hours."
    },
    letter: {
        label: "Letter / business document", title: "", short: "Letter",
        dateLabel: "Date", ref: "Our reference",
        prices: false, letter: true, text: true,
        statuses: ["draft", "final"],
        footer: ""
    },
    resolution: {
        label: "Board resolution", title: "BOARD RESOLUTION", short: "Resolution",
        dateLabel: "Date", ref: "Resolution no.",
        prices: false, resolution: true, text: true,
        statuses: ["draft", "passed"],
        footer: ""
    }
};

const STATUS = {
    draft:      { label: "Draft",          tone: "neutral" },
    imported:   { label: "Imported",       tone: "info" },
    passed:     { label: "Passed",         tone: "good" },
    credited:   { label: "Credited",       tone: "mute" },
    sent:       { label: "Sent",           tone: "info" },
    partial:    { label: "Partly paid",    tone: "warn" },
    paid:       { label: "Paid",           tone: "good" },
    overdue:    { label: "Overdue",        tone: "bad" },
    cancelled:  { label: "Cancelled",      tone: "mute" },
    accepted:   { label: "Accepted",       tone: "good" },
    declined:   { label: "Declined",       tone: "bad" },
    expired:    { label: "Expired",        tone: "mute" },
    confirmed:  { label: "Confirmed",      tone: "info" },
    received:   { label: "Received",       tone: "good" },
    issued:     { label: "Issued",         tone: "info" },
    refunded:   { label: "Refunded",       tone: "good" },
    dispatched: { label: "Dispatched",     tone: "info" },
    delivered:  { label: "Delivered",      tone: "good" },
    final:      { label: "Final",          tone: "good" },
    invoiced:   { label: "Invoiced",       tone: "good" },
    open:       { label: "Open",           tone: "info" },
    void:       { label: "Void",           tone: "mute" }
};

/* Which types a document can be turned into */
const CONVERSIONS = {
    quotation:     ["salesOrder", "proforma", "invoice"],
    proforma:      ["invoice"],
    salesOrder:    ["invoice", "deliveryNote", "proforma"],
    invoice:       ["deliveryNote", "creditNote"],
    purchaseOrder: [],
    creditNote:    [],
    deliveryNote:  ["invoice"],
    letter:        [],
    resolution:    []
};

const UNITS = ["pcs", "box", "carton", "kg", "MT", "litre", "m", "set", "hrs", "days", "month", "lot", "service"];

/* ---------- Default company profile (from the EVAM letterhead) ---------- */
const DEFAULT_COMPANY = {
    name: "EVAM GLOBAL TRADING FZCO",
    address: "IFZA Business Park, DDP, PO Box 342001, Dubai, UAE",
    phone: "+971 0526283363",
    email: "contact@evam.ae",
    website: "www.evam.ae",
    trn: "",
    licence: "",
    authority: "IFZA (International Free Zone Authority), Dubai",
    directors: [{ name: "Shvetang Reddy Musani", title: "Director" }]
};

/* ---------- Board resolution templates ----------
   "Resolved that" / "Further resolved that" is added automatically when printing.
   Square brackets mark the details to fill in. */
const RES_TEMPLATES = [
    { id: "bank", label: "Open a bank account", subject: "Opening of a corporate bank account with [Bank name]",
      recitals: ["the Company wishes to open a corporate bank account with [Bank name] for its business operations."],
      resolutions: [
        "the Company open a [current] account in [currency] with [Bank name], [branch], in the name of the Company, and accept the bank's standard terms and conditions for that account.",
        "[Name], [Designation], holder of passport no. [number], be and is hereby authorised to sign the account opening documents and to operate the account [singly / jointly with Name], including cheques, transfers and online banking instructions.",
        "a certified copy of this resolution be given to [Bank name] and remain in force until the bank receives written notice of its revocation."] },
    { id: "signatory", label: "Appoint an authorised signatory", subject: "Appointment of an authorised signatory",
      recitals: ["the Board considers it necessary to appoint an authorised signatory to act for the Company in its day-to-day business."],
      resolutions: [
        "[Name], [Nationality], holder of passport no. [number], be and is hereby appointed as authorised signatory of the Company with effect from [date].",
        "the authorised signatory be empowered to sign contracts, invoices, purchase orders and correspondence, and to represent the Company before government authorities, the free zone authority and banks, up to [AED amount] per transaction.",
        "this authority remain valid until revoked by a further resolution of the Board."] },
    { id: "acquisition", label: "Approve an acquisition", subject: "Acquisition of [brand / business] from [Seller]",
      recitals: ["the Company has negotiated the acquisition of [brand / business / trademark] from [Seller] (the \"Transaction\").",
                 "the Board has reviewed the terms of the Transaction, including a purchase price of [currency and amount], and the related agreements."],
      resolutions: [
        "the Transaction be and is hereby approved on the terms presented to the Board.",
        "[Name], [Designation], be authorised to agree final terms, sign the purchase agreement and all related documents, and pay the purchase price on behalf of the Company.",
        "the acquired assets be recorded in the Company's books at cost in line with its accounting policies."] },
    { id: "address", label: "Change registered address", subject: "Change of registered office",
      recitals: ["the Company intends to move its registered office."],
      resolutions: [
        "the registered office of the Company be changed from [current address] to [new address] with effect from [date], subject to the approval of [licensing authority].",
        "[Name] be authorised to file the required applications with [licensing authority] and to update the Company's licence, bank records and stationery."] },
    { id: "accounts", label: "Approve annual accounts", subject: "Approval of financial statements for the year ended [date]",
      recitals: ["the financial statements of the Company for the year ended [date] have been prepared and audited by [auditor]."],
      resolutions: [
        "the audited financial statements of the Company for the year ended [date] be and are hereby approved.",
        "[Name], [Designation], be authorised to sign the financial statements on behalf of the Board and to submit them to [licensing authority] and any other relevant authority."] },
    { id: "poa", label: "Grant a power of attorney", subject: "Grant of power of attorney to [Name]",
      recitals: ["the Company requires a representative to act on its behalf in [matter]."],
      resolutions: [
        "the Company grant a power of attorney to [Name], holder of passport no. [number], to [describe the powers], for a period of [period].",
        "[Director name] be authorised to sign the power of attorney before a notary public and to have it attested as required."] },
    { id: "blank", label: "Blank", subject: "", recitals: [""], resolutions: [""] }
];

/* ---------- Default bank accounts (from the original constants.js) ---------- */
const WIO_ADDRESS = "Etihad Airways Centre 5th Floor, Abu Dhabi, UAE";
const DEFAULT_BANKS = [
    { id: "bank1", label: "Wio · AED", currency: "AED", lines: [
        ["Account name", "EVAM GLOBAL TRADING - FZCO"], ["Bank", "Wio Bank PJSC"], ["IBAN", "AE350860000009716500207"],
        ["BIC / SWIFT", "WIOBAEADXXX"], ["Account number", "9716500207"], ["Routing code", "808610001"], ["Bank address", WIO_ADDRESS]] },
    { id: "bank2", label: "Wio · USD", currency: "USD", lines: [
        ["Account name", "EVAM GLOBAL TRADING - FZCO"], ["Bank", "Wio Bank PJSC"], ["IBAN", "AE170860000009460418203"],
        ["BIC / SWIFT", "WIOBAEADXXX"], ["Account number", "9460418203"], ["Routing code", "808610001"], ["Bank address", WIO_ADDRESS]] },
    { id: "bank3", label: "Wio · EUR", currency: "EUR", lines: [
        ["Account name", "EVAM GLOBAL TRADING - FZCO"], ["Bank", "Wio Bank PJSC"], ["IBAN", "AE350860000009558572276"],
        ["BIC / SWIFT", "WIOBAEADXXX"], ["Account number", "9558572276"], ["Routing code", "808610001"], ["Bank address", WIO_ADDRESS]] },
    { id: "bank4", label: "Wio · GBP", currency: "GBP", lines: [
        ["Account name", "EVAM GLOBAL TRADING - FZCO"], ["Bank", "Wio Bank PJSC"], ["IBAN", "AE120860000009416136532"],
        ["BIC / SWIFT", "WIOBAEADXXX"], ["Account number", "9416136532"], ["Routing code", "808610001"], ["Bank address", WIO_ADDRESS]] },
    { id: "bank5", label: "Wio · CHF", currency: "CHF", lines: [
        ["Account name", "EVAM GLOBAL TRADING - FZCO"], ["Bank", "Wio Bank PJSC"], ["IBAN", "AE560860000009812462899"],
        ["BIC / SWIFT", "WIOBAEADXXX"], ["Account number", "9812462899"], ["Routing code", "808610001"], ["Bank address", WIO_ADDRESS]] },
    { id: "bank6", label: "Mashreq · USD", currency: "USD", lines: [
        ["Account name", "EVAM GLOBAL TRADING FZCO"], ["Bank", "Mashreq Bank"], ["Account number", "019102080661"], ["IBAN", "AE700330000019102080661"]] },
    { id: "bank7", label: "Mashreq · AED", currency: "AED", lines: [
        ["Account name", "EVAM GLOBAL TRADING FZCO"], ["Bank", "Mashreq Bank"], ["Account number", "019102080660"], ["IBAN", "AE970330000019102080660"]] }
];

/* ---------- Numbering ----------
   Tokens: {YYYY} {YY} {MM} {M} {DD} {SEQ} {SEQ3} {SEQ4}
   The invoice pattern keeps the original format INV-26/10/001. */
const DEFAULT_NUMBERING = {
    invoice:       { pattern: "INV-{YY}/{M}/{SEQ3}", next: 1 },
    proforma:      { pattern: "PI-{YY}/{M}/{SEQ3}",  next: 1 },
    quotation:     { pattern: "QT-{YY}/{M}/{SEQ3}",  next: 1 },
    purchaseOrder: { pattern: "PO-{YY}/{M}/{SEQ3}",  next: 1 },
    creditNote:    { pattern: "CN-{YY}/{M}/{SEQ3}",  next: 1 },
    deliveryNote:  { pattern: "DN-{YY}/{M}/{SEQ3}",  next: 1 },
    letter:        { pattern: "EVAM/{YY}/{SEQ3}",    next: 1 },
    resolution:    { pattern: "BR-{YYYY}-{SEQ3}",    next: 1 },
    salesOrder:    { pattern: "SO-{YY}/{M}/{SEQ3}",  next: 1 }
};

/* ---------- Default terms (from the original invoice form) ---------- */
const ORIGINAL_TERMS = `<ol>
<li>Consultancy services included in this invoice are charged and payable in full.</li>
<li>Product values reflected in this invoice represent only advance payment.</li>
<li>The remittance amount covers full consultancy fees and applicable advance payment.</li>
<li>All prices and amounts stated are inclusive of 5% VAT.</li>
<li>No additional charges, taxes, or VAT are payable beyond the invoiced amount.</li>
</ol>`;

const DEFAULT_TERMS = {
    invoice: ORIGINAL_TERMS,
    proforma: `<ol><li>Payment in advance by bank transfer to the account shown.</li><li>Goods are released on receipt of cleared funds.</li><li>Bank charges are for the remitter's account.</li></ol>`,
    quotation: `<ol><li>Prices are quoted in the currency shown and exclude VAT unless stated.</li><li>Delivery lead time is confirmed on receipt of a purchase order.</li><li>This quotation is valid until the date shown.</li></ol>`,
    purchaseOrder: `<ol><li>Please quote the PO number on all invoices and delivery documents.</li><li>Goods must match the specification and quantities in this order.</li><li>Invoices are payable according to the payment terms above.</li></ol>`,
    salesOrder: `<ol><li>Delivery dates are estimates and confirmed on dispatch.</li><li>Prices are as agreed in the quotation referenced above.</li></ol>`,
    creditNote: "",
    deliveryNote: "",
    letter: "",
    resolution: ""
};

const DEFAULT_SETTINGS = {
    company: { ...DEFAULT_COMPANY },
    brand: {
        color: "#14395E",
        layout: "classic",          // classic | letterhead | minimal
        letterhead: "tall",         // tall | compact
        font: "plex",               // plex | poppins | serif
        logo: "",                   // data URL; empty uses logo.svg
        header: "", header1: "", footer: "", footer1: "", // data URLs; empty uses images/
        signature: "",              // data URL; empty uses images/signature.png
        stamp: "",
        watermark: true
    },
    banks: DEFAULT_BANKS.map(b => ({ ...b, lines: b.lines.map(l => [...l]) })),
    numbering: JSON.parse(JSON.stringify(DEFAULT_NUMBERING)),
    defaults: {
        currency: "AED",
        vat: 5,
        dueDays: 30,
        validDays: 15,
        signatoryName: "Shvetang Reddy Musani",
        signatoryTitle: "Director",
        showSignature: false,
        terms: { ...DEFAULT_TERMS },
        footers: Object.fromEntries(Object.entries(DOC_TYPES).map(([k, t]) => [k, t.footer]))
    }
};

const DEFAULT_COLUMNS = {
    labels: { item: "Description", hs: "HS code", qty: "Qty", unit: "Unit", rate: "Rate", disc: "Discount", vatRate: "VAT %", vatAmt: "VAT", amount: "Amount" },
    show: { hs: "auto", unit: true, disc: "auto", vatRate: true, vatAmt: true }
};
