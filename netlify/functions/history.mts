import type { Config, Context } from "@netlify/functions";
import { historyStore, takeSnapshot, today, type DaySnapshot } from "../lib/snapshot.mts";

const DAYS = 30;

// Daily power and hero gear level per member for the last 30 days, plus a log of
// who joined, left or changed rank, found by comparing consecutive snapshots:
// { members: [{ governor_id, points: [["2026-11-13", power, gearLevel], ...] }],
//   log: [{ date, since, joined: [...], left: [...], rank: [...] }] }   (newest first)
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

  type Who = { id: string; name: string | null; power: number };
  const log: { date: string; since: string; joined: Who[]; left: Who[]; rank: (Who & { from: number; to: number })[] }[] = [];
  const present = days.filter((d): d is DaySnapshot => !!d);
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1].members, cur = present[i].members;
    const who = (id: string, m: { n: string | null; p: number }) => ({ id, name: m.n, power: m.p });
    const joined = Object.keys(cur).filter((id) => !prev[id]).map((id) => who(id, cur[id]));
    const left = Object.keys(prev).filter((id) => !cur[id]).map((id) => who(id, prev[id]));
    const rank = Object.keys(cur)
      .filter((id) => prev[id] && prev[id].r != null && cur[id].r != null && prev[id].r !== cur[id].r)
      .map((id) => ({ ...who(id, cur[id]), from: prev[id].r!, to: cur[id].r! }));
    if (joined.length || left.length || rank.length)
      log.unshift({ date: present[i].date, since: present[i - 1].date, joined, left, rank });
  }

  // If today has no snapshot yet (first visit, or a missed scheduled run),
  // take one after responding.
  if (!days[days.length - 1] || days[days.length - 1]!.date !== today()) {
    context.waitUntil(takeSnapshot().catch((err) => console.error("snapshot failed", err)));
  }

  return Response.json(
    { members: [...byId].map(([governor_id, points]) => ({ governor_id, points })), log },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
};

export const config: Config = { path: "/api/history" };
