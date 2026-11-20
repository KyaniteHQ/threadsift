import { z } from "zod";

import {
  type DigestOutcome,
  FAILURE_REASONS,
  type FailureReason,
  type ItemStatus,
  type XReadNote,
  XFetchRetryNoteSchema,
  isXFetchRetryNote,
} from "./kinds.ts";

export function withShownStatus<Fields extends Readonly<Record<string, z.ZodType>>>(
  base: z.ZodObject<Fields>,
) {
  return z.union([
    base.extend({
      status: z.literal("failed"),
      reason: z.enum(FAILURE_REASONS),
      retry: z.literal("paste"),
    }),
    base.extend({ status: z.literal("processing"), reason: z.null(), retry: z.null() }),
    base.extend({
      status: z.literal("ready"),
      reason: z.null(),
      retry: z.enum(["digest", "paste"]),
      digestOutcome: z.literal("failed"),
    }),
    base.extend({
      status: z.literal("ready"),
      reason: z.null(),
      retry: z.literal("paste"),
      xNote: XFetchRetryNoteSchema,
      digestOutcome: z.literal("none"),
    }),
    base.extend({
      status: z.literal("ready"),
      reason: z.null(),
      retry: z.null(),
      digestOutcome: z.literal("none"),
    }),
  ]);
}

type DigestOutcomeField = {
  readonly digestOutcome: z.ZodEnum<{ readonly [Outcome in DigestOutcome]: Outcome }>;
};

export type ShownStatus = z.infer<ReturnType<typeof withShownStatus<DigestOutcomeField>>>;

export interface ShownStatusInput {
  readonly status: ItemStatus;
  readonly reason: FailureReason | null;
  readonly digestOutcome: DigestOutcome;
  readonly xNote: XReadNote | null;
  readonly digestSource: boolean;
}

export function shownStatus({
  status,
  reason,
  digestOutcome,
  digestSource,
  xNote,
}: Readonly<ShownStatusInput>): ShownStatus {
  if (status === "failed") {
    if (reason === null) throw new Error("A failed status comes with its reason");

    return { status, reason, digestOutcome, retry: "paste" };
  }

  if (status === "processing") return { status, reason: null, digestOutcome, retry: null };

  if (digestOutcome !== "failed") {
    if (!digestSource && isXFetchRetryNote(xNote))
      return { status, reason: null, retry: "paste", xNote, digestOutcome: "none" };
    return { status, reason: null, retry: null, digestOutcome: "none" };
  }

  return { status, reason: null, digestOutcome, retry: digestSource ? "digest" : "paste" };
}
