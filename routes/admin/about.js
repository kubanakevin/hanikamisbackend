// routes/admin/about.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/about");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `about-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpe?g|png|webp|gif|svg)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error("Only .jpg, .jpeg, .png, .webp, .gif, .svg files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helper: delete a file
const deleteAboutImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete about image:", err);
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
  upload.single("image_url")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ===================== ABOUT ROUTES =====================

// Get all about sections
router.get("/about", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [about] = await pool.query(
      `SELECT id, title, short_description, full_content, mission, vision, 
              core_values, image_url, video_url, founded_year, updated_at
       FROM about_section 
       ORDER BY updated_at DESC`
    );
    res.json({ success: true, data: about });
  } catch (err) {
    console.error("Get about sections error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch about sections" });
  }
});

// Get single about section
router.get("/about/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [about] = await pool.query(
      "SELECT * FROM about_section WHERE id = ?",
      [req.params.id]
    );
    if (about.length === 0) {
      return res.status(404).json({ success: false, error: "About section not found" });
    }
    res.json({ success: true, data: about[0] });
  } catch (err) {
    console.error("Get about section error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch about section" });
  }
});

// Create about section
router.post("/about", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      short_description,
      full_content,
      mission,
      vision,
      core_values,
      video_url,
      founded_year,
    } = req.body;

    if (!title) {
      if (req.file) deleteAboutImage(`/uploads/about/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const image_url = req.file ? `/uploads/about/${req.file.filename}` : null;

    const [result] = await pool.query(
      `INSERT INTO about_section (
        title, short_description, full_content, mission, vision,
        core_values, image_url, video_url, founded_year
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        short_description || null,
        full_content || null,
        mission || null,
        vision || null,
        core_values || null,
        image_url,
        video_url || null,
        founded_year || null,
      ]
    );

    res.json({
      success: true,
      message: "About section created successfully",
      data: { id: result.insertId, image_url },
    });
  } catch (err) {
    if (req.file) deleteAboutImage(`/uploads/about/${req.file.filename}`);
    console.error("Create about section error:", err);
    res.status(500).json({ success: false, error: "Failed to create about section" });
  }
});

// Update about section
router.put("/about/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      short_description,
      full_content,
      mission,
      vision,
      core_values,
      video_url,
      founded_year,
      remove_image,
    } = req.body;

    if (!title) {
      if (req.file) deleteAboutImage(`/uploads/about/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    // Get existing about section
    const [existingRows] = await pool.query(
      "SELECT image_url FROM about_section WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.file) deleteAboutImage(`/uploads/about/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "About section not found" });
    }

    const existingImage = existingRows[0].image_url;

    // Handle image
    let image_url = existingImage;
    if (req.file) {
      image_url = `/uploads/about/${req.file.filename}`;
      if (existingImage) deleteAboutImage(existingImage);
    } else if (toBool(remove_image, false)) {
      image_url = null;
      if (existingImage) deleteAboutImage(existingImage);
    }

    await pool.query(
      `UPDATE about_section SET
        title = ?,
        short_description = ?,
        full_content = ?,
        mission = ?,
        vision = ?,
        core_values = ?,
        image_url = ?,
        video_url = ?,
        founded_year = ?
      WHERE id = ?`,
      [
        title,
        short_description || null,
        full_content || null,
        mission || null,
        vision || null,
        core_values || null,
        image_url,
        video_url || null,
        founded_year || null,
        req.params.id,
      ]
    );

    res.json({
      success: true,
      message: "About section updated successfully",
      data: { image_url },
    });
  } catch (err) {
    if (req.file) deleteAboutImage(`/uploads/about/${req.file.filename}`);
    console.error("Update about section error:", err);
    res.status(500).json({ success: false, error: "Failed to update about section" });
  }
});

// Delete about section
router.delete("/about/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT image_url FROM about_section WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "About section not found" });
    }
    
    await pool.query("DELETE FROM about_section WHERE id = ?", [req.params.id]);
    if (rows[0].image_url) deleteAboutImage(rows[0].image_url);
    
    res.json({ success: true, message: "About section deleted successfully" });
  } catch (err) {
    console.error("Delete about section error:", err);
    res.status(500).json({ success: false, error: "Failed to delete about section" });
  }
});

// Get public about section
router.get("/about/public", async (req, res) => {
  try {
    const [about] = await pool.query(
      `SELECT id, title, short_description, full_content, mission, vision,
              core_values, image_url, video_url, founded_year
       FROM about_section 
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    res.json({ success: true, data: about[0] || null });
  } catch (err) {
    console.error("Get public about section error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch about section" });
  }
});

module.exports = router;