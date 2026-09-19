// routes/admin/stats.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

const ADMIN_ROLES = ["super_manager", "department_manager"];

/* ============================================================
   GET /api/admin/dashboard/overview?days=30
   One-shot endpoint that returns everything the dashboard needs.
   ============================================================ */
router.get(
  "/overview",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const days = Math.min(
        Math.max(parseInt(req.query.days, 10) || 30, 1),
        365
      );

      // --- 1. Counts --------------------------------------------------
      const counts = {
        users: 0,
        departments: 0,
        programs: 0,
        news: 0,
        events: 0,
        gallery_images: 0,
        hero_banners: 0,
        announcements: 0,
        messages_total: 0,
        messages_unread: 0,
        ai_conversations: 0,
        ai_knowledge: 0,
        // NEW — visitors
        visitors_total: 0,
        visitors_unique: 0,
        visitors_today: 0,
      };

      const safeCount = async (sql, key, params = []) => {
        try {
          const [[{ c }]] = await pool.query(sql, params);
          counts[key] = Number(c) || 0;
        } catch (e) {
          // table may not exist yet — leave as 0
        }
      };

      await Promise.all([
        safeCount("SELECT COUNT(*) AS c FROM users WHERE is_active = 1", "users"),
        safeCount("SELECT COUNT(*) AS c FROM departments WHERE is_active = 1", "departments"),
        safeCount("SELECT COUNT(*) AS c FROM programs WHERE is_active = 1", "programs"),
        safeCount("SELECT COUNT(*) AS c FROM news WHERE is_published = 1", "news"),
        safeCount(
          "SELECT COUNT(*) AS c FROM events WHERE is_active = 1 AND event_date >= CURDATE()",
          "events"
        ),
        safeCount("SELECT COUNT(*) AS c FROM gallery_images WHERE is_active = 1", "gallery_images"),
        safeCount("SELECT COUNT(*) AS c FROM hero_banners WHERE is_active = 1", "hero_banners"),
        safeCount(
          `SELECT COUNT(*) AS c FROM announcements
           WHERE is_active = 1
             AND (start_date IS NULL OR start_date <= NOW())
             AND (expiry_date IS NULL OR expiry_date >= NOW())`,
          "announcements"
        ),
        safeCount("SELECT COUNT(*) AS c FROM contact_messages", "messages_total"),
        safeCount(
          "SELECT COUNT(*) AS c FROM contact_messages WHERE is_read = 0 AND is_archived = 0",
          "messages_unread"
        ),
        safeCount("SELECT COUNT(*) AS c FROM ai_conversations", "ai_conversations"),
        safeCount("SELECT COUNT(*) AS c FROM ai_knowledge WHERE is_active = 1", "ai_knowledge"),

        // Visitors counts
        safeCount(
          "SELECT COUNT(*) AS c FROM website_visitors WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
          "visitors_total",
          [days]
        ),
        safeCount(
          "SELECT COUNT(DISTINCT ip_address) AS c FROM website_visitors WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
          "visitors_unique",
          [days]
        ),
        safeCount(
          "SELECT COUNT(*) AS c FROM website_visitors WHERE DATE(visited_at) = CURDATE()",
          "visitors_today"
        ),
      ]);

      // --- 2. Visitors trend (last N days) ---------------------------
      let viewsTrend = [];
      try {
        const [rows] = await pool.query(
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
        viewsTrend = rows.map((r) => ({
          day: r.day,
          visits: Number(r.visits) || 0,
          unique_visitors: Number(r.unique_visitors) || 0,
        }));
      } catch (e) {
        viewsTrend = [];
      }

      // --- 3. Distribution: programs per department -------------------
      let programsByDepartment = [];
      try {
        const [rows] = await pool.query(
          `SELECT d.name AS label, COUNT(p.id) AS value
           FROM departments d
           LEFT JOIN programs p ON p.department_id = d.id AND p.is_active = 1
           WHERE d.is_active = 1
           GROUP BY d.id, d.name
           ORDER BY value DESC
           LIMIT 8`
        );
        programsByDepartment = rows.map((r) => ({
          label: r.label,
          value: Number(r.value) || 0,
        }));
      } catch (e) {
        programsByDepartment = [];
      }

      // --- 4. Distribution: users by role -----------------------------
      let usersByRole = [];
      try {
        const [rows] = await pool.query(
          `SELECT role AS label, COUNT(*) AS value
           FROM users
           WHERE is_active = 1
           GROUP BY role
           ORDER BY value DESC`
        );
        usersByRole = rows.map((r) => ({
          label: r.label || "unknown",
          value: Number(r.value) || 0,
        }));
      } catch (e) {
        usersByRole = [];
      }

      // --- 5. Top pages (NEW) -----------------------------------------
      let topPages = [];
      try {
        const [rows] = await pool.query(
          `SELECT page_url AS label, COUNT(*) AS value
           FROM website_visitors
           WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY page_url
           ORDER BY value DESC
           LIMIT 6`,
          [days]
        );
        topPages = rows.map((r) => ({
          label: r.label,
          value: Number(r.value) || 0,
        }));
      } catch (e) {
        topPages = [];
      }

      // --- 6. Devices breakdown (NEW) --------------------------------
      let devices = [];
      try {
        const [rows] = await pool.query(
          `SELECT device_type AS label, COUNT(*) AS value
           FROM website_visitors
           WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY device_type
           ORDER BY value DESC`,
          [days]
        );
        devices = rows.map((r) => ({
          label: r.label || "unknown",
          value: Number(r.value) || 0,
        }));
      } catch (e) {
        devices = [];
      }

      // --- 7. Recent activity -----------------------------------------
      const activity = [];

      try {
        const [rows] = await pool.query(
          `SELECT id, full_name, subject, created_at
           FROM contact_messages
           ORDER BY created_at DESC
           LIMIT 5`
        );
        rows.forEach((r) =>
          activity.push({
            type: "message",
            title: r.subject || "(no subject)",
            subtitle: `From ${r.full_name || "unknown"}`,
            created_at: r.created_at,
            link: "/admin/messages",
          })
        );
      } catch {}

      try {
        const [rows] = await pool.query(
          `SELECT id, title, created_at
           FROM news
           ORDER BY created_at DESC
           LIMIT 5`
        );
        rows.forEach((r) =>
          activity.push({
            type: "news",
            title: r.title,
            subtitle: "News article",
            created_at: r.created_at,
            link: "/admin/news",
          })
        );
      } catch {}

      try {
        const [rows] = await pool.query(
          `SELECT id, title, created_at
           FROM events
           ORDER BY created_at DESC
           LIMIT 5`
        );
        rows.forEach((r) =>
          activity.push({
            type: "event",
            title: r.title,
            subtitle: "Event",
            created_at: r.created_at,
            link: "/admin/events",
          })
        );
      } catch {}

      try {
        const [rows] = await pool.query(
          `SELECT id, name, created_at
           FROM programs
           ORDER BY created_at DESC
           LIMIT 5`
        );
        rows.forEach((r) =>
          activity.push({
            type: "program",
            title: r.name,
            subtitle: "Program",
            created_at: r.created_at,
            link: "/admin/programs",
          })
        );
      } catch {}

      activity.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // --- 8. Upcoming events (next 5) --------------------------------
      let upcomingEvents = [];
      try {
        const [rows] = await pool.query(
          `SELECT id, title, event_date, start_time, location, category
           FROM events
           WHERE is_active = 1 AND event_date >= CURDATE()
           ORDER BY event_date ASC
           LIMIT 5`
        );
        upcomingEvents = rows;
      } catch {}

      // --- 9. Unread message snippet ----------------------------------
      let recentMessages = [];
      try {
        const [rows] = await pool.query(
          `SELECT id, full_name, email, subject, created_at, is_read
           FROM contact_messages
           WHERE is_archived = 0
           ORDER BY created_at DESC
           LIMIT 5`
        );
        recentMessages = rows;
      } catch {}

      res.json({
        success: true,
        data: {
          counts,
          viewsTrend,
          programsByDepartment,
          usersByRole,
          topPages,
          devices,
          activity: activity.slice(0, 8),
          upcomingEvents,
          recentMessages,
          days,
        },
      });
    } catch (err) {
      console.error("Dashboard overview error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to load dashboard" });
    }
  }
);

/* ============================================================
   GET /api/admin/dashboard/health
   ============================================================ */
router.get(
  "/health",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    let db = "down";
    try {
      await pool.query("SELECT 1");
      db = "up";
    } catch {}
    res.json({
      success: true,
      data: {
        db,
        server: "up",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  }
);

module.exports = router;