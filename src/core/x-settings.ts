import { z } from "zod";

import type { Ports } from "./ports.ts";
import { X_FETCHER_STATES } from "./x-fetcher.ts";

const STATE_NOT_INSTALLED = "not-installed";
const STATE_WORKER = "worker";

export const XSettingsViewSchema = z.object({
  fetcher: z.literal("grok-cli").nullable(),
  state: z.enum([STATE_NOT_INSTALLED, STATE_WORKER, ...X_FETCHER_STATES]),
  version: z.string().nullable(),
});

export type XSettingsView = z.output<typeof XSettingsViewSchema>;

export async function readXSettings({
  xFetcher,
  ai,
}: Readonly<Pick<Ports, "xFetcher" | "ai">>): Promise<XSettingsView> {
  if (xFetcher === null) {
    return {
      fetcher: null,
      state: ai.publicOnly ? STATE_WORKER : STATE_NOT_INSTALLED,
      version: null,
    };
  }

  const { state, version } = await xFetcher.status();

  return { fetcher: xFetcher.id, state, version };
}
