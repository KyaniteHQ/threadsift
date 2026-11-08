import { z } from "zod";

export const GITHUB_TOKEN_MAX = 4096;

const NO_SPACE_OR_CONTROL = /^[^\s\p{Cc}]+$/u;

export const GithubTokenInputSchema = z.object({
  token: z.string().max(GITHUB_TOKEN_MAX).regex(NO_SPACE_OR_CONTROL),
});

export type GithubTokenInput = z.infer<typeof GithubTokenInputSchema>;

export const GithubSettingsViewSchema = z.object({
  token: z.enum(["none", "saved", "unreadable"]),
  secretReady: z.boolean(),
});

export type GithubSettingsView = z.infer<typeof GithubSettingsViewSchema>;

export const GithubRefusalSchema = z.enum([
  "secret-missing",
  "not-configured",
  "wrong-token",
  "unreachable",
  "timeout",
  "github-error",
  "rate-limited",
]);

export type GithubRefusal = z.infer<typeof GithubRefusalSchema>;

const GithubRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: GithubRefusalSchema,
  status: z.number().int().nullable(),
});

export type GithubRefused = z.infer<typeof GithubRefusedSchema>;

export const GithubVerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("verified"),
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
  }),
  GithubRefusedSchema,
]);

export type GithubVerifyResult = z.infer<typeof GithubVerifyResultSchema>;

export const GithubSaveResponseSchema = z.union([GithubSettingsViewSchema, GithubRefusedSchema]);

export function refusedGithub(reason: GithubRefusal, status: number | null = null): GithubRefused {
  return { kind: "refused", reason, status };
}
