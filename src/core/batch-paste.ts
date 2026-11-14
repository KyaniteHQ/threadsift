import { type Budgeted, type CountedSaves, withinBudget } from "./agent-token-budget.ts";
import type { Digest } from "./ai-contract.ts";
import type { Caller } from "./caller.ts";
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

type BatchSaved =
  | { readonly kind: "done"; readonly entries: readonly BatchEntry[] }
  | { readonly kind: "updating" };

type BatchPaste = Budgeted<BatchSaved>;

async function pasteOne(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
  counted: CountedSaves,
): Promise<BatchEntry | null> {
  if (!(await dataStepsFinished(ports.db))) return null;

  const saved = await counted.save((caller) => saveItem(ports, url, digest, "keep", caller));

  return saved.kind === "refused"
    ? { outcome: "refused", url }
    : { outcome: saved.created ? "added" : "known", item: saved.item };
}

async function pasteEach(
  ports: Ports,
  links: readonly BatchLink[],
  counted: CountedSaves,
): Promise<BatchSaved> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await pasteOne(ports, link, counted);

    if (entry === null) return { kind: "updating" };

    entries.push(entry);
  }

  return { kind: "done", entries };
}

export function pasteBatch(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
): Promise<BatchPaste> {
  return withinBudget(
    ports,
    caller,
    links.map(({ url }) => url),
    (counted) => pasteEach(ports, links, counted),
  );
}
