import { ITEM_REQUEST_BYTES } from "../../src/core/limits.ts";
import type { ThreadAnswers } from "../../src/core/thread-answers.ts";

export interface ThreadBody {
  readonly url: string;
  readonly content: ThreadAnswers;
  readonly fill?: true;
}

function byteLength(text: string): number {
  return new Blob([text]).size;
}

function bodyOf(url: string, content: ThreadAnswers, fill: boolean): ThreadBody {
  return fill ? { url, content, fill: true } : { url, content };
}

export function fitThreadBody(
  url: string,
  answers: ThreadAnswers,
  fill: boolean,
): ThreadBody | null {
  const [first, ...later] = answers;
  let size = byteLength(JSON.stringify(bodyOf(url, answers, fill)));

  while (size > ITEM_REQUEST_BYTES) {
    const dropped = later.pop();

    if (dropped === undefined) return null;

    size -= byteLength(JSON.stringify(dropped)) + 1;
  }

  return bodyOf(url, [first, ...later], fill);
}
