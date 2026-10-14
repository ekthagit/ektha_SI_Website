/* ==========================================================
   EVAM Books — HR (part 2): screens for HR managers
   Dashboard, employees (with self-service sign-ins), attendance,
   leave requests with the clash warning, team calendar, monthly report.
   ========================================================== */
Object.assign(HR, {
    /* ==========================================================
       DASHBOARD
       ========================================================== */
    async pageDashboard(sec) {
        sec.innerHTML = this.skeleton();
        const d = await this.api("GET", "dashboard");
        if (!this.stillOn("")) return;
        if (this.cfg) this.cfg.pending = d.pendingLeaves;
        const max = Math.max(1, d.totalEmployees, ...d.trend.map(t => t.present));
        const pctIn = d.totalEmployees ? Math.round(d.presentToday / d.totalEmployees * 100) : 0;
        const banner = d.todayHoliday ? `<div class="hr-banner">${icon("flag", 18)}<div><b>Today is a public holiday: ${esc(d.todayHoliday)}.</b><span>Nobody is expected to clock in.</span></div></div>`
            : d.weekend ? `<div class="hr-banner is-calm">${icon("sun", 18)}<div><b>It's the weekend.</b><span>Clock-ins today are extra days.</span></div></div>` : "";
        const maxDept = Math.max(1, ...d.departments.map(x => x.count));
        sec.innerHTML = this.head("Workforce overview", d.todayHoliday ? `Today is a public holiday: ${esc(d.todayHoliday)}.` : "A live read on who is in, who is out and what needs your sign-off today.",
            `<a class="btn ${d.pendingLeaves ? "btn-primary" : "btn-ghost"}" href="#hr/leave" id="hrPendingBtn">${icon("plane")}<span>${d.pendingLeaves} pending request${d.pendingLeaves === 1 ? "" : "s"}</span></a>`, this.d(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) +
            banner + this.reminderBanner(d.holidayReminders) + `
<div class="ledger-strip hr-kpis">
  ${this.kpi("Employees", d.totalEmployees, `${d.departments.length} department${d.departments.length === 1 ? "" : "s"}`, "", "#hr/employees")}
  ${this.kpi("Present today", d.presentToday, `${d.notClockedIn} yet to clock in`, this.chip(pctIn >= 80 ? "good" : pctIn >= 50 ? "warn" : "neutral", pctIn + "%"), "#hr/attendance")}
  ${this.kpi("On leave", d.onLeaveToday, "Approved for today", "", "#hr/calendar")}
  ${this.kpi("Late today", d.lateToday, `After ${esc(this.cfg.settings.shiftStart)} + ${this.cfg.settings.graceMinutes} min`, d.lateToday ? this.chip("warn", "late", "clock") : this.chip("good", "none", "check"), "#hr/attendance", d.lateToday ? "hr-ls-warn" : "")}
</div>
<div class="bento hr-bento">
  <section class="card bento-8 hr-card">
    <header class="card-head"><div><h2>Daily presence</h2><p class="card-sub">People who clocked in · last 7 days</p></div><div class="chart-legend"><span><i style="background:var(--brand)"></i>Present</span><span><i style="background:var(--warn-dot)"></i>Of whom late</span></div></header>
    <div class="hr-bars" role="img" aria-label="People present per day, last 7 days">${d.trend.map(t => `<div class="hr-bar-col${t.date === d.date ? " is-today" : ""}${this.cfg.settings.weekend.includes(this.dow(t.date)) ? " is-wk" : ""}" data-tip="${this.dDay(t.date)}: ${t.present} present${t.late ? `, ${t.late} late` : ""}"><div class="hr-bar-val">${t.present}</div><div class="hr-bar"><i style="height:${Math.max(t.present ? 6 : 0, t.present / max * 100)}%"><em style="height:${t.present ? t.late / t.present * 100 : 0}%"></em></i></div><div class="hr-bar-lab">${this.d(t.date, { weekday: "short" })}<small>${this.d(t.date, { day: "2-digit" })}</small></div></div>`).join("")}</div>
  </section>
  <section class="card bento-4 hr-card">
    <header class="card-head"><div><h2>Yet to clock in</h2><p class="card-sub">${d.notClockedIn ? `${d.notClockedIn} ${d.notClockedIn === 1 ? "person" : "people"} today` : "Everyone is accounted for"}</p></div></header>
    ${d.notClockedInList.length ? `<ul class="hr-people">${d.notClockedInList.map(p => `<li>${this.who(p.name, p.department || "No department")}</li>`).join("")}</ul>${d.notClockedIn > d.notClockedInList.length ? `<p class="hint">and ${d.notClockedIn - d.notClockedInList.length} more</p>` : ""}`
            : `<div class="hr-allin">${icon("circleCheck", 22)}<span>Everyone is in or on leave.</span></div>`}
    <div class="sub-title hr-mt">Headcount by department</div>
    <ul class="hr-depts">${d.departments.map(x => `<li><span>${esc(x.name)}</span><span class="hr-dept"><i style="width:${Math.round(x.count / maxDept * 100)}%"></i></span><b>${x.count}</b></li>`).join("") || '<li class="muted">No employees yet.</li>'}</ul>
  </section>
  <section class="card bento-8 hr-card hr-tablecard">
    <header class="card-head"><div><h2>Recent clock-ins</h2><p class="card-sub">Today</p></div><a class="card-link" href="#hr/attendance">All records</a></header>
    ${d.recent.length ? `<div class="hr-tablewrap"><table class="dtable"><thead><tr><th>Employee</th><th class="hr-hide-sm">Department</th><th>In</th><th>Out</th><th>Status</th></tr></thead><tbody>${d.recent.map(r => `<tr><td>${this.who(r.employeeName, r.employeeCode)}</td><td class="muted hr-hide-sm">${esc(r.department || "—")}</td><td class="hr-mono">${r.clockInLocal || "—"}</td><td class="hr-mono">${r.clockOutLocal || '<span class="muted">—</span>'}</td><td>${this.pill(r.status)}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="empty empty-sm"><div class="empty-art">${icon("clock", 24)}</div><p>No one has clocked in yet today.</p></div>`}
  </section>
  ${this.holidayCard(d.upcomingHolidays, "bento-4")}
  ${d.onLeaveList.length ? `<section class="card bento-12 hr-card"><header class="card-head"><div><h2>On leave today</h2><p class="card-sub">${d.onLeaveList.length} approved</p></div><a class="card-link" href="#hr/calendar">Team calendar</a></header><ul class="hr-people hr-people-row">${d.onLeaveList.map(l => `<li>${this.who(l.employeeName, `${this.LEAVE[l.leaveType]} · until ${this.dShort(l.endDate)}`)}</li>`).join("")}</ul></section>` : ""}
</div>`;
        this.bindReminders(sec);
        this.animate(sec);
        if (typeof Shell !== "undefined") Shell.renderNav();
    },

    /* ==========================================================
       EMPLOYEES
       ========================================================== */
    async pageEmployees(sec, params) {
        const r = await this.api("GET", "employees");
        if (!this.stillOn("employees")) return;
        this._emps = r.employees; this._linkable = r.linkable;
        const show = params.get("show") || "active", q = (params.get("q") || "").toLowerCase(), dept = params.get("dept") || "";
        const depts = [...new Set(r.employees.map(e => e.department).filter(Boolean))].sort();
        const list = r.employees.filter(e => (show === "all" || e.status === show) && (!dept || e.department === dept) && (!q || [e.name, e.code, e.designation, e.email].join(" ").toLowerCase().includes(q)));
        const active = r.employees.filter(e => e.status === "active");
        const withLogin = active.filter(e => e.login && !e.login.disabled).length;
        sec.innerHTML = this.head("Employees", "One record per person, shared with payroll: HR details, leave balances and their sign-in to the self-service area.", `${this.canPayroll() ? `<a class="btn btn-ghost" href="#finance/employees">${icon("banknote")}<span>Salaries in payroll</span></a>` : ""}<button type="button" class="btn btn-primary" id="hrAddEmp">${icon("plus")}<span>Add employee</span></button>`) + `
<div class="ledger-strip hr-kpis">
  ${this.kpi("Active employees", active.length, `${depts.length} department${depts.length === 1 ? "" : "s"}`)}
  ${this.kpi("With a sign-in", withLogin, `${active.length - withLogin} without self-service`, withLogin === active.length && active.length ? this.chip("good", "all set", "check") : "")}
  ${this.kpi("Annual leave left", active.reduce((s, e) => s + Number(e.leave.annual || 0), 0), "Days, all active people")}
  ${this.kpi("Left the company", r.employees.length - active.length, "Kept for history", "", "#hr/employees?show=left")}
</div>
<div class="filters">
  <label class="search"><span class="search-ic">${icon("search")}</span><input id="hrEmpQ" type="search" placeholder="Search name, number or email" value="${esc(params.get("q") || "")}" aria-label="Search employees"></label>
  <select id="hrEmpDept" aria-label="Department"><option value="">Every department</option>${depts.map(x => `<option${x === dept ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>
  <div class="seg" role="tablist" aria-label="Show">${[["active", "Active"], ["left", "Left"], ["all", "All"]].map(([k, l]) => `<button type="button" role="tab" data-show="${k}" class="${show === k ? "on" : ""}" aria-selected="${show === k}">${l}</button>`).join("")}</div>
</div>` + (list.length ? `<div class="table-card"><table class="dtable" id="hrEmpTable"><thead><tr><th>Employee</th><th>No.</th><th>Department</th><th>Joined</th><th class="num" data-tip="Annual / sick / casual days left">Leave left</th><th>Self-service</th><th>Status</th></tr></thead><tbody>${list.map(e => `<tr data-row="${esc(e.id)}" tabindex="0"><td>${this.who(e.name, e.designation || e.email || "")}</td><td class="hr-mono">${esc(e.code)}</td><td>${esc(e.department || "—")}</td><td>${e.joined ? this.d(e.joined) : '<span class="muted">—</span>'}</td><td class="num"><span class="hr-lv3"><b>${e.leave.annual}</b><i>/</i>${e.leave.sick}<i>/</i>${e.leave.casual}</span></td><td>${e.login ? (e.login.disabled ? this.pill("rejected", "Switched off") : e.login.role === "employee" ? this.pill("approved", "Active") : `<span class="pill pill-info">${esc(e.login.roleLabel)}</span>`) : this.pill("cancelled", "No sign-in")}</td><td>${e.status === "left" ? this.pill("cancelled", "Left") : this.pill("approved", "Active")}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card">${r.employees.length ? this.emptyState("search", "No one matches", "Try another search or department.", "") : this.emptyState("idCard", "Add your first employee", "Each person gets one record shared by HR and payroll: department, leave balances and, if you like, a sign-in to clock in and request leave.", `<button type="button" class="btn btn-primary" data-addemp>${icon("plus")}<span>Add employee</span></button>`)}</div>`);
        const go = () => {
            const p = new URLSearchParams();
            const qq = $("#hrEmpQ").value.trim(); if (qq) p.set("q", qq);
            const dd = $("#hrEmpDept").value; if (dd) p.set("dept", dd);
            const ss = $(".seg button.on", sec)?.dataset.show; if (ss && ss !== "active") p.set("show", ss);
            history.replaceState(null, "", "#hr/employees" + (p.toString() ? "?" + p : ""));
            this.sub = "employees" + (p.toString() ? "?" + p : "");
            const pos = $("#hrEmpQ").selectionStart, had = document.activeElement?.id === "hrEmpQ";
            this.pageEmployees(sec, p).then(() => { if (had) { const n = $("#hrEmpQ"); n.focus(); n.setSelectionRange(pos, pos); } });
        };
        $("#hrEmpQ").addEventListener("input", debounce(go, 200));
        $("#hrEmpDept").addEventListener("change", go);
        $$(".seg button", sec).forEach(b => b.addEventListener("click", () => { $$(".seg button", sec).forEach(x => x.classList.toggle("on", x === b)); go(); }));
        $("#hrAddEmp").addEventListener("click", () => this.employeeDialog(null));
        $$("[data-addemp]", sec).forEach(b => b.addEventListener("click", () => this.employeeDialog(null)));
        $$("#hrEmpTable tr[data-row]", sec).forEach(tr => {
            const open = () => this.employeeDialog(r.employees.find(e => e.id === tr.dataset.row));
            tr.addEventListener("click", open);
            tr.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
        });
        if (params.get("open")) { const e = r.employees.find(x => x.id === params.get("open")); if (e) this.employeeDialog(e); }
    },
    async employeeDialog(e) {
        const depts = [...new Set((this._emps || []).map(x => x.department).filter(Boolean))].sort();
        const L = e ? e.login : null;
        const loginBox = !e ? `<p class="hint">After saving, you can give them a sign-in so they can clock in, request leave and see their payslips.</p>`
            : L ? `<div class="hr-login"><div class="hr-login-top">${icon("key", 16)}<div><b>${esc(L.email)}</b><small>${esc(L.roleLabel)}${L.disabled ? " · switched off" : L.mustChange ? " · has not signed in yet" : L.lastLogin ? ` · last sign-in ${new Date(L.lastLogin).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}${L.mfa ? " · two-step on" : ""}</small></div></div>
                ${L.role === "employee" || this.isAdmin() ? `<div class="hr-login-act"><button type="button" class="btn btn-ghost btn-sm" data-login="reset">${icon("refresh", 14)}<span>New temporary password</span></button><button type="button" class="btn btn-ghost btn-sm" data-login="${L.disabled ? "on" : "off"}">${L.disabled ? "Switch sign-in on" : "Switch sign-in off"}</button></div>` : ""}</div>`
            : `<div class="hr-login is-none"><p>No sign-in yet. Create one so ${esc(e.name.split(" ")[0])} can clock in, request leave and see payslips — nothing else in EVAM Books.</p>
                <div class="hr-login-new"><input type="email" id="hrLoginEmail" value="${esc(e.email || "")}" placeholder="their@email" aria-label="Sign-in email"><button type="button" class="btn btn-primary btn-sm" data-login="create">${icon("userPlus", 14)}<span>Create sign-in</span></button></div>
                ${(this._linkable || []).length ? `<div class="field hr-mt"><label for="em_link">Or link an existing sign-in</label><select id="em_link" name="userId"><option value="">—</option>${this._linkable.map(u => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.email)} (${esc(u.roleLabel)})</option>`).join("")}</select></div>` : ""}</div>`;
        const r = await this.dialog({
            title: e ? e.name : "Add employee", wide: true,
            body: `<div class="hr-emp-form">
<div class="sub-title">Details</div>
<div class="grid-3">
  <div class="field span-2"><label for="em1">Full name</label><input id="em1" name="name" value="${esc(e ? e.name : "")}" required></div>
  <div class="field"><label for="em2">Employee no.</label><input id="em2" name="code" value="${esc(e ? e.code : "")}" placeholder="Next number"></div>
  <div class="field"><label for="em3">Department</label><input id="em3" name="department" list="hrDepts" value="${esc(e ? e.department : "")}"><datalist id="hrDepts">${depts.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
  <div class="field"><label for="em4">Designation</label><input id="em4" name="designation" value="${esc(e ? e.designation : "")}"></div>
  <div class="field"><label for="em5">Joining date</label><input id="em5" name="joined" type="date" value="${esc(e ? e.joined : this.today())}"></div>
  <div class="field"><label for="em6">Email</label><input id="em6" name="email" type="email" value="${esc(e ? e.email : "")}"></div>
  <div class="field"><label for="em7">Phone</label><input id="em7" name="phone" type="tel" value="${esc(e ? e.phone : "")}"></div>
  <div class="field"><label for="em8">Status</label><select id="em8" name="status"><option value="active">Active</option><option value="left"${e && e.status === "left" ? " selected" : ""}>Left the company</option></select></div>
</div>
<div class="sub-title hr-mt">Leave balance (days left)</div>
<div class="grid-3">${["annual", "sick", "casual"].map(k => `<div class="field"><label for="eml_${k}">${this.LEAVE[k]}</label><input id="eml_${k}" name="leave_${k}" type="number" min="0" step="0.5" value="${e ? e.leave[k] : this.cfg.settings.leaveDefaults[k]}"></div>`).join("")}</div>
${e ? `<div class="sub-title hr-mt">Self-service sign-in</div>${loginBox}` : loginBox}
${e && this.canPayroll() ? `<p class="hint hr-mt">${icon("banknote", 14)} Salary, allowances and bank details are on the <a href="#finance/employee/${esc(e.id)}">payroll record</a>${e.monthlyPay ? ` · AED ${fmt(e.monthlyPay)} a month` : ""}.</p>` : ""}
</div>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: e ? "Save" : "Add employee", value: "ok", primary: true }],
            onOpen: inner => {
                $$("[data-login]", inner).forEach(b => b.addEventListener("click", async () => {
                    const act = b.dataset.login;
                    const msg = $(".hr-dlg-msg", inner);
                    try {
                        b.disabled = true;
                        if (act === "create") {
                            const res = await this.api("POST", `employees/${e.id}/login`, { email: $("#hrLoginEmail", inner).value.trim() });
                            await this.closeDlg(); await this.showTemp(e.name, res.login.email, res.tempPassword); this.render();
                        } else if (act === "reset") {
                            const res = await this.api("POST", `employees/${e.id}/login/reset`);
                            await this.closeDlg(); await this.showTemp(e.name, L.email, res.tempPassword); this.render();
                        } else {
                            await this.api("POST", `employees/${e.id}/login/access`, { disabled: act === "off" });
                            await this.closeDlg(); toast(act === "off" ? "Sign-in switched off." : "Sign-in switched on.", "good"); this.render();
                        }
                    } catch (err) { b.disabled = false; msg.hidden = false; msg.textContent = err.message; }
                }));
            },
            onSubmit: async (v, d) => {
                const body = { name: d.name, code: d.code, department: d.department, designation: d.designation, joined: d.joined, email: d.email, phone: d.phone, status: d.status, leave: { annual: Number(d.leave_annual), sick: Number(d.leave_sick), casual: Number(d.leave_casual) } };
                if (d.status === "left" && (!e || e.status !== "left")) body.left = this.today();
                if (d.userId) body.userId = d.userId;
                if (e) body.version = e.version;
                const res = await this.api(e ? "PUT" : "POST", e ? "employees/" + e.id : "employees", body);
                if (res.object && typeof Server !== "undefined") Server.applyResult({ object: res.object });
                this._saved = res.employee;
            }
        });
        if (r.value === "ok") {
            toast(e ? "Employee saved." : `${this._saved.name} added (${this._saved.code}).`, "good");
            if (!e && this._saved) { await this.closeDlg(); await this.render(); const again = (this._emps || []).find(x => x.id === this._saved.id); if (again) this.employeeDialog(again); }
            else this.render();
        }
    },
    async showTemp(name, email, temp) {
        await openDialog({
            title: "Sign-in ready",
            body: `<p class="dialog-text">Give ${esc(name)} these details. They choose their own password the first time they sign in, and they only see their own HR area.</p>
<div class="hr-temp"><div><span>Email</span><b>${esc(email)}</b></div><div><span>Temporary password</span><code id="hrTemp">${esc(temp)}</code></div></div>
<p class="hint">This password is shown once.</p>`,
            actions: [{ label: "Copy password", value: "copy" }, { label: "Done", value: "ok", primary: true }],
            onOpen: inner => { $(".dialog-actions .btn", inner).addEventListener("click", ev => { ev.preventDefault(); navigator.clipboard?.writeText(temp); toast("Password copied.", "good"); }); }
        });
    },

    /* ==========================================================
       ATTENDANCE
       ========================================================== */
    async pageAttendance(sec, params) {
        const t = this.today();
        const mode = params.get("month") ? "month" : "day";
        const date = params.get("date") || t, month = params.get("month") || t.slice(0, 7), emp = params.get("employee") || "";
        const qs = new URLSearchParams(mode === "day" ? { date } : { month }); if (emp) qs.set("employee", emp);
        const [r, er] = await Promise.all([this.api("GET", "attendance?" + qs), this._emps ? Promise.resolve({ employees: this._emps }) : this.api("GET", "employees")]);
        if (!this.stillOn("attendance")) return;
        this._emps = er.employees;
        const active = er.employees.filter(e => e.status === "active");
        const recs = r.records, worked = recs.filter(x => x.clockIn);
        const missing = mode === "day" && !emp ? active.filter(e => !recs.some(x => x.employeeId === e.id)) : [];
        sec.innerHTML = this.head("Attendance", "Clock-ins in office time. Correct a missed punch, mark someone absent or add a day by hand — every change is in the audit trail.", `<button type="button" class="btn btn-primary" id="hrAddAtt">${icon("plus")}<span>Add record</span></button>`) + `
<div class="filters hr-attf">
  <div class="seg" role="tablist" aria-label="View"><button type="button" data-mode="day" class="${mode === "day" ? "on" : ""}">Day</button><button type="button" data-mode="month" class="${mode === "month" ? "on" : ""}">Month</button></div>
  ${mode === "day" ? `<div class="hr-monthnav"><button type="button" class="icon-btn" data-step="-1" aria-label="Previous day">${icon("chevLeft", 16)}</button>${this.picker("date", date, this.d(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), 'id="hrAttDate" aria-label="Date"')}<button type="button" class="icon-btn" data-step="1" aria-label="Next day">${icon("chevRight", 16)}</button></div>${date !== t ? `<button type="button" class="btn btn-ghost btn-sm" data-today>Today</button>` : ""}`
            : `<div class="hr-monthnav"><button type="button" class="icon-btn" data-mstep="-1" aria-label="Previous month">${icon("chevLeft", 16)}</button>${this.picker("month", month, this.monthLabel(month), 'id="hrAttMonth" aria-label="Month"')}<button type="button" class="icon-btn" data-mstep="1" aria-label="Next month">${icon("chevRight", 16)}</button></div>`}
  <select id="hrAttEmp" aria-label="Employee"><option value="">All employees</option>${er.employees.map(e => `<option value="${esc(e.id)}"${e.id === emp ? " selected" : ""}>${esc(e.name)}${e.status === "left" ? " (left)" : ""}</option>`).join("")}</select>
</div>
<div class="ledger-strip hr-kpis hr-kpis-tight">
  ${this.kpi("Clocked in", worked.length, mode === "day" ? this.d(date, { weekday: "long", day: "numeric", month: "short" }) : this.monthLabel(month))}
  ${this.kpi("Late", worked.filter(x => x.status === "late").length, `After ${esc(this.cfg.settings.shiftStart)} + ${this.cfg.settings.graceMinutes} min`)}
  ${this.kpi("Absent or half day", recs.filter(x => x.status === "absent" || x.status === "half_day").length, "Marked by HR")}
  ${this.kpi("Hours", `${Math.round(worked.reduce((s, x) => s + x.hours, 0))}<span class="ls-cur hr-unit">h</span>`, mode === "day" ? "Including people still in" : "Total for the month")}
</div>` + (recs.length ? `<div class="table-card hr-mt"><table class="dtable" id="hrAttTable"><thead><tr>${mode === "month" ? "<th>Date</th>" : ""}<th>Employee</th><th>In</th><th>Out</th><th class="num">Hours</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>${recs.map(x => `<tr data-id="${esc(x.id)}">${mode === "month" ? `<td><b>${this.dDay(x.date)}</b></td>` : ""}<td>${this.who(x.employeeName, x.employeeCode)}</td><td class="hr-mono">${x.clockInLocal || "—"}</td><td class="hr-mono">${x.clockOutLocal || (x.clockIn && x.date === t ? '<span class="muted">in</span>' : "—")}</td><td class="num">${this.hours(x.hours)}</td><td>${this.pill(x.status)}${x.edited ? ' <span class="hr-edited" data-tip="Changed by HR">edited</span>' : ""}</td><td class="hr-note">${esc(x.notes || "")}</td><td class="num hr-rowact"><button type="button" class="icon-btn" data-edit="${esc(x.id)}" aria-label="Edit" data-tip="Edit">${icon("pen", 15)}</button><button type="button" class="icon-btn" data-del="${esc(x.id)}" aria-label="Delete" data-tip="Delete">${icon("trash", 15)}</button></td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("clock", "No attendance for this selection", mode === "day" ? "Nobody has clocked in on this day yet." : "No records in this month.", `<button type="button" class="btn btn-ghost" data-addatt>${icon("plus")}<span>Add a record</span></button>`)}</div>`) +
            (missing.length ? `<div class="card hr-card hr-mt hr-missing"><header class="card-head"><div><h2>No record ${date === t ? "yet today" : "on this day"}</h2><p class="card-sub">${missing.length} active ${missing.length === 1 ? "person" : "people"} · weekends, holidays and leave included</p></div></header><div class="hr-chips">${missing.map(e => `<button type="button" class="hr-person-chip" data-new="${esc(e.id)}" data-tip="Add a record for ${esc(e.name)}">${this.avatar(e.name)}<span>${esc(e.name)}</span>${icon("plus", 14)}</button>`).join("")}</div></div>` : "");
        const go = p => { location.hash = "#hr/attendance?" + p; };
        const empQ = () => $("#hrAttEmp").value ? "&employee=" + $("#hrAttEmp").value : "";
        $$("[data-mode]", sec).forEach(b => b.addEventListener("click", () => go(b.dataset.mode === "day" ? `date=${date}${empQ()}` : `month=${(date || t).slice(0, 7)}${empQ()}`)));
        this.bindPickers(sec);
        $("#hrAttDate")?.addEventListener("change", e => { if (e.target.value) go(`date=${e.target.value}${empQ()}`); });
        $("#hrAttMonth")?.addEventListener("change", e => go(`month=${e.target.value}${empQ()}`));
        $$("[data-step]", sec).forEach(b => b.addEventListener("click", () => go(`date=${this.addDays(date, Number(b.dataset.step))}${empQ()}`)));
        $$("[data-mstep]", sec).forEach(b => b.addEventListener("click", () => go(`month=${this.addMonths(month, Number(b.dataset.mstep))}${empQ()}`)));
        $("[data-today]", sec)?.addEventListener("click", () => go(`date=${t}${empQ()}`));
        $("#hrAttEmp").addEventListener("change", () => go((mode === "day" ? `date=${date}` : `month=${month}`) + empQ()));
        const addNew = id => this.attendanceDialog(null, { employeeId: id || emp, date: mode === "day" ? date : t });
        $("#hrAddAtt").addEventListener("click", () => addNew());
        $$("[data-addatt]", sec).forEach(b => b.addEventListener("click", () => addNew()));
        $$("[data-new]", sec).forEach(b => b.addEventListener("click", () => addNew(b.dataset.new)));
        $$("[data-edit]", sec).forEach(b => b.addEventListener("click", () => this.attendanceDialog(recs.find(x => x.id === b.dataset.edit))));
        $$("[data-del]", sec).forEach(b => b.addEventListener("click", async () => {
            const x = recs.find(y => y.id === b.dataset.del);
            if (!await confirmDialog(`Delete ${x.employeeName}'s record for ${this.d(x.date)}?`, "Delete", true, "Delete record")) return;
            if (await this.run(() => this.api("DELETE", "attendance/" + x.id), "Record deleted.")) this.render();
        }));
        this.animate(sec);
    },
    async attendanceDialog(rec, defaults = {}) {
        const emps = (this._emps || []).filter(e => e.status === "active" || (rec && e.id === rec.employeeId));
        const r = await this.dialog({
            title: rec ? `${rec.employeeName} · ${this.d(rec.date)}` : "Add attendance record",
            body: `<div class="form-grid grid-2">
  ${rec ? "" : `<div class="field"><label for="at1">Employee</label><select id="at1" name="employeeId" required><option value="">Choose…</option>${emps.map(e => `<option value="${esc(e.id)}"${e.id === defaults.employeeId ? " selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
  <div class="field"><label for="at2">Date</label><input id="at2" name="date" type="date" value="${esc(defaults.date || this.today())}" required></div>`}
  <div class="field"><label for="at3">Clock in</label><input id="at3" name="clockIn" type="time" value="${rec ? rec.clockInLocal || "" : ""}"></div>
  <div class="field"><label for="at4">Clock out</label><input id="at4" name="clockOut" type="time" value="${rec ? rec.clockOutLocal || "" : ""}"></div>
  <div class="field span-2"><label for="at5">Status</label><select id="at5" name="status">${rec ? "" : `<option value="">Work it out from the clock-in time</option>`}${["present", "late", "half_day", "absent"].map(k => `<option value="${k}"${rec && rec.status === k ? " selected" : ""}>${this.STATUS[k][1]}</option>`).join("")}</select><div class="hint">Times are office time (${esc(this.tz())}). Late = after ${esc(this.cfg.settings.shiftStart)} + ${this.cfg.settings.graceMinutes} min.</div></div>
  <div class="field span-2"><label for="at6">Notes <span class="opt">optional</span></label><input id="at6" name="notes" value="${esc(rec ? rec.notes : "")}" placeholder="e.g. Forgot to clock in, confirmed by manager"></div>
</div>`,
            actions: [{ label: "Cancel", value: "cancel" }, { label: rec ? "Save" : "Add record", value: "ok", primary: true }],
            onSubmit: async (v, d) => {
                if (rec) await this.api("PUT", "attendance/" + rec.id, { clockIn: d.clockIn, clockOut: d.clockOut, status: d.status, notes: d.notes });
                else {
                    if (!d.employeeId) throw new Error("Choose the employee.");
                    await this.api("POST", "attendance", { employeeId: d.employeeId, date: d.date, clockIn: d.clockIn, clockOut: d.clockOut, status: d.status || undefined, notes: d.notes });
                }
            }
        });
        if (r.value === "ok") { toast(rec ? "Record saved." : "Record added.", "good"); this.render(); }
    },

    /* ==========================================================
       LEAVE REQUESTS (with the clash warning)
       ========================================================== */
    async pageLeave(sec, params) {
        const tab = ["pending", "approved", "rejected", "all"].includes(params.get("status")) ? params.get("status") : "pending";
        const r = await this.api("GET", "leaves?status=" + tab);
        if (!this.stillOn("leave")) return;
        const c = r.counts || {};
        if (this.cfg) { this.cfg.pending = c.pending || 0; if (typeof Shell !== "undefined") Shell.renderNav(); }
        const clashN = r.leaves.filter(l => l.clash && l.clash.clash).length;
        sec.innerHTML = this.head("Leave requests", "Approving deducts the working days from the person's balance; unpaid leave never touches it. You'll be warned before too many people in one department are off together.") + `
<div class="tabs hr-tabs" role="tablist">${[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(([k, l]) => `<a href="#hr/leave?status=${k}" role="tab" class="${tab === k ? "on" : ""}" aria-selected="${tab === k}">${l}${k !== "all" && c[k] ? `<span class="hr-tabn">${c[k]}</span>` : ""}</a>`).join("")}</div>
${tab === "pending" && clashN ? `<div class="hr-banner is-warn">${icon("alert", 18)}<div><b>${clashN} request${clashN === 1 ? "" : "s"} would leave a department short.</b><span>You'll see who else is off before approving.</span></div></div>` : ""}` +
            (r.leaves.length ? `<div class="table-card"><table class="dtable hr-cards" id="hrLeaveTable"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th class="num">Days</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${r.leaves.map(l => `<tr data-id="${esc(l.id)}"><td>${this.who(l.employeeName, l.department || l.employeeCode)}</td><td>${this.leavePill(l.leaveType)}${l.balance != null && l.status === "pending" ? `<div class="small muted">${l.balance} left</div>` : ""}</td><td><b>${this.range(l.startDate, l.endDate)}</b><div class="small muted">requested ${new Date(l.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div></td><td class="num hr-dcell"><b>${l.days}</b><span class="hr-dunit"> working day${l.days === 1 ? "" : "s"}</span></td><td class="hr-note">${esc(l.reason || "—")}${l.adminNote ? `<div class="small">HR: ${esc(l.adminNote)}</div>` : ""}</td><td class="hr-st">${this.pill(l.status)}${this.clashNote(l)}</td><td class="num">${l.status === "pending" ? `<div class="hr-rev"><button type="button" class="btn btn-primary btn-sm" data-approve="${esc(l.id)}">${icon("check", 14)}<span>Approve</span></button><button type="button" class="btn btn-ghost btn-sm" data-reject="${esc(l.id)}">${icon("x", 14)}<span>Reject</span></button></div>` : `<span class="small muted">${l.reviewedAt ? new Date(l.reviewedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>`}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card">${this.emptyState(tab === "pending" ? "circleCheck" : "plane", tab === "pending" ? "Nothing waiting for you" : `No ${tab === "all" ? "" : tab + " "}leave requests`, tab === "pending" ? "New requests appear here, and in the bell at the top." : "Requests show up here once people ask for time off.")}</div>`);
        const byId = id => r.leaves.find(l => l.id === id);
        $$("[data-approve]", sec).forEach(b => b.addEventListener("click", () => this.review(byId(b.dataset.approve), "approved")));
        $$("[data-reject]", sec).forEach(b => b.addEventListener("click", () => this.review(byId(b.dataset.reject), "rejected")));
    },
    clashNote(l) {
        const c = l.clash; if (!c) return "";
        if (c.clash) return `<div class="hr-clash is-bad" data-tip="${c.peakPct}% of ${esc(c.department)} off on ${c.peakDates.map(x => this.dShort(x)).join(", ")}. Limit ${c.thresholdPct}%.">${icon("alert", 13)}Clash · ${c.peakOff} of ${c.headcount} in ${esc(c.department)} off</div>`;
        if (!c.colleagues.length) return "";
        return `<div class="hr-clash">${icon("users", 13)}${c.colleagues.length} ${esc(c.department)} colleague${c.colleagues.length === 1 ? "" : "s"} also off</div>`;
    },
    async review(l, status) {
        const c = l.clash;
        const isClash = status === "approved" && c && c.clash;
        const body = isClash ? `<div class="hr-clashdlg" data-testid="leave-clash-dialog">
  <div class="hr-clash-eyebrow">${icon("alert", 14)}Leave clash warning</div>
  <h3>${c.peakOff} of ${c.headcount} people in ${esc(c.department)} would be off</h3>
  <p>Approving ${esc(l.employeeName)}'s request puts <b>${c.peakPct}%</b> of ${esc(c.department)} on leave on ${c.peakDates.map(x => this.dShort(x)).join(", ")}. Your limit is ${c.thresholdPct}%.</p>
  <ul class="hr-clash-list">${c.colleagues.map(m => `<li>${this.who(m.name)}<span>${this.LEAVE[m.leaveType]} · ${this.dShort(m.startDate)} → ${this.dShort(m.endDate)}</span></li>`).join("")}</ul>
</div>` : `<div class="hr-revsum">${this.who(l.employeeName, l.department || "")}<div><b>${this.LEAVE[l.leaveType]} leave · ${l.days} day${l.days === 1 ? "" : "s"}</b><span>${this.range(l.startDate, l.endDate)}</span></div></div>
${status === "approved" && l.leaveType !== "unpaid" ? `<p class="hint">${l.days} day${l.days === 1 ? "" : "s"} come off ${esc(l.employeeName.split(" ")[0])}'s ${l.leaveType} balance (${l.balance} left now, ${Math.max(0, (l.balance || 0) - l.days)} after).</p>` : ""}
${c && c.colleagues.length && status === "approved" ? `<p class="hint">${c.colleagues.length} ${esc(c.department)} colleague${c.colleagues.length === 1 ? " is" : "s are"} also off: ${c.colleagues.map(m => esc(m.name)).join(", ")}.</p>` : ""}`;
        const r = await this.dialog({
            title: isClash ? "Approve despite the clash?" : status === "approved" ? "Approve leave" : "Reject leave",
            body: body + `<div class="field hr-mt"><label for="rv1">Note to ${esc(l.employeeName.split(" ")[0])} <span class="opt">optional</span></label><input id="rv1" name="adminNote" placeholder="${status === "approved" ? "e.g. Enjoy your break" : "e.g. Month-end close — can you move it a week?"}"></div>`,
            actions: isClash ? [{ label: "Go back", value: "cancel" }, { label: "Approve anyway", value: "ok", danger: true }]
                : [{ label: "Cancel", value: "cancel" }, status === "approved" ? { label: "Approve", value: "ok", primary: true } : { label: "Reject", value: "ok", danger: true }],
            onSubmit: async (v, d) => { this._rev = await this.api("PUT", `leaves/${l.id}/review`, { status, adminNote: d.adminNote }); }
        });
        if (r.value === "ok") {
            toast(`${l.employeeName}'s leave ${status}.`, "good");
            if (this._rev && this._rev.employee && typeof Server !== "undefined") Server.applyResult({ object: this._rev.employee });
            this.render();
        }
    },

    /* ==========================================================
       TEAM CALENDAR
       ========================================================== */
    async pageCalendar(sec, params) {
        const t = this.today();
        const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : t.slice(0, 7);
        const r = await this.api("GET", "calendar?month=" + month);
        if (!this.stillOn("calendar")) return;
        let showPending = this._calPending !== false;
        let selected = params.get("day") || (t.startsWith(month) ? t : month + "-01");
        const hmap = Object.fromEntries(r.holidays.map(h => [h.date, h]));
        const first = month + "-01";
        const startOffset = (this.dow(first) + 6) % 7;     // weeks start on Monday
        const gridStart = this.addDays(first, -startOffset);
        const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).toISOString().slice(0, 10);
        const weeks = Math.ceil((startOffset + Number(last.slice(8))) / 7);
        const draw = () => {
            const leaves = showPending ? r.leaves : r.leaves.filter(l => l.status === "approved");
            const on = iso => leaves.filter(l => l.startDate <= iso && l.endDate >= iso);
            const cells = [];
            for (let i = 0; i < weeks * 7; i++) {
                const iso = this.addDays(gridStart, i), items = on(iso), h = hmap[iso];
                const cls = ["hr-cal-day", iso.startsWith(month) ? "" : "is-out", r.weekend.includes(this.dow(iso)) ? "is-wk" : "", h ? "is-hol" : "", iso === t ? "is-today" : "", iso === selected ? "is-sel" : ""].filter(Boolean).join(" ");
                cells.push(`<button type="button" class="${cls}" data-day="${iso}" aria-label="${this.d(iso, { weekday: "long", day: "numeric", month: "long" })}${h ? ", " + esc(h.name) : ""}${items.length ? `, ${items.length} on leave` : ""}" aria-pressed="${iso === selected}">
<span class="hr-cal-n">${Number(iso.slice(8))}</span>${h ? `<span class="hr-cal-hol">${esc(h.name)}</span>` : ""}
<span class="hr-cal-chips">${items.slice(0, 3).map(l => `<span class="hr-cal-chip t-${l.leaveType}${l.status === "pending" ? " is-pending" : ""}" title="${esc(l.employeeName)} · ${this.LEAVE[l.leaveType]}${l.status === "pending" ? " (pending)" : ""}">${esc(l.employeeName.split(" ")[0])}</span>`).join("")}${items.length > 3 ? `<span class="hr-cal-more">+${items.length - 3} more</span>` : ""}</span>
${items.length ? `<span class="hr-cal-dotn">${items.length}</span>` : ""}</button>`);
            }
            $("#hrCalGrid").innerHTML = cells.join("");
            const h = hmap[selected], items = on(selected);
            $("#hrCalDetail").innerHTML = `<header class="card-head"><div><h2>${this.d(selected, { weekday: "long", day: "numeric", month: "short" })}</h2><p class="card-sub">${items.length ? `${items.length} ${items.length === 1 ? "person" : "people"} on leave` : "Selected day"}</p></div></header>
${h ? `<div class="hr-cal-holnote">${icon("flag", 15)}<span>Public holiday · <b>${esc(h.name)}</b>${h.estimated ? " (estimated)" : ""}</span></div>` : ""}
${items.length ? `<ul class="hr-people">${items.map(l => `<li>${this.who(l.employeeName, `${this.LEAVE[l.leaveType]} · ${this.dShort(l.startDate)} → ${this.dShort(l.endDate)} · ${l.days}d`)}${this.pill(l.status)}</li>`).join("")}</ul>` : `<p class="muted hr-cal-none">${r.weekend.includes(this.dow(selected)) ? "Weekend." : "No one is on leave."}</p>`}`;
            $$("#hrCalGrid .hr-cal-day", sec).forEach(b => b.addEventListener("click", () => { selected = b.dataset.day; if (!selected.startsWith(month)) { location.hash = `#hr/calendar?month=${selected.slice(0, 7)}&day=${selected}`; return; } draw(); }));
        };
        const appr = r.leaves.filter(l => l.status === "approved").length, pend = r.leaves.length - appr;
        sec.innerHTML = this.head(`Who's away in ${this.d(first, { month: "long" })}`, `Approved and pending leave across the team, with public holidays. ${appr} approved · ${pend} pending · ${r.holidays.length} holiday${r.holidays.length === 1 ? "" : "s"}.`,
            `<label class="check check-inline"><input type="checkbox" id="hrCalPend"${showPending ? " checked" : ""}><span class="check-box">${icon("check", 12)}</span><span class="check-text">Show pending</span></label>${this.monthNav(month)}${month !== t.slice(0, 7) ? `<a class="btn btn-ghost" href="#hr/calendar">Today</a>` : ""}`) + `
<div class="hr-cal-wrap">
  <div class="hr-cal-main">
    <div class="hr-cal card"><div class="hr-cal-head">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(x => `<span>${x}</span>`).join("")}</div><div class="hr-cal-grid" id="hrCalGrid"></div></div>
    <div class="hr-legend">${["annual", "sick", "casual", "unpaid"].map(k => `<span><i class="t-${k}"></i>${this.LEAVE[k]}</span>`).join("")}<span><i class="is-pending"></i>Pending</span><span><i class="is-hol"></i>Public holiday</span></div>
  </div>
  <aside class="card hr-card hr-cal-side" id="hrCalDetail"></aside>
</div>`;
        draw();
        this.bindMonthNav(sec, "#hr/calendar");
        $("#hrCalPend").addEventListener("change", e => { showPending = e.target.checked; this._calPending = showPending; draw(); });
    },

    /* ==========================================================
       MONTHLY REPORT
       ========================================================== */
    async pageReport(sec, params) {
        const t = this.today();
        const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : t.slice(0, 7);
        const r = await this.api("GET", "report?month=" + month);
        if (!this.stillOn("report")) return;
        const rows = r.rows;
        const avg = rows.length ? rows.reduce((s, x) => s + x.attendancePct, 0) / rows.length : 0;
        const hrs = rows.reduce((s, x) => s + x.totalHours, 0);
        const cols = [["employeeCode", "No."], ["name", "Employee"], ["department", "Department"], ["workingDays", "Work days", 1], ["presentDays", "Present", 1], ["lateDays", "Late", 1], ["leaveDays", "Leave", 1], ["absentDays", "Absent", 1], ["totalHours", "Hours", 1], ["attendancePct", "Attendance", 1]];
        sec.innerHTML = this.head(`${this.monthLabel(month)}, in numbers`, `Working days exclude weekends and public holidays, and only count up to today. ${r.workingDays} working day${r.workingDays === 1 ? "" : "s"} so far${r.holidays.length ? ` · holidays: ${r.holidays.map(h => `${esc(h.name)} (${this.dShort(h.date)})`).join(", ")}` : ""}.`,
            `${this.monthNav(month)}<button type="button" class="btn btn-primary" id="hrCsv"${rows.length ? "" : " disabled"}>${icon("download2")}<span>Export CSV</span></button>`) + `
<div class="ledger-strip hr-kpis">
  ${this.kpi("Working days", r.workingDays, month === t.slice(0, 7) ? "So far this month" : "In the month")}
  ${this.kpi("Average attendance", `${Math.round(avg)}<span class="ls-cur hr-unit">%</span>`, `${rows.length} active ${rows.length === 1 ? "person" : "people"}`, this.chip(avg >= 90 ? "good" : avg >= 70 ? "warn" : "bad", avg >= 90 ? "healthy" : avg >= 70 ? "watch" : "low"))}
  ${this.kpi("Late arrivals", rows.reduce((s, x) => s + x.lateDays, 0), "Across the team")}
  ${this.kpi("Hours worked", `${Math.round(hrs)}<span class="ls-cur hr-unit">h</span>`, `${rows.reduce((s, x) => s + x.leaveDays, 0)} leave days · ${rows.reduce((s, x) => s + x.absentDays, 0)} absent`)}
</div>` + (rows.length ? `<div class="table-card hr-mt"><table class="dtable" id="hrRepTable"><thead><tr>${cols.map(c => `<th class="${c[2] ? "num" : ""}">${c[1]}</th>`).join("")}</tr></thead><tbody>${rows.map(x => `<tr><td class="hr-mono">${esc(x.employeeCode)}</td><td><b>${esc(x.name)}</b></td><td class="muted">${esc(x.department || "—")}</td><td class="num">${x.workingDays}</td><td class="num">${x.presentDays}</td><td class="num">${x.lateDays || '<span class="muted">0</span>'}</td><td class="num">${x.leaveDays || '<span class="muted">0</span>'}</td><td class="num">${x.absentDays ? `<span class="bad-text">${x.absentDays}</span>` : '<span class="muted">0</span>'}</td><td class="num">${fmt(x.totalHours)}</td><td class="num"><span class="hr-pct"><span class="hr-pct-bar"><i style="width:${x.attendancePct}%" class="${x.attendancePct >= 90 ? "good" : x.attendancePct >= 70 ? "warn" : "bad"}"></i></span>${x.attendancePct}%</span></td></tr>`).join("")}</tbody></table></div>`
            : `<div class="table-card hr-mt">${this.emptyState("fileChart", "No employees to report on", "Add employees first; their attendance appears here month by month.", `<a class="btn btn-primary" href="#hr/employees">Open employees</a>`)}</div>`);
        this.bindMonthNav(sec, "#hr/report");
        $("#hrCsv").addEventListener("click", async () => {
            try {
                const res = await fetch(Server.base + "hr/report/csv?month=" + month, { credentials: "same-origin", headers: { "x-evam": "1" } });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't export.");
                download(`attendance-${month}.csv`, await res.blob());
                toast("CSV downloaded.", "good");
            } catch (e) { toast(e.message, "bad"); }
        });
        this.animate(sec);
    }
});
