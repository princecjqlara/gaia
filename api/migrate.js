import { createClient } from "@supabase/supabase-js";

let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const expectedKey = serviceKey.slice(-12);
  if (!req.query.key || req.query.key !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getSupabase();
  if (!db) return res.status(500).json({ error: "DB not configured" });

  const results = [];

  // Run DDL via exec_sql RPC if it exists
  const ddl = [
    "ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key",
    "DROP INDEX IF EXISTS facebook_pages_page_id_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique ON facebook_pages(page_id, team_id)",
    "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE",
    "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id)",
  ];

  for (const stmt of ddl) {
    try {
      const { data, error } = await db.rpc("exec_sql", { query_text: stmt });
      if (error) {
        results.push({ sql: stmt.substring(0, 60), status: "error", msg: error.message });
      } else {
        results.push({ sql: stmt.substring(0, 60), status: "ok" });
      }
    } catch (err) {
      results.push({ sql: stmt.substring(0, 60), status: "exception", msg: err.message });
    }
  }

  // Backfill via REST (no DDL needed)
  const { data: pages } = await db.from("facebook_pages").select("page_id,team_id,organization_id").eq("is_active", true);
  for (const page of (pages || [])) {
    if (!page.team_id) continue;
    await db.from("facebook_conversations").update({ team_id: page.team_id, organization_id: page.organization_id }).eq("page_id", page.page_id).is("team_id", null);
  }
  results.push({ sql: "backfill conversations", status: "ok" });

  return res.status(200).json({ success: true, results, hint: "If exec_sql errors, create it in SQL Editor first: CREATE OR REPLACE FUNCTION exec_sql(query_text text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE query_text; RETURN json_build_object('ok', true); EXCEPTION WHEN OTHERS THEN RETURN json_build_object('ok', false, 'error', SQLERRM); END; $$;" });
}
