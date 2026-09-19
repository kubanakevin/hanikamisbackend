// routes/admin/users.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

const SALT_ROUNDS = 10;

/* ============================================================
   GET /api/admin/users
   Query: ?search=&role=&status=active|inactive
   ============================================================ */
router.get(
  "/",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const search = (req.query.search || "").toString().trim();
      const role = (req.query.role || "").toString().trim();
      const status = (req.query.status || "").toString().trim().toLowerCase();

      const where = [];
      const params = [];

      if (search) {
        where.push("(u.full_name LIKE ? OR u.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }
      if (role) {
        where.push("u.role = ?");
        params.push(role);
      }
      if (status === "active") {
        where.push("u.is_active = 1");
      } else if (status === "inactive") {
        where.push("u.is_active = 0");
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.department_id,
                u.is_active, u.created_at, u.updated_at, u.last_login,
                d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         ${whereSql}
         ORDER BY u.created_at DESC`,
        params
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Admin users list error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
      });
    }
  }
);

/* ============================================================
   GET /api/admin/users/:id
   ============================================================ */
router.get(
  "/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.department_id,
                u.is_active, u.created_at, u.updated_at, u.last_login,
                d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.id = ?
         LIMIT 1`,
        [req.params.id]
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Admin user fetch error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch user" });
    }
  }
);

/* ============================================================
   POST /api/admin/users
   Body: { email, password, full_name, role, department_id, is_active }
   ============================================================ */
router.post(
  "/",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const {
        email,
        password,
        full_name,
        role = "staff",
        department_id = null,
        is_active = true,
      } = req.body || {};

      // Validation
      if (!email || !password || !full_name) {
        return res.status(400).json({
          success: false,
          error: "email, password, and full_name are required",
        });
      }

      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
      if (!emailOk) {
        return res.status(400).json({
          success: false,
          error: "Invalid email address",
        });
      }

      if (String(password).length < 6) {
        return res.status(400).json({
          success: false,
          error: "Password must be at least 6 characters",
        });
      }

      // Duplicate email check
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [String(email).trim()]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: "A user with this email already exists",
        });
      }

      const hash = await bcrypt.hash(String(password), SALT_ROUNDS);

      const [result] = await pool.query(
        `INSERT INTO users
           (email, password, full_name, role, department_id, is_active,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          String(email).trim(),
          hash,
          String(full_name).trim(),
          String(role).trim(),
          department_id || null,
          is_active ? 1 : 0,
        ]
      );

      res.json({
        success: true,
        message: "User created successfully",
        data: { id: result.insertId },
      });
    } catch (err) {
      console.error("Admin user create error:", err);
      res.status(500).json({ success: false, error: "Failed to create user" });
    }
  }
);

/* ============================================================
   PUT /api/admin/users/:id
   Body: same fields; password optional (blank = keep current)
   ============================================================ */
router.put(
  "/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        email,
        password,
        full_name,
        role,
        department_id,
        is_active,
      } = req.body || {};

      // Ensure user exists
      const [existing] = await pool.query(
        "SELECT id, email FROM users WHERE id = ? LIMIT 1",
        [id]
      );
      if (existing.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      // Duplicate email check (excluding self)
      if (email) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
        if (!emailOk) {
          return res.status(400).json({
            success: false,
            error: "Invalid email address",
          });
        }
        const [dup] = await pool.query(
          "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1",
          [String(email).trim(), id]
        );
        if (dup.length > 0) {
          return res.status(409).json({
            success: false,
            error: "A user with this email already exists",
          });
        }
      }

      const sets = [];
      const params = [];

      if (email !== undefined) {
        sets.push("email = ?");
        params.push(String(email).trim());
      }
      if (full_name !== undefined) {
        sets.push("full_name = ?");
        params.push(String(full_name).trim());
      }
      if (role !== undefined) {
        sets.push("role = ?");
        params.push(String(role).trim());
      }
      if (department_id !== undefined) {
        sets.push("department_id = ?");
        params.push(department_id || null);
      }
      if (is_active !== undefined) {
        sets.push("is_active = ?");
        params.push(is_active ? 1 : 0);
      }

      // Only update password if a non-empty value was provided
      if (password && String(password).length > 0) {
        if (String(password).length < 6) {
          return res.status(400).json({
            success: false,
            error: "Password must be at least 6 characters",
          });
        }
        const hash = await bcrypt.hash(String(password), SALT_ROUNDS);
        sets.push("password = ?");
        params.push(hash);
      }

      if (sets.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No fields to update" });
      }

      sets.push("updated_at = NOW()");
      params.push(id);

      await pool.query(
        `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      res.json({ success: true, message: "User updated successfully" });
    } catch (err) {
      console.error("Admin user update error:", err);
      res.status(500).json({ success: false, error: "Failed to update user" });
    }
  }
);

/* ============================================================
   PATCH /api/admin/users/:id/toggle-status
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

      // Prevent super_manager from deactivating their own account
      const currentUserId = req.session?.user?.id || req.user?.id;
      if (Number(currentUserId) === Number(id) && is_active === false) {
        return res.status(400).json({
          success: false,
          error: "You cannot deactivate your own account",
        });
      }

      const [result] = await pool.query(
        "UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?",
        [is_active ? 1 : 0, id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      res.json({ success: true, message: "Status updated" });
    } catch (err) {
      console.error("Admin user toggle-status error:", err);
      res.status(500).json({ success: false, error: "Failed to update status" });
    }
  }
);

/* ============================================================
   DELETE /api/admin/users/:id
   ============================================================ */
router.delete(
  "/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Prevent self-deletion
      const currentUserId = req.session?.user?.id || req.user?.id;
      if (Number(currentUserId) === Number(id)) {
        return res.status(400).json({
          success: false,
          error: "You cannot delete your own account",
        });
      }

      // Optional safety: prevent deleting the last remaining super_manager
      const [target] = await pool.query(
        "SELECT role FROM users WHERE id = ? LIMIT 1",
        [id]
      );
      if (target.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      if (target[0].role === "super_manager") {
        const [[{ count }]] = await pool.query(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'super_manager' AND is_active = 1"
        );
        if (Number(count) <= 1) {
          return res.status(400).json({
            success: false,
            error: "Cannot delete the last active super_manager",
          });
        }
      }

      await pool.query("DELETE FROM users WHERE id = ?", [id]);

      res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
      console.error("Admin user delete error:", err);
      res.status(500).json({ success: false, error: "Failed to delete user" });
    }
  }
);

module.exports = router;