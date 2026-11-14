import { guardHolds } from "./guards.ts";
import type { Ports } from "./ports.ts";
import type { HeldAccount } from "./reddit-account-fetch.ts";
import { resumeAt, takeTurn } from "./reddit-account-queue.ts";
import { accountRow } from "./reddit-account-states.ts";
import { openedSession } from "./reddit-account.ts";
import { noThreadFor } from "./reddit-thread.ts";

export type AccountTurn =
  | { readonly kind: "unused" }
  | { readonly kind: "waiting"; readonly until: number }
  | { readonly kind: "held"; readonly held: HeldAccount };

export async function accountTurn(
  ports: Readonly<Pick<Ports, "db" | "secrets">>,
  { id, itemId }: Readonly<{ id: number; itemId: number }>,
): Promise<AccountTurn> {
  const { db, secrets } = ports;
  const row = await accountRow(db);

  if (row?.state !== "connected" || secrets === null) return { kind: "unused" };

  if ((await openedSession(secrets, row)) === null) return { kind: "unused" };

  if (!(await guardHolds(db, noThreadFor(itemId)))) return { kind: "unused" };

  const now = Date.now();
  const taken = await takeTurn(db, id, now);

  if (taken === null) {
    const current = await accountRow(db);

    return current?.state === "connected"
      ? { kind: "waiting", until: resumeAt(current, now) }
      : { kind: "unused" };
  }

  const session = await openedSession(secrets, taken);

  return session === null
    ? { kind: "unused" }
    : {
        kind: "held",
        held: {
          jobId: id,
          session,
          sealedSession: taken.sealedSession,
          lastRequestAt: taken.lastRequestAt,
        },
      };
}
