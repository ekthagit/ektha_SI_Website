/* EVAM Books engine (browser edition) — generated from src/, do not edit */
var EVAMEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // demo/shim.js
  function toBytes(b) {
    if (b == null)
      return new Uint8Array(0);
    if (typeof b === "string")
      return new TextEncoder().encode(b);
    if (b instanceof Uint8Array)
      return b;
    if (b instanceof ArrayBuffer)
      return new Uint8Array(b);
    if (ArrayBuffer.isView(b))
      return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return new TextEncoder().encode(String(b));
  }
  var Headers, Body, Request, Response;
  var init_shim = __esm({
    "demo/shim.js"() {
      Headers = class {
        constructor(init) {
          this._m = /* @__PURE__ */ new Map();
          if (init instanceof Headers)
            init.forEach((v, k) => this.set(k, v));
          else if (Array.isArray(init))
            init.forEach(([k, v]) => this.set(k, v));
          else if (init) {
            for (const k of Object.keys(init))
              if (init[k] !== void 0)
                this.set(k, init[k]);
          }
        }
        get(k) {
          const v = this._m.get(String(k).toLowerCase());
          return v === void 0 ? null : v;
        }
        set(k, v) {
          this._m.set(String(k).toLowerCase(), String(v));
        }
        append(k, v) {
          const c = this.get(k);
          this.set(k, c === null ? v : c + ", " + v);
        }
        has(k) {
          return this._m.has(String(k).toLowerCase());
        }
        delete(k) {
          this._m.delete(String(k).toLowerCase());
        }
        forEach(fn) {
          this._m.forEach((v, k) => fn(v, k, this));
        }
        entries() {
          return this._m.entries();
        }
        keys() {
          return this._m.keys();
        }
        values() {
          return this._m.values();
        }
        [Symbol.iterator]() {
          return this._m.entries();
        }
      };
      Body = class {
        async arrayBuffer() {
          const u = toBytes(this._body);
          return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
        }
        async text() {
          return typeof this._body === "string" ? this._body : new TextDecoder().decode(toBytes(this._body));
        }
        async json() {
          return JSON.parse(await this.text());
        }
        get body() {
          return this._body;
        }
      };
      Request = class extends Body {
        constructor(url, init = {}) {
          super();
          if (url instanceof Request) {
            init = { method: url.method, headers: url.headers, body: url._body, ...init };
            url = url.url;
          }
          this.url = String(url);
          this.method = (init.method || "GET").toUpperCase();
          this.headers = new Headers(init.headers);
          this._body = init.body;
        }
      };
      Response = class extends Body {
        constructor(body, init = {}) {
          super();
          this._body = body;
          this.status = init.status || 200;
          this.statusText = init.statusText || "";
          this.headers = new Headers(init.headers);
        }
        get ok() {
          return this.status >= 200 && this.status < 300;
        }
        static redirect(url, status = 302) {
          return new Response(null, { status, headers: { location: url } });
        }
        static json(data, init = {}) {
          return new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...init.headers || {} } });
        }
      };
    }
  });

  // src/util.js
  var util_exports = {};
  __export(util_exports, {
    HttpError: () => HttpError,
    addDays: () => addDays,
    addMonths: () => addMonths,
    clientIP: () => clientIP,
    daysBetween: () => daysBetween,
    ipAllowed: () => ipAllowed,
    isISODate: () => isISODate,
    json: () => json,
    now: () => now,
    num: () => num,
    randomToken: () => randomToken,
    readJSON: () => readJSON,
    round: () => round,
    sha256: () => sha256,
    todayISO: () => todayISO,
    uid: () => uid
  });
  function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
    });
  }
  function uid(prefix = "") {
    const b = new Uint8Array(10);
    crypto.getRandomValues(b);
    return prefix + Date.now().toString(36) + [...b].map((x) => (x % 36).toString(36)).join("").slice(0, 8);
  }
  function randomToken(bytes = 32) {
    const b = new Uint8Array(bytes);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function sha256(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  function num(v) {
    if (typeof v === "number")
      return isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return isFinite(n) ? n : 0;
  }
  function round(v, dec = 2) {
    const f = Math.pow(10, dec);
    const n = Number((v * f).toFixed(6));
    return (n < 0 ? -Math.round(-n) : Math.round(n)) / f;
  }
  function todayISO(tz = "Asia/Dubai") {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
    return parts;
  }
  function addDays(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
    return dt.toISOString().slice(0, 10);
  }
  function addMonths(iso, months) {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    const pa = Date.parse(a + "T00:00:00Z"), pb = Date.parse(b + "T00:00:00Z");
    return Math.round((pb - pa) / 864e5);
  }
  async function readJSON(req, limit = 4e6) {
    const len = Number(req.headers.get("content-length") || 0);
    if (len > limit)
      throw new HttpError(413, "That is too much data in one request.");
    let body;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "The request was not valid JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new HttpError(400, "The request must be a JSON object.");
    return body;
  }
  function clientIP(req) {
    return req.headers.get("cf-connecting-ip") || "127.0.0.1";
  }
  function ipAllowed(ip, list) {
    if (!list || !list.length)
      return true;
    return list.some((entry) => cidrMatch(ip, String(entry).trim()));
  }
  function ipToBig(ip) {
    if (ip.includes(":")) {
      const [head, tail = ""] = ip.split("::");
      const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
      const parts = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
      return { v: 6, n: parts.reduce((acc, p2) => (acc << 16n) + BigInt(parseInt(p2 || "0", 16)), 0n) };
    }
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((x) => isNaN(x)))
      return null;
    return { v: 4, n: BigInt((p[0] << 24 >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) };
  }
  function cidrMatch(ip, cidr) {
    if (!cidr)
      return false;
    const [base, bitsStr] = cidr.split("/");
    const a = ipToBig(ip), b = ipToBig(base);
    if (!a || !b || a.v !== b.v)
      return false;
    const width = a.v === 4 ? 32 : 128;
    const bits = bitsStr === void 0 ? width : Number(bitsStr);
    if (!(bits >= 0 && bits <= width))
      return false;
    const shift = BigInt(width - bits);
    return a.n >> shift === b.n >> shift;
  }
  var HttpError, now, isISODate;
  var init_util = __esm({
    "src/util.js"() {
      init_shim();
      HttpError = class extends Error {
        constructor(status, message, extra = {}) {
          super(message);
          this.status = status;
          this.extra = extra;
        }
      };
      now = () => Date.now();
      isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
    }
  });

  // src/auth.js
  async function hashPassword(password, salt = null) {
    salt = salt || crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
    return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
  }
  async function verifyPassword(password, stored) {
    const [scheme, iter, salt, hash] = String(stored || "").split("$");
    if (scheme !== "pbkdf2")
      return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: Number(iter) }, key, 256);
    const a = b64(bits);
    if (a.length !== hash.length)
      return false;
    let diff2 = 0;
    for (let i = 0; i < a.length; i++)
      diff2 |= a.charCodeAt(i) ^ hash.charCodeAt(i);
    return diff2 === 0;
  }
  function passwordProblem(pw, email = "") {
    if (typeof pw !== "string" || pw.length < 10)
      return "Use at least 10 characters.";
    if (pw.length > 200)
      return "That password is too long.";
    if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3)
      return "Don't use your email name in the password.";
    if (/^(.)\1+$/.test(pw) || /^(password|1234567890|qwertyuiop)/i.test(pw))
      return "That password is too easy to guess.";
    return null;
  }
  function newTotpSecret() {
    const b = crypto.getRandomValues(new Uint8Array(20));
    let bits = "", out = "";
    for (const x of b)
      bits += x.toString(2).padStart(8, "0");
    for (let i = 0; i + 5 <= bits.length; i += 5)
      out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return out;
  }
  function b32decode(s) {
    let bits = "";
    for (const c of s.replace(/=+$/, "").toUpperCase()) {
      const v = B32.indexOf(c);
      if (v < 0)
        continue;
      bits += v.toString(2).padStart(5, "0");
    }
    const out = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < out.length; i++)
      out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    return out;
  }
  async function hotp(secret, counter) {
    const key = await crypto.subtle.importKey("raw", b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const msg = new ArrayBuffer(8);
    const view = new DataView(msg);
    view.setUint32(0, Math.floor(counter / 2 ** 32));
    view.setUint32(4, counter >>> 0);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
    const off = mac[mac.length - 1] & 15;
    const code = (mac[off] & 127) << 24 | mac[off + 1] << 16 | mac[off + 2] << 8 | mac[off + 3];
    return String(code % 1e6).padStart(6, "0");
  }
  async function verifyTotp(secret, code, t = Date.now(), lastStep = null) {
    code = String(code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code))
      return false;
    const c = Math.floor(t / 3e4);
    for (const d of [-1, 0, 1]) {
      if (lastStep !== null && lastStep !== void 0 && c + d <= lastStep)
        continue;
      if (await hotp(secret, c + d) === code)
        return c + d;
    }
    return false;
  }
  function areaOf(kind, type) {
    switch (kind) {
      case "doc":
        return SALES_TYPES.has(type) ? "sales" : type === "purchaseOrder" ? "purchases" : "letters";
      case "payment":
      case "recurring":
      case "reminder":
        return "sales";
      case "bill":
      case "billPayment":
      case "vendorCredit":
        return "purchases";
      case "expense":
        return "expenses";
      case "journal":
      case "account":
        return "accounting";
      case "transfer":
      case "bankEntry":
      case "rule":
      case "reconciliation":
        return "banking";
      case "contact":
      case "product":
        return "contacts";
      case "settings":
        return "settings";
      case "employee":
      case "payrun":
        return "payroll";
      default:
        return "accounting";
    }
  }
  function canWrite(user, kind, type, obj = null) {
    if (!user)
      return false;
    const r = ROLES[user.role];
    if (!r)
      return false;
    const area = areaOf(kind, type);
    if (area === "payroll")
      return !!r.payroll;
    if (r.write === "*")
      return true;
    if (r.write.includes(area))
      return true;
    if (area === "expenses" && r.write.includes("expenses_own"))
      return !obj || !obj.created_by || obj.created_by === user.id;
    return false;
  }
  function canRead(user, kind, type, obj = null) {
    if (!user)
      return false;
    const r = ROLES[user.role];
    if (!r)
      return false;
    const area = kind === "account" ? "accounts" : areaOf(kind, type);
    if (area === "payroll")
      return !!r.payroll;
    if (r.read === "*")
      return true;
    if (r.read.includes(area))
      return true;
    if (area === "expenses" && r.read.includes("expenses_own"))
      return !obj || obj.created_by === user.id;
    return false;
  }
  function canReport(user, name) {
    const r = ROLES[user?.role];
    if (!r)
      return false;
    if (PAYROLL_REPORTS.has(name))
      return !!r.payroll;
    return r.reports === "*" || r.reports.includes(name);
  }
  function readCookie(req, name) {
    const c = req.headers.get("cookie") || "";
    for (const part of c.split(/;\s*/)) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i) === name)
        return decodeURIComponent(part.slice(i + 1));
    }
    return null;
  }
  function sessionCookie(env, token, maxAgeSec) {
    const path = env.BASE_PATH || "/";
    const secure = env.INSECURE_COOKIES === "1" ? "" : "; Secure";
    return `${COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSec}`;
  }
  async function createSession(env, req, userId, stage = "full") {
    const token = randomToken(32);
    const id = await sha256(token);
    const t = now();
    const days = stage === "full" ? SESSION_DAYS : 0.01;
    await env.DB.prepare("INSERT INTO sessions (id, user_id, stage, ip, agent, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, userId, stage, clientIP(req), (req.headers.get("user-agent") || "").slice(0, 200), t, t, t + days * 864e5).run();
    return { token, maxAge: Math.round(days * 86400) };
  }
  async function getSession(env, req) {
    const token = readCookie(req, COOKIE);
    if (!token)
      return null;
    const id = await sha256(token);
    const row = await env.DB.prepare(
      "SELECT s.id sid, s.stage, s.last_seen, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"
    ).bind(id).first();
    if (!row)
      return null;
    const t = now();
    if (row.expires_at < t || row.stage === "full" && t - row.last_seen > IDLE_HOURS * 36e5 || row.disabled) {
      await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
      return null;
    }
    if (t - row.last_seen > 6e4)
      await env.DB.prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").bind(t, id).run();
    return { sid: row.sid, stage: row.stage, user: publicUser(row), raw: row };
  }
  async function endSession(env, sid) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  }
  function publicUser(u) {
    return { id: u.id, email: u.email, name: u.name, role: u.role, mfa: !!u.totp_secret, mustChange: !!u.must_change, lastLogin: u.last_login, disabled: !!u.disabled, createdAt: u.created_at };
  }
  function checkOrigin(req) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method))
      return;
    const origin = req.headers.get("origin");
    const url = new URL(req.url);
    if (origin && origin !== url.origin)
      throw new HttpError(403, "Requests from other sites are not allowed.");
    if (req.headers.get("x-evam") !== "1")
      throw new HttpError(403, "Missing request header.");
  }
  async function checkIp(env, req, settings) {
    const list = settings?.security?.ipAllow || [];
    if (!ipAllowed(clientIP(req), list))
      throw new HttpError(403, "Sign-in from this network is not allowed. Ask your administrator to add it to the allowed IP list.");
  }
  var ITER, SESSION_DAYS, IDLE_HOURS, COOKIE, b64, unb64, B32, ROLES, PAYROLL_REPORTS, SALES_TYPES, isAdmin, canAudit;
  var init_auth = __esm({
    "src/auth.js"() {
      init_shim();
      init_util();
      ITER = 1e5;
      SESSION_DAYS = 14;
      IDLE_HOURS = 12;
      COOKIE = "evb_s";
      b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
      unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      ROLES = {
        owner: { label: "Owner", write: "*", read: "*", reports: "*", payroll: true, hr: true },
        // HR: hr flag
        admin: { label: "Admin", write: "*", read: "*", reports: "*", payroll: true, hr: true },
        // HR: hr flag
        accountant: { label: "Accountant", write: ["sales", "purchases", "expenses", "letters", "banking", "accounting", "contacts", "settings"], read: "*", reports: "*", audit: true, payroll: true, hr: false },
        // HR: hr flag
        sales: { label: "Sales", write: ["sales", "letters", "contacts", "expenses_own"], read: ["sales", "letters", "contacts", "settings", "accounts", "expenses_own"], reports: ["ar_ageing", "customer_statement", "sales_by_customer", "sales_by_item", "payments_received"] },
        purchases: { label: "Purchasing", write: ["purchases", "letters", "contacts", "expenses_own"], read: ["purchases", "letters", "contacts", "settings", "accounts", "expenses_own"], reports: ["ap_ageing", "expenses_by_category", "vendor_balances", "payments_made"] },
        staff: { label: "Staff (expenses only)", write: ["expenses_own"], read: ["settings", "accounts", "contacts", "expenses_own"], reports: [] },
        viewer: { label: "Viewer (read only)", write: [], read: "*", reports: "*" },
        // HR: HR manager (attendance, leave, holidays, employees' HR details; no salaries unless also payroll) and
        // employee self-service (clock in/out, own leave and payslips only — no finance or document data at all)
        hr: { label: "HR manager", write: ["letters"], read: ["letters", "contacts", "settings"], reports: [], hr: true },
        employee: { label: "Employee (self-service)", write: [], read: [], reports: [], self: true }
      };
      PAYROLL_REPORTS = /* @__PURE__ */ new Set(["payroll_summary", "employee_balances"]);
      SALES_TYPES = /* @__PURE__ */ new Set(["invoice", "quotation", "proforma", "creditNote", "deliveryNote", "salesOrder"]);
      isAdmin = (user) => user && (user.role === "owner" || user.role === "admin");
      canAudit = (user) => user && (isAdmin(user) || ROLES[user.role]?.audit || user.role === "viewer");
    }
  });

  // src/calc.js
  function computeTotals(doc) {
    const cur = doc.currency || "AED";
    const dec = decimalsFor(cur);
    const r = (v) => round(v, dec);
    const unit = Math.pow(10, -dec);
    const items = Array.isArray(doc.items) ? doc.items : [];
    const lines = items.map((it) => {
      const qty = num(it.qty), rate = num(it.rate), d = num(it.disc), vat = num(it.vat);
      const gross = r(qty * rate);
      const own = it.discType === "pct" ? r(gross * Math.min(Math.max(d, 0), 100) / 100) : Math.min(Math.max(d, 0), gross);
      return { qty, rate, gross, ownDisc: own, alloc: 0, vat };
    });
    const subtotal = r(lines.reduce((s, l) => s + l.gross, 0));
    const lineDiscount = r(lines.reduce((s, l) => s + l.ownDisc, 0));
    const netItems = r(subtotal - lineDiscount);
    const disc = doc.discount || { type: "amt", value: 0 };
    const dv = num(disc.value);
    const docDiscount = disc.type === "pct" ? r(netItems * Math.min(Math.max(dv, 0), 100) / 100) : r(Math.min(Math.max(dv, 0), netItems));
    if (docDiscount > 0 && netItems > 0) {
      let left = docDiscount, biggest = -1;
      lines.forEach((l, i) => {
        const net = l.gross - l.ownDisc;
        l.alloc = r(docDiscount * net / netItems);
        left = r(left - l.alloc);
        if (biggest === -1 || net > lines[biggest].gross - lines[biggest].ownDisc)
          biggest = i;
      });
      if (Math.abs(left) >= unit / 2 && biggest > -1)
        lines[biggest].alloc = r(lines[biggest].alloc + left);
    }
    lines.forEach((l) => {
      l.disc = r(l.ownDisc + l.alloc);
      l.net = r(l.gross - l.disc);
      l.vatAmt = r(l.net * l.vat / 100);
      l.total = r(l.net + l.vatAmt);
    });
    const charges = (Array.isArray(doc.charges) ? doc.charges : []).map((c) => {
      const amount = r(num(c.amount)), vat = num(c.vat);
      return { label: c.label || "Other charges", amount, vat, vatAmt: r(amount * vat / 100), account: c.account };
    });
    const groups = {};
    const add = (rate, taxable2, vat) => {
      const k = String(rate);
      groups[k] = groups[k] || { rate, taxable: 0, vat: 0 };
      groups[k].taxable += taxable2;
      groups[k].vat += vat;
    };
    lines.forEach((l) => add(l.vat, l.net, l.vatAmt));
    charges.forEach((c) => add(c.vat, c.amount, c.vatAmt));
    const vatGroups = Object.values(groups).map((g) => ({ rate: g.rate, taxable: r(g.taxable), vat: r(g.vat) })).filter((g) => g.taxable !== 0 || g.rate !== 0).sort((a, b) => b.rate - a.rate);
    const chargesTotal = r(charges.reduce((s, c) => s + c.amount, 0));
    const discountTotal = r(lineDiscount + docDiscount);
    const taxable = r(subtotal - discountTotal + chargesTotal);
    const vatTotal = r(vatGroups.reduce((s, g) => s + g.vat, 0));
    const total = r(taxable + vatTotal);
    return { lines, subtotal, lineDiscount, netItems, docDiscount, discountTotal, charges, chargesTotal, taxable, vatGroups, vatTotal, total, dec };
  }
  function formatNumber(pattern, seq, dateIso) {
    const [y, m, d] = String(dateIso || "").split("-").map(Number);
    const dt = y ? { y, m, d } : (() => {
      const t = /* @__PURE__ */ new Date();
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    })();
    return String(pattern || "{SEQ4}").replace(/\{YYYY\}/g, dt.y).replace(/\{YY\}/g, String(dt.y).slice(-2)).replace(/\{MM\}/g, String(dt.m).padStart(2, "0")).replace(/\{M\}/g, dt.m).replace(/\{DD\}/g, String(dt.d).padStart(2, "0")).replace(/\{SEQ(\d)?\}/g, (_, p) => String(seq).padStart(Number(p || 1), "0"));
  }
  var DECIMALS, decimalsFor;
  var init_calc = __esm({
    "src/calc.js"() {
      init_shim();
      init_util();
      DECIMALS = { OMR: 3, KWD: 3, BHD: 3 };
      decimalsFor = (cur) => DECIMALS[cur] ?? 2;
    }
  });

  // src/ledger.js
  function rateOf(obj, settings) {
    const cur = obj.currency || "AED";
    if (cur === "AED")
      return 1;
    const own = num(obj.fx?.rate ?? obj.rate);
    if (own > 0)
      return own;
    const fallback = num(settings?.finance?.rates?.[cur]);
    return fallback > 0 ? fallback : null;
  }
  function needRate(obj, settings, label) {
    const rate = rateOf(obj, settings);
    if (!rate)
      throw new HttpError(400, `Add the exchange rate for ${obj.currency} on this ${label} (AED per 1 ${obj.currency}).`);
    return rate;
  }
  function balance(lines, ctx) {
    const d = r2(lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0));
    if (Math.abs(d) >= 5e-3) {
      if (Math.abs(d) > 0.05)
        throw new HttpError(500, `Posting is out of balance by ${d}.`);
      lines.push(d > 0 ? { account: ctx.role("rounding"), credit: d, memo: "Rounding" } : { account: ctx.role("rounding"), debit: -d, memo: "Rounding" });
    }
    return lines.filter((l) => r2(l.debit || 0) !== 0 || r2(l.credit || 0) !== 0).map((l) => ({ ...l, debit: r2(l.debit || 0), credit: r2(l.credit || 0) }));
  }
  function fcFor(ctx, accountId, currency, amountSigned) {
    const a = ctx.accounts.get(accountId);
    return a && a.currency && a.currency !== "AED" && a.currency === currency ? { fc_amount: amountSigned, fc_currency: currency } : {};
  }
  function salesTaxCode(doc, vat) {
    const t = doc.taxTreatment || "standard";
    if (t === "outOfScope")
      return null;
    if (t === "exempt")
      return "out_exempt";
    if (t === "zero")
      return "out_zero";
    return vat > 0 ? "out_std" : "out_zero";
  }
  async function postSalesDoc(doc, ctx, sign2) {
    const rate = needRate(doc, ctx.settings, doc.type === "invoice" ? "invoice" : "credit note");
    const t = computeTotals(doc);
    const lines = [];
    const contact = doc.party?.name || "";
    const common = { contact };
    doc.items.forEach((it, i) => {
      const l = t.lines[i];
      if (!l || l.net === 0)
        return;
      const acc = it.account && ctx.accounts.has(it.account) ? it.account : doc.incomeAccount && ctx.accounts.has(doc.incomeAccount) ? doc.incomeAccount : ctx.def("salesAccount", "sales");
      const base = r2(l.net * rate);
      lines.push(cr(acc, sign2 * base, { ...common, tax_code: salesTaxCode(doc, l.vat), tax_base: sign2 * base, memo: it.name || it.desc || "" }));
    });
    t.charges.forEach((c) => {
      if (!c.amount)
        return;
      const acc = c.account && ctx.accounts.has(c.account) ? c.account : ctx.def("chargesAccount", "other_income");
      const base = r2(c.amount * rate);
      lines.push(cr(acc, sign2 * base, { ...common, tax_code: salesTaxCode(doc, c.vat), tax_base: sign2 * base, memo: c.label }));
    });
    const vatBase = r2(t.vatTotal * rate);
    if (vatBase)
      lines.push(cr(ctx.role("vat_out"), sign2 * vatBase, { ...common, tax_code: "out_vat", memo: "Output VAT" }));
    const credits = r2(lines.reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0));
    let link = doc.id, allocations = [];
    if (sign2 < 0) {
      let inv = doc.ref && !doc._noLink && !doc.unlinked ? await ctx.lookups.docByNumber("invoice", doc.ref) : null;
      const norm = (v) => String(v || "").trim().toLowerCase();
      if (inv && norm(inv.party?.name) !== norm(doc.party?.name)) {
        if (!ctx.relinking)
          throw new HttpError(400, `Invoice ${inv.number} belongs to ${inv.party?.name || "another customer"}. A credit note can only reduce an invoice of the same customer.`);
        inv = null;
      }
      link = inv ? inv.id : null;
      if (inv) {
        if ((inv.currency || "AED") !== (doc.currency || "AED"))
          throw new HttpError(400, `Credit note is in ${doc.currency}, invoice ${inv.number} is in ${inv.currency}. Use the same currency.`);
        allocations.push({ target_id: inv.id, amount: t.total, date: doc.date });
      }
    }
    lines.push(dr(ctx.role("ar"), credits, { ...common, link_id: link, ...{ fc_amount: (doc.currency || "AED") !== "AED" ? sign2 * t.total : null, fc_currency: (doc.currency || "AED") !== "AED" ? doc.currency : null } }));
    return { lines: balance(lines, ctx), allocations, rate };
  }
  async function postPayment(p, ctx) {
    const rate = needRate(p, ctx.settings, "payment");
    const dec = decimalsFor(p.currency);
    const amount = round(num(p.amount), dec);
    const fees = round(num(p.bankCharges), dec);
    if (amount <= 0)
      throw new HttpError(400, "Enter the amount received.");
    if (fees < 0 || fees >= amount)
      throw new HttpError(400, "Bank charges must be less than the amount received.");
    const deposit = ctx.account(p.accountId, "account to deposit into").id;
    const lines = [], allocations = [];
    const contact = p.contactName || "";
    lines.push(dr(deposit, r2((amount - fees) * rate), { contact, ...fcFor(ctx, deposit, p.currency, round(amount - fees, dec)), memo: p.reference || "Payment received" }));
    if (fees)
      lines.push(dr(ctx.role("bank_fees"), r2(fees * rate), { contact, memo: "Bank charges on payment received" }));
    let allocated = 0, fx = 0;
    for (const a of p.allocations || []) {
      const amt = round(num(a.amount), dec);
      if (!amt)
        continue;
      if (amt < 0)
        throw new HttpError(400, "Amounts applied to invoices cannot be negative.");
      const inv = await ctx.lookups.docById(a.docId);
      if (!inv || inv.type !== "invoice")
        throw new HttpError(400, "One of the invoices on this payment no longer exists.");
      if ((inv.currency || "AED") !== (p.currency || "AED"))
        throw new HttpError(400, `Invoice ${inv.number} is in ${inv.currency}; this payment is in ${p.currency}.`);
      const invRate = rateOf(inv, ctx.settings) || rate;
      const base = r2(amt * invRate);
      lines.push(cr(ctx.role("ar"), base, { contact, link_id: inv.id, ...p.currency !== "AED" ? { fc_amount: -amt, fc_currency: p.currency } : {}, memo: `Payment for ${inv.number}` }));
      fx = r2(fx + r2(amt * rate) - base);
      allocated = round(allocated + amt, dec);
      allocations.push({ target_id: inv.id, amount: amt, date: p.date });
    }
    if (allocated > amount + 1e-9)
      throw new HttpError(400, "You have applied more than the amount received.");
    const unapplied = round(amount - allocated, dec);
    if (unapplied > 0)
      lines.push(cr(ctx.role("cust_adv"), r2(unapplied * rate), { contact, ...p.currency !== "AED" ? { fc_amount: -unapplied, fc_currency: p.currency } : {}, memo: "Unapplied payment (customer credit)" }));
    if (fx)
      lines.push(cr(ctx.role("fx"), fx, { contact, memo: "Exchange difference on payment" }));
    return { lines: balance(lines, ctx), allocations, rate };
  }
  function purchaseLines(obj, ctx, rate, sign2, defaultKey) {
    const t = computeTotals(obj);
    const lines = [];
    const contact = obj.vendorName || obj.party?.name || "";
    obj.items.forEach((it, i) => {
      const l = t.lines[i];
      if (!l || l.net === 0)
        return;
      const acc = ctx.account(it.account || ctx.def(defaultKey, "cogs"), "expense account").id;
      const base = r2(l.net * rate);
      lines.push(dr(acc, sign2 * base, { contact, tax_code: l.vat > 0 ? "in_std" : "in_zero", tax_base: sign2 * base, memo: it.name || it.desc || "" }));
    });
    t.charges.forEach((c) => {
      if (!c.amount)
        return;
      const acc = c.account && ctx.accounts.has(c.account) ? c.account : ctx.def(defaultKey, "cogs");
      const base = r2(c.amount * rate);
      lines.push(dr(acc, sign2 * base, { contact, tax_code: c.vat > 0 ? "in_std" : "in_zero", tax_base: sign2 * base, memo: c.label }));
    });
    const vat = r2(t.vatTotal * rate);
    if (vat)
      lines.push(dr(ctx.role("vat_in"), sign2 * vat, { contact, tax_code: "in_vat", memo: "Input VAT" }));
    if (obj.reverseCharge) {
      const rc = r2(t.taxable * rate * num(obj.rcRate ?? 5) / 100);
      if (rc) {
        lines.push(dr(ctx.role("vat_in"), sign2 * rc, { contact, tax_code: "rc_in", tax_base: sign2 * r2(t.taxable * rate), memo: "Reverse charge VAT (recoverable)" }));
        lines.push(cr(ctx.role("vat_out"), sign2 * rc, { contact, tax_code: "rc_out", tax_base: sign2 * r2(t.taxable * rate), memo: "Reverse charge VAT (due)" }));
      }
    }
    return { t, lines, contact };
  }
  async function postBill(b, ctx) {
    const rate = needRate(b, ctx.settings, "bill");
    const { t, lines, contact } = purchaseLines(b, ctx, rate, 1, "purchaseAccount");
    const debits = r2(lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0));
    lines.push(cr(ctx.role("ap"), debits, { contact, link_id: b.id, ...b.currency !== "AED" ? { fc_amount: -t.total, fc_currency: b.currency } : {}, memo: `Bill ${b.number || ""}` }));
    return { lines: balance(lines, ctx), allocations: [], rate };
  }
  async function postVendorCredit(v, ctx) {
    const rate = needRate(v, ctx.settings, "vendor credit");
    const { t, lines, contact } = purchaseLines(v, ctx, rate, -1, "purchaseAccount");
    const credits = r2(lines.reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0));
    const allocations = [];
    const fc = (amt) => v.currency !== "AED" ? { fc_amount: amt, fc_currency: v.currency } : {};
    if (v.billId) {
      const bill = await ctx.lookups.docById(v.billId);
      if (!bill || bill.kind !== "bill")
        throw new HttpError(400, "The bill this credit applies to no longer exists.");
      if ((bill.currency || "AED") !== (v.currency || "AED"))
        throw new HttpError(400, `Bill ${bill.number} is in ${bill.currency}; this credit is in ${v.currency}.`);
      const dec = decimalsFor(v.currency);
      const applied = v.appliedAmount === void 0 || v.appliedAmount === "" || v.appliedAmount === null ? t.total : round(Math.min(num(v.appliedAmount), t.total), dec);
      if (applied < 0)
        throw new HttpError(400, "The amount applied can't be negative.");
      const appliedBase = t.total ? r2(credits * applied / t.total) : 0;
      if (applied > 0) {
        allocations.push({ target_id: bill.id, amount: applied, date: v.date });
        lines.push(dr(ctx.role("ap"), appliedBase, { contact, link_id: bill.id, ...fc(applied), memo: `Vendor credit ${v.number || ""} applied to ${bill.number}` }));
      }
      if (round(t.total - applied, dec) > 0)
        lines.push(dr(ctx.role("ap"), r2(credits - appliedBase), { contact, ...fc(round(t.total - applied, dec)), memo: `Vendor credit ${v.number || ""} (unapplied)` }));
    } else {
      lines.push(dr(ctx.role("ap"), credits, { contact, ...fc(t.total), memo: `Vendor credit ${v.number || ""}` }));
    }
    return { lines: balance(lines, ctx), allocations, rate };
  }
  async function postBillPayment(p, ctx) {
    const rate = needRate(p, ctx.settings, "payment");
    const dec = decimalsFor(p.currency);
    const amount = round(num(p.amount), dec);
    const fees = round(num(p.bankCharges), dec);
    if (amount <= 0)
      throw new HttpError(400, "Enter the amount paid.");
    if (fees < 0)
      throw new HttpError(400, "Bank charges cannot be negative.");
    const from = ctx.account(p.accountId, "account to pay from").id;
    const contact = p.vendorName || "";
    const lines = [], allocations = [];
    lines.push(cr(from, r2((amount + fees) * rate), { contact, ...fcFor(ctx, from, p.currency, -round(amount + fees, dec)), memo: p.reference || "Payment made" }));
    if (fees)
      lines.push(dr(ctx.role("bank_fees"), r2(fees * rate), { contact, memo: "Bank charges on payment made" }));
    let allocated = 0, fx = 0;
    for (const a of p.allocations || []) {
      const amt = round(num(a.amount), dec);
      if (!amt)
        continue;
      if (amt < 0)
        throw new HttpError(400, "Amounts applied to bills cannot be negative.");
      const bill = await ctx.lookups.docById(a.billId);
      if (!bill || bill.kind !== "bill")
        throw new HttpError(400, "One of the bills on this payment no longer exists.");
      if ((bill.currency || "AED") !== (p.currency || "AED"))
        throw new HttpError(400, `Bill ${bill.number} is in ${bill.currency}; this payment is in ${p.currency}.`);
      const billRate = rateOf(bill, ctx.settings) || rate;
      const base = r2(amt * billRate);
      lines.push(dr(ctx.role("ap"), base, { contact, link_id: bill.id, ...p.currency !== "AED" ? { fc_amount: amt, fc_currency: p.currency } : {}, memo: `Payment for bill ${bill.number}` }));
      fx = r2(fx + base - r2(amt * rate));
      allocated = round(allocated + amt, dec);
      allocations.push({ target_id: bill.id, amount: amt, date: p.date });
    }
    if (allocated > amount + 1e-9)
      throw new HttpError(400, "You have applied more than the amount paid.");
    const unapplied = round(amount - allocated, dec);
    if (unapplied > 0)
      lines.push(dr(ctx.role("vendor_adv"), r2(unapplied * rate), { contact, ...p.currency !== "AED" ? { fc_amount: unapplied, fc_currency: p.currency } : {}, memo: "Advance to vendor" }));
    if (fx)
      lines.push(cr(ctx.role("fx"), fx, { contact, memo: "Exchange difference on payment" }));
    return { lines: balance(lines, ctx), allocations, rate };
  }
  function expenseAmounts(e) {
    const dec = decimalsFor(e.currency);
    const amount = round(num(e.amount), dec);
    const v = num(e.vatRate);
    let net, vat;
    if (e.inclusive) {
      net = round(amount / (1 + v / 100), dec);
      vat = round(amount - net, dec);
    } else {
      net = amount;
      vat = round(amount * v / 100, dec);
    }
    return { net, vat, total: round(net + vat, dec) };
  }
  async function postExpense(e, ctx) {
    const rate = needRate(e, ctx.settings, "expense");
    const { net, vat, total } = expenseAmounts(e);
    if (total <= 0)
      throw new HttpError(400, "Enter the expense amount.");
    const acc = ctx.account(e.accountId, "expense category").id;
    const from = ctx.account(e.paidThrough, '"paid through" account').id;
    const contact = e.vendorName || "";
    const lines = [
      dr(acc, r2(net * rate), { contact, tax_code: vat > 0 ? "in_std" : "in_zero", tax_base: r2(net * rate), memo: e.description || "" })
    ];
    if (vat)
      lines.push(dr(ctx.role("vat_in"), r2(vat * rate), { contact, tax_code: "in_vat", memo: "Input VAT" }));
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0));
    lines.push(cr(from, debit, { contact, ...fcFor(ctx, from, e.currency, -total), memo: e.description || "Expense" }));
    return { lines: balance(lines, ctx), allocations: [], rate };
  }
  async function postJournal(j, ctx) {
    const lines = [];
    for (const l of j.lines || []) {
      const d = r2(num(l.debit)), c = r2(num(l.credit));
      if (!d && !c)
        continue;
      if (d < 0 || c < 0)
        throw new HttpError(400, "Debits and credits must be positive numbers.");
      if (d && c)
        throw new HttpError(400, "Each journal line takes a debit or a credit, not both.");
      const acc = ctx.account(l.accountId).id;
      const fc = l.fcCurrency ? fcFor(ctx, acc, l.fcCurrency, (d ? 1 : -1) * Math.abs(num(l.fcAmount))) : {};
      lines.push({ account: acc, debit: d, credit: c, contact: l.contactName || "", memo: l.memo || j.notes || "", ...fc, ...l.date ? { date: l.date } : {} });
    }
    if (lines.length < 2)
      throw new HttpError(400, "A journal needs at least two lines.");
    const diff2 = r2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
    if (diff2 !== 0)
      throw new HttpError(400, `Debits and credits differ by ${Math.abs(diff2).toFixed(2)}. A journal must balance.`);
    return { lines, allocations: [], rate: 1 };
  }
  async function postTransfer(t, ctx) {
    const from = ctx.account(t.fromAccount, "account to transfer from");
    const to = ctx.account(t.toAccount, "account to transfer to");
    if (from.id === to.id)
      throw new HttpError(400, "Choose two different accounts.");
    const fromCur = from.currency || "AED", toCur = to.currency || "AED";
    const fromAmt = round(num(t.fromAmount), decimalsFor(fromCur));
    const toAmt = fromCur === toCur ? fromAmt : round(num(t.toAmount), decimalsFor(toCur));
    if (fromAmt <= 0 || toAmt <= 0)
      throw new HttpError(400, "Enter the amount transferred.");
    const rateFrom = fromCur === "AED" ? 1 : num(t.rateFrom) || num(ctx.settings.finance?.rates?.[fromCur]);
    const rateTo = toCur === "AED" ? 1 : num(t.rateTo) || num(ctx.settings.finance?.rates?.[toCur]);
    if (!rateFrom || !rateTo)
      throw new HttpError(400, "Add the exchange rate to AED for this transfer.");
    const fee = round(num(t.fee), decimalsFor(fromCur));
    const outBase = r2((fromAmt + fee) * rateFrom), inBase = r2(toAmt * rateTo), feeBase = r2(fee * rateFrom);
    const lines = [
      cr(from.id, outBase, { ...fcFor(ctx, from.id, fromCur, -(fromAmt + fee)), memo: t.memo || `Transfer to ${to.name}` }),
      dr(to.id, inBase, { ...fcFor(ctx, to.id, toCur, toAmt), memo: t.memo || `Transfer from ${from.name}` })
    ];
    if (fee)
      lines.push(dr(ctx.role("bank_fees"), feeBase, { memo: "Transfer fee" }));
    const fx = r2(outBase - feeBase - inBase);
    if (fx)
      lines.push(dr(ctx.role("fx"), fx, { memo: "Exchange difference on transfer" }));
    return { lines: balance(lines, ctx), allocations: [], rate: rateFrom };
  }
  async function postBankEntry(b, ctx) {
    const bank = ctx.account(b.bankAccountId, "bank account");
    const cur = bank.currency || "AED";
    const rate = cur === "AED" ? 1 : num(b.rate) || num(ctx.settings.finance?.rates?.[cur]);
    if (!rate)
      throw new HttpError(400, `Add the exchange rate for ${cur}.`);
    const dec = decimalsFor(cur);
    const amount = round(num(b.amount), dec);
    if (!amount)
      throw new HttpError(400, "The amount is zero.");
    const offset = ctx.account(b.accountId, "category").id;
    const v = num(b.vatRate);
    const gross = Math.abs(amount);
    const net = v ? round(gross / (1 + v / 100), dec) : gross;
    const vat = round(gross - net, dec);
    const contact = b.contactName || "";
    const lines = [];
    const base = r2(gross * rate), netBase = r2(net * rate), vatBase = r2(base - netBase);
    if (amount > 0) {
      lines.push(dr(bank.id, base, { contact, ...fcFor(ctx, bank.id, cur, gross), memo: b.memo || "" }));
      lines.push(cr(offset, netBase, { contact, ...v ? { tax_code: "out_std", tax_base: netBase } : {}, memo: b.memo || "" }));
      if (vat)
        lines.push(cr(ctx.role("vat_out"), vatBase, { contact, tax_code: "out_vat", memo: "Output VAT" }));
    } else {
      lines.push(cr(bank.id, base, { contact, ...fcFor(ctx, bank.id, cur, -gross), memo: b.memo || "" }));
      lines.push(dr(offset, netBase, { contact, ...v ? { tax_code: "in_std", tax_base: netBase } : {}, memo: b.memo || "" }));
      if (vat)
        lines.push(dr(ctx.role("vat_in"), vatBase, { contact, tax_code: "in_vat", memo: "Input VAT" }));
    }
    return { lines: balance(lines, ctx), allocations: [], rate };
  }
  function payslipTotals(line) {
    const gross = r2((line.earnings || []).reduce((s, e) => s + num(e.amount), 0));
    const deductions = r2((line.deductions || []).reduce((s, e) => s + num(e.amount), 0));
    return { gross, deductions, net: r2(gross - deductions) };
  }
  async function postPayrun(p, ctx) {
    if (p.status === "draft")
      return empty();
    if (Array.isArray(p.ledgerRefs) && p.ledgerRefs.length)
      return empty();
    const lines = [];
    const payable = ctx.role("salaries_payable");
    const by = /* @__PURE__ */ new Map();
    const add = (account, contact, amount, memo) => {
      const k = account + "|" + contact;
      const cur = by.get(k) || { account, contact, amount: 0, memo };
      cur.amount = r2(cur.amount + amount);
      by.set(k, cur);
    };
    const period2 = p.period || p.date.slice(0, 7);
    for (const l of p.lines || []) {
      const who = String(l.name || "").trim();
      for (const e of l.earnings || []) {
        const t = PAY_EARNINGS[e.type] || PAY_EARNINGS.allowance;
        if (num(e.amount))
          add(ctx.role(t.role), who, num(e.amount), `${t.label} ${period2}`);
      }
      for (const d of l.deductions || []) {
        const t = PAY_DEDUCTIONS[d.type] || PAY_DEDUCTIONS.other;
        if (num(d.amount))
          add(ctx.role(t.role), who, -num(d.amount), `${t.label} ${period2}`);
      }
      const { net } = payslipTotals(l);
      if (net)
        lines.push(cr(payable, net, { contact: who, memo: `Net pay ${period2}` }));
    }
    for (const v of by.values())
      if (v.amount)
        lines.unshift(dr(v.account, v.amount, { contact: v.contact, memo: v.memo }));
    if (Array.isArray(p.payments) && p.payments.length) {
      for (const x of p.payments) {
        const from = ctx.account(x.accountId, "account salaries were paid from");
        const who = String(x.name || (p.lines || []).find((l) => l.employeeId && l.employeeId === x.employeeId)?.name || (p.lines.length === 1 ? p.lines[0].name : "")).trim();
        lines.push(dr(payable, r2(num(x.amount)), { contact: who, memo: `Salary paid ${period2}${x.reference ? " · " + x.reference : ""}`, date: x.date }));
        lines.push(cr(from.id, r2(num(x.amount)), { contact: who, memo: `Salary paid ${period2}${x.reference ? " · " + x.reference : ""}`, date: x.date }));
      }
    } else if (p.status === "paid" && p.payment?.accountId) {
      const bank = ctx.account(p.payment.accountId, "account salaries were paid from");
      for (const l of p.lines || []) {
        const { net } = payslipTotals(l);
        if (!net)
          continue;
        const who = String(l.name || "").trim();
        lines.push(dr(payable, net, { contact: who, memo: `Salary paid ${period2}`, date: p.payment.date }));
        lines.push(cr(bank.id, net, { contact: who, memo: `Salary paid ${period2}`, date: p.payment.date }));
      }
    }
    return { lines: balance(lines, ctx), allocations: [], rate: 1 };
  }
  async function postingFor(kind, obj, ctx) {
    if (obj.deleted)
      return { lines: [], allocations: [] };
    switch (kind) {
      case "doc":
        if (obj.type === "invoice")
          return obj.status === "cancelled" ? empty() : postSalesDoc(obj, ctx, 1);
        if (obj.type === "creditNote")
          return obj.status === "cancelled" ? empty() : postSalesDoc(obj, ctx, -1);
        return empty();
      case "payment":
        return postPayment(obj, ctx);
      case "bill":
        return obj.status === "void" ? empty() : postBill(obj, ctx);
      case "vendorCredit":
        return obj.status === "void" ? empty() : postVendorCredit(obj, ctx);
      case "billPayment":
        return postBillPayment(obj, ctx);
      case "expense":
        return postExpense(obj, ctx);
      case "journal":
        return postJournal(obj, ctx);
      case "transfer":
        return postTransfer(obj, ctx);
      case "bankEntry":
        return postBankEntry(obj, ctx);
      case "payrun":
        return postPayrun(obj, ctx);
      default:
        return empty();
    }
  }
  var r2, POSTING_KINDS, isPosting, Ctx, dr, cr, PAY_EARNINGS, PAY_DEDUCTIONS, empty;
  var init_ledger = __esm({
    "src/ledger.js"() {
      init_shim();
      init_util();
      init_calc();
      r2 = (v) => round(v, 2);
      POSTING_KINDS = /* @__PURE__ */ new Set(["doc", "payment", "billPayment", "bill", "vendorCredit", "expense", "journal", "transfer", "bankEntry", "payrun"]);
      isPosting = (kind, type) => POSTING_KINDS.has(kind) && (kind !== "doc" || type === "invoice" || type === "creditNote");
      Ctx = class {
        constructor(settings, accounts, lookups) {
          this.settings = settings;
          this.accounts = new Map(accounts.map((a) => [a.id, a]));
          this.byRole = new Map(accounts.filter((a) => a.role).map((a) => [a.role, a]));
          this.lookups = lookups;
        }
        role(role2) {
          const a = this.byRole.get(role2);
          if (!a)
            throw new HttpError(500, `The chart of accounts has no ${role2} account.`);
          return a.id;
        }
        account(id, what = "account") {
          const a = this.accounts.get(id);
          if (!a)
            throw new HttpError(400, `Choose a valid ${what}.`);
          if (a.archived)
            throw new HttpError(400, `${a.name} is archived. Choose another ${what}.`);
          return a;
        }
        def(key, fallbackRole) {
          const id = this.settings.finance?.defaults?.[key];
          return id && this.accounts.has(id) ? id : this.role(fallbackRole);
        }
      };
      dr = (account, amount, extra = {}) => amount >= 0 ? { account, debit: amount, ...extra } : { account, credit: -amount, ...extra };
      cr = (account, amount, extra = {}) => amount >= 0 ? { account, credit: amount, ...extra } : { account, debit: -amount, ...extra };
      PAY_EARNINGS = {
        basic: { label: "Basic salary", role: "salaries" },
        housing: { label: "Housing allowance", role: "salaries" },
        transport: { label: "Transport allowance", role: "salaries" },
        allowance: { label: "Other allowance", role: "salaries" },
        overtime: { label: "Overtime", role: "salaries" },
        commission: { label: "Commission", role: "commission" },
        bonus: { label: "Bonus", role: "commission" },
        compensation: { label: "Compensation", role: "salaries" },
        reimbursement: { label: "Expense reimbursement", role: "other_expense" }
      };
      PAY_DEDUCTIONS = {
        advance: { label: "Advance recovery", role: "staff_adv" },
        unpaid: { label: "Unpaid leave", role: "salaries" },
        other: { label: "Other deduction", role: "salaries" }
      };
      empty = () => ({ lines: [], allocations: [] });
    }
  });

  // src/chart.js
  function chartUpgrades(existing) {
    const byCode = new Map(existing.map((a) => [String(a.code), a]));
    const roles = new Set(existing.map((a) => a.role).filter(Boolean));
    const out = [];
    for (const [code, name, type, subtype, role2] of CHART) {
      if (role2 && roles.has(role2))
        continue;
      const have = byCode.get(code);
      if (have) {
        if (role2 && !have.role && have.type === type) {
          out.push({ ...have, role: role2, system: true });
          continue;
        }
        if (!role2)
          continue;
        let c = Number(code) + 1;
        while (byCode.has(String(c)))
          c++;
        out.push({ id: "acc_" + c + "_v2", code: String(c), name, type, subtype, role: role2, currency: "AED", system: true, archived: false });
        continue;
      }
      if (!role2 && !["2320", "6016"].includes(code))
        continue;
      out.push({ id: existing.some((a) => a.id === "acc_" + code) ? "acc_" + code + "_v2" : "acc_" + code, code, name, type, subtype, role: role2 || null, currency: "AED", system: !!role2, archived: false });
    }
    return out;
  }
  function defaultAccounts(banks = []) {
    const list = CHART.map(([code, name, type, subtype, role2]) => ({
      id: "acc_" + code,
      code,
      name,
      type,
      subtype,
      role: role2 || null,
      currency: "AED",
      system: !!role2,
      archived: false
    }));
    banks.forEach((b, i) => {
      const bankName = (b.lines || []).find((l) => /^bank$/i.test(l[0]))?.[1] || b.label || "Bank";
      list.push({
        id: "acc_bank_" + b.id,
        code: String(1010 + i),
        name: b.label || bankName,
        type: "asset",
        subtype: "bank",
        role: null,
        currency: b.currency || "AED",
        bankId: b.id,
        system: false,
        archived: false
      });
    });
    return list;
  }
  var CHART, CHART_VERSION, PEGGED, DEFAULT_FINANCE, DEFAULT_SECURITY;
  var init_chart = __esm({
    "src/chart.js"() {
      init_shim();
      CHART = [
        ["1000", "Petty cash", "asset", "cash", "cash"],
        ["1100", "Accounts receivable", "asset", "receivable", "ar"],
        ["1150", "Prepayments and deposits", "asset", "current", null],
        ["1160", "Advances to vendors", "asset", "current", "vendor_adv"],
        ["1200", "Inventory", "asset", "inventory", "inventory"],
        ["1300", "VAT recoverable (input VAT)", "asset", "tax", "vat_in"],
        ["1400", "Staff advances", "asset", "current", "staff_adv"],
        ["1500", "Furniture and equipment", "asset", "fixed", null],
        ["1510", "Accumulated depreciation", "asset", "fixed", null],
        ["1600", "Intangible assets (brands, trademarks)", "asset", "fixed", null],
        ["2000", "Accounts payable", "liability", "payable", "ap"],
        ["2100", "VAT payable (output VAT)", "liability", "tax", "vat_out"],
        ["2110", "VAT settlement with FTA", "liability", "tax", "vat_settle"],
        ["2200", "Customer advances", "liability", "current", "cust_adv"],
        ["2300", "Accrued expenses", "liability", "current", null],
        ["2310", "Salaries and wages payable", "liability", "current", "salaries_payable"],
        ["2320", "End-of-service benefits provision", "liability", "longterm", null],
        ["2400", "Due to director", "liability", "current", "director"],
        ["2500", "Loans", "liability", "longterm", null],
        ["3000", "Share capital", "equity", "equity", null],
        ["3100", "Retained earnings", "equity", "equity", "retained"],
        ["3200", "Owner drawings", "equity", "equity", null],
        ["3900", "Opening balance equity", "equity", "equity", "opening"],
        ["4000", "Sales — goods", "income", "operating", "sales"],
        ["4100", "Consultancy and services income", "income", "operating", "services"],
        ["4200", "Other income (freight, handling recovered)", "income", "other", "other_income"],
        ["4300", "Interest income", "income", "other", null],
        ["5000", "Cost of goods sold", "expense", "cogs", "cogs"],
        ["5100", "Freight and customs on purchases", "expense", "cogs", null],
        ["6000", "Rent", "expense", "operating", null],
        ["6010", "Salaries and wages", "expense", "operating", "salaries"],
        ["6015", "Commissions and bonuses", "expense", "operating", "commission"],
        ["6016", "End-of-service benefits", "expense", "operating", null],
        ["6020", "Utilities", "expense", "operating", null],
        ["6030", "Telephone and internet", "expense", "operating", null],
        ["6040", "Travel", "expense", "operating", null],
        ["6050", "Meals and entertainment", "expense", "operating", null],
        ["6060", "Office supplies", "expense", "operating", null],
        ["6070", "Software and subscriptions", "expense", "operating", null],
        ["6080", "Legal and professional fees", "expense", "operating", null],
        ["6090", "Bank charges", "expense", "operating", "bank_fees"],
        ["6100", "Marketing and advertising", "expense", "operating", null],
        ["6110", "Licence and government fees", "expense", "operating", null],
        ["6120", "Insurance", "expense", "operating", null],
        ["6130", "Repairs and maintenance", "expense", "operating", null],
        ["6140", "Shipping and courier", "expense", "operating", null],
        ["6150", "Depreciation", "expense", "operating", null],
        ["6190", "Other expenses", "expense", "operating", "other_expense"],
        ["7900", "Exchange gain or loss", "expense", "other", "fx"],
        ["7910", "Rounding", "expense", "other", "rounding"]
      ];
      CHART_VERSION = 2;
      PEGGED = { AED: 1, USD: 3.6725, SAR: 0.97933, QAR: 1.00879, OMR: 9.5506, BHD: 9.7686 };
      DEFAULT_FINANCE = {
        baseCurrency: "AED",
        lockDate: "",
        fiscalYearStart: "01-01",
        emirate: "Dubai",
        rates: { ...PEGGED },
        numbering: {
          payment: { pattern: "RCT-{YY}{MM}-{SEQ4}" },
          billPayment: { pattern: "PMT-{YY}{MM}-{SEQ4}" },
          expense: { pattern: "EXP-{YY}{MM}-{SEQ4}" },
          journal: { pattern: "JV-{YY}{MM}-{SEQ4}" },
          transfer: { pattern: "TRF-{YY}{MM}-{SEQ4}" },
          bankEntry: { pattern: "BNK-{YY}{MM}-{SEQ4}" },
          vendorCredit: { pattern: "VC-{YY}{MM}-{SEQ4}" },
          bill: { pattern: "BILL-{YY}{MM}-{SEQ4}" },
          payrun: { pattern: "PAY-{YY}{MM}-{SEQ2}" }
        },
        defaults: {
          salesAccount: "acc_4000",
          servicesAccount: "acc_4100",
          chargesAccount: "acc_4200",
          purchaseAccount: "acc_5000",
          expenseAccount: "acc_6190",
          depositAccount: "",
          billDueDays: 30
        },
        reminders: {
          enabled: false,
          schedule: [-3, 1, 7, 15, 30],
          // days relative to the due date
          subject: "Payment reminder: invoice {number}",
          body: "Dear {customer},\n\nThis is a friendly reminder that invoice {number} dated {date} for {currency} {balance} is {when}.\n\nIf you have already paid, thank you, and please ignore this message.\n\nBest regards,\n{company}"
        }
      };
      DEFAULT_SECURITY = { require2fa: false, ipAllow: [] };
    }
  });

  // src/hr.js
  function needManage(user) {
    if (!canManageHR(user))
      throw new HttpError(403, "Your role doesn't include HR.");
  }
  function hrSettings(settings) {
    const h = { ...HR_DEFAULTS, ...settings?.hr || {} };
    h.leaveDefaults = { ...HR_DEFAULTS.leaveDefaults, ...settings?.hr?.leaveDefaults || {} };
    h.weekend = Array.isArray(h.weekend) ? h.weekend.map(Number).filter((d) => d >= 0 && d <= 6) : HR_DEFAULTS.weekend;
    return h;
  }
  function validTz(tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }
  function tzParts(ms, tz) {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const p = {};
    for (const x of f.formatToParts(new Date(ms)))
      p[x.type] = x.value;
    if (p.hour === "24")
      p.hour = "00";
    return p;
  }
  function tzOffset(ms, tz) {
    const p = tzParts(ms, tz);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1e3) * 1e3;
  }
  function localToUTC(date, hhmm, tz) {
    const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let t = guess - tzOffset(guess, tz);
    const off2 = tzOffset(t, tz);
    if (guess - off2 !== t)
      t = guess - off2;
    return t;
  }
  function monthRange(month) {
    if (!MONTH.test(String(month || "")))
      throw new HttpError(400, "Choose a month (YYYY-MM).");
    const [y, m] = month.split("-").map(Number);
    return [`${month}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
  }
  function needDate(v, label = "date") {
    if (!isISODate(v))
      throw new HttpError(400, `Enter a valid ${label} (YYYY-MM-DD).`);
    return v;
  }
  function workingDays(start, end, hol, weekend) {
    let n = 0;
    for (let d = start; d <= end; d = addDays(d, 1))
      if (!weekend.includes(dow(d)) && !hol.has(d))
        n++;
    return n;
  }
  function isLate(ms, h) {
    const date = localDate(ms, h.timezone);
    return ms > localToUTC(date, h.shiftStart, h.timezone) + num(h.graceMinutes) * 6e4;
  }
  async function allEmployees(env) {
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'employee' AND deleted = 0").all();
    return results.map(rowToObj).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  async function employeeById(env, id) {
    const o = await getObj(env, String(id || ""));
    return o && !o.deleted && o.kind === "employee" ? o : null;
  }
  async function employeeForUser(env, userId) {
    if (!userId)
      return null;
    const row = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'employee' AND deleted = 0 AND json_extract(data, '$.userId') = ? LIMIT 1").bind(userId).first();
    return rowToObj(row);
  }
  async function holidaySet(env) {
    const { results } = await env.DB.prepare("SELECT date FROM hr_holidays").all();
    return new Set(results.map((r) => r.date));
  }
  async function upcomingHolidays(env, today, limit = 5) {
    const { results } = await env.DB.prepare("SELECT * FROM hr_holidays WHERE date >= ? ORDER BY date LIMIT ?").bind(today, limit).all();
    return results.map(holOut);
  }
  async function holidayReminders(env, h, today) {
    const until = addDays(today, Math.max(0, num(h.reminderDays)));
    const { results } = await env.DB.prepare("SELECT * FROM hr_holidays WHERE estimated = 1 AND date >= ? AND date <= ? ORDER BY date").bind(today, until).all();
    const groups = [];
    for (const r of results) {
      const last = groups[groups.length - 1];
      if (last && addDays(last.endDate, 1) === r.date) {
        last.endDate = r.date;
        last.ids.push(r.id);
        if (r.name.length < last.name.length)
          last.name = r.name;
      } else
        groups.push({ name: r.name, startDate: r.date, endDate: r.date, ids: [r.id] });
    }
    for (const g of groups)
      g.daysUntil = Math.round((Date.parse(g.startDate) - Date.parse(today)) / 864e5);
    return groups;
  }
  function hoursOf(r, today) {
    if (!r.clock_in)
      return 0;
    const end = r.clock_out ? r.clock_out : r.date === today ? now() : null;
    if (!end)
      return 0;
    return round(Math.max(0, end - r.clock_in) / 36e5, 2);
  }
  function attOut(r, emps, h, today) {
    const e = emps.get(r.employee_id);
    return {
      id: r.id,
      employeeId: r.employee_id,
      date: r.date,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      clockInLocal: localHHMM(r.clock_in, h.timezone),
      clockOutLocal: localHHMM(r.clock_out, h.timezone),
      hours: hoursOf(r, today),
      status: r.status,
      notes: r.notes || "",
      edited: !!r.edited,
      employeeName: e ? e.name : "Former employee",
      employeeCode: e?.code || "",
      department: e?.department || ""
    };
  }
  function leaveOut(r, emps) {
    const e = emps.get(r.employee_id);
    return {
      id: r.id,
      employeeId: r.employee_id,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      reason: r.reason || "",
      status: r.status,
      adminNote: r.admin_note || "",
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      employeeName: e ? e.name : "Former employee",
      employeeCode: e?.code || "",
      department: e?.department || ""
    };
  }
  function empOut(e, h, user, login = null) {
    const out = {
      id: e.id,
      version: e.version,
      code: e.code || "",
      name: e.name,
      department: e.department || "",
      designation: e.designation || "",
      email: e.email || "",
      phone: e.phone || "",
      joined: e.joined || "",
      left: e.left || "",
      status: e.status === "left" ? "left" : "active",
      leave: balances(e, h),
      userId: e.userId || "",
      login
    };
    if (canPayroll(user)) {
      out.pay = e.pay || {};
      out.monthlyPay = round(["basic", "housing", "transport", "allowance"].reduce((s, k) => s + num(e.pay?.[k]), 0), 2);
    }
    return out;
  }
  async function loginsFor(env, emps) {
    const ids = [...new Set(emps.map((e) => e.userId).filter(Boolean))];
    if (!ids.length)
      return /* @__PURE__ */ new Map();
    const { results } = await env.DB.prepare(`SELECT id, email, name, role, disabled, totp_secret, last_login, must_change FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return new Map(results.map((u) => [u.id, { id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: ROLES[u.role]?.label || u.role, disabled: !!u.disabled, mfa: !!u.totp_secret, lastLogin: u.last_login, mustChange: !!u.must_change }]));
  }
  async function notify(env, userIds, title, message, kind = "info", link = null) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length)
      return;
    const t = now();
    await env.DB.batch(ids.map((id) => env.DB.prepare("INSERT INTO hr_notifications (user_id, title, message, kind, link, read, created_at) VALUES (?,?,?,?,?,0,?)").bind(id, title, message, kind, link, t)));
  }
  async function hrManagers(env) {
    const roles = Object.entries(ROLES).filter(([, r]) => r.hr).map(([k]) => k);
    const { results } = await env.DB.prepare(`SELECT id FROM users WHERE disabled = 0 AND role IN (${roles.map(() => "?").join(",")})`).bind(...roles).all();
    return results.map((r) => r.id);
  }
  async function clashInfo(env, pending, emps, h) {
    if (!pending.length)
      return {};
    const active = [...emps.values()].filter(isActive);
    const deptKey = (d) => String(d || "").trim().toLowerCase();
    const headcount = /* @__PURE__ */ new Map();
    for (const e of active)
      if (deptKey(e.department))
        headcount.set(deptKey(e.department), (headcount.get(deptKey(e.department)) || 0) + 1);
    const lo = pending.reduce((m, l) => l.start_date < m ? l.start_date : m, "9999"), hi = pending.reduce((m, l) => l.end_date > m ? l.end_date : m, "0000");
    const { results: approved } = await env.DB.prepare("SELECT * FROM hr_leaves WHERE status = 'approved' AND start_date <= ? AND end_date >= ?").bind(hi, lo).all();
    const hol = await holidaySet(env);
    const out = {};
    for (const lv of pending) {
      const u = emps.get(lv.employee_id);
      if (!u || !deptKey(u.department))
        continue;
      const dk = deptKey(u.department);
      const mates = approved.filter((a) => a.employee_id !== lv.employee_id && emps.has(a.employee_id) && isActive(emps.get(a.employee_id)) && deptKey(emps.get(a.employee_id).department) === dk && a.start_date <= lv.end_date && a.end_date >= lv.start_date);
      let peak = 0, peakDates = [];
      for (let d = lv.start_date; d <= lv.end_date; d = addDays(d, 1)) {
        if (h.weekend.includes(dow(d)) || hol.has(d))
          continue;
        const c = 1 + mates.filter((a) => a.start_date <= d && d <= a.end_date).length;
        if (c > peak) {
          peak = c;
          peakDates = [d];
        } else if (c === peak)
          peakDates.push(d);
      }
      const head = headcount.get(dk) || 1;
      const pct = Math.round(peak / head * 100);
      out[lv.id] = {
        department: u.department,
        headcount: head,
        peakOff: peak,
        peakPct: pct,
        peakDates: peakDates.slice(0, 10),
        thresholdPct: num(h.clashPercent),
        clash: peak >= 2 && pct >= num(h.clashPercent),
        colleagues: mates.map((a) => ({ name: emps.get(a.employee_id).name, startDate: a.start_date, endDate: a.end_date, leaveType: a.leave_type }))
      };
    }
    return out;
  }
  async function monthlyReport(env, h, month, today) {
    const [first, last] = monthRange(month);
    const end = last < today ? last : today;
    const emps = (await allEmployees(env)).filter(isActive);
    const { results: recs } = await env.DB.prepare("SELECT * FROM hr_attendance WHERE date >= ? AND date <= ?").bind(first, last).all();
    const { results: leaves } = await env.DB.prepare("SELECT * FROM hr_leaves WHERE status = 'approved' AND start_date <= ? AND end_date >= ?").bind(last, first).all();
    const hol = await holidaySet(env);
    const { results: mh } = await env.DB.prepare("SELECT * FROM hr_holidays WHERE date >= ? AND date <= ? ORDER BY date").bind(first, last).all();
    const firstSeen = new Map((await env.DB.prepare("SELECT employee_id, min(date) d FROM hr_attendance GROUP BY employee_id").all()).results.map((r) => [r.employee_id, r.d]));
    const rows = emps.map((e) => {
      const start = e.joined && e.joined > first ? e.joined : first;
      const wd = start <= end ? workingDays(start, end, hol, h.weekend) : 0;
      const mine = recs.filter((r) => r.employee_id === e.id);
      const worked = mine.filter((r) => r.clock_in);
      const span = (lv, from, to) => {
        const a = lv.start_date > from ? lv.start_date : from, b = lv.end_date < to ? lv.end_date : to;
        return a <= b ? workingDays(a, b, hol, h.weekend) : 0;
      };
      const myLeaves = leaves.filter((l) => l.employee_id === e.id);
      const leaveDays = myLeaves.reduce((s, l) => s + span(l, start, end), 0);
      const unpaidDays = myLeaves.filter((l) => l.leave_type === "unpaid").reduce((s, l) => s + span(l, start > first ? start : first, last), 0);
      const present = worked.length;
      const seen = firstSeen.get(e.id), ts = seen && seen > start ? seen : start;
      const tracked = !!seen && ts <= end;
      const trackedAbsent = tracked ? Math.max(0, workingDays(ts, end, hol, h.weekend) - worked.filter((r) => r.date >= ts).length - myLeaves.reduce((s, l) => s + span(l, ts, end), 0)) : 0;
      return {
        employeeId: e.id,
        employeeCode: e.code || "",
        name: e.name,
        department: e.department || "",
        workingDays: wd,
        presentDays: present,
        lateDays: worked.filter((r) => r.status === "late").length,
        leaveDays,
        absentDays: Math.max(0, wd - present - leaveDays),
        unpaidLeaveDays: unpaidDays,
        markedAbsent: mine.filter((r) => !r.clock_in && r.status === "absent").length,
        tracked,
        trackedAbsent,
        totalHours: round(worked.reduce((s, r) => s + hoursOf(r, today), 0), 2),
        attendancePct: wd ? round(Math.min(100, present / wd * 100), 1) : 0
      };
    });
    return { month, workingDays: first <= end ? workingDays(first, end, hol, h.weekend) : 0, holidays: mh.map(holOut), rows };
  }
  async function hrEmployeeHook(env, o, live, settings) {
    const h = hrSettings(settings);
    o.code = String(o.code ?? "").trim();
    if (o.code) {
      const dup = await env.DB.prepare("SELECT data FROM objects WHERE kind = 'employee' AND deleted = 0 AND id != ? AND lower(trim(number)) = lower(?) LIMIT 1").bind(o.id, o.code).first();
      if (dup)
        throw new HttpError(409, `Employee no. ${o.code} is already used by ${JSON.parse(dup.data).name}.`);
    }
    for (const k of ["department", "designation", "email", "phone"])
      o[k] = o[k] === void 0 ? live?.[k] ?? "" : String(o[k] ?? "").trim();
    if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email))
      throw new HttpError(400, "Enter a valid email address for the employee.");
    const src = o.leave && typeof o.leave === "object" ? o.leave : live?.leave || h.leaveDefaults;
    o.leave = Object.fromEntries(BALANCE_TYPES.map((k) => {
      const v = num(src[k] ?? live?.leave?.[k] ?? h.leaveDefaults[k]);
      if (v < 0)
        throw new HttpError(400, "Leave balances can't be negative.");
      return [k, round(v, 2)];
    }));
    if (o.userId === void 0 && live)
      o.userId = live.userId || "";
    if (o.userId) {
      const other = await env.DB.prepare("SELECT data FROM objects WHERE kind = 'employee' AND deleted = 0 AND id != ? AND json_extract(data, '$.userId') = ? LIMIT 1").bind(o.id, o.userId).first();
      if (other)
        throw new HttpError(409, `That sign-in already belongs to ${JSON.parse(other.data).name}.`);
    }
  }
  async function hrGate(env, S, path, m, seg, ip) {
    const user = S.user;
    if (!isSelfService(user))
      return void 0;
    if (path === "bootstrap" && m === "GET") {
      const s = S.settings;
      const settings = { id: "settings", version: s.version, company: s.company || {}, brand: s.brand || {}, hr: hrSettings(s), security: { require2fa: !!s.security?.require2fa } };
      return { user, role: ROLES[user.role], roles: { [user.role]: ROLES[user.role].label }, settings, objects: [], serverTime: now(), today: localDate(now(), hrSettings(s).timezone) };
    }
    if (path === "changes" && m === "GET")
      return { objects: [], settings: null, serverTime: now() };
    if (seg[0] === "files" && m === "GET" && seg[1] === "brand")
      return void 0;
    throw new HttpError(403, "Your sign-in is for your own HR area only.");
  }
  async function hrRoute(req, env, url, seg, S, ip) {
    const m = req.method, user = S.user, q = url.searchParams;
    const path = seg.join("/");
    const h = hrSettings(S.settings);
    const today = localDate(now(), h.timezone);
    if (path === "config" && m === "GET") {
      const me = await employeeForUser(env, user.id);
      const unread = (await env.DB.prepare("SELECT count(*) n FROM hr_notifications WHERE user_id = ? AND read = 0").bind(user.id).first()).n;
      return {
        settings: h,
        today,
        now: now(),
        unread,
        pending: canManageHR(user) ? (await env.DB.prepare("SELECT count(*) n FROM hr_leaves WHERE status = 'pending'").first()).n : 0,
        perms: { manage: canManageHR(user), payroll: canPayroll(user), admin: isAdmin(user), self: isSelfService(user) },
        me: me ? { id: me.id, name: me.name, code: me.code || "", department: me.department || "", designation: me.designation || "", joined: me.joined || "", leave: balances(me, h) } : null
      };
    }
    if (path === "settings" && m === "PUT") {
      if (!isAdmin(user))
        throw new HttpError(403, "Only the owner or an admin can change HR settings.");
      const b = await readJSON(req);
      const next = hrSettings({ hr: {} });
      if (b.timezone !== void 0) {
        if (!validTz(String(b.timezone)))
          throw new HttpError(400, "That is not a time zone name (for example Asia/Dubai).");
        next.timezone = String(b.timezone);
      } else
        next.timezone = h.timezone;
      next.shiftStart = b.shiftStart !== void 0 ? String(b.shiftStart) : h.shiftStart;
      if (!HHMM.test(next.shiftStart))
        throw new HttpError(400, "Enter the shift start as HH:MM (24-hour).");
      const int = (v, cur, lo, hi, label) => {
        const x = v === void 0 ? cur : Number(v);
        if (!Number.isFinite(x) || x < lo || x > hi)
          throw new HttpError(400, `${label} must be between ${lo} and ${hi}.`);
        return Math.round(x * 100) / 100;
      };
      next.graceMinutes = int(b.graceMinutes, h.graceMinutes, 0, 240, "Grace minutes");
      next.reminderDays = int(b.reminderDays, h.reminderDays, 0, 120, "Holiday reminder days");
      next.clashPercent = int(b.clashPercent, h.clashPercent, 1, 100, "Leave clash percentage");
      next.payDivisor = int(b.payDivisor, h.payDivisor, 1, 31, "Days in a pay month");
      const wk = b.weekend !== void 0 ? b.weekend : h.weekend;
      if (!Array.isArray(wk) || wk.length > 6 || wk.some((d) => !Number.isInteger(Number(d)) || d < 0 || d > 6))
        throw new HttpError(400, "Choose the weekend days.");
      next.weekend = [...new Set(wk.map(Number))];
      const ld = b.leaveDefaults || h.leaveDefaults;
      next.leaveDefaults = Object.fromEntries(BALANCE_TYPES.map((k) => [k, int(ld[k], h.leaveDefaults[k], 0, 365, `Default ${k} leave`)]));
      const raw = await getObj(env, "settings") || { id: "settings" };
      const before = raw.hr || null;
      raw.hr = next;
      await writeSettingsRaw(env, raw, user);
      await audit(env, user, "update", { kind: "settings", id: "settings", label: "HR settings", changes: { before, after: next }, ip });
      return { settings: next };
    }
    if (seg[0] === "holidays") {
      if (seg.length === 1 && m === "GET") {
        const year = q.get("year");
        const st = /^\d{4}$/.test(year || "") ? env.DB.prepare("SELECT * FROM hr_holidays WHERE date LIKE ? ORDER BY date").bind(year + "-%") : env.DB.prepare("SELECT * FROM hr_holidays ORDER BY date");
        return { holidays: (await st.all()).results.map(holOut), upcoming: await upcomingHolidays(env, today) };
      }
      needManage(user);
      if (seg[1] === "reminders" && m === "GET")
        return { windowDays: num(h.reminderDays), items: await holidayReminders(env, h, today) };
      if (seg[1] === "confirm" && m === "POST") {
        const b = await readJSON(req);
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 100);
        if (!ids.length)
          throw new HttpError(400, "Choose the holidays to confirm.");
        const r = await env.DB.prepare(`UPDATE hr_holidays SET estimated = 0, updated_at = ? WHERE estimated = 1 AND id IN (${ids.map(() => "?").join(",")})`).bind(now(), ...ids).run();
        await audit(env, user, "holiday_confirm", { kind: "holiday", id: ids[0], label: `Confirmed ${r.meta.changes} holiday date(s)`, changes: { ids }, ip });
        return { confirmed: r.meta.changes };
      }
      const body = async () => {
        const b = await readJSON(req);
        const date = needDate(String(b.date || ""), "holiday date"), name = String(b.name || "").trim().slice(0, 120);
        if (!name)
          throw new HttpError(400, "Enter the holiday's name.");
        return { date, name, estimated: b.estimated ? 1 : 0 };
      };
      if (seg.length === 1 && m === "POST") {
        const b = await body();
        if (await env.DB.prepare("SELECT id FROM hr_holidays WHERE date = ?").bind(b.date).first())
          throw new HttpError(409, "There is already a holiday on this date.");
        const id = uid("hol_"), t = now();
        await env.DB.prepare("INSERT INTO hr_holidays (id, date, name, estimated, created_at, updated_at) VALUES (?,?,?,?,?,?)").bind(id, b.date, b.name, b.estimated, t, t).run();
        await audit(env, user, "create", { kind: "holiday", id, label: `${b.name} ${b.date}`, ip });
        return { holiday: holOut({ id, ...b }) };
      }
      const cur = seg[1] ? await env.DB.prepare("SELECT * FROM hr_holidays WHERE id = ?").bind(seg[1]).first() : null;
      if (!cur)
        throw new HttpError(404, "Holiday not found.");
      if (m === "PUT") {
        const b = await body();
        if (await env.DB.prepare("SELECT id FROM hr_holidays WHERE date = ? AND id != ?").bind(b.date, cur.id).first())
          throw new HttpError(409, "There is already a holiday on this date.");
        await env.DB.prepare("UPDATE hr_holidays SET date = ?, name = ?, estimated = ?, updated_at = ? WHERE id = ?").bind(b.date, b.name, b.estimated, now(), cur.id).run();
        await audit(env, user, "update", { kind: "holiday", id: cur.id, label: `${b.name} ${b.date}`, changes: { date: [cur.date, b.date], name: [cur.name, b.name], estimated: [!!cur.estimated, !!b.estimated] }, ip });
        return { holiday: holOut({ id: cur.id, ...b }) };
      }
      if (m === "DELETE") {
        await env.DB.prepare("DELETE FROM hr_holidays WHERE id = ?").bind(cur.id).run();
        await audit(env, user, "delete", { kind: "holiday", id: cur.id, label: `${cur.name} ${cur.date}`, ip });
        return { ok: true };
      }
    }
    if (seg[0] === "notifications") {
      if (seg.length === 1 && m === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM hr_notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30").bind(user.id).all();
        const unread = (await env.DB.prepare("SELECT count(*) n FROM hr_notifications WHERE user_id = ? AND read = 0").bind(user.id).first()).n;
        return { items: results.map((r) => ({ id: r.id, title: r.title, message: r.message, kind: r.kind, link: r.link, read: !!r.read, createdAt: r.created_at })), unread };
      }
      if (seg[1] === "read-all" && m === "POST") {
        await env.DB.prepare("UPDATE hr_notifications SET read = 1 WHERE user_id = ? AND read = 0").bind(user.id).run();
        return { ok: true };
      }
      if (seg[2] === "read" && m === "POST") {
        await env.DB.prepare("UPDATE hr_notifications SET read = 1 WHERE id = ? AND user_id = ?").bind(Number(seg[1]) || 0, user.id).run();
        return { ok: true };
      }
    }
    if (seg[0] === "me") {
      const me = await employeeForUser(env, user.id);
      if (!me)
        throw new HttpError(409, "Your sign-in isn't linked to an employee record yet. Ask HR to link it.");
      if (me.status === "left")
        throw new HttpError(403, "Your employee record is marked as left. Ask HR if this is wrong.");
      const emps = /* @__PURE__ */ new Map([[me.id, me]]);
      const todayRec = async () => env.DB.prepare("SELECT * FROM hr_attendance WHERE employee_id = ? AND date = ?").bind(me.id, today).first();
      if (seg[1] === "today" && m === "GET") {
        const r = await todayRec();
        return { date: today, record: r ? attOut(r, emps, h, today) : null };
      }
      if (seg[1] === "clock-in" && m === "POST") {
        const t = now(), status = isLate(t, h) ? "late" : "present";
        const r = await env.DB.prepare(
          "INSERT INTO hr_attendance (id, employee_id, date, clock_in, status, notes, edited, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,'',0,?,?,?) ON CONFLICT(employee_id, date) DO UPDATE SET clock_in = excluded.clock_in, status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by WHERE hr_attendance.clock_in IS NULL"
        ).bind(uid("att_"), me.id, today, t, status, t, t, user.id).run();
        if (!r.meta.changes)
          throw new HttpError(409, "You have already clocked in today.");
        const rec = await todayRec();
        await audit(env, user, "clock_in", { kind: "attendance", id: rec.id, label: `${me.name} ${today} ${localHHMM(t, h.timezone)}${status === "late" ? " (late)" : ""}`, ip });
        return { record: attOut(rec, emps, h, today) };
      }
      if (seg[1] === "clock-out" && m === "POST") {
        const t = now();
        const r = await env.DB.prepare("UPDATE hr_attendance SET clock_out = ?, updated_at = ?, updated_by = ? WHERE employee_id = ? AND date = ? AND clock_in IS NOT NULL AND clock_out IS NULL AND clock_in < ?").bind(t, t, user.id, me.id, today, t).run();
        if (!r.meta.changes) {
          const rec2 = await todayRec();
          throw new HttpError(409, !rec2 || !rec2.clock_in ? "You have not clocked in today." : "You have already clocked out today.");
        }
        const rec = await todayRec();
        await audit(env, user, "clock_out", { kind: "attendance", id: rec.id, label: `${me.name} ${today} ${localHHMM(t, h.timezone)}`, ip });
        return { record: attOut(rec, emps, h, today) };
      }
      if (seg[1] === "dashboard" && m === "GET") {
        const month = today.slice(0, 7);
        const { results: recs } = await env.DB.prepare("SELECT * FROM hr_attendance WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC").bind(me.id, month + "-%").all();
        const worked = recs.filter((r) => r.clock_in);
        const { results: recent } = await env.DB.prepare("SELECT * FROM hr_attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 7").bind(me.id).all();
        const pending = (await env.DB.prepare("SELECT count(*) n FROM hr_leaves WHERE employee_id = ? AND status = 'pending'").bind(me.id).first()).n;
        const holToday = await env.DB.prepare("SELECT * FROM hr_holidays WHERE date = ?").bind(today).first();
        const onLeave = await env.DB.prepare("SELECT * FROM hr_leaves WHERE employee_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? LIMIT 1").bind(me.id, today, today).first();
        return {
          month,
          presentDays: worked.length,
          lateDays: worked.filter((r) => r.status === "late").length,
          hours: round(worked.reduce((s, r) => s + hoursOf(r, today), 0), 2),
          leave: balances(me, h),
          pendingLeaves: pending,
          upcomingHolidays: await upcomingHolidays(env, today),
          recent: recent.map((r) => attOut(r, emps, h, today)),
          todayHoliday: holToday ? holToday.name : null,
          weekend: h.weekend.includes(dow(today)),
          onLeave: onLeave ? leaveOut(onLeave, emps) : null
        };
      }
      if (seg[1] === "attendance" && m === "GET") {
        const month = q.get("month") || today.slice(0, 7);
        monthRange(month);
        const { results } = await env.DB.prepare("SELECT * FROM hr_attendance WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC").bind(me.id, month + "-%").all();
        return { month, records: results.map((r) => attOut(r, emps, h, today)) };
      }
      if (seg[1] === "leaves" && seg.length === 2 && m === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM hr_leaves WHERE employee_id = ? ORDER BY created_at DESC LIMIT 500").bind(me.id).all();
        return { leaves: results.map((r) => leaveOut(r, emps)), leave: balances(me, h) };
      }
      if (seg[1] === "leaves" && seg.length === 2 && m === "POST") {
        const b = await readJSON(req);
        const type = String(b.leaveType || "");
        if (!LEAVE_TYPES.includes(type))
          throw new HttpError(400, "Choose the type of leave.");
        const start = needDate(String(b.startDate || ""), "start date"), end = needDate(String(b.endDate || ""), "end date");
        if (end < start)
          throw new HttpError(400, "The end date must be on or after the start date.");
        if (Date.parse(end) - Date.parse(start) > 366 * 864e5)
          throw new HttpError(400, "A leave request can cover at most a year.");
        const days = workingDays(start, end, await holidaySet(env), h.weekend);
        if (!days)
          throw new HttpError(400, "Those dates have no working days (only weekends or public holidays).");
        const overlap = await env.DB.prepare("SELECT id FROM hr_leaves WHERE employee_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1").bind(me.id, end, start).first();
        if (overlap)
          throw new HttpError(409, "You already have a leave request overlapping these dates.");
        if (type !== "unpaid" && balances(me, h)[type] < days)
          throw new HttpError(400, `Not enough ${type} leave: you have ${balances(me, h)[type]} day(s) and this request needs ${days}.`);
        const id = uid("lv_"), t = now(), reason = String(b.reason || "").trim().slice(0, 500);
        await env.DB.prepare("INSERT INTO hr_leaves (id, employee_id, leave_type, start_date, end_date, days, reason, status, admin_note, created_at, created_by) VALUES (?,?,?,?,?,?,?,'pending','',?,?)").bind(id, me.id, type, start, end, days, reason, t, user.id).run();
        await audit(env, user, "leave_request", { kind: "leave", id, label: `${me.name}: ${days} day(s) ${type} leave ${start} to ${end}`, ip });
        await notify(
          env,
          (await hrManagers(env)).filter((x) => x !== user.id),
          "New leave request",
          `${me.name} requested ${days} day(s) of ${LEAVE_LABEL[type]} leave from ${start} to ${end}.`,
          "leave_request",
          "#hr/leave"
        );
        return { leave: leaveOut(await env.DB.prepare("SELECT * FROM hr_leaves WHERE id = ?").bind(id).first(), emps) };
      }
      if (seg[1] === "leaves" && seg[2] && m === "DELETE") {
        const lv = await env.DB.prepare("SELECT * FROM hr_leaves WHERE id = ? AND employee_id = ?").bind(seg[2], me.id).first();
        if (!lv)
          throw new HttpError(404, "Leave request not found.");
        const r = await env.DB.prepare("UPDATE hr_leaves SET status = 'cancelled', reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(now(), lv.id).run();
        if (!r.meta.changes)
          throw new HttpError(409, "Only pending requests can be cancelled.");
        await audit(env, user, "leave_cancel", { kind: "leave", id: lv.id, label: `${me.name}: ${lv.leave_type} leave ${lv.start_date} to ${lv.end_date}`, ip });
        return { ok: true };
      }
      if (seg[1] === "payslips" && m === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'payrun' AND deleted = 0 AND status IN ('approved','paid') ORDER BY date DESC").all();
        const slips = [];
        for (const run of results.map(rowToObj)) {
          for (const l of run.lines || [])
            if (l.employeeId === me.id)
              slips.push({
                run: { id: run.id, number: run.number || "", period: run.period, date: run.date, status: run.status, payment: run.payment ? { date: run.payment.date } : null },
                line: { ...l, gross: num(l.gross), totalDeductions: num(l.totalDeductions), net: num(l.net) }
              });
        }
        slips.sort((a, b) => (b.run.period || "").localeCompare(a.run.period || "") || (b.run.date || "").localeCompare(a.run.date || ""));
        return { payslips: slips, divisor: num(h.payDivisor) || 30 };
      }
      throw new HttpError(404, "Unknown request.");
    }
    if (path === "payroll" && m === "GET") {
      if (!canPayroll(user) && !canManageHR(user))
        throw new HttpError(403, "Your role doesn't include payroll.");
      const rep = await monthlyReport(env, h, q.get("month"), today);
      return {
        month: rep.month,
        divisor: num(h.payDivisor) || 30,
        rows: rep.rows.map((r) => {
          const absent = r.trackedAbsent;
          return { employeeId: r.employeeId, unpaidLeaveDays: r.unpaidLeaveDays, absentDays: absent, tracked: r.tracked, days: r.unpaidLeaveDays + absent };
        })
      };
    }
    needManage(user);
    if (path === "dashboard" && m === "GET") {
      const emps = (await allEmployees(env)).filter(isActive);
      const map = empMap(emps), ids = new Set(emps.map((e) => e.id));
      const from = addDays(today, -6);
      const { results: week } = await env.DB.prepare("SELECT * FROM hr_attendance WHERE date >= ? AND date <= ?").bind(from, today).all();
      const mine = week.filter((r) => ids.has(r.employee_id));
      const todays = mine.filter((r) => r.date === today && r.clock_in);
      const present = new Set(todays.map((r) => r.employee_id));
      const { results: onLeaveRows } = await env.DB.prepare("SELECT * FROM hr_leaves WHERE status = 'approved' AND start_date <= ? AND end_date >= ?").bind(today, today).all();
      const onLeave = new Set(onLeaveRows.map((r) => r.employee_id).filter((id) => ids.has(id)));
      const trend = [];
      for (let i = 6; i >= 0; i--) {
        const d = addDays(today, -i);
        trend.push({ date: d, present: new Set(mine.filter((r) => r.date === d && r.clock_in).map((r) => r.employee_id)).size, late: mine.filter((r) => r.date === d && r.status === "late").length });
      }
      const depts = /* @__PURE__ */ new Map();
      for (const e of emps) {
        const k = (e.department || "").trim() || "Unassigned";
        depts.set(k, (depts.get(k) || 0) + 1);
      }
      const absent = emps.filter((e) => !present.has(e.id) && !onLeave.has(e.id));
      const holToday = await env.DB.prepare("SELECT * FROM hr_holidays WHERE date = ?").bind(today).first();
      const pending = (await env.DB.prepare("SELECT count(*) n FROM hr_leaves WHERE status = 'pending'").first()).n;
      return {
        date: today,
        todayHoliday: holToday ? holToday.name : null,
        weekend: h.weekend.includes(dow(today)),
        upcomingHolidays: await upcomingHolidays(env, today),
        holidayReminders: await holidayReminders(env, h, today),
        totalEmployees: emps.length,
        presentToday: present.size,
        lateToday: todays.filter((r) => r.status === "late").length,
        onLeaveToday: onLeave.size,
        notClockedIn: absent.length,
        pendingLeaves: pending,
        trend,
        departments: [...depts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
        recent: todays.sort((a, b) => b.clock_in - a.clock_in).slice(0, 8).map((r) => attOut(r, map, h, today)),
        notClockedInList: absent.slice(0, 8).map((e) => ({ id: e.id, name: e.name, department: e.department || "" })),
        onLeaveList: onLeaveRows.filter((r) => ids.has(r.employee_id)).map((r) => leaveOut(r, map))
      };
    }
    if (seg[0] === "employees") {
      if (seg.length === 1 && m === "GET") {
        const list = await allEmployees(env);
        const logins = await loginsFor(env, list);
        const { results: users } = isAdmin(user) || canManageHR(user) ? await env.DB.prepare("SELECT id, name, email, role FROM users WHERE disabled = 0 ORDER BY name").all() : { results: [] };
        const linked = new Set(list.map((e) => e.userId).filter(Boolean));
        return {
          employees: list.map((e) => empOut(e, h, user, logins.get(e.userId) || null)),
          // sign-ins that could be linked to someone (HR managers may only link self-service sign-ins)
          linkable: users.filter((u) => !linked.has(u.id) && (isAdmin(user) || u.role === SELF_ROLE)).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ROLES[u.role]?.label || u.role }))
        };
      }
      const fields = async (b, cur2) => {
        const o = cur2 ? { ...cur2 } : { id: uid("emp"), pay: { basic: 0, housing: 0, transport: 0, allowance: 0 }, commissionRate: 0, commissionBase: "collected", status: "active", userId: "" };
        for (const k of ["name", "code", "department", "designation", "email", "phone"])
          if (b[k] !== void 0)
            o[k] = String(b[k] ?? "").trim();
        if (!String(o.name || "").trim())
          throw new HttpError(400, "Enter the employee's name.");
        if (b.joined !== void 0) {
          if (b.joined && !isISODate(b.joined))
            throw new HttpError(400, "Enter a valid joining date.");
          o.joined = b.joined || "";
        }
        if (b.left !== void 0) {
          if (b.left && !isISODate(b.left))
            throw new HttpError(400, "Enter a valid leaving date.");
          o.left = b.left || "";
        }
        if (b.status !== void 0)
          o.status = b.status === "left" ? "left" : "active";
        if (b.leave && typeof b.leave === "object")
          o.leave = Object.fromEntries(BALANCE_TYPES.map((k) => [k, b.leave[k] === void 0 ? num(o.leave?.[k] ?? h.leaveDefaults[k]) : num(b.leave[k])]));
        if (b.userId !== void 0 && String(b.userId || "") !== String(cur2?.userId || "")) {
          const uidv = String(b.userId || "");
          if (uidv) {
            const u = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(uidv).first();
            if (!u)
              throw new HttpError(400, "That sign-in doesn't exist.");
            if (!isAdmin(user) && u.role !== SELF_ROLE)
              throw new HttpError(403, "Only the owner or an admin can link this sign-in.");
          }
          o.userId = uidv;
        }
        return o;
      };
      if (seg.length === 1 && m === "POST") {
        const o = await fields(await readJSON(req), null);
        if (!o.code) {
          const codes = (await allEmployees(env)).map((e) => String(e.code || "").trim());
          const taken = new Set(codes.map((c) => c.toLowerCase()));
          const nums = codes.map((c) => /^E(\d+)$/i.exec(c)).filter(Boolean);
          const width = Math.max(3, ...nums.map((x) => x[1].length));
          let n = Math.max(0, ...nums.map((x) => Number(x[1]))) + 1;
          while (taken.has(`e${String(n).padStart(width, "0")}`))
            n++;
          o.code = `E${String(n).padStart(width, "0")}`;
        }
        const res = await saveObject(env, user, "employee", o, { ip, system: true });
        return { employee: empOut(res.object, h, user, null), object: canPayroll(user) ? res.object : null };
      }
      const cur = await employeeById(env, seg[1]);
      if (!cur)
        throw new HttpError(404, "Employee not found.");
      if (seg.length === 2 && m === "GET")
        return { employee: empOut(cur, h, user, (await loginsFor(env, [cur])).get(cur.userId) || null) };
      if (seg.length === 2 && m === "PUT") {
        const b = await readJSON(req);
        if (b.version != null && Number(b.version) !== cur.version)
          throw new HttpError(409, "Someone changed this employee after you opened it. Reload to see the latest version.");
        const o = await fields(b, cur);
        o.version = cur.version;
        const res = await saveObject(env, user, "employee", o, { ip, system: true });
        if (o.status === "left" && cur.status !== "left" && o.userId) {
          const u = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(o.userId).first();
          if (u && u.role === SELF_ROLE) {
            await env.DB.prepare("UPDATE users SET disabled = 1, updated_at = ? WHERE id = ?").bind(now(), o.userId).run();
            await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(o.userId).run();
            await audit(env, user, "user_update", { kind: "user", id: o.userId, label: `${o.name}: sign-in switched off (left the company)`, ip });
          }
        }
        const logins = await loginsFor(env, [res.object]);
        return { employee: empOut(res.object, h, user, logins.get(res.object.userId) || null), object: canPayroll(user) ? res.object : null };
      }
      if (seg[2] === "login") {
        const linked = cur.userId ? await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(cur.userId).first() : null;
        if (seg.length === 3 && m === "POST") {
          if (linked)
            throw new HttpError(409, `${cur.name} already has a sign-in (${linked.email}).`);
          const b = await readJSON(req);
          const email = String(b.email || cur.email || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
            throw new HttpError(400, "Enter a valid email address for the sign-in.");
          if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first())
            throw new HttpError(409, "A user with this email already exists. Link that sign-in instead.");
          const temp = randomToken(9).replace(/[-_]/g, "x").slice(0, 12);
          const id = uid("u_"), t = now();
          await env.DB.prepare("INSERT INTO users (id, email, name, role, pass_hash, must_change, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)").bind(id, email, cur.name, SELF_ROLE, await hashPassword(temp), t, t).run();
          await audit(env, user, "user_add", { kind: "user", id, label: `${email} as ${SELF_ROLE} (${cur.name})`, ip });
          await saveObject(env, user, "employee", { ...cur, email: cur.email || email, userId: id, version: cur.version }, { ip, system: true });
          return { login: { id, email, role: SELF_ROLE }, tempPassword: temp };
        }
        if (!linked)
          throw new HttpError(404, `${cur.name} has no sign-in yet.`);
        if (linked.role !== SELF_ROLE && !isAdmin(user))
          throw new HttpError(403, "Only the owner or an admin can change this sign-in.");
        if (linked.role === "owner" || linked.role === "admin" && user.role !== "owner")
          throw new HttpError(403, "Change this sign-in under Users and roles.");
        if (seg[3] === "reset" && m === "POST") {
          const temp = randomToken(9).replace(/[-_]/g, "x").slice(0, 12);
          await env.DB.prepare("UPDATE users SET pass_hash = ?, must_change = 1, failed = 0, locked_until = NULL, updated_at = ? WHERE id = ?").bind(await hashPassword(temp), now(), linked.id).run();
          await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(linked.id).run();
          await audit(env, user, "password_reset", { kind: "user", id: linked.id, label: linked.email, ip });
          return { tempPassword: temp };
        }
        if (seg[3] === "access" && m === "POST") {
          const b = await readJSON(req);
          const disabled = !!b.disabled;
          if (linked.id === user.id)
            throw new HttpError(400, "You can't switch off your own sign-in.");
          await env.DB.prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?").bind(disabled ? 1 : 0, now(), linked.id).run();
          if (disabled)
            await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(linked.id).run();
          await audit(env, user, "user_update", { kind: "user", id: linked.id, label: linked.email, changes: { disabled: [!!linked.disabled, disabled] }, ip });
          return { ok: true, disabled };
        }
      }
    }
    if (seg[0] === "attendance") {
      const emps = empMap(await allEmployees(env));
      if (seg.length === 1 && m === "GET") {
        const where = [], params = [];
        if (q.get("employee")) {
          where.push("employee_id = ?");
          params.push(q.get("employee"));
        }
        if (q.get("date")) {
          where.push("date = ?");
          params.push(needDate(q.get("date")));
        } else if (q.get("month")) {
          monthRange(q.get("month"));
          where.push("date LIKE ?");
          params.push(q.get("month") + "-%");
        }
        const { results } = await env.DB.prepare(`SELECT * FROM hr_attendance ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY date DESC, clock_in DESC LIMIT 3000`).bind(...params).all();
        return { records: results.map((r) => attOut(r, emps, h, today)) };
      }
      const applyTimes = (date, b, rec) => {
        for (const [k, col] of [["clockIn", "clock_in"], ["clockOut", "clock_out"]]) {
          if (b[k] === void 0)
            continue;
          const v = String(b[k] ?? "").trim();
          if (v && !HHMM.test(v))
            throw new HttpError(400, "Enter times as HH:MM (24-hour).");
          rec[col] = v ? localToUTC(date, v, h.timezone) : null;
        }
      };
      const validate = (rec) => {
        if (rec.clock_out && !rec.clock_in)
          throw new HttpError(400, "A clock-out needs a clock-in time.");
        if (rec.clock_in && rec.clock_out && rec.clock_out <= rec.clock_in)
          throw new HttpError(400, "Clock-out must be after clock-in.");
        if (!ATT_STATUSES.includes(rec.status))
          throw new HttpError(400, "Choose a status: present, late, half day or absent.");
      };
      if (seg.length === 1 && m === "POST") {
        const b = await readJSON(req);
        const e = emps.get(String(b.employeeId || ""));
        if (!e)
          throw new HttpError(404, "Employee not found.");
        const date = needDate(String(b.date || ""));
        const existing = await env.DB.prepare("SELECT * FROM hr_attendance WHERE employee_id = ? AND date = ?").bind(e.id, date).first();
        const rec = existing ? { ...existing } : { id: uid("att_"), employee_id: e.id, date, clock_in: null, clock_out: null, status: "present", notes: "" };
        applyTimes(date, b, rec);
        if (b.notes !== void 0)
          rec.notes = String(b.notes || "").slice(0, 500);
        rec.status = b.status ? String(b.status) : rec.clock_in ? isLate(rec.clock_in, h) ? "late" : "present" : "absent";
        validate(rec);
        const t = now();
        if (existing)
          await env.DB.prepare("UPDATE hr_attendance SET clock_in = ?, clock_out = ?, status = ?, notes = ?, edited = 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(rec.clock_in, rec.clock_out, rec.status, rec.notes, t, user.id, rec.id).run();
        else
          await env.DB.prepare("INSERT INTO hr_attendance (id, employee_id, date, clock_in, clock_out, status, notes, edited, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,1,?,?,?)").bind(rec.id, e.id, date, rec.clock_in, rec.clock_out, rec.status, rec.notes, t, t, user.id).run();
        const saved = await env.DB.prepare("SELECT * FROM hr_attendance WHERE id = ?").bind(rec.id).first();
        await audit(env, user, existing ? "update" : "create", { kind: "attendance", id: rec.id, label: `${e.name} ${date}`, changes: existing ? attDiff(existing, saved, h) : null, ip });
        return { record: attOut(saved, emps, h, today) };
      }
      const cur = seg[1] ? await env.DB.prepare("SELECT * FROM hr_attendance WHERE id = ?").bind(seg[1]).first() : null;
      if (!cur)
        throw new HttpError(404, "Attendance record not found.");
      const label = `${emps.get(cur.employee_id)?.name || "Employee"} ${cur.date}`;
      if (m === "PUT") {
        const b = await readJSON(req);
        const rec = { ...cur };
        applyTimes(cur.date, b, rec);
        if (b.status)
          rec.status = String(b.status);
        if (b.notes !== void 0)
          rec.notes = String(b.notes || "").slice(0, 500);
        validate(rec);
        await env.DB.prepare("UPDATE hr_attendance SET clock_in = ?, clock_out = ?, status = ?, notes = ?, edited = 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(rec.clock_in, rec.clock_out, rec.status, rec.notes, now(), user.id, cur.id).run();
        const saved = await env.DB.prepare("SELECT * FROM hr_attendance WHERE id = ?").bind(cur.id).first();
        await audit(env, user, "update", { kind: "attendance", id: cur.id, label, changes: attDiff(cur, saved, h), ip });
        return { record: attOut(saved, emps, h, today) };
      }
      if (m === "DELETE") {
        await env.DB.prepare("DELETE FROM hr_attendance WHERE id = ?").bind(cur.id).run();
        await audit(env, user, "delete", { kind: "attendance", id: cur.id, label, ip });
        return { ok: true };
      }
    }
    if (seg[0] === "leaves") {
      const all = await allEmployees(env), emps = empMap(all);
      if (seg.length === 1 && m === "GET") {
        const st = q.get("status") || "pending";
        const { results } = st === "all" ? await env.DB.prepare("SELECT * FROM hr_leaves ORDER BY created_at DESC LIMIT 1000").all() : await env.DB.prepare("SELECT * FROM hr_leaves WHERE status = ? ORDER BY created_at DESC LIMIT 1000").bind(st).all();
        const clashes = await clashInfo(env, results.filter((r) => r.status === "pending"), emps, h);
        const counts = Object.fromEntries((await env.DB.prepare("SELECT status, count(*) n FROM hr_leaves GROUP BY status").all()).results.map((r) => [r.status, r.n]));
        return { leaves: results.map((r) => ({ ...leaveOut(r, emps), clash: clashes[r.id] || null, balance: r.leave_type !== "unpaid" && emps.get(r.employee_id) ? balances(emps.get(r.employee_id), h)[r.leave_type] : null })), counts };
      }
      if (seg[2] === "review" && m === "PUT") {
        const lv = await env.DB.prepare("SELECT * FROM hr_leaves WHERE id = ?").bind(seg[1]).first();
        if (!lv)
          throw new HttpError(404, "Leave request not found.");
        const b = await readJSON(req);
        const status = b.status === "approved" ? "approved" : b.status === "rejected" ? "rejected" : null;
        if (!status)
          throw new HttpError(400, "Approve or reject the request.");
        const note = String(b.adminNote || "").trim().slice(0, 500);
        if (lv.status !== "pending")
          throw new HttpError(409, "This leave request has already been reviewed.");
        const t = now();
        const dflt = num(h.leaveDefaults[lv.leave_type]);
        const stmts = [
          // records saved before the HR module have no balances yet: give them the default allowance first
          env.DB.prepare("UPDATE objects SET data = json_set(data, '$.leave', json(?)) WHERE id = ? AND json_type(data, '$.leave') IS NULL").bind(JSON.stringify(h.leaveDefaults), lv.employee_id),
          env.DB.prepare(
            "UPDATE hr_leaves SET status = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'pending' AND (? = 'rejected' OR leave_type = 'unpaid' OR coalesce((SELECT json_extract(o.data, '$.leave.' || hr_leaves.leave_type) FROM objects o WHERE o.id = hr_leaves.employee_id AND o.deleted = 0), ?) >= days)"
          ).bind(status, note, t, user.id, lv.id, status, dflt)
        ];
        if (status === "approved" && BALANCE_TYPES.includes(lv.leave_type)) {
          const p = `$.leave.${lv.leave_type}`;
          stmts.push(env.DB.prepare(
            `UPDATE objects SET data = json_set(data, '${p}', round(coalesce(json_extract(data, '${p}'), 0) - ?, 2)), version = version + 1, updated_at = ?, updated_by = ? WHERE id = ? AND EXISTS (SELECT 1 FROM hr_leaves WHERE id = ? AND status = 'approved' AND reviewed_at = ? AND reviewed_by = ?)`
          ).bind(lv.days, t, user.id, lv.employee_id, lv.id, t, user.id));
        }
        const res = await env.DB.batch(stmts);
        if (!res[1].meta.changes) {
          const again = await env.DB.prepare("SELECT status FROM hr_leaves WHERE id = ?").bind(lv.id).first();
          if (again.status !== "pending")
            throw new HttpError(409, "This leave request has already been reviewed.");
          throw new HttpError(409, `${emps.get(lv.employee_id)?.name || "The employee"} doesn't have enough ${lv.leave_type} leave left for this request.`);
        }
        const e = emps.get(lv.employee_id);
        await audit(env, user, status === "approved" ? "leave_approve" : "leave_reject", { kind: "leave", id: lv.id, label: `${e?.name || ""}: ${lv.days} day(s) ${lv.leave_type} leave ${lv.start_date} to ${lv.end_date}`, changes: note ? { note } : null, ip });
        if (e?.userId)
          await notify(
            env,
            [e.userId],
            `Leave ${status}`,
            `Your ${LEAVE_LABEL[lv.leave_type]} leave (${lv.start_date} to ${lv.end_date}, ${lv.days} day(s)) was ${status}.${note ? " Note: " + note : ""}`,
            `leave_${status}`,
            "#hr/my-leave"
          );
        const fresh = await employeeById(env, lv.employee_id);
        return { leave: leaveOut(await env.DB.prepare("SELECT * FROM hr_leaves WHERE id = ?").bind(lv.id).first(), emps), balance: fresh ? balances(fresh, h) : null, employee: canPayroll(user) && fresh ? fresh : null };
      }
    }
    if (path === "calendar" && m === "GET") {
      const [first, last] = monthRange(q.get("month"));
      const emps = empMap(await allEmployees(env));
      const { results: hol } = await env.DB.prepare("SELECT * FROM hr_holidays WHERE date >= ? AND date <= ? ORDER BY date").bind(first, last).all();
      const { results: lv } = await env.DB.prepare("SELECT * FROM hr_leaves WHERE status IN ('pending','approved') AND start_date <= ? AND end_date >= ? ORDER BY start_date").bind(last, first).all();
      return { month: q.get("month"), holidays: hol.map(holOut), leaves: lv.map((r) => leaveOut(r, emps)), weekend: h.weekend };
    }
    if (seg[0] === "report" && m === "GET") {
      const rep = await monthlyReport(env, h, q.get("month"), today);
      if (seg[1] !== "csv")
        return rep;
      const head = ["Employee Code", "Name", "Department", "Working Days", "Present", "Late", "Leave", "Absent", "Total Hours", "Attendance %"];
      const lines = [head, ...rep.rows.map((r) => [r.employeeCode, r.name, r.department, r.workingDays, r.presentDays, r.lateDays, r.leaveDays, r.absentDays, r.totalHours, r.attendancePct])];
      return new Response("\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="attendance-${rep.month}.csv"`
      } });
    }
    throw new HttpError(404, "Unknown request.");
  }
  function attDiff(a, b, h) {
    const out = {};
    const t = (v) => localHHMM(v, h.timezone);
    if (a.clock_in !== b.clock_in)
      out.clockIn = [t(a.clock_in), t(b.clock_in)];
    if (a.clock_out !== b.clock_out)
      out.clockOut = [t(a.clock_out), t(b.clock_out)];
    if (a.status !== b.status)
      out.status = [a.status, b.status];
    if ((a.notes || "") !== (b.notes || ""))
      out.notes = [a.notes || "", b.notes || ""];
    return Object.keys(out).length ? out : null;
  }
  var HR_DEFAULTS, LEAVE_TYPES, BALANCE_TYPES, ATT_STATUSES, LEAVE_LABEL, SELF_ROLE, role, canManageHR, canPayroll, isSelfService, localDate, localHHMM, HHMM, dow, MONTH, isActive, holOut, empMap, balances, csvCell;
  var init_hr = __esm({
    "src/hr.js"() {
      init_shim();
      init_util();
      init_auth();
      init_objects();
      HR_DEFAULTS = {
        timezone: "Asia/Dubai",
        shiftStart: "09:00",
        graceMinutes: 15,
        weekend: [6, 0],
        reminderDays: 14,
        clashPercent: 30,
        leaveDefaults: { annual: 30, sick: 15, casual: 6 },
        payDivisor: 30
      };
      LEAVE_TYPES = ["annual", "sick", "casual", "unpaid"];
      BALANCE_TYPES = ["annual", "sick", "casual"];
      ATT_STATUSES = ["present", "late", "half_day", "absent"];
      LEAVE_LABEL = { annual: "annual", sick: "sick", casual: "casual", unpaid: "unpaid" };
      SELF_ROLE = "employee";
      role = (u) => ROLES[u?.role] || {};
      canManageHR = (u) => !!role(u).hr;
      canPayroll = (u) => !!role(u).payroll;
      isSelfService = (u) => u?.role === SELF_ROLE;
      localDate = (ms, tz) => {
        const p = tzParts(ms, tz);
        return `${p.year}-${p.month}-${p.day}`;
      };
      localHHMM = (ms, tz) => {
        if (ms == null)
          return null;
        const p = tzParts(ms, tz);
        return `${p.hour}:${p.minute}`;
      };
      HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
      dow = (iso) => (/* @__PURE__ */ new Date(iso + "T00:00:00Z")).getUTCDay();
      MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
      isActive = (e) => e.status !== "left";
      holOut = (r) => ({ id: r.id, date: r.date, name: r.name, estimated: !!r.estimated });
      empMap = (list) => new Map(list.map((e) => [e.id, e]));
      balances = (e, h) => Object.fromEntries(BALANCE_TYPES.map((k) => [k, num(e?.leave?.[k] ?? h.leaveDefaults[k])]));
      csvCell = (v) => {
        const s = String(v ?? "");
        return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
      };
    }
  });

  // src/objects.js
  var objects_exports = {};
  __export(objects_exports, {
    KINDS: () => KINDS,
    audit: () => audit,
    canRead: () => canRead,
    deleteObject: () => deleteObject,
    ensureBankAccounts: () => ensureBankAccounts,
    getAccounts: () => getAccounts,
    getObj: () => getObj,
    getSettings: () => getSettings,
    labelOf: () => labelOf,
    linkBankTxn: () => linkBankTxn,
    makeCtx: () => makeCtx,
    rateOf: () => rateOf,
    recomputeTarget: () => recomputeTarget,
    repost: () => repost,
    rowToObj: () => rowToObj,
    saveObject: () => saveObject,
    seedChart: () => seedChart,
    settingsFor: () => settingsFor,
    upgradeChart: () => upgradeChart,
    writeSettingsRaw: () => writeSettingsRaw
  });
  function rowToObj(row) {
    if (!row)
      return null;
    const o = JSON.parse(row.data);
    o.id = row.id;
    o.kind = row.kind;
    o.version = row.version;
    o.deleted = !!row.deleted;
    o.updatedAt = row.updated_at;
    o.createdAt = o.createdAt || row.created_at;
    o.created_by = row.created_by;
    o.updated_by = row.updated_by;
    return o;
  }
  async function getObj(env, id) {
    return rowToObj(await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first());
  }
  async function getSettings(env) {
    const s = await getObj(env, "settings");
    const settings = s || { id: "settings", kind: "settings", version: 0 };
    settings.finance = deepMerge(JSON.parse(JSON.stringify(DEFAULT_FINANCE)), settings.finance || {});
    settings.security = { ...DEFAULT_SECURITY, ...settings.security || {} };
    return settings;
  }
  async function getAccounts(env) {
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'account' AND deleted = 0").all();
    return results.map(rowToObj);
  }
  async function makeCtx(env, settings = null) {
    settings = settings || await getSettings(env);
    const accounts = await getAccounts(env);
    return new Ctx(settings, accounts, {
      docById: (id) => getObj(env, id).then((o) => o && !o.deleted ? o : null),
      docByNumber: async (type, number) => {
        const row = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'doc' AND type = ? AND deleted = 0 AND lower(trim(number)) = lower(trim(?)) LIMIT 1").bind(type, String(number || "")).first();
        return rowToObj(row);
      }
    });
  }
  function deepMerge(target, src) {
    for (const k of Object.keys(src || {})) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k]))
        deepMerge(target[k], v);
      else if (v !== void 0)
        target[k] = v;
    }
    return target;
  }
  async function audit(env, user, action, { kind = null, id = null, label = null, changes = null, ip = null } = {}) {
    await env.DB.prepare("INSERT INTO audit (at, user_id, user_name, ip, action, kind, object_id, label, changes) VALUES (?,?,?,?,?,?,?,?,?)").bind(now(), user?.id || null, user?.name || null, ip, action, kind, id, label ? String(label).slice(0, 200) : null, changes ? JSON.stringify(changes).slice(0, 8e3) : null).run();
  }
  function diff(a, b) {
    if (!a)
      return null;
    const out = {};
    const keys = /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (SKIP_DIFF.has(k))
        continue;
      const x = JSON.stringify(a[k] ?? null), y = JSON.stringify(b[k] ?? null);
      if (x === y)
        continue;
      const short = (v) => typeof v === "string" && v.length > 120 ? v.slice(0, 117) + "…" : v ?? null;
      out[k] = Array.isArray(a[k]) || Array.isArray(b[k]) || typeof a[k] === "object" && a[k] || typeof b[k] === "object" && b[k] ? "changed" : [short(a[k]), short(b[k])];
    }
    return Object.keys(out).length ? out : null;
  }
  function labelOf(kind, o) {
    if (kind === "doc")
      return `${o.type} ${o.number || ""} ${o.party?.name ? "· " + o.party.name : ""}`.trim();
    if (kind === "contact" || kind === "product" || kind === "account" || kind === "rule" || kind === "employee")
      return o.name || o.code || "";
    if (kind === "payrun")
      return `Pay run ${o.number || ""} ${o.period || ""}`.trim();
    return `${kind} ${o.number || ""} ${o.contactName || o.vendorName || ""}`.trim();
  }
  async function nextCounter(env, name, floor = 0) {
    const row = await env.DB.prepare(
      "INSERT INTO counters (name, value) VALUES (?1, ?2 + 1) ON CONFLICT(name) DO UPDATE SET value = max(value + 1, ?2 + 1) RETURNING value"
    ).bind(name, floor).first();
    return row.value;
  }
  async function numberTaken(env, kind, type, number, id) {
    const row = await env.DB.prepare("SELECT id FROM objects WHERE kind = ? AND ifnull(type,'') = ? AND deleted = 0 AND id != ? AND lower(trim(number)) = lower(trim(?)) LIMIT 1").bind(kind, type || "", id, number).first();
    return !!row;
  }
  async function assignDocNumber(env, doc, settings) {
    const n = settings.numbering?.[doc.type];
    if (!n)
      return;
    let seq = await nextCounter(env, "doc:" + doc.type, num(n.next) - 1);
    let number = formatNumber(n.pattern, seq, doc.date);
    while (await numberTaken(env, "doc", doc.type, number, doc.id)) {
      seq = await nextCounter(env, "doc:" + doc.type, seq);
      number = formatNumber(n.pattern, seq, doc.date);
    }
    doc.seq = seq;
    doc.number = number;
    n.next = seq + 1;
    return true;
  }
  async function assignFinNumber(env, kind, o, settings) {
    const pattern = settings.finance?.numbering?.[kind]?.pattern || "{SEQ4}";
    let seq = await nextCounter(env, "fin:" + kind);
    let number = formatNumber(pattern, seq, o.date);
    while (await numberTaken(env, kind, null, number, o.id)) {
      seq = await nextCounter(env, "fin:" + kind);
      number = formatNumber(pattern, seq, o.date);
    }
    o.number = number;
  }
  function needDate2(o, field = "date", label = "date") {
    if (!isISODate(o[field]))
      throw new HttpError(400, `Enter a valid ${label}.`);
  }
  function normalise(kind, o, settings) {
    switch (kind) {
      case "doc": {
        if (!DOC_TYPES.has(o.type))
          throw new HttpError(400, "Unknown document type.");
        noNegatives(o);
        if (!o.date)
          o.date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        needDate2(o);
        o.items = Array.isArray(o.items) ? o.items : [];
        o.charges = Array.isArray(o.charges) ? o.charges : [];
        o.discount = o.discount || { type: "amt", value: 0 };
        o.party = o.party || {};
        o.fx = o.fx || { show: false, rate: "" };
        o.currency = o.currency || "AED";
        break;
      }
      case "payment":
      case "billPayment": {
        needDate2(o);
        o.currency = o.currency || "AED";
        if (o.allocations !== void 0 && !Array.isArray(o.allocations))
          throw new HttpError(400, "Allocations must be a list.");
        o.allocations = (o.allocations || []).filter((a) => a && typeof a === "object" && num(a.amount) !== 0);
        const key = kind === "payment" ? "docId" : "billId";
        if (o.allocations.some((a) => !a[key]))
          throw new HttpError(400, `Each amount applied needs the ${kind === "payment" ? "invoice" : "bill"} it is for.`);
        if (!(num(o.amount) > 0))
          throw new HttpError(400, "Enter the amount.");
        if (kind === "payment" && !String(o.contactName || "").trim())
          throw new HttpError(400, "Choose the customer.");
        if (kind === "billPayment" && !String(o.vendorName || "").trim())
          throw new HttpError(400, "Choose the vendor.");
        break;
      }
      case "bill":
      case "vendorCredit": {
        needDate2(o);
        if (kind === "bill" && o.due && !isISODate(o.due))
          throw new HttpError(400, "Enter a valid due date.");
        if (kind === "bill" && !o.due)
          o.due = addDays(o.date, num(settings.finance?.defaults?.billDueDays) || 30);
        if (!String(o.vendorName || "").trim())
          throw new HttpError(400, "Choose the vendor.");
        o.items = (Array.isArray(o.items) ? o.items : []).filter((i) => num(i.rate) || String(i.name || i.desc || "").trim());
        if (!o.items.length)
          throw new HttpError(400, "Add at least one line.");
        noNegatives(o);
        o.charges = Array.isArray(o.charges) ? o.charges : [];
        o.discount = o.discount || { type: "amt", value: 0 };
        o.currency = o.currency || "AED";
        o.status = o.status || "open";
        break;
      }
      case "expense":
        needDate2(o);
        o.currency = o.currency || "AED";
        break;
      case "journal": {
        needDate2(o);
        for (const l of Array.isArray(o.lines) ? o.lines : []) {
          if (l && l.fcAmount !== void 0 && l.fcAmount !== "" && l.fcAmount !== null) {
            l.fcAmount = round(num(l.fcAmount), 3);
            l.fcCurrency = String(l.fcCurrency || "").toUpperCase().slice(0, 3) || void 0;
            if (!l.fcCurrency)
              delete l.fcAmount;
          } else if (l) {
            delete l.fcAmount;
            delete l.fcCurrency;
          }
        }
        break;
      }
      case "transfer":
        needDate2(o);
        break;
      case "bankEntry":
        needDate2(o);
        break;
      case "contact":
      case "product":
        if (!String(o.name || "").trim())
          throw new HttpError(400, "Enter a name.");
        break;
      case "account": {
        if (!String(o.name || "").trim())
          throw new HttpError(400, "Enter the account name.");
        if (!["asset", "liability", "equity", "income", "expense"].includes(o.type))
          throw new HttpError(400, "Choose the account type.");
        o.currency = o.currency || "AED";
        break;
      }
      case "employee": {
        if (!String(o.name || "").trim())
          throw new HttpError(400, "Enter the employee's name.");
        o.name = String(o.name).trim();
        if (o.joined && !isISODate(o.joined))
          throw new HttpError(400, "Enter a valid joining date.");
        if (o.left && !isISODate(o.left))
          throw new HttpError(400, "Enter a valid leaving date.");
        o.pay = o.pay && typeof o.pay === "object" ? o.pay : {};
        for (const k of Object.keys(o.pay)) {
          o.pay[k] = num(o.pay[k]);
          if (o.pay[k] < 0)
            throw new HttpError(400, "Salary amounts can't be negative.");
        }
        o.commissionRate = num(o.commissionRate);
        if (o.commissionRate < 0 || o.commissionRate > 100)
          throw new HttpError(400, "Commission must be between 0 and 100%.");
        o.status = o.status === "left" ? "left" : "active";
        o.currency = "AED";
        break;
      }
      case "payrun": {
        needDate2(o, "date", "pay date");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(o.period || "")))
          throw new HttpError(400, "Choose the month this pay run is for.");
        if (!["draft", "approved", "paid"].includes(o.status))
          o.status = "draft";
        if (!Array.isArray(o.lines))
          throw new HttpError(400, "Add the employees to pay.");
        const seen = /* @__PURE__ */ new Set();
        o.lines = o.lines.filter((l) => l && typeof l === "object").map((l) => {
          const name = String(l.name || "").trim();
          if (!name)
            throw new HttpError(400, "Each payslip needs the employee's name.");
          if (l.employeeId && seen.has(l.employeeId))
            throw new HttpError(400, `${name} is in this pay run twice.`);
          if (l.employeeId)
            seen.add(l.employeeId);
          const items = (list, types, what) => (Array.isArray(list) ? list : []).filter((e) => e && num(e.amount) !== 0).map((e) => {
            if (!types[e.type])
              throw new HttpError(400, `Unknown ${what} on ${name}'s payslip.`);
            if (num(e.amount) < 0)
              throw new HttpError(400, `Amounts on ${name}'s payslip can't be negative.`);
            return { type: e.type, label: String(e.label || types[e.type].label).slice(0, 80), amount: round(num(e.amount), 2) };
          });
          const out = { ...l, name, earnings: items(l.earnings, PAY_EARNINGS, "earning"), deductions: items(l.deductions, PAY_DEDUCTIONS, "deduction") };
          const t = payslipTotals(out);
          if (t.net < 0)
            throw new HttpError(400, `Deductions on ${name}'s payslip are more than the pay.`);
          return { ...out, gross: t.gross, totalDeductions: t.deductions, net: t.net };
        });
        if (o.status !== "draft" && !o.lines.length)
          throw new HttpError(400, "Add at least one employee before approving.");
        if (Array.isArray(o.payments) && o.payments.length) {
          o.payments = o.payments.filter((x) => x && num(x.amount) > 0).map((x) => {
            needDate2(x, "date", "payment date");
            if (!x.accountId)
              throw new HttpError(400, "Choose the account each salary payment was made from.");
            return { date: x.date, accountId: x.accountId, amount: round(num(x.amount), 2), reference: String(x.reference || "").slice(0, 80), employeeId: x.employeeId || "", name: String(x.name || "").slice(0, 120) };
          });
          if (o.status === "draft")
            o.status = "approved";
          delete o.payment;
        } else
          delete o.payments;
        if (o.status === "paid" && !o.payments) {
          o.payment = o.payment || {};
          needDate2(o.payment, "date", "payment date");
          if (!o.payment.accountId)
            throw new HttpError(400, "Choose the account salaries were paid from.");
        } else
          delete o.payment;
        if (Array.isArray(o.ledgerRefs))
          o.ledgerRefs = o.ledgerRefs.map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 50);
        else
          delete o.ledgerRefs;
        o.totals = { employees: o.lines.length, gross: round(o.lines.reduce((s, l) => s + l.gross, 0), 2), deductions: round(o.lines.reduce((s, l) => s + l.totalDeductions, 0), 2), net: round(o.lines.reduce((s, l) => s + l.net, 0), 2) };
        o.currency = "AED";
        break;
      }
      case "recurring": {
        if (!o.templateId)
          throw new HttpError(400, "Choose the invoice to repeat.");
        needDate2(o, "nextDate", "next invoice date");
        if (!["weekly", "monthly", "quarterly", "yearly"].includes(o.frequency))
          throw new HttpError(400, "Choose how often to repeat.");
        break;
      }
    }
    return o;
  }
  function noNegatives(o) {
    const bad = (o.items || []).some((i) => num(i.qty) < 0 || num(i.rate) < 0) || (o.charges || []).some((c) => num(c.amount) < 0) || num(o.discount?.value) < 0;
    if (bad)
      throw new HttpError(400, "Quantities, rates and charges can't be negative. For returns or refunds, use a credit note.");
  }
  function columns(kind, o) {
    const c = { type: null, number: o.number || null, date: o.date || null, due: o.due || null, status: o.status || null, contact: null, currency: o.currency || null, total: null, balance: null };
    if (kind === "doc") {
      c.type = o.type;
      c.due = o.due || o.valid || null;
      c.contact = o.party?.name || null;
      if (o.items && ["invoice", "proforma", "quotation", "purchaseOrder", "creditNote", "salesOrder"].includes(o.type))
        c.total = computeTotals(o).total;
      if (o.type === "invoice")
        c.balance = o.balanceDue ?? c.total;
    } else if (kind === "bill" || kind === "vendorCredit") {
      c.contact = o.vendorName;
      c.total = computeTotals(o).total;
      c.balance = kind === "bill" ? o.balanceDue ?? c.total : o.unapplied ?? c.total;
    } else if (kind === "payment" || kind === "billPayment") {
      c.contact = o.contactName || o.vendorName;
      c.total = num(o.amount);
    } else if (kind === "expense") {
      c.contact = o.vendorName || null;
      c.total = expenseAmounts(o).total;
    } else if (kind === "payrun") {
      c.contact = `Payroll ${o.period}`;
      c.total = o.totals?.gross ?? 0;
      c.balance = o.status === "paid" ? 0 : o.totals?.net ?? 0;
    } else if (kind === "employee") {
      c.number = o.code || null;
      c.contact = o.name;
    } else if (kind === "contact" || kind === "product" || kind === "account" || kind === "rule") {
      c.number = o.code || null;
      c.contact = o.name;
    }
    return c;
  }
  function checkLock(kind, type, oldObj, newObj, settings) {
    const lock = settings.finance?.lockDate;
    if (!lock || !(isPosting(kind, newObj?.type || type) || isPosting(kind, oldObj?.type || type)))
      return;
    for (const o of [oldObj, newObj, oldObj?.payment, newObj?.payment]) {
      if (o && o.date && o.date <= lock)
        throw new HttpError(423, `The books are locked up to ${lock}. Ask an accountant to move the lock date to change records dated on or before it.`);
    }
  }
  async function recomputeTarget(env, id, userId) {
    const row = await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first();
    if (!row || row.deleted)
      return null;
    const o = rowToObj(row);
    const { results } = await env.DB.prepare("SELECT source_kind, sum(amount) amt, max(date) last FROM allocations WHERE target_id = ? GROUP BY source_kind").bind(id).all();
    const by = Object.fromEntries(results.map((r) => [r.source_kind, r]));
    const dec = decimalsFor(o.currency || "AED");
    const total = computeTotals(o).total;
    let changed = false;
    const set = (k, v) => {
      if (JSON.stringify(o[k]) !== JSON.stringify(v)) {
        o[k] = v;
        changed = true;
      }
    };
    if (row.kind === "doc" && o.type === "invoice") {
      const paid = round(by.payment?.amt || 0, dec), credited = round(by.doc?.amt || 0, dec);
      const bal = o.status === "cancelled" ? 0 : round(Math.max(0, total - paid - credited), dec);
      set("paid", paid);
      set("credited", credited);
      set("balanceDue", bal);
      if (paid > 0 && by.payment?.last)
        set("paidDate", by.payment.last);
      if (o.status !== "cancelled") {
        let st = o.status;
        if (total > 0 && bal <= 0 && paid > 0)
          st = "paid";
        else if (paid > 0 && bal > 0)
          st = "partial";
        else if (paid === 0 && (st === "paid" || st === "partial"))
          st = "sent";
        set("status", st);
      }
    } else if (row.kind === "bill") {
      const paid = round(by.billPayment?.amt || 0, dec), credited = round(by.vendorCredit?.amt || 0, dec);
      const bal = round(Math.max(0, total - paid - credited), dec);
      set("paid", paid);
      set("credited", credited);
      set("balanceDue", bal);
      if (o.status !== "void")
        set("status", total > 0 && bal <= 0 ? "paid" : paid + credited > 0 ? "partial" : "open");
    } else
      return null;
    if (!changed)
      return null;
    const c = columns(row.kind, o);
    const data = strip(o);
    await env.DB.prepare("UPDATE objects SET data = ?, status = ?, balance = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), c.status, c.balance, now(), id).run();
    return rowToObj(await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first());
  }
  function strip(o) {
    const d = { ...o };
    for (const k of ["version", "deleted", "updatedAt", "created_by", "updated_by", "kind"])
      delete d[k];
    return d;
  }
  function postingStatements(env, kind, o, posting) {
    const stmts = [
      env.DB.prepare("DELETE FROM journal_lines WHERE source_kind = ? AND source_id = ?").bind(kind, o.id),
      env.DB.prepare("DELETE FROM allocations WHERE source_kind = ? AND source_id = ?").bind(kind, o.id)
    ];
    for (const l of posting.lines) {
      stmts.push(env.DB.prepare("INSERT INTO journal_lines (source_kind, source_id, source_number, date, account_id, debit, credit, fc_amount, fc_currency, contact, link_id, tax_code, tax_base, memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(kind, o.id, o.number || null, l.date || o.date, l.account, l.debit || 0, l.credit || 0, l.fc_amount ?? null, l.fc_currency ?? null, l.contact || null, l.link_id || null, l.tax_code || null, l.tax_base ?? null, (l.memo || "").slice(0, 200)));
    }
    for (const a of posting.allocations) {
      stmts.push(env.DB.prepare("INSERT INTO allocations (source_kind, source_id, target_id, amount, date) VALUES (?,?,?,?,?)").bind(kind, o.id, a.target_id, a.amount, a.date || o.date));
    }
    return stmts;
  }
  async function computePosting(kind, o, ctx) {
    if (o.deleted || !isPosting(kind, o.type))
      return { lines: [], allocations: [] };
    return postingFor(kind, o, ctx);
  }
  async function repost(env, kind, o, ctx) {
    const old = await env.DB.prepare("SELECT DISTINCT target_id FROM allocations WHERE source_kind = ? AND source_id = ?").bind(kind, o.id).all();
    const posting = await computePosting(kind, o, ctx);
    await env.DB.batch(postingStatements(env, kind, o, posting));
    return { targets: /* @__PURE__ */ new Set([...old.results.map((r) => r.target_id), ...posting.allocations.map((a) => a.target_id)]), rate: posting.rate };
  }
  function checkAccounts(kind, o, ctx, user) {
    const acc = (id, what) => ctx.account(id, what);
    const sameCur = (a, cur, what) => {
      if (a.currency && a.currency !== "AED" && a.currency !== (cur || "AED"))
        throw new HttpError(400, `${a.name} holds ${a.currency}. Record this ${what} in ${a.currency}, or use an AED account.`);
    };
    if (kind === "payment") {
      const a = acc(o.accountId, "account to deposit into");
      if (!BANKISH(a))
        throw new HttpError(400, "Payments are deposited into a bank or cash account.");
      sameCur(a, o.currency, "payment");
    } else if (kind === "billPayment") {
      const a = acc(o.accountId, "account to pay from");
      if (!(BANKISH(a) || a.role === "director" || a.type === "liability" && a.subtype === "current"))
        throw new HttpError(400, "Pay from a bank, cash or director's account.");
      sameCur(a, o.currency, "payment");
    } else if (kind === "expense") {
      const cat = acc(o.accountId, "expense category");
      if (!(cat.type === "expense" || cat.type === "asset" && cat.subtype === "fixed"))
        throw new HttpError(400, "Choose an expense category (or a fixed asset).");
      const from = acc(o.paidThrough, '"paid through" account');
      const staffish = !FINANCE_ROLE(user) && !ROLES_WITH_BANKING.has(user?.role);
      const ok2 = staffish ? from.subtype === "cash" || from.role === "director" : BANKISH(from) || from.role === "director" || from.role === "ap" || from.type === "liability" && from.subtype === "current" || from.name.toLowerCase().includes("staff");
      if (!ok2)
        throw new HttpError(400, staffish ? "Choose petty cash or “Due to director” as the account you paid through." : "Choose the bank, cash or card account the expense was paid from.");
      sameCur(from, o.currency, "expense");
    } else if (kind === "bankEntry") {
      if (!BANKISH(acc(o.bankAccountId, "bank account")))
        throw new HttpError(400, "Choose a bank or cash account.");
      const off = acc(o.accountId, "category");
      if (off.role === "ar" || off.role === "ap")
        throw new HttpError(400, "Use “Customer payment” or “Pay a bill” for receivables and payables.");
    } else if (kind === "payrun" && Array.isArray(o.payments)) {
      for (const x of o.payments) {
        const a = acc(x.accountId, "account salaries were paid from");
        if (a.type === "income" || a.type === "expense")
          throw new HttpError(400, "Salary payments come from a bank, cash, loan or liability account.");
        sameCur(a, "AED", "pay run");
      }
    } else if (kind === "payrun" && o.status === "paid") {
      const a = acc(o.payment.accountId, "account salaries were paid from");
      if (!(BANKISH(a) || a.role === "director"))
        throw new HttpError(400, "Pay salaries from a bank or cash account (or “Due to director”).");
      sameCur(a, "AED", "pay run");
    } else if (kind === "transfer") {
      if (!BANKISH(acc(o.fromAccount, "account to transfer from")) || !BANKISH(acc(o.toAccount, "account to transfer to")))
        throw new HttpError(400, "Transfers are between bank and cash accounts.");
    } else if (kind === "bill" || kind === "vendorCredit") {
      for (const it of o.items)
        if (it.account) {
          const a = acc(it.account, "account");
          if (BANKISH(a) || a.role === "ar" || a.role === "ap")
            throw new HttpError(400, `${a.name} can't be used on a bill line.`);
        }
      if (o.reverseCharge && o.items.some((i) => num(i.vat) > 0))
        throw new HttpError(400, "With reverse charge, set the VAT on each line to 0. The 5% is added automatically.");
    }
  }
  async function appliedTo(env, targetId, exceptKind, exceptId) {
    const r = await env.DB.prepare("SELECT ifnull(sum(amount),0) a FROM allocations WHERE target_id = ? AND NOT (source_kind = ? AND source_id = ?)").bind(targetId, exceptKind, exceptId).first();
    return r.a;
  }
  async function checkAllocations(env, kind, o, posting) {
    for (const a of posting.allocations) {
      const t = await getObj(env, a.target_id);
      if (!t || t.deleted)
        throw new HttpError(400, "A document this applies to no longer exists.");
      if (t.kind === "doc" && t.status === "cancelled" || t.kind === "bill" && t.status === "void")
        throw new HttpError(400, `${t.number} is ${t.kind === "bill" ? "void" : "cancelled"}; nothing can be applied to it.`);
      const total = computeTotals(t).total;
      const dec = decimalsFor(t.currency || "AED");
      const left = round(total - await appliedTo(env, t.id, kind, o.id), dec);
      if (a.amount > left + Math.pow(10, -dec) / 2) {
        const what = kind === "doc" ? "This credit note" : kind === "vendorCredit" ? "This vendor credit" : "This";
        throw new HttpError(400, `${what} applies ${t.currency || "AED"} ${a.amount.toFixed(dec)} to ${t.number}, but only ${left.toFixed(dec)} is still owed on it.`);
      }
    }
  }
  async function checkTarget(env, kind, o, existing) {
    if (!existing || existing.deleted)
      return;
    const isInv = kind === "doc" && existing.type === "invoice", isBill = kind === "bill";
    if (!isInv && !isBill)
      return;
    const applied = await appliedTo(env, o.id, "", "");
    if (!applied)
      return;
    const name = existing.number || (isInv ? "this invoice" : "this bill");
    if (isInv && o.type !== "invoice")
      throw new HttpError(409, `Payments or credit notes are recorded against ${name}, so it must stay an invoice.`);
    if (isInv && o.status === "cancelled" || isBill && o.status === "void")
      throw new HttpError(409, `Payments or credits are recorded against ${name}. Remove them before ${isInv ? "cancelling" : "voiding"} it.`);
    if ((o.currency || "AED") !== (existing.currency || "AED"))
      throw new HttpError(409, `Payments are recorded against ${name} in ${existing.currency || "AED"}, so its currency can't change.`);
    const total = computeTotals(o).total;
    if (total + 1e-9 < applied)
      throw new HttpError(409, `${existing.currency || "AED"} ${applied.toFixed(2)} is already paid or credited on ${name}; its total can't be less than that.`);
  }
  async function checkLinkedLock(env, kind, o, live, settings) {
    const lock = settings.finance?.lockDate;
    if (!lock || !live || !(kind === "doc" && live.type === "invoice" || kind === "bill"))
      return;
    const changed = JSON.stringify([o.fx?.rate ?? o.rate, o.currency]) !== JSON.stringify([live.fx?.rate ?? live.rate, live.currency]);
    if (!changed)
      return;
    const r = await env.DB.prepare("SELECT o.number, o.date FROM allocations a JOIN objects o ON o.id = a.source_id WHERE a.target_id = ? AND a.source_kind IN ('payment','billPayment') AND o.date <= ? LIMIT 1").bind(o.id, lock).first();
    if (r)
      throw new HttpError(423, `Payment ${r.number} (${r.date}) is in the locked period, so the exchange rate of this ${kind === "bill" ? "bill" : "invoice"} can't change.`);
  }
  async function checkReconciled(env, kind, o, posting) {
    const txn = await env.DB.prepare("SELECT t.*, a.data adata FROM bank_txns t LEFT JOIN objects a ON a.id = t.account_id WHERE t.link_id = ? AND t.reconciliation_id IS NOT NULL").bind(o.id).first();
    if (!txn)
      return;
    const acc = JSON.parse(txn.adata || "{}");
    const foreign = acc.currency && acc.currency !== "AED";
    const amt = round(posting.lines.filter((l) => l.account === txn.account_id).reduce((s, l) => s + (foreign ? num(l.fc_amount) : l.debit - l.credit), 0), 3);
    if (o.deleted || Math.abs(amt - txn.amount) >= 5e-4)
      throw new HttpError(409, "This record is matched to a reconciled bank line. Undo that reconciliation before changing the amount or account.");
  }
  function cleanHTML(html) {
    if (typeof html !== "string")
      return html;
    let s = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|svg|math|template|noscript)[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, "");
    let prev;
    do {
      prev = s;
      s = s.replace(/(<[^>]*?)[\s/"']on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "$1 ");
    } while (s !== prev);
    return s.replace(/(href|src|xlink:href|action|formaction)\s*=\s*("|')?\s*(javascript|data|vbscript):[^"'>\s]*("|')?/gi, "");
  }
  function cleanRich(kind, o) {
    if (kind === "doc") {
      o.terms = cleanHTML(o.terms);
      if (o.letter)
        o.letter.body = cleanHTML(o.letter.body);
    }
    if (kind === "settings" && o.defaults?.terms)
      for (const k of Object.keys(o.defaults.terms))
        o.defaults.terms[k] = cleanHTML(o.defaults.terms[k]);
  }
  async function saveObject(env, user, kind, incoming, { ip = null, system = false } = {}) {
    if (!KINDS.has(kind))
      throw new HttpError(400, "Unknown record type.");
    if (!incoming || typeof incoming !== "object")
      throw new HttpError(400, "Nothing to save.");
    const id = String(incoming.id || "").trim() || uid(kind.slice(0, 2) + "_");
    if (id.length > 80)
      throw new HttpError(400, "Record id is too long.");
    const existingRow = await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first();
    const existing = rowToObj(existingRow);
    if (existing && existing.kind !== kind)
      throw new HttpError(409, "That id belongs to another kind of record.");
    const live = existing && !existing.deleted ? existing : null;
    if (!system) {
      if (!canWrite(user, kind, incoming.type, existing && { created_by: existing.created_by }))
        throw new HttpError(403, "Your role doesn't allow changing this.");
      if (existing && existing.type && incoming.type && existing.type !== incoming.type && !canWrite(user, kind, existing.type))
        throw new HttpError(403, "Your role doesn't allow changing this.");
      if (live && incoming.version == null)
        throw new HttpError(409, "This record changed on the server. Reload to see the latest version.", { current: existing });
    }
    if (live && incoming.version != null && Number(incoming.version) !== existing.version && !incoming.force) {
      const who = existing.updated_by ? await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(existing.updated_by).first() : null;
      throw new HttpError(409, `${who && existing.updated_by !== user?.id ? who.name : "Someone"} changed this record after you opened it. Reload to see the latest version.`, { current: existing });
    }
    const settings = kind === "settings" ? null : await getSettings(env);
    let o = { ...incoming };
    delete o.force;
    o.id = id;
    if (kind === "settings") {
      o.id = "settings";
      cleanRich("settings", o);
      return saveSettings(env, user, o, existing, ip);
    }
    for (const k of ["deleted", "kind", "version", "created_by", "updated_by"])
      delete o[k];
    o = normalise(kind, o, settings);
    if (kind === "employee")
      await hrEmployeeHook(env, o, live, settings);
    cleanRich(kind, o);
    for (const k of ["paid", "credited", "balanceDue", "paidDate"]) {
      if (live && live[k] !== void 0)
        o[k] = live[k];
      else
        delete o[k];
    }
    if (kind === "doc" && o.type === "invoice" && live && ["paid", "partial"].includes(live.status) && o.status !== "cancelled")
      o.status = live.status;
    if (kind === "account") {
      o.role = live?.role || (system ? incoming.role || null : null);
      o.system = live?.system || (system ? !!incoming.system : false);
      if (live) {
        const used = (await env.DB.prepare("SELECT count(*) n FROM journal_lines WHERE account_id = ?").bind(id).first()).n;
        if (used && (o.type !== live.type || (o.currency || "AED") !== (live.currency || "AED")))
          throw new HttpError(409, "This account has transactions, so its type and currency can't change. Create a new account instead.");
        if (live.system) {
          o.type = live.type;
          o.subtype = live.subtype;
          o.archived = false;
        }
      }
    }
    checkLock(kind, o.type, live, o, settings);
    let settingsChanged = false;
    if (kind === "doc" && !live && o.auto) {
      settingsChanged = await assignDocNumber(env, o, settings);
    } else if (kind === "doc") {
      if (!String(o.number || "").trim())
        throw new HttpError(400, "Add a document number.");
      if (await numberTaken(env, "doc", o.type, o.number, id))
        throw new HttpError(409, `${o.number} is already used by another document of this type.`);
    } else if (FIN_NUMBERED.has(kind) && !String(o.number || "").trim()) {
      await assignFinNumber(env, kind, o, settings);
    }
    if (kind === "bill" && !String(o.number || "").trim())
      await assignFinNumber(env, "bill", o, settings);
    const posts = isPosting(kind, o.type) || live && isPosting(kind, live.type);
    let ctx = null, posting = { lines: [], allocations: [] }, oldTargets = [];
    if (posts) {
      ctx = await makeCtx(env, settings);
      checkAccounts(kind, o, ctx, user);
      await checkLinkedLock(env, kind, o, live, settings);
      posting = await computePosting(kind, o, ctx);
      await checkAllocations(env, kind, o, posting);
      await checkTarget(env, kind, o, live);
      await checkReconciled(env, kind, o, posting);
      oldTargets = (await env.DB.prepare("SELECT DISTINCT target_id FROM allocations WHERE source_kind = ? AND source_id = ?").bind(kind, id).all()).results.map((r) => r.target_id);
    }
    const renamed = [];
    const nm = (v) => String(v || "").trim().toLowerCase();
    if (posts && kind === "doc" && o.type === "invoice" && live && nm(live.party?.name) !== nm(o.party?.name)) {
      const { results: srcs } = await env.DB.prepare("SELECT DISTINCT source_kind, source_id FROM allocations WHERE target_id = ? AND source_kind IN ('payment','doc')").bind(id).all();
      for (const r of srcs) {
        const so = await getObj(env, r.source_id);
        if (!so || so.deleted)
          continue;
        const others = await env.DB.prepare("SELECT count(DISTINCT target_id) n FROM allocations WHERE source_kind = ? AND source_id = ? AND target_id != ?").bind(r.source_kind, r.source_id, id).first();
        if (others.n)
          throw new HttpError(409, `${so.number || "A payment"} also settles other invoices of ${live.party?.name}. Change the customer on those too, or take the payment off them first.`);
        checkLock(r.source_kind, so.type, so, so, settings);
        renamed.push({ kind: r.source_kind, obj: so });
      }
    }
    const t = now();
    o.updatedAt = t;
    o.createdAt = existing?.createdAt || o.createdAt || t;
    let attempt = 0;
    while (true) {
      const c = columns(kind, o);
      const data = JSON.stringify(strip(o));
      if (data.length > 15e5)
        throw new HttpError(413, "This record is too large to save. Remove large images or attachments.");
      const write = existing ? env.DB.prepare("UPDATE objects SET type=?, number=?, date=?, due=?, status=?, contact=?, currency=?, total=?, balance=?, data=?, version=version+1, deleted=0, updated_at=?, updated_by=? WHERE id=?").bind(c.type, c.number, c.date, c.due, c.status, c.contact, c.currency, c.total, c.balance, data, t, user?.id || null, id) : env.DB.prepare("INSERT INTO objects (id, kind, type, number, date, due, status, contact, currency, total, balance, data, version, deleted, created_at, created_by, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?)").bind(id, kind, c.type, c.number, c.date, c.due, c.status, c.contact, c.currency, c.total, c.balance, data, t, user?.id || null, t, user?.id || null);
      try {
        await env.DB.batch([write, ...posts ? postingStatements(env, kind, o, posting) : []]);
        break;
      } catch (e) {
        if (!/UNIQUE/i.test(String(e.message)) || kind !== "doc")
          throw e;
        if (!o.auto || live || ++attempt > 5)
          throw new HttpError(409, `${o.number} is already used by another document of this type.`);
        settingsChanged = await assignDocNumber(env, o, settings);
      }
    }
    const related = [];
    for (const r of renamed) {
      if (r.kind === "payment")
        r.obj.contactName = o.party.name;
      else
        r.obj.party = { ...r.obj.party || {}, name: o.party.name };
      await rewriteData(env, r.kind, r.obj, user?.id);
      if (r.kind === "doc")
        await repost(env, "doc", await getObj(env, r.obj.id), ctx);
    }
    if (posts) {
      const targets = /* @__PURE__ */ new Set([...oldTargets, ...posting.allocations.map((a) => a.target_id), id]);
      if (kind === "doc" && o.type === "invoice" || kind === "bill") {
        const { results } = await env.DB.prepare("SELECT DISTINCT source_kind, source_id FROM allocations WHERE target_id = ? AND source_kind IN ('payment','billPayment')").bind(id).all();
        for (const r of results) {
          const src = await getObj(env, r.source_id);
          if (src && !src.deleted)
            await repost(env, r.source_kind, src, ctx);
        }
      }
      for (const tid of targets) {
        const upd = await recomputeTarget(env, tid, user?.id);
        if (upd && upd.id !== id)
          related.push(upd);
      }
      if (kind === "doc" && o.type === "invoice" && (!live || live.number !== o.number))
        await relinkCreditNotes(env, ctx, [live?.number || o.number, o.number], related, id, user?.id);
      for (const r of renamed) {
        const u = await getObj(env, r.obj.id);
        if (u && !related.some((x) => x.id === u.id))
          related.push(u);
      }
    }
    if (o.bankTxnId && !live)
      await linkBankTxn(env, o.bankTxnId, kind, id);
    let freshSettings = null;
    if (settingsChanged) {
      await writeSettingsRaw(env, settings, user);
      freshSettings = await getSettings(env);
    }
    const saved = rowToObj(await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first());
    await audit(env, user, live ? "update" : "create", { kind, id, label: labelOf(kind, saved), changes: { ...diff(live, saved) || {}, ...incoming.force ? { overwritten: "saved over someone else's change" } : {} }, ip });
    return { object: saved, related, settings: freshSettings ? settingsFor(freshSettings, user) : null };
  }
  async function relinkCreditNotes(env, ctx, numbers, related, invoiceId = null, userId = null) {
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind='doc' AND type='creditNote' AND deleted=0 AND lower(trim(json_extract(data,'$.ref'))) IN (lower(trim(?)), lower(trim(?)))").bind(numbers[0] || "", numbers[1] || "").all();
    for (const row of results) {
      let cn = rowToObj(row);
      const old = (await env.DB.prepare("SELECT DISTINCT target_id FROM allocations WHERE source_kind = 'doc' AND source_id = ?").bind(cn.id).all()).results.map((r) => r.target_id);
      const renumbered = invoiceId && numbers[0] !== numbers[1] && String(cn.ref || "").trim().toLowerCase() === String(numbers[0] || "").trim().toLowerCase() && old.includes(invoiceId);
      if (renumbered) {
        cn.ref = numbers[1];
        await rewriteData(env, "doc", cn, userId);
        cn = await getObj(env, cn.id);
      }
      let posting;
      try {
        posting = await computePosting("doc", cn, ctx);
        await checkAllocations(env, "doc", cn, posting);
      } catch (e) {
        posting = await computePosting("doc", { ...cn, _noLink: true }, ctx);
      }
      await env.DB.batch(postingStatements(env, "doc", cn, posting));
      for (const t of /* @__PURE__ */ new Set([...old, ...posting.allocations.map((a) => a.target_id)])) {
        const u = await recomputeTarget(env, t);
        if (u)
          related.push(u);
      }
      if (renumbered)
        related.push(await getObj(env, cn.id));
    }
  }
  async function rewriteData(env, kind, obj, userId) {
    const c = columns(kind, obj);
    await env.DB.prepare("UPDATE objects SET contact = ?, number = ?, data = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(c.contact, c.number, JSON.stringify(strip(obj)), now(), userId || null, obj.id).run();
  }
  async function linkBankTxn(env, txnId, kind, id) {
    await env.DB.prepare("UPDATE bank_txns SET status = CASE WHEN ? = 'bankEntry' THEN 'categorized' ELSE 'matched' END, link_kind = ?, link_id = ? WHERE id = ?").bind(kind, kind, id, txnId).run();
  }
  async function deleteObject(env, user, kind, id, { ip = null } = {}) {
    const row = await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first();
    if (!row || row.deleted)
      throw new HttpError(404, "That record no longer exists.");
    if (row.kind !== kind)
      throw new HttpError(400, "Wrong record type.");
    const o = rowToObj(row);
    if (!canWrite(user, kind, o.type, { created_by: row.created_by }))
      throw new HttpError(403, "Your role doesn't allow deleting this.");
    if (kind === "settings")
      throw new HttpError(400, "Settings cannot be deleted.");
    const settings = await getSettings(env);
    checkLock(kind, o.type, o, null, settings);
    if (kind === "account") {
      const used = await env.DB.prepare("SELECT count(*) n FROM journal_lines WHERE account_id = ?").bind(id).first();
      if (used.n)
        throw new HttpError(409, "This account has transactions. Archive it instead of deleting it.");
      if (o.system)
        throw new HttpError(409, "This account is used by the system and cannot be deleted.");
    }
    const applied = await env.DB.prepare("SELECT source_kind, count(*) n FROM allocations WHERE target_id = ? GROUP BY source_kind").bind(id).all();
    const pays = applied.results.filter((r) => r.source_kind === "payment" || r.source_kind === "billPayment");
    if (pays.length)
      throw new HttpError(409, `Payments are recorded against ${o.number || "this record"}. Delete or change those payments first.`);
    if (applied.results.length)
      throw new HttpError(409, `Credit notes are applied to ${o.number || "this record"}. Delete them or remove their reference first.`);
    const rec = await env.DB.prepare("SELECT id FROM bank_txns WHERE link_id = ? AND reconciliation_id IS NOT NULL").bind(id).first();
    if (rec)
      throw new HttpError(409, "This record is matched to a reconciled bank line. Undo that reconciliation first.");
    await env.DB.prepare("UPDATE objects SET deleted = 1, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(now(), user?.id || null, id).run();
    const related = [];
    if (isPosting(kind, o.type)) {
      const ctx = await makeCtx(env, settings);
      o.deleted = true;
      const { targets } = await repost(env, kind, o, ctx);
      for (const t of targets) {
        const u = await recomputeTarget(env, t);
        if (u)
          related.push(u);
      }
    }
    await env.DB.prepare("UPDATE bank_txns SET status = 'new', link_kind = NULL, link_id = NULL WHERE link_id = ? AND reconciliation_id IS NULL").bind(id).run();
    await audit(env, user, "delete", { kind, id, label: labelOf(kind, o), ip });
    return { id, related };
  }
  async function saveSettings(env, user, o, existing, ip) {
    if (!canWrite(user, "settings"))
      throw new HttpError(403, "Your role doesn't allow changing settings.");
    const isAdminUser = user && (user.role === "owner" || user.role === "admin");
    const cur = existing ? { ...existing } : {};
    o.security = cur.security || DEFAULT_SECURITY;
    o.hr = cur.hr;
    if (!canWrite(user, "account"))
      o.finance = cur.finance;
    if (o.finance?.lockDate && !isISODate(o.finance.lockDate))
      throw new HttpError(400, "Enter a valid lock date.");
    if (o.brand)
      for (const k of BRAND_IMAGES) {
        const v = o.brand[k];
        if (typeof v === "string" && v.startsWith("data:") && v.length > 3e4 && env.FILES) {
          const m = /^data:([^;,]+);base64,(.*)$/.exec(v);
          if (!m)
            continue;
          if (!/^image\/(png|jpe?g|gif|webp)$/i.test(m[1])) {
            if (/^image\/svg\+xml$/i.test(m[1]))
              continue;
            throw new HttpError(400, "Letterhead images must be PNG, JPG, GIF, WEBP or SVG.");
          }
          if (env.DEMO)
            continue;
          const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
          const key = `brand/${k}-${Date.now().toString(36)}`;
          await env.FILES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
          o.brand[k] = `${env.BASE_PATH || ""}/api/files/${key}`;
        }
      }
    if (o.numbering)
      for (const [type, n] of Object.entries(o.numbering)) {
        const before = cur.numbering?.[type]?.next;
        if (before !== void 0 && num(n.next) !== num(before)) {
          await env.DB.prepare("INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").bind("doc:" + type, Math.max(0, num(n.next) - 1)).run();
        }
      }
    await writeSettingsRaw(env, o, user);
    if (Array.isArray(o.banks))
      await ensureBankAccounts(env, user, o.banks);
    const saved = await getSettings(env);
    await audit(env, user, existing ? "update" : "create", { kind: "settings", id: "settings", label: "Settings", changes: diff(existing, saved), ip });
    return { object: settingsFor(saved, user), related: [], settings: settingsFor(saved, user) };
  }
  async function writeSettingsRaw(env, s, user) {
    const t = now();
    const data = JSON.stringify(strip({ ...s, id: "settings" }));
    if (data.length > 18e5)
      throw new HttpError(413, "Settings are too large. Use smaller images for the logo, letterhead, signature or stamp.");
    await env.DB.prepare("INSERT INTO objects (id, kind, data, version, deleted, created_at, created_by, updated_at, updated_by) VALUES ('settings','settings',?,1,0,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = objects.version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(data, t, user?.id || null, t, user?.id || null).run();
  }
  async function ensureBankAccounts(env, user, banks) {
    const accounts = await getAccounts(env);
    const have = new Set(accounts.map((a) => a.bankId).filter(Boolean));
    const codes = new Set(accounts.map((a) => a.code));
    let code = 1010;
    for (const b of banks) {
      if (have.has(b.id))
        continue;
      while (codes.has(String(code)))
        code++;
      codes.add(String(code));
      await saveObject(env, user, "account", { id: "acc_bank_" + b.id, code: String(code), name: b.label || "Bank", type: "asset", subtype: "bank", currency: b.currency || "AED", bankId: b.id, archived: false }, { system: true });
    }
  }
  async function upgradeChart(env, settings) {
    if (num(settings.finance?.chartVersion) >= CHART_VERSION)
      return false;
    const sys = { id: "system", name: "EVAM Books", role: "owner" };
    for (const a of chartUpgrades(await getAccounts(env)))
      await saveObject(env, sys, "account", a, { system: true });
    const raw = await getObj(env, "settings");
    if (raw) {
      raw.finance = { ...raw.finance || {}, chartVersion: CHART_VERSION };
      await writeSettingsRaw(env, raw, sys);
    }
    return true;
  }
  async function seedChart(env, user, settings) {
    const existing = await getAccounts(env);
    if (existing.length)
      return;
    for (const a of defaultAccounts(settings.banks || []))
      await saveObject(env, user, "account", a, { system: true });
  }
  function settingsFor(s, user) {
    if (!s || !user || user.role === "owner" || user.role === "admin" || user.id === "system")
      return s;
    const { security, ...rest } = s;
    return { ...rest, security: { require2fa: !!security?.require2fa } };
  }
  var KINDS, DOC_TYPES, FIN_NUMBERED, SKIP_DIFF, BANKISH, FINANCE_ROLE, ROLES_WITH_BANKING, BRAND_IMAGES;
  var init_objects = __esm({
    "src/objects.js"() {
      init_shim();
      init_util();
      init_auth();
      init_calc();
      init_ledger();
      init_chart();
      init_hr();
      KINDS = /* @__PURE__ */ new Set([
        "doc",
        "payment",
        "billPayment",
        "bill",
        "vendorCredit",
        "expense",
        "journal",
        "transfer",
        "bankEntry",
        "contact",
        "product",
        "account",
        "rule",
        "recurring",
        "reconciliation",
        "settings",
        "reminder",
        "employee",
        "payrun"
      ]);
      DOC_TYPES = /* @__PURE__ */ new Set(["invoice", "proforma", "quotation", "purchaseOrder", "creditNote", "deliveryNote", "letter", "resolution", "salesOrder"]);
      FIN_NUMBERED = /* @__PURE__ */ new Set(["payment", "billPayment", "expense", "journal", "transfer", "bankEntry", "vendorCredit", "payrun"]);
      SKIP_DIFF = /* @__PURE__ */ new Set(["version", "updatedAt", "savedAt", "createdAt", "updated_by", "created_by", "deleted", "kind", "id"]);
      BANKISH = (a) => a && (a.subtype === "bank" || a.subtype === "cash");
      FINANCE_ROLE = (u) => !u || ["owner", "admin", "accountant"].includes(u.role) || u.id === "system";
      ROLES_WITH_BANKING = /* @__PURE__ */ new Set(["owner", "admin", "accountant"]);
      BRAND_IMAGES = ["logo", "header", "header1", "footer", "footer1", "signature", "stamp"];
    }
  });

  // demo/engine.js
  var engine_exports = {};
  __export(engine_exports, {
    createEngine: () => createEngine
  });
  init_shim();

  // src/index.js
  init_shim();
  init_util();
  init_auth();
  init_objects();

  // src/reports.js
  init_shim();
  init_util();
  init_objects();
  init_calc();
  init_ledger();
  var r22 = (v) => round(v, 2);
  var sign = (a) => a.type === "asset" || a.type === "expense" ? 1 : -1;
  function period(q) {
    const to = q.get("to") || todayISO();
    const from = q.get("from") || to.slice(0, 4) + "-01-01";
    if (from > to)
      throw new HttpError(400, "The start date is after the end date.");
    return { from, to };
  }
  async function balancesBetween(env, from, to) {
    const sql = from ? "SELECT account_id, sum(debit) d, sum(credit) c, sum(fc_amount) fc FROM journal_lines WHERE date >= ? AND date <= ? GROUP BY account_id" : "SELECT account_id, sum(debit) d, sum(credit) c, sum(fc_amount) fc FROM journal_lines WHERE date <= ? GROUP BY account_id";
    const stmt = from ? env.DB.prepare(sql).bind(from, to) : env.DB.prepare(sql).bind(to);
    const { results } = await stmt.all();
    return new Map(results.map((r) => [r.account_id, { d: r.d || 0, c: r.c || 0, fc: r.fc || 0 }]));
  }
  var accountRow = (a, b) => ({ id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype, currency: a.currency, amount: r22(sign(a) * ((b?.d || 0) - (b?.c || 0))) });
  async function trialBalance(env, q) {
    const asOf = q.get("to") || todayISO();
    const accounts = await getAccounts(env);
    const bal = await balancesBetween(env, null, asOf);
    const rows = accounts.map((a) => {
      const b = bal.get(a.id) || { d: 0, c: 0 };
      const net = r22(b.d - b.c);
      return { id: a.id, code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    }).filter((r) => r.debit || r.credit).sort((x, y) => String(x.code).localeCompare(String(y.code)));
    const td = r22(rows.reduce((s, r) => s + r.debit, 0)), tc = r22(rows.reduce((s, r) => s + r.credit, 0));
    return { title: "Trial balance", asOf, rows, totals: { debit: td, credit: tc, balanced: td === tc } };
  }
  async function profitLoss(env, q) {
    const { from, to } = period(q);
    const accounts = await getAccounts(env);
    const bal = await balancesBetween(env, from, to);
    const rows = accounts.filter((a) => a.type === "income" || a.type === "expense").map((a) => accountRow(a, bal.get(a.id))).filter((r) => r.amount);
    const pick = (f) => rows.filter(f).sort((x, y) => String(x.code).localeCompare(String(y.code)));
    const sum = (list) => r22(list.reduce((s, r) => s + r.amount, 0));
    const income = pick((r) => r.type === "income" && r.subtype !== "other");
    const cogs = pick((r) => r.type === "expense" && r.subtype === "cogs");
    const opex = pick((r) => r.type === "expense" && (r.subtype === "operating" || !r.subtype));
    const otherIncome = pick((r) => r.type === "income" && r.subtype === "other");
    const otherExp = pick((r) => r.type === "expense" && r.subtype === "other");
    const gross = r22(sum(income) - sum(cogs));
    const operating = r22(gross - sum(opex));
    const net = r22(operating + sum(otherIncome) - sum(otherExp));
    return {
      title: "Profit and loss",
      from,
      to,
      sections: [
        { label: "Operating income", rows: income, total: sum(income) },
        { label: "Cost of goods sold", rows: cogs, total: sum(cogs) },
        { label: "Gross profit", total: gross, strong: true },
        { label: "Operating expenses", rows: opex, total: sum(opex) },
        { label: "Operating profit", total: operating, strong: true },
        { label: "Other income", rows: otherIncome, total: sum(otherIncome) },
        { label: "Other expenses", rows: otherExp, total: sum(otherExp) },
        { label: "Net profit", total: net, strong: true, final: true }
      ],
      net
    };
  }
  async function balanceSheet(env, q) {
    const asOf = q.get("to") || todayISO();
    const settings = await getSettings(env);
    const fyStart = fiscalYearStart(asOf, settings.finance.fiscalYearStart);
    const accounts = await getAccounts(env);
    const bal = await balancesBetween(env, null, asOf);
    const rows = accounts.map((a) => accountRow(a, bal.get(a.id))).filter((r) => r.amount);
    const of = (t) => rows.filter((r) => r.type === t).sort((x, y) => String(x.code).localeCompare(String(y.code)));
    const sum = (list) => r22(list.reduce((s, r) => s + r.amount, 0));
    const pl = await balancesBetween(env, null, addDays(fyStart, -1));
    const plThisYear = await balancesBetween(env, fyStart, asOf);
    const earn = (m) => r22(accounts.filter((a) => a.type === "income" || a.type === "expense").reduce((s, a) => {
      const b = m.get(a.id);
      return s + (b ? b.c - b.d : 0);
    }, 0));
    const prior = earn(pl), current = earn(plThisYear);
    const equity = of("equity");
    if (prior)
      equity.push({ id: "retained_calc", code: "", name: "Retained earnings (earlier years)", type: "equity", amount: prior });
    equity.push({ id: "current_calc", code: "", name: "Current year earnings", type: "equity", amount: current });
    const assets = of("asset"), liabilities = of("liability");
    const totalAssets = sum(assets), totalLE = r22(sum(liabilities) + sum(equity));
    return {
      title: "Balance sheet",
      asOf,
      sections: [
        { label: "Assets", rows: assets, total: totalAssets, strong: true },
        { label: "Liabilities", rows: liabilities, total: sum(liabilities) },
        { label: "Equity", rows: equity, total: sum(equity) },
        { label: "Liabilities and equity", total: totalLE, strong: true }
      ],
      balanced: totalAssets === totalLE
    };
  }
  function fiscalYearStart(asOf, mmdd = "01-01") {
    const y = Number(asOf.slice(0, 4));
    const start = `${y}-${mmdd}`;
    return start <= asOf ? start : `${y - 1}-${mmdd}`;
  }
  async function generalLedger(env, q) {
    const { from, to } = period(q);
    const accountId = q.get("account");
    const accounts = await getAccounts(env);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const list = accountId ? [byId.get(accountId)].filter(Boolean) : accounts;
    const opening = await balancesBetween(env, null, addDays(from, -1));
    const params = accountId ? [from, to, accountId] : [from, to];
    const { results } = await env.DB.prepare(`SELECT * FROM journal_lines WHERE date >= ? AND date <= ? ${accountId ? "AND account_id = ?" : ""} ORDER BY account_id, date, id`).bind(...params).all();
    const groups = [];
    for (const a of list.sort((x, y) => String(x.code).localeCompare(String(y.code)))) {
      const lines = results.filter((l) => l.account_id === a.id);
      const ob = opening.get(a.id);
      const open = r22((ob?.d || 0) - (ob?.c || 0));
      if (!lines.length && !open)
        continue;
      let run = open;
      const rows = lines.map((l) => {
        run = r22(run + l.debit - l.credit);
        return { date: l.date, kind: l.source_kind, id: l.source_id, number: l.source_number, contact: l.contact, memo: l.memo, debit: l.debit, credit: l.credit, fc: l.fc_amount, fcCur: l.fc_currency, balance: run };
      });
      groups.push({ account: { id: a.id, code: a.code, name: a.name, type: a.type, currency: a.currency }, opening: open, rows, closing: run, debit: r22(lines.reduce((s, l) => s + l.debit, 0)), credit: r22(lines.reduce((s, l) => s + l.credit, 0)) });
    }
    return { title: accountId && list[0] ? `Account transactions — ${list[0].name}` : "General ledger", from, to, groups };
  }
  async function journalReport(env, q) {
    const { from, to } = period(q);
    const accounts = new Map((await getAccounts(env)).map((a) => [a.id, a]));
    const { results } = await env.DB.prepare("SELECT * FROM journal_lines WHERE date >= ? AND date <= ? ORDER BY date, source_kind, source_id, id").bind(from, to).all();
    const entries = [];
    let cur = null;
    for (const l of results) {
      if (!cur || cur.id !== l.source_id) {
        cur = { id: l.source_id, kind: l.source_kind, number: l.source_number, date: l.date, lines: [] };
        entries.push(cur);
      }
      const a = accounts.get(l.account_id);
      cur.lines.push({ account: a ? `${a.code} ${a.name}` : l.account_id, debit: l.debit, credit: l.credit, contact: l.contact, memo: l.memo });
    }
    return { title: "Journal", from, to, entries };
  }
  async function cashFlow(env, q) {
    const { from, to } = period(q);
    const accounts = await getAccounts(env);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const cashIds = new Set(accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash").map((a) => a.id));
    const { results } = await env.DB.prepare("SELECT * FROM journal_lines WHERE date >= ? AND date <= ? ORDER BY source_id").bind(from, to).all();
    const bySource = /* @__PURE__ */ new Map();
    for (const l of results) {
      if (!bySource.has(l.source_id))
        bySource.set(l.source_id, []);
      bySource.get(l.source_id).push(l);
    }
    const buckets = {
      operating: { label: "Operating activities", rows: /* @__PURE__ */ new Map() },
      investing: { label: "Investing activities", rows: /* @__PURE__ */ new Map() },
      financing: { label: "Financing activities", rows: /* @__PURE__ */ new Map() }
    };
    const add = (b, label, v) => buckets[b].rows.set(label, r22((buckets[b].rows.get(label) || 0) + v));
    for (const lines of bySource.values()) {
      const cash = r22(lines.filter((l) => cashIds.has(l.account_id)).reduce((s, l) => s + l.debit - l.credit, 0));
      if (!cash)
        continue;
      const others = lines.filter((l) => !cashIds.has(l.account_id));
      if (!others.length)
        continue;
      const main = others.reduce((m, l) => Math.abs(l.debit - l.credit) > Math.abs(m.debit - m.credit) ? l : m, others[0]);
      const a = byId.get(main.account_id) || {};
      const kind = lines[0].source_kind;
      let bucket = "operating", label;
      if (a.subtype === "fixed") {
        bucket = "investing";
        label = cash > 0 ? "Sale of assets" : "Purchase of assets";
      } else if (a.type === "equity" || a.subtype === "longterm" || a.role === "director") {
        bucket = "financing";
        label = a.name;
      } else if (kind === "payment" || a.role === "ar" || a.role === "cust_adv")
        label = "Receipts from customers";
      else if (kind === "billPayment" || a.role === "ap" || a.role === "vendor_adv")
        label = "Payments to suppliers";
      else if (a.role === "vat_out" || a.role === "vat_in" || a.role === "vat_settle")
        label = "VAT paid / refunded";
      else if (a.type === "income")
        label = "Other receipts";
      else if (a.type === "expense")
        label = "Operating expenses paid";
      else
        label = a.name || "Other";
      add(bucket, label, cash);
    }
    const open = await balancesBetween(env, null, addDays(from, -1));
    const close = await balancesBetween(env, null, to);
    const sumCash = (m) => r22([...cashIds].reduce((s, id) => {
      const b = m.get(id);
      return s + (b ? b.d - b.c : 0);
    }, 0));
    const sections = Object.values(buckets).map((b) => {
      const rows = [...b.rows].map(([name, amount]) => ({ name, amount }));
      return { label: b.label, rows, total: r22(rows.reduce((s, r) => s + r.amount, 0)) };
    });
    const net = r22(sections.reduce((s, x) => s + x.total, 0));
    return { title: "Cash flow", from, to, opening: sumCash(open), sections, net, closing: sumCash(close) };
  }
  function bucketOf(days) {
    if (days <= 0)
      return "current";
    if (days <= 30)
      return "d1_30";
    if (days <= 60)
      return "d31_60";
    if (days <= 90)
      return "d61_90";
    return "d90";
  }
  var BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90"];
  async function openItems(env, kind, settings, asOf = null) {
    asOf = asOf || todayISO();
    const accounts = await getAccounts(env);
    const ctl = accounts.find((a) => a.role === (kind === "ar" ? "ar" : "ap"));
    const sgn = kind === "ar" ? 1 : -1;
    const { results } = await env.DB.prepare("SELECT link_id, sum(debit - credit) base, sum(fc_amount) fc, max(fc_currency) cur FROM journal_lines WHERE account_id = ? AND date <= ? AND link_id IS NOT NULL GROUP BY link_id").bind(ctl.id, asOf).all();
    const open = results.filter((r) => sgn * r.base > 4e-3);
    if (!open.length)
      return [];
    const rows = [];
    for (let i = 0; i < open.length; i += 50) {
      const chunk = open.slice(i, i + 50);
      const got = await env.DB.prepare(`SELECT * FROM objects WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk.map((r) => r.link_id)).all();
      rows.push(...got.results);
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return open.map((r) => {
      const row = byId.get(r.link_id);
      if (!row)
        return null;
      const o = rowToObj(row);
      const cur = o.currency || "AED";
      const balance2 = cur === "AED" ? r22(sgn * r.base) : round(sgn * (r.fc || 0), 3);
      return { id: o.id, number: o.number, contact: row.contact || "", date: o.date, due: row.due || o.date, currency: cur, total: row.total, balance: balance2, balanceBase: r22(sgn * r.base), status: o.status };
    }).filter((x) => x && x.balance > 1e-4);
  }
  async function unlinkedItems(env, kind, asOf) {
    const accounts = await getAccounts(env);
    const ctl = accounts.find((a) => a.role === (kind === "ar" ? "ar" : "ap"));
    const sgn = kind === "ar" ? 1 : -1;
    const { results } = await env.DB.prepare("SELECT max(contact) contact, sum(debit - credit) base, max(date) last FROM journal_lines WHERE account_id = ? AND date <= ? AND link_id IS NULL GROUP BY lower(trim(ifnull(contact,'')))").bind(ctl.id, asOf).all();
    return results.filter((r) => Math.abs(r.base) > 4e-3).map((r) => {
      const v = r22(sgn * r.base);
      return { id: null, number: v < 0 ? "Credit not applied to an invoice" : "Not tied to an invoice", contact: r.contact || "", date: r.last, due: asOf, currency: "AED", total: null, balance: v, balanceBase: v, unlinked: true };
    });
  }
  async function ageing(env, q, kind) {
    const asOf = q.get("to") || todayISO();
    const settings = await getSettings(env);
    const items = [...await openItems(env, kind, settings, asOf), ...await unlinkedItems(env, kind, asOf)];
    const byContact = /* @__PURE__ */ new Map();
    const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    totals.total = 0;
    for (const it of items) {
      const days = daysBetween(it.due, asOf);
      it.daysOverdue = Math.max(0, days);
      it.bucket = bucketOf(days);
      const c = byContact.get(it.contact) || { contact: it.contact, ...Object.fromEntries(BUCKETS.map((b) => [b, 0])), total: 0, items: [] };
      c[it.bucket] = r22(c[it.bucket] + it.balanceBase);
      c.total = r22(c.total + it.balanceBase);
      c.items.push(it);
      byContact.set(it.contact, c);
      totals[it.bucket] = r22(totals[it.bucket] + it.balanceBase);
      totals.total = r22(totals.total + it.balanceBase);
    }
    const rows = [...byContact.values()].sort((a, b) => b.total - a.total);
    rows.forEach((r) => r.items.sort((a, b) => a.due.localeCompare(b.due)));
    const advRole = kind === "ar" ? "cust_adv" : "vendor_adv";
    const acc = (await getAccounts(env)).find((a) => a.role === advRole);
    let advances = [];
    if (acc) {
      const { results } = await env.DB.prepare("SELECT contact, sum(debit) d, sum(credit) c FROM journal_lines WHERE account_id = ? AND date <= ? GROUP BY contact").bind(acc.id, asOf).all();
      advances = results.map((r) => ({ contact: r.contact || "", amount: r22(kind === "ar" ? r.c - r.d : r.d - r.c) })).filter((r) => r.amount > 4e-3);
    }
    return { title: kind === "ar" ? "Receivables ageing" : "Payables ageing", asOf, buckets: BUCKETS, rows, totals, advances, note: "Amounts in AED at each document's exchange rate, as they stood on the date shown." };
  }
  async function customerStatement(env, q) {
    const contact = (q.get("contact") || "").trim();
    if (!contact)
      throw new HttpError(400, "Choose a customer.");
    const { from, to } = period(q);
    const settings = await getSettings(env);
    const accounts = await getAccounts(env);
    const ar = accounts.find((a) => a.role === "ar"), adv = accounts.find((a) => a.role === "cust_adv");
    const { results } = await env.DB.prepare("SELECT * FROM journal_lines WHERE account_id IN (?, ?) AND lower(trim(contact)) = lower(?) AND date <= ? ORDER BY date, id").bind(ar.id, adv.id, contact, to).all();
    const crow = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'contact' AND deleted = 0 AND lower(trim(contact)) = lower(?) LIMIT 1").bind(contact).first();
    let c = crow ? rowToObj(crow) : null;
    if (!c) {
      const drow = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'doc' AND deleted = 0 AND lower(trim(contact)) = lower(?) ORDER BY date DESC LIMIT 1").bind(contact).first();
      if (drow)
        c = rowToObj(drow).party || null;
    }
    const customer = { name: c?.name || contact, address: c?.address || "", email: c?.email || "", phone: c?.phone || "", trn: c?.trn || "" };
    const ids = [...new Set(results.map((l) => l.source_id))];
    const src = /* @__PURE__ */ new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const got = await env.DB.prepare(`SELECT * FROM objects WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
      got.results.forEach((r) => src.set(r.id, rowToObj(r)));
    }
    const byCur = /* @__PURE__ */ new Map();
    for (const l of results) {
      const cur = l.fc_currency || "AED";
      const amt = l.fc_currency ? round(l.fc_amount, 3) : r22(l.debit - l.credit);
      if (!byCur.has(cur))
        byCur.set(cur, { currency: cur, opening: 0, lines: [] });
      const g = byCur.get(cur);
      if (l.date < from)
        g.opening = round(g.opening + amt, 3);
      else
        g.lines.push({ date: l.date, kind: l.source_kind, id: l.source_id, number: l.source_number, memo: l.memo, amount: r22(amt) });
    }
    const labelOf2 = (l, o) => {
      if (l.kind === "doc")
        return o?.type === "creditNote" || l.amount < 0 ? "Credit note" : "Invoice";
      if (l.kind === "payment")
        return l.amount > 0 ? "Refund / payment reversed" : "Payment received";
      if (l.kind === "journal")
        return "Adjustment";
      if (l.kind === "bankEntry")
        return "Bank entry";
      return l.kind;
    };
    const open = [...await openItems(env, "ar", settings, to), ...await unlinkedItems(env, "ar", to)].filter((i) => i.contact.trim().toLowerCase() === contact.toLowerCase());
    const groups = [...byCur.values()].map((g) => {
      const merged = [];
      for (const l of g.lines) {
        const last = merged[merged.length - 1];
        if (last && last.id === l.id && last.date === l.date)
          last.amount = round(last.amount + l.amount, 3);
        else
          merged.push({ ...l });
      }
      let run = round(g.opening, 3);
      const rows = merged.filter((l) => l.amount).map((l) => {
        run = round(run + l.amount, 3);
        const o = src.get(l.id);
        return { ...l, label: labelOf2(l, o), due: l.kind === "doc" && l.amount > 0 ? o?.due || null : null, reference: o?.reference || o?.poNumber || "", debit: l.amount > 0 ? l.amount : 0, credit: l.amount < 0 ? -l.amount : 0, balance: run };
      });
      const items = open.filter((i) => i.currency === g.currency).map((i) => {
        const days = daysBetween(i.due, to);
        return { ...i, daysOverdue: Math.max(0, days), bucket: bucketOf(days) };
      }).sort((a, b) => a.due.localeCompare(b.due));
      const ageing2 = Object.fromEntries(BUCKETS.map((b) => [b, round(items.filter((i) => i.bucket === b).reduce((s, i) => s + i.balance, 0), 3)]));
      const overdue = round(items.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.balance, 0), 3);
      return { currency: g.currency, opening: round(g.opening, 3), rows, closing: run, invoiced: round(rows.reduce((s, r) => s + r.debit, 0), 3), received: round(rows.reduce((s, r) => s + r.credit, 0), 3), openItems: items, ageing: ageing2, overdue };
    }).filter((g) => g.rows.length || Math.abs(g.opening) > 5e-4 || g.openItems.length);
    return { title: `Statement of account — ${customer.name}`, contact: customer.name, customer, from, to, groups, buckets: BUCKETS };
  }
  async function salesByCustomer(env, q) {
    const { from, to } = period(q);
    const accounts = await getAccounts(env);
    const inc = accounts.filter((a) => a.type === "income" && a.subtype !== "other").map((a) => a.id);
    if (!inc.length)
      return { title: "Sales by customer", from, to, rows: [] };
    const { results } = await env.DB.prepare(`SELECT contact, sum(credit) - sum(debit) amount, count(DISTINCT source_id) docs FROM journal_lines WHERE date >= ? AND date <= ? AND account_id IN (${inc.map(() => "?").join(",")}) GROUP BY lower(trim(ifnull(contact,''))) ORDER BY amount DESC`).bind(from, to, ...inc).all();
    const rows = results.map((r) => ({ contact: r.contact || "(no customer)", amount: r22(r.amount), documents: r.docs }));
    return { title: "Sales by customer", from, to, rows, total: r22(rows.reduce((s, r) => s + r.amount, 0)), note: "Net of discounts and credit notes, excluding VAT, in AED." };
  }
  async function salesByItem(env, q) {
    const { from, to } = period(q);
    const settings = await getSettings(env);
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind='doc' AND type IN ('invoice','creditNote') AND deleted=0 AND date >= ? AND date <= ? AND ifnull(status,'') NOT IN ('cancelled')").bind(from, to).all();
    const map = /* @__PURE__ */ new Map();
    for (const row of results) {
      const d = rowToObj(row);
      if (d.type === "creditNote" && d.status === "draft")
        continue;
      const sgn = d.type === "creditNote" ? -1 : 1;
      const rate = rateOf(d, settings) || 1;
      const t = computeTotals(d);
      d.items.forEach((it, i) => {
        const name = String(it.name || it.desc || "(no name)").trim().split("\n")[0].slice(0, 80);
        const e = map.get(name.toLowerCase()) || { item: name, qty: 0, amount: 0 };
        e.qty = round(e.qty + sgn * (t.lines[i]?.qty || 0), 3);
        e.amount = r22(e.amount + sgn * (t.lines[i]?.net || 0) * rate);
        map.set(name.toLowerCase(), e);
      });
    }
    const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
    return { title: "Sales by item", from, to, rows, total: r22(rows.reduce((s, r) => s + r.amount, 0)), note: "Net of discounts, excluding VAT, in AED." };
  }
  async function expensesByCategory(env, q) {
    const { from, to } = period(q);
    const accounts = await getAccounts(env);
    const bal = await balancesBetween(env, from, to);
    const rows = accounts.filter((a) => a.type === "expense").map((a) => accountRow(a, bal.get(a.id))).filter((r) => r.amount).sort((a, b) => b.amount - a.amount);
    return { title: "Expenses by category", from, to, rows, total: r22(rows.reduce((s, r) => s + r.amount, 0)), note: "Includes bills, expenses and bank charges, excluding recoverable VAT, in AED." };
  }
  async function vendorBalances(env, q) {
    const asOf = q.get("to") || todayISO();
    const accounts = await getAccounts(env);
    const ap = accounts.find((a) => a.role === "ap");
    const { results } = await env.DB.prepare("SELECT contact, sum(credit) - sum(debit) owed FROM journal_lines WHERE account_id = ? AND date <= ? GROUP BY lower(trim(ifnull(contact,''))) HAVING abs(owed) > 0.004 ORDER BY owed DESC").bind(ap.id, asOf).all();
    const rows = results.map((r) => ({ contact: r.contact || "(no vendor)", amount: r22(r.owed) }));
    return { title: "Vendor balances", asOf, rows, total: r22(rows.reduce((s, r) => s + r.amount, 0)) };
  }
  async function listReport(env, q, kind, title) {
    const { from, to } = period(q);
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = ? AND deleted = 0 AND date >= ? AND date <= ? ORDER BY date, number").bind(kind, from, to).all();
    const accounts = new Map((await getAccounts(env)).map((a) => [a.id, a]));
    const rows = results.map((r) => {
      const o = rowToObj(r);
      return { id: o.id, date: o.date, number: o.number, contact: o.contactName || o.vendorName || "", account: accounts.get(o.accountId)?.name || "", currency: o.currency || "AED", amount: r.total, reference: o.reference || "", method: o.method || "" };
    });
    return { title, from, to, rows };
  }
  async function vatReturn(env, q) {
    const { from, to } = period(q);
    const settings = await getSettings(env);
    const { results } = await env.DB.prepare("SELECT tax_code, sum(tax_base) base, sum(debit) d, sum(credit) c, count(*) n FROM journal_lines WHERE date >= ? AND date <= ? AND tax_code IS NOT NULL GROUP BY tax_code").bind(from, to).all();
    const g = Object.fromEntries(results.map((r) => [r.tax_code, r]));
    const base = (k) => r22(g[k]?.base || 0);
    const credit = (k) => r22((g[k]?.c || 0) - (g[k]?.d || 0));
    const debit = (k) => r22((g[k]?.d || 0) - (g[k]?.c || 0));
    const emirate = settings.finance.emirate || "Dubai";
    const box1 = { amount: base("out_std"), vat: credit("out_vat") };
    const box3 = { amount: base("rc_out"), vat: credit("rc_out") };
    const box4 = { amount: base("out_zero") };
    const box5 = { amount: base("out_exempt") };
    const box9 = { amount: base("in_std"), vat: debit("in_vat") };
    const box10 = { amount: base("rc_in"), vat: debit("rc_in") };
    const box8 = { amount: r22(box1.amount + box3.amount + box4.amount + box5.amount), vat: r22(box1.vat + box3.vat) };
    const box11 = { amount: r22(box9.amount + box10.amount), vat: r22(box9.vat + box10.vat) };
    const emirates = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
    return {
      title: "VAT return (VAT 201)",
      from,
      to,
      emirate,
      boxes: [
        ...emirates.map((e, i) => ({ box: "1" + "abcdefg"[i], label: `Standard rated supplies in ${e}`, amount: e === emirate ? box1.amount : 0, vat: e === emirate ? box1.vat : 0 })),
        { box: "2", label: "Tax refunds provided to tourists", amount: 0, vat: 0 },
        { box: "3", label: "Supplies subject to the reverse charge", amount: box3.amount, vat: box3.vat },
        { box: "4", label: "Zero-rated supplies", amount: box4.amount },
        { box: "5", label: "Exempt supplies", amount: box5.amount },
        { box: "6", label: "Goods imported into the UAE", amount: 0, vat: 0 },
        { box: "7", label: "Adjustments to goods imported", amount: 0, vat: 0 },
        { box: "8", label: "Totals", amount: box8.amount, vat: box8.vat, strong: true },
        { box: "9", label: "Standard rated expenses", amount: box9.amount, vat: box9.vat },
        { box: "10", label: "Supplies subject to the reverse charge", amount: box10.amount, vat: box10.vat },
        { box: "11", label: "Totals", amount: box11.amount, vat: box11.vat, strong: true },
        { box: "12", label: "Total value of due tax for the period", vat: box8.vat },
        { box: "13", label: "Total value of recoverable tax for the period", vat: box11.vat },
        { box: "14", label: "Payable tax for the period", vat: r22(box8.vat - box11.vat), strong: true }
      ],
      drafts: (await env.DB.prepare("SELECT id, number, contact, total, currency FROM objects WHERE kind='doc' AND type='invoice' AND deleted=0 AND status='draft' AND date >= ? AND date <= ?").bind(from, to).all()).results,
      note: `All supplies are reported in ${emirate} (Finance settings). Imports (boxes 6–7) and tourist refunds are not tracked yet. Check the figures with your tax agent before filing on the FTA portal.`
    };
  }
  async function vatDetail(env, q) {
    const { from, to } = period(q);
    const { results } = await env.DB.prepare("SELECT date, source_kind, source_id, source_number, contact, tax_code, tax_base, debit, credit, memo FROM journal_lines WHERE date >= ? AND date <= ? AND tax_code IS NOT NULL ORDER BY tax_code, date").bind(from, to).all();
    const LABEL = { out_std: "Standard-rated sales", out_zero: "Zero-rated sales", out_exempt: "Exempt sales", out_vat: "Output VAT", in_std: "Standard-rated purchases", in_zero: "Zero-rated purchases", in_vat: "Input VAT", rc_out: "Reverse charge VAT due", rc_in: "Reverse charge VAT recoverable" };
    const rows = results.map((r) => ({ ...r, label: LABEL[r.tax_code] || r.tax_code, amount: r22(r.debit - r.credit) }));
    return { title: "VAT detail", from, to, rows };
  }
  async function dashboard(env, q) {
    const today = todayISO();
    const settings = await getSettings(env);
    const accounts = await getAccounts(env);
    const all = await balancesBetween(env, null, today);
    const cash = accounts.filter((a) => (a.subtype === "bank" || a.subtype === "cash") && !a.archived).map((a) => {
      const b = all.get(a.id) || { d: 0, c: 0, fc: 0 };
      return { id: a.id, name: a.name, currency: a.currency, base: r22(b.d - b.c), amount: a.currency && a.currency !== "AED" ? r22(b.fc) : r22(b.d - b.c) };
    });
    const ar = [...await openItems(env, "ar", settings), ...await unlinkedItems(env, "ar", today)], ap = [...await openItems(env, "ap", settings), ...await unlinkedItems(env, "ap", today)];
    const sumBase = (l) => r22(l.reduce((s, i) => s + i.balanceBase, 0));
    const overdue = (l) => l.filter((i) => i.due < today && i.balanceBase > 0);
    const advAcc = accounts.find((a) => a.role === "cust_adv");
    const adv = /* @__PURE__ */ new Map();
    if (advAcc) {
      const { results: ar2 } = await env.DB.prepare("SELECT max(contact) contact, sum(credit - debit) amt FROM journal_lines WHERE account_id = ? AND date <= ? GROUP BY lower(trim(ifnull(contact,'')))").bind(advAcc.id, today).all();
      ar2.filter((x) => x.amt > 4e-3).forEach((x) => adv.set(String(x.contact || "").trim().toLowerCase(), r22(x.amt)));
    }
    const month = today.slice(0, 7);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const incIds = accounts.filter((a) => a.type === "income").map((a) => a.id), expIds = accounts.filter((a) => a.type === "expense").map((a) => a.id);
    const { results } = await env.DB.prepare(`SELECT substr(date,1,7) m, account_id, sum(debit) d, sum(credit) c FROM journal_lines WHERE date >= ? GROUP BY m, account_id`).bind(months[0] + "-01").all();
    const trend = months.map((m) => {
      const rows = results.filter((r) => r.m === m);
      const income = r22(rows.filter((r) => incIds.includes(r.account_id)).reduce((s, r) => s + r.c - r.d, 0));
      const expense = r22(rows.filter((r) => expIds.includes(r.account_id)).reduce((s, r) => s + r.d - r.c, 0));
      return { month: m, income, expense, profit: r22(income - expense) };
    });
    const unmatched = await env.DB.prepare("SELECT count(*) n FROM bank_txns WHERE status = 'new'").first();
    const soon = ap.filter((b) => b.due >= today && b.due <= addDays(today, 7)).sort((a, b) => a.due.localeCompare(b.due));
    const owed = /* @__PURE__ */ new Map();
    for (const i of ar) {
      const k = i.contact.trim().toLowerCase();
      const cur = owed.get(k) || { contact: i.contact, amount: 0 };
      cur.amount = r22(cur.amount + i.balanceBase);
      owed.set(k, cur);
    }
    for (const [k, v] of adv) {
      const cur = owed.get(k);
      if (cur)
        cur.amount = r22(cur.amount - v);
    }
    const topDebtors = [...owed.values()].filter((x) => x.amount > 4e-3).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return {
      today,
      cash,
      cashTotal: r22(cash.reduce((s, c) => s + c.base, 0)),
      receivables: { total: sumBase(ar), overdue: sumBase(overdue(ar)), count: ar.filter((i) => !i.unlinked).length, overdueCount: overdue(ar).length, advances: r22([...adv.values()].reduce((s2, v) => s2 + v, 0)) },
      payables: { total: sumBase(ap), overdue: sumBase(overdue(ap)), count: ap.filter((i) => !i.unlinked).length, overdueCount: overdue(ap).length, dueSoon: soon.filter((b) => !b.unlinked).slice(0, 6) },
      thisMonth: trend.find((t) => t.month === month) || { income: 0, expense: 0, profit: 0 },
      trend,
      topDebtors,
      unmatched: unmatched.n,
      expenses: (() => {
        const prev = months[months.length - 2];
        const rowsOf = (m) => results.filter((r) => r.m === m && expIds.includes(r.account_id));
        const byAcc = /* @__PURE__ */ new Map();
        for (const r of rowsOf(month))
          byAcc.set(r.account_id, r22((byAcc.get(r.account_id) || 0) + r.d - r.c));
        const top = [...byAcc].filter(([, v]) => v).map(([id, amount]) => {
          const a = accounts.find((x) => x.id === id) || {};
          return { id, name: a.name || id, code: a.code || "", amount };
        }).sort((x, y) => y.amount - x.amount);
        const total = r22(top.reduce((s, x) => s + x.amount, 0));
        const lastMonth = r22(rowsOf(prev).reduce((s, r) => s + r.d - r.c, 0));
        return { thisMonth: total, lastMonth, top: top.slice(0, 6), others: r22(total - top.slice(0, 6).reduce((s, x) => s + x.amount, 0)) };
      })()
    };
  }
  async function employeeBalances(env, q) {
    const asOf = q.get("to") || todayISO();
    const accounts = await getAccounts(env);
    const adv = accounts.find((a) => a.role === "staff_adv"), pay = accounts.find((a) => a.role === "salaries_payable");
    const ids = [adv, pay].filter(Boolean).map((a) => a.id);
    if (!ids.length)
      return { title: "Employee balances", asOf, rows: [] };
    const { results } = await env.DB.prepare(`SELECT contact, account_id, sum(debit) - sum(credit) b FROM journal_lines WHERE date <= ? AND account_id IN (${ids.map(() => "?").join(",")}) GROUP BY lower(trim(ifnull(contact,''))), account_id`).bind(asOf, ...ids).all();
    const by = /* @__PURE__ */ new Map();
    for (const r of results) {
      const k = String(r.contact || "").trim();
      const row = by.get(k.toLowerCase()) || { contact: k || "(no name)", advance: 0, unpaid: 0 };
      if (adv && r.account_id === adv.id)
        row.advance = r22(row.advance + r.b);
      if (pay && r.account_id === pay.id)
        row.unpaid = r22(row.unpaid - r.b);
      by.set(k.toLowerCase(), row);
    }
    const rows = [...by.values()].filter((r) => r.advance || r.unpaid).sort((a, b) => a.contact.localeCompare(b.contact));
    return { title: "Employee balances", asOf, rows, totals: { advance: r22(rows.reduce((s, r) => s + r.advance, 0)), unpaid: r22(rows.reduce((s, r) => s + r.unpaid, 0)) }, note: "Advances still to be recovered, and pay approved but not yet paid, in AED." };
  }
  async function payrollSummary(env, q) {
    const { from, to } = period(q);
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'payrun' AND deleted = 0 AND status != 'draft' AND date >= ? AND date <= ? ORDER BY date").bind(from, to).all();
    const by = /* @__PURE__ */ new Map();
    for (const run of results.map(rowToObj))
      for (const l of run.lines || []) {
        const k = (l.employeeId || l.name).toLowerCase();
        const row = by.get(k) || { name: l.name, designation: l.designation || "", runs: 0, basic: 0, allowances: 0, commission: 0, other: 0, gross: 0, deductions: 0, net: 0 };
        row.runs++;
        for (const e of l.earnings || []) {
          const v = Number(e.amount) || 0;
          if (e.type === "basic")
            row.basic += v;
          else if (["housing", "transport", "allowance", "overtime"].includes(e.type))
            row.allowances += v;
          else if (["commission", "bonus"].includes(e.type))
            row.commission += v;
          else
            row.other += v;
        }
        row.gross += l.gross || 0;
        row.deductions += l.totalDeductions || 0;
        row.net += l.net || 0;
        by.set(k, row);
      }
    const rows = [...by.values()].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" && k !== "runs" ? r22(v) : v])));
    const sum = (k) => r22(rows.reduce((s, r) => s + r[k], 0));
    return { title: "Payroll summary", from, to, rows, totals: { basic: sum("basic"), allowances: sum("allowances"), commission: sum("commission"), other: sum("other"), gross: sum("gross"), deductions: sum("deductions"), net: sum("net") }, note: "Approved and paid pay runs dated in the period, in AED." };
  }
  var REPORTS = {
    payroll_summary: { fn: payrollSummary },
    employee_balances: { fn: employeeBalances },
    dashboard: { fn: dashboard, perm: "dashboard" },
    profit_loss: { fn: profitLoss },
    balance_sheet: { fn: balanceSheet },
    trial_balance: { fn: trialBalance },
    general_ledger: { fn: generalLedger },
    journal: { fn: journalReport },
    cash_flow: { fn: cashFlow },
    ar_ageing: { fn: (e, q) => ageing(e, q, "ar") },
    ap_ageing: { fn: (e, q) => ageing(e, q, "ap") },
    customer_statement: { fn: customerStatement },
    vendor_balances: { fn: vendorBalances },
    sales_by_customer: { fn: salesByCustomer },
    sales_by_item: { fn: salesByItem },
    expenses_by_category: { fn: expensesByCategory },
    payments_received: { fn: (e, q) => listReport(e, q, "payment", "Payments received") },
    payments_made: { fn: (e, q) => listReport(e, q, "billPayment", "Payments made") },
    expense_list: { fn: (e, q) => listReport(e, q, "expense", "Expenses") },
    vat_return: { fn: vatReturn },
    vat_detail: { fn: vatDetail }
  };

  // src/bank.js
  init_shim();
  init_util();
  init_objects();
  init_calc();
  async function bankAccount(env, id) {
    const a = await getObj(env, id);
    if (!a || a.kind !== "account" || a.deleted || !["bank", "cash"].includes(a.subtype))
      throw new HttpError(404, "That bank account was not found.");
    return a;
  }
  async function listTxns(env, accountId, status) {
    const params = [accountId];
    let sql = "SELECT * FROM bank_txns WHERE account_id = ?";
    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }
    sql += " ORDER BY date DESC, created_at DESC LIMIT 2000";
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return results.map((t) => ({ ...t, suggestion: t.suggestion ? JSON.parse(t.suggestion) : null }));
  }
  function ruleMatches(rule, txn) {
    if (!rule || rule.deleted || rule.active === false)
      return false;
    if (rule.accountId && rule.accountId !== txn.account_id)
      return false;
    if (rule.direction === "in" && txn.amount <= 0)
      return false;
    if (rule.direction === "out" && txn.amount >= 0)
      return false;
    const amt = Math.abs(txn.amount);
    if (rule.amountMin !== void 0 && rule.amountMin !== "" && amt < num(rule.amountMin))
      return false;
    if (rule.amountMax !== void 0 && rule.amountMax !== "" && amt > num(rule.amountMax))
      return false;
    const conds = (rule.conditions || []).filter((c) => String(c.value || "").trim());
    if (!conds.length)
      return false;
    const test = (c) => {
      const field = String((c.field === "reference" ? txn.reference : txn.description) || "").toLowerCase();
      const v = String(c.value).toLowerCase().trim();
      if (c.op === "equals")
        return field.trim() === v;
      if (c.op === "starts")
        return field.trim().startsWith(v);
      return field.includes(v);
    };
    return rule.match === "any" ? conds.some(test) : conds.every(test);
  }
  async function rules(env) {
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'rule' AND deleted = 0").all();
    return results.map(rowToObj).sort((a, b) => num(a.priority) - num(b.priority));
  }
  async function applyRules(env, user, txns, ip) {
    const list = await rules(env);
    let auto = 0, suggested = 0;
    for (const t of txns) {
      const rule = list.find((r) => ruleMatches(r, t));
      if (!rule)
        continue;
      if (rule.auto) {
        try {
          await saveObject(env, user, "bankEntry", {
            date: t.date,
            bankAccountId: t.account_id,
            amount: t.amount,
            accountId: rule.targetAccount,
            vatRate: rule.vatRate || 0,
            contactName: rule.contactName || "",
            memo: rule.memo || t.description,
            bankTxnId: t.id,
            ruleId: rule.id
          }, { ip });
          await env.DB.prepare("UPDATE bank_txns SET rule_id = ? WHERE id = ?").bind(rule.id, t.id).run();
          auto++;
          continue;
        } catch (e) {
        }
      }
      await env.DB.prepare("UPDATE bank_txns SET rule_id = ?, suggestion = ? WHERE id = ?").bind(rule.id, JSON.stringify({ type: "rule", ruleId: rule.id, ruleName: rule.name, accountId: rule.targetAccount, vatRate: rule.vatRate || 0, contactName: rule.contactName || "", memo: rule.memo || "" }), t.id).run();
      suggested++;
    }
    return { auto, suggested };
  }
  async function reapplyRules(env, user, accountId, ip) {
    const { results } = await env.DB.prepare("SELECT * FROM bank_txns WHERE account_id = ? AND status = 'new'").bind(accountId).all();
    return applyRules(env, user, results, ip);
  }
  async function importTxns(env, user, accountId, rows, ip) {
    const acc = await bankAccount(env, accountId);
    if (!Array.isArray(rows) || !rows.length)
      throw new HttpError(400, "The statement has no rows.");
    if (rows.length > 5e3)
      throw new HttpError(413, "Import up to 5,000 rows at a time.");
    const dec = decimalsFor(acc.currency || "AED");
    const importId = uid("imp_");
    const seen = /* @__PURE__ */ new Map();
    const fresh = [];
    let skipped = 0, invalid = 0;
    const stmts = [];
    for (const r of rows) {
      const date = String(r.date || "").trim();
      const amount = round(num(r.amount), dec);
      if (!isISODate(date) || !amount) {
        invalid++;
        continue;
      }
      const desc = String(r.description || "").trim().slice(0, 300);
      const ref = String(r.reference || "").trim().slice(0, 120);
      const bal = r.balance === "" || r.balance === void 0 || r.balance === null ? null : round(num(r.balance), dec);
      const key = [date, amount, desc.toLowerCase(), ref.toLowerCase(), bal ?? ""].join("|");
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      const hash = await sha256(key + "|" + n);
      const id = uid("bt_");
      fresh.push({ id, account_id: accountId, date, description: desc, reference: ref, amount, balance: bal, hash });
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO bank_txns (id, account_id, date, description, reference, amount, balance, status, import_id, hash, created_at, created_by) VALUES (?,?,?,?,?,?,?, 'new', ?,?,?,?)").bind(id, accountId, date, desc, ref, amount, bal, importId, hash, now(), user.id));
    }
    for (let i = 0; i < stmts.length; i += 50)
      await env.DB.batch(stmts.slice(i, i + 50));
    const { results } = await env.DB.prepare("SELECT * FROM bank_txns WHERE import_id = ?").bind(importId).all();
    skipped = fresh.length - results.length;
    const ruleRes = await applyRules(env, user, results, ip);
    await audit(env, user, "import", { kind: "bank", id: accountId, label: `${results.length} bank lines into ${acc.name}`, changes: { added: results.length, duplicates: skipped, invalid, ...ruleRes }, ip });
    return { added: results.length, duplicates: skipped, invalid, ...ruleRes };
  }
  async function suggestions(env, txnId) {
    const t = await env.DB.prepare("SELECT * FROM bank_txns WHERE id = ?").bind(txnId).first();
    if (!t)
      throw new HttpError(404, "Bank line not found.");
    const acc = await getObj(env, t.account_id);
    const foreign = acc.currency && acc.currency !== "AED";
    const from = addDays(t.date, -45), to = addDays(t.date, 20);
    const amtExpr = foreign ? "fc_amount" : "round(debit - credit, 2)";
    const { results: lines } = await env.DB.prepare(`SELECT source_kind, source_id, source_number, date, contact, memo, sum(${amtExpr}) amt FROM journal_lines WHERE account_id = ? AND date >= ? AND date <= ? GROUP BY source_kind, source_id HAVING abs(amt - ?) < 0.005`).bind(t.account_id, from, to, t.amount).all();
    const linked = new Set((await env.DB.prepare("SELECT link_id FROM bank_txns WHERE link_id IS NOT NULL AND id != ?").bind(txnId).all()).results.map((r) => r.link_id));
    const matches = lines.filter((l) => !linked.has(l.source_id)).map((l) => ({ type: "match", kind: l.source_kind, id: l.source_id, number: l.source_number, date: l.date, contact: l.contact, memo: l.memo, amount: l.amt, days: Math.abs((Date.parse(l.date) - Date.parse(t.date)) / 864e5) })).sort((a, b) => a.days - b.days).slice(0, 8);
    const cur = acc.currency || "AED";
    const open = t.amount > 0 ? (await env.DB.prepare("SELECT id, number, contact, balance, due, currency FROM objects WHERE kind='doc' AND type='invoice' AND deleted=0 AND status != 'cancelled' AND currency = ? AND abs(balance - ?) < 0.005 LIMIT 8").bind(cur, t.amount).all()).results.map((r) => ({ type: "invoice", ...r })) : (await env.DB.prepare("SELECT id, number, contact, balance, due, currency FROM objects WHERE kind='bill' AND deleted=0 AND status != 'void' AND currency = ? AND abs(balance - ?) < 0.005 LIMIT 8").bind(cur, -t.amount).all()).results.map((r) => ({ type: "bill", ...r }));
    return { txn: { ...t, suggestion: t.suggestion ? JSON.parse(t.suggestion) : null }, matches, open };
  }
  async function matchTxn(env, user, txnId, kind, id, ip) {
    const t = await env.DB.prepare("SELECT * FROM bank_txns WHERE id = ?").bind(txnId).first();
    if (!t)
      throw new HttpError(404, "Bank line not found.");
    if (t.reconciliation_id)
      throw new HttpError(409, "This line is reconciled. Undo the reconciliation first.");
    const acc = await getObj(env, t.account_id);
    const foreign = acc.currency && acc.currency !== "AED";
    const amt = await env.DB.prepare(`SELECT sum(${foreign ? "fc_amount" : "debit - credit"}) a FROM journal_lines WHERE account_id = ? AND source_id = ?`).bind(t.account_id, id).first();
    if (amt.a === null)
      throw new HttpError(400, "That record doesn't touch this bank account.");
    if (Math.abs(amt.a - t.amount) >= 5e-3)
      throw new HttpError(400, `The amounts differ (${round(amt.a, 2)} in the books, ${t.amount} on the statement).`);
    const other = await env.DB.prepare("SELECT id FROM bank_txns WHERE link_id = ? AND id != ?").bind(id, txnId).first();
    if (other)
      throw new HttpError(409, "That record is already matched to another bank line.");
    await linkBankTxn(env, txnId, kind, id);
    await audit(env, user, "match", { kind: "bank", id: txnId, label: `${t.date} ${t.amount} ↔ ${kind} ${id}`, ip });
  }
  async function unmatchTxn(env, user, txnId, ip) {
    const t = await env.DB.prepare("SELECT * FROM bank_txns WHERE id = ?").bind(txnId).first();
    if (!t)
      throw new HttpError(404, "Bank line not found.");
    if (t.reconciliation_id)
      throw new HttpError(409, "This line is reconciled. Undo the reconciliation first.");
    if (t.link_kind === "bankEntry" && t.link_id) {
      const { deleteObject: deleteObject2 } = await Promise.resolve().then(() => (init_objects(), objects_exports));
      await deleteObject2(env, user, "bankEntry", t.link_id, { ip }).catch(() => {
      });
    }
    await env.DB.prepare("UPDATE bank_txns SET status = 'new', link_kind = NULL, link_id = NULL WHERE id = ?").bind(txnId).run();
    await audit(env, user, "unmatch", { kind: "bank", id: txnId, label: `${t.date} ${t.amount}`, ip });
  }
  async function setExcluded(env, user, txnId, excluded, ip) {
    const t = await env.DB.prepare("SELECT * FROM bank_txns WHERE id = ?").bind(txnId).first();
    if (!t)
      throw new HttpError(404, "Bank line not found.");
    if (t.reconciliation_id)
      throw new HttpError(409, "This line is reconciled.");
    if (excluded && t.status !== "new")
      throw new HttpError(409, "Undo the match first.");
    await env.DB.prepare("UPDATE bank_txns SET status = ? WHERE id = ?").bind(excluded ? "excluded" : "new", txnId).run();
    await audit(env, user, excluded ? "exclude" : "restore", { kind: "bank", id: txnId, label: `${t.date} ${t.amount} ${t.description}`, ip });
  }
  async function reconInfo(env, accountId) {
    const acc = await bankAccount(env, accountId);
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'reconciliation' AND deleted = 0 AND json_extract(data, '$.accountId') = ? ORDER BY date DESC, created_at DESC").bind(accountId).all();
    const history = results.map(rowToObj);
    const last = history[0] || null;
    const foreign = acc.currency && acc.currency !== "AED";
    const book = await env.DB.prepare(`SELECT sum(${foreign ? "fc_amount" : "debit - credit"}) b FROM journal_lines WHERE account_id = ?`).bind(accountId).first();
    const pending = await env.DB.prepare("SELECT * FROM bank_txns WHERE account_id = ? AND reconciliation_id IS NULL AND status IN ('matched','categorized') ORDER BY date").bind(accountId).all();
    const unmatched = await env.DB.prepare("SELECT count(*) n FROM bank_txns WHERE account_id = ? AND status = 'new'").bind(accountId).first();
    return { account: { id: acc.id, name: acc.name, currency: acc.currency }, last, history, bookBalance: round(book.b || 0, decimalsFor(acc.currency || "AED")), pending: pending.results, unmatched: unmatched.n };
  }
  async function reconcile(env, user, accountId, body, ip) {
    const acc = await bankAccount(env, accountId);
    const dec = decimalsFor(acc.currency || "AED");
    if (!isISODate(body.statementDate))
      throw new HttpError(400, "Enter the statement end date.");
    const info = await reconInfo(env, accountId);
    if (info.last && body.statementDate < info.last.date)
      throw new HttpError(400, `This account is already reconciled to ${info.last.date}.`);
    const opening = info.last ? num(info.last.closingBalance) : round(num(body.openingBalance), dec);
    const ids = Array.isArray(body.txnIds) ? body.txnIds : [];
    const chosen = info.pending.filter((t) => ids.includes(t.id) && t.date <= body.statementDate);
    if (chosen.length !== ids.length)
      throw new HttpError(400, "Some lines can't be reconciled: they are unmatched, already reconciled, or dated after the statement.");
    const cleared = round(opening + chosen.reduce((s, t) => s + t.amount, 0), dec);
    const closing = round(num(body.closingBalance), dec);
    if (Math.abs(cleared - closing) >= Math.pow(10, -dec) / 2)
      throw new HttpError(400, `The cleared balance is ${cleared.toFixed(dec)} but the statement says ${closing.toFixed(dec)}. Difference: ${(closing - cleared).toFixed(dec)}.`);
    const rec = await saveObject(env, user, "reconciliation", {
      date: body.statementDate,
      accountId,
      openingBalance: opening,
      closingBalance: closing,
      txnIds: ids,
      count: ids.length,
      currency: acc.currency || "AED"
    }, { ip });
    const stmts = ids.map((id) => env.DB.prepare("UPDATE bank_txns SET reconciliation_id = ? WHERE id = ?").bind(rec.object.id, id));
    for (let i = 0; i < stmts.length; i += 50)
      await env.DB.batch(stmts.slice(i, i + 50));
    await audit(env, user, "reconcile", { kind: "bank", id: accountId, label: `${acc.name} to ${body.statementDate}: ${closing}`, ip });
    return rec;
  }
  async function undoReconciliation(env, user, recId, ip) {
    const rec = await getObj(env, recId);
    if (!rec || rec.kind !== "reconciliation" || rec.deleted)
      throw new HttpError(404, "Reconciliation not found.");
    const info = await reconInfo(env, rec.accountId);
    if (info.last?.id !== recId)
      throw new HttpError(409, "Only the most recent reconciliation can be undone.");
    await env.DB.prepare("UPDATE bank_txns SET reconciliation_id = NULL WHERE reconciliation_id = ?").bind(recId).run();
    await env.DB.prepare("UPDATE objects SET deleted = 1, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(now(), user.id, recId).run();
    await audit(env, user, "unreconcile", { kind: "bank", id: rec.accountId, label: `Undo reconciliation to ${rec.date}`, ip });
  }
  async function accountBalances(env) {
    const accounts = await getAccounts(env);
    const { results } = await env.DB.prepare("SELECT account_id, sum(debit) d, sum(credit) c, sum(fc_amount) fc FROM journal_lines GROUP BY account_id").all();
    const m = new Map(results.map((r) => [r.account_id, r]));
    const unmatched = await env.DB.prepare("SELECT account_id, count(*) n, max(date) last FROM bank_txns WHERE status = 'new' GROUP BY account_id").all();
    const um = new Map(unmatched.results.map((r) => [r.account_id, r]));
    const stmtBal = await env.DB.prepare("SELECT account_id, balance, date FROM bank_txns WHERE balance IS NOT NULL AND id IN (SELECT id FROM bank_txns b2 WHERE b2.account_id = bank_txns.account_id ORDER BY date DESC, created_at DESC LIMIT 1)").all();
    const sb = new Map(stmtBal.results.map((r) => [r.account_id, r]));
    return accounts.map((a) => {
      const r = m.get(a.id) || { d: 0, c: 0, fc: 0 };
      const foreign = a.currency && a.currency !== "AED";
      return { id: a.id, base: round((r.d || 0) - (r.c || 0), 2), balance: foreign ? round(r.fc || 0, decimalsFor(a.currency)) : round((r.d || 0) - (r.c || 0), 2), unmatched: um.get(a.id)?.n || 0, statementBalance: sb.get(a.id)?.balance ?? null, statementDate: sb.get(a.id)?.date ?? null };
    });
  }

  // src/cron.js
  init_shim();
  init_util();
  init_objects();
  init_calc();
  var SYSTEM_USER = { id: "system", name: "Automatic schedule", role: "owner" };
  function advance(date, freq, every = 1) {
    every = Math.max(1, Number(every) || 1);
    if (freq === "weekly")
      return addDays(date, 7 * every);
    if (freq === "quarterly")
      return addMonths(date, 3 * every);
    if (freq === "yearly")
      return addMonths(date, 12 * every);
    return addMonths(date, every);
  }
  async function runRecurring(env, onlyId = null, user = SYSTEM_USER) {
    const today = todayISO();
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind = 'recurring' AND deleted = 0").all();
    const created = [];
    for (const row of results) {
      const rec = rowToObj(row);
      if (onlyId && rec.id !== onlyId)
        continue;
      if (!onlyId && rec.active === false)
        continue;
      const tpl = await getObj(env, rec.templateId);
      if (!tpl || tpl.deleted)
        continue;
      let guard = 0;
      while (rec.nextDate && rec.nextDate <= today && (!rec.endDate || rec.nextDate <= rec.endDate) && guard++ < 24) {
        const gap = tpl.due && tpl.date ? daysBetween(tpl.date, tpl.due) : 30;
        const doc = JSON.parse(JSON.stringify(tpl));
        for (const k of ["id", "version", "deleted", "updatedAt", "createdAt", "created_by", "updated_by", "paid", "credited", "balanceDue", "paidDate", "number", "seq", "import"])
          delete doc[k];
        Object.assign(doc, { id: uid("d"), auto: true, date: rec.nextDate, due: addDays(rec.nextDate, gap), status: rec.status === "sent" ? "sent" : "draft", recurringId: rec.id });
        doc.items = (doc.items || []).map((i) => ({ ...i, id: uid("i") }));
        const res = await saveObject(env, user, "doc", doc, { system: true });
        created.push(res.object);
        rec.lastRun = rec.nextDate;
        rec.count = (rec.count || 0) + 1;
        rec.nextDate = advance(rec.nextDate, rec.frequency, rec.every);
        if (onlyId)
          break;
      }
      if (rec.endDate && rec.nextDate > rec.endDate)
        rec.active = false;
      await saveObject(env, user, "recurring", rec, { system: true });
    }
    return created;
  }
  function fill(tpl, vars) {
    return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }
  var money = (v, cur) => `${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  async function reminderFor(env, inv, settings) {
    const today = todayISO();
    const days = daysBetween(inv.due || inv.date, today);
    const when = days < 0 ? `due on ${inv.due}` : days === 0 ? "due today" : `${days} day${days === 1 ? "" : "s"} overdue`;
    const vars = { number: inv.number, date: inv.date, due: inv.due, currency: inv.currency || "AED", balance: money(inv.balanceDue ?? computeTotals(inv).total), total: money(computeTotals(inv).total), customer: inv.party?.attn || inv.party?.name || "", company: settings.company?.name || "", when };
    const r = settings.finance.reminders;
    return { to: String(inv.party?.email || "").trim(), subject: fill(r.subject, vars), body: fill(r.body, vars), days };
  }
  async function sendMail(env, to, subject, text) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM)
      return { status: "queued", detail: "Email sending is not set up (RESEND_API_KEY / MAIL_FROM)." };
    if (!to)
      return { status: "queued", detail: "The customer has no email address." };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "authorization": `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text })
    });
    if (res.ok)
      return { status: "sent" };
    return { status: "failed", detail: `Email service answered ${res.status}` };
  }
  async function sendReminder(env, user, invId, stage = "manual") {
    const settings = await getSettings(env);
    const inv = await getObj(env, invId);
    if (!inv || inv.deleted || inv.type !== "invoice")
      throw new Error("Invoice not found");
    const m = await reminderFor(env, inv, settings);
    const result = await sendMail(env, m.to, m.subject, m.body);
    const log = await saveObject(env, user, "reminder", { date: todayISO(), docId: inv.id, number: inv.number, contactName: inv.party?.name || "", to: m.to, subject: m.subject, body: m.body, stage, status: result.status, detail: result.detail || "" }, { system: true });
    return log.object;
  }
  async function runReminders(env) {
    const settings = await getSettings(env);
    const r = settings.finance.reminders;
    if (!r?.enabled)
      return [];
    const today = todayISO();
    const stages = (r.schedule || []).map(Number);
    const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind='doc' AND type='invoice' AND deleted=0 AND status NOT IN ('cancelled','paid','draft') AND balance > 0.004").all();
    const sentLog = await env.DB.prepare("SELECT json_extract(data,'$.docId') doc, json_extract(data,'$.stage') stage FROM objects WHERE kind='reminder' AND deleted=0").all();
    const done = new Set(sentLog.results.map((x) => `${x.doc}|${x.stage}`));
    const out = [];
    for (const row of results) {
      const inv = rowToObj(row);
      const days = daysBetween(inv.due || inv.date, today);
      const stage = stages.filter((s) => days >= s).sort((a, b) => b - a)[0];
      if (stage === void 0 || done.has(`${inv.id}|${stage}`))
        continue;
      if (days - stage > 3) {
        done.add(`${inv.id}|${stage}`);
        continue;
      }
      out.push(await sendReminder(env, SYSTEM_USER, inv.id, stage));
    }
    return out;
  }
  async function cleanup(env) {
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()).run();
  }

  // src/index.js
  init_chart();
  init_calc();
  init_hr();
  var src_default = {
    async fetch(req, env, ctx) {
      const url = new URL(req.url);
      const base = env.BASE_PATH || "";
      const apiPrefix = base + "/api/";
      if (!url.pathname.startsWith(apiPrefix)) {
        if (url.pathname === base)
          return Response.redirect(url.origin + base + "/", 301);
        return env.ASSETS.fetch(req);
      }
      const path = url.pathname.slice(apiPrefix.length).replace(/\/+$/, "");
      try {
        checkOrigin(req);
        const res = await route(req, env, url, path);
        return res instanceof Response ? res : json(res ?? { ok: true });
      } catch (e) {
        if (e instanceof HttpError)
          return json({ error: e.message, ...e.extra }, e.status);
        console.error(e && e.stack || e);
        return json({ error: "Something went wrong on the server. Please try again." }, 500);
      }
    },
    async scheduled(event, env, ctx) {
      ctx.waitUntil((async () => {
        try {
          await runRecurring(env);
        } catch (e) {
          console.error("recurring", e);
        }
        try {
          await runReminders(env);
        } catch (e) {
          console.error("reminders", e);
        }
        try {
          await cleanup(env);
        } catch (e) {
          console.error("cleanup", e);
        }
      })());
    }
  };
  var usersCount = async (env) => (await env.DB.prepare("SELECT count(*) n FROM users").first()).n;
  async function requireUser(req, env, { allowMustChange = false } = {}) {
    const s = await getSession(env, req);
    if (!s || s.stage !== "full")
      throw new HttpError(401, "Please sign in.");
    const settings = await getSettings(env);
    await checkIp(env, req, settings);
    if (s.user.mustChange && !allowMustChange)
      throw new HttpError(403, "Choose a new password first.", { mustChange: true });
    if (settings.security.require2fa && !s.user.mfa && !allowMustChange)
      throw new HttpError(403, "Your organisation requires two-step sign-in. Set it up to continue.", { need2fa: true });
    return { ...s, settings };
  }
  function ok(extra = {}) {
    return { ok: true, ...extra };
  }
  async function route(req, env, url, path) {
    const m = req.method;
    const ip = clientIP(req);
    const seg = path.split("/");
    const q = url.searchParams;
    if (path === "status" && m === "GET") {
      const n = await usersCount(env);
      const s = await getSession(env, req);
      return { app: env.APP_NAME || "EVAM Books", setupNeeded: n === 0, signedIn: !!(s && s.stage === "full"), mfaPending: !!(s && s.stage === "mfa"), time: now() };
    }
    if (path === "setup" && m === "POST") {
      if (await usersCount(env))
        throw new HttpError(409, "This organisation is already set up. Sign in instead.");
      const b = await readJSON(req);
      if (!env.SETUP_CODE)
        throw new HttpError(503, "The server has no SETUP_CODE yet. Set it with: npx wrangler secret put SETUP_CODE");
      if (String(b.code || "").trim() !== String(env.SETUP_CODE).trim())
        throw new HttpError(403, "That setup code is not right.");
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        throw new HttpError(400, "Enter a valid email address.");
      if (!String(b.name || "").trim())
        throw new HttpError(400, "Enter your name.");
      const prob = passwordProblem(b.password, email);
      if (prob)
        throw new HttpError(400, prob);
      const id = uid("u_");
      const t = now();
      await env.DB.prepare("INSERT INTO users (id, email, name, role, pass_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").bind(id, email, String(b.name).trim(), "owner", await hashPassword(b.password), t, t).run();
      const user2 = { id, name: String(b.name).trim(), role: "owner" };
      const settings = b.settings && typeof b.settings === "object" ? b.settings : {};
      settings.finance = { ...JSON.parse(JSON.stringify(DEFAULT_FINANCE)), ...settings.finance || {}, chartVersion: CHART_VERSION };
      settings.security = { ...DEFAULT_SECURITY };
      await writeSettingsRaw(env, settings, user2);
      await seedChart(env, user2, settings);
      await audit(env, user2, "setup", { label: `Organisation created by ${email}`, ip });
      const sess = await createSession(env, req, id);
      return json(ok({ user: publicUser({ id, email, name: user2.name, role: "owner", created_at: t }) }), 200, { "set-cookie": sessionCookie(env, sess.token, sess.maxAge) });
    }
    if (path === "login" && m === "POST") {
      const b = await readJSON(req);
      const email = String(b.email || "").trim().toLowerCase();
      const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      const settings = await getSettings(env);
      await checkIp(env, req, settings);
      const fail = async (msg = "The email or password is not right.") => {
        if (u) {
          const failed = (u.failed || 0) + 1;
          await env.DB.prepare("UPDATE users SET failed = ?, locked_until = ? WHERE id = ?").bind(failed, failed >= 8 ? now() + 15 * 6e4 : u.locked_until, u.id).run();
        }
        await audit(env, u ? { id: u.id, name: u.name } : null, "login_failed", { label: email, ip });
        throw new HttpError(401, msg);
      };
      if (!u) {
        await hashPassword("x".repeat(12));
        return fail();
      }
      if (u.locked_until && u.locked_until > now())
        throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
      if (!await verifyPassword(String(b.password || ""), u.pass_hash))
        return fail();
      if (u.disabled)
        return fail("This account is switched off. Ask your administrator.");
      await env.DB.prepare("UPDATE users SET failed = 0 WHERE id = ?").bind(u.id).run();
      if (u.totp_secret) {
        const sess2 = await createSession(env, req, u.id, "mfa");
        return json({ ok: true, mfa: true }, 200, { "set-cookie": sessionCookie(env, sess2.token, sess2.maxAge) });
      }
      await env.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?").bind(now(), u.id).run();
      await audit(env, u, "login", { label: email, ip });
      const sess = await createSession(env, req, u.id);
      return json({ ok: true, user: publicUser(u) }, 200, { "set-cookie": sessionCookie(env, sess.token, sess.maxAge) });
    }
    if (path === "login/2fa" && m === "POST") {
      const s = await getSession(env, req);
      if (!s || s.stage !== "mfa")
        throw new HttpError(401, "Start again: enter your email and password.");
      const b = await readJSON(req);
      const u = s.raw;
      if (u.locked_until && u.locked_until > now()) {
        await endSession(env, s.sid);
        throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
      }
      const t0 = now();
      const cnt = await env.DB.prepare(
        "UPDATE users SET mfa_failed = CASE WHEN locked_until IS NOT NULL AND locked_until < ?1 THEN 1 ELSE mfa_failed + 1 END, locked_until = CASE WHEN locked_until IS NOT NULL AND locked_until < ?1 THEN NULL ELSE locked_until END WHERE id = ?2 RETURNING mfa_failed, locked_until"
      ).bind(t0, u.id).first();
      if (cnt.locked_until && cnt.locked_until > t0 || cnt.mfa_failed > 8) {
        if (!cnt.locked_until)
          await env.DB.prepare("UPDATE users SET locked_until = ? WHERE id = ?").bind(t0 + 15 * 6e4, u.id).run();
        await endSession(env, s.sid);
        throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
      }
      const step = await verifyTotp(u.totp_secret, b.code, Date.now(), u.totp_last);
      let good = step !== false;
      if (good)
        await env.DB.prepare("UPDATE users SET totp_last = ? WHERE id = ?").bind(step, u.id).run();
      if (!good && b.code) {
        const codes = JSON.parse(u.backup_codes || "[]");
        const h = await sha256(String(b.code).replace(/[\s-]/g, "").toUpperCase());
        if (codes.includes(h)) {
          good = true;
          await env.DB.prepare("UPDATE users SET backup_codes = ? WHERE id = ?").bind(JSON.stringify(codes.filter((c) => c !== h)), u.id).run();
        }
      }
      if (!good) {
        const failed = cnt.mfa_failed;
        await audit(env, u, "login_failed", { label: "wrong 2FA code", ip });
        if (failed >= 8) {
          await env.DB.prepare("UPDATE users SET locked_until = ? WHERE id = ?").bind(now() + 15 * 6e4, u.id).run();
          await endSession(env, s.sid);
          throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
        }
        throw new HttpError(401, "That code is not right. Use the current 6-digit code from your authenticator app, or a backup code.");
      }
      await endSession(env, s.sid);
      await env.DB.prepare("UPDATE users SET failed = 0, mfa_failed = 0, locked_until = NULL, last_login = ? WHERE id = ?").bind(now(), u.id).run();
      await audit(env, u, "login", { label: u.email + " (2FA)", ip });
      const sess = await createSession(env, req, u.id);
      return json({ ok: true, user: publicUser(u) }, 200, { "set-cookie": sessionCookie(env, sess.token, sess.maxAge) });
    }
    if (path === "logout" && m === "POST") {
      const s = await getSession(env, req);
      if (s) {
        await endSession(env, s.sid);
        await audit(env, s.user, "logout", { ip });
      }
      return json(ok(), 200, { "set-cookie": sessionCookie(env, "", 0) });
    }
    if (path === "me" && m === "GET") {
      const s = await getSession(env, req);
      if (!s || s.stage !== "full")
        throw new HttpError(401, "Please sign in.");
      const settings = await getSettings(env);
      return { user: s.user, role: ROLES[s.user.role], require2fa: settings.security.require2fa };
    }
    if (path === "me/password" && m === "POST") {
      const { user: user2, raw } = await requireUser(req, env, { allowMustChange: true });
      const b = await readJSON(req);
      if (!await verifyPassword(String(b.current || ""), raw.pass_hash))
        throw new HttpError(400, "Your current password is not right.");
      const prob = passwordProblem(b.next, user2.email);
      if (prob)
        throw new HttpError(400, prob);
      await env.DB.prepare("UPDATE users SET pass_hash = ?, must_change = 0, updated_at = ? WHERE id = ?").bind(await hashPassword(b.next), now(), user2.id).run();
      const cur = await getSession(env, req);
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user2.id, cur.sid).run();
      await audit(env, user2, "password_change", { ip });
      return ok();
    }
    if (path === "me/2fa/start" && m === "POST") {
      const { user: user2 } = await requireUser(req, env, { allowMustChange: true });
      const secret = newTotpSecret();
      await env.DB.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").bind(secret, user2.id).run();
      const issuer = encodeURIComponent(env.APP_NAME || "EVAM Books");
      return { secret, uri: `otpauth://totp/${issuer}:${encodeURIComponent(user2.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30` };
    }
    if (path === "me/2fa/confirm" && m === "POST") {
      const { user: user2 } = await requireUser(req, env, { allowMustChange: true });
      const b = await readJSON(req);
      const row = await env.DB.prepare("SELECT totp_pending FROM users WHERE id = ?").bind(user2.id).first();
      if (!row?.totp_pending)
        throw new HttpError(400, "Start the set-up again.");
      const step = await verifyTotp(row.totp_pending, b.code);
      if (step === false)
        throw new HttpError(400, "That code is not right. Check the time on your phone and try the newest code.");
      await env.DB.prepare("UPDATE users SET totp_last = ? WHERE id = ?").bind(step, user2.id).run();
      const codes = Array.from({ length: 8 }, () => randomToken(8).replace(/[-_]/g, "").slice(0, 10).toUpperCase());
      const hashes = await Promise.all(codes.map((c) => sha256(c)));
      await env.DB.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, backup_codes = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(hashes), now(), user2.id).run();
      await audit(env, user2, "2fa_on", { ip });
      return { ok: true, backupCodes: codes.map((c) => c.slice(0, 5) + "-" + c.slice(5)) };
    }
    if (path === "me/2fa/disable" && m === "POST") {
      const { user: user2, settings } = await requireUser(req, env, { allowMustChange: true });
      const b = await readJSON(req);
      const row = await env.DB.prepare("SELECT pass_hash, totp_secret FROM users WHERE id = ?").bind(user2.id).first();
      if (!await verifyPassword(String(b.password || ""), row.pass_hash))
        throw new HttpError(400, "Your password is not right.");
      if (settings.security.require2fa)
        throw new HttpError(409, "Your organisation requires two-step sign-in, so it can't be switched off.");
      await env.DB.prepare("UPDATE users SET totp_secret = NULL, backup_codes = NULL, updated_at = ? WHERE id = ?").bind(now(), user2.id).run();
      await audit(env, user2, "2fa_off", { ip });
      return ok();
    }
    const S = await requireUser(req, env);
    const user = S.user;
    if (seg[0] === "hr")
      return hrRoute(req, env, url, seg.slice(1), S, ip);
    {
      const g = await hrGate(env, S, path, m, seg, ip);
      if (g !== void 0)
        return g;
    }
    if (path === "bootstrap" && m === "GET") {
      if (await upgradeChart(env, S.settings))
        S.settings = await getSettings(env);
      const { results } = await env.DB.prepare("SELECT * FROM objects WHERE deleted = 0").all();
      const objects = results.map(rowToObj).filter((o) => o.kind !== "settings" && canRead(user, o.kind, o.type, o));
      return { user, role: ROLES[user.role], roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])), settings: visibleSettings(S.settings, user), objects, serverTime: now(), today: todayISO() };
    }
    if (path === "changes" && m === "GET") {
      const since = Number(q.get("since") || 0);
      const { results } = await env.DB.prepare("SELECT * FROM objects WHERE updated_at > ? ORDER BY updated_at LIMIT 2000").bind(since).all();
      const objects = results.map(rowToObj).filter((o) => canRead(user, o.kind, o.type, o));
      const settings = objects.find((o) => o.kind === "settings") ? visibleSettings(await getSettings(env), user) : null;
      return { objects: objects.filter((o) => o.kind !== "settings"), settings, serverTime: now() };
    }
    if (seg[0] === "objects" && seg.length === 3) {
      const [, kind, id] = seg;
      if (!KINDS.has(kind))
        throw new HttpError(404, "Unknown record type.");
      if (m === "GET") {
        const o = await getObj(env, decodeURIComponent(id));
        if (!o || o.deleted || o.kind !== kind || !canRead(user, o.kind, o.type, o))
          throw new HttpError(404, "Not found.");
        return { object: o.kind === "settings" ? visibleSettings(o, user) : o };
      }
      if (m === "PUT") {
        const b = await readJSON(req);
        b.id = decodeURIComponent(id);
        return saveObject(env, user, kind, b, { ip });
      }
      if (m === "DELETE")
        return deleteObject(env, user, kind, decodeURIComponent(id), { ip });
    }
    if (path === "import" && m === "POST") {
      if (!isAdmin(user))
        throw new HttpError(403, "Only the owner or an admin can upload a backup.");
      return importBackup(env, user, await readJSON(req, 6e7), ip);
    }
    if (seg[0] === "reports" && seg[1] && m === "GET") {
      const rep = REPORTS[seg[1]];
      if (!rep)
        throw new HttpError(404, "Unknown report.");
      if (seg[1] !== "dashboard" && !canReport(user, seg[1]))
        throw new HttpError(403, "Your role doesn't include this report.");
      if (seg[1] === "dashboard" && !canReport(user, "profit_loss"))
        throw new HttpError(403, "Your role doesn't include the finance dashboard.");
      return rep.fn(env, q);
    }
    if (seg[0] === "bank") {
      const bankWrite = () => {
        if (!canWrite(user, "bankEntry"))
          throw new HttpError(403, "Your role doesn't include banking.");
      };
      if (!canRead(user, "bankEntry"))
        throw new HttpError(403, "Your role doesn't include banking.");
      if (seg[1] === "balances" && m === "GET")
        return { accounts: await accountBalances(env) };
      if (seg[1] === "accounts" && seg[3] === "txns" && m === "GET")
        return { txns: await listTxns(env, seg[2], q.get("status")) };
      if (seg[1] === "accounts" && seg[3] === "import" && m === "POST") {
        bankWrite();
        const b = await readJSON(req, 1e7);
        return importTxns(env, user, seg[2], b.rows, ip);
      }
      if (seg[1] === "accounts" && seg[3] === "rules" && m === "POST") {
        bankWrite();
        return reapplyRules(env, user, seg[2], ip);
      }
      if (seg[1] === "accounts" && seg[3] === "reconcile" && m === "GET")
        return reconInfo(env, seg[2]);
      if (seg[1] === "accounts" && seg[3] === "reconcile" && m === "POST") {
        bankWrite();
        return reconcile(env, user, seg[2], await readJSON(req), ip);
      }
      if (seg[1] === "reconciliations" && seg[3] === "undo" && m === "POST") {
        bankWrite();
        await undoReconciliation(env, user, seg[2], ip);
        return ok();
      }
      if (seg[1] === "txns" && seg[3] === "suggestions" && m === "GET")
        return suggestions(env, seg[2]);
      if (seg[1] === "txns" && seg[3] === "match" && m === "POST") {
        bankWrite();
        const b = await readJSON(req);
        await matchTxn(env, user, seg[2], b.kind, b.id, ip);
        return ok();
      }
      if (seg[1] === "txns" && seg[3] === "unmatch" && m === "POST") {
        bankWrite();
        await unmatchTxn(env, user, seg[2], ip);
        return ok();
      }
      if (seg[1] === "txns" && seg[3] === "exclude" && m === "POST") {
        bankWrite();
        const b = await readJSON(req);
        await setExcluded(env, user, seg[2], b.excluded !== false, ip);
        return ok();
      }
    }
    if (seg[0] === "recurring" && seg[2] === "run" && m === "POST") {
      if (!canWrite(user, "recurring"))
        throw new HttpError(403, "Your role doesn't allow this.");
      const created = await runRecurring(env, seg[1], user);
      return { created };
    }
    if (path === "reminders/due" && m === "GET") {
      if (!canRead(user, "reminder"))
        throw new HttpError(403, "Your role doesn't allow this.");
      const settings = S.settings;
      const { results } = await env.DB.prepare("SELECT * FROM objects WHERE kind='doc' AND type='invoice' AND deleted=0 AND status NOT IN ('cancelled','paid') AND balance > 0.004 ORDER BY due").all();
      const list = [];
      for (const row of results) {
        const inv = rowToObj(row);
        const r = await reminderFor(env, inv, settings);
        list.push({ id: inv.id, number: inv.number, contact: inv.party?.name || "", due: inv.due, currency: inv.currency, balance: inv.balanceDue ?? row.balance, status: inv.status, ...r });
      }
      return { invoices: list, emailReady: !!(env.RESEND_API_KEY && env.MAIL_FROM) };
    }
    if (path === "reminders/send" && m === "POST") {
      if (!canWrite(user, "reminder"))
        throw new HttpError(403, "Your role doesn't allow this.");
      const b = await readJSON(req);
      const inv = await getObj(env, String(b.docId || ""));
      if (!inv || inv.deleted || inv.type !== "invoice")
        throw new HttpError(404, "Invoice not found.");
      return { reminder: await sendReminder(env, user, inv.id, "manual") };
    }
    if (seg[0] === "files") {
      if (!env.FILES)
        throw new HttpError(503, "File storage is not set up (R2 bucket).");
      if (m === "POST" && seg.length === 1) {
        if (user.role === "viewer")
          throw new HttpError(403, "Your role can't upload files.");
        const type = (req.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (!/^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf)$/.test(type))
          throw new HttpError(415, "Upload a PDF or a photo (PNG, JPG, WEBP, GIF or HEIC).");
        const len = Number(req.headers.get("content-length") || 0);
        if (len > 10 * 1024 * 1024)
          throw new HttpError(413, "Files can be up to 10 MB.");
        const buf = await req.arrayBuffer();
        if (buf.byteLength > 10 * 1024 * 1024)
          throw new HttpError(413, "Files can be up to 10 MB.");
        const name = String(q.get("name") || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
        const key = `files/${todayISO().slice(0, 7)}/${uid()}-${name}`;
        await env.FILES.put(key, buf, { httpMetadata: { contentType: type }, customMetadata: { name, by: user.id } });
        await audit(env, user, "upload", { kind: "file", id: key, label: name, ip });
        return { key, url: `${env.BASE_PATH || ""}/api/files/${key}`, name, size: buf.byteLength, type };
      }
      if (m === "GET") {
        const key = seg.slice(1).map(decodeURIComponent).join("/");
        const obj = await env.FILES.get(key);
        if (!obj)
          throw new HttpError(404, "File not found.");
        if (user.role === "staff" && !key.startsWith("brand/") && obj.customMetadata?.by !== user.id)
          throw new HttpError(404, "File not found.");
        const ct = obj.httpMetadata?.contentType || "application/octet-stream";
        const safe = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf)$/.test(ct);
        return new Response(obj.body, { headers: {
          "content-type": safe ? ct : "application/octet-stream",
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'; sandbox",
          "content-disposition": `${safe ? "inline" : "attachment"}; filename="${(obj.customMetadata?.name || "file").replace(/[^\w.\- ]/g, "_")}"`
        } });
      }
    }
    if (path === "users/directory" && m === "GET") {
      if (!ROLES[user.role]?.payroll)
        throw new HttpError(403, "Your role doesn't include payroll.");
      const { results } = await env.DB.prepare("SELECT id, name, email, role FROM users WHERE disabled = 0 ORDER BY name").all();
      return { users: results };
    }
    if (seg[0] === "users") {
      if (!isAdmin(user))
        throw new HttpError(403, "Only the owner or an admin can manage users.");
      if (m === "GET" && seg.length === 1) {
        const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY created_at").all();
        return { users: results.map(publicUser), roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])) };
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readJSON(req);
        const email = String(b.email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          throw new HttpError(400, "Enter a valid email address.");
        if (!ROLES[b.role] || b.role === "owner")
          throw new HttpError(400, "Choose a role.");
        if (b.role === "admin" && user.role !== "owner")
          throw new HttpError(403, "Only the owner can add admins.");
        if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first())
          throw new HttpError(409, "A user with this email already exists.");
        const temp = tempPassword();
        const id = uid("u_"), t = now();
        await env.DB.prepare("INSERT INTO users (id, email, name, role, pass_hash, must_change, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)").bind(id, email, String(b.name || email).trim(), b.role, await hashPassword(temp), t, t).run();
        await audit(env, user, "user_add", { kind: "user", id, label: `${email} as ${b.role}`, ip });
        return { user: publicUser({ id, email, name: b.name || email, role: b.role, must_change: 1, created_at: t }), tempPassword: temp };
      }
      const target = seg[1] ? await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(seg[1]).first() : null;
      if (!target)
        throw new HttpError(404, "User not found.");
      if (target.role === "owner" && user.role !== "owner")
        throw new HttpError(403, "Only the owner can change the owner's account.");
      if (target.role === "admin" && user.role !== "owner" && target.id !== user.id)
        throw new HttpError(403, "Only the owner can change another admin's account.");
      if (m === "PATCH" && seg.length === 2) {
        const b = await readJSON(req);
        const changes = {};
        if (b.role !== void 0 && b.role !== target.role) {
          if (!ROLES[b.role])
            throw new HttpError(400, "Choose a role.");
          if (target.id === user.id)
            throw new HttpError(400, "You can't change your own role.");
          if (b.role === "owner" || target.role === "owner")
            throw new HttpError(400, "To transfer ownership, contact support.");
          if (b.role === "admin" && user.role !== "owner")
            throw new HttpError(403, "Only the owner can make admins.");
          changes.role = [target.role, b.role];
          await env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(b.role, now(), target.id).run();
        }
        if (b.disabled !== void 0 && !!b.disabled !== !!target.disabled) {
          if (target.id === user.id)
            throw new HttpError(400, "You can't switch off your own account.");
          if (target.role === "owner")
            throw new HttpError(400, "The owner's account can't be switched off.");
          changes.disabled = [!!target.disabled, !!b.disabled];
          await env.DB.prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?").bind(b.disabled ? 1 : 0, now(), target.id).run();
          if (b.disabled)
            await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
        }
        if (b.name !== void 0 && String(b.name).trim() && b.name !== target.name) {
          changes.name = [target.name, String(b.name).trim()];
          await env.DB.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").bind(String(b.name).trim(), now(), target.id).run();
        }
        if (Object.keys(changes).length)
          await audit(env, user, changes.role ? "role_change" : "user_update", { kind: "user", id: target.id, label: target.email, changes, ip });
        const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(target.id).first();
        return { user: publicUser(fresh) };
      }
      if (m === "POST" && seg[2] === "reset") {
        const b = await readJSON(req).catch(() => ({}));
        const temp = tempPassword();
        await env.DB.prepare("UPDATE users SET pass_hash = ?, must_change = 1, failed = 0, locked_until = NULL, updated_at = ?" + (b.reset2fa ? ", totp_secret = NULL, backup_codes = NULL" : "") + " WHERE id = ?").bind(await hashPassword(temp), now(), target.id).run();
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
        await audit(env, user, "password_reset", { kind: "user", id: target.id, label: target.email + (b.reset2fa ? " (2FA reset)" : ""), ip });
        return { tempPassword: temp };
      }
    }
    if (path === "security" && m === "PUT") {
      if (!isAdmin(user))
        throw new HttpError(403, "Only the owner or an admin can change security settings.");
      const b = await readJSON(req);
      const settings = S.settings;
      const ipAllow = (Array.isArray(b.ipAllow) ? b.ipAllow : []).map((s) => String(s).trim()).filter(Boolean);
      for (const entry of ipAllow)
        if (!/^[\d.:a-fA-F]+(\/\d{1,3})?$/.test(entry))
          throw new HttpError(400, `"${entry}" is not an IP address or range.`);
      const { ipAllowed: ipAllowed2 } = await Promise.resolve().then(() => (init_util(), util_exports));
      if (ipAllow.length && !ipAllowed2(ip, ipAllow))
        throw new HttpError(400, `Your own address (${ip}) is not in the list. Add it first so you don't lock yourself out.`);
      if (b.require2fa && !user.mfa)
        throw new HttpError(400, "Turn on two-step sign-in for your own account first.");
      const before = { ...settings.security };
      settings.security = { require2fa: !!b.require2fa, ipAllow };
      await writeSettingsRaw(env, settings, user);
      await audit(env, user, "security", { kind: "settings", id: "settings", label: "Security settings", changes: { before, after: settings.security }, ip });
      return { security: settings.security, yourIp: ip };
    }
    if (path === "security" && m === "GET") {
      if (!isAdmin(user))
        throw new HttpError(403, "Only the owner or an admin can see security settings.");
      return { security: S.settings.security, yourIp: ip };
    }
    if (path === "audit" && m === "GET") {
      if (!canAudit(user))
        throw new HttpError(403, "Your role doesn't include the audit trail.");
      const params = [], where = [];
      if (q.get("object")) {
        where.push("object_id = ?");
        params.push(q.get("object"));
      }
      if (q.get("user")) {
        where.push("user_id = ?");
        params.push(q.get("user"));
      }
      if (q.get("action")) {
        where.push("action = ?");
        params.push(q.get("action"));
      }
      if (q.get("before")) {
        where.push("id < ?");
        params.push(Number(q.get("before")));
      }
      if (q.get("from")) {
        where.push("at >= ?");
        params.push(Date.parse(q.get("from") + "T00:00:00+04:00"));
      }
      if (q.get("to")) {
        where.push("at <= ?");
        params.push(Date.parse(q.get("to") + "T23:59:59+04:00"));
      }
      const limit = Math.max(1, Math.min(500, parseInt(q.get("limit"), 10) || 200));
      const { results } = await env.DB.prepare(`SELECT * FROM audit ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${limit}`).bind(...params).all();
      return { entries: results.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null })) };
    }
    throw new HttpError(404, "Unknown request.");
  }
  function tempPassword() {
    return randomToken(9).replace(/[-_]/g, "x").slice(0, 12);
  }
  async function importBackup(env, user, b, ip) {
    if (!b || typeof b !== "object")
      throw new HttpError(400, "That is not a backup.");
    const settings = await getSettings(env);
    if (b.settings && b.replaceSettings) {
      for (const k of ["company", "brand", "banks", "numbering", "defaults"])
        if (b.settings[k] !== void 0)
          settings[k] = b.settings[k];
      await saveObject(env, user, "settings", settings, { ip });
    } else if (b.settings?.numbering) {
      for (const [t, n] of Object.entries(b.settings.numbering))
        if (settings.numbering?.[t])
          settings.numbering[t].next = Math.max(num(settings.numbering[t].next), num(n.next));
      await saveObject(env, user, "settings", settings, { ip });
    }
    if (Array.isArray(settings.banks))
      await ensureBankAccounts(env, user, settings.banks);
    const report = { contacts: 0, products: 0, docs: 0, payments: 0, skipped: [] };
    if (!Array.isArray(b.docs || []) || !Array.isArray(b.contacts || []) || !Array.isArray(b.products || []))
      throw new HttpError(400, "That is not a backup.");
    for (const c of b.contacts || []) {
      if (!c || typeof c !== "object")
        continue;
      c.id = c.id || uid("c");
      if (await getObj(env, c.id))
        continue;
      try {
        await saveObject(env, user, "contact", c, { ip });
        report.contacts++;
      } catch (e) {
        report.skipped.push(`Contact ${c.name}: ${e.message}`);
      }
    }
    for (const p of b.products || []) {
      if (!p || typeof p !== "object")
        continue;
      p.id = p.id || uid("p");
      if (await getObj(env, p.id))
        continue;
      try {
        await saveObject(env, user, "product", p, { ip });
        report.products++;
      } catch (e) {
        report.skipped.push(`Product ${p.name}: ${e.message}`);
      }
    }
    const order = (d) => d.type === "creditNote" ? 1 : 0;
    const docs = [...b.docs || []].sort((a, c) => order(a) - order(c));
    const fresh = await getSettings(env);
    const { getAccounts: getAccounts2 } = await Promise.resolve().then(() => (init_objects(), objects_exports));
    const accounts = await getAccounts2(env);
    for (const d of docs) {
      if (!d || typeof d !== "object")
        continue;
      d.id = d.id || uid("d");
      if (await getObj(env, d.id))
        continue;
      const paid = num(d.paid), paidAt = d.paidAt;
      const doc = { ...d, auto: false };
      for (const k of ["paid", "paidAt", "credited", "balanceDue", "version"])
        delete doc[k];
      if (doc.type === "invoice" && ["paid", "partial"].includes(doc.status))
        doc.status = "sent";
      try {
        const res = await saveObject(env, user, "doc", doc, { ip });
        report.docs++;
        if (d.type === "invoice" && paid > 0 && d.status !== "cancelled") {
          const total = computeTotals(d).total;
          const amount = round(Math.min(paid, total), 2);
          const bankAcc = accounts.find((a) => a.bankId && a.bankId === d.bankId && a.currency === (d.currency || "AED")) || accounts.find((a) => a.subtype === "bank" && a.currency === (d.currency || "AED")) || accounts.find((a) => a.subtype === "bank" && a.currency === "AED") || accounts.find((a) => a.role === "cash");
          const date = paidAt ? new Date(paidAt).toISOString().slice(0, 10) : d.date;
          await saveObject(env, user, "payment", {
            date: date < d.date ? d.date : date,
            contactName: d.party?.name || "Customer",
            currency: d.currency || "AED",
            rate: d.fx?.rate || "",
            amount,
            accountId: bankAcc.id,
            method: "Bank transfer",
            reference: "Recorded before EVAM Books",
            allocations: [{ docId: res.object.id, amount }],
            migrated: true
          }, { ip });
          report.payments++;
        }
      } catch (e) {
        report.skipped.push(`${d.number || d.type}: ${e.message}`);
      }
    }
    await audit(env, user, "import", { label: `Backup: ${report.docs} documents, ${report.payments} payments, ${report.contacts} contacts, ${report.products} products`, changes: { skipped: report.skipped.slice(0, 50) }, ip });
    return report;
  }
  function visibleSettings(settings, user) {
    if (isAdmin(user))
      return settings;
    const { security, ...rest } = settings;
    return { ...rest, security: { require2fa: !!security?.require2fa } };
  }

  // demo/engine.js
  init_shim();
  init_auth();

  // migrations/0001_init.sql
  var init_default = "-- EVAM Books schema v1\n\nCREATE TABLE users (\n  id TEXT PRIMARY KEY,\n  email TEXT NOT NULL UNIQUE COLLATE NOCASE,\n  name TEXT NOT NULL,\n  role TEXT NOT NULL,                    -- owner | admin | accountant | sales | purchases | staff | viewer\n  pass_hash TEXT NOT NULL,               -- pbkdf2$iterations$salt$hash\n  must_change INTEGER NOT NULL DEFAULT 0,\n  totp_secret TEXT,                      -- base32, set once 2FA is confirmed\n  totp_pending TEXT,\n  backup_codes TEXT,                     -- JSON array of hashes\n  disabled INTEGER NOT NULL DEFAULT 0,\n  failed INTEGER NOT NULL DEFAULT 0,\n  locked_until INTEGER,\n  last_login INTEGER,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n);\n\nCREATE TABLE sessions (\n  id TEXT PRIMARY KEY,                   -- sha-256 of the cookie token\n  user_id TEXT NOT NULL,\n  stage TEXT NOT NULL DEFAULT 'full',    -- 'mfa' while waiting for the second factor\n  ip TEXT,\n  agent TEXT,\n  created_at INTEGER NOT NULL,\n  last_seen INTEGER NOT NULL,\n  expires_at INTEGER NOT NULL\n);\nCREATE INDEX sessions_user ON sessions(user_id);\n\n-- Every business record: documents, payments, bills, expenses, journals, contacts, products, settings, accounts, rules…\nCREATE TABLE objects (\n  id TEXT PRIMARY KEY,\n  kind TEXT NOT NULL,                    -- doc | payment | billPayment | bill | vendorCredit | expense | journal | transfer | bankEntry | contact | product | account | rule | recurring | reconciliation | settings | reminder\n  type TEXT,                             -- document type for kind=doc (invoice, quotation…)\n  number TEXT,\n  date TEXT,\n  due TEXT,\n  status TEXT,\n  contact TEXT,\n  currency TEXT,\n  total REAL,\n  balance REAL,\n  data TEXT NOT NULL,                    -- full JSON\n  version INTEGER NOT NULL DEFAULT 1,\n  deleted INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL,\n  created_by TEXT,\n  updated_at INTEGER NOT NULL,\n  updated_by TEXT\n);\nCREATE INDEX objects_kind ON objects(kind, deleted);\nCREATE INDEX objects_kind_type ON objects(kind, type, deleted);\nCREATE INDEX objects_number ON objects(kind, type, number);\nCREATE INDEX objects_updated ON objects(updated_at);\n\n-- Double-entry ledger. Amounts in base currency (AED); fc = amount in the account's own currency when it differs.\nCREATE TABLE journal_lines (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  source_kind TEXT NOT NULL,\n  source_id TEXT NOT NULL,\n  source_number TEXT,\n  date TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  debit REAL NOT NULL DEFAULT 0,\n  credit REAL NOT NULL DEFAULT 0,\n  fc_amount REAL,                        -- signed (+debit / -credit) in fc_currency\n  fc_currency TEXT,\n  contact TEXT,\n  link_id TEXT,                          -- invoice / bill the line settles, for sub-ledgers\n  tax_code TEXT,                         -- vat_out_std, vat_out_zero, vat_in_std… for the VAT return\n  tax_base REAL,                         -- taxable amount behind a VAT line (base currency)\n  memo TEXT\n);\nCREATE INDEX jl_source ON journal_lines(source_kind, source_id);\nCREATE INDEX jl_account ON journal_lines(account_id, date);\nCREATE INDEX jl_date ON journal_lines(date);\nCREATE INDEX jl_link ON journal_lines(link_id);\n\nCREATE TABLE bank_txns (\n  id TEXT PRIMARY KEY,\n  account_id TEXT NOT NULL,              -- ledger account (bank)\n  date TEXT NOT NULL,\n  description TEXT,\n  reference TEXT,\n  amount REAL NOT NULL,                  -- + money in, - money out, in the account currency\n  balance REAL,\n  status TEXT NOT NULL DEFAULT 'new',    -- new | matched | categorized | excluded\n  link_kind TEXT,\n  link_id TEXT,\n  rule_id TEXT,\n  suggestion TEXT,                       -- JSON\n  import_id TEXT,\n  hash TEXT NOT NULL,\n  reconciliation_id TEXT,\n  created_at INTEGER NOT NULL,\n  created_by TEXT,\n  UNIQUE(account_id, hash)\n);\nCREATE INDEX bt_account ON bank_txns(account_id, date);\nCREATE INDEX bt_status ON bank_txns(status);\n\nCREATE TABLE audit (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  at INTEGER NOT NULL,\n  user_id TEXT,\n  user_name TEXT,\n  ip TEXT,\n  action TEXT NOT NULL,                  -- create | update | delete | login | login_failed | logout | 2fa_on | 2fa_off | user_add | role_change | export | import | reconcile …\n  kind TEXT,\n  object_id TEXT,\n  label TEXT,\n  changes TEXT                           -- JSON summary of changed fields\n);\nCREATE INDEX audit_at ON audit(at);\nCREATE INDEX audit_object ON audit(object_id);\n\nCREATE TABLE counters (\n  name TEXT PRIMARY KEY,\n  value INTEGER NOT NULL\n);\n\n-- Money applied to invoices and bills: payments, credit notes, bill payments, vendor credits\nCREATE TABLE allocations (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  source_kind TEXT NOT NULL,\n  source_id TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  amount REAL NOT NULL,                  -- in the target's currency\n  date TEXT\n);\nCREATE INDEX alloc_target ON allocations(target_id);\nCREATE INDEX alloc_source ON allocations(source_kind, source_id);\n";

  // migrations/0002_hardening.sql
  var hardening_default = "-- Separate counter for wrong two-step codes, and the last code used (no replays)\nALTER TABLE users ADD COLUMN mfa_failed INTEGER NOT NULL DEFAULT 0;\nALTER TABLE users ADD COLUMN totp_last INTEGER;\n-- A document number can be used once per document type\nCREATE UNIQUE INDEX objects_doc_number_unique ON objects(type, lower(trim(number))) WHERE kind = 'doc' AND deleted = 0 AND number IS NOT NULL AND trim(number) != '';\n";

  // migrations/0003_hr.sql
  var hr_default = "-- HR Desk module: attendance, leave, public holidays and in-app notifications.\n-- Employees themselves are the existing `employee` records (objects table), shared with payroll.\n\n-- One attendance record per employee per office-local day\nCREATE TABLE IF NOT EXISTS hr_attendance (\n    id TEXT PRIMARY KEY,\n    employee_id TEXT NOT NULL,\n    date TEXT NOT NULL,                       -- YYYY-MM-DD in the office time zone\n    clock_in INTEGER,                         -- epoch ms (UTC)\n    clock_out INTEGER,\n    status TEXT NOT NULL DEFAULT 'present',   -- present | late | half_day | absent\n    notes TEXT NOT NULL DEFAULT '',\n    edited INTEGER NOT NULL DEFAULT 0,\n    created_at INTEGER NOT NULL,\n    updated_at INTEGER NOT NULL,\n    updated_by TEXT,\n    UNIQUE (employee_id, date)\n);\nCREATE INDEX IF NOT EXISTS hr_attendance_date ON hr_attendance(date);\n\nCREATE TABLE IF NOT EXISTS hr_leaves (\n    id TEXT PRIMARY KEY,\n    employee_id TEXT NOT NULL,\n    leave_type TEXT NOT NULL,                 -- annual | sick | casual | unpaid\n    start_date TEXT NOT NULL,\n    end_date TEXT NOT NULL,\n    days REAL NOT NULL,                       -- working days (weekends and holidays excluded)\n    reason TEXT NOT NULL DEFAULT '',\n    status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | cancelled\n    admin_note TEXT NOT NULL DEFAULT '',\n    created_at INTEGER NOT NULL,\n    created_by TEXT,\n    reviewed_at INTEGER,\n    reviewed_by TEXT\n);\nCREATE INDEX IF NOT EXISTS hr_leaves_employee ON hr_leaves(employee_id, status);\nCREATE INDEX IF NOT EXISTS hr_leaves_dates ON hr_leaves(status, start_date, end_date);\n\nCREATE TABLE IF NOT EXISTS hr_holidays (\n    id TEXT PRIMARY KEY,\n    date TEXT NOT NULL UNIQUE,\n    name TEXT NOT NULL,\n    estimated INTEGER NOT NULL DEFAULT 0,     -- Islamic dates depend on moon sighting until confirmed\n    created_at INTEGER NOT NULL,\n    updated_at INTEGER NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS hr_notifications (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id TEXT NOT NULL,\n    title TEXT NOT NULL,\n    message TEXT NOT NULL DEFAULT '',\n    kind TEXT NOT NULL DEFAULT 'info',\n    link TEXT,\n    read INTEGER NOT NULL DEFAULT 0,\n    created_at INTEGER NOT NULL\n);\nCREATE INDEX IF NOT EXISTS hr_notifications_user ON hr_notifications(user_id, read, created_at);\n\n-- UAE public holidays 2026–2027 (Islamic dates are estimates until the UAE Cabinet confirms them)\nINSERT OR IGNORE INTO hr_holidays (id, date, name, estimated, created_at, updated_at) VALUES\n    ('hol_2026-01-01', '2026-01-01', 'New Year''s Day', 0, 0, 0),\n    ('hol_2026-03-19', '2026-03-19', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2026-03-20', '2026-03-20', 'Eid al-Fitr', 1, 0, 0),\n    ('hol_2026-03-21', '2026-03-21', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2026-03-22', '2026-03-22', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2026-05-26', '2026-05-26', 'Arafat Day', 1, 0, 0),\n    ('hol_2026-05-27', '2026-05-27', 'Eid al-Adha', 1, 0, 0),\n    ('hol_2026-05-28', '2026-05-28', 'Eid al-Adha holiday', 1, 0, 0),\n    ('hol_2026-05-29', '2026-05-29', 'Eid al-Adha holiday', 1, 0, 0),\n    ('hol_2026-06-16', '2026-06-16', 'Islamic New Year', 1, 0, 0),\n    ('hol_2026-08-25', '2026-08-25', 'Prophet Muhammad''s Birthday', 1, 0, 0),\n    ('hol_2026-12-01', '2026-12-01', 'Commemoration Day', 0, 0, 0),\n    ('hol_2026-12-02', '2026-12-02', 'UAE National Day', 0, 0, 0),\n    ('hol_2026-12-03', '2026-12-03', 'UAE National Day holiday', 0, 0, 0),\n    ('hol_2027-01-01', '2027-01-01', 'New Year''s Day', 0, 0, 0),\n    ('hol_2027-03-08', '2027-03-08', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2027-03-09', '2027-03-09', 'Eid al-Fitr', 1, 0, 0),\n    ('hol_2027-03-10', '2027-03-10', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2027-03-11', '2027-03-11', 'Eid al-Fitr holiday', 1, 0, 0),\n    ('hol_2027-05-15', '2027-05-15', 'Arafat Day', 1, 0, 0),\n    ('hol_2027-05-16', '2027-05-16', 'Eid al-Adha', 1, 0, 0),\n    ('hol_2027-05-17', '2027-05-17', 'Eid al-Adha holiday', 1, 0, 0),\n    ('hol_2027-05-18', '2027-05-18', 'Eid al-Adha holiday', 1, 0, 0),\n    ('hol_2027-06-06', '2027-06-06', 'Islamic New Year', 1, 0, 0),\n    ('hol_2027-08-14', '2027-08-14', 'Prophet Muhammad''s Birthday', 1, 0, 0),\n    ('hol_2027-12-01', '2027-12-01', 'Commemoration Day', 0, 0, 0),\n    ('hol_2027-12-02', '2027-12-02', 'UAE National Day', 0, 0, 0),\n    ('hol_2027-12-03', '2027-12-03', 'UAE National Day holiday', 0, 0, 0);\n";

  // demo/engine.js
  var MIGRATIONS = [init_default, hardening_default, hr_default];
  var clean = (v) => v === void 0 ? null : typeof v === "boolean" ? v ? 1 : 0 : v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  var Stmt = class {
    constructor(db, sql, params = []) {
      this.db = db;
      this.sql = sql;
      this.params = params;
    }
    bind(...p) {
      return new Stmt(this.db, this.sql, p.map(clean));
    }
    _rows(limit) {
      const st = this.db.sql.prepare(this.sql);
      try {
        st.bind(this.params);
        const out = [];
        while (st.step()) {
          out.push(st.getAsObject());
          if (limit && out.length >= limit)
            break;
        }
        return out;
      } finally {
        st.free();
      }
    }
    _exec() {
      const rows = this._rows();
      return { success: true, results: rows, meta: { changes: this.db.sql.getRowsModified(), last_row_id: this.db.lastId(), duration: 0 } };
    }
    async first(col) {
      const r = this._exec().results[0];
      this.db.touch(this.sql);
      if (!r)
        return null;
      return col ? r[col] ?? null : r;
    }
    async all() {
      const r = this._exec();
      this.db.touch(this.sql);
      return r;
    }
    async run() {
      const r = this._exec();
      this.db.touch(this.sql);
      return r;
    }
    async raw() {
      return this._exec().results.map((o) => Object.values(o));
    }
  };
  var D1 = class {
    constructor(sql, onWrite) {
      this.sql = sql;
      this.onWrite = onWrite;
    }
    prepare(q) {
      return new Stmt(this, q);
    }
    lastId() {
      const r = this.sql.exec("SELECT last_insert_rowid()");
      return r[0] ? r[0].values[0][0] : 0;
    }
    touch(q) {
      if (!/^\s*(SELECT|WITH)\b/i.test(q) || /\bRETURNING\b/i.test(q))
        this.onWrite();
    }
    async batch(stmts) {
      this.sql.run("BEGIN");
      try {
        const out = stmts.map((s) => s._exec());
        this.sql.run("COMMIT");
        this.onWrite();
        return out;
      } catch (e) {
        try {
          this.sql.run("ROLLBACK");
        } catch {
        }
        throw e;
      }
    }
    async exec(q) {
      this.sql.exec(q);
      this.onWrite();
      return { count: 1 };
    }
  };
  var R2 = class {
    constructor(db) {
      this.db = db;
    }
    async put(key, body, opts = {}) {
      let bytes = body;
      if (typeof body === "string")
        bytes = new TextEncoder().encode(body);
      else if (body instanceof ArrayBuffer)
        bytes = new Uint8Array(body);
      await this.db.prepare("INSERT OR REPLACE INTO _files (key, body, type, meta) VALUES (?,?,?,?)").bind(key, bytes, opts.httpMetadata?.contentType || "", JSON.stringify(opts.customMetadata || {})).run();
      return { key };
    }
    async get(key) {
      const r = await this.db.prepare("SELECT * FROM _files WHERE key = ?").bind(key).first();
      if (!r)
        return null;
      return {
        key,
        body: r.body,
        size: r.body ? r.body.length : 0,
        httpMetadata: { contentType: r.type },
        customMetadata: JSON.parse(r.meta || "{}"),
        arrayBuffer: async () => r.body.buffer.slice(r.body.byteOffset, r.body.byteOffset + r.body.byteLength)
      };
    }
    async delete(key) {
      await this.db.prepare("DELETE FROM _files WHERE key = ?").bind(key).run();
    }
    async list({ prefix = "" } = {}) {
      const { results } = await this.db.prepare("SELECT key, length(body) size FROM _files WHERE key LIKE ? || '%'").bind(prefix).all();
      return { objects: results, truncated: false };
    }
  };
  function createEngine(SQL, bytes, { onWrite = () => {
  }, vars = {} } = {}) {
    const sql = bytes ? new SQL.Database(bytes) : new SQL.Database();
    const fresh = !bytes;
    if (fresh) {
      for (const m of MIGRATIONS)
        sql.exec(m);
    }
    if (!fresh && !sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hr_leaves'").length)
      sql.exec(hr_default);
    sql.exec("CREATE TABLE IF NOT EXISTS _files (key TEXT PRIMARY KEY, body BLOB, type TEXT, meta TEXT)");
    sql.exec("PRAGMA foreign_keys = ON");
    const DB = new D1(sql, onWrite);
    const env = {
      DB,
      FILES: new R2(DB),
      DEMO: "1",
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      BASE_PATH: "/DocumentDesk",
      APP_NAME: "EVAM Books",
      INSECURE_COOKIES: "1",
      ...vars
    };
    const pending = /* @__PURE__ */ new Set();
    const ctx = { waitUntil(p) {
      const q = Promise.resolve(p).catch((e) => console.error(e));
      pending.add(q);
      q.finally(() => pending.delete(q));
    }, passThroughOnException() {
    } };
    return {
      fresh,
      env,
      async fetch(url, init) {
        return src_default.fetch(new Request(url, init), env, ctx);
      },
      async scheduled() {
        await src_default.scheduled({ cron: "0 4 * * *", scheduledTime: Date.now() }, env, ctx);
        await Promise.all([...pending]);
      },
      async setPassword(email, pw) {
        const h = await hashPassword(pw);
        await DB.prepare("UPDATE users SET pass_hash = ?, must_change = 0, failed = 0, locked_until = NULL WHERE email = ?").bind(h, email).run();
      },
      export() {
        const b = sql.export();
        sql.exec("PRAGMA foreign_keys = ON");
        return b;
      },
      close() {
        sql.close();
      }
    };
  }
  return __toCommonJS(engine_exports);
})();
