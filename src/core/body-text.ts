const HTML_TYPES: ReadonlySet<string> = new Set(["text/html", "application/xhtml+xml"]);
const CHARSET = /;\s*charset\s*=\s*"?(?<label>[^";\s]+)/iu;

export function mediaTypeOf(contentType: string | null): string {
  const [mediaType = ""] = (contentType ?? "").split(";");

  return mediaType.trim().toLowerCase();
}

export function isHtmlType(contentType: string | null): boolean {
  return HTML_TYPES.has(mediaTypeOf(contentType));
}

export function decoderFor(contentType: string | null): TextDecoder {
  const label = CHARSET.exec(contentType ?? "")?.groups?.["label"] ?? "utf-8";

  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("utf-8");
  }
}
