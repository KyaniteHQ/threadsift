import { type Digest } from "./ai-contract.ts";
import { dataStepsFinished } from "./data-steps.ts";
import { utf8Length } from "./digest-prompt.ts";
import { type PageSaveResult, savePage } from "./page-save.ts";
import type { Ports } from "./ports.ts";
import { saveItem } from "./save-link.ts";
import type { SuppliedPage } from "./supplied-page.ts";
import { THREAD_CONTENT_BYTES, type ThreadAnswers } from "./thread-answers.ts";
import { type ThreadPasteResult, saveThread } from "./thread-paste.ts";

export interface Supplied {
  readonly digest?: Digest | undefined;
  readonly content?: ThreadAnswers | undefined;
  readonly page?: SuppliedPage | undefined;
}

export type PasteResult =
  | ThreadPasteResult
  | PageSaveResult
  | { readonly kind: "too-large"; readonly field: "content" }
  | { readonly kind: "updating" };

const ONE_OF_TWO = "a link takes content or a page, not both";

export async function paste(
  ports: Ports,
  absoluteUrl: string,
  { digest, content, page }: Readonly<Supplied> = {},
): Promise<PasteResult> {
  if (!(await dataStepsFinished(ports.db))) return { kind: "updating" };

  if (page !== undefined) {
    return content === undefined
      ? savePage(ports, absoluteUrl, digest, page)
      : { kind: "invalid", field: "page", reason: ONE_OF_TWO };
  }

  if (content === undefined) return saveItem(ports, absoluteUrl, digest);

  if (content.some((answer) => utf8Length(answer) > THREAD_CONTENT_BYTES)) {
    return { kind: "too-large", field: "content" };
  }

  return saveThread(ports, absoluteUrl, { digest, answers: content });
}
