import type { Config } from "@netlify/functions";
import { takeSnapshot } from "../lib/snapshot.mts";

// Records every member's power and hero gear level. Runs four times a day so one
// failed run doesn't leave a gap; each run overwrites that day's entry.
export default async () => {
  const count = await takeSnapshot();
  console.log(`Stored snapshot for ${count} members`);
};

export const config: Config = {
  schedule: "17 */6 * * *", // 00:17, 06:17, 12:17, 18:17 UTC
};
