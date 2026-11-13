import { z } from "zod";

import { utf8Length } from "./digest-prompt.ts";
import { MAX_THREAD_ANSWERS, THREAD_CONTENT_BYTES } from "./limits.ts";

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

function fitsAnswer(answer: string): boolean {
  return (
    answer.length <= THREAD_CONTENT_BYTES &&
    (answer.length * 3 <= THREAD_CONTENT_BYTES || utf8Length(answer) <= THREAD_CONTENT_BYTES)
  );
}

export function fitsContentLimit(answers: ThreadAnswers): boolean {
  return answers.every((answer) => fitsAnswer(answer));
}
