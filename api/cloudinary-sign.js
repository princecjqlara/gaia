import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey =
    process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({
      error: "Cloudinary not configured",
    });
  }

  const folder = req.query?.folder ? String(req.query.folder) : null;
  const timestamp = Math.floor(Date.now() / 1000);

  const params = { timestamp };
  if (folder) params.folder = folder;

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");

  return res.status(200).json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
  });
}
