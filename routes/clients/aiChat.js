// routes/clients/AiChat.js
const router = require("express").Router();
const pool = require("../../config/db");
const crypto = require("crypto");

/* =====================================================================
   ANSWER BUILDERS
   Each returns { text, image } or null.
   ===================================================================== */

async function answerPrograms() {
    const [rows] = await pool.query(
        `SELECT p.name, p.level, p.duration, p.short_description, p.image_url, p.slug,
                d.name AS department_name
         FROM programs p
         JOIN departments d ON p.department_id = d.id
         WHERE p.is_active = 1
         ORDER BY p.is_featured DESC, p.display_order ASC
         LIMIT 6`
    );
    if (!rows.length) return null;

    const text =
        "Here are some of our programs:\n" +
        rows
            .map((p) => `• ${p.name} (${p.level}, ${p.duration}) — ${p.department_name}`)
            .join("\n") +
        "\n\nAsk me about any program by name for details.";
    const image = rows.find((p) => p.image_url)?.image_url || null;
    return { text, image };
}

async function answerProgramByName(userMessage) {
    // Try to find a program whose name appears in the message
    const [all] = await pool.query(
        `SELECT id, name FROM programs WHERE is_active = 1`
    );
    const lower = userMessage.toLowerCase();
    const match = all.find((p) => lower.includes(p.name.toLowerCase()));
    if (!match) return null;

    const [rows] = await pool.query(
        `SELECT p.name, p.level, p.duration, p.short_description, p.full_description,
                p.entry_requirements, p.career_opportunities, p.image_url,
                d.name AS department_name
         FROM programs p
         JOIN departments d ON p.department_id = d.id
         WHERE p.id = ? LIMIT 1`,
        [match.id]
    );
    if (!rows.length) return null;

    const p = rows[0];
    const parts = [];
    parts.push(`${p.name} — ${p.level} (${p.duration})`);
    parts.push(`Department: ${p.department_name}`);
    if (p.short_description) parts.push(p.short_description);
    if (p.full_description) parts.push(p.full_description);
    if (p.entry_requirements) parts.push(`Entry requirements: ${p.entry_requirements}`);
    if (p.career_opportunities) parts.push(`Career opportunities: ${p.career_opportunities}`);

    return { text: parts.join("\n"), image: p.image_url || null };
}

async function answerDepartments() {
    const [rows] = await pool.query(
        `SELECT d.name, d.slug, d.description, d.head_of_department,
                (SELECT COUNT(*) FROM programs p WHERE p.department_id = d.id AND p.is_active = 1) AS program_count
         FROM departments d
         WHERE d.is_active = 1
         ORDER BY d.name ASC
         LIMIT 8`
    );
    if (!rows.length) return null;

    const text =
        "Our departments:\n" +
        rows
            .map((d) => `• ${d.name} (${d.program_count} program${d.program_count === 1 ? "" : "s"})`)
            .join("\n") +
        "\n\nAsk me about any department by name for details.";
    return { text, image: null };
}

async function answerDepartmentByName(userMessage) {
    const [all] = await pool.query(
        `SELECT id, name FROM departments WHERE is_active = 1`
    );
    const lower = userMessage.toLowerCase();
    const match = all.find((d) => lower.includes(d.name.toLowerCase()));
    if (!match) return null;

    const [rows] = await pool.query(
        `SELECT name, description, head_of_department
         FROM departments WHERE id = ? LIMIT 1`,
        [match.id]
    );
    if (!rows.length) return null;

    const [programs] = await pool.query(
        `SELECT name, level, duration
         FROM programs WHERE department_id = ? AND is_active = 1
         ORDER BY display_order ASC LIMIT 10`,
        [match.id]
    );

    const d = rows[0];
    const parts = [`Department: ${d.name}`];
    if (d.head_of_department) parts.push(`Head: ${d.head_of_department}`);
    if (d.description) parts.push(d.description);
    if (programs.length) {
        parts.push(
            "Programs offered:\n" +
            programs.map((p) => `• ${p.name} (${p.level}, ${p.duration})`).join("\n")
        );
    }
    return { text: parts.join("\n"), image: null };
}

async function answerNews() {
    const [rows] = await pool.query(
        `SELECT title, excerpt, featured_image, slug,
                DATE_FORMAT(published_at, '%M %d, %Y') AS formatted_date
         FROM news
         WHERE is_published = 1 AND published_at <= NOW()
         ORDER BY published_at DESC
         LIMIT 5`
    );
    if (!rows.length) return null;

    const text =
        "Latest news:\n" +
        rows.map((n) => `• ${n.title} (${n.formatted_date})`).join("\n");
    const image = rows.find((n) => n.featured_image)?.featured_image || null;
    return { text, image };
}

async function answerNewsByTitle(userMessage) {
    const [all] = await pool.query(
        `SELECT id, title FROM news WHERE is_published = 1`
    );
    const lower = userMessage.toLowerCase();
    // Match on any meaningful word of the title appearing in the message
    const match = all.find((n) => {
        const words = n.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => lower.includes(w));
    });
    if (!match) return null;

    const [rows] = await pool.query(
        `SELECT title, excerpt, content, featured_image,
                DATE_FORMAT(published_at, '%M %d, %Y') AS formatted_date
         FROM news WHERE id = ? LIMIT 1`,
        [match.id]
    );
    if (!rows.length) return null;

    const n = rows[0];
    const parts = [`${n.title} — ${n.formatted_date}`];
    if (n.excerpt) parts.push(n.excerpt);
    if (n.content) parts.push(n.content.slice(0, 600));
    return { text: parts.join("\n\n"), image: n.featured_image || null };
}

async function answerEvents() {
    const [rows] = await pool.query(
        `SELECT title, location, featured_image,
                DATE_FORMAT(event_date, '%M %d, %Y') AS formatted_date
         FROM events
         WHERE is_active = 1 AND event_date >= CURDATE()
         ORDER BY event_date ASC
         LIMIT 5`
    );
    if (!rows.length) return null;

    const text =
        "Upcoming events:\n" +
        rows
            .map(
                (e) =>
                    `• ${e.title} — ${e.formatted_date}${e.location ? ` at ${e.location}` : ""}`
            )
            .join("\n");
    const image = rows.find((e) => e.featured_image)?.featured_image || null;
    return { text, image };
}

async function answerEventByTitle(userMessage) {
    const [all] = await pool.query(
        `SELECT id, title FROM events WHERE is_active = 1`
    );
    const lower = userMessage.toLowerCase();
    const match = all.find((e) => {
        const words = e.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => lower.includes(w));
    });
    if (!match) return null;

    const [rows] = await pool.query(
        `SELECT title, description, location, category,
                DATE_FORMAT(event_date, '%M %d, %Y') AS formatted_date,
                start_time, end_time, featured_image
         FROM events WHERE id = ? LIMIT 1`,
        [match.id]
    );
    if (!rows.length) return null;

    const e = rows[0];
    const parts = [`${e.title}`];
    parts.push(`Date: ${e.formatted_date}`);
    if (e.start_time) parts.push(`Time: ${e.start_time}${e.end_time ? ` – ${e.end_time}` : ""}`);
    if (e.location) parts.push(`Location: ${e.location}`);
    if (e.category) parts.push(`Category: ${e.category}`);
    if (e.description) parts.push(e.description);
    return { text: parts.join("\n"), image: e.featured_image || null };
}

async function answerAnnouncements() {
    const [rows] = await pool.query(
        `SELECT title, content
         FROM announcements
         WHERE is_active = 1
           AND (start_date IS NULL OR start_date <= NOW())
           AND (expiry_date IS NULL OR expiry_date >= NOW())
         ORDER BY priority DESC, created_at DESC
         LIMIT 3`
    );
    if (!rows.length) return null;

    const text =
        "Current announcements:\n" +
        rows.map((a) => `• ${a.title}`).join("\n");
    return { text, image: null };
}

async function answerContact() {
    const [rows] = await pool.query(
        `SELECT address, phone_primary, phone_secondary, email_primary, email_secondary,
                office_hours, map_embed_url,
                facebook_url, twitter_url, instagram_url, linkedin_url,
                youtube_url, whatsapp_number
         FROM contact_info
         ORDER BY updated_at DESC
         LIMIT 1`
    );
    if (!rows.length) return null;

    const c = rows[0];
    const parts = [];
    if (c.address) parts.push(`Address: ${c.address}`);
    if (c.phone_primary) parts.push(`Phone: ${c.phone_primary}`);
    if (c.phone_secondary) parts.push(`Alternate phone: ${c.phone_secondary}`);
    if (c.email_primary) parts.push(`Email: ${c.email_primary}`);
    if (c.email_secondary) parts.push(`Alternate email: ${c.email_secondary}`);
    if (c.office_hours) parts.push(`Office hours: ${c.office_hours}`);

    const socials = [];
    if (c.facebook_url) socials.push(`Facebook: ${c.facebook_url}`);
    if (c.instagram_url) socials.push(`Instagram: ${c.instagram_url}`);
    if (c.twitter_url) socials.push(`Twitter/X: ${c.twitter_url}`);
    if (c.linkedin_url) socials.push(`LinkedIn: ${c.linkedin_url}`);
    if (c.youtube_url) socials.push(`YouTube: ${c.youtube_url}`);
    if (c.whatsapp_number) socials.push(`WhatsApp: ${c.whatsapp_number}`);
    if (socials.length) parts.push("\nFollow us:\n" + socials.join("\n"));

    return { text: parts.join("\n"), image: null };
}

async function answerAbout() {
    const [rows] = await pool.query(
        `SELECT title, short_description, full_content, mission, vision,
                core_values, founded_year, image_url
         FROM about_section
         ORDER BY updated_at DESC
         LIMIT 1`
    );
    if (!rows.length) return null;

    const a = rows[0];
    const parts = [];
    if (a.title) parts.push(a.title);
    if (a.short_description) parts.push(a.short_description);
    if (a.full_content) parts.push(a.full_content.slice(0, 500));
    if (a.founded_year) parts.push(`Founded in ${a.founded_year}.`);
    if (a.mission) parts.push(`Mission: ${a.mission}`);
    if (a.vision) parts.push(`Vision: ${a.vision}`);
    if (a.core_values) parts.push(`Core values: ${a.core_values}`);
    return { text: parts.join("\n\n"), image: a.image_url || null };
}

async function answerWhyChoose() {
    const [rows] = await pool.query(
        `SELECT title, description, icon
         FROM why_choose_features
         WHERE is_active = 1
         ORDER BY display_order ASC
         LIMIT 6`
    );
    if (!rows.length) return null;

    const text =
        "Why choose us:\n" +
        rows.map((f) => `• ${f.title} — ${f.description}`).join("\n");
    return { text, image: null };
}

async function answerCTA() {
    const [rows] = await pool.query(
        `SELECT title, description, primary_button_text, primary_button_link,
                secondary_button_text, secondary_button_link
         FROM cta_sections
         WHERE is_active = 1
         ORDER BY updated_at DESC
         LIMIT 1`
    );
    if (!rows.length) return null;

    const c = rows[0];
    const parts = [c.title || "Get started"];
    if (c.description) parts.push(c.description);
    const actions = [];
    if (c.primary_button_text) actions.push(`${c.primary_button_text} → ${c.primary_button_link || "/"}`);
    if (c.secondary_button_text) actions.push(`${c.secondary_button_text} → ${c.secondary_button_link || "/"}`);
    if (actions.length) parts.push("Options:\n" + actions.map((a) => `• ${a}`).join("\n"));
    return { text: parts.join("\n\n"), image: null };
}

async function answerHeroBanners() {
    const [rows] = await pool.query(
        `SELECT title, subtitle, description
         FROM hero_banners
         WHERE is_active = 1
         ORDER BY display_order ASC
         LIMIT 3`
    );
    if (!rows.length) return null;

    const text =
        "What's happening on our homepage:\n" +
        rows.map((b) => `• ${b.title}${b.subtitle ? ` — ${b.subtitle}` : ""}`).join("\n");
    return { text, image: null };
}

async function answerGallery() {
    const [cats] = await pool.query(
        `SELECT name,
                (SELECT COUNT(*) FROM gallery_images gi WHERE gi.category_id = gallery_categories.id AND gi.is_active = 1) AS image_count
         FROM gallery_categories
         WHERE is_active = 1
         ORDER BY display_order ASC`
    );
    if (!cats.length) return null;

    const text =
        "Our gallery categories:\n" +
        cats
            .map((c) => `• ${c.name} (${c.image_count} image${c.image_count === 1 ? "" : "s"})`)
            .join("\n") +
        "\n\nVisit the Gallery page to browse.";
    return { text, image: null };
}

/* =====================================================================
   INTENT MATCHING
   ===================================================================== */

// Word-boundary keyword matcher — prevents "event" matching "prevent"
function hasKeyword(text, kw) {
    // For multi-word keywords, fall back to plain includes
    if (kw.includes(" ")) return text.includes(kw);
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(text);
}

// Specific entity lookups run FIRST (they need to see the whole message),
// then category intents.
const INTENTS = [
    // High-priority specific handlers (dynamic lookups)
    { handler: answerProgramByName, priority: 100 },
    { handler: answerDepartmentByName, priority: 100 },
    { handler: answerNewsByTitle, priority: 100 },
    { handler: answerEventByTitle, priority: 100 },

    // Category handlers
    { keywords: ["program", "programs", "course", "courses", "study", "diploma", "degree"], handler: answerPrograms },
    { keywords: ["department", "departments", "faculty"], handler: answerDepartments },
    { keywords: ["news", "article", "articles", "headline"], handler: answerNews },
    { keywords: ["event", "events", "upcoming", "happening"], handler: answerEvents },
    { keywords: ["announcement", "announcements", "notice"], handler: answerAnnouncements },
    { keywords: ["contact", "phone", "email", "address", "reach", "location", "where"], handler: answerContact },
    { keywords: ["about", "mission", "vision", "founded", "history"], handler: answerAbout },
    { keywords: ["why", "choose", "benefit", "benefits", "advantage"], handler: answerWhyChoose },
    { keywords: ["apply", "register", "registering", "signup", "sign", "join", "cta"], handler: answerCTA },
    { keywords: ["banner", "banners", "hero", "homepage", "slideshow"], handler: answerHeroBanners },
    { keywords: ["gallery", "photo", "photos", "picture", "pictures", "images"], handler: answerGallery },
];

async function answerFromIntent(userMessage) {
    const lower = userMessage.toLowerCase();

    // First pass: dynamic entity handlers (only those with priority)
    for (const intent of INTENTS) {
        if (intent.priority && typeof intent.handler === "function" && !intent.keywords) {
            const result = await intent.handler(userMessage);
            if (result) return result;
        }
    }

    // Second pass: keyword-driven category handlers
    for (const intent of INTENTS) {
        if (!intent.keywords) continue;
        if (intent.keywords.some((kw) => hasKeyword(lower, kw))) {
            const result = await intent.handler(userMessage);
            if (result) return result;
        }
    }
    return null;
}

// Fallback: search the free-form knowledge base
async function answerFromKnowledge(userMessage) {
    const [rows] = await pool.query(
        `SELECT id, content, image_url,
                MATCH(title, content, keywords) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
         FROM ai_knowledge
         WHERE is_active = 1
           AND MATCH(title, content, keywords) AGAINST (? IN NATURAL LANGUAGE MODE)
         ORDER BY relevance DESC
         LIMIT 1`,
        [userMessage, userMessage]
    );
    if (!rows.length) return null;
    return { text: rows[0].content, image: rows[0].image_url, knowledgeId: rows[0].id };
}

/* =====================================================================
   ROUTES
   ===================================================================== */

// POST /api/client/ai-chat/start
router.post("/start", async (req, res) => {
    try {
        const sessionId = req.body.session_id || crypto.randomUUID();

        const [existing] = await pool.query(
            `SELECT id FROM ai_conversations WHERE session_id = ? LIMIT 1`,
            [sessionId]
        );

        if (!existing.length) {
            await pool.query(
                `INSERT INTO ai_conversations (session_id, user_ip, user_agent) VALUES (?, ?, ?)`,
                [sessionId, req.ip, req.headers["user-agent"] || null]
            );
        }

        res.json({ success: true, data: { session_id: sessionId } });
    } catch (err) {
        console.error("AI chat start error:", err);
        res.status(500).json({ success: false, error: "Failed to start conversation" });
    }
});

// GET /api/client/ai-chat/history/:sessionId
router.get("/history/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;

        const [conversation] = await pool.query(
            `SELECT id FROM ai_conversations WHERE session_id = ? LIMIT 1`,
            [sessionId]
        );

        if (!conversation.length) {
            return res.json({ success: true, data: [] });
        }

        const [messages] = await pool.query(
            `SELECT id, sender, message, image_url, created_at
             FROM ai_messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC`,
            [conversation[0].id]
        );

        res.json({ success: true, data: messages });
    } catch (err) {
        console.error("AI chat history error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch history" });
    }
});

// POST /api/client/ai-chat/message
router.post("/message", async (req, res) => {
    try {
        const { session_id, message } = req.body;

        if (!session_id || !message || !message.trim()) {
            return res
                .status(400)
                .json({ success: false, error: "session_id and message are required" });
        }
        const userText = message.trim();

        const [conversationRows] = await pool.query(
            `SELECT id FROM ai_conversations WHERE session_id = ? LIMIT 1`,
            [session_id]
        );

        let conversationId;
        if (conversationRows.length) {
            conversationId = conversationRows[0].id;
        } else {
            const [result] = await pool.query(
                `INSERT INTO ai_conversations (session_id, user_ip, user_agent) VALUES (?, ?, ?)`,
                [session_id, req.ip, req.headers["user-agent"] || null]
            );
            conversationId = result.insertId;
        }

        await pool.query(
            `INSERT INTO ai_messages (conversation_id, sender, message) VALUES (?, 'user', ?)`,
            [conversationId, userText]
        );

        // 1. Try to answer from live site data (specific entities first, then categories)
        let answer = null;
        try {
            answer = await answerFromIntent(userText);
        } catch (err) {
            console.error("Intent answer error:", err);
        }

        // 2. Fall back to the free-form knowledge base
        if (!answer) {
            try {
                answer = await answerFromKnowledge(userText);
            } catch (err) {
                console.error("Knowledge answer error:", err);
            }
        }

        // 3. Final fallback
        if (!answer) {
            answer = {
                text:
                    "I'm not sure about that yet — you can reach our admissions office for more details, or ask me about our programs, departments, news, events, gallery, or contact info.",
                image: null,
            };
        }

        await pool.query(
            `INSERT INTO ai_messages (conversation_id, sender, message, image_url, matched_knowledge_id)
             VALUES (?, 'bot', ?, ?, ?)`,
            [conversationId, answer.text, answer.image || null, answer.knowledgeId || null]
        );

        res.json({
            success: true,
            data: { text: answer.text, image_url: answer.image || null },
        });
    } catch (err) {
        console.error("AI chat message error:", err);
        res.status(500).json({ success: false, error: "Failed to process message" });
    }
});

module.exports = router;