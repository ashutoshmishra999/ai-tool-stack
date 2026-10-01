/* Loadout — tool database.
 *
 * Schema per tool:
 *  id            matches Q6 option ids where applicable
 *  name, tagline, category, layer (think|research|learn|create|build|automate|organize|specialist)
 *  sub           sub-category; the engine will not return two tools with the same sub
 *  caps          {capability: 0-10} use-case relevance (the important bit)
 *  roles         {roleId: 0-10} role relevance; missing role → 4 (neutral)
 *  difficulty    1-5 (maps to Q8 tech level)
 *  minMaturity   1-5 (maps to Q5)
 *  free          has a usable free tier
 *  price         INR / month for the entry paid plan (0 if free-only)
 *  integrations  ecosystem ids from data.js
 *  native        ecosystem ids this tool is *part of* (strong boost)
 *  quality, ease 1-10
 *  bestFor       short bullets shown on the card
 *  notFor        optional caution
 *  url
 */
(function (root) {
  "use strict";

  const T = [];
  const add = (t) => T.push(Object.assign({ roles: {}, integrations: [], native: [], free: true, price: 0, notFor: "" }, t));

  /* ---------- THINK ---------- */
  add({ id: "chatgpt", name: "ChatGPT", tagline: "Your everyday AI copilot", category: "General AI", layer: "think", sub: "assistant",
    caps: { writing: 9, thinking: 9, research: 6, content: 8, data: 7, documents: 7, coding: 7, learning: 8, productivity: 9, image: 6, marketing: 7, sales: 6 },
    roles: { student: 9, marketing: 9, sales: 8, founder: 9, hr: 9, operations: 8, cs: 8, consultant: 9, creator: 8, education: 9, healthcare: 7, legal: 6, finance: 7, product: 8, design: 7, engineering: 7, data: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 1999, integrations: ["google", "microsoft", "slack", "whatsapp"], quality: 9, ease: 10,
    bestFor: ["Drafting & rewriting", "Brainstorming and strategy", "Quick analysis", "Image generation"], url: "https://chatgpt.com" });

  add({ id: "claude", name: "Claude", tagline: "Deep-thinking writing & reasoning partner", category: "General AI", layer: "think", sub: "assistant",
    caps: { writing: 10, thinking: 10, documents: 10, coding: 10, research: 6, content: 8, data: 7, learning: 7, productivity: 8, agents: 7 },
    roles: { engineering: 10, product: 9, consultant: 9, legal: 9, founder: 9, marketing: 8, data: 8, finance: 7, student: 7, education: 7, design: 6, creator: 7, hr: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 1999, integrations: ["google", "slack"], quality: 10, ease: 9,
    bestFor: ["Long documents & nuanced writing", "Complex reasoning", "Coding", "Analysing PDFs and reports"], url: "https://claude.ai" });

  add({ id: "gemini", name: "Gemini", tagline: "AI woven into Google Workspace", category: "General AI", layer: "think", sub: "assistant",
    caps: { writing: 8, thinking: 8, research: 8, documents: 8, data: 7, productivity: 8, content: 7, learning: 7, image: 7, video: 6 },
    roles: { student: 8, education: 8, marketing: 7, operations: 7, hr: 7, sales: 6, founder: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 1950, integrations: ["google", "sheets"], native: ["google"], quality: 8, ease: 9,
    bestFor: ["Gmail, Docs & Sheets assistance", "Research with live web", "Huge context windows"], url: "https://gemini.google.com" });

  add({ id: "copilot", name: "Microsoft Copilot", tagline: "AI inside Word, Excel, Teams & Outlook", category: "General AI", layer: "think", sub: "assistant",
    caps: { writing: 8, documents: 8, data: 8, spreadsheets: 9, meetings: 8, productivity: 8, presentations: 7 },
    roles: { finance: 9, operations: 8, hr: 8, sales: 7, legal: 7, consultant: 7, healthcare: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 2500, integrations: ["microsoft", "sheets"], native: ["microsoft"], quality: 7, ease: 9,
    bestFor: ["Excel formulas & analysis", "Teams meeting recaps", "Outlook drafting"], url: "https://copilot.microsoft.com" });

  /* ---------- RESEARCH ---------- */
  add({ id: "perplexity", name: "Perplexity", tagline: "Your research engine", category: "Research", layer: "research", sub: "search",
    caps: { research: 10, learning: 8, marketing: 8, sales: 8, thinking: 6, writing: 5, documents: 6, coding: 5, data: 5 },
    roles: { marketing: 9, student: 9, sales: 8, consultant: 9, founder: 9, product: 9, legal: 7, finance: 8, healthcare: 7, education: 8, data: 7, engineering: 7, creator: 8 },
    difficulty: 1, minMaturity: 1, free: true, price: 1999, integrations: ["slack"], quality: 9, ease: 10,
    bestFor: ["Cited, verifiable answers", "Market & competitor research", "Keeping up with a fast-moving field"], url: "https://perplexity.ai" });

  add({ id: "consensus", name: "Consensus", tagline: "Search across peer-reviewed research", category: "Research", layer: "research", sub: "academic",
    caps: { research: 9, learning: 8, documents: 6 },
    roles: { healthcare: 10, student: 8, education: 8, data: 6, legal: 5, consultant: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 999, quality: 8, ease: 9,
    bestFor: ["Evidence-based answers", "Literature reviews", "Clinical questions"], url: "https://consensus.app" });

  add({ id: "elicit", name: "Elicit", tagline: "Automate literature reviews", category: "Research", layer: "research", sub: "academic",
    caps: { research: 9, documents: 8, learning: 7, data: 6 },
    roles: { student: 8, healthcare: 8, education: 7, data: 7, product: 5 },
    difficulty: 2, minMaturity: 2, free: true, price: 999, quality: 8, ease: 8,
    bestFor: ["Extracting data from papers", "Systematic reviews"], url: "https://elicit.com" });

  /* ---------- LEARN / ORGANIZE ---------- */
  add({ id: "notebooklm", name: "NotebookLM", tagline: "Turn your sources into understanding", category: "Learning", layer: "learn", sub: "sources",
    caps: { learning: 10, documents: 10, research: 8, writing: 5, thinking: 6, voice: 6 },
    roles: { student: 10, education: 9, consultant: 8, legal: 8, healthcare: 7, product: 7, marketing: 6, founder: 7, finance: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 1950, integrations: ["google"], native: ["google"], quality: 9, ease: 10,
    bestFor: ["Grounded Q&A over your own files", "Audio overviews of readings", "Study guides & briefing docs"], url: "https://notebooklm.google" });

  add({ id: "notion-ai", name: "Notion AI", tagline: "Your AI-powered second brain", category: "Productivity", layer: "organize", sub: "workspace",
    caps: { productivity: 9, projects: 8, writing: 7, documents: 7, meetings: 7, learning: 6 },
    roles: { student: 8, product: 9, founder: 8, operations: 8, consultant: 7, marketing: 7, design: 6, creator: 7 },
    difficulty: 2, minMaturity: 1, free: true, price: 850, integrations: ["notion", "slack", "google"], native: ["notion"], quality: 8, ease: 8,
    bestFor: ["Searching across your workspace", "Meeting notes → action items", "Drafting inside your docs"], url: "https://notion.so/product/ai" });

  add({ id: "fireflies", name: "Fireflies", tagline: "Never take meeting notes again", category: "Meetings", layer: "organize", sub: "meetings",
    caps: { meetings: 10, productivity: 7, sales: 6, customer: 6, hiring: 6 },
    roles: { sales: 9, product: 8, cs: 8, hr: 8, consultant: 8, founder: 8, operations: 7, marketing: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 850, integrations: ["google", "microsoft", "slack", "notion", "hubspot", "salesforce"], quality: 8, ease: 9,
    bestFor: ["Auto-transcribed meetings", "Summaries + action items", "Searchable call history"], url: "https://fireflies.ai" });

  add({ id: "granola", name: "Granola", tagline: "Meeting notes that write themselves — no bot", category: "Meetings", layer: "organize", sub: "meetings",
    caps: { meetings: 9, productivity: 8, writing: 5 },
    roles: { founder: 9, product: 9, consultant: 8, sales: 7, design: 7, engineering: 6 },
    difficulty: 1, minMaturity: 2, free: true, price: 1500, integrations: ["google", "notion", "slack"], quality: 9, ease: 10,
    bestFor: ["Private, bot-free notes", "Blends your notes with the transcript"], url: "https://granola.ai" });

  add({ id: "motion", name: "Motion", tagline: "AI that plans your day for you", category: "Productivity", layer: "organize", sub: "planner",
    caps: { productivity: 9, projects: 9, meetings: 5 },
    roles: { founder: 8, consultant: 8, product: 7, operations: 7, sales: 6 },
    difficulty: 2, minMaturity: 2, free: false, price: 1600, integrations: ["google", "microsoft"], quality: 8, ease: 7,
    bestFor: ["Auto-scheduling tasks into your calendar", "Project timelines"], url: "https://usemotion.com" });

  /* ---------- CREATE ---------- */
  add({ id: "canva", name: "Canva", tagline: "Your visual creation layer", category: "Design", layer: "create", sub: "design",
    caps: { design: 9, image: 7, content: 9, presentations: 8, marketing: 8, video: 6 },
    roles: { marketing: 9, creator: 9, student: 8, education: 9, founder: 8, hr: 7, sales: 6, operations: 6, design: 6, consultant: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 500, integrations: ["canva", "google", "slack"], native: ["canva"], quality: 8, ease: 10,
    bestFor: ["Social & marketing visuals", "Magic Write + Magic Design", "Quick decks and one-pagers"], url: "https://canva.com" });

  add({ id: "gamma", name: "Gamma", tagline: "Presentations that build themselves", category: "Presentations", layer: "create", sub: "slides",
    caps: { presentations: 10, content: 6, writing: 5, documents: 5 },
    roles: { student: 9, marketing: 8, founder: 9, sales: 8, consultant: 9, product: 8, education: 8, hr: 7, operations: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 800, integrations: ["google", "microsoft"], quality: 8, ease: 10,
    bestFor: ["Outline → finished deck in minutes", "Docs and websites too"], url: "https://gamma.app" });

  add({ id: "midjourney", name: "Midjourney", tagline: "Best-in-class image generation", category: "Image", layer: "create", sub: "image",
    caps: { image: 10, design: 8, content: 7, marketing: 6 },
    roles: { design: 10, creator: 9, marketing: 7, founder: 5 },
    difficulty: 3, minMaturity: 2, free: false, price: 850, integrations: [], quality: 10, ease: 6,
    bestFor: ["Art direction & concepting", "Hero imagery", "Brand visuals"], notFor: "Text-heavy graphics or exact layouts", url: "https://midjourney.com" });

  add({ id: "ideogram", name: "Ideogram", tagline: "Image generation that gets text right", category: "Image", layer: "create", sub: "image",
    caps: { image: 9, design: 8, content: 7, marketing: 7 },
    roles: { marketing: 8, creator: 8, design: 8, founder: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 700, quality: 8, ease: 9,
    bestFor: ["Posters, logos & typography", "Fast ad creative"], url: "https://ideogram.ai" });

  add({ id: "runway", name: "Runway", tagline: "Generative video for creatives", category: "Video", layer: "create", sub: "video-gen",
    caps: { video: 10, image: 6, content: 7 },
    roles: { design: 9, creator: 9, marketing: 7 },
    difficulty: 3, minMaturity: 2, free: true, price: 1200, integrations: ["adobe"], quality: 9, ease: 6,
    bestFor: ["Text/image-to-video", "VFX and motion", "B-roll generation"], url: "https://runwayml.com" });

  add({ id: "heygen", name: "HeyGen", tagline: "AI avatar & talking-head video", category: "Video", layer: "create", sub: "avatar-video",
    caps: { video: 9, content: 8, marketing: 8, voice: 6, sales: 6, learning: 5 },
    roles: { marketing: 8, creator: 8, sales: 7, education: 7, hr: 7, founder: 6, cs: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 2500, quality: 8, ease: 8,
    bestFor: ["Explainer & training videos", "Multilingual dubbing", "Personalised outreach videos"], url: "https://heygen.com" });

  add({ id: "descript", name: "Descript", tagline: "Edit video & podcasts like a doc", category: "Video", layer: "create", sub: "video-edit",
    caps: { video: 9, voice: 8, content: 8 },
    roles: { creator: 10, marketing: 7, education: 7, founder: 5 },
    difficulty: 2, minMaturity: 1, free: true, price: 1000, quality: 8, ease: 8,
    bestFor: ["Text-based video editing", "Remove filler words", "Podcast production"], url: "https://descript.com" });

  add({ id: "capcut", name: "CapCut", tagline: "Fast AI-assisted short-form video", category: "Video", layer: "create", sub: "video-edit",
    caps: { video: 8, content: 8, marketing: 6 },
    roles: { creator: 9, marketing: 7, student: 6, founder: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 650, quality: 7, ease: 10,
    bestFor: ["Reels / Shorts / TikTok", "Auto-captions", "Templates"], url: "https://capcut.com" });

  add({ id: "elevenlabs", name: "ElevenLabs", tagline: "Studio-grade AI voice", category: "Audio", layer: "create", sub: "voice",
    caps: { voice: 10, video: 5, content: 6, learning: 4 },
    roles: { creator: 9, marketing: 6, education: 7, design: 6, engineering: 6, founder: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 450, quality: 10, ease: 9,
    bestFor: ["Voiceovers & narration", "Voice cloning", "Dubbing"], url: "https://elevenlabs.io" });

  add({ id: "suno", name: "Suno", tagline: "Generate full songs from a prompt", category: "Audio", layer: "create", sub: "music",
    caps: { voice: 7, content: 6, video: 4 },
    roles: { creator: 8, design: 6, marketing: 4 },
    difficulty: 1, minMaturity: 1, free: true, price: 850, quality: 8, ease: 10,
    bestFor: ["Background music", "Jingles & intros"], url: "https://suno.com" });

  add({ id: "figma-ai", name: "Figma AI", tagline: "AI built into the design tool you already use", category: "Design", layer: "create", sub: "design",
    caps: { design: 10, image: 5, building: 5, presentations: 5 },
    roles: { design: 10, product: 8, marketing: 5, founder: 5, engineering: 5 },
    difficulty: 3, minMaturity: 1, free: true, price: 1300, integrations: ["figma"], native: ["figma"], quality: 9, ease: 7,
    bestFor: ["Generate & iterate UI", "Rename / organise layers", "First-draft prototypes"], url: "https://figma.com/ai" });

  add({ id: "adobe-firefly", name: "Adobe Firefly", tagline: "Commercially-safe generative AI inside Adobe", category: "Image", layer: "create", sub: "image",
    caps: { image: 9, design: 9, video: 6, content: 6 },
    roles: { design: 9, marketing: 7, creator: 7 },
    difficulty: 3, minMaturity: 1, free: true, price: 900, integrations: ["adobe"], native: ["adobe"], quality: 9, ease: 7,
    bestFor: ["Generative fill in Photoshop", "Licensed-safe imagery", "Brand-consistent assets"], url: "https://adobe.com/products/firefly" });

  add({ id: "jasper", name: "Jasper", tagline: "Marketing content at brand-voice scale", category: "Content", layer: "specialist", sub: "marketing-content",
    caps: { marketing: 10, content: 9, writing: 8 },
    roles: { marketing: 9, founder: 6, creator: 5, sales: 5 },
    difficulty: 2, minMaturity: 2, free: false, price: 3300, integrations: ["google", "hubspot", "canva"], quality: 8, ease: 8,
    bestFor: ["Campaign copy in brand voice", "Multi-channel content", "Team collaboration"], url: "https://jasper.ai" });

  /* ---------- BUILD ---------- */
  add({ id: "cursor", name: "Cursor", tagline: "The AI-native code editor", category: "Coding", layer: "build", sub: "ide",
    caps: { coding: 10, building: 9, agents: 7, data: 5 },
    roles: { engineering: 10, data: 8, product: 5, founder: 6, design: 4 },
    difficulty: 4, minMaturity: 2, free: true, price: 1700, quality: 10, ease: 7,
    bestFor: ["Multi-file edits with context", "Agent mode for whole features", "Codebase Q&A"], url: "https://cursor.com" });

  add({ id: "github-copilot", name: "GitHub Copilot", tagline: "AI pair programmer inside your IDE", category: "Coding", layer: "build", sub: "ide",
    caps: { coding: 9, building: 7, data: 5 },
    roles: { engineering: 9, data: 8, product: 4 },
    difficulty: 4, minMaturity: 2, free: true, price: 850, quality: 8, ease: 8,
    bestFor: ["Inline completions", "PR summaries", "Works in VS Code / JetBrains"], url: "https://github.com/features/copilot" });

  add({ id: "claude-code", name: "Claude Code", tagline: "Agentic coding from your terminal", category: "Coding", layer: "build", sub: "agent-coder",
    caps: { coding: 10, building: 9, agents: 9, automation: 6 },
    roles: { engineering: 10, data: 7, founder: 6 },
    difficulty: 5, minMaturity: 4, free: false, price: 1999, quality: 10, ease: 5,
    bestFor: ["Delegate whole tasks", "Refactors across a repo", "CI & scripting"], url: "https://claude.com/claude-code" });

  add({ id: "lovable", name: "Lovable", tagline: "Describe it. Get a working app.", category: "App building", layer: "build", sub: "app-builder",
    caps: { building: 10, coding: 6, agents: 5 },
    roles: { founder: 9, product: 8, design: 7, marketing: 6, consultant: 6, engineering: 6, student: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 2100, integrations: ["figma"], quality: 8, ease: 9,
    bestFor: ["Full-stack MVPs without code", "Internal tools", "Landing pages that work"], url: "https://lovable.dev" });

  add({ id: "replit", name: "Replit", tagline: "Build and deploy apps from your browser", category: "App building", layer: "build", sub: "app-builder",
    caps: { building: 9, coding: 8, agents: 6, learning: 6 },
    roles: { student: 8, founder: 8, engineering: 7, product: 6, education: 6 },
    difficulty: 3, minMaturity: 2, free: true, price: 2100, quality: 8, ease: 8,
    bestFor: ["Replit Agent builds apps for you", "Hosting included", "Great for learning to code"], url: "https://replit.com" });

  add({ id: "v0", name: "v0", tagline: "Generate production-ready UI", category: "App building", layer: "build", sub: "ui-gen",
    caps: { building: 8, coding: 7, design: 7 },
    roles: { engineering: 8, design: 8, product: 7, founder: 7 },
    difficulty: 4, minMaturity: 2, free: true, price: 1700, integrations: ["figma"], quality: 9, ease: 7,
    bestFor: ["React + Tailwind components", "Design → code", "Ship on Vercel"], url: "https://v0.dev" });

  add({ id: "bolt", name: "Bolt", tagline: "Prompt, run, edit & deploy web apps", category: "App building", layer: "build", sub: "app-builder",
    caps: { building: 9, coding: 6 },
    roles: { founder: 8, product: 7, design: 6, marketing: 5, student: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 1700, quality: 7, ease: 9,
    bestFor: ["Quick web apps & prototypes", "No local setup"], url: "https://bolt.new" });

  add({ id: "vercel", name: "Vercel", tagline: "Deploy anything in one push", category: "Deploy", layer: "build", sub: "deploy",
    caps: { building: 7, coding: 6 },
    roles: { engineering: 9, founder: 6, design: 5, product: 5 },
    difficulty: 4, minMaturity: 3, free: true, price: 1700, quality: 9, ease: 7,
    bestFor: ["Frontend hosting", "Previews on every PR", "AI SDK"], url: "https://vercel.com" });

  add({ id: "julius", name: "Julius", tagline: "Chat with your data", category: "Data", layer: "specialist", sub: "data-analysis",
    caps: { data: 10, spreadsheets: 9, documents: 6, thinking: 5 },
    roles: { data: 9, finance: 9, marketing: 7, operations: 7, product: 7, founder: 6, consultant: 7, student: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 1700, integrations: ["sheets", "google"], quality: 8, ease: 9,
    bestFor: ["Upload CSV/Excel → insights", "Charts without formulas", "Forecasting"], url: "https://julius.ai" });

  add({ id: "hex", name: "Hex", tagline: "AI-assisted notebooks for data teams", category: "Data", layer: "specialist", sub: "data-analysis",
    caps: { data: 10, coding: 7, spreadsheets: 6 },
    roles: { data: 10, engineering: 6, product: 6, finance: 6 },
    difficulty: 5, minMaturity: 3, free: true, price: 3000, integrations: ["slack"], quality: 9, ease: 6,
    bestFor: ["SQL + Python with AI", "Shareable data apps"], url: "https://hex.tech" });

  add({ id: "rows", name: "Rows", tagline: "The spreadsheet with AI built in", category: "Data", layer: "specialist", sub: "spreadsheet",
    caps: { spreadsheets: 10, data: 8, automation: 5 },
    roles: { finance: 8, operations: 8, marketing: 7, founder: 7, sales: 6, data: 6 },
    difficulty: 2, minMaturity: 1, free: true, price: 700, integrations: ["sheets", "google", "hubspot", "notion"], quality: 7, ease: 9,
    bestFor: ["AI formulas & cleaning", "Live data from your apps"], url: "https://rows.com" });

  /* ---------- AUTOMATE ---------- */
  add({ id: "zapier", name: "Zapier", tagline: "Automation anyone can set up", category: "Automation", layer: "automate", sub: "workflow",
    caps: { automation: 9, agents: 6, productivity: 7, sales: 5, marketing: 5 },
    roles: { marketing: 8, sales: 8, operations: 9, hr: 8, founder: 8, cs: 8, consultant: 7, finance: 6, product: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 1700, integrations: ["google", "microsoft", "slack", "notion", "hubspot", "salesforce", "asana", "trello", "jira", "sheets"], quality: 8, ease: 9,
    bestFor: ["8,000+ app connectors", "Zapier Agents", "Fastest way to a first automation"], url: "https://zapier.com" });

  add({ id: "make", name: "Make", tagline: "Visual automation with real power", category: "Automation", layer: "automate", sub: "workflow",
    caps: { automation: 10, agents: 7, productivity: 6, marketing: 6, sales: 5 },
    roles: { marketing: 8, operations: 9, founder: 8, sales: 7, consultant: 8, hr: 6, cs: 7, product: 6 },
    difficulty: 3, minMaturity: 3, free: true, price: 850, integrations: ["google", "microsoft", "slack", "notion", "hubspot", "salesforce", "asana", "trello", "jira", "sheets", "whatsapp"], quality: 9, ease: 7,
    bestFor: ["Multi-step scenarios", "Great value per operation", "Branching & iterators"], url: "https://make.com" });

  add({ id: "n8n", name: "n8n", tagline: "Open-source automation & AI agents", category: "Automation", layer: "automate", sub: "workflow",
    caps: { automation: 10, agents: 10, coding: 6, building: 6 },
    roles: { engineering: 9, data: 8, operations: 7, founder: 7, consultant: 7, product: 6 },
    difficulty: 4, minMaturity: 4, free: true, price: 2000, integrations: ["google", "microsoft", "slack", "notion", "hubspot", "salesforce", "jira", "sheets", "whatsapp"], quality: 9, ease: 5,
    bestFor: ["Self-host for free", "Native LLM / agent nodes", "Code when you need it"], url: "https://n8n.io" });

  add({ id: "relay", name: "Relay.app", tagline: "Human-in-the-loop AI workflows", category: "Automation", layer: "automate", sub: "workflow",
    caps: { automation: 8, agents: 7, productivity: 7 },
    roles: { operations: 8, hr: 8, cs: 7, product: 7, marketing: 6, founder: 6 },
    difficulty: 2, minMaturity: 2, free: true, price: 800, integrations: ["google", "slack", "notion", "hubspot", "asana"], quality: 8, ease: 9,
    bestFor: ["Approvals inside automations", "AI steps built in", "Friendly for non-technical teams"], url: "https://relay.app" });

  /* ---------- SPECIALIST (role tools) ---------- */
  add({ id: "clay", name: "Clay", tagline: "Enrich leads & personalise outreach at scale", category: "Sales", layer: "specialist", sub: "sales-enrichment",
    caps: { sales: 10, research: 7, automation: 7, marketing: 6 },
    roles: { sales: 10, founder: 8, marketing: 7, consultant: 5 },
    difficulty: 3, minMaturity: 3, free: true, price: 12000, integrations: ["hubspot", "salesforce", "sheets", "slack"], quality: 9, ease: 6,
    bestFor: ["Waterfall data enrichment", "AI-researched personalisation", "Feeds your CRM"], url: "https://clay.com" });

  add({ id: "apollo", name: "Apollo", tagline: "Find, contact and close — with AI", category: "Sales", layer: "specialist", sub: "sales-outreach",
    caps: { sales: 10, research: 6, automation: 6, writing: 5 },
    roles: { sales: 10, founder: 8, marketing: 6, consultant: 6 },
    difficulty: 2, minMaturity: 1, free: true, price: 4200, integrations: ["hubspot", "salesforce", "google", "microsoft", "slack"], quality: 8, ease: 8,
    bestFor: ["Lead database + sequences", "AI email writing", "Call recording & insights"], url: "https://apollo.io" });

  add({ id: "hubspot-ai", name: "HubSpot Breeze", tagline: "AI agents inside your CRM", category: "Sales & Marketing", layer: "specialist", sub: "crm-ai",
    caps: { sales: 9, marketing: 9, customer: 8, automation: 7, writing: 6 },
    roles: { sales: 9, marketing: 9, cs: 8, founder: 7 },
    difficulty: 2, minMaturity: 2, free: true, price: 1600, integrations: ["hubspot", "google", "microsoft", "slack"], native: ["hubspot"], quality: 8, ease: 8,
    bestFor: ["Prospecting & content agents", "Works where your pipeline lives"], url: "https://hubspot.com/products/artificial-intelligence" });

  add({ id: "intercom-fin", name: "Intercom Fin", tagline: "AI agent that resolves support tickets", category: "Support", layer: "specialist", sub: "support-agent",
    caps: { customer: 10, automation: 7, agents: 8, writing: 5 },
    roles: { cs: 10, founder: 6, operations: 6, product: 5 },
    difficulty: 2, minMaturity: 2, free: false, price: 2500, integrations: ["slack", "hubspot", "salesforce", "whatsapp"], quality: 9, ease: 8,
    bestFor: ["Resolve up to half of tickets automatically", "Human handoff built in"], url: "https://intercom.com/fin" });

  add({ id: "harvey", name: "Harvey", tagline: "Generative AI built for legal work", category: "Legal", layer: "specialist", sub: "legal-ai",
    caps: { documents: 10, research: 9, writing: 8, thinking: 7 },
    roles: { legal: 10, consultant: 4 },
    difficulty: 2, minMaturity: 2, free: false, price: 15000, integrations: ["microsoft"], quality: 9, ease: 8,
    bestFor: ["Contract review & drafting", "Case research with citations"], notFor: "Enterprise pricing — ask about team access", url: "https://harvey.ai" });

  add({ id: "spellbook", name: "Spellbook", tagline: "Contract drafting AI inside Word", category: "Legal", layer: "specialist", sub: "legal-ai",
    caps: { documents: 9, writing: 8, research: 6 },
    roles: { legal: 10, finance: 5, operations: 4, founder: 5 },
    difficulty: 1, minMaturity: 1, free: false, price: 9000, integrations: ["microsoft"], native: ["microsoft"], quality: 8, ease: 9,
    bestFor: ["Redlines & clause suggestions", "Lives inside Word"], url: "https://spellbook.legal" });

  add({ id: "openevidence", name: "OpenEvidence", tagline: "Clinical answers grounded in medical literature", category: "Healthcare", layer: "specialist", sub: "clinical-ai",
    caps: { research: 9, documents: 7, learning: 7, thinking: 6 },
    roles: { healthcare: 10, student: 4 },
    difficulty: 1, minMaturity: 1, free: true, price: 0, quality: 9, ease: 10,
    bestFor: ["Point-of-care clinical questions", "Cited guidelines & trials"], url: "https://openevidence.com" });

  add({ id: "heidi", name: "Heidi Health", tagline: "AI medical scribe", category: "Healthcare", layer: "specialist", sub: "clinical-scribe",
    caps: { meetings: 9, documents: 8, writing: 7, customer: 6 },
    roles: { healthcare: 10 },
    difficulty: 1, minMaturity: 1, free: true, price: 1700, quality: 8, ease: 10,
    bestFor: ["Consult notes written for you", "Templates per specialty"], url: "https://heidihealth.com" });

  add({ id: "magicschool", name: "MagicSchool", tagline: "AI built for teachers", category: "Education", layer: "specialist", sub: "teaching-ai",
    caps: { learning: 9, writing: 8, content: 7, presentations: 6 },
    roles: { education: 10, student: 3 },
    difficulty: 1, minMaturity: 1, free: true, price: 850, integrations: ["google", "microsoft"], quality: 8, ease: 10,
    bestFor: ["Lesson plans, rubrics & quizzes", "Differentiation in one click"], url: "https://magicschool.ai" });

  add({ id: "quizlet", name: "Quizlet", tagline: "AI study sets & flashcards", category: "Learning", layer: "learn", sub: "study",
    caps: { learning: 9, documents: 5 },
    roles: { student: 9, education: 7 },
    difficulty: 1, minMaturity: 1, free: true, price: 350, quality: 7, ease: 10,
    bestFor: ["Notes → flashcards", "Practice tests", "Spaced repetition"], url: "https://quizlet.com" });

  add({ id: "grammarly", name: "Grammarly", tagline: "Writing that lands, everywhere you type", category: "Writing", layer: "think", sub: "writing-assist",
    caps: { writing: 7, content: 5, productivity: 6, customer: 6, sales: 5 },
    roles: { student: 8, hr: 8, cs: 8, sales: 7, marketing: 6, operations: 7, education: 7, consultant: 6, legal: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 1000, integrations: ["google", "microsoft", "slack"], quality: 7, ease: 10,
    bestFor: ["Tone & clarity in email and chat", "Browser-wide", "Plagiarism & citations"], url: "https://grammarly.com" });

  add({ id: "teal", name: "Teal", tagline: "AI career & job search assistant", category: "Career", layer: "specialist", sub: "career",
    caps: { writing: 7, learning: 6, productivity: 6, hiring: 5 },
    roles: { student: 8, other: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 800, quality: 7, ease: 9,
    bestFor: ["Tailored resumes per job", "Application tracking"], url: "https://tealhq.com" });

  add({ id: "paradox", name: "Paradox", tagline: "Conversational AI for recruiting", category: "HR", layer: "specialist", sub: "recruiting-ai",
    caps: { hiring: 10, automation: 7, customer: 6 },
    roles: { hr: 10, operations: 5 },
    difficulty: 2, minMaturity: 2, free: false, price: 15000, integrations: ["microsoft", "google", "whatsapp"], quality: 8, ease: 8,
    bestFor: ["Screening & scheduling at scale", "Candidate chat via SMS / WhatsApp"], notFor: "Enterprise pricing", url: "https://paradox.ai" });

  add({ id: "metaview", name: "Metaview", tagline: "AI notes for every interview", category: "HR", layer: "specialist", sub: "recruiting-ai",
    caps: { hiring: 10, meetings: 8, writing: 5 },
    roles: { hr: 10, founder: 6, operations: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 2500, integrations: ["google", "microsoft", "slack"], quality: 8, ease: 9,
    bestFor: ["Structured interview summaries", "Scorecards drafted automatically"], url: "https://metaview.ai" });

  add({ id: "textio", name: "Textio", tagline: "Inclusive, high-performing job posts & feedback", category: "HR", layer: "specialist", sub: "hr-writing",
    caps: { hiring: 8, writing: 8 },
    roles: { hr: 9 },
    difficulty: 1, minMaturity: 1, free: false, price: 5000, quality: 8, ease: 9,
    bestFor: ["Bias-free job descriptions", "Better performance reviews"], url: "https://textio.com" });

  add({ id: "opus-clip", name: "OpusClip", tagline: "One long video → dozens of viral clips", category: "Video", layer: "create", sub: "repurpose",
    caps: { video: 9, content: 9, marketing: 7 },
    roles: { creator: 10, marketing: 8, founder: 6, education: 5 },
    difficulty: 1, minMaturity: 1, free: true, price: 1200, quality: 8, ease: 10,
    bestFor: ["Auto-clip podcasts & webinars", "Captions & virality scores"], url: "https://opus.pro" });

  add({ id: "typefully", name: "Typefully", tagline: "Write, schedule and grow on social with AI", category: "Social", layer: "specialist", sub: "social-publish",
    caps: { content: 8, marketing: 8, writing: 7 },
    roles: { creator: 9, marketing: 8, founder: 8, consultant: 6 },
    difficulty: 1, minMaturity: 1, free: true, price: 1050, quality: 8, ease: 10,
    bestFor: ["Threads, LinkedIn & X scheduling", "AI rewrites & hooks"], url: "https://typefully.com" });

  add({ id: "writer", name: "Writer", tagline: "Enterprise AI with your brand & data", category: "Content", layer: "specialist", sub: "marketing-content",
    caps: { writing: 9, content: 8, marketing: 8, documents: 7 },
    roles: { marketing: 8, operations: 6, hr: 6, cs: 6 },
    difficulty: 2, minMaturity: 2, free: false, price: 1500, integrations: ["google", "microsoft", "slack", "figma"], quality: 8, ease: 8,
    bestFor: ["Style-guide enforcement", "Secure, compliant deployment"], url: "https://writer.com" });

  root.LoadoutTools = T;
})(typeof window !== "undefined" ? window : globalThis);
