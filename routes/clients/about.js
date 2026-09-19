// routes/clients/about.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/about
   Returns everything the About page needs in one shot:
   - about: main about_section row (title, content, mission, vision, values, ...)
   - whyChoose: active why_choose_features
   - contact: contact_info row (for a small "reach us" strip)
   - stats: quick counts pulled from real tables
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const [aboutRows] = await pool.query(
      `SELECT id, title, short_description, full_content,
              mission, vision, core_values, founded_year,
              image_url, video_url, updated_at
       FROM about_section
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    const about = aboutRows[0] || null;

    // Why-choose features (safe if table doesn't exist yet)
    let whyChoose = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, icon, title, description
         FROM why_choose_features
         WHERE is_active = 1
         ORDER BY display_order ASC
         LIMIT 8`
      );
      whyChoose = rows;
    } catch (e) {
      // Table might not exist in some setups — ignore silently
    }

    // Contact strip
    let contact = null;
    try {
      const [rows] = await pool.query(
        `SELECT address, phone_primary, email_primary, office_hours
         FROM contact_info
         ORDER BY updated_at DESC
         LIMIT 1`
      );
      contact = rows[0] || null;
    } catch (e) {
      // ignore
    }

    // Live stats — counts across tables (safe fallbacks)
    let stats = {
      programs: 0,
      departments: 0,
      events: 0,
      news: 0,
      years: null,
    };
    try {
      const [[p]] = await pool.query(
        "SELECT COUNT(*) AS c FROM programs WHERE is_active = 1"
      );
      stats.programs = Number(p.c) || 0;
    } catch {}
    try {
      const [[d]] = await pool.query(
        "SELECT COUNT(*) AS c FROM departments WHERE is_active = 1"
      );
      stats.departments = Number(d.c) || 0;
    } catch {}
    try {
      const [[e]] = await pool.query(
        "SELECT COUNT(*) AS c FROM events WHERE is_active = 1"
      );
      stats.events = Number(e.c) || 0;
    } catch {}
    try {
      const [[n]] = await pool.query(
        "SELECT COUNT(*) AS c FROM news WHERE is_published = 1"
      );
      stats.news = Number(n.c) || 0;
    } catch {}

    if (about?.founded_year) {
      const y = parseInt(about.founded_year, 10);
      if (!Number.isNaN(y)) {
        stats.years = new Date().getFullYear() - y;
      }
    }

    res.json({
      success: true,
      data: { about, whyChoose, contact, stats },
    });
  } catch (err) {
    console.error("Client about error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch about content" });
  }
});

module.exports = router;