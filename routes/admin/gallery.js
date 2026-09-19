// routes/admin/gallery.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/gallery");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `gallery-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

// Helper: delete a file under /uploads/gallery given its stored image_url
const deleteGalleryImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete gallery image:", err);
    }
  });
};

// Helper: normalize booleans/numbers coming from multipart form-data
const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};
const toIntOrNull = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
};

// Multer wrapper for single-file endpoints
const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// Multer wrapper for bulk uploads (up to 20 files per request)
const handleBulkUpload = (req, res, next) => {
  upload.array("images", 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ===================== CATEGORY ROUTES =====================

// Get all gallery categories
router.get("/categories", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [categories] = await pool.query(
      `SELECT * FROM gallery_categories ORDER BY display_order ASC, name ASC`
    );
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

// Get single category
router.get("/categories/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [categories] = await pool.query(
      "SELECT * FROM gallery_categories WHERE id = ?",
      [req.params.id]
    );
    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }
    res.json({ success: true, data: categories[0] });
  } catch (err) {
    console.error("Get category error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch category" });
  }
});

// Create category
router.post("/categories", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { name, slug, display_order, is_active } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: "Name and slug are required",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO gallery_categories (name, slug, display_order, is_active)
       VALUES (?, ?, ?, ?)`,
      [
        name,
        slug,
        toIntOrNull(display_order) || 0,
        toBool(is_active, true) ? 1 : 0,
      ]
    );

    res.json({
      success: true,
      message: "Category created successfully",
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ success: false, error: "Failed to create category" });
  }
});

// Update category
router.put("/categories/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { name, slug, display_order, is_active } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: "Name and slug are required",
      });
    }

    await pool.query(
      `UPDATE gallery_categories SET
        name = ?,
        slug = ?,
        display_order = ?,
        is_active = ?
      WHERE id = ?`,
      [
        name,
        slug,
        toIntOrNull(display_order) || 0,
        toBool(is_active, true) ? 1 : 0,
        req.params.id,
      ]
    );

    res.json({ success: true, message: "Category updated successfully" });
  } catch (err) {
    console.error("Update category error:", err);
    res.status(500).json({ success: false, error: "Failed to update category" });
  }
});

// Delete category (also deletes associated images)
router.delete("/categories/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [images] = await pool.query(
      "SELECT image_url FROM gallery_images WHERE category_id = ?",
      [req.params.id]
    );

    images.forEach((img) => {
      if (img.image_url) deleteGalleryImage(img.image_url);
    });

    await pool.query("DELETE FROM gallery_images WHERE category_id = ?", [req.params.id]);
    await pool.query("DELETE FROM gallery_categories WHERE id = ?", [req.params.id]);

    res.json({ success: true, message: "Category and associated images deleted successfully" });
  } catch (err) {
    console.error("Delete category error:", err);
    res.status(500).json({ success: false, error: "Failed to delete category" });
  }
});

// Toggle category status
router.patch("/categories/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query(
      "UPDATE gallery_categories SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle category status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ===================== IMAGE ROUTES =====================

// Get all gallery images (with category name)
router.get("/images", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [images] = await pool.query(
      `SELECT gi.*, gc.name AS category_name
       FROM gallery_images gi
       LEFT JOIN gallery_categories gc ON gi.category_id = gc.id
       ORDER BY gi.display_order ASC, gi.created_at DESC`
    );
    res.json({ success: true, data: images });
  } catch (err) {
    console.error("Get images error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch images" });
  }
});

// Get images by category
router.get("/images/category/:categoryId", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [images] = await pool.query(
      `SELECT gi.*, gc.name AS category_name
       FROM gallery_images gi
       LEFT JOIN gallery_categories gc ON gi.category_id = gc.id
       WHERE gi.category_id = ?
       ORDER BY gi.display_order ASC, gi.created_at DESC`,
      [req.params.categoryId]
    );
    res.json({ success: true, data: images });
  } catch (err) {
    console.error("Get images by category error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch images" });
  }
});

// Get single image
router.get("/images/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [images] = await pool.query(
      `SELECT gi.*, gc.name AS category_name
       FROM gallery_images gi
       LEFT JOIN gallery_categories gc ON gi.category_id = gc.id
       WHERE gi.id = ?`,
      [req.params.id]
    );
    if (images.length === 0) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }
    res.json({ success: true, data: images[0] });
  } catch (err) {
    console.error("Get image error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch image" });
  }
});

// Create single image
router.post("/images", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      category_id,
      title,
      caption,
      is_featured,
      display_order,
      is_active,
    } = req.body;

    if (!category_id || !title) {
      if (req.file) deleteGalleryImage(`/uploads/gallery/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Category and title are required",
      });
    }

    const image_url = req.file ? `/uploads/gallery/${req.file.filename}` : null;

    if (!image_url) {
      return res.status(400).json({
        success: false,
        error: "Image file is required",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO gallery_images (
        category_id, title, image_url, caption,
        is_featured, display_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        toIntOrNull(category_id),
        title,
        image_url,
        caption || null,
        toBool(is_featured, false) ? 1 : 0,
        toIntOrNull(display_order) || 0,
        toBool(is_active, true) ? 1 : 0,
      ]
    );

    res.json({
      success: true,
      message: "Image added successfully",
      data: { id: result.insertId, image_url },
    });
  } catch (err) {
    if (req.file) deleteGalleryImage(`/uploads/gallery/${req.file.filename}`);
    console.error("Create image error:", err);
    res.status(500).json({ success: false, error: "Failed to add image" });
  }
});

// ===================== BULK IMAGE UPLOAD =====================
// POST /api/admin/gallery/images/bulk
// Multipart fields:
//   category_id      (required)
//   is_active        ("true"/"false", default true)
//   is_featured      ("true"/"false", default false)  — applied to all
//   display_order    (start index, default 0)          — auto-incremented per file
//   titles[]         (optional, parallel array to files)
//   captions[]       (optional, parallel array to files)
//   images           (files, up to 20)
router.post(
  "/images/bulk",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  handleBulkUpload,
  async (req, res) => {
    const files = req.files || [];

    const rollbackFiles = () => {
      files.forEach((f) => deleteGalleryImage(`/uploads/gallery/${f.filename}`));
    };

    try {
      const { category_id, is_active, is_featured, display_order } = req.body;

      if (!category_id) {
        rollbackFiles();
        return res.status(400).json({
          success: false,
          error: "category_id is required",
        });
      }

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No image files were uploaded",
        });
      }

      const [catRows] = await pool.query(
        "SELECT id FROM gallery_categories WHERE id = ?",
        [toIntOrNull(category_id)]
      );
      if (catRows.length === 0) {
        rollbackFiles();
        return res.status(400).json({
          success: false,
          error: "Category not found",
        });
      }

      const toStringArray = (val) => {
        if (val === undefined || val === null) return [];
        if (Array.isArray(val)) return val;
        return [val];
      };

      const titles = toStringArray(req.body["titles[]"] ?? req.body.titles);
      const captions = toStringArray(req.body["captions[]"] ?? req.body.captions);

      const baseOrder = toIntOrNull(display_order) || 0;
      const activeFlag = toBool(is_active, true) ? 1 : 0;
      const featuredFlag = toBool(is_featured, false) ? 1 : 0;

      const created = [];
      const failed = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imageUrl = `/uploads/gallery/${file.filename}`;
        const originalName = file.originalname || "";
        const titleFromFile = originalName
          ? path.parse(originalName).name
          : `Image ${i + 1}`;

        const title = (titles[i] && String(titles[i]).trim()) || titleFromFile;
        const caption = captions[i] ? String(captions[i]).trim() || null : null;

        try {
          const [result] = await pool.query(
            `INSERT INTO gallery_images (
              category_id, title, image_url, caption,
              is_featured, display_order, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              toIntOrNull(category_id),
              title,
              imageUrl,
              caption,
              featuredFlag,
              baseOrder + i,
              activeFlag,
            ]
          );

          created.push({
            id: result.insertId,
            title,
            caption,
            image_url: imageUrl,
            display_order: baseOrder + i,
          });
        } catch (rowErr) {
          console.error("Bulk insert row failed:", rowErr);
          deleteGalleryImage(imageUrl);
          failed.push({
            file: originalName || file.filename,
            error: "Failed to save image record",
          });
        }
      }

      res.json({
        success: true,
        message: `${created.length} image${created.length === 1 ? "" : "s"} uploaded successfully`,
        data: {
          created,
          failed,
          total_uploaded: created.length,
          total_failed: failed.length,
        },
      });
    } catch (err) {
      rollbackFiles();
      console.error("Bulk image upload error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to upload images",
      });
    }
  }
);

// Update image
router.put("/images/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      category_id,
      title,
      caption,
      is_featured,
      display_order,
      is_active,
      remove_image,
    } = req.body;

    if (!category_id || !title) {
      if (req.file) deleteGalleryImage(`/uploads/gallery/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Category and title are required",
      });
    }

    const [existingRows] = await pool.query(
      "SELECT image_url FROM gallery_images WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.file) deleteGalleryImage(`/uploads/gallery/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "Image not found" });
    }
    const existingImage = existingRows[0].image_url;

    let image_url = existingImage;
    if (req.file) {
      image_url = `/uploads/gallery/${req.file.filename}`;
      if (existingImage) deleteGalleryImage(existingImage);
    } else if (toBool(remove_image, false)) {
      image_url = null;
      if (existingImage) deleteGalleryImage(existingImage);
    }

    await pool.query(
      `UPDATE gallery_images SET
        category_id = ?,
        title = ?,
        image_url = ?,
        caption = ?,
        is_featured = ?,
        display_order = ?,
        is_active = ?
      WHERE id = ?`,
      [
        toIntOrNull(category_id),
        title,
        image_url,
        caption || null,
        toBool(is_featured, false) ? 1 : 0,
        toIntOrNull(display_order) || 0,
        toBool(is_active, true) ? 1 : 0,
        req.params.id,
      ]
    );

    res.json({ success: true, message: "Image updated successfully", data: { image_url } });
  } catch (err) {
    if (req.file) deleteGalleryImage(`/uploads/gallery/${req.file.filename}`);
    console.error("Update image error:", err);
    res.status(500).json({ success: false, error: "Failed to update image" });
  }
});

// Delete image
router.delete("/images/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT image_url FROM gallery_images WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }
    await pool.query("DELETE FROM gallery_images WHERE id = ?", [req.params.id]);
    if (rows[0].image_url) deleteGalleryImage(rows[0].image_url);
    res.json({ success: true, message: "Image deleted successfully" });
  } catch (err) {
    console.error("Delete image error:", err);
    res.status(500).json({ success: false, error: "Failed to delete image" });
  }
});

// Toggle image status
router.patch("/images/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query(
      "UPDATE gallery_images SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle image status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

module.exports = router;