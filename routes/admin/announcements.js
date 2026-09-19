// routes/admin/announcements.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");
const multer = require("multer");

// No file upload needed, but we need to parse multipart/form-data
const upload = multer();

// Helper: normalize booleans
const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};

// Helper: safely parse priority
const parsePriority = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const parsed = parseInt(val);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper: safely parse date
const parseDate = (val) => {
  if (val === undefined || val === null || val === "") return null;
  // If date is in ISO format with 'T', convert to MySQL datetime
  if (typeof val === 'string' && val.includes('T')) {
    return val.replace('T', ' ');
  }
  return val;
};

// ===================== ANNOUNCEMENTS ROUTES =====================

// Get all announcements
router.get("/announcements", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [announcements] = await pool.query(
      `SELECT id, title, content, priority, start_date, expiry_date, 
              is_active, created_at, updated_at
       FROM announcements 
       ORDER BY priority DESC, created_at DESC`
    );
    res.json({ success: true, data: announcements });
  } catch (err) {
    console.error("Get announcements error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch announcements" });
  }
});

// Get single announcement
router.get("/announcements/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [announcements] = await pool.query(
      "SELECT * FROM announcements WHERE id = ?",
      [req.params.id]
    );
    if (announcements.length === 0) {
      return res.status(404).json({ success: false, error: "Announcement not found" });
    }
    res.json({ success: true, data: announcements[0] });
  } catch (err) {
    console.error("Get announcement error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch announcement" });
  }
});

// Create announcement - handle both JSON and FormData
router.post("/announcements", requireAuth, requireRole("super_manager", "department_manager"), upload.none(), async (req, res) => {
  try {
    // Get form data or JSON body
    const body = req.body;
    
    let title = body.title;
    let content = body.content;
    let priority = body.priority;
    let start_date = body.start_date;
    let expiry_date = body.expiry_date;
    let is_active = body.is_active;

    // If body is a string (JSON), parse it
    if (typeof body === 'string' && body.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(body);
        title = parsed.title;
        content = parsed.content;
        priority = parsed.priority;
        start_date = parsed.start_date;
        expiry_date = parsed.expiry_date;
        is_active = parsed.is_active;
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const isActive = toBool(is_active, true);
    const priorityValue = parsePriority(priority);
    const startDate = parseDate(start_date);
    const expiryDate = parseDate(expiry_date);

    const [result] = await pool.query(
      `INSERT INTO announcements (
        title, content, priority, start_date, expiry_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        title,
        content || null,
        priorityValue,
        startDate,
        expiryDate,
        isActive ? 1 : 0,
      ]
    );

    res.json({
      success: true,
      message: "Announcement created successfully",
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error("Create announcement error:", err);
    res.status(500).json({ success: false, error: "Failed to create announcement" });
  }
});

// Update announcement - handle both JSON and FormData
router.put("/announcements/:id", requireAuth, requireRole("super_manager", "department_manager"), upload.none(), async (req, res) => {
  try {
    // Get form data or JSON body
    const body = req.body;
    
    let title = body.title;
    let content = body.content;
    let priority = body.priority;
    let start_date = body.start_date;
    let expiry_date = body.expiry_date;
    let is_active = body.is_active;

    // If body is a string (JSON), parse it
    if (typeof body === 'string' && body.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(body);
        title = parsed.title;
        content = parsed.content;
        priority = parsed.priority;
        start_date = parsed.start_date;
        expiry_date = parsed.expiry_date;
        is_active = parsed.is_active;
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    // Check if announcement exists
    const [existing] = await pool.query(
      "SELECT id FROM announcements WHERE id = ?",
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "Announcement not found" });
    }

    const isActive = toBool(is_active, true);
    const priorityValue = parsePriority(priority);
    const startDate = parseDate(start_date);
    const expiryDate = parseDate(expiry_date);

    await pool.query(
      `UPDATE announcements SET
        title = ?,
        content = ?,
        priority = ?,
        start_date = ?,
        expiry_date = ?,
        is_active = ?
      WHERE id = ?`,
      [
        title,
        content || null,
        priorityValue,
        startDate,
        expiryDate,
        isActive ? 1 : 0,
        req.params.id,
      ]
    );

    res.json({
      success: true,
      message: "Announcement updated successfully",
    });
  } catch (err) {
    console.error("Update announcement error:", err);
    res.status(500).json({ success: false, error: "Failed to update announcement" });
  }
});

// Delete announcement
router.delete("/announcements/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [existing] = await pool.query(
      "SELECT id FROM announcements WHERE id = ?",
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "Announcement not found" });
    }
    
    await pool.query("DELETE FROM announcements WHERE id = ?", [req.params.id]);
    
    res.json({ success: true, message: "Announcement deleted successfully" });
  } catch (err) {
    console.error("Delete announcement error:", err);
    res.status(500).json({ success: false, error: "Failed to delete announcement" });
  }
});

// Toggle active status
router.patch("/announcements/:id/toggle-active", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    
    const [existing] = await pool.query(
      "SELECT id FROM announcements WHERE id = ?",
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "Announcement not found" });
    }

    await pool.query(
      "UPDATE announcements SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    
    res.json({ success: true, message: "Announcement status updated successfully" });
  } catch (err) {
    console.error("Toggle announcement status error:", err);
    res.status(500).json({ success: false, error: "Failed to update announcement status" });
  }
});

// Get active announcements for public display
router.get("/announcements/public", async (req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const [announcements] = await pool.query(
      `SELECT id, title, content, priority, start_date, expiry_date
       FROM announcements 
       WHERE is_active = 1
         AND (start_date IS NULL OR start_date <= ?)
         AND (expiry_date IS NULL OR expiry_date >= ?)
       ORDER BY priority DESC, created_at DESC
       LIMIT 20`,
      [now, now]
    );
    res.json({ success: true, data: announcements });
  } catch (err) {
    console.error("Get public announcements error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch announcements" });
  }
});

module.exports = router;