# BlackBulls [AWU] Tracker

Kingshot alliance tracker (Kingdom 2206). Static page plus one Netlify function
that proxies MightPulse server-side to avoid CORS.

- `index.html`: sortable member table (power, TC, VIP, last active, R1-R5, coords)
- `netlify/functions/proxy.js`: calls the official MightPulse API (`api.mightpulse.com/v1`) with `MIGHTPULSE_API_KEY` (Netlify env var)
- `netlify.toml`: routes `/api/members` and `/api/gear?ids=` to the function

Deploy: connect this repo in Netlify (no build command, publish dir `.`).
Note: MightPulse field names were not verified; `index.html` maps several likely keys in `normalize()`.
