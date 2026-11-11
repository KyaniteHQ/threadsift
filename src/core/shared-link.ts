const LINK = /https?:\/\/\S+/iu;

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/u;

export interface SharedFields {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

export type SharedContent =
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "empty" };

export function linkIn(field: string): string | undefined {
  const match = LINK.exec(field);

  return match === null ? undefined : match[0].replace(TRAILING_PUNCTUATION, "");
}

export function sharedContentOf({ title, text, url }: Readonly<SharedFields>): SharedContent {
  const link = [url, text, title]
    .map((field) => linkIn(field))
    .find((found) => found !== undefined);

  if (link !== undefined) {
    return { kind: "link", url: link };
  }

  const words = [text, url, title].map((field) => field.trim()).find((field) => field !== "");

  return words === undefined ? { kind: "empty" } : { kind: "text", text: words };
}
