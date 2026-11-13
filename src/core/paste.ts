import { type Budgeted, unlessSpent } from "./agent-token-budget.ts";
import { type Digest } from "./ai-contract.ts";
import type { Caller } from "./caller.ts";
import { dataStepsFinished } from "./data-steps.ts";
import { type PageSaveResult, savePage } from "./page-save.ts";
import type { Ports } from "./ports.ts";
import { saveItem } from "./save-link.ts";
import type { SuppliedPage } from "./supplied-page.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { FILL_NEEDS_CONTENT, type ThreadPasteResult, saveThread } from "./thread-paste.ts";

export interface Supplied {
  readonly digest?: Digest | undefined;
  readonly content?: ThreadAnswers | undefined;
  readonly page?: SuppliedPage | undefined;
  readonly fill?: true | undefined;
}

type Pasted = ThreadPasteResult | PageSaveResult | { readonly kind: "updating" };

type PasteResult = Budgeted<Pasted>;

const ONE_OF_TWO = "a link takes content or a page, not both";

async function pasted(
  ports: Ports,
  absoluteUrl: string,
  caller: Caller,
  { digest, content, page, fill }: Readonly<Supplied>,
): Promise<Pasted> {
  if (!(await dataStepsFinished(ports.db))) return { kind: "updating" };

  if (fill === true && content === undefined) {
    return FILL_NEEDS_CONTENT;
  }

  if (page !== undefined) {
    return content === undefined
      ? savePage(ports, absoluteUrl, digest, page, caller)
      : { kind: "invalid", field: "page", reason: ONE_OF_TWO };
  }

  if (content === undefined) return saveItem(ports, absoluteUrl, digest, "refresh", caller);

  return saveThread(ports, absoluteUrl, {
    digest,
    answers: content,
    fillOnly: fill === true,
    caller,
  });
}

export function paste(
  ports: Ports,
  absoluteUrl: string,
  caller: Caller,
  supplied: Readonly<Supplied>,
): Promise<PasteResult> {
  return unlessSpent(() => pasted(ports, absoluteUrl, caller, supplied));
}
