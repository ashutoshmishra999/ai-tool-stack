/* Loadout — AI deep search.
 *
 * One live, web-grounded LLM call that turns the quiz answers into a search
 * query and returns a balanced set of REAL, established AI tools for this
 * person's exact role + work context + the one thing they want AI to crack.
 *
 * Speed: the search is kicked off EARLY (right after the focus question, when
 * role/work/tasks/focus are known) via `startEarly()`. By the time the user
 * reaches the result page it has usually already landed; `deepSearch()` just
 * awaits the in-flight promise. Hard client cap: 5 s on the result page.
 *
 * Providers:
 *   proxy   — POST to /api/search (default when deployed). The server races
 *             Gemini + Grok (+ Claude) and returns the first good answer.
 *   gemini  — direct browser call with google_search grounding   (dev only)
 *   grok    — direct browser call, xAI Responses API + web_search (dev only)
 *   claude  — direct browser call with web_search                 (dev only)
 *
 * Config precedence: window.LOADOUT_AI → localStorage("loadout.ai") → auto proxy.
 * Zero dependencies. Never throws into the UI — returns {ok:false, error}.
 */
(function (root) {
  "use strict";

  const STORAGE_KEY = "loadout.ai";
  const CACHE_KEY = "loadout.ai.cache";
  const RESULT_WAIT_MS = 5000;
  const MODELS = { gemini: "gemini-2.5-flash", grok: "grok-4.3", claude: "claude-sonnet-4-20250514" };

  /* ---------------------------------------------------------------- */
  /* Config                                                            */
  /* ---------------------------------------------------------------- */
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
      if (!cfg || !cfg.provider) root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ disabled: true }));
      else root.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }
  function isConfigured() {
    const c = getConfig();
    return !!(c.provider && (c.provider === "proxy" ? c.url : c.key));
  }

  /* ---------------------------------------------------------------- */
  /* Search query + prompt                                             */
  /* ---------------------------------------------------------------- */
  const label = (list, id) => ((list || []).find((x) => String(x.id) === String(id)) || {}).label || "";
  const labels = (list, ids) => (ids || []).map((id) => label(list, id)).filter(Boolean);

  /* Human-readable query built from the answer sequence. Shown to the user ("Searched: …"). */
  function buildQuery(profile) {
    const D = root.LoadoutData;
    const role = label(D.ROLES, profile.role).split(" / ")[0];
    const focus = (D.ALL_FOCUS.find((f) => f.id === profile.focus) || {}).label || "";
    const work = { company: "in-house", own: "for a small business owner", freelance: "for freelancers", student: "for students", between: "" }[profile.work] || "";
    const tasks = labels(D.TASKS, (profile.tasks || []).slice(0, 2)).map((t) => t.replace(/ \/ .*|\s*\(.*\)/g, "").toLowerCase());
    return ["best AI tools", role.toLowerCase(), work, focus ? `for "${focus.toLowerCase()}"` : "", tasks.length ? `(${tasks.join(", ")})` : "", String(new Date().getFullYear())].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  /* `ctx` = { profile, exclude: [names], summary? } — works both early (no engine result yet) and late. */
  function buildPrompt(ctx) {
    const D = root.LoadoutData;
    const p = ctx.profile;
    const role = label(D.ROLES, p.role) || "knowledge worker";
    const focus = (D.ALL_FOCUS.find((f) => f.id === p.focus) || {}).label || "working smarter with AI";
    const work = label(D.WORK, p.work);
    const tasks = labels(D.TASKS, p.tasks);
    const budget = label(D.BUDGET, p.budget);
    const tech = label(D.TECH, p.tech);
    const platforms = labels(D.ECOSYSTEM, p.ecosystem);
    const exclude = (ctx.exclude || []).concat(labels(D.AI_TOOL_GROUPS.flatMap((g) => g.options), p.aiTools));

    return `You are a senior AI-tooling analyst. Use web search, then answer FAST with JSON only.

SEARCH QUERY: ${buildQuery(p)}

THE PERSON
- Role: ${role}${work ? ` · ${work}` : ""}
- The ONE thing they most want AI to crack: "${focus}"
- Where their week goes: ${tasks.join(", ") || "not specified"}${tech ? `\n- Comfort learning new tools: ${tech}` : ""}${budget ? `\n- Budget per tool: ${budget}` : ""}${platforms.length ? `\n- Platforms they already live in: ${platforms.join(", ")}` : ""}

DO NOT SUGGEST (already recommended or already used): ${exclude.join(", ") || "none"}

TASK
Recommend exactly 6 AI tools that are specifically strong for "${focus}" in ${role} work. Balance the mix like this:
- 2 "mainstream" — well-known, safe picks (but NOT the ones excluded above)
- 2 "power-user" — tools practitioners in this field swear by but most people haven't tried
- 2 "niche" — specialist tools built for this exact job; the person should feel they just learned a new name

HARD RULES
- Real, currently available products with a working homepage URL.
- ESTABLISHED only: company 2+ years old, OR with meaningful funding / a real team / a large user base. Skip anything that looks like a weekend project or could vanish in weeks. Put the evidence in "company" (e.g. "Jasper AI · est. 2021 · $125M raised").
- Every "why" must reference THIS person's role and their "${focus}" goal in concrete terms — not generic praise.
- Respect budget and technical comfort.

Respond with ONLY valid JSON, no markdown fences, no prose, exactly this shape:
{"query":"the search query you used","tools":[{"name":"","url":"https://","tier":"mainstream|power-user|niche","what":"one line: what it is","why":"one line: why it fits this ${role} for ${focus}","company":"company · founded year · funding or scale","pricing":"short, e.g. Free tier · from $20/mo","fit":85}],"insight":"one punchy sentence about this person's AI opportunity"}`;
  }
  /* ---------------------------------------------------------------- */
  /* Providers (direct-browser variants are for local dev only)        */
  /* ---------------------------------------------------------------- */
  async function callGemini(cfg, prompt, signal) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model || MODELS.gemini}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3 } }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).map((x) => x.text || "").join("");
    const sources = (((cand.groundingMetadata || {}).groundingChunks) || []).map((c) => c.web && { title: c.web.title, url: c.web.uri }).filter(Boolean);
    return { text, sources };
  }

  async function callGrok(cfg, prompt, signal) {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model || MODELS.grok, input: [{ role: "user", content: prompt }], tools: [{ type: "web_search" }], include: ["no_inline_citations"], reasoning: { effort: "none" } }),
    });
    if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    let text = typeof data.output_text === "string" ? data.output_text : "";
    const sources = [];
    (data.output || []).forEach((item) => (item.content || []).forEach((c) => {
      if (c.type !== "output_text") return;
      if (!text) text += c.text || "";
      (c.annotations || []).forEach((a) => { if (a.url) sources.push({ title: a.title, url: a.url }); });
    }));
    (data.citations || []).forEach((u) => { if (typeof u === "string") sources.push({ url: u }); });
    return { text, sources };
  }

  async function callClaude(cfg, prompt, signal) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: cfg.model || MODELS.claude, max_tokens: 2000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }], messages: [{ role: "user", content: prompt }] }),
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

  async function callProxy(cfg, prompt, ctx, signal) {
    const res = await fetch(cfg.url, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, query: buildQuery(ctx.profile), profile: ctx.profile, exclude: ctx.exclude || [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Proxy ${res.status}`);
    if (data && Array.isArray(data.tools)) return { text: JSON.stringify(data), sources: data.sources || [], provider: data.provider };
    return { text: data.text || "", sources: data.sources || [], provider: data.provider };
  }

  /* ---------------------------------------------------------------- */
  /* Parse                                                             */
  /* ---------------------------------------------------------------- */
  const TIERS = { mainstream: "mainstream", "power-user": "power-user", poweruser: "power-user", power: "power-user", niche: "niche" };
  function parseJson(text) {
    const cleaned = String(text || "").replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("No JSON in model response");
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(obj.tools)) throw new Error("Malformed response");
    obj.tools = obj.tools.slice(0, 6).map((t) => ({
      name: String(t.name || "").slice(0, 60),
      url: /^https?:\/\//.test(t.url || "") ? t.url : "",
      tier: TIERS[String(t.tier || "").toLowerCase().replace(/\s|_/g, "-")] || "niche",
      what: String(t.what || "").slice(0, 200),
      why: String(t.why || "").slice(0, 260),
      company: String(t.company || "").slice(0, 120),
      pricing: String(t.pricing || "").slice(0, 60),
      fit: Math.max(50, Math.min(99, Number(t.fit) || 80)),
    })).filter((t) => t.name);
    obj.insight = String(obj.insight || "").slice(0, 240);
    obj.query = String(obj.query || "").slice(0, 200);
    return obj;
  }
  function dedupe(sources) {
    const seen = new Set();
    return (sources || []).filter((s) => { if (!s || !s.url || seen.has(s.url)) return false; seen.add(s.url); return true; });
  }
  /* ---------------------------------------------------------------- */
  /* Run — early start, cache, 5 s result-page cap                      */
  /* ---------------------------------------------------------------- */
  function cacheKey(profile) {
    return [profile.role, profile.work, profile.focus, (profile.tasks || []).slice(0, 3).join(".")].join("|");
  }
  function readCache(key) {
    try { const c = JSON.parse(root.localStorage.getItem(CACHE_KEY) || "null"); if (c && c.key === key && c.data && Date.now() - (c.at || 0) < 7 * 864e5) return c.data; } catch (_) {}
    return null;
  }
  function writeCache(key, data) { try { root.localStorage.setItem(CACHE_KEY, JSON.stringify({ key, data, at: Date.now() })); } catch (_) {} }

  let inflight = null;   // { key, promise, startedAt }

  async function run(ctx) {
    const cfg = getConfig();
    const t0 = Date.now();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 20000);
    try {
      const prompt = buildPrompt(ctx);
      const signal = ctrl ? ctrl.signal : undefined;
      const raw = cfg.provider === "gemini" ? await callGemini(cfg, prompt, signal)
        : cfg.provider === "grok" ? await callGrok(cfg, prompt, signal)
        : cfg.provider === "claude" ? await callClaude(cfg, prompt, signal)
        : await callProxy(cfg, prompt, ctx, signal);
      const parsed = parseJson(raw.text);
      const excl = new Set((ctx.exclude || []).map((n) => n.toLowerCase()));
      parsed.tools = parsed.tools.filter((t) => !excl.has(t.name.toLowerCase()));
      if (!parsed.tools.length) throw new Error("No new tools found");
      return { ok: true, tools: parsed.tools, insight: parsed.insight, query: parsed.query || buildQuery(ctx.profile), sources: dedupe(raw.sources).slice(0, 8), provider: raw.provider || cfg.provider, ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: (e && e.name === "AbortError") ? "timeout" : ((e && e.message) || "failed"), ms: Date.now() - t0 };
    } finally { clearTimeout(timer); }
  }

  /* Kick off the search as soon as role/work/tasks/focus are known. Idempotent per profile key. */
  function startEarly(profile, exclude) {
    if (!isConfigured() || !profile || !profile.focus) return null;
    const key = cacheKey(profile);
    if (readCache(key)) return null;
    if (inflight && inflight.key === key) return inflight.promise;
    const promise = run({ profile, exclude: exclude || [] }).then((res) => { if (res.ok) writeCache(key, res); return res; });
    inflight = { key, promise, startedAt: Date.now() };
    return promise;
  }

  /* Called on the result page. Returns cached → in-flight (≤ 5 s wait) → fresh call (≤ 5 s). */
  async function deepSearch(ctx, opts = {}) {
    if (!isConfigured()) return { ok: false, error: "not_configured" };
    const key = cacheKey(ctx.profile);
    if (!opts.force) {
      const cached = readCache(key);
      if (cached) return Object.assign({ cached: true }, cached);
    }
    let p = (!opts.force && inflight && inflight.key === key) ? inflight.promise : null;
    if (!p) { p = run(ctx).then((res) => { if (res.ok) writeCache(key, res); return res; }); inflight = { key, promise: p, startedAt: Date.now() }; }
    const wait = Math.max(0, opts.waitMs !== undefined ? opts.waitMs : RESULT_WAIT_MS);
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout", pending: p }), wait));
    return Promise.race([p, timeout]);
  }

  root.LoadoutAI = { getConfig, setConfig, isConfigured, buildQuery, buildPrompt, cacheKey, startEarly, deepSearch, parseJson, MODELS, RESULT_WAIT_MS };
})(typeof window !== "undefined" ? window : globalThis);
