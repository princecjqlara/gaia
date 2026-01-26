import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bbthbdnfskatvvwxprze.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJidGhiZG5mc2thdHZ2d3hwcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTkzNjksImV4cCI6MjA4Mjk5NTM2OX0.NXU7NV9qwzGTL_7g9WE3oeaJZ1ooPM9nTXoKfhiqfFM';

let supabaseClient = null;

export const initSupabase = () => {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (error) {
    console.warn('Supabase initialization failed:', error);
    return false;
  }
};

export const getSupabaseClient = () => supabaseClient;

export default {
  initSupabase,
  getSupabaseClient
};

