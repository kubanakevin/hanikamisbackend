// routes/clients/admissions.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/admissions
   Returns everything the Admissions page needs in one payload.
   Every query is wrapped in try/catch so a missing table doesn't
   break the page — it just comes back as an empty array.
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    // Contact info (used in the "Need help?" strip)
    let contact = null;
    try {
      const [rows] = await pool.query(
        `SELECT address, phone_primary, email_primary, office_hours
         FROM contact_info
         ORDER BY updated_at DESC
         LIMIT 1`
      );
      contact = rows[0] || null;
    } catch {}

    // Active programs (for the "what can I apply for?" section)
    let programs = [];
    try {
      const [rows] = await pool.query(
        `SELECT p.id, p.name, p.slug, p.level, p.duration,
                p.short_description, d.name AS department_name
         FROM programs p
         JOIN departments d ON d.id = p.department_id
         WHERE p.is_active = 1
         ORDER BY p.is_featured DESC, p.display_order ASC
         LIMIT 12`
      );
      programs = rows;
    } catch {}

    // Entry requirements
    // Expected table: admission_requirements
    //   id, title, description, level, display_order, is_active
    let requirements = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, title, description, level
         FROM admission_requirements
         WHERE is_active = 1
         ORDER BY display_order ASC, id ASC`
      );
      requirements = rows;
    } catch {}

    // Fees / tuition
    // Expected table: admission_fees
    //   id, label, amount, currency, period, note, display_order, is_active
    let fees = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, label, amount, currency, period, note
         FROM admission_fees
         WHERE is_active = 1
         ORDER BY display_order ASC, id ASC`
      );
      fees = rows;
    } catch {}

    // Key dates / academic calendar
    // Expected table: admission_dates
    //   id, label, event_date, note, display_order, is_active
    let dates = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, label, event_date, note
         FROM admission_dates
         WHERE is_active = 1
         ORDER BY event_date ASC`
      );
      dates = rows;
    } catch {}

    // Application steps — used if you want to serve them from the DB
    // Expected table: admission_steps
    //   id, title, description, display_order, is_active
    let steps = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, title, description
         FROM admission_steps
         WHERE is_active = 1
         ORDER BY display_order ASC, id ASC`
      );
      steps = rows;
    } catch {}

    res.json({
      success: true,
      data: {
        contact,
        programs,
        requirements,
        fees,
        dates,
        steps,
      },
    });
  } catch (err) {
    console.error("Client admissions error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch admissions data" });
  }
});

module.exports = router;