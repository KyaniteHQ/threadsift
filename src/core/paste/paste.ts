import type { Budgeted } from "../access/agent-token-budget.ts";
import type { Caller } from "../access/caller.ts";
import type { Digest } from "../contract/digest-schema.ts";
import type { SuppliedPage } from "../contract/supplied-page.ts";
import type { ThreadAnswers } from "../contract/thread-answers.ts";
import { admitted } from "../item/admission.ts";
import type { Ports } from "../kernel/ports.ts";
import type { Closed } from "../kernel/restore-hold.ts";
import { type PageSaveResult, savePage } from "./page-save.ts";
import { type SaveResult, saveItem } from "./save-link.ts";
import { FILL_NEEDS_CONTENT, type ThreadPasteResult, saveThread } from "./thread-paste.ts";

interface Supplied {
  readonly digest?: Digest | undefined;
  readonly content?: ThreadAnswers | undefined;
  readonly page?: SuppliedPage | undefined;
  readonly fill?: true | undefined;
}

type Pasted = ThreadPasteResult | PageSaveResult | SaveResult;

type OwnerCaller = Extract<Caller, { readonly kind: "owner" }>;

const ONE_OF_TWO = "a link takes content or a page, not both";

function savedBy(
  ports: Ports,
  absoluteUrl: string,
  caller: Caller,
  { digest, content, page, fill }: Readonly<Supplied>,
): Promise<Pasted> {
  if (fill === true && content === undefined) {
    return Promise.resolve(FILL_NEEDS_CONTENT);
  }

  if (page !== undefined) {
    return content === undefined
      ? savePage(ports, absoluteUrl, digest, page, caller)
      : Promise.resolve({ kind: "invalid", field: "page", reason: ONE_OF_TWO });
  }

  if (content === undefined) return saveItem(ports, absoluteUrl, digest, "refresh", caller);

  return saveThread(ports, absoluteUrl, {
    digest,
    answers: content,
    fillOnly: fill === true,
    caller,
  });
}

export function pasteLink(
  ports: Ports,
  absoluteUrl: string,
  caller: Readonly<OwnerCaller>,
  digest?: Digest,
): Promise<SaveResult | Closed>;
export function pasteLink(
  ports: Ports,
  absoluteUrl: string,
  caller: Readonly<Caller>,
  digest?: Digest,
): Promise<Budgeted<SaveResult> | Closed>;
export function pasteLink(
  ports: Ports,
  absoluteUrl: string,
  caller: Readonly<Caller>,
  digest?: Digest,
): Promise<Budgeted<SaveResult> | Closed> {
  return admitted(ports, caller, [absoluteUrl], () =>
    saveItem(ports, absoluteUrl, digest, "refresh", caller),
  );
}

export function paste(
  ports: Ports,
  absoluteUrl: string,
  caller: Caller,
  supplied: Readonly<Supplied>,
): Promise<Budgeted<Pasted> | Closed> {
  return admitted(ports, caller, [absoluteUrl], () =>
    savedBy(ports, absoluteUrl, caller, supplied),
  );
}
