import { z } from "zod";

import { DigestSchema } from "./ai-contract.ts";

export const X_INTAKE_TASK = "x_intake";

export const X_INTAKE_INSTRUCTIONS =
  "Read the X post at input.url with its replies, and answer with its thread as content, plus a Digest when you can. Answer unavailable when the post cannot be read at all.";

export const IntakeInputSchema = z.strictObject({ url: z.string(), statusId: z.string() });

type IntakeInput = z.output<typeof IntakeInputSchema>;

export const intakeInputText = (input: Readonly<IntakeInput>): string => JSON.stringify(input);

export const IntakeContextSchema = z
  .object({
    itemId: z.number().int().positive(),
    generation: z.number().int().min(0),
    statusId: z.string(),
    url: z.string(),
  })
  .readonly();

export const IntakeAnswerSchema = z.union([
  z.strictObject({ content: z.string(), digest: DigestSchema.optional() }),
  z.strictObject({ unavailable: z.literal(true) }),
]);

export type IntakeAnswer = z.output<typeof IntakeAnswerSchema>;
