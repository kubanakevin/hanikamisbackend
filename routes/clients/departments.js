// routes/clients/departments.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/departments
   List active departments with program counts.
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.slug, d.description,
              d.head_of_department, d.created_at,
              (SELECT COUNT(*) FROM programs p
                WHERE p.department_id = d.id AND p.is_active = 1) AS program_count
       FROM departments d
       WHERE d.is_active = 1
       ORDER BY d.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client departments list error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch departments" });
  }
});

/* ============================================================
   GET /api/client/departments/:slug
   Single department with its programs.
   Slug or numeric id.
   ============================================================ */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const isNumeric = /^\d+$/.test(slug);

    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.slug, d.description,
              d.head_of_department, d.created_at
       FROM departments d
       WHERE d.is_active = 1 AND ${isNumeric ? "d.id = ?" : "d.slug = ?"}
       LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Department not found" });
    }

    const department = rows[0];

    // Programs in this department
    const [programs] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.level, p.duration,
              p.short_description, p.image_url, p.is_featured,
              p.display_order
       FROM programs p
       WHERE p.department_id = ? AND p.is_active = 1
       ORDER BY p.is_featured DESC, p.display_order ASC, p.name ASC`,
      [department.id]
    );

    // Related departments (up to 4, alphabetically near this one)
    const [related] = await pool.query(
      `SELECT d.id, d.name, d.slug, d.description,
              (SELECT COUNT(*) FROM programs p
                WHERE p.department_id = d.id AND p.is_active = 1) AS program_count
       FROM departments d
       WHERE d.is_active = 1 AND d.id <> ?
       ORDER BY d.name ASC
       LIMIT 4`,
      [department.id]
    );

    res.json({
      success: true,
      data: { ...department, programs, related },
    });
  } catch (err) {
    console.error("Client department detail error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch department" });
  }
});

module.exports = router;