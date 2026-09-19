// routes/admin/whyChooseFeatures.js
const router = require("express").Router();
const pool = require("../../config/db");
const { requireAuth, requireRole } = require("../../middleware/auth");

const ALLOWED_ROLES = ["super_manager", "department_manager"];

// ===================== WHY CHOOSE FEATURES ROUTES =====================

// Get all features
router.get("/why-choose-features", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, icon, title, description, display_order, is_active, created_at, updated_at
             FROM why_choose_features
             ORDER BY display_order ASC, created_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Get why choose features error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch features" });
    }
});

// Get single feature
router.get("/why-choose-features/:id", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM why_choose_features WHERE id = ?",
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: "Feature not found" });
        }
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error("Get why choose feature error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch feature" });
    }
});

// Create feature
router.post("/why-choose-features", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const { icon, title, description, display_order, is_active } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: "Title and description are required",
            });
        }

        const [result] = await pool.query(
            `INSERT INTO why_choose_features (icon, title, description, display_order, is_active)
             VALUES (?, ?, ?, ?, ?)`,
            [
                icon || "fas fa-star",
                title,
                description,
                display_order || 0,
                is_active !== undefined ? (is_active ? 1 : 0) : 1,
            ]
        );

        res.json({
            success: true,
            message: "Feature created successfully",
            data: { id: result.insertId },
        });
    } catch (err) {
        console.error("Create why choose feature error:", err);
        res.status(500).json({ success: false, error: "Failed to create feature" });
    }
});

// Update feature
router.put("/why-choose-features/:id", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const { icon, title, description, display_order, is_active } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: "Title and description are required",
            });
        }

        const [existing] = await pool.query(
            "SELECT id FROM why_choose_features WHERE id = ?",
            [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: "Feature not found" });
        }

        await pool.query(
            `UPDATE why_choose_features SET
                icon = ?,
                title = ?,
                description = ?,
                display_order = ?,
                is_active = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [
                icon || "fas fa-star",
                title,
                description,
                display_order || 0,
                is_active !== undefined ? (is_active ? 1 : 0) : 1,
                req.params.id,
            ]
        );

        res.json({
            success: true,
            message: "Feature updated successfully",
        });
    } catch (err) {
        console.error("Update why choose feature error:", err);
        res.status(500).json({ success: false, error: "Failed to update feature" });
    }
});

// Delete feature
router.delete("/why-choose-features/:id", requireAuth, requireRole("super_manager"), async (req, res) => {
    try {
        const [existing] = await pool.query(
            "SELECT id FROM why_choose_features WHERE id = ?",
            [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: "Feature not found" });
        }

        await pool.query("DELETE FROM why_choose_features WHERE id = ?", [req.params.id]);

        res.json({
            success: true,
            message: "Feature deleted successfully",
        });
    } catch (err) {
        console.error("Delete why choose feature error:", err);
        res.status(500).json({ success: false, error: "Failed to delete feature" });
    }
});

// Toggle feature status
router.patch("/why-choose-features/:id/toggle-status", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const { is_active } = req.body;
        
        await pool.query(
            "UPDATE why_choose_features SET is_active = ?, updated_at = NOW() WHERE id = ?",
            [is_active ? 1 : 0, req.params.id]
        );

        res.json({
            success: true,
            message: "Status updated successfully",
        });
    } catch (err) {
        console.error("Toggle why choose feature status error:", err);
        res.status(500).json({ success: false, error: "Failed to update status" });
    }
});

// Reorder features (batch update display_order)
router.patch("/why-choose-features/reorder", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
    try {
        const { items } = req.body; // [{ id: 1, display_order: 0 }, { id: 2, display_order: 1 }, ...]

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Items array is required",
            });
        }

        // Use a transaction for batch update
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            for (const item of items) {
                await connection.query(
                    "UPDATE why_choose_features SET display_order = ? WHERE id = ?",
                    [item.display_order, item.id]
                );
            }
            await connection.commit();
            connection.release();

            res.json({
                success: true,
                message: "Features reordered successfully",
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error("Reorder why choose features error:", err);
        res.status(500).json({ success: false, error: "Failed to reorder features" });
    }
});

module.exports = router;