import type { BudgetSpent } from "../../../core/contract/agent-token-contract.ts";
import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { ImportCursor, ImportWrite } from "../../../core/contract/import-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { type Budgeted, budgetAnswered } from "../../access/core/agent-token-budget.ts";
import type { Caller } from "../../access/core/caller.ts";
import { admitted } from "../../item/core/admission.ts";
import type { ListedItemRow } from "../../item/core/item-selection.ts";
import { saveImport } from "./import-cursor.ts";
import { saveItem } from "./save-link.ts";

interface BatchLink {
  readonly url: string;
  readonly digest?: Digest | undefined;
}

export type BatchEntry =
  | { readonly outcome: "added" | "known"; readonly item: ListedItemRow }
  | { readonly outcome: "refused"; readonly url: string };

interface Entries {
  readonly kind: "done";
  readonly entries: readonly BatchEntry[];
}

interface BatchDone extends Entries {
  readonly import: ImportCursor | null;
}

export interface CutShort extends BudgetSpent {
  readonly entries: readonly BatchEntry[];
}

function savedEntry(
  ports: Ports,
  link: Readonly<BatchLink>,
  caller: Caller,
): Promise<Budgeted<BatchEntry | Closed>> {
  return caller.kind === "owner"
    ? pasteOne(ports, link, caller)
    : budgetAnswered(ports.db, caller.id, () => pasteOne(ports, link, caller));
}

async function pasteOne(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
  caller: Caller,
): Promise<BatchEntry | Closed> {
  const saved = await whileOpen(() => saveItem(ports, url, digest, "keep", caller));

  if (saved.kind === "restoring") return saved;

  return saved.kind === "refused"
    ? { outcome: "refused", url }
    : { outcome: saved.created ? "added" : "known", item: saved.item };
}

async function pasteEach(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
): Promise<Budgeted<Entries | Closed | CutShort>> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await savedEntry(ports, link, caller);

    if (!("kind" in entry)) entries.push(entry);
    else if (entry.kind === "budget-spent") return { ...entry, entries };
    else return entry;
  }

  return { kind: "done", entries };
}

export async function pasteLinksThenSaveCursor(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
  cursor: Readonly<ImportWrite> | undefined,
): Promise<Budgeted<BatchDone | Closed | CutShort> | Closed> {
  const pasted = await admitted(
    ports,
    caller,
    links.map(({ url }) => url),
    () => pasteEach(ports, links, caller),
  );

  if (pasted.kind !== "done") return pasted;

  const saved = cursor === undefined ? null : await saveImport(ports.db, cursor);

  if (saved !== null && "kind" in saved) return saved;

  return { ...pasted, import: saved };
}
