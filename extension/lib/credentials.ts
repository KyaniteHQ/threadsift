import { browser } from "wxt/browser";
import { z } from "zod";

import { type Config, instanceOrigin } from "./config.ts";
import { hasRedditAccess } from "./fill-script.ts";
import type { ConfigView } from "./state.ts";

const StoredSchema = z.object({
  instance: z.string().optional(),
  token: z.string().optional(),
  fill: z.boolean().optional(),
});

export async function stored(): Promise<z.infer<typeof StoredSchema>> {
  const read = StoredSchema.safeParse(
    await browser.storage.local.get(["instance", "token", "fill"]),
  );

  return read.success ? read.data : {};
}

export async function loadConfig(): Promise<Config | null> {
  const { instance, token } = await stored();
  const origin = instanceOrigin(instance ?? "");

  return origin !== null && token !== undefined && token !== "" ? { origin, token } : null;
}

export async function loadConfigView(): Promise<ConfigView> {
  const { instance, token, fill } = await stored();

  return {
    origin: instanceOrigin(instance ?? ""),
    hasToken: token !== undefined && token !== "",
    fill: fill !== false && (await hasRedditAccess()),
  };
}
