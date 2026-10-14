/* ==========================================================
   EVAM Books connection
   When the app is opened from the EVAM Books server (e.g. https://www.evam.si/DocumentDesk/),
   everything is saved on the server for the whole team, behind sign-in.
   Opened from a folder (file://) or a plain web host, it keeps working on its own,
   saving in this browser only, exactly as before.
   ========================================================== */

const ONLINE_CACHE = "evambooks.cache";
const QUEUE_KEY = "evambooks.queue";
const FIN_KINDS = ["payment", "billPayment", "bill", "vendorCredit", "expense", "journal", "transfer", "bankEntry", "account", "rule", "recurring", "reconciliation", "reminder", "employee", "payrun"];

const Server = {
    online: false,
    base: new URL("api/", location.href.split("#")[0].replace(/[^/]*$/, "")).href,
    user: null, role: null, roles: {}, today: null,
    fin: Object.fromEntries(FIN_KINDS.map(k => [k, []])),
    versions: new Map(),
    lastSync: 0,
    queue: [],
    busy: false,
    listeners: new Set(),
    _settingsJSON: "",

    /* ---------- HTTP ---------- */
    async api(method, path, body, opts = {}) {
        let res;
        try {
            res = await fetch(this.base + path, {
                method, credentials: "same-origin",
                headers: opts.raw ? { "x-evam": "1", "content-type": opts.type || "application/octet-stream" } : { "content-type": "application/json", "x-evam": "1" },
                body: body === undefined ? undefined : opts.raw ? body : JSON.stringify(body)
            });
        } catch (e) {
            const err = new Error("You're offline or the server can't be reached.");
            err.offline = true;
            throw err;
        }
        let data = null;
        const text = await res.text();
        try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
        if (!res.ok) {
            const err = new Error((data && data.error) || `The server answered ${res.status}.`);
            err.status = res.status; err.data = data || {};
            if (res.status === 401 && !opts.noAuthRedirect && this.online) Auth.show("login", "Your session has ended. Please sign in again.");
            if (res.status === 403 && data && (data.mustChange || data.need2fa) && this.online) Auth.handleGate(data);
            throw err;
        }
        return data;
    },
    get(p) { return this.api("GET", p); },
    post(p, b = {}) { return this.api("POST", p, b); },

    /* ---------- Start-up ---------- */
    async detect() {
        if (!/^https?:$/.test(location.protocol)) return false;
        try {
            const r = await fetch(this.base + "status", { credentials: "same-origin" });
            if (!r.ok) return false;
            const s = await r.json();
            return s && s.app ? s : false;
        } catch { return false; }
    },

    /* Returns once the user is signed in and the data is loaded (or in local mode) */
    async boot() {
        const status = await this.detect();
        if (!status) { this.online = false; Store.load(); return; }
        this.online = true;
        document.body.classList.add("online");
        if (status.setupNeeded) await Auth.run("setup");
        else if (!status.signedIn) await Auth.run(status.mfaPending ? "mfa" : "login");
        await this.loadAll();
        await Auth.gateChecks();
    },

    async loadAll() {
        let b;
        try { b = await this.get("bootstrap"); }
        catch (e) {
            if (e.data && (e.data.mustChange || e.data.need2fa)) { await Auth.handleGate(e.data, true); return this.loadAll(); }
            if (e.offline) { if (this.loadCache()) { toast("You're offline. Showing the last copy saved on this device.", "warn", 7000); return; } }
            throw e;
        }
        this.applyBootstrap(b);
    },

    applyBootstrap(b) {
        this.user = b.user; this.role = b.role; this.roles = b.roles || {}; this.today = b.today;
        this.lastSync = b.serverTime;
        this.fin = Object.fromEntries(FIN_KINDS.map(k => [k, []]));
        this.versions.clear();
        const raw = { settings: b.settings, docs: [], contacts: [], products: [], migrated: true };
        for (const o of b.objects) {
            this.versions.set(o.id, o.version);
            if (o.kind === "doc") raw.docs.push(o);
            else if (o.kind === "contact") raw.contacts.push(o);
            else if (o.kind === "product") raw.products.push(o);
            else if (this.fin[o.kind]) this.fin[o.kind].push(o);
        }
        raw.docs.sort((a, c) => (c.updatedAt || 0) - (a.updatedAt || 0));
        Store.data = Store.normalise(raw);
        this.versions.set("settings", b.settings.version);
        this._settingsJSON = JSON.stringify(Store.data.settings);
        this.saveCache();
        Auth.renderUserMenu();
        this.emit();
    },

    saveCache() {
        try { localStorage.setItem(ONLINE_CACHE, JSON.stringify({ user: this.user, role: this.role, data: Store.data, fin: this.fin, lastSync: this.lastSync })); } catch (e) { /* cache is optional */ }
    },
    loadCache() {
        try {
            const c = JSON.parse(localStorage.getItem(ONLINE_CACHE) || "null");
            if (!c) return false;
            this.user = c.user; this.role = c.role; this.fin = c.fin; this.lastSync = c.lastSync;
            Store.data = Store.normalise(c.data);
            return true;
        } catch { return false; }
    },

    /* ---------- Keeping the local copy in step ---------- */
    apply(o) {
        if (!o || !o.kind) return;
        if (o.version) this.versions.set(o.id, o.version);
        const listFor = k => k === "doc" ? Store.data.docs : k === "contact" ? Store.data.contacts : k === "product" ? Store.data.products : this.fin[k];
        if (o.kind === "settings") { this.applySettings(o); return; }
        const list = listFor(o.kind);
        if (!list) return;
        const i = list.findIndex(x => x.id === o.id);
        if (o.deleted) { if (i > -1) list.splice(i, 1); return; }
        const val = o.kind === "doc" ? upgradeDoc(o) : o;
        if (i === -1) list.unshift(val); else list[i] = val;
    },
    applySettings(s) {
        if (!s) return;
        const merged = Store.normalise({ settings: s, docs: [], contacts: [], products: [] }).settings;
        Store.data.settings = merged;
        this.versions.set("settings", s.version);
        this._settingsJSON = JSON.stringify(merged);
    },
    applyResult(res) {
        if (!res) return;
        if (res.object) this.apply(res.object);
        (res.related || []).forEach(o => this.apply(o));
        if (res.settings) this.applySettings(res.settings);
        this.saveCache();
        this.emit();
    },
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },

    /* Save now and wait for the answer (used by Save buttons) */
    async save(kind, obj, { force = false } = {}) {
        const body = JSON.parse(JSON.stringify(obj));
        body.version = this.versions.get(obj.id) ?? null;
        if (force) body.force = true;
        delete body.kind;
        const res = await this.api("PUT", `objects/${kind}/${encodeURIComponent(obj.id)}`, body);
        this.applyResult(res);
        return res;
    },
    async remove(kind, id) {
        const res = await this.api("DELETE", `objects/${kind}/${encodeURIComponent(id)}`);
        this.apply({ kind, id, deleted: true });
        (res.related || []).forEach(o => this.apply(o));
        this.versions.delete(id);
        this.saveCache();
        this.emit();
        return res;
    },

    /* Save in the background (contacts, settings, small changes); retried when back online */
    push(kind, obj) {
        this.queue = this.queue.filter(q => !(q.kind === kind && q.id === obj.id));
        this.queue.push({ op: "put", kind, id: obj.id, body: JSON.parse(JSON.stringify(obj)) });
        this.persistQueue();
        this.flush();
    },
    pushDelete(kind, id) {
        this.queue = this.queue.filter(q => !(q.kind === kind && q.id === id));
        this.queue.push({ op: "del", kind, id });
        this.persistQueue();
        this.flush();
    },
    persistQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue)); } catch { /* ignore */ } SyncBadge.update(); },
    async flush() {
        if (this.busy || !this.queue.length) return;
        this.busy = true;
        SyncBadge.update();
        try {
            while (this.queue.length) {
                const q = this.queue[0];
                try {
                    if (q.op === "put") await this.save(q.kind, q.body);
                    else await this.remove(q.kind, q.id).catch(e => { if (e.status !== 404) throw e; });
                    this.queue.shift();
                } catch (e) {
                    if (e.offline) { SyncBadge.offline(); setTimeout(() => this.flush(), 15000); break; }
                    this.queue.shift();
                    if (e.status === 409 && e.data?.current) {
                        const cur = e.data.current;
                        toast(`${e.message}`, "warn", 9000, { label: "Keep mine", fn: () => this.push(q.kind, { ...q.body, force: true }) });
                        this.apply(cur);
                    } else toast(`Couldn't save ${q.kind === "settings" ? "settings" : q.body?.name || q.body?.number || "a change"}: ${e.message}`, "bad", 8000);
                    this.emit();
                }
            }
        } finally {
            this.busy = false;
            this.persistQueue();
        }
    },

    /* Other people's changes, every 30 seconds and when the tab comes back */
    async poll() {
        if (!this.online || !this.user) return;
        try {
            const res = await this.get(`changes?since=${this.lastSync}`);
            this.lastSync = res.serverTime;
            if (!res.objects.length && !res.settings) return;
            const openId = App.doc && App.doc.id;
            let openChanged = null;
            for (const o of res.objects) {
                if (o.updated_by === this.user.id && this.versions.get(o.id) === o.version) continue;
                this.apply(o);
                if (o.id === openId) openChanged = o;
            }
            if (res.settings && !this.queue.some(q => q.kind === "settings")) this.applySettings(res.settings);
            this.saveCache();
            if (openChanged && typeof onRemoteChange === "function") onRemoteChange(openChanged);
            this.emit();
        } catch (e) { if (!e.offline && e.status !== 401) console.warn(e); }
    },

    /* Settings: pushed when they change */
    settingsChanged() {
        const j = JSON.stringify(Store.data.settings);
        if (j === this._settingsJSON) return;
        this._settingsJSON = j;
        clearTimeout(this._st);
        this._st = setTimeout(() => this.push("settings", { ...Store.data.settings, id: "settings" }), 600);
    },

    can(area) {
        const r = this.role;
        if (!r) return !this.online;
        return r.write === "*" || (Array.isArray(r.write) && r.write.includes(area));
    },
    canSee(area) {
        const r = this.role;
        if (!r) return !this.online;
        return r.read === "*" || (Array.isArray(r.read) && r.read.includes(area));
    },
    canReport(name) {
        const r = this.role;
        if (name === "payroll_summary" || name === "employee_balances") return !!(r && r.payroll);
        return !!r && (r.reports === "*" || (Array.isArray(r.reports) && r.reports.includes(name)));
    },
    get isAdmin() { return this.user && (this.user.role === "owner" || this.user.role === "admin"); },

    async upload(file) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Files can be up to 10 MB.");
        return this.api("POST", `files?name=${encodeURIComponent(file.name)}`, file, { raw: true, type: file.type || "application/octet-stream" });
    }
};

/* ---------- Hook the Document Desk store into the server ---------- */
(function hookStore() {
    const orig = {
        save: Store.save.bind(Store), saveDoc: Store.saveDoc.bind(Store), deleteDoc: Store.deleteDoc.bind(Store),
        upsert: Store.upsert.bind(Store), remove: Store.remove.bind(Store)
    };
    Store.save = function () {
        if (!Server.online) return orig.save();
        Server.settingsChanged();
        Server.saveCache();
        return true;
    };
    Store.saveDoc = function (doc) {
        if (!Server.online) return orig.saveDoc(doc);
        const copy = JSON.parse(JSON.stringify(doc));
        copy.updatedAt = copy.savedAt = Date.now();
        const i = this.data.docs.findIndex(d => d.id === doc.id);
        if (i === -1) this.data.docs.unshift(copy); else this.data.docs[i] = copy;
        Server.push("doc", copy);
        return true;
    };
    Store.deleteDoc = function (id) {
        if (!Server.online) return orig.deleteDoc(id);
        this.data.docs = this.data.docs.filter(d => d.id !== id);
        Server.pushDelete("doc", id);
    };
    Store.upsert = function (listName, item) {
        if (!Server.online) return orig.upsert(listName, item);
        const list = this.data[listName];
        const i = list.findIndex(x => x.id === item.id);
        if (i === -1) list.push(item); else list[i] = item;
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        Server.push(listName === "contacts" ? "contact" : "product", item);
    };
    Store.remove = function (listName, id) {
        if (!Server.online) return orig.remove(listName, id);
        this.data[listName] = this.data[listName].filter(x => x.id !== id);
        Server.pushDelete(listName === "contacts" ? "contact" : "product", id);
    };
})();

/* ---------- Sync badge in the top bar ---------- */
const SyncBadge = {
    el: null,
    mount() {
        if (this.el || !Server.online) return;
        this.el = document.createElement("span");
        this.el.className = "sync-badge";
        this.el.setAttribute("role", "status");
        $(".appbar-right").prepend(this.el);
        this.update();
    },
    update() {
        if (!this.el) return;
        const n = Server.queue.length;
        this.el.dataset.state = n ? (Server.busy ? "saving" : "pending") : "ok";
        this.el.textContent = n ? (Server.busy ? "Saving…" : `${n} change${n > 1 ? "s" : ""} waiting`) : "";
        this.el.title = n ? "Changes are being sent to EVAM Books" : "Everything is saved";
    },
    offline() { if (this.el) { this.el.dataset.state = "offline"; this.el.textContent = "Offline — will retry"; } }
};

/* ==========================================================
   SIGN-IN SCREENS
   ========================================================== */
const Auth = {
    resolve: null,
    run(mode, message) {
        return new Promise(res => { this.resolve = res; this.show(mode, message); });
    },
    root() {
        let el = $("#authScreen");
        if (!el) {
            el = document.createElement("div");
            el.id = "authScreen";
            el.className = "auth";
            document.body.appendChild(el);
        }
        document.body.classList.add("auth-open");
        return el;
    },
    close() {
        const el = $("#authScreen");
        if (el) el.remove();
        document.body.classList.remove("auth-open");
    },
    shell(title, sub, body) {
        return `
<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
  <img src="logo.svg" alt="EVAM" class="auth-logo">
  <h1 id="authTitle">${esc(title)}</h1>
  ${sub ? `<p class="auth-sub">${sub}</p>` : ""}
  <div class="auth-msg" id="authMsg" role="alert" hidden></div>
  ${body}
</div>
<p class="auth-foot">EVAM Books · Document desk and finance</p>`;
    },
    msg(text, tone = "bad") { const m = $("#authMsg"); if (!m) return; m.hidden = !text; m.textContent = text || ""; m.dataset.tone = tone; },
    busy(form, on) { $$("button, input", form).forEach(x => { x.disabled = on; }); },
    field(name, label, type = "text", extra = "") {
        return `<label class="auth-field"><span>${esc(label)}</span><input name="${name}" type="${type}" ${extra}></label>`;
    },

    show(mode, message) {
        const root = this.root();
        if (mode === "setup") {
            root.innerHTML = this.shell("Set up EVAM Books", "Create the owner account for your organisation. You need the setup code your administrator added to the server.",
                `<form class="auth-form" id="authForm" novalidate>
                  ${this.field("code", "Setup code", "password", 'autocomplete="off" required')}
                  ${this.field("name", "Your name", "text", 'autocomplete="name" required')}
                  ${this.field("email", "Work email", "email", 'autocomplete="email" required')}
                  ${this.field("password", "Password (10+ characters)", "password", 'autocomplete="new-password" required minlength="10"')}
                  <button type="submit" class="btn btn-primary btn-block">Create account</button>
                  <p class="auth-note">Company details, bank accounts and numbering already set up in this browser are used as the starting point.</p>
                </form>`);
            this.bind(async (f, d) => {
                const settings = (() => { try { const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); return Store.normalise(raw || {}).settings; } catch { return Store.normalise({}).settings; } })();
                await Server.post("setup", { ...d, settings });
                this.done();
            });
        } else if (mode === "login") {
            root.innerHTML = this.shell("Sign in", "EVAM Books — documents and accounts in one place.",
                `<form class="auth-form" id="authForm" novalidate>
                  ${this.field("email", "Email", "email", 'autocomplete="username" required autofocus')}
                  ${this.field("password", "Password", "password", 'autocomplete="current-password" required')}
                  <button type="submit" class="btn btn-primary btn-block">Sign in</button>
                  <p class="auth-note">Forgot your password? Ask your administrator to reset it.</p>
                </form>`);
            this.bind(async (f, d) => {
                const r = await Server.api("POST", "login", d, { noAuthRedirect: true });
                if (r.mfa) return this.show("mfa");
                this.done();
            });
        } else if (mode === "mfa") {
            root.innerHTML = this.shell("Two-step sign-in", "Enter the 6-digit code from your authenticator app, or one of your backup codes.",
                `<form class="auth-form" id="authForm" novalidate>
                  ${this.field("code", "Code", "text", 'inputmode="numeric" autocomplete="one-time-code" required autofocus maxlength="12"')}
                  <button type="submit" class="btn btn-primary btn-block">Continue</button>
                  <button type="button" class="link-btn" id="authBack">Use a different account</button>
                </form>`);
            $("#authBack").addEventListener("click", async () => { await Server.post("logout").catch(() => {}); this.show("login"); });
            this.bind(async (f, d) => { await Server.api("POST", "login/2fa", d, { noAuthRedirect: true }); this.done(); });
        } else if (mode === "password") {
            root.innerHTML = this.shell("Choose a new password", "You signed in with a temporary password. Choose your own to continue.",
                `<form class="auth-form" id="authForm" novalidate>
                  ${this.field("current", "Temporary password", "password", 'autocomplete="current-password" required')}
                  ${this.field("next", "New password (10+ characters)", "password", 'autocomplete="new-password" required minlength="10"')}
                  ${this.field("confirm", "New password again", "password", 'autocomplete="new-password" required')}
                  <button type="submit" class="btn btn-primary btn-block">Save password</button>
                </form>`);
            this.bind(async (f, d) => {
                if (d.next !== d.confirm) throw new Error("The two new passwords don't match.");
                await Server.post("me/password", { current: d.current, next: d.next });
                this.done();
            });
        } else if (mode === "enroll") {
            root.innerHTML = this.shell("Set up two-step sign-in", "Your organisation requires a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) when you sign in.",
                `<div id="enrollBox" class="enroll"><p class="muted">Preparing…</p></div>`);
            TwoFA.enrollInto($("#enrollBox"), () => this.done());
        }
        if (message) this.msg(message, "warn");
        setTimeout(() => $("#authForm input")?.focus(), 30);
    },
    bind(handler) {
        const f = $("#authForm");
        f.addEventListener("submit", async e => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(f).entries());
            const empty = [...f.querySelectorAll("input[required]")].find(i => !i.value.trim());
            if (empty) { this.msg("Fill in every field."); empty.focus(); return; }
            this.msg("");
            this.busy(f, true);
            try { await handler(f, d); }
            catch (err) {
                this.msg(err.offline ? "Can't reach the server. Check your connection and try again." : err.message);
                if (err.data?.mustChange) return this.show("password");
            }
            finally { if (document.body.contains(f)) this.busy(f, false); }
        });
    },
    async done() {
        this.close();
        if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
        else { await Server.loadAll(); await this.gateChecks(); if (typeof onSignedIn === "function") onSignedIn(); }
    },
    async handleGate(data, wait = false) {
        if (data.mustChange) { if (wait) return this.run("password"); this.show("password"); }
        else if (data.need2fa) { if (wait) return this.run("enroll"); this.show("enroll"); }
    },
    async gateChecks() {
        Auth.renderUserMenu();
        SyncBadge.mount();
        try { Server.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { Server.queue = []; }
        Server.flush();
        if (!Server._polling) {
            Server._polling = setInterval(() => Server.poll(), 30000);
            document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") Server.poll(); });
            window.addEventListener("online", () => { Server.flush(); Server.poll(); });
        }
        Migrate.offer();
    },

    /* ---------- Account menu ---------- */
    renderUserMenu() {
        if (!Server.online || !Server.user) return;
        let b = $("#userBtn");
        if (!b) {
            b = document.createElement("button");
            b.type = "button"; b.id = "userBtn"; b.className = "user-btn";
            b.setAttribute("aria-haspopup", "menu");
            $(".appbar-right").appendChild(b);
            b.addEventListener("click", () => this.openUserMenu(b));
        }
        const initials = (Server.user.name || Server.user.email).split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
        b.innerHTML = `<span class="avatar">${esc(initials)}</span>`;
        b.title = `${Server.user.name} · ${Server.roles[Server.user.role] || Server.user.role}`;
        b.setAttribute("aria-label", `Account: ${Server.user.name}`);
    },
    openUserMenu(anchor) {
        showMenu(anchor, [
            { heading: `${Server.user.name} · ${Server.roles[Server.user.role] || Server.user.role}` },
            { label: Server.user.mfa ? "Two-step sign-in: on" : "Turn on two-step sign-in", icon: "check", onClick: () => TwoFA.dialog() },
            { label: "Change password", icon: "pen", onClick: () => changePasswordDialog() },
            { divider: true },
            { label: "Sign out", icon: "x", onClick: async () => { await Server.post("logout").catch(() => {}); localStorage.removeItem(ONLINE_CACHE); location.reload(); } }
        ], "right");
    }
};

async function changePasswordDialog() {
    const r = await openDialog({
        title: "Change password",
        body: `<div class="form-grid">
            <div class="field"><label for="cp1">Current password</label><input id="cp1" name="current" type="password" autocomplete="current-password"></div>
            <div class="field"><label for="cp2">New password (10+ characters)</label><input id="cp2" name="next" type="password" autocomplete="new-password"></div>
        </div><p class="hint">Other devices signed in to your account will be signed out.</p>`,
        actions: [{ label: "Cancel", value: "cancel" }, { label: "Change password", value: "ok", primary: true }]
    });
    if (r.value !== "ok") return;
    try { await Server.post("me/password", r.data); toast("Password changed.", "good"); }
    catch (e) { toast(e.message, "bad", 6000); }
}

/* ---------- Two-step sign-in (TOTP) ---------- */
const TwoFA = {
    async loadQR() {
        if (window.qrcode) return;
        await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    },
    async enrollInto(box, onDone) {
        let start;
        try { start = await Server.post("me/2fa/start"); }
        catch (e) { box.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`; return; }
        // The QR code appears when its small library has loaded; the key works without it
        const drawQR = async () => {
            try {
                await Promise.race([this.loadQR(), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 8000))]);
                const q = window.qrcode(0, "M"); q.addData(start.uri); q.make();
                const el = $(".qr", box); if (el) el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
            } catch { const el = $(".qr", box); if (el) el.innerHTML = '<span class="muted">QR code unavailable — type the key below instead.</span>'; }
        };
        const qr = '<span class="muted">Loading QR code…</span>';
        box.innerHTML = `
<ol class="enroll-steps">
  <li>Open your authenticator app and add an account by scanning this code.
    <div class="qr">${qr}</div>
    <div class="hint">Or type this key: <code class="secret">${esc(start.secret.replace(/(.{4})/g, "$1 ").trim())}</code></div></li>
  <li>Enter the 6-digit code it shows.
    <div id="enrollForm" class="enroll-form"><input name="code" id="enrollCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" aria-label="6-digit code"><button class="btn btn-primary" type="button" id="enrollGo">Turn on</button></div>
    <div class="auth-msg" id="enrollMsg" hidden></div></li>
</ol>`;
        drawQR();
        // Not a <form>: this can sit inside the dialog's own form
        const codeEl = $("#enrollCode", box);
        codeEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); $("#enrollGo", box).click(); } });
        $("#enrollGo", box).addEventListener("click", async () => {
            const code = codeEl.value.trim();
            try {
                const r = await Server.post("me/2fa/confirm", { code });
                Server.user.mfa = true;
                box.innerHTML = `<p><b>Two-step sign-in is on.</b> Keep these backup codes somewhere safe. Each one works once if you lose your phone.</p>
                    <div class="backup-codes">${r.backupCodes.map(c => `<code>${c}</code>`).join("")}</div>
                    <div class="row-actions"><button type="button" class="btn btn-ghost" id="copyCodes">Copy codes</button><button type="button" class="btn btn-primary" id="enrollDone">Done</button></div>`;
                $("#copyCodes", box).addEventListener("click", () => { navigator.clipboard?.writeText(r.backupCodes.join("\n")); toast("Backup codes copied.", "good"); });
                $("#enrollDone", box).addEventListener("click", () => onDone && onDone());
            } catch (err) { const m = $("#enrollMsg", box); m.hidden = false; m.textContent = err.message; }
        });
    },
    async dialog() {
        if (Server.user.mfa) {
            const r = await openDialog({
                title: "Two-step sign-in",
                body: `<p class="dialog-text">Two-step sign-in is on for your account. To switch it off, enter your password.</p><div class="field"><label for="d2p">Password</label><input id="d2p" name="password" type="password" autocomplete="current-password"></div>`,
                actions: [{ label: "Close", value: "cancel" }, { label: "Switch off", value: "ok", danger: true }]
            });
            if (r.value !== "ok") return;
            try { await Server.post("me/2fa/disable", r.data); Server.user.mfa = false; toast("Two-step sign-in is off.", "good"); }
            catch (e) { toast(e.message, "bad", 6000); }
            return;
        }
        const p = openDialog({ title: "Turn on two-step sign-in", body: `<div id="enrollDlg" class="enroll"><p class="muted">Preparing…</p></div>`, actions: [{ label: "Close", value: "cancel" }] });
        this.enrollInto($("#enrollDlg"), () => $("#dialog").close("ok"));
        await p;
        Auth.renderUserMenu();
    }
};

/* ---------- Moving documents saved in this browser into EVAM Books ---------- */
const Migrate = {
    async offer() {
        if (!Server.isAdmin) return;
        let local;
        try { local = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { local = null; }
        if (!local) return;
        const docs = (local.docs || []), contacts = local.contacts || [], products = local.products || [];
        const onServer = new Set(Store.data.docs.map(d => d.id));
        const newDocs = docs.filter(d => !onServer.has(d.id));
        const doneFor = localStorage.getItem("evambooks.migrated");
        if (doneFor === "yes" || (!newDocs.length && !contacts.length)) return;
        const r = await openDialog({
            title: "Bring your saved documents across",
            body: `<p class="dialog-text">This browser has <b>${newDocs.length} document${newDocs.length === 1 ? "" : "s"}</b>, ${contacts.length} contact${contacts.length === 1 ? "" : "s"} and ${products.length} product${products.length === 1 ? "" : "s"} from before EVAM Books. Upload them so the whole team can use them and the invoices appear in the accounts?</p>
                   <p class="hint">Invoices you marked as paid are recorded as payments into the matching bank account. Nothing is deleted from this browser.</p>`,
            actions: [{ label: "Not now", value: "later" }, { label: "Don't ask again", value: "never" }, { label: "Upload", value: "ok", primary: true }]
        });
        if (r.value === "never") { localStorage.setItem("evambooks.migrated", "yes"); return; }
        if (r.value !== "ok") return;
        toast("Uploading… this can take a minute.", "", 60000);
        try {
            const report = await Server.post("import", { settings: local.settings, docs: newDocs, contacts, products, replaceSettings: Store.data.docs.length === 0 });
            localStorage.setItem("evambooks.migrated", "yes");
            await Server.loadAll();
            $$(".toast").forEach(t => t.remove());
            const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
            toast(`Uploaded ${n(report.docs, "document", "documents")}, ${n(report.payments, "payment", "payments")}, ${n(report.contacts, "contact", "contacts")} and ${n(report.products, "product", "products")}.${report.skipped.length ? ` ${report.skipped.length} skipped (see the audit log).` : ""}`, report.skipped.length ? "warn" : "good", 9000);
            if (typeof onSignedIn === "function") onSignedIn();
        } catch (e) { $$(".toast").forEach(t => t.remove()); toast(e.message, "bad", 8000); }
    }
};
