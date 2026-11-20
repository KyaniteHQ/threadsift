import type { Budgeted } from "../access/agent-token-budget.ts";
import type { Caller } from "../access/caller.ts";
import type { Digest } from "../contract/digest-schema.ts";
import type { ImportCursor, ImportWrite } from "../contract/import-contract.ts";
import { admitted } from "../item/admission.ts";
import type { ListedItemRow } from "../item/item-selection.ts";
import type { Ports } from "../kernel/ports.ts";
import { type Closed, whileOpen } from "../kernel/restore-hold.ts";
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

async function pasteOne(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
  caller: Caller,
): Promise<BatchEntry | Closed> {
  const saved = await whileOpen(ports.db, () => saveItem(ports, url, digest, "keep", caller));

  if (saved.kind === "restoring") return saved;

  return saved.kind === "refused"
    ? { outcome: "refused", url }
    : { outcome: saved.created ? "added" : "known", item: saved.item };
}

async function pasteEach(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
): Promise<Entries | Closed> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await pasteOne(ports, link, caller);

    if ("kind" in entry) return entry;

    entries.push(entry);
  }

  return { kind: "done", entries };
}

export async function pasteLinksThenSaveCursor(
  ports: Ports,
  links: readonly BatchLink[],
  caller: Caller,
  cursor: Readonly<ImportWrite> | undefined,
): Promise<Budgeted<BatchDone | Closed> | Closed> {
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
