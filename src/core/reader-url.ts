import { keyOfFileRoute } from "./file-keys.ts";

const READABLE_URL = /^(?:https?:|mailto:|#)/iu;

export function readerUrl(url: string): string {
  return READABLE_URL.test(url) || keyOfFileRoute(url) !== null ? url : "";
}

const STORED_PICTURE_TEXT = "\uFFFC";

export function pictureText(alt: string, src: string): string {
  if (alt !== "") return alt;

  return keyOfFileRoute(src) === null ? readerUrl(src) : STORED_PICTURE_TEXT;
}

export const FOOTNOTE_LABEL_ID = "footnote-label";
