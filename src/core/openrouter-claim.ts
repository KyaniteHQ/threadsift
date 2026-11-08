import { and, eq, gt } from "drizzle-orm";

import { readRevision } from "./ai-settings.ts";
import { digestOf } from "./encoding.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { Ports } from "./ports.ts";
import { openrouterConnectTransactions as transactions } from "./schema.ts";
import { sessionIsLive } from "./sessions.ts";

export interface Attempt {
  readonly sessionId: string;
  readonly state: string;
}

export type Claimed = typeof transactions.$inferSelect;

export async function claim(
  ports: Ports,
  origin: string,
  { sessionId, state }: Readonly<Attempt>,
): Promise<Claimed | undefined> {
  const { crypto } = ports;

  const [claimed] = await ports.db
    .delete(transactions)
    .where(
      and(
        eq(transactions.stateDigest, digestOf(crypto, state)),
        eq(transactions.sessionDigest, digestOf(crypto, sessionId)),
        gt(transactions.expiresAt, Date.now()),
        eq(transactions.publicOrigin, origin),
        eq(transactions.expectedRevision, CURRENT_REVISION),
        sessionIsLive(crypto, sessionId),
      ),
    )
    .returning();

  return claimed;
}

export async function refusalBeforeExchange(
  ports: Ports,
  { sessionId, state }: Readonly<Attempt>,
): Promise<ConnectNotice> {
  const [[pending], [counter]] = await ports.db.batch([
    ports.db
      .select({ expectedRevision: transactions.expectedRevision })
      .from(transactions)
      .where(
        and(
          eq(transactions.stateDigest, digestOf(ports.crypto, state)),
          eq(transactions.sessionDigest, digestOf(ports.crypto, sessionId)),
        ),
      ),
    readRevision(ports.db),
  ]);

  return pending !== undefined && pending.expectedRevision !== counter?.revision
    ? "settings-changed"
    : "incomplete";
}
