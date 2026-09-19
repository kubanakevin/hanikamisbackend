// routes/admin/aiKnowledge.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ---- Upload config (knowledge entries can carry an optional illustrative image) ----
const uploadDir = path.join(__dirname, "../../uploads/ai-knowledge");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `knowledge-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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

// Helper: delete a file under /uploads/ai-knowledge given its stored image_url
const deleteKnowledgeImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete knowledge image:", err);
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

// Multer error wrapper
const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

const ALLOWED_ROLES = ["super_manager", "department_manager"];

// ===================== KNOWLEDGE BASE ROUTES =====================

// Get distinct categories currently in use (for filters / suggestions)
router.get("/knowledge/categories", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS entry_count
       FROM ai_knowledge
       GROUP BY category
       ORDER BY category ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get knowledge categories error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

// Get all knowledge entries (optionally filtered by category or search text)
router.get("/knowledge", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = [];
    const params = [];

    if (category) {
      where.push("category = ?");
      params.push(category);
    }
    if (search) {
      where.push("(title LIKE ? OR content LIKE ? OR keywords LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [entries] = await pool.query(
      `SELECT id, category, title, content, keywords, image_url,
              is_active, display_order, created_at, updated_at
       FROM ai_knowledge
       ${whereClause}
       ORDER BY display_order ASC, updated_at DESC`,
      params
    );
    res.json({ success: true, data: entries });
  } catch (err) {
    console.error("Get knowledge entries error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch knowledge entries" });
  }
});

// Get single knowledge entry
router.get("/knowledge/:id", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM ai_knowledge WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Knowledge entry not found" });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get knowledge entry error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch knowledge entry" });
  }
});

// Create knowledge entry
router.post("/knowledge", requireAuth, requireRole(...ALLOWED_ROLES), handleUpload, async (req, res) => {
  try {
    const { category, title, content, keywords, display_order, is_active } = req.body;

    if (!category || !title || !content) {
      if (req.file) deleteKnowledgeImage(`/uploads/ai-knowledge/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Category, title, and content are required",
      });
    }

    const image_url = req.file ? `/uploads/ai-knowledge/${req.file.filename}` : null;

    const [result] = await pool.query(
      `INSERT INTO ai_knowledge (
        category, title, content, keywords, image_url,
        is_active, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category,
        title,
        content,
        keywords || null,
        image_url,
        toBool(is_active, true) ? 1 : 0,
        toIntOrNull(display_order) || 0,
      ]
    );

    res.json({
      success: true,
      message: "Knowledge entry created successfully",
      data: { id: result.insertId, image_url },
    });
  } catch (err) {
    if (req.file) deleteKnowledgeImage(`/uploads/ai-knowledge/${req.file.filename}`);
    console.error("Create knowledge entry error:", err);
    res.status(500).json({ success: false, error: "Failed to create knowledge entry" });
  }
});

// Update knowledge entry
router.put("/knowledge/:id", requireAuth, requireRole(...ALLOWED_ROLES), handleUpload, async (req, res) => {
  try {
    const { category, title, content, keywords, display_order, is_active, remove_image } = req.body;

    if (!category || !title || !content) {
      if (req.file) deleteKnowledgeImage(`/uploads/ai-knowledge/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        error: "Category, title, and content are required",
      });
    }

    const [existingRows] = await pool.query(
      "SELECT image_url FROM ai_knowledge WHERE id = ?",
      [req.params.id]
    );
    if (existingRows.length === 0) {
      if (req.file) deleteKnowledgeImage(`/uploads/ai-knowledge/${req.file.filename}`);
      return res.status(404).json({ success: false, error: "Knowledge entry not found" });
    }
    const existingImage = existingRows[0].image_url;

    let image_url = existingImage;
    if (req.file) {
      image_url = `/uploads/ai-knowledge/${req.file.filename}`;
      if (existingImage) deleteKnowledgeImage(existingImage);
    } else if (toBool(remove_image, false)) {
      image_url = null;
      if (existingImage) deleteKnowledgeImage(existingImage);
    }

    await pool.query(
      `UPDATE ai_knowledge SET
        category = ?,
        title = ?,
        content = ?,
        keywords = ?,
        image_url = ?,
        is_active = ?,
        display_order = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        category,
        title,
        content,
        keywords || null,
        image_url,
        toBool(is_active, true) ? 1 : 0,
        toIntOrNull(display_order) || 0,
        req.params.id,
      ]
    );

    res.json({ success: true, message: "Knowledge entry updated successfully", data: { image_url } });
  } catch (err) {
    if (req.file) deleteKnowledgeImage(`/uploads/ai-knowledge/${req.file.filename}`);
    console.error("Update knowledge entry error:", err);
    res.status(500).json({ success: false, error: "Failed to update knowledge entry" });
  }
});

// Delete knowledge entry
router.delete("/knowledge/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT image_url FROM ai_knowledge WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Knowledge entry not found" });
    }

    // Detach any messages that referenced this entry rather than blocking the delete
    await pool.query(
      "UPDATE ai_messages SET matched_knowledge_id = NULL WHERE matched_knowledge_id = ?",
      [req.params.id]
    );
    await pool.query("DELETE FROM ai_knowledge WHERE id = ?", [req.params.id]);

    if (rows[0].image_url) deleteKnowledgeImage(rows[0].image_url);
    res.json({ success: true, message: "Knowledge entry deleted successfully" });
  } catch (err) {
    console.error("Delete knowledge entry error:", err);
    res.status(500).json({ success: false, error: "Failed to delete knowledge entry" });
  }
});

// Toggle knowledge entry status
router.patch("/knowledge/:id/toggle-status", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query(
      "UPDATE ai_knowledge SET is_active = ?, updated_at = NOW() WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("Toggle knowledge status error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ===================== CONVERSATION ROUTES =====================

// Get all conversations (with message counts + a preview of the last message)
router.get("/conversations", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = [];
    const params = [];

    if (status) {
      where.push("c.status = ?");
      params.push(status);
    }
    if (search) {
      where.push("(c.session_id LIKE ? OR c.user_ip LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [conversations] = await pool.query(
      `SELECT c.id, c.session_id, c.user_ip, c.user_agent, c.status,
              c.started_at, c.ended_at,
              (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count,
              (SELECT m2.message FROM ai_messages m2
                WHERE m2.conversation_id = c.id
                ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
              (SELECT m3.created_at FROM ai_messages m3
                WHERE m3.conversation_id = c.id
                ORDER BY m3.created_at DESC LIMIT 1) AS last_message_at
       FROM ai_conversations c
       ${whereClause}
       ORDER BY c.started_at DESC`,
      params
    );
    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch conversations" });
  }
});

// Get a single conversation with its full message thread
router.get("/conversations/:id", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const [convRows] = await pool.query(
      "SELECT * FROM ai_conversations WHERE id = ?",
      [req.params.id]
    );
    if (convRows.length === 0) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    const [messages] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender, m.message, m.image_url,
              m.matched_knowledge_id, m.created_at,
              k.title AS matched_knowledge_title
       FROM ai_messages m
       LEFT JOIN ai_knowledge k ON m.matched_knowledge_id = k.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: { ...convRows[0], messages },
    });
  } catch (err) {
    console.error("Get conversation error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch conversation" });
  }
});

// Update conversation status (e.g. mark as closed/resolved)
router.patch("/conversations/:id/status", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["active", "closed", "resolved", "archived"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const endedAtClause = status === "active" ? "NULL" : "COALESCE(ended_at, NOW())";
    await pool.query(
      `UPDATE ai_conversations SET status = ?, ended_at = ${endedAtClause} WHERE id = ?`,
      [status, req.params.id]
    );

    res.json({ success: true, message: "Conversation status updated" });
  } catch (err) {
    console.error("Update conversation status error:", err);
    res.status(500).json({ success: false, error: "Failed to update conversation status" });
  }
});

// Delete a conversation (and its messages)
router.delete("/conversations/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id FROM ai_conversations WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    await pool.query("DELETE FROM ai_messages WHERE conversation_id = ?", [req.params.id]);
    await pool.query("DELETE FROM ai_conversations WHERE id = ?", [req.params.id]);

    res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (err) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ success: false, error: "Failed to delete conversation" });
  }
});

// Dashboard-style stats for the AI assistant (total conversations, messages, active now, top knowledge gaps)
router.get("/stats", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const [[stats]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM ai_conversations) AS total_conversations,
        (SELECT COUNT(*) FROM ai_conversations WHERE status = 'active') AS active_conversations,
        (SELECT COUNT(*) FROM ai_messages) AS total_messages,
        (SELECT COUNT(*) FROM ai_messages WHERE matched_knowledge_id IS NULL AND sender = 'user') AS unmatched_user_messages,
        (SELECT COUNT(*) FROM ai_knowledge WHERE is_active = 1) AS active_knowledge_entries`
    );
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error("Get AI stats error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch AI stats" });
  }
});

module.exports = router;