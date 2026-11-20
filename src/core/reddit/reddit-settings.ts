import { eq } from "drizzle-orm";

import type { RedditSettings } from "../contract/reddit-contract.ts";
import type { Ports } from "../kernel/ports.ts";
import { redditSettings } from "../kernel/schema.ts";

type SettingsPorts = Pick<Ports, "db">;

export async function archiveFillIsOn({ db }: Readonly<SettingsPorts>): Promise<boolean> {
  const [row] = await db
    .select({ archiveFill: redditSettings.archiveFill })
    .from(redditSettings)
    .where(eq(redditSettings.id, 1));

  return row?.archiveFill ?? true;
}

export async function readRedditSettings(ports: Readonly<SettingsPorts>): Promise<RedditSettings> {
  return { archiveFill: await archiveFillIsOn(ports) };
}

export async function saveRedditSettings(
  { db }: Readonly<SettingsPorts>,
  { archiveFill }: Readonly<RedditSettings>,
): Promise<RedditSettings> {
  await db
    .insert(redditSettings)
    .values({ id: 1, archiveFill })
    .onConflictDoUpdate({ target: redditSettings.id, set: { archiveFill } });

  return { archiveFill };
}
