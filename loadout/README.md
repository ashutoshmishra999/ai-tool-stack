# Loadout — AI Stack Builder

> Tell us how you work. We'll build the AI stack you actually need.

A zero-dependency, static prototype of the 12-question AI stack assessment, in a **neo-brutalist white + red** UI (Coursiv-style high-retention flow: big emoji option rows, auto-advance on single picks, fact interstitials between questions, a counting progress ring, a partial-reveal snapshot before email, and one live **AI deep search** at the end). Serve the folder with any static server (`python3 -m http.server 8787`).

## Files

| File | Purpose |
|---|---|
| `index.html` | Single-page shell: landing → name → 12 questions (+4 fact interstitials) → analyzing → snapshot + partial reveal + email → full result (+ AI deep search) → optional WhatsApp |
| `styles.css` | Neo-brutalist design system: white paper + `#ff2d2d` red, 3px black borders, hard offset shadows, Archivo Black + Space Grotesk, emoji-first options |
| `data.js` | The 12 questions + vocabularies (work context, roles, tasks→capability map, **role-dependent focus options** (`FOCUS_BY_ROLE`), goals, use cases, layers, budget tiers) + `FACTS` interstitials. Every option has an `emoji` |
| `ai.js` | **AI deep search** — builds the search query from the answers, starts the web-grounded call early (after Q4), returns 6 tiered tools (mainstream / power-user / niche) for the user’s role + focus, ≤ 5 s on the result page |
| `../api/search.js` | Vercel function: races Gemini + Grok (+ Claude) web search server-side, first valid JSON wins |
| `../api/lead.js` | Vercel function: validates leads and forwards to `LEAD_WEBHOOK_URL` |
| `tools.js` | Tool database (58 tools). Each has use-case-level `caps`, per-role `roles`, difficulty, min maturity, pricing, integrations |
| `engine.js` | Recommendation engine — pure, deterministic, runs in browser and Node |
| `app.js` | UI state machine, rendering, keyboard nav, lead capture, share links, analytics hooks |
| `smoke.js` | `node loadout/smoke.js` — runs 7 archetypes through the engine and asserts invariants |
| `e2e.js` | `node loadout/e2e.js` — drives the full UI in headless Chrome via CDP (75 checks, incl. facts, role-dependent focus, AI block states, share round-trip, mobile overflow) |
| `.shots.js` | `node loadout/.shots.js` — screenshots of each screen to `/tmp/loadout-shots` |

## How the engine works (`engine.js`)

1. **Demand vector** — tasks (weight 1.0) + use cases (1.0) + **focus (1.2 — the "one thing to crack" answer is the strongest single signal)** + goals (0.35) + role baseline, normalised 0–1 per capability. Tasks outweigh role, per the PRD.
2. **Hard filters** — drop tools the user already uses, tools over budget, tools above `tech + 1` difficulty, tools above `maturity + 1`, specialist tools not built for their role.
3. **Scoring** — weighted blend of use-case fit, role fit, skill fit, maturity fit, integration fit (native ecosystem gets a big boost), budget fit, quality. Q9 preferences re-weight the blend so two identical roles diverge.
4. **Diversity pick** — 5–8 tools (count scales with maturity), one per sub-category, capped per layer, guaranteed general assistant unless they own one, plus a coverage pass ensuring every strongly-demanded capability has a tool that's ≥8/10 at it.
5. **Workflows** — 13 templates with capability slots, filled from recommended + owned tools + the user's platforms (Google Docs, Notion, HubSpot…) as destinations.
6. **Gaps**, **learning path**, **maturity score**, **hours saved**, and templated narrative copy.

`result.debug` exposes the top-15 ranked scores for tuning.

## The flow (what the user sees)

1. **Landing** — big red "WHAT'S YOUR AI STACK?", LET'S GO.
2. **Name** (skippable).
3. **Q1** How would you describe yourself? (company / own business / freelance / studying / exploring)
4. **Q2** Role → **⚡ Fact: 40% of working hours can be augmented by AI**
5. **Q3** Where does your week go? (up to 5)
6. **Q4** *If AI could crack one thing for you…* — **options depend on the role picked in Q2** (5 per role, 18 roles). The moment this is answered the **live web search starts in the background**.
7. **🔴 Contact capture** — "LIVE SEARCH STARTED · Ashutosh, we're on it." Shows the exact search query being run, then asks *where to send the results + full stack*: email (required) + WhatsApp number (optional). Skippable ("Continue without saving my results"). This is the only ask — it's framed as delivery, not a gate, and it's true: the search really is running.
8. **Q5** Goals → **🧠 Dynamic fact: "~Nh a week you could claw back"**
9. **Q6** Use cases · **Q7** Maturity · **Q8** Tools used → **🔭 Fact: 500+ tools** · **Q9** Platforms · **Q10** Tech comfort → **🏆 Fact: 66% productivity lift** · **Q11** Preferences · **Q12** Invest + budget (BUILD MY STACK)
10. **Analyzing** — ring counts 0→100%; the card says "Live search done/running: {focus}".
11. **Snapshot** — AI level gauge + Potential % + 3 tools revealed / rest locked. If contact was captured: "Heading to your inbox + WhatsApp → REVEAL MY FULL STACK". Otherwise the old email gate (skippable).
12. **Result** — profile grid, narrative, ranked stack, **AI deep search block**, layers, workflows, gaps, learning path CTA, share card. WhatsApp ask appears only if no number was given.

Single-select questions auto-advance after 420 ms; Enter continues, Esc goes back, 1–9 picks the nth option.

## AI deep search (`ai.js` + `../api/search.js`)

**Goal: personalised, balanced, established, fast (≤ 5 s on the result page).**

- **Search query** is built from the answer sequence: `best AI tools {role} {work} for "{focus}" ({top 2 tasks}) {year}` — shown to the user on the capture screen and above the results.
- **Prompt** asks for exactly **6 tools in a fixed mix**: 2 `mainstream` · 2 `power-user` (practitioners' picks) · 2 `niche` (specialist, "new name" feel). Each needs `what`, a `why` that explicitly references *this* role + focus, `company` (founded year / funding / scale as evidence it's established — 2+ yrs or real backing), `pricing`, `fit`. Tools already recommended by the engine or already used are excluded (prompt + client-side filter). Niche finds are listed first.
- **Speed**: `startEarly()` fires right after Q4 (role/work/tasks/focus known; `engine.earlyExclude()` predicts what the rule engine will recommend so the search avoids it). The user then answers 8 more questions, so the result almost always renders instantly from the in-flight/cached result. Cold path: `deepSearch()` waits max **5 s** (`RESULT_WAIT_MS`), then shows "taking a little longer — it'll be in your email" and still fills in if/when it lands.
- **Server** (`api/search.js`): calls every configured provider **in parallel** and returns the **first** one whose text contains valid tools JSON; the rest are aborted. 9 s hard cap. Keys never reach the browser.

| env var | provider | call |
|---|---|---|
| `GEMINI_API_KEY` | Gemini `gemini-2.5-flash` | `generateContent` + `google_search` grounding |
| `XAI_API_KEY` | Grok `grok-4.3` (`reasoning.effort: none`) | `POST api.x.ai/v1/responses` + `web_search` tool |
| `ANTHROPIC_API_KEY` | Claude (optional fallback) | `messages` + `web_search_20250305` |

Set **Gemini + Grok** for the fastest race. Optional: `GEMINI_MODEL`, `XAI_MODEL`, `CLAUDE_MODEL`, `SEARCH_TIMEOUT_MS`, `ALLOWED_ORIGIN`.

When served from a real domain `ai.js` auto-uses `{ provider: "proxy", url: "/api/search" }`. On localhost/file:// it shows a dev setup form (direct Gemini/Grok/Claude with a key, or a proxy URL). Override anywhere with `window.LOADOUT_AI = { provider, key | url }`. Results cache per profile in `localStorage["loadout.ai.cache"]` for 7 days.

## Leads (`../api/lead.js`)

When deployed, `CONFIG.LEAD_ENDPOINT` defaults to `/api/lead` (override with `window.LOADOUT_LEAD_ENDPOINT`; `null` on localhost). The client POSTs (via `sendBeacon`, so navigation never waits) `{firstName, email, phone, stage, profile, stackIds, searchQuery, ts}` where `stage` is `focus` (mid-quiz capture), `email` (preview gate) or `phone` (result page). The function validates and forwards to **`LEAD_WEBHOOK_URL`** (Zapier / Make / n8n / Google Apps Script / HubSpot — anything accepting JSON). Unset → it just logs, so the quiz never breaks.

## Wiring it up

In `app.js` → `CONFIG`:

- `LEAD_ENDPOINT` — see above. `CAPTURE_AFTER` — which question the contact step follows (default `focus`).
- `LEARN_CTA_URL` — where "Build my AI skills" goes.
- `track()` pushes to `window.dataLayer` if present. Events: `landing_viewed`, `landing_cta_clicked`, `quiz_started`, `question_answered`, `fact_viewed`, `contact_captured`, `contact_skipped`, `quiz_completed`, `result_preview_viewed`, `lead_captured`, `email_skipped`, `result_viewed`, `tool_clicked`, `learn_cta_clicked`, `share_clicked`, `whatsapp_captured`, `shared_result_viewed`, `ai_configured`, `ai_search_started`, `ai_search_awaited`, `ai_search_completed`, `ai_search_failed`, `ai_search_refresh`, `ai_tool_clicked`.

Share links encode the profile in the URL hash (`#r=…`) so the result reproduces without a backend.

## Adding questions / facts / focus options

- **Facts**: append to `FACTS` in `data.js` with `after: "<question id>"`; `app.js` builds the flow automatically. Use `dynamic: "goals"` style keys for computed cards (see `renderFact`).
- **Focus options**: add to `FOCUS_BY_ROLE[role]` with `emoji`, `label`, `caps` (capability weights). Ids must be unique across roles (smoke test enforces).
- **Options** anywhere need an `emoji` (smoke test enforces).

## Adding tools

Append to `tools.js`. Key fields: `caps` (0–10 per capability — this drives most of the score), `roles` (0–10; missing → neutral 4), `layer`, `sub` (no two tools in a stack share a `sub`), `difficulty`, `minMaturity`, `free`, `price` (INR/mo). Run `node loadout/smoke.js` after.
