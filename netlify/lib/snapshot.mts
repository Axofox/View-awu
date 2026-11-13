import { getDatabase } from "@netlify/database";

const BASE = "https://api.mightpulse.com/v1";
const KID = "2206"; // kingdom
const TAG = "AWU"; // alliance tag (case-sensitive)

// Fetches the current roster and stores today's power for every member.
// Safe to run several times a day: the day's row is overwritten.
export async function takeSnapshot(): Promise<number> {
  const key = Netlify.env.get("MIGHTPULSE_API_KEY");
  if (!key) throw new Error("MIGHTPULSE_API_KEY is not set");

  const res = await fetch(`${BASE}/alliances/${KID}/${TAG}?include=info,members_base`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`MightPulse returned ${res.status}`);
  const data = await res.json();

  const rows = (data.members || [])
    .filter((m: any) => m.governor_id && m.power)
    .map((m: any) => ({
      governor_id: m.governor_id,
      nick_name: m.nick_name ?? null,
      power: m.power,
      town_center_level: m.town_center_level ?? null,
      kills: m.kills ?? null,
      alliance_rank: m.alliance_rank ?? null,
    }));
  if (!rows.length) return 0;

  const db = getDatabase();
  await db.sql`
    INSERT INTO power_snapshots
      (governor_id, snapshot_date, nick_name, power, town_center_level, kills, alliance_rank)
    SELECT t.governor_id, (now() AT TIME ZONE 'utc')::date, t.nick_name, t.power,
           t.town_center_level, t.kills, t.alliance_rank
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS t(
      governor_id bigint, nick_name text, power bigint,
      town_center_level integer, kills bigint, alliance_rank integer)
    ON CONFLICT (governor_id, snapshot_date) DO UPDATE SET
      nick_name = EXCLUDED.nick_name,
      power = EXCLUDED.power,
      town_center_level = EXCLUDED.town_center_level,
      kills = EXCLUDED.kills,
      alliance_rank = EXCLUDED.alliance_rank,
      captured_at = now()
  `;
  return rows.length;
}
