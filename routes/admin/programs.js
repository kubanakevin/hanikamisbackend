// routes/admin/programs.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/programs");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `program-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpe?g|png|webp)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error("Only .jpg, .jpeg, .png, .webp files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Helper: delete a file under /uploads/programs given its stored image_url
const deleteProgramImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete program image:", err);
    }
  });
};

// Helper: normalize booleans/numbers coming from multipart form-data (always strings)
const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};
const toIntOrNull = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
};

// Multer error wrapper so upload errors return clean JSON instead of crashing
const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// Get all programs with department names
router.get("/", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [programs] = await pool.query(
      `SELECT p.*, d.name AS department_name 
       FROM programs p
       LEFT JOIN departments d ON p.department_id = d.id
       ORDER BY p.display_order ASC, p.name ASC`
    );
    res.json({ success: true, data: programs });
  } catch (err) {
    console.error("Get programs error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch programs" });
  }
});

// Get departments for dropdown (kept above /:id so it isn't shadowed)
router.get("/departments/list", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [departments] = await pool.query(
      `SELECT id, name FROM departments WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ success: true, data: departments });
  } catch (err) {
    console.error("Get departments error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch departments" });
  }
});

// Get single program
router.get("/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [programs] = await pool.query(
      `SELECT p.*, d.name AS department_name 
       FROM programs p
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (programs.length === 0) {
      return res.status(404).json({ success: false, error: "Program not found" });
    }
    res.json({ success: true, data: programs[0] });
  } catch (err) {
    console.error("Get program error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch program" });
  }
});

// Create program
router.post("/", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      department_id,
      name,
      slug,
      level,
      duration,
      short_description,
      full_description,
      entry_requirements,
      career_opportunities,
      is_featured,
      is_active,
      display_order,
    } = req.body;

    if (!department_id || !name || !slug || !level) {
      if (req.file) deleteProgramImage(`/uploads/programs/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Department, name, slug, and level are required",
      });
    }

    const image_url = req.file ? `/uploads/programs/${req.file.filename}` : null;

    const [result] = await pool.query(
      `INSERT INTO programs (
        department_id, name, slug, level, duration,
        short_description, full_description, entry_requirements,
        career_opportunities, image_url, is_featured, is_active, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toIntOrNull(department_id),
        name,
        slug,
        level,
        duration || null,
        short_description || null,
        full_description || null,
        entry_requirements || null,
        career_opportunities || null,
        image_url,
        toBool(is_featured, false) ? 1 : 0,
        toBool(is_active, true) ? 1 : 0,
        toIntOrNull(display_order) || 0,
      ]
    );

    res.json({
      success: true,
      message: "Program created successfully",
      data: { id: result.insertId, image_url },
    });
  } catch (err) {
    if (req.file) deleteProgramImage(`/uploads/programs/${req.file.filename}`);
    console.error("Create program error:", err);
    res.status(500).json({ success: false, error: "Failed to create program" });
  }
});

// Update program
router.put("/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      department_id,
      name,
      slug,
      level,
      duration,
      short_description,
      full_description,
      entry_requirements,
      career_opportunities,
      is_featured,
      is_active,
      display_order,
      remove_image,
    } = req.body;

    if (!department_id || !name || !slug || !level) {
      if (req.file) deleteProgramImage(`/uploads/programs/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Department, name, slug, and level are required",
      });
    }

    const [existingRows] = await pool.query("SELECT image_url FROM programs WHERE id = ?", [req.params.id]);
    if (existingRows.length === 0) {
      if (req.file) deleteProgramImage(`/uploads/programs/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "Program not found" });
    }
    const existingImage = existingRows[0].image_url;

    let image_url = existingImage;
    if (req.file) {
      image_url = `/uploads/programs/${req.file.filename}`;
      if (existingImage) deleteProgramImage(existingImage);
    } else if (toBool(remove_image, false)) {
      image_url = null;
      if (existingImage) deleteProgramImage(existingImage);
    }

    await pool.query(
      `UPDATE programs SET
        department_id = ?,
        name = ?,
        slug = ?,
        level = ?,
        duration = ?,
        short_description = ?,
        full_description = ?,
        entry_requirements = ?,
        career_opportunities = ?,
        image_url = ?,
        is_featured = ?,
        is_active = ?,
        display_order = ?
      WHERE id = ?`,
      [
        toIntOrNull(department_id),
        name,
        slug,
        level,
        duration || null,
        short_description || null,
        full_description || null,
        entry_requirements || null,
        career_opportunities || null,
        image_url,
        toBool(is_featured, false) ? 1 : 0,
        toBool(is_active, true) ? 1 : 0,
        toIntOrNull(display_order) || 0,
        req.params.id,
      ]
    );

    res.json({ success: true, message: "Program updated successfully", data: { image_url } });
  } catch (err) {
    if (req.file) deleteProgramImage(`/uploads/programs/${req.file.filename}`);
    console.error("Update program error:", err);
    res.status(500).json({ success: false, error: "Failed to update program" });
  }
});

// Delete program
router.delete("/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT image_url FROM programs WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Program not found" });
    }
    await pool.query("DELETE FROM programs WHERE id = ?", [req.params.id]);
    if (rows[0].image_url) deleteProgramImage(rows[0].image_url);
    res.json({ success: true, message: "Program deleted successfully" });
  } catch (err) {
    console.error("Delete program error:", err);
    res.status(500).json({ success: false, error: "Failed to delete program" });
  }
});

// Toggle program status
router.patch("/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query("UPDATE programs SET is_active = ? WHERE id = ?", [is_active ? 1 : 0, req.params.id]);
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

module.exports = router;