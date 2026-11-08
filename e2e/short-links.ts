import { z } from "zod";

import type { Instance } from "./access.ts";
import type { FreshScreen } from "./fresh-screen.ts";

const Aliases = z.array(z.object({ normalizedUrl: z.string(), itemId: z.number() }));

const Addresses = z.array(z.object({ address: z.string() }));

export function aliasesOf(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT normalized_url AS normalizedUrl, item_id AS itemId FROM item_aliases ORDER BY normalized_url",
    Aliases,
  );
}

export function rememberAlias(instance: Instance, shortLink: string, itemId: number): void {
  instance.sql(
    `INSERT INTO item_aliases (normalized_url, item_id) VALUES ('${shortLink}', ${itemId})`,
  );
}

export function fetchAddressesOf(screen: FreshScreen, itemId: number): string[] {
  return screen.fresh
    .query(
      `SELECT address FROM jobs WHERE item_id = ${itemId} AND kind = 'fetch' ORDER BY id`,
      Addresses,
    )
    .map(({ address }) => address);
}
