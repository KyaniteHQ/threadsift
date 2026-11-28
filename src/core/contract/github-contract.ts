import { z } from "zod";

import { HeaderSecretSchema } from "./secret-input.ts";
import { WholeCount } from "./whole-count.ts";

export const GithubTokenInputSchema = z.object({ token: HeaderSecretSchema });

export type GithubTokenInput = z.infer<typeof GithubTokenInputSchema>;

export const GithubTokenStateSchema = z.enum(["none", "saved", "unreadable"]);

export const GithubSettingsViewSchema = z.object({
  token: GithubTokenStateSchema,
  secretReady: z.boolean(),
});

export type GithubSettingsView = z.infer<typeof GithubSettingsViewSchema>;

const GithubRefusalSchema = z.enum([
  "secret-missing",
  "not-configured",
  "wrong-token",
  "unreachable",
  "timeout",
  "github-error",
  "rate-limited",
]);

type GithubRefusal = z.infer<typeof GithubRefusalSchema>;

const GithubRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: GithubRefusalSchema,
  status: z.number().int().nullable(),
});

export type GithubRefused = z.infer<typeof GithubRefusedSchema>;

export const GithubVerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("verified"),
    limit: WholeCount,
    remaining: WholeCount,
  }),
  GithubRefusedSchema,
]);

export type GithubVerifyResult = z.infer<typeof GithubVerifyResultSchema>;

export const GithubSaveResponseSchema = z.union([GithubSettingsViewSchema, GithubRefusedSchema]);

export function refusedGithub(reason: GithubRefusal, status: number | null = null): GithubRefused {
  return { kind: "refused", reason, status };
}
