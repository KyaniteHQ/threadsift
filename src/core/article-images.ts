import { type EmbedLink, embedLinkOf } from "./embed-links.ts";
import { digestOf } from "./encoding.ts";
import { fileRouteOf } from "./file-keys.ts";
import { type Fetched, decoded, downloaded, fits } from "./image-download.ts";
import { imageSize } from "./image-size.ts";
import { IMAGE_EXTENSIONS } from "./image-type.ts";
import {
  type Edit,
  type MarkdownImage,
  altText,
  inlineImage,
  rewriteImages,
} from "./markdown-images.ts";
import type { Crypto, FileStore, Network } from "./ports.ts";
import type { MediaRow } from "./schema.ts";

const MAX_IMAGES = 20;
const MAX_VIDEOS = 20;
const IMAGE_WIDTH = 2;
const ALT_MAX = 300;

export type MediaRowValue = Readonly<Omit<MediaRow, "id" | "itemId">>;

const NO_DETAILS = {
  alt: "",
  width: null,
  height: null,
  finalUrl: null,
  reason: null,
  fileKey: null,
  contentType: null,
  size: null,
} as const;

interface MediaPlan {
  readonly postText: string;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

interface ArticleMedia {
  readonly postText: string;
  readonly videos: readonly string[];
  readonly images: readonly MarkdownImage[];
  readonly url: string;
}

interface ImageSink {
  readonly network: Network;
  readonly files: FileStore;
  readonly crypto: Crypto;
}

type Source =
  | { readonly id: string; readonly kind: "remote"; readonly url: string }
  | { readonly id: string; readonly kind: "inline"; readonly dataUrl: string };

type Classified =
  | { readonly kind: "embed"; readonly link: EmbedLink }
  | { readonly kind: "alt" }
  | { readonly kind: "leave" }
  | { readonly kind: "source"; readonly source: Source; readonly alt: string };

interface Candidate {
  readonly source: Source;
  readonly position: number;
  readonly alt: string;
}

function plainAlt(alt: string): string {
  return Array.from(alt.replaceAll(/\s+/gu, " ").trim()).slice(0, ALT_MAX).join("");
}

function remoteOf(address: string, base: string, alt: string): Classified {
  const url = URL.parse(address, base);

  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { kind: "alt" };
  }

  url.hash = "";
  url.username = "";
  url.password = "";

  return fits(url.href)
    ? { kind: "source", source: { id: url.href, kind: "remote", url: url.href }, alt }
    : { kind: "leave" };
}

function classify({ destination, alt }: Readonly<MarkdownImage>, base: string): Classified {
  const address = destination.trim();

  if (address === "" || address.startsWith("#")) return { kind: "alt" };

  if (/^data:/iu.test(address)) {
    return {
      kind: "source",
      source: { id: address, kind: "inline", dataUrl: address },
      alt,
    };
  }

  const embed = embedLinkOf(URL.parse(address, base)?.href ?? "");

  return embed === null ? remoteOf(address, base, alt) : { kind: "embed", link: embed };
}

function rowOf(
  crypto: Crypto,
  { source, position, alt }: Readonly<Candidate>,
  fetched: Readonly<Fetched>,
  fileKey: string | null,
): MediaRowValue | null {
  if (source.kind === "inline" && !fetched.ok) return null;

  const sourceUrl =
    source.kind === "remote" ? source.url : `inline:sha256:${digestOf(crypto, source.dataUrl)}`;

  const size = fetched.ok ? imageSize(fetched.bytes, fetched.type) : null;

  return fetched.ok
    ? {
        ...NO_DETAILS,
        kind: "image",
        sourceUrl,
        alt: plainAlt(alt),
        width: size?.width ?? null,
        height: size?.height ?? null,
        finalUrl: fetched.finalUrl,
        position,
        outcome: "stored",
        fileKey,
        contentType: fetched.type,
        size: fetched.bytes.length,
      }
    : {
        ...NO_DETAILS,
        kind: "image",
        sourceUrl,
        position,
        outcome: "failed",
        reason: fetched.reason,
      };
}

async function stored(
  sink: Readonly<ImageSink>,
  prefix: string,
  candidate: Readonly<Candidate>,
  deadline: AbortSignal,
): Promise<MediaRowValue | null> {
  const { source } = candidate;

  const fetched =
    source.kind === "remote"
      ? await downloaded(sink.network, source.url, deadline)
      : decoded(source.dataUrl);

  const key = fetched.ok
    ? `${prefix}${candidate.position}.${IMAGE_EXTENSIONS[fetched.type]}`
    : null;

  if (fetched.ok && key !== null) await sink.files.put(key, fetched.bytes);

  return rowOf(sink.crypto, candidate, fetched, key);
}

async function storeAll(
  candidates: readonly Candidate[],
  store: (candidate: Readonly<Candidate>) => Promise<MediaRowValue | null>,
): Promise<ReadonlyMap<string, MediaRowValue | null>> {
  const outcomes = new Map<string, MediaRowValue | null>();
  let next = 0;

  async function work(): Promise<void> {
    const candidate = candidates[next];
    next += 1;

    if (candidate === undefined) return;

    outcomes.set(candidate.source.id, await store(candidate));
    await work();
  }

  await Promise.all(Array.from({ length: IMAGE_WIDTH }, () => work()));

  return outcomes;
}

function candidatesOf(classified: readonly Classified[]): readonly Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const entry of classified) {
    if (entry.kind === "source" && !seen.has(entry.source.id) && candidates.length < MAX_IMAGES) {
      seen.add(entry.source.id);
      candidates.push({ source: entry.source, position: candidates.length, alt: entry.alt });
    }
  }

  return candidates;
}

function embedMarkdown(image: Readonly<MarkdownImage>, { url }: Readonly<EmbedLink>): string {
  return `[${altText(image.alt === "" ? url : image.alt)}](<${url}>)`;
}

function replacementOf(
  image: Readonly<MarkdownImage>,
  entry: Readonly<Classified>,
  pathOf: (id: string) => string | null,
): string | undefined {
  if (entry.kind === "embed") return embedMarkdown(image, entry.link);

  if (entry.kind === "alt") return altText(image.alt);

  if (entry.kind === "leave") return undefined;

  const path = pathOf(entry.source.id);

  if (path !== null) return inlineImage(image, path);

  return entry.source.kind === "inline" ? altText(image.alt) : undefined;
}

function linkedRow(sourceUrl: string, position: number): MediaRowValue {
  return { ...NO_DETAILS, kind: "video", sourceUrl, position, outcome: "linked" };
}

function videoRows(urls: readonly string[]): readonly MediaRowValue[] {
  return [...new Set(urls)]
    .filter((url) => fits(url))
    .slice(0, MAX_VIDEOS)
    .map((sourceUrl, position) => linkedRow(sourceUrl, position));
}

export async function prepareMedia(
  sink: Readonly<ImageSink>,
  prefix: string,
  article: Readonly<ArticleMedia>,
  deadline: AbortSignal,
): Promise<MediaPlan> {
  const { images } = article;
  const classified = images.map((image) => classify(image, article.url));

  const outcomes = await storeAll(candidatesOf(classified), (candidate) =>
    stored(sink, prefix, candidate, deadline),
  );

  const pathOf = (id: string): string | null => {
    const key = outcomes.get(id)?.fileKey ?? null;

    return key === null ? null : fileRouteOf(key);
  };

  const edits: Edit[] = [];
  const embedded: string[] = [];

  images.forEach((image, at) => {
    const entry = classified[at];
    const text = entry === undefined ? undefined : replacementOf(image, entry, pathOf);

    if (text !== undefined) edits.push({ image, text });

    if (entry?.kind === "embed" && entry.link.video) embedded.push(entry.link.url);
  });

  const results = [...outcomes.values()].flatMap((row) => (row === null ? [] : [row]));

  return {
    postText: rewriteImages(article.postText, edits),
    rows: [...results, ...videoRows([...article.videos, ...embedded])],
    written: results.flatMap(({ fileKey }) => (fileKey === null ? [] : [fileKey])),
  };
}
