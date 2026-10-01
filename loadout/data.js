/* Loadout — question definitions + shared vocabularies.
 * Works in the browser (window.LoadoutData) and Node (globalThis.LoadoutData). */
(function (root) {
  "use strict";

  /* Q1 — work context. Sets the tone + used by the AI deep search prompt. */
  const WORK = [
    { id: "company", emoji: "🏢", label: "I work for a company" },
    { id: "own", emoji: "🚀", label: "I run my own business" },
    { id: "freelance", emoji: "🧑‍💻", label: "I freelance / consult" },
    { id: "student", emoji: "🎓", label: "I'm studying" },
    { id: "between", emoji: "🧭", label: "I'm between things / exploring" },
  ];

  const ROLES = [
    { id: "student", emoji: "🎓", label: "Student" },
    { id: "founder", emoji: "🚀", label: "Founder / Entrepreneur" },
    { id: "marketing", emoji: "📣", label: "Marketing / Growth" },
    { id: "sales", emoji: "🤝", label: "Sales / Business Development" },
    { id: "product", emoji: "🧭", label: "Product / Program Management" },
    { id: "design", emoji: "🎨", label: "Design / Creative" },
    { id: "engineering", emoji: "💻", label: "Engineering / Software" },
    { id: "data", emoji: "📊", label: "Data / Analytics" },
    { id: "finance", emoji: "💰", label: "Finance / Accounting" },
    { id: "hr", emoji: "🧑‍🤝‍🧑", label: "HR / People" },
    { id: "operations", emoji: "⚙️", label: "Operations" },
    { id: "cs", emoji: "🎧", label: "Customer Success / Support" },
    { id: "consultant", emoji: "💼", label: "Consultant / Freelancer" },
    { id: "creator", emoji: "🎬", label: "Creator / Influencer" },
    { id: "healthcare", emoji: "🩺", label: "Healthcare / Medical" },
    { id: "education", emoji: "🍎", label: "Education / Teaching" },
    { id: "legal", emoji: "⚖️", label: "Legal" },
    { id: "other", emoji: "✨", label: "Other" },
  ];

  /* Q2 tasks → capability demand. Weights express how strongly the task
   * implies a need for that capability. `hours` = rough weekly hours the
   * task consumes, used for the "time saved" estimate. */
  const TASKS = [
    { id: "writing", emoji: "✍️", label: "Writing emails, docs or messages", caps: { writing: 1, documents: 0.5 }, hours: 3 },
    { id: "research", emoji: "🔍", label: "Researching & finding information", caps: { research: 1, documents: 0.4 }, hours: 2.5 },
    { id: "analysis", emoji: "📈", label: "Analysing data or information", caps: { data: 1, documents: 0.5, thinking: 0.3 }, hours: 2 },
    { id: "content", emoji: "📝", label: "Creating content", caps: { content: 1, writing: 0.5, marketing: 0.4 }, hours: 3 },
    { id: "presentations", emoji: "📽️", label: "Making presentations", caps: { presentations: 1, design: 0.3 }, hours: 1.5 },
    { id: "visuals", emoji: "🎨", label: "Designing visuals", caps: { image: 1, design: 1 }, hours: 1.5 },
    { id: "video", emoji: "🎬", label: "Creating / editing video", caps: { video: 1, voice: 0.3 }, hours: 2 },
    { id: "meetings", emoji: "🗓️", label: "Meetings & communication", caps: { meetings: 1, productivity: 0.5 }, hours: 2 },
    { id: "sales", emoji: "📞", label: "Sales / outreach", caps: { sales: 1, writing: 0.3 }, hours: 2 },
    { id: "customer", emoji: "💬", label: "Talking to customers", caps: { customer: 1, writing: 0.3 }, hours: 2 },
    { id: "projects", emoji: "✅", label: "Managing projects / tasks", caps: { projects: 1, productivity: 0.7 }, hours: 1.5 },
    { id: "planning", emoji: "🧠", label: "Planning & decision-making", caps: { thinking: 1, research: 0.4, documents: 0.3 }, hours: 1 },
    { id: "learning", emoji: "📚", label: "Learning / studying", caps: { learning: 1, research: 0.5 }, hours: 2 },
    { id: "coding", emoji: "💻", label: "Coding / building software", caps: { coding: 1, building: 0.6 }, hours: 4 },
    { id: "spreadsheets", emoji: "🧮", label: "Wrangling spreadsheets", caps: { spreadsheets: 1, data: 0.8 }, hours: 2 },
    { id: "admin", emoji: "🔁", label: "Repetitive admin work", caps: { automation: 1, productivity: 0.6 }, hours: 3 },
    { id: "hiring", emoji: "🧲", label: "Hiring / recruiting", caps: { hiring: 1, writing: 0.3 }, hours: 1.5 },
    { id: "other", emoji: "➕", label: "Something else", caps: {}, hours: 0 },
  ];

  /* Role-dependent "focus" question. Each option maps to capability demand so
   * the deterministic engine listens too, not just the AI deep search. */
  const FOCUS_BY_ROLE = {
    student: [
      { id: "study_faster", emoji: "⚡", label: "Study faster & remember more", caps: { learning: 1, documents: 0.5 } },
      { id: "assignments", emoji: "📄", label: "Write better assignments & essays", caps: { writing: 1, research: 0.5 } },
      { id: "research_papers", emoji: "🔬", label: "Research papers without drowning", caps: { research: 1, documents: 0.7 } },
      { id: "projects_pres", emoji: "🎤", label: "Projects & presentations that stand out", caps: { presentations: 1, image: 0.4 } },
      { id: "job_ready", emoji: "💼", label: "Get job-ready with AI skills", caps: { productivity: 0.6, learning: 0.6, building: 0.3 } },
    ],
    founder: [
      { id: "ship_product", emoji: "🛠️", label: "Ship product without a big team", caps: { building: 1, coding: 0.5 } },
      { id: "get_customers", emoji: "🎯", label: "Find & convert customers", caps: { sales: 1, marketing: 0.7 } },
      { id: "content_brand", emoji: "📣", label: "Content & brand on autopilot", caps: { content: 1, marketing: 0.6, image: 0.3 } },
      { id: "ops_autopilot", emoji: "⚙️", label: "Run ops with fewer hands", caps: { automation: 1, agents: 0.5 } },
      { id: "think_clearer", emoji: "🧠", label: "Think clearer, decide faster", caps: { thinking: 1, research: 0.5 } },
    ],
    marketing: [
      { id: "content_volume", emoji: "🏭", label: "10× content without 10× effort", caps: { content: 1, writing: 0.6 } },
      { id: "campaign_ideas", emoji: "💡", label: "Campaign ideas & research", caps: { research: 1, marketing: 0.7, thinking: 0.3 } },
      { id: "visuals_fast", emoji: "🖼️", label: "Creatives, visuals & video, fast", caps: { image: 1, video: 0.6, design: 0.4 } },
      { id: "performance", emoji: "📊", label: "Reporting & performance analysis", caps: { data: 1, spreadsheets: 0.5 } },
      { id: "mkt_automation", emoji: "🔁", label: "Automate repetitive marketing ops", caps: { automation: 1, marketing: 0.4 } },
    ],
    sales: [
      { id: "prospecting", emoji: "🎯", label: "Find & qualify better leads", caps: { sales: 1, research: 0.6 } },
      { id: "outreach", emoji: "✉️", label: "Personalised outreach at scale", caps: { sales: 0.8, writing: 1 } },
      { id: "call_notes", emoji: "📝", label: "Call notes & CRM hygiene, automatically", caps: { meetings: 1, automation: 0.6 } },
      { id: "proposals", emoji: "📑", label: "Proposals, decks & follow-ups", caps: { presentations: 0.8, writing: 0.7, documents: 0.3 } },
      { id: "pipeline_insight", emoji: "📈", label: "Pipeline insight & forecasting", caps: { data: 1, spreadsheets: 0.5 } },
    ],
    product: [
      { id: "specs", emoji: "📄", label: "PRDs, specs & docs in half the time", caps: { writing: 1, documents: 0.6 } },
      { id: "user_research", emoji: "🧪", label: "Synthesise user research & feedback", caps: { research: 1, documents: 0.8 } },
      { id: "prototypes", emoji: "🧩", label: "Prototype ideas without engineering", caps: { building: 1, design: 0.4 } },
      { id: "pm_meetings", emoji: "🗓️", label: "Meetings, notes & stakeholder updates", caps: { meetings: 1, productivity: 0.5 } },
      { id: "product_data", emoji: "📊", label: "Make sense of product data", caps: { data: 1, thinking: 0.5 } },
    ],
    design: [
      { id: "concepting", emoji: "💡", label: "Concepting & moodboards, faster", caps: { image: 1, design: 0.8 } },
      { id: "production", emoji: "🏭", label: "Production work on autopilot", caps: { design: 1, automation: 0.4 } },
      { id: "motion", emoji: "🎬", label: "Motion & video without the grind", caps: { video: 1, voice: 0.3 } },
      { id: "design_proto", emoji: "🧩", label: "Clickable prototypes & microsites", caps: { building: 1, design: 0.5 } },
      { id: "design_writing", emoji: "✍️", label: "Case studies, decks & copy", caps: { writing: 1, presentations: 0.6 } },
    ],
    engineering: [
      { id: "code_faster", emoji: "⚡", label: "Write & review code faster", caps: { coding: 1 } },
      { id: "debug", emoji: "🐛", label: "Debug, understand & refactor legacy code", caps: { coding: 1, documents: 0.4 } },
      { id: "build_agents", emoji: "🤖", label: "Build agents & AI features", caps: { agents: 1, coding: 0.6, building: 0.4 } },
      { id: "docs_tests", emoji: "📄", label: "Docs, tests & PR descriptions", caps: { writing: 0.8, coding: 0.6 } },
      { id: "eng_research", emoji: "🔍", label: "Research libraries, APIs & approaches", caps: { research: 1, coding: 0.3 } },
    ],
    data: [
      { id: "analysis_speed", emoji: "⚡", label: "Analyse data in minutes, not days", caps: { data: 1, spreadsheets: 0.5 } },
      { id: "sql_code", emoji: "💻", label: "Write SQL / Python without friction", caps: { coding: 1, data: 0.6 } },
      { id: "storytelling", emoji: "📽️", label: "Turn numbers into stories & decks", caps: { presentations: 1, data: 0.5, writing: 0.4 } },
      { id: "pipelines", emoji: "🔁", label: "Automate reports & pipelines", caps: { automation: 1, data: 0.4 } },
      { id: "data_research", emoji: "🔬", label: "Keep up with methods & research", caps: { research: 1, learning: 0.5 } },
    ],
    finance: [
      { id: "models", emoji: "🧮", label: "Models & spreadsheets, faster", caps: { spreadsheets: 1, data: 0.7 } },
      { id: "reporting", emoji: "📄", label: "Reports, memos & board decks", caps: { writing: 1, presentations: 0.6 } },
      { id: "doc_review", emoji: "🔍", label: "Review contracts, filings & long docs", caps: { documents: 1, research: 0.4 } },
      { id: "fin_automation", emoji: "🔁", label: "Automate reconciliations & admin", caps: { automation: 1, spreadsheets: 0.4 } },
      { id: "fin_decisions", emoji: "🧠", label: "Sharper analysis for decisions", caps: { thinking: 1, data: 0.6 } },
    ],
    hr: [
      { id: "hiring_speed", emoji: "🧲", label: "Hire faster: JDs, screening, scheduling", caps: { hiring: 1, writing: 0.4 } },
      { id: "people_comms", emoji: "✉️", label: "Policies, comms & announcements", caps: { writing: 1, documents: 0.4 } },
      { id: "hr_meetings", emoji: "🗓️", label: "Interviews & meeting notes, captured", caps: { meetings: 1 } },
      { id: "learning_programs", emoji: "📚", label: "Build learning & onboarding programs", caps: { learning: 0.8, content: 0.7, presentations: 0.4 } },
      { id: "hr_automation", emoji: "🔁", label: "Automate the HR admin", caps: { automation: 1, productivity: 0.5 } },
    ],
    operations: [
      { id: "ops_auto", emoji: "🔁", label: "Automate repetitive processes", caps: { automation: 1, agents: 0.4 } },
      { id: "ops_tracking", emoji: "✅", label: "Track projects & keep teams aligned", caps: { projects: 1, productivity: 0.6 } },
      { id: "ops_data", emoji: "📊", label: "Dashboards & data without engineers", caps: { data: 1, spreadsheets: 0.7 } },
      { id: "ops_docs", emoji: "📄", label: "SOPs, docs & vendor comms", caps: { writing: 1, documents: 0.5 } },
      { id: "ops_tools", emoji: "🧩", label: "Build internal tools, no-code", caps: { building: 1, automation: 0.5 } },
    ],
    cs: [
      { id: "faster_replies", emoji: "⚡", label: "Faster, better replies", caps: { customer: 1, writing: 0.7 } },
      { id: "knowledge", emoji: "📚", label: "Help centre & knowledge base", caps: { content: 0.8, documents: 0.7 } },
      { id: "cs_insight", emoji: "📈", label: "Spot trends in tickets & feedback", caps: { data: 1, documents: 0.5 } },
      { id: "cs_bots", emoji: "🤖", label: "Deflect tickets with AI agents", caps: { agents: 1, customer: 0.6, automation: 0.5 } },
      { id: "cs_calls", emoji: "🎧", label: "Call summaries & handovers", caps: { meetings: 1, customer: 0.4 } },
    ],
    consultant: [
      { id: "client_research", emoji: "🔍", label: "Deep client & market research", caps: { research: 1, documents: 0.5 } },
      { id: "deliverables", emoji: "📽️", label: "Decks & deliverables that impress", caps: { presentations: 1, writing: 0.6 } },
      { id: "proposals_c", emoji: "📑", label: "Proposals & pitches, fast", caps: { writing: 1, sales: 0.5 } },
      { id: "client_ops", emoji: "⚙️", label: "Run the business side solo", caps: { automation: 1, productivity: 0.6 } },
      { id: "consult_meetings", emoji: "🗓️", label: "Client calls captured & actioned", caps: { meetings: 1 } },
    ],
    creator: [
      { id: "scripts", emoji: "✍️", label: "Scripts, hooks & captions", caps: { writing: 1, content: 0.8 } },
      { id: "video_edit", emoji: "🎬", label: "Edit video 5× faster", caps: { video: 1 } },
      { id: "thumbnails", emoji: "🖼️", label: "Thumbnails & visuals that pop", caps: { image: 1, design: 0.6 } },
      { id: "voice_pod", emoji: "🎙️", label: "Voice, podcast & audio", caps: { voice: 1, video: 0.3 } },
      { id: "creator_biz", emoji: "💰", label: "Monetise & run the business", caps: { marketing: 1, automation: 0.5, sales: 0.4 } },
    ],
    healthcare: [
      { id: "clinical_docs", emoji: "📄", label: "Clinical notes & documentation", caps: { documents: 1, writing: 0.6, meetings: 0.5 } },
      { id: "med_research", emoji: "🔬", label: "Stay on top of research & guidelines", caps: { research: 1, learning: 0.6 } },
      { id: "patient_comms", emoji: "💬", label: "Patient education & comms", caps: { writing: 1, content: 0.5 } },
      { id: "med_admin", emoji: "🔁", label: "Cut the admin burden", caps: { automation: 1, productivity: 0.6 } },
      { id: "med_learning", emoji: "📚", label: "Study & upskill efficiently", caps: { learning: 1, documents: 0.4 } },
    ],
    education: [
      { id: "lesson_plans", emoji: "📝", label: "Lesson plans & materials", caps: { content: 1, writing: 0.6, presentations: 0.5 } },
      { id: "grading", emoji: "✅", label: "Feedback & grading, faster", caps: { documents: 1, writing: 0.5, automation: 0.3 } },
      { id: "engaging", emoji: "🎨", label: "Engaging visuals, quizzes & videos", caps: { image: 0.8, video: 0.6, presentations: 0.5 } },
      { id: "edu_research", emoji: "🔍", label: "Research & keep up with the field", caps: { research: 1, learning: 0.5 } },
      { id: "edu_admin", emoji: "🔁", label: "Automate the admin", caps: { automation: 1, productivity: 0.5 } },
    ],
    legal: [
      { id: "contract_review", emoji: "🔍", label: "Review contracts & long documents", caps: { documents: 1, research: 0.3 } },
      { id: "drafting", emoji: "✍️", label: "Drafting & redlining", caps: { writing: 1, documents: 0.6 } },
      { id: "legal_research", emoji: "📚", label: "Legal research & case law", caps: { research: 1, documents: 0.5 } },
      { id: "client_updates", emoji: "✉️", label: "Client updates & memos", caps: { writing: 1, meetings: 0.4 } },
      { id: "legal_admin", emoji: "🔁", label: "Intake, billing & admin", caps: { automation: 1, productivity: 0.5 } },
    ],
    other: [
      { id: "write_better", emoji: "✍️", label: "Write better, faster", caps: { writing: 1 } },
      { id: "research_better", emoji: "🔍", label: "Research & learn anything", caps: { research: 1, learning: 0.6 } },
      { id: "create_things", emoji: "🎨", label: "Create visuals, video & content", caps: { content: 1, image: 0.6, video: 0.4 } },
      { id: "automate_life", emoji: "🔁", label: "Automate the boring stuff", caps: { automation: 1, productivity: 0.6 } },
      { id: "build_stuff", emoji: "🛠️", label: "Build apps & websites", caps: { building: 1, coding: 0.4 } },
    ],
  };
  const focusOptions = (role) => FOCUS_BY_ROLE[role] || FOCUS_BY_ROLE.other;
  const ALL_FOCUS = Object.values(FOCUS_BY_ROLE).flat();

  /* Q3 goals → capabilities that serve the goal. */
  const GOALS = [
    { id: "save_time", emoji: "⏰", label: "Save time", caps: ["productivity", "automation", "meetings", "writing"] },
    { id: "more_done", emoji: "🏋️", label: "Get more work done", caps: ["productivity", "automation", "projects"] },
    { id: "quality", emoji: "💎", label: "Improve the quality of my work", caps: ["writing", "thinking", "data", "research"] },
    { id: "learn_faster", emoji: "🧠", label: "Learn faster", caps: ["learning", "research", "documents"] },
    { id: "better_content", emoji: "🎨", label: "Create better content", caps: ["content", "writing", "image", "video", "presentations", "design"] },
    { id: "automate", emoji: "🤖", label: "Automate repetitive work", caps: ["automation", "agents"] },
    { id: "decisions", emoji: "🎯", label: "Make better decisions", caps: ["thinking", "data", "research"] },
    { id: "build_faster", emoji: "🛠️", label: "Build things faster", caps: ["coding", "building"] },
    { id: "earn_more", emoji: "💰", label: "Earn more / grow my business", caps: ["sales", "marketing", "automation", "building"] },
    { id: "career", emoji: "🚀", label: "Grow my career", caps: ["learning", "productivity", "writing"] },
    { id: "explore", emoji: "🔭", label: "Explore what's possible with AI", caps: ["agents", "image", "video", "building", "voice"] },
  ];

  /* Q4 use cases — ids are capability keys directly. */
  const USE_CASES = [
    { id: "research", emoji: "🔍", label: "Research" },
    { id: "writing", emoji: "✍️", label: "Writing" },
    { id: "data", emoji: "📊", label: "Data analysis" },
    { id: "documents", emoji: "📄", label: "Document analysis" },
    { id: "presentations", emoji: "📽️", label: "Presentations" },
    { id: "image", emoji: "🖼️", label: "Image generation" },
    { id: "video", emoji: "🎬", label: "Video generation / editing" },
    { id: "voice", emoji: "🎙️", label: "Voice / audio" },
    { id: "content", emoji: "📝", label: "Content creation" },
    { id: "coding", emoji: "💻", label: "Coding" },
    { id: "building", emoji: "🧩", label: "Website / app building" },
    { id: "automation", emoji: "🔁", label: "Automation" },
    { id: "agents", emoji: "🤖", label: "AI agents" },
    { id: "sales", emoji: "📞", label: "Sales / outreach" },
    { id: "marketing", emoji: "📣", label: "Marketing" },
    { id: "learning", emoji: "📚", label: "Learning / studying" },
    { id: "productivity", emoji: "⚡", label: "Personal productivity" },
    { id: "other", emoji: "➕", label: "Something else" },
  ];

  const MATURITY = [
    { id: 1, emoji: "🌱", label: "Just starting", hint: "I've barely used AI." },
    { id: 2, emoji: "👀", label: "Exploring", hint: "I've used ChatGPT / Gemini / Claude occasionally." },
    { id: 3, emoji: "🔁", label: "Regular user", hint: "I use AI several times a week." },
    { id: 4, emoji: "⚡", label: "Power user", hint: "AI is part of my daily workflow." },
    { id: 5, emoji: "🧙", label: "AI builder", hint: "I've built workflows, automations, agents or apps with AI." },
  ];

  const TECH = [
    { id: 1, emoji: "🧸", label: "Keep it simple", hint: "I want tools that work immediately." },
    { id: 2, emoji: "🙂", label: "Basic", hint: "I'm comfortable learning simple software." },
    { id: 3, emoji: "😎", label: "Comfortable", hint: "I can figure most tools out." },
    { id: 4, emoji: "🔧", label: "Advanced", hint: "I'm comfortable connecting tools and building workflows." },
    { id: 5, emoji: "🧑‍💻", label: "Technical", hint: "I'm comfortable coding / building technical systems." },
  ];

  /* Q6 — ids must match tool ids in tools.js so the engine can mark them. */
  const AI_TOOL_GROUPS = [
    { label: "General AI", options: [
      { id: "chatgpt", emoji: "💬", label: "ChatGPT" }, { id: "claude", emoji: "🟠", label: "Claude" }, { id: "gemini", emoji: "✨", label: "Gemini" },
      { id: "copilot", emoji: "🪟", label: "Microsoft Copilot" }, { id: "perplexity", emoji: "🔎", label: "Perplexity" }, { id: "notebooklm", emoji: "📓", label: "NotebookLM" },
    ] },
    { label: "Creation", options: [
      { id: "canva", emoji: "🎨", label: "Canva" }, { id: "midjourney", emoji: "🖼️", label: "Midjourney" }, { id: "runway", emoji: "🎬", label: "Runway" },
      { id: "gamma", emoji: "📽️", label: "Gamma" }, { id: "elevenlabs", emoji: "🎙️", label: "ElevenLabs" }, { id: "heygen", emoji: "🧑‍🎤", label: "HeyGen" },
    ] },
    { label: "Building", options: [
      { id: "cursor", emoji: "🖱️", label: "Cursor" }, { id: "github-copilot", emoji: "🐙", label: "GitHub Copilot" }, { id: "lovable", emoji: "💗", label: "Lovable" },
      { id: "replit", emoji: "🧪", label: "Replit" }, { id: "v0", emoji: "▲", label: "v0" },
    ] },
    { label: "Automation", options: [
      { id: "zapier", emoji: "⚡", label: "Zapier" }, { id: "make", emoji: "🧩", label: "Make" }, { id: "n8n", emoji: "🔗", label: "n8n" },
    ] },
    { label: "Other", options: [
      { id: "other", emoji: "➕", label: "Other" }, { id: "none", emoji: "🙅", label: "None of these", exclusive: true },
    ] },
  ];

  const ECOSYSTEM = [
    { id: "google", emoji: "🟢", label: "Google Workspace" }, { id: "microsoft", emoji: "🪟", label: "Microsoft 365" },
    { id: "slack", emoji: "💬", label: "Slack" }, { id: "notion", emoji: "📓", label: "Notion" }, { id: "whatsapp", emoji: "📱", label: "WhatsApp" },
    { id: "canva", emoji: "🎨", label: "Canva" }, { id: "figma", emoji: "🖌️", label: "Figma" }, { id: "sheets", emoji: "🧮", label: "Excel / Google Sheets" },
    { id: "adobe", emoji: "🅰️", label: "Adobe" }, { id: "hubspot", emoji: "🧲", label: "HubSpot" }, { id: "salesforce", emoji: "☁️", label: "Salesforce" },
    { id: "jira", emoji: "🎫", label: "Jira" }, { id: "asana", emoji: "✅", label: "Asana" }, { id: "trello", emoji: "🗂️", label: "Trello" },
    { id: "other", emoji: "➕", label: "Other" }, { id: "none", emoji: "🤷", label: "None / Not sure", exclusive: true },
  ];

  const PREFS = [
    { id: "affordable", emoji: "🆓", label: "Free / affordable" },
    { id: "easy", emoji: "🧸", label: "Easy to use" },
    { id: "quality", emoji: "💎", label: "Best possible output quality" },
    { id: "time", emoji: "⏰", label: "Saves significant time" },
    { id: "integrates", emoji: "🔌", label: "Works with my existing tools" },
    { id: "nocode", emoji: "🧩", label: "No-code" },
    { id: "automate", emoji: "🤖", label: "Can automate work" },
    { id: "powerful", emoji: "🚀", label: "Advanced / powerful features" },
    { id: "privacy", emoji: "🔒", label: "Privacy / security" },
    { id: "scales", emoji: "📈", label: "Scales with me as I level up" },
  ];

  const INVEST = [
    { id: "A", emoji: "🆓", label: "Free & instant", hint: "I want free tools that I can start using immediately." },
    { id: "B", emoji: "☕", label: "Affordable & practical", hint: "I'm happy to spend a little if it saves me time." },
    { id: "C", emoji: "💳", label: "Invest if it's valuable", hint: "I'll pay for tools that meaningfully improve my work." },
    { id: "D", emoji: "🔥", label: "All-in", hint: "I'm willing to invest in premium tools and seriously build AI skills." },
  ];

  /* max = highest monthly INR the user will spend on a single tool. */
  const BUDGET = [
    { id: "b0", label: "₹0", max: 0 },
    { id: "b1", label: "Under ₹1,000", max: 1000 },
    { id: "b2", label: "₹1,000 – ₹3,000", max: 3000 },
    { id: "b3", label: "₹3,000 – ₹10,000", max: 10000 },
    { id: "b4", label: "₹10,000+", max: Infinity },
  ];

  /* Interstitial "facts" shown between questions (Coursiv-style excitement
   * beats). `after` = question id they appear after. `dynamic` ones get
   * filled in by app.js from the answers so far. */
  const FACTS = [
    { after: "role", emoji: "⚡", stat: "40%", title: "of working hours can be augmented by AI today", body: "Across most knowledge jobs, nearly half of the tasks — writing, research, analysis, admin — already have a capable AI tool behind them.", source: "Accenture, Work Trend research" },
    { after: "goals", emoji: "🧠", dynamic: "goals" },
    { after: "aiTools", emoji: "🔭", stat: "500+", title: "serious AI tools launched in the last 18 months", body: "Nobody can keep up. That's exactly why we don't recommend the most popular tools — we recommend the ones that fit how you work.", source: "Loadout tool index" },
    { after: "tech", emoji: "🏆", stat: "66%", title: "average productivity lift for people using generative AI at work", body: "Writers, support agents and developers in controlled studies finished real tasks far faster — and the biggest gains went to people who weren't already experts.", source: "Nielsen Norman Group meta-analysis" },
  ];

  /* Stack layers, in display order. */
  const LAYERS = [
    { id: "think", label: "Think", blurb: "Your everyday reasoning & writing copilot" },
    { id: "research", label: "Research", blurb: "Find, verify and synthesise information" },
    { id: "learn", label: "Learn", blurb: "Turn sources into understanding" },
    { id: "create", label: "Create", blurb: "Visuals, decks, video and audio" },
    { id: "build", label: "Build", blurb: "Ship software and products" },
    { id: "automate", label: "Automate", blurb: "Connect tools and remove manual work" },
    { id: "organize", label: "Organize", blurb: "Capture, summarise and keep track" },
    { id: "specialist", label: "Specialist", blurb: "Built for your role" },
  ];

  /* The 12 question screens. `type` drives rendering in app.js.
   * `dense: true` → compact 2-column grid (long lists); default is big rows.
   * `optionsFor(profile)` → role-dependent options (focus question). */
  const QUESTIONS = [
    { id: "work", type: "single", title: "How would you describe yourself?", hint: "", options: WORK },
    { id: "role", type: "single", dense: true, title: "What's closest to what you do?", hint: "Pick the closest fit — it's the base layer of your stack.", options: ROLES },
    { id: "tasks", type: "multi", max: 5, dense: true, title: "Where does your week actually go?", hint: "Select up to 5. This matters more than your title.", options: TASKS },
    { id: "focus", type: "single", title: "If AI could crack one thing for you, what would it be?", hint: "We'll deep-search the web for tools built for exactly this.", optionsFor: (p) => focusOptions(p.role) },
    { id: "goals", type: "multi", max: 3, title: "What's your biggest reason for using AI?", hint: "Select up to 3. Your stack gets optimised for these.", options: GOALS },
    { id: "useCases", type: "multi", max: 5, dense: true, title: "What would you love AI to do for you?", hint: "Select up to 5.", options: USE_CASES },
    { id: "maturity", type: "scale", title: "How are you using AI right now?", hint: "Be honest — this decides how advanced your stack gets.", options: MATURITY },
    { id: "aiTools", type: "multi-grouped", title: "Which of these have you used recently?", hint: "We won't re-recommend what you already use — we'll fill the gaps around it.", groups: AI_TOOL_GROUPS },
    { id: "ecosystem", type: "multi", dense: true, title: "Which platforms do you live in?", hint: "So we recommend tools that plug into what you already have.", options: ECOSYSTEM },
    { id: "tech", type: "scale", title: "How comfortable are you learning new tools?", hint: "This sets the complexity ceiling.", options: TECH },
    { id: "prefs", type: "multi", max: 3, dense: true, title: "What makes you pick one tool over another?", hint: "Select up to 3.", options: PREFS },
    { id: "invest", type: "invest", title: "How much would you invest in AI tools & learning?", hint: "Two quick picks.", options: INVEST, budget: BUDGET },
  ];

  root.LoadoutData = { WORK, ROLES, TASKS, FOCUS_BY_ROLE, ALL_FOCUS, focusOptions, GOALS, USE_CASES, MATURITY, TECH, AI_TOOL_GROUPS, ECOSYSTEM, PREFS, INVEST, BUDGET, LAYERS, FACTS, QUESTIONS };
})(typeof window !== "undefined" ? window : globalThis);
