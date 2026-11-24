import { z } from "zod";

import { AiRefusalSchema } from "./ai-contract.ts";
import { CATALOG_KEY_MAX } from "./catalog-key-limit.ts";
import { lineBreaksOf } from "./format.ts";
import { SOURCES } from "./item-contract.ts";

export const TopicKeyParamSchema = z.object({ key: z.string().min(1).max(CATALOG_KEY_MAX) });

export const OVERVIEW_TEXT_MAX = 1500;

export const ADDED_READ_LIMIT = 40;

export const DISAGREEMENTS_SHOWN = 20;

export const OVERVIEW_LINES_MAX = 5;

export const OVERVIEW_FAILURES = ["gave-up", ...AiRefusalSchema.options] as const;

const OverviewFailureSchema = z.enum(OVERVIEW_FAILURES);

const OVERVIEW_STATES = ["idle", "pending", "failed"] as const;

export type OverviewFailure = z.infer<typeof OverviewFailureSchema>;

export const BuiltFromSchema = z
  .array(
    z.object({ item: z.number().int().positive(), digest: z.number().int().positive() }).readonly(),
  )
  .readonly();

export type BuiltFrom = z.infer<typeof BuiltFromSchema>;

const CITED_ID = String.raw`\d{1,19}`;

const CITATION = new RegExp(String.raw`\[(${CITED_ID})\]`, "gu");

const CITATION_TOKEN = new RegExp(String.raw`(\[${CITED_ID}\])`, "u");

const CITATION_ALONE = new RegExp(String.raw`^\[(${CITED_ID})\]$`, "u");

const CITATION_WITH_SPACE = new RegExp(String.raw`\s*\[${CITED_ID}\]`, "gu");

const SOURCED_LINE = new RegExp(String.raw`^(.*?\S)\s*((?:\[${CITED_ID}\])+)$`, "u");

export interface OverviewLine {
  readonly text: string;
  readonly items: readonly number[];
}

export function overviewText({ lines }: Readonly<{ lines: readonly Readonly<OverviewLine>[] }>) {
  return lines
    .map(({ text, items }) => `${text} ${items.map((id) => `[${String(id)}]`).join("")}`)
    .join("\n");
}

export function citedIds(text: string): readonly number[] {
  return [...new Set([...text.matchAll(CITATION)].map(([, id = ""]) => Number(id)))].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
}

export function overviewTokens(line: string): readonly string[] {
  return line.split(CITATION_TOKEN);
}

export function citationId(token: string): number | null {
  const id = CITATION_ALONE.exec(token)?.[1];

  return id === undefined ? null : Number(id);
}

export function sourcedLine(row: string): Readonly<OverviewLine> | null {
  const [, text = "", sources = ""] = SOURCED_LINE.exec(row.trim()) ?? [];

  return text === "" ? null : { text, items: citedIds(sources) };
}

export function overviewLines(text: string): readonly string[] {
  return lineBreaksOf(text).filter((line) => line.trim() !== "");
}

export function overviewLine(text: string): string | null {
  return (
    overviewLines(text)
      .map((line) => line.replaceAll(CITATION_WITH_SPACE, "").trim())
      .find((line) => line !== "") ?? null
  );
}

const OverviewSchema = z
  .object({
    state: z.enum(OVERVIEW_STATES),
    text: z.string().nullable(),
    cited: z.array(z.object({ id: z.number().int(), title: z.string() }).readonly()).readonly(),
    builtFrom: z.number().int().min(0),
    provider: z.boolean(),
    failure: OverviewFailureSchema.nullable(),
  })
  .readonly();

export type Overview = z.infer<typeof OverviewSchema>;

export function overviewState({
  open,
  failure,
}: Readonly<{ open: boolean; failure: OverviewFailure | null }>): Overview["state"] {
  if (open) return "pending";

  return failure === null ? "idle" : "failed";
}

const TopicItemSchema = z
  .object({
    id: z.number().int(),
    source: z.enum(SOURCES),
    title: z.string(),
    summary: z.string(),
    savedAt: z.number().int(),
    read: z.boolean(),
    inOverview: z.boolean(),
  })
  .readonly();

export type TopicItem = z.infer<typeof TopicItemSchema>;

const KnownDisagreementItemSchema = z
  .object({ id: z.number().int(), title: z.string() })
  .readonly();

const KnownDisagreementSchema = z
  .object({
    id: z.number().int(),
    reason: z.string(),
    items: z.tuple([KnownDisagreementItemSchema, KnownDisagreementItemSchema]).readonly(),
  })
  .readonly();

export const TopicPageSchema = z
  .object({
    topic: z
      .object({ key: z.string(), name: z.string(), itemCount: z.number().int().min(0) })
      .readonly(),
    overview: OverviewSchema,
    disagreements: z.array(KnownDisagreementSchema).readonly(),
    items: z.array(TopicItemSchema).readonly(),
    next: z.string().nullable(),
  })
  .readonly();

export type TopicPage = z.infer<typeof TopicPageSchema>;

export const OverviewRetryResponseSchema = z.object({ overview: OverviewSchema }).readonly();
