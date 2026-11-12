import { z } from "zod";

export const SaveStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saving") }),
  z.object({ kind: z.literal("saved"), itemUrl: z.string() }),
  z.object({ kind: z.literal("not-configured") }),
  z.object({ kind: z.literal("access-missing") }),
  z.object({ kind: z.literal("page-blocked") }),
  z.object({ kind: z.literal("token-refused") }),
  z.object({ kind: z.literal("scope-refused") }),
  z.object({ kind: z.literal("too-large") }),
  z.object({ kind: z.literal("private-link") }),
  z.object({ kind: z.literal("unsupported-link") }),
  z.object({ kind: z.literal("thread-kept") }),
  z.object({ kind: z.literal("updating") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("failed") }),
]);

export type SaveState = z.infer<typeof SaveStateSchema>;

export const SAVE_PORT = "save";

export const CONFIG_PORT = "config";

export const FILL_PORT = "fill";

export const ConfigViewSchema = z.object({ origin: z.string().nullable(), hasToken: z.boolean() });

export type ConfigView = z.infer<typeof ConfigViewSchema>;
