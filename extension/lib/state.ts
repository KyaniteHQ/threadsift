import { browser } from "wxt/browser";
import { z } from "zod";

import { REDDIT_CONNECT_STATES } from "../../src/core/reddit-relay-contract.ts";

export const SaveStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saving") }),
  z.object({ kind: z.literal("saved"), itemUrl: z.string() }),
  z.object({ kind: z.literal("saved-incomplete"), itemUrl: z.string() }),
  z.object({ kind: z.literal("saved-page"), itemUrl: z.string() }),
  z.object({ kind: z.literal("not-configured") }),
  z.object({ kind: z.literal("access-missing") }),
  z.object({ kind: z.literal("page-blocked") }),
  z.object({ kind: z.literal("token-refused") }),
  z.object({ kind: z.literal("scope-refused") }),
  z.object({ kind: z.literal("too-large") }),
  z.object({ kind: z.literal("private-link") }),
  z.object({ kind: z.literal("unsupported-link") }),
  z.object({ kind: z.literal("thread-kept") }),
  z.object({ kind: z.literal("budget-spent") }),
  z.object({ kind: z.literal("updating") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("failed") }),
]);

export type SaveState = z.infer<typeof SaveStateSchema>;

export const SAVE_PORT = "save";

export const CONFIG_PORT = "config";

export const FILL_PORT = "fill";

export const SETTINGS_PORT = "settings";

export const REDDIT_PORT = "reddit";

export const ANSWER_DEADLINE_MS = 10_000;

export const ConfigViewSchema = z.object({
  origin: z.string().nullable(),
  hasToken: z.boolean(),
  fill: z.boolean(),
});

export type ConfigView = z.infer<typeof ConfigViewSchema>;

export const SettingsRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save"), origin: z.string(), token: z.string().nullable() }),
  z.object({ kind: z.literal("fill"), on: z.boolean() }),
]);

export type SettingsRequest = z.infer<typeof SettingsRequestSchema>;

export const ChangeAnswerSchema = z.object({
  stored: ConfigViewSchema,
  write: z.enum(["done", "failed"]),
  access: z.enum(["reconciled", "kept"]),
});

export type ChangeAnswer = z.infer<typeof ChangeAnswerSchema>;

export const RedditRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read") }),
  z.object({ kind: z.literal("connect") }),
  z.object({ kind: z.literal("disconnect") }),
]);

export type RedditRequest = z.infer<typeof RedditRequestSchema>;

export const RedditAnswerSchema = z.object({ state: z.enum(REDDIT_CONNECT_STATES) });

export type RedditAnswer = z.infer<typeof RedditAnswerSchema>;

export interface AskOptions {
  readonly deadlineMs: number;
  readonly request?: SettingsRequest | RedditRequest;
}

export function ask<Schema extends z.ZodType>(
  name: string,
  schema: Schema,
  { deadlineMs, request }: Readonly<AskOptions>,
): Promise<z.output<Schema>> {
  const port = browser.runtime.connect({ name });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      port.disconnect();
      reject(new Error(`the background worker gave no "${name}" answer in ${deadlineMs} ms`));
    }, deadlineMs);

    port.onMessage.addListener((message) => {
      clearTimeout(timer);
      port.disconnect();

      const answer = schema.safeParse(message);

      if (answer.success) resolve(answer.data);
      else reject(new Error(`the background worker sent an unreadable "${name}" answer`));
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      reject(new Error(`the background worker closed the "${name}" port`));
    });

    if (request !== undefined) port.postMessage(request);
  });
}
