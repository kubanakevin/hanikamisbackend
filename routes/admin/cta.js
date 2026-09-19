// routes/admin/cta.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/cta");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `cta-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpe?g|png|webp|gif)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error("Only .jpg, .jpeg, .png, .webp, .gif files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helper: delete a file
const deleteCTAImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete CTA image:", err);
    }
  });
};

// Helper: normalize booleans
const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};

// Multer error wrapper
const handleUpload = (req, res, next) => {
  upload.single("background_image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ===================== CTA ROUTES =====================

// Get all CTA sections
router.get("/cta", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [cta] = await pool.query(
      `SELECT id, title, description, primary_button_text, primary_button_link, 
              secondary_button_text, secondary_button_link, background_image, 
              is_active, updated_at
       FROM cta_section 
       ORDER BY updated_at DESC`
    );
    res.json({ success: true, data: cta });
  } catch (err) {
    console.error("Get CTA error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch CTA sections" });
  }
});

// Get single CTA section
router.get("/cta/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [cta] = await pool.query(
      "SELECT * FROM cta_section WHERE id = ?",
      [req.params.id]
    );
    if (cta.length === 0) {
      return res.status(404).json({ success: false, error: "CTA section not found" });
    }
    res.json({ success: true, data: cta[0] });
  } catch (err) {
    console.error("Get CTA section error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch CTA section" });
  }
});

// Create CTA section
router.post("/cta", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      description,
      primary_button_text,
      primary_button_link,
      secondary_button_text,
      secondary_button_link,
      is_active,
    } = req.body;

    if (!title) {
      if (req.file) deleteCTAImage(`/uploads/cta/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const background_image = req.file ? `/uploads/cta/${req.file.filename}` : null;
    const isActive = toBool(is_active, true);

    const [result] = await pool.query(
      `INSERT INTO cta_section (
        title, description, primary_button_text, primary_button_link,
        secondary_button_text, secondary_button_link, background_image, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || null,
        primary_button_text || null,
        primary_button_link || null,
        secondary_button_text || null,
        secondary_button_link || null,
        background_image,
        isActive ? 1 : 0,
      ]
    );

    res.json({
      success: true,
      message: "CTA section created successfully",
      data: { id: result.insertId, background_image },
    });
  } catch (err) {
    if (req.file) deleteCTAImage(`/uploads/cta/${req.file.filename}`);
    console.error("Create CTA section error:", err);
    res.status(500).json({ success: false, error: "Failed to create CTA section" });
  }
});

// Update CTA section
router.put("/cta/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      description,
      primary_button_text,
      primary_button_link,
      secondary_button_text,
      secondary_button_link,
      is_active,
      remove_image,
    } = req.body;

    if (!title) {
      if (req.file) deleteCTAImage(`/uploads/cta/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    // Get existing CTA section
    const [existingRows] = await pool.query(
      "SELECT background_image FROM cta_section WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.file) deleteCTAImage(`/uploads/cta/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "CTA section not found" });
    }

    const existingImage = existingRows[0].background_image;

    // Handle background image
    let background_image = existingImage;
    if (req.file) {
      background_image = `/uploads/cta/${req.file.filename}`;
      if (existingImage) deleteCTAImage(existingImage);
    } else if (toBool(remove_image, false)) {
      background_image = null;
      if (existingImage) deleteCTAImage(existingImage);
    }

    const isActive = toBool(is_active, true);

    await pool.query(
      `UPDATE cta_section SET
        title = ?,
        description = ?,
        primary_button_text = ?,
        primary_button_link = ?,
        secondary_button_text = ?,
        secondary_button_link = ?,
        background_image = ?,
        is_active = ?
      WHERE id = ?`,
      [
        title,
        description || null,
        primary_button_text || null,
        primary_button_link || null,
        secondary_button_text || null,
        secondary_button_link || null,
        background_image,
        isActive ? 1 : 0,
        req.params.id,
      ]
    );

    res.json({
      success: true,
      message: "CTA section updated successfully",
      data: { background_image },
    });
  } catch (err) {
    if (req.file) deleteCTAImage(`/uploads/cta/${req.file.filename}`);
    console.error("Update CTA section error:", err);
    res.status(500).json({ success: false, error: "Failed to update CTA section" });
  }
});

// Delete CTA section
router.delete("/cta/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT background_image FROM cta_section WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "CTA section not found" });
    }
    
    await pool.query("DELETE FROM cta_section WHERE id = ?", [req.params.id]);
    if (rows[0].background_image) deleteCTAImage(rows[0].background_image);
    
    res.json({ success: true, message: "CTA section deleted successfully" });
  } catch (err) {
    console.error("Delete CTA section error:", err);
    res.status(500).json({ success: false, error: "Failed to delete CTA section" });
  }
});

// Toggle active status
router.patch("/cta/:id/toggle-active", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    
    await pool.query(
      "UPDATE cta_section SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    
    res.json({ success: true, message: "CTA status updated successfully" });
  } catch (err) {
    console.error("Toggle CTA status error:", err);
    res.status(500).json({ success: false, error: "Failed to update CTA status" });
  }
});

// Get active CTA section for public display (only one active)
router.get("/cta/public/active", async (req, res) => {
  try {
    const [cta] = await pool.query(
      `SELECT id, title, description, primary_button_text, primary_button_link,
              secondary_button_text, secondary_button_link, background_image
       FROM cta_section 
       WHERE is_active = 1
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    res.json({ success: true, data: cta[0] || null });
  } catch (err) {
    console.error("Get public CTA error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch CTA section" });
  }
});

module.exports = router;