# BlackBulls [AWU] Tracker

Kingshot alliance tracker (Kingdom 2206) on Netlify.

- `public/index.html`: sortable member table (rank, power, TC, VIP, kills, growth, hero gear, coords); select a name for hero gear, power history and governor gear
- `netlify/functions/proxy.js`: calls the official MightPulse API (`api.mightpulse.com/v1`) with `MIGHTPULSE_API_KEY` (Netlify env var); serves `/api/members` and `/api/gear?ids=`
- `netlify/functions/snapshot.mts`: scheduled, stores every member's power in the database four times a day
- `netlify/functions/history.mts`: serves `/api/history` (daily power per member, last 30 days)
- `netlify/database/migrations/`: Netlify Database schema (`power_snapshots`), applied on deploy
