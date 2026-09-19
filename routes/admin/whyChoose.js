// routes/clients/whyChoose.js
const router = require("express").Router();
const pool = require("../../config/db");

// Public route - no auth required
router.get("/why-choose-features", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, icon, title, description, display_order
             FROM why_choose_features
             WHERE is_active = 1
             ORDER BY display_order ASC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Get public why choose features error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch features" });
    }
});

module.exports = router;