// routes/clients/contact.js
const router = require("express").Router();
const pool = require("../../config/db");

/**
 * GET /api/client/contact
 * Returns the latest contact_info row (or null).
 */
router.get("/", async (req, res) => {
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

        res.json({
            success: true,
            data: rows[0] || null,
        });
    } catch (err) {
        console.error("Contact info fetch error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to fetch contact info",
        });
    }
});

/**
 * POST /api/client/contact/messages
 * Body: { full_name, email, phone?, subject?, message }
 * Also accepts `name` as an alias for `full_name`.
 */
router.post("/messages", async (req, res) => {
    try {
        const body = req.body || {};

        const full_name = (body.full_name ?? body.name ?? "").toString().trim();
        const email = (body.email ?? "").toString().trim();
        const phone = (body.phone ?? "").toString().trim();
        const subject = (body.subject ?? "").toString().trim();
        const message = (body.message ?? "").toString().trim();

        const errors = [];
        if (!full_name) errors.push("Full name is required");
        if (!email) errors.push("Email is required");
        if (!message) errors.push("Message is required");

        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (email && !emailOk) errors.push("Email is not valid");

        if (full_name.length > 150) errors.push("Full name is too long");
        if (email.length > 150) errors.push("Email is too long");
        if (phone.length > 50) errors.push("Phone is too long");
        if (subject.length > 200) errors.push("Subject is too long");
        if (message.length > 5000) errors.push("Message is too long");

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0],
                errors,
            });
        }

        const [result] = await pool.query(
            `INSERT INTO contact_messages
                (full_name, email, phone, subject, message, is_read, is_archived)
             VALUES (?, ?, ?, ?, ?, 0, 0)`,
            [
                full_name,
                email,
                phone || null,
                subject || null,
                message,
            ]
        );

        res.json({
            success: true,
            message: "Thanks! Your message has been sent.",
            data: { id: result.insertId },
        });
    } catch (err) {
        console.error("Contact message submit error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to send message. Please try again later.",
        });
    }
});

module.exports = router;