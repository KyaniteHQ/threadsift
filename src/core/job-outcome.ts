import type { BatchItem } from "drizzle-orm/batch";

export type JobOutcome =
  | { readonly kind: "requeue" }
  | {
      readonly kind: "finish";
      readonly writes: readonly BatchItem<"sqlite">[];
      readonly revision?: Readonly<{ generation: number; taskId: number }>;
    };
