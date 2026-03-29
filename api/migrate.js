/**
 * One-time migration runner API endpoint
 * Hit GET /api/migrate?key=<last12chars_of_service_key>&dbpass=<db_password>
 * Runs DDL that can't be done via PostgREST.
 */
import postgres from "postgres";

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const expectedKey = serviceKey.slice(-12);
  if (!req.query.key || req.query.key !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dbPassword = req.query.dbpass || process.env.SUPABASE_DB_PASSWORD || "";
  const projectRef = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .replace("https://", "").replace(".supabase.co", "");

  if (!dbPassword) {
    return res.status(400).json({ error: "No database password. Pass ?dbpass=..." });
  }

  const sql = postgres({
    host: "aws-0-ap-southeast-1.pooler.supabase.com",
    port: 6543,
    database: "postgres",
    username: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: "require",
    max: 1,
    idle_timeout: 10,
  });

  const results = [];

  try {
    // Test connection
    await sql`SELECT 1 as test`;
    results.push({ step: "connect", status: "ok" });

    const statements = [
      {
        label: "Drop global unique on page_id",
        fn: () => sql.unsafe("ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key")
      },
      {
        label: "Drop old unique index on page_id",
        fn: () => sql.unsafe("DROP INDEX IF EXISTS facebook_pages_page_id_key")
      },
      {
        label: "Create composite unique (page_id, team_id)",
        fn: () => sql.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique ON facebook_pages(page_id, team_id)")
      },
      {
        label: "Add team_id to facebook_settings",
        fn: () => sql.unsafe("ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE")
      },
      {
        label: "Add organization_id to facebook_settings",
        fn: () => sql.unsafe("ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE")
      },
      {
        label: "Index facebook_settings team_id",
        fn: () => sql.unsafe("CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id)")
      },
      {
        label: "Backfill conversations team_id",
        fn: () => sql.unsafe(`UPDATE facebook_conversations fc
              SET team_id = fp.team_id, organization_id = fp.organization_id
              FROM facebook_pages fp
              WHERE fc.page_id = fp.page_id AND fc.team_id IS NULL AND fp.team_id IS NOT NULL`)
      },
      {
        label: "Backfill messages team_id",
        fn: () => sql.unsafe(`UPDATE facebook_messages fm
              SET team_id = fp.team_id, organization_id = fp.organization_id
              FROM facebook_conversations fc
              JOIN facebook_pages fp ON fc.page_id = fp.page_id
              WHERE fm.conversation_id = fc.conversation_id AND fm.team_id IS NULL AND fp.team_id IS NOT NULL`)
      }
    ];

    for (const { label, fn } of statements) {
      try {
        const result = await fn();
        results.push({ step: label, status: "ok", rows: result.count || 0 });
      } catch (err) {
        results.push({ step: label, status: "error", message: err.message });
      }
    }

    await sql.end();
    results.push({ step: "disconnect", status: "ok" });

    return res.status(200).json({ success: true, results });
  } catch (err) {
    try { await sql.end(); } catch (_) {}
    return res.status(500).json({ success: false, error: err.message, results });
  }
}
