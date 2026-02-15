import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint to sync AI chatbot config to the database
 * POST /api/sync-settings - saves config to settings table
 * GET /api/sync-settings - returns current config from DB
 */
export default async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: "Missing Supabase credentials" });
    }

    const db = createClient(supabaseUrl, supabaseKey);

    if (req.method === "POST") {
        try {
            const config = req.body;
            if (!config || typeof config !== "object") {
                return res.status(400).json({ error: "Body must be a JSON object with config" });
            }

            const { error } = await db
                .from("settings")
                .upsert({
                    key: "ai_chatbot_config",
                    value: config,
                    updated_at: new Date().toISOString()
                }, { onConflict: "key" });

            if (error) throw error;

            return res.status(200).json({
                success: true,
                message: "Config saved to database",
                keys: Object.keys(config),
                booking_url: config.booking_url || config.welcome_button_url || "NOT SET"
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === "GET") {
        try {
            const { data, error } = await db
                .from("settings")
                .select("value")
                .eq("key", "ai_chatbot_config")
                .single();

            if (error) throw error;

            return res.status(200).json({
                success: true,
                config: data?.value || {},
                booking_url: data?.value?.booking_url || "NOT SET",
                welcome_button_url: data?.value?.welcome_button_url || "NOT SET"
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}
