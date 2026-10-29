/* ==========================================================
   EVAM Books — browser edition
   Runs the real EVAM Books server inside this page: the same code that runs on
   Cloudflare, with an SQLite database kept in this browser. Nothing is sent anywhere.
   Loaded after server.js and before app.js.
   ========================================================== */
(function () {
    "use strict";
    const DEMO = { password: "Evam Books 2026", setupCode: "DEMO", owner: "musani@evam.ae" };
    const DEMO_USERS = [
        { email: "musani@evam.ae", name: "Shvetang Reddy Musani", role: "Owner" },
        { email: "aisha@evam.ae", name: "Aisha Khan", role: "Accountant" },
        { email: "rahul@evam.ae", name: "Rahul Mehta", role: "Sales" },
        { email: "omar@evam.ae", name: "Omar Saeed", role: "Staff" },
        { email: "fatima@evam.ae", name: "Fatima Noor", role: "Employee" }   // HR: self-service sign-in (clock in, leave, payslips)
    ];
    const IDB_NAME = "evam-books-browser", IDB_STORE = "db", IDB_KEY = "main";
    const LS_DB = "evambooks.browser.db", LS_COOKIE = "evambooks.browser.cookie", LS_EMPTY = "evambooks.browser.empty",
        LS_CRON = "evambooks.browser.cron", LS_MODE = "evambooks.browser.storage";
    const API = "https://books.local/DocumentDesk/api/";

    let E = null, SQL_ENGINE = null, dirty = false, paused = false, storage = "indexeddb";
    let syncChannel = null;
    const TAB_ID = Math.random().toString(36).slice(2);

    /* ---------- Bytes ⇄ base64 ---------- */
    function b64ToBytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    function bytesToB64(u) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }

    /* ---------- Where the database lives: IndexedDB, else localStorage ---------- */
    function idb() {
        return new Promise((res, rej) => {
            const r = indexedDB.open(IDB_NAME, 1);
            r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
    }
    function idbDo(mode, fn) {
        return idb().then(db => new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, mode);
            const req = fn(tx.objectStore(IDB_STORE));
            tx.oncomplete = () => { db.close(); res(req && req.result); };
            tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
        }));
    }
    async function loadBytes() {
        try {
            const v = await idbDo("readonly", s => s.get(IDB_KEY));
            storage = "indexeddb";
            if (v) return new Uint8Array(v);
        } catch { storage = "local"; }
        try { const b = localStorage.getItem(LS_DB); if (b) { storage = "local"; return b64ToBytes(b); } } catch { /* ignore */ }
        return null;
    }
    async function saveBytes(bytes) {
        if (storage === "indexeddb") {
            try { await idbDo("readwrite", s => s.put(bytes, IDB_KEY)); try { localStorage.removeItem(LS_DB); } catch {} return true; }
            catch { storage = "local"; }
        }
        try { localStorage.setItem(LS_DB, bytesToB64(bytes)); return true; }
        catch { storage = "none"; warnNoStorage(); return false; }
    }
    async function clearBytes(keepCookie = false) {
        try { await idbDo("readwrite", s => s.delete(IDB_KEY)); } catch { /* ignore */ }
        try { localStorage.removeItem(LS_DB); if (!keepCookie) localStorage.removeItem(LS_COOKIE); localStorage.removeItem(LS_CRON); localStorage.removeItem("evambooks.cache"); localStorage.removeItem("evambooks.queue"); } catch { /* ignore */ }
    }
    let warned = false;
    function warnNoStorage() {
        if (warned) return; warned = true;
        setTimeout(() => typeof toast === "function" && toast("This browser isn't letting EVAM Books save on this computer (private window?). Your work will be lost when you close it — use Download backup to keep a copy.", "warn", 12000), 500);
    }
    let saving = Promise.resolve();
    function flush() {
        if (!E || !dirty) return saving;
        dirty = false;
        const bytes = E.export();
        saving = saving.then(() => saveBytes(bytes));
        return saving;
    }

    /* ---------- Session cookie (kept here; browsers don't let pages set it on a fake request) ---------- */
    const getCookie = () => { try { return localStorage.getItem(LS_COOKIE) || ""; } catch { return ""; } };
    function setCookieFrom(sc) {
        const m = /evb_s=([^;]*)/.exec(sc || "");
        if (!m) return;
        const gone = !m[1] || /max-age=0\b/i.test(sc);
        try { gone ? localStorage.removeItem(LS_COOKIE) : localStorage.setItem(LS_COOKIE, "evb_s=" + m[1]); } catch { /* ignore */ }
    }

    /* ---------- One call into the engine ---------- */
    async function refreshEngineFromStorage() {
        // Each tab has its own in-memory SQLite connection. Reload the latest
        // committed database snapshot before a write so tabs don't overwrite
        // each other's newer data with an old copy.
        if (!SQL_ENGINE || dirty) return false;
        const bytes = await loadBytes();
        if (!bytes) return false;
        E = EVAMEngine.createEngine(SQL_ENGINE, bytes, {
            onWrite: () => { dirty = true; },
            vars: { SETUP_CODE: DEMO.setupCode }
        });
        return true;
    }

    async function callUnlocked(method, path, headers, body) {
        let b = body;
        if (b instanceof Blob) b = await b.arrayBuffer();
        const h = {};
        if (headers instanceof Headers) headers.forEach((v, k) => { h[k] = v; }); else Object.assign(h, headers || {});
        const c = getCookie();
        if (c) h.cookie = c;
        if (b instanceof ArrayBuffer) h["content-length"] = String(b.byteLength);
        else if (typeof b === "string") h["content-length"] = String(new TextEncoder().encode(b).length);

        const res = await E.fetch(API + path, { method, headers: h, body: b });
        setCookieFrom(res.headers.get("set-cookie"));
        const out = await res.arrayBuffer();
        if (dirty) {
            await flush();
            try { syncChannel?.postMessage({ type: "database-changed", from: TAB_ID, at: Date.now() }); } catch {}
        }
        const hh = {};
        res.headers.forEach((v, k) => { if (k !== "set-cookie") hh[k] = v; });
        return new Response([101, 204, 205, 304].includes(res.status) ? null : out, { status: res.status, headers: hh });
    }

    async function call(method, path, headers, body) {
        const run = async () => {
            // The Web Lock serializes writes across tabs. Rebase this tab's
            // SQLite copy on the latest committed snapshot before each write.
            if (method !== "GET") await refreshEngineFromStorage();
            return callUnlocked(method, path, headers, body);
        };
        if (method !== "GET" && navigator.locks && typeof navigator.locks.request === "function") {
            return navigator.locks.request("evam-books-browser-database-write", run);
        }
        return run();
    }
    async function api(method, path, body) {
        const r = await call(method, path, { "content-type": "application/json", "x-evam": "1" }, body === undefined ? undefined : JSON.stringify(body));
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`${method} ${path}: ${(data && data.error) || r.status}`);
        return data;
    }

    /* ---------- Example company (dates move with today so it always looks current) ---------- */
    async function seed() {
        const base = Date.UTC(2026, 9, 13);
        const t = new Date(); const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
        const shift = Math.max(0, Math.round((today - base) / 86400000));
        const d = iso => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd) + shift * 86400000).toISOString().slice(0, 10); };
        const A = { put: (p, b) => api("PUT", p, b), post: (p, b = {}) => api("POST", p, b), get: p => api("GET", p) };

        const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        await A.post("setup", { code: DEMO.setupCode, name: "Shvetang Reddy Musani", email: DEMO.owner, password: DEMO.password, settings });
        const b = await A.get("bootstrap");
        const acc = c => b.objects.find(o => o.kind === "account" && o.code === c).id;
        const bank = id => (b.objects.find(o => o.kind === "account" && o.bankId === id) || {}).id;
        const wio = bank("bank1"), wioUSD = bank("bank2") || wio;
        const inv = (id, date, due, cust, items, extra = {}) => A.put("objects/doc/" + id, { id, type: "invoice", auto: true, date: d(date), due: d(due), status: "sent", currency: "AED", party: { name: cust, email: "accounts@" + cust.split(" ")[0].toLowerCase() + ".example" }, items: items.map(([n, q, r, v = 5]) => ({ name: n, qty: q, rate: r, vat: v })), charges: [], discount: { type: "amt", value: 0 }, fx: {}, ...extra });
        await A.put("objects/journal/open", { id: "open", date: d("2026-07-01"), notes: "Opening bank balance", lines: [{ accountId: wio, debit: 185000 }, { accountId: acc("3000"), credit: 185000 }] });
        await inv("i1", "2026-07-12", "2026-08-11", "Gulf Packaging LLC", [["Market entry consultancy", 1, 42000]]);
        await inv("i2", "2026-08-05", "2026-09-04", "Al Noor Trading", [["Brand licensing review", 1, 18500], ["Trademark search (GCC)", 3, 1500]]);
        await inv("i3", "2026-08-20", "2026-09-19", "Himalaya Foods FZE", [["Distribution set-up", 1, 26000]]);
        await inv("i4", "2026-09-10", "2026-10-10", "Gulf Packaging LLC", [["Monthly retainer", 1, 15000]]);
        await inv("i5", "2026-09-28", "2026-10-28", "Alpine Watch Brands SA", [["Relaunch strategy, phase 1", 1, 12000, 0]], { currency: "USD", fx: { show: true, rate: 3.6725 }, taxTreatment: "zero" });
        await inv("i6", "2026-10-02", "2026-11-01", "Al Noor Trading", [["Monthly retainer", 1, 15000]]);
        await inv("i7", "2026-10-08", "2026-11-07", "Himalaya Foods FZE", [["Packaging redesign", 1, 9800]]);
        await A.put("objects/doc/q1", { id: "q1", type: "quotation", auto: true, date: d("2026-10-11"), due: d("2026-11-10"), status: "sent", currency: "AED", party: { name: "Desert Rose Cosmetics LLC" }, items: [{ name: "Market study — KSA cosmetics retail", qty: 1, rate: 24000, vat: 5 }], charges: [], discount: { type: "amt", value: 0 }, fx: {} });
        const pay = (id, date, cust, amt, invId) => A.put("objects/payment/" + id, { id, date: d(date), contactName: cust, currency: "AED", amount: amt, accountId: wio, method: "Bank transfer", allocations: invId ? [{ docId: invId, amount: amt }] : [] });
        await pay("p1", "2026-08-09", "Gulf Packaging LLC", 44100, "i1");
        await pay("p2", "2026-09-02", "Al Noor Trading", 15000, "i2");
        await pay("p3", "2026-09-18", "Himalaya Foods FZE", 27300, "i3");
        await pay("p4", "2026-10-06", "Gulf Packaging LLC", 10000, "i4");
        await A.put("objects/payment/p5", { id: "p5", date: d("2026-10-09"), contactName: "Alpine Watch Brands SA", currency: "USD", rate: 3.67, amount: 12000, accountId: wioUSD, allocations: [{ docId: "i5", amount: 12000 }] });
        const bill = (id, date, due, v, items) => A.put("objects/bill/" + id, { id, number: id.toUpperCase(), vendorName: v, date: d(date), due: d(due), currency: "AED", items: items.map(([n, q, r, a, vat = 5]) => ({ name: n, qty: q, rate: r, vat, account: acc(a) })) });
        await bill("lic-2026", "2026-07-05", "2026-07-20", "Free Zone Authority", [["Licence renewal", 1, 14500, "6110", 0]]);
        await bill("off-07", "2026-07-01", "2026-07-10", "Business Centre", [["Flexi desk Jul–Sep", 1, 9000, "6000"]]);
        await bill("off-10", "2026-10-01", "2026-10-10", "Business Centre", [["Flexi desk Oct–Dec", 1, 9000, "6000"]]);
        await bill("law-221", "2026-09-15", "2026-10-15", "Corporate Law Partners", [["Share purchase agreement review", 1, 22000, "6080"]]);
        await bill("ads-88", "2026-10-05", "2026-11-04", "Online Ads Agency", [["Brand campaign", 1, 6500, "6100"]]);
        const bp = (id, date, v, amt, billId) => A.put("objects/billPayment/" + id, { id, date: d(date), vendorName: v, currency: "AED", amount: amt, accountId: wio, allocations: [{ billId, amount: amt }] });
        await bp("bp1", "2026-07-06", "Free Zone Authority", 14500, "lic-2026");
        await bp("bp2", "2026-07-08", "Business Centre", 9450, "off-07");
        await bp("bp3", "2026-10-03", "Corporate Law Partners", 10000, "law-221");
        const ex = (id, date, a, amt, v, desc) => A.put("objects/expense/" + id, { id, date: d(date), accountId: acc(a), paidThrough: wio, amount: amt, vatRate: 5, inclusive: true, currency: "AED", vendorName: v, description: desc });
        await ex("e1", "2026-08-14", "6040", 2840, "Airline", "Flight DXB–ZRH, client meeting");
        await ex("e2", "2026-09-03", "6070", 1155, "Office software", "Annual subscription");
        await ex("e3", "2026-10-07", "6050", 420, "Restaurant", "Client dinner");
        await ex("e4", "2026-10-09", "6030", 630, "Telecom provider", "Mobile and internet");
        await A.put("objects/rule/r1", { id: "r1", name: "Electricity & water", direction: "out", match: "all", conditions: [{ field: "description", op: "contains", value: "DEWA" }], targetAccount: acc("6020"), vatRate: 5, contactName: "DEWA", auto: false, priority: 1 });
        await A.post(`bank/accounts/${wio}/import`, { rows: [
            { date: d("2026-10-03"), description: "OUTWARD TT CORPORATE LAW PARTNERS", amount: -10000 },
            { date: d("2026-10-06"), description: "INWARD TT GULF PACKAGING LLC", reference: "FT2610061", amount: 10000 },
            { date: d("2026-10-07"), description: "POS RESTAURANT DIFC", amount: -420 },
            { date: d("2026-10-09"), description: "TELECOM DIRECT DEBIT", amount: -630 },
            { date: d("2026-10-10"), description: "DEWA BILL 2002918", amount: -735 },
            { date: d("2026-10-11"), description: "BANK CHARGES MONTHLY", amount: -52.5 }] });
        const txns = (await A.get(`bank/accounts/${wio}/txns`)).txns;
        for (const tx of txns) {
            const s = await A.get(`bank/txns/${tx.id}/suggestions`);
            if (s.matches[0] && !/DEWA|CHARGES/.test(tx.description)) await A.post(`bank/txns/${tx.id}/match`, { kind: s.matches[0].kind, id: s.matches[0].id });
        }
        await A.put("objects/recurring/rc1", { id: "rc1", name: "Gulf Packaging monthly retainer", templateId: "i4", frequency: "monthly", every: 1, nextDate: d("2026-11-10"), status: "draft", active: true });
        for (const u of DEMO_USERS.slice(1)) {
            await A.post("users", { name: u.name, email: u.email, role: u.role.toLowerCase() });
            await E.setPassword(u.email, DEMO.password);
        }
        // Payroll: four employees, an advance, and last month's pay run approved and paid
        const dir = (await A.get("users/directory")).users;
        const uid_ = email => (dir.find(x => x.email === email) || {}).id || "";
        const emps = [
            ["emp1", "E001", "Shvetang Reddy Musani", "Director", "Management", { basic: 30000, housing: 10000, transport: 2000, allowance: 0 }, 0, ""],
            ["emp2", "E002", "Aisha Khan", "Accountant", "Finance", { basic: 9000, housing: 3000, transport: 800, allowance: 0 }, 0, ""],
            ["emp3", "E003", "Rahul Mehta", "Sales manager", "Sales", { basic: 12000, housing: 4000, transport: 1000, allowance: 0 }, 5, uid_("rahul@evam.ae")],
            ["emp4", "E004", "Omar Saeed", "Office administrator", "Operations", { basic: 5000, housing: 1500, transport: 500, allowance: 0 }, 0, ""]
        ];
        for (const [id, code, name, designation, department, pay, rate, userId] of emps) {
            await A.put("objects/employee/" + id, { id, code, name, designation, department, pay, commissionRate: rate, commissionBase: "collected", userId, joined: d("2026-01-01"), status: "active", advanceInstallment: id === "emp4" ? 500 : 0, bankName: "Wio Bank", iban: "", routingCode: "", personId: "" });
        }
        await A.put("objects/journal/adv1", { id: "adv1", date: d("2026-09-10"), notes: "Advance to Omar Saeed", lines: [{ accountId: acc("1400"), debit: 2000, contactName: "Omar Saeed", memo: "Salary advance" }, { accountId: wio, credit: 2000, contactName: "Omar Saeed", memo: "Salary advance" }] });
        const period = d("2026-09-30").slice(0, 7);
        const line = (e, extra = [], ded = []) => ({ employeeId: e[0], name: e[2], code: e[1], designation: e[3], department: e[4], earnings: [...Object.entries(e[5]).filter(([, v]) => v).map(([type, amount]) => ({ type, amount })), ...extra], deductions: ded });
        const run = { id: "pr1", period, date: d("2026-09-30"), status: "approved", notes: "", lines: [line(emps[0]), line(emps[1]), line(emps[2], [{ type: "commission", amount: 1250 }]), line(emps[3], [], [{ type: "advance", amount: 500 }])] };
        await A.put("objects/payrun/pr1", run);
        const saved = (await A.get("objects/payrun/pr1")).object;
        await A.put("objects/payrun/pr1", { ...saved, status: "paid", payment: { date: d("2026-10-01"), accountId: wio } });
        // HR: the same people in HR, plus Fatima with a self-service sign-in, a week of attendance and some leave
        await seedHR(A, d);
        dirty = true;
    }

    /* ---------- HR example data (HR module) ---------- */
    async function seedHR(A, d) {
        const cfg = await A.get("hr/config");
        const today = cfg.today, wk = cfg.settings.weekend;
        const add = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
        const dow = iso => new Date(iso + "T00:00:00Z").getUTCDay();
        const fat = (await A.post("hr/employees", { code: "E005", name: "Fatima Noor", department: "Sales", designation: "Sales executive", email: "fatima@evam.ae", joined: d("2026-03-01") })).employee;
        const o = (await A.get("objects/employee/" + fat.id)).object;
        await A.put("objects/employee/" + fat.id, { ...o, pay: { basic: 8000, housing: 3000, transport: 1000, allowance: 0 } });
        const fu = (await A.get("users")).users.find(u => u.email === "fatima@evam.ae");   // made with the other example sign-ins
        if (fu) await A.put("hr/employees/" + fat.id, { userId: fu.id });
        const hols = new Set((await A.get("hr/holidays")).holidays.map(h => h.date));
        const ids = ["emp1", "emp2", "emp3", "emp4", fat.id];
        const ins = ["08:47", "08:55", "09:04", "09:22", "08:51"], outs = ["17:42", "18:05", "17:58", "18:15", "17:50"];
        let n = 0;
        for (let i = 7; i >= 1; i--) {
            const day = add(today, -i);
            if (wk.includes(dow(day)) || hols.has(day)) continue;
            for (const id of ids) { n++; await A.post("hr/attendance", { employeeId: id, date: day, clockIn: ins[n % 5], clockOut: outs[(n * 3) % 5] }); }
        }
        if (!wk.includes(dow(today)) && !hols.has(today)) for (const [id, t] of [["emp1", "08:40"], ["emp2", "08:52"], ["emp3", "09:19"]]) await A.post("hr/attendance", { employeeId: id, date: today, clockIn: t });
        // leave: Rahul (Sales) has approved casual leave; Fatima's request for the same days waits for HR (a clash)
        const mon = add(today, ((8 - dow(today)) % 7) || 7);
        const as = async (email, fn) => { await A.post("login", { email, password: DEMO.password }); try { return await fn(); } finally { await A.post("login", { email: DEMO.owner, password: DEMO.password }); } };
        const lv = await as("rahul@evam.ae", () => A.post("hr/me/leaves", { leaveType: "casual", startDate: add(mon, 2), endDate: add(mon, 3), reason: "Family visit" }));
        await A.put(`hr/leaves/${lv.leave.id}/review`, { status: "approved", adminNote: "Enjoy" });
        await as("fatima@evam.ae", () => A.post("hr/me/leaves", { leaveType: "annual", startDate: add(mon, 3), endDate: add(mon, 4), reason: "Cousin's wedding" }));
    }

    /* ---------- Loading screen ---------- */
    function splash(text) {
        let el = document.getElementById("browserSplash");
        if (!el && text) {
            el = document.createElement("div");
            el.id = "browserSplash";
            el.innerHTML = `<div class="bs-card"><img src="logo.svg" alt="EVAM"><div class="bs-spin" aria-hidden="true"></div><p></p></div>`;
            (document.body || document.documentElement).appendChild(el);
        }
        if (!el) return;
        if (!text) { el.remove(); return; }
        el.querySelector("p").textContent = text;
    }

    /* ---------- Start the engine ---------- */
    const ready = (async () => {
        if (!document.body) await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
        splash("Opening EVAM Books…");
        SQL_ENGINE = await initSqlJs({ wasmBinary: b64ToBytes(window.EVAM_SQL_WASM) });
        const bytes = await loadBytes();
        E = EVAMEngine.createEngine(SQL_ENGINE, bytes, { onWrite: () => { dirty = true; }, vars: { SETUP_CODE: DEMO.setupCode } });
        if (E.fresh) {
            let empty = false;
            try { empty = localStorage.getItem(LS_EMPTY) === "1"; localStorage.removeItem(LS_EMPTY); } catch { /* ignore */ }
            if (!empty) { splash("Setting up the example company…"); await seed(); }
            dirty = true;
            await flush();
        } else {
            // Daily jobs (recurring invoices, reminders) run when the app is opened
            try {
                const day = new Date().toISOString().slice(0, 10);
                if (localStorage.getItem(LS_CRON) !== day) { await E.scheduled(); localStorage.setItem(LS_CRON, day); await flush(); }
            } catch (e) { console.warn("Daily jobs", e); }
        }
        try { localStorage.setItem(LS_MODE, storage); } catch { /* ignore */ }
        if (storage === "none") warnNoStorage();
        splash("");
    })();
    ready.catch(e => {
        console.error(e);
        splash("");
        document.body.insertAdjacentHTML("beforeend", `<div id="browserSplash"><div class="bs-card"><img src="logo.svg" alt="EVAM"><h2>EVAM Books couldn't start</h2><p>${String(e && e.message || e).replace(/[<&]/g, "")}</p><p>Use a current version of Chrome, Edge, Firefox or Safari, and keep all the files of this folder together.</p></div></div>`);
    });

    /* ---------- Route the app's server calls to the engine ---------- */
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith(Server.base)) return realFetch(input, init);
        await ready;
        return call((init.method || "GET").toUpperCase(), url.slice(Server.base.length), init.headers, init.body);
    };
    Server.detect = async function () {
        try { await ready; } catch { return false; }
        const r = await fetch(this.base + "status");
        return r.ok ? r.json() : false;
    };

    /* ---------- Opening attachments (they live in the browser database) ---------- */
    document.addEventListener("click", async e => {
        const a = e.target.closest && e.target.closest('a[href*="/api/files/"]');
        if (!a) return;
        e.preventDefault();
        const w = window.open("", "_blank");
        try {
            const r = await fetch(Server.base + "files/" + a.getAttribute("href").split("/api/files/")[1]);
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "File not found.");
            const blob = await r.blob();
            const u = URL.createObjectURL(blob);
            if (w) w.location.href = u;
            else { const x = document.createElement("a"); x.href = u; x.download = a.textContent.trim() || "file"; x.click(); }
            setTimeout(() => URL.revokeObjectURL(u), 60000);
        } catch (err) { if (w) w.close(); toast(err.message, "bad"); }
    }, true);

    /* ---------- Sign-in screens: show the example sign-ins ---------- */
    const origShow = Auth.show.bind(Auth);
    Auth.show = function (mode, message) {
        origShow(mode, message);
        const card = document.querySelector("#authScreen .auth-card");
        if (!card) return;
        let note = "";
        if (mode === "login") {
            note = `<div class="bs-note"><b>Browser edition</b> — the example company has these sign-ins (password <code>${DEMO.password}</code>):
                <div class="bs-users">${DEMO_USERS.map(u => `<button type="button" class="bs-user" data-email="${u.email}"><span>${u.name}</span><small>${u.role} · ${u.email}</small></button>`).join("")}</div></div>`;
        } else if (mode === "setup") {
            note = `<div class="bs-note"><b>Browser edition</b> — the setup code is <code>${DEMO.setupCode}</code>. Your company is saved in this browser on this computer.</div>`;
        }
        if (!note) return;
        card.insertAdjacentHTML("beforeend", note);
        card.querySelectorAll(".bs-user").forEach(b => b.addEventListener("click", () => {
            const f = document.getElementById("authForm");
            f.email.value = b.dataset.email; f.password.value = DEMO.password;
            f.requestSubmit();
        }));
    };

    /* ---------- Browser edition menu ---------- */
    function stamp() { return new Date().toISOString().slice(0, 10); }
    async function about() {
        const where = storage === "indexeddb" || storage === "local" ? "in this browser on this computer" : "only until you close this window (this browser blocks saving)";
        await openDialog({
            title: "EVAM Books — browser edition",
            body: `<div class="bs-about">
<p>This is the full EVAM Books — documents, receivables, payables, banking, VAT and reports — running entirely inside your browser. Your data never leaves it and is saved ${where}. The only things fetched from the internet are exchange rates and, when you import scans, the text-recognition software.</p>
<h3>Sign-ins in the example company</h3>
<table class="bs-table"><tbody>${DEMO_USERS.map(u => `<tr><td>${u.name}</td><td>${u.role}</td><td><code>${u.email}</code></td></tr>`).join("")}</tbody></table>
<p>Password for all of them: <code>${DEMO.password}</code>. Sign out from the account menu to try another role.</p>
<h3>Good to know</h3>
<ul>
<li>Each browser keeps its own copy. Use <b>Download backup</b> to keep a copy or move it to another computer.</li>
<li>Email reminders are not sent from the browser edition (they are listed as queued).</li>
<li>Payroll, the bulk document import (OCR) and live exchange rates all work here too.</li>
<li>Recurring invoices and reminders run when you open the app each day.</li>
<li>For your team to share one set of books, deploy EVAM Books to Cloudflare (see DEPLOY.md).</li>
</ul></div>`,
            actions: [{ label: "Close", value: "ok", primary: true }]
        });
    }
    async function backup() {
        await flush();
        download(`EVAM-Books-backup-${stamp()}.evambooks`, E.export(), "application/octet-stream");
        toast("Backup downloaded.", "good");
    }
    function restore() {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = ".evambooks,.sqlite,.db";
        inp.addEventListener("change", async () => {
            const f = inp.files[0];
            if (!f) return;
            const bytes = new Uint8Array(await f.arrayBuffer());
            if (new TextDecoder().decode(bytes.subarray(0, 15)) !== "SQLite format 3") { toast("That file isn't an EVAM Books backup.", "bad", 6000); return; }
            if (!await confirmDialog("Replace everything in this browser with the backup? Anything not in the backup will be lost.", "Restore backup", true, "Restore backup")) return;
            paused = true;
            await saving;
            await clearBytes(true);
            await saveBytes(bytes);
            location.reload();
        });
        inp.click();
    }
    async function restart(empty) {
        const msg = empty
            ? "Delete everything in this browser and start a new, empty company? Download a backup first if you want to keep anything."
            : "Delete everything in this browser and load the example company again? Download a backup first if you want to keep anything.";
        if (!await confirmDialog(msg, empty ? "Start empty" : "Reset", true, empty ? "Start with an empty company" : "Reset to the example company")) return;
        paused = true;
        await saving;
        await clearBytes();
        try { if (empty) localStorage.setItem(LS_EMPTY, "1"); } catch { /* ignore */ }
        location.reload();
    }
    function menuItems() {
        return [
            { heading: "Browser edition" },
            { label: "About & sign-ins", icon: "note", onClick: about },
            { label: "Download backup", icon: "download", onClick: backup },
            { label: "Restore a backup…", icon: "upload", onClick: restore },
            { label: "Reset to example company", icon: "refresh", onClick: () => restart(false) },
            { label: "Start with an empty company", icon: "plus", onClick: () => restart(true), danger: true }
        ];
    }
    const origMenu = Auth.openUserMenu.bind(Auth);
    Auth.openUserMenu = function (anchor) {
        const sm = window.showMenu;
        window.showMenu = (a, items, align) => sm(a, [...items, { divider: true }, ...menuItems()], align);
        try { origMenu(anchor); } finally { window.showMenu = sm; }
    };
    const origRender = Auth.renderUserMenu.bind(Auth);
    Auth.renderUserMenu = function () {
        origRender();
        const right = document.querySelector(".appbar-right");
        if (!right || document.getElementById("browserChip")) return;
        const chip = document.createElement("button");
        chip.type = "button"; chip.id = "browserChip"; chip.className = "browser-chip";
        chip.textContent = "Browser edition";
        chip.title = "Saved in this browser · backup, reset and sign-ins";
        chip.addEventListener("click", () => showMenu(chip, menuItems(), "right"));
        right.prepend(chip);
    };

    /* ---------- Multi-tab support and cross-tab database sync ---------- */
    try {
        syncChannel = new BroadcastChannel("evam-books-browser");
        syncChannel.onmessage = async ev => {
            const msg = ev.data;
            if (!msg || msg.from === TAB_ID || msg.type !== "database-changed" || paused) return;
            // Don't replace a local database while it has uncommitted writes.
            // The next write will rebase from IndexedDB under the shared lock.
            if (!dirty) {
                try {
                    const changed = await refreshEngineFromStorage();
                    if (changed) window.dispatchEvent(new CustomEvent("evambooks:database-updated", { detail: { at: msg.at } }));
                } catch (err) { console.warn("EVAM Books cross-tab refresh", err); }
            }
        };
        document.addEventListener("visibilitychange", async () => {
            if (document.visibilityState === "visible" && !dirty) {
                try {
                    const changed = await refreshEngineFromStorage();
                    if (changed) window.dispatchEvent(new CustomEvent("evambooks:database-updated", { detail: { at: Date.now() } }));
                } catch (err) { console.warn("EVAM Books tab refresh", err); }
            }
        });
    } catch { /* BroadcastChannel is optional; writes still work in this tab. */ }

    /* ---------- Styles for the bits above ---------- */
    const css = document.createElement("style");
    css.textContent = `
#browserSplash{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:var(--app);padding:16px}
#browserSplash .bs-card{max-width:420px;text-align:center;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px 24px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
#browserSplash img{height:34px;margin-bottom:14px}
#browserSplash h2{margin:0 0 8px;font-size:18px}
#browserSplash p{margin:8px 0 0;color:var(--steel);font-size:14px;line-height:1.5}
#browserSplash .btn{margin-top:16px}
.bs-spin{width:26px;height:26px;margin:4px auto 0;border-radius:50%;border:3px solid var(--line);border-top-color:var(--navy);animation:bsSpin .8s linear infinite}
@keyframes bsSpin{to{transform:rotate(360deg)}}
.bs-note{margin-top:18px;padding:12px 14px;border-radius:10px;background:var(--navy-soft);font-size:13px;line-height:1.5;text-align:left}
.bs-note code,.bs-about code{font-size:12px;background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px}
.bs-users{display:grid;gap:6px;margin-top:10px}
.bs-user{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:7px 10px;cursor:pointer;font:inherit}
.bs-user:hover{border-color:var(--navy)}
.bs-user span{font-weight:600}
.bs-user small{color:var(--steel);font-size:12px;overflow-wrap:anywhere}
.browser-chip{border:1px dashed var(--navy);color:var(--navy);background:transparent;border-radius:999px;padding:4px 10px;font:600 12px/1.4 inherit;cursor:pointer;white-space:nowrap}
.browser-chip:hover{background:var(--navy-soft)}
@media (max-width:640px){.browser-chip{display:none}}
.bs-about h3{font-size:14px;margin:16px 0 6px}
.bs-about ul{padding-left:18px;margin:0}
.bs-about li{margin:4px 0}
.bs-table{width:100%;border-collapse:collapse;font-size:13px}
.bs-table td{padding:5px 6px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}`;
    document.head.appendChild(css);

    window.EVAMBrowser = { ready, flush, about, get engine() { return E; } };
})();
