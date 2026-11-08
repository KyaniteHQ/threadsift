const READABLE_URL = /^(?:https?:|mailto:|#)/iu;

export function readerUrl(url: string): string {
  return READABLE_URL.test(url) ? url : "";
}

export const FOOTNOTE_LABEL_ID = "footnote-label";
