/* Loadout — recommendation engine.
 *
 * Pure, deterministic, dependency-free. Takes a profile (the 10 answers +
 * first name) and returns a full result object the UI renders.
 *
 * Pipeline (mirrors PRD §7):
 *   demand vector  →  hard filters  →  weighted scoring  →  diversity pick
 *   →  layers  →  workflows  →  gaps  →  learning path  →  summary copy
 */
(function (root) {
  "use strict";

  const D = root.LoadoutData;
  const TOOLS = root.LoadoutTools;

  const CAP_LABELS = {
    writing: "Writing", research: "Research", data: "Data analysis", documents: "Document analysis",
    presentations: "Presentations", image: "Image generation", video: "Video", voice: "Voice & audio",
    content: "Content creation", coding: "Coding", building: "App building", automation: "Automation",
    agents: "AI agents", sales: "Sales & outreach", marketing: "Marketing", learning: "Learning",
    productivity: "Productivity", thinking: "Planning & decisions", meetings: "Meetings", customer: "Customer interaction",
    projects: "Project management", spreadsheets: "Spreadsheets", hiring: "Hiring", design: "Design",
  };

  /* Tools with a credible privacy / enterprise story — used by the "privacy" preference. */
  const PRIVACY_FRIENDLY = new Set(["claude", "copilot", "gemini", "notebooklm", "writer", "n8n", "granola", "harvey", "spellbook", "heidi"]);

  const byId = (list, id) => list.find((x) => String(x.id) === String(id));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const label = (list, id) => (byId(list, id) || {}).label || "";

  /* ------------------------------------------------------------------ */
  /* 1. Demand vector: what this person needs AI for, per capability.   */
  /* ------------------------------------------------------------------ */
  function buildDemand(p) {
    const demand = {};
    const bump = (cap, w) => { demand[cap] = (demand[cap] || 0) + w; };

    /* Tasks carry the most weight (PRD: tasks > role when in conflict). */
    (p.tasks || []).forEach((id) => {
      const t = byId(D.TASKS, id);
      if (t) Object.entries(t.caps).forEach(([c, w]) => bump(c, w * 1.0));
    });
    /* Explicit use-case interest. */
    (p.useCases || []).forEach((c) => { if (c !== "other") bump(c, 1.0); });
    /* The one thing they want AI to crack — strongest single signal. */
    const focus = p.focus ? byId(D.ALL_FOCUS, p.focus) : null;
    if (focus) Object.entries(focus.caps).forEach(([c, w]) => bump(c, w * 1.2));
    /* Goals nudge the outcome the stack optimises for. */
    (p.goals || []).forEach((id) => {
      const g = byId(D.GOALS, id);
      if (g) g.caps.forEach((c) => bump(c, 0.35));
    });
    /* Preferences that imply capability demand. */
    if ((p.prefs || []).includes("automate")) bump("automation", 0.6);
    if ((p.prefs || []).includes("time")) { bump("productivity", 0.3); bump("automation", 0.2); }

    /* Role baseline so an empty-ish profile still gets a sensible stack. */
    const ROLE_BASE = {
      student: { learning: 0.6, research: 0.5, writing: 0.4, presentations: 0.3 },
      founder: { thinking: 0.4, building: 0.3, sales: 0.3, marketing: 0.3, automation: 0.3 },
      marketing: { content: 0.6, marketing: 0.6, research: 0.3, image: 0.3, automation: 0.2 },
      sales: { sales: 0.7, writing: 0.3, research: 0.3, meetings: 0.3 },
      product: { thinking: 0.4, documents: 0.3, meetings: 0.3, projects: 0.3, building: 0.2 },
      design: { design: 0.7, image: 0.5, video: 0.2 },
      engineering: { coding: 0.8, building: 0.4, agents: 0.2 },
      data: { data: 0.8, spreadsheets: 0.3, coding: 0.3 },
      finance: { spreadsheets: 0.6, data: 0.5, documents: 0.3 },
      hr: { hiring: 0.6, writing: 0.4, meetings: 0.3 },
      operations: { automation: 0.5, projects: 0.4, spreadsheets: 0.3 },
      cs: { customer: 0.7, writing: 0.3, automation: 0.2 },
      consultant: { research: 0.4, presentations: 0.4, writing: 0.4, thinking: 0.3 },
      creator: { content: 0.7, video: 0.5, image: 0.3, marketing: 0.3 },
      healthcare: { research: 0.4, documents: 0.4, meetings: 0.3 },
      education: { learning: 0.5, content: 0.4, presentations: 0.3, writing: 0.3 },
      legal: { documents: 0.7, research: 0.5, writing: 0.4 },
      other: { writing: 0.3, research: 0.3, productivity: 0.3 },
    };
    Object.entries(ROLE_BASE[p.role] || ROLE_BASE.other).forEach(([c, w]) => bump(c, w));

    const max = Math.max(...Object.values(demand), 0.0001);
    Object.keys(demand).forEach((c) => { demand[c] = demand[c] / max; });
    /* Anything the user explicitly said they spend time on must still register,
     * even when one task dominates (a coder who also lives in meetings). */
    (p.tasks || []).forEach((id) => {
      const t = byId(D.TASKS, id);
      if (t) Object.entries(t.caps).forEach(([c, w]) => { if (w >= 1) demand[c] = Math.max(demand[c] || 0, 0.5); });
    });
    (p.useCases || []).forEach((c) => { if (c !== "other") demand[c] = Math.max(demand[c] || 0, 0.5); });
    return demand;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Hard filters                                                     */
  /* ------------------------------------------------------------------ */
  function passesFilters(tool, p, ctx) {
    if (ctx.owned.has(tool.id)) return false;                       // already in their stack
    if (p.invest === "A" && !tool.free) return false;               // wants free only
    if (!tool.free && tool.price > ctx.budgetMax) return false;     // can't afford entry plan
    if (tool.difficulty > p.tech + 1) return false;                 // too technical
    if (tool.minMaturity > p.maturity + 1) return false;            // too advanced for where they are
    if ((p.prefs || []).includes("nocode") && tool.difficulty >= 5) return false;
    /* Role-specialist tools must actually be for this role. */
    if (tool.layer === "specialist" && (tool.roles[p.role] ?? 0) < 7) return false;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Relevance scoring  → 0..1                                        */
  /* ------------------------------------------------------------------ */
  function scoreTool(tool, p, ctx) {
    const prefs = new Set(p.prefs || []);
    const eco = new Set((p.ecosystem || []).filter((e) => e !== "none" && e !== "other"));

    /* Use-case fit: weighted dot product between demand and tool caps,
     * normalised by total demand so it's comparable across users. */
    let fit = 0, demandMass = 0;
    Object.entries(ctx.demand).forEach(([cap, w]) => {
      demandMass += w;
      fit += w * ((tool.caps[cap] || 0) / 10);
    });
    const useCaseFit = demandMass ? fit / demandMass : 0;
    /* Peak relevance — does this tool nail at least one thing they care about? */
    let peak = 0;
    Object.entries(ctx.demand).forEach(([cap, w]) => { peak = Math.max(peak, w * ((tool.caps[cap] || 0) / 10)); });

    const roleFit = (tool.roles[p.role] ?? 4) / 10;

    /* Skill fit: penalise tools well above their comfort, lightly penalise
     * tools far below it for advanced users who said "powerful". */
    const over = Math.max(0, tool.difficulty - p.tech);
    let skillFit = 1 - over * 0.35;
    if (prefs.has("powerful") && tool.difficulty <= 1 && p.tech >= 4) skillFit -= 0.1;
    if (prefs.has("easy")) skillFit += (tool.ease / 10 - 0.6) * 0.5;
    skillFit = clamp(skillFit, 0, 1);

    /* Maturity fit */
    const matGap = Math.max(0, tool.minMaturity - p.maturity);
    const maturityFit = clamp(1 - matGap * 0.4, 0, 1);

    /* Integration fit */
    let integrationFit = 0.5;
    if (eco.size) {
      const native = tool.native.some((n) => eco.has(n));
      const overlap = tool.integrations.filter((i) => eco.has(i)).length;
      integrationFit = clamp(0.4 + (native ? 0.45 : 0) + Math.min(overlap, 3) * 0.08, 0, 1);
    }

    /* Budget fit */
    let budgetFit = 1;
    if (!tool.free) budgetFit = ctx.budgetMax ? clamp(1 - tool.price / (ctx.budgetMax * 1.5), 0.3, 1) : 0;
    else if (p.invest === "A" || p.invest === "B") budgetFit = 1;
    else budgetFit = 0.9;

    const quality = tool.quality / 10;

    /* Preference weighting layer — two identical roles diverge here. */
    let w = { use: 0.42, role: 0.18, skill: 0.12, mat: 0.06, integ: 0.08, budget: 0.06, quality: 0.08 };
    if (prefs.has("quality")) { w.quality += 0.08; w.use -= 0.04; w.budget -= 0.04; }
    if (prefs.has("affordable")) { w.budget += 0.10; w.quality -= 0.05; w.role -= 0.05; }
    if (prefs.has("easy")) { w.skill += 0.08; w.role -= 0.04; w.quality -= 0.04; }
    if (prefs.has("integrates")) { w.integ += 0.10; w.role -= 0.05; w.quality -= 0.05; }
    if (prefs.has("scales")) { w.quality += 0.04; w.mat -= 0.02; w.budget -= 0.02; }

    let score =
      w.use * useCaseFit + w.role * roleFit + w.skill * skillFit + w.mat * maturityFit +
      w.integ * integrationFit + w.budget * budgetFit + w.quality * quality;

    /* Bonuses */
    score += peak * 0.15;                                             // specialist tools that nail one need
    if (prefs.has("privacy") && PRIVACY_FRIENDLY.has(tool.id)) score += 0.05;
    if (prefs.has("powerful") && tool.quality >= 9 && tool.difficulty >= 3) score += 0.04;
    if (prefs.has("time") && (tool.caps.automation >= 8 || tool.caps.productivity >= 8 || tool.caps.meetings >= 9)) score += 0.03;
    if (tool.native.some((n) => eco.has(n))) score += 0.03;

    /* Penalties */
    if (tool.layer === "specialist" && roleFit < 0.5 && peak < 0.6) score -= 0.15; // niche tool, wrong person
    if (peak < 0.35) score -= 0.12;                                   // nothing they care about

    return { score: clamp(score, 0, 1), useCaseFit, roleFit, peak, integrationFit };
  }

  /* ------------------------------------------------------------------ */
  /* 4. Diversity pick: 5–8 tools, one per sub-category, layer-balanced */
  /* ------------------------------------------------------------------ */
  function pickStack(ranked, p, ctx) {
    const target = p.maturity >= 4 || p.invest === "D" ? 8 : p.maturity <= 1 ? 5 : p.maturity === 2 ? 6 : 7;
    const picked = [];
    const subs = new Set();
    const layerCount = {};
    const maxPerLayer = { think: 2, research: 1, learn: 1, create: 3, build: 3, automate: 1, organize: 2, specialist: 2 };
    /* Roles whose craft *is* a layer get one extra slot there. */
    if (p.role === "engineering") maxPerLayer.build = 4;
    if (p.role === "creator" || p.role === "design") maxPerLayer.create = 4;

    /* Guarantee a "think" layer unless they already own a general assistant. */
    const ownedAssistants = ["chatgpt", "claude", "gemini", "copilot"].filter((id) => ctx.owned.has(id)).length;
    if (!ownedAssistants) {
      const think = ranked.find((r) => r.tool.sub === "assistant");
      if (think) { picked.push(think); subs.add("assistant"); layerCount.think = 1; }
    } else if (ownedAssistants >= 2) {
      maxPerLayer.think = 1;   // they have the general layer covered — spend slots elsewhere
    }

    for (const r of ranked) {
      if (picked.length >= target) break;
      if (picked.includes(r)) continue;
      if (subs.has(r.tool.sub)) continue;
      const L = r.tool.layer;
      if ((layerCount[L] || 0) >= maxPerLayer[L]) continue;
      /* Learn-layer tools only when the person actually studies or lives in documents. */
      if (L === "learn" && Math.max(ctx.demand.learning || 0, ctx.demand.documents || 0) < 0.45) continue;
      if (r.score < 0.42 && picked.length >= 5) continue;           // don't pad with weak picks
      picked.push(r); subs.add(r.tool.sub); layerCount[L] = (layerCount[L] || 0) + 1;
    }

    /* Coverage pass: every capability the user strongly needs (demand ≥ 0.6)
     * should have at least one tool in the stack that is genuinely good at it
     * (cap ≥ 8). If not, swap in the best candidate for the weakest pick that
     * isn't itself the sole cover for another strong need. */
    const strong = Object.entries(ctx.demand).filter(([, w]) => w >= 0.6).map(([c]) => c);
    const covers = (list, cap) => list.some((r) => (r.tool.caps[cap] || 0) >= 8);
    for (const cap of strong) {
      if (covers(picked, cap)) continue;
      const cand = ranked.find((r) => !picked.includes(r) && !subs.has(r.tool.sub) && (r.tool.caps[cap] || 0) >= 8);
      if (!cand) continue;
      if (picked.length < target) { picked.push(cand); subs.add(cand.tool.sub); continue; }
      /* find a victim: lowest score, whose removal doesn't uncover another strong cap */
      const victims = [...picked].sort((a, b) => a.score - b.score);
      const victim = victims.find((v) => strong.every((c) => c === cap || covers(picked.filter((x) => x !== v), c)));
      if (victim && cand.score > victim.score - 0.2) {
        picked.splice(picked.indexOf(victim), 1); subs.delete(victim.tool.sub);
        picked.push(cand); subs.add(cand.tool.sub);
      }
    }
    return picked.sort((a, b) => b.score - a.score);
  }

  /* ------------------------------------------------------------------ */
  /* 5. Workflows: chains of 3 tools that serve the person's real tasks  */
  /*    Each template lists capability slots; we fill them from the      */
  /*    user's full stack (recommended + already owned).                 */
  /* ------------------------------------------------------------------ */
  const WORKFLOWS = [
    { id: "research-content", when: ["research", "content"], title: "Research → Content", steps: ["Research", "Write", "Design"], slots: ["research", "writing", "design|image|content"] },
    { id: "meeting-execution", when: ["meetings"], title: "Meeting → Execution", steps: ["Capture", "Summarise", "Organise"], slots: ["meetings", "writing|thinking", "productivity|projects"] },
    { id: "lead-outreach", when: ["sales"], title: "Lead → Outreach", steps: ["Find", "Personalise", "Send"], slots: ["sales", "writing|research", "automation|sales"] },
    { id: "data-decision", when: ["data", "spreadsheets"], title: "Data → Decision", steps: ["Analyse", "Interpret", "Present"], slots: ["data|spreadsheets", "thinking|writing", "presentations|design"] },
    { id: "idea-ship", when: ["coding", "building"], title: "Idea → Shipped", steps: ["Spec", "Build", "Deploy"], slots: ["thinking|writing", "coding|building", "building|automation"] },
    { id: "source-mastery", when: ["learning"], title: "Source → Mastery", steps: ["Collect", "Understand", "Revise"], slots: ["research", "learning|documents", "learning|writing"] },
    { id: "brief-deck", when: ["presentations"], title: "Brief → Deck", steps: ["Outline", "Generate", "Polish"], slots: ["thinking|writing", "presentations", "design|image"] },
    { id: "long-short", when: ["video", "content"], title: "Long → Short-form", steps: ["Record", "Clip", "Publish"], slots: ["video", "video|content", "content|marketing"] },
    { id: "trigger-automation", when: ["automation", "productivity"], title: "Trigger → Done", steps: ["Trigger", "AI step", "Action"], slots: ["automation", "writing|thinking", "productivity|projects|automation"] },
    { id: "ticket-resolution", when: ["customer"], title: "Ticket → Resolution", steps: ["Triage", "Draft", "Resolve"], slots: ["customer", "writing", "customer|automation"] },
    { id: "jd-hire", when: ["hiring"], title: "JD → Hire", steps: ["Write JD", "Interview", "Decide"], slots: ["hiring|writing", "hiring|meetings", "thinking|writing"] },
    { id: "doc-review", when: ["documents"], title: "Document → Insight", steps: ["Upload", "Interrogate", "Summarise"], slots: ["documents", "documents|thinking", "writing"] },
    { id: "brief-visual", when: ["image", "design"], title: "Brief → Visual", steps: ["Concept", "Generate", "Finish"], slots: ["thinking|writing", "image", "design"] },
  ];

  /* The user's existing platforms can be workflow *destinations* (PRD: "ChatGPT →
   * Clay → Gmail", "Fireflies → ChatGPT → Notion"). They never start a chain. */
  const PLATFORMS = {
    google: { name: "Google Docs / Slides", caps: { writing: 7, presentations: 7, spreadsheets: 7, productivity: 7, documents: 6 } },
    microsoft: { name: "Word / PowerPoint / Teams", caps: { writing: 7, presentations: 7, spreadsheets: 7, productivity: 7, projects: 6, documents: 6 } },
    notion: { name: "Notion", caps: { productivity: 9, projects: 8, documents: 6, writing: 6 } },
    slack: { name: "Slack", caps: { productivity: 7, meetings: 6, customer: 6 } },
    sheets: { name: "Excel / Sheets", caps: { spreadsheets: 9, data: 7 } },
    hubspot: { name: "HubSpot", caps: { sales: 9, customer: 8, marketing: 7, automation: 6 } },
    salesforce: { name: "Salesforce", caps: { sales: 9, customer: 8 } },
    jira: { name: "Jira", caps: { projects: 9, productivity: 7 } },
    asana: { name: "Asana", caps: { projects: 9, productivity: 8 } },
    trello: { name: "Trello", caps: { projects: 8, productivity: 7 } },
    canva: { name: "Canva", caps: { design: 9, content: 8, presentations: 7, image: 6 } },
    figma: { name: "Figma", caps: { design: 9, building: 6 } },
    adobe: { name: "Adobe", caps: { design: 9, image: 8, video: 7 } },
    whatsapp: { name: "WhatsApp", caps: { customer: 7, sales: 6 } },
  };

  /* Slot caps are in priority order: "a|b" prefers a strong `a` over a strong `b`.
   * Platforms are only eligible after the first step and get a small penalty
   * so an AI tool wins when one qualifies. */
  function fillSlot(slot, pool, used, stepIndex) {
    const caps = slot.split("|");
    let best = null, bestScore = -1;
    pool.forEach((t) => {
      if (used.has(t.id)) return;
      if (t.platform && stepIndex === 0) return;
      const s = Math.max(...caps.map((c, i) => (t.caps[c] || 0) - i * 1.5)) - (t.platform ? 0.5 : 0);
      if (s > bestScore) { bestScore = s; best = t; }
    });
    return bestScore >= 6 ? best : null;
  }

  function buildWorkflows(stackTools, ownedTools, demand, ecosystem) {
    /* Owned tools first so the chains reuse what the user already has;
     * platforms last so they only fill slots AI tools can't. */
    const platforms = (ecosystem || [])
      .filter((e) => PLATFORMS[e])
      .map((e) => ({ id: "platform:" + e, name: PLATFORMS[e].name, caps: PLATFORMS[e].caps, platform: true }));
    const pool = [...ownedTools, ...stackTools, ...platforms];
    const ranked = WORKFLOWS
      /* Average across `when` caps so a two-sided workflow (research → content)
       * needs both sides to matter, not just one. */
      .map((w) => ({ w, relevance: w.when.reduce((s, c) => s + (demand[c] || 0), 0) / w.when.length }))
      .filter((x) => x.relevance >= 0.3)
      .sort((a, b) => b.relevance - a.relevance);

    const out = [];
    for (const { w } of ranked) {
      if (out.length >= 3) break;
      const used = new Set();
      const tools = [];
      for (let i = 0; i < w.slots.length; i++) {
        const t = fillSlot(w.slots[i], pool, used, i);
        if (!t) break;
        used.add(t.id); tools.push(t);
      }
      if (tools.length === w.slots.length) out.push({ id: w.id, title: w.title, steps: w.steps, tools });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 6. Gaps: "you're leaving AI on the table"                           */
  /* ------------------------------------------------------------------ */
  function buildGaps(p, demand, ownedTools, stackTools) {
    const ownedCap = (cap, min = 8) => ownedTools.some((t) => (t.caps[cap] || 0) >= min);
    const stackName = (cap) => {
      const t = [...stackTools].sort((a, b) => (b.caps[cap] || 0) - (a.caps[cap] || 0))[0];
      return t && (t.caps[cap] || 0) >= 8 ? t.name : null;
    };
    const gaps = [];
    const push = (title, body, cap) => gaps.push({ title, body, fix: stackName(cap) });

    if ((p.tasks || []).includes("admin") && !ownedCap("automation"))
      push("Automation", "You spend real time on repetitive admin but nothing in your current stack automates it.", "automation");
    if ((demand.research || 0) >= 0.5 && !ownedCap("research", 9))
      push("Research", "Your work is research-heavy, but you don't have a dedicated, citation-first research tool.", "research");
    if ((demand.content || 0) >= 0.5 && !ownedCap("content") && !ownedCap("image") && !ownedCap("video"))
      push("AI creation", "You're creating content manually even though AI-assisted creation would compress most of that work.", "content");
    if ((demand.meetings || 0) >= 0.5 && !ownedCap("meetings"))
      push("Meeting capture", "Meetings eat your week and nothing is transcribing, summarising or turning them into actions.", "meetings");
    if ((demand.data || 0) >= 0.5 && !ownedCap("data"))
      push("Data analysis", "You analyse data regularly, but you're still doing it by hand instead of conversing with it.", "data");
    if ((demand.coding || 0) >= 0.5 && !ownedCap("coding"))
      push("AI-native coding", "You code without an AI editor — that's the single biggest productivity gap for builders right now.", "coding");
    if ((demand.learning || 0) >= 0.5 && !ownedCap("learning", 9))
      push("Grounded learning", "You study a lot but aren't using a source-grounded tool that learns from your own materials.", "learning");
    if ((demand.sales || 0) >= 0.5 && !ownedCap("sales"))
      push("Outreach", "Your role depends on outreach, but personalisation and follow-ups are still manual.", "sales");
    if ((demand.presentations || 0) >= 0.5 && !ownedCap("presentations"))
      push("Presentations", "You build decks regularly and still start from a blank slide.", "presentations");
    if (p.maturity <= 2 && (p.goals || []).includes("automate"))
      push("Skill gap", "You want to automate work, but your AI usage is still occasional. The tools exist — the habit doesn't yet.", "automation");

    const assistantOwned = ownedTools.some((t) => t.sub === "assistant");
    if (!assistantOwned) {
      const assistant = stackTools.find((t) => t.sub === "assistant");
      gaps.unshift({ title: "Daily copilot", body: "You don't yet have a general AI assistant in daily use. This is the foundation everything else builds on.", fix: assistant ? assistant.name : null });
    }

    return gaps.slice(0, 3);
  }

  /* ------------------------------------------------------------------ */
  /* 7. Learning path                                                    */
  /* ------------------------------------------------------------------ */
  function buildLearningPath(p, demand, stackTools) {
    const path = [];
    if (p.maturity <= 2) path.push({ title: "AI Foundations", blurb: "Prompting, context, and when to trust the output." });
    path.push({ title: "AI Productivity", blurb: "Make a general assistant your daily default." });
    const top = Object.entries(demand).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const MOD = {
      research: { title: "AI Research", blurb: "Verified answers, fast — without the hallucinations." },
      content: { title: "AI Content", blurb: "Repeatable systems for writing and visuals." },
      marketing: { title: "AI Marketing", blurb: "Campaigns, creative and analytics with AI in the loop." },
      data: { title: "AI for Data", blurb: "Analyse, chart and forecast by conversation." },
      spreadsheets: { title: "AI for Data", blurb: "Analyse, chart and forecast by conversation." },
      coding: { title: "AI-Native Development", blurb: "Agents, editors and shipping faster." },
      building: { title: "Build with AI", blurb: "Go from idea to working product without a team." },
      automation: { title: "AI Automation", blurb: "Connect your tools and remove manual steps." },
      agents: { title: "AI Agents", blurb: "Design agents that do real work end to end." },
      sales: { title: "AI for Sales", blurb: "Research, personalise and follow up at scale." },
      learning: { title: "Learn with AI", blurb: "Study systems built on your own sources." },
      video: { title: "AI Video", blurb: "Create and repurpose video in a fraction of the time." },
      image: { title: "AI Visuals", blurb: "Brand-consistent images on demand." },
      design: { title: "AI Visuals", blurb: "Brand-consistent images on demand." },
      meetings: { title: "AI Meetings", blurb: "Never take notes again — and act on every call." },
      documents: { title: "AI Document Analysis", blurb: "Interrogate contracts, reports and PDFs." },
      presentations: { title: "AI Presentations", blurb: "From brief to boardroom-ready deck." },
      customer: { title: "AI for Support", blurb: "Resolve faster with agents and drafts." },
      hiring: { title: "AI for Hiring", blurb: "Better JDs, interviews and decisions." },
    };
    const seen = new Set(path.map((m) => m.title));
    for (const c of top) {
      if (path.length >= 5) break;
      const m = MOD[c];
      if (m && !seen.has(m.title)) { path.push(m); seen.add(m.title); }
    }
    if (p.maturity >= 4 && !seen.has("AI Agents")) path.push(MOD.agents);
    return path.slice(0, 5);
  }

  /* ------------------------------------------------------------------ */
  /* 8. Summary numbers + copy (deterministic "LLM personalisation")     */
  /* ------------------------------------------------------------------ */
  function maturityScore(p, ownedTools) {
    /* 0–10. Usage + technical comfort + breadth of current stack. */
    const usage = (p.maturity - 1) / 4;                   // 0..1
    const tech = (p.tech - 1) / 4;                        // 0..1
    const layers = new Set(ownedTools.map((t) => t.layer)).size;
    const breadth = Math.min(layers, 4) / 4;              // 0..1
    return Math.round((usage * 0.5 + tech * 0.2 + breadth * 0.3) * 100) / 10;
  }

  function hoursSaved(p, demand, stackTools) {
    /* Sum weekly hours of selected tasks × how well the stack covers them × a
     * conservative 25–40% compression factor scaled by maturity. */
    let total = 0;
    (p.tasks || []).forEach((id) => {
      const t = byId(D.TASKS, id);
      if (!t || !t.hours) return;
      const caps = Object.keys(t.caps);
      const coverage = Math.max(0, ...stackTools.map((tool) => Math.max(...caps.map((c) => (tool.caps[c] || 0) / 10))));
      total += t.hours * coverage;
    });
    const factor = 0.25 + (p.maturity - 1) * 0.0375;      // 0.25 → 0.40
    return Math.max(1, Math.round(total * factor));
  }

  function roleHeadline(p, n) {
    const r = p.role;
    const map = {
      student: `We found ${n} tools to help you research, learn and create faster.`,
      marketing: `We identified ${n} tools across research, content and automation that fit how you market.`,
      engineering: `We identified ${n} tools across coding, research and shipping that fit how you build.`,
      sales: `We identified ${n} tools to help you find, personalise and follow up faster.`,
      founder: `We identified ${n} tools that cover thinking, building, selling and automating — the founder loop.`,
      design: `We identified ${n} tools across visuals, video and prototyping that fit your craft.`,
      data: `We identified ${n} tools to analyse, model and present data with far less manual work.`,
      finance: `We identified ${n} tools for spreadsheets, documents and analysis that fit how you work.`,
      hr: `We identified ${n} tools for hiring, writing and people operations.`,
      operations: `We identified ${n} tools to automate the repetitive parts of running things.`,
      cs: `We identified ${n} tools to resolve faster and write better, without losing the human touch.`,
      consultant: `We identified ${n} tools across research, documents and presentations that fit client work.`,
      creator: `We identified ${n} tools to create, edit and publish far more in far less time.`,
      healthcare: `We identified ${n} tools for clinical research, documentation and learning.`,
      education: `We identified ${n} tools for planning, teaching and creating materials.`,
      legal: `We identified ${n} tools for drafting, review and research.`,
    };
    return map[r] || `We identified ${n} tools built around how you actually work.`;
  }

  function narrative(p, stack, demand) {
    const topCaps = Object.entries(demand).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => CAP_LABELS[c] || c);
    const goals = (p.goals || []).map((g) => label(D.GOALS, g).toLowerCase()).slice(0, 2);
    const first = stack[0] ? stack[0].tool.name : "a general assistant";
    const mat = label(D.MATURITY, p.maturity).toLowerCase();
    const lines = [];
    lines.push(`Your week is dominated by ${topCaps.slice(0, 2).join(" and ").toLowerCase()}${topCaps[2] ? `, with ${topCaps[2].toLowerCase()} close behind` : ""}.`);
    if (goals.length) lines.push(`You told us you mostly want to ${goals.join(" and ")}, so the stack is weighted toward tools that do exactly that rather than the most popular ones.`);
    lines.push(`As a ${mat}${p.tech <= 2 ? " who prefers tools that just work" : p.tech >= 4 ? " comfortable connecting tools together" : ""}, we kept the complexity ${p.tech <= 2 ? "low" : p.tech >= 4 ? "where you can use it" : "balanced"} and started with ${first} as the foundation.`);
    return lines.join(" ");
  }

  /* Why this tool, for this person — 1 line per card. */
  function whyLine(tool, p, s) {
    const strongest = Object.entries(tool.caps)
      .filter(([c]) => (s.demand[c] || 0) > 0.3)
      .sort((a, b) => (b[1] * (s.demand[b[0]] || 0)) - (a[1] * (s.demand[a[0]] || 0)))
      .slice(0, 2).map(([c]) => (CAP_LABELS[c] || c).toLowerCase());
    const eco = new Set(p.ecosystem || []);
    const parts = [];
    if (strongest.length) parts.push(`Strong fit for ${strongest.join(" and ")}`);
    if (tool.native.some((n) => eco.has(n))) parts.push(`lives inside ${label(D.ECOSYSTEM, tool.native.find((n) => eco.has(n)))}, which you already use`);
    else if (tool.integrations.some((i) => eco.has(i))) parts.push(`connects to ${label(D.ECOSYSTEM, tool.integrations.find((i) => eco.has(i)))}`);
    if (tool.free && (p.invest === "A" || (p.prefs || []).includes("affordable"))) parts.push("free tier covers most of what you need");
    if ((p.prefs || []).includes("easy") && tool.ease >= 9) parts.push("almost zero learning curve");
    if ((p.prefs || []).includes("quality") && tool.quality >= 9) parts.push("best-in-class output");
    return parts.length ? parts.join(" · ") : `Matches your ${label(D.ROLES, p.role).toLowerCase()} workflow`;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  function recommend(profileIn) {
    const p = Object.assign({ tasks: [], goals: [], useCases: [], aiTools: [], ecosystem: [], prefs: [], maturity: 2, tech: 3, invest: "B", budget: "b1", role: "other" }, profileIn);
    p.maturity = Number(p.maturity); p.tech = Number(p.tech);

    const owned = new Set((p.aiTools || []).filter((id) => id !== "none" && id !== "other"));
    const budgetMax = (byId(D.BUDGET, p.budget) || D.BUDGET[1]).max;
    const demand = buildDemand(p);
    const ctx = { owned, budgetMax, demand };

    const ranked = TOOLS
      .filter((t) => passesFilters(t, p, ctx))
      .map((tool) => Object.assign({ tool }, scoreTool(tool, p, ctx)))
      .sort((a, b) => b.score - a.score);

    const picked = pickStack(ranked, p, ctx);
    const topScore = picked.length ? picked[0].score : 1;
    const stack = picked.map((r, i) => ({
      rank: i + 1,
      tool: r.tool,
      score: r.score,
      /* Fit % is relative to the best match so the top card reads ~96%. */
      fit: Math.round(clamp(0.72 + (r.score / topScore) * 0.26 - i * 0.012, 0.6, 0.98) * 100),
      why: whyLine(r.tool, p, { demand }),
    }));

    const ownedTools = TOOLS.filter((t) => owned.has(t.id));
    const stackTools = stack.map((s) => s.tool);

    /* Stack by layer — only layers that are present. Include owned tools so
     * the picture is of their *whole* operating system. */
    const layers = D.LAYERS.map((L) => ({
      id: L.id, label: L.label, blurb: L.blurb,
      tools: [
        ...stackTools.filter((t) => t.layer === L.id).map((t) => ({ tool: t, owned: false })),
        ...ownedTools.filter((t) => t.layer === L.id).map((t) => ({ tool: t, owned: true })),
      ],
    })).filter((L) => L.tools.length);

    const workflows = buildWorkflows(stackTools, ownedTools, demand, p.ecosystem);
    const gaps = buildGaps(p, demand, ownedTools, stackTools);
    const learningPath = buildLearningPath(p, demand, stackTools);
    const monthly = stackTools.reduce((sum, t) => sum + (t.free ? 0 : t.price), 0);

    return {
      profile: p,
      firstName: (p.firstName || "").trim(),
      demand,
      stack,
      layers,
      workflows,
      gaps,
      learningPath,
      summary: {
        roleLabel: label(D.ROLES, p.role),
        workLabel: label(D.WORK, p.work),
        focusLabel: label(D.ALL_FOCUS, p.focus),
        focusEmoji: (byId(D.ALL_FOCUS, p.focus) || {}).emoji || "🎯",
        maturityLabel: label(D.MATURITY, p.maturity),
        techLabel: `${p.tech}/5 · ${label(D.TECH, p.tech)}`,
        goalLabels: (p.goals || []).map((g) => label(D.GOALS, g)),
        topCaps: Object.entries(demand).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => CAP_LABELS[c] || c),
        maturityScore: maturityScore(p, ownedTools),
        hoursSaved: hoursSaved(p, demand, stackTools),
        toolCount: stack.length,
        workflowCount: workflows.length,
        ownedCount: ownedTools.length,
        monthlyEstimate: monthly,
        headline: roleHeadline(p, stack.length),
        narrative: narrative(p, stack, demand),
      },
      debug: ranked.slice(0, 15).map((r) => ({ id: r.tool.id, score: +r.score.toFixed(3), use: +r.useCaseFit.toFixed(2), role: +r.roleFit.toFixed(2), peak: +r.peak.toFixed(2) })),
    };
  }

  root.LoadoutEngine = { recommend, buildDemand, CAP_LABELS };
})(typeof window !== "undefined" ? window : globalThis);
