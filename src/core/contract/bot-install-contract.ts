import { z } from "zod";

const BotReleaseTagSchema = z.string().regex(/^bot-v(?:0|[1-9][0-9]{0,8})$/u);

export const BotReleaseSchema = z.object({
  tag: BotReleaseTagSchema,
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
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

export type BotInstallAnswer = z.infer<typeof BotInstallAnswerSchema>;

export const BotUpdateInputSchema = z.object({ autoInstall: z.boolean() });

const Reported = { version: BotReleaseTagSchema, reportedAt: z.number().int() };

export const BotStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unreported") }),
  z.object({ state: z.literal("current"), ...Reported }),
  z.object({ state: z.literal("waits"), ...Reported }),
  z.object({ state: z.literal("ahead"), ...Reported }),
  z.object({ state: z.literal("skill-waits"), ...Reported, skill: BotReleaseTagSchema }),
  z.object({ state: z.literal("refused"), ...Reported }),
]);

export type BotState = z.infer<typeof BotStateSchema>;

export const BotUpdateViewSchema = z.object({
  expected: BotReleaseTagSchema,
  autoInstall: z.boolean(),
  bot: BotStateSchema,
});

export type BotUpdateView = z.infer<typeof BotUpdateViewSchema>;
