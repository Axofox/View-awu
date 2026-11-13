import type { Config, Context } from "@netlify/functions";
import { historyStore, takeSnapshot, today, type DaySnapshot } from "../lib/snapshot.mts";

const DAYS = 30;

// Daily power and hero gear level per member for the last 30 days:
// { members: [{ governor_id, points: [["2026-11-13", power, gearLevel], ...] }] }
export default async (req: Request, context: Context) => {
  const store = historyStore();
  const dates: string[] = [];
  for (let i = DAYS; i >= 0; i--) dates.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const days = (await Promise.all(dates.map((d) => store.get(d, { type: "json" })))) as (DaySnapshot | null)[];

  const byId = new Map<string, [string, number, number | null][]>();
  for (const day of days) {
    if (!day) continue;
    for (const [id, m] of Object.entries(day.members)) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id)!.push([day.date, m.p, m.g]);
    }
  }

  // If today has no snapshot yet (first visit, or a missed scheduled run),
  // take one after responding.
  if (!days[days.length - 1] || days[days.length - 1]!.date !== today()) {
    context.waitUntil(takeSnapshot().catch((err) => console.error("snapshot failed", err)));
  }

  return Response.json(
    { members: [...byId].map(([governor_id, points]) => ({ governor_id, points })) },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
};

export const config: Config = { path: "/api/history" };
