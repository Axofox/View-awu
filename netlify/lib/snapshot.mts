import { getStore } from "@netlify/blobs";

const BASE = "https://api.mightpulse.com/v1";
const KID = "2206"; // kingdom
const TAG = "AWU"; // alliance tag (case-sensitive)

// One Netlify Blobs entry per UTC day, key "YYYY-MM-DD":
// { date, members: { [governor_id]: { n: name, p: power, g: avg hero gear level, r: rank 1-5,
//   t: Town Center level, k: kills, gg: governor gear score (null when hidden) } } }
export type DaySnapshot = {
  date: string;
  members: Record<
    string,
    { n: string | null; p: number; g: number | null; r?: number | null; t?: number | null; k?: number | null; gg?: number | null }
  >;
};

export const historyStore = () => getStore("power-history");
export const today = () => new Date().toISOString().slice(0, 10);

// Average enhancement level (+N) across every gear piece on the arena heroes.
export function avgGearLevel(heroes: any[] | undefined): number | null {
  const pieces = (heroes || []).flatMap((h: any) => h.gear || []);
  if (!pieces.length) return null;
  const total = pieces.reduce((t: number, g: any) => t + (g.enhancement_level ?? g.level ?? 0), 0);
  return Math.round((total / pieces.length) * 10) / 10;
}

// Stores today's power and hero gear level for every member. Running it again on
// the same day overwrites the day. Gear lookups are best effort: if MightPulse is
// too slow, power is still saved and gear keeps the value from earlier today.
// Scheduled functions stop at 30 s, so every call has a deadline.
export async function takeSnapshot(): Promise<number> {
  const key = Netlify.env.get("MIGHTPULSE_API_KEY");
  if (!key) throw new Error("MIGHTPULSE_API_KEY is not set");
  const headers = { Accept: "application/json", Authorization: `Bearer ${key}` };

  const res = await fetch(`${BASE}/alliances/${KID}/${TAG}?include=info,members_base`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`MightPulse returned ${res.status}`);
  const roster = ((await res.json()).members || []).filter((m: any) => m.governor_id && m.power);
  if (!roster.length) return 0;

  const ids: string[] = roster.map((m: any) => String(m.governor_id));
  const gear = new Map<string, { g: number | null; gg: number | null }>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const r = await fetch(`${BASE}/players?ids=${chunk.join(",")}&include=heroes,gov_gear`, {
          headers,
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) return;
        for (const p of (await r.json()).players || []) {
          const items = p.gov_gear && !p.gov_gear.hidden ? p.gov_gear.items || [] : [];
          gear.set(String(p.governor_id), {
            g: avgGearLevel(p.heroes),
            gg: items.length ? items.reduce((t: number, i: any) => t + (i.score || 0), 0) : null,
          });
        }
      } catch {
        // Keep power even when gear is unavailable.
      }
    })
  );

  const store = historyStore();
  const date = today();
  const earlier = (await store.get(date, { type: "json" })) as DaySnapshot | null;
  const snap: DaySnapshot = { date, members: {} };
  for (const m of roster) {
    const id = String(m.governor_id);
    snap.members[id] = {
      n: m.nick_name ?? null,
      p: m.power,
      r: m.alliance_rank ?? null,
      t: m.town_center_level ?? null,
      k: m.kills ?? null,
      g: gear.has(id) ? gear.get(id)!.g : earlier?.members[id]?.g ?? null,
      gg: gear.has(id) ? gear.get(id)!.gg : earlier?.members[id]?.gg ?? null,
    };
  }
  await store.setJSON(date, snap);
  return roster.length;
}
