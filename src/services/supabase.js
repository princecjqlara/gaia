import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables or .env file.",
  );
}

let supabaseClient = null;

export const initSupabase = () => {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (error) {
    console.warn("Supabase initialization failed:", error);
    return false;
  }
};

export const getSupabaseClient = () => supabaseClient;

export default {
  initSupabase,
  getSupabaseClient,
};
