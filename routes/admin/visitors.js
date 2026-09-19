// routes/admin/visitors.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

const ADMIN_ROLES = ["super_manager", "department_manager"];

/* ============================================================
   GET /api/admin/visitors/overview?days=30
   One-shot analytics payload.
   ============================================================ */
router.get(
  "/overview",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

      // --- 1. Totals --------------------------------------------------
      const [[totals]] = await pool.query(
        `SELECT
           COUNT(*) AS total_visits,
           COUNT(DISTINCT ip_address) AS unique_visitors,
           COUNT(DISTINCT session_id) AS unique_sessions,
           MIN(visited_at) AS first_visit,
           MAX(visited_at) AS last_visit
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [days]
      );

      // --- 2. Today / yesterday --------------------------------------
      const [[today]] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM website_visitors
         WHERE DATE(visited_at) = CURDATE()`
      );
      const [[yesterday]] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM website_visitors
         WHERE DATE(visited_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
      );

      // --- 3. Daily trend --------------------------------------------
      const [trend] = await pool.query(
        `SELECT
           DATE(visited_at) AS day,
           COUNT(*) AS visits,
           COUNT(DISTINCT ip_address) AS unique_visitors
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE(visited_at)
         ORDER BY day ASC`,
        [days - 1]
      );

      // --- 4. Device breakdown ---------------------------------------
      const [devices] = await pool.query(
        `SELECT device_type AS label, COUNT(*) AS value
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY device_type
         ORDER BY value DESC`,
        [days]
      );

      // --- 5. Browser breakdown --------------------------------------
      const [browsers] = await pool.query(
        `SELECT browser AS label, COUNT(*) AS value
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY browser
         ORDER BY value DESC
         LIMIT 6`,
        [days]
      );

      // --- 6. OS breakdown -------------------------------------------
      const [oses] = await pool.query(
        `SELECT operating_system AS label, COUNT(*) AS value
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY operating_system
         ORDER BY value DESC
         LIMIT 6`,
        [days]
      );

      // --- 7. Top pages ----------------------------------------------
      const [topPages] = await pool.query(
        `SELECT page_url AS label, COUNT(*) AS value,
                COUNT(DISTINCT ip_address) AS unique_visitors
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY page_url
         ORDER BY value DESC
         LIMIT 10`,
        [days]
      );

      // --- 8. Top referrers ------------------------------------------
      const [topReferrers] = await pool.query(
        `SELECT
           CASE
             WHEN referrer_url IS NULL OR referrer_url = '' THEN 'Direct'
             ELSE referrer_url
           END AS label,
           COUNT(*) AS value
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY label
         ORDER BY value DESC
         LIMIT 8`,
        [days]
      );

      // --- 9. Peak hours (0–23) --------------------------------------
      const [peakHours] = await pool.query(
        `SELECT HOUR(visited_at) AS hour, COUNT(*) AS visits
         FROM website_visitors
         WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY HOUR(visited_at)
         ORDER BY hour ASC`,
        [days]
      );

      // --- 10. Recent visits -----------------------------------------
      const [recent] = await pool.query(
        `SELECT id, ip_address, device_type, browser, operating_system,
                page_url, referrer_url, visited_at
         FROM website_visitors
         ORDER BY visited_at DESC
         LIMIT 25`
      );

      res.json({
        success: true,
        data: {
          totals: {
            total_visits: Number(totals.total_visits) || 0,
            unique_visitors: Number(totals.unique_visitors) || 0,
            unique_sessions: Number(totals.unique_sessions) || 0,
            today: Number(today.c) || 0,
            yesterday: Number(yesterday.c) || 0,
            first_visit: totals.first_visit,
            last_visit: totals.last_visit,
          },
          trend,
          devices,
          browsers,
          oses,
          topPages,
          topReferrers,
          peakHours,
          recent,
          days,
        },
      });
    } catch (err) {
      console.error("Admin visitors overview error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to load visitor analytics" });
    }
  }
);

/* ============================================================
   DELETE /api/admin/visitors/purge?before=YYYY-MM-DD
   Optional cleanup.
   ============================================================ */
router.delete(
  "/purge",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const before = (req.query.before || "").toString().trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
        return res
          .status(400)
          .json({ success: false, error: "before=YYYY-MM-DD is required" });
      }
      const [result] = await pool.query(
        "DELETE FROM website_visitors WHERE visited_at < ?",
        [before]
      );
      res.json({ success: true, deleted: result.affectedRows });
    } catch (err) {
      console.error("Admin visitors purge error:", err);
      res.status(500).json({ success: false, error: "Failed to purge" });
    }
  }
);

module.exports = router;