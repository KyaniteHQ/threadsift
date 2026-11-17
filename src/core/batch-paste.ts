import { type Budgeted, type SaveAs, withinBudget } from "./agent-token-budget.ts";
import type { Digest } from "./ai-contract.ts";
import type { Caller } from "./caller.ts";
import type { ListedItemRow } from "./item-selection.ts";
import { type Closed, whileOpen } from "./library-gate.ts";
import type { Ports } from "./ports.ts";
import { restoreHoldsLibrary } from "./restore-state.ts";
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
  | { readonly kind: "restoring" };

type BatchPaste = Budgeted<BatchSaved>;

async function pasteOne(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
  saveAs: SaveAs,
): Promise<BatchEntry | Closed> {
  const saved = await whileOpen(ports.db, () =>
    saveAs((caller) => saveItem(ports, url, digest, "keep", caller)),
  );

  if (saved.kind === "restoring") return saved;

  return saved.kind === "refused"
    ? { outcome: "refused", url }
    : { outcome: saved.created ? "added" : "known", item: saved.item };
}

async function pasteEach(
  ports: Ports,
  links: readonly BatchLink[],
  saveAs: SaveAs,
): Promise<BatchSaved> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await pasteOne(ports, link, saveAs);

    if ("kind" in entry) return entry;

    entries.push(entry);
  }

  return { kind: "done", entries };
}

export async function pasteBatch(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
): Promise<BatchPaste> {
  if (await restoreHoldsLibrary(ports.db)) return { kind: "restoring" };

  return withinBudget(
    ports,
    caller,
    links.map(({ url }) => url),
    (saveAs) => pasteEach(ports, links, saveAs),
  );
}
