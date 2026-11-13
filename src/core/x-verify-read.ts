import { eq } from "drizzle-orm";
import { z } from "zod";

import { parsedJson } from "./parsed-json.ts";
import type { Database } from "./ports.ts";
import { xVerifications } from "./schema.ts";
import type { Judgement } from "./x-oembed.ts";
import type { Judged } from "./x-verify-state.ts";
import { type XThreadValue, StoredXThreadSchema } from "./x-wire.ts";

export interface Verification {
  readonly revision: number;
  readonly thread: XThreadValue;
  readonly digest: string | null;
  readonly judged: Judged;
}

export type StoredVerification =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly revision: number }
  | { readonly kind: "readable"; readonly verification: Verification };

const StoredJudgedSchema = z.record(
  z.string(),
  z.enum(["verified", "tail-unverified", "rejected"] satisfies readonly Judgement[]),
);

export async function verificationOf(db: Database, itemId: number): Promise<StoredVerification> {
  const [row] = await db.select().from(xVerifications).where(eq(xVerifications.itemId, itemId));

  if (row === undefined) return { kind: "missing" };

  const judged = StoredJudgedSchema.safeParse(row.judged);
  const thread = parsedJson(StoredXThreadSchema, row.thread);

  return judged.success && thread !== null
    ? {
        kind: "readable",
        verification: { revision: row.revision, digest: row.digest, thread, judged: judged.data },
      }
    : { kind: "unreadable", revision: row.revision };
}
