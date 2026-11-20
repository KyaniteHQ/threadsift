import { ITEM_IMAGES_MAX, fits } from "./image-rules.ts";

const IMAGE_HOST = "pbs.twimg.com";

const IMAGE_PATH_PREFIX = "/media/";

const IMAGE_SEPARATOR = "\n\n";

export const NO_TEXT = "(No text content)";

export function isXImageUrl(address: string): boolean {
  const url = URL.parse(address);

  return (
    url !== null &&
    url.href === address &&
    fits(address) &&
    url.protocol === "https:" &&
    url.host === IMAGE_HOST &&
    url.username === "" &&
    url.password === "" &&
    url.pathname.startsWith(IMAGE_PATH_PREFIX) &&
    url.pathname.length > IMAGE_PATH_PREFIX.length
  );
}

export function onlyXImages(addresses: readonly string[]): string[] {
  return [...new Set(addresses.filter((address) => isXImageUrl(address)))].slice(
    0,
    ITEM_IMAGES_MAX,
  );
}

export function isImageLine(line: string): boolean {
  return line.startsWith("![](<") && line.endsWith(">)") && isXImageUrl(line.slice(5, -2));
}

export function withImages(text: string, images: readonly string[]): string {
  return [
    ...(text.trim() === "" ? [] : [text]),
    ...images.map((address) => `![](<${address}>)`),
  ].join(IMAGE_SEPARATOR);
}

export function withoutPlaceholder<
  Post extends Readonly<{ text: string; images: readonly string[] }>,
>(post: Post): Post {
  return post.images.length > 0 && post.text.trim() === NO_TEXT ? { ...post, text: "" } : post;
}
