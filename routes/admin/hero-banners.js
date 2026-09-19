// routes/admin/hero-banners.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/hero-banners");
const uploadDirThumbnails = path.join(__dirname, "../../uploads/hero-banners/thumbnails");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(uploadDirThumbnails)) fs.mkdirSync(uploadDirThumbnails, { recursive: true });

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100MB

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      cb(null, uploadDirThumbnails);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "thumbnail" ? "thumb" : "banner";
    const unique = `hero-${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

// FIX: Previously this allowed container formats (avi, mkv, flv, wmv, mpg,
// mpeg, 3gp, 3g2, ogg/ogv) that most/all browsers cannot decode in a native
// <video> element. Uploading one of those didn't error, but it also never
// rendered a frame in the browser — it just showed as a black box, while
// images worked fine. Restricting to formats browsers can actually play
// fixes that at the source. Keep this list in sync with the frontend's
// VIDEO_EXTENSIONS array in HeroBanners.jsx.
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v)$/i;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|svg)$/i;
const THUMBNAIL_EXT_REGEX = /\.(jpe?g|png|webp|gif)$/i;

// Belt-and-suspenders: also accept by MIME type in case the browser sends a
// file with a slightly unusual extension but a correct, playable MIME type.
const VIDEO_MIME_WHITELIST = [
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
  "video/x-m4v",
];

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "video") {
    const extOk = VIDEO_EXT_REGEX.test(path.extname(file.originalname));
    const mimeOk = VIDEO_MIME_WHITELIST.includes((file.mimetype || "").toLowerCase());
    if (extOk || mimeOk) {
      return cb(null, true);
    }
    return cb(
      new Error(
        "Unsupported video format. For playback to work in all browsers, please upload MP4 (H.264), WebM, or MOV/M4V."
      )
    );
  }

  if (file.fieldname === "thumbnail") {
    if (THUMBNAIL_EXT_REGEX.test(path.extname(file.originalname))) {
      return cb(null, true);
    }
    return cb(new Error("Only JPG, PNG, WEBP, or GIF images are allowed for thumbnails"));
  }

  // fieldname === "image"
  if (IMAGE_EXT_REGEX.test(path.extname(file.originalname))) {
    return cb(null, true);
  }
  return cb(new Error("Only JPG, PNG, WEBP, GIF, or SVG images are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: VIDEO_MAX_BYTES }, // ceiling; per-field limits enforced below
});

// Helper: delete a file (checks both directories)
const deleteHeroFile = (fileUrl) => {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl);
  const filePath = path.join(uploadDir, filename);
  const filePathThumb = path.join(uploadDirThumbnails, filename);

  // FIX: this used to only try deleting from the thumbnails dir if the
  // banners-dir delete failed with a *non*-ENOENT error, which meant a
  // thumbnail file could be silently left on disk (or an actual delete
  // failure could go unlogged) depending on which directory the file
  // lived in. Now we just try both independently.
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete hero file:", err);
    }
  });
  fs.unlink(filePathThumb, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete hero thumbnail file:", err);
    }
  });
};

const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === true;
};

const toIntOrNull = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
};

const cleanupUploaded = (req) => {
  if (req.files?.image) deleteHeroFile(`/uploads/hero-banners/${req.files.image[0].filename}`);
  if (req.files?.video) deleteHeroFile(`/uploads/hero-banners/${req.files.video[0].filename}`);
  if (req.files?.thumbnail) deleteHeroFile(`/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`);
};

// Multer error wrapper
const handleUpload = (req, res, next) => {
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// Per-field size enforcement (multer's `limits.fileSize` is global, so we check per field here)
const validateFileSizes = (req, res, next) => {
  const errors = [];
  if (req.files?.image && req.files.image[0].size > IMAGE_MAX_BYTES) {
    errors.push("Image must be under 10MB");
  }
  if (req.files?.thumbnail && req.files.thumbnail[0].size > IMAGE_MAX_BYTES) {
    errors.push("Thumbnail must be under 10MB");
  }
  if (req.files?.video && req.files.video[0].size > VIDEO_MAX_BYTES) {
    errors.push("Video must be under 100MB");
  }
  if (errors.length) {
    cleanupUploaded(req);
    return res.status(400).json({ success: false, error: errors.join(", ") });
  }
  next();
};

// ===================== BANNER ROUTES =====================

router.get("/", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [banners] = await pool.query(
      `SELECT * FROM hero_banners ORDER BY display_order ASC, created_at DESC`
    );
    res.json({ success: true, data: banners });
  } catch (err) {
    console.error("Get banners error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch banners" });
  }
});

router.get("/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [banners] = await pool.query("SELECT * FROM hero_banners WHERE id = ?", [req.params.id]);
    if (banners.length === 0) {
      return res.status(404).json({ success: false, error: "Banner not found" });
    }
    res.json({ success: true, data: banners[0] });
  } catch (err) {
    console.error("Get banner error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch banner" });
  }
});

// Create banner
router.post(
  "/",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  handleUpload,
  validateFileSizes,
  async (req, res) => {
    try {
      const {
        title,
        subtitle,
        description,
        media_type,
        button_text,
        button_link,
        display_order,
        is_active,
      } = req.body;

      if (!title) {
        cleanupUploaded(req);
        return res.status(400).json({ success: false, error: "Title is required" });
      }

      const mediaType = media_type === "video" ? "video" : "image";
      let image_url = null;
      let video_url = null;
      let video_thumbnail = null;

      if (req.files?.image?.length) {
        image_url = `/uploads/hero-banners/${req.files.image[0].filename}`;
      }
      if (req.files?.video?.length) {
        video_url = `/uploads/hero-banners/${req.files.video[0].filename}`;
      }
      if (req.files?.thumbnail?.length) {
        video_thumbnail = `/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`;
      }

      if (mediaType === "video" && !video_url && req.body.video_url) {
        video_url = req.body.video_url;
      }
      if (mediaType === "image" && !image_url && req.body.image_url) {
        image_url = req.body.image_url;
      }

      if (mediaType === "image" && !image_url) {
        if (req.files?.video) deleteHeroFile(`/uploads/hero-banners/${req.files.video[0].filename}`);
        if (req.files?.thumbnail) deleteHeroFile(`/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`);
        return res.status(400).json({ success: false, error: "Image is required for image type banners" });
      }

      if (mediaType === "video" && !video_url) {
        if (req.files?.image) deleteHeroFile(`/uploads/hero-banners/${req.files.image[0].filename}`);
        if (req.files?.thumbnail) deleteHeroFile(`/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`);
        return res.status(400).json({ success: false, error: "Video is required for video type banners" });
      }

      // A banner is one type or the other — don't persist the media that doesn't apply
      if (mediaType === "image") {
        video_url = null;
        video_thumbnail = null;
      } else {
        image_url = null;
      }

      const [result] = await pool.query(
        `INSERT INTO hero_banners (
          title, subtitle, description, media_type,
          image_url, video_url, video_thumbnail,
          button_text, button_link, display_order, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          subtitle || null,
          description || null,
          mediaType,
          image_url,
          video_url,
          video_thumbnail,
          button_text || null,
          button_link || null,
          toIntOrNull(display_order) || 0,
          toBool(is_active, true) ? 1 : 0,
        ]
      );

      res.json({
        success: true,
        message: "Banner created successfully",
        data: { id: result.insertId, media_type: mediaType, image_url, video_url, video_thumbnail },
      });
    } catch (err) {
      cleanupUploaded(req);
      console.error("Create banner error:", err);
      res.status(500).json({ success: false, error: "Failed to create banner" });
    }
  }
);

// Update banner
router.put(
  "/:id",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  handleUpload,
  validateFileSizes,
  async (req, res) => {
    try {
      const {
        title,
        subtitle,
        description,
        media_type,
        button_text,
        button_link,
        display_order,
        is_active,
        remove_image,
        remove_video,
        remove_thumbnail,
      } = req.body;

      if (!title) {
        cleanupUploaded(req);
        return res.status(400).json({ success: false, error: "Title is required" });
      }

      const [existingRows] = await pool.query("SELECT * FROM hero_banners WHERE id = ?", [req.params.id]);
      if (existingRows.length === 0) {
        cleanupUploaded(req);
        return res.status(404).json({ success: false, error: "Banner not found" });
      }

      const existing = existingRows[0];
      const mediaType = media_type === "video" ? "video" : media_type === "image" ? "image" : existing.media_type || "image";

      let image_url = existing.image_url;
      let video_url = existing.video_url;
      let video_thumbnail = existing.video_thumbnail;

      if (toBool(remove_image, false)) {
        if (existing.image_url) deleteHeroFile(existing.image_url);
        image_url = null;
      }
      if (toBool(remove_video, false)) {
        if (existing.video_url) deleteHeroFile(existing.video_url);
        video_url = null;
      }
      if (toBool(remove_thumbnail, false)) {
        if (existing.video_thumbnail) deleteHeroFile(existing.video_thumbnail);
        video_thumbnail = null;
      }

      if (req.files?.image?.length) {
        if (existing.image_url) deleteHeroFile(existing.image_url);
        image_url = `/uploads/hero-banners/${req.files.image[0].filename}`;
      }
      if (req.files?.video?.length) {
        if (existing.video_url) deleteHeroFile(existing.video_url);
        video_url = `/uploads/hero-banners/${req.files.video[0].filename}`;
      }
      if (req.files?.thumbnail?.length) {
        if (existing.video_thumbnail) deleteHeroFile(existing.video_thumbnail);
        video_thumbnail = `/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`;
      }

      if (mediaType === "video" && !video_url && req.body.video_url) {
        video_url = req.body.video_url;
      }
      if (mediaType === "image" && !image_url && req.body.image_url) {
        image_url = req.body.image_url;
      }

      if (mediaType === "image" && !image_url) {
        if (req.files?.video) deleteHeroFile(`/uploads/hero-banners/${req.files.video[0].filename}`);
        if (req.files?.thumbnail) deleteHeroFile(`/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`);
        return res.status(400).json({ success: false, error: "Image is required for image type banners" });
      }

      if (mediaType === "video" && !video_url) {
        if (req.files?.image) deleteHeroFile(`/uploads/hero-banners/${req.files.image[0].filename}`);
        if (req.files?.thumbnail) deleteHeroFile(`/uploads/hero-banners/thumbnails/${req.files.thumbnail[0].filename}`);
        return res.status(400).json({ success: false, error: "Video is required for video type banners" });
      }

      // Switching type: clean up whatever no longer applies, even if the
      // client didn't send an explicit remove_* flag for it
      if (mediaType === "image") {
        if (video_url) deleteHeroFile(video_url);
        if (video_thumbnail) deleteHeroFile(video_thumbnail);
        video_url = null;
        video_thumbnail = null;
      } else {
        if (image_url) deleteHeroFile(image_url);
        image_url = null;
      }

      await pool.query(
        `UPDATE hero_banners SET
          title = ?, subtitle = ?, description = ?, media_type = ?,
          image_url = ?, video_url = ?, video_thumbnail = ?,
          button_text = ?, button_link = ?, display_order = ?, is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          title,
          subtitle || null,
          description || null,
          mediaType,
          image_url,
          video_url,
          video_thumbnail,
          button_text || null,
          button_link || null,
          toIntOrNull(display_order) || 0,
          toBool(is_active, true) ? 1 : 0,
          req.params.id,
        ]
      );

      res.json({
        success: true,
        message: "Banner updated successfully",
        data: { media_type: mediaType, image_url, video_url, video_thumbnail },
      });
    } catch (err) {
      cleanupUploaded(req);
      console.error("Update banner error:", err);
      res.status(500).json({ success: false, error: "Failed to update banner" });
    }
  }
);

router.delete("/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT image_url, video_url, video_thumbnail FROM hero_banners WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Banner not found" });
    }

    if (rows[0].image_url) deleteHeroFile(rows[0].image_url);
    if (rows[0].video_url) deleteHeroFile(rows[0].video_url);
    if (rows[0].video_thumbnail) deleteHeroFile(rows[0].video_thumbnail);

    await pool.query("DELETE FROM hero_banners WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    console.error("Delete banner error:", err);
    res.status(500).json({ success: false, error: "Failed to delete banner" });
  }
});

router.patch("/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query("UPDATE hero_banners SET is_active = ? WHERE id = ?", [is_active ? 1 : 0, req.params.id]);
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

router.put("/reorder", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { orders } = req.body;
    for (const item of orders) {
      await pool.query("UPDATE hero_banners SET display_order = ? WHERE id = ?", [item.display_order, item.id]);
    }
    res.json({ success: true, message: "Banners reordered successfully" });
  } catch (err) {
    console.error("Reorder banners error:", err);
    res.status(500).json({ success: false, error: "Failed to reorder banners" });
  }
});

module.exports = router;