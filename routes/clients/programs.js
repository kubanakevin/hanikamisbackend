// routes/clients/programs.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/programs
   Query: ?page=1&limit=12&level=diploma&department=business&search=...
   Only active programs.
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 60);
    const offset = (page - 1) * limit;

    const level = (req.query.level || "").toString().trim();
    const department = (req.query.department || "").toString().trim();
    const search = (req.query.search || "").toString().trim();

    const where = ["p.is_active = 1"];
    const params = [];

    if (level) {
      where.push("p.level = ?");
      params.push(level);
    }
    if (department) {
      where.push("d.slug = ?");
      params.push(department);
    }
    if (search) {
      where.push("(p.name LIKE ? OR p.short_description LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM programs p
       JOIN departments d ON d.id = p.department_id
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.level, p.duration,
              p.short_description, p.image_url,
              p.is_featured, p.display_order,
              d.name AS department_name, d.slug AS department_slug
       FROM programs p
       JOIN departments d ON d.id = p.department_id
       ${whereSql}
       ORDER BY p.is_featured DESC, p.display_order ASC, p.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: Number(total) || 0,
        total_pages: Math.ceil((Number(total) || 0) / limit),
        has_more: page * limit < (Number(total) || 0),
      },
    });
  } catch (err) {
    console.error("Client programs list error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch programs" });
  }
});

/* ============================================================
   GET /api/client/programs/levels
   Static list plus counts from the DB.
   ============================================================ */
router.get("/levels", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT level, COUNT(*) AS count
       FROM programs
       WHERE is_active = 1 AND level IS NOT NULL AND level <> ''
       GROUP BY level
       ORDER BY level ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client program levels error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch levels" });
  }
});

/* ============================================================
   GET /api/client/programs/departments
   Departments that have at least one active program.
   ============================================================ */
router.get("/departments", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.slug,
              COUNT(p.id) AS program_count
       FROM departments d
       LEFT JOIN programs p ON p.department_id = d.id AND p.is_active = 1
       WHERE d.is_active = 1
       GROUP BY d.id, d.name, d.slug
       HAVING program_count > 0
       ORDER BY d.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client program departments error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch departments" });
  }
});

/* ============================================================
   GET /api/client/programs/featured
   ============================================================ */
router.get("/featured", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 4, 12);
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.level, p.duration,
              p.short_description, p.image_url,
              d.name AS department_name
       FROM programs p
       JOIN departments d ON d.id = p.department_id
       WHERE p.is_active = 1 AND p.is_featured = 1
       ORDER BY p.display_order ASC
       LIMIT ?`,
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client featured programs error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch featured programs" });
  }
});

/* ============================================================
   GET /api/client/programs/:slug
   Single program with department, related programs.
   ============================================================ */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const isNumeric = /^\d+$/.test(slug);

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.level, p.duration,
              p.short_description, p.full_description,
              p.entry_requirements, p.career_opportunities,
              p.image_url, p.is_featured,
              d.id AS department_id, d.name AS department_name, d.slug AS department_slug
       FROM programs p
       JOIN departments d ON d.id = p.department_id
       WHERE p.is_active = 1 AND ${isNumeric ? "p.id = ?" : "p.slug = ?"}
       LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Program not found" });
    }

    const program = rows[0];

    // Related: same department, exclude self, latest 3
    const [related] = await pool.query(
      `SELECT id, name, slug, level, duration, image_url, short_description
       FROM programs
       WHERE is_active = 1 AND department_id = ? AND id <> ?
       ORDER BY is_featured DESC, display_order ASC
       LIMIT 3`,
      [program.department_id, program.id]
    );

    res.json({
      success: true,
      data: { ...program, related },
    });
  } catch (err) {
    console.error("Client program detail error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch program" });
  }
});

module.exports = router;