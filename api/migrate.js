/**
 * Migration runner - uses Supabase service role key with PostgREST
 * For DDL operations, we first create an exec_sql helper function,
 * then use it to run the migration statements.
 */
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
  if (!db) {
    return res.status(500).json({ error: "Database not configured" });
  }

  const dbPassword = req.query.dbpass || process.env.SUPABASE_DB_PASSWORD || "";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

  const results = [];

  // Step 1: Try to create exec_sql function via direct PostgreSQL connection
  // Using the Supabase Management API endpoint
  const mgmtHeaders = {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  // First check if exec_sql already exists
  const { data: fnCheck, error: fnCheckErr } = await db.rpc("exec_sql", { query_text: "SELECT 1" }).catch(() => ({ data: null, error: { message: "not found" } }));

  if (fnCheckErr || fnCheck === null) {
    // exec_sql doesn't exist - we need to create it
    // Try using the database connection through the pooler
    if (!dbPassword) {
      return res.status(400).json({
        error: "exec_sql function doesn't exist yet. Pass ?dbpass=<your_supabase_db_password> to create it. Find your DB password at: Supabase Dashboard > Settings > Database > Connection string (click Reveal)",
        hint: "This is your DATABASE password, not your account password."
      });
    }

    try {
      // Use dynamic import for postgres to avoid build issues when not needed
      const { default: postgresLib } = await import("postgres");
      const sql = postgresLib({
        host: "aws-0-ap-southeast-1.pooler.supabase.com",
        port: 6543,
        database: "postgres",
        username: `postgres.${projectRef}`,
        password: dbPassword,
        ssl: "require",
        max: 1,
        idle_timeout: 10,
        connect_timeout: 10,
      });

      // Create exec_sql function
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION exec_sql(query_text text)
        RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN
          EXECUTE query_text;
          RETURN json_build_object('ok', true);
        EXCEPTION WHEN OTHERS THEN
          RETURN json_build_object('ok', false, 'error', SQLERRM);
        END;
        $$;
      `);
      results.push({ step: "create exec_sql function", status: "ok" });

      // Grant access
      await sql.unsafe("GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role");
      results.push({ step: "grant exec_sql to service_role", status: "ok" });

      // Also run all migration DDL directly while we have the connection
      const ddlStatements = [
        "ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key",
        "DROP INDEX IF EXISTS facebook_pages_page_id_key",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique ON facebook_pages(page_id, team_id)",
        "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE",
        "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE",
        "CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id)",
        `UPDATE facebook_conversations fc SET team_id = fp.team_id, organization_id = fp.organization_id FROM facebook_pages fp WHERE fc.page_id = fp.page_id AND fc.team_id IS NULL AND fp.team_id IS NOT NULL`,
        `UPDATE facebook_messages fm SET team_id = fp.team_id, organization_id = fp.organization_id FROM facebook_conversations fc JOIN facebook_pages fp ON fc.page_id = fp.page_id WHERE fm.conversation_id = fc.conversation_id AND fm.team_id IS NULL AND fp.team_id IS NOT NULL`,
      ];

      for (const ddl of ddlStatements) {
        try {
          await sql.unsafe(ddl);
          results.push({ step: ddl.substring(0, 60), status: "ok" });
        } catch (err) {
          results.push({ step: ddl.substring(0, 60), status: "error", message: err.message });
        }
      }

      await sql.end();
      return res.status(200).json({ success: true, results });
    } catch (err) {
      results.push({ step: "direct connection", status: "error", message: err.message });
      return res.status(500).json({
        success: false,
        error: "Could not connect to database. Check your password.",
        detail: err.message,
        results
      });
    }
  }

  // exec_sql exists, use it via RPC
  const ddlStatements = [
    "ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key",
    "DROP INDEX IF EXISTS facebook_pages_page_id_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique ON facebook_pages(page_id, team_id)",
    "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE",
    "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id)",
  ];

  for (const ddl of ddlStatements) {
    const { data, error } = await db.rpc("exec_sql", { query_text: ddl });
    if (error) {
      results.push({ step: ddl.substring(0, 60), status: "error", message: error.message });
    } else {
      results.push({ step: ddl.substring(0, 60), status: "ok", result: data });
    }
  }

  return res.status(200).json({ success: true, results });
}
