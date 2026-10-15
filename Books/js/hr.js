/* ==========================================================
   EVAM Books — HR (part 1): module core, notifications bell,
   staff self-service ("My workspace"): My day, My attendance,
   My leave, My payslips; holidays; HR settings; payroll figures.
   Part 2 (js/hr2.js) holds the HR manager screens.
   Native re-implementation of HR Desk on the EVAM Books design system.
   ========================================================== */
/* Icons this module needs on top of editor.js / icons.js */
if (typeof ICON_PATHS !== "undefined") Object.assign(ICON_PATHS, {
    logIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    download2: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'
});

let supabase_profile = null;
let profileLoaded = false;

async function loadUserProfile() {
    try {
        const { supabase } = await import("../../js/supabase.js");

        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error("User is not logged in:", authError);
            supabase_profile = null;
            return null;
        }

        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (error) {
            console.error("Error fetching profile:", error);
            supabase_profile = null;
            return null;
        }

        supabase_profile = data;

        console.log("Supabase role:", supabase_profile.roles);

        return supabase_profile;

    } catch (error) {
        console.error("Failed to load Supabase profile:", error);
        supabase_profile = null;
        return null;

    } finally {
        profileLoaded = true;
    }
}


const HR = {
    cfg: null,           // GET hr/config: settings, perms, me, today
    _uid: null, _loading: null, sub: "", sec: null,
    LEAVE: { annual: "Annual", sick: "Sick", casual: "Casual", unpaid: "Unpaid" },
    STATUS: { present: ["good", "Present"], late: ["warn", "Late"], half_day: ["info", "Half day"], absent: ["bad", "Absent"],
        pending: ["warn", "Pending"], approved: ["good", "Approved"], rejected: ["bad", "Rejected"], cancelled: ["mute", "Cancelled"] },
    DAYS: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],

    /* ---------- Permissions (used by the shell's nav) ---------- */
    online() { return typeof Server !== "undefined" && Server.online && !!Server.user; },
    isSelf() { return this.online() && Server.user.role === "employee"; },
    canManage() { return !!(this.online() && this.cfg && this.cfg.perms.manage); },
    isStaff() { return !!(this.online() && this.cfg && this.cfg.me); },          // has an employee record → My workspace
    isAdmin() { return !!(this.online() && this.cfg && this.cfg.perms.admin); },
    canPayroll() { return !!(this.online() && Server.role && Server.role.payroll); },

    /* ---------- Loading ---------- */
    async load(force = false) {
        if (!this.online()) { this.cfg = null; return null; }
        if (this._loading && !force) return this._loading;
        this._loading = (async () => {
            try { this.cfg = await Server.get("hr/config"); }
            catch (e) { this.cfg = null; console.warn("HR config", e); }
            this.applyChrome();
            return this.cfg;
        })();
        return this._loading;
    },
    ready() { return this.cfg ? Promise.resolve(this.cfg) : this.load(); },
    onData() {
        if (!this.online()) return;
        document.body.classList.toggle("hr-self", this.isSelf());
        if (Server.user.id !== this._uid) {
            this._uid = Server.user.id;
            this.cfg = null; this._loading = null;
            this.load().then(() => { if (App.view === "hr") this.render(); });
            Bell.start();
        }
    },
    applyChrome() {
        document.body.classList.toggle("hr-self", this.isSelf());
        this.registerNav();
        if (typeof Shell !== "undefined") Shell.renderNav();
        this.settingsTab();
        Bell.paint();
    },
    async registerNav() {
        if (typeof Shell === "undefined") return;

        // Wait until the Supabase profile has loaded
        if (!profileLoaded) {
            await loadUserProfile();
        }

        const exact = h => x => x === h || x.startsWith(h + "?");
        // const M = () => this.canManage(), ME = () => this.isStaff();
        const ME = () => this.isStaff();
        const M = isAdmin = () => supabase_profile?.roles?.includes("admin");

        const pend = () => this.cfg && this.cfg.pending ? this.cfg.pending : "";
        Shell.registerNavGroup({ id: "hr", label: "HR", order: 10, items: [
            { href: "#hr", label: "Dashboard", icon: "dashboard", perm: M, match: exact("#hr") },
            { href: "#hr/employees", label: "Employees", icon: "idCard", perm: isAdmin, hint: "Everyone on the team, their HR details and sign-ins" },
            { href: "#hr/attendance", label: "Attendance", icon: "clock", perm: M, hint: "Clock-ins, late arrivals and corrections" },
            { href: "#hr/leave", label: "Leave requests", icon: "plane", perm: M, hint: "Approve or decline time off", badge: pend },
            { href: "#hr/calendar", label: "Team calendar", icon: "calendarDays", perm: M, hint: "Who is away, month by month" },
            { href: "#hr/holidays", label: "Holidays", icon: "flag", perm: M, hint: "UAE public holidays and company closures" },
            { href: "#hr/report", label: "Monthly report", icon: "fileChart", perm: M, hint: "Attendance per person, with CSV export" }
        ] });
        Shell.registerNavGroup({ id: "me", label: "My workspace", order: this.isSelf() ? -1 : 11, items: [
            { href: "#hr/me", label: "My day", icon: "sunrise", perm: ME, match: exact("#hr/me") },
            { href: "#hr/my-attendance", label: "My attendance", icon: "calendarCheck", perm: ME },
            { href: "#hr/my-leave", label: "My leave", icon: "plane", perm: ME },
            { href: "#hr/my-payslips", label: "My payslips", icon: "banknote", perm: ME },
            { href: "#hr/holidays", label: "Holidays", icon: "flag", perm: () => this.isSelf() || (ME() && !M()) }
        ] });
    },
    /* Self-service sign-ins only have their own area (the server enforces this too) */
    redirect(v) {
        if (!this.isSelf()) return null;
        return /^hr(\/|$|\?)/.test(v) ? null : "#hr/me";
    },

    /* ---------- Routing ---------- */
    route(sub, sec) {
        this.sub = sub || ""; this.sec = sec;
        this.render();
    },
    async render() {
        const sec = this.sec || $("#view-hr"); if (!sec) return;
        const [page] = this.sub.split("?");
        const params = new URLSearchParams(this.sub.split("?")[1] || "");
        if (!this.cfg) { sec.innerHTML = this.skeleton(); await this.ready(); if (!this.cfg) { sec.innerHTML = this.emptyState("alert", "HR isn't available", "The HR area couldn't be loaded. Check your connection and try again.", `<button type="button" class="btn btn-primary" onclick="HR.load(true).then(()=>HR.render())">Try again</button>`); return; } }
        const mine = { me: "pageMyDay", "my-attendance": "pageMyAttendance", "my-leave": "pageMyLeave", "my-payslips": "pageMyPayslips", holidays: "pageHolidays" };
        const admin = { "": "pageDashboard", employees: "pageEmployees", attendance: "pageAttendance", leave: "pageLeave", calendar: "pageCalendar", report: "pageReport" };
        let fn = mine[page] || admin[page];
        if (!fn) { sec.innerHTML = this.emptyState("help", "Page not found", "That HR page doesn't exist.", `<a class="btn btn-primary" href="${this.isSelf() ? "#hr/me" : "#hr"}">Back to HR</a>`); return; }
        if (admin[page] && !this.canManage()) {
            if (this.isStaff()) { location.replace("#hr/me"); return; }
            sec.innerHTML = this.emptyState("lock", "HR is for HR managers", "Your role doesn't include HR. Ask the owner or an admin for access.", "");
            return;
        }
        if (mine[page] && page !== "holidays" && !this.isStaff()) {
            sec.innerHTML = this.emptyState("idCard", "Your sign-in isn't linked to an employee", "Ask HR to link your sign-in to your employee record. Then your clock-in, leave and payslips appear here.", this.canManage() ? `<a class="btn btn-primary" href="#hr/employees">Open employees</a>` : "");
            return;
        }
        this.page = page; this.params = params;
        const titles = { me: "My day", "my-attendance": "My attendance", "my-leave": "My leave", "my-payslips": "My payslips", holidays: "Holidays", "": "HR dashboard", employees: "Employees", attendance: "Attendance", leave: "Leave requests", calendar: "Team calendar", report: "Monthly report" };
        document.title = `${titles[page]} · EVAM Books`;
        clearInterval(this._tick);
        try { await this[fn](sec, params); }
        catch (e) { console.error(e); sec.innerHTML = this.emptyState("alert", "Something went wrong", esc(e.message || String(e)), `<button type="button" class="btn btn-primary" onclick="HR.render()">Try again</button>`); }
        if (typeof Shell !== "undefined") Shell.crumbs();
    },
    stillOn(page) { return App.view === "hr" && this.page === page && (this.sub.split("?")[0] === page); },

    /* ---------- Building blocks ---------- */
    head(title, sub = "", actions = "", eyebrow = "") {
        return `<div class="page-head hr-head"><div class="ph-text">${eyebrow ? `<div class="ph-eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
    },
    kpi(label, value, note = "", chip = "", href = "", cls = "") {
        const tag = href ? "a" : "div";
        return `<${tag} class="ls ${cls}"${href ? ` href="${href}"` : ""}><div class="ls-label">${label}</div><div class="ls-value">${value}</div><div class="ls-foot">${chip}${note ? `<span class="ls-note">${note}</span>` : ""}</div></${tag}>`;
    },
    chip(tone, text, ic = "") { return `<span class="trend trend-${tone}">${ic ? icon(ic, 13) : ""}${esc(text)}</span>`; },
    pill(status, label) { const s = this.STATUS[status] || ["neutral", status]; return `<span class="pill pill-${s[0]}">${esc(label || s[1])}</span>`; },
    leavePill(t) { return `<span class="hr-type hr-type-${esc(t)}">${esc(this.LEAVE[t] || t)}</span>`; },
    emptyState(ic, title, text, actions = "") {
        return `<div class="empty hr-empty"><div class="empty-art">${icon(ic, 26)}</div><h2>${title}</h2><p>${text}</p>${actions ? `<div class="empty-actions">${actions}</div>` : ""}</div>`;
    },
    skeleton() { return `<div class="hr-skel" aria-busy="true"><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-chart"></div></div>`; },
    initials(n) { return String(n || "?").split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase(); },
    avatar(n) {
        const hue = [...String(n || "?").toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 11);
        return `<span class="hr-av" style="--h:${hue}" aria-hidden="true">${esc(this.initials(n))}</span>`;
    },
    who(name, sub = "") { return `<div class="hr-who">${this.avatar(name)}<div><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div></div>`; },
    /* Dates: the app's own style (14-Oct-2026) for full dates; short forms for lists */
    d(iso, opts) { if (!iso) return ""; if (!opts) return fmtDate(iso); const [y, m, dd] = iso.split("-").map(Number); return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd))).replace("Sept", "Sep"); },
    dShort(iso) { return iso ? `${iso.slice(8)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : ""; },
    dDay(iso) { return iso ? `${this.d(iso, { weekday: "short" })} ${this.dShort(iso)}` : ""; },
    range(a, b) {
        if (a === b) return `${this.dShort(a)} ${a.slice(0, 4)}`;
        if (a.slice(0, 7) === b.slice(0, 7)) return `${a.slice(8)}–${b.slice(8)} ${MONTHS[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
        return `${this.dShort(a)}${a.slice(0, 4) !== b.slice(0, 4) ? " " + a.slice(0, 4) : ""} – ${this.dShort(b)} ${b.slice(0, 4)}`;
    },
    monthLabel(m) { return this.d(m + "-01", { month: "long", year: "numeric" }); },
    addDays(iso, n) { return new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); },
    addMonths(m, n) { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7); },
    dow(iso) { return new Date(iso + "T00:00:00Z").getUTCDay(); },
    hours(h) { const v = Number(h) || 0; if (!v) return "—"; const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return mm === 60 ? `${hh + 1}h` : `${hh}h${mm ? ` ${String(mm).padStart(2, "0")}m` : ""}`; },
    today() { return this.cfg ? this.cfg.today : todayISO(); },
    tz() { return this.cfg ? this.cfg.settings.timezone : "Asia/Dubai"; },
    nowParts() {
        const f = new Intl.DateTimeFormat("en-GB", { timeZone: this.tz(), hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const p = {}; f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
        return p;
    },
    async api(method, path, body) { return Server.api(method, "hr/" + path, body); },
    async run(fn, okMsg) {
        try { const r = await fn(); if (okMsg) toast(okMsg, "good"); return r; }
        catch (e) { toast(e.message, "bad", 7000); return null; }
    },
    /* A dialog that stays open while saving and shows server errors inline */
    dialog({ title, body, actions, wide = false, onOpen, onSubmit }) {
        return openDialog({
            title, body: body + `<div class="auth-msg hr-dlg-msg" hidden></div>`, actions, wide,
            onOpen: inner => {
                // #dialogInner is shared by every dialog: our submit handler lives only as long as this dialog
                if (inner._hrSubmit) inner.removeEventListener("submit", inner._hrSubmit, true);
                const handler = async e => {
                    const v = e.submitter && e.submitter.value;
                    if (!onSubmit || !v || v === "cancel") return;
                    e.preventDefault();
                    const data = {};
                    $$("[name]", inner).forEach(el => { data[el.name] = el.type === "checkbox" ? el.checked : el.value; });
                    const msg = $(".hr-dlg-msg", inner);
                    $$(".dialog-actions .btn", inner).forEach(b => { b.disabled = true; });
                    try {
                        const out = await onSubmit(v, data, inner);
                        if (out !== false) $("#dialog").close(v);
                    } catch (err) { msg.hidden = false; msg.textContent = err.message; if (typeof Motion !== "undefined") Motion.pop(msg); }
                    finally { $$(".dialog-actions .btn", inner).forEach(b => { b.disabled = false; }); }
                };
                inner._hrSubmit = handler;
                inner.addEventListener("submit", handler, true);
                $("#dialog").addEventListener("close", () => { if (inner._hrSubmit === handler) { inner.removeEventListener("submit", handler, true); inner._hrSubmit = null; } }, { once: true });
                if (onOpen) onOpen(inner);
            }
        });
    },
    /* Close the open dialog and wait until it has really closed (before opening the next one) */
    closeDlg(v = "done") { return new Promise(res => { const d = $("#dialog"); if (!d.open) return res(); d.addEventListener("close", () => setTimeout(res, 0), { once: true }); d.close(v); }); },
    animate(sec) {
        if (typeof Motion === "undefined") return;
        $$(".ledger-strip .ls-value", sec).forEach(el => { if (/\d/.test(el.textContent) && !/:/.test(el.textContent)) Motion.countUp(el, { duration: 800 }); });
        Motion.grow($$(".hr-bar i, .hr-bal-bar i, .hr-dept i", sec), { axis: "y", delay: 150 });
    },

    /* ==========================================================
       MY DAY — the clock-in panel
       ========================================================== */
    async pageMyDay(sec) {
        const [t, d] = await Promise.all([this.api("GET", "me/today"), this.api("GET", "me/dashboard")]);
        if (!this.stillOn("me")) return;
        const me = this.cfg.me, s = this.cfg.settings;
        const hr = Number(this.nowParts().hour);
        const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
        const bal = d.leave, caps = s.leaveDefaults;
        sec.innerHTML = this.head(`${greet}, ${esc(me.name.split(" ")[0])}.`, "", `<a class="btn btn-ghost" href="#hr/my-leave">${icon("plane")}<span>Request leave</span></a>`, `${esc(me.designation || "Team member")}${me.department ? " · " + esc(me.department) : ""}`) + `
<div class="hr-today">
  <section class="hr-clock" id="hrClock" aria-label="Clock in and out"></section>
  <section class="card hr-bal-card">
    <header class="card-head"><div><h2>Leave balance</h2><p class="card-sub">Working days left this year</p></div><a class="card-link" href="#hr/my-leave">My leave</a></header>
    <div class="hr-bals">${["annual", "sick", "casual"].map(k => `<div class="hr-bal">
      <div class="hr-bal-top"><span>${this.LEAVE[k]} leave</span><b>${bal[k]}<small> / ${caps[k]} days</small></b></div>
      <div class="hr-bal-bar hr-bal-${k}"><i style="width:${Math.max(0, Math.min(100, bal[k] / (caps[k] || 1) * 100))}%"></i></div></div>`).join("")}</div>
    <div class="card-foot"><span class="muted">${d.pendingLeaves ? `${d.pendingLeaves} request${d.pendingLeaves === 1 ? "" : "s"} waiting for HR` : "No requests waiting"}</span></div>
  </section>
</div>
<div class="ledger-strip hr-kpis">
  ${this.kpi("Days present", d.presentDays, `In ${this.monthLabel(d.month)}`)}
  ${this.kpi("Late arrivals", d.lateDays, "This month", d.lateDays ? this.chip("warn", "late", "clock") : this.chip("good", "on time", "check"))}
  ${this.kpi("Hours worked", `${Math.round(d.hours)}<span class="ls-cur hr-unit">h</span>`, this.hours(d.hours) + " this month")}
  ${this.kpi("Pending leave", d.pendingLeaves, "Awaiting HR", "", "#hr/my-leave")}
</div>
<div class="bento hr-bento">
  <section class="card bento-8 hr-card">
    <header class="card-head"><div><h2>Recent days</h2><p class="card-sub">Your last clock-ins</p></div><a class="card-link" href="#hr/my-attendance">All</a></header>
    ${d.recent.length ? `<ul class="hr-days">${d.recent.map(r => `<li><span class="hr-daydate"><b>${this.d(r.date, { day: "2-digit" })}</b>${this.d(r.date, { month: "short" })}</span><span class="hr-dayname">${this.d(r.date, { weekday: "long" })}</span><span class="hr-times">${r.clockInLocal || "—"} <i>→</i> ${r.clockOutLocal || (r.clockIn && r.date === this.today() ? "now" : "—")}</span><span class="hr-dayhrs">${this.hours(r.hours)}</span>${this.pill(r.status)}</li>`).join("")}</ul>`
        : `<div class="empty empty-sm"><div class="empty-art">${icon("clock", 24)}</div><p>No attendance yet. Clock in above to start your record.</p></div>`}
  </section>
  ${this.holidayCard(d.upcomingHolidays, "bento-4")}
</div>`;
        this.drawClock(t, d);
        this.animate(sec);
    },
    drawClock(t, d) {
        const box = $("#hrClock"); if (!box) return;
        const rec = t.record, s = this.cfg.settings;
        const state = !rec || !rec.clockIn ? "out" : rec.clockOut ? "done" : "in";
        const special = d.todayHoliday ? `Public holiday · ${esc(d.todayHoliday)}` : d.onLeave ? `On ${esc(this.LEAVE[d.onLeave.leaveType].toLowerCase())} leave today` : d.weekend ? "Weekend" : "";
        const status = state === "out" ? (special ? `${special}. Working anyway? You can still clock in.` : "You haven't clocked in yet today.")
            : state === "in" ? `Clocked in at <b>${rec.clockInLocal}</b>${rec.status === "late" ? ` <span class="hr-late">· marked late</span>` : " · on time"}`
            : `Day complete · <b>${this.hours(rec.hours)}</b> logged (${rec.clockInLocal} → ${rec.clockOutLocal})`;
        const btn = state === "out" ? `<button type="button" class="hr-punch" id="hrPunch" data-act="clock-in">${icon("logIn", 20)}<span>Clock in</span></button>`
            : state === "in" ? `<button type="button" class="hr-punch is-out" id="hrPunch" data-act="clock-out">${icon("logOut", 20)}<span>Clock out</span></button>`
            : `<div class="hr-punch is-done" role="status">${icon("circleCheck", 20)}<span>See you tomorrow</span></div>`;
        box.className = `hr-clock state-${state}`;
        box.innerHTML = `
<div class="hr-clock-top"><span class="hr-live"><i></i>Office time · ${esc(s.timezone.replace(/_/g, " "))}</span>${special ? `<span class="hr-clock-tag">${special}</span>` : ""}</div>
<div class="hr-clock-face" aria-live="off"><span class="hr-hm" id="hrHM">--:--</span><span class="hr-ss" id="hrSS">--</span></div>
<div class="hr-clock-date" id="hrDate"></div>
<div class="hr-clock-row">
  <div class="hr-clock-status"><p id="hrStatus">${status}</p><p class="hr-clock-shift">Shift starts ${esc(s.shiftStart)} · ${s.graceMinutes} min grace${state === "in" ? ` · <span id="hrElapsed"></span> so far` : ""}</p></div>
  ${btn}
</div>
<div class="hr-track" aria-hidden="true"><i style="width:0%"></i>${rec && rec.clockIn ? `<b class="hr-track-in" style="left:0">${rec.clockInLocal}</b>` : ""}</div>`;
        const tick = () => {
            if (!document.body.contains(box)) { clearInterval(this._tick); return; }
            const p = this.nowParts();
            $("#hrHM").textContent = `${p.hour}:${p.minute}`;
            $("#hrSS").textContent = p.second;
            $("#hrDate").textContent = `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
            const el = $("#hrElapsed");
            if (el && rec && rec.clockIn) { const mins = Math.max(0, Math.floor((Date.now() - rec.clockIn) / 60000)); el.textContent = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`; }
            // the day bar: share of an 8-hour day
            const bar = $(".hr-track i", box);
            if (bar && rec && rec.clockIn) { const end = rec.clockOut || Date.now(); bar.style.width = Math.min(100, (end - rec.clockIn) / (8 * 3600000) * 100).toFixed(1) + "%"; }
        };
        tick();
        clearInterval(this._tick);
        this._tick = setInterval(tick, 1000);
        const b = $("#hrPunch", box);
        if (b && b.tagName === "BUTTON") b.addEventListener("click", async () => {
            b.disabled = true; b.classList.add("busy");
            const act = b.dataset.act;
            const r = await this.run(() => this.api("POST", "me/" + act));
            if (r) {
                toast(act === "clock-in" ? `Clocked in at ${r.record.clockInLocal}${r.record.status === "late" ? " · marked late" : ""}` : `Clocked out at ${r.record.clockOutLocal} · ${this.hours(r.record.hours)} today`, r.record.status === "late" && act === "clock-in" ? "warn" : "good");
                await this.pageMyDay(this.sec);
                if (typeof Motion !== "undefined") Motion.pop($("#hrPunch") || $(".hr-punch"));
            } else { b.disabled = false; b.classList.remove("busy"); }
        });
    },
    holidayCard(list, cls = "bento-4") {
        return `<section class="card ${cls} hr-card hr-hol-card">
    <header class="card-head"><div><h2>Upcoming holidays</h2><p class="card-sub">UAE public holidays</p></div><a class="card-link" href="#hr/holidays">All</a></header>
    ${list.length ? `<ul class="hr-hols">${list.map(h => { const n = Math.round((Date.parse(h.date) - Date.parse(this.today())) / 86400000); return `<li><span class="hr-daydate is-hol"><b>${this.d(h.date, { day: "2-digit" })}</b>${this.d(h.date, { month: "short" })}</span><div><b>${esc(h.name)}</b><small>${this.d(h.date, { weekday: "long" })}${h.estimated ? " · estimated" : ""}</small></div><span class="hr-in">${n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`}</span></li>`; }).join("")}</ul>`
        : `<div class="empty empty-sm"><div class="empty-art">${icon("flag", 24)}</div><p>No holidays coming up on the calendar.</p></div>`}
  </section>`;
    },

    /* ==========================================================
       MY ATTENDANCE
       ========================================================== */
    async pageMyAttendance(sec, params) {
        const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : this.today().slice(0, 7);
        const r = await this.api("GET", "me/attendance?month=" + month);
        if (!this.stillOn("my-attendance")) return;
        const recs = r.records, worked = recs.filter(x => x.clockIn);
        const hrs = worked.reduce((s, x) => s + x.hours, 0);
        sec.innerHTML = this.head("My attendance", "Your clock-ins and clock-outs, in office time. HR corrects mistakes — ask them if something is wrong.", this.monthNav(month, "#hr/my-attendance")) + `
<div class="ledger-strip hr-kpis three">
  ${this.kpi("Days present", worked.length, this.monthLabel(month))}
  ${this.kpi("Late arrivals", worked.filter(x => x.status === "late").length, `After ${esc(this.cfg.settings.shiftStart)} + ${this.cfg.settings.graceMinutes} min`)}
  ${this.kpi("Hours worked", `${Math.round(hrs)}<span class="ls-cur hr-unit">h</span>`, this.hours(hrs))}
</div>` + (recs.length ? `<div class="table-card hr-mt"><table class="dtable"><thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th class="num">Hours</th><th>Status</th><th>Note</th></tr></thead><tbody>${recs.map(x => `<tr><td><b>${this.dDay(x.date)}</b></td><td class="hr-mono">${x.clockInLocal || "—"}</td><td class="hr-mono">${x.clockOutLocal || (x.clockIn && x.date === this.today() ? '<span class="muted">working</span>' : "—")}</td><td class="num">${this.hours(x.hours)}</td><td>${this.pill(x.status)}${x.edited ? ' <span class="hr-edited" data-tip="Corrected by HR">edited</span>' : ""}</td><td class="hr-note">${esc(x.notes || "")}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("calendarCheck", "Nothing recorded in " + this.monthLabel(month), "Clock-ins appear here as soon as you make them on My day.", `<a class="btn btn-primary" href="#hr/me">Go to My day</a>`)}</div>`);
        this.bindMonthNav(sec, "#hr/my-attendance");
    },
    /* A month or date shown as words, with the browser's own picker underneath */
    picker(type, value, label, attrs = "") {
        return `<label class="hr-pick"><span>${esc(label)}</span><input type="${type}" value="${value}" ${attrs}></label>`;
    },
    bindPickers(root) {
        $$(".hr-pick input", root).forEach(inp => inp.addEventListener("click", () => { try { inp.showPicker && inp.showPicker(); } catch { /* not supported */ } }));
    },
    monthNav(month, base) {
        return `<div class="hr-monthnav" role="group" aria-label="Month"><button type="button" class="icon-btn" data-mn="-1" aria-label="Previous month">${icon("chevLeft", 16)}</button>${this.picker("month", month, this.monthLabel(month), 'aria-label="Month" data-mn-input')}<button type="button" class="icon-btn" data-mn="1" aria-label="Next month">${icon("chevRight", 16)}</button></div>`;
    },
    bindMonthNav(sec, base, key = "month") {
        const inp = $("[data-mn-input]", sec); if (!inp) return;
        this.bindPickers(sec);
        const go = m => { if (/^\d{4}-\d{2}$/.test(m)) location.hash = `${base}?${key}=${m}`; };
        $$("[data-mn]", sec).forEach(b => b.addEventListener("click", () => go(this.addMonths(inp.value || this.today().slice(0, 7), Number(b.dataset.mn)))));
        inp.addEventListener("change", () => go(inp.value));
    },

    /* ==========================================================
       MY LEAVE
       ========================================================== */
    async pageMyLeave(sec) {
        const r = await this.api("GET", "me/leaves");
        if (!this.stillOn("my-leave")) return;
        const caps = this.cfg.settings.leaveDefaults;
        const used = t => r.leaves.filter(l => l.leaveType === t && l.status === "approved").reduce((s, l) => s + l.days, 0);
        sec.innerHTML = this.head("My leave", "Ask for time off and follow your requests. Weekends and public holidays are never counted.", `<button type="button" class="btn btn-primary" id="hrApply">${icon("plus")}<span>Request leave</span></button>`) + `
<div class="ledger-strip hr-kpis">
  ${["annual", "sick", "casual"].map(k => this.kpi(`${this.LEAVE[k]} leave`, `${r.leave[k]}<span class="ls-cur hr-unit">days</span>`, `of ${caps[k]} · ${used(k)} taken`, "", "", `hr-ls-${k}`)).join("")}
  ${this.kpi("Unpaid leave", `${used("unpaid")}<span class="ls-cur hr-unit">days</span>`, "Taken · deducted from pay")}
</div>` + (r.leaves.length ? `<div class="table-card hr-mt"><table class="dtable hr-cards" id="hrMyLeaves"><thead><tr><th>Type</th><th>Dates</th><th class="num">Days</th><th>Reason</th><th>Status</th><th>HR note</th><th></th></tr></thead><tbody>${r.leaves.map(l => `<tr data-id="${esc(l.id)}"><td>${this.leavePill(l.leaveType)}</td><td><b>${this.range(l.startDate, l.endDate)}</b></td><td class="num hr-dcell">${l.days}<span class="hr-dunit"> working day${l.days === 1 ? "" : "s"}</span></td><td class="hr-note">${esc(l.reason || "—")}</td><td class="hr-st">${this.pill(l.status)}</td><td class="hr-note">${esc(l.adminNote ? "HR: " + l.adminNote : "")}</td><td class="num">${l.status === "pending" ? `<button type="button" class="btn btn-ghost btn-sm" data-cancel="${esc(l.id)}">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("plane", "No leave requests yet", "When you need time off, request it here. HR is notified straight away, and you'll get a notification when they decide.", `<button type="button" class="btn btn-primary" data-apply>${icon("plus")}<span>Request leave</span></button>`)}</div>`);
        $("#hrApply").addEventListener("click", () => this.applyDialog(r.leave));
        $$("[data-apply]", sec).forEach(b => b.addEventListener("click", () => this.applyDialog(r.leave)));
        $$("[data-cancel]", sec).forEach(b => b.addEventListener("click", async () => {
            if (!await confirmDialog("Cancel this leave request? HR won't see it any more.", "Cancel request", true, "Cancel request")) return;
            if (await this.run(() => this.api("DELETE", "me/leaves/" + b.dataset.cancel), "Request cancelled.")) this.render();
        }));
        this.animate(sec);
    },
    async applyDialog(balance) {
        let hols = new Set();
        try { const y = Number(this.today().slice(0, 4)); const [a, b] = await Promise.all([this.api("GET", "holidays?year=" + y), this.api("GET", "holidays?year=" + (y + 1))]); hols = new Set([...a.holidays, ...b.holidays].map(h => h.date)); } catch { /* preview only */ }
        const wk = this.cfg.settings.weekend;
        const t0 = this.today();
        const r = await this.dialog({
            title: "Request leave",
            body: `<div class="form-grid grid-2">
  <div class="field span-2"><label for="lv1">Type of leave</label><select id="lv1" name="leaveType">${["annual", "sick", "casual", "unpaid"].map(k => `<option value="${k}">${this.LEAVE[k]} leave${k === "unpaid" ? "" : ` — ${balance[k]} day${balance[k] === 1 ? "" : "s"} left`}</option>`).join("")}</select></div>
  <div class="field"><label for="lv2">First day</label><input id="lv2" name="startDate" type="date" value="${t0}" required></div>
  <div class="field"><label for="lv3">Last day</label><input id="lv3" name="endDate" type="date" value="${t0}" required></div>
  <div class="field span-2"><label for="lv4">Reason <span class="opt">optional</span></label><textarea id="lv4" name="reason" rows="2" placeholder="e.g. Family visit"></textarea></div>
</div>
<div class="hr-lvcount" id="hrLvCount" aria-live="polite"></div>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: "Send request", value: "ok", primary: true }],
            onOpen: inner => {
                const upd = () => {
                    const a = $("#lv2", inner).value, b = $("#lv3", inner).value, type = $("#lv1", inner).value;
                    const box = $("#hrLvCount", inner);
                    if (!a || !b || b < a) { box.className = "hr-lvcount is-bad"; box.innerHTML = `${icon("alert", 16)}<span>The last day must be on or after the first day.</span>`; return; }
                    let n = 0, cal = 0; for (let d = a; d <= b && cal < 400; d = this.addDays(d, 1), cal++) if (!wk.includes(this.dow(d)) && !hols.has(d)) n++;
                    const left = type === "unpaid" ? Infinity : balance[type];
                    const bad = !n || n > left;
                    box.className = "hr-lvcount" + (bad ? " is-bad" : "");
                    box.innerHTML = `<b>${n}</b><span>working day${n === 1 ? "" : "s"}${cal > n ? ` · ${cal - n} weekend or holiday day${cal - n === 1 ? "" : "s"} not counted` : ""}${!n ? " — choose dates with a working day" : n > left ? ` — only ${left} ${type} day${left === 1 ? "" : "s"} left` : type !== "unpaid" ? ` · ${left - n} left after` : " · deducted from pay"}</span>`;
                };
                $$("#lv1, #lv2, #lv3", inner).forEach(el => el.addEventListener("input", upd));
                $("#lv2", inner).addEventListener("change", () => { if ($("#lv3", inner).value < $("#lv2", inner).value) $("#lv3", inner).value = $("#lv2", inner).value; upd(); });
                upd();
            },
            onSubmit: async (v, data) => { await this.api("POST", "me/leaves", data); }
        });
        if (r.value === "ok") { toast("Leave requested. HR has been notified.", "good"); this.render(); }
    },

    /* ==========================================================
       MY PAYSLIPS
       ========================================================== */
    async pageMyPayslips(sec) {
        const r = await this.api("GET", "me/payslips");
        if (!this.stillOn("my-payslips")) return;
        const list = r.payslips, year = this.today().slice(0, 4);
        const ytd = list.filter(p => (p.run.period || "").startsWith(year));
        const last = list[0];
        this._slips = list; this._div = r.divisor;
        sec.innerHTML = this.head("My payslips", "Your salary slips from approved pay runs. Open one to see the details or print it.") + (list.length ? `
<div class="ledger-strip hr-kpis three">
  ${this.kpi("Latest net pay", `<span class="ls-cur">AED</span>${fmt(last.line.net)}`, this.monthLabel(last.run.period))}
  ${this.kpi(`Net pay ${year}`, `<span class="ls-cur">AED</span>${fmt(ytd.reduce((s, p) => s + p.line.net, 0))}`, `${ytd.length} payslip${ytd.length === 1 ? "" : "s"}`)}
  ${this.kpi(`Gross pay ${year}`, `<span class="ls-cur">AED</span>${fmt(ytd.reduce((s, p) => s + p.line.gross, 0))}`, "Before deductions")}
</div>
<div class="table-card hr-mt"><table class="dtable" id="hrSlips"><thead><tr><th>Month</th><th>Pay run</th><th>Pay date</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net pay</th><th>Status</th><th></th></tr></thead><tbody>${list.map((p, i) => `<tr data-row="${i}" tabindex="0"><td><b>${this.monthLabel(p.run.period)}</b></td><td class="muted">${esc(p.run.number)}</td><td>${this.d(p.run.status === "paid" && p.run.payment ? p.run.payment.date : p.run.date)}</td><td class="num">${fmt(p.line.gross)}</td><td class="num">${fmt(p.line.totalDeductions)}</td><td class="num"><b>${fmt(p.line.net)}</b></td><td>${p.run.status === "paid" ? this.pill("approved", "Paid") : this.pill("pending", "Approved, to be paid")}</td><td class="num"><button type="button" class="btn btn-ghost btn-sm" data-slip="${i}">${icon("print", 15)}<span>Print</span></button></td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("banknote", "No payslips yet", "Your salary slips appear here once HR approves the month's pay run.")}</div>`);
        $$("#hrSlips tr[data-row]", sec).forEach(tr => {
            const open = () => this.slipDialog(list[Number(tr.dataset.row)]);
            tr.addEventListener("click", e => { if (!e.target.closest("button")) open(); });
            tr.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
        });
        $$("[data-slip]", sec).forEach(b => b.addEventListener("click", () => this.printSlip(list[Number(b.dataset.slip)])));
        this.animate(sec);
    },
    printSlip(p) {
        if (typeof Finance === "undefined" || !Finance.printSlips) { toast("Printing isn't available here.", "warn"); return; }
        Finance.printSlips({ ...p.run, payDivisor: p.run.payDivisor || this._div }, [p.line]);
    },
    async slipDialog(p) {
        const l = p.line, E = (typeof Finance !== "undefined" && Finance.EARN_LABEL) || {}, D = (typeof Finance !== "undefined" && Finance.DED_LABEL) || {};
        const rows = (list, lab) => list.length ? list.map(x => `<li><span>${esc(x.label || lab[x.type] || x.type)}</span><b>${fmt(x.amount)}</b></li>`).join("") : `<li class="muted"><span>None</span><b></b></li>`;
        const r = await openDialog({
            title: `Payslip · ${this.monthLabel(p.run.period)}`, wide: true,
            body: `<div class="hr-slip">
  <div class="hr-slip-net"><span>Net pay</span><b><small>AED</small>${fmt(l.net)}</b><em>${p.run.status === "paid" ? `Paid on ${this.d(p.run.payment ? p.run.payment.date : p.run.date)}` : "Approved, to be paid"}</em></div>
  <div class="hr-slip-cols"><div><h3>Earnings</h3><ul>${rows(l.earnings || [], E)}</ul><div class="hr-slip-tot"><span>Gross pay</span><b>${fmt(l.gross)}</b></div></div>
  <div><h3>Deductions</h3><ul>${rows(l.deductions || [], D)}</ul><div class="hr-slip-tot"><span>Total deductions</span><b>${fmt(l.totalDeductions)}</b></div></div></div>
  ${l.commissionNote ? `<p class="hint">Commission: ${esc(l.commissionNote)}</p>` : ""}
</div>`,
            actions: [{ label: "Close", value: "cancel" }, { label: "Print payslip", value: "print", primary: true }]
        });
        if (r.value === "print") this.printSlip(p);
    },

    /* ==========================================================
       HOLIDAYS (everyone; HR managers can change them)
       ========================================================== */
    async pageHolidays(sec, params) {
        const year = Number(params.get("year")) || Number(this.today().slice(0, 4));
        const manage = this.canManage();
        const [r, rem] = await Promise.all([this.api("GET", "holidays?year=" + year), manage ? this.api("GET", "holidays/reminders") : Promise.resolve(null)]);
        if (!this.stillOn("holidays")) return;
        const t = this.today();
        const next = r.holidays.find(h => h.date >= t);
        const est = r.holidays.filter(h => h.estimated).length;
        sec.innerHTML = this.head("Public holidays", "UAE public holidays. Islamic holidays depend on the moon sighting, so they are <b>estimated</b> until the UAE Cabinet announces the dates.",
            `<div class="hr-monthnav" role="group" aria-label="Year"><button type="button" class="icon-btn" data-yr="${year - 1}" aria-label="Previous year">${icon("chevLeft", 16)}</button><span class="hr-year">${year}</span><button type="button" class="icon-btn" data-yr="${year + 1}" aria-label="Next year">${icon("chevRight", 16)}</button></div>${manage ? `<button type="button" class="btn btn-primary" id="hrAddHol">${icon("plus")}<span>Add holiday</span></button>` : ""}`) +
            (manage && rem ? this.reminderBanner(rem.items) : "") + `
<div class="ledger-strip hr-kpis three">
  ${this.kpi(`Holidays in ${year}`, r.holidays.length, `${new Set(r.holidays.map(h => h.name.replace(/ holiday$/i, ""))).size} occasions`)}
  ${this.kpi("Estimated dates", est, est ? "Waiting for the official announcement" : "All dates confirmed", est ? this.chip("warn", "moon sighting") : this.chip("good", "confirmed", "check"))}
  ${this.kpi("Next holiday", next ? this.dShort(next.date) : "—", next ? esc(next.name) : "None left this year")}
</div>` + (r.holidays.length ? `<div class="table-card hr-mt"><table class="dtable" id="hrHolTable"><thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Status</th>${manage ? "<th></th>" : ""}</tr></thead><tbody>${r.holidays.map(h => `<tr class="${h.date < t ? "hr-past" : ""}${next && h.date === next.date ? " hr-next" : ""}" data-date="${h.date}"><td><b>${this.d(h.date)}</b></td><td class="muted">${this.d(h.date, { weekday: "long" })}</td><td>${esc(h.name)}</td><td>${h.estimated ? this.pill("pending", "Estimated") : this.pill("approved", "Confirmed")}</td>${manage ? `<td class="num hr-rowact"><button type="button" class="icon-btn" data-edit="${esc(h.id)}" aria-label="Edit ${esc(h.name)}" data-tip="Edit">${icon("pen", 15)}</button><button type="button" class="icon-btn" data-del="${esc(h.id)}" aria-label="Delete ${esc(h.name)}" data-tip="Delete">${icon("trash", 15)}</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("flag", `No holidays for ${year}`, manage ? "Add the public holidays for this year once they are announced." : "HR hasn't added holidays for this year yet.", manage ? `<button type="button" class="btn btn-primary" data-addhol>${icon("plus")}<span>Add holiday</span></button>` : "")}</div>`);
        $$("[data-yr]", sec).forEach(b => b.addEventListener("click", () => { location.hash = "#hr/holidays?year=" + b.dataset.yr; }));
        if (manage) {
            const byId = id => r.holidays.find(h => h.id === id);
            $("#hrAddHol")?.addEventListener("click", () => this.holidayDialog(null, year));
            $$("[data-addhol]", sec).forEach(b => b.addEventListener("click", () => this.holidayDialog(null, year)));
            $$("[data-edit]", sec).forEach(b => b.addEventListener("click", () => this.holidayDialog(byId(b.dataset.edit), year)));
            $$("[data-del]", sec).forEach(b => b.addEventListener("click", async () => {
                const h = byId(b.dataset.del);
                if (!await confirmDialog(`Delete "${h.name}" on ${this.d(h.date)}? Leave already requested over this date keeps its day count.`, "Delete", true, "Delete holiday")) return;
                if (await this.run(() => this.api("DELETE", "holidays/" + h.id), "Holiday deleted.")) this.render();
            }));
            this.bindReminders(sec);
        }
        this.animate(sec);
    },
    async holidayDialog(h, year) {
        const r = await this.dialog({
            title: h ? "Edit holiday" : "Add holiday",
            body: `<div class="form-grid grid-2"><div class="field"><label for="hd1">Date</label><input id="hd1" name="date" type="date" value="${h ? h.date : `${year}-01-01`}" required></div>
<div class="field"><label for="hd2">Name</label><input id="hd2" name="name" value="${esc(h ? h.name : "")}" placeholder="e.g. Eid al-Fitr" required></div>
<label class="check span-2"><input type="checkbox" name="estimated"${h && h.estimated ? " checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Estimated date<small>Islamic holidays depend on the moon sighting. You'll be reminded to confirm them ${this.cfg.settings.reminderDays} days before.</small></span></label></div>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: h ? "Save" : "Add holiday", value: "ok", primary: true }],
            onSubmit: async (v, d) => { await this.api(h ? "PUT" : "POST", h ? "holidays/" + h.id : "holidays", { date: d.date, name: d.name, estimated: !!d.estimated }); }
        });
        if (r.value === "ok") { toast(h ? "Holiday saved." : "Holiday added.", "good"); this.render(); }
    },
    reminderBanner(items) {
        if (!items || !items.length) return "";
        return `<div class="hr-remind" id="hrRemind" role="region" aria-label="Holiday dates to confirm">
  <div class="hr-remind-ic">${icon("bell", 18)}</div>
  <div class="hr-remind-body"><div class="hr-remind-title">Confirm holiday dates</div>
  <p>These holidays depend on the moon sighting. Check the official UAE announcement, then edit the dates if they changed, or mark them confirmed.</p>
  <ul>${items.map(g => `<li><div><b>${esc(g.name)}</b> <span class="muted">· est. ${this.range(g.startDate, g.endDate)}</span><small>${g.daysUntil === 0 ? "Starts today" : `Starts in ${g.daysUntil} day${g.daysUntil === 1 ? "" : "s"}`} · ${g.ids.length} day${g.ids.length === 1 ? "" : "s"} off</small></div>
  <div class="hr-remind-act"><a class="btn btn-ghost btn-sm" href="#hr/holidays?year=${g.startDate.slice(0, 4)}">Review dates</a><button type="button" class="btn btn-primary btn-sm" data-confirm="${esc(g.ids.join(","))}" data-name="${esc(g.name)}">${icon("check", 14)}<span>Mark as confirmed</span></button></div></li>`).join("")}</ul></div></div>`;
    },
    bindReminders(sec) {
        $$("[data-confirm]", sec).forEach(b => b.addEventListener("click", async () => {
            b.disabled = true;
            if (await this.run(() => this.api("POST", "holidays/confirm", { ids: b.dataset.confirm.split(",") }), `${b.dataset.name} marked as confirmed.`)) this.render();
            else b.disabled = false;
        }));
    },

    /* ==========================================================
       HR SETTINGS — a tab in Settings (owner and admins)
       ========================================================== */
    settingsTab() {
        if (typeof SETTINGS_TABS === "undefined") return;
        const i = SETTINGS_TABS.findIndex(t => t[0] === "hr");
        if (this.isAdmin() && i < 0) SETTINGS_TABS.splice(SETTINGS_TABS.length - 1, 0, ["hr", "HR & attendance"]);
        if (!this.isAdmin() && i >= 0) SETTINGS_TABS.splice(i, 1);
    },
    renderSettingsTab(body) {
        if (!this.isAdmin()) { body.innerHTML = `<div class="panel"><h2>HR & attendance</h2><p class="panel-sub">Only the owner or an admin can change these settings.</p></div>`; return; }
        const s = this.cfg.settings;
        const zones = ["Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait", "Asia/Muscat", "Asia/Kolkata", "Asia/Karachi", "Asia/Singapore", "Europe/London", "Europe/Zurich", "America/New_York"];
        if (!zones.includes(s.timezone)) zones.unshift(s.timezone);
        const order = [1, 2, 3, 4, 5, 6, 0];
        body.innerHTML = `<div class="panel hr-settings">
<h2>HR & attendance</h2>
<p class="panel-sub">Office hours, the working week and leave rules for the HR area. Changes apply from the next clock-in or leave request.</p>
<div class="grid-2">
  <div class="field"><label for="hs1">Office time zone</label><select id="hs1" name="timezone">${zones.map(z => `<option value="${z}"${z === s.timezone ? " selected" : ""}>${z.replace(/_/g, " ")}</option>`).join("")}</select><div class="hint">Clock-ins and "today" follow this zone.</div></div>
  <div class="field"><label for="hs2">Shift starts</label><input id="hs2" name="shiftStart" type="time" value="${esc(s.shiftStart)}"></div>
  <div class="field"><label for="hs3">Grace minutes</label><input id="hs3" name="graceMinutes" type="number" min="0" max="240" value="${s.graceMinutes}"><div class="hint">Clocking in later than shift start + grace is marked late.</div></div>
  <div class="field"><label for="hs4">Holiday reminder (days ahead)</label><input id="hs4" name="reminderDays" type="number" min="0" max="120" value="${s.reminderDays}"><div class="hint">HR is reminded to confirm estimated holidays this many days before.</div></div>
  <div class="field span-2"><label>Weekend days</label><div class="chips hr-wk" id="hsWk">${order.map(d => `<button type="button" class="chip${s.weekend.includes(d) ? " on" : ""}" data-d="${d}" aria-pressed="${s.weekend.includes(d)}">${this.DAYS[d].slice(0, 3)}</button>`).join("")}</div><div class="hint">Not counted as working days in leave requests and reports.</div></div>
</div>
<h3 class="panel-h3">Leave</h3>
<div class="grid-3">
  <div class="field"><label for="hs5">Annual leave (days)</label><input id="hs5" name="ld_annual" type="number" min="0" max="365" value="${s.leaveDefaults.annual}"></div>
  <div class="field"><label for="hs6">Sick leave (days)</label><input id="hs6" name="ld_sick" type="number" min="0" max="365" value="${s.leaveDefaults.sick}"></div>
  <div class="field"><label for="hs7">Casual leave (days)</label><input id="hs7" name="ld_casual" type="number" min="0" max="365" value="${s.leaveDefaults.casual}"></div>
</div>
<p class="hint">Starting balances for new employees. Change one person's balance on their employee record.</p>
<div class="grid-2 hr-mt">
  <div class="field"><label for="hs8">Leave clash warning (% of a department)</label><input id="hs8" name="clashPercent" type="number" min="1" max="100" value="${s.clashPercent}"><div class="hint">Warn before approving leave that puts at least this share of a department — and at least 2 people — off at once.</div></div>
  <div class="field"><label for="hs9">Days in a pay month</label><input id="hs9" name="payDivisor" type="number" min="1" max="31" value="${s.payDivisor}"><div class="hint">Unpaid leave on a pay run = monthly fixed pay ÷ this × days.</div></div>
</div>
<div class="hr-settings-foot"><span class="hint" id="hsMsg"></span><button type="button" class="btn btn-primary" id="hsSave">${icon("save")}<span>Save HR settings</span></button></div>
</div>`;
        $$("#hsWk .chip", body).forEach(c => c.addEventListener("click", () => { c.classList.toggle("on"); c.setAttribute("aria-pressed", c.classList.contains("on")); }));
        $("#hsSave", body).addEventListener("click", async () => {
            const v = n => $(`[name="${n}"]`, body).value;
            const payload = { timezone: v("timezone"), shiftStart: v("shiftStart"), graceMinutes: Number(v("graceMinutes")), reminderDays: Number(v("reminderDays")), clashPercent: Number(v("clashPercent")), payDivisor: Number(v("payDivisor")),
                weekend: $$("#hsWk .chip.on", body).map(c => Number(c.dataset.d)), leaveDefaults: { annual: Number(v("ld_annual")), sick: Number(v("ld_sick")), casual: Number(v("ld_casual")) } };
            const r = await this.run(() => this.api("PUT", "settings", payload), "HR settings saved.");
            if (r) { this.cfg.settings = r.settings; $("#hsMsg", body).textContent = `Saved · shift ${r.settings.shiftStart}, weekend ${r.settings.weekend.map(d => this.DAYS[d].slice(0, 3)).join(" + ") || "none"}`; }
        });
    },

    /* ==========================================================
       PAYROLL — unpaid leave and absence for a pay run
       ========================================================== */
    async payrollFigures(period) {
        if (!this.online() || !/^\d{4}-\d{2}$/.test(period || "")) return null;
        try {
            const r = await Server.get("hr/payroll?month=" + period);
            return { divisor: r.divisor, month: r.month, rows: Object.fromEntries(r.rows.map(x => [x.employeeId, x])) };
        } catch { return null; }
    },
    payNote(fig, employeeId) {
        const x = fig && fig.rows[employeeId];
        if (!x || (!x.unpaidLeaveDays && !x.absentDays)) return "";
        const parts = [];
        if (x.unpaidLeaveDays) parts.push(`${x.unpaidLeaveDays} unpaid leave`);
        if (x.absentDays) parts.push(`${x.absentDays} absent`);
        return `<div class="small hr-paynote" data-tip="From HR for ${esc(this.monthLabel(fig.month))}: approved unpaid leave, plus working days without a clock-in or approved leave (only for people who clock in). Pre-filled as unpaid days; change it if needed.">${icon("idCard", 12)}HR: ${parts.join(" · ")}</div>`;
    }
};
window.HR = HR;

/* ==========================================================
   Notifications bell (top bar)
   ========================================================== */
const Bell = {
    items: [], unread: 0, _t: null, open: false,
    start() {
        this.mount();
        this.refresh();
        clearInterval(this._t);
        this._t = setInterval(() => { if (document.visibilityState === "visible") this.refresh(); }, 45000);
        if (!this._vis) { this._vis = true; document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && HR.online()) this.refresh(); }); }
    },
    mount() {
        const host = $("#notifyBell"); if (!host || $("#hrBell")) return;
        host.className = "hr-bell-host";
        host.innerHTML = `<button type="button" class="icon-btn hr-bell" id="hrBell" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications">${icon("bell", 18)}<span class="hr-bell-n" id="hrBellN" hidden></span></button>
<div class="hr-notif" id="hrNotif" hidden role="dialog" aria-label="Notifications"></div>`;
        $("#hrBell").addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
        document.addEventListener("mousedown", e => { if (this.open && !e.target.closest("#notifyBell")) this.toggle(false); });
        document.addEventListener("keydown", e => { if (this.open && e.key === "Escape") { this.toggle(false); $("#hrBell").focus(); } });
    },
    async refresh() {
        if (!HR.online()) return;
        try { const r = await Server.get("hr/notifications"); this.items = r.items; this.unread = r.unread; }
        catch { return; }
        this.paint();
        if (this.open) this.drawPanel();
    },
    paint() {
        const n = $("#hrBellN"); if (!n) return;
        const before = n.textContent;
        n.hidden = !this.unread;
        n.textContent = this.unread > 9 ? "9+" : String(this.unread || "");
        $("#hrBell").setAttribute("aria-label", this.unread ? `Notifications, ${this.unread} unread` : "Notifications");
        if (this.unread && before !== n.textContent && typeof Motion !== "undefined") Motion.pop(n);
    },
    toggle(force) {
        this.open = force === undefined ? !this.open : force;
        const p = $("#hrNotif"); if (!p) return;
        p.hidden = !this.open;
        $("#hrBell").setAttribute("aria-expanded", String(this.open));
        if (this.open) { this.drawPanel(); this.refresh(); if (typeof Motion !== "undefined") Motion.pop(p); }
    },
    ago(t) {
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return `${Math.floor(s / 60)} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
        return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    },
    drawPanel() {
        const p = $("#hrNotif"); if (!p) return;
        const ic = k => k === "leave_request" ? "plane" : k === "leave_approved" ? "circleCheck" : k === "leave_rejected" ? "x" : "bell";
        p.innerHTML = `<div class="hr-notif-head"><b>Notifications</b>${this.unread ? `<button type="button" class="link-btn" id="hrReadAll">Mark all as read</button>` : ""}</div>
<div class="hr-notif-list">${this.items.length ? this.items.map(n => `<button type="button" class="hr-notif-item${n.read ? "" : " unread"} k-${esc(n.kind)}" data-id="${n.id}"${n.link ? ` data-link="${esc(n.link)}"` : ""}><span class="hr-notif-ic">${icon(ic(n.kind), 16)}</span><span class="hr-notif-txt"><b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${this.ago(n.createdAt)}</small></span>${n.read ? "" : '<i class="hr-dot" aria-label="Unread"></i>'}</button>`).join("")
            : `<div class="hr-notif-empty">${icon("bell", 22)}<b>You're all caught up</b><span>Leave requests and decisions show up here.</span></div>`}</div>`;
        $("#hrReadAll", p)?.addEventListener("click", async () => { await Server.post("hr/notifications/read-all").catch(() => {}); this.items.forEach(n => { n.read = true; }); this.unread = 0; this.paint(); this.drawPanel(); });
        $$(".hr-notif-item", p).forEach(b => b.addEventListener("click", async () => {
            const n = this.items.find(x => String(x.id) === b.dataset.id);
            if (n && !n.read) { n.read = true; this.unread = Math.max(0, this.unread - 1); this.paint(); Server.post(`hr/notifications/${n.id}/read`).catch(() => {}); }
            this.toggle(false);
            if (b.dataset.link) { if (location.hash === b.dataset.link) HR.render(); else location.hash = b.dataset.link; }
        }));
    }
};
window.HRBell = Bell;

/* ---------- Wiring into the shell ---------- */
(async () => {
    if (typeof Shell !== "undefined") Shell.registerView("hr", (sub, sec) => HR.route(sub, sec));
    if (typeof Shell !== "undefined") Shell.registerCommand({ group: "Create", label: "Clock in or out", hint: "My day", icon: "clock", keywords: "attendance punch time", perm: () => HR.isStaff(), run: () => { location.hash = "#hr/me"; } });
    if (typeof Shell !== "undefined") Shell.registerCommand({ group: "Create", label: "Request leave", hint: "Time off", icon: "plane", keywords: "holiday vacation sick", perm: () => HR.isStaff(), run: () => { location.hash = "#hr/my-leave"; setTimeout(() => $("#hrApply")?.click(), 250); } });
    if (typeof Server !== "undefined") Server.on(() => HR.onData());
    // HR & attendance tab in Settings
    if (typeof renderSettings === "function") {
        const orig = renderSettings;
        window.renderSettings = function () {
            HR.settingsTab();
            if (App.settingsTab === "hr" && !HR.isAdmin()) App.settingsTab = "company";
            orig.apply(this, arguments);
            if (App.settingsTab === "hr") HR.renderSettingsTab($("#settingsBody"));
        };
    }

    await HR.registerNav();
})();
