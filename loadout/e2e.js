/* Loadout end-to-end smoke test using headless Chrome via CDP (no deps).
 * Run: node loadout/e2e.js
 * Drives: landing → name → 10 questions → analyzing → preview → email → result,
 * then asserts the result DOM, and loads a share link. */
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname);
const PORT = 8765;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/* --- tiny static server --- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
/* Mock of the Vercel functions so the browser flow can be tested end-to-end offline.
 * /api/search answers after MOCK_SEARCH_MS with 6 tiered tools; /api/lead records posts. */
const MOCK_SEARCH_MS = 1200;
const SLOW_SEARCH_MS = 8000;   // > the 5 s client cap
let slowMode = false;
const leads = [];
let searchCalls = 0;
const MOCK_TOOLS = ["Jasper", "Writer", "Surfer SEO", "Lately", "Copy.ai", "Letterdrop"].map((name, i) => ({
  name, url: `https://${name.toLowerCase().replace(/\W/g, "")}.example.com`, tier: ["mainstream", "mainstream", "power-user", "power-user", "niche", "niche"][i],
  what: `${name} does a thing`, why: `fits a marketer scaling content`, company: `${name} · est. 2019 · funded`, pricing: "from $20/mo", fit: 95 - i,
}));
const server = http.createServer((req, res) => {
  const clean = req.url.split("?")[0].split("#")[0];
  if (clean.startsWith("/api/")) {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {}; try { body = JSON.parse(raw || "{}"); } catch (_) {}
      if (clean === "/api/lead") { leads.push(body); res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}'); }
      if (clean === "/api/search") {
        searchCalls++;
        const excl = new Set((body.exclude || []).map((n) => String(n).toLowerCase()));
        const tools = MOCK_TOOLS.filter((t) => !excl.has(t.name.toLowerCase()));
        return setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: JSON.stringify({ query: body.query || "", tools, insight: "You could ship 3× the content." }), sources: [{ title: "G2", url: "https://g2.com" }], provider: "grok", ms: MOCK_SEARCH_MS })); }, slowMode ? SLOW_SEARCH_MS : MOCK_SEARCH_MS);
      }
      res.writeHead(404); res.end();
    });
    return;
  }
  const p = path.join(ROOT, clean === "/" ? "index.html" : clean);
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "text/plain" }); res.end(buf); });
});

/* --- minimal CDP client over raw WebSocket --- */
function connectWs(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = Buffer.from(Math.random().toString()).toString("base64");
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" } });
    req.on("upgrade", (res, socket) => {
      let buf = Buffer.alloc(0); const handlers = new Map(); let id = 0; const events = [];
      socket.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
          let len = buf[1] & 127, off = 2;
          if (len === 126) { len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) break;
          const msg = JSON.parse(buf.slice(off, off + len).toString()); buf = buf.slice(off + len);
          if (msg.id && handlers.has(msg.id)) { handlers.get(msg.id)(msg); handlers.delete(msg.id); } else events.push(msg);
        }
      });
      const send = (method, params = {}) => new Promise((res2) => {
        const m = JSON.stringify({ id: ++id, method, params }); const payload = Buffer.from(m);
        const mask = Buffer.from([1, 2, 3, 4]); const masked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
        let head;
        if (payload.length < 126) head = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(payload.length, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(payload.length), 2); }
        handlers.set(id, res2); socket.write(Buffer.concat([head, mask, masked]));
      });
      resolve({ send, events, close: () => socket.destroy() });
    });
    req.on("error", reject); req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };

module.exports = { connectWs, server, PORT, CHROME, sleep };
if (require.main !== module) return;

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const profileDir = fs.mkdtempSync("/tmp/loadout-chrome-");
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9333", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: "ignore" });
  await sleep(1500);
  const targets = JSON.parse(execSync("curl -s http://127.0.0.1:9333/json").toString());
  const page = targets.find((t) => t.type === "page");
  const cdp = await connectWs(page.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  /* Pretend we're deployed: point the AI proxy + lead endpoint at the mock server above. */
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.LOADOUT_AI = { provider: "proxy", url: "/api/search" }; window.LOADOUT_LEAD_ENDPOINT = "/api/lead";` });
  const evalJs = async (expr) => { const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result.result.value; };
  const click = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return "missing"; el.click(); return "ok"; })()`);
  const screen = () => evalJs("document.body.dataset.screen || 'landing'");
  const step = () => evalJs("document.querySelector('#step-count').textContent");
  const exceptions = () => cdp.events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);

  try {
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(800);
    check(exceptions().length === 0, `no JS exceptions on load ${exceptions()[0] || ""}`);
    check((await screen()) === "landing", "landing screen visible");
    check((await evalJs("window.LoadoutTools.length")) >= 50, "tool DB loaded in browser");

    check((await click('[data-action="start"]')) === "ok", "clicked LET'S GO");
    await sleep(150);
    check((await screen()) === "name", "name screen shown");
    await evalJs(`document.querySelector('#first-name').value = 'Ashutosh'; document.querySelector('#name-form').requestSubmit();`);
    await sleep(150);
    check((await screen()) === "quiz", "quiz started");
    check((await step()) === "1 / 12", "step counter 1 / 12");
    check((await evalJs("document.querySelectorAll('#q-options .opt-emoji').length")) >= 5, "options render with emoji");
    check((await evalJs("document.querySelector('#bottombar').hidden")) === false, "sticky CONTINUE bar visible in quiz");

    /* Q1 work context (single → auto-advance) */
    await click('.opt[data-id="company"]'); await sleep(550);
    check((await step()) === "2 / 12", "Q1 single-select auto-advanced");
    /* Q2 role → fact interstitial */
    await click('.opt[data-id="marketing"]'); await sleep(550);
    check((await screen()) === "fact", "fact interstitial shown after role");
    check((await evalJs("document.querySelector('#fact-root .fact-stat').textContent")) === "40%", "fact shows 40% stat");
    check((await evalJs("document.querySelector('#q-continue').disabled")) === false, "fact CONTINUE enabled");
    check((await step()) === "2 / 12", "fact does not advance the question counter");
    await click("#q-continue"); await sleep(150);
    check((await screen()) === "quiz" && (await step()) === "3 / 12", "fact → Q3");
    /* Q3 tasks, max 5 — try 6 */
    for (const id of ["content", "research", "writing", "admin", "presentations", "meetings"]) await click(`.opt[data-id="${id}"]`);
    check((await evalJs("document.querySelectorAll('.opt.is-selected').length")) === 5, "Q3 capped at 5 selections");
    check((await evalJs("document.querySelector('#q-hint').textContent")).includes("max"), "Q3 cap hint shown");
    await click("#q-continue"); await sleep(100);
    /* Q4 focus — role-dependent options */
    check((await step()) === "4 / 12", "reached focus question");
    check((await evalJs("!!document.querySelector('.opt[data-id=\"content_volume\"]')")) === true, "focus options are marketing-specific");
    check((await evalJs("!!document.querySelector('.opt[data-id=\"code_faster\"]')")) === false, "engineering focus options NOT shown to a marketer");
    await click('.opt[data-id="visuals_fast"]'); await sleep(550);
    /* Contact capture right after focus — the live search has started */
    check((await screen()) === "capture", "contact capture shown right after the focus question");
    check((await step()) === "4 / 12", "capture does not advance the question counter");
    check((await evalJs("document.querySelector('#bottombar').hidden")) === true, "sticky bar hidden on capture (has its own CTA)");
    check((await evalJs("document.querySelector('.contact-live').textContent")).includes("LIVE SEARCH STARTED"), "capture says live search started");
    check((await evalJs("document.querySelector('.query-box code').textContent")).toLowerCase().includes("marketing"), "capture shows the search query with the role");
    check((await evalJs("document.querySelector('.query-box code').textContent")).toLowerCase().includes("creatives"), "search query includes the focus");
    check((await evalJs("document.querySelector('#capture-root').textContent")).includes("Ashutosh"), "capture greets by name");
    check(searchCalls === 1, "early search was fired at the focus step");
    /* Validation: bad email blocks, bad phone blocks, valid continues */
    await evalJs(`document.querySelector('#cap-email').value='nope'; document.querySelector('#capture-form').requestSubmit();`); await sleep(80);
    check((await screen()) === "capture" && (await evalJs("!!document.querySelector('#cap-email.is-invalid')")), "capture rejects invalid email");
    await evalJs(`document.querySelector('#cap-email').value='ashutosh@example.com'; document.querySelector('#cap-phone').value='123'; document.querySelector('#capture-form').requestSubmit();`); await sleep(80);
    check((await screen()) === "capture" && (await evalJs("!!document.querySelector('#cap-phone.is-invalid')")), "capture rejects short phone");
    await evalJs(`document.querySelector('#cap-phone').value='9876543210'; document.querySelector('#capture-form').requestSubmit();`); await sleep(250);
    check((await screen()) === "quiz" && (await step()) === "5 / 12", "capture → Q5 after valid contact");
    check(leads.length === 1 && leads[0].email === "ashutosh@example.com" && leads[0].phone === "+919876543210" && leads[0].stage === "focus", "lead POSTed to /api/lead with stage=focus");
    check(typeof leads[0].searchQuery === "string" && leads[0].searchQuery.length > 10, "lead includes the search query");
    /* Back from Q5 returns to capture with values preserved */
    await click("#top-back"); await sleep(100);
    check((await screen()) === "capture" && (await evalJs("document.querySelector('#cap-email').value")) === "ashutosh@example.com", "back → capture keeps the email");
    await click('[data-action="skip-capture"]'); await sleep(100);
    check((await screen()) === "quiz" && (await step()) === "5 / 12", "skip-capture continues to Q5");
    /* Q5 goals → dynamic fact */
    for (const id of ["save_time", "better_content"]) await click(`.opt[data-id="${id}"]`);
    await click("#q-continue"); await sleep(150);
    check((await screen()) === "fact", "dynamic fact shown after goals");
    check((await evalJs("document.querySelector('#fact-root').textContent")).includes("Ashutosh"), "dynamic fact uses first name");
    check((await evalJs("document.querySelectorAll('#fact-root .tag').length")) === 2, "dynamic fact shows the 2 chosen goals as tags");
    await click("#q-continue"); await sleep(100);
    /* Q6 use cases */
    for (const id of ["content", "research", "automation"]) await click(`.opt[data-id="${id}"]`);
    await click("#q-continue"); await sleep(100);
    /* Q7 maturity scale */
    check((await step()) === "7 / 12", "reached maturity");
    await click('.opt[data-id="3"]'); await sleep(550);
    check((await step()) === "8 / 12", "Q7 scale auto-advanced to 8");
    /* Q8 tools — exclusive 'none' then real picks → fact */
    await click('.opt[data-id="none"]');
    await click('.opt[data-id="chatgpt"]');
    check((await evalJs("JSON.stringify([...document.querySelectorAll('.opt.is-selected')].map(e=>e.dataset.id))")) === '["chatgpt"]', "Q8 exclusive 'none' cleared when picking a tool");
    await click("#q-continue"); await sleep(150);
    check((await screen()) === "fact", "fact shown after tools");
    await click("#q-continue"); await sleep(100);
    /* Q9 ecosystem */
    for (const id of ["google", "canva", "slack"]) await click(`.opt[data-id="${id}"]`);
    await click("#q-continue"); await sleep(100);
    /* Q10 tech → fact */
    await click('.opt[data-id="3"]'); await sleep(550);
    check((await screen()) === "fact", "fact shown after tech");
    await click("#q-continue"); await sleep(100);
    /* Q11 prefs */
    for (const id of ["easy", "time", "affordable"]) await click(`.opt[data-id="${id}"]`);
    await click("#q-continue"); await sleep(100);
    /* Q12 invest + budget */
    check((await step()) === "12 / 12", "reached Q12");
    check((await evalJs("document.querySelector('#q-continue').disabled")) === true, "Q12 continue disabled before picks");
    check((await evalJs("document.querySelector('#q-continue').textContent")).includes("BUILD"), "last step CTA says BUILD MY STACK");
    await click('.opt[data-id="B"]');
    check((await evalJs("document.querySelector('.chip.is-selected')?.dataset.id")) === "b1", "Q12 default budget auto-selected from invest tier");
    await click('.chip[data-id="b2"]');
    check((await evalJs("document.querySelector('#q-continue').disabled")) === false, "Q12 continue enabled");
    await click("#q-continue"); await sleep(100);

    check((await screen()) === "analyzing", "analyzing screen shown");
    check((await evalJs("document.querySelector('#analyzing-title').textContent")).includes("Ashutosh"), "analyzing uses first name");
    check((await evalJs("document.querySelector('#analyzing-fact').textContent")).includes("Creatives"), "analyzing screen names the focus");
    await sleep(1500);
    check(parseInt(await evalJs("document.querySelector('#ring-pct').textContent")) > 20, "ring percentage is counting up");
    await sleep(2600);
    check((await screen()) === "preview", "preview screen shown after animation");
    check((await evalJs("document.querySelectorAll('.preview-item.is-locked').length")) >= 2, "preview has locked items");
    check((await evalJs("document.querySelectorAll('.preview-item:not(.is-locked)').length")) === 3, "preview reveals exactly 3");

    /* Contact already captured mid-quiz → preview shows the "heading to your inbox" card, no email gate */
    check((await evalJs("!!document.querySelector('#email-form')")) === false, "preview has no second email gate when contact was captured");
    check((await evalJs("document.querySelector('.capture-ready').textContent")).includes("WhatsApp"), "preview acknowledges inbox + WhatsApp delivery");
    check((await evalJs("document.querySelector('.capture-ready').textContent")).includes("just came back"), "preview knows the early search already finished");
    await click('.capture-ready [data-action="skip-email"]'); await sleep(250);
    check((await screen()) === "result", "result screen shown after reveal");

    const toolCount = await evalJs("document.querySelectorAll('.tool-card').length");
    check(toolCount >= 5 && toolCount <= 8, `result has ${toolCount} tool cards`);
    check((await evalJs("document.querySelectorAll('.layer').length")) >= 3, "stack-by-layer rendered");
    check((await evalJs("document.querySelectorAll('.workflow').length")) >= 1, "workflows rendered");
    check((await evalJs("document.querySelectorAll('.gap').length")) >= 1, "gaps rendered");
    check((await evalJs("document.querySelectorAll('.path li').length")) >= 2, "learning path rendered");
    check((await evalJs("!!document.querySelector('#phone-form')")) === false, "no WhatsApp re-ask when phone already given");
    check((await evalJs("[...document.querySelectorAll('.pill.is-owned')].map(p=>p.textContent).join()")).includes("ChatGPT"), "owned ChatGPT shown in layers as 'you use this'");
    check((await evalJs("[...document.querySelectorAll('.tool-card h4')].map(h=>h.textContent).includes('ChatGPT')")) === false, "owned ChatGPT NOT recommended");
    check((await evalJs("!!document.querySelector('#ai-block')")) === true, "AI deep search block rendered");
    check((await evalJs("document.querySelector('#ai-block').textContent")).includes("Creatives"), "AI block references the focus answer");
    check((await evalJs("document.querySelector('.profile-grid').textContent")).includes("Creatives"), "result profile shows focus");
    /* Early search landed during the quiz → results render instantly, no extra network call */
    check((await evalJs("document.querySelectorAll('#ai-body .ai-card').length")) === 6, "AI block shows 6 live tools immediately");
    check(searchCalls === 1, "result page reused the early search (no second call)");
    check((await evalJs("document.querySelectorAll('#ai-body .ai-card.tier-niche').length")) === 2 && (await evalJs("document.querySelectorAll('#ai-body .ai-card.tier-power-user').length")) === 2, "tier mix: 2 niche + 2 power-user");
    check((await evalJs("document.querySelector('#ai-body .ai-card').classList.contains('tier-niche')")) === true, "niche finds are listed first");
    check((await evalJs("document.querySelector('#ai-body .ai-card .company').textContent")).includes("est. 2019"), "AI card shows company / established info");
    check((await evalJs("document.querySelector('#ai-body .query-box code').textContent")).toLowerCase().includes("marketing"), "AI block shows the search query used");
    check((await evalJs("document.querySelector('#ai-body .fineprint').textContent")).includes("Grok"), "AI block credits the winning provider");
    check((await evalJs("!!document.querySelector('#ai-body [data-action=\"ai-settings\"]')")) === false, "no 'change provider' UI when the provider is fixed by config");
    /* Search again → forces a fresh call and re-renders */
    await click('[data-action="ai-refresh"]'); await sleep(60);
    check((await evalJs("!!document.querySelector('#ai-body .ai-status')")) === true, "refresh shows searching state");
    await sleep(MOCK_SEARCH_MS + 400);
    check((await evalJs("document.querySelectorAll('#ai-body .ai-card').length")) === 6 && searchCalls === 2, "refresh fetched again and re-rendered");
    check((await evalJs("document.querySelector('[data-share=\"whatsapp\"]').href")).startsWith("https://wa.me/"), "WhatsApp share link built");
    check((await evalJs("document.querySelector('.result-head .eyebrow').textContent")).includes("Ashutosh"), "result greets by name");

    /* Lead persisted locally */
    const saved = JSON.parse(await evalJs("localStorage.getItem('loadout.v3')"));
    check(saved && saved.email === "ashutosh@example.com" && saved.phone === "+919876543210", "lead saved to localStorage");

    /* Share link round-trip */
    const share = await evalJs("document.querySelector('[data-share=\"linkedin\"]').href");
    const shared = decodeURIComponent(share.split("url=")[1]);
    /* Hash-only navigation is same-document; bounce through about:blank to force a real reload. */
    await cdp.send("Page.navigate", { url: "about:blank" }); await sleep(200);
    await cdp.send("Page.navigate", { url: shared }); await sleep(800);
    check((await screen()) === "result", "share link opens straight to result");
    check((await evalJs("document.querySelectorAll('.tool-card').length")) === toolCount, "shared result reproduces same stack size");
    check((await evalJs("!!document.querySelector('#phone-form')")) === false, "shared view hides WhatsApp capture");
    check((await evalJs("!!document.querySelector('.block-build-yours')")) === true, "shared view shows 'Build yours' CTA");
    check((await evalJs("document.querySelector('.block-build-yours .eyebrow').textContent")).includes("Ashutosh"), "shared view names the sharer");

    /* Restart clears the hash and returns to landing */
    await click('[data-action="restart"]'); await sleep(150);
    check((await screen()) === "landing", "restart returns to landing");
    check((await evalJs("location.hash")) === "", "restart clears share hash");
    check((await evalJs("document.querySelector('#first-name').value")) === "", "restart from shared view doesn't inherit sharer's name");

    /* Mobile viewport sanity: no horizontal overflow */
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 760, deviceScaleFactor: 2, mobile: true });
    await click('[data-action="start"]'); await sleep(100); await click('[data-action="skip-name"]'); await sleep(200);
    check((await evalJs("document.documentElement.scrollWidth <= 376")) === true, "no horizontal overflow at 375px on quiz");
    await click('.opt[data-id="own"]'); await sleep(550); await click('.opt[data-id="creator"]'); await sleep(550);
    check((await evalJs("document.documentElement.scrollWidth <= 376")) === true, "no horizontal overflow at 375px on fact screen");
    await click("#q-continue"); await sleep(100); await click('.opt[data-id="video"]'); await click("#q-continue"); await sleep(100);
    check((await evalJs("!!document.querySelector('.opt[data-id=\"video_edit\"]')")) === true, "focus options switch to creator-specific after role change");
    await click('.opt[data-id="video_edit"]'); await sleep(550);
    check((await screen()) === "capture", "capture shown on mobile flow too");
    check((await evalJs("document.documentElement.scrollWidth <= 376")) === true, "no horizontal overflow at 375px on capture screen");
    check((await evalJs("document.querySelector('.query-box code').textContent")).toLowerCase().includes("creator"), "creator's search query reflects the new role");

    /* Slow-search path: result page must not hang past the 5 s cap, then fill in when the search lands. */
    await cdp.send("Emulation.clearDeviceMetricsOverride", {});
    await evalJs("localStorage.removeItem('loadout.ai.cache')");
    slowMode = true;
    /* Different focus ⇒ different cache key ⇒ no early result to reuse; the result page must do a fresh (slow) call. */
    await evalJs(`window.Loadout.state.email='x@y.co'; window.Loadout.state.ai=null; window.Loadout.state.profile = Object.assign(window.Loadout.state.profile, { focus: 'scripts', tasks:['video'], goals:['save_time'], useCases:['video'], maturity:2, aiTools:['none'], ecosystem:['google'], tech:3, prefs:['easy'], invest:'B', budget:'b1' });`);
    await evalJs(`window.Loadout.debug.finish()`); await sleep(4200);
    /* The early search from the mobile flow (video_edit) may have landed meanwhile — drop it so this is a true cold path. */
    await evalJs(`window.Loadout.state.ai = null; window.Loadout.state.aiKey = null; localStorage.removeItem('loadout.ai.cache');`);
    const callsBefore = searchCalls;
    await evalJs(`document.querySelector('.capture-ready [data-action="skip-email"]')?.click()`); await sleep(100);
    check((await screen()) === "result", "slow path reaches result");
    check(searchCalls === callsBefore + 1, "cold result page triggers exactly one fresh search");
    check((await evalJs("!!document.querySelector('#ai-body .ai-status')")) === true, "AI block in searching state while slow search runs");
    await sleep(5400);
    check((await evalJs("document.querySelector('#ai-body').textContent")).includes("taking a little longer"), "after 5 s cap the block shows the 'taking longer' message instead of hanging");
    check((await evalJs("document.querySelector('#ai-body').textContent")).includes("x@y.co"), "pending message reassures results go to the captured email");
    await sleep(SLOW_SEARCH_MS - 5400 + 800);
    check((await evalJs("document.querySelectorAll('#ai-body .ai-card').length")) === 6, "late-arriving search still fills in the cards");
    slowMode = false;

    const ex = exceptions();
    check(ex.length === 0, `no JS exceptions during flow ${ex[0] || ""}`);
  } catch (e) { failures++; console.log("✗ crashed:", e.message); }

  cdp.close(); chrome.kill(); server.close();
  await sleep(500);
  try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll e2e checks passed.");
  process.exit(failures ? 1 : 0);
})();
