/* Loadout — UI state machine + rendering. No dependencies.
 * Flow: landing → name → [question | fact]* → analyzing → preview+email → result (+ AI deep search) */
(function () {
  "use strict";

  const D = window.LoadoutData;
  const E = window.LoadoutEngine;
  const AI = window.LoadoutAI;
  const Q = D.QUESTIONS;

  /* ------------------------------------------------------------------ */
  /* Config                                                              */
  /* ------------------------------------------------------------------ */
  const CONFIG = {
    /* POST JSON {firstName,email,phone,profile,stackIds} here. Leave null to only store locally. */
    LEAD_ENDPOINT: null,
    LEARN_CTA_URL: "#learn",
    STORAGE_KEY: "loadout.v2",
    AUTO_ADVANCE_MS: 420,
  };

  /* Flow = questions interleaved with fact interstitials. */
  const FLOW = [];
  Q.forEach((q) => {
    FLOW.push({ kind: "q", q });
    const f = D.FACTS.find((x) => x.after === q.id);
    if (f) FLOW.push({ kind: "fact", fact: f });
  });

  const EMPTY_PROFILE = () => ({ firstName: "", work: null, role: null, tasks: [], focus: null, goals: [], useCases: [], maturity: null, aiTools: [], ecosystem: [], tech: null, prefs: [], invest: null, budget: null });

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  const state = {
    screen: "landing",
    pos: 0,                 // index into FLOW
    profile: EMPTY_PROFILE(),
    result: null,
    email: "",
    phone: "",
    startedAt: null,
    shared: false,
    ai: null,               // deep search result
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (list, id) => list.find((x) => String(x.id) === String(id));

  /* ------------------------------------------------------------------ */
  /* Analytics — swap `console.debug` for your tracker.                   */
  /* ------------------------------------------------------------------ */
  function track(event, props = {}) {
    const payload = Object.assign({ event, ts: Date.now() }, props);
    if (window.dataLayer) window.dataLayer.push(payload);
    if (window.LOADOUT_DEBUG) console.debug("[track]", payload);
  }

  /* ------------------------------------------------------------------ */
  /* Persistence + share links                                           */
  /* ------------------------------------------------------------------ */
  function save() {
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ profile: state.profile, email: state.email, phone: state.phone })); } catch (_) {}
  }
  function encodeProfile(p) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeProfile(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch (_) { return null; }
  }
  function shareUrl() {
    const u = new URL(window.location.href);
    u.hash = "r=" + encodeProfile(state.profile);
    return u.toString();
  }

  /* ------------------------------------------------------------------ */
  /* Screen switching                                                    */
  /* ------------------------------------------------------------------ */
  function show(screen) {
    state.screen = screen;
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === screen));
    const inFlow = screen === "quiz" || screen === "fact";
    $("#progress").hidden = !inFlow;
    $("#step-count").hidden = !inFlow;
    $("#top-back").hidden = !(inFlow || screen === "name");
    $("#bottombar").hidden = !inFlow;
    document.body.dataset.screen = screen;
    window.scrollTo(0, 0);
  }

  /* Question number (1-based) for a FLOW position = count of q-steps up to it. */
  function qNumber(pos) { return FLOW.slice(0, pos + 1).filter((s) => s.kind === "q").length; }
  function updateProgress() {
    const n = qNumber(state.pos);
    $("#step-count").innerHTML = `<b>${n}</b> / ${Q.length}`;
    $("#progress-bar").style.width = `${(n / Q.length) * 100}%`;
  }
  /* ------------------------------------------------------------------ */
  /* Quiz rendering                                                      */
  /* ------------------------------------------------------------------ */
  function optionsOf(q) { return q.optionsFor ? q.optionsFor(state.profile) : q.options; }
  function currentAnswer(q) { return state.profile[q.id]; }
  function isAnswered(q) {
    const a = currentAnswer(q);
    if (q.type === "invest") return !!state.profile.invest && !!state.profile.budget;
    if (Array.isArray(a)) return a.length > 0;
    return a !== null && a !== undefined && a !== "";
  }

  function renderStep() {
    const step = FLOW[state.pos];
    updateProgress();
    if (step.kind === "fact") { renderFact(step.fact); show("fact"); $("#q-continue").disabled = false; $("#q-continue").textContent = "CONTINUE"; return; }
    renderQuestion(step.q);
    show("quiz");
  }

  function renderQuestion(q) {
    $("#q-title").textContent = q.title;
    $("#q-hint").textContent = q.hint || "";
    const root = $("#q-options");
    root.innerHTML = "";
    root.dataset.type = q.type;
    root.dataset.dense = q.dense ? "true" : "false";

    if (q.type === "single") root.appendChild(renderCards(optionsOf(q), q, { single: true }));
    else if (q.type === "multi") root.appendChild(renderCards(q.options, q, {}));
    else if (q.type === "scale") root.appendChild(renderScale(q));
    else if (q.type === "multi-grouped") q.groups.forEach((g) => root.appendChild(renderGroup(g, q)));
    else if (q.type === "invest") root.appendChild(renderInvest(q));

    $("#q-continue").textContent = state.pos === FLOW.length - 1 ? "BUILD MY STACK →" : "CONTINUE";
    updateContinue();
  }

  function optionInner(o) {
    return `<span class="opt-emoji" aria-hidden="true">${o.emoji || "•"}</span><span class="opt-body"><span class="opt-label">${esc(o.label)}</span>${o.hint ? `<span class="opt-hint">${esc(o.hint)}</span>` : ""}</span>`;
  }

  function renderCards(options, q, { single }) {
    const grid = document.createElement("div");
    grid.className = "opt-grid";
    options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt"; b.dataset.id = o.id; b.style.setProperty("--i", i);
      b.setAttribute("role", single ? "radio" : "checkbox");
      b.innerHTML = optionInner(o);
      b.addEventListener("click", () => (single ? pickSingle(q, o.id) : toggleMulti(q, o)));
      grid.appendChild(b);
    });
    syncSelection(grid, q);
    return grid;
  }

  function renderScale(q) {
    const wrap = document.createElement("div");
    wrap.className = "scale";
    q.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt opt-scale"; b.dataset.id = o.id; b.setAttribute("role", "radio"); b.style.setProperty("--i", i);
      b.innerHTML = `<span class="opt-emoji" aria-hidden="true">${o.emoji}</span><span class="scale-num">${o.id}</span><span class="opt-body"><span class="opt-label">${esc(o.label)}</span><span class="opt-hint">${esc(o.hint)}</span></span>`;
      b.addEventListener("click", () => pickSingle(q, o.id));
      wrap.appendChild(b);
    });
    syncSelection(wrap, q);
    return wrap;
  }

  function renderGroup(group, q) {
    const sec = document.createElement("div");
    sec.className = "opt-group";
    sec.innerHTML = `<h3 class="opt-group-title">${esc(group.label)}</h3>`;
    sec.appendChild(renderCards(group.options, q, {}));
    return sec;
  }

  function renderInvest(q) {
    const wrap = document.createElement("div");
    wrap.className = "invest";

    const a = document.createElement("div");
    a.className = "invest-block";
    a.innerHTML = `<h3 class="opt-group-title">What sounds most like you?</h3>`;
    const grid = document.createElement("div"); grid.className = "opt-grid";
    q.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt"; b.dataset.id = o.id; b.setAttribute("role", "radio"); b.style.setProperty("--i", i);
      b.innerHTML = optionInner(o);
      b.addEventListener("click", () => {
        state.profile.invest = o.id;
        /* Sensible default budget so the second pick is one tap away. */
        if (!state.profile.budget) { state.profile.budget = { A: "b0", B: "b1", C: "b2", D: "b3" }[o.id]; $$(".chip", wrap).forEach((x) => x.classList.toggle("is-selected", x.dataset.id === state.profile.budget)); }
        syncSelection(grid, { id: "invest" }); updateContinue(); save();
      });
      grid.appendChild(b);
    });
    syncSelection(grid, { id: "invest" });
    a.appendChild(grid);

    const b = document.createElement("div");
    b.className = "invest-block";
    b.innerHTML = `<h3 class="opt-group-title">💸 Monthly AI tool budget</h3>`;
    const chips = document.createElement("div"); chips.className = "chips";
    q.budget.forEach((o) => {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip"; c.dataset.id = o.id; c.setAttribute("role", "radio");
      c.textContent = o.label;
      c.addEventListener("click", () => { state.profile.budget = o.id; $$(".chip", chips).forEach((x) => x.classList.toggle("is-selected", x.dataset.id === o.id)); updateContinue(); save(); });
      if (state.profile.budget === o.id) c.classList.add("is-selected");
      chips.appendChild(c);
    });
    b.appendChild(chips);

    wrap.appendChild(a); wrap.appendChild(b);
    return wrap;
  }
  function syncSelection(root, q) {
    const a = state.profile[q.id];
    const selected = new Set(Array.isArray(a) ? a.map(String) : a == null ? [] : [String(a)]);
    $$(".opt", root).forEach((el) => {
      const on = selected.has(el.dataset.id);
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
    /* Max-select: dim the rest once the cap is hit. */
    if (q.max && Array.isArray(a)) {
      const full = a.length >= q.max;
      $$(".opt", root).forEach((el) => el.classList.toggle("is-capped", full && !selected.has(el.dataset.id)));
      $("#q-hint").textContent = full ? `${q.max} selected — that's the max. Tap one to swap.` : `${q.hint} ${a.length ? `(${a.length}/${q.max})` : ""}`.trim();
    }
  }

  function pickSingle(q, id) {
    const opts = optionsOf(q);
    const prev = state.profile[q.id];
    state.profile[q.id] = typeof opts[0].id === "number" ? Number(id) : id;
    /* Role changed → the role-dependent focus answer is stale. */
    if (q.id === "role" && prev !== state.profile.role) state.profile.focus = null;
    syncSelection($("#q-options"), q);
    updateContinue(); save();
    /* Single-selects auto-advance after a beat — feels fast, still visible. */
    window.setTimeout(() => { if (state.screen === "quiz" && FLOW[state.pos].q === q) next(); }, CONFIG.AUTO_ADVANCE_MS);
  }

  function toggleMulti(q, o) {
    let arr = state.profile[q.id].slice();
    const allOptions = q.options || q.groups.flatMap((g) => g.options);
    const exclusiveIds = allOptions.filter((x) => x.exclusive).map((x) => x.id);
    if (arr.includes(o.id)) arr = arr.filter((x) => x !== o.id);
    else if (o.exclusive) arr = [o.id];
    else {
      arr = arr.filter((x) => !exclusiveIds.includes(x));
      if (q.max && arr.length >= q.max) return;
      arr.push(o.id);
    }
    state.profile[q.id] = arr;
    syncSelection($("#q-options"), q);
    updateContinue(); save();
  }

  function updateContinue() {
    const step = FLOW[state.pos];
    $("#q-continue").disabled = step.kind === "q" ? !isAnswered(step.q) : false;
  }

  /* ------------------------------------------------------------------ */
  /* Fact interstitials                                                  */
  /* ------------------------------------------------------------------ */
  function renderFact(f) {
    const root = $("#fact-root");
    if (f.dynamic === "goals") {
      const p = state.profile;
      const role = byId(D.ROLES, p.role) || {};
      const hours = (p.tasks || []).reduce((s, id) => s + ((byId(D.TASKS, id) || {}).hours || 0), 0);
      const saved = Math.max(2, Math.round(hours * 0.35));
      const goals = (p.goals || []).map((g) => byId(D.GOALS, g)).filter(Boolean);
      root.innerHTML = `
        <div class="fact-card">
          <span class="fact-emoji" aria-hidden="true">${role.emoji || "⚡"}</span>
          <p class="eyebrow red">${esc(p.firstName ? `${p.firstName}, here's what we see` : "Here's what we see")}</p>
          <div class="fact-stat">~${saved}h</div>
          <h2 class="fact-title">a week you could claw back</h2>
          <p class="fact-body">You told us ~${hours} hours of your week go to tasks AI is already good at. People with your profile who build a proper stack typically compress that by a third or more.</p>
          <div class="fact-tags">${goals.map((g) => `<span class="tag">${g.emoji} ${esc(g.label)}</span>`).join("")}</div>
          <p class="fact-source">Estimate based on the time you reported. We'll refine it in your result.</p>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="fact-card">
        <span class="fact-emoji" aria-hidden="true">${f.emoji}</span>
        <div class="fact-stat">${esc(f.stat)}</div>
        <h2 class="fact-title">${esc(f.title)}</h2>
        <p class="fact-body">${esc(f.body)}</p>
        <p class="fact-source">Source: ${esc(f.source)}</p>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */
  function next() {
    const step = FLOW[state.pos];
    if (step.kind === "q") {
      if (!isAnswered(step.q)) return;
      track("question_answered", { step: qNumber(state.pos), id: step.q.id });
    } else track("fact_viewed", { after: step.fact.after });
    if (state.pos < FLOW.length - 1) { state.pos++; renderStep(); }
    else finishQuiz();
  }
  function back() {
    if (state.screen === "name") { show("landing"); return; }
    if (state.pos > 0) { state.pos--; renderStep(); }
    else show("name");
  }
  /* ------------------------------------------------------------------ */
  /* Analyzing — ring counts to 100% while status lines rotate.           */
  /* ------------------------------------------------------------------ */
  const ANALYZE_STEPS = ["Analysing your role", "Mapping where your week goes", "Matching 58 tools against your answers", "Removing what you already use", "Wiring up workflows", "Building your stack"];
  const RING_LEN = 326.7;

  function finishQuiz() {
    track("quiz_completed", { ms: Date.now() - (state.startedAt || Date.now()) });
    state.result = E.recommend(state.profile);
    state.ai = null;
    show("analyzing");
    const name = state.profile.firstName;
    $("#analyzing-title").textContent = name ? `Building your stack, ${name}…` : "Building your stack…";
    const s = state.result.summary;
    $("#analyzing-fact").innerHTML = `<span class="fact-emoji" aria-hidden="true">${s.focusEmoji}</span><h3 class="fact-title">Deep-searching for: ${esc(s.focusLabel || "your biggest opportunity")}</h3><p class="fact-body">We'll ask a web-grounded AI for tools built for exactly this once your stack is ready.</p>`;

    const total = 3400, start = performance.now();
    const fg = $("#ring-fg"), pct = $("#ring-pct"), status = $("#analyzing-status");
    fg.style.strokeDashoffset = RING_LEN; pct.textContent = "0%";
    function tick(now) {
      const t = Math.min(1, (now - start) / total);
      const eased = 1 - Math.pow(1 - t, 2.2);
      const v = Math.round(eased * 100);
      pct.textContent = `${v}%`;
      fg.style.strokeDashoffset = RING_LEN * (1 - eased);
      status.textContent = ANALYZE_STEPS[Math.min(ANALYZE_STEPS.length - 1, Math.floor(t * ANALYZE_STEPS.length))];
      if (t < 1 && state.screen === "analyzing") requestAnimationFrame(tick);
      else if (state.screen === "analyzing") window.setTimeout(() => { renderPreview(); show("preview"); track("result_preview_viewed"); }, 350);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ */
  /* Preview (snapshot + partial reveal) + email                         */
  /* ------------------------------------------------------------------ */
  function renderPreview() {
    const r = state.result, s = r.summary;
    const name = r.firstName;
    const level = s.maturityScore < 3.5 ? "Low" : s.maturityScore < 6.5 ? "Medium" : "High";
    const potential = Math.min(97, 70 + Math.round((r.gaps.length * 4) + ((state.profile.tasks || []).length * 2) + (state.profile.tech >= 3 ? 5 : 0)));
    $("#preview-root").innerHTML = `
      <div class="snapshot">
        <p class="eyebrow">${esc(s.roleLabel)} · ${esc(s.maturityLabel)}</p>
        <h2 class="h-xl">${esc(name ? `${name}, your AI snapshot` : "Your AI snapshot")}</h2>
        <div class="snapshot-grid">
          <div class="stat-box">
            <span>Current AI level</span>
            <strong>${level}</strong>
            <div class="gauge"><i style="left:${Math.max(3, Math.min(97, s.maturityScore * 10))}%"></i></div>
            <div class="gauge-labels"><span>Low</span><span>Medium</span><span>High</span></div>
          </div>
          <div class="stat-box">
            <span>Potential</span>
            <strong class="red">${potential}%</strong>
            <div class="callout"><span class="big-emoji" aria-hidden="true">💡</span><span>${esc(r.gaps[0] ? `Biggest opportunity: ${r.gaps[0].title.toLowerCase()}` : "Your answers show high potential to master AI")}</span></div>
          </div>
        </div>
        <p class="lede">${esc(s.headline)}</p>
      </div>

      <ol class="preview-list" id="preview-list">
        ${r.stack.map((x, i) => {
          const unlocked = i < 3;
          return `<li class="preview-item ${unlocked ? "" : "is-locked"}">
            <span class="preview-rank">${String(i + 1).padStart(2, "0")}</span>
            <span class="preview-name">${unlocked ? esc(x.tool.name) : `<span class="blur">${esc(x.tool.name)}</span>`}</span>
            <span class="preview-meta">${unlocked ? `<span class="tick">✓</span> ${esc(x.tool.tagline)}` : "🔒 Locked"}</span>
          </li>`;
        }).join("")}
      </ol>

      <form class="capture" id="email-form" novalidate>
        <h3>📬 Where should we send your full stack?</h3>
        <p>${s.toolCount} tools, ${s.workflowCount} workflows, your learning roadmap — plus a live AI deep search for "${esc(s.focusLabel || "your focus")}".</p>
        <div class="capture-row">
          <input id="email" name="email" type="email" autocomplete="email" placeholder="you@email.com" required value="${esc(state.email || "")}" />
          <button class="btn btn-primary" type="submit">UNLOCK MY STACK →</button>
        </div>
        <p class="fineprint">No spam. Just your personalised stack and the occasional useful AI resource.</p>
        <button class="link-btn" type="button" data-action="skip-email">Just show me the result</button>
      </form>`;

    $("#email-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#email");
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { input.classList.add("is-invalid"); input.focus(); return; }
      input.classList.remove("is-invalid");
      state.email = v;
      submitLead("email");
      showResult();
    });
    $("#email").addEventListener("input", (e) => e.target.classList.remove("is-invalid"));
  }

  async function submitLead(kind) {
    save();
    track(kind === "email" ? "lead_captured" : "whatsapp_captured", { role: state.profile.role });
    if (!CONFIG.LEAD_ENDPOINT) return;
    try {
      await fetch(CONFIG.LEAD_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: state.profile.firstName, email: state.email, phone: state.phone, profile: state.profile, stackIds: state.result.stack.map((s) => s.tool.id), ts: Date.now() }),
      });
    } catch (_) { /* never block the result on a network error */ }
  }
  /* ------------------------------------------------------------------ */
  /* Result                                                              */
  /* ------------------------------------------------------------------ */
  function price(t) {
    if (t.free && !t.price) return "Free";
    if (t.free) return `Free · Paid from ₹${t.price.toLocaleString("en-IN")}/mo`;
    return `From ₹${t.price.toLocaleString("en-IN")}/mo`;
  }
  const DIFF = ["", "Easy", "Easy", "Moderate", "Advanced", "Technical"];

  function renderResult() {
    const r = state.result, s = r.summary;
    const name = r.firstName;
    const root = $("#result-root");
    root.innerHTML = `
      <header class="result-head">
        <p class="eyebrow red">🎉 Your AI stack is ready${name ? `, ${esc(name)}` : ""}</p>
        <h2 class="display-sm">Built around your role, your week and your goals.</h2>
        <div class="profile-grid">
          <div><span>Role</span><strong>${esc(s.roleLabel)}</strong></div>
          <div><span>#1 thing to crack</span><strong>${s.focusEmoji} ${esc(s.focusLabel || "—")}</strong></div>
          <div><span>AI maturity</span><strong>${esc(s.maturityLabel)}</strong></div>
          <div><span>Primary goal</span><strong>${esc(s.goalLabels.slice(0, 2).join(" + ") || "—")}</strong></div>
        </div>
        <p class="narrative">${esc(s.narrative)}</p>
      </header>

      <section class="block">
        <div class="block-head"><p class="eyebrow">Your recommended stack</p><h3>${s.toolCount} tools. Nothing you already use.</h3></div>
        <ol class="stack">
          ${r.stack.map((x) => `
            <li class="tool-card">
              <div class="tool-rank">${x.rank}</div>
              <div class="tool-body">
                <div class="tool-title"><h4>${esc(x.tool.name)}</h4><span class="fit">FIT ${x.fit}%</span></div>
                <p class="tool-tagline">${esc(x.tool.tagline)}</p>
                <p class="tool-why">→ ${esc(x.why)}</p>
                <ul class="tool-best">${x.tool.bestFor.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
                <div class="tool-meta">
                  <span>Difficulty: ${DIFF[x.tool.difficulty]}</span>
                  <span>${price(x.tool)}</span>
                  ${x.tool.notFor ? `<span class="caution">⚠ ${esc(x.tool.notFor)}</span>` : ""}
                  <a href="${esc(x.tool.url)}" target="_blank" rel="noopener" data-track="tool_clicked" data-tool="${esc(x.tool.id)}">Open ${esc(x.tool.name)} ↗</a>
                </div>
              </div>
            </li>`).join("")}
        </ol>
      </section>

      <section class="block block-ai" id="ai-block">
        <div class="block-head"><p class="eyebrow">🔭 AI deep search</p><h3>Live web search for "${esc(s.focusLabel || "your focus")}"</h3></div>
        <div id="ai-body"></div>
      </section>

      <section class="block">
        <div class="block-head"><p class="eyebrow">Your stack by layer</p><h3>How it fits together</h3></div>
        <div class="layers">
          ${r.layers.map((L) => `
            <div class="layer">
              <div class="layer-name"><strong>${esc(L.label)}</strong><span>${esc(L.blurb)}</span></div>
              <div class="layer-tools">${L.tools.map((t) => `<span class="pill ${t.owned ? "is-owned" : ""}">${esc(t.tool.name)}${t.owned ? " <em>· you use this</em>" : ""}</span>`).join("")}</div>
            </div>`).join("")}
        </div>
      </section>

      ${r.workflows.length ? `
      <section class="block">
        <div class="block-head"><p class="eyebrow">Workflows to build</p><h3>${r.workflows.length} workflow${r.workflows.length > 1 ? "s" : ""} that fit how you work</h3></div>
        <div class="workflows">
          ${r.workflows.map((w) => `
            <article class="workflow">
              <h4>${esc(w.title)}</h4>
              <div class="chain">
                ${w.tools.map((t, i) => `<div class="chain-step"><span class="chain-tool">${esc(t.name)}</span><span class="chain-verb">${esc(w.steps[i])}</span></div>${i < w.tools.length - 1 ? '<span class="chain-arrow" aria-hidden="true">→</span>' : ""}`).join("")}
              </div>
            </article>`).join("")}
        </div>
      </section>` : ""}

      ${r.gaps.length ? `
      <section class="block block-gaps">
        <div class="block-head"><p class="eyebrow red">You're leaving AI on the table</p><h3>${r.gaps.length} opportunit${r.gaps.length > 1 ? "ies" : "y"} based on your answers</h3></div>
        <ol class="gaps">
          ${r.gaps.map((g, i) => `
            <li class="gap">
              <span class="gap-num">${String(i + 1).padStart(2, "0")}</span>
              <div><h4>${esc(g.title)}</h4><p>${esc(g.body)}</p>${g.fix ? `<p class="gap-fix">Start with <strong>${esc(g.fix)}</strong> from your stack.</p>` : ""}</div>
            </li>`).join("")}
        </ol>
      </section>` : ""}

      <section class="block block-learn" id="learn">
        <div class="block-head"><p class="eyebrow">Want to actually master this stack?</p><h3>We've identified the tools. Now learn to use them together.</h3></div>
        <ol class="path">
          ${r.learningPath.map((m) => `<li><strong>${esc(m.title)}</strong><span>${esc(m.blurb)}</span></li>`).join("")}
        </ol>
        <a class="btn btn-primary btn-lg" href="${esc(CONFIG.LEARN_CTA_URL)}" data-track="learn_cta_clicked">BUILD MY AI SKILLS →</a>
      </section>

      <section class="block block-share">
        <div class="share-card" id="share-card">
          <p class="eyebrow">${esc(name ? `${name}'s` : "My")} AI Stack</p>
          <div class="share-stats">
            <div><strong>${s.maturityScore.toFixed(1)}</strong><span>AI maturity / 10</span></div>
            <div><strong>${s.toolCount}</strong><span>Tools</span></div>
            <div><strong>${s.workflowCount}</strong><span>Workflows</span></div>
            <div><strong>~${s.hoursSaved}h</strong><span>Saved / week*</span></div>
          </div>
          <p class="share-tools">${r.stack.slice(0, 5).map((x) => esc(x.tool.name)).join(" · ")}</p>
          <p class="fineprint">*Estimate based on the time you said you spend on tasks your stack covers.</p>
        </div>
        <div class="share-actions">
          <span>Share your stack</span>
          <button class="btn btn-ghost" type="button" data-action="copy-link">Copy link</button>
          <a class="btn btn-ghost" data-share="whatsapp" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn btn-ghost" data-share="linkedin" target="_blank" rel="noopener">LinkedIn</a>
          <button class="btn btn-ghost" type="button" data-action="restart">Start over</button>
        </div>
      </section>

      ${state.shared ? `
      <section class="block block-learn block-build-yours">
        <div class="block-head"><p class="eyebrow">This is ${esc(name || "someone")}'s stack</p><h3>Want yours? It takes about two minutes.</h3></div>
        <button class="btn btn-primary btn-lg" type="button" data-action="restart">BUILD MY AI STACK →</button>
      </section>` : ""}

      ${!state.shared && state.email && !state.phone ? `
      <section class="block block-whatsapp" id="whatsapp-block">
        <form class="capture capture-inline" id="phone-form" novalidate>
          <div>
            <h3>📱 Want this on WhatsApp too?</h3>
            <p>Your stack has ${s.toolCount} tools and ${s.workflowCount} workflows. Save it where you'll actually see it.</p>
          </div>
          <div class="capture-row">
            <span class="prefix">+91</span>
            <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="Phone number" pattern="[0-9]{10}" />
            <button class="btn btn-primary" type="submit">SEND TO WHATSAPP →</button>
          </div>
          <p class="fineprint">Optional. Used only to send your stack and relevant updates.</p>
        </form>
      </section>` : ""}
    `;
    /* Share links */
    const url = shareUrl();
    const text = `I just generated my AI Stack with Loadout — ${s.toolCount} tools, ${s.workflowCount} workflows, AI maturity ${s.maturityScore.toFixed(1)}/10. ${r.gaps[0] ? `Apparently I'm underusing AI for ${r.gaps[0].title.toLowerCase()}.` : ""}`.trim();
    const wa = $('[data-share="whatsapp"]', root); if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
    const li = $('[data-share="linkedin"]', root); if (li) li.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

    const pf = $("#phone-form", root);
    if (pf) pf.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#phone", pf).value.replace(/\D/g, "");
      if (v.length !== 10) { $("#phone", pf).focus(); $("#phone", pf).classList.add("is-invalid"); return; }
      state.phone = "+91" + v; submitLead("phone");
      pf.innerHTML = `<p class="capture-done">✅ Done — your stack is on its way to WhatsApp.</p>`;
    });

    renderAI();
  }

  /* ------------------------------------------------------------------ */
  /* AI deep search block                                                */
  /* ------------------------------------------------------------------ */
  function renderAI() {
    const body = $("#ai-body");
    if (!body) return;
    if (!AI.isConfigured()) { renderAISetup(body); return; }
    if (state.ai && state.ai.ok) { renderAIResult(body, state.ai); return; }
    body.innerHTML = `<div class="ai-status"><span class="ai-dots"><span></span><span></span><span></span></span> Searching the web for tools built for your focus…</div>`;
    const provider = AI.getConfig().provider;
    track("ai_search_started", { provider });
    AI.deepSearch(state.result).then((res) => {
      if (state.screen !== "result" || !$("#ai-body")) return;
      state.ai = res;
      if (res.ok) { track("ai_search_completed", { provider, cached: !!res.cached, tools: res.tools.map((t) => t.name) }); renderAIResult($("#ai-body"), res); }
      else { track("ai_search_failed", { provider, error: res.error }); renderAIError($("#ai-body"), res.error); }
    });
  }

  function renderAIResult(body, res) {
    body.innerHTML = `
      ${res.insight ? `<p class="ai-insight">💡 ${esc(res.insight)}</p>` : ""}
      <div class="ai-grid">
        ${res.tools.map((t, i) => `
          <article class="ai-card" style="--i:${i}">
            <h4>${esc(t.name)} <span class="fit">FIT ${t.fit}%</span></h4>
            <p class="what">${esc(t.what)}</p>
            <p class="why">→ ${esc(t.why)}</p>
            <div class="meta"><span>${esc(t.pricing || "Pricing varies")}</span>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener" data-track="ai_tool_clicked">Open ↗</a>` : ""}</div>
          </article>`).join("")}
      </div>
      ${res.sources && res.sources.length ? `<div class="ai-sources">${res.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || hostOf(s.url))}</a>`).join("")}</div>` : ""}
      <p class="fineprint">Found live via ${esc(res.provider === "claude" ? "Claude web search" : res.provider === "gemini" ? "Gemini with Google Search grounding" : "your search backend")}${res.cached ? " · cached" : ""}. Always check pricing on the tool's site. <button class="link-btn" type="button" data-action="ai-refresh">Search again</button> · <button class="link-btn" type="button" data-action="ai-settings">Change provider</button></p>`;
  }
  function hostOf(u) { try { return new URL(u).hostname; } catch (_) { return u; } }

  function renderAIError(body, err) {
    body.innerHTML = `<p>😬 The deep search didn't come back (${esc(String(err).slice(0, 120))}).</p>
      <div class="share-actions"><button class="btn" type="button" data-action="ai-refresh">Try again</button><button class="btn btn-ghost" type="button" data-action="ai-settings" style="color:#fff">Change provider</button></div>`;
  }
  function renderAISetup(body) {
    const cfg = AI.getConfig();
    body.innerHTML = `
      <p>Plug in Gemini or Claude and we'll run one live, web-grounded search for 3 more tools built specifically for <strong>${esc(state.result.summary.focusLabel || "your focus")}</strong> as a ${esc(state.result.summary.roleLabel.toLowerCase())} — excluding everything above.</p>
      <form class="ai-setup" id="ai-setup-form">
        <div class="row">
          <select id="ai-provider" aria-label="Provider">
            <option value="gemini" ${cfg.provider === "gemini" ? "selected" : ""}>Gemini (Google Search grounding)</option>
            <option value="claude" ${cfg.provider === "claude" ? "selected" : ""}>Claude (web search)</option>
            <option value="proxy" ${cfg.provider === "proxy" ? "selected" : ""}>My own backend (proxy URL)</option>
          </select>
          <input id="ai-key" type="password" placeholder="API key" autocomplete="off" value="${esc(cfg.key || "")}" ${cfg.provider === "proxy" ? "hidden" : ""} />
          <input id="ai-url" type="url" placeholder="https://your-backend/loadout-search" value="${esc(cfg.url || "")}" ${cfg.provider === "proxy" ? "" : "hidden"} />
          <button class="btn" type="submit">RUN DEEP SEARCH →</button>
        </div>
        <p class="fineprint">Stored only in this browser's localStorage. For production, use the proxy option so keys never ship to the client.</p>
      </form>`;
    const form = $("#ai-setup-form", body);
    const sel = $("#ai-provider", form), key = $("#ai-key", form), url = $("#ai-url", form);
    sel.addEventListener("change", () => { const px = sel.value === "proxy"; key.hidden = px; url.hidden = !px; });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const provider = sel.value;
      const cfgNew = provider === "proxy" ? { provider, url: url.value.trim() } : { provider, key: key.value.trim() };
      if (provider === "proxy" ? !cfgNew.url : !cfgNew.key) { (provider === "proxy" ? url : key).classList.add("is-invalid"); return; }
      AI.setConfig(cfgNew); state.ai = null; track("ai_configured", { provider });
      renderAI();
    });
  }

  function showResult() {
    renderResult();
    show("result");
    track("result_viewed", { role: state.profile.role, focus: state.profile.focus, tools: state.result.stack.map((s) => s.tool.id) });
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */
  function startQuiz() {
    state.startedAt = state.startedAt || Date.now();
    state.pos = 0;
    renderStep();
    track("quiz_started");
  }

  function restart() {
    const keepName = state.shared ? "" : state.profile.firstName;   // don't inherit the sharer's name
    Object.assign(state, { pos: 0, result: null, startedAt: null, shared: false, ai: null });
    state.profile = EMPTY_PROFILE(); state.profile.firstName = keepName;
    history.replaceState(null, "", window.location.pathname);
    $("#first-name").value = keepName;
    save();
    show("landing");
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action],[data-track]");
    if (!el) return;
    if (el.dataset.track) track(el.dataset.track, { tool: el.dataset.tool || undefined });
    switch (el.dataset.action) {
      case "start": e.preventDefault(); track("landing_cta_clicked"); show("name"); window.setTimeout(() => $("#first-name").focus(), 50); break;
      case "skip-name": state.profile.firstName = ""; startQuiz(); break;
      case "back": back(); break;
      case "next": next(); break;
      case "skip-email": track("email_skipped"); showResult(); break;
      case "restart": e.preventDefault(); restart(); break;
      case "ai-refresh": state.ai = null; AI.deepSearch(state.result, { force: true }).then((res) => { state.ai = res; if ($("#ai-body")) (res.ok ? renderAIResult($("#ai-body"), res) : renderAIError($("#ai-body"), res.error)); }); $("#ai-body").innerHTML = `<div class="ai-status"><span class="ai-dots"><span></span><span></span><span></span></span> Searching again…</div>`; break;
      case "ai-settings": AI.setConfig(null); state.ai = null; renderAI(); break;
      case "copy-link": {
        const url = shareUrl();
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
          () => { el.textContent = "Copied ✓"; window.setTimeout(() => (el.textContent = "Copy link"), 1800); },
          () => { window.prompt("Copy your link:", url); },
        );
        track("share_clicked", { channel: "copy" });
        break;
      }
    }
  });

  $("#name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.profile.firstName = $("#first-name").value.trim().slice(0, 40);
    save();
    startQuiz();
  });

  /* Keyboard: Enter advances, Esc goes back, 1–9 toggles the nth option. */
  document.addEventListener("keydown", (e) => {
    if (state.screen !== "quiz" && state.screen !== "fact") return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "Enter" && !e.target.classList.contains("opt") && !e.target.classList.contains("chip")) { e.preventDefault(); next(); }
    else if (e.key === "Escape") { e.preventDefault(); back(); }
    else if (state.screen === "quiz" && /^[1-9]$/.test(e.key)) {
      const opts = $$("#q-options .opt");
      const o = opts[Number(e.key) - 1];
      if (o) { e.preventDefault(); o.click(); }
    }
  });
  /* ------------------------------------------------------------------ */
  /* Boot: restore a shared result (#r=…) or a saved session.            */
  /* ------------------------------------------------------------------ */
  function openSharedFromHash() {
    const m = window.location.hash.match(/^#r=(.+)$/);
    if (!m) return false;
    const p = decodeProfile(m[1]);
    if (!p || !p.role) return false;
    state.profile = Object.assign(EMPTY_PROFILE(), p);
    state.result = E.recommend(state.profile);
    state.email = ""; state.phone = ""; state.shared = true; state.ai = null;   // someone else's result — never show their capture
    renderResult();
    show("result");
    track("shared_result_viewed");
    return true;
  }
  window.addEventListener("hashchange", () => { if (/^#r=/.test(window.location.hash)) openSharedFromHash(); });

  function boot() {
    if (openSharedFromHash()) return;
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "null");
      if (saved && saved.profile) { state.profile.firstName = saved.profile.firstName || ""; state.email = saved.email || ""; state.phone = saved.phone || ""; $("#first-name").value = state.profile.firstName; }
    } catch (_) {}
    track("landing_viewed");
  }

  /* Exposed for tests / debugging. */
  window.Loadout = { state, FLOW, CONFIG };

  boot();
})();
