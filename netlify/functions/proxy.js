// Server-side proxy for the official MightPulse API (https://api.mightpulse.com).
// The API key lives in the Netlify env var MIGHTPULSE_API_KEY and never reaches the browser.
const BASE = "https://api.mightpulse.com/v1";
const KID = "2206"; // kingdom
const TAG = "AWU"; // alliance tag (case-sensitive)

exports.handler = async (event) => {
  const key = process.env.MIGHTPULSE_API_KEY;
  if (!key) return json(500, { error: "MIGHTPULSE_API_KEY is not set in Netlify environment variables" });

  // Works whether Netlify passes the original or rewritten path, or a ?path= param.
  const qs = event.queryStringParameters || {};
  const m = String(event.path || "").match(/(members|gear)\/?$/);
  const path = (m && m[1]) || qs.path || "";
  const headers = { Accept: "application/json", Authorization: `Bearer ${key}` };

  try {
    const fresh = qs.fresh === "1"; // Refresh button: skip caches, ask MightPulse to update
    if (path === "members") return await members(headers, fresh);
    if (path === "gear") return await gear(headers, String(qs.ids || ""), fresh);
    return json(400, { error: "Unknown route" });
  } catch (err) {
    return json(502, { error: "Upstream fetch failed", detail: String(err) });
  }
};

// Roster with name, power, Town Center, kills and rank: one fast call.
async function members(headers, fresh) {
  const res = await get(`${BASE}/alliances/${KID}/${TAG}?include=info,members_base`, headers, fresh);
  if (!res.ok) return upstreamError(res);
  const data = await res.json();
  return ok(fresh, {
    alliance: data.alliance,
    cached_at: data.cached_at,
    fresh: data.fresh,
    members: (data.members || []).map((m) => ({
      governor_id: m.governor_id,
      nick_name: m.nick_name,
      power: m.power,
      town_center_level: m.town_center_level,
      kills: m.kills,
      alliance_rank: m.alliance_rank,
    })),
  });
}

// VIP, coordinates, governor gear and arena heroes for up to 50 players per call.
// The page requests this in the background after the table is shown. The full-alliance
// endpoint (members_full) returns the same data but is too slow for a function call.
async function gear(headers, ids, fresh) {
  if (!/^\d{1,20}(,\d{1,20}){0,49}$/.test(ids)) return json(400, { error: "ids must be 1-50 numeric ids" });
  const res = await get(`${BASE}/players?ids=${ids}&include=base,heroes,gov_gear`, headers, fresh);
  if (!res.ok) return upstreamError(res);
  const data = await res.json();
  return ok(fresh, {
    players: (data.players || []).map((e) => {
      const p = e.player || {};
      const gg = e.gov_gear || {};
      return {
        governor_id: e.governor_id,
        cached_at: e.cached_at,
        vip: p.vip,
        x: p.x,
        y: p.y,
        gov_gear: {
          hidden: !!gg.hidden,
          items: (gg.items || []).map((i) => ({
            slot: i.slot,
            name: i.name,
            tier: i.tier,
            star: i.star,
            level: i.strength_level,
            score: i.score,
          })),
        },
        heroes: (e.heroes || []).map((h) => ({
          name: h.name,
          level: h.level,
          stars: h.star_label,
          exclusive: h.exclusive_gear ? { name: h.exclusive_gear.name, level: h.exclusive_gear.level } : null,
          gear: (h.gear || []).map((g) => ({
            slot: g.slot,
            name: g.name,
            level: g.enhancement_level,
            refine: g.refine_level,
            quality: g.quality_key,
            red: !!g.red,
          })),
        })),
      };
    }),
  });
}

// Normal loads use MightPulse's stored copy (up to an hour old). A forced refresh
// asks for data at most a minute old and lets MightPulse wait up to 10 s to update it.
// Netlify stops the function at about 30 s, so after 18 s we give up on the update
// and return the stored copy instead of timing out.
async function get(url, headers, fresh) {
  if (!fresh) return fetch(url, { headers });
  const start = Date.now();
  try {
    return await fetch(`${url}&max_age=60&wait=10`, { headers, signal: AbortSignal.timeout(18000) });
  } catch (err) {
    if (err.name !== "TimeoutError" && err.name !== "AbortError") throw err;
    return fetch(url, { headers, signal: AbortSignal.timeout(Math.max(3000, 27000 - (Date.now() - start))) });
  }
}

function ok(fresh, obj) {
  const headers = { "Content-Type": "application/json" };
  if (fresh) {
    headers["Cache-Control"] = "no-store";
    headers["Netlify-CDN-Cache-Control"] = "no-store";
  } else {
    headers["Cache-Control"] = "public, max-age=120";
    // Netlify's CDN keeps a copy for 5 minutes and serves it while refreshing,
    // so repeat visits are instant and use no API quota.
    headers["Netlify-CDN-Cache-Control"] = "public, durable, max-age=300, stale-while-revalidate=86400";
    headers["Netlify-Vary"] = "query=ids|fresh";
  }
  return { statusCode: 200, headers, body: JSON.stringify(obj) };
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
