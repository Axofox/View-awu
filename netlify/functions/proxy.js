// Server-side proxy for MightPulse (avoids browser CORS).
// Only two upstream routes are allowed, nothing else can be reached through it.
const BASE = "https://mightpulse.com/api";
const ALLIANCE_ID = "221500002";

exports.handler = async (event) => {
  // Works whether Netlify passes the original (/api/members) or rewritten
  // (/.netlify/functions/proxy/members) path, or a ?path= query param.
  const m = String(event.path || "").match(/(members|players\/[^/]+)\/?$/);
  const path =
    (m && m[1]) || (event.queryStringParameters && event.queryStringParameters.path) || "";
  let upstream;

  if (path === "members") {
    upstream = `${BASE}/alliances/${ALLIANCE_ID}/members`;
  } else if (/^players\/[A-Za-z0-9_-]{1,40}$/.test(path)) {
    upstream = `${BASE}/${path}`;
  } else {
    return json(400, { error: "Unknown route" });
  }

  try {
    const res = await fetch(upstream, { headers: { Accept: "application/json" } });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "public, max-age=60",
      },
      body,
    };
  } catch (err) {
    return json(502, { error: "Upstream fetch failed", detail: String(err) });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
