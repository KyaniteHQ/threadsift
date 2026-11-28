import { eq } from "drizzle-orm";

import type { RedditSettings } from "../../../core/contract/reddit-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, heldBatch, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { redditSettings } from "../../../core/kernel/schema.ts";

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

export function saveRedditSettings(
  { db }: Readonly<SettingsPorts>,
  { archiveFill }: Readonly<RedditSettings>,
): Promise<RedditSettings | Closed> {
  return whileOpen(async () => {
    await heldBatch(db, [
      db
        .insert(redditSettings)
        .values({ id: 1, archiveFill })
        .onConflictDoUpdate({ target: redditSettings.id, set: { archiveFill } }),
    ] as const);

    return { archiveFill };
  });
}
