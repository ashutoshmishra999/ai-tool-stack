# Loadout — AI Stack Builder

> Tell us how you work. We'll build the AI stack you actually need.

A zero-dependency, static prototype of the 12-question AI stack assessment, in a **neo-brutalist white + red** UI (Coursiv-style high-retention flow: big emoji option rows, auto-advance on single picks, fact interstitials between questions, a counting progress ring, a partial-reveal snapshot before email, and one live **AI deep search** at the end). Serve the folder with any static server (`python3 -m http.server 8787`).

## Files

| File | Purpose |
|---|---|
| `index.html` | Single-page shell: landing → name → 12 questions (+4 fact interstitials) → analyzing → snapshot + partial reveal + email → full result (+ AI deep search) → optional WhatsApp |
| `styles.css` | Neo-brutalist design system: white paper + `#ff2d2d` red, 3px black borders, hard offset shadows, Archivo Black + Space Grotesk, emoji-first options |
| `data.js` | The 12 questions + vocabularies (work context, roles, tasks→capability map, **role-dependent focus options** (`FOCUS_BY_ROLE`), goals, use cases, layers, budget tiers) + `FACTS` interstitials. Every option has an `emoji` |
| `ai.js` | **AI deep search** — one web-grounded LLM call (Gemini `google_search` / Claude `web_search` / your proxy) for 3 extra tools matching the user's focus, excluding what we already recommended |
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
6. **Q4** *If AI could crack one thing for you…* — **options depend on the role picked in Q2** (5 per role, 18 roles). Feeds both the engine and the AI deep search.
7. **Q5** Goals → **🧠 Dynamic fact: "~Nh a week you could claw back"** computed from the tasks they picked, with their goals as tags
8. **Q6** Use cases · **Q7** Maturity · **Q8** Tools used → **🔭 Fact: 500+ tools** · **Q9** Platforms · **Q10** Tech comfort → **🏆 Fact: 66% productivity lift** · **Q11** Preferences · **Q12** Invest + budget (BUILD MY STACK)
9. **Analyzing** — ring counts 0→100% with rotating status lines and a card naming the focus being deep-searched.
10. **Snapshot** — Current AI level (Low/Med/High gauge) + Potential % + headline, then 3 tools revealed / rest locked, then email capture (skippable).
11. **Result** — profile grid, narrative, ranked stack, **AI deep search block**, layers, workflows, gaps, learning path CTA, share card, WhatsApp capture.

Single-select questions auto-advance after 420 ms; Enter continues, Esc goes back, 1–9 picks the nth option.

## AI deep search (`ai.js`)

The result page runs **one** LLM call. Prompt = work context + role + focus + tasks + goals + use cases + maturity + tech + platforms + prefs + budget + an **exclusion list** of every tool already recommended or owned. The model is told to web-search and return strict JSON: 3 tools (`name,url,what,why,pricing,fit`) + one `insight`; sources from grounding metadata are shown as chips.

Providers (pick in the on-page setup form, or preset via `window.LOADOUT_AI = { provider, key | url, model? }`):

| provider | call | notes |
|---|---|---|
| `gemini` | `generativelanguage.googleapis.com … :generateContent` with `tools:[{google_search:{}}]` | default model `gemini-2.5-flash`; sources from `groundingMetadata.groundingChunks` |
| `claude` | `api.anthropic.com/v1/messages` with `web_search_20250305` tool | default `claude-sonnet-4-20250514`; needs `anthropic-dangerous-direct-browser-access` (dev only) |
| `proxy` | `POST {prompt, profile, stackIds}` to your URL | **use this in production** so keys never ship to the browser; return `{text, sources}` or the parsed shape |

Key/URL live in `localStorage["loadout.ai"]`; results are cached per profile in `localStorage["loadout.ai.cache"]` ("Search again" forces a refresh). If nothing is configured the block shows a setup form instead of failing; errors render a retry state and never break the rest of the result.

## Wiring it up

In `app.js` → `CONFIG`:

- `LEAD_ENDPOINT` — set to a URL to `POST {firstName, email, phone, profile, stackIds}`. Leaves `null` → localStorage only.
- `LEARN_CTA_URL` — where "Build my AI skills" goes.
- `track()` pushes to `window.dataLayer` if present. Events: `landing_viewed`, `landing_cta_clicked`, `quiz_started`, `question_answered`, `fact_viewed`, `quiz_completed`, `result_preview_viewed`, `lead_captured`, `email_skipped`, `result_viewed`, `tool_clicked`, `learn_cta_clicked`, `share_clicked`, `whatsapp_captured`, `shared_result_viewed`, `ai_configured`, `ai_search_started`, `ai_search_completed`, `ai_search_failed`, `ai_tool_clicked`.

Share links encode the profile in the URL hash (`#r=…`) so the result reproduces without a backend.

## Adding questions / facts / focus options

- **Facts**: append to `FACTS` in `data.js` with `after: "<question id>"`; `app.js` builds the flow automatically. Use `dynamic: "goals"` style keys for computed cards (see `renderFact`).
- **Focus options**: add to `FOCUS_BY_ROLE[role]` with `emoji`, `label`, `caps` (capability weights). Ids must be unique across roles (smoke test enforces).
- **Options** anywhere need an `emoji` (smoke test enforces).

## Adding tools

Append to `tools.js`. Key fields: `caps` (0–10 per capability — this drives most of the score), `roles` (0–10; missing → neutral 4), `layer`, `sub` (no two tools in a stack share a `sub`), `difficulty`, `minMaturity`, `free`, `price` (INR/mo). Run `node loadout/smoke.js` after.
