// routes/auth/login.js
const router = require("express").Router();
const pool = require("../../config/db");
const bcrypt = require("bcryptjs");

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required"
            });
        }

        // Find user by email
        const [users] = await pool.query(
            `SELECT id, email, password, full_name, role, department_id, is_active 
             FROM users 
             WHERE email = ?`,
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        const user = users[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: "Your account has been deactivated. Please contact support."
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        // Set session cookie expiry based on remember me
        const maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24 * 7; // 30 days or 7 days

        // Create session
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.full_name,
            role: user.role,
            departmentId: user.department_id
        };

        // Update session cookie
        req.session.cookie.maxAge = maxAge;

        // Update last login timestamp
        await pool.query(
            `UPDATE users SET last_login = NOW() WHERE id = ?`,
            [user.id]
        );

        // Log login activity (optional)
        await pool.query(
            `INSERT INTO user_activity_logs (user_id, action, ip_address, user_agent) 
             VALUES (?, 'login', ?, ?)`,
            [user.id, req.ip || req.headers['x-forwarded-for'], req.headers['user-agent']]
        );

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role,
                departmentId: user.department_id
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({
            success: false,
            error: "An error occurred during login. Please try again."
        });
    }
});

/**
 * POST /api/auth/logout
 * Destroy user session
 */
router.post("/logout", async (req, res) => {
    try {
        // Log logout activity if user is logged in
        if (req.session?.user) {
            await pool.query(
                `INSERT INTO user_activity_logs (user_id, action, ip_address, user_agent) 
                 VALUES (?, 'logout', ?, ?)`,
                [req.session.user.id, req.ip || req.headers['x-forwarded-for'], req.headers['user-agent']]
            );
        }

        req.session.destroy((err) => {
            if (err) {
                console.error("Logout error:", err);
                return res.status(500).json({
                    success: false,
                    error: "Failed to logout"
                });
            }
            res.clearCookie('c6club.sid');
            res.json({
                success: true,
                message: "Logged out successfully"
            });
        });
    } catch (err) {
        console.error("Logout error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to logout"
        });
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get("/me", async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({
                success: false,
                error: "Not authenticated"
            });
        }

        // Get fresh user data from database
        const [users] = await pool.query(
            `SELECT id, email, full_name, role, department_id, is_active, created_at, last_login 
             FROM users 
             WHERE id = ?`,
            [req.session.user.id]
        );

        if (users.length === 0) {
            req.session.destroy();
            return res.status(401).json({
                success: false,
                error: "User not found"
            });
        }

        const user = users[0];

        if (!user.is_active) {
            req.session.destroy();
            return res.status(403).json({
                success: false,
                error: "Account deactivated"
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role,
                departmentId: user.department_id,
                createdAt: user.created_at,
                lastLogin: user.last_login
            }
        });

    } catch (err) {
        console.error("Get user error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to get user information"
        });
    }
});

module.exports = router;