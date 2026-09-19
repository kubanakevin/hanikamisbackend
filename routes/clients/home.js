// routes/client/home.js
const router = require("express").Router();
const pool = require("../../config/db");

/**
 * GET /api/client/home
 * Aggregated home page data
 */
router.get("/", async (req, res) => {
    try {
        // Get hero banners (active, ordered by display_order)
        const [heroBanners] = await pool.query(
            `SELECT id, title, subtitle, description, media_type,
                    image_url, video_url, video_thumbnail,
                    button_text, button_link
             FROM hero_banners
             WHERE is_active = 1
             ORDER BY display_order ASC
             LIMIT 5`
        );

        // Get about section
        const [about] = await pool.query(
            `SELECT id, title, short_description, full_content, mission, vision, 
                    core_values, image_url, video_url, founded_year
             FROM about_section
             ORDER BY updated_at DESC
             LIMIT 1`
        );

        // Get active announcements (not expired)
        const [announcements] = await pool.query(
            `SELECT id, title, content, priority, start_date, expiry_date
             FROM announcements
             WHERE is_active = 1
               AND (start_date IS NULL OR start_date <= NOW())
               AND (expiry_date IS NULL OR expiry_date >= NOW())
             ORDER BY priority DESC, created_at DESC
             LIMIT 5`
        );

        // Get departments with program counts
        const [departments] = await pool.query(
            `SELECT d.id, d.name, d.slug, d.description, d.head_of_department,
                    (SELECT COUNT(*) FROM programs p WHERE p.department_id = d.id AND p.is_active = 1) AS program_count
             FROM departments d
             WHERE d.is_active = 1
             ORDER BY d.name ASC`
        );

        // Get featured programs
        const [featuredPrograms] = await pool.query(
            `SELECT p.id, p.department_id, p.name, p.slug, p.level, p.duration,
                    p.short_description, p.image_url, p.is_featured,
                    d.name AS department_name
             FROM programs p
             JOIN departments d ON p.department_id = d.id
             WHERE p.is_active = 1 AND p.is_featured = 1
             ORDER BY p.display_order ASC
             LIMIT 6`
        );

        // Get why choose features
        const [whyChoose] = await pool.query(
            `SELECT id, icon, title, description
             FROM why_choose_features
             WHERE is_active = 1
             ORDER BY display_order ASC
             LIMIT 6`
        );

        // Get CTA section
        const [cta] = await pool.query(
            `SELECT id, title, description, primary_button_text, primary_button_link,
                    secondary_button_text, secondary_button_link, background_image
             FROM cta_section
             WHERE is_active = 1
             ORDER BY updated_at DESC
             LIMIT 1`
        );

        // Get upcoming events (next 30 days)
        const [upcomingEvents] = await pool.query(
            `SELECT id, title, slug, description, event_date, end_date,
                    start_time, end_time, location, featured_image, category
             FROM events
             WHERE is_active = 1
               AND event_date >= CURDATE()
             ORDER BY event_date ASC
             LIMIT 4`
        );

        // Get latest news
        const [latestNews] = await pool.query(
            `SELECT id, title, slug, excerpt, featured_image, category, author,
                    views, published_at
             FROM news
             WHERE is_published = 1 AND published_at <= NOW()
             ORDER BY published_at DESC
             LIMIT 3`
        );

        // Get gallery images for homepage
        const [galleryImages] = await pool.query(
            `SELECT gi.id, gi.title, gi.image_url, gi.caption, gc.name AS category_name
             FROM gallery_images gi
             JOIN gallery_categories gc ON gi.category_id = gc.id
             WHERE gi.is_active = 1 AND gi.is_featured = 1
             ORDER BY gi.display_order ASC
             LIMIT 8`
        );

        // Get contact info
        const [contact] = await pool.query(
            `SELECT address, phone_primary, phone_secondary, email_primary,
                    email_secondary, office_hours, facebook_url, twitter_url,
                    instagram_url, linkedin_url, youtube_url, whatsapp_number
             FROM contact_info
             ORDER BY updated_at DESC
             LIMIT 1`
        );

        // Get total stats
        const [[stats]] = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM programs WHERE is_active = 1) AS total_programs,
                (SELECT COUNT(*) FROM departments WHERE is_active = 1) AS total_departments,
                (SELECT COUNT(*) FROM events WHERE is_active = 1 AND event_date >= CURDATE()) AS upcoming_events,
                (SELECT COUNT(*) FROM news WHERE is_published = 1) AS total_news`
        );

        res.json({
            success: true,
            data: {
                hero_banners: heroBanners,
                about: about[0] || null,
                announcements: announcements,
                departments: departments,
                featured_programs: featuredPrograms,
                why_choose: whyChoose,
                cta: cta[0] || null,
                upcoming_events: upcomingEvents,
                latest_news: latestNews,
                gallery_images: galleryImages,
                contact: contact[0] || null,
                stats: stats
            }
        });

    } catch (err) {
        console.error("Homepage data fetch error:", err);
        res.status(500).json({ 
            success: false, 
            error: "Failed to fetch homepage data" 
        });
    }
});

// GET /api/client/home/hero
router.get("/hero", async (req, res) => {
    try {
        const [banners] = await pool.query(
            `SELECT id, title, subtitle, description, media_type,
                    image_url, video_url, video_thumbnail,
                    button_text, button_link
             FROM hero_banners
             WHERE is_active = 1
             ORDER BY display_order ASC`
        );
        res.json({ success: true, data: banners });
    } catch (err) {
        console.error("Hero banners fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch hero banners" });
    }
});

// GET /api/client/home/announcements
router.get("/announcements", async (req, res) => {
    try {
        const [announcements] = await pool.query(
            `SELECT id, title, content, priority, start_date, expiry_date
             FROM announcements
             WHERE is_active = 1
               AND (start_date IS NULL OR start_date <= NOW())
               AND (expiry_date IS NULL OR expiry_date >= NOW())
             ORDER BY priority DESC, created_at DESC`
        );
        res.json({ success: true, data: announcements });
    } catch (err) {
        console.error("Announcements fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch announcements" });
    }
});

// GET /api/client/home/events/upcoming
router.get("/events/upcoming", async (req, res) => {
    try {
        const { limit = 6 } = req.query;
        const [events] = await pool.query(
            `SELECT id, title, slug, description, event_date, end_date,
                    start_time, end_time, location, featured_image, category,
                    DATEDIFF(event_date, CURDATE()) AS days_until
             FROM events
             WHERE is_active = 1 AND event_date >= CURDATE()
             ORDER BY event_date ASC
             LIMIT ?`,
            [parseInt(limit)]
        );
        res.json({ success: true, data: events });
    } catch (err) {
        console.error("Upcoming events fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch upcoming events" });
    }
});

// GET /api/client/home/news/latest
router.get("/news/latest", async (req, res) => {
    try {
        const { limit = 3 } = req.query;
        const [news] = await pool.query(
            `SELECT id, title, slug, excerpt, featured_image, category, author,
                    views, published_at,
                    DATE_FORMAT(published_at, '%M %d, %Y') AS formatted_date
             FROM news
             WHERE is_published = 1 AND published_at <= NOW()
             ORDER BY published_at DESC
             LIMIT ?`,
            [parseInt(limit)]
        );
        res.json({ success: true, data: news });
    } catch (err) {
        console.error("Latest news fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch latest news" });
    }
});

// GET /api/client/home/gallery/featured
router.get("/gallery/featured", async (req, res) => {
    try {
        const [images] = await pool.query(
            `SELECT gi.id, gi.title, gi.image_url, gi.caption, gc.name AS category_name
             FROM gallery_images gi
             JOIN gallery_categories gc ON gi.category_id = gc.id
             WHERE gi.is_active = 1 AND gi.is_featured = 1
             ORDER BY gi.display_order ASC`
        );
        res.json({ success: true, data: images });
    } catch (err) {
        console.error("Gallery images fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch gallery images" });
    }
});

module.exports = router;