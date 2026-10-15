import { createClient } from
    "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://wlszqjadfskqntfbsphn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JgfrkD65SEZ_IKRt4redjg_tWkElblv";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);