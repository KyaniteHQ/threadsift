import { z } from "zod";

import { GrokBotTestSchema, GrokBotViewSchema } from "../src/core/grok-bot-contract.ts";
import type { Instance } from "./instance.ts";
import { rows } from "./related-fixtures.ts";

export const SECRET_KEY = "ab".repeat(32);

export const ADDRESS =
  "https://api2.cursor.sh/automations/webhook/00000000-0000-4000-8000-000000000000";

export const OTHER_ADDRESS = "https://example.com/automations/webhook/other";

export const KEY = "grok-bot-key-that-must-never-leave-the-server";

export const NEW_KEY = "a-second-grok-bot-key-with-no-spaces";

export const PATH = "/api/settings/grok-bot";

const RowSchema = z.object({
  webhook_url: z.string(),
  sealed_key: z.string(),
  updated_at: z.number(),
});

export function inOrder<Item>(
  items: readonly Item[],
  step: (item: Item) => Promise<void>,
): Promise<void> {
  return items.reduce<Promise<void>>(
    (done, item) => done.then(() => step(item)),
    Promise.resolve(),
  );
}

export const saved = (instance: Instance) =>
  rows(instance, RowSchema, "select webhook_url, sealed_key, updated_at from grok_bot_settings");

export const view = (instance: Instance) => instance.read("GET", PATH, GrokBotViewSchema);

export const tested = async (instance: Instance) =>
  (await instance.read("POST", `${PATH}/test`, GrokBotTestSchema)).result;
