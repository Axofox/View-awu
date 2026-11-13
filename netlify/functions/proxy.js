// Server-side proxy for the official MightPulse API (https://api.mightpulse.com).
// The API key lives in the Netlify env var MIGHTPULSE_API_KEY and never reaches the browser.
const BASE = "https://api.mightpulse.com/v1";
const KID = "2206"; // kingdom
const TAG = "AWU"; // alliance tag (case-sensitive)

exports.handler = async (event) => {
  const key = process.env.MIGHTPULSE_API_KEY;
  if (!key) return json(500, { error: "MIGHTPULSE_API_KEY is not set in Netlify environment variables" });

  // Works whether Netlify passes the original or rewritten path, or a ?path= param.
  const m = String(event.path || "").match(/(members|players\/[^/]+)\/?$/);
  const path = (m && m[1]) || (event.queryStringParameters && event.queryStringParameters.path) || "";

  const headers = { Accept: "application/json", Authorization: `Bearer ${key}` };

  try {
    if (path === "members") return await members(headers);
    if (/^players\/[0-9]{1,20}$/.test(path)) return await pass(`${BASE}/${path}?include=base`, headers);
    return json(400, { error: "Unknown route" });
  } catch (err) {
    return json(502, { error: "Upstream fetch failed", detail: String(err) });
  }
};

// Whole alliance in one call, then VIP and coordinates from batched player
// lookups (50 ids per call), merged onto each member.
async function members(headers) {
  const res = await fetch(`${BASE}/alliances/${KID}/${TAG}?include=info,members_base`, { headers });
  if (!res.ok) return upstreamError(res);
  const data = await res.json();
  const list = data.members || [];

  const ids = list.map((m) => m.governor_id).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const extra = new Map();
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const r = await fetch(`${BASE}/players?ids=${chunk.join(",")}&include=base`, { headers });
        if (!r.ok) return;
        for (const p of (await r.json()).players || []) {
          if (p.player) extra.set(p.governor_id, p.player);
        }
      } catch (_) {
        // Table still works without VIP and coordinates.
      }
    })
  );
  for (const m of list) {
    const p = extra.get(m.governor_id);
    if (p) Object.assign(m, { vip: p.vip, x: p.x, y: p.y });
  }

  return {
    statusCode: 200,
    // 5 minutes: upstream data is refreshed hourly at most, and this saves API quota.
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    body: JSON.stringify({
      alliance: data.alliance,
      cached_at: data.cached_at,
      fresh: data.fresh,
      members: list,
    }),
  };
}

async function pass(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) return upstreamError(res);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    body: await res.text(),
  };
}

async function upstreamError(res) {
  return json(res.status, {
    error: "Upstream rejected request",
    upstreamStatus: res.status,
    retryAfter: res.headers.get("retry-after"),
    snippet: (await res.text()).slice(0, 300),
  });
}

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
