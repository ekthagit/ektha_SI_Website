// Core Supabase CRUD helpers for EVAM Books.
// This is a data-access layer; it does not replace all legacy API routes in engine.js.
import { supabase } from "./supabase.js";

const ALLOWED_TABLES = new Set([
  "objects", "journal_lines", "bank_txns", "audit", "counters", "allocations",
  "hr_attendance", "hr_leaves", "hr_holidays", "hr_notifications"
]);

function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported table: ${table}`);
}
function check(error) {
  if (error) {
    const e = new Error(error.message || "Supabase request failed");
    e.code = error.code;
    e.details = error.details;
    e.hint = error.hint;
    throw e;
  }
}

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  check(error);
  if (!data.user) throw new Error("Please sign in first.");
  return data.user;
}

export async function listRows(table, { filters = {}, orderBy = "updated_at", ascending = false, limit = 500, includeDeleted = false } = {}) {
  assertTable(table);
  await requireUser();
  let q = supabase.from(table).select("*");
  for (const [column, value] of Object.entries(filters)) {
    if (value === null) q = q.is(column, null);
    else if (Array.isArray(value)) q = q.in(column, value);
    else q = q.eq(column, value);
  }
  if (table === "objects" && !includeDeleted) q = q.eq("deleted", 0);
  if (orderBy && ["updated_at", "created_at", "date", "id", "at", "start_date", "end_date"].includes(orderBy)) {
    q = q.order(orderBy, { ascending, nullsFirst: false });
  }
  if (Number.isInteger(limit) && limit > 0) q = q.limit(Math.min(limit, 1000));
  const { data, error } = await q;
  check(error);
  return data || [];
}

export async function getRow(table, id, idColumn = "id") {
  assertTable(table);
  await requireUser();
  const { data, error } = await supabase.from(table).select("*").eq(idColumn, id).maybeSingle();
  check(error);
  return data;
}

export async function insertRow(table, values) {
  assertTable(table);
  await requireUser();
  const payload = { ...values };
  // App metadata is stored in objects.data as JSONB, not a JSON-encoded string.
  if (table === "objects" && typeof payload.data === "string") {
    try { payload.data = JSON.parse(payload.data); } catch { throw new Error("objects.data must be valid JSON"); }
  }
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  check(error);
  return data;
}

export async function updateRow(table, id, values, idColumn = "id") {
  assertTable(table);
  await requireUser();
  const payload = { ...values };
  if (table === "objects" && typeof payload.data === "string") {
    try { payload.data = JSON.parse(payload.data); } catch { throw new Error("objects.data must be valid JSON"); }
  }
  if (table === "objects") {
    payload.version = Number(payload.version || 1) + 1;
    payload.updated_at ??= Date.now();
  }
  const { data, error } = await supabase.from(table).update(payload).eq(idColumn, id).select("*").maybeSingle();
  check(error);
  if (!data) throw new Error("Record not found or you do not have permission to update it.");
  return data;
}

export async function softDeleteObject(id, updatedBy = null) {
  await requireUser();
  const { data, error } = await supabase.from("objects")
    .update({ deleted: 1, updated_at: Date.now(), updated_by: updatedBy })
    .eq("id", id).select("*").maybeSingle();
  check(error);
  if (!data) throw new Error("Record not found or you do not have permission to delete it.");
  return data;
}

export async function deleteRow(table, id, idColumn = "id") {
  assertTable(table);
  if (table === "objects") return softDeleteObject(id);
  await requireUser();
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq(idColumn, id);
  check(error);
  if (count === 0) throw new Error("Record not found or you do not have permission to delete it.");
  return true;
}

export async function uploadBookFile(path, file, contentType = file?.type || "application/octet-stream") {
  await requireUser();
  const safePath = String(path).replace(/^\/+/, "");
  const { data, error } = await supabase.storage.from("evam-books-files").upload(safePath, file, {
    contentType, upsert: true, cacheControl: "3600"
  });
  check(error);
  return data;
}

export async function getBookFileUrl(path, expiresInSeconds = 300) {
  await requireUser();
  const { data, error } = await supabase.storage.from("evam-books-files").createSignedUrl(path, expiresInSeconds);
  check(error);
  return data?.signedUrl || null;
}

export async function deleteBookFile(path) {
  await requireUser();
  const { error } = await supabase.storage.from("evam-books-files").remove([path]);
  check(error);
}
