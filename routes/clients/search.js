// routes/clients/search.js
const router = require("express").Router();
const pool = require("../../config/db");

/**
 * Runs a single search query and NEVER throws — but it does log the real
 * reason for failure (wrong table/column name, connection issue, etc.)
 * so "no results" can actually be diagnosed instead of hidden.
 */
async function safeQuery(label, sql, params) {
    try {
        const [rows] = await pool.query(sql, params);
        console.log(`[search] ${label}: ${rows.length} row(s)`);
        return rows;
    } catch (err) {
        console.error(`[search] ${label} query failed:`, err.code || err.message);
        return [];
    }
}

/**
 * GET /api/client/search?q=term
 * Searches departments, programs, and news for a matching term
 * and returns grouped, ready-to-link results.
 */
router.get("/", async (req, res) => {
    const q = (req.query.q || "").trim();
    console.log(`[search] query="${q}"`);

    if (!q || q.length < 2) {
        return res.json({ success: true, data: { query: q, results: [] } });
    }

    const like = `%${q}%`;

    try {
        const [departments, programs, news] = await Promise.all([
            safeQuery(
                "departments",
                `SELECT id, name, slug, description
                 FROM departments
                 WHERE (name LIKE ? OR description LIKE ?)
                 ORDER BY name ASC
                 LIMIT 5`,
                [like, like]
            ),
            safeQuery(
                "programs",
                `SELECT id, name, slug, level
                 FROM programs
                 WHERE (name LIKE ? OR description LIKE ?)
                 ORDER BY name ASC
                 LIMIT 5`,
                [like, like]
            ),
            safeQuery(
                "news",
                `SELECT id, title, slug, published_at
                 FROM news
                 WHERE is_published = 1 AND (title LIKE ? OR content LIKE ?)
                 ORDER BY published_at DESC
                 LIMIT 5`,
                [like, like]
            ),
        ]);

        const results = [
            ...departments.map((d) => ({
                type: "Department",
                label: d.name,
                subtitle: d.description ? d.description.slice(0, 80) : null,
                href: `/departments/${d.slug}`,
            })),
            ...programs.map((p) => ({
                type: "Program",
                label: p.name,
                subtitle: p.level ? p.level.charAt(0).toUpperCase() + p.level.slice(1) : null,
                href: `/programs/${p.slug}`,
            })),
            ...news.map((n) => ({
                type: "News",
                label: n.title,
                subtitle: n.published_at
                    ? new Date(n.published_at).toLocaleDateString()
                    : null,
                href: `/news/${n.slug}`,
            })),
        ];

        console.log(`[search] total results for "${q}": ${results.length}`);
        res.json({ success: true, data: { query: q, results } });
    } catch (err) {
        console.error("[search] unexpected error:", err);
        res.json({ success: true, data: { query: q, results: [] } });
    }
});

module.exports = router;