import { guardHolds } from "../../../core/kernel/guards.ts";
import { holding } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { holdsNoThread } from "../../thread/core/thread-store.ts";
import type { HeldAccount } from "./reddit-account-fetch.ts";
import { type TurnRun, resumeAt, takeTurn } from "./reddit-account-queue.ts";
import { accountRow } from "./reddit-account-states.ts";
import { openedSession } from "./reddit-account.ts";

export type AccountTurn =
  | { readonly kind: "unused" }
  | { readonly kind: "waiting"; readonly until: number }
  | { readonly kind: "held"; readonly held: HeldAccount };

export async function accountTurn(
  ports: Readonly<Pick<Ports, "db" | "secrets">>,
  run: Readonly<TurnRun & { itemId: number }>,
): Promise<AccountTurn> {
  const { db, secrets } = ports;
  const row = await accountRow(db);
  const { itemId } = run;

  if (row?.state !== "connected" || secrets === null) return { kind: "unused" };

  if ((await openedSession(secrets, row)) === null) return { kind: "unused" };

  if (!(await holdsNoThread(db, itemId))) return { kind: "unused" };

  const now = Date.now();
  const claim = { id: run.id, attempts: run.attempts, attemptGeneration: run.attemptGeneration };
  const taken = await takeTurn(db, claim, now);

  if (taken === null) {
    if (!(await guardHolds(db, holding(claim)))) return { kind: "unused" };

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
          run: claim,
          session,
          sealedSession: taken.sealedSession,
          lastRequestAt: taken.lastRequestAt,
        },
      };
}
