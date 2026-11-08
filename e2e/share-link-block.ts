import { test } from "@playwright/test";

import { attachJson } from "./card.ts";
import { fetchStatusCodes } from "./fetch-status-log.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { aliasesOf } from "./short-links.ts";

const BLOCKED_STATUS = 403;
const ADDRESS_ENDPOINT = "https://api.ipify.org";

async function egressAddress(): Promise<string> {
  try {
    return await (await fetch(ADDRESS_ENDPOINT)).text();
  } catch {
    return "unknown";
  }
}

export async function skipWhenRunnerBlocked(screen: FreshScreen, name: string): Promise<void> {
  if (process.env["GITHUB_ACTIONS"] !== "true" || aliasesOf(screen).length > 0) return;

  if (!fetchStatusCodes(screen.fresh.logs()).includes(BLOCKED_STATUS)) return;

  const egress = await egressAddress();

  await attachJson(
    test.info(),
    `${name}-share-link-block.json`,
    JSON.stringify({ httpStatus: BLOCKED_STATUS, egress }),
  );

  test.skip(
    true,
    `Reddit answered ${BLOCKED_STATUS} to the share link request from this runner (${egress}), so no share link resolves here`,
  );
}
