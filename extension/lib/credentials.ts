import { browser } from "wxt/browser";
import { z } from "zod";

import { type Config, hasRedditAccess, instanceOrigin, storeFill } from "./config.ts";
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

export async function fillWanted(): Promise<boolean> {
  return (await stored()).fill !== false;
}

export async function settleFill(): Promise<void> {
  const { fill } = await stored();
  const granted = await hasRedditAccess();
  const settled = fill === undefined ? granted : fill && granted;

  if (settled !== fill) await storeFill(settled);
}

export async function loadConfig(): Promise<Config | null> {
  const { instance, token } = await stored();
  const origin = instanceOrigin(instance ?? "");

  return origin !== null && token !== undefined && token !== "" ? { origin, token } : null;
}

export async function loadConfigView(): Promise<ConfigView> {
  const { instance, token } = await stored();

  return {
    origin: instanceOrigin(instance ?? ""),
    hasToken: token !== undefined && token !== "",
    fill: (await fillWanted()) && (await hasRedditAccess()),
  };
}
