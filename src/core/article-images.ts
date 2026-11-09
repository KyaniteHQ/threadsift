import { type EmbedLink, embedLinkOf } from "./embed-links.ts";
import { digestOf } from "./encoding.ts";
import { fileRouteOf } from "./file-keys.ts";
import { type Fetched, decoded, downloaded, fits } from "./image-download.ts";
import { IMAGE_EXTENSIONS } from "./image-type.ts";
import type { MediaFailure } from "./kinds.ts";
import {
  type Edit,
  type MarkdownImage,
  altText,
  inlineImage,
  rewriteImages,
} from "./markdown-images.ts";
import type { Crypto, FileStore, Network } from "./ports.ts";

export const MAX_IMAGES = 20;
export const MAX_VIDEOS = 20;
export const IMAGE_WIDTH = 2;

export interface MediaRowValue {
  readonly kind: "image" | "video";
  readonly sourceUrl: string;
  readonly finalUrl: string | null;
  readonly position: number;
  readonly outcome: "stored" | "failed" | "linked";
  readonly reason: MediaFailure | null;
  readonly fileKey: string | null;
  readonly contentType: string | null;
  readonly size: number | null;
}

export interface MediaPlan {
  readonly postText: string;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

export interface ArticleMedia {
  readonly postText: string;
  readonly videos: readonly string[];
  readonly images: readonly MarkdownImage[];
  readonly url: string;
}

export interface ImageSink {
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
  | { readonly kind: "source"; readonly source: Source };

interface Candidate {
  readonly source: Source;
  readonly position: number;
}

interface Outcome {
  readonly row: MediaRowValue | null;
  readonly key: string | null;
}

function remoteOf(address: string, base: string): Classified {
  const url = URL.parse(address, base);

  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { kind: "alt" };
  }

  url.hash = "";
  url.username = "";
  url.password = "";

  return fits(url.href)
    ? { kind: "source", source: { id: url.href, kind: "remote", url: url.href } }
    : { kind: "leave" };
}

function classify(
  crypto: Crypto,
  { destination }: Readonly<MarkdownImage>,
  base: string,
): Classified {
  const address = destination.trim();

  if (address === "" || address.startsWith("#")) return { kind: "alt" };

  if (/^data:/iu.test(address)) {
    return {
      kind: "source",
      source: {
        id: `inline:sha256:${digestOf(crypto, address)}`,
        kind: "inline",
        dataUrl: address,
      },
    };
  }

  const embed = embedLinkOf(URL.parse(address, base)?.href ?? "");

  return embed === null ? remoteOf(address, base) : { kind: "embed", link: embed };
}

function rowOf(
  { source, position }: Readonly<Candidate>,
  fetched: Readonly<Fetched>,
  key: string | null,
): MediaRowValue | null {
  if (source.kind === "inline" && !fetched.ok) return null;

  const sourceUrl = source.kind === "remote" ? source.url : source.id;

  return fetched.ok
    ? {
        kind: "image",
        sourceUrl,
        finalUrl: fetched.finalUrl,
        position,
        outcome: "stored",
        reason: null,
        fileKey: key,
        contentType: fetched.type,
        size: fetched.bytes.length,
      }
    : {
        kind: "image",
        sourceUrl,
        finalUrl: null,
        position,
        outcome: "failed",
        reason: fetched.reason,
        fileKey: null,
        contentType: null,
        size: null,
      };
}

async function stored(
  sink: Readonly<ImageSink>,
  prefix: string,
  candidate: Readonly<Candidate>,
  deadline: AbortSignal,
): Promise<Outcome> {
  const { source } = candidate;

  const fetched =
    source.kind === "remote"
      ? await downloaded(sink.network, source.url, deadline)
      : decoded(source.dataUrl);

  const key = fetched.ok
    ? `${prefix}${candidate.position}.${IMAGE_EXTENSIONS[fetched.type]}`
    : null;

  if (fetched.ok && key !== null) await sink.files.put(key, fetched.bytes);

  return { row: rowOf(candidate, fetched, key), key };
}

async function storeAll(
  candidates: readonly Candidate[],
  store: (candidate: Readonly<Candidate>) => Promise<Outcome>,
): Promise<ReadonlyMap<string, Outcome>> {
  const outcomes = new Map<string, Outcome>();
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
      candidates.push({ source: entry.source, position: candidates.length });
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

function videoRows(urls: readonly string[]): readonly MediaRowValue[] {
  return [...new Set(urls)]
    .filter((url) => fits(url))
    .slice(0, MAX_VIDEOS)
    .map((sourceUrl, position) => ({
      kind: "video",
      sourceUrl,
      finalUrl: null,
      position,
      outcome: "linked",
      reason: null,
      fileKey: null,
      contentType: null,
      size: null,
    }));
}

export async function prepareMedia(
  sink: Readonly<ImageSink>,
  prefix: string,
  article: Readonly<ArticleMedia>,
  deadline: AbortSignal,
): Promise<MediaPlan> {
  const { images } = article;
  const classified = images.map((image) => classify(sink.crypto, image, article.url));

  const outcomes = await storeAll(candidatesOf(classified), (candidate) =>
    stored(sink, prefix, candidate, deadline),
  );

  const pathOf = (id: string): string | null => {
    const key = outcomes.get(id)?.key ?? null;

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

  const results = [...outcomes.values()];

  return {
    postText: rewriteImages(article.postText, edits),
    rows: [
      ...results.flatMap(({ row }) => (row === null ? [] : [row])),
      ...videoRows([...article.videos, ...embedded]),
    ],
    written: results.flatMap(({ key }) => (key === null ? [] : [key])),
  };
}
