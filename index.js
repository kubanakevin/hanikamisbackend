// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

// Import routes
const clientHomeRoutes = require("./routes/clients/home");
const navigationRoutes = require("./routes/clients/navigation");
const authRoutes = require("./routes/auth/login");
const dashboardRoutes = require("./routes/admin/stats");
const programsRoutes = require("./routes/admin/programs");
const galleryRoutes = require("./routes/admin/gallery");
const eventRoutes = require("./routes/admin/events");
const heroBannerRoutes = require("./routes/admin/hero-banners");
const newsRoutes = require("./routes/admin/news");
const aiChatRoutes = require("./routes/clients/aiChat");
const searchRoutes = require("./routes/clients/search");
const aiKnowledgeRoutes = require("./routes/admin/aiKnowledge");
const whyChooseFeaturesRoutes = require("./routes/admin/whyChooseFeatures");
const ctaRoutes = require("./routes/admin/cta");
const aboutRoutes = require("./routes/admin/about");
const announcementsRoutes = require("./routes/admin/announcements");
const galleryPublicRoutes = require("./routes/clients/gallery");
const contactClientRoutes = require("./routes/clients/contact");
const adminContactRoutes = require("./routes/admin/contact");
const eventsClientRoutes = require("./routes/clients/events");
const adminUsersRoutes = require("./routes/admin/adminUsers");
const adminDepartmentsRoutes = require("./routes/admin/departments");
const newsClientRoutes = require("./routes/clients/news");
const programsClientRoutes = require("./routes/clients/programs");
const aboutClientRoutes = require("./routes/clients/about");
const adminProfileRoutes = require("./routes/admin/profile");
const departmentsClientRoutes = require("./routes/clients/departments");
const admissionsClientRoutes = require("./routes/clients/admissions");
const applicationsClientRoutes = require("./routes/clients/applications");
const visitsClientRoutes = require("./routes/clients/visits");
const visitorsAdminRoutes = require("./routes/admin/visitors");


const app = express();
const PORT = process.env.PORT || 5000;

// ====================
// MIDDLEWARE
// ====================

process.setMaxListeners(15);

app.set("trust proxy", 1);

// ✅ CORS Configuration
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// ✅ Session Configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || "c6-club-super-secret-key-2024",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production" ? true : false,
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            domain: process.env.NODE_ENV === "production" ? ".c6club.com" : undefined,
        },
        name: "c6club.sid",
        proxy: true,
    })
);

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====================
// ROUTES
// ====================

// Auth routes
app.use("/api/auth", authRoutes);

// Client routes
app.use("/api/client/home", clientHomeRoutes);
app.use("/api/client/gallery", galleryPublicRoutes);
app.use("/api/client/navigation", navigationRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/programs", programsRoutes);
app.use("/api/admin/gallery", galleryRoutes);
app.use("/api/admin/events", eventRoutes);
app.use("/api/admin/hero-banners", heroBannerRoutes);
app.use("/api/admin/news", newsRoutes);
app.use("/api/client/ai-chat", aiChatRoutes);
app.use("/api/client/search", searchRoutes);
app.use("/api/admin/ai", aiKnowledgeRoutes);
app.use("/api/admin", whyChooseFeaturesRoutes);
app.use("/api/admin", ctaRoutes);
app.use("/api/admin", aboutRoutes);
app.use("/api/admin", announcementsRoutes);
app.use("/api/client/contact", contactClientRoutes);
app.use("/api/admin/contact", adminContactRoutes);
app.use("/api/client/events", eventsClientRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/departments", adminDepartmentsRoutes);
app.use("/api/client/news", newsClientRoutes);
app.use("/api/client/programs", programsClientRoutes);
app.use("/api/client/about", aboutClientRoutes);
app.use("/api/admin/profile", adminProfileRoutes);
app.use("/api/client/departments", departmentsClientRoutes);
app.use("/api/client/admissions", admissionsClientRoutes);
app.use("/api/client/applications", applicationsClientRoutes);
app.use("/api/client/visits", visitsClientRoutes);
app.use("/api/admin/visitors", visitorsAdminRoutes);

// ====================
// HEALTH CHECK
// ====================

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        session: req.session.user ? "Authenticated" : "Guest",
        sessionID: req.sessionID,
    });
});


// ====================
// ERROR HANDLING
// ====================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found",
        path: req.originalUrl,
        method: req.method,
    });
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err.stack);
    
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            error: "File too large. Maximum size is 32MB.",
        });
    }
    
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
            success: false,
            error: "Unexpected file field.",
        });
    }

    res.status(err.status || 500).json({
        success: false,
        error: err.message || "Internal server error",
    });
});

// ====================
// START SERVER
// ====================

app.listen(PORT, () => {
    console.log(`📡 Server is running on Port: ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app;