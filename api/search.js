/* Loadout — AI deep search proxy (Vercel serverless function).
 *
 * POST /api/search  { prompt, query, profile, stackIds }
 *   → { text, sources: [{title,url}], provider, ms }
 *
 * Speed-first: every configured web-search provider is called IN PARALLEL and
 * the first one that returns usable JSON wins (others are abandoned). Hard cap
 * TIMEOUT_MS so the result page never waits long.
 *
 * Env (Vercel → Settings → Environment Variables). Set at least one:
 *   GEMINI_API_KEY     Gemini + Google Search grounding      (fast, free tier)
 *   XAI_API_KEY        Grok + web_search (Responses API)     (fast)
 *   ANTHROPIC_API_KEY  Claude + web_search                   (slower; fallback)
 * Optional: GEMINI_MODEL, XAI_MODEL, CLAUDE_MODEL, ALLOWED_ORIGIN, SEARCH_TIMEOUT_MS
 */
const MODELS = {
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  grok: process.env.XAI_MODEL || "grok-4.3",
  claude: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
};
const TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS) || 9000;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const prompt = body && typeof body.prompt === "string" ? body.prompt.slice(0, 8000) : "";
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const providers = [];
  if (process.env.GEMINI_API_KEY) providers.push(["gemini", gemini]);
  if (process.env.XAI_API_KEY) providers.push(["grok", grok]);
  if (process.env.ANTHROPIC_API_KEY) providers.push(["claude", claude]);
  if (!providers.length) return res.status(503).json({ error: "No provider configured. Set GEMINI_API_KEY and/or XAI_API_KEY." });

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const winner = await firstValid(providers.map(([name, fn]) => fn(prompt, ctrl.signal).then((r) => Object.assign(r, { provider: name }))));
    ctrl.abort();                                 // cancel the losers
    return res.status(200).json(Object.assign(winner, { ms: Date.now() - t0 }));
  } catch (e) {
    const msg = Date.now() - t0 >= TIMEOUT_MS ? `Search timed out after ${TIMEOUT_MS} ms` : String((e && e.message) || e);
    return res.status(502).json({ error: msg.slice(0, 300), ms: Date.now() - t0 });
  } finally {
    clearTimeout(timer);
  }
};

/* Resolve with the first result whose text contains a JSON object with a non-empty `tools` array; reject only if all fail. */
function firstValid(promises) {
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    const errors = [];
    promises.forEach((p) => p.then((r) => {
      if (looksValid(r.text)) return resolve(r);
      throw new Error(`${r.provider}: response had no tools JSON`);
    }).catch((e) => {
      errors.push(String((e && e.message) || e).slice(0, 120));
      if (--pending === 0) reject(new Error(errors.join(" | ")));
    }));
  });
}
function looksValid(text) {
  const s = String(text || "").replace(/```json|```/g, ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return false;
  try { const o = JSON.parse(s.slice(a, b + 1)); return Array.isArray(o.tools) && o.tools.length > 0; } catch (_) { return false; }
}

async function gemini(prompt, signal) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3, maxOutputTokens: 2000 } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
  const sources = (((cand.groundingMetadata || {}).groundingChunks) || []).map((c) => c.web && { title: c.web.title, url: c.web.uri }).filter(Boolean);
  return { text, sources };
}

/* xAI Responses API with the server-side web_search tool. reasoning effort "none" keeps it fast. */
async function grok(prompt, signal) {
  const r = await fetch("https://api.x.ai/v1/responses", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({ model: MODELS.grok, input: [{ role: "user", content: prompt }], tools: [{ type: "web_search" }], include: ["no_inline_citations"], reasoning: { effort: "none" }, max_output_tokens: 2000 }),
  });
  if (!r.ok) throw new Error(`Grok ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  let text = typeof data.output_text === "string" ? data.output_text : "";
  const sources = [];
  (data.output || []).forEach((item) => {
    if (item.type !== "message") return;
    (item.content || []).forEach((c) => {
      if (c.type !== "output_text") return;
      if (!text) text += c.text || "";
      (c.annotations || []).forEach((a) => { if (a.url) sources.push({ title: a.title, url: a.url }); });
    });
  });
  (data.citations || []).forEach((u) => { if (typeof u === "string") sources.push({ url: u }); });
  return { text, sources };
}

async function claude(prompt, signal) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELS.claude, max_tokens: 2000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }], messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  const blocks = data.content || [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const sources = [];
  blocks.forEach((b) => {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach((x) => { if (x.url) sources.push({ title: x.title, url: x.url }); });
    if (b.type === "text" && Array.isArray(b.citations)) b.citations.forEach((c) => { if (c.url) sources.push({ title: c.title, url: c.url }); });
  });
  return { text, sources };
}
