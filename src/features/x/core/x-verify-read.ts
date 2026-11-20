import { eq } from "drizzle-orm";

import { type Judged, StoredJudgedSchema } from "../../../core/contract/x-verdict.ts";
import { type XThreadValue, StoredXThreadSchema } from "../../../core/contract/x-wire.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { xVerifications } from "../../../core/kernel/schema.ts";

export interface Verification {
  readonly revision: number;
  readonly thread: XThreadValue;
  readonly cliAttempts: number | null;
  readonly digest: string | null;
  readonly judged: Judged;
}

type StoredVerification =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly revision: number }
  | { readonly kind: "readable"; readonly verification: Verification };

export async function verificationOf(db: Database, itemId: number): Promise<StoredVerification> {
  const [row] = await db.select().from(xVerifications).where(eq(xVerifications.itemId, itemId));

  if (row === undefined) return { kind: "missing" };

  const judged = StoredJudgedSchema.safeParse(row.judged);
  const thread = parsedJson(StoredXThreadSchema, row.thread);

  return judged.success && thread !== null
    ? {
        kind: "readable",
        verification: {
          revision: row.revision,
          cliAttempts: row.cliAttempts,
          digest: row.digest,
          thread,
          judged: judged.data,
        },
      }
    : { kind: "unreadable", revision: row.revision };
}
