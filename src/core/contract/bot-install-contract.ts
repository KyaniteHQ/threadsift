import { z } from "zod";

export const BOT_RELEASE_TAG =
  /^(?:bot-v(?:0|[1-9][0-9]{0,8})|v(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})(?:-rc\.[1-9][0-9]{0,8})?)$/u;

const SHA256 = /^[0-9a-f]{64}$/u;

const BotReleaseTagSchema = z.string().regex(BOT_RELEASE_TAG);

export type BotReleaseTag = z.infer<typeof BotReleaseTagSchema>;

export const BotReleaseSchema = z.object({
  tag: BotReleaseTagSchema,
  sumsSha256: z.string().regex(SHA256),
  skillSha256: z.string().regex(SHA256),
});

export type BotRelease = z.infer<typeof BotReleaseSchema>;

export const BotInstallReportSchema = z.object({
  version: BotReleaseTagSchema,
  skill: BotReleaseTagSchema,
  refused: BotReleaseTagSchema.nullable(),
});

export type BotInstallReport = z.infer<typeof BotInstallReportSchema>;

export const BotInstallAnswerSchema = z.object({
  expected: BotReleaseSchema,
  autoInstall: z.boolean(),
});

export const BotUpdateInputSchema = z.object({ autoInstall: z.boolean() });

export const BotStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unreported") }),
  z.object({ state: z.literal("current"), version: BotReleaseTagSchema }),
  z.object({ state: z.literal("waits"), version: BotReleaseTagSchema }),
  z.object({
    state: z.literal("skill-waits"),
    version: BotReleaseTagSchema,
    skill: BotReleaseTagSchema,
  }),
  z.object({ state: z.literal("refused"), version: BotReleaseTagSchema }),
]);

export type BotState = z.infer<typeof BotStateSchema>;

export const BotUpdateViewSchema = z.object({
  expected: BotReleaseTagSchema,
  autoInstall: z.boolean(),
  bot: BotStateSchema,
});

export type BotUpdateView = z.infer<typeof BotUpdateViewSchema>;
