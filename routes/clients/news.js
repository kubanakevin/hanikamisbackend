// routes/clients/news.js
const router = require("express").Router();
const pool = require("../../config/db");

/* ============================================================
   GET /api/client/news
   Query: ?page=1&limit=9&category=Academics
   Public: only published, only past-or-now published_at.
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 9, 50);
    const offset = (page - 1) * limit;
    const category = (req.query.category || "").toString().trim();

    const where = ["is_published = 1", "published_at <= NOW()"];
    const params = [];

    if (category) {
      where.push("category = ?");
      params.push(category);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM news ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT id, title, slug, excerpt, featured_image, category, author,
              views, published_at,
              DATE_FORMAT(published_at, '%Y-%m-%d') AS published_date
       FROM news
       ${whereSql}
       ORDER BY published_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: Number(total) || 0,
        total_pages: Math.ceil((Number(total) || 0) / limit),
        has_more: page * limit < (Number(total) || 0),
      },
    });
  } catch (err) {
    console.error("Client news list error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch news" });
  }
});

/* ============================================================
   GET /api/client/news/categories
   Distinct categories with counts.
   ============================================================ */
router.get("/categories", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS count
       FROM news
       WHERE is_published = 1
         AND published_at <= NOW()
         AND category IS NOT NULL AND category <> ''
       GROUP BY category
       ORDER BY category ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client news categories error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

/* ============================================================
   GET /api/client/news/latest
   Latest few for sidebars / related.
   ============================================================ */
router.get("/latest", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 4, 20);
    const [rows] = await pool.query(
      `SELECT id, title, slug, featured_image, category, published_at
       FROM news
       WHERE is_published = 1 AND published_at <= NOW()
       ORDER BY published_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Client latest news error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch latest news" });
  }
});

/* ============================================================
   GET /api/client/news/:slug
   Single published article by slug (or numeric id).
   Also increments view count.
   ============================================================ */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const isNumeric = /^\d+$/.test(slug);

    const [rows] = await pool.query(
      `SELECT id, title, slug, excerpt, content, featured_image,
              category, author, views, published_at, created_at, updated_at
       FROM news
       WHERE is_published = 1 AND published_at <= NOW()
         AND ${isNumeric ? "id = ?" : "slug = ?"}
       LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Article not found" });
    }

    const article = rows[0];

    // Fire-and-forget view increment (don't block the response on it)
    pool
      .query("UPDATE news SET views = COALESCE(views, 0) + 1 WHERE id = ?", [
        article.id,
      ])
      .catch((e) => console.error("View increment error:", e));

    // Related — same category, excluding current, latest 3
    const [related] = await pool.query(
      `SELECT id, title, slug, featured_image, category, published_at
       FROM news
       WHERE is_published = 1 AND published_at <= NOW()
         AND id <> ?
         ${article.category ? "AND category = ?" : ""}
       ORDER BY published_at DESC
       LIMIT 3`,
      article.category ? [article.id, article.category] : [article.id]
    );

    res.json({
      success: true,
      data: {
        ...article,
        views: (article.views || 0) + 1, // reflect the increment
        related,
      },
    });
  } catch (err) {
    console.error("Client news detail error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch article" });
  }
});

module.exports = router;