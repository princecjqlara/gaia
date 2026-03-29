/**
 * One-time migration runner API endpoint
 * Deploy to Vercel, hit GET /api/run-migration?key=<last12chars_of_service_key>, then delete this file.
 * Runs DDL that can't be done via PostgREST (ALTER TABLE, CREATE INDEX, DROP CONSTRAINT).
 */
import pg from "pg";
const { Client } = pg;

export default async function handler(req, res) {
  // Simple auth: last 12 chars of service role key
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const expectedKey = serviceKey.slice(-12);
  if (!req.query.key || req.query.key !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized. Pass ?key=<last 12 chars of service role key>" });
  }

  const dbPassword = req.query.dbpass || process.env.SUPABASE_DB_PASSWORD || "";
  const projectRef = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .replace("https://", "").replace(".supabase.co", "");
  const dbUrl = process.env.DATABASE_URL ||
    `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

  if (!dbPassword) {
    return res.status(400).json({ error: "No database password. Set SUPABASE_DB_PASSWORD env var or pass ?dbpass=..." });
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  const results = [];

  try {
    await client.connect();
    results.push({ step: "connect", status: "ok" });

    const statements = [
      {
        label: "Drop global unique on page_id",
        sql: "ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key"
      },
      {
        label: "Drop old unique index on page_id",
        sql: "DROP INDEX IF EXISTS facebook_pages_page_id_key"
      },
      {
        label: "Create composite unique (page_id, team_id)",
        sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique ON facebook_pages(page_id, team_id)"
      },
      {
        label: "Add team_id to facebook_settings",
        sql: "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE"
      },
      {
        label: "Add organization_id to facebook_settings",
        sql: "ALTER TABLE facebook_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE"
      },
      {
        label: "Index facebook_settings team_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id)"
      },
      {
        label: "Backfill conversations team_id",
        sql: `UPDATE facebook_conversations fc
              SET team_id = fp.team_id, organization_id = fp.organization_id
              FROM facebook_pages fp
              WHERE fc.page_id = fp.page_id AND fc.team_id IS NULL AND fp.team_id IS NOT NULL`
      },
      {
        label: "Backfill messages team_id",
        sql: `UPDATE facebook_messages fm
              SET team_id = fp.team_id, organization_id = fp.organization_id
              FROM facebook_conversations fc
              JOIN facebook_pages fp ON fc.page_id = fp.page_id
              WHERE fm.conversation_id = fc.conversation_id AND fm.team_id IS NULL AND fp.team_id IS NOT NULL`
      }
    ];

    for (const { label, sql } of statements) {
      try {
        const result = await client.query(sql);
        results.push({ step: label, status: "ok", rows: result.rowCount });
      } catch (err) {
        results.push({ step: label, status: "error", message: err.message });
      }
    }

    await client.end();
    results.push({ step: "disconnect", status: "ok" });

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, results });
  }
}
