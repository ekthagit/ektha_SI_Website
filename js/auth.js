// Supabase Auth helpers used by login/signup/logout pages.
import { supabase } from "./supabase.js";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(), password
  });
  if (error) throw error;
  return data;
}

export async function signUp({ email, password, username }) {
  const cleanEmail = String(email || "").trim();
  const cleanUsername = String(username || "").trim();
  if (!cleanEmail || !password || !cleanUsername) throw new Error("Username, email and password are required.");
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { username: cleanUsername } }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function currentProfile() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles")
    .select("id, username, main_role, roles, created_at, updated_at")
    .eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
