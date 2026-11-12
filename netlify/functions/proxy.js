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

  let upstream;
  if (path === "members") {
    // One request returns the whole alliance.
    upstream = `${BASE}/alliances/${KID}/${TAG}?include=info,members_base`;
  } else if (/^players\/[0-9]{1,20}$/.test(path)) {
    upstream = `${BASE}/${path}?include=base`;
  } else {
    return json(400, { error: "Unknown route" });
  }

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
    });
    const body = await res.text();
    if (!res.ok) {
      return json(res.status, {
        error: "Upstream rejected request",
        upstreamStatus: res.status,
        retryAfter: res.headers.get("retry-after"),
        snippet: body.slice(0, 300),
      });
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      body,
    };
  } catch (err) {
    return json(502, { error: "Upstream fetch failed", detail: String(err) });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
