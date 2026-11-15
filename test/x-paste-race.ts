import type { Answer, Instance } from "./instance.ts";
import { interrupted } from "./interrupted-database.ts";
import { addressOf } from "./x-intake-fixtures.ts";
import { commentCount } from "./x-intake-rows.ts";
import { xClient } from "./x-thread-client.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";

const writesABatch = (sql: string) => sql.includes('"guards"');

export interface OvertakenPaste {
  readonly answer: Answer;
  readonly pastedReplies: number;
  readonly storedInBetween: number;
  readonly storedAfter: number;
}

export async function pasteOvertakenByLargerThread(
  instance: Instance,
  post: string,
): Promise<OvertakenPaste> {
  const { saved, itemIdOf } = xClient(instance);
  const first = reply(1000000000000000041n, post);

  await saved({ url: addressOf(post), content: JSON.stringify(thread([first], { id: post })) });

  const itemId = itemIdOf(post);
  let storedInBetween = 0;

  const racing = interrupted(instance.databaseFile, writesABatch, {
    before: async () => {
      await saved({ url: addressOf(post), content: JSON.stringify(authored(post)) });
      storedInBetween = commentCount(instance, itemId);
    },
  });

  const pasted = [first, reply(1000000000000000042n, post)];

  const answer = await instance.sendThrough(racing, "POST", "/api/items", {
    url: addressOf(post),
    content: JSON.stringify(thread(pasted, { id: post })),
  });

  return {
    answer,
    pastedReplies: pasted.length,
    storedInBetween,
    storedAfter: commentCount(instance, itemId),
  };
}
