// routes/admin/news.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/news");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `news-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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
const deleteNewsImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete news image:", err);
    }
  });
};

// Helper: normalize booleans/numbers
const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};

const toIntOrNull = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
};

// Multer error wrapper
const handleUpload = (req, res, next) => {
  upload.single("featured_image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ===================== NEWS ROUTES =====================

// Get all news articles
router.get("/", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [news] = await pool.query(
      `SELECT 
        id, title, slug, excerpt, featured_image, category, 
        author, views, is_published, published_at, created_at, updated_at
       FROM news 
       ORDER BY published_at DESC, created_at DESC`
    );
    res.json({ success: true, data: news });
  } catch (err) {
    console.error("Get news error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch news" });
  }
});

// Get single news article with full content
router.get("/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [news] = await pool.query(
      "SELECT * FROM news WHERE id = ?",
      [req.params.id]
    );
    if (news.length === 0) {
      return res.status(404).json({ success: false, error: "News article not found" });
    }
    res.json({ success: true, data: news[0] });
  } catch (err) {
    console.error("Get news article error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch news article" });
  }
});

// Create news article
router.post("/", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      category,
      author,
      is_published,
      published_at,
    } = req.body;

    if (!title || !slug) {
      if (req.file) deleteNewsImage(`/uploads/news/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title and slug are required",
      });
    }

    const featured_image = req.file ? `/uploads/news/${req.file.filename}` : null;

    // If is_published is true and no published_at is provided, use current timestamp
    const isPublished = toBool(is_published, false);
    let publishedAt = published_at || null;
    if (isPublished && !publishedAt) {
      publishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    const [result] = await pool.query(
      `INSERT INTO news (
        title, slug, excerpt, content, featured_image,
        category, author, views, is_published, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        slug,
        excerpt || null,
        content || null,
        featured_image,
        category || null,
        author || null,
        0,
        isPublished ? 1 : 0,
        publishedAt,
      ]
    );

    res.json({
      success: true,
      message: "News article created successfully",
      data: { id: result.insertId, featured_image },
    });
  } catch (err) {
    if (req.file) deleteNewsImage(`/uploads/news/${req.file.filename}`);
    console.error("Create news article error:", err);
    res.status(500).json({ success: false, error: "Failed to create news article" });
  }
});

// Update news article
router.put("/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      category,
      author,
      is_published,
      published_at,
      remove_image,
    } = req.body;

    if (!title || !slug) {
      if (req.file) deleteNewsImage(`/uploads/news/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Title and slug are required",
      });
    }

    // Get existing news article
    const [existingRows] = await pool.query(
      "SELECT featured_image FROM news WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.file) deleteNewsImage(`/uploads/news/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "News article not found" });
    }

    const existingImage = existingRows[0].featured_image;

    // Handle featured image
    let featured_image = existingImage;
    if (req.file) {
      featured_image = `/uploads/news/${req.file.filename}`;
      if (existingImage) deleteNewsImage(existingImage);
    } else if (toBool(remove_image, false)) {
      featured_image = null;
      if (existingImage) deleteNewsImage(existingImage);
    }

    // Handle publish status
    const isPublished = toBool(is_published, false);
    let publishedAt = published_at || null;
    
    // If publishing now and no published_at provided, use current timestamp
    if (isPublished && !publishedAt) {
      // Check if it was previously unpublished
      const [current] = await pool.query(
        "SELECT is_published, published_at FROM news WHERE id = ?",
        [req.params.id]
      );
      // If it was unpublished, set published_at to now
      if (current.length > 0 && !current[0].is_published) {
        publishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      } else if (current.length > 0 && current[0].published_at) {
        // Keep existing published_at if already published
        publishedAt = current[0].published_at;
      }
    }

    await pool.query(
      `UPDATE news SET
        title = ?,
        slug = ?,
        excerpt = ?,
        content = ?,
        featured_image = ?,
        category = ?,
        author = ?,
        is_published = ?,
        published_at = ?
      WHERE id = ?`,
      [
        title,
        slug,
        excerpt || null,
        content || null,
        featured_image,
        category || null,
        author || null,
        isPublished ? 1 : 0,
        publishedAt,
        req.params.id,
      ]
    );

    res.json({
      success: true,
      message: "News article updated successfully",
      data: { featured_image },
    });
  } catch (err) {
    if (req.file) deleteNewsImage(`/uploads/news/${req.file.filename}`);
    console.error("Update news article error:", err);
    res.status(500).json({ success: false, error: "Failed to update news article" });
  }
});

// Delete news article
router.delete("/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT featured_image FROM news WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "News article not found" });
    }
    
    await pool.query("DELETE FROM news WHERE id = ?", [req.params.id]);
    if (rows[0].featured_image) deleteNewsImage(rows[0].featured_image);
    
    res.json({ success: true, message: "News article deleted successfully" });
  } catch (err) {
    console.error("Delete news article error:", err);
    res.status(500).json({ success: false, error: "Failed to delete news article" });
  }
});

// Toggle publish status
router.patch("/:id/toggle-publish", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_published } = req.body;
    
    let publishedAt = null;
    if (is_published) {
      publishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    
    await pool.query(
      "UPDATE news SET is_published = ?, published_at = ? WHERE id = ?",
      [is_published ? 1 : 0, publishedAt, req.params.id]
    );
    
    res.json({ success: true, message: "Publish status updated successfully" });
  } catch (err) {
    console.error("Toggle publish status error:", err);
    res.status(500).json({ success: false, error: "Failed to update publish status" });
  }
});

// Increment view count (public endpoint)
router.patch("/:id/view", async (req, res) => {
  try {
    await pool.query(
      "UPDATE news SET views = views + 1 WHERE id = ? AND is_published = 1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Increment view error:", err);
    res.status(500).json({ success: false, error: "Failed to update views" });
  }
});

// Get published news for public display
router.get("/public", async (req, res) => {
  try {
    const [news] = await pool.query(
      `SELECT 
        id, title, slug, excerpt, featured_image, category, 
        author, views, published_at
       FROM news 
       WHERE is_published = 1
       ORDER BY published_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: news });
  } catch (err) {
    console.error("Get public news error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch news" });
  }
});

// Get single published news by slug
router.get("/public/:slug", async (req, res) => {
  try {
    const [news] = await pool.query(
      "SELECT * FROM news WHERE slug = ? AND is_published = 1",
      [req.params.slug]
    );
    if (news.length === 0) {
      return res.status(404).json({ success: false, error: "News article not found" });
    }
    res.json({ success: true, data: news[0] });
  } catch (err) {
    console.error("Get public news article error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch news article" });
  }
});

module.exports = router;