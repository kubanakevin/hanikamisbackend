// routes/admin/departments.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

/* ============================================================
   GET /api/admin/departments
   Query: ?search=&status=active|inactive
   ============================================================ */
router.get(
  "/",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const search = (req.query.search || "").toString().trim();
      const status = (req.query.status || "").toString().trim().toLowerCase();

      const where = [];
      const params = [];

      if (search) {
        where.push("(name LIKE ? OR slug LIKE ? OR head_of_department LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (status === "active") {
        where.push("is_active = 1");
      } else if (status === "inactive") {
        where.push("is_active = 0");
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // Include program count per department if the programs table has department_id
      const [rows] = await pool.query(
        `SELECT d.id, d.name, d.slug, d.description, d.head_of_department,
                d.is_active, d.created_at,
                (SELECT COUNT(*) FROM programs p WHERE p.department_id = d.id) AS program_count
         FROM departments d
         ${whereSql}
         ORDER BY d.name ASC`,
        params
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Admin departments list error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch departments",
      });
    }
  }
);

/* ============================================================
   GET /api/admin/departments/:id
   ============================================================ */
router.get(
  "/:id",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, name, slug, description, head_of_department,
                is_active, created_at
         FROM departments
         WHERE id = ?
         LIMIT 1`,
        [req.params.id]
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Department not found" });
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Admin department fetch error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch department" });
    }
  }
);

/* ============================================================
   POST /api/admin/departments
   Body: { name, slug, description, head_of_department, is_active }
   ============================================================ */
router.post(
  "/",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const {
        name,
        slug,
        description = null,
        head_of_department = null,
        is_active = true,
      } = req.body || {};

      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          error: "name and slug are required",
        });
      }

      // Duplicate name check
      const [dupName] = await pool.query(
        "SELECT id FROM departments WHERE name = ? LIMIT 1",
        [String(name).trim()]
      );
      if (dupName.length > 0) {
        return res.status(409).json({
          success: false,
          error: "A department with this name already exists",
        });
      }

      // Duplicate slug check
      const [dupSlug] = await pool.query(
        "SELECT id FROM departments WHERE slug = ? LIMIT 1",
        [String(slug).trim()]
      );
      if (dupSlug.length > 0) {
        return res.status(409).json({
          success: false,
          error: "A department with this slug already exists",
        });
      }

      const toStrOrNull = (v) =>
        v === undefined || v === null || String(v).trim() === ""
          ? null
          : String(v).trim();

      const [result] = await pool.query(
        `INSERT INTO departments
           (name, slug, description, head_of_department, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          String(name).trim(),
          String(slug).trim(),
          toStrOrNull(description),
          toStrOrNull(head_of_department),
          is_active ? 1 : 0,
        ]
      );

      res.json({
        success: true,
        message: "Department created successfully",
        data: { id: result.insertId },
      });
    } catch (err) {
      console.error("Admin department create error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to create department" });
    }
  }
);

/* ============================================================
   PUT /api/admin/departments/:id
   ============================================================ */
router.put(
  "/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        slug,
        description,
        head_of_department,
        is_active,
      } = req.body || {};

      // Ensure exists
      const [existing] = await pool.query(
        "SELECT id FROM departments WHERE id = ? LIMIT 1",
        [id]
      );
      if (existing.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Department not found" });
      }

      // Duplicate name check (excluding self)
      if (name) {
        const [dupName] = await pool.query(
          "SELECT id FROM departments WHERE name = ? AND id <> ? LIMIT 1",
          [String(name).trim(), id]
        );
        if (dupName.length > 0) {
          return res.status(409).json({
            success: false,
            error: "A department with this name already exists",
          });
        }
      }

      // Duplicate slug check (excluding self)
      if (slug) {
        const [dupSlug] = await pool.query(
          "SELECT id FROM departments WHERE slug = ? AND id <> ? LIMIT 1",
          [String(slug).trim(), id]
        );
        if (dupSlug.length > 0) {
          return res.status(409).json({
            success: false,
            error: "A department with this slug already exists",
          });
        }
      }

      const toStrOrNull = (v) =>
        v === undefined || v === null || String(v).trim() === ""
          ? null
          : String(v).trim();

      const sets = [];
      const params = [];

      if (name !== undefined) {
        sets.push("name = ?");
        params.push(String(name).trim());
      }
      if (slug !== undefined) {
        sets.push("slug = ?");
        params.push(String(slug).trim());
      }
      if (description !== undefined) {
        sets.push("description = ?");
        params.push(toStrOrNull(description));
      }
      if (head_of_department !== undefined) {
        sets.push("head_of_department = ?");
        params.push(toStrOrNull(head_of_department));
      }
      if (is_active !== undefined) {
        sets.push("is_active = ?");
        params.push(is_active ? 1 : 0);
      }

      if (sets.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No fields to update" });
      }

      params.push(id);

      await pool.query(
        `UPDATE departments SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      res.json({
        success: true,
        message: "Department updated successfully",
      });
    } catch (err) {
      console.error("Admin department update error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to update department" });
    }
  }
);

/* ============================================================
   PATCH /api/admin/departments/:id/toggle-status
   Body: { is_active: boolean }
   ============================================================ */
router.patch(
  "/:id/toggle-status",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body || {};

      if (typeof is_active !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "is_active must be a boolean",
        });
      }

      const [result] = await pool.query(
        "UPDATE departments SET is_active = ? WHERE id = ?",
        [is_active ? 1 : 0, id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Department not found" });
      }

      res.json({ success: true, message: "Status updated" });
    } catch (err) {
      console.error("Admin department toggle-status error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to update status" });
    }
  }
);

/* ============================================================
   DELETE /api/admin/departments/:id
   ============================================================ */
router.delete(
  "/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if any programs reference this department
      const [[{ count }]] = await pool.query(
        "SELECT COUNT(*) AS count FROM programs WHERE department_id = ?",
        [id]
      );

      if (Number(count) > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete: ${count} program(s) still reference this department. Reassign or delete them first.`,
        });
      }

      // Check if any users reference this department
      const [[{ userCount }]] = await pool.query(
        "SELECT COUNT(*) AS userCount FROM users WHERE department_id = ?",
        [id]
      );

      if (Number(userCount) > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete: ${userCount} user(s) still assigned to this department. Reassign them first.`,
        });
      }

      const [result] = await pool.query(
        "DELETE FROM departments WHERE id = ?",
        [id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Department not found" });
      }

      res.json({
        success: true,
        message: "Department deleted successfully",
      });
    } catch (err) {
      console.error("Admin department delete error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to delete department" });
    }
  }
);

module.exports = router;