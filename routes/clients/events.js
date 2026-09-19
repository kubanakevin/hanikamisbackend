// routes/clients/events.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/events
   Query: ?limit=12&category=Workshop&upcoming=true|false
   Returns list of published events (active only).
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const category = (req.query.category || "").toString().trim();
    const upcomingParam = (req.query.upcoming || "").toString().toLowerCase();

    const where = ["is_active = 1"];
    const params = [];

    if (category) {
      where.push("category = ?");
      params.push(category);
    }

    if (upcomingParam === "true") {
      where.push("event_date >= CURDATE()");
    } else if (upcomingParam === "false") {
      where.push("event_date < CURDATE()");
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    // Upcoming first (ascending), then past (descending)
    const orderSql =
      upcomingParam === "false"
        ? "ORDER BY event_date DESC, start_time DESC"
        : "ORDER BY event_date ASC, start_time ASC";

    const [rows] = await pool.query(
      `SELECT id, title, slug, description, event_date, end_date,
              start_time, end_time, location, category,
              featured_image, is_featured,
              DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date_formatted,
              (event_date >= CURDATE()) AS is_upcoming
       FROM events
       ${whereSql}
       ${orderSql}
       LIMIT ?`,
      [...params, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client events list error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
});

/* ============================================================
   GET /api/client/events/categories
   Distinct categories from active events, with counts.
   ============================================================ */
router.get("/categories", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS count
       FROM events
       WHERE is_active = 1 AND category IS NOT NULL AND category <> ''
       GROUP BY category
       ORDER BY category ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client event categories error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

/* ============================================================
   GET /api/client/events/featured
   Featured events, upcoming first.
   ============================================================ */
router.get("/featured", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, slug, description, event_date, end_date,
              start_time, end_time, location, category,
              featured_image,
              DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date_formatted
       FROM events
       WHERE is_active = 1 AND is_featured = 1
       ORDER BY (event_date >= CURDATE()) DESC, event_date ASC
       LIMIT 5`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client featured events error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch featured events" });
  }
});

/* ============================================================
   GET /api/client/events/:idOrSlug
   Event detail with all associated images.
   ============================================================ */
router.get("/:idOrSlug", async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const isNumeric = /^\d+$/.test(idOrSlug);

    const [rows] = await pool.query(
      `SELECT id, title, slug, description, event_date, end_date,
              start_time, end_time, location, category,
              featured_image, is_featured,
              DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date_formatted,
              (event_date >= CURDATE()) AS is_upcoming
       FROM events
       WHERE is_active = 1 AND ${isNumeric ? "id = ?" : "slug = ?"}
       LIMIT 1`,
      [idOrSlug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    const event = rows[0];

    const [images] = await pool.query(
      `SELECT id, image_url, caption, display_order
       FROM event_images
       WHERE event_id = ?
       ORDER BY display_order ASC, id ASC`,
      [event.id]
    );

    // Related events (same category, upcoming)
    const [related] = await pool.query(
      `SELECT id, title, slug, event_date, featured_image
       FROM events
       WHERE is_active = 1
         AND id <> ?
         AND event_date >= CURDATE()
         AND (category = ? OR ? IS NULL)
       ORDER BY event_date ASC
       LIMIT 3`,
      [event.id, event.category, event.category]
    );

    res.json({
      success: true,
      data: { ...event, images, related },
    });
  } catch (err) {
    console.error("Client event detail error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch event" });
  }
});

module.exports = router;