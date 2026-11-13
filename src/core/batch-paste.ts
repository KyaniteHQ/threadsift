import type { Digest } from "./ai-contract.ts";
import { dataStepsFinished } from "./data-steps.ts";
import type { ListedItemRow } from "./item-selection.ts";
import type { Ports } from "./ports.ts";
import { saveItem } from "./save-link.ts";

interface BatchLink {
  readonly url: string;
  readonly digest?: Digest | undefined;
}

export type BatchEntry =
  | { readonly outcome: "added" | "known"; readonly item: ListedItemRow }
  | { readonly outcome: "refused"; readonly url: string };

type BatchPaste =
  | { readonly kind: "done"; readonly entries: readonly BatchEntry[] }
  | { readonly kind: "updating" };

async function pasteOne(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
): Promise<BatchEntry | null> {
  if (!(await dataStepsFinished(ports.db))) return null;

  const saved = await saveItem(ports, url, digest, "keep");

  return saved.kind === "refused"
    ? { outcome: "refused", url }
    : { outcome: saved.created ? "added" : "known", item: saved.item };
}

export async function pasteBatch(ports: Ports, links: readonly BatchLink[]): Promise<BatchPaste> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await pasteOne(ports, link);

    if (entry === null) return { kind: "updating" };

    entries.push(entry);
  }

  return { kind: "done", entries };
}
