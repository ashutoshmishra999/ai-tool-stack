/* Loadout engine smoke test.  Run:  node loadout/smoke.js
 * Pushes the PRD archetypes through the engine and prints their stacks so
 * we can eyeball that Marketer ≠ Developer ≠ Student, and asserts a few
 * invariants (counts, no owned tools, hard filters respected). */
require("./data.js");
require("./tools.js");
require("./engine.js");
require("./ai.js");

const { recommend } = globalThis.LoadoutEngine;
const TOOLS = globalThis.LoadoutTools;

const PROFILES = {
  "Marketing manager (regular user, Google, affordable)": {
    firstName: "Priya", work: "company", role: "marketing", focus: "content_volume", tasks: ["content", "research", "writing", "admin", "presentations"],
    goals: ["save_time", "better_content"], useCases: ["content", "research", "image", "automation", "marketing"],
    maturity: 3, aiTools: ["chatgpt"], ecosystem: ["google", "canva", "slack"], tech: 3, prefs: ["easy", "time", "affordable"], invest: "B", budget: "b2",
  },
  "Software developer (power user, technical)": {
    firstName: "Arjun", work: "company", role: "engineering", focus: "build_agents", tasks: ["coding", "research", "planning", "meetings"],
    goals: ["build_faster", "quality"], useCases: ["coding", "building", "agents", "research"],
    maturity: 4, aiTools: ["chatgpt", "github-copilot"], ecosystem: ["slack", "jira", "notion"], tech: 5, prefs: ["quality", "powerful"], invest: "C", budget: "b3",
  },
  "Student (exploring, free only)": {
    firstName: "Meera", work: "student", role: "student", focus: "study_faster", tasks: ["learning", "research", "writing", "presentations"],
    goals: ["learn_faster", "save_time"], useCases: ["learning", "research", "writing", "presentations"],
    maturity: 2, aiTools: ["chatgpt"], ecosystem: ["google"], tech: 2, prefs: ["affordable", "easy"], invest: "A", budget: "b0",
  },
  "Finance analyst (Microsoft, keep it simple)": {
    firstName: "Rohan", work: "company", role: "finance", focus: "models", tasks: ["spreadsheets", "analysis", "writing", "meetings"],
    goals: ["decisions", "save_time"], useCases: ["data", "documents", "writing"],
    maturity: 2, aiTools: [], ecosystem: ["microsoft", "sheets"], tech: 1, prefs: ["easy", "privacy", "integrates"], invest: "B", budget: "b2",
  },
  "Sales lead (HubSpot, all-in)": {
    firstName: "Neha", work: "company", role: "sales", focus: "prospecting", tasks: ["sales", "meetings", "writing", "customer", "research"],
    goals: ["earn_more", "save_time"], useCases: ["sales", "automation", "research"],
    maturity: 3, aiTools: ["chatgpt", "gemini"], ecosystem: ["hubspot", "google", "whatsapp"], tech: 3, prefs: ["automate", "integrates"], invest: "D", budget: "b4",
  },
  "Creator (video heavy)": {
    firstName: "Kabir", work: "own", role: "creator", focus: "video_edit", tasks: ["video", "content", "visuals", "writing"],
    goals: ["better_content", "earn_more"], useCases: ["video", "content", "image", "voice"],
    maturity: 3, aiTools: ["chatgpt", "canva"], ecosystem: ["none"], tech: 2, prefs: ["easy", "quality"], invest: "C", budget: "b3",
  },
  "Empty-ish profile (robustness)": {
    firstName: "", work: null, role: "other", focus: null, tasks: ["other"], goals: [], useCases: ["other"], maturity: 1, aiTools: ["none"], ecosystem: ["none"], tech: 1, prefs: [], invest: "A", budget: "b0",
  },
};

let failures = 0;
const fail = (msg) => { failures++; console.log("   ✗ " + msg); };

for (const [name, p] of Object.entries(PROFILES)) {
  const r = recommend(p);
  console.log(`\n=== ${name} ===`);
  console.log("   " + r.summary.headline + (r.summary.focusLabel ? `  [focus: ${r.summary.focusLabel}]` : ""));
  r.stack.forEach((s) => console.log(`   ${String(s.rank).padStart(2, "0")}  ${s.tool.name.padEnd(18)} ${s.fit}%  [${s.tool.layer}]  ${s.why}`));
  console.log("   Layers:    " + r.layers.map((L) => `${L.label}: ${L.tools.map((t) => t.tool.name + (t.owned ? "*" : "")).join("/")}`).join("  |  "));
  console.log("   Workflows: " + (r.workflows.map((w) => `${w.title} (${w.tools.map((t) => t.name).join(" → ")})`).join("; ") || "none"));
  console.log("   Gaps:      " + (r.gaps.map((g) => g.title + (g.fix ? ` → ${g.fix}` : "")).join("; ") || "none"));
  console.log("   Path:      " + r.learningPath.map((m) => m.title).join(" → "));
  console.log(`   Maturity ${r.summary.maturityScore}/10 · ~${r.summary.hoursSaved} h/week · ₹${r.summary.monthlyEstimate}/mo if all paid`);

  /* Invariants */
  if (r.stack.length < 5 || r.stack.length > 8) fail(`stack size ${r.stack.length} outside 5–8`);
  const owned = new Set((p.aiTools || []).filter((x) => x !== "none" && x !== "other"));
  r.stack.forEach((s) => { if (owned.has(s.tool.id)) fail(`recommended owned tool ${s.tool.id}`); });
  const subs = r.stack.map((s) => s.tool.sub);
  if (new Set(subs).size !== subs.length) fail("duplicate sub-category in stack");
  if (p.invest === "A") r.stack.forEach((s) => { if (!s.tool.free) fail(`non-free tool ${s.tool.id} for free-only user`); });
  r.stack.forEach((s) => { if (s.tool.difficulty > p.tech + 1) fail(`${s.tool.id} difficulty ${s.tool.difficulty} > tech+1`); });
  if (!r.workflows.length && p.role !== "other") fail("no workflows generated");
  if (!r.learningPath.length) fail("no learning path");
}

/* Differentiation check: marketer vs developer vs student should barely overlap. */
const ids = (p) => new Set(recommend(p).stack.map((s) => s.tool.id));
const m = ids(PROFILES["Marketing manager (regular user, Google, affordable)"]);
const d = ids(PROFILES["Software developer (power user, technical)"]);
const s = ids(PROFILES["Student (exploring, free only)"]);
const overlap = (a, b) => [...a].filter((x) => b.has(x)).length;
console.log(`\nOverlap  marketer∩dev=${overlap(m, d)}  marketer∩student=${overlap(m, s)}  dev∩student=${overlap(d, s)}`);
if (overlap(m, d) > 2) fail("marketer and developer stacks too similar");
if (overlap(d, s) > 2) fail("developer and student stacks too similar");

/* Data integrity */
const seen = new Set();
TOOLS.forEach((t) => {
  if (seen.has(t.id)) fail(`duplicate tool id ${t.id}`); seen.add(t.id);
  ["difficulty", "minMaturity", "quality", "ease"].forEach((k) => { if (typeof t[k] !== "number") fail(`${t.id}.${k} missing`); });
  if (!t.caps || !Object.keys(t.caps).length) fail(`${t.id} has no caps`);
});
const q6 = globalThis.LoadoutData.AI_TOOL_GROUPS.flatMap((g) => g.options.map((o) => o.id)).filter((id) => id !== "other" && id !== "none");
q6.forEach((id) => { if (!seen.has(id)) fail(`Q6 option ${id} has no tool record`); });

/* Data: every role has focus options with emoji; every option everywhere has an emoji; facts reference real questions. */
const DD = globalThis.LoadoutData;
DD.ROLES.forEach((r) => { const f = DD.focusOptions(r.id); if (!f || f.length < 4) fail(`role ${r.id} has <4 focus options`); f.forEach((o) => { if (!o.emoji || !o.caps) fail(`focus ${o.id} missing emoji/caps`); }); });
if (new Set(DD.ALL_FOCUS.map((o) => o.id)).size !== DD.ALL_FOCUS.length) fail("duplicate focus ids across roles");
[DD.WORK, DD.ROLES, DD.TASKS, DD.GOALS, DD.USE_CASES, DD.MATURITY, DD.TECH, DD.ECOSYSTEM, DD.PREFS, DD.INVEST, ...DD.AI_TOOL_GROUPS.map((g) => g.options)].forEach((list) => list.forEach((o) => { if (!o.emoji) fail(`option ${o.id} has no emoji`); }));
DD.FACTS.forEach((f) => { if (!DD.QUESTIONS.find((q) => q.id === f.after)) fail(`fact after unknown question ${f.after}`); });
if (DD.QUESTIONS.length !== 12) fail(`expected 12 questions, got ${DD.QUESTIONS.length}`);

/* Focus must actually move the engine: same marketer, two different focus picks → different stacks. */
const base = PROFILES["Marketing manager (regular user, Google, affordable)"];
const a = ids(Object.assign({}, base, { focus: "visuals_fast" }));
const b = ids(Object.assign({}, base, { focus: "performance" }));
console.log(`Focus sensitivity: visuals_fast vs performance overlap=${overlap(a, b)}/${a.size}`);
if (overlap(a, b) === a.size) fail("focus answer has no effect on the stack");

/* AI module: prompt builds offline; parser is tolerant of fenced / noisy JSON; not configured → graceful. */
const AIM = globalThis.LoadoutAI;
const baseRes = recommend(base);
const earlyEx = globalThis.LoadoutEngine.earlyExclude({ work: base.work, role: base.role, tasks: base.tasks, focus: base.focus });
if (!earlyEx.length) fail("earlyExclude returned nothing for a partial profile");
const query = AIM.buildQuery(base);
console.log(`Search query: ${query}`);
if (!/marketing/i.test(query) || !/10× content/i.test(query)) fail(`search query missing role or focus: ${query}`);
const prompt = AIM.buildPrompt({ profile: base, exclude: baseRes.stack.map((x) => x.tool.name) });
if (!prompt.includes("10× content") || !prompt.includes("DO NOT SUGGEST") || !prompt.includes(baseRes.stack[0].tool.name)) fail("AI prompt missing focus or exclusion list");
if (!/mainstream/.test(prompt) || !/power-user/.test(prompt) || !/niche/.test(prompt) || !/ESTABLISHED/.test(prompt)) fail("AI prompt missing tier mix / established-company rules");
const parsed = AIM.parseJson('Sure! ```json\n{"query":"q","tools":[{"name":"Jasper","url":"https://jasper.ai","tier":"Power User","what":"x","why":"y","company":"Jasper · 2021","pricing":"$39","fit":"91"},{"name":"","url":"nope"}],"insight":"go"}\n```');
if (parsed.tools.length !== 1 || parsed.tools[0].fit !== 91 || parsed.tools[0].tier !== "power-user" || parsed.query !== "q") fail("AI parser failed on fenced JSON / tier normalisation");
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
if (AIM.startEarly(base, []) !== null) fail("startEarly should be a no-op when not configured");
AIM.deepSearch({ profile: base, exclude: [] }).then((res) => { if (res.ok || res.error !== "not_configured") fail("deepSearch should report not_configured"); });
/* Lead + search API handlers parse and reject bad input without network. */
const mkRes = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, json(o) { this.o = o; return this; }, end() { return this; } });
const leadFn = require("../api/lead.js"), searchFn = require("../api/search.js");
(async () => {
  let r = mkRes(); await leadFn({ method: "POST", headers: {}, body: { email: "bad" } }, r); if (r.c !== 400) fail("lead: invalid email should 400");
  r = mkRes(); await leadFn({ method: "POST", headers: {}, body: { email: "a@b.co", stage: "focus", profile: { role: "marketing" } } }, r); if (r.c !== 200 || !r.o.ok) fail("lead: valid email should 200 ok");
  r = mkRes(); await searchFn({ method: "POST", headers: {}, body: { prompt: "x" } }, r); if (r.c !== 503) fail("search: no keys should 503");
})();

setTimeout(() => { console.log(`\n${TOOLS.length} tools in DB. ${failures ? failures + " FAILURE(S)" : "All checks passed."}`); process.exit(failures ? 1 : 0); }, 20);
