/**
 * NVIDIA AI Proxy — routes frontend AI calls through server-side to avoid CORS
 * POST /api/ai/chat
 * Body: { messages, model, temperature, max_tokens }
 */
export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const NVIDIA_API_KEY =
        process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;

    if (!NVIDIA_API_KEY) {
        return res.status(500).json({ error: "NVIDIA API key not configured" });
    }

    try {
        const { messages, model, temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "messages array required" });
        }

        const response = await fetch(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${NVIDIA_API_KEY}`,
                },
                body: JSON.stringify({
                    model: model || "nvidia/llama-3.1-nemotron-70b-instruct",
                    messages,
                    temperature: temperature ?? 0.7,
                    max_tokens: max_tokens ?? 1024,
                    stream: false,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[AI-PROXY] NVIDIA error:", errorText.substring(0, 200));
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error("[AI-PROXY] Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
