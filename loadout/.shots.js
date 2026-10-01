/* Dev helper: capture screenshots of key screens → /tmp/loadout-shots. Run: node loadout/.shots.js */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const { connectWs, server, PORT, CHROME, sleep } = require("./e2e.js");
const OUT = "/tmp/loadout-shots";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const dir = fs.mkdtempSync("/tmp/loadout-shot-");
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9334", `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  await sleep(1500);
  const page = JSON.parse(execSync("curl -s http://127.0.0.1:9334/json").toString()).find((t) => t.type === "page");
  const cdp = await connectWs(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  const vp = (h) => cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: h, deviceScaleFactor: 1, mobile: false });
  await vp(900);
  const ev = async (e) => (await cdp.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
  const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const shot = async (name, full) => {
    if (full) { await vp(Math.min(await ev("document.documentElement.scrollHeight"), 7000)); await sleep(250); }
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
    if (full) await vp(900);
    console.log("saved", `${OUT}/${name}.png`);
  };

  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` }); await sleep(1500);
  await shot("1-landing");
  await click('[data-action="start"]'); await sleep(300); await shot("2-name");
  await ev(`document.querySelector('#first-name').value='Ashutosh'; document.querySelector('#name-form').requestSubmit()`); await sleep(400);
  await shot("3-q1-work");
  await click('.opt[data-id="company"]'); await sleep(600);
  await shot("4-q2-role");
  await click('.opt[data-id="marketing"]'); await sleep(700);
  await shot("5-fact-40pct");
  await click("#q-continue"); await sleep(300);
  for (const id of ["content", "research", "writing", "admin"]) await click(`.opt[data-id="${id}"]`);
  await sleep(400); await shot("6-q3-tasks");
  await click("#q-continue"); await sleep(400); await shot("7-q4-focus");
  await click('.opt[data-id="visuals_fast"]'); await sleep(600);
  for (const id of ["save_time", "better_content"]) await click(`.opt[data-id="${id}"]`);
  await click("#q-continue"); await sleep(600); await shot("8-fact-dynamic");
  await click("#q-continue"); await sleep(100);
  for (const id of ["content", "research", "automation"]) await click(`.opt[data-id="${id}"]`);
  await click("#q-continue"); await sleep(400); await shot("9-q7-maturity");
  await click('.opt[data-id="3"]'); await sleep(600);
  await click('.opt[data-id="chatgpt"]'); await sleep(300); await shot("10-q8-tools");
  await click("#q-continue"); await sleep(100); await click("#q-continue"); await sleep(100);
  for (const id of ["google", "canva", "slack"]) await click(`.opt[data-id="${id}"]`);
  await click("#q-continue"); await sleep(100);
  await click('.opt[data-id="3"]'); await sleep(600); await click("#q-continue"); await sleep(100);
  for (const id of ["easy", "time", "affordable"]) await click(`.opt[data-id="${id}"]`);
  await click("#q-continue"); await sleep(100);
  await click('.opt[data-id="B"]'); await click('.chip[data-id="b2"]'); await sleep(300); await shot("11-q12-invest");
  await click("#q-continue"); await sleep(1600); await shot("12-analyzing");
  await sleep(2600); await shot("13-preview", true);
  await ev(`document.querySelector('#email').value='a@b.co'; document.querySelector('#email-form').requestSubmit()`); await sleep(500);
  await shot("14-result-full", true);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await click('[data-action="restart"]'); await sleep(200); await click('[data-action="start"]'); await sleep(100); await click('[data-action="skip-name"]'); await sleep(500);
  await shot("15-mobile-q1");
  await click('.opt[data-id="own"]'); await sleep(600); await click('.opt[data-id="creator"]'); await sleep(700); await shot("16-mobile-fact");

  cdp.close(); chrome.kill(); server.close(); await sleep(400);
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
  process.exit(0);
})();
