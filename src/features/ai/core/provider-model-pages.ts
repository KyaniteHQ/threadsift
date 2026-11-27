import { z } from "zod";

import type { ModelOption } from "../../../core/contract/ai-settings-contract.ts";
import type { HttpProvider } from "../../../core/contract/provider-families.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_PAGE_SIZE = 1000;
const NOT_CHAT_PARTS: ReadonlySet<string> = new Set([
  "embedding",
  "tts",
  "whisper",
  "dall",
  "image",
  "moderation",
  "realtime",
  "audio",
  "transcribe",
]);

const Supported = z.object({ supported: z.boolean() });

const AnthropicEffortSchema = z.object({
  supported: z.boolean(),
  low: Supported.nullish(),
  medium: Supported.nullish(),
  high: Supported.nullish(),
  xhigh: Supported.nullish(),
  max: Supported.nullish(),
});

const ANTHROPIC_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly (keyof z.infer<typeof AnthropicEffortSchema>)[];

const AnthropicPageSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_name: z.string().optional(),
      lifecycle: z.string().optional(),
      capabilities: z
        .object({ structured_outputs: Supported, effort: AnthropicEffortSchema })
        .nullish(),
    }),
  ),
  has_more: z.boolean().optional(),
  last_id: z.string().nullish(),
});

const IdListSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

const XaiListSchema = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      capabilities: z.object({ reasoning_effort: z.array(z.string()) }).nullish(),
    }),
  ),
});

const OpenRouterListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      reasoning: z.object({ supported_efforts: z.array(z.string()).nullish() }).nullish(),
    }),
  ),
});

export interface Page {
  readonly models: readonly ModelOption[];
  readonly after: string | null;
}

interface Listing {
  readonly listsWithoutKey: boolean;
  readonly address: (base: string, after: string | null) => string;
  readonly headers: (key: string) => Readonly<Record<string, string>>;
  readonly read: (text: string) => Page | null;
}

function option(id: string, label?: string, efforts?: readonly string[] | null): ModelOption {
  const named = label === undefined || label === "" ? { id } : { id, label };

  return efforts === undefined || efforts === null
    ? named
    : { ...named, efforts: efforts.filter((effort) => effort !== "") };
}

function onePage(models: readonly ModelOption[]): Page {
  return { models, after: null };
}

function bearer(key: string) {
  return { authorization: `Bearer ${key}` };
}

type AnthropicEffort = z.infer<typeof AnthropicEffortSchema>;

function anthropicLevels(effort: AnthropicEffort | undefined): readonly string[] | undefined {
  if (effort?.supported !== true) return undefined;

  return ANTHROPIC_EFFORTS.filter((level) => effort[level]?.supported === true);
}

function anthropicPage(text: string): Page | null {
  const page = parsedJson(AnthropicPageSchema, text);

  if (page === null) return null;

  const models = page.data
    .filter(
      ({ lifecycle, capabilities }) =>
        (lifecycle ?? "active") === "active" &&
        (capabilities?.structured_outputs.supported ?? true),
    )
    .map(({ id, display_name, capabilities }) =>
      option(id, display_name, anthropicLevels(capabilities?.effort)),
    );

  return { models, after: page.has_more === true ? (page.last_id ?? null) : null };
}

function isChatModel(id: string): boolean {
  return !id
    .toLowerCase()
    .split("-")
    .some((part) => NOT_CHAT_PARTS.has(part));
}

function idPage(text: string, keep: (id: string) => boolean): Page | null {
  const list = parsedJson(IdListSchema, text);

  return list === null
    ? null
    : onePage(list.data.filter(({ id }) => keep(id)).map(({ id }) => option(id)));
}

function xaiPage(text: string): Page | null {
  const list = parsedJson(XaiListSchema, text);

  return list === null
    ? null
    : onePage(
        list.models.map(({ id, capabilities }) =>
          option(id, undefined, capabilities?.reasoning_effort),
        ),
      );
}

function openRouterPage(text: string): Page | null {
  const list = parsedJson(OpenRouterListSchema, text);

  return list === null
    ? null
    : onePage(
        list.data.map(({ id, name, reasoning }) => option(id, name, reasoning?.supported_efforts)),
      );
}

export const LISTINGS: Readonly<Record<HttpProvider, Listing>> = {
  anthropic: {
    listsWithoutKey: false,
    address: (base, after) =>
      `${base}/models?limit=${String(ANTHROPIC_PAGE_SIZE)}${
        after === null ? "" : `&after_id=${encodeURIComponent(after)}`
      }`,
    headers: (key) => ({ "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }),
    read: anthropicPage,
  },
  openai: {
    listsWithoutKey: false,
    address: (base) => `${base}/models`,
    headers: bearer,
    read: (text) => idPage(text, isChatModel),
  },
  xai: {
    listsWithoutKey: false,
    address: (base) => `${base}/language-models`,
    headers: bearer,
    read: xaiPage,
  },
  openrouter: {
    listsWithoutKey: true,
    address: (base) => `${base}/models?supported_parameters=structured_outputs`,
    headers: bearer,
    read: openRouterPage,
  },
  "openai-compatible": {
    listsWithoutKey: true,
    address: (base) => `${base}/models`,
    headers: bearer,
    read: (text) => idPage(text, () => true),
  },
};
