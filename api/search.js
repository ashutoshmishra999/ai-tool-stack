/* Loadout — AI deep search proxy (Vercel serverless function).
 *
 * POST /api/search  { prompt, profile, stackIds }
 *   → { text, sources: [{title,url}], provider }
 *
 * Keeps the LLM API key server-side. Set ONE of these env vars in Vercel:
 *   GEMINI_API_KEY      (uses Gemini with Google Search grounding)
 *   ANTHROPIC_API_KEY   (uses Claude with the web_search tool)
 * Optional: AI_MODEL to override the default model, ALLOWED_ORIGIN to lock CORS.
 */
const MODELS = { gemini: "gemini-2.5-flash", claude: "claude-sonnet-4-20250514" };

module.exports = async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const prompt = body && typeof body.prompt === "string" ? body.prompt.slice(0, 8000) : "";
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    if (process.env.GEMINI_API_KEY) return res.status(200).json(await gemini(prompt));
    if (process.env.ANTHROPIC_API_KEY) return res.status(200).json(await claude(prompt));
    return res.status(503).json({ error: "No provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY." });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};

async function gemini(prompt) {
  const model = process.env.AI_MODEL || MODELS.gemini;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.4 } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
  const sources = (((cand.groundingMetadata || {}).groundingChunks) || []).map((c) => c.web && { title: c.web.title, url: c.web.uri }).filter(Boolean);
  return { text, sources, provider: "gemini" };
}

async function claude(prompt) {
  const model = process.env.AI_MODEL || MODELS.claude;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1500, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }], messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const blocks = data.content || [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const sources = [];
  blocks.forEach((b) => {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach((x) => { if (x.url) sources.push({ title: x.title, url: x.url }); });
    if (b.type === "text" && Array.isArray(b.citations)) b.citations.forEach((c) => { if (c.url) sources.push({ title: c.title, url: c.url }); });
  });
  return { text, sources, provider: "claude" };
}
