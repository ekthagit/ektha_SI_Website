// Shared Supabase client. Use the publishable/anon key only; NEVER put service_role here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://wlszqjadfskqntfbsphn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JgfrkD65SEZ_IKRt4redjg_tWkElblv";

if (SUPABASE_URL.includes("PASTE_") || SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
  console.warn("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in js/supabase.js");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
