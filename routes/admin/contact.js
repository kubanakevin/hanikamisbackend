// routes/admin/contact.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

// ===================== CONTACT INFO =====================

// GET /api/admin/contact/info
router.get(
  "/info",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, address, phone_primary, phone_secondary,
                email_primary, email_secondary, office_hours,
                map_embed_url, latitude, longitude,
                facebook_url, twitter_url, instagram_url,
                linkedin_url, youtube_url, whatsapp_number,
                updated_at
         FROM contact_info
         ORDER BY updated_at DESC
         LIMIT 1`
      );
      res.json({ success: true, data: rows[0] || null });
    } catch (err) {
      console.error("Admin contact info fetch error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch contact info",
      });
    }
  }
);

// PUT /api/admin/contact/info
router.put(
  "/info",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const {
        address,
        phone_primary,
        phone_secondary,
        email_primary,
        email_secondary,
        office_hours,
        map_embed_url,
        latitude,
        longitude,
        facebook_url,
        twitter_url,
        instagram_url,
        linkedin_url,
        youtube_url,
        whatsapp_number,
      } = req.body || {};

      // Basic email sanity check (both optional)
      const emailOk = (v) =>
        !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

      if (!emailOk(email_primary) || !emailOk(email_secondary)) {
        return res.status(400).json({
          success: false,
          error: "One or more email addresses are invalid",
        });
      }

      const toNumOrNull = (v) => {
        if (v === undefined || v === null || v === "") return null;
        const n = parseFloat(v);
        return Number.isNaN(n) ? null : n;
      };
      const toStrOrNull = (v) =>
        v === undefined || v === null || String(v).trim() === ""
          ? null
          : String(v).trim();

      // Check if a row exists
      const [existing] = await pool.query(
        "SELECT id FROM contact_info ORDER BY updated_at DESC LIMIT 1"
      );

      const payload = [
        toStrOrNull(address),
        toStrOrNull(phone_primary),
        toStrOrNull(phone_secondary),
        toStrOrNull(email_primary),
        toStrOrNull(email_secondary),
        toStrOrNull(office_hours),
        toStrOrNull(map_embed_url),
        toNumOrNull(latitude),
        toNumOrNull(longitude),
        toStrOrNull(facebook_url),
        toStrOrNull(twitter_url),
        toStrOrNull(instagram_url),
        toStrOrNull(linkedin_url),
        toStrOrNull(youtube_url),
        toStrOrNull(whatsapp_number),
      ];

      if (existing.length === 0) {
        // Insert first row
        const [result] = await pool.query(
          `INSERT INTO contact_info
            (address, phone_primary, phone_secondary,
             email_primary, email_secondary, office_hours,
             map_embed_url, latitude, longitude,
             facebook_url, twitter_url, instagram_url,
             linkedin_url, youtube_url, whatsapp_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          payload
        );
        return res.json({
          success: true,
          message: "Contact info created successfully",
          data: { id: result.insertId },
        });
      }

      // Update existing
      await pool.query(
        `UPDATE contact_info SET
          address = ?,
          phone_primary = ?,
          phone_secondary = ?,
          email_primary = ?,
          email_secondary = ?,
          office_hours = ?,
          map_embed_url = ?,
          latitude = ?,
          longitude = ?,
          facebook_url = ?,
          twitter_url = ?,
          instagram_url = ?,
          linkedin_url = ?,
          youtube_url = ?,
          whatsapp_number = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [...payload, existing[0].id]
      );

      res.json({
        success: true,
        message: "Contact info updated successfully",
        data: { id: existing[0].id },
      });
    } catch (err) {
      console.error("Admin contact info update error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to save contact info",
      });
    }
  }
);

// ===================== MESSAGES =====================

// GET /api/admin/contact/messages?filter=all|unread|archived
router.get(
  "/messages",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const filter = (req.query.filter || "all").toString().toLowerCase();

      let whereSql = "";
      if (filter === "unread") {
        whereSql = "WHERE is_read = 0 AND is_archived = 0";
      } else if (filter === "archived") {
        whereSql = "WHERE is_archived = 1";
      } else {
        whereSql = "WHERE is_archived = 0";
      }

      const [rows] = await pool.query(
        `SELECT id, full_name, email, phone, subject, message,
                is_read, is_archived, created_at
         FROM contact_messages
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT 500`
      );

      // Counts for tabs
      const [[counts]] = await pool.query(
        `SELECT
           SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END) AS total,
           SUM(CASE WHEN is_archived = 0 AND is_read = 0 THEN 1 ELSE 0 END) AS unread,
           SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) AS archived
         FROM contact_messages`
      );

      res.json({
        success: true,
        data: rows,
        counts: {
          total: Number(counts.total) || 0,
          unread: Number(counts.unread) || 0,
          archived: Number(counts.archived) || 0,
        },
      });
    } catch (err) {
      console.error("Admin messages fetch error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch messages",
      });
    }
  }
);

// GET /api/admin/contact/messages/:id
router.get(
  "/messages/:id",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, full_name, email, phone, subject, message,
                is_read, is_archived, created_at
         FROM contact_messages
         WHERE id = ?
         LIMIT 1`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Message not found" });
      }
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Admin message fetch error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch message" });
    }
  }
);

// PATCH /api/admin/contact/messages/:id/read  { is_read: true }
router.patch(
  "/messages/:id/read",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const is_read = req.body?.is_read ? 1 : 0;
      await pool.query(
        "UPDATE contact_messages SET is_read = ? WHERE id = ?",
        [is_read, req.params.id]
      );
      res.json({ success: true, message: "Read status updated" });
    } catch (err) {
      console.error("Admin message read error:", err);
      res.status(500).json({ success: false, error: "Failed to update message" });
    }
  }
);

// PATCH /api/admin/contact/messages/:id/archive  { is_archived: true }
router.patch(
  "/messages/:id/archive",
  requireAuth,
  requireRole("super_manager", "department_manager"),
  async (req, res) => {
    try {
      const is_archived = req.body?.is_archived ? 1 : 0;
      await pool.query(
        "UPDATE contact_messages SET is_archived = ? WHERE id = ?",
        [is_archived, req.params.id]
      );
      res.json({ success: true, message: "Archive status updated" });
    } catch (err) {
      console.error("Admin message archive error:", err);
      res.status(500).json({ success: false, error: "Failed to update message" });
    }
  }
);

// DELETE /api/admin/contact/messages/:id
router.delete(
  "/messages/:id",
  requireAuth,
  requireRole("super_manager"),
  async (req, res) => {
    try {
      await pool.query("DELETE FROM contact_messages WHERE id = ?", [
        req.params.id,
      ]);
      res.json({ success: true, message: "Message deleted" });
    } catch (err) {
      console.error("Admin message delete error:", err);
      res.status(500).json({ success: false, error: "Failed to delete message" });
    }
  }
);

module.exports = router;