import { z } from "zod";

import { MAX_THREAD_ANSWERS } from "./limits.ts";

export type ThreadAnswers = readonly [string, ...string[]];

const ANSWERS_ERROR = `a string, or 1 to ${String(MAX_THREAD_ANSWERS)} strings`;

export const ThreadAnswersSchema = z.union(
  [
    z.string().transform((answer): ThreadAnswers => [answer]),
    z
      .tuple([z.string()], z.string())
      .refine((answers) => answers.length <= MAX_THREAD_ANSWERS, { error: ANSWERS_ERROR }),
  ],
  { error: ANSWERS_ERROR },
);
