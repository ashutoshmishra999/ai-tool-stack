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
const server = http.createServer((req, res) => {
  const clean = req.url.split("?")[0].split("#")[0];
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

    /* Invalid email is rejected */
    await evalJs(`document.querySelector('#email').value = 'nope'; document.querySelector('#email-form').requestSubmit();`);
    await sleep(100);
    check((await screen()) === "preview", "invalid email blocked");
    await evalJs(`document.querySelector('#email').value = 'ashutosh@example.com'; document.querySelector('#email-form').requestSubmit();`);
    await sleep(200);
    check((await screen()) === "result", "result screen shown after email");

    const toolCount = await evalJs("document.querySelectorAll('.tool-card').length");
    check(toolCount >= 5 && toolCount <= 8, `result has ${toolCount} tool cards`);
    check((await evalJs("document.querySelectorAll('.layer').length")) >= 3, "stack-by-layer rendered");
    check((await evalJs("document.querySelectorAll('.workflow').length")) >= 1, "workflows rendered");
    check((await evalJs("document.querySelectorAll('.gap').length")) >= 1, "gaps rendered");
    check((await evalJs("document.querySelectorAll('.path li').length")) >= 2, "learning path rendered");
    check((await evalJs("!!document.querySelector('#phone-form')")) === true, "WhatsApp capture shown after email");
    check((await evalJs("[...document.querySelectorAll('.pill.is-owned')].map(p=>p.textContent).join()")).includes("ChatGPT"), "owned ChatGPT shown in layers as 'you use this'");
    check((await evalJs("[...document.querySelectorAll('.tool-card h4')].map(h=>h.textContent).includes('ChatGPT')")) === false, "owned ChatGPT NOT recommended");
    check((await evalJs("!!document.querySelector('#ai-block')")) === true, "AI deep search block rendered");
    check((await evalJs("!!document.querySelector('#ai-setup-form')")) === true, "AI block shows setup form when no provider configured");
    check((await evalJs("document.querySelector('#ai-block').textContent")).includes("Creatives"), "AI block references the focus answer");
    check((await evalJs("document.querySelector('.profile-grid').textContent")).includes("Creatives"), "result profile shows focus");
    /* Configure a bogus proxy → graceful error state, not a crash */
    const searching = await evalJs(`document.querySelector('#ai-provider').value='proxy'; document.querySelector('#ai-provider').dispatchEvent(new Event('change')); document.querySelector('#ai-url').value='http://127.0.0.1:1/nope'; document.querySelector('#ai-setup-form').requestSubmit(); !!document.querySelector('#ai-body .ai-status')`);
    check(searching === true, "AI block shows searching state");
    await sleep(900);
    check((await evalJs("document.querySelector('#ai-body').textContent")).includes("didn't come back"), "AI failure renders graceful error");
    check((await evalJs("JSON.parse(localStorage.getItem('loadout.ai')).provider")) === "proxy", "AI config persisted");
    await click('[data-action="ai-settings"]'); await sleep(50);
    check((await evalJs("!!document.querySelector('#ai-setup-form')")) === true, "change provider returns to setup");
    check((await evalJs("document.querySelector('[data-share=\"whatsapp\"]').href")).startsWith("https://wa.me/"), "WhatsApp share link built");
    check((await evalJs("document.querySelector('.result-head .eyebrow').textContent")).includes("Ashutosh"), "result greets by name");

    /* Phone validation */
    await evalJs(`document.querySelector('#phone').value = '12345'; document.querySelector('#phone-form').requestSubmit();`);
    check((await evalJs("!!document.querySelector('#phone.is-invalid')")) === true, "short phone flagged invalid");
    await evalJs(`document.querySelector('#phone').value = '9876543210'; document.querySelector('#phone-form').requestSubmit();`);
    check((await evalJs("!!document.querySelector('.capture-done')")) === true, "valid phone accepted");

    /* Lead persisted locally */
    const saved = JSON.parse(await evalJs("localStorage.getItem('loadout.v2')"));
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

    const ex = exceptions();
    check(ex.length === 0, `no JS exceptions during flow ${ex[0] || ""}`);
  } catch (e) { failures++; console.log("✗ crashed:", e.message); }

  cdp.close(); chrome.kill(); server.close();
  await sleep(500);
  try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll e2e checks passed.");
  process.exit(failures ? 1 : 0);
})();
