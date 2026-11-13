import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { takeSnapshot } from "../lib/snapshot.mts";

// Daily power per member for the last 30 days:
// { members: [{ governor_id, points: [["2026-11-13", 132625555], ...] }] }
export default async (req: Request, context: Context) => {
  const db = getDatabase();
  const members = await db.sql`
    SELECT governor_id::text AS governor_id,
           json_agg(json_build_array(snapshot_date::text, power) ORDER BY snapshot_date) AS points
    FROM power_snapshots
    WHERE snapshot_date >= (now() AT TIME ZONE 'utc')::date - 30
    GROUP BY governor_id
  `;

  // If today has no snapshot yet (first visit, or a missed scheduled run),
  // take one after responding.
  const [{ has_today }] = await db.sql`
    SELECT EXISTS (
      SELECT 1 FROM power_snapshots WHERE snapshot_date = (now() AT TIME ZONE 'utc')::date
    ) AS has_today
  `;
  if (!has_today) context.waitUntil(takeSnapshot().catch((err) => console.error(err)));

  return Response.json({ members }, { headers: { "Cache-Control": "public, max-age=300" } });
};

export const config: Config = { path: "/api/history" };
