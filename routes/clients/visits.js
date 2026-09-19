// routes/clients/visits.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   POST /api/client/visits/track
   Body: { page_url, referrer_url?, session_id? }
   Inserts one row into website_visitors, deriving device,
   browser, and OS from the User-Agent header.
   ============================================================ */

// Crude but effective UA parser — no external dep.
function parseUserAgent(ua = "") {
  const s = ua.toLowerCase();

  // Device
  let device = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(s)) device = "mobile";
  else if (/ipad|tablet|kindle|playbook|silk/.test(s)) device = "tablet";
  else if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit/.test(s)) device = "bot";

  // Browser
  let browser = "Other";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";
  else if (/msie|trident/.test(s)) browser = "Internet Explorer";

  // OS
  let os = "Other";
  if (/windows nt/.test(s)) os = "Windows";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/android/.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/linux/.test(s)) os = "Linux";

  return { device, browser, os };
}

router.post("/track", async (req, res) => {
  try {
    const { page_url, referrer_url = null, session_id = null } = req.body || {};

    if (!page_url) {
      return res
        .status(400)
        .json({ success: false, error: "page_url is required" });
    }

    const ua = req.headers["user-agent"] || "";
    const { device, browser, os } = parseUserAgent(ua);

    // Client IP — respects proxies via req.ip (needs `app.set('trust proxy', 1)`)
    const ip =
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    await pool.query(
      `INSERT INTO website_visitors (
         ip_address, user_agent, device_type, browser, operating_system,
         page_url, referrer_url, session_id, visited_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [ip, ua, device, browser, os, page_url, referrer_url, session_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Visit track error:", err);
    // Never block the client — return 200 even if tracking fails
    res.json({ success: true });
  }
});

module.exports = router;