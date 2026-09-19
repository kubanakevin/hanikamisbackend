// routes/admin/profile.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool = require("../../config/db");
const { requireAuth } = require("../../middleware/auth");

const SALT_ROUNDS = 10;

/* ============================================================
   GET /api/admin/profile
   Returns the current user's own record.
   ============================================================ */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.department_id,
              u.is_active, u.created_at, u.updated_at, u.last_login,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
});

/* ============================================================
   PUT /api/admin/profile
   Body: { full_name?, email?, department_id? }
   Only touches the fields sent.
   ============================================================ */
router.put("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { full_name, email, department_id } = req.body || {};

    // Validate email if provided
    if (email !== undefined) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
      if (!emailOk) {
        return res.status(400).json({ success: false, error: "Invalid email address" });
      }

      const [dup] = await pool.query(
        "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1",
        [String(email).trim(), userId]
      );
      if (dup.length > 0) {
        return res.status(409).json({
          success: false,
          error: "A user with this email already exists",
        });
      }
    }

    if (full_name !== undefined) {
      if (!String(full_name).trim()) {
        return res.status(400).json({ success: false, error: "Full name cannot be empty" });
      }
    }

    const sets = [];
    const params = [];

    if (full_name !== undefined) {
      sets.push("full_name = ?");
      params.push(String(full_name).trim());
    }
    if (email !== undefined) {
      sets.push("email = ?");
      params.push(String(email).trim());
    }
    if (department_id !== undefined) {
      sets.push("department_id = ?");
      params.push(department_id || null);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    sets.push("updated_at = NOW()");
    params.push(userId);

    await pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    // Refresh session user if applicable
    if (req.session?.user) {
      if (full_name !== undefined) req.session.user.full_name = String(full_name).trim();
      if (email !== undefined) req.session.user.email = String(email).trim();
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

/* ============================================================
   PATCH /api/admin/profile/password
   Body: { current_password, new_password, confirm_password }
   ============================================================ */
router.patch("/password", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { current_password, new_password, confirm_password } = req.body || {};

    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({
        success: false,
        error: "current_password, new_password and confirm_password are required",
      });
    }

    if (String(new_password).length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        error: "New password and confirmation do not match",
      });
    }

    const [rows] = await pool.query(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(String(current_password), user.password);
    if (!ok) {
      return res.status(400).json({ success: false, error: "Current password is incorrect" });
    }

    // Prevent reusing the same password
    const same = await bcrypt.compare(String(new_password), user.password);
    if (same) {
      return res.status(400).json({
        success: false,
        error: "New password must be different from the current password",
      });
    }

    const hash = await bcrypt.hash(String(new_password), SALT_ROUNDS);
    await pool.query(
      "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
      [hash, userId]
    );

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, error: "Failed to change password" });
  }
});

/* ============================================================
   GET /api/admin/profile/departments
   List active departments for the dropdown.
   ============================================================ */
router.get("/departments", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name
       FROM departments
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get departments (profile) error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch departments" });
  }
});

module.exports = router;