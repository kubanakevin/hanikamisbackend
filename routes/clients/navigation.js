// routes/clients/navigation.js
const router = require("express").Router();
const pool = require("../../config/db");

// Cache whether site_settings exists so we don't spam the console on every
// request — we only log the "missing table" warning once per server run.
let siteSettingsAvailable = null;

/**
 * GET /api/client/navigation
 * Returns navigation data including departments, programs, and school info
 */
router.get("/", async (req, res) => {
    try {
        // Get school info (from site_settings or fallback)
        let schoolInfo = {};

        if (siteSettingsAvailable !== false) {
            try {
                // NOTE: schema only has id, school_name, school_subtitle,
                // apply_link, updated_at — no logo_url column.
                const [info] = await pool.query(
                    `SELECT school_name, school_subtitle, apply_link 
                     FROM site_settings 
                     LIMIT 1`
                );
                siteSettingsAvailable = true;
                if (info && info.length > 0) {
                    schoolInfo = info[0];
                }
            } catch (err) {
                siteSettingsAvailable = false;
                console.log(
                    "[navigation] site_settings table not found — using defaults. " +
                    "Run the migration in db/site_settings.sql to enable custom branding."
                );
            }
        }

        // Get departments for Academics dropdown
        const [departments] = await pool.query(
            `SELECT id, name, slug, description 
             FROM departments 
             WHERE is_active = 1 
             ORDER BY name ASC`
        );

        // Get latest news
        const [latestNews] = await pool.query(
            `SELECT id, title, slug, published_at 
             FROM news 
             WHERE is_published = 1 
             ORDER BY published_at DESC 
             LIMIT 3`
        );

        // Build navigation structure with fallback values
        const navData = {
            schoolName: schoolInfo.school_name || "HAIP",
            schoolSubtitle: schoolInfo.school_subtitle || "Hanika Anglican Integrated Polytechnic",
            applyLink: schoolInfo.apply_link || "/admissions#apply",
            logoUrl: null, // no logo_url column in current schema
            links: [
                {
                    label: "About",
                    href: "/about",
                    dropdown: {
                        links: [
                            { label: "About HAIP", href: "/about" },
                            { label: "Mission & Vision", href: "/about#mission" },
                            { label: "Leadership", href: "/about#leadership" },
                            { label: "Campus Facilities", href: "/about#facilities" },
                        ],
                        highlight: {
                            eyebrow: "Who we are",
                            title: "A polytechnic built for practical futures",
                            text: "Learn how Hanika Anglican Integrated Polytechnic prepares graduates with real, job-ready skills.",
                            href: "/about",
                            cta: "Read our story",
                        },
                    },
                },
                {
                    label: "Academics",
                    href: "/programs",
                    dropdown: {
                        links: [
                            { label: "All Programs", href: "/programs" },
                            { label: "Certificate Programs", href: "/programs?level=certificate" },
                            { label: "Diploma Programs", href: "/programs?level=diploma" },
                            { label: "Departments", href: "/departments" },
                            // Add dynamic department links (up to 3)
                            ...departments.slice(0, 3).map(dept => ({
                                label: dept.name,
                                href: `/departments/${dept.slug}`
                            }))
                        ],
                        highlight: {
                            eyebrow: "Why choose HAIP",
                            title: "Hands-on training, industry-linked skills",
                            text: "Every program pairs classroom learning with practical, workshop-based training.",
                            href: "/programs",
                            cta: "Explore programs",
                        },
                    },
                },
                {
                    label: "Admissions",
                    href: "/admissions",
                    dropdown: {
                        links: [
                            { label: "How to Apply", href: "/admissions#apply" },
                            { label: "Entry Requirements", href: "/admissions#requirements" },
                            { label: "Fees & Scholarships", href: "/admissions#fees" },
                            { label: "Academic Calendar", href: "/admissions#calendar" },
                        ],
                        highlight: {
                            eyebrow: "Intake open",
                            title: "Start your application today",
                            text: "New students are admitted every academic year. See dates, requirements, and next steps.",
                            href: "/admissions#apply",
                            cta: "Apply now",
                        },
                    },
                },
                {
                    label: "News & Events",
                    href: "/news",
                    dropdown: latestNews.length > 0 ? {
                        links: [
                            { label: "All News", href: "/news" },
                            { label: "Upcoming Events", href: "/events" },
                            ...latestNews.map(news => ({
                                label: news.title.length > 30 ? news.title.substring(0, 30) + "..." : news.title,
                                href: `/news/${news.slug}`
                            }))
                        ]
                    } : undefined
                },
                { label: "Gallery", href: "/gallery" },
                { label: "Contact", href: "/contact" },
            ]
        };

        res.json({
            success: true,
            data: navData
        });

    } catch (err) {
        console.error("Navigation fetch error:", err);
        // Return fallback data instead of error
        res.json({
            success: true,
            data: getFallbackNavigation()
        });
    }
});

// Fallback navigation data
function getFallbackNavigation() {
    return {
        schoolName: "HAIP",
        schoolSubtitle: "Hanika Anglican Integrated Polytechnic",
        applyLink: "/admissions#apply",
        logoUrl: null,
        links: [
            {
                label: "About",
                href: "/about",
                dropdown: {
                    links: [
                        { label: "About HAIP", href: "/about" },
                        { label: "Mission & Vision", href: "/about#mission" },
                        { label: "Leadership", href: "/about#leadership" },
                        { label: "Campus Facilities", href: "/about#facilities" },
                    ],
                    highlight: {
                        eyebrow: "Who we are",
                        title: "A polytechnic built for practical futures",
                        text: "Learn how Hanika Anglican Integrated Polytechnic prepares graduates with real, job-ready skills.",
                        href: "/about",
                        cta: "Read our story",
                    },
                },
            },
            {
                label: "Academics",
                href: "/programs",
                dropdown: {
                    links: [
                        { label: "All Programs", href: "/programs" },
                        { label: "Certificate Programs", href: "/programs?level=certificate" },
                        { label: "Diploma Programs", href: "/programs?level=diploma" },
                        { label: "Departments", href: "/departments" },
                    ],
                    highlight: {
                        eyebrow: "Why choose HAIP",
                        title: "Hands-on training, industry-linked skills",
                        text: "Every program pairs classroom learning with practical, workshop-based training.",
                        href: "/programs",
                        cta: "Explore programs",
                    },
                },
            },
            {
                label: "Admissions",
                href: "/admissions",
                dropdown: {
                    links: [
                        { label: "How to Apply", href: "/admissions#apply" },
                        { label: "Entry Requirements", href: "/admissions#requirements" },
                        { label: "Fees & Scholarships", href: "/admissions#fees" },
                        { label: "Academic Calendar", href: "/admissions#calendar" },
                    ],
                    highlight: {
                        eyebrow: "Intake open",
                        title: "Start your application today",
                        text: "New students are admitted every academic year. See dates, requirements, and next steps.",
                        href: "/admissions#apply",
                        cta: "Apply now",
                    },
                },
            },
            { label: "News & Events", href: "/news" },
            { label: "Gallery", href: "/gallery" },
            { label: "Contact", href: "/contact" },
        ]
    };
}

module.exports = router;