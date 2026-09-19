// routes/clients/gallery.js
const router = require("express").Router();
const pool = require("../../config/db");

/**
 * GET /api/client/gallery
 * Aggregated gallery page data:
 *  - categories (with image counts)
 *  - paginated images (optionally filtered by category)
 *
 * Query params:
 *   ?page=1        (default 1)
 *   ?limit=24      (default 24, max 100)
 *   ?category=slug (optional category slug filter)
 */
router.get("/", async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), 100);
        const offset = (page - 1) * limit;
        const categorySlug = req.query.category || null;

        // Get all active categories with image counts
        // NOTE: schema only has id, name, slug, display_order, is_active
        const [categories] = await pool.query(
            `SELECT gc.id, gc.name, gc.slug, gc.display_order,
                    (SELECT COUNT(*) FROM gallery_images gi
                     WHERE gi.category_id = gc.id AND gi.is_active = 1) AS image_count
             FROM gallery_categories gc
             WHERE gc.is_active = 1
             ORDER BY gc.display_order ASC, gc.name ASC`
        );

        // Build image query, optionally filtered by category slug
        let imageSql = `
            SELECT gi.id, gi.category_id, gi.title, gi.image_url, gi.caption,
                   gi.is_featured, gi.display_order, gi.created_at,
                   gc.name AS category_name, gc.slug AS category_slug
            FROM gallery_images gi
            JOIN gallery_categories gc ON gi.category_id = gc.id
            WHERE gi.is_active = 1 AND gc.is_active = 1
        `;
        const params = [];

        if (categorySlug) {
            imageSql += ` AND gc.slug = ?`;
            params.push(categorySlug);
        }

        imageSql += ` ORDER BY gi.is_featured DESC, gi.display_order ASC, gi.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [images] = await pool.query(imageSql, params);

        // Total count for pagination (respects category filter)
        let countSql = `
            SELECT COUNT(*) AS total
            FROM gallery_images gi
            JOIN gallery_categories gc ON gi.category_id = gc.id
            WHERE gi.is_active = 1 AND gc.is_active = 1
        `;
        const countParams = [];

        if (categorySlug) {
            countSql += ` AND gc.slug = ?`;
            countParams.push(categorySlug);
        }

        const [[{ total }]] = await pool.query(countSql, countParams);

        res.json({
            success: true,
            data: {
                categories,
                images,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: Math.ceil(total / limit),
                    has_more: page * limit < total,
                },
                active_category: categorySlug,
            },
        });
    } catch (err) {
        console.error("Gallery fetch error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to fetch gallery",
        });
    }
});

/**
 * GET /api/client/gallery/categories
 * All active gallery categories with image counts.
 */
router.get("/categories", async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT gc.id, gc.name, gc.slug, gc.display_order,
                    (SELECT COUNT(*) FROM gallery_images gi
                     WHERE gi.category_id = gc.id AND gi.is_active = 1) AS image_count
             FROM gallery_categories gc
             WHERE gc.is_active = 1
             ORDER BY gc.display_order ASC, gc.name ASC`
        );
        res.json({ success: true, data: categories });
    } catch (err) {
        console.error("Gallery categories fetch error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to fetch gallery categories",
        });
    }
});

/**
 * GET /api/client/gallery/category/:slug
 * One category + all its active images.
 */
router.get("/category/:slug", async (req, res) => {
    try {
        const { slug } = req.params;

        const [[category]] = await pool.query(
            `SELECT id, name, slug, display_order
             FROM gallery_categories
             WHERE slug = ? AND is_active = 1
             LIMIT 1`,
            [slug]
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                error: "Category not found",
            });
        }

        const [images] = await pool.query(
            `SELECT id, category_id, title, image_url, caption,
                    is_featured, display_order, created_at
             FROM gallery_images
             WHERE category_id = ? AND is_active = 1
             ORDER BY is_featured DESC, display_order ASC, created_at DESC`,
            [category.id]
        );

        res.json({
            success: true,
            data: { category, images },
        });
    } catch (err) {
        console.error("Gallery category fetch error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to fetch category",
        });
    }
});

module.exports = router;