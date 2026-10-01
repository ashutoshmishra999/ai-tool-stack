/* Loadout — AI deep search.
 *
 * One live LLM call at the end of the flow: given the full profile (role,
 * work context, the one thing they want AI to crack, tasks, goals, maturity,
 * budget, platforms) + the tools we already recommended, ask a web-grounded
 * model for 3 *additional* tools that fit, with sources.
 *
 * Providers:
 *   gemini  — Generative Language API with the `google_search` grounding tool
 *   claude  — Anthropic Messages API with the `web_search` server tool
 *   proxy   — POST the same payload to your own backend (recommended in prod,
 *             so API keys never ship to the browser)
 *
 * Config precedence: window.LOADOUT_AI → localStorage("loadout.ai") → none.
 * Zero dependencies. Never throws into the UI — returns {ok:false, error}.
 */
(function (root) {
  "use strict";

  const STORAGE_KEY = "loadout.ai";
  const MODELS = {
    gemini: "gemini-2.5-flash",
    claude: "claude-sonnet-4-20250514",
  };

  /* Default proxy: when deployed (not file:// or localhost), use the same-origin
   * serverless function in /api/search.js so no key ever reaches the browser.
   * Override with window.LOADOUT_AI = { provider, key|url } or the on-page form. */
  function defaultProxy() {
    try {
      const loc = root.location;
      if (!loc || loc.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) return null;
      return { provider: "proxy", url: "/api/search", auto: true };
    } catch (_) { return null; }
  }
  function getConfig() {
    if (root.LOADOUT_AI && root.LOADOUT_AI.provider) return root.LOADOUT_AI;
    let stored = null;
    try { stored = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) {}
    if (stored && stored.provider) return stored;
    if (stored && stored.disabled) return {};
    return defaultProxy() || {};
  }
  function setConfig(cfg) {
    try {
      /* null → "user wants to choose": remember that so the auto-proxy default doesn't re-apply. */
      if (!cfg || !cfg.provider) root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ disabled: true }));
      else root.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }
  function isConfigured() {
    const c = getConfig();
    return !!(c.provider && (c.provider === "proxy" ? c.url : c.key));
  }

  /* ---------------------------------------------------------------- */
  /* Prompt                                                            */
  /* ---------------------------------------------------------------- */
  function buildPrompt(result) {
    const D = root.LoadoutData;
    const p = result.profile, s = result.summary;
    const lbl = (list, ids) => (ids || []).map((id) => (list.find((x) => String(x.id) === String(id)) || {}).label).filter(Boolean);
    const exclude = [
      ...result.stack.map((x) => x.tool.name),
      ...result.layers.flatMap((L) => L.tools.filter((t) => t.owned).map((t) => t.tool.name)),
    ];
    const budget = (D.BUDGET.find((b) => b.id === p.budget) || {}).label || "unknown";

    return `You are an expert AI-tooling analyst. Use web search to find CURRENT, real, actively-maintained AI tools (launched or updated in the last 12 months count as a plus).

PERSON
- Work context: ${s.workLabel || "unknown"}
- Role: ${s.roleLabel}
- The ONE thing they most want AI to crack: "${s.focusLabel || "not specified"}"
- Where their week goes: ${lbl(D.TASKS, p.tasks).join(", ") || "unknown"}
- Goals: ${lbl(D.GOALS, p.goals).join(", ") || "unknown"}
- Wants AI help with: ${lbl(D.USE_CASES, p.useCases).join(", ") || "unknown"}
- AI maturity: ${s.maturityLabel}; technical comfort: ${s.techLabel}
- Platforms they already use: ${lbl(D.ECOSYSTEM, p.ecosystem).join(", ") || "none listed"}
- What makes them pick a tool: ${lbl(D.PREFS, p.prefs).join(", ") || "unspecified"}
- Monthly budget per tool: ${budget}

ALREADY RECOMMENDED OR OWNED (do NOT suggest these): ${exclude.join(", ")}

TASK
Search the web and recommend exactly 3 additional AI tools that are specifically strong for "${s.focusLabel}" for a ${s.roleLabel.toLowerCase()}. Prefer specialist / newer tools over the famous general assistants. Respect the budget and technical comfort. Each tool must be real, with a working homepage URL.

Respond with ONLY valid JSON (no markdown fences, no prose) in this exact shape:
{"tools":[{"name":"","url":"","what":"one line: what it is","why":"one line: why it fits THIS person's focus and context","pricing":"short, e.g. Free tier · from $20/mo","fit":85}],"insight":"one punchy sentence about this person's AI opportunity"}`;
  }

  /* ---------------------------------------------------------------- */
  /* Providers                                                         */
  /* ---------------------------------------------------------------- */
  async function callGemini(cfg, prompt) {
    const model = cfg.model || MODELS.gemini;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).map((x) => x.text || "").join("");
    const sources = (((cand.groundingMetadata || {}).groundingChunks) || [])
      .map((c) => c.web && { title: c.web.title, url: c.web.uri }).filter(Boolean);
    return { text, sources };
  }

  async function callClaude(cfg, prompt) {
    const model = cfg.model || MODELS.claude;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const blocks = data.content || [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    const sources = [];
    blocks.forEach((b) => {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach((r) => { if (r.url) sources.push({ title: r.title, url: r.url }); });
      if (b.type === "text" && Array.isArray(b.citations)) b.citations.forEach((c) => { if (c.url) sources.push({ title: c.title, url: c.url }); });
    });
    return { text, sources };
  }

  async function callProxy(cfg, prompt, result) {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, profile: result.profile, stackIds: result.stack.map((x) => x.tool.id) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Proxy ${res.status}`);
    /* Proxy may return either {text, sources} or the parsed shape directly. */
    if (data && Array.isArray(data.tools)) return { text: JSON.stringify(data), sources: data.sources || [] };
    return { text: data.text || "", sources: data.sources || [] };
  }

  /* ---------------------------------------------------------------- */
  /* Parse + public API                                                */
  /* ---------------------------------------------------------------- */
  function parseJson(text) {
    const cleaned = String(text || "").replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("No JSON in model response");
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(obj.tools)) throw new Error("Malformed response");
    obj.tools = obj.tools.slice(0, 3).map((t) => ({
      name: String(t.name || "").slice(0, 60),
      url: /^https?:\/\//.test(t.url || "") ? t.url : "",
      what: String(t.what || "").slice(0, 200),
      why: String(t.why || "").slice(0, 240),
      pricing: String(t.pricing || "").slice(0, 60),
      fit: Math.max(50, Math.min(99, Number(t.fit) || 80)),
    })).filter((t) => t.name);
    obj.insight = String(obj.insight || "").slice(0, 240);
    return obj;
  }

  const CACHE_KEY = "loadout.ai.cache";
  function cacheKey(result) {
    const p = result.profile;
    return [p.role, p.work, p.focus, (p.tasks || []).join("."), p.budget, p.maturity].join("|");
  }

  async function deepSearch(result, opts = {}) {
    const cfg = getConfig();
    if (!isConfigured()) return { ok: false, error: "not_configured" };
    const key = cacheKey(result);
    if (!opts.force) {
      try { const c = JSON.parse(root.localStorage.getItem(CACHE_KEY) || "null"); if (c && c.key === key && c.data) return Object.assign({ ok: true, cached: true }, c.data); } catch (_) {}
    }
    const prompt = buildPrompt(result);
    try {
      const raw = cfg.provider === "gemini" ? await callGemini(cfg, prompt)
        : cfg.provider === "claude" ? await callClaude(cfg, prompt)
        : await callProxy(cfg, prompt, result);
      const parsed = parseJson(raw.text);
      const data = { tools: parsed.tools, insight: parsed.insight, sources: dedupe(raw.sources).slice(0, 6), provider: cfg.provider };
      try { root.localStorage.setItem(CACHE_KEY, JSON.stringify({ key, data })); } catch (_) {}
      return Object.assign({ ok: true }, data);
    } catch (e) {
      return { ok: false, error: (e && e.message) || "failed" };
    }
  }

  function dedupe(sources) {
    const seen = new Set();
    return (sources || []).filter((s) => { if (!s || !s.url || seen.has(s.url)) return false; seen.add(s.url); return true; });
  }

  root.LoadoutAI = { getConfig, setConfig, isConfigured, buildPrompt, deepSearch, parseJson, MODELS };
})(typeof window !== "undefined" ? window : globalThis);
