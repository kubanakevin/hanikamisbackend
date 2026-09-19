// routes/admin/events.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config ----
const uploadDir = path.join(__dirname, "../../uploads/events");
const uploadDirImages = path.join(__dirname, "../../uploads/events/images");

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(uploadDirImages)) {
  fs.mkdirSync(uploadDirImages, { recursive: true });
}

// Storage for featured image
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "featured_image") {
      cb(null, uploadDir);
    } else if (file.fieldname === "images") {
      cb(null, uploadDirImages);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "featured_image" ? "featured" : "image";
    const unique = `event-${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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
const deleteEventFile = (fileUrl) => {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl);
  // Check both directories
  const filePath = path.join(uploadDir, filename);
  const filePathImages = path.join(uploadDirImages, filename);
  
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      // Try the images directory
      fs.unlink(filePathImages, (err2) => {
        if (err2 && err2.code !== "ENOENT") {
          console.error("Failed to delete event file:", err2);
        }
      });
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
  upload.fields([
    { name: "featured_image", maxCount: 1 },
    { name: "images", maxCount: 10 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ===================== EVENT ROUTES =====================

// Get all events
router.get("/", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [events] = await pool.query(
      `SELECT e.*, 
        (SELECT COUNT(*) FROM event_images WHERE event_id = e.id AND is_active = 1) as image_count
       FROM events e
       ORDER BY e.event_date DESC, e.created_at DESC`
    );
    res.json({ success: true, data: events });
  } catch (err) {
    console.error("Get events error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
});

// Get single event with its images
router.get("/:id", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [events] = await pool.query(
      `SELECT * FROM events WHERE id = ?`,
      [req.params.id]
    );
    if (events.length === 0) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    // Get event images
    const [images] = await pool.query(
      `SELECT * FROM event_images WHERE event_id = ? AND is_active = 1 ORDER BY display_order ASC, created_at ASC`,
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: {
        ...events[0],
        images
      }
    });
  } catch (err) {
    console.error("Get event error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch event" });
  }
});

// Create event
router.post("/", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      slug,
      description,
      event_date,
      end_date,
      start_time,
      end_time,
      location,
      category,
      is_featured,
      is_active,
    } = req.body;

    if (!title || !slug || !event_date) {
      // Clean up uploaded files
      if (req.files?.featured_image) {
        deleteEventFile(`/uploads/events/${req.files.featured_image[0].filename}`);
      }
      if (req.files?.images) {
        req.files.images.forEach(img => deleteEventFile(`/uploads/events/images/${img.filename}`));
      }
      return res.status(400).json({
        success: false,
        error: "Title, slug, and event date are required",
      });
    }

    const featured_image = req.files?.featured_image 
      ? `/uploads/events/${req.files.featured_image[0].filename}` 
      : null;

    const [result] = await pool.query(
      `INSERT INTO events (
        title, slug, description, event_date, end_date,
        start_time, end_time, location, featured_image,
        category, is_featured, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        slug,
        description || null,
        event_date,
        end_date || null,
        start_time || null,
        end_time || null,
        location || null,
        featured_image,
        category || null,
        toBool(is_featured, false) ? 1 : 0,
        toBool(is_active, true) ? 1 : 0,
      ]
    );

    const eventId = result.insertId;

    // Insert additional images
    const imageUrls = [];
    if (req.files?.images) {
      for (let i = 0; i < req.files.images.length; i++) {
        const img = req.files.images[i];
        const imageUrl = `/uploads/events/images/${img.filename}`;
        imageUrls.push(imageUrl);
        await pool.query(
          `INSERT INTO event_images (event_id, image_url, display_order) VALUES (?, ?, ?)`,
          [eventId, imageUrl, i]
        );
      }
    }

    res.json({
      success: true,
      message: "Event created successfully",
      data: { id: eventId, featured_image, images: imageUrls },
    });
  } catch (err) {
    // Clean up uploaded files on error
    if (req.files?.featured_image) {
      deleteEventFile(`/uploads/events/${req.files.featured_image[0].filename}`);
    }
    if (req.files?.images) {
      req.files.images.forEach(img => deleteEventFile(`/uploads/events/images/${img.filename}`));
    }
    console.error("Create event error:", err);
    res.status(500).json({ success: false, error: "Failed to create event" });
  }
});

// Update event
router.put("/:id", requireAuth, requireRole("super_manager", "department_manager"), handleUpload, async (req, res) => {
  try {
    const {
      title,
      slug,
      description,
      event_date,
      end_date,
      start_time,
      end_time,
      location,
      category,
      is_featured,
      is_active,
      remove_featured_image,
      remove_images,
    } = req.body;

    if (!title || !slug || !event_date) {
      // Clean up uploaded files
      if (req.files?.featured_image) {
        deleteEventFile(`/uploads/events/${req.files.featured_image[0].filename}`);
      }
      if (req.files?.images) {
        req.files.images.forEach(img => deleteEventFile(`/uploads/events/images/${img.filename}`));
      }
      return res.status(400).json({
        success: false,
        error: "Title, slug, and event date are required",
      });
    }

    // Get existing event
    const [existingRows] = await pool.query(
      "SELECT featured_image FROM events WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.files?.featured_image) {
        deleteEventFile(`/uploads/events/${req.files.featured_image[0].filename}`);
      }
      if (req.files?.images) {
        req.files.images.forEach(img => deleteEventFile(`/uploads/events/images/${img.filename}`));
      }
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    const existingFeaturedImage = existingRows[0].featured_image;

    // Handle featured image
    let featured_image = existingFeaturedImage;
    if (req.files?.featured_image) {
      featured_image = `/uploads/events/${req.files.featured_image[0].filename}`;
      if (existingFeaturedImage) deleteEventFile(existingFeaturedImage);
    } else if (toBool(remove_featured_image, false)) {
      featured_image = null;
      if (existingFeaturedImage) deleteEventFile(existingFeaturedImage);
    }

    // Update event
    await pool.query(
      `UPDATE events SET
        title = ?,
        slug = ?,
        description = ?,
        event_date = ?,
        end_date = ?,
        start_time = ?,
        end_time = ?,
        location = ?,
        featured_image = ?,
        category = ?,
        is_featured = ?,
        is_active = ?
      WHERE id = ?`,
      [
        title,
        slug,
        description || null,
        event_date,
        end_date || null,
        start_time || null,
        end_time || null,
        location || null,
        featured_image,
        category || null,
        toBool(is_featured, false) ? 1 : 0,
        toBool(is_active, true) ? 1 : 0,
        req.params.id,
      ]
    );

    // Handle image removal
    if (remove_images) {
      const removeIds = remove_images.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      for (const id of removeIds) {
        const [imgRows] = await pool.query(
          "SELECT image_url FROM event_images WHERE id = ? AND event_id = ?",
          [id, req.params.id]
        );
        if (imgRows.length > 0) {
          deleteEventFile(imgRows[0].image_url);
          await pool.query("DELETE FROM event_images WHERE id = ?", [id]);
        }
      }
    }

    // Add new images
    const imageUrls = [];
    if (req.files?.images) {
      for (let i = 0; i < req.files.images.length; i++) {
        const img = req.files.images[i];
        const imageUrl = `/uploads/events/images/${img.filename}`;
        imageUrls.push(imageUrl);
        await pool.query(
          `INSERT INTO event_images (event_id, image_url, display_order) VALUES (?, ?, ?)`,
          [req.params.id, imageUrl, i]
        );
      }
    }

    res.json({ 
      success: true, 
      message: "Event updated successfully",
      data: { featured_image, images: imageUrls }
    });
  } catch (err) {
    // Clean up uploaded files on error
    if (req.files?.featured_image) {
      deleteEventFile(`/uploads/events/${req.files.featured_image[0].filename}`);
    }
    if (req.files?.images) {
      req.files.images.forEach(img => deleteEventFile(`/uploads/events/images/${img.filename}`));
    }
    console.error("Update event error:", err);
    res.status(500).json({ success: false, error: "Failed to update event" });
  }
});

// Delete event
router.delete("/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    // Get all files to delete
    const [event] = await pool.query(
      "SELECT featured_image FROM events WHERE id = ?",
      [req.params.id]
    );
    if (event.length === 0) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    // Get event images
    const [images] = await pool.query(
      "SELECT image_url FROM event_images WHERE event_id = ?",
      [req.params.id]
    );

    // Delete files
    if (event[0].featured_image) deleteEventFile(event[0].featured_image);
    images.forEach(img => {
      if (img.image_url) deleteEventFile(img.image_url);
    });

    // Delete from database (cascade will delete images)
    await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);

    res.json({ success: true, message: "Event deleted successfully" });
  } catch (err) {
    console.error("Delete event error:", err);
    res.status(500).json({ success: false, error: "Failed to delete event" });
  }
});

// Toggle event status
router.patch("/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query(
      "UPDATE events SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ===================== EVENT IMAGE ROUTES =====================

// Get all images for an event
router.get("/:eventId/images", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const [images] = await pool.query(
      `SELECT * FROM event_images WHERE event_id = ? ORDER BY display_order ASC, created_at ASC`,
      [req.params.eventId]
    );
    res.json({ success: true, data: images });
  } catch (err) {
    console.error("Get event images error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch images" });
  }
});

// Add image to event
router.post("/:eventId/images", requireAuth, requireRole("super_manager", "department_manager"), 
  upload.single("image"), async (req, res) => {
    try {
      const { caption, display_order } = req.body;
      const eventId = req.params.eventId;

      if (!req.file) {
        return res.status(400).json({ success: false, error: "Image file is required" });
      }

      const image_url = `/uploads/events/images/${req.file.filename}`;

      const [result] = await pool.query(
        `INSERT INTO event_images (event_id, image_url, caption, display_order)
         VALUES (?, ?, ?, ?)`,
        [eventId, image_url, caption || null, toIntOrNull(display_order) || 0]
      );

      res.json({
        success: true,
        message: "Image added successfully",
        data: { id: result.insertId, image_url },
      });
    } catch (err) {
      if (req.file) deleteEventFile(`/uploads/events/images/${req.file.filename}`);
      console.error("Add event image error:", err);
      res.status(500).json({ success: false, error: "Failed to add image" });
    }
  }
);

// Delete event image
router.delete("/images/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT image_url FROM event_images WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }
    
    await pool.query("DELETE FROM event_images WHERE id = ?", [req.params.id]);
    if (rows[0].image_url) deleteEventFile(rows[0].image_url);
    
    res.json({ success: true, message: "Image deleted successfully" });
  } catch (err) {
    console.error("Delete event image error:", err);
    res.status(500).json({ success: false, error: "Failed to delete image" });
  }
});

// Reorder event images
router.put("/images/reorder", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { orders } = req.body; // [{id: 1, display_order: 0}, ...]
    
    for (const item of orders) {
      await pool.query(
        "UPDATE event_images SET display_order = ? WHERE id = ?",
        [item.display_order, item.id]
      );
    }
    
    res.json({ success: true, message: "Images reordered successfully" });
  } catch (err) {
    console.error("Reorder images error:", err);
    res.status(500).json({ success: false, error: "Failed to reorder images" });
  }
});

// Toggle image status
router.patch("/images/:id/toggle-status", requireAuth, requireRole("super_manager", "department_manager"), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query(
      "UPDATE event_images SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: "Image status updated successfully" });
  } catch (err) {
    console.error("Toggle image status error:", err);
    res.status(500).json({ success: false, error: "Failed to update image status" });
  }
});

module.exports = router;