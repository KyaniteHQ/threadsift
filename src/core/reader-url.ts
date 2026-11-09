import { keyOfFileRoute } from "./file-keys.ts";

const READABLE_URL = /^(?:https?:|mailto:|#)/iu;

export function readerUrl(url: string): string {
  return READABLE_URL.test(url) || keyOfFileRoute(url) !== null ? url : "";
}

export const FOOTNOTE_LABEL_ID = "footnote-label";
