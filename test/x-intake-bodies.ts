import { DIGEST } from "./x-thread-client.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";

export const DIGEST_TITLE = DIGEST.title;

export const contentOf = (statusId: string): string => JSON.stringify(authored(statusId));

export const suppliedContent = (statusId: string): string =>
  JSON.stringify(thread([reply(2n, statusId)], { id: statusId }));

export const digestOf = () => ({ ...DIGEST, keptComments: [] });

export const answerOf = (statusId: string) => ({
  content: contentOf(statusId),
  digest: digestOf(),
});

const LONG_REPLIES = 100;

const LONG_TEXT = "a long reply ".repeat(300);

const answerOfReplies = (statusId: string, text: string) => ({
  content: JSON.stringify(
    thread(
      Array.from({ length: LONG_REPLIES }, (_, index) =>
        reply(3_000_000_000_000_000_000n + BigInt(index), statusId, { text }),
      ),
      { id: statusId },
    ),
  ),
});

export const longAnswerOf = (statusId: string) => answerOfReplies(statusId, LONG_TEXT);

export const oversizedAnswerOf = (statusId: string) =>
  answerOfReplies(statusId, LONG_TEXT.repeat(7));
