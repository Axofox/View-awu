# BlackBulls [AWU] Tracker

Kingshot alliance tracker (Kingdom 2206) on Netlify.

- `public/index.html`: sortable member table (rank, power, TC, VIP, kills, growth, hero gear, gear growth, coords); select a name for hero gear, power history and governor gear. Refresh forces fresh data.
- `netlify/functions/proxy.js`: calls the official MightPulse API (`api.mightpulse.com/v1`) with `MIGHTPULSE_API_KEY` (Netlify env var); serves `/api/members` and `/api/gear?ids=`
- `netlify/functions/snapshot.mts`: scheduled, saves every member's power and average hero gear level to Netlify Blobs (store `power-history`, one entry per day) four times a day
- `netlify/functions/history.mts`: serves `/api/history` (last 30 days per member)
