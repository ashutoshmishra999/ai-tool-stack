/* Loadout — lead capture (Vercel serverless function).
 *
 * POST /api/lead  { firstName, email, phone, stage, profile, stackIds, searchQuery, ts }
 *   → { ok: true }
 *
 * Forwards the lead to LEAD_WEBHOOK_URL (Zapier / Make / n8n / Google Apps
 * Script / HubSpot form endpoint — anything that accepts JSON POST). If the env
 * var isn't set the lead is just logged, so the quiz never breaks.
 *
 * Env: LEAD_WEBHOOK_URL (required to forward), ALLOWED_ORIGIN (optional)
 */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "Bad JSON" });

  const email = String(body.email || "").trim().slice(0, 120);
  const phone = String(body.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
  if (!email && !phone) return res.status(400).json({ error: "email or phone required" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "invalid email" });

  const lead = {
    firstName: String(body.firstName || "").slice(0, 60),
    email, phone,
    stage: String(body.stage || "").slice(0, 30),              // "focus" (mid-quiz) | "result" | "whatsapp"
    role: body.profile && body.profile.role, work: body.profile && body.profile.work, focus: body.profile && body.profile.focus,
    searchQuery: String(body.searchQuery || "").slice(0, 200),
    stackIds: Array.isArray(body.stackIds) ? body.stackIds.slice(0, 12) : [],
    profile: body.profile || null,
    source: "loadout",
    ua: req.headers["user-agent"] || "",
    ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim(),
    ts: new Date().toISOString(),
  };

  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) { console.log("[lead]", JSON.stringify(lead)); return res.status(200).json({ ok: true, forwarded: false }); }
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead), signal: AbortSignal.timeout(6000) });
    return res.status(200).json({ ok: true, forwarded: r.ok, status: r.status });
  } catch (e) {
    console.error("[lead] forward failed", e && e.message);
    return res.status(200).json({ ok: true, forwarded: false });   // never fail the user over a webhook hiccup
  }
};
