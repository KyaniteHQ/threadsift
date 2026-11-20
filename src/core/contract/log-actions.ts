import { z } from "zod";

import { VAULT_TEXT } from "./vault-text.ts";

export const LOG_ACTIONS = [
  "ingest",
  "digest",
  "topic",
  "overview",
  "related",
  "merge",
  "merge-topic",
  "vault-file-skipped",
  "vault-file-conflict",
] as const;

export type LogAction = (typeof LOG_ACTIONS)[number];

const STAMPED = { id: z.number().int(), at: z.number().int() };

const ITEM = z.object({ id: z.number().int(), title: z.string() }).readonly();

const TOPIC = z.object({ key: z.string(), name: z.string() }).readonly();

const DIGESTED = { item: ITEM, topic: TOPIC, tags: z.array(z.string()).readonly() };

const MERGED = { from: z.string(), into: z.string(), items: z.number().int().min(0) };

function entry<const Action extends LogAction, Fields extends Readonly<Record<string, z.ZodType>>>(
  action: Action,
  fields: Fields,
) {
  return {
    schema: z.object({ ...STAMPED, action: z.literal(action), ...fields }).readonly(),
    word: action,
  };
}

const VAULT_FILE = z
  .object({
    ...STAMPED,
    action: z.enum(["vault-file-skipped", "vault-file-conflict"]),
    path: z.string().min(1),
  })
  .readonly();

const RECORDS = {
  ingest: entry("ingest", DIGESTED),
  digest: entry("digest", DIGESTED),
  topic: entry("topic", { topic: TOPIC }),
  overview: entry("overview", {
    topic: TOPIC,
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
  }),
  related: entry("related", { item: ITEM, picks: z.number().int().min(1) }),
  merge: entry("merge", MERGED),
  "merge-topic": entry("merge-topic", MERGED),
  "vault-file-skipped": { schema: VAULT_FILE, word: VAULT_TEXT.skipped },
  "vault-file-conflict": { schema: VAULT_FILE, word: VAULT_TEXT.conflict },
} as const;

type Tied<
  Records extends {
    readonly [Action in LogAction]: {
      readonly schema: z.ZodType<{ readonly action: LogAction }>;
    };
  },
> = {
  readonly [Action in LogAction]: Action extends z.infer<Records[Action]["schema"]>["action"]
    ? Records[Action]
    : never;
};

export const LOG: Tied<typeof RECORDS> = RECORDS;

export type FieldOf<Entry> = Entry extends unknown ? keyof Entry : never;
