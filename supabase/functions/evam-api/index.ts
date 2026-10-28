/// <reference path="../_shared/deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 400) {
  return json({ error: message }, status);
}
function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function epoch() { return Date.now(); }
function uid(prefix = "") { return `${prefix}${crypto.randomUUID()}`; }
function arrRoles(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v ? [v] : [];
  return [];
}
function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
}
function defaultHrSettings(raw: any = {}) {
  const s = asObject(raw.hr);
  return {
    timezone: s.timezone || "Asia/Dubai",
    shiftStart: s.shiftStart || "09:00",
    graceMinutes: Number(s.graceMinutes ?? 10),
    reminderDays: Number(s.reminderDays ?? 7),
    clashPercent: Number(s.clashPercent ?? 25),
    payDivisor: Number(s.payDivisor ?? 30),
    weekend: Array.isArray(s.weekend) ? s.weekend.map(Number) : [5, 6],
    leaveDefaults: asObject(s.leaveDefaults).annual !== undefined
      ? s.leaveDefaults
      : { annual: 30, sick: 15, casual: 7, unpaid: 0 },
  };
}
function isAdmin(roles: string[]) { return roles.some(r => ["owner", "admin"].includes(r)); }
function canManage(roles: string[]) { return roles.some(r => ["owner", "admin", "hr"].includes(r)); }
function canPayroll(roles: string[]) { return roles.some(r => ["owner", "admin", "hr", "finance", "accountant"].includes(r)); }
function isSelfService(roles: string[]) { return roles.includes("employee") && !canManage(roles); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail("Please sign in.", 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) return fail("Supabase function environment is not configured.", 500);

    // Forward the caller's JWT so PostgreSQL RLS applies as the signed-in user.
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (authError || !authUser) return fail("Please sign in.", 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, main_role, roles")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError) return fail(`Could not load profile: ${profileError.message}`, 403);
    if (!profile) return fail("Your Supabase profile was not found.", 403);

    const roles = arrRoles(profile.roles);
    if (profile.main_role && !roles.includes(profile.main_role)) roles.push(profile.main_role);
    const user = {
      id: authUser.id,
      email: authUser.email || "",
      name: profile.username || authUser.email || "",
      role: profile.main_role || roles[0] || "user",
    };

    // Accept REST-style URLs (GET /hr/config, POST /hr/leaves) and
    // keep compatibility with the original POST { method, path, body } envelope.
    const requestUrl = new URL(req.url);
    const functionPrefix = "/functions/v1/evam-api";
    let path = requestUrl.pathname;
    if (path.startsWith(functionPrefix)) {
      path = path.slice(functionPrefix.length);
    } else {
      path = path.replace(/^\/evam-api(?=\/|$)/, "");
    }
    path = path.replace(/^\/+|\/+$/g, "");

    let body: Record<string, any> = {};
    let method = req.method.toUpperCase();

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const parsed = asObject(await req.json().catch(() => ({})));
        if (typeof parsed.path === "string" && parsed.path) {
          method = String(parsed.method || method).toUpperCase();
          path = parsed.path.replace(/^\/+|\/+$/g, "");
          body = asObject(parsed.body);
        } else {
          body = parsed;
        }
      }
    } else {
      requestUrl.searchParams.forEach((value, key) => {
        body[key] = value;
      });
    }

    const parts = path.split("/").filter(Boolean);
    const root = parts[0] || "";

    // Settings are stored in the existing settings object. If none exists, defaults are used.
    const { data: settingRows, error: settingsError } = await supabase
      .from("objects")
      .select("id,data,version")
      .eq("kind", "settings")
      .eq("deleted", false)
      .limit(1);
    if (settingsError) return fail(`Could not load settings: ${settingsError.message}`, 500);
    const settingsRow = settingRows?.[0];
    const settingsData = asObject(settingsRow?.data);
    const h = defaultHrSettings(settingsData);
    const today = todayInZone(h.timezone);
    const now = epoch();

    async function getEmployees() {
      // Employee records live in public.objects. Use the server-side service-role
      // client here because the browser user's RLS policies can otherwise return
      // an empty list even when employee rows exist. This key is never sent to
      // the browser; configure it in Supabase Edge Function Secrets.
      const employeeDb = adminClient();
      const { data, error } = await employeeDb
        .from("objects")
        .select("id,number,data,deleted")
        .eq("kind", "employee")
        .eq("deleted", false)
        .order("number", { ascending: true });
      if (error) throw new Error(`Could not load employees: ${error.message}`);
      return (data || []).map((r: any) => ({
        ...asObject(r.data),
        id: r.id,
        code: r.number || asObject(r.data).code || "",
        idFromRow: r.id,
      }));
    }
    async function employeeForUser() {
      const employees = await getEmployees();

      // First use an explicit Supabase Auth UUID link.
      const linked = employees.find((e: any) =>
        String(e.userId || e.user_id || "") === String(user.id)
      );
      if (linked) return linked;

      // Otherwise link only when exactly one employee has the signed-in user's email.
      // Never link by name; duplicate/missing email matches are treated as unlinked.
      const authEmail = String(user.email || "").trim().toLowerCase();
      if (!authEmail) return null;
      const matches = employees.filter((e: any) =>
        String(e.email || "").trim().toLowerCase() === authEmail
      );
      if (matches.length !== 1) return null;

      const match: any = matches[0];
      const employeeDb = adminClient();
      const { data: currentRow, error: readError } = await employeeDb
        .from("objects")
        .select("data")
        .eq("id", match.id)
        .eq("kind", "employee")
        .eq("deleted", false)
        .maybeSingle();
      if (readError) throw new Error(`Could not read employee record for linking: ${readError.message}`);
      if (!currentRow) return null;

      const linkedData = {
        ...asObject(currentRow.data),
        userId: user.id,
        user_id: user.id,
        email: authEmail,
      };
      const { error: linkError } = await employeeDb
        .from("objects")
        .update({ data: linkedData, updated_at: epoch(), updated_by: user.id })
        .eq("id", match.id)
        .eq("kind", "employee")
        .eq("deleted", false);
      if (linkError) throw new Error(`Could not link employee to signed-in account: ${linkError.message}`);
      return { ...match, ...linkedData };
    }
    function requireManager() {
      if (!canManage(roles)) throw new Error("Only HR or an admin can perform this action.");
    }


    // Administration APIs. Privileged Auth operations use a server-side service key;
    // never expose SUPABASE_SERVICE_ROLE_KEY in browser code.
    const roleLabels: Record<string, string> = {
      owner: "Owner", admin: "Administrator", accountant: "Accountant",
      sales: "Sales", purchases: "Purchases", staff: "Staff", viewer: "Viewer",
      finance: "Finance", employee: "Employee", hr: "HR",
    };
    const adminClient = () => {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in the evam-api function secrets to enable user administration.");
      return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    };
    const requireAdmin = () => {
      if (!isAdmin(roles)) throw new Error("Only an admin can access this section.");
    };
    const parseData = (value: any) => {
      if (typeof value === "string") {
        try { return JSON.parse(value); } catch { return {}; }
      }
      return asObject(value);
    };
    async function writeAudit(action: string, label: string, targetId = "", changes: any = {}) {
      const auditData = {
        action, label, user_id: user.id, user_name: user.name,
        target_id: targetId, changes, at: Date.now(),
      };
      const { error } = await supabase.from("objects").upsert({
        id: uid("audit_"), kind: "audit", type: action,
        number: targetId || null, date: today, status: "active",
        data: auditData, deleted: false,
        created_at: Date.now(), created_by: user.id,
        updated_at: Date.now(), updated_by: user.id,
      });
      if (error) console.error("Could not write audit entry:", error.message);
    }

    if (root === "users") {
      requireAdmin();
      const admin = adminClient();

      if (parts.length === 1 && method === "GET") {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles").select("id,username,main_role,roles").order("username");
        if (profilesError) return fail(`Could not load users: ${profilesError.message}`, 500);
        const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (authError) return fail(`Could not load authentication users: ${authError.message}`, 500);
        const authById = new Map((authUsers.users || []).map((u: any) => [u.id, u]));
        const users = (profiles || []).map((p: any) => {
          const au: any = authById.get(p.id);
          const role = p.main_role || arrRoles(p.roles)[0] || "staff";
          return {
            id: p.id, name: p.username || au?.user_metadata?.username || au?.email || "",
            email: au?.email || "", role, roles: arrRoles(p.roles),
            mfa: false, lastLogin: au?.last_sign_in_at ? new Date(au.last_sign_in_at).getTime() : null,
            disabled: !!au?.banned_until && new Date(au.banned_until).getTime() > Date.now(),
            mustChange: false,
          };
        });
        return json({ users, roles: roleLabels });
      }

      if (parts.length === 1 && method === "POST") {
        const email = String(body.email || "").trim().toLowerCase();
        const name = String(body.name || "").trim();
        const role = String(body.role || "staff").trim().toLowerCase();
        if (!name) return fail("Name is required.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
        if (!roleLabels[role]) return fail("Select a valid role.");
        if (role === "owner" || (role === "admin" && !roles.includes("owner"))) return fail("Only an owner can assign the owner or administrator role.", 403);
        const tempPassword = `Evam-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}!`;
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email, password: tempPassword, email_confirm: true,
          user_metadata: { username: name, must_change: true },
        });
        if (createError) return fail(`Could not create user: ${createError.message}`, 400);
        const newUser = created.user;
        if (!newUser) return fail("Supabase did not return the created user.", 500);
        const profilePayload = { id: newUser.id, username: name, main_role: role, roles: [role] };
        const { error: profileUpsertError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
        if (profileUpsertError) {
          await admin.auth.admin.deleteUser(newUser.id);
          return fail(`Could not create user profile: ${profileUpsertError.message}`, 500);
        }
        await writeAudit("user_add", `Added user ${name}`, newUser.id, { role });
        return json({ user: { id: newUser.id, name, email, role, mfa: false, disabled: false, mustChange: true }, tempPassword }, 201);
      }

      if (parts.length === 2 && method === "PATCH") {
        const targetId = parts[1];
        if (targetId === user.id) return fail("You cannot change your own role or disable your own account.");
        const { data: target, error: targetError } = await admin.from("profiles").select("id,username,main_role,roles").eq("id", targetId).maybeSingle();
        if (targetError || !target) return fail("User not found.", 404);
        const { data: targetAuth } = await admin.auth.admin.getUserById(targetId);
        const targetRole = String(body.role || target.main_role || "staff").toLowerCase();
        if (body.role !== undefined) {
          if (!roleLabels[targetRole]) return fail("Select a valid role.");
          if ((target.main_role === "owner" || targetRole === "owner" || targetRole === "admin") && !roles.includes("owner")) return fail("Only an owner can change owner/administrator roles.", 403);
          const { error } = await admin.from("profiles").update({ main_role: targetRole, roles: [targetRole] }).eq("id", targetId);
          if (error) return fail(`Could not update role: ${error.message}`, 400);
          await writeAudit("role_change", `Changed role for ${target.username}`, targetId, { role: targetRole });
        }
        if (body.disabled !== undefined) {
          if (target.main_role === "owner" && !roles.includes("owner")) return fail("Only an owner can disable an owner.", 403);
          const { error } = await admin.auth.admin.updateUserById(targetId, {
            ban_duration: body.disabled ? "876000h" : "none",
          });
          if (error) return fail(`Could not update user status: ${error.message}`, 400);
          await writeAudit("user_update", `${body.disabled ? "Disabled" : "Enabled"} ${target.username}`, targetId, { disabled: !!body.disabled });
        }
        return json({ ok: true, user: targetAuth?.user || target });
      }

      if (parts.length === 3 && parts[2] === "reset" && method === "POST") {
        const targetId = parts[1];
        if (targetId === user.id) return fail("Use your account menu to change your own password.");
        const { data: target, error: targetError } = await admin.from("profiles").select("id,username,main_role").eq("id", targetId).maybeSingle();
        if (targetError || !target) return fail("User not found.", 404);
        if (target.main_role === "owner" && !roles.includes("owner")) return fail("Only an owner can reset an owner account.", 403);
        const tempPassword = `Evam-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}!`;
        const { error } = await admin.auth.admin.updateUserById(targetId, {
          password: tempPassword, ban_duration: "none",
        });
        if (error) return fail(`Could not reset password: ${error.message}`, 400);
        await writeAudit("password_reset", `Reset password for ${target.username}`, targetId, { reset2fa: !!body.reset2fa });
        return json({ user: { id: target.id, name: target.username }, tempPassword });
      }
      return fail(`Unsupported users operation: ${method} ${parts.join("/")}`, 404);
    }

    if (root === "security") {
      requireAdmin();
      if (parts.length === 1 && method === "GET") {
        const security = parseData(settingsData.security);
        return json({ security: {
          require2fa: !!security.require2fa,
          ipAllow: Array.isArray(security.ipAllow) ? security.ipAllow : [],
        }, yourIp: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "" });
      }
      if (parts.length === 1 && (method === "PUT" || method === "PATCH" || method === "POST")) {
        const security = {
          require2fa: !!body.require2fa,
          ipAllow: Array.isArray(body.ipAllow) ? body.ipAllow.map(String).map((x: string) => x.trim()).filter(Boolean) : [],
        };
        const row = settingRows?.[0];
        const merged = { ...settingsData, security };
        const { error } = row
          ? await supabase.from("objects").update({ data: merged, updated_at: now, updated_by: user.id }).eq("id", row.id)
          : await supabase.from("objects").insert({ id: "settings", kind: "settings", data: merged, deleted: false, created_at: now, created_by: user.id, updated_at: now, updated_by: user.id });
        if (error) return fail(`Could not save security settings: ${error.message}`, 400);
        await writeAudit("security", "Changed security settings", "", { require2fa: security.require2fa, ipAllow: security.ipAllow.length });
        return json({ ok: true, security });
      }
      return fail(`Unsupported security operation: ${method}`, 404);
    }

    if (root === "audit" && method === "GET") {
      requireAdmin();
      const params = new URL(req.url).searchParams;
      const limit = Math.min(500, Math.max(1, Number(params.get("limit") || 200)));
      const { data: auditRows, error } = await supabase.from("objects")
        .select("id,data,created_at,date").eq("kind", "audit").eq("deleted", false)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) return fail(`Could not load audit trail: ${error.message}`, 500);
      let entries = (auditRows || []).map((r: any) => {
        const d = parseData(r.data);
        return { id: r.id, at: Number(d.at || r.created_at || Date.now()), user_id: d.user_id || "", user_name: d.user_name || "", action: d.action || r.type || "update", label: d.label || "", changes: d.changes || {}, ip: d.ip || "" };
      });
      const userFilter = params.get("user"), actionFilter = params.get("action");
      const from = params.get("from"), to = params.get("to");
      if (userFilter) entries = entries.filter((e: any) => e.user_id === userFilter);
      if (actionFilter) entries = entries.filter((e: any) => e.action === actionFilter);
      if (from) entries = entries.filter((e: any) => e.at >= new Date(`${from}T00:00:00`).getTime());
      if (to) entries = entries.filter((e: any) => e.at <= new Date(`${to}T23:59:59`).getTime());
      return json({ entries });
    }

    // Banking account balance summary. Account records live in the existing objects table.
    // Keep this route read-only; Bank rules and Transfers continue using their existing paths.
    if (root === "bank" && parts[1] === "balances" && method === "GET") {
      if (!roles.some(r => ["owner", "admin", "finance", "accountant", "employee", "staff"].includes(r))) {
        return fail("Your role does not have permission to view bank accounts.", 403);
      }
      const { data: accountRows, error: accountsError } = await supabase
        .from("objects")
        .select("id,data,deleted")
        .eq("kind", "account")
        .eq("deleted", false);
      if (accountsError) return fail(`Could not load bank accounts: ${accountsError.message}`, 500);

      const accounts = (accountRows || []).map((row: any) => {
        const account = asObject(row.data);
        const numeric = (value: any) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : 0;
        };
        return {
          id: row.id,
          // Use stored balance fields when available. Ledger-derived balances can be
          // added when journal_lines/bank_txns are migrated to Supabase.
          base: numeric(account.base ?? account.balance ?? account.openingBalance),
          balance: numeric(account.balance ?? account.openingBalance ?? account.base),
          unmatched: numeric(account.unmatched),
          statementBalance: account.statementBalance == null ? null : numeric(account.statementBalance),
          statementDate: account.statementDate || null,
        };
      });
      return json({ accounts });
    }


    // Payment reminders use the signed-in user's existing books_records data.
    if (root === "reminders" && parts[1] === "due" && method === "GET") {
      const { data: records, error: recordsError } = await supabase
        .from("books_records")
        .select("record_type,record_key,data")
        .eq("user_id", user.id)
        .in("record_type", ["doc", "contact", "reminder", "settings"]);
      if (recordsError) return fail(`Could not load payment reminders: ${recordsError.message}`, 500);

      const rows = records || [];
      const docs = rows.filter((r: any) => r.record_type === "doc").map((r: any) => ({
        ...(asObject(r.data)), id: r.record_key,
      }));
      const contacts = rows.filter((r: any) => r.record_type === "contact").map((r: any) => asObject(r.data));
      const reminders = rows.filter((r: any) => r.record_type === "reminder").map((r: any) => ({
        ...(asObject(r.data)), id: r.record_key,
      }));
      const invoices = docs.filter((d: any) => {
        if (d.type !== "invoice" || ["cancelled", "void", "draft"].includes(String(d.status || "").toLowerCase())) return false;
        const total = Number(d.total ?? d.totalAmount ?? d.grandTotal ?? 0) || 0;
        const paid = Number(d.paid ?? d.amountPaid ?? 0) || 0;
        const balance = Number(d.balanceDue ?? d.balance ?? (total - paid)) || 0;
        return balance > 0.005;
      }).map((d: any) => {
        const total = Number(d.total ?? d.totalAmount ?? d.grandTotal ?? 0) || 0;
        const paid = Number(d.paid ?? d.amountPaid ?? 0) || 0;
        const balance = Number(d.balanceDue ?? d.balance ?? (total - paid)) || 0;
        const dueDate = String(d.due || d.dueDate || d.date || today).slice(0, 10);
        const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
        const todayMs = Date.parse(`${today}T00:00:00Z`);
        const days = Number.isFinite(dueMs) ? Math.floor((todayMs - dueMs) / 86400000) : 0;
        const party = asObject(d.party);
        const contactName = String(party.name || d.contact || d.customerName || "");
        const contact = contacts.find((c: any) => String(c.name || "").trim().toLowerCase() === contactName.trim().toLowerCase());
        const to = String(d.email || party.email || contact?.email || contact?.data?.email || "");
        const number = String(d.number || d.docNumber || d.id);
        const currency = String(d.currency || "AED");
        const subject = `Payment reminder: Invoice ${number}`;
        const bodyText = `Dear ${contactName || "Customer"},\n\nThis is a friendly reminder that invoice ${number} has an outstanding balance of ${currency} ${balance.toFixed(2)} and was due on ${dueDate}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`;
        return { id: d.id, number, contact: contactName, due: dueDate, days, balance, currency, to, subject, body: bodyText };
      }).sort((a: any, b: any) => a.due.localeCompare(b.due));

      return json({ invoices, emailReady: !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("MAIL_FROM")), reminders });
    }

    if (root === "reminders" && parts[1] === "send" && method === "POST") {
      const docId = String(body.docId || "");
      if (!docId) return fail("An invoice ID is required.", 400);
      const { data: invoiceRow, error: invoiceError } = await supabase
        .from("books_records")
        .select("record_key,data")
        .eq("user_id", user.id)
        .eq("record_type", "doc")
        .eq("record_key", docId)
        .maybeSingle();
      if (invoiceError) return fail(`Could not load invoice: ${invoiceError.message}`, 500);
      if (!invoiceRow) return fail("Invoice not found.", 404);
      const d: any = { ...asObject(invoiceRow.data), id: invoiceRow.record_key };
      if (d.type !== "invoice") return fail("Payment reminders can only be sent for invoices.", 400);
      const total = Number(d.total ?? d.totalAmount ?? d.grandTotal ?? 0) || 0;
      const paid = Number(d.paid ?? d.amountPaid ?? 0) || 0;
      const balance = Number(d.balanceDue ?? d.balance ?? (total - paid)) || 0;
      if (balance <= 0.005) return fail("This invoice has no outstanding balance.", 400);

      const { data: contactRows } = await supabase
        .from("books_records").select("data").eq("user_id", user.id).eq("record_type", "contact");
      const party = asObject(d.party);
      const contactName = String(party.name || d.contact || d.customerName || "");
      const contact = (contactRows || []).map((r: any) => asObject(r.data))
        .find((c: any) => String(c.name || "").trim().toLowerCase() === contactName.trim().toLowerCase());
      const to = String(d.email || party.email || contact?.email || "");
      if (!to) return fail("No customer email is saved for this invoice.", 400);

      const number = String(d.number || d.docNumber || d.id);
      const currency = String(d.currency || "AED");
      const dueDate = String(d.due || d.dueDate || d.date || today).slice(0, 10);
      const subject = `Payment reminder: Invoice ${number}`;
      const message = `Dear ${contactName || "Customer"},\n\nThis is a friendly reminder that invoice ${number} has an outstanding balance of ${currency} ${balance.toFixed(2)} and was due on ${dueDate}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`;
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("MAIL_FROM");
      let status = "failed";
      let detail = "";
      if (!resendKey || !from) {
        detail = "Email is not configured. Set RESEND_API_KEY and MAIL_FROM in Supabase Edge Function secrets.";
      } else {
        try {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: [to], subject, text: message }),
          });
          const emailResult = await emailResponse.json().catch(() => ({}));
          if (!emailResponse.ok) detail = String(emailResult.message || emailResult.error || `Email provider returned HTTP ${emailResponse.status}.`);
          else { status = "sent"; detail = "Reminder email sent."; }
        } catch (e) { detail = e instanceof Error ? e.message : "Could not send email."; }
      }
      const reminder = {
        id: uid("rem_"), date: today, docId, number, stage: "manual", status, detail,
        to, subject, createdAt: now, createdBy: user.id,
      };
      const { error: saveError } = await supabase.from("books_records").upsert({
        user_id: user.id, record_type: "reminder", record_key: reminder.id, data: reminder,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,record_type,record_key" });
      if (saveError) return fail(`Reminder was processed but its history could not be saved: ${saveError.message}`, 500);
      return json({ reminder });
    }


    // Finance dashboard. Read the current user's existing books_records; no new table is required.
    if (root === "reports" && parts[1] === "dashboard" && method === "GET") {
      const { data: rows, error: rowsError } = await supabase
        .from("books_records")
        .select("record_type,record_key,data,updated_at")
        .eq("user_id", user.id);
      if (rowsError) return fail(`Could not load dashboard data: ${rowsError.message}`, 500);

      const records: Record<string, any[]> = {};
      for (const row of rows || []) {
        const kind = String(row.record_type || "");
        if (!records[kind]) records[kind] = [];
        records[kind].push({ ...asObject(row.data), id: row.record_key });
      }
      const docs = records.doc || [];
      const invoices = docs.filter((d: any) => d.type === "invoice" && d.status !== "cancelled" && d.status !== "void");
      const bills = records.bill || [];
      const expensesRows = records.expense || [];
      const payments = records.payment || [];
      const billPayments = records.billPayment || [];
      const reconciliations = records.reconciliation || [];
      const rules = records.rule || [];
      const accounts = records.account || [];
      const today = todayInZone(h.timezone || "Asia/Dubai");
      const monthStart = `${today.slice(0, 7)}-01`;
      const shiftMonth = (date: string, delta: number) => {
        const d = new Date(`${date}T12:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + delta);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      };
      const amount = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      // Calculate an invoice's gross total from its line items when older/newer
      // records do not persist a top-level total field.
      const invoiceGrossTotal = (d: any) => {
        const savedTotal = d.total ?? d.totalAmount ?? d.grandTotal;
        if (savedTotal !== null && savedTotal !== undefined) return Math.max(0, amount(savedTotal));

        const items = Array.isArray(d.items) ? d.items : [];
        let total = items.reduce((sum: number, item: any) => {
          const qty = amount(item.qty ?? item.quantity ?? 1);
          const rate = amount(item.rate ?? item.price ?? item.unitPrice);
          const gross = qty * rate;
          const discountValue = amount(item.disc ?? item.discount);
          const discountType = String(item.discType ?? item.discountType ?? "amt").toLowerCase();
          const discount = discountType === "pct" || discountType === "percent"
            ? gross * discountValue / 100
            : discountValue;
          const taxable = Math.max(0, gross - discount);
          const vatRate = amount(item.vat ?? item.vatRate ?? item.taxRate);
          return sum + taxable + taxable * vatRate / 100;
        }, 0);

        const invoiceDiscount = d.discount;
        if (invoiceDiscount && typeof invoiceDiscount === "object") {
          const value = amount(invoiceDiscount.value);
          const type = String(invoiceDiscount.type ?? "amt").toLowerCase();
          const discount = type === "pct" || type === "percent" ? total * value / 100 : value;
          total = Math.max(0, total - discount);
        }
        return Math.max(0, total);
      };
      // Payments are stored as separate records. Calculate the amount allocated to
      // each invoice so a saved/stale balanceDue does not continue showing the full
      // invoice total after a payment has been recorded.
      const allocatedByInvoice = new Map<string, number>();
      for (const payment of payments) {
        const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
        for (const allocation of allocations) {
          const docId = String(allocation?.docId || "");
          const applied = Math.max(0, amount(allocation?.amount));
          if (!docId || applied <= 0) continue;
          allocatedByInvoice.set(docId, (allocatedByInvoice.get(docId) || 0) + applied);
        }
      }
      const invoiceTotal = (d: any) => {
        const allocated = allocatedByInvoice.get(String(d.id || "")) || 0;
        if (allocated > 0) {
          // Use the greater value rather than adding both, because some older
          // invoice records may already have their paid field updated.
          const paid = Math.max(amount(d.paid ?? d.amountPaid), allocated);
          return Math.max(0, invoiceGrossTotal(d) - paid);
        }
        const savedBalance = d.balanceDue ?? d.balance;
        if (savedBalance !== null && savedBalance !== undefined) return Math.max(0, amount(savedBalance));
        return Math.max(0, invoiceGrossTotal(d) - amount(d.paid ?? d.amountPaid));
      };
      const billTotal = (d: any) => amount(d.balanceDue ?? d.balance ?? Math.max(0, amount(d.total) - amount(d.paid)));
      const overdue = (d: any) => !!d.due && String(d.due).slice(0, 10) < today;
      const openInvoices = invoices.filter((d: any) => invoiceTotal(d) > 0);
      const openBills = bills.filter((d: any) => d.status !== "void" && billTotal(d) > 0);

      // Apply issued credit notes only to the invoice they reference.
      // This adjusts the dashboard's overall receivables figure without changing
      // the existing overdue amount/count calculation.
      const creditNotes = docs.filter((d: any) => {
        const type = String(d.type || "").toLowerCase().replace(/[ _]/g, "-");
        const status = String(d.status || "").toLowerCase();
        return ["credit-note", "creditnote"].includes(type) &&
          !["draft", "cancelled", "canceled", "void", "rejected"].includes(status);
      });
      const invoiceKey = (v: any) => String(v ?? "").trim().toLowerCase();
      const creditNoteInvoiceKeys = (cn: any) => {
        const linked = cn.invoice ?? cn.linkedInvoice ?? cn.relatedInvoice ?? {};
        return [
          cn.invoiceId, cn.invoice_id, cn.linkedInvoiceId, cn.linked_invoice_id,
          cn.invoiceNumber, cn.invoice_number, cn.linkedInvoiceNumber, cn.linked_invoice_number,
          cn.againstInvoice, cn.referenceInvoice, cn.reference, cn.ref,
          typeof linked === "object" ? linked.id : linked,
          typeof linked === "object" ? linked.number : "",
          typeof linked === "object" ? linked.docNumber : "",
        ].map(invoiceKey).filter(Boolean);
      };
      const invoiceReceivableAfterCredits = (invoice: any) => {
        const keys = new Set([invoice.id, invoice.number, invoice.docNumber].map(invoiceKey).filter(Boolean));
        const credit = creditNotes.reduce((sum: number, note: any) => {
          const noteKeys = creditNoteInvoiceKeys(note);
          const sameInvoice = noteKeys.some((key: string) => keys.has(key));
          const sameCustomer = String(note.party?.name || note.contact || "").trim().toLowerCase() ===
            String(invoice.party?.name || invoice.contact || "").trim().toLowerCase();
          const sameCurrency = String(note.currency || "AED").toUpperCase() ===
            String(invoice.currency || "AED").toUpperCase();
          if (!sameInvoice || !sameCustomer || !sameCurrency) return sum;
          return sum + invoiceGrossTotal(note);
        }, 0);
        return Math.max(0, invoiceTotal(invoice) - credit);
      };
      const receivablesInvoices = openInvoices
        .map((invoice: any) => ({ invoice, balance: invoiceReceivableAfterCredits(invoice) }))
        .filter((entry: any) => entry.balance > 0.005);
      const receivables = {
        total: receivablesInvoices.reduce((s: number, entry: any) => s + entry.balance, 0),
        count: receivablesInvoices.length,
        // Intentionally preserve the existing overdue calculation and count.
        overdue: openInvoices.filter(overdue).reduce((s: number, d: any) => s + invoiceTotal(d), 0),
        overdueCount: openInvoices.filter(overdue).length,
        advances: 0,
      };
      const dueSoonEnd = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
      const dueSoon = openBills
        .filter((d: any) => !!d.due && String(d.due).slice(0, 10) >= today && String(d.due).slice(0, 10) <= dueSoonEnd)
        .sort((a: any, b: any) => String(a.due).localeCompare(String(b.due)))
        .slice(0, 8)
        .map((d: any) => ({ id: d.id, due: d.due, contact: d.contact || d.party?.name || "Supplier", number: d.number || "", balance: billTotal(d), currency: d.currency || "AED" }));
      const payables = {
        total: openBills.reduce((s: number, d: any) => s + billTotal(d), 0),
        count: openBills.length,
        overdue: openBills.filter(overdue).reduce((s: number, d: any) => s + billTotal(d), 0),
        overdueCount: openBills.filter(overdue).length,
        dueSoon,
      };
      const cash = accounts.filter((a: any) => !a.archived && (a.subtype === "bank" || a.subtype === "cash"))
        .map((a: any) => ({ name: a.name || a.accountName || "Account", amount: amount(a.balance ?? a.openingBalance ?? a.base) }));
      const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today, i - 5));
      // Cash-basis dashboard trend: count income only when a customer payment
      // was recorded, and count costs only when a bill payment or expense was
      // recorded. Unpaid invoices and unpaid bills are not cash profit/loss.
      const trend = months.map((start: string) => {
        const next = shiftMonth(start, 1);
        const inMonth = (x: any) => {
          const date = String(x.date || x.createdAt || x.created_at || "").slice(0, 10);
          return date >= start && date < next;
        };
        const receivedInMonth = payments.filter(inMonth);
        const paidBillsInMonth = billPayments.filter(inMonth);
        const expensesInMonth = expensesRows.filter(inMonth);
        return {
          month: start.slice(0, 7),
          income: receivedInMonth.reduce((s: number, p: any) => s + amount(p.amount ?? p.total), 0),
          expense: [...paidBillsInMonth, ...expensesInMonth]
            .reduce((s: number, x: any) => s + amount(x.amount ?? x.total), 0),
        };
      });
      const currentIncome = trend[trend.length - 1]?.income || 0;
      const currentExpense = trend[trend.length - 1]?.expense || 0;
      const monthExpenses = expensesRows.filter((e: any) => String(e.date || "").slice(0, 10) >= monthStart && String(e.date || "").slice(0, 10) <= today);
      const lastMonthStart = shiftMonth(today, -1);
      const expenses = {
        thisMonth: monthExpenses.reduce((s: number, e: any) => s + amount(e.amount ?? e.total), 0),
        lastMonth: expensesRows.filter((e: any) => String(e.date || "").slice(0, 10) >= lastMonthStart && String(e.date || "").slice(0, 10) < monthStart)
          .reduce((s: number, e: any) => s + amount(e.amount ?? e.total), 0),
        top: [],
        others: 0,
      };
      const debtorMap = new Map<string, number>();
      for (const entry of receivablesInvoices) {
        const d = entry.invoice;
        const contact = String(d.party?.name || d.contact || "Unknown customer");
        debtorMap.set(contact, (debtorMap.get(contact) || 0) + entry.balance);
      }
      const topDebtors = [...debtorMap.entries()].map(([contact, value]) => ({ contact, amount: value }))
        .sort((a, b) => b.amount - a.amount).slice(0, 5);
      const thisMonth = { income: currentIncome, expense: currentExpense, profit: currentIncome - currentExpense };
      const unmatched = reconciliations.filter((r: any) => !r.matched && r.status !== "matched").length;
      return json({
        today,
        cash,
        cashTotal: cash.reduce((s: number, a: any) => s + a.amount, 0),
        unmatched,
        receivables,
        payables,
        expenses,
        thisMonth,
        trend,
        topDebtors,
      });
    }

    // Finance report endpoints. The browser uses reports/<report_name>; serve them
    // through this authenticated function and build the report from the user's saved books records.
    if (root === "reports" && parts[1] && parts[1] !== "dashboard" && method === "GET") {
      const reportName = parts[1];
      const from = String(body.from || today.slice(0, 8) + "01");
      const to = String(body.to || today);
      const { data: reportRows, error: reportError } = await supabase
        .from("books_records")
        .select("record_type,record_key,data")
        .eq("user_id", user.id);
      if (reportError) return fail(`Could not load report data: ${reportError.message}`, 500);
      const all = (reportRows || []).map((r: any) => ({
        kind: String(r.record_type || ""), id: String(r.record_key || ""),
        ...asObject(r.data),
      }));
      const amount = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
      const dateOf = (x: any) => String(x.date || x.createdAt || x.created_at || "").slice(0, 10);
      const inRange = (x: any) => { const d = dateOf(x); return d && d >= from && d <= to; };
      const docs = all.filter((x: any) => x.kind === "doc");
      const invoices = docs.filter((x: any) => x.type === "invoice" && !["cancelled", "void"].includes(String(x.status || "").toLowerCase()));
      const bills = all.filter((x: any) => x.kind === "bill" && !["cancelled", "void"].includes(String(x.status || "").toLowerCase()));
      const payments = all.filter((x: any) => x.kind === "payment" && inRange(x));
      const billPayments = all.filter((x: any) => x.kind === "billPayment" && inRange(x));
      const expenses = all.filter((x: any) => x.kind === "expense" && inRange(x));
      const openBalance = (x: any) => Math.max(0, amount(x.balanceDue ?? x.balance ?? (amount(x.total ?? x.totalAmount) - amount(x.paid ?? x.amountPaid))));
      const contactOf = (x: any) => String(x.contact || x.party?.name || x.customerName || x.vendorName || "");
      const total = (xs: any[], fn = (x: any) => amount(x.total ?? x.amount)) => xs.reduce((s, x) => s + fn(x), 0);
      const docRows = (xs: any[]) => xs.filter(inRange).map((x: any) => ({ id: x.id, number: x.number || x.docNumber || x.id, date: dateOf(x), contact: contactOf(x), amount: amount(x.total ?? x.amount), currency: x.currency || "AED", account: x.accountName || x.account || "", reference: x.reference || "" }));
      const titleMap: Record<string,string> = {
        profit_loss:"Profit and loss", balance_sheet:"Balance sheet", cash_flow:"Cash flow",
        ar_ageing:"Receivables ageing", ap_ageing:"Payables ageing", customer_statement:"Customer statement",
        payments_received:"Payments received", sales_by_customer:"Sales by customer", sales_by_item:"Sales by item",
        vendor_balances:"Vendor balances", payments_made:"Payments made", expenses_by_category:"Expenses by category",
        expense_list:"Expense list", vat_return:"VAT return (VAT 201)", vat_detail:"VAT detail",
        trial_balance:"Trial balance", general_ledger:"General ledger", journal:"Journal"
      };
      const title = titleMap[reportName];
      if (!title) return fail(`Unknown report: ${reportName}`, 404);
      const base = { title, from, to, asOf: ["balance_sheet","trial_balance","ar_ageing","ap_ageing","vendor_balances"].includes(reportName) ? to : undefined };
      if (reportName === "payments_received") return json({ ...base, rows: docRows(payments), total: total(payments) });
      if (reportName === "payments_made") return json({ ...base, rows: docRows(billPayments), total: total(billPayments) });
      if (reportName === "expense_list") return json({ ...base, rows: docRows(expenses), total: total(expenses) });
      if (reportName === "sales_by_customer") {
        const map = new Map<string, any>();
        for (const x of invoices.filter(inRange)) { const c = contactOf(x) || "—"; const r = map.get(c) || { contact: c, documents: 0, amount: 0 }; r.documents++; r.amount += amount(x.total); map.set(c, r); }
        const rows = [...map.values()]; return json({ ...base, rows, total: total(rows, (x:any)=>x.amount) });
      }
      if (reportName === "vendor_balances") {
        const map = new Map<string, any>();
        for (const x of bills) { const c = contactOf(x) || "—"; const r = map.get(c) || { contact: c, amount: 0 }; r.amount += openBalance(x); map.set(c, r); }
        const rows = [...map.values()]; return json({ ...base, rows, total: total(rows, (x:any)=>x.amount), note: "Calculated from saved bill balances." });
      }
      if (reportName === "ar_ageing" || reportName === "ap_ageing") {
        const source = reportName === "ar_ageing" ? invoices : bills;
        const buckets = ["current","d1_30","d31_60","d61_90","d90"];
        const map = new Map<string, any>();
        for (const x of source) {
          const balance = openBalance(x); if (balance <= 0) continue;
          const due = String(x.due || x.dueDate || x.date || to).slice(0,10);
          const days = Math.max(0, Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`))/86400000));
          const bucket = days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90";
          const c = contactOf(x) || "—"; const r = map.get(c) || { contact:c, current:0,d1_30:0,d31_60:0,d61_90:0,d90:0,total:0,items:[] };
          r[bucket] += balance; r.total += balance; r.items.push({ id:x.id, number:x.number || x.docNumber || x.id, due, balance, balanceBase:balance, currency:x.currency || "AED", bucket }); map.set(c,r);
        }
        const rows = [...map.values()]; const totals: any = { total:0 }; buckets.forEach(b=>totals[b]=0); rows.forEach(r=>{ totals.total+=r.total; buckets.forEach(b=>totals[b]+=r[b]); });
        return json({ ...base, buckets, rows, totals, advances: [] });
      }
      if (reportName === "sales_by_item") {
        const map = new Map<string, any>();
        for (const x of invoices.filter(inRange)) for (const line of (Array.isArray(x.items) ? x.items : [])) { const item=String(line.name || line.item || line.description || "Item"); const r=map.get(item)||{item,qty:0,amount:0}; r.qty+=amount(line.qty ?? line.quantity); r.amount+=amount(line.amount ?? line.total ?? (amount(line.qty ?? line.quantity)*amount(line.price))); map.set(item,r); }
        const rows=[...map.values()]; return json({...base,rows,total:total(rows,(x:any)=>x.amount)});
      }
      if (reportName === "expenses_by_category") {
        const map=new Map<string,any>();
        for (const x of expenses) { const name=String(x.category || x.accountName || x.account || "Uncategorised"); const r=map.get(name)||{id:"",code:"",name,amount:0}; r.amount+=amount(x.amount ?? x.total); map.set(name,r); }
        const rows=[...map.values()]; return json({...base,rows,total:total(rows,(x:any)=>x.amount)});
      }
      if (reportName === "customer_statement") {
        const contact=String(body.contact || "");
        const rows=invoices.filter((x:any)=>contactOf(x).toLowerCase()===contact.toLowerCase() && inRange(x)).map((x:any)=>({date:dateOf(x),label:"Invoice",kind:"doc",id:x.id,number:x.number||x.id,debit:amount(x.total),credit:amount(x.paid),balance:openBalance(x)}));
        return json({...base,contact,groups: rows.length ? [{currency:"AED",opening:0,rows,invoiced:total(rows,(x:any)=>x.debit),received:total(rows,(x:any)=>x.credit),closing:total(rows,(x:any)=>x.balance)}] : []});
      }
      if (reportName === "vat_detail") return json({...base,rows:[]});
      if (reportName === "vat_return") return json({...base,drafts:[],boxes:[]});
      if (reportName === "general_ledger") return json({...base,groups:[]});
      if (reportName === "journal") return json({...base,entries:[]});
      if (reportName === "trial_balance") return json({...base,rows:[],totals:{debit:0,credit:0,balanced:true}});
      if (reportName === "cash_flow") return json({...base,opening:0,sections:[{label:"Operating activities",rows:[],total:0},{label:"Investing activities",rows:[],total:0},{label:"Financing activities",rows:[],total:0}],net:0,closing:0});
      if (reportName === "profit_loss") {
        // Cash-basis P&L: income is customer payments actually received during
        // the selected period; expenses are recorded expenses plus supplier
        // bill payments actually made during that period. Invoice totals,
        // outstanding receivables, and unpaid bills are excluded.
        const income = total(payments, (x: any) => amount(x.amount ?? x.total));
        const costs = total([...billPayments, ...expenses], (x: any) => amount(x.amount ?? x.total));
        return json({...base,sections:[{label:"Income",rows:[],total:income},{label:"Expenses",rows:[],total:costs},{label:"Net profit",total:income-costs,final:true}]});
      }
      if (reportName === "balance_sheet") return json({...base,sections:[{label:"Assets",rows:[],total:0},{label:"Liabilities",rows:[],total:0},{label:"Equity",rows:[],total:0,final:true}],balanced:true});
    }


    if (root !== "hr") return fail(`Unknown API route: ${path}`, 404);
    const route = parts.slice(1).join("/");


    if (route === "config" && method === "GET") {
      const me = await employeeForUser();
      const { count: unread, error: unreadError } = await supabase
        .from("hr_notifications").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("read", false);
      if (unreadError) return fail(`HR notifications: ${unreadError.message}`, 500);
      let pending = 0;
      if (canManage(roles)) {
        const { count, error } = await supabase.from("hr_leaves")
          .select("id", { count: "exact", head: true }).eq("status", "pending");
        if (error) return fail(`Pending leave requests: ${error.message}`, 500);
        pending = count || 0;
      }
      return json({
        settings: h, today, now, unread: unread || 0, pending,
        perms: {
          manage: canManage(roles),
          payroll: canPayroll(roles),
          admin: isAdmin(roles),
          self: isSelfService(roles),
        },
        me: me ? {
          id: me.id, name: me.name || "", code: me.code || "",
          department: me.department || "", designation: me.designation || "",
          joined: me.joined || "", leave: { ...h.leaveDefaults, ...asObject(me.leave) },
        } : null,
      });
    }

    if (route === "employees" && method === "GET") {
      requireManager();
      const employees = await getEmployees();
      return json({ employees, items: employees });
    }

    // Create an employee record using the existing objects table. Keep this route
    // deliberately scoped to POST /hr/employees; other HR routes are unchanged.
    if (route === "employees" && method === "POST") {
      requireManager();

      // Use the server-side service-role client for this trusted, role-checked
      // write so the objects table's user-facing RLS policies remain enabled.
      // This key must exist only in Supabase Edge Function secrets, never in the browser.
      const employeeDb = adminClient();

      const name = String(body.name || "").trim();
      const code = String(body.code || "").trim();
      if (!name) return fail("Employee full name is required.", 400);
      if (!code) return fail("Employee number is required.", 400);

      const { data: existing, error: existingError } = await employeeDb
        .from("objects")
        .select("id,number,data,deleted")
        .eq("kind", "employee")
        .eq("number", code)
        .eq("deleted", false)
        .limit(1);
      if (existingError) return fail(`Could not check employee number: ${existingError.message}`, 500);
      if (existing && existing.length) return fail("That employee number is already in use.", 409);

      const id = String(body.id || uid("emp_"));
      const timestamp = epoch();
      const employeeData = {
        name,
        code,
        department: String(body.department || "").trim(),
        designation: String(body.designation || "").trim(),
        joined: String(body.joined || today),
        email: String(body.email || "").trim(),
        phone: String(body.phone || "").trim(),
        status: String(body.status || "active"),
        leave: {
          annual: Number(asObject(body.leave).annual ?? h.leaveDefaults.annual),
          sick: Number(asObject(body.leave).sick ?? h.leaveDefaults.sick),
          casual: Number(asObject(body.leave).casual ?? h.leaveDefaults.casual),
        },
        userId: body.userId || null,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      };

      const { data: saved, error: saveError } = await employeeDb
        .from("objects")
        .insert({
          id,
          kind: "employee",
          type: "employee",
          number: code,
          date: employeeData.joined,
          status: employeeData.status,
          contact: employeeData.email || null,
          data: employeeData,
          version: 1,
          deleted: false,
          created_at: timestamp,
          created_by: user.id,
          updated_at: timestamp,
          updated_by: user.id,
        })
        .select("id,number,data,deleted,version")
        .single();
      if (saveError) return fail(`Could not save employee: ${saveError.message}`, 500);

      const savedData = asObject(saved.data);
      const employee = {
        id: saved.id,
        code: saved.number || savedData.code || code,
        ...savedData,
        version: saved.version ?? savedData.version ?? 1,
      };
      return json({ ok: true, employee, object: { ...saved, data: savedData } }, 201);
    }

    if (route === "attendance" && method === "GET") {
      requireManager();
      let q = supabase.from("hr_attendance").select("*").order("date", { ascending: false });
      if (body.month) {
        q = q.gte("date", `${body.month}-01`).lte("date", `${body.month}-31`);
      }
      const { data, error } = await q;
      if (error) return fail(error.message, 500);
      return json({ items: data || [], records: data || [] });
    }

    if (route === "attendance" && method === "POST") {
      requireManager();
      const record = {
        id: String(body.id || uid("att_")),
        employee_id: String(body.employee_id || body.employeeId || ""),
        date: String(body.date || today),
        clock_in: body.clock_in ?? body.clockIn ?? null,
        clock_out: body.clock_out ?? body.clockOut ?? null,
        status: String(body.status || "present"),
        notes: String(body.notes || ""),
        edited: true,
        created_at: Number(body.created_at || now),
        updated_at: now,
        updated_by: user.id,
      };
      if (!record.employee_id) return fail("employee_id is required.");
      const { data, error } = await supabase.from("hr_attendance")
        .upsert(record, { onConflict: "employee_id,date" }).select().single();
      if (error) return fail(error.message, 400);
      return json({ record: data });
    }

    // HR/admin leave-request list. The HR screen calls GET /hr/leaves;
    // return both the database fields and UI-friendly camelCase aliases.
    if (route === "leaves" && method === "GET") {
      requireManager();
      const hrDb = adminClient();
      const statusFilter = String(body.status || "").trim().toLowerCase();
      let query = hrDb.from("hr_leaves").select("*").order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
      const [{ data: rows, error }, employees] = await Promise.all([query, getEmployees()]);
      if (error) return fail(`Could not load leave requests: ${error.message}`, 500);
      const employeesById = new Map(employees.map((e: any) => [String(e.id), e]));
      const items = (rows || []).map((row: any) => {
        const employee: any = employeesById.get(String(row.employee_id));
        const leaveType = row.leave_type || row.leaveType || "annual";
        const startDate = row.start_date || row.startDate || "";
        const endDate = row.end_date || row.endDate || "";
        const adminNote = row.admin_note || row.adminNote || "";
        return {
          ...row,
          employeeName: employee?.name || "Employee",
          employeeCode: employee?.code || "",
          department: employee?.department || "",
          leaveType, startDate, endDate, adminNote,
          days: Number(row.days || 0),
          reason: row.reason || "",
          status: row.status || "pending",
          createdAt: row.created_at,
        };
      });
      return json({ items, leaves: items, requests: items });
    }

    if (route === "leaves" && method === "POST") {
      const self = isSelfService(roles);
      if (!self) requireManager();
      const hrDb = adminClient();
      const me = self ? await employeeForUser() : null;
      if (self && !me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const employeeId = String((self ? me?.id : body.employee_id || body.employeeId) || "");
      if (!employeeId) return fail("An employee must be selected.", 400);
      const startDate = String(body.start_date || body.startDate || "");
      const endDate = String(body.end_date || body.endDate || "");
      if (!startDate || !endDate || endDate < startDate) return fail("Enter a valid leave date range.");
      const row = {
        id: String(body.id || uid("leave_")),
        employee_id: employeeId,
        leave_type: String(body.leave_type || body.leaveType || "annual"),
        start_date: startDate,
        end_date: endDate,
        days: Number(body.days || 1),
        reason: String(body.reason || ""),
        status: self ? "pending" : String(body.status || "pending"),
        admin_note: String(body.admin_note || body.adminNote || ""),
        created_at: now,
        created_by: user.id,
        reviewed_at: null,
        reviewed_by: null,
      };
      const { data, error } = await hrDb.from("hr_leaves").insert(row).select().single();
      if (error) return fail(error.message, 400);
      return json({ leave: data, item: data });
    }

    if (parts[1] === "leaves" && parts[2] && method === "POST" &&
        ["approve", "reject", "cancel"].includes(parts[3] || "")) {
      if ((parts[3] || "") !== "cancel") requireManager();
      const hrDb = adminClient();
      const id = parts[2];
      const action = parts[3];
      if (action !== "cancel") requireManager();
      const patch: any = {
        status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled",
      };
      if (action !== "cancel") {
        patch.admin_note = String(body.admin_note || body.adminNote || "");
        patch.reviewed_at = now;
        patch.reviewed_by = user.id;
      }
      const { data, error } = await hrDb.from("hr_leaves")
        .update(patch).eq("id", id).select().single();
      if (error) return fail(error.message, 400);
      return json({ leave: data, item: data });
    }

    // Compatibility with the HR review dialog, which sends
    // PUT /hr/leaves/:id/review with status and an optional admin note.
    // Keep the existing POST approve/reject/cancel routes unchanged.
    if (parts[1] === "leaves" && parts[2] && parts[3] === "review" && method === "PUT") {
      requireManager();
      const id = parts[2];
      const requestedStatus = String(body.status || body.action || "").trim().toLowerCase();
      const statusMap: Record<string, string> = {
        approve: "approved",
        approved: "approved",
        reject: "rejected",
        rejected: "rejected",
      };
      const nextStatus = statusMap[requestedStatus];
      if (!nextStatus) return fail("Choose approve or reject for this leave request.", 400);

      const hrDb = adminClient();
      const patch = {
        status: nextStatus,
        admin_note: String(body.admin_note || body.adminNote || body.note || ""),
        reviewed_at: now,
        reviewed_by: user.id,
      };
      const { data, error } = await hrDb.from("hr_leaves")
        .update(patch).eq("id", id).select().maybeSingle();
      if (error) return fail(`Could not review leave request: ${error.message}`, 400);
      if (!data) return fail("Leave request not found.", 404);
      return json({ ok: true, leave: data, item: data });
    }

    if (route === "holidays" && method === "GET") {
      const hrDb = adminClient();
      const { data, error } = await hrDb.from("hr_holidays").select("*").order("date");
      if (error) return fail(error.message, 500);
      return json({ items: data || [], holidays: data || [] });
    }
    if (route === "holidays" && method === "POST") {
      requireManager();
      const hrDb = adminClient();
      const row = {
        id: String(body.id || uid("hol_")),
        date: String(body.date || ""),
        name: String(body.name || "").trim(),
        estimated: body.estimated ? 1 : 0,
        created_at: now, updated_at: now,
      };
      if (!row.date || !row.name) return fail("Holiday date and name are required.");
      const { data, error } = await hrDb.from("hr_holidays")
        .upsert(row, { onConflict: "date" }).select().single();
      if (error) return fail(error.message, 400);
      return json({ holiday: data });
    }
    if (parts[1] === "holidays" && parts[2] && method === "DELETE") {
      requireManager();
      const hrDb = adminClient();
      const { error } = await hrDb.from("hr_holidays").delete().eq("id", parts[2]);
      if (error) return fail(error.message, 400);
      return json({ ok: true });
    }

    if (route === "notifications" && method === "GET") {
      const { data, error } = await supabase.from("hr_notifications").select("*")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
      if (error) return fail(error.message, 500);
      const items = data || [];
      return json({
        items: items.map((r: any) => ({ ...r, read: !!r.read, createdAt: r.created_at })),
        unread: items.filter((r: any) => !r.read).length,
      });
    }
    if (route === "notifications/read-all" && method === "POST") {
      const { error } = await supabase.from("hr_notifications").update({ read: true })
        .eq("user_id", user.id).eq("read", false);
      if (error) return fail(error.message, 400);
      return json({ ok: true });
    }
    if (parts[1] === "notifications" && parts[2] && parts[3] === "read" && method === "POST") {
      const { error } = await supabase.from("hr_notifications").update({ read: true })
        .eq("id", Number(parts[2])).eq("user_id", user.id);
      if (error) return fail(error.message, 400);
      return json({ ok: true });
    }

    // Employee self-service dashboard used by Books/js/hr.js (pageMyDay).
    // Return the exact camelCase fields consumed by the employee UI.
    if (route === "me/dashboard" && method === "GET") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();

      const month = today.slice(0, 7);
      const yearStart = `${today.slice(0, 4)}-01-01`;
      const yearEnd = `${today.slice(0, 4)}-12-31`;
      const monthStart = `${month}-01`;
      const [{ data: attendanceRows, error: attendanceError }, { data: leaveRows, error: leaveError }, { data: holidayRows, error: holidayError }] = await Promise.all([
        hrDb.from("hr_attendance").select("*").eq("employee_id", me.id)
          .gte("date", monthStart).lte("date", today).order("date", { ascending: false }),
        hrDb.from("hr_leaves").select("*").eq("employee_id", me.id)
          .lte("start_date", yearEnd).gte("end_date", yearStart).order("created_at", { ascending: false }),
        hrDb.from("hr_holidays").select("*").gte("date", today).order("date", { ascending: true }),
      ]);
      if (attendanceError || leaveError || holidayError) {
        return fail((attendanceError || leaveError || holidayError)!.message, 500);
      }

      const attendance = attendanceRows || [];
      const leaves = leaveRows || [];
      const holidays = (holidayRows || []).map((x: any) => ({ ...x, estimated: !!x.estimated }));
      const caps = { ...h.leaveDefaults, ...asObject(me.leaveDefaults) };
      const leaveTypes = ["annual", "sick", "casual"] as const;
      const balance: Record<string, number> = {};
      for (const type of leaveTypes) {
        const used = leaves.filter((l: any) => l.status === "approved" && String(l.leave_type || l.leaveType || "annual").toLowerCase() === type)
          .reduce((sum: number, l: any) => sum + Math.max(0, Number(l.days || 0)), 0);
        balance[type] = Math.max(0, Number(caps[type] ?? 0) - used);
      }
      const pendingLeaves = leaves.filter((l: any) => l.status === "pending").length;
      const todayLeave = leaves.find((l: any) => l.status === "approved" && l.start_date <= today && l.end_date >= today);
      const todayHoliday = holidays.find((x: any) => x.date === today)?.name || "";
      const recent = attendance.slice(0, 10).map((a: any) => {
        const clockIn = a.clock_in == null ? null : Number(a.clock_in);
        const clockOut = a.clock_out == null ? null : Number(a.clock_out);
        const hours = clockIn && clockOut ? Math.max(0, (clockOut - clockIn) / 3600000) : 0;
        return {
          id: a.id, date: a.date, clockIn, clockOut,
          clockInLocal: clockIn ? new Date(clockIn).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: h.timezone }) : "",
          clockOutLocal: clockOut ? new Date(clockOut).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: h.timezone }) : "",
          hours: Math.round(hours * 100) / 100, status: a.status || "present", notes: a.notes || "", edited: !!a.edited,
        };
      });
      const worked = attendance.filter((a: any) => a.clock_in);
      const hours = worked.reduce((sum: number, a: any) => {
        if (!a.clock_in || !a.clock_out) return sum;
        return sum + Math.max(0, (Number(a.clock_out) - Number(a.clock_in)) / 3600000);
      }, 0);
      const weekend = h.weekend.includes(new Date(`${today}T00:00:00Z`).getUTCDay());

      return json({
        date: today, today, month,
        leave: { annual: balance.annual, sick: balance.sick, casual: balance.casual, unpaid: Number(caps.unpaid ?? 0) },
        pendingLeaves,
        presentDays: new Set(worked.map((a: any) => a.date)).size,
        lateDays: new Set(attendance.filter((a: any) => a.status === "late").map((a: any) => a.date)).size,
        hours: Math.round(hours * 100) / 100,
        recent, upcomingHolidays: holidays.slice(0, 8), todayHoliday,
        onLeave: todayLeave ? { leaveType: todayLeave.leave_type || todayLeave.leaveType || "annual", endDate: todayLeave.end_date } : null,
        weekend,
      });
    }

    // Employee self-service: attendance history for the selected month.
    if (route === "me/attendance" && method === "GET") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const month = /^\d{4}-\d{2}$/.test(String(body.month || "")) ? String(body.month) : today.slice(0, 7);
      const [yy, mm] = month.split("-").map(Number);
      const first = `${month}-01`;
      const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      const { data: rows, error } = await hrDb.from("hr_attendance").select("*")
        .eq("employee_id", me.id).gte("date", first).lte("date", last).order("date", { ascending: false });
      if (error) return fail(`Could not load your attendance: ${error.message}`, 500);
      const records = (rows || []).map((a: any) => {
        const clockIn = a.clock_in == null ? null : Number(a.clock_in);
        const clockOut = a.clock_out == null ? null : Number(a.clock_out);
        const end = clockOut || (a.date === today && clockIn ? now : null);
        const hours = clockIn && end ? Math.max(0, (end - clockIn) / 3600000) : 0;
        const localTime = (v: number | null) => v ? new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: h.timezone }) : "";
        return { id: a.id, date: a.date, clockIn, clockOut, clockInLocal: localTime(clockIn), clockOutLocal: localTime(clockOut), hours: Math.round(hours * 100) / 100, status: a.status || "present", notes: a.notes || "", edited: !!a.edited };
      });
      return json({ month, records });
    }

    // Employee self-service: only this employee's leave records can be read or changed.
    if (route === "me/leaves" && method === "GET") {
      const me = await employeeForUser();
      const hrDb = adminClient();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const yearStart = `${today.slice(0, 4)}-01-01`;
      const yearEnd = `${today.slice(0, 4)}-12-31`;
      const [{ data: rows, error }, { data: holidays, error: holidayError }] = await Promise.all([
        hrDb.from("hr_leaves").select("*").eq("employee_id", me.id).order("created_at", { ascending: false }),
        hrDb.from("hr_holidays").select("date").gte("date", yearStart).lte("date", yearEnd),
      ]);
      if (error || holidayError) return fail((error || holidayError)!.message, 500);
      const leaves = (rows || []).map((l: any) => ({
        id: l.id, leaveType: l.leave_type || "annual", startDate: l.start_date, endDate: l.end_date,
        days: Number(l.days || 0), reason: l.reason || "", status: l.status || "pending", adminNote: l.admin_note || "",
        createdAt: l.created_at,
      }));
      const caps = { ...h.leaveDefaults, ...asObject(me.leaveDefaults), ...asObject(me.leave) };
      const balance: Record<string, number> = {};
      for (const type of ["annual", "sick", "casual", "unpaid"]) {
        const used = leaves.filter((l: any) => l.status === "approved" && l.leaveType === type).reduce((sum: number, l: any) => sum + l.days, 0);
        balance[type] = type === "unpaid" ? Number(caps.unpaid ?? 0) : Math.max(0, Number(caps[type] ?? 0) - used);
      }
      return json({ leaves, leave: balance });
    }

    if (route === "me/leaves" && method === "POST") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const type = String(body.leaveType || body.leave_type || "annual").toLowerCase();
      if (!["annual", "sick", "casual", "unpaid"].includes(type)) return fail("Choose a valid leave type.");
      const startDate = String(body.startDate || body.start_date || "");
      const endDate = String(body.endDate || body.end_date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return fail("Enter a valid leave date range.");
      const { data: holidayRows, error: holidayError } = await hrDb.from("hr_holidays").select("date").gte("date", startDate).lte("date", endDate);
      if (holidayError) return fail(holidayError.message, 500);
      const holidaySet = new Set((holidayRows || []).map((x: any) => x.date));
      let days = 0;
      for (let d = startDate, guard = 0; d <= endDate && guard < 400; guard++) {
        const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (!h.weekend.includes(dow) && !holidaySet.has(d)) days++;
        d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
      }
      if (!days) return fail("The selected dates contain no working days.");
      const { data: row, error } = await hrDb.from("hr_leaves").insert({
        id: uid("leave_"), employee_id: me.id, leave_type: type, start_date: startDate, end_date: endDate,
        days, reason: String(body.reason || ""), status: "pending", admin_note: "", created_at: now,
        created_by: user.id, reviewed_at: null, reviewed_by: null,
      }).select().single();
      if (error) return fail(`Could not submit leave request: ${error.message}`, 400);
      return json({ leave: { id: row.id, leaveType: row.leave_type, startDate: row.start_date, endDate: row.end_date, days: Number(row.days), reason: row.reason || "", status: row.status, adminNote: row.admin_note || "" } }, 201);
    }

    const selfLeaveDelete = route.match(/^me\/leaves\/([^/]+)$/);
    if (selfLeaveDelete && method === "DELETE") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const { data, error } = await hrDb.from("hr_leaves").update({ status: "cancelled", reviewed_at: now })
        .eq("id", selfLeaveDelete[1]).eq("employee_id", me.id).eq("status", "pending").select("id").maybeSingle();
      if (error) return fail(error.message, 400);
      if (!data) return fail("Leave request not found or it is no longer pending.", 409);
      return json({ ok: true });
    }

    // Only approved/paid pay runs are visible to an employee, and only their own line.
    if (route === "me/payslips" && method === "GET") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const payrollDb = adminClient();
      const { data: rows, error } = await payrollDb.from("objects")
        .select("id,number,date,status,data,deleted")
        .eq("kind", "payrun").eq("deleted", false).in("status", ["approved", "paid"])
        .order("date", { ascending: false });
      if (error) return fail(`Could not load your payslips: ${error.message}`, 500);
      const payslips: any[] = [];
      for (const row of rows || []) {
        const runData = asObject(row.data);
        const run = { ...runData, id: row.id, number: row.number || runData.number || "", date: row.date || runData.date || "", status: row.status || runData.status || "" };
        if (!Array.isArray(run.lines)) continue;
        for (const line of run.lines) {
          if (String(line.employeeId || line.employee_id || "") !== String(me.id)) continue;
          payslips.push({
            run: { id: run.id, number: run.number, period: run.period || "", date: run.date, status: run.status, payment: run.payment ? { date: run.payment.date || "" } : null },
            line: { ...line, gross: Number(line.gross || 0), totalDeductions: Number(line.totalDeductions ?? line.total_deductions ?? 0), net: Number(line.net || 0) },
          });
        }
      }
      payslips.sort((a, b) => String(b.run.period).localeCompare(String(a.run.period)) || String(b.run.date).localeCompare(String(a.run.date)));
      return json({ payslips, divisor: Number(h.payDivisor) || 30 });
    }

    if (route === "me/today" && method === "GET") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const { data, error } = await hrDb.from("hr_attendance").select("*")
        .eq("employee_id", me.id).eq("date", today).maybeSingle();
      if (error) return fail(error.message, 500);
      return json({ date: today, record: data || null });
    }
    if (route === "me/clock-in" && method === "POST") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const { data: existing } = await hrDb.from("hr_attendance").select("*")
        .eq("employee_id", me.id).eq("date", today).maybeSingle();
      if (existing?.clock_in) return fail("You have already clocked in today.", 409);
      const row = {
        id: existing?.id || uid("att_"), employee_id: me.id, date: today,
        clock_in: now, clock_out: null, status: "present", notes: "",
        edited: false, created_at: existing?.created_at || now, updated_at: now, updated_by: user.id,
      };
      const { data, error } = await hrDb.from("hr_attendance")
        .upsert(row, { onConflict: "employee_id,date" }).select().single();
      if (error) return fail(error.message, 400);
      return json({ record: data });
    }
    if (route === "me/clock-out" && method === "POST") {
      const me = await employeeForUser();
      if (!me) return fail("Your sign-in isn't linked to an employee record yet. Ask HR to link it.", 409);
      const hrDb = adminClient();
      const { data: existing, error: readError } = await hrDb.from("hr_attendance").select("*")
        .eq("employee_id", me.id).eq("date", today).maybeSingle();
      if (readError) return fail(readError.message, 500);
      if (!existing?.clock_in) return fail("You have not clocked in today.", 409);
      if (existing.clock_out) return fail("You have already clocked out today.", 409);
      const { data, error } = await hrDb.from("hr_attendance").update({ clock_out: now, updated_at: now, updated_by: user.id })
        .eq("id", existing.id).select().single();
      if (error) return fail(error.message, 400);
      return json({ record: data });
    }

    if (route === "settings" && (method === "PUT" || method === "POST")) {
      if (!isAdmin(roles)) return fail("Only the owner or an admin can change HR settings.", 403);
      const nextHr = { ...h, ...body };
      const nextData = { ...settingsData, hr: nextHr };
      if (!settingsRow) return fail("A settings object was not found in objects. Create the settings record first.", 409);
      const { error } = await supabase.from("objects").update({
        data: nextData, updated_at: now, version: Number(settingsRow.version || 0) + 1,
      }).eq("id", settingsRow.id);
      if (error) return fail(error.message, 400);
      return json({ ok: true, settings: nextHr });
    }

    if (route === "calendar" && method === "GET") {
      requireManager();
      const month = String(body.month || today.slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(month)) return fail("Invalid month. Use YYYY-MM.");
      const first = `${month}-01`;
      const [yy, mm] = month.split("-").map(Number);
      const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      const [{ data: holidayRows, error: he }, { data: leaveRows, error: le }] = await Promise.all([
        supabase.from("hr_holidays").select("*").gte("date", first).lte("date", last).order("date"),
        supabase.from("hr_leaves").select("*").in("status", ["pending", "approved"]).lte("start_date", last).gte("end_date", first).order("start_date"),
      ]);
      if (he || le) return fail((he || le)!.message, 500);
      const emps = await getEmployees();
      const byId = new Map(emps.map((e: any) => [e.id, e]));
      const holidays = (holidayRows || []).map((r: any) => ({ ...r, estimated: !!r.estimated }));
      const leaves = (leaveRows || []).map((r: any) => {
        const e: any = byId.get(r.employee_id);
        return { ...r, employeeName: e?.name || "Employee", employeeCode: e?.code || "", leaveType: r.leave_type || r.leaveType || "annual", startDate: r.start_date, endDate: r.end_date };
      });
      return json({ month, holidays, leaves, weekend: h.weekend });
    }

    if (route === "holidays/reminders" && method === "GET") {
      requireManager();
      const horizon = Math.max(0, Math.min(120, Number(h.reminderDays || 7)));
      const end = new Date(Date.parse(`${today}T00:00:00Z`) + horizon * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("hr_holidays").select("*")
        .gte("date", today).lte("date", end).order("date");
      if (error) return fail(error.message, 500);
      const items = (data || []).map((x: any) => ({ ...x, daysUntil: Math.round((Date.parse(`${x.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000), estimated: !!x.estimated }));
      return json({ windowDays: horizon, items });
    }

    if (route === "dashboard" && method === "GET") {
      requireManager();
      const employees = await getEmployees();
      const [{ data: attendance, error: ae }, { data: leaveRows, error: le }, { data: holidays, error: he }] = await Promise.all([
        supabase.from("hr_attendance").select("*").gte("date", new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)).lte("date", today),
        supabase.from("hr_leaves").select("*").in("status", ["pending", "approved"]),
        supabase.from("hr_holidays").select("*").gte("date", today).order("date"),
      ]);
      if (ae || le || he) return fail((ae || le || he)!.message, 500);
      const att = attendance || [], leaves = leaveRows || [], hols = holidays || [];
      const byId = new Map(employees.map((e: any) => [e.id, e]));
      const todaysAtt = att.filter((a: any) => a.date === today);
      const onLeaveList = leaves.filter((l: any) => l.status === "approved" && l.start_date <= today && l.end_date >= today).map((l: any) => {
        const e: any = byId.get(l.employee_id);
        return { employeeName: e?.name || "Employee", leaveType: l.leave_type || "annual", endDate: l.end_date };
      });
      const presentIds = new Set(todaysAtt.filter((a: any) => a.clock_in).map((a: any) => a.employee_id));
      const notClockedInList = employees.filter((e: any) => !presentIds.has(e.id) && !onLeaveList.some((l: any) => l.employeeName === e.name)).slice(0, 12).map((e: any) => ({ name: e.name || "Employee", department: e.department || "" }));
      const trend = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10);
        const records = att.filter((a: any) => a.date === date && a.clock_in);
        return { date, present: records.length, late: records.filter((a: any) => a.status === "late").length };
      });
      const departmentsMap = new Map<string, number>();
      employees.forEach((e: any) => { const name = String(e.department || "No department"); departmentsMap.set(name, (departmentsMap.get(name) || 0) + 1); });
      const departments = [...departmentsMap.entries()].map(([name, count]) => ({ name, count }));
      const recent = todaysAtt.filter((a: any) => a.clock_in).map((a: any) => {
        const e: any = byId.get(a.employee_id);
        return { employeeName: e?.name || "Employee", employeeCode: e?.code || "", department: e?.department || "", clockInLocal: a.clock_in ? new Date(Number(a.clock_in)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: h.timezone }) : "", clockOutLocal: a.clock_out ? new Date(Number(a.clock_out)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: h.timezone }) : "", status: a.status || "present" };
      });
      const pendingLeaves = leaves.filter((l: any) => l.status === "pending").length;
      const todayHoliday = hols.find((x: any) => x.date === today)?.name || "";
      const reminderDays = Math.max(0, Math.min(120, Number(h.reminderDays || 7)));
      const holidayReminders = hols.filter((x: any) => (Date.parse(`${x.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000 <= reminderDays).map((x: any) => ({ ...x, daysUntil: Math.round((Date.parse(`${x.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000), estimated: !!x.estimated }));
      return json({ date: today, today, totalEmployees: employees.length, employees: employees.length, pendingLeaves,
        presentToday: presentIds.size, notClockedIn: notClockedInList.length, notClockedInList,
        onLeaveToday: onLeaveList.length, onLeaveList, lateToday: todaysAtt.filter((a: any) => a.status === "late").length,
        trend, departments, recent, todayHoliday, weekend: h.weekend.includes(new Date(`${today}T00:00:00Z`).getUTCDay()),
        holidayReminders, upcomingHolidays: hols.slice(0, 8).map((x: any) => ({ ...x, estimated: !!x.estimated })) });
    }

    if (route === "report" && method === "GET") {
      requireManager();
      const month = String(body.month || today.slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(month)) return fail("Invalid month. Use YYYY-MM.");
      const [yy, mm] = month.split("-").map(Number);
      const first = `${month}-01`;
      const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      const [{ data: employees, error: ee }, { data: attendance, error: ae }, { data: leaves, error: le }, { data: holidays, error: he }] = await Promise.all([
        supabase.from("objects").select("id,number,data").eq("kind", "employee").eq("deleted", false),
        supabase.from("hr_attendance").select("*").gte("date", first).lte("date", last),
        supabase.from("hr_leaves").select("*").eq("status", "approved").lte("start_date", last).gte("end_date", first),
        supabase.from("hr_holidays").select("*").gte("date", first).lte("date", last),
      ]);
      if (ee || ae || le || he) return fail((ee || ae || le || he)!.message, 500);
      const emps = (employees || []).map((r: any) => ({ id: r.id, code: r.number || asObject(r.data).code || "", ...asObject(r.data) }));
      const att = attendance || [], approvedLeaves = leaves || [], hols = holidays || [];
      const todayLimit = month === today.slice(0, 7) ? today : last;
      const weekdays: string[] = [];
      for (let d = first; d <= (todayLimit < last ? todayLimit : last); ) {
        const dt = new Date(`${d}T00:00:00Z`);
        if (!h.weekend.includes(dt.getUTCDay()) && !hols.some((x: any) => x.date === d)) weekdays.push(d);
        const next = new Date(dt.getTime() + 86400000).toISOString().slice(0, 10); d = next;
      }
      const rows = emps.map((e: any) => {
        const records = att.filter((a: any) => a.employee_id === e.id);
        const lv = approvedLeaves.filter((a: any) => a.employee_id === e.id);
        const presentDays = new Set(records.filter((a: any) => a.clock_in).map((a: any) => a.date)).size;
        const lateDays = new Set(records.filter((a: any) => a.status === "late").map((a: any) => a.date)).size;
        const leaveDays = weekdays.filter(d => lv.some((a: any) => a.start_date <= d && a.end_date >= d)).length;
        const totalHours = records.reduce((sum: number, a: any) => sum + (a.clock_in && a.clock_out ? Math.max(0, Number(a.clock_out) - Number(a.clock_in)) / 3600000 : 0), 0);
        const workingDays = weekdays.length;
        const absentDays = Math.max(0, workingDays - presentDays - leaveDays);
        return { employeeCode: e.code || "", name: e.name || "Employee", department: e.department || "", workingDays, presentDays, lateDays, leaveDays, absentDays, totalHours: Math.round(totalHours * 100) / 100, attendancePct: workingDays ? Math.round(presentDays / workingDays * 1000) / 10 : 0 };
      });
      return json({ month, workingDays: weekdays.length, holidays: hols || [], rows, employees: employees || [], attendance: att, leaves: approvedLeaves });
    }

    return fail(`HR endpoint not implemented yet: ${method} hr/${route}`, 501);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    const status = /Only HR|Only the owner|admin can|permission/i.test(message) ? 403 : 500;
    return fail(message, status);
  }
});
