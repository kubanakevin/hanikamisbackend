// routes/clients/applications.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/applications/programs
   Programs a visitor can pick during registration.
   ============================================================ */
router.get("/programs", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.level, p.duration,
              d.name AS department_name
       FROM programs p
       JOIN departments d ON d.id = p.department_id
       WHERE p.is_active = 1
       ORDER BY d.name ASC, p.display_order ASC, p.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client application programs error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch programs" });
  }
});

/* ============================================================
   POST /api/client/applications
   Accepts a full application and stores it.
   Body:
   {
     full_name, email, phone, national_id, date_of_birth, gender,
     address, city, country,
     program_id, program_slug,
     previous_school, previous_level, previous_grades,
     guardian_name, guardian_phone,
     notes,
     agree_terms
   }
   ============================================================ */
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};

    // Basic validation
    const required = [
      ["full_name", "Full name"],
      ["email", "Email"],
      ["phone", "Phone number"],
      ["program_id", "Program"],
    ];
    for (const [key, label] of required) {
      if (!b[key] || String(b[key]).trim() === "") {
        return res.status(400).json({
          success: false,
          error: `${label} is required`,
        });
      }
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email).trim());
    if (!emailOk) {
      return res.status(400).json({ success: false, error: "Invalid email address" });
    }

    if (!b.agree_terms) {
      return res.status(400).json({
        success: false,
        error: "You must agree to the terms to submit",
      });
    }

    // Prevent duplicate pending applications from the same email
    const [dup] = await pool.query(
      `SELECT id FROM applications
       WHERE email = ? AND status IN ('pending','reviewing')
       LIMIT 1`,
      [String(b.email).trim()]
    );
    if (dup.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          "An application with this email is already in review. Contact the admissions office if you need to update it.",
      });
    }

    // Resolve program_slug if missing
    let programSlug = b.program_slug || null;
    if (!programSlug && b.program_id) {
      try {
        const [p] = await pool.query(
          "SELECT slug FROM programs WHERE id = ? LIMIT 1",
          [b.program_id]
        );
        programSlug = p[0]?.slug || null;
      } catch {}
    }

    const [result] = await pool.query(
      `INSERT INTO applications (
        full_name, email, phone, national_id, date_of_birth, gender,
        address, city, country,
        program_id, program_slug,
        previous_school, previous_level, previous_grades,
        guardian_name, guardian_phone,
        notes, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        String(b.full_name).trim(),
        String(b.email).trim(),
        b.phone || null,
        b.national_id || null,
        b.date_of_birth || null,
        b.gender || null,
        b.address || null,
        b.city || null,
        b.country || null,
        b.program_id || null,
        programSlug,
        b.previous_school || null,
        b.previous_level || null,
        b.previous_grades || null,
        b.guardian_name || null,
        b.guardian_phone || null,
        b.notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Application received",
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error("Application submit error:", err);
    res.status(500).json({ success: false, error: "Failed to submit application" });
  }
});

module.exports = router;