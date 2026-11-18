import { DIGEST } from "./x-thread-client.ts";
import { reply, thread } from "./x-thread-fixtures.ts";

export const contentOf = (statusId: string): string =>
  JSON.stringify(thread([reply(BigInt(statusId) + 1n, statusId)], { id: statusId }));

export const suppliedContent = (statusId: string): string =>
  JSON.stringify(thread([reply(2n, statusId)], { id: statusId }));

export const digestOf = () => ({ ...DIGEST, keptComments: [] });

export const answerOf = (statusId: string) => ({
  content: contentOf(statusId),
  digest: digestOf(),
});

const LONG_TEXT = "a long reply ".repeat(2100);

export function largeThreadOf(statusId: string) {
  const root = BigInt(statusId);
  const entries = Array.from({ length: 100 }, (_, index) =>
    reply(root + BigInt(index + 1), statusId, { text: LONG_TEXT }),
  );

  entries[0] = reply(root + 1n, statusId, { likes: 0 });
  entries[1] = reply(root + 2n, root - 1n, { likes: 999 });
  entries[2] = reply(root + 3n, statusId, { likes: 999, text: " " });
  entries[3] = reply(root + 4n, root + 1n, { text: LONG_TEXT });
  entries[99] = reply(root + 100n, statusId, { author: "someone", likes: 0 });

  return thread(entries.toReversed(), { id: statusId });
}

export const oversizedAnswerOf = (statusId: string) => ({
  content: JSON.stringify(
    thread(
      Array.from({ length: 20 }, (_, index) =>
        reply(BigInt(statusId) + BigInt(index + 1), statusId, { text: LONG_TEXT.repeat(3) }),
      ),
      { id: statusId },
    ),
  ),
});
